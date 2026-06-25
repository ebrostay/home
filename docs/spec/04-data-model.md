# Ebrostay Reconstruction Spec — §4 Data Model
> Baseline: as-built (branch `main`, 2026-06-25). Status tags: ✅ active · 🔜 planned/unwired · 🗑️ dormant-to-remove · 🐞 suspected bug · 🚫 out-of-scope (MVP).

This section is the authoritative description of the Ebrostay persistence layer. It
covers every table in the `public` schema, the `property-photos` storage bucket, the
`auth.users` touchpoints, and all constraints, defaults, and relationships needed to
recreate `schema.sql` (plus the `upgrade-2026-06-*.sql` migrations) **exactly**.

Conventions:

- **PK** = primary key, **FK** = foreign key. "NOT NULL" means the column is required.
- Money columns are euros. `numeric(10,2)` stores cents precisely; `integer` columns
  store whole euros only.
- All `*_at` timestamps are `timestamptz` (UTC with offset).
- Text marked `_es` / `_en` is the Spanish / English version of the same field.
- Per-table **RLS summary** is one line here; the **full policy text lives in §8
  (Auth & security model)** — this section only names who reads/writes each table.
- RLS legend: 🟢 anyone incl. anonymous · 👤 the authenticated owner of the row ·
  🧑‍💼 property owner · 🛡️ admin · 🔧 service role (Edge Function, bypasses RLS).

> **Migration provenance.** The base `supabase/schema.sql` creates `properties`,
> `availability_blocks`, `profiles`, `favorites`, `bookings`, `inquiries`,
> `property_photos`, and the storage bucket. The tables `booking_requests`,
> `owner_leads`, `owner_payout_details`, `property_guest_info`, the
> `profiles.is_owner` and `properties.address` columns, the `availability_blocks`
> hold/`user_id` columns, the `bills_policy`/stay-detail columns, the
> `availability_no_overlap` GiST constraint, and the `owner_payout_details` /
> `property_guest_info` policies are layered on by `upgrade-2026-06-*.sql`. A
> from-scratch rebuild should apply all of them; the consolidated end-state is what
> this section documents.

---

## 4.1 Entity-relationship overview

All foreign keys at a glance. Cardinality is read "child → parent".

```
                         ┌──────────────────────┐
                         │     auth.users       │  (Supabase Auth, not in public)
                         │  id · email · banned │
                         └──────────┬───────────┘
                                    │ 1
              ┌─────────────────────┼──────────────────────────────┐
              │ (id = id)           │ (user_id)                     │ (user_id)
              ▼ 1:1 cascade         ▼ set null                      ▼ set null
        ┌───────────┐         ┌───────────┐                   ┌──────────────┐
        │ profiles  │         │ inquiries │                   │ favorites.*  │
        └─────┬─────┘         └───────────┘                   └──────┬───────┘
              │  (FK targets below point at profiles, except favorites/inquiries
              │   point straight at auth.users)
   ┌──────────┼───────────────┬───────────────┬────────────────┬──────────────┐
   │ owner_id │ owner_id (PK) │ user_id       │ user_id        │ user_id      │
   ▼          ▼               ▼               ▼                ▼              │
┌──────────┐ ┌────────────────┐ ┌───────────────┐ ┌──────────┐ ┌───────────┐ │
│properties│ │owner_payout_   │ │booking_       │ │ bookings │ │owner_leads│ │
│          │ │details (1:1)   │ │requests 🔜    │ │   🗑️     │ │           │ │
└────┬─────┘ └────────────────┘ └───────────────┘ └──────────┘ └───────────┘ │
     │ id (text slug)                                                          │
     │ ◄──────────────────────────────────────────────────────────────────────┘
     │ referenced by property_id from:
     ├─ availability_blocks  (property_id, cascade)   + user_id → profiles (set null)
     ├─ favorites            (property_id, cascade; user_id → auth.users)
     ├─ booking_requests     (property_id, set null) 🔜
     ├─ bookings             (property_id, set null) 🗑️
     ├─ property_photos      (property_id, cascade)
     └─ property_guest_info  (property_id, cascade, PK)
```

Relationship table (the definitive FK list):

