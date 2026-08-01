namespace Ebrostay.Api.Models;

// `profiles` container document (spec §2.3 / §3.6). id = principal userId.
// NO role field lives here — roles are SWA-platform state only (§3.2), so a
// compromised DB write can never mint an admin.
public class ProfileDoc
{
    public string Id { get; set; } = "";
    public string Provider { get; set; } = "";
    public string Name { get; set; } = "";
    public bool IsDeactivated { get; set; }
    public string? CreatedAt { get; set; }
    public string? LastSeenAt { get; set; }
}

// What the frontend gets from GET /api/me (roles come from the principal,
// not the doc).
public record MeResponse(
    bool Authenticated,
    string? UserId,
    string? Name,
    string? Provider,
    string[] Roles,
    bool IsAdmin,
    bool IsDeactivated);
