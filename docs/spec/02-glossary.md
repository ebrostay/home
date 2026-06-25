# Ebrostay Reconstruction Spec — §2 Glossary & domain concepts

> Baseline: as-built (branch `main`, 2026-06-25). Status tags: ✅ active · 🔜 planned/unwired · 🗑️ dormant-to-remove · 🐞 suspected bug · 🚫 out-of-scope (MVP).

This section defines **every domain term** used elsewhere in the spec, so later
sections can use them unambiguously. The depth bar: **no term used in another section
is left undefined here.** Each entry gives a precise **definition**, **where it lives**
(data column and/or UI surface), and any **status** caveat. Numeric rules referenced
here (commission cap, billed-months rounding) are specified in full in
[§5 Business rules](05-business-rules.md); table/column details are in
[§4 Data model](04-data-model.md); access rules in [§8 Auth & security](08-auth-security.md).

Conventions: 🟢 anyone incl. anonymous · 👤 the authenticated owner of the row ·
🧑‍💼 property owner · 🛡️ admin · 🔧 service role (Edge Function, bypasses RLS).
Money is euros; `price_number` is whole euros, `*_eur numeric(10,2)` columns store
cents. Text suffixed `_es` / `_en` is the Spanish / English variant of one field.

---

## 2.1 Quick reference