| Child table | Column(s) | → Parent | On delete | Notes |
| --- | --- | --- | --- | --- |
| `profiles` | `id` (PK) | `auth.users(id)` | cascade | 1:1 mirror; created by `handle_new_user` trigger. |
| `properties` | `owner_id` | `profiles(id)` | (no action) | Nullable; assigns a listing to an owner portal. |
| `availability_blocks` | `property_id` | `properties(id)` | cascade | |
| `availability_blocks` | `user_id` | `profiles(id)` | set null | Tenant assigned to the stay; null = admin-only block. |
| `favorites` | `user_id` (PK part) | `auth.users(id)` | cascade | FK targets `auth.users`, **not** `profiles`. |
| `favorites` | `property_id` (PK part) | `properties(id)` | cascade | |
| `booking_requests` 🔜 | `user_id` | `profiles(id)` | set null | |
| `booking_requests` 🔜 | `property_id` | `properties(id)` | set null | |
| `bookings` 🗑️ | `user_id` | `profiles(id)` | set null | |
| `bookings` 🗑️ | `property_id` | `properties(id)` | set null | |
| `inquiries` | `user_id` | `auth.users(id)` | set null | FK targets `auth.users`, **not** `profiles`. |
| `owner_leads` | `user_id` | `profiles(id)` | set null | |
| `owner_payout_details` | `owner_id` (PK) | `profiles(id)` | cascade | 1:1 per owner. |
| `property_photos` | `property_id` | `properties(id)` | cascade | |
| `property_guest_info` | `property_id` (PK) | `properties(id)` | cascade | 1:1 per property. |
| `storage.objects` | `bucket_id = 'property-photos'` | (storage bucket) | — | Image files; metadata in `property_photos`. |

> **FK target gotcha:** `favorites.user_id` and `inquiries.user_id` reference
> `auth.users` directly, whereas every other user FK references `public.profiles`.
> This matters for cascade behavior and for joins. Reproduce exactly.

RLS summary (one line per table; full text in §8):

| Table | Who can READ | Who can WRITE |
| --- | --- | --- |
| `properties` | 🟢 published only · 🛡️ all · 🧑‍💼 own | 🛡️ only |
| `availability_blocks` | 🟢 everyone | 🛡️ only |
| `profiles` | 👤 own · 🛡️ all | 🔧 trigger / RPC only (no client write policy) |
| `favorites` | 👤 own | 👤 own (insert/delete) |
| `booking_requests` 🔜 | 👤 own · 🛡️ all | 🔧 insert (Edge Fn) · 🛡️ update (status) |
| `bookings` 🗑️ | 👤 own · 🛡️ all · 🧑‍💼 on own properties | 🔧 only (Stripe webhook) |
| `inquiries` | 🛡️ only | 🟢 anyone (insert) |
| `owner_leads` | 🛡️ only | 🟢 anyone (insert) |
| `owner_payout_details` | 👤/🧑‍💼 own · 🛡️ all | 🧑‍💼 own |
| `property_photos` | 🟢 everyone | 🛡️ only |
| `property_guest_info` | 🛡️ all · 👤 guest with a stay there | 🛡️ only |
| `storage.objects` (property-photos) | 🟢 everyone | 🛡️ only |

---

## 4.2 Table: `properties` ✅

One row per listing. PK is a human-readable text slug (not a uuid).

