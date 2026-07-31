# Identity migration — Entra External ID, SWA Standard, West Europe

> Design spec, 2026-07-31. Branch `redesign/v2`.
> Supersedes ADR-013 (SWA built-in auth, GitHub + Microsoft only).
> Amends ADR-021 (SWA region).

## 1. Why

v2 ships today on SWA **Free** with the platform's *preconfigured* identity
providers: a single Microsoft-owned app registration shared by every Free-plan
static web app. Three consequences drove this work:

1. The OAuth consent screen asks the user to grant **"Azure Static Web Apps"**
   access to their account. Guests about to hand over identity documents for a
   rental are consenting to an app that is not ours and whose name we cannot
   change.
2. There is **no email/password sign-up**. A visitor without a GitHub or
   Microsoft account cannot book or host. ADR-013 accepted this friction and
   named the escape hatch: *"SWA Standard tier + custom OIDC or Entra External
   ID"*. This is that hatch.
3. GitHub as a sign-in option is a poor fit for people renting flats.

The goal is an **Ebrostay-owned identity**: our name and branding on the
sign-in page, an account anyone can create with an email address, and social
sign-in for those who prefer it.

## 2. Scope

**In scope.** Identity provider migration, SWA plan and region change, branded
sign-in pages, the sign-out redirect bug, the anonymous-user 401 gap,
re-seeding the data whose keys change as a result, and the **privacy policy
update** (§5.6) — a direct legal consequence of changing who processes
credentials, not of the account page.

**Out of scope**, each needing its own spec:

- **Account page** (profile, saved places moved off `localStorage`, account
  deletion and what GDPR actually requires, notification preferences).
  Blocked on this work landing.
- **Payments** (payment methods, deposits, payouts). ADR-016 dropped the
  Stripe path and `owner_payout_details` was deliberately not carried
  (§2.1). Re-opening it needs a PSP decision and legal input on Aragón
  fianza registration — see `docs/spec-v2/07-legal-notes.md`.

## 3. Decisions

| # | Decision | Rationale |
| --- | --- | --- |
| D1 | **Microsoft Entra External ID**, in a new **external tenant** | The only option giving us Ebrostay-hosted email accounts. External tenants are a tenant *configuration* chosen at creation — a workforce tenant cannot be converted, and cannot do consumer self-service sign-up with a local password. |
| D2 | Entra **brokers all federation**; SWA sees exactly **one** OIDC provider | `userId` is per-provider. Registering Google and Apple directly against SWA would mint a separate principal — and so a separate `profiles` document and a separate set of listings — for the same human depending on which button they pressed. Entra keeps one user object per person with multiple sign-in methods attached. |
| D3 | Sign-in methods: **local email + password**, **Google**, **Apple** | Email + password chosen over one-time passcode because hosts, who carry the economic stake and sign in most often, expect a conventional login. Google and Apple cover the social case in Spain. |
| D4 | **Drop Microsoft** as a sign-in option | External tenants offer Facebook, Google and Apple as preconfigured social providers. The Microsoft option is Entra ID federation, which federates *one nominated organisational tenant* — not "any Microsoft account". ADR-013 justified Microsoft on the grounds that the audience holds a Microsoft or GitHub identity; email + password dissolves that argument. Federating a specific corporate tenant stays available later if a client asks. |
| D5 | **Drop GitHub** | Not appropriate for the audience, and any custom registration disables all preconfigured providers regardless. |
| D6 | **Drop Facebook** | Skews wrong for corporate tenants and reads as a privacy cost on a page preceding identity-document exchange. |
| D7 | SWA **Standard** plan | Required for custom authentication at all. ~$9/app/month. |
| D8 | Recreate the SWA in **West Europe**, reusing the name **`ebrostay-home`** | `Microsoft.Web/staticSites` is available in only five regions — Central US, East US 2, West US 2, West Europe, East Asia — so `spaincentral` co-location is permanently impossible. West Europe (Netherlands) to Spain Central (Madrid) replaces a transatlantic hop with ~20–30 ms. Region is immutable, so this requires a new resource. |
| D9 | Branded pages on **`<tenant>.ciamlogin.com`**; **no custom domain** | Company branding — logo, colours, custom CSS — is included at no cost. A custom login domain requires Azure Front Door as a reverse proxy, at $35/month base plus traffic: roughly 4× the SWA cost for a hostname. Additive later; nothing is designed around its absence. |
| D10 | Wire Entra as a **custom OIDC provider** named `ebrostay`, not as `azureActiveDirectory` | `customOpenIdConnectProviders` is designed for arbitrary OIDC issuers; the `azureActiveDirectory` provider is shaped around workforce-tenant issuer formats. Also yields `/.auth/login/ebrostay` — the user signs in *to Ebrostay*, not *with Microsoft*. |
| D11 | Admin roles stay on **SWA invitations** | Exactly three admins (§3.3); Standard retains the 25-user invitation system. A `rolesSource` function is more machinery for the same outcome, is still flagged preview, and would silently disable invitations. |
| D12 | **Drop and re-seed** Cosmos rather than migrate identities | Confirmed: only seed data exists. No real hosts, listings, or booking requests. |

