# Ebrostay v2 Target Spec — §3 Auth & Roles

> Target: branch `redesign/v2`, locked 2026-07-19. Status tags: ✅ decided/locked · 🔜 planned · 🗑️ not carried from v1.
> v1 reference: [docs/spec/08-auth-security.md](../spec/08-auth-security.md). Decisions: [ADR-013, ADR-014](05-decision-log.md).

---

## 3.1 SWA built-in auth ✅ (ADR-013)

v2 uses **Azure Static Web Apps built-in authentication ONLY**, with exactly
two providers: **GitHub** and **Microsoft (`aad`)**. There is **no
email/password** sign-up and **no custom OIDC** — custom providers require the
SWA Standard tier, and v2 stays on Free (ADR-013 records the accepted friction
and the escape hatch).

Endpoints (all served by the SWA platform, same origin):

| Endpoint | Purpose |
| --- | --- |
| `/.auth/login/github` · `/.auth/login/aad` | Provider sign-in; accepts `post_login_redirect_uri` (send users back to the locale-prefixed page they came from). |
| `/.auth/me` | Client-side session check: returns `{ clientPrincipal }` (or `null`). This is how the frontend knows who is signed in — there is no client-side token handling at all. |
| `/.auth/logout` | Sign out (`post_logout_redirect_uri` supported). |
| `/.auth/purge/{provider}` | User-initiated consent/data purge (link from the account page). |

Flow: browser → `/.auth/login/{provider}` → provider consent → SWA sets its
own session cookie → every subsequent request to static assets **and** to
`/api/*` carries the session; SWA injects the principal into function calls as
the `x-ms-client-principal` header (§3.4). The API never sees provider tokens.

## 3.2 Role model ✅

| Role | Granted by | May |
| --- | --- | --- |
| `anonymous` | (no session) | Browse/search published listings, view property pages incl. availability ranges and the estimate widget (CTAs gated), submit inquiries. |
| `authenticated` | any successful sign-in (SWA built-in role) | Everything anonymous can, **plus**: submit booking requests; create/manage **own** listings as a host (draft → submit → resubmit → pause/reopen, availability, photos, AI assistant on own listings); view booking requests for own properties; view own profile. |
| `admin` | **SWA role management invitation** (custom role) | Everything, plus: review queue (approve/reject), edit/pause **any** listing, view all booking requests and inquiries, list users, deactivate/reactivate users. |

There is **no stored "host" role**: any authenticated user may create
listings; "host" is simply the state of owning ≥1 property document
(`properties.hostId`). Roles are **never stored in Cosmos** (§2.3) — the SWA
platform is the single source of role truth, so a compromised database write
can never mint an admin.

## 3.3 Admin invitations ✅

Exactly **3 admin users**, provisioned via SWA **Role management** (portal:
Static Web App `ebrostay-v2` → Role management → Invite):

1. Invite by provider (GitHub or Microsoft) + the email/username the person
   signs in with; assign role `admin`; generate the invitation link (expires
   in hours — send it promptly).
2. The invitee opens the link **while signing in with that provider**; SWA
   binds the role to their principal.
3. Verify via `/.auth/me` (`userRoles` must contain `"admin"`).

Free tier allows up to 25 custom-role users — ample. Revocation is the same
screen (remove the role assignment). Admin membership is **infrastructure
state**, not data: it is not represented in the `profiles` container and no
API can change it.

## 3.4 `x-ms-client-principal` parsing contract (C#) ✅

SWA forwards the authenticated principal to managed functions as the
`x-ms-client-principal` header: **Base64-encoded UTF-8 JSON**:

```json
{
  "identityProvider": "github",
  "userId": "d75b260a64504067bfc5b2905e3b8182",
  "userDetails": "janedoe",
  "userRoles": ["anonymous", "authenticated"],
  "claims": []
}
```

Contract for every function (implemented once as a shared helper +
`ClientPrincipal` record in `api/`):

```csharp
// Parse: header absent/empty  → anonymous caller (principal = null).
// Base64-decode → JSON-deserialize (case-insensitive). Malformed → treat as
// anonymous (never 500 on a bad header).
ClientPrincipal? principal = ClientPrincipal.Parse(req.Headers);

// Authorization helpers — every protected function starts with one of:
principal.IsAuthenticated   // userRoles contains "authenticated"
principal.IsAdmin           // userRoles contains "admin"
principal.UserId            // stable per provider+user → profiles.id (§2.3)
```

Rules:

- `userId` is the **only** identity key: it keys `profiles`, `hostId`, and
  `bookingRequests.userId`. Never trust a client-supplied user id in a body.
- `userRoles` is the **only** authorization input. Never derive privileges
  from Cosmos data (no `isAdmin` flag exists — §3.2).
- Failure responses: `401` when authentication is required and the principal
  is absent; `403` when authenticated but lacking the role, not the owner of
  the resource, or deactivated (§3.7). `404` (not `403`) for resources the
  caller must not learn exist (e.g. someone else's draft).

## 3.5 Route rules are cosmetic — functions enforce ✅

Mirroring v1's "RLS is the boundary, the JS admin gate is cosmetic" (v1
ADR-006) in the new world:

> **`staticwebapp.config.json` route rules (`allowedRoles` on `/es/host/*`,
> `/es/admin/*`, …) are convenience/UX only** — they bounce signed-out users
> to login and hide admin pages, nothing more. **REAL authorization is
> enforced in every C# function** by parsing `x-ms-client-principal` (§3.4)
> and checking role + ownership against the data (e.g. `hostId == UserId`)
> before any read or write.

Consequences (as in v1): authorization is tested at the **API layer** with a
negative-test matrix (anonymous → protected endpoints, authenticated → other
users' drafts/requests, non-admin → admin endpoints, deactivated → everything),
not through the UI. A static page being reachable proves nothing; a function
responding with data does.

## 3.6 Profile bootstrap ✅

First sign-in bootstraps a `profiles` document (§2.3): the frontend calls
`GET /api/me` after detecting a session via `/.auth/me`; the function upserts
(`id` = principal `userId`) — creating `{ id, provider, name, isDeactivated:
false, createdAt }` on first contact, updating `lastSeenAt` thereafter — and
returns the profile. Any other authenticated endpoint hit first performs the
same upsert-on-miss, so ordering is not load-bearing. This replaces v1's
`handle_new_user` Postgres trigger.

## 3.7 Deactivation ✅

v1's self-service deactivation (100-year ban via Supabase — v1 ADR-007) has no
SWA equivalent, so v2 inverts it into an **admin control**:

- An **admin** sets `profiles.isDeactivated = true` (users tab, §4.5). Records
  are kept — never deleted (v1 ADR-007 intent preserved).
- **Every authenticated function rejects deactivated principals**: after
  parsing the principal, load the profile; if `isDeactivated`, respond `403`
  (body `{"error":"account_deactivated"}`). Deactivated users can still *sign
  in* at the SWA layer (that cannot be blocked on Free tier) but can neither
  book, host, nor read protected data — and the frontend shows a deactivated
  notice when `GET /api/me` returns the flag.
- Reactivation: admin clears the flag. If the account held the `admin` role,
  also remove it in SWA role management (§3.3) — the 403-on-deactivated check
  runs before any role check, so a deactivated admin is locked out of the API
  either way.
- Self-service "delete my account" is 🔜 deferred: the account page links
  `/.auth/purge/{provider}` (SWA-side consent purge) and support contact;
  a user-initiated deactivation endpoint may be added later without design
  change (it is the same flag, set by self instead of admin).
