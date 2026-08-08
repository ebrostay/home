using System.Net;
using Ebrostay.Api.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Cosmos;

namespace Ebrostay.Api.Services;

// Profile bootstrap (spec §3.6) + the shared authenticated-endpoint guard
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

    // The guard every WRITE endpoint calls, in place of RequireActiveAsync.
    //
    // The difference between "your account is closing" and "you are locked
    // out": a closing account can still READ — its owner needs to see the
    // portfolio that is about to close, and to reach the page that cancels
    // the request — but cannot create or edit anything.
    //
    // Layered on RequireActiveAsync so the §3.7 deactivation refusal still
    // runs first: a deactivated account is refused as deactivated, whatever
    // else is true of it.
    public async Task<(ProfileDoc? profile, IActionResult? error)> RequireWritableAsync(
        ClientPrincipal? principal)
    {
        var (profile, error) = await RequireActiveAsync(principal);
        if (error is not null) return (null, error);

        if (AccountClosure.BlocksWrites(profile!))
            return (null, new ObjectResult(new { error = "deletion_requested" })
            {
                StatusCode = StatusCodes.Status403Forbidden,
            });

        return (profile, null);
    }

    // The same guard, plus the role — what every /api/admin/* function calls
    // first (spec §3.5: the route rule is cosmetic, THIS is the boundary).
    //
    // Layered on RequireWritableAsync, so the refusals happen in this order:
    // 401 anon → 403 deactivated → 403 closing → 403 not an admin.
    //
    // The deactivation half is what §3.7 relies on: a deactivated principal is
    // refused before anything reads its roles, so an admin who has been
    // deactivated is locked out of the API and never reaches an admin endpoint
    // at all. Removing the role afterwards is tidiness, not the lock.
    //
    // The closure half is a product decision of 2026-08-08 — "closed is
    // closed", and an admin account is the one where a surprise is least
    // affordable. A staff member who has asked to close their own account
    // keeps no moderation power: not approve, not reject, not publish, not
    // deactivating somebody else.
    //
    // NOTE THE ASYMMETRY with the owner case, and that it is deliberate.
    // RequireWritableAsync lets a closing OWNER keep reading, because their
    // portfolio and the page that cancels the closure are things they still
    // need to see. A closing ADMIN loses the whole admin surface, reads
    // included (staff/review-queue, staff/users, staff/properties,
    // staff/properties/{id}): the admin surface shows other people's homes and
    // other people's accounts, none of which is theirs to read on the way out,
    // and half a moderation console — a queue you can open but not act on — is
    // exactly the surprise the decision names.
    //
    // What a closing admin does NOT lose is the way back: AccountFunctions
    // guards DELETE /api/account/closure with RequireActiveAsync, not with
    // this method, so cancelling their own closure still answers and restores
    // everything above. Moving that endpoint onto either of the two guards
    // here would make a closure irreversible.
    public async Task<(ProfileDoc? profile, IActionResult? error)> RequireAdminAsync(
        ClientPrincipal? principal)
    {
        var (profile, error) = await RequireWritableAsync(principal);
        if (error is not null) return (null, error);

        // 403, not 404: unlike a listing, the existence of the admin surface
        // is not a secret — it is linked from the header of every admin's
        // browser and documented in a public spec.
        if (principal is not { IsAdmin: true })
            return (null, new ObjectResult(new { error = "admin_required" })
            {
                StatusCode = StatusCodes.Status403Forbidden,
            });

        return (profile, null);
    }
}
