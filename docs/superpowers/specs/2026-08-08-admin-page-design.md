# The admin surface — first version

> Design spec, 2026-08-08. Branch `redesign/v2`.
> Builds the surface `docs/spec/04-functional-flows.md` §4.5 has described
> since 2026-07-19 and marked "🔜 not yet built" ever since, plus the review
> obligations queued onto it by ADR-019 (amendment) and ADR-027.
> Decisions taken with the product owner on 2026-08-08 are marked **(PO)**.

## 1. Why

Nothing publishes a listing today. An owner can fill in a home, submit it, and
watch it sit in `pending_review` forever, because `pending_review → published`
is an admin act (§4.4, ADR-030) and **no admin page or endpoint exists**. The
host side is finished around a hole.

Three surfaces close it:

| Surface | Without it |
| --- | --- |
| Review queue | No listing can ever go live. |
| All-properties | Nobody can take a live listing down, or fix one, without a database console. |
| Users | §3.7 inverted v1's self-service deactivation into an admin control that has no control. |

## 2. Scope

**In scope (PO):** review queue with approve/reject, all-properties management
including **direct content editing**, and the users tab with
deactivate/reactivate. Both review signals — the ADR-019 photo-location check
and the ADR-027 live Catastro comparison — ship with the queue **(PO)**.

**Out of scope, and why:** the booking-request log viewer and the inquiries
viewer from §4.5. `POST /api/booking-requests` and `POST /api/inquiries` are
both 🔜; neither container has a writer, so both viewers would be tables of
nothing built against a shape no code has ever produced. They land with the
flows that fill them.

**Also out:** a stored audit trail. Admin writes are logged through `ILogger`
with the acting admin's `userId`, which is enough to answer "who took this
down" from Application Insights. A queryable audit container is a data-model
decision (§2), not a page, and inventing one here would freeze its shape
before anyone has asked it a question.

## 3. Routing and the gate

Four static routes, ids in the query string — the model `/host/manage` and
`/host/edit` already use, because `output: "export"` has no dynamic segments:

| Route | Holds |
| --- | --- |
| `/{locale}/admin/` | The queue. The reason anyone opens this section. |
| `/{locale}/admin/review/?id=` | One listing under review, in full, with both signal panels and Approve/Reject. |
| `/{locale}/admin/properties/` | Every listing in any status. |
| `/{locale}/admin/users/` | Every profile. |

**The gate is `components/admin/RequireAdmin.tsx`**, the sibling of
`RequireOwner`: it reads `useAuth()`, sends a signed-out visitor to
`signInPath(currentPath())` keeping their locale and destination, and renders a
plain "this account is not an admin" panel for a signed-in non-admin — not a
redirect, which would read as a bug to the one person most likely to hit it (an
admin signed in through the *other* door, §3.1).

The `staticwebapp.config.json` rules for `/es/admin/*` and `/en/admin/*` **stay**
and are extended with exact-path rules for `/es/admin` and `/en/admin`, so the
index is covered by the same cosmetic rule as its children. Per §3.5 these
rules are convenience only. **The boundary is `principal.IsAdmin` in every
function**, and the negative-test matrix in §7 is what proves it.

## 4. API

New file `api/Functions/AdminFunctions.cs`. **The routes are `staff/…`**: the
Functions host reserves the `admin/` prefix for its own management API and
refuses any function whose route template starts with it, whatever
`routePrefix` says — found by running the host on 2026-08-08, after which all
eight endpoints answered 404 with nothing in the log. The pages keep
`/{locale}/admin/…`.

Every function begins with the same
two lines — `ClientPrincipal.Parse`, then a new
`ProfileService.RequireAdminAsync`, which layers the role check on top of
`RequireActiveAsync` so a **deactivated admin is refused before the role is
read** (§3.7).

| Endpoint | Body | Answers |
| --- | --- | --- |
| `GET /api/staff/review-queue` | — | `AdminQueueItem[]`, `pending_review` only, **oldest first** — the queue is a waiting line, not a feed. |
| `GET /api/staff/properties` | — | `AdminPropertyRow[]`, every listing in every status, newest activity first. Filtering and search are client-side, like the public search: the whole set is small and one fetch beats five. |
| `GET /api/staff/properties/{id}` | — | `AdminPropertyDetail` — the review view's payload (§5). |
| `POST /api/staff/properties/{id}/approve` | — | `pending_review → published`, clears `reviewNote`. Any other source status is `409 not_in_review`. |
| `POST /api/staff/properties/{id}/reject` | `{ note }` **required** | `→ rejected`, stores `note` in the existing `PropertyDoc.ReviewNote`, which the owner's portfolio already renders. Empty or whitespace note is `400 note_required`. |
| `PUT /api/staff/properties/{id}/status` | `{ status }` | `published \| paused`. Takedown-with-a-reason is `reject`, which is the same act from a different starting status and already carries the note the owner needs. |
| `GET /api/staff/users` | — | `AdminUser[]`: profile fields plus a listing count per user, newest first. |
| `PUT /api/staff/users/{id}/deactivation` | `{ isDeactivated }` | Sets the §3.7 flag. `403 cannot_deactivate_self` — an admin locking themselves out of the API is not a state any endpoint here can undo. |

**Approve is not a status PUT.** Publishing is the one act with a precondition
about where the listing came from, and folding it into a general status setter
would let a reviewer publish a `draft` nobody has submitted.

### 4.1 Admin content editing (PO)