| Field | Type | Null? | Default | Description | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | text | NOT NULL | — | **PK.** Hand-made slug identifying the home; used in URLs (`property.html?id=…`). | `pedro1` |
| `city` | text | NOT NULL | `'zaragoza'` | City slug. Currently only Zaragoza. | `zaragoza` |
| `type` | text | NOT NULL | `'apartment'` | Listing type. One of `apartment`, `room`, `home`. | `apartment` |
| `address_key` | text | NOT NULL | — | Grouping key for buildings that share an address (used to stack map pins). | `pedro` |
| `address` | text | yes | — | Full street address, shown publicly and on invoices. Added later via migration. | `Pedro II el Católico 3, Zaragoza` |
| `lat` | double precision | NOT NULL | — | Latitude for the map pin. | `41.65393` |
| `lng` | double precision | NOT NULL | — | Longitude for the map pin. | `-0.90783` |
| `guests` | integer | NOT NULL | — | Maximum guest capacity. Used by the guest filter. | `4` |
| `price_label` | text | NOT NULL | — | Display string for the monthly price (raw, as authored). | `950 EUR` |
| `price_number` | integer | NOT NULL | — | Monthly rent in whole euros. **Drives all price math** (rent, commission, totals). | `950` |
| `price_note_es` | text | yes | — | Spanish footnote under the price (e.g. per-room option). | `o 450 EUR/habitación` |
| `price_note_en` | text | yes | — | English footnote under the price. | `or 450 EUR/room` |
| `rating` | numeric(2,1) | yes | — | Star rating 0.0–5.0 (one decimal). Shown only if set. | `4.8` |
| `available_from` | date | yes | — | Earliest move-in date. Bookings/searches before this are rejected. | `2026-07-01` |
| `is_new` | boolean | NOT NULL | `false` | "New" badge + used by the "new" sort. | `true` |
| `checked` | boolean | NOT NULL | `true` | "Verified" badge + the "Verificadas" quick filter. | `true` |
| `deposit_protected` | boolean | NOT NULL | `true` | "Refundable deposit" badge + the "Fianza" quick filter. | `true` |
| `bills_included` | boolean | NOT NULL | `true` | Legacy flag. Superseded by `bills_policy` but still read as a fallback. | `true` |
| `bills_policy` | text | NOT NULL | `'included'` | Authoritative utilities policy. `check (bills_policy in ('included','capped','excluded'))`. Drives badge, copy, and the "Gastos incluidos" filter. | `capped` |
| `amenities` | text[] | NOT NULL | `'{}'` | Array of amenity slugs. Known values: wifi, desk, balcony, lift, ac, heating, kitchen, terrace, washer, dishwasher, tv, microwave, oven, parking. | `{wifi,desk,lift,heating,kitchen}` |
| `name` | text | NOT NULL | — | Listing title (same for both languages). | `Pedro II el Católico 3 - 1 IZQ` |
| `area_es` / `area_en` | text | yes | — | Neighbourhood / area label, per language. | `Universidad - Pedro II el Católico` |
| `copy_es` / `copy_en` | text | yes | — | Short marketing description (markdown subset allowed). | `Piso amueblado en Pedro II…` |
| `details_es` / `details_en` | text | yes | — | Longer details paragraph (markdown subset allowed). | `Primero izquierda en una ubicación…` |
| `beds_es` / `beds_en` | text | yes | — | Free-text bed configuration, per language. | `1 cama doble + 1 sofá cama` |
| `bedrooms` | integer | yes | — | Number of bedrooms. Used by the min-bedrooms filter. | `3` |
| `bathrooms` | integer | yes | — | Number of bathrooms. Used by the min-bathrooms filter. | `1` |
| `size_m2` | integer | yes | — | Floor area in square metres. | `75` |
| `floor_number` | integer | yes | — | Floor the unit is on (`0` = ground floor). | `1` |
| `min_stay_months` | integer | yes | — | Minimum billable months. Enforced client- and server-side (default 1 if null). | `1` |
| `max_stay_months` | integer | yes | — | Maximum billable months (hard-capped at 11 regardless). | `11` |
| `deposit_amount` | integer | yes | — | Refundable deposit in whole euros; added to the booking total. | `950` |
| `upfront_rent_eur` | integer | yes | — | Upfront rent due at check-in, shown in the "move-in cost" box. | `950` |
| `utilities_cap_eur` | integer | yes | — | Monthly utilities allowance before excess is billed (the "capped" policy). | `50` |
| `pets_allowed` | boolean | yes | — | Pet policy. Shown in conditions table when set. | `false` |
| `smoking_allowed` | boolean | yes | — | Smoking policy. | `false` |
| `couples_allowed` | boolean | yes | — | Whether couples are accepted. | `true` |
| `self_checkin` | boolean | yes | — | Self check-in (e.g. lockbox) available. Shown only when true. | `true` |
| `energy_rating` | text | yes | — | Energy certificate letter `A`–`G` (or empty). | `C` |
| `video_url` | text | yes | — | Video tour link. The video CTA is hidden when empty. | `https://youtu.be/abc123` |
| `owner_id` | uuid | yes (FK→profiles) | — | The owner who can see this property in the owner portal. Null = unassigned. | `8f3c…` |
| `is_published` | boolean | NOT NULL | `true` | Visibility. `false` hides it from the public site (admins still see it). | `true` |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation time. | `2026-06-25T10:00:00Z` |

