# The account page and account closure — first version

> Design spec, 2026-08-08. Branch `redesign/v2`.
> Builds `/account`, the page `docs/spec/03-auth-and-roles.md` §3.7 already
> assumes exists, and the owner-initiated account-closure flow decided with the
> product owner in the same session.
> Decisions taken with the product owner on 2026-08-08 are marked **(PO)**.

## 1. Why

`components/site/AuthMenu.tsx:79` links every signed-in user to `/account`.
The route has never existed. `staticwebapp.config.json:73-82` gates
`/es/account/*` and `/en/account/*` to authenticated users, so the visitor
passes the auth check and lands on the 404 page. Opening your own account menu
and clicking the first item is a dead end for every user of the product.

§3.7 already assigns this page work — it is where `/.auth/purge/{provider}`
and support contact are meant to live — and §3.7's deferred "self-service
deletion" is the second half of what the product owner asked for.

## 2. Scope

**In scope (PO):**

- `/account` per §3.7: identity, the SWA purge link, support contact.
- Owner-initiated **account closure**: a request flag on the profile, which
  disables create and edit, and moves the owner's listings.
- **Cancel**, restoring the account and parking the listings in `paused`.
- The admin users tab showing who has requested closure.
- A new listing state, `closed`.

**Out of scope, deferred to their own ADR (PO):**

- **Hard delete.** §3.7 keeps records and never deletes them, preserving v1
  ADR-007 intent. Reversing that is a decision, not an endpoint. The admin
  "decides how to proceed" step is deliberately left unbuilt; this flow will be
  refined later **(PO)**.
- **Invoices and payments blocking a closure.** v2 has no invoice or payment
  concept at all — the Stripe path was not carried (ADR-016). There is nothing
  to query, so the rule is recorded here and dropped from the build **(PO)**.
- **A guest bookings or stays list on the page.** `bookingRequests` is empty
  until `POST /api/booking-requests` exists (§2.4), and tenant-assigned stays
  are explicitly not carried into v2 (§2.2.3). Revisit once the booking
  endpoint ships **(PO)**.

## 3. Data model

### 3.1 Profile

`ProfileDoc` (`api/Models/ProfileDoc.cs:6`) gains one nullable field:

```csharp
public string? DeletionRequestedAt { get; set; }   // ISO-8601, null = no request
```

A timestamp rather than a boolean: it is both the flag and the audit record, so
the admin can see how long a request has waited — the shape the review queue
already uses for `submittedAt`.

`IsDeactivated` is **not** reused. The two mean different things. Deactivation
is done to you by an admin and locks you out. A closure request is made by you
and must still let you reach your own account page to cancel it.

`MeResponse` gains the same field so the frontend can render the state.

### 3.2 The `closed` listing state

`closed` joins the status machine (`docs/spec/02-data-model.md:286`). It means
**visible to the public, but the owner is leaving**. It exists so a home whose
guest is mid-stay does not vanish from the site the moment its owner asks to
close their account.

## 4. State transitions

```
ACCOUNT           active ──request──▶ deleting ──cancel──▶ active
                                          └────▶ admin decides (deferred)

PROPERTY          on request              on cancel
  published   ──▶ closed         closed ──▶ paused ──reopen──▶ published
  pending_review ─▶ draft        draft  ──▶ (stays; owner resubmits)
  paused          ─▶ unchanged
  draft           ─▶ unchanged
  rejected        ─▶ unchanged
```

Per state, on a closure request:

| State | Action | Why |
| --- | --- | --- |
| `published` | → `closed` | The only state the public can see. |
| `pending_review` | → `draft` **(PO)** | Withdrawn from the queue, so no reviewer can approve a home for a departing owner. The owner resubmits if they cancel. |
| `paused` | unchanged | Already invisible and closed to requests. Moving it to `closed` would make it *more* visible. |
| `draft` | unchanged | Never public. |
| `rejected` | unchanged | Never public. |

On cancel, only `closed → paused` **(PO)**. The owner reopens each home
deliberately; nothing silently returns to search.

**Why only what moved, moves back.** A blanket "all listings → `paused`" on
cancel would push a `draft` into `paused`, and `paused → published` is an owner
action needing no review. That would publish a listing no reviewer ever saw —
the exact trap `02-data-model.md:300` records and narrows the transition to
prevent. Restoring only the listings that actually moved keeps that guard
intact.

