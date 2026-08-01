# Ebrostay v2 Target Spec — §8 Rules carried from v1

> Added 2026-08-01, when the v1 spec (`docs/spec/` §00–§12) was retired from
> this branch. Everything v2 still consumes that previously lived only in the
> v1 spec is restated here, adapted to v2 naming (day-based stays, `description`,
> `billsPolicy`, the single §2.2.3 overlap predicate). The full v1 spec remains
> on `main` (which still serves production ebrostay.com) and in git history.
> Superseded v1 rules are **not** reproduced — the v1→v2 disposition table at
> the end says where each v1 section went.

---

## 8.1 Requirement IDs still cited by this spec

v1 assigned IDs to its acceptance criteria (v1 §10). v2 files cite a handful
of them as shorthand; their definitions, unchanged in intent:

| ID | Requirement |
| --- | --- |
| **R-CORE-2** | No online payment: no card checkout, no PSP redirect; a guest sends a booking *request*, staff confirm manually; **every money figure is labelled an estimate** in both languages. (ADR-001, in force.) |
| **R-NF-3** | Bilingual ES/EN is first-class: no user-facing string renders in only one language. (v2 §4.7 restates the mechanics.) |
| **R-Home-1** | One pipeline drives the result cards, the result count, and the map markers — the three always agree. |
| **R-Home-10** | Map: Leaflet + OSM; one price-labeled marker per filtered property; marker↔card highlight works both ways; bounds re-fit on filter change. |
| **R-Prop-9** | The booking CTAs are disabled until the estimate is `ok` **and** ≥1 tenant name is entered; both channels build **one shared normalized summary**; Email → `mailto:` draft, WhatsApp → `wa.me` draft. (§8.3 below.) |
| **R-X-2** | Price format: ES `1.350 EUR`, EN `1,350 EUR`; no stray decimals on whole euros; the same property shows identically formatted prices on card and detail. |

## 8.2 Money & date formatting ✅ (v1 §5.1.3 + R-X-2, carried verbatim)

- **Grouping:** ES groups thousands with `.` (`14.850 EUR`), EN with `,`
  (`14,850 EUR`). Force grouping (`useGrouping: "always"`) — `es-ES` alone
  does not group 4-digit numbers, and `1.350` is required (R-X-2).
- **Decimals:** none on whole euros; cents only when present
  (`427,50 EUR` / `427.50 EUR`).
- **Settlement:** money is settled to cents; instalments round independently
  and the **last** instalment absorbs the remainder so the schedule always
  sums to the quoted total (ADR-023 point 6).
- **Dates:** `es-ES` / `en-GB` formatting per locale; short month labels are
  the 3-letter localized forms with periods stripped (§6.4).

## 8.3 The booking draft summary ✅ (v1 06a R-Prop-9, carried; content per ADR-023/026)

Both request channels render **one shared normalized summary** in the user's
UI locale (`components/detail/BookingPanel.tsx`):

- **Channels, carried verbatim from v1:** email → `mailto:info@ebrostay.com`
  with a translated subject naming the property; WhatsApp →
  `https://wa.me/34678715418?text=…` with `*bold*` markers on the header and
  total. The message **is** the request — no payment (R-CORE-2).
- **Content:** header/footer lines, property name and area, move-in →
  move-out dates, **stay length in days** (never "nights" — ADR-026; v1
  quoted billed months, superseded by ADR-023), the itemized estimate (rent
  as `N days × rate`, commission with any cap discount, deposit, cleaning
  fee, total), tenant names, and the estimate disclaimer.
- **Gating:** CTAs stay `aria-disabled` until the estimate status is `ok`
  **and** ≥1 tenant name is present; an invalid click toasts
  "missing fields" and never navigates.
- 🔜 When `POST /api/booking-requests` lands (§4.3), the summary is built
  **from the server estimate** after logging; today it is built client-side
  (the log-then-draft upgrade is the ADR-015 delta, not a format change).
- **Analytics:** a valid click fires the `booking-request`
  `{ property, channel }` event (§8.4.4).

## 8.4 Integrations carried from v1 (v1 §7)

### 8.4.1 Nominatim geocoding (v1 §7.4) ✅

Client-direct, no key: `GET https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=10&accept-language={es|en}&q={query}`
(`app/lib/geocode.ts`).

- **Spain-prioritized:** results with `country_code === "es"` rank first;
  stable sort preserves Nominatim's relevance within each group.
- **Query loosening:** try the query as typed (appending
  `", Zaragoza, España"` when unlocated), then with digits removed, then with
  street-type words stripped (`calle`, `c/`, `avenida`, `paseo`, `plaza`, …).
  De-duplicate by `place_id`.
- **v2 posture change:** a geocode result only ever **fills an empty field or
  offers** — it never overwrites a stored value, including the pin (ADR-027
  Decision 4b + amendment). v1 wrote results straight into the form.
- **Usage policy:** Nominatim expects identification and **≤ 1 req/s** — v1
  noted this as unmet; v2 meets it via `lib/throttle.ts` (one shared
  implementation, also instanced for the Catastro — ADR-027).

### 8.4.2 Leaflet + OpenStreetMap (v1 §7.5) ✅