**RLS (summary; full text §8):** READ — 🟢 published rows, 🛡️ all, 🧑‍💼 own (`owner_id = auth.uid()`). WRITE — 🛡️ admins only; unpublishing is the soft-hide.

---

## 4.3 Table: `availability_blocks` ✅

Date ranges when a property is **not** bookable: confirmed stays, manual blocks, or
temporary holds. Also how an admin assigns a stay to a tenant ("Mis reservas").

| Field | Type | Null? | Default | Description | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK.** | `7a1b…` |
| `property_id` | text | NOT NULL (FK→properties) | — | Which property is blocked. Deletes cascade. | `pedro1` |
| `start_date` | date | NOT NULL | — | First blocked day (inclusive). | `2026-07-04` |
| `end_date` | date | NOT NULL | — | Last blocked day (inclusive). Must be `>= start_date`. | `2026-07-10` |
| `note` | text | yes | — | Optional admin note about the block. | `Reforma cocina` |
| `user_id` | uuid | yes (FK→profiles) | — | Tenant this stay is assigned to; null = admin-only block. Detaches (set null) if the profile is deleted. | `8f3c…` |
| `hold_expires_at` | timestamptz | yes | — | Null = **confirmed** block. A future timestamp = **temporary hold** (filtered out client-side once expired). | `2026-06-25T11:30:00Z` |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation time. | `2026-06-25T10:00:00Z` |

**Constraints:**

- `valid_range` — `check (end_date >= start_date)`.
- `availability_no_overlap` — **GiST exclusion constraint**: two *confirmed* blocks
  (`hold_expires_at IS NULL`) for the same property may not overlap. Defined on
  `daterange(start_date, end_date, '[]')` (inclusive of both ends) with `property_id`
  equality, partial `WHERE hold_expires_at IS NULL`. Requires the `btree_gist`
  extension. **Holds are exempt** (they can overlap each other and confirmed blocks).

**RLS (summary; full text §8):** READ — 🟢 everyone (`using (true)`), so blocked dates
render for logged-out visitors. WRITE — 🛡️ admins only; the booking-request flow does
**not** insert blocks — an admin creates them manually when accepting a request.

> 🐞 Because READ is public, `user_id` (which tenant a stay is assigned to) is
> world-readable — it exposes that *a* booking exists, though only as a uuid. Tracked
> as a security note in §8.

---

## 4.4 Table: `profiles` ✅

One row per registered user, auto-created on signup by the `handle_new_user` trigger.
PK equals the `auth.users` id.

| Field | Type | Null? | Default | Description | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | NOT NULL (FK→auth.users) | — | **PK** = the Supabase Auth user id. Deletes cascade. | `8f3c…` |
| `email` | text | yes | — | User's email, copied from `auth.users` at signup. | `tenant@example.com` |
| `is_admin` | boolean | NOT NULL | `false` | Grants admin panel + admin RLS. Set manually in SQL. | `false` |
| `is_owner` | boolean | NOT NULL | `false` | Grants the owner portal. Set when a property is assigned to them. (Added via migration.) | `true` |
| `deactivated_at` | timestamptz | yes | — | When the user self-deactivated. Non-null = account disabled (records kept). | `2026-06-20T09:00:00Z` |
| `created_at` | timestamptz | NOT NULL | `now()` | Profile creation time. | `2026-06-01T08:00:00Z` |

**RLS (summary; full text §8):** READ — 👤 own (`auth.uid() = id`), 🛡️ all. WRITE — **no
client write policy.** Rows are created by the `handle_new_user` trigger (🔧 security
definer); the only mutations are via security-definer RPCs (`deactivate_my_account()`,
`admin_delete_user()`). A user **cannot** edit their own profile (incl.
`is_admin`/`is_owner`) from the client — this is what blocks privilege escalation with
the public anon key.

---

## 4.5 Table: `favorites` 🚫

> 🚫 **Out of scope for MVP (removed 2026-06-25).** The favorites / saved-homes feature (heart toggle, saved-only filter, `favorites` table sync, header *Guardados* link) has been removed from the MVP build. This section documents the deferred design only; none of it is wired in the current build.

A user's saved homes. Composite PK `(user_id, property_id)` = one row per saved home.