## 5. The guard

`ProfileService.RequireActiveAsync` (`api/Services/ProfileService.cs:47`) is
unchanged. A sibling is added:

```
RequireWritableAsync = RequireActiveAsync
                     + refuse if DeletionRequestedAt is set
                     → 403 { "error": "deletion_requested" }
```

**Write endpoints call the new guard. Read endpoints keep the old one.** This
is the difference between "your account is closing" and "you are locked out":
the owner can still see their portfolio and their listings' states, but cannot
create or edit. `GET /api/me` is unaffected — `MeFunction` calls
`BootstrapAsync` directly and never passes through either guard.

## 6. Endpoints

| Endpoint | Does |
| --- | --- |
| `POST /api/account/closure` | Sets `DeletionRequestedAt`, applies the §4 request column to every listing where `hostId` is the caller. |
| `DELETE /api/account/closure` | Clears the flag, moves `closed → paused`. |

Both act only on the caller's own account — the id comes from
`x-ms-client-principal`, never from the body (§3.4). Both are **idempotent**:
the target state is a pure function of each listing's current state, so a
fan-out that fails halfway is safe to repeat. This matters because the writes
are not atomic across documents.

The fan-out queries `SELECT * FROM c WHERE c.hostId = @id`. Cross-partition,
but bounded — a host has a handful of listings, confirmed with the product
owner.

`GET /api/staff/users` gains a `deletionRequestedAt` field per row, and the
users tab shows it as a column.

## 7. Public read paths

Two places filter on `published` and both must accept `closed`:

- `api/Functions/PropertiesFunctions.cs:29` — the public list query.
- `api/Functions/PropertiesFunctions.cs:89` — the public detail.

Changing one and not the other is the failure mode of this whole change. A
`closed` listing would either disappear from search, or fall through to the
owner-preview branch and 404 for the public. Both paths get explicit tests
(§9).

## 8. Frontend

`app/app/[locale]/account/page.tsx`, a client component following the
`admin/page.tsx` pattern. A new `RequireSignedIn` gate modelled on
`components/admin/RequireAdmin.tsx`: signed out redirects to
`signInPath(currentPath())`, keeping locale and destination.

Three blocks:

1. **Identity** — name, provider, and the deactivated notice when the flag is
   set.
2. **Account closure** — request or cancel, behind a confirm step. When the
   account is `deleting`, the page states what that means: create and edit are
   disabled, listings have moved, an admin will follow up.
3. **Your data** — the `/.auth/purge/{provider}` link, described as revoking
   the sign-in connection and not as a delete, plus support contact at
   `info@ebrostay.com`.

ES and EN strings under `account.*`. Every user-facing string needs both.

**Route rule gap.** `staticwebapp.config.json:73-82` gates `/es/account/*` and
`/en/account/*` — the wildcard only, so the exact path `/es/account` carries no
rule. `/admin` got both the exact path and the wildcard on 2026-08-08. Account
should match. Cosmetic either way per §3.5, where the functions are the
boundary.

**Visual work.** The project's `frontend-design` skill applies when this page is
built. It is out of brainstorming's scope and belongs to the implementation
step.

## 9. Testing

| Layer | Covers |
| --- | --- |
| vitest | The §4 transition map as a pure function: all five states, on request and on cancel. |
| dotnet | `RequireWritableAsync` refuses a `deleting` account on write and permits reads; the fan-out is idempotent when re-run; cancel restores; one user cannot close another's account. |
| dotnet | `closed` listings are returned by the public list and the public detail (§7), asserted separately. |
| Playwright | Request closure, see the listings change, cancel. |

## 10. Consequences

- `closed` is a public-visible state, so anything that reasons about "is this
  listing live" must consider it, not just `published`. §7 is the known set
  today.
- The admin gains a signal with no action attached until the deferred ADR
  lands. A request will sit visible and unresolved. That is intended — the
  product owner will refine the flow later **(PO)**.
- An account in `deleting` keeps its `closed` listings public. Nothing can
  over-book them today because no booking endpoint exists; when one ships it
  must refuse a `closed` listing.
