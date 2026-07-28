using System.Globalization;
using Microsoft.Azure.Cosmos;
using Ebrostay.Api.Models;

namespace Ebrostay.Api.Services;

/// A daily ceiling on outbound ORS calls, held in Cosmos because SWA managed
/// functions scale out and share no memory — an in-process counter would be one
/// counter per instance, which is no ceiling at all. Durable Functions entities
/// are unavailable on managed functions, so this is the only option that works
/// without changing hosting model.
///
/// FAILS CLOSED. If the count cannot be confirmed we do not call. That is
/// academic in practice: if Cosmos is unreachable the property read already
/// failed.
public sealed class OrsBudget(Container container)
{
    /// Well below ORS's ~2,500/day, so we trip our own wire first.
    private const int DailyCeiling = 1500;
    private const int MaxAttempts = 5;

    public async Task<bool> TryConsumeAsync(int calls, CancellationToken ct)
    {
        // InvariantCulture: this becomes a Cosmos document id/partition key, and
        // DateTimeOffset's "yyyy" component is calendar-dependent (e.g. Thai
        // Buddhist) under the current culture — the same class of bug fixed in
        // NearbyGroups.Cell (55a05ca).
        var id = string.Create(CultureInfo.InvariantCulture,
            $"ors-{DateTimeOffset.UtcNow:yyyy-MM-dd}");
        var key = new PartitionKey(id);

        for (var attempt = 0; attempt < MaxAttempts; attempt++)
        {
            try
            {
                var read = await container.ReadItemAsync<OrsBudgetDoc>(id, key,
                    cancellationToken: ct);

                if (read.Resource.Calls + calls > DailyCeiling) return false;

                await container.ReplaceItemAsync(
                    read.Resource with { Calls = read.Resource.Calls + calls },
                    id, key,
                    new ItemRequestOptions { IfMatchEtag = read.ETag },
                    ct);
                return true;
            }
            catch (CosmosException e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                try
                {
                    // 172800s = 2 days, so yesterday's counters clean themselves up.
                    await container.CreateItemAsync(
                        new OrsBudgetDoc(id, calls, 172800), key, cancellationToken: ct);
                    return true;
                }
                catch (CosmosException c) when (c.StatusCode == System.Net.HttpStatusCode.Conflict)
                {
                    // Another instance created it between our read and our write.
                    // Loop and re-read rather than treating the lost race as a
                    // failure — the document now exists either way.
                }
            }
            catch (CosmosException e) when (e.StatusCode == System.Net.HttpStatusCode.PreconditionFailed)
            {
                // Another instance incremented it. Re-read and try again.
            }
        }
        return false;
    }
}