| Field | Type | Null? | Default | Description | Example |
| --- | --- | --- | --- | --- | --- |
| `user_id` | uuid | NOT NULL (FK→auth.users) | — | Who saved it. Part of PK. Deletes cascade. | `8f3c…` |
| `property_id` | text | NOT NULL (FK→properties) | — | The saved property. Part of PK. Deletes cascade. | `movera1` |
| `created_at` | timestamptz | NOT NULL | `now()` | When it was saved. | `2026-06-25T10:00:00Z` |

**RLS (summary; full text §8):** READ — 👤 own only (`auth.uid() = user_id`); admins have
**no** read policy here. WRITE — 👤 own **insert** and **delete** only; no update policy
(toggling a favorite is an insert or a delete, never an update).

---

## 4.6 Table: `booking_requests` 🔜

> **STATUS: 🔜 planned / unwired.** This is the intended live booking record for the
> no-online-payment flow. Rows are written **only** by the `request-booking` Edge
> Function (service role), which computes fees server-side — but that path is **not
> currently wired into the UI** (the MVP booking flow uses mailto/WhatsApp). Keep the
> table and policies; treat the write path as planned, not active.

| Field | Type | Null? | Default | Description | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK.** | `c2d4…` |
| `user_id` | uuid | yes (FK→profiles) | — | The signed-in guest who made the request. Detaches if profile deleted. | `8f3c…` |
| `customer_email` | text | yes | — | Guest's email at request time (snapshot). | `guest@example.com` |
| `property_id` | text | yes (FK→properties) | — | Requested property. Detaches if property deleted. | `pedro1` |
| `property_name` | text | yes | — | Property name snapshot (survives later edits/deletes). | `Pedro II el Católico 3 - 1 IZQ` |
| `start_date` | date | NOT NULL | — | Requested check-in. | `2026-08-01` |
| `end_date` | date | NOT NULL | — | Requested check-out (exclusive). | `2026-10-01` |
| `months` | integer | yes | — | Billed whole months (server-computed). | `2` |
| `rent_eur` | numeric(10,2) | yes | — | months × `price_number`. | `1900.00` |
| `commission_eur` | numeric(10,2) | yes | — | `min(15% of rent, one month's rent)`. | `285.00` |
| `deposit_eur` | numeric(10,2) | yes | — | Refundable deposit (from `deposit_amount`). | `950.00` |
| `total_eur` | numeric(10,2) | yes | — | `rent + commission + deposit`. | `3135.00` |
| `tenant_names` | text | yes | — | Free text of tenant names (one per line), max ~800 chars. | `Jane Doe\nJohn Roe` |
| `status` | text | NOT NULL | `'new'` | Lifecycle. `new` → `contacted` → `confirmed` / `declined`. | `new` |
| `created_at` | timestamptz | NOT NULL | `now()` | When the request came in. | `2026-06-25T10:00:00Z` |

**RLS (summary; full text §8):** READ — 👤 own (`auth.uid() = user_id`), 🛡️ all. WRITE —
**no client insert policy.** Rows written exclusively by the `request-booking` Edge
Function (🔧 service role) after computing fees; 🛡️ admins may **update** (status
transitions). No delete policy.

---

## 4.7 Table: `bookings` 🗑️

> **STATUS: 🗑️ dormant — to remove.** Legacy table for *paid Stripe bookings*. Written
> only by the (currently inactive) Stripe webhook via service role; online payment has
> been removed from the product. Surfaced read-only in account/owner/admin views.
> Slated for removal in the rebuild — reproduce only if preserving the as-built schema.

| Field | Type | Null? | Default | Description | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK.** | `a1b2…` |
| `user_id` | uuid | yes (FK→profiles) | — | The paying user; detaches on profile delete. | `8f3c…` |
| `customer_email` | text | yes | — | Payer email snapshot. | `payer@example.com` |
| `customer_name` | text | yes | — | Payer name captured by Stripe Checkout. | `Jane Doe` |
| `property_id` | text | yes (FK→properties) | — | Booked property; detaches on delete. | `pedro1` |
| `property_name` | text | yes | — | Property name snapshot. | `Pedro II el Católico 3 - 1 IZQ` |
| `start_date` | date | NOT NULL | — | Check-in. | `2026-08-01` |
| `end_date` | date | NOT NULL | — | Check-out. | `2026-10-01` |
| `months` | integer | yes | — | Billed months. | `2` |
| `amount_eur` | numeric(10,2) | yes | — | Amount paid. | `3135.00` |
| `currency` | text | NOT NULL | `'eur'` | ISO currency code. | `eur` |
| `stripe_session_id` | text | yes (UNIQUE) | — | Stripe Checkout session id (idempotency key). | `cs_test_…` |
| `stripe_payment_intent` | text | yes | — | Stripe PaymentIntent id. | `pi_…` |
| `invoice_url` | text | yes | — | Hosted invoice page. | `https://…/invoice` |
| `invoice_pdf` | text | yes | — | Invoice PDF link. | `https://…/invoice.pdf` |
| `receipt_url` | text | yes | — | Payment receipt link. | `https://…/receipt` |
| `status` | text | NOT NULL | `'paid'` | Booking status. | `paid` |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation time. | `2026-06-25T10:00:00Z` |

