using System.Globalization;
using Ebrostay.Api.Models;
using Microsoft.Azure.Cosmos;

namespace Ebrostay.Api.Services;

/// A per-owner daily ceiling on imports, held in Cosmos for the same reason
/// OrsBudget is: SWA managed functions scale out and share no memory, so an
/// in-process counter is one counter per instance and no ceiling at all.
///
/// FAILS CLOSED, like OrsBudget. If the count cannot be confirmed we do not
/// start a read — the alternative is an unbounded bill against a third party.
public sealed class ImportBudget(Container container)
{
    /// Twenty reads is far more than an owner with eight drafts can need, and
    /// low enough that a script pasting URLs stops mattering.
    public const int DailyCeiling = 20;
    private const int MaxAttempts = 5;

    public async Task<bool> TryConsumeAsync(string ownerId, CancellationToken ct)
    {
        // InvariantCulture: this becomes a Cosmos id and partition key, and
        // DateTimeOffset's "yyyy" is calendar-dependent under some cultures.
        var id = string.Create(CultureInfo.InvariantCulture,
            $"import-{ownerId}-{DateTimeOffset.UtcNow:yyyy-MM-dd}");
        var key = new PartitionKey(id);

        for (var attempt = 0; attempt < MaxAttempts; attempt++)
        {
            try
            {
                var read = await container.ReadItemAsync<OrsBudgetDoc>(id, key,
                    cancellationToken: ct);
                if (read.Resource.Calls + 1 > DailyCeiling) return false;

                await container.ReplaceItemAsync(
                    read.Resource with { Calls = read.Resource.Calls + 1 }, id, key,
                    new ItemRequestOptions { IfMatchEtag = read.ETag }, ct);
                return true;
            }
            catch (CosmosException e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                try
                {
                    await container.CreateItemAsync(new OrsBudgetDoc(id, 1, 172800), key,
                        cancellationToken: ct);
                    return true;
                }
                catch (CosmosException c)
                    when (c.StatusCode == System.Net.HttpStatusCode.Conflict)
                {
                    // Another instance created it between our read and write.
                }
            }
            catch (CosmosException e)
                when (e.StatusCode == System.Net.HttpStatusCode.PreconditionFailed)
            {
                // Another instance incremented it. Re-read and retry.
            }
        }
        return false;
    }
}