The all-properties tab links into the **existing** host editor and manage page
(`/host/edit?id=`, `/host/manage?id=`) rather than growing a second editor.
Duplicating nine wizard steps, the rich-text editor, the nearby picker and the
photo pipeline for a second audience is how two validations of the same field
come to disagree.

So the host endpoints become **role-aware about ownership**, in exactly one
place. `HostFunctions.LoadOwnedAsync(id, hostId)` becomes
`LoadWritableAsync(id, profile, isAdmin)`:

- The owner path is unchanged, character for character.
- An admin loads and writes **any** listing.
- A missing listing stays `404` for both.

Two consequences follow, and both are the point:

1. **An admin's content edit does not re-enter review** (§4.5, §2.2.1). The
   `if (doc.Status is "published" or "paused") → pending_review` rule in the
   content `PUT` runs only when the writer is the owner. An admin fixing a
   typo on a live listing must not take it out of search, and a reviewer
   correcting a listing they are about to approve must not send it to the back
   of their own queue.
2. **`GET /api/host/properties/{id}` answers an admin for any listing**, which
   is what lets the unchanged editor load one.

`POST /api/host/properties` (create) is **not** widened: it mints a listing
owned by the caller, which is correct for an admin who is also a host and
meaningless otherwise.

Every admin-acting-on-someone-else's-listing write logs
`admin {adminId} wrote {propertyId} owned by {hostId}` at information level.

## 5. The review view

`GET /api/staff/properties/{id}` returns the host detail projection **plus what
only an admin may see**: `hostId`, the host's display name, `cadastralRef`, the
declined suggestions (§2.2.4), and each photo's `capturedLat`/`capturedLng`/
`capturedAt`. `PropertyDoc.PropertyPhoto` carries a comment forbidding those
coordinates from any public projection — this is the one projection that
carries them, and `AdminPhoto` exists so the rule stays visible in the types.

The page renders the listing as the reviewer must read it — address, pin, price,
terms, description in both languages, every photo — and above it two panels.

### 5.1 Photo location (ADR-019 amendment)

Pure logic in `app/lib/review.ts`, unit-tested, no network:

| Reading | Rendered as |
| --- | --- |
| No coordinates | `—`. Never a warning. Most photos have none, and flagging absence teaches reviewers to ignore the column. |
| Within 1 km of the pin | Consistent. The radius is loose on purpose: indoor photos fall back to wifi positioning. |
| Beyond 1 km | Shown with its distance, plainly, no colour-coded verdict. |
| **Spread** — the largest distance between any two located photos | The strongest reading, and the reason the set is summarised rather than listed one photo at a time. |

The panel states in both languages that this is a signal and not a
verification: `exiftool` rewrites GPS in seconds.

### 5.2 Catastro (ADR-027)

Called **live, client-side, at review time**, through the existing
`app/lib/catastro.ts` `lookupCadastre()` — the same code the editor uses, which
already throttles, retries once, and needs no key. Nothing is stored: a stored
copy would be a copy the client reported.

Four comparisons, each shown as *what the register says* beside *what the
listing claims*, with no verdict attached:

| Signal | From | Compared with |
| --- | --- | --- |
| Use (`luso`) | record.use | Nothing — it is read on its own. `Comercial` or `Almacén-Estacionamiento` is probably not a home. |
| Built surface (`sfc`) | record.sizeM2 | `doc.sizeM2`, shown as a difference. `sfc` includes common areas and legitimately runs above what an owner measures inside. |
| Postcode (`dp`) | record.postcode | `doc.postcode`. |
| Position | parcel centroid | The listing pin, as a distance. |

`{ kind: "notFound" }` and `{ kind: "error" }` are different sentences, never
the same empty state. A listing with no `cadastralRef` renders the panel's
absence, not an error.

Where the owner has **declined** a suggestion for one of these fields, the
decline is shown beside the live answer as one line — "owner declined this on
28 Jul" — and never suppresses, resolves, or weighs against the signal (§4.5).

## 6. Look

A **dense working tool (PO)**: the site's colour, type and radius tokens, both
themes first-class, but tables rather than cards, small type, many rows on
screen, a sticky column header, and a tab strip across the four routes. It must
read as back-office. Nothing here is marketing, and a reviewer works through
twelve listings, not one.

Every string lives in a new `admin` namespace in `app/messages/es.json` **and**
`en.json` (§4.7). Money and dates go through the existing locale formatters.

## 7. Testing

| Layer | What it pins |
| --- | --- |
| `api/Ebrostay.Api.Tests` | The **negative matrix** §3.5 demands: anonymous → every admin endpoint (401); authenticated non-admin → every admin endpoint (403); deactivated admin → every admin endpoint (403, before the role check); non-owner non-admin → another user's listing through the host endpoints (404). Plus: approve from a non-`pending_review` status is 409, reject with a blank note is 400, self-deactivation is 403, and an **admin content write leaves `status` alone** while an owner's pushes it to `pending_review`. |
| `app/lib/review.test.ts` | Distance, the absent-coordinate case, spread across a set, and the Catastro comparisons — as pure functions over fixtures, so the numbers are checked without the network. |
| `app/e2e/pages.spec.ts` | All four new routes in `es` and `en`, through the existing guard, with an `adminMe` case flag (the sibling of `anonMe`) and new admin fixtures. The route-enumeration guard at the foot of that file fails if one is missing. |
| `npm run build` | Static export stays green. |

## 8. What this leaves for later

- The booking-request and inquiries viewers, with the flows that fill them.
- A queryable audit trail, if the logs turn out not to answer the question.
- Bulk actions in the queue. Twelve listings is not a bulk problem, and a
  "select all → approve" button is a way to publish something unread.