**RLS (summary; full text §8):** READ — 👤 own, 🛡️ all, 🧑‍💼 owner of the property
(`exists` on `properties.owner_id = auth.uid()`). WRITE — 🔧 service role only (Stripe
webhook); no client policy. Currently dormant.

---

## 4.8 Table: `inquiries` ✅

Contact-form leads. Anyone (incl. anonymous) may insert; only admins read.

| Field | Type | Null? | Default | Description | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK.** | `d4e5…` |
| `name` | text | NOT NULL | — | Sender's name. | `Jane Doe` |
| `email` | text | NOT NULL | — | Sender's email (reply address). | `jane@example.com` |
| `property` | text | yes | — | Property/area the message is about (free text). | `Movera 7` |
| `message` | text | yes | — | The message body. | `¿Disponible en septiembre?` |
| `language` | text | yes | — | UI language when sent (`es`/`en`). | `es` |
| `user_id` | uuid | yes (FK→auth.users) | — | Set if a signed-in user sent it; else null. Detaches (set null) on user delete. | `8f3c…` |
| `created_at` | timestamptz | NOT NULL | `now()` | When it was sent. | `2026-06-25T10:00:00Z` |

**RLS (summary; full text §8):** READ — 🛡️ admins only (a sender cannot read back their
own inquiry). WRITE — 🟢 anyone, incl. anonymous, may **insert** (`with check (true)`).
No update/delete policy.

---

## 4.9 Table: `owner_leads` ✅

"Become a partner" applications from property owners. Anyone may insert; admins read.

| Field | Type | Null? | Default | Description | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK.** | `e5f6…` |
| `name` | text | NOT NULL | — | Owner's name. | `Carlos Pérez` |
| `email` | text | NOT NULL | — | Owner's email. | `carlos@example.com` |
| `phone` | text | yes | — | Contact phone. | `+34 600 123 456` |
| `city` | text | yes | — | City of the property/owner. | `Zaragoza` |
| `units` | text | yes | — | How many units they want to list (free text). | `2-3` |
| `message` | text | yes | — | Free-text message. | `Tengo dos pisos en Movera.` |
| `user_id` | uuid | yes (FK→profiles) | — | Set if submitted while signed in. | `8f3c…` |
| `created_at` | timestamptz | NOT NULL | `now()` | When it was submitted. | `2026-06-25T10:00:00Z` |

**RLS (summary; full text §8):** READ — 🛡️ admins only (applicant cannot read back their
own lead). WRITE — 🟢 anyone, incl. anonymous, may **insert** (`with check (true)`). No
update/delete policy.

---

## 4.10 Table: `owner_payout_details` ✅

Bank/payout details for an owner. PK = `owner_id` (one row per owner). Contains
sensitive financial data (IBAN, tax id); policy is deliberately tight.

| Field | Type | Null? | Default | Description | Example |
| --- | --- | --- | --- | --- | --- |
| `owner_id` | uuid | NOT NULL (FK→profiles) | — | **PK.** The owner these details belong to. Deletes cascade. | `8f3c…` |
| `account_holder` | text | yes | — | Name on the bank account. | `Carlos Pérez` |
| `iban` | text | yes | — | IBAN, stored uppercase with whitespace stripped. | `ES9121000418450200051332` |
| `bank_name` | text | yes | — | Bank name. | `CaixaBank` |
| `tax_id` | text | yes | — | Tax identifier (NIF/CIF/VAT). | `12345678Z` |
| `billing_address` | text | yes | — | Billing address for payouts/invoices. | `Calle Mayor 1, Zaragoza` |
| `payout_notes` | text | yes | — | Free-text notes about payouts. | `Pagar el día 5 de cada mes` |
| `stripe_account_id` | text | yes | — | Stripe Connect account id (dormant). | `acct_…` |
| `connect_status` | text | yes | — | Stripe Connect onboarding status (dormant). | `pending` |
| `updated_at` | timestamptz | NOT NULL | `now()` | Last update time. | `2026-06-25T10:00:00Z` |

