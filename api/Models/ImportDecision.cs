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

    /// THE REAPER. A running job found past its deadline fails right here —
    /// the reason this feature needs no timer trigger, which SWA managed
    /// functions cannot host anyway. Null means "leave it alone": already
    /// terminal, or the deadline has not passed (or is unparsable, which
    /// should never happen but must not crash a poll either way).
    public static ImportJobDoc? Reap(ImportJobDoc job, DateTimeOffset now)
    {
        if (ImportStage.IsTerminal(job.Stage)) return null;
        if (!DateTimeOffset.TryParse(job.DeadlineAt, out var deadline)) return null;
        if (now <= deadline) return null;

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
