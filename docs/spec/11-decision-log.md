# §11 — Decision log (ADRs)

> Baseline: as-built (branch `main`, 2026-06-25). Status tags: ✅ active · 🔜 planned/unwired · 🗑️ dormant-to-remove · 🐞 suspected bug · 🚫 out-of-scope (MVP).

This is the part ordinary specs omit: every significant decision **and its why**.
It is what makes a rebuild faithful to *intent*, not merely to code. The §10
acceptance criteria say what must pass; §11 says why the product is shaped that
way, so a future maintainer who wasn't present can understand each choice — and
reverse it deliberately rather than by accident.

Each entry uses a consistent ADR format: **Title · Status · Context · Decision ·
Rationale · Consequences**. Cross-references: data model §4; business rules §5;
functional spec §6; integrations §7; auth/security §8; acceptance criteria §10.

| ADR | Title | Status |
| --- | --- | --- |
| ADR-001 | No online payment; Stripe checkout removed | ✅ active |
| ADR-002 | Live booking = client-side mailto/WhatsApp MVP | ✅ active (Edge path 🔜) |
| ADR-003 | Stripe "paid bookings" path retained as dead code | 🗑️ dormant-to-remove |
| ADR-004 | Commission = 15% of rent, VAT incl., capped at one month | ✅ active |
| ADR-005 | Billed in whole months, end-date exclusive, min 1 | ✅ active |
| ADR-006 | Security via RLS + public anon key + Edge Functions | ✅ active |
| ADR-007 | Account deactivation (ban 100y), not deletion | ✅ active |
| ADR-008 | `bills_policy` supersedes legacy `bills_included` | ✅ active |
| ADR-009 | Static site + optional Supabase with sample-data fallback | ✅ active |
| ADR-010 | Bilingual ES/EN via in-page dictionary (no i18n framework) | ✅ active |

---

## ADR-001 — No online payment; Stripe checkout removed

