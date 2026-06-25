# §10 — Acceptance criteria / test catalogue

> Baseline: as-built (branch `main`, 2026-06-25). Status tags: ✅ active · 🔜 planned/unwired · 🗑️ dormant-to-remove · 🐞 suspected bug · 🚫 out-of-scope (MVP).

This section is the verifiable pass/fail layer of the reconstruction spec: the
bridge from behavior (§6 Functional spec) and rules (§5 Business rules) to a
runnable end-to-end test plan. Every row is an AC-bearing requirement migrated
from `requirements.md` — an ID, the requirement, its status tag, and a concrete
acceptance criterion (the assertion a test makes). Cross-references: data model
and RLS detail in §4 / §8; pricing and filter algorithms in §5; per-screen
behavior in §6; the decisions behind the status tags in §11.

A tester should be able to derive the full E2E plan from §10.1–§10.9 (the
catalogue) using §10.10 (coverage map) for prioritization and §10.11 (RLS
negative cases) for the security suite.

## Status-tag legend (test semantics)

| Tag | Meaning | What the test plan does |
| --- | --- | --- |
| ✅ active | Confirmed desired behavior. | Assert it works end-to-end as a real requirement. |
| 🔜 planned/unwired | Code exists but is not reachable from the UI. | Do **not** assert end-to-end; optionally unit/contract-test the deployed unit in isolation. |
| 🗑️ dormant-to-remove | Abandoned (Stripe path); slated for deletion. | Assert it is **absent/empty** in staging; build no positive coverage. |
| 🐞 suspected bug | Looks wrong; needs an intent decision (§11 Open decisions). | Flag, don't enshrine; hold the test until intent is decided. |

> Items without a tag in `requirements.md` are 🔎 **Observed** (reverse-engineered,
> intent unconfirmed). They are testable against current behavior but provisional.
> Only the AI-assistant area (R-Edit-3, R-Edit-6) carries a residual 🔎 in the
> coverage map.

---

## 10.1 RLS / security & RPCs

The only real security boundary is the database (public anon key + RLS + Edge
Functions; no app server — see §11 ADR-006). The JS admin gate is cosmetic
(§6.5, R-Adm-1). These ACs must be asserted **at the REST/RPC layer**, not
through the UI. See §10.11 for the explicit negative-case matrix.

