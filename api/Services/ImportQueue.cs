using System.Text.Json;
using Azure.Storage.Queues;
using Ebrostay.Api.Models;
using Microsoft.Extensions.Logging;

namespace Ebrostay.Api.Services;

/// Handover to the extraction pipeline (ADR-033 Decision 3).
///
/// The queue is the source of truth, and the wakeup ping is advisory: if the
/// ping fails the job is late, not lost. That is the whole reason the ping is
/// allowed to be fire-and-forget against a third party we do not control.
public sealed class ImportQueue(QueueServiceClient queues, IHttpClientFactory http,
    ILogger<ImportQueue> logger)
{
    public const string QueueName = "import-jobs";

    private static readonly JsonSerializerOptions Json =
        new(JsonSerializerDefaults.Web);

    public async Task EnqueueAsync(ImportQueueMessage message, CancellationToken ct)
    {
        var client = queues.GetQueueClient(QueueName);
        await client.CreateIfNotExistsAsync(cancellationToken: ct);
        await client.SendMessageAsync(JsonSerializer.Serialize(message, Json),
            cancellationToken: ct);

        var wakeup = Environment.GetEnvironmentVariable("PIPELINE_WAKEUP_URL");
        if (string.IsNullOrWhiteSpace(wakeup)) return;

        try
        {
            using var client2 = http.CreateClient("wakeup");
            using var body = new StringContent(
                JsonSerializer.Serialize(new { jobId = message.JobId }, Json),
                System.Text.Encoding.UTF8, "application/json");
            await client2.PostAsync(wakeup, body, ct);
        }
        catch (Exception ex)
        {
            // Deliberately swallowed. The queue already holds the job; a
            // failed ping costs the owner latency, never the read.
            logger.LogWarning(ex, "Import wakeup ping failed for {JobId}", message.JobId);
        }
    }
}