- **Status:** ✅ active. (Supersedes the earlier card-checkout design.)
- **Context:** The original platform direction (and the old SDD §7, "Payment or
  request-to-book step") assumed an online card flow via Stripe. For a
  mid-term corporate rental operation — 1–11 month furnished stays, low volume,
  high per-stay value, manual vetting of tenants and contracts — taking a card
  charge at request time is the wrong model: prices shown are estimates, the real
  contract is negotiated, and the operator wants to vet each request before any
  money moves. Card processing also adds PCI surface, a PSP dependency, and
  chargeback exposure to an otherwise static, serverless site (ADR-006/-009).
- **Decision:** Remove online card payment entirely. The platform is **request,
  not checkout**. A guest sends a booking **request**; Ebrostay receives the stay
  details and fee estimate, reviews, and **confirms manually by email**. Every
  monetary figure in the UI is labelled an **estimate** (R-CORE-2). A future
  payment provider (Revolut Business, per README) may be wired later, but is out
  of scope of this baseline.
- **Rationale:** Matches the actual sales motion (manual confirmation), removes a
  whole class of compliance and integration risk, and keeps the front end static
  and serverless. Estimates avoid implying a binding price before the contract.
- **Consequences:**
  - No page may initiate a PSP redirect or charge (R-CORE-2 / §10.9).
  - The Stripe-era schema and views become dead code — see ADR-003.
  - The "live" booking action is a contact draft, not a transaction — see ADR-002.
  - Re-introducing payment is a deliberate, scoped project (start from the 🔜
    `request-booking` path in ADR-002, then add the PSP after manual confirmation,
    not at request time).

## ADR-002 — Live booking flow = client-side mailto/WhatsApp MVP; Edge Function path built but unwired

- **Status:** ✅ active for the MVP flow; the server path is 🔜 planned/unwired.
- **Context:** With payments removed (ADR-001), the booking action only needs to
  deliver a structured stay request to the operator. Two implementations exist in
  the tree: (a) a **client-side** flow on the property page that builds a
  normalized summary and opens `mailto:`/`wa.me`; and (b) a **server-side**
  `request-booking` Edge Function that recomputes pricing/availability, inserts a
  `booking_requests` row, and emails via Resend — backed by the `booking_requests`
  table and an admin "Requests" tab. Path (b) is complete but its entry point
  `requestBooking()` (`backend.js:281`) has **no caller**.
- **Decision:** The **authoritative live flow is the client-side mailto/WhatsApp
  MVP** (R-Prop-9). The Edge Function, `booking_requests` table, Resend team/
  customer emails, and admin "Requests" tab are **kept but left 🔜 unwired** as the
  spec-ready foundation for a later server-backed flow.
- **Rationale:** The MVP delivers the operator everything needed (property, dates,
  month count, itemized estimate, tenant list, disclaimer) with **zero backend
  dependency** — it works even in the sample-data fallback (ADR-009) and needs no
  auth, no Resend key, no Edge Function deploy. Shipping the simplest thing that
  captures a qualified lead beats wiring a server path before the operator's
  workflow is settled. The server path is retained (not deleted) because it is the
  intended next step and is cheap to keep.
- **Consequences:**
  - Booking CTAs stay **disabled until** both dates are chosen and ≥1 tenant name
    is entered; the email and WhatsApp channels share one summary (R-Prop-9).
  - The live flow writes **no** `booking_requests` row and sends **no** server
    email (§10.3).
  - `booking_requests` and the admin Requests tab render **empty** in staging
    (R-Adm-3); test them only as isolated unit/contract tests (§10.4), never E2E.
  - **Parity guard:** if/when the server path is wired, the client formula
    (R-Prop-5, ADR-004/-005) and the server formula (R-BReq-6) must be tested for
    agreement. See Open decision #3 and the expired-hold overlap question (#2).

## ADR-003 — Stripe "paid bookings" path is dormant-to-remove

- **Status:** 🗑️ dormant-to-remove.
- **Context:** Before ADR-001, a paid-booking model left a `bookings` table, a
  `booking.html`/`booking.js` detail page, "paid bookings" lists in the account and
  owner views, invoice links, a `customer_name` column, and `stripe_*` columns on
  `owner_payout_details`. None of it is reachable in the request model, but it
  still lives in the schema and front end as tech debt.
- **Decision:** Treat the entire Stripe/paid path as **dormant code slated for
  deletion**. It is **not a requirement**. Tests assert only that it is
  absent/empty in staging (R-Book-1, R-Adm-4, R-Own-2, R-Acc-2); no positive
  coverage is built.
- **Rationale:** Keeping dead, payment-shaped code is a liability: it confuses the
  data model, implies capabilities the product doesn't have, and risks a future
  contributor re-activating a path that contradicts ADR-001. Removing it is
  independent of keeping the 🔜 `booking_requests` machinery (ADR-002).
- **Consequences:**
  - Owner metrics derived from `bookings` (bookings count, gross revenue) are
    0/empty once removed (R-Own-2).
  - The removal scope is itemized but **not yet executed** — see Open decision #4
    (which lists `bookings` + RLS, `booking.html`/`booking.js`, the "paid" views,
    `customer_name`, and the `stripe_*` payout columns).
  - Until removed, staging tests must confirm these surfaces are empty rather than
    error.

## ADR-004 — Commission = 15% of rent, VAT included, capped at one month's rent

- **Status:** ✅ active.
- **Context:** The estimate shown to a guest must include Ebrostay's service fee.
  A flat percentage is simple to explain, but on long stays (up to 11 months) a
  raw 15% would balloon to a large multiple of a month's rent, which the operator
  considers unfair to the tenant and hard to justify.
- **Decision:** `commission = min(15% × rent, one month's rent)`, **VAT
  included**. When the 15% figure exceeds the one-month cap, the excess is
  presented as a **"commission discount"** line so the saving is visible rather
  than silently absorbed. `commission_eur` in the data model stores the capped
  value.
- **Rationale:** 15% is the headline rate; the one-month cap keeps the fee
  proportionate on long stays and is an easy, trust-building promise. Showing the
  discount line turns the cap into a marketing positive instead of a hidden rule.
- **Consequences:**
  - Commission **never exceeds one month's rent** (R-Prop-5 AC; R-BReq-6 must
    match — ADR-002 parity guard).
  - The client computation (`property.js`) and any future server computation
    (`request-booking`) must apply the cap identically (§5 parity note).
  - Total = rent + commission + deposit (ADR-005 supplies rent/months).

## ADR-005 — Billed in whole months, end-date exclusive, minimum 1

- **Status:** ✅ active.
- **Context:** Stays are quoted as a monthly rent, but real check-in/check-out
  dates rarely land on clean month boundaries. The billing unit and rounding rule
  must be unambiguous so the estimate is reproducible to the day, and so the 30-
  vs 31-day month edge cases don't drift.
- **Decision:** Bill in **whole months**, computed from the start date with the
  **end date exclusive**, **rounded up**, **minimum 1**. Concretely, start →
  start+N months = N months; e.g. 10 Jul→10 Aug = 1 month, 10 Jul→11 Aug = 2
  months. `rent = months × price_number`.
- **Rationale:** Whole-month billing matches how mid-term furnished rentals are
  actually contracted and priced. End-exclusive counting (start+N months = N) is
  the natural, calendar-correct interpretation and sidesteps off-by-one and
  30/31-day ambiguity. Round-up + min-1 guarantees a sane positive quote for any
  valid range, including same-day or sub-month selections.
