using System.Globalization;
using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using Ebrostay.Api.Models;
using Ebrostay.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace Ebrostay.Api.Functions;

// The AI-assisted import (ADR-033). Four endpoints, one job document.
//
// The result lands on the JOB, never on the listing: the merge is client-side,
// because only the client knows which fields the owner has already typed into.
// So nothing here writes to `properties`, and HostWrites validation is
// untouched by this whole feature.
//
// Every stage-transition DECISION (the 409, the backwards-rank no-op, the
// reaper, the running-imports cap, the token comparison) lives in the pure,
// unit-tested `ImportDecision`. What is left here is I/O: read a job with its
// etag, ask ImportDecision what happens, write it back with that same etag so
// a stale write 412s instead of silently clobbering whatever landed first.
public class ImportFunctions(
    Database database,
    ProfileService profiles,
    ImportQueue queue,
    ImportBudget budget,
    ILogger<ImportFunctions> logger)
{
    private Container Jobs => database.GetContainer("importJobs");

    private static readonly TimeSpan Deadline = TimeSpan.FromMinutes(5);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Function("ImportStart")]
    public async Task<IActionResult> Start(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "import")] HttpRequest req,
        CancellationToken ct)
    {
        var (profile, error) = await profiles.RequireActiveAsync(ClientPrincipal.Parse(req));
        if (error is not null) return error;

        var body = await ReadJsonAsync<ImportStart>(req, ct);
        var host = ImportSources.Match(body?.Url);
        if (host is null) return Bad("unsupported_host");

        // CONFIGURATION, never inferred from the request. `req.Host` is a
        // client-controlled header: falling back to it would let an
        // authenticated owner send `Host: attacker.example` and have this
        // job's callback token written into the queue message pointed at
        // their own host, for the pipeline to then POST the token to. Blast
        // radius is one job, and the only thing standing in the way would be
        // an app setting somebody remembered to set.
        //
        // So it throws, the way Program.cs treats COSMOS_ENDPOINT: a missing
        // setting is a deployment fault and a 500 that says so is strictly
        // safer than a request that succeeds by guessing. Read HERE, before
        // the budget is consumed and before the job document exists, so a
        // misconfigured deployment leaves nothing behind on its way out.
        var baseUrl = (Environment.GetEnvironmentVariable("IMPORT_CALLBACK_BASE_URL")
            ?? throw new InvalidOperationException("IMPORT_CALLBACK_BASE_URL not set"))
            .TrimEnd('/');

        int runningCount;
        try
        {
            runningCount = await RunningCountAsync(profile!.Id, ct);
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Cosmos error counting running imports for {OwnerId}", profile!.Id);
            return new StatusCodeResult(StatusCodes.Status502BadGateway);
        }
        if (ImportDecision.ExceedsRunningCap(runningCount)) return TooMany("too_many_imports");
        if (!await budget.TryConsumeAsync(profile!.Id, ct))
            return TooMany("daily_import_limit");

        var now = DateTimeOffset.UtcNow;
        var job = new ImportJobDoc(
            Id: $"imp_{Guid.NewGuid():N}",
            OwnerId: profile.Id,
            Source: new ImportJobSource("url", host, body!.Url!.Trim()),
            Stage: ImportStage.Queued,
            CreatedAt: now.ToString("o"),
            UpdatedAt: now.ToString("o"),
            DeadlineAt: now.Add(Deadline).ToString("o"),
            CallbackToken: Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
                .Replace('+', '-').Replace('/', '_').TrimEnd('='),
            Result: null,
            Error: null,
            Ttl: 604800);

        ItemResponse<ImportJobDoc> created;
        try
        {
            created = await Jobs.CreateItemAsync(job, new PartitionKey(job.Id), cancellationToken: ct);
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Cosmos error creating import job {JobId}", job.Id);
            return new StatusCodeResult(StatusCodes.Status502BadGateway);
        }

        try
        {
            await queue.EnqueueAsync(new ImportQueueMessage(
                job.Id, job.Source, $"{baseUrl}/api/import/{job.Id}/callback",
                job.CallbackToken, job.DeadlineAt), ct);
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            // The document exists and no pipeline will ever see it. Worse, the
            // owner never learns the job id — they are getting a 502, not the
            // 202 that carries it — so nothing will ever poll this job, and
            // the reaper only runs on a poll. Left alone it would sit at
            // `queued` looking runnable for its whole seven-day TTL.
            //
            // Marked failed here rather than left to the deadline: the
            // deadline clause in the cap query already stops it from locking
            // the owner out past its five minutes, so this is not what makes
            // the cap correct — it is what makes the DOCUMENT honest for the
            // week it then sits there, and it frees the slot now instead of
            // in five minutes. Best-effort by design (see MarkFailedAsync):
            // the owner is getting a 502 either way.
            logger.LogError(ex, "Could not enqueue import job {JobId}", job.Id);
            await MarkFailedAsync(job, "pipeline_error", created.ETag, ct);
            return new StatusCodeResult(StatusCodes.Status502BadGateway);
        }

        return new ObjectResult(new { jobId = job.Id, stage = job.Stage })
        {
            StatusCode = StatusCodes.Status202Accepted,
        };
    }

    [Function("ImportGet")]
    public async Task<IActionResult> Get(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "import/{jobId}")]
        HttpRequest req, string jobId, CancellationToken ct)
    {
        var (profile, error) = await profiles.RequireActiveAsync(ClientPrincipal.Parse(req));
        if (error is not null) return error;

        var (job, etag, readError) = await ReadAsync(jobId, ct);
        if (readError is not null) return readError;
        // 404, not 403: a job id is not a thing to confirm the existence of.
        if (job!.OwnerId != profile!.Id) return new NotFoundResult();

        // THE REAPER. A running job past its deadline fails here, which is
        // why this feature needs no timer trigger — the same lazy pattern
        // RouteCache uses for stale geometry.
        var reaped = ImportDecision.Reap(job, DateTimeOffset.UtcNow);
        if (reaped is not null)
        {
            logger.LogWarning(
                "Import job {JobId} reaped: past deadline {DeadlineAt} while in stage {Stage}",
                job.Id, job.DeadlineAt, job.Stage);

            switch (await ReplaceAsync(reaped, etag!, ct))
            {
                case ReplaceOutcome.Ok:
                    job = reaped;
                    break;
                case ReplaceOutcome.Stale:
                    // Someone else's write — most likely the pipeline's own
                    // completion callback — landed first. Re-read and hand
                    // back whatever they left rather than clobbering a
                    // result that arrived while we were reaping.
                    var (latest, _, latestError) = await ReadAsync(jobId, ct);
                    if (latestError is not null) return latestError;
                    job = latest!;
                    break;
                case ReplaceOutcome.Error:
                    return new StatusCodeResult(StatusCodes.Status502BadGateway);
            }
        }

        return new OkObjectResult(ImportProjection.ToView(job));
    }

    [Function("ImportCallback")]
    public async Task<IActionResult> Callback(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "import/{jobId}/callback")]
        HttpRequest req, string jobId, CancellationToken ct)
    {
        // ANONYMOUS BY DESIGN. The pipeline is third-party and holds no
        // account with us; the per-job token is the credential, and a leak is
        // scoped to one job and dies with it.
        var (job, etag, readError) = await ReadAsync(jobId, ct);
        if (readError is not null) return readError;

        var presented = req.Headers["X-Import-Token"].ToString();
        if (!ImportDecision.TokenMatches(presented, job!.CallbackToken))
        {
            // Logged at the job, never the token: the token itself is a
            // credential and does not belong in a log line.
            logger.LogWarning("Import callback for {JobId} presented an invalid token", jobId);
            return new NotFoundResult();
        }

        var callback = await ReadJsonAsync<ImportCallback>(req, ct);
        if (callback is null) return Bad("body_required");

        var invalid = ImportValidation.CheckCallback(callback);
        if (invalid is not null)
        {
            logger.LogWarning("Import callback for {JobId} rejected: {Reason}", jobId, invalid);
            return Bad(invalid);
        }

        // Idempotent: at-least-once delivery means the pipeline may report
        // the same completion twice, and a cancelled job may be reported
        // done. The decision below is pinned to the SAME read (via etag) that
        // produced `job`, so two concurrent duplicate callbacks cannot both
        // win — the loser's write 412s and is turned into the same Conflict
        // outcome below.
        var decision = ImportDecision.Next(job, callback, DateTimeOffset.UtcNow);
        if (decision.Outcome == ImportDecision.CallbackOutcome.Conflict)
            return new ConflictObjectResult(new { error = "job_finished" });
        if (decision.Outcome == ImportDecision.CallbackOutcome.NoOp)
            return new OkResult();

        return await ReplaceAsync(decision.Job!, etag!, ct) switch
        {
            ReplaceOutcome.Ok => new OkResult(),
            // Lost the race to another write on this same job — whatever got
            // there first already makes this report a no-op in effect.
            ReplaceOutcome.Stale => new ConflictObjectResult(new { error = "job_finished" }),
            _ => new StatusCodeResult(StatusCodes.Status502BadGateway),
        };
    }

    [Function("ImportCancel")]
    public async Task<IActionResult> Cancel(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "import/{jobId}")]
        HttpRequest req, string jobId, CancellationToken ct)
    {
        var (profile, error) = await profiles.RequireActiveAsync(ClientPrincipal.Parse(req));
        if (error is not null) return error;

        var (job, etag, readError) = await ReadAsync(jobId, ct);
        if (readError is not null) return readError;
        if (job!.OwnerId != profile!.Id) return new NotFoundResult();

        var cancelled = ImportDecision.Cancel(job, DateTimeOffset.UtcNow);
        if (cancelled is null) return new NoContentResult(); // already terminal

        var outcome = await ReplaceAsync(cancelled, etag!, ct);
        if (outcome == ReplaceOutcome.Ok) return new NoContentResult();
        if (outcome == ReplaceOutcome.Error)
            return new StatusCodeResult(StatusCodes.Status502BadGateway);

        // ReplaceOutcome.Stale: some other write landed first, and it is not
        // safe to assume it was a terminal one — a concurrent progress
        // report (e.g. "reading" -> "matching") is just as capable of
        // winning this race, and answering 204 in that case would tell the
        // owner "cancelled" while the job keeps running. The owner pressed
        // Stop, so this retries the cancel once against a fresh read rather
        // than reporting on whatever the other write did.
        var (retryJob, retryEtag, retryError) = await ReadAsync(jobId, ct);
        if (retryError is not null) return retryError;

        var retryCancel = ImportDecision.Cancel(retryJob!, DateTimeOffset.UtcNow);
        if (retryCancel is null) return new NoContentResult(); // terminal on its own by now

        return await ReplaceAsync(retryCancel, retryEtag!, ct) switch
        {
            ReplaceOutcome.Ok => new NoContentResult(),
            ReplaceOutcome.Error => new StatusCodeResult(StatusCodes.Status502BadGateway),
            // Lost the retry too: the job is still non-terminal (a genuinely
            // finished job would have made ImportDecision.Cancel return null
            // above), so this is NOT the "job_finished" case Callback uses —
            // it is two lost races in a row. A 409 says so honestly instead
            // of a 204 claiming a cancellation that did not happen.
            _ => new ConflictObjectResult(new { error = "cancel_conflict" }),
        };
    }

    // -----------------------------------------------------------------------

    private enum ReplaceOutcome { Ok, Stale, Error }

    // Ownership is a 404, not a 403 — decided by the caller, not here, since
    // ImportCallback has no owner to check. Mirrors HostFunctions.LoadOwnedAsync:
    // a non-404 Cosmos failure is logged and mapped to 502, never left to
    // surface as an unhandled 500.
    private async Task<(ImportJobDoc? Job, string? ETag, IActionResult? Error)> ReadAsync(
        string jobId, CancellationToken ct)
    {
        try
        {
            var response = await Jobs.ReadItemAsync<ImportJobDoc>(jobId, new PartitionKey(jobId),
                cancellationToken: ct);
            return (response.Resource, response.ETag, null);
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return (null, null, new NotFoundResult());
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Cosmos error reading import job {JobId}", jobId);
            return (null, null, new StatusCodeResult(StatusCodes.Status502BadGateway));
        }
    }

    // Conditional replace: write only if the document has not moved
    // underneath us. A stale etag means someone else already wrote — the
    // caller decides what that means for them (a 409, a re-read, or a no-op
    // success), but it is never a silent overwrite of a result or an error
    // that arrived first.
    private async Task<ReplaceOutcome> ReplaceAsync(ImportJobDoc job, string etag, CancellationToken ct)
    {
        try
        {
            await Jobs.ReplaceItemAsync(job, job.Id, new PartitionKey(job.Id),
                new ItemRequestOptions { IfMatchEtag = etag }, ct);
            return ReplaceOutcome.Ok;
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.PreconditionFailed)
        {
            return ReplaceOutcome.Stale;
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Cosmos error replacing import job {JobId}", job.Id);
            return ReplaceOutcome.Error;
        }
    }

    // Best effort, and deliberately so: every caller is already returning a
    // 502, and a failure to write the failure changes nothing the owner sees.
    // Conditional on the etag from the write that created the document, so a
    // callback that somehow got there first is never clobbered.
    private async Task MarkFailedAsync(ImportJobDoc job, string code, string etag, CancellationToken ct)
    {
        var failed = job with
        {
            Stage = ImportStage.Failed,
            Error = new ImportError(code),
            UpdatedAt = DateTimeOffset.UtcNow.ToString("o"),
        };

        if (await ReplaceAsync(failed, etag, ct) != ReplaceOutcome.Ok)
            logger.LogWarning("Could not mark orphaned import job {JobId} failed", job.Id);
    }

    private async Task<int> RunningCountAsync(string ownerId, CancellationToken ct)
    {
        var query = new QueryDefinition(ImportDecision.RunningCountSql)
            .WithParameter("@o", ownerId)
            // The same round-trip format the deadlines are written in — see
            // ImportDecision.RunningCountSql for why a string comparison is
            // the right one here.
            .WithParameter("@now", DateTimeOffset.UtcNow.ToString("o", CultureInfo.InvariantCulture));

        using var feed = Jobs.GetItemQueryIterator<int>(query);
        // DRAINED, not first-page. `importJobs` is partitioned on /id, so this
        // is a genuine cross-partition aggregate: the SDK's pipeline can hand
        // back an EMPTY first page while it is still fanning out, and
        // `FirstOrDefault()` on that page is 0 — the cap silently disabled for
        // that request. Invisible on a single-physical-partition serverless
        // account, and it appears the day the container splits.
        var total = 0;
        while (feed.HasMoreResults) total += (await feed.ReadNextAsync(ct)).Sum();
        return total;
    }

    // A malformed body (bad JSON, wrong shape) is a 400, never a 500 — the
    // pipeline's at-least-once delivery means a 500 is what makes it retry a
    // payload that will never parse. Mirrors HostFunctions.ReadJsonAsync.
    private static async Task<T?> ReadJsonAsync<T>(HttpRequest req, CancellationToken ct)
        where T : class
    {
        try
        {
            return await JsonSerializer.DeserializeAsync<T>(req.Body, Json, ct);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static ObjectResult Bad(string code) =>
        new(new { error = code }) { StatusCode = StatusCodes.Status400BadRequest };

    private static ObjectResult TooMany(string code) =>
        new(new { error = code }) { StatusCode = StatusCodes.Status429TooManyRequests };
}

public static class ImportProjection
{
    /// The token is absent by construction, not by remembering to remove it.
    public static ImportJobView ToView(ImportJobDoc job) => new(
        job.Id, job.Source.Kind, job.Source.Host, job.Stage, job.CreatedAt,
        job.Result, job.Error);
}
