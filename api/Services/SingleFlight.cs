using System.Collections.Concurrent;

namespace Ebrostay.Api.Services;

/// One in-flight run per key. A second caller arriving while the first is still
/// working joins it instead of starting its own.
///
/// Written for street-band derivation, where the work is three sequential
/// Overpass queries taking 8-9 s each (measured 2026-08-08): a reviewer
/// double-clicking *Retry*, or two review tabs open on one listing, would
/// otherwise spend six queries to learn one answer, against a free community
/// endpoint we are already too heavy on.
///
/// NOT a cache. The entry is dropped the moment the run finishes — success or
/// failure — so the next call really does run again. A failed derivation that
/// wedged its key would make *Retry* return the same 504 for the life of the
/// process, which is the opposite of what the button is for.
///
/// In-process only, and deliberately: SWA consumption may hold several
/// instances, so this collapses the common case (one reviewer, one listing,
/// one instance) and does not pretend to be a distributed lock. The durable
/// guard against repeat work is `bandAttemptedAt` on the document.
public sealed class SingleFlight<TKey, TValue> where TKey : notnull
{
    private readonly ConcurrentDictionary<TKey, Lazy<Task<TValue>>> running = new();

    public Task<TValue> RunAsync(TKey key, Func<Task<TValue>> work)
    {
        // Lazy, not a bare Task: ConcurrentDictionary may run GetOrAdd's
        // factory more than once under contention and throw all but one result
        // away. A discarded Task there would be a started, orphaned Overpass
        // run — the exact waste this class exists to prevent.
        var flight = running.GetOrAdd(key, _ => new Lazy<Task<TValue>>(
            () => RunAndReleaseAsync(key, work),
            LazyThreadSafetyMode.ExecutionAndPublication));
        return flight.Value;
    }

    private async Task<TValue> RunAndReleaseAsync(TKey key, Func<Task<TValue>> work)
    {
        try
        {
            return await work();
        }
        finally
        {
            // In a finally, so a throw releases the key too. Callers already
            // awaiting hold the Task itself and are unaffected by the removal.
            running.TryRemove(key, out _);
        }
    }
}