**RLS (summary; full text §8):** READ — 🧑‍💼 own (`auth.uid() = owner_id`), 🛡️ all (admins
verify payout details). WRITE — 🧑‍💼 owner manages own row (`for all` with
`auth.uid() = owner_id`); admins are **read-only** here (they cannot edit an owner's
bank details).

---

## 4.11 Table: `property_photos` ✅

Image metadata; the files themselves live in the public `property-photos` storage
bucket. World-readable; admin-only write. Index `property_photos_property_idx` on
`(property_id, sort_order)`.

| Field | Type | Null? | Default | Description | Example |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK.** | `f6a7…` |
| `property_id` | text | NOT NULL (FK→properties) | — | Which property the photo belongs to. Deletes cascade. | `pedro1` |
| `storage_path` | text | NOT NULL | — | Path within the `property-photos` bucket; resolved to a public URL client-side. | `pedro1/1718000000-kitchen.jpg` |
| `sort_order` | integer | NOT NULL | `100` | Display order (ascending). Lowest = cover. Reorder renumbers to 10, 20, 30… | `10` |
| `is_floorplan` | boolean | NOT NULL | `false` | `true` = floor plan (shown in its own section, excluded from the gallery). | `false` |
| `created_at` | timestamptz | NOT NULL | `now()` | Upload time. | `2026-06-25T10:00:00Z` |

**RLS (summary; full text §8):** READ — 🟢 anyone (`using (true)`). WRITE — 🛡️ admins only
(`for all` with `is_admin()`). The image files follow the same rule (see §4.13).

---

## 4.12 Table: `property_guest_info` ✅

Tenant-only stay information, never shown in public search. PK = `property_id` (one row
per property). **This is the field-level-privacy table** — sensitive arrival details
(WiFi password, key codes) live here, separate from the public `properties` row,
precisely so they can be hidden by a row policy.

| Field | Type | Null? | Default | Description | Example |
| --- | --- | --- | --- | --- | --- |
| `property_id` | text | NOT NULL (FK→properties) | — | **PK.** The property this info is for. Deletes cascade. | `pedro1` |
| `wifi_name` | text | yes | — | WiFi network name (SSID). | `Ebrostay_Pedro1` |
| `wifi_password` | text | yes | — | WiFi password (shown to the guest in monospace). | `Zaragoza2026!` |
| `key_pickup` | text | yes | — | Key pickup / entry instructions. | `Lockbox junto a la puerta, código 4821` |
| `checkin_time` | text | yes | — | Check-in time (free text). | `15:00` |
| `checkout_time` | text | yes | — | Check-out time (free text). | `11:00` |
| `emergency_phone` | text | yes | — | Emergency contact phone (shown as a tel: link). | `+34 600 123 456` |
| `notes` | text | yes | — | Any extra arrival notes. | `Basura: contenedor verde en la esquina.` |
| `updated_at` | timestamptz | NOT NULL | `now()` | Last update time. | `2026-06-25T10:00:00Z` |

**RLS (summary; full text §8):** READ — 🛡️ admins read all; 👤 a guest reads the row
**only for a property they have a stay on** — an `exists` check against either
`bookings` (a paid booking) **or** `availability_blocks` (an admin-assigned stay) where
`user_id = auth.uid()`. A random logged-in user gets nothing back. WRITE — 🛡️ admins
only (`for all` with `is_admin()`).

---

## 4.13 Storage bucket: `property-photos` ✅

Not a table, but part of the data model. Public bucket
(`storage.buckets` row `id = name = 'property-photos'`, `public = true`) holding the
actual image files referenced by `property_photos.storage_path`. RLS policies are on
`storage.objects`, each scoped with `bucket_id = 'property-photos'`.

- **READ** — 🟢 anyone (`Public read property photos`, `using (bucket_id = 'property-photos')`). URLs are public.
- **WRITE** — 🛡️ admins only for insert, update, and delete (each policy ANDs
  `bucket_id = 'property-photos'` with `is_admin()`).