- **Consequences:**
  - Drives every downstream number (rent → commission cap in ADR-004 → total).
  - Stays over 11 months trigger a **two-contract message** (`toolong` state,
    R-Prop-6); the end-date picker caps the max stay at 11 (R-Prop-7).
  - Client and server formulas must agree on the rounding and the exclusive end
    (R-Prop-5 / R-BReq-6; ADR-002 parity guard).

## ADR-006 — Security via RLS + public anon key + Edge Functions (no app server)

- **Status:** ✅ active.
- **Context:** The site is static and serverless (ADR-009). There is no
  application tier to enforce authorization; the Supabase **anon key ships in the
  client** by design. Something must still prevent anon/cross-tenant reads,
  self-escalation, and unauthorized writes.
- **Decision:** Make the **database the only real security boundary**. All access
  is enforced by **Row Level Security** policies on every table plus Storage, and
  by **Edge Functions** (and `security definer` RPCs) for privileged operations.
  Client-side gates (e.g. `getIsAdmin()`) are **cosmetic** — they shape the UI but
  grant nothing. Secrets (`RESEND_API_KEY`, `DEEPSEEK_API_KEY`, service-role key)
  live only in Supabase, never in served assets.
- **Rationale:** With a public anon key and no server, UI checks are trivially
  bypassable; only RLS/RPC enforcement at the data layer is sound. This keeps the
  hosting model static while still supporting accounts, ownership, and admin.
