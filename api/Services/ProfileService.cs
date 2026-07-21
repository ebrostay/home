using System.Net;
using Ebrostay.Api.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Cosmos;

namespace Ebrostay.Api.Services;

// Profile bootstrap (spec-v2 §3.6) + the shared authenticated-endpoint guard
// (§3.4/§3.7). Roles are NEVER read from here — only the principal.
public class ProfileService(Database database)
{
    private Container Profiles => database.GetContainer("profiles");

    // Upsert-on-first-contact: create on miss, touch lastSeenAt otherwise.
    public async Task<ProfileDoc> BootstrapAsync(ClientPrincipal principal)
    {
        var now = DateTimeOffset.UtcNow.ToString("o");
        try
        {
            var existing = await Profiles.ReadItemAsync<ProfileDoc>(
                principal.UserId, new PartitionKey(principal.UserId));
            var doc = existing.Resource;
            doc.LastSeenAt = now;
            // keep display name fresh from the provider
            if (!string.IsNullOrEmpty(principal.UserDetails)) doc.Name = principal.UserDetails;
            await Profiles.ReplaceItemAsync(doc, doc.Id, new PartitionKey(doc.Id));
            return doc;
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            var doc = new ProfileDoc
            {
                Id = principal.UserId,
                Provider = principal.IdentityProvider,
                Name = principal.UserDetails,
                IsDeactivated = false,
                CreatedAt = now,
                LastSeenAt = now,
            };
            await Profiles.CreateItemAsync(doc, new PartitionKey(doc.Id));
            return doc;
        }
    }

    // The guard every protected function calls first. Returns the active
    // profile, or an error result: 401 anon, 403 deactivated.
    public async Task<(ProfileDoc? profile, IActionResult? error)> RequireActiveAsync(
        ClientPrincipal? principal)
    {
        if (principal is null || !principal.IsAuthenticated)
            return (null, new UnauthorizedResult());

        var profile = await BootstrapAsync(principal);
        if (profile.IsDeactivated)
            return (null, new ObjectResult(new { error = "account_deactivated" })
            {
                StatusCode = StatusCodes.Status403Forbidden,
            });

        return (profile, null);
    }
}