### Cost

| Item | Cost |
| --- | --- |
| SWA Standard | ~$9/app/month |
| Entra External ID Basic | **$0** — first 50,000 MAU free; expected usage is dozens |
| Local accounts, Google/Apple federation, branded pages | included in Basic |
| Cosmos DB, Blob Storage | unchanged (Cosmos free tier) |

SMS phone authentication is billed per message per country and is **not
enabled**. Email one-time passcodes, used for sign-up verification and password
reset, are free.

## 4. Architecture

### Resources after the change

| Resource | Region | Plan | Change |
| --- | --- | --- | --- |
| Entra external tenant `ebrostayid` | EU data location | Basic | **Created** |
| SWA `ebrostay-home` | **West Europe** | **Standard** | **Created** |
| Cosmos `ebrostay-cosmos` | spaincentral | Free tier | unchanged |
| Storage `ebrostayphotos` | spaincentral | Standard LRS | unchanged |
| SWA `ebrostay-v2` | East US 2 | Free | **Deleted** at cutover |
| SWA `ebrostay-home` (old) | West US 2 | Free | **Deleted 2026-07-31** |

The old `ebrostay-home` was deleted ahead of the work so its name could be
reused. It held no custom domains, and production `ebrostay.com` is served by
**GitHub Pages** via `pages.yml` on `main` — not by any Azure SWA — so the
deletion had no effect on the live v1 site.

The external tenant's **geographic location is set at creation and is
immutable**. It must be EU.

### Identity topology

The external tenant is the only provider SWA sees. Inside it, three sign-in
methods resolve to one Entra user object per person, which is what keeps
`userId` stable when someone signs up with email on a laptop and later uses
Google on a phone.

```
browser → /.auth/login/ebrostay
        → ebrostayid.ciamlogin.com  (branded user flow)
             ├── email + password   (local account)
             ├── Google             (federated)
             └── Apple              (federated)
        → /.auth/login/ebrostay/callback
        → SWA session cookie
        → /api/*  carries  x-ms-client-principal
```

Sign-up verifies the email address with a one-time passcode automatically, and
password reset (link, emailed code, new-password screen) is provided by the
platform. **Neither is ours to build.**

## 5. Changes

### 5.1 Configuration

`app/public/staticwebapp.config.json` gains an `auth` block. Route rules and
the existing 404 override are unchanged.

```json
{
  "auth": {
    "identityProviders": {
      "customOpenIdConnectProviders": {
        "ebrostay": {
          "registration": {
            "clientIdSettingName": "EBROSTAY_OIDC_CLIENT_ID",
            "clientCredential": {
              "clientSecretSettingName": "EBROSTAY_OIDC_CLIENT_SECRET"
            },
            "openIdConnectConfiguration": {
              "wellKnownOpenIdConfiguration": "https://ebrostayid.ciamlogin.com/<TENANT_ID>/v2.0/.well-known/openid-configuration"
            }
          },
          "login": {
            "nameClaimType": "name",
            "scopes": ["openid", "profile", "email"],
            "loginParameterNames": []
          }
        }
      }
    }
  }
}
```

`<TENANT_ID>` is produced by step 1 of the rollout. `nameClaimType` must be
confirmed against a real token in step 4 — SWA maps `userDetails` from it, and
if it is wrong the account menu shows a blank initial.

Client ID and secret live in **SWA application settings only**, never in the
repo. The redirect URI registered in Entra is
`https://<swa-default-host>/.auth/login/ebrostay/callback`.

### 5.2 Frontend