| Term | One-line definition | Status |
| --- | --- | --- |
| [Stay](#stay) | A guest's occupancy of a property over a date range. | ✅ |
| [Booking request](#booking-request) | The MVP conversion event: a `mailto:`/WhatsApp draft with the stay summary; writes nothing. | ✅ |
| [Booking (paid)](#booking-paid) | A Stripe-paid reservation row. | 🗑️ |
| [Booking request *record*](#booking-request-record-server-side) | A server-written `booking_requests` row from the Edge Function. | 🔜 |
| [Availability block](#availability-block) | A date range when a property is **not** bookable (confirmed). | ✅ |
| [Hold](#hold-hold_expires_at) | A *temporary*, expiring block (`hold_expires_at` set). | 🔜 |
| [Assigned stay](#assigned-stay) | A block whose `user_id` ties it to a tenant — appears in "My stays". | ✅ |
| [Commission](#commission) | Ebrostay's fee: `min(15% of rent, one month's rent)`. | ✅ |
| [Commission discount](#commission-discount) | The capped-off excess, shown as a line item. | ✅ |
| [Deposit](#deposit) | Refundable security deposit added to the total. | ✅ |
| [Upfront rent](#upfront-rent) | Rent due at check-in, shown in the move-in cost box. | ✅ |
| [Billed months](#billed-months) | Whole months charged: round up, min 1, end exclusive, cap 11. | ✅ |
| [Bills policy](#bills_policy-utilities-policy) | `included` / `capped` / `excluded` utilities rule. | ✅ |
| [Property type](#property-type) | `apartment` / `room` / `home`. | ✅ |
| [Tenant](#tenant) | An authenticated guest user. | ✅ |
| [Owner](#owner) | A user flagged `is_owner` who owns listings. | ✅ |
| [Admin](#admin-operator) / Operator | A user flagged `is_admin`; runs the platform. | ✅ |
| [Published vs draft](#published-vs-draft-is_published) | `is_published` controls public visibility. | ✅ |
| [Favorite](#favorite) | A saved home (`favorites` row + localStorage). | 🚫 |
| [Inquiry](#inquiry) | A contact-form message; anyone inserts, admins read. | ✅ |
| [Owner lead](#owner-lead) | A "become a partner" application. | ✅ |
| [Guest info](#guest-info) | Tenant-only arrival details (WiFi, keys) in a separate table. | ✅ |

---

## Core booking concepts

### Stay

A guest's **occupancy of one property over a date range** (check-in → check-out). In
this product a stay is **mid-term**: between **1 and 11 billed months** (see
[Billed months](#billed-months)). "Stay" is the conceptual unit the whole product is
organized around; it is *not* a single table.

- **Where it lives in data:** a *confirmed* stay is represented as an
  [availability block](#availability-block) with a `user_id` (an
  [assigned stay](#assigned-stay)). The planned server pipeline also records a
  [`booking_requests`](#booking-request-record-server-side) row 🔜. The dormant Stripe
  path used the [`bookings`](#booking-paid) table 🗑️.
- **Where it appears in UI:** the property page booking widget (the in-progress stay
  being priced), the account **"My stays"** list (assigned blocks), and the estimate
  summary shown in the request draft.

### Booking request

**The live conversion event (✅, the MVP).** When a guest has chosen valid dates and
entered at least one tenant name on a property page, the widget builds **one shared
normalized summary** (property, dates, [billed months](#billed-months), itemized
estimate, tenant list, an "estimate only" disclaimer) and enables two channels:

- **Email** → opens a `mailto:` draft to `CONTACT_EMAIL` (`#bookingEmailButton`).
- **WhatsApp** → opens a `wa.me` link with the same text (`#bookingWhatsappButton`).

**Critically, this creates no database row and triggers no server email.** Ebrostay
receives the draft, reviews it, and confirms **manually by email**. Distinguish this
from the server-side [booking request *record*](#booking-request-record-server-side)
🔜, which is the unwired pipeline.

- **Where in data:** **nowhere** — the live request is purely a client-side draft.
- **Where in UI:** the booking widget on `property.html` / `property.js`; the two CTA
  buttons; the estimate box that feeds the summary.

### Booking request *record* (server-side)

🔜 **Planned / unwired.** A row in the **`booking_requests`** table, written **only**
by the **`request-booking` Edge Function** (🔧 service role) after it recomputes price,
commission, and availability server-side, then emails staff + guest via Resend. Columns
include `start_date`, `end_date`, `months`, `rent_eur`, `commission_eur`,
`deposit_eur`, `total_eur`, `tenant_names`, and a `status` lifecycle
(`new → contacted → confirmed / declined`).

`backend.js`'s `requestBooking()` is exported but **has no caller** — so the table, the
function, the Resend emails, and the admin **"Requests" tab** are all complete but
**unreachable from the UI**. This is the spec for *if/when* it is wired; a faithful
rebuild leaves it inert. See [§5](05-business-rules.md) (parity with the client
estimate) and [§7 Integrations](07-integrations.md).

### Booking (paid)

🗑️ **Dormant — to remove.** A row in the legacy **`bookings`** table representing a
**Stripe-paid** reservation, written only by a (now inactive) Stripe webhook. It
carries Stripe identifiers (`stripe_session_id`, `stripe_payment_intent`), invoice /
receipt links, `amount_eur`, `currency`, `customer_name`, and `status = 'paid'`.

Because [Principle 2 is "no online payment"](01-overview.md), this entire path is
abandoned tech debt: the table, **`booking.html` / `booking.js`**, the account/owner
"paid bookings" views, revenue metrics, and the `stripe_*` columns on
`owner_payout_details` are all to be deleted. A rebuild must **not** reproduce it.

---

## Availability concepts

### Availability block

A **date range during which a property is NOT bookable** — a confirmed stay, a manual
admin block (e.g. renovation), or a temporary [hold](#hold-hold_expires_at). One row in
the **`availability_blocks`** table per range.

- **Key columns:** `property_id`, `start_date` (inclusive), `end_date` (**inclusive** —
  the last blocked day), `note`, `user_id` (nullable — see
  [assigned stay](#assigned-stay)), `hold_expires_at` (nullable — see
  [hold](#hold-hold_expires_at)).
- **Overlap rule:** the `availability_no_overlap` GiST exclusion constraint forbids two
  **confirmed** blocks (`hold_expires_at IS NULL`) for the same property from
  overlapping, using `daterange(start_date, end_date, '[]')` (both ends inclusive).
  Holds are exempt from the constraint.
- **Where in UI:** the property calendar disables blocked dates (struck-through and
  unselectable); the admin property editor lists / adds / deletes blocks; the home and
  property filters exclude a property whose requested range overlaps a block.
- **Access:** 🟢 world-readable (so the calendar works logged-out); 🛡️ admin-only
  write. ⚠️ Because the whole row is public, `user_id` is also world-readable — a
  suspected disclosure issue, 🐞 (R-RLS-6, see [§8](08-auth-security.md)).

### Hold (`hold_expires_at`)

A **temporary, expiring** availability block. `hold_expires_at`:

- **`NULL`** → the block is **confirmed** (permanent until deleted); it counts as truly
  unavailable and is overlap-protected by the GiST constraint.
- **a future timestamp** → the block is a **hold**; it is **filtered out client-side
  once expired** and is **exempt** from the no-overlap constraint.

🔜 In practice holds are part of the planned pipeline — the live MVP flow never creates
holds (it writes nothing). Note the parity caveat in [§5](05-business-rules.md): the
client filters out expired holds, but the (unwired) server overlap check does **not**
appear to exclude them — a decision to make if the pipeline is ever activated.

### Assigned stay

An [availability block](#availability-block) whose **`user_id` is set**, tying that
date range to a specific [tenant](#tenant). This is how an admin **assigns a confirmed
stay to a guest** (the block doubles as both "unavailable" and "this person's stay").

- **Where in data:** `availability_blocks.user_id` (FK → `profiles`; set null if the
  profile is deleted).
- **Where in UI:** the account **"My stays"** list shows the signed-in user's assigned
  blocks (non-clickable cards). An assigned stay also unlocks that property's
  [guest info](#guest-info) for the tenant. Set via the admin property editor's
  "guest email" field when adding a block.

---

## Pricing concepts

> All formulas, edge cases (30- vs 31-day months), and worked examples are in
> [§5 Business rules](05-business-rules.md). The definitions below fix the vocabulary.

### Billed months

The number of **whole months charged** for a stay. Computed from the date range with
these rules: **count whole months from the start date, round up any partial month,
minimum 1, with the end date treated as exclusive** (start → start + N months = exactly
N months). The maximum is **hard-capped at 11**; a longer range triggers the
"two-contract" message and is not priced as a single stay.

- **Worked intuition:** 10 Jul → 10 Aug = **1** month; 10 Jul → 11 Aug = **2** months.
- **Where in data:** `months` (computed; written into `booking_requests.months` 🔜 /
  `bookings.months` 🗑️). Bounds come from `min_stay_months` (default 1) and
  `max_stay_months` (capped at 11) on `properties`.
- **Where in UI:** the property estimate box, the calendar's selectable end-date range,
  and the request summary.

### Commission

**Ebrostay's fee** on a stay — the platform's revenue. Defined as:

```
commission = min( 15% × rent , one month's rent )
where rent = billed_months × price_number
```

i.e. 15% of the full-stay rent, but **never more than a single month's rent**. The
capped-off excess is surfaced to the guest as a [commission discount](#commission-discount).

- **Where in data:** `commission_eur` on `booking_requests` 🔜 / (analogous in the
  client estimate). Driven by `price_number`.
- **Where in UI:** a line in the property estimate box and in the request summary.
- Computed in **two places** — `property.js` (client, ✅ authoritative for the live
  flow) and the `request-booking` Edge Function (🔜) — which must stay in **parity**
  (see [§5](05-business-rules.md)).

### Commission discount

The **presentational line item** for the amount the [commission](#commission) cap saved
the guest: when `15% × rent` would exceed one month's rent, the excess
(`15% × rent − one month's rent`) is shown as a "commission discount" so the guest sees
both the notional 15% and the capped charge.

- **Where in UI:** an estimate line on the property page (shown only when the cap
  bites, i.e. for longer stays). Not a stored column — derived at display time.

### Deposit

A **refundable security deposit** added to the stay total, returned at end of stay.
It is **not** platform revenue.

- **Where in data:** `properties.deposit_amount` (whole euros); copied to
  `booking_requests.deposit_eur` 🔜.
- **Where in UI:** an estimate line (`deposit = deposit_amount` when set), and part of
  the **"move-in cost"** box on the property page. Total = rent + commission + deposit.

### Upfront rent

The **rent due at check-in** (the first payment a tenant makes on arrival), shown for
transparency in the **"move-in cost"** box. Distinct from the deposit.

- **Where in data:** `properties.upfront_rent_eur` (whole euros).
- **Where in UI:** the move-in cost box on `property.html` itemizes
  `upfront rent + deposit`. Shown only when set.

---

## Property attributes

### `bills_policy` (utilities policy)

The **authoritative rule for who pays utilities**. One of:

| Value | Meaning |
| --- | --- |
| `included` | Utilities are included in the monthly rent (no extra). |
| `capped` | Utilities included **up to a monthly cap** (`utilities_cap_eur`); excess is billed to the tenant. |
| `excluded` | Utilities are **not** included; the tenant pays them separately. |

- **Where in data:** `properties.bills_policy` (NOT NULL, default `included`). The
  related cap is `utilities_cap_eur`. **Supersedes** the legacy boolean
  `bills_included`, which is still read only as a fallback (keep the two consistent in
  seed/staging data).
- **Where in UI:** drives the bills badge and conditions copy, and the **"Gastos
  incluidos"** quick filter — which matches only `bills_policy === 'included'`.

### Property type

The listing's **`type`**: one of **`apartment`**, **`room`**, or **`home`**. (The
older SDD / requirements sometimes say "house"; the enforced/stored value is `home`.)

- **Where in data:** `properties.type` (NOT NULL, default `apartment`).
- **Where in UI:** the property-type filter (with an "all" option), the listing card,
  and the property page.

### Published vs draft (`is_published`)

A property's **public visibility**. `is_published = true` → the listing is shown on the
public site (the *published* state). `is_published = false` → it is a **draft**:
hidden from the public site but still visible to admins and to the property's owner.
Unpublishing is the **soft-hide** (the row is never destroyed by it).

- **Where in data:** `properties.is_published` (NOT NULL, default `true`).
- **Where in UI:** the admin properties list (status chip + publish toggle). Enforced
  by RLS: 🟢 anon reads only `is_published = true`; 🛡️ admins read all; 🧑‍💼 owners
  read their own regardless ([§8](08-auth-security.md)).

### Favorite 🚫

> 🚫 **Out of scope for MVP (removed 2026-06-25).** The favorites / saved-homes feature (heart toggle, saved-only filter, `favorites` table sync, header *Guardados* link) has been removed from the MVP build. This section documents the deferred design only; none of it is wired in the current build.

A user's **saved home**. Toggling the heart on a card or property page adds/removes a
favorite.

- **Where in data:** the **`favorites`** table (composite PK `(user_id, property_id)`),
  **and** the browser's `localStorage[ebrostay-favorites]`. Signed-out favorites live
  only in localStorage; signing in **merges** local favorites with the backend set, and
  thereafter toggles write a `favorites` row.
- **Where in UI:** the heart toggle on listing cards and property pages; the
  **"saved only"** enhanced filter; the account "saved homes" surface.

---

## Lead / contact concepts

### Inquiry

A **contact-form message** from a prospective tenant (a general or
property-specific question). Anyone — including anonymous visitors — may **submit** one;
**only admins** may read them.

- **Where in data:** the **`inquiries`** table (`name`, `email`, `property` (free
  text), `message`, `language`, optional `user_id` if signed in).
- **Where in UI:** the home page inquiry/contact form; the property page "Contact" /
  empty-state CTAs. (Historically the form opened a `mailto:` draft; it now inserts an
  inquiry row.) Access: 🟢 anyone inserts (`with check (true)`), 🛡️ admins read.

### Owner lead

A **"become a partner" application** from a property owner who wants Ebrostay to manage
their home. Anyone may submit; only admins read.

- **Where in data:** the **`owner_leads`** table (`name`, `email`, `phone`, `city`,
  `units` (free text), `message`, optional `user_id`).
- **Where in UI:** the owner / partner acquisition form. Access: 🟢 anyone inserts, 🛡️
  admins read. (Distinct from the [owner portal](#owner), which is for users **already**
  flagged `is_owner`.)

### Guest info

**Tenant-only arrival details** for a property — WiFi name/password, key pickup
instructions, check-in/out times, emergency phone, and notes. Deliberately kept in a
**separate table** (`property_guest_info`, one row per property) so the sensitive
fields can be hidden by row policy rather than being on the public `properties` row
(RLS is per-row, not per-column).

- **Where in data:** the **`property_guest_info`** table (PK = `property_id`):
  `wifi_name`, `wifi_password`, `key_pickup`, `checkin_time`, `checkout_time`,
  `emergency_phone`, `notes`.
- **Where in UI:** shown to a tenant on their stay (account / booking surfaces);
  managed via the admin property editor's guest-info section.
- **Access:** 🛡️ admins manage; 👤 a tenant reads the row **only** for a property they
  have an [assigned stay](#assigned-stay) on (`availability_blocks.user_id =
  auth.uid()`). *(The legacy `bookings`-based branch of this read policy belongs to the
  🗑️ removed path.)*

---

## Actors / roles

> How each is identified and what it can do is enforced in
> [§8 Auth & security](08-auth-security.md); the product-level needs are in
> [§1.5 Target users](01-overview.md).

### Visitor

An **anonymous user** (no session). Can browse, search, filter, view property pages and
calendars, submit [inquiries](#inquiry) and [owner leads](#owner-lead), and send a live
[booking request](#booking-request) — all without an account.

### Tenant

An **authenticated guest user** — identified by an `auth.users` record plus a matching
**`profiles`** row (auto-created at signup by the `handle_new_user` trigger). Beyond
visitor abilities, a tenant gets device-synced [favorites](#favorite), a **"My stays"**
list of their [assigned stays](#assigned-stay) with [guest info](#guest-info), and
self-service **account deactivation** (`deactivate_my_account()` sets `deactivated_at`
and bans the auth user; records are retained).

### Owner

A user whose **`profiles.is_owner = true`** (admins also qualify). An owner owns one or
more listings (`properties.owner_id = their id`). They get the **owner / partner
portal**: their own properties (RLS-scoped) and a **payout / IBAN details** form
(`owner_payout_details`, which only they may read/write; admins are read-only). The
`is_owner` flag is set when an admin assigns a property to them. Distinct from an
[owner lead](#owner-lead), which is a *prospective* owner's application.

### Admin / operator

A user whose **`profiles.is_admin = true`** — the Ebrostay **operator** who runs the
platform. Gets the **admin panel** and **property editor**: full property CRUD,
publish/unpublish, [availability block](#availability-block) management (incl. assigning
stays), photo/floor-plan management, geocoding, the AI assistant, [guest info](#guest-info)
upsert, and reading [inquiries](#inquiry) / [owner leads](#owner-lead) / (planned 🔜)
[request records](#booking-request-record-server-side) / users.

**Important:** the JavaScript admin gate (`getIsAdmin()`) is **cosmetic** — it only
hides UI. The **real** boundary is server-side: Postgres RLS via the `is_admin()`
definer function, plus the `admin_delete_user()` RPC's internal `is_admin()` guard
([§8](08-auth-security.md)). `is_admin` is set manually in SQL and cannot be granted
from the browser (no client write policy on `profiles`).

### Service role

🔧 The **Edge Function** identity, which **bypasses RLS**. Used only server-side: it is
the only writer of the [booking request record](#booking-request-record-server-side) 🔜
(and was the only writer of the dormant [paid booking](#booking-paid) 🗑️). Its key
(service-role key) never reaches the client; see [§7](07-integrations.md) /
[§8](08-auth-security.md).
