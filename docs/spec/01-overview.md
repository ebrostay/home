# Ebrostay Reconstruction Spec — §1 Overview & goals

> Baseline: as-built (branch `main`, 2026-06-25). Status tags: ✅ active · 🔜 planned/unwired · 🗑️ dormant-to-remove · 🐞 suspected bug · 🚫 out-of-scope (MVP).

This section gives a new engineer or product manager everything needed to understand
**what Ebrostay is, the problem it solves, how it makes money, the two non-negotiable
principles that shape every other section, what is explicitly in and out of scope, and
who the users are.** No prior context is assumed. Vocabulary used here is defined
precisely in [§2 Glossary](02-glossary.md); the system shape is in
[§3 Architecture](03-architecture.md); the exact rules behind every number are in
[§5 Business rules](05-business-rules.md).

---

## 1.1 What Ebrostay is

**Ebrostay** is a **mid-term corporate rental platform** for **Zaragoza, Spain**. It
connects companies and relocating professionals with **verified, furnished,
move-in-ready homes** for stays of **1 to 11 months**, and offers property owners a
**fully hands-off management** service (Ebrostay presents the home, handles guest
operations, and pays the owner out).

The live product (`ebrostay.com`) is a **static website** — plain HTML, CSS, and
vanilla JavaScript with **no build step** — hosted on **GitHub Pages**. It is backed by
an **optional Supabase** project (Postgres + Row Level Security, Auth, Storage, Edge
Functions) for real listings, accounts, favorites, admin, and the planned
booking-request pipeline. The two halves are deliberately decoupled: see
[§1.3 Principle 1](#131-principle-1--graceful-degradation).

The reference product *category* is the online verified mid-term rental marketplace
(e.g. Spotahome): searchable furnished homes, filters, listing evidence, clear
availability, trust signals, and a request-to-book path. Ebrostay is an Ebrostay-owned
build inspired by that category — it does **not** copy any competitor's branding,
visual trade dress, copy, data, images, APIs, or proprietary workflows.

### The problem it solves

| Stakeholder | Pain today | What Ebrostay provides |
| --- | --- | --- |
| **Relocating professional / company** | Hotels are expensive for 1–11 month stays; long-term leases demand 12-month commitments, local guarantors, and unfurnished flats. Online listings rarely show *real* availability, true total cost, or move-in terms up front. | A curated set of verified, furnished, move-in-ready Zaragoza homes with transparent monthly price, an itemized cost estimate (rent + commission + deposit), real availability calendars, and a low-friction request. |
| **Property owner in Zaragoza** | Managing mid-term tenants (marketing, vetting, calendars, guest ops) is time-consuming; one-off corporate tenants are hard to reach. | Hands-off management: Ebrostay publishes and presents the home, coordinates guest operations, and pays the owner via stored payout (IBAN) details. |
| **Ebrostay operator** | Needs to keep listings, prices, availability, photos, and inquiries current without engineering for every change. | An admin panel and property editor to manage listings, availability, photos, geocoding, guest info, and AI-assisted data entry. |

---

## 1.2 Business model

Ebrostay is an **intermediary / managed-rental operator**, not a payment processor.

- **Product:** mid-term (**1–11 month**) furnished, move-in-ready corporate rentals in
  **Zaragoza**. (The marketing surface and README sometimes say "1–12 months"; the
  **enforced** maximum throughout pricing, calendars, and validation is **11 months** —
  stays of 12+ months are pushed to a two-contract conversation. See
  [§2 Glossary → billed months](02-glossary.md) and [§5 Business rules](05-business-rules.md).)
- **Revenue:** a **commission** on each confirmed stay, calculated as
  `min(15% of the full-stay rent, one month's rent)` (the cap is presented to the guest
  as a "commission discount" line). Exact formula and worked examples live in
  [§5 Business rules](05-business-rules.md); the term is defined in
  [§2 Glossary → commission](02-glossary.md).
- **No online payment.** There is **no card checkout**. A guest assembles a stay,
  sees an **estimated** total, and sends a **booking request**. Every money figure on
  the site is labelled an **estimate**. (A future payment provider — Revolut Business —
  may be wired in later, but is out of scope for this baseline.)
- **Manual confirmation.** Ebrostay staff receive the request **by email**, review it,
  and **confirm manually by email**. Confirmation is an operational, off-platform step;
  the system records nothing automatically for the live flow (see
  [§1.4 Scope](#14-scope)).
- **Deposit:** a separate **refundable deposit** (held, returned at end of stay) is
  shown in the estimate and the "move-in cost" box but is not platform revenue.
- **Owner payout:** owners are paid via stored **payout / IBAN details**; the platform
  retains its commission. (The earlier Stripe Connect payout columns are 🗑️
  dormant-to-remove.)

---

## 1.3 The two core principles

These two decisions are **baked into every other section**. A faithful rebuild that
violates either is wrong, regardless of feature parity.

### 1.3.1 Principle 1 — Graceful degradation (full sample-data fallback)

The front end runs **fully without a backend**. `backend.js`'s `isConfigured()` checks
whether a real Supabase URL + anon key are present in `supabase-config.js`. When they
are **absent or invalid**, the site falls back to the **built-in sample data** in
`data.js`: the four sample homes render; search, filtering, sorting, maps, and property
pages all work; only **persistence, accounts, and admin** are unavailable (account and
admin pages show their signed-out / unavailable states instead of erroring).

This is requirement **R-CORE-1** in [§10 Acceptance criteria](10-acceptance-tests.md)
and is the load-bearing reason the architecture is "static front end + *optional*
backend" ([§3 Architecture](03-architecture.md)). Consequences:

- The home grid, search, filters, and map must **never** depend on a live backend to
  render their first paint.
- No console error from a missing/invalid Supabase config may block rendering.
- Every data-access path in `backend.js` has a sample-data branch.

### 1.3.2 Principle 2 — No online payment

There is **no card checkout anywhere** in the product. The entire money surface is
**estimate-only**, and the live conversion event is a **booking request** that produces
a **contact draft** (email / WhatsApp), never a charge or a redirect to a payment
service provider. Staff confirm **manually by email**.

This is requirement **R-CORE-2** in [§10 Acceptance criteria](10-acceptance-tests.md).
It is *why*:

- the live booking flow is **client-side mailto / WhatsApp** (the MVP), and
- the Stripe "paid bookings" machinery is 🗑️ **dormant-to-remove** (see
  [§1.4 Scope](#14-scope) and [§11 Decision log](11-decision-log.md)).

---

## 1.4 Scope

### What the system DOES (✅ active)

- **Bilingual (ES/EN) UI** driven by an in-page translation dictionary, with persisted
  language choice, localized prices/dates, and translated `<title>`/social meta
  ([§9 Conventions](09-conventions.md)).
- **Listings, search & filtering** on the home page: hero search (city fixed to
  Zaragoza, dates, guests), a filter panel (type, budget, guests, amenities,
  available-from, date-overlap), enhanced filters (address text search, min
  bedrooms/bathrooms, saved-only 🚫 out-of-scope (MVP)), quick-filter chips, and three sort orders.
- **Result/map coherence:** one pipeline drives the listing cards, the result count,
  and the map markers — the three always agree.
- **Interactive maps** via Leaflet + OpenStreetMap, with price-labeled markers and
  card↔marker highlighting.
- 🚫 **(out of scope for MVP)** **Favorites** persisted to `localStorage`, and synced to the `favorites` table when
  signed in (local merges with backend on login).
- **Property detail pages:** photo gallery + lightbox, optional video CTA, floor plans,
  amenities, a rental-conditions table, a "move-in cost" box, a Leaflet location map,
  an availability calendar (flatpickr) that disables blocked dates, and a
  **booking-request widget**.
- **Live booking request (the MVP flow, ✅):** the guest picks dates + enters tenant
  name(s); the widget computes the **client-side estimate** (rent + commission +
  deposit) and enables **Email** (`mailto:`) and **WhatsApp** (`wa.me`) channels, each
  carrying the same normalized stay summary. **No database row and no server email are
  created by this live flow.**
- **Tenant accounts:** sign in / up / reset; a list of **assigned stays** (availability
  blocks assigned to the user); self-service **account deactivation**.
- **Owner / partner portal:** role-based routing; the owner's own properties; a
  **payout (IBAN) details** form.
- **Admin panel:** access-gated property management (list, publish toggle, add, delete
  with cascade), a users tab (list profiles; delete non-admins), and tabs that are
  currently inert (see below).
- **Admin property editor:** full property data entry incl. bilingual texts, amenities,
  conditions, status flags; **photo / floor-plan** upload, reorder, delete;
  **Nominatim geocoding**; an **AI assistant** (DeepSeek) for extract / translate /
  describe; **guest info** upsert; and **availability block** management.
- **Inquiries & owner leads:** anyone (incl. anonymous) can submit a contact inquiry or
  a "become a partner" owner lead; only admins read them.
- **Security via RLS:** the public anon key is intentionally public; **all** protection
  is Postgres Row Level Security + server-side Edge Functions ([§8 Auth & security](08-auth-security.md)).
- **SEO / AI readiness:** per-page meta + JSON-LD, `sitemap.xml`, `robots.txt`,
  `llms.txt`, PWA manifest.
- **Static deploy:** push to `main` → GitHub Actions → GitHub Pages on `ebrostay.com`.

### What the system does NOT do

- **No online payment / card checkout / PSP redirect** of any kind (Principle 2). All
  totals are estimates; confirmation is manual and off-platform.
- **No automatic booking record from the live flow.** The MVP booking request is a
  `mailto:` / `wa.me` draft only — it writes **nothing** to the database.
- **No instant booking / availability hold creation by guests.** Availability blocks
  and assigned stays are created **only by an admin**, manually, when accepting a
  request.
- **No tenant or owner editing of listings.** Listing writes are **admin-only** (RLS).
- **No client-side privilege escalation.** There is no client write policy on
  `profiles`; `is_admin` / `is_owner` cannot be set from the browser.
- **No multi-city coverage.** City is fixed to **Zaragoza** (the `city` field exists
  but only `zaragoza` is used).
- **No native mobile app.** It is a responsive static website (with a PWA manifest, not
  a packaged app).
- **No build / bundler / framework.** Vanilla JS over HTTP; this is a hard constraint
  (`R-NF-1`).
- 🚫 **No favorites / saved-homes (out of scope for MVP, removed 2026-06-25).** The
  heart toggle, the "saved only" filter, the `favorites` table sync, and the header
  *Guardados* link are **deferred out of the MVP build**. Their design is retained in
  the spec as a record only (see [§4.5 `favorites`](04-data-model.md), [§2 → Favorite](02-glossary.md)).

### Planned but not wired (🔜)

The **server-side booking-request pipeline** exists in code but is **unreachable from
the UI** and is therefore not active behavior:

- the **`request-booking` Edge Function** (computes price/commission/availability
  server-side, records a row, emails staff + guest via Resend),
- the **`booking_requests` table** (written only by that function),
- the **admin "Requests" tab** (reads `booking_requests`).

`backend.js`'s `requestBooking()` is exported but **has no caller**. These are
specified as the design for *if/when* this path is wired up (see
[§5](05-business-rules.md), [§7 Integrations](07-integrations.md)), but a faithful
rebuild leaves them **unwired**. The Resend integration is likewise currently 🔜
unwired in the live flow.

### Dormant — to remove (🗑️)

The **Stripe "paid bookings" path** is abandoned tech debt and should be deleted:

- the **`bookings` table** (and its Stripe webhook write path),
- **`booking.html` / `booking.js`** (the paid-booking detail page),
- the **account / owner "paid bookings" views**, gross-revenue / bookings-count
  metrics, and invoice links,
- the **`stripe_*` / `connect_status` columns** on `owner_payout_details`, the
  `customer_name` column, and related dormant fields.

A rebuild should **not** reproduce this path; tests assert it is absent/empty (see
[§10](10-acceptance-tests.md), [§11 Decision log](11-decision-log.md)).

---

## 1.5 Target users & what each needs

The four actors and how they are identified are defined precisely in
[§2 Glossary](02-glossary.md); the access each gets is enforced in
[§8 Auth & security](08-auth-security.md).

| Actor | Identified by | What they need from Ebrostay |
| --- | --- | --- |
| **Visitor** (anonymous) | no session | Browse, search and filter listings, view property pages and calendars, send inquiries, submit an owner lead, and send a **booking request** (mailto/WhatsApp) — all **without** an account. |
| **Tenant** (authenticated) | `auth.users` + `profiles` row | Everything a visitor can do, **plus**: ~~favorites that sync across devices~~ (🚫 out-of-scope (MVP)), a **"My stays"** list (their assigned availability blocks) with arrival/guest info, and the ability to **deactivate** their own account. |
| **Property owner** | `profiles.is_owner` (or admin) | The **owner portal**: see only their own properties (RLS-scoped) and capture **payout / IBAN details** so Ebrostay can pay them out. (Confidence that Ebrostay presents homes well and coordinates guest ops — the value proposition, fulfilled operationally.) |
| **Operator / admin** | `profiles.is_admin` | The **admin panel + property editor**: full CRUD on listings, publish/unpublish, availability blocks (and assigning a stay to a tenant), photo/floor-plan management, geocoding, AI-assisted data entry, guest info, and reading inquiries / owner leads / (planned) requests / users. **Server RLS is the real gate; the JS admin gate is cosmetic.** |

### What each user role needs, in product terms

- **Tenants** need to *decide before contacting*: real availability, the true **total**
  (rent + commission + refundable deposit) as a clear estimate, location, capacity,
  amenities, and move-in terms — then a one-click request via their preferred channel
  (email or WhatsApp), with no account required.
- **Property owners** need *trust and hands-off operation*: evidence Ebrostay presents
  their home well, plus a simple, secure way to provide payout details (their IBAN is
  readable only by themselves; admins are read-only — see
  [§8](08-auth-security.md)).
- **Operators / admins** need *fast, code-free content operations*: add and edit
  listings, manage availability and photos, geocode addresses, assign stays to tenants,
  and triage inbound inquiries/leads — with AI assistance to reduce manual data entry.

---

## 1.6 Cross-references

| For… | See |
| --- | --- |
| Precise definitions of every term used above | [§2 Glossary & domain concepts](02-glossary.md) |
| System shape, config, graceful-degradation mechanism, deploy | [§3 Architecture](03-architecture.md) |
| Tables, columns, relationships | [§4 Data model](04-data-model.md) |
| Pricing / commission / availability algorithms with worked examples | [§5 Business rules & algorithms](05-business-rules.md) |
| Screen-by-screen behavior and copy | [§6 Functional specification](06-functional-spec.md) |
| External integrations (Supabase, Resend 🔜, DeepSeek, Nominatim, Leaflet…) | [§7 Integrations](07-integrations.md) |
| Roles, RLS policies, RPCs, threat notes | [§8 Auth & security](08-auth-security.md) |
| i18n, theme, SEO, accessibility, copy conventions | [§9 Conventions](09-conventions.md) |
| Testable acceptance criteria (incl. R-CORE-1 / R-CORE-2) | [§10 Acceptance criteria](10-acceptance-tests.md) |
| Why each decision was made (no payment, MVP flow, Stripe removal…) | [§11 Decision log](11-decision-log.md) |
| Step-by-step rebuild | [§12 Rebuild checklist](12-rebuild-checklist.md) |