| File | Change |
| --- | --- |
| `app/lib/auth.ts` | `Provider` union removed; `loginUrl(redirectTo)` loses its provider argument. `Me.provider` stays (now always `"ebrostay"`). |
| `app/components/site/AuthMenu.tsx` | Signed-out dropdown removed — "Sign in" becomes a direct link, since provider choice now lives on the Entra page. Both inline SVGs (GitHub mark, Microsoft squares) deleted with it. Signed-in menu unchanged. |
| `app/messages/es.json`, `en.json` | Retire `auth.signInWith`, `auth.github`, `auth.microsoft`. Both locales — bilingual is a hard requirement. |
| `app/public/staticwebapp.config.json` | `auth` block above, plus the 401 override in §5.4. |

### 5.3 API

**No logic changes.** The `x-ms-client-principal` contract (§3.4) is unchanged:
same header, same Base64 JSON, `userId` still the only identity key and
`userRoles` still the only authorization input.

The `identityProvider` value becomes `"ebrostay"`. It is read by
`api/Models/ClientPrincipal.cs`, stored by `api/Services/ProfileService.cs`,
and returned by `api/Functions/MeFunction.cs` — but **nothing branches on it**,
so the change is data-only.

### 5.4 Error handling

Two defects in the same area, both fixed here.

**Sign-out lands on 403.** `AuthMenu.tsx` passes `currentPath()` as
`post_logout_redirect_uri`, so signing out from a gated page redirects the
now-anonymous browser back into `allowedRoles`. Redirect to the locale home
instead.

**Anonymous users hit a bare 401.** `staticwebapp.config.json` overrides 404
only. An anonymous visitor landing on `/es/host/manage` gets a platform error
page rather than a login prompt. Add a 401 override redirecting to
`/.auth/login/ebrostay`, which turns every gated route into a working login
gate. Not yet user-visible only because `/account` does not exist.

### 5.5 Data

Cosmos is dropped and re-seeded: every `userId` changes, and `userId` keys
`profiles.id`, `properties.hostId` and `bookingRequests.userId`. The three
admins are re-invited through SWA Role management after cutover, since
invitations bind to provider identity.

### 5.6 Privacy policy

`app/app/[locale]/privacy/page.tsx` is materially outdated by this change and
is updated in the same work, in **both locales**.

What changes:

- **Microsoft becomes a processor**, handling email addresses, password
  credentials and authentication events on our behalf. Covered automatically by
  the Microsoft Products and Services Data Protection Addendum, but it must be
  disclosed.
- **We gain a credential relationship** we have never had. Microsoft stores the
  hash; the account is ours.
- **The external tenant's EU location** is the international-transfer answer —
  state it explicitly.
- **Google and Apple** as federated options: disclose that choosing one shares
  data with that provider.
- **GitHub and Microsoft sign-in disappear.** Remove stale references.

#### No cookie banner is required — recorded so it is not re-litigated

LSSI-CE Art. 22.2, implementing ePrivacy, requires consent to store or read
information on a user's device **except** where strictly necessary for a
service the user expressly requested. Authentication cookies are the canonical
exempt case (EDPB Guidelines 2/2023; WP29 Opinion 04/2012 lists authentication
and user-centric security cookies). The SWA session cookie is set only after
the user clicks sign in.

This change does not alter that. Before: an SWA session cookie after a
Microsoft or GitHub login. After: the same SWA session cookie after an Entra
login. Same cookie, same purpose, same exemption — what moves is which consent
screen appears upstream, on the IdP's own domain.

D2 helps here as a side effect: because Google and Apple are reached by
redirect through Entra, **no Google client SDK (One Tap / GSI) is embedded in
our pages**. Embedding one would touch device storage before the visitor
requested anything, which is exactly what creates a consent obligation.

Existing terminal storage is unchanged and remains exempt. Note that ePrivacy
covers *all* terminal storage, not only cookies — `localStorage` counts:

| Storage | Assessment |
| --- | --- |
| `ebrostay-theme` (`ThemeToggle`) | User-initiated preference — exempt |
| YourPlaces store (`components/detail/YourPlaces.tsx`) | User-entered input — exempt |
| Umami (`components/site/Analytics.tsx`) | Cookieless: no device storage, so no ePrivacy trigger. Still personal data (IP) under GDPR — belongs in the privacy notice with a legal basis. Currently **not mounted** into the layout. |

**What would flip this conclusion:** enabling **client-side Application
Insights** — SWA's documented path for function logs. Its browser SDK sets
`ai_user` and `ai_session` cookies which are *not* strictly necessary, and a
banner would then be required. Not called for by this spec; recorded because it
is the kind of thing switched on mid-debugging.

This is a reading of the regulations, not legal advice. It should go past the
same adviser as the fianza questions in `docs/spec-v2/07-legal-notes.md`.