Tiles `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (`maxZoom` 19), standard
OSM attribution, no key. Price-labeled `divIcon` markers, marker↔card
highlighting both ways, bounds re-fit on filter change (R-Home-10). Used by
the results map, the detail/neighbourhood maps, and the editor's
`LocationPicker`. v1's **Google-embed fallback** (an iframe keyed to the two
seed `addressKey`s, shown when Leaflet failed to load) is 🗑️ **not carried**
— it only ever covered seed addresses, and ADR-017 dropped the
degraded-mode posture it belonged to.

### 8.4.3 DeepSeek AI assistant (v1 §7.3) — reference for the 🔜 ADR-020 port

The v1 behaviour the C# port (§4.6) must reproduce:

| `action` | Request | Response |
| --- | --- | --- |
| `translate` | `{ action, text, source, target, field }` | `{ text }` — translation only; numbers/currencies/units preserved |
| `extract` | `{ action, text }` | `{ fields }` — sanitized listing fields, **both ES and EN for every text field**; portal boilerplate ignored; output whitelisted (`type` ∈ {apartment, room, home}, `energyRating` A–G, amenities ⊆ the fixed vocabulary) |
| `describe` | `{ action, fields, images[] }` | `{ fields }` — description/details in both languages from a compact fact sheet; ≤3 photos as `data:` URLs; retries once facts-only if the model rejects images |

Config: `DEEPSEEK_API_KEY` (required), `DEEPSEEK_MODEL` (default
`deepseek-v4-pro`), temperature 0.2, `max_tokens` 2000, input capped at
24,000 chars. Degradation: no key → `503 ai_not_configured`, editor keeps
working; upstream error → `500 server_error`. **Privacy rule (in force,
cited by OD-7):** DeepSeek's hosted API runs in China — send property text
only, never tenant/owner personal data; repointing the endpoint at an
EU-hosted equivalent is the escape hatch. v1's Tesseract.js OCR front-end
(scanned PDFs → text in the browser, so the server only ever receives plain
text) is 🔜 re-evaluated with the port; the ADR-033 import pipeline covers
the portal-URL case that motivated most of it.

### 8.4.4 Umami analytics (v1 §7.8) ✅

`https://cloud.umami.is/script.js`, `data-website-id`
`bbc35688-d574-4fed-af9b-a03f37ed9429` (public by design), loaded `defer`.
Cookieless; **no PII in any payload** — property ids, channels and date
strings only. All calls via optional chaining so a blocked script is a
silent no-op. Event taxonomy carried from v1:

| Event | Fired on | Payload |
| --- | --- | --- |
| `search` | search submit | `{ source, checkIn, checkOut }` |
| `inquiry-sent` | contact form success | — |
| `view-property` | detail page load | `{ property }` |
| `booking-request` | email/WhatsApp CTA click | `{ property, channel }` |
| `share` | share action | `{ property }` |

Umami is **write-only from the client** — there is no read API wired, which
is why Manage's views figure is an honest empty state (backlog item).

### 8.4.5 Not carried

**flatpickr** → replaced by react-day-picker v10 (§6.8). **Tesseract.js** →
see §8.4.3. **Resend** → 🗑️ dropped; the notification hook point waits for
ACS (OD-2). **Supabase** (auth, PostgREST, storage, Edge Functions) →
superseded wholesale (ADR-011).

## 8.5 Where the rest of the v1 spec went

| v1 section | Disposition in v2 |
| --- | --- |
| §00 outline, §01 overview | Superseded by [README](README.md); requirement IDs still cited are in §8.1. |
| §02 glossary | Not carried — v1-shaped terms (owner portal, leads, Supabase). v2 defines terms in place. |
| §03 architecture | Superseded by [§1](01-architecture.md) (ADR-011/012/018/019/021/035). |
| §04 data model | Conceptual fields carried into [§2](02-data-model.md); the relational apparatus (RLS, FKs, GiST, triggers) replaced by API-enforced invariants. Snapshot-fields intent (v1 §4.16) restated at §2.1/§2.4. |
| §05 business rules | Pricing/duration **superseded** (ADR-022/023/026 — §4.2/§4.3); the three-variant overlap inconsistency and expired-holds bug resolved by the single predicate (§2.2.3); v1's filter/sort catalogue superseded by the redesigned v2 search (§4.1 — ratings and the `best` sort were dropped with them); formatting carried at §8.2. |
| §06a/§06b functional | Screen behaviour redesigned throughout v2; the draft summary carried at §8.3; admin scope re-set by §4.5. |
| §07 integrations | Carried/retired per §8.4. Blob cache practice (1-year immutable headers) restated at §2.6. |
| §08 auth & security | Superseded by [§3](03-auth-and-roles.md) (ADR-035/036); the "RLS is the boundary" discipline carried as "functions enforce, route rules are cosmetic" (§3.5). |
| §09 conventions | Carried where still true: bilingual/theme conventions live in CLAUDE.md + §4.7 + §6.7; R-X-2 at §8.2. |
| §10 acceptance tests | v1's criteria described v1 screens; v2's test strategy is the three suites in [DEVELOPMENT.md](../DEVELOPMENT.md) §9 + the backlog's parity and negative-matrix items. IDs still cited are in §8.1. |
| §11 decision log | Continued by [§5](05-decision-log.md) (ADR-011…); v1 ADRs in force / superseded are mapped in §5's header. v1's open decisions #1/#2 (availability leak, expired holds) were resolved by design in §2.2/§2.2.3. |
| §12 rebuild checklist | Obsolete (it rebuilt v1); the v2 equivalent is OD-1's cutover checklist. |