Full policy text in §8.

---

## 4.14 Auth-managed: `auth.users` touchpoints

`auth.users` is managed by Supabase Auth and lives outside the `public` schema. The app
touches it only indirectly:

- `profiles.id` mirrors `auth.users.id` (1:1; the signup trigger creates the profile).
- `favorites.user_id` and `inquiries.user_id` FK **directly** to `auth.users.id`.
- `deactivate_my_account()` sets `auth.users.banned_until` (= `now() + 100 years`).
- `admin_delete_user()` deletes the `auth.users` row (cascading to `profiles`).

Fields the app relies on: `id` (uuid), `email`, `banned_until`.

### Privileged functions (who may execute)

These `security definer` RPCs run with elevated rights, so their **`execute` grant** is
the access control — they are revoked from `public`/`anon` and granted narrowly. Full
bodies and security analysis are in §8.

| Function | Who may call | What it does |
| --- | --- | --- |
| `handle_new_user()` | trigger only (not callable) | Creates the `profiles` row at signup (`on conflict (id) do nothing`). Fires `after insert on auth.users`. |
| `is_admin()` | used inside policies | Returns whether the caller is an admin (`security definer`, `stable`; avoids RLS recursion). |
| `deactivate_my_account()` | 👤 authenticated | Sets own `deactivated_at` and bans own auth user 100 years. Raises if not signed in. |
| `admin_delete_user(uuid)` | 👤 authenticated, but **body checks `is_admin()`** | Hard-deletes a user; refuses if the target is an admin (`cannot delete an admin account`). |

> Note `admin_delete_user` is *granted* to all authenticated users but **guards itself**
> with an `is_admin()` check inside the body (raising `not allowed` otherwise) — worth
> an explicit negative test (§10).

---

## 4.15 Constraints & indexes summary (for an exact rebuild)

| Object | On table | Definition |
| --- | --- | --- |
| `properties_pkey` | `properties` | PK on `id` (text). |
| `bills_policy` CHECK | `properties` | `bills_policy in ('included','capped','excluded')`. |
| `valid_range` CHECK | `availability_blocks` | `end_date >= start_date`. |
| `availability_no_overlap` EXCLUDE | `availability_blocks` | GiST: `property_id WITH =`, `daterange(start_date,end_date,'[]') WITH &&`, `WHERE hold_expires_at IS NULL`. Needs `btree_gist`. |
| `favorites_pkey` | `favorites` | Composite PK `(user_id, property_id)`. |
| `profiles_pkey` | `profiles` | PK on `id`; FK → `auth.users(id)` cascade. |
| `owner_payout_details_pkey` | `owner_payout_details` | PK on `owner_id`. |
| `property_guest_info_pkey` | `property_guest_info` | PK on `property_id`. |
| `bookings_stripe_session_id_key` | `bookings` 🗑️ | UNIQUE on `stripe_session_id` (idempotency). |
| `property_photos_property_idx` | `property_photos` | INDEX on `(property_id, sort_order)`. |
| FK cascades | (various) | `cascade` on `properties`/`profiles` children listed in §4.1; `set null` on `*_id` snapshot FKs. |

---

## 4.16 Notes for the test plan

- **Money math lives in two places** (`property.js` client estimate and the
  `request-booking` Edge Function 🔜) but only the Edge Function writes the `*_eur`
  columns — assert those against the displayed estimate. (Algorithm parity: §5.)
- **Snapshot columns** (`property_name`, `customer_email`, etc. in `booking_requests` 🔜
  / `bookings` 🗑️) intentionally duplicate data so records survive property/account
  deletion. Tests should **not** expect them to update after edits.
- **`bills_included` vs `bills_policy`**: `bills_policy` is authoritative; `bills_included`
  is legacy. Seed/staging data should keep them consistent.
- **Holds vs confirmed blocks**: only `hold_expires_at IS NULL` rows are
  overlap-protected (by `availability_no_overlap`) and count as truly unavailable
  server-side. Expired holds are filtered client-side, not deleted.
- **FK-target divergence** (`favorites`/`inquiries` → `auth.users`; everything else →
  `profiles`): include a cascade test that deletes a user and checks both behaviors.
- **Negative RLS cases** (a random user reading `property_guest_info`,
  `admin_delete_user` against an admin, favorites cross-read) are enumerated in §10
  with full policy reasoning in §8.