## 6. Testing

- **Unit** (`npm test`) — `loginUrl` / `logoutUrl` in `app/lib/auth.ts` are
  pure logic and gain tests.
- **E2E** (`npm run test:e2e`) — `/api/me` fixtures updated for the new
  provider value. No new routes, so the route-enumeration guard test is
  unaffected.
- **Authorization** — the §3.5 negative matrix (anonymous → protected,
  authenticated → another user's draft, non-admin → admin endpoints,
  deactivated → everything) is unchanged and must still pass.
- **Privacy page** — renders in `es` and `en` with no stale provider
  references. Already an enumerated route, so the existing guard test covers
  its reachability; the content check is manual.
- **Manual** — the real Entra flow cannot run in Playwright. Against the
  deployed West Europe app, verify for each of the three methods: sign-up,
  sign-in, sign-out, and return to a gated page. Plus password reset, and the
  sign-out session question in §7.

## 7. Risks

| Risk | Fallback |
| --- | --- |
| West Europe refuses a Standard creation. ADR-021 recorded West Europe as *location-ineligible*; the provider does list it as a valid region, so that was a capacity refusal rather than an absence. The hypothesis that a **Standard** creation is accepted where **Free** was refused is **unproven** — Azure caps free-tier capacity in popular regions, but this is inference, not documented. | Create in East US 2. Evaluate bring-your-own Functions in `spaincentral` separately — it co-locates the API with Cosmos but bills as a standalone Function App plus storage account, breaking the "managed functions are included" cost model. |
| SWA cannot consume the `ciamlogin.com` issuer as a custom OIDC provider | Fall back to the `azureActiveDirectory` provider with the ciamlogin issuer. Costs the `/.auth/login/ebrostay` path, nothing structural. |
| `/.auth/logout` clears the SWA session but may leave the Entra session live, so "sign in" silently re-authenticates without a prompt | Verify in step 4. If confirmed, chain sign-out through the IdP's `end_session_endpoint`. |
| `nameClaimType` mismatch leaves `userDetails` empty | Verify against a real token in step 4 before frontend work. |

Steps 3 and 4 of the rollout reach both primary risks before anything is built
on top of them.

## 8. Rollout

1. Create the external tenant (**EU location**, Microsoft Entra admin center —
   the Azure portal cannot create external tenants). Link it to the
   subscription for billing. Record the tenant ID next to the existing
   subscription IDs; this is a *third* directory and the existing two already
   share the display name "Azure subscription 1".
2. Register the app; configure the sign-up/sign-in user flow with email +
   password. Add Google and Apple federation. Apply company branding.
3. **Create SWA `ebrostay-home`, Standard, in West Europe.** On refusal, fall
   back per §7.
4. **Prove the wiring with a real sign-in** before any UI work: custom OIDC
   config, `nameClaimType`, and the sign-out session behaviour.
5. Frontend changes (§5.2), sign-out fix and 401 override (§5.4), privacy
   policy rewrite in both locales (§5.6).
6. Re-seed Cosmos; re-invite the three admins.
7. Point the deployment workflow at the new app; verify end to end.
8. Delete SWA `ebrostay-v2` (East US 2). Delete the stale
   `azure-static-web-apps-thankful-sea-0e236161e.yml` from `main` — it targets
   the already-deleted West US 2 app. Leave `pages.yml` alone: it publishes
   production v1.
9. Amend the spec (§9).

## 9. Spec amendments

- **New ADR-027** — Entra External ID with email + password, Google and Apple.
  Supersedes ADR-013. Records the dropped providers and why.
- **Amend ADR-021** — West Europe retried on Standard, with the outcome. Also
  correct the record: `docs/spec-v2/01-architecture.md` states the v1 SWA
  `ebrostay-home` was in **westeurope**; it was in **West US 2**. The
  conclusion stands, but the stated evidence does not.
- **Rewrite §3.1** (providers and endpoints) and **§3.3** (admin invitations,
  now bound to `ebrostay` identities) of `docs/spec-v2/03-auth-and-roles.md`;
  update the §3.4 principal example.
- **Update the §1 resource table** in `docs/spec-v2/01-architecture.md`:
  regions, plan, and the note about the transatlantic data hop.
- **Add to `docs/spec-v2/07-legal-notes.md`** — Microsoft as a processor for
  authentication, the EU tenant location as the transfer basis, and the
  no-cookie-banner reasoning from §5.6 with the Application Insights caveat.
