using System.Security.Cryptography;
using System.Text;
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
public class ImportFunctions(
    Database database,
    ProfileService profiles,
    ImportQueue queue,
    ImportBudget budget,
    ILogger<ImportFunctions> logger)
{
    private Container Jobs => database.GetContainer("importJobs");

    /// Two at once is enough for anyone who is not scripting us.
    private const int MaxRunningPerOwner = 2;
    private static readonly TimeSpan Deadline = TimeSpan.FromMinutes(5);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Function("ImportStart")]
    public async Task<IActionResult> Start(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "import")] HttpRequest req,
        CancellationToken ct)
    {
        var (profile, error) = await profiles.RequireActiveAsync(ClientPrincipal.Parse(req));
        if (error is not null) return error;

        var body = await JsonSerializer.DeserializeAsync<ImportStart>(req.Body, Json, ct);
        var host = ImportSources.Match(body?.Url);
        if (host is null) return Bad("unsupported_host");

        if (await RunningCountAsync(profile!.Id, ct) >= MaxRunningPerOwner)
            return TooMany("too_many_imports");
        if (!await budget.TryConsumeAsync(profile.Id, ct))
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

        await Jobs.CreateItemAsync(job, new PartitionKey(job.Id), cancellationToken: ct);

        var baseUrl = Environment.GetEnvironmentVariable("IMPORT_CALLBACK_BASE_URL")
            ?? $"{req.Scheme}://{req.Host}";
        await queue.EnqueueAsync(new ImportQueueMessage(
            job.Id, job.Source, $"{baseUrl}/api/import/{job.Id}/callback",
            job.CallbackToken, job.DeadlineAt), ct);

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

        var job = await ReadAsync(jobId, ct);
        // 404, not 403: a job id is not a thing to confirm the existence of.
        if (job is null || job.OwnerId != profile!.Id) return new NotFoundResult();

        // THE REAPER. A running job past its deadline fails here, which is why
        // this feature needs no timer trigger — the same lazy pattern
        // RouteCache uses for stale geometry.
        if (!ImportStage.IsTerminal(job.Stage) &&
            DateTimeOffset.TryParse(job.DeadlineAt, out var deadline) &&
            DateTimeOffset.UtcNow > deadline)
        {
            logger.LogWarning(
                "Import job {JobId} reaped: past deadline {DeadlineAt} while in stage {Stage}",
                job.Id, job.DeadlineAt, job.Stage);
            job = job with
            {
                Stage = ImportStage.Failed,
                Error = new ImportError("timeout"),
                UpdatedAt = DateTimeOffset.UtcNow.ToString("o"),
            };
            await ReplaceAsync(job, ct);
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
        var job = await ReadAsync(jobId, ct);
        if (job is null) return new NotFoundResult();

        var presented = req.Headers["X-Import-Token"].ToString();
        if (!FixedTimeEquals(presented, job.CallbackToken))
        {
            // Logged at the job, never the token: the token itself is a
            // credential and does not belong in a log line.
            logger.LogWarning("Import callback for {JobId} presented an invalid token", jobId);
            return new NotFoundResult();
        }

        var callback = await JsonSerializer.DeserializeAsync<ImportCallback>(req.Body, Json, ct);
        if (callback is null) return Bad("body_required");

        var invalid = ImportValidation.CheckCallback(callback);
        if (invalid is not null)
        {
            logger.LogWarning("Import callback for {JobId} rejected: {Reason}", jobId, invalid);
            return Bad(invalid);
        }

        // Idempotent: at-least-once delivery means the pipeline may report the
        // same completion twice, and a cancelled job may be reported done.
        if (ImportStage.IsTerminal(job.Stage))
            return new ConflictObjectResult(new { error = "job_finished" });

        var stage = callback.Stage!;
        // Never walk the owner's status line backwards.
        if (!ImportStage.IsTerminal(stage) && ImportStage.Rank(stage) < ImportStage.Rank(job.Stage))
            return new OkResult();

        job = job with
        {
            Stage = stage,
            Result = callback.Result is null ? job.Result : ImportValidation.Clamp(callback.Result),
            Error = callback.Error ?? job.Error,
            UpdatedAt = DateTimeOffset.UtcNow.ToString("o"),
        };
        await ReplaceAsync(job, ct);
        return new OkResult();
    }

    [Function("ImportCancel")]
    public async Task<IActionResult> Cancel(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "import/{jobId}")]
        HttpRequest req, string jobId, CancellationToken ct)
    {
        var (profile, error) = await profiles.RequireActiveAsync(ClientPrincipal.Parse(req));
        if (error is not null) return error;

        var job = await ReadAsync(jobId, ct);
        if (job is null || job.OwnerId != profile!.Id) return new NotFoundResult();
        if (ImportStage.IsTerminal(job.Stage)) return new NoContentResult();

        await ReplaceAsync(job with
        {
            Stage = ImportStage.Cancelled,
            UpdatedAt = DateTimeOffset.UtcNow.ToString("o"),
        }, ct);
        return new NoContentResult();
    }

    // -----------------------------------------------------------------------

    private static bool FixedTimeEquals(string presented, string expected)
    {
        var a = Encoding.UTF8.GetBytes(presented);
        var b = Encoding.UTF8.GetBytes(expected);
        return a.Length == b.Length && CryptographicOperations.FixedTimeEquals(a, b);
    }

    private async Task<ImportJobDoc?> ReadAsync(string jobId, CancellationToken ct)
    {
        try
        {
            return await Jobs.ReadItemAsync<ImportJobDoc>(jobId, new PartitionKey(jobId),
                cancellationToken: ct);
        }
        catch (CosmosException e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    private Task ReplaceAsync(ImportJobDoc job, CancellationToken ct) =>
        Jobs.ReplaceItemAsync(job, job.Id, new PartitionKey(job.Id), cancellationToken: ct);

    private async Task<int> RunningCountAsync(string ownerId, CancellationToken ct)
    {
        var query = new QueryDefinition(
                "SELECT VALUE COUNT(1) FROM c WHERE c.ownerId = @o AND c.stage IN " +
                "('queued', 'fetching', 'reading', 'matching')")
            .WithParameter("@o", ownerId);
        using var feed = Jobs.GetItemQueryIterator<int>(query);
        return feed.HasMoreResults ? (await feed.ReadNextAsync(ct)).FirstOrDefault() : 0;
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