- **Consequences:**
  - Authorization must be tested **at the REST/RPC layer**, not the UI — the full
    negative-test matrix in §10.11 (anon reads, cross-tenant reads, non-admin
    write/RPC attempts).
  - Privileged actions go through guarded RPCs: `deactivate_my_account()`
    (ADR-007) and `admin_delete_user()` (server-side `is_admin()` check, R-RPC-2).
  - **Known gap:** the current Playwright suite mocks Supabase out, so RLS/auth is
    presently **uncovered** (§10.10). A real-backend security suite is required.
  - 🐞 One disclosure is open under this model: `availability_blocks.user_id` is
    world-readable (Open decision #1 / R-RLS-6).

## ADR-007 — Account deactivation (ban 100y) instead of deletion; admin-only hard delete

- **Status:** ✅ active.
- **Context:** A tenant may want to leave, but their records (stays, assigned
  blocks, history) are operationally and legally relevant to the operator. A hard
  self-delete would orphan or destroy that data and could be abused.
- **Decision:** A user-initiated "delete my account" is a **deactivation**:
  `deactivate_my_account()` sets `deactivated_at` and **bans the auth user for 100
  years**, blocking sign-in while **retaining records**. A true **hard delete** is
  **admin-only** via `admin_delete_user(uuid)`, which enforces `is_admin()`
  server-side and **refuses to delete an admin account**.
- **Rationale:** Deactivation satisfies the user's intent ("I can no longer sign
  in / be contacted") while preserving data the business needs and keeping the
  action reversible by an operator. Restricting irreversible deletion to admins —
  with a self-deletion guard for admins — prevents accidental or malicious data
  loss and privilege traps. A 100-year ban is a simple, durable way to express
  "disabled indefinitely" with Supabase's `banned_until`.
- **Consequences:**
  - Deactivation is a **two-click confirm** in the UI (R-Acc-4); afterward the
    account cannot sign in (R-RPC-1 / N-24).
  - `deactivate_my_account()` rejects anon callers; `admin_delete_user()` rejects
    non-admins and admin targets (R-RPC-2 / N-21–N-23).
  - Records persist; downstream reporting must tolerate deactivated users.

## ADR-008 — `bills_policy` column supersedes the legacy `bills_included` flag

- **Status:** ✅ active.
- **Context:** Utilities handling began as a boolean `bills_included`. Real
  mid-term listings need three states — utilities **included**, **capped** (an
  allowance, overage billed), or **excluded** — which a boolean cannot express.
- **Decision:** Introduce `bills_policy text` with values `included` / `capped` /
  `excluded` as the **authoritative** utilities field. It drives the badge, the
  conditions copy, and the "Gastos incluidos" quick filter
  (`bills_policy === 'included'`). The legacy `bills_included` boolean is **kept as
  a fallback** for older/seed data and should be maintained consistent with
  `bills_policy`.
- **Rationale:** Three states match how the operator actually contracts utilities;
  a boolean misrepresents capped listings. Keeping `bills_included` avoids a hard
  migration and preserves graceful degradation for legacy rows.
- **Consequences:**
  - The "Gastos incluidos" filter keys off `bills_policy === 'included'`, hiding
    `capped`/`excluded` homes (R-Home-5).
  - Seed/staging data must keep `bills_included` and `bills_policy` consistent
    (§4 data dictionary note).
  - A later cleanup could drop `bills_included` once all rows are migrated.

## ADR-009 — Static site + optional Supabase backend with sample-data graceful degradation

- **Status:** ✅ active.
- **Context:** The product had to ship and demo quickly, deploy on GitHub Pages,
  and survive a missing/misconfigured backend without breaking the browsing
  experience. It also needed a path to real data, accounts, and admin when ready.
- **Decision:** Build a **static front end** (plain HTML/CSS/vanilla JS, no build
  step) backed by an **optional Supabase** project. `backend.js: isConfigured()`
  detects whether `supabase-config.js` holds a valid URL + anon key; when not, the
  site runs **fully on built-in sample data** (`data.js`) — listings, search,
  filters, maps, and property pages all work; only persistence, accounts, and
  admin are unavailable (R-CORE-1).
- **Rationale:** Graceful degradation makes the site demoable and deployable with
  zero infrastructure, decouples front-end work from backend availability, and
  gives a clean seam to add the backend incrementally. No build step keeps hosting
  trivial (GitHub Pages) and the repo approachable.
- **Consequences:**
  - With `supabase-config.js` absent/invalid, the home grid renders the sample
    homes and no console error blocks rendering; account/admin show signed-out
    state (R-CORE-1 / §10.9).
  - The booking MVP (ADR-002) works in this fallback because it needs no backend.
  - The public anon key model (ADR-006) follows directly from there being no app
    server.
  - Deploy = push-to-`main` → GitHub Actions → Pages on `ebrostay.com` (R-NF-4).

## ADR-010 — Bilingual ES/EN via in-page dictionary (no i18n framework)

- **Status:** ✅ active.
- **Context:** ES/EN bilingual support is first-class (R-NF-3), but the site has
  **no build step** (ADR-009), so a conventional i18n framework / bundler-based
  message catalog is unavailable, and a heavy dependency would be disproportionate
  for two languages.
- **Decision:** Implement i18n with an **in-page translation dictionary** in
  `data.js` and `[data-i18n]` attributes on elements. Language is persisted in
  `localStorage[ebrostay-language]`, defaults to the browser language, and toggling
  re-renders all `[data-i18n]` text/attributes plus date pickers, `<title>`, and
  `og:`/`twitter:` meta — without a page reload.
- **Rationale:** A plain dictionary keeps the site dependency-free and
  build-free, fits two languages cleanly, and runs identically in the sample-data
  fallback. Driving translation off attributes keeps markup and copy together and
  makes coverage auditable (no string should render in only one language).
- **Consequences:**
  - Every user-facing string must exist in both ES and EN (R-NF-3); the toggle
    updates visible text, document title, and og:title, and survives reload
    (R-X-1).
  - Locale-specific formatting follows: price (ES `1.350 EUR` / EN `1,350 EUR`,
    R-X-2) and date (`es-ES` / `en-GB`, R-X-3).
  - Adding a third language is a dictionary extension, not a framework migration.

---

## Open decisions (intent pass needed)

The honest residue — items the code can't settle and that need a product-owner
ruling before the test plan (§10) is locked. These migrate from
`requirements.md §5`.

| # | Decision | Status | Question | Resolution path |
| --- | --- | --- | --- | --- |
| 1 | `availability_blocks.user_id` world-readable | 🐞 (R-RLS-6 / ADR-006) | The whole block row is anon-readable (R-RLS-2), so `user_id` leaks that a stay exists and the assigned user's uuid. Accept as a minor disclosure, or tighten the policy? | Either document-accept, or change the policy so anon `select` does not return `user_id` (e.g. a view, column-level RLS, or splitting the table). N-8 records current behavior until decided. |
| 2 | Expired-hold overlap semantics | 🐞 / 🔜 | The 🔜 `request-booking` overlap check (when activated) does not appear to exclude **expired holds**, while the client filters them out — a divergence. What are the intended hold semantics? | Decide before wiring §3.3 / §10.4; align client and server, then test under the ADR-002 parity guard. |
| 3 | Timeline to wire the Edge Function path (§3.3 / R-Adm-3) | 🔜 (ADR-002) | When (if) the server booking path is wired to the UI, R-BReq-* become active and the parity guard (R-Prop-5 ↔ R-BReq-6) applies. | On activation: enable the admin Requests tab, run the parity tests, resolve #2 first. |
| 4 | Removal scope of the Stripe path | 🗑️ (ADR-003) | Confirm deletion of: `bookings` table + RLS, `booking.html`/`booking.js`, the account/owner "paid" views, `customer_name`, and the `stripe_*` columns on `owner_payout_details`. | Execute the deletion as a scoped cleanup. Independent of keeping the 🔜 `booking_requests` machinery. |
| 5 | Confirm the bulk of §3 (Observed → Confirmed) | 🔎 | Most functional requirements are reverse-engineered (🔎 Observed); intent is unconfirmed. | A product-owner walkthrough confirming each as ✅ (or flagging 🐞) finishes the descriptive→prescriptive conversion. |
