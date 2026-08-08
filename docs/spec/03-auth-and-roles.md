# Ebrostay v2 Target Spec — §3 Auth & Roles

> Target: branch `redesign/v2`, locked 2026-07-19; providers replaced 2026-07-31/08-01 (ADR-035/036, superseding ADR-013). Status tags: ✅ decided/locked · 🔜 planned · 🗑️ not carried from v1.
> v1 auth (Supabase email/password + RLS): superseded (v1 spec on `main`). Decisions: [ADR-014, ADR-035, ADR-036](05-decision-log.md).

---

## 3.1 SWA built-in auth over Entra External ID ✅ (ADR-035/036; supersedes ADR-013)

v2 uses **SWA built-in authentication** (sessions, cookies and the principal
header are all still the platform's), but the identity providers are our own
**custom OIDC registrations** — which is what forced the move to the SWA
**Standard** plan and the `ebrostay-home` resource (§1.2). ADR-013's
preconfigured GitHub/`aad` providers are gone: the consent screen they showed
belonged to Microsoft's shared "Azure Static Web Apps" app, and they offered
no email/password sign-up.

Two providers, wired in `staticwebapp.config.json`:

| Provider | Backed by | Offers |
| --- | --- | --- |
| `ebrostay` | **Entra External ID** external tenant `ebrostay` (EU; sign-in pages at `ebrostay.ciamlogin.com`, Ebrostay-branded) | **Ebrostay account** (email + password, hosted by Entra — reset/verification/lockout are the platform's; we store no credential) and **Microsoft account** via the tenant's custom OIDC federation. Google 🔜 planned; Apple 🗑️ not carried. |
| `ebrostay-msa` | `login.microsoftonline.com/consumers` directly (no Entra in the path) | **One-hop Microsoft sign-in** from the Microsoft button on `/sign-in` (ADR-036 amendment). |

**The two doors mint two identities.** A Microsoft-door `userId` is the MSA
`oid`; an email-door `userId` (including Microsoft *federated through Entra*)
is a tenant `oid`. Same human, two `profiles` documents and two disjoint
listing sets — accepted by the product owner (ADR-036); the support answer is
"which button did you use?".

Our **`/sign-in` page is the branded front door**: it states which accounts
work, carries the real one-hop Microsoft button, forwards already-signed-in
visitors, and receives the SWA `401` response override
(`staticwebapp.config.json` → 302 `/es/sign-in/`). The provider *choice*
otherwise lives on Entra's hosted page — a Microsoft-branded shortcut through
the `ebrostay` provider is not buildable (ADR-036 records the four dead
mechanisms so nobody pays for that twice).

Endpoints (all served by the SWA platform, same origin):

| Endpoint | Purpose |
| --- | --- |
| `/.auth/login/ebrostay` · `/.auth/login/ebrostay-msa` | Provider sign-in; accepts `post_login_redirect_uri` (send users back to the locale-prefixed page they came from). |
| `/.auth/me` | Client-side session check: returns `{ clientPrincipal }` (or `null`). This is how the frontend knows who is signed in — there is no client-side token handling at all. |
| `/.auth/logout` | Sign out (`post_logout_redirect_uri` supported). |
| `/.auth/purge/{provider}` | User-initiated consent/data purge (link from the account page). |

Flow: browser → `/sign-in` → `/.auth/login/{provider}` → Entra or MSA login →
SWA sets its own session cookie → every subsequent request to static assets
**and** to `/api/*` carries the session; SWA injects the principal into
function calls as the `x-ms-client-principal` header (§3.4). The API never
sees provider tokens.

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
Static Web App `ebrostay-home` → Role management → Invite):

1. Invite by provider (`ebrostay` or `ebrostay-msa`) + the email the person
   signs in with; assign role `admin`; generate the invitation link (expires
   in hours — send it promptly). Because the two doors mint two identities
   (§3.1), invite the door the person actually uses.
2. The invitee opens the link **while signing in with that provider**; SWA
   binds the role to their principal.
3. Verify via `/.auth/me` (`userRoles` must contain `"admin"`).

SWA allows up to 25 custom-role users — ample. Revocation is the same
screen (remove the role assignment). Admin membership is **infrastructure
state**, not data: it is not represented in the `profiles` container and no
API can change it.

## 3.4 `x-ms-client-principal` parsing contract (C#) ✅

SWA forwards the authenticated principal to managed functions as the
`x-ms-client-principal` header: **Base64-encoded UTF-8 JSON**:

```json
{
  "identityProvider": "ebrostay",
  "userId": "d75b260a-6450-4067-bfc5-b2905e3b8182",
  "userDetails": "Jane Doe",
  "userRoles": ["anonymous", "authenticated"],
  "claims": []
}
```

Provider-specific facts worth knowing (ADR-035/036):

- `userId` is the Entra `objectidentifier` on the `ebrostay` door and the MSA
  `oid` on the `ebrostay-msa` door — stable per user object, but **different
  per door for the same human** (§3.1).
- `userDetails` carries the **display name**, not the email (the user flow's
  attribute collection supplies it — including for Microsoft-federated users,
  whose `openid email` scope never sends a name). The email arrives as the
  `preferred_username` claim.
- On the `ebrostay` door, SWA reports `identityProvider: "ebrostay"` for both
  local and Microsoft-federated accounts; the
  `…/identity/claims/identityprovider` claim is the only way to tell them
  apart.

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
  the resource, deactivated, or — on a write — closing (§3.7). `404` (not
  `403`) for resources the
  caller must not learn exist (e.g. someone else's draft).

## 3.5 Route rules are cosmetic — functions enforce ✅

Mirroring v1's "RLS is the boundary, the JS admin gate is cosmetic" (v1
ADR-006) in the new world:

> **`staticwebapp.config.json` route rules (`allowedRoles` on `/es/account/*`,
> `/es/admin/*`, …) are convenience/UX only** — they bounce signed-out users
> to login and hide admin pages, nothing more. **REAL authorization is
> enforced in every C# function** by parsing `x-ms-client-principal` (§3.4)
> and checking role + ownership against the data (e.g. `hostId == UserId`)
> before any read or write.
>
> `/es/admin*` and `/en/admin*` (both the exact path and the wildcard, since
> 2026-08-08) keep their rules **and** carry an in-app gate,
> `components/admin/RequireAdmin.tsx`. The rule is what a stranger meets; the
> component is what an *admin* meets, because the likeliest failure is a real
> admin signed in through the other door (§3.1), and bouncing them to a login
> they have already completed reads as a broken site rather than as the
> answer. Neither is the boundary: `ProfileService.RequireAdminAsync` is, and
> it runs the §3.7 deactivation **and closure** checks — it layers on
> `RequireWritableAsync` — **before** it reads a role.
>
> `/host/*` is not among them: since 2026-08-01 `/host/new`, `/host/edit`, and
> `/host/manage` bounce a signed-out visitor in-app, via
> `components/host/RequireOwner.tsx`, instead of an edge route rule — that
> component reads the locale the visitor is already on and preserves the
> destination, which SWA's single global `responseOverrides.401` could not do.
> `/host` itself carries no rule at all: it is public, serving the owner pitch
> to a signed-out visitor and the portfolio to a signed-in one. Same
> conclusion either way — none of this is the authorization boundary.

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

## 3.7 Deactivation, and owner-initiated closure ✅

Two account-level states, set by two different people, meaning two different
things. **Deactivation** is done *to* an account by an admin and locks it out.
**Closure** is asked for *by* its owner, blocks writes, and can be taken back
by the person who asked (ADR-042).

### Deactivation ✅

v1's self-service deactivation (100-year ban via Supabase — v1 ADR-007) has no
SWA equivalent, so v2 inverts it into an **admin control**:

- An **admin** sets `profiles.isDeactivated = true` (users tab, §4.5). Records
  are kept — never deleted (v1 ADR-007 intent preserved).
- **Every authenticated function rejects deactivated principals**: after
  parsing the principal, load the profile; if `isDeactivated`, respond `403`
  (body `{"error":"account_deactivated"}`). Deactivated users can still *sign
  in* at the SWA layer (built-in auth has no per-user ban) but can neither
  book, host, nor read protected data — and the frontend shows a deactivated
  notice when `GET /api/me` returns the flag. (An `ebrostay`-door account can
  *additionally* be disabled in the Entra tenant, which blocks the sign-in
  itself; the MSA door has no equivalent. The function-layer check is the rule
  either way — the Entra disable is defence in depth, never the boundary.)
- Reactivation: admin clears the flag. If the account held the `admin` role,
  also remove it in SWA role management (§3.3) — the 403-on-deactivated check
  runs before any role check, so a deactivated admin is locked out of the API
  either way.
### Owner-initiated closure ✅ (ADR-042, built 2026-08-08)

Self-service closure is **no longer deferred**. `/account` exists, and from it
an owner asks to close their own account and takes the request back.

- **The flag is `profiles.deletionRequestedAt`** (§2.3): an ISO 8601 timestamp,
  or `null`. Set by `POST /api/account/closure`, cleared by
  `DELETE /api/account/closure` (`api/Functions/AccountFunctions.cs`). Both act
  only on the caller's own account — the id comes from `x-ms-client-principal`,
  never from a body (§3.4) — and both also fan out over the caller's listings
  (§2.2.1: `published → closed`, `pending_review → draft`; cancel restores only
  `closed → paused`).
- **`ProfileService.RequireWritableAsync` = `RequireActiveAsync` + refuse a
  closing account**, with `403 {"error":"deletion_requested"}`. Layered on the
  older guard, so a deactivated account is still refused *as deactivated*
  whatever else is true of it. **Nine write endpoints** call it in place of
  `RequireActiveAsync`: create, details, status, photo upload, declined,
  pricing, availability (`api/Functions/HostFunctions.cs`), plus import start
  and import cancel (`api/Functions/ImportFunctions.cs`).
- **Reads keep `RequireActiveAsync`.** This is the difference between "your
  account is closing" and "you are locked out": the owner can still see the
  portfolio that is closing and the states its listings have moved to, but
  cannot create or edit. `GET /api/me` is unaffected either way — `MeFunction`
  calls `BootstrapAsync` directly and passes through neither guard.
- **The closure endpoints themselves use `RequireActiveAsync`, deliberately.**
  Guarding them with `RequireWritableAsync` would make cancelling a write that
  a closing account cannot perform — the request would be irreversible by the
  one person who made it, and the only way back would be an admin path that
  does not exist. The rule is narrow and load-bearing: **the way out is never
  behind the guard the way in switched on.**
- **`RequireAdminAsync` now layers on `RequireWritableAsync`**, so the refusals
  run in one order: `401` anon → `403` deactivated → `403` closing → `403` not
  an admin. A staff member who has asked to close their own account therefore
  loses the **entire** admin surface, reads included (`staff/review-queue`,
  `staff/users`, `staff/properties`, `staff/properties/{id}`) — not approve,
  not reject, not publish, not deactivating somebody else. Product-owner
  decision, 2026-08-08: *"Closed is closed, don't want surprises for admin acc
  closures which are the most critical accounts."*

  **Note the asymmetry with owners, and that it is intentional.** A closing
  owner keeps their reads because the portfolio and the cancel button are
  theirs to see. The admin surface shows *other people's* homes and *other
  people's* accounts, none of which is theirs to read on the way out — and half
  a moderation console, a queue you can open but not act on, is exactly the
  surprise the decision names. `components/admin/RequireAdmin.tsx` tells a
  closing admin so, rather than rendering a console whose every call 403s.
  The way back is untouched: `DELETE /api/account/closure` sits on
  `RequireActiveAsync`, so cancelling restores the whole surface.

  **The one cross-account read that is not on an `/api/staff/*` route is
  closed by the same rule.** `GET /api/host/properties/{id}` is a read, so it
  is guarded by `RequireActiveAsync` — correctly, because a closing owner must
  keep reaching their own listings — but it loads through
  `ListingVisibility.MayWrite`, which admits an admin to *anybody's* listing.
  A closing admin could therefore open `/host/manage?id=<any id off a public
  URL>` and be served a stranger's exact address, cadastral reference, pin,
  pricing, reviewer note and booking-request log. The endpoint now applies
  `ListingVisibility.MayRead`, which is `MayWrite` minus the admin's
  cross-account half once that admin is closing, and answers **404** — a
  listing this caller may not learn exists (§3.4), the same answer a stranger
  already got. The owner's own read is untouched: your own things, yes; other
  people's, no.

**Still deferred: hard deletion.** This section's "records are kept — never
deleted" is unchanged, and **no endpoint deletes a profile**. A closure request
is a signal: it appears against the person in the admin users tab (§4.5,
`AdminUser.deletionRequestedAt`) with no action attached, and an admin acts out
of band. Reversing "never deleted" is a decision, not an endpoint, and belongs
to its own ADR (ADR-042 consequences).

- The account page also links `/.auth/purge/{provider}` (the SWA-side consent
  purge) and support contact. It is described there as revoking the sign-in
  connection, **not** as a delete — it removes nothing from Cosmos.
