using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Ebrostay.Api.Models;

// The AI-assisted import's stage-transition rules (ADR-033), pulled out of
// ImportFunctions so the 409, the backwards-rank no-op, the reaper, and the
// running-imports cap are unit-testable without a Cosmos emulator. Nothing
// here does I/O: every method is a pure function of a document, a callback,
// and — where time matters — the caller's own `now`. The Cosmos read/replace
// (with its optimistic-concurrency retry on a stale etag) stays in
// ImportFunctions, which is now a thin wrapper around what is decided here.
public static class ImportDecision
{
    public enum CallbackOutcome
    {
        /// The write applies: `Job` carries the new stage/result/error.
        Applied,

        /// The job was already terminal. At-least-once delivery means the
        /// pipeline may report the same completion twice, or report `done`
        /// for a job the owner already cancelled — this is what makes both
        /// of those a no-op instead of a second write.
        Conflict,

        /// The reported stage is behind where the job already is. An
        /// out-of-order report from a pipeline step that retried must not
        /// walk the owner's status line backwards, but it is not an error
        /// either — it is simply dropped.
        NoOp,
    }

    public readonly record struct CallbackResult(CallbackOutcome Outcome, ImportJobDoc? Job);

    /// What a callback does to a job, decided from the job's CURRENT stage —
    /// not from whatever the caller already knows. `ImportFunctions.Callback`
    /// pins this decision to the same Cosmos read (via etag) that produced
    /// `job`, so two concurrent duplicate callbacks racing to a "done" cannot
    /// both write: the loser's `IfMatchEtag` fails, and it takes the same
    /// `Conflict` outcome a genuinely-late callback would have taken.
    public static CallbackResult Next(ImportJobDoc job, ImportCallback callback, DateTimeOffset now)
    {
        if (ImportStage.IsTerminal(job.Stage))
            return new CallbackResult(CallbackOutcome.Conflict, null);

        var stage = callback.Stage!;
        if (!ImportStage.IsTerminal(stage) && ImportStage.Rank(stage) < ImportStage.Rank(job.Stage))
            return new CallbackResult(CallbackOutcome.NoOp, null);

        var updated = job with
        {
            Stage = stage,
            Result = callback.Result is null ? job.Result : ImportValidation.Clamp(callback.Result),
            Error = callback.Error ?? job.Error,
            UpdatedAt = now.ToString("o"),
        };
        return new CallbackResult(CallbackOutcome.Applied, updated);
    }

    /// What a cancel does to a job: a terminal job is left alone — there is
    /// nothing left to stop, and re-terminating it would be a second write
    /// nobody asked for — a running job moves to Cancelled. Null means
    /// "nothing to write." `ImportFunctions.Cancel` calls this twice when its
    /// first write loses a race (once against the original read, once more
    /// against a fresh one), so this takes no state beyond the job itself: it
    /// does not know or care which attempt it is.
    public static ImportJobDoc? Cancel(ImportJobDoc job, DateTimeOffset now)
    {
        if (ImportStage.IsTerminal(job.Stage)) return null;

        return job with
        {
            Stage = ImportStage.Cancelled,
            UpdatedAt = now.ToString("o"),
        };
    }

    /// Has this job's deadline passed? The one place the stored string is read
    /// back as a time, and it FAILS CLOSED in two ways on purpose:
    ///
    ///   · `InvariantCulture` + `RoundtripKind`, never the ambient culture.
    ///     `DateTimeOffset`'s "yyyy" is calendar-dependent, and the failure it
    ///     would cause here is silent and total: under a non-Gregorian
    ///     calendar our 2026 reads as 2026 AH or 2026 BE, every deadline lands
    ///     centuries away, and NOTHING is ever reaped. Measured on .NET 9 the
    ///     parser takes an ISO round-trip fast path and does not in fact
    ///     consult the calendar for this string shape — but that is a runtime
    ///     detail rather than a contract, and it is not something the reaper
    ///     should be resting on. `ImportBudget` says the same on the way out.
    ///   · an UNPARSABLE deadline counts as PASSED. It should never happen —
    ///     we write the string ourselves — but the cost of the two answers is
    ///     not symmetric: "healthy" means the reaper never fires, the job runs
    ///     to its seven-day TTL, and it holds one of the owner's two running
    ///     slots for the whole week. "Expired" costs one job a spurious
    ///     timeout the owner can retry immediately.
    public static bool DeadlinePassed(string deadlineAt, DateTimeOffset now) =>
        !DateTimeOffset.TryParse(deadlineAt, CultureInfo.InvariantCulture,
            DateTimeStyles.RoundtripKind, out var deadline) || now > deadline;

    /// THE REAPER. A running job found past its deadline fails right here —
    /// the reason this feature needs no timer trigger, which SWA managed
    /// functions cannot host anyway. Null means "leave it alone": already
    /// terminal, or the deadline has not passed.
    public static ImportJobDoc? Reap(ImportJobDoc job, DateTimeOffset now)
    {
        if (ImportStage.IsTerminal(job.Stage)) return null;
        if (!DeadlinePassed(job.DeadlineAt, now)) return null;

        return job with
        {
            Stage = ImportStage.Failed,
            Error = new ImportError("timeout"),
            UpdatedAt = now.ToString("o"),
        };
    }

    /// Two at once is enough for anyone who is not scripting us.
    public const int MaxRunningPerOwner = 2;

    public static bool ExceedsRunningCap(int runningCount) => runningCount >= MaxRunningPerOwner;

    /// The cap's other half: the query that counts what is running.
    ///
    /// It lives here beside `DeadlinePassed` because it is the SAME rule read
    /// from the other side — a job counts as running only while it is in a
    /// running stage **and** its deadline has not passed — and the two must
    /// not drift apart.
    ///
    /// The `deadlineAt` clause is not an optimisation. The reaper only runs
    /// when someone polls, and the case it exists for (the pipeline never
    /// answers) is exactly the case where the owner gives up and closes the
    /// tab — so a job abandoned at `fetching` is never read again, never
    /// reaped, and without this clause counts as running until its seven-day
    /// TTL expires. Two of those is a week-long `too_many_imports` the owner
    /// cannot clear: cancelling needs a job id, the client drops `?import=` on
    /// every terminal exit, and there is no listing of running reads. A job
    /// past its deadline is not running, whether or not anyone has yet got
    /// around to writing that down.
    ///
    /// `@now` is compared as a STRING, which is sound only because both sides
    /// are written by us in the same round-trip ("o") format: fixed-width,
    /// UTC, and therefore lexicographically ordered.
    public const string RunningCountSql =
        "SELECT VALUE COUNT(1) FROM c WHERE c.ownerId = @o AND c.stage IN " +
        "('queued', 'fetching', 'reading', 'matching') AND c.deadlineAt > @now";

    /// Constant-time so a mismatched token costs the same wall-clock time to
    /// reject as a matching one — the whole reason a per-job token bearer
    /// credential is safe to compare on an anonymous endpoint.
    public static bool TokenMatches(string presented, string expected)
    {
        var a = Encoding.UTF8.GetBytes(presented);
        var b = Encoding.UTF8.GetBytes(expected);
        return a.Length == b.Length && CryptographicOperations.FixedTimeEquals(a, b);
    }
}
