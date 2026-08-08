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

    /// Owner-initiated account closure (design 2026-08-08). Null = no request.
    /// A timestamp rather than a bool: it is both the gate every write endpoint
    /// checks and the audit record the admin users tab shows, so the admin can
    /// see how long a request has waited.
    ///
    /// Deliberately NOT `IsDeactivated`. Deactivation is done TO you by an
    /// admin and locks you out; a closure request is made BY you and must
    /// still let you reach your own account page to cancel it.
    public string? DeletionRequestedAt { get; set; }
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
    bool IsDeactivated,
    string? DeletionRequestedAt);
