using Ebrostay.Api.Models;
using Ebrostay.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;

namespace Ebrostay.Api.Functions;

// GET /api/me — session probe + profile bootstrap (spec §3.6). Anonymous
// callers get authenticated:false (200, not 401) so the frontend can call it
// unconditionally. This is the one authenticated endpoint that does NOT reject
// a deactivated principal — it reports the flag so the UI can show the notice.
public class MeFunction(ProfileService profiles)
{
    [Function("Me")]
    public async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "me")] HttpRequest req)
    {
        var principal = ClientPrincipal.Parse(req);
        if (principal is null || !principal.IsAuthenticated)
            return new OkObjectResult(
                new MeResponse(false, null, null, null, ["anonymous"], false, false));

        var profile = await profiles.BootstrapAsync(principal);
        return new OkObjectResult(new MeResponse(
            Authenticated: true,
            UserId: principal.UserId,
            Name: profile.Name,
            Provider: principal.IdentityProvider,
            Roles: principal.UserRoles,
            IsAdmin: principal.IsAdmin,
            IsDeactivated: profile.IsDeactivated));
    }
}