| ID | Requirement | Status | Acceptance criterion |
| --- | --- | --- | --- |
| R-RLS-1 | Anon reads only published properties; admins read all; owners read own; writes admin-only. | ✅ | Anon REST query for an unpublished property returns 0 rows; a non-admin `update properties set is_published` is rejected by RLS. |
| R-RLS-2 | Availability blocks world-readable; writable by admins only. | ✅ | Anon can `select` from `availability_blocks`; a non-admin `insert` is rejected. |
| R-RLS-3 | A user reads only their own profile; admins read all; no client may write a profile (no update policy). | ✅ | User A cannot `select` user B's profile; any client `update profiles set is_admin=true` is rejected (no self-escalation). |
| R-RLS-4 | A user reads/inserts/deletes only their own favorites. | 🚫 out-of-scope (MVP) | User A cannot read or delete user B's `favorites` row. |
| R-RLS-5 | Anyone (incl. anon) may insert an inquiry/owner lead; only admins read them. | ✅ | Anon `insert` into `inquiries` succeeds; anon `select` returns 0 rows; admin `select` returns the row. |
| R-RLS-6 | Availability blocks expose `user_id` publicly (whole row world-readable). | 🐞 | **Held pending decision** (§11 Open decisions #1). Once decided: either documented-accepted, or anon `select` must not return `user_id`. |
| R-RLS-7 | `owner_payout_details`: owner reads/writes only own row; admins read-only. | ✅ | Owner A cannot read owner B's IBAN; an admin `update` of an owner's payout row is rejected. |
| R-RLS-8 | `property_guest_info` (WiFi/key codes): admins manage; a user reads a row only for a property they have an assigned stay on (`availability_blocks.user_id = auth.uid()`). | ✅ | A user with no stay on property X gets 0 rows for X; a user with an assigned block on X reads exactly X's row. *(The `bookings`-based branch of the policy is part of the 🗑️ removed path.)* |
| R-RPC-1 | `deactivate_my_account()` — authenticated only; sets `deactivated_at`, bans the auth user (100y). Records retained. | ✅ | Calling it as anon errors; as a user it sets `deactivated_at` and blocks subsequent sign-in. |
| R-RPC-2 | `admin_delete_user(uuid)` — body enforces `is_admin()` server-side; refuses to delete an admin. | ✅ | A non-admin calling the RPC directly (bypassing the UI) gets `not allowed` and the target still exists; an admin deleting another admin gets `cannot delete an admin account`. |

> 🔜 `booking_requests` table & its RLS: exist and are correct but unreachable from
> the UI (§10.3 / §6.2 / §11 ADR-002). Not an active requirement.
> 🗑️ `bookings` table & its RLS: part of the removed Stripe path (§11 ADR-003).

## 10.2 Listings, search & filtering (Home)

Behavior in §6.1; predicates/sort keys in §5.

| ID | Requirement | Status | Acceptance criterion |
| --- | --- | --- | --- |
| R-Home-1 | One pipeline drives cards, the result count (`role="status"`), and map markers; the three always agree. | ✅ | After any filter/sort change, `#availabilityStatus` count == rendered cards == map markers. |
| R-Home-2 | Hero search: city fixed Zaragoza; check-in defaults today, check-out +1 month; guests 1–8 (default 2). Submit copies to filter panel, scrolls to `#search`, persists dates. | 🔎 | Submitting the hero form scrolls to `#search`, the filter panel shows the same dates/guests, and `localStorage[ebrostay-search-dates]` holds `{checkIn,checkOut,guests}`. |
| R-Home-3 | Filter predicate: type matches, `price_number ≤` budget (when set), `guests ≥` requested, all checked amenities present, check-in `≥ available_from`, requested range does not overlap any block. | 🔎 | For each clause, a property violating only that clause is excluded and an otherwise-identical passing property is included. |
| R-Home-4 | Check-out must be after check-in. | 🔎 | Check-out ≤ check-in shows the inline status message and does not re-run the search. |
| R-Home-5 | Quick filters: "Verificadas" (`checked`), "Gastos incluidos" (`bills_policy==='included'`), "Fianza" (`deposit_protected`); combinable (AND). | 🔎 | Enabling "Gastos incluidos" hides `capped`/`excluded` homes; two active quick filters apply jointly. |
| R-Home-6 | Sort: `best` (rating desc, price asc — default), `price` asc, `new` (isNew desc, then price asc). | 🔎 | Rendered card order matches the selected key for the sample set. |
| R-Home-7 | Enhanced filters (`enhance.js`): address text search across name/area/address/city/description; min bedrooms; min bathrooms; "saved only" (persisted, 🚫 out-of-scope (MVP)). | 🔎 | An address substring narrows cards+count+pins together; "saved only" (🚫 out-of-scope (MVP)) shows exactly the favorited set and survives reload. |
| R-Home-8 | Empty state: empty-state title/body + Contact and WhatsApp CTAs; all map pins cleared. | 🔎 | An over-constrained filter yields 0 cards, the empty state, and 0 markers. |
| R-Home-9 | Favorites: toggling persists to `localStorage[ebrostay-favorites]`; signed in it also syncs to the `favorites` table; on login backend favorites merge into local state. | 🚫 out-of-scope (MVP) | Signed-out toggle updates localStorage; signed-in toggle writes a `favorites` row; after logout→login the heart state reflects the DB. |
| R-Home-10 | Map: Leaflet + OSM; one price-labeled marker per filtered property; co-located stack; marker↔card highlight both ways; auto-fit on filter/sort change; Google-embed fallback if Leaflet absent. | 🔎 | Clicking a marker highlights its card and vice-versa; changing filters re-fits bounds. |

## 10.3 Property detail & booking request

Behavior in §6.2; pricing formula in §5 (and §11 ADR-004/-005). The live booking
flow is the client-side mailto/WhatsApp MVP (R-Prop-9); the Edge Function path is
🔜 unwired (§10.4).

| ID | Requirement | Status | Acceptance criterion |
| --- | --- | --- | --- |
| R-Prop-1 | Load by `?id=`. Missing/unpublished → explicit "no longer available" state, never a silent redirect. | ✅ | `?id=does-not-exist` renders the not-found state (with language switch), HTTP 200, no redirect. |
| R-Prop-2 | Gallery (carousel + lightbox); video CTA hidden when no `video_url` (else opens new tab, `rel="noopener"`); floor plans inline-zoom; amenities, specs, badges, Leaflet location map. | 🔎 | A property without `video_url` renders no video CTA; one with it links to the URL in a new tab. |
| R-Prop-3 | Conditions: conditionally show min/max stay, deposit, upfront rent, utilities cap, energy rating, beds, pet/smoking/couples/self-check-in; "move-in cost" box itemizes upfront rent + deposit when present. | 🔎 | Only fields that are set render a row; the move-in box equals upfront rent + deposit. |
| R-Prop-4 | Calendar: inline flatpickr (2 months desktop / 1 mobile), localized; min date = `max(today, available_from)`; all blocks disabled (inclusive) and shown struck-through. | 🔎 | A date inside a block is not selectable; the day before `available_from` is not selectable. |
| R-Prop-5 | Estimate (client side) — **authoritative live pricing** per the MVP decision. Billed months = whole months from start, rounded up, min 1, end exclusive; rent = months × `price_number`; commission = `min(15% × rent, one month's rent)` (excess shown as "commission discount"); deposit = `deposit_amount` when set; total = rent + commission + deposit. | ✅ | For 10 Jul→10 Aug, months=1; for 10 Jul→11 Aug, months=2; commission never exceeds one month's rent; total = rent + commission + deposit to the cent. |
| R-Prop-6 | Estimate states: `empty` (incomplete dates), `conflict` (overlaps a block), `toolong` (>11 months → two-contract message), `ok`. | 🔎 | Each state renders its designated message/markup for representative inputs. |
| R-Prop-7 | Stay limits: end-date picker min = start + `min_stay` (default 1); max = earlier of (start + max_stay, capped 11) and (day before next block). | 🔎 | With `min_stay=2`, an end date at start+1 month is not selectable; the max selectable end never crosses the next block. |
| R-Prop-8 | Date prefill: pre-selects from URL `?from`/`?to` or `localStorage[ebrostay-search-dates]`, only if still valid for the property. | 🔎 | A valid `?from/?to` pre-fills the widget; an invalid (conflicting) prefill is dropped, not forced. |
| R-Prop-9 | Request submission (MVP): channels (`#bookingEmailButton`, `#bookingWhatsappButton`) disabled until both dates chosen **and** ≥1 tenant name entered; both build one shared normalized summary; Email → `mailto:CONTACT_EMAIL`, WhatsApp → `wa.me`. No DB row, no server email by the live flow. | ✅ | With required fields empty the CTAs are `aria-disabled` and clicking toasts "missing fields"; once valid, the `mailto:`/`wa.me` hrefs contain the same dates, month count, total and tenant names; submitting creates **no** `booking_requests` row. |

## 10.4 🔜 PLANNED — Booking-request Edge Function

> Status: planned, not wired (§11 ADR-002). `requestBooking()` (`backend.js:281`) is
> exported but has **no caller** in the front end. The function, `booking_requests`,
> the Resend emails, and the admin "Requests" tab are complete but unreachable.
> Test only as **isolated unit/contract tests of the deployed function**, never as
> an E2E user flow.

| ID | Requirement | Status | Acceptance criterion |
| --- | --- | --- | --- |
| R-BReq-1 | Auth: requires a valid JWT; rejects (401) deactivated users. | 🔜 | Invoked without a JWT → 401; with a deactivated user's JWT → 401. |
| R-BReq-2 | Validation: requires `propertyId` + ISO `startDate`; accepts `endDate` or legacy `months` (1–11); rejects (400) end ≤ start. | 🔜 | Missing `propertyId`/`startDate` → 400; end ≤ start → 400; `months` outside 1–11 → 400. |
| R-BReq-3 | Property: 404 if missing/unpublished. | 🔜 | Unknown or unpublished `propertyId` → 404. |
| R-BReq-4 | Stay bounds: reject `max_stay`/`min_stay` outside `[max(1,min), min(11,max)]`. | 🔜 | A months value below the floor or above the cap → rejected. |
| R-BReq-5 | Availability: 409 if start < today, start < `available_from`, or range overlaps a block. | 🔜 | Past start, pre-`available_from` start, or block-overlapping range → 409. |
| R-BReq-6 | Pricing: same formula as R-Prop-5 (must stay in parity). | 🔜 | Server-computed `rent`/`commission`/`total` match R-Prop-5 outputs for identical inputs. |
| R-BReq-7 | Persist-first: insert the row before emailing; 500 only on insert failure; email failure never fails the request. | 🔜 | A row exists after a valid call even when email fails; only an insert failure yields 500. |
| R-BReq-8 | Email: team + customer email via Resend; missing key → `emailed:false`, row still saved; all HTML values escaped. | 🔜 | Without `RESEND_API_KEY`, response has `emailed:false` and the row persists; rendered email escapes all injected values. |
| R-BReq-9 | Response: `{ ok:true, emailed:<bool>, emailError?:<code> }`. | 🔜 | Successful call returns the documented shape. |

> ⚠️ **Parity guard** (§11 Open decisions #3): if this path is activated, R-Prop-5
> and R-BReq-6 MUST be tested for agreement (commission cap, 30/31-day rounding,
> deposit on/off). The overlap semantics for expired holds is unresolved (§11 Open
> decisions #2).

## 10.5 🗑️ REMOVE — Booking detail page

> Status: remove (§11 ADR-003). `booking.html` / `booking.js` load a **paid**
> booking via `loadBookingDetail()` (the `bookings` table), reachable only from the
> account "paid bookings" list — all Stripe path. **Not a requirement.**

| ID | Requirement | Status | Acceptance criterion |
| --- | --- | --- | --- |
| R-Book-1 | Booking-detail page and its data source. | 🗑️ | In staging the page is unreachable/empty (no paid bookings exist); no positive coverage is built. Candidate for deletion. |

## 10.6 Tenant account

Behavior in §6.3.

| ID | Requirement | Status | Acceptance criterion |
| --- | --- | --- | --- |
| R-Acc-1 | Signed-out → sign-in panel; signed-in → account panel with email. | ✅ | The correct panel renders per session state. |
| R-Acc-2 | Lists assigned stays (availability blocks with `user_id`, non-clickable). The separate "paid bookings" list is 🗑️ removed-path. | ✅ / 🗑️ | A user with an admin-assigned block sees it; the "paid" list is empty/removed in staging. |
| R-Acc-3 | Logout returns to home. | ✅ | Logout clears session and navigates to `index.html`. |
| R-Acc-4 | Deactivate uses a two-click confirm → `deactivate_my_account()` → redirect home. | ✅ | First click arms, second click deactivates; the account can no longer sign in. |

## 10.7 Owner / partner portal

Behavior in §6.4; payout RLS isolation cross-checks R-RLS-7.

| ID | Requirement | Status | Acceptance criterion |
| --- | --- | --- | --- |
| R-Own-1 | Routing: signed-out → login; signed-in non-owner → "not an owner yet"; owner/admin → dashboard. | ✅ | Each role lands on the right view. |
| R-Own-2 | Metrics: properties count, payout status (✓ when IBAN saved). Bookings count + gross revenue derive from the 🗑️ removed `bookings` table. | ✅ / 🗑️ | Properties count and payout ✓ are correct; revenue/bookings metrics are 0/empty once the Stripe path is removed. |
| R-Own-3 | Lists the owner's own properties (RLS). | ✅ | Owner sees only their `owner_id` properties; no foreign properties. |
| R-Own-4 | Payout form (holder, IBAN, bank, tax id, billing address, notes); IBAN uppercased + whitespace-stripped; prefilled from saved row; persisted via `saveOwnerPayout()`. | ✅ | Saving `es91 2100 …` stores `ES912100…`; reloading prefills it; another owner cannot read it (R-RLS-7). |

## 10.8 Admin panel & property editor

Behavior in §6.5 / §6.6.

| ID | Requirement | Status | Acceptance criterion |
| --- | --- | --- | --- |
| R-Adm-1 | Access: login unless signed in **and** `is_admin`; non-admin sees a "not admin" state. **Server RLS is the real gate; the JS gate is cosmetic.** | ✅ | UI hides admin tools from a non-admin; AND a non-admin REST/RPC call to an admin-only action is rejected server-side (see §10.11). |
| R-Adm-2 | Properties: list all with status chip + edit link; toggle publish; delete (two-click confirm, cascades + best-effort storage cleanup); add property (name → slug id → defaults → editor). | ✅ | Publish toggle flips `is_published` and re-renders; delete removes the row and its photos/blocks/favorites; add creates a row and opens the editor. |
| R-Adm-3 | Requests tab: reads `booking_requests` — empty because nothing writes it. | 🔜 | The tab renders empty in staging; no requirement to transition statuses until §10.4 is wired. |
| R-Adm-4 | Bookings tab: reads the removed `bookings` table. | 🗑️ | Empty/removed; no coverage. |
| R-Adm-5 | Users: list profiles (admin/deactivated chips); delete non-admin via `admin_delete_user` (two-click); admins cannot be deleted. | ✅ | Deleting a non-admin removes them; the delete control is absent/blocked for admin rows; server refuses an admin target (R-RPC-2). |
| R-Edit-1 | Editor access: requires admin + valid `?id`; else redirect to admin. | ✅ | A non-admin or missing id redirects. |
| R-Edit-2 | Details: edit all fields incl. bilingual texts (markdown subset), 14 amenity checkboxes, conditions, status flags; save persists and reloads from server. | ✅ | Edited values round-trip after reload; unchanged fields untouched. |
| R-Edit-3 | Geocoding: Nominatim "find address" (ES results prioritized), candidates + map preview, applies lat/lng + city; a changed address re-geocodes silently on save. | 🔎 | Resolving an address sets lat/lng and pin; saving a changed address updates coordinates. |
| R-Edit-4 | Owner: setting an owner email looks up the profile (case-insensitive), sets `owner_id`, flags `is_owner`; unknown email errors; empty clears the owner. | ✅ | A valid email assigns ownership and flips `is_owner`; an unknown email shows an error and leaves `owner_id` unchanged. |
| R-Edit-5 | Photos: multi-file upload; drag-reorder (renumbers `sort_order`); move left/right; delete (storage + db); Photos vs Floor-plans grids; first = cover. | ✅ | Upload adds a row + file; reorder changes `sort_order`; delete removes both the row and the storage object; the first Photos item is the cover. |
| R-Edit-6 | AI assistant: PDF text→OCR fallback (≤8 pages); image OCR; text files; or pasted text. Autofill calls `aiExtractProperty` (fills only empty fields), extracts embedded images, generates a description when none exists. Per-field ✦ translate + auto-translate via `aiTranslateField`. All AI paths degrade to `{ok:false, code:'not_configured'}` without the function / `DEEPSEEK_API_KEY`. | 🔎 | With the function configured, autofill populates empty fields only; without it, every AI action returns `not_configured` and the editor stays usable. |
| R-Edit-7 | Availability: edit "available from"; list/add/delete blocks; add requires `end_date ≥ start_date`; optional guest email assigns the block (unknown email errors). | ✅ | Adding a valid block inserts a row; `end < start` is rejected; a guest email sets `user_id`; an unknown email errors. |
| R-Edit-8 | Guest info: upsert one `property_guest_info` row per property. | ✅ | Saving creates/updates exactly one row keyed by `property_id`. |

## 10.9 Cross-cutting & non-functional

Conventions in §9; architecture/deploy in §3.

| ID | Requirement | Status | Acceptance criterion |
| --- | --- | --- | --- |
| R-X-1 | i18n: every page has an ES/EN toggle, persisted in `localStorage[ebrostay-language]`, defaulting to browser language; re-renders all `[data-i18n]` text/attributes, date pickers, `<title>`, and `og:`/`twitter:` meta. | ✅ | Toggling EN updates visible text, document title and og:title; the choice survives reload. |
| R-X-2 | Price format: ES `1.350 EUR`, EN `1,350 EUR`, no stray decimals on whole euros; card and detail prices match. | ✅ | The same property shows identically-formatted prices on card and detail per locale. |
| R-X-3 | Date format: ES `es-ES`, EN `en-GB`, day-month-year short. | ✅ | A known date renders in the locale's short form. |
| R-X-4 | Theme: dark/light follows `localStorage[ebrostay-theme]` then OS; consistent across pages. | ✅ | A stored theme overrides OS preference and persists across navigation. |
| R-X-5 | Auth dialog: opens via `#login`/`#auth`/`#authDialog`; modes signin/signup/reset/recover; SSO buttons appear only for enabled providers; post-auth returns to `ebrostay-return-to`. | ✅ | The hash opens the dialog and is stripped; an enabled provider shows its button; post-login returns to the saved URL. |
| R-X-6 | Nav by mode: header/footer nav adapts to tenant/owner/admin context; in-page anchors (`#search`, `#saved`, `#owner`, `#adminLogin`) all resolve. | ✅ | Every in-page hash link targets an existing element; owner/admin mode hides tenant-only nav. |
| R-X-7 | Analytics: Umami events for `search`, `inquiry-sent`, `booking-request` (with channel), `share`; no PII. | 🔎 | Each action fires its named event with only non-PII fields. |
| R-NF-1 | No build step; works as static files over HTTP. | ✅ | Serving the folder with a static server yields a fully working site. |
| R-NF-2 | Anon key is public; all protection is RLS + Edge Functions; secrets never reach the client. | ✅ | No secret appears in any served asset; RLS negative tests (R-RLS-*) pass. |
| R-NF-3 | Bilingual ES/EN is first-class. | ✅ | No user-facing string renders only in one language when the other is selected. |
| R-NF-4 | Deploy = push-to-`main` → GitHub Actions → Pages on `ebrostay.com`. | ✅ | A merge to `main` publishes the root to the custom domain. |
| R-CORE-1 | Graceful degradation: with Supabase unconfigured, the site runs fully on `data.js` sample data; only persistence/accounts/admin are unavailable. | ✅ | With `supabase-config.js` absent/invalid, the home grid renders the 4 sample homes, search/filter/map work, no console error blocks rendering; account/admin show signed-out state. |
| R-CORE-2 | No online payment: no card checkout; a guest sends a booking request, staff confirm manually; all money figures are estimates. | ✅ | No page initiates a payment/redirect to a PSP; every total is labelled an estimate (ES/EN); submitting a booking produces a contact draft, not a charge. |

---

## 10.10 Test-plan coverage map

Input to the plan, not the plan. "Real backend?" = requires a live (staging)
Supabase project rather than the mocked/sample-data path. **Key gap:** the
existing Playwright suite mocks Supabase out entirely, so every "Yes" row below —
auth, RLS, RPCs, admin mutations, owner isolation, favorites sync, deactivation —
is currently **uncovered**. Backend/auth/RLS coverage is a genuine hole, not a
regression risk in existing tests.

| Area | Status | Priority | Needs real backend? |
| --- | --- | --- | --- |
| Auth: signup → confirm → signin → signout | ✅ | High | Yes |
| RLS negative tests (R-RLS-*, R-RPC-2 at API layer) — see §10.11 | ✅ | High | Yes |
| Booking request (mailto/WhatsApp payload, disabled-until-valid) | ✅ | High | No (client only) |
| Client estimate correctness (R-Prop-5 edge cases) | ✅ | High | No |
| Admin: publish, add/delete property, photo upload | ✅ | High | Yes |
| Availability block add/delete + `end<start` reject | ✅ | High | Yes |
| Favorites sync (local ↔ backend) on login | 🚫 out-of-scope (MVP) | Medium | Yes |
| Owner: payout save + RLS isolation | ✅ | Medium | Yes |
| Inquiry + owner-lead insert (anon) + admin read | ✅ | Medium | Yes |
| Account deactivation + admin user delete (with teardown) | ✅ | Medium | Yes |
| AI assistant extract/translate | 🔎 | Low | Yes (+ `DEEPSEEK_API_KEY`) |
| i18n / price / theme / nav | ✅ | Covered | No |
| request-booking Edge Function (contract/unit only) | 🔜 | Low | Yes (isolated) |
| Stripe/paid path | 🗑️ | — | Assert empty only |

---

## 10.11 RLS negative-test cases (explicit)

The security suite that the current mocked Playwright tests cannot cover. Each
case is run with a **real Supabase client at the REST/RPC layer**, bypassing the
UI (the UI gate is cosmetic — R-Adm-1). A pass means the database rejects the
operation or returns zero rows; a failure is a privilege-escalation or
data-leak finding. Test identities needed: **anon** (no JWT), **userA** &
**userB** (two distinct authenticated tenants), **owner**A & **owner**B (two
distinct owners with payout rows), **admin**, and a **deactivated** user.

### Anonymous read cases

| # | Attempt (anon) | Expected | Maps to |
| --- | --- | --- | --- |
| N-1 | `select` an **unpublished** property | 0 rows | R-RLS-1 |
| N-2 | `select` from `profiles` | 0 rows | R-RLS-3 |
| N-3 | `select` from `favorites` | 0 rows | R-RLS-4 — 🚫 out-of-scope (MVP) |
| N-4 | `select` from `inquiries` | 0 rows | R-RLS-5 |
| N-5 | `select` from `owner_payout_details` | 0 rows | R-RLS-7 |
| N-6 | `select` from `property_guest_info` | 0 rows | R-RLS-8 |
| N-7 | `select` from `booking_requests` | 0 rows | 🔜 §10.4 |
| N-8 | `select` from `availability_blocks` | **rows returned**, and they **include `user_id`** | R-RLS-2 / 🐞 R-RLS-6 (flag; held per §11 Open #1) |

### Cross-tenant / cross-owner read cases

| # | Attempt | Expected | Maps to |
| --- | --- | --- | --- |
| N-9 | userA `select` userB's `profiles` row | 0 rows | R-RLS-3 |
| N-10 | userA `select` userB's `favorites` row | 0 rows | R-RLS-4 — 🚫 out-of-scope (MVP) |
| N-11 | ownerA `select` ownerB's `owner_payout_details` (IBAN) | 0 rows | R-RLS-7 |
| N-12 | userA (no stay on property X) `select` X's `property_guest_info` | 0 rows | R-RLS-8 |
| N-13 | non-admin user `select` `inquiries` | 0 rows | R-RLS-5 |
| N-14 | non-owner authenticated user `select` any `owner_payout_details` | 0 rows | R-RLS-7 |

### Non-admin / unauthorized write & RPC cases

| # | Attempt | Expected | Maps to |
| --- | --- | --- | --- |
| N-15 | non-admin `update properties set is_published=true` | rejected by RLS | R-RLS-1 |
| N-16 | non-admin `insert`/`update`/`delete` on `availability_blocks` | rejected by RLS | R-RLS-2 |
| N-17 | any client `update profiles set is_admin=true` (self-escalation) | rejected (no update policy) | R-RLS-3, R-NF-2 |
| N-18 | userA `delete`/`insert` userB's `favorites` row | rejected by RLS | R-RLS-4 — 🚫 out-of-scope (MVP) |
| N-19 | admin `update` of an owner's `owner_payout_details` (admins are read-only) | rejected by RLS | R-RLS-7 |
| N-20 | userA `update`/`insert` `property_guest_info` (admin-only manage) | rejected by RLS | R-RLS-8 |
| N-21 | anon `call deactivate_my_account()` | errors (authenticated only) | R-RPC-1 |
| N-22 | non-admin `call admin_delete_user(<userB>)` directly (bypassing UI) | `not allowed`; target still exists | R-RPC-2, R-Adm-1 |
| N-23 | admin `call admin_delete_user(<another admin>)` | `cannot delete an admin account` | R-RPC-2 |
| N-24 | deactivated user attempts sign-in / authenticated read | blocked (banned) | R-RPC-1 |
| N-25 | 🔜 unauthenticated `invoke request-booking` (no JWT) | 401 | R-BReq-1 (isolated only) |

> Reminder: N-8 deliberately documents the 🐞 R-RLS-6 disclosure. Do **not** assert
> a "fix" until §11 Open decisions #1 is resolved — the test records current
> behavior and flags the leak.
