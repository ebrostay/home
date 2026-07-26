# Ebrostay v2 Target Spec — §5 Decision Log (ADR-011 … ADR-021)

> Target: branch `redesign/v2`, locked 2026-07-19 (product owner: Raphael).
> Continues the v1 log ([docs/spec/11-decision-log.md](../spec/11-decision-log.md), ADR-001–010) with the same format: **Title · Status · Context · Decision · Rationale · Consequences**. Status tags: ✅ decided/locked · 🔜 planned · 🗑️ not carried.

v1 ADRs that remain in force in v2 unchanged: **ADR-001** (no online payment),
**ADR-004** (commission 15% VAT incl., cap restated as 30 days' rent by
ADR-023), **ADR-008** (three-state `billsPolicy`; the legacy
boolean is dropped in v2 — fresh start). Superseded v1 ADRs are noted per entry.

| ADR | Title | Status |
| --- | --- | --- |
| ADR-011 | Azure stack replaces Supabase (SWA + Functions + Cosmos + Blob) | ✅ locked |
| ADR-012 | Next.js static export + TypeScript + Tailwind + next-intl | ✅ locked |
| ADR-013 | SWA built-in auth, GitHub + Microsoft only | ✅ locked |
| ADR-014 | Marketplace model with admin review queue | ✅ locked |
| ADR-015 | Booking = login-gated log-then-draft | ✅ locked |
| ADR-016 | Fresh start — no data migration from v1 | ✅ locked |
| ADR-017 | Drop the graceful-degradation fallback | ✅ locked |
| ADR-018 | .NET 9 on managed functions now; .NET 10 when supported | ✅ locked |
| ADR-019 | Cosmos free tier NoSQL + Blob public-read, API-mediated uploads | ✅ locked |
| ADR-020 | DeepSeek retained for the AI assistant | ✅ locked |
| ADR-021 | Fresh SWA `ebrostay-v2` (eastus2); data in spaincentral | ✅ locked |
| ADR-022 | Stay "up to 12 months" (calc: ≥31 & <365 days); billing monthly | ✅ locked |
| ADR-023 | Rent pro-rated daily at price÷30; collected per calendar month | ✅ locked |

---

## ADR-011 — Azure stack replaces Supabase (SWA + Functions + Cosmos + Blob)

- **Status:** ✅ locked 2026-07-19.
- **Context:** v1 runs on GitHub Pages + an optional Supabase project
  (Postgres/RLS, Auth, Storage, Edge Functions — v1 ADR-006/-009). The
  redesign is a ground-up rebuild; the operator's other infrastructure is on
  Azure, and the v1 two-vendor split (Pages + Supabase) exists only for
  historical reasons.
- **Decision:** Rebuild entirely on Azure: **Static Web Apps** (hosting +
  built-in auth + managed functions), **C# Azure Functions** for the API,
  **Cosmos DB free tier** for data, **Blob Storage** for photos. Supabase is
  not part of v2.
- **Rationale:** Consolidation on one vendor/portal/billing surface; SWA Free
  tier + Cosmos free tier + LRS blob storage cost **€0 at this scale**; a
  real (thin) API tier removes the public-anon-key/RLS model's contortions and
  gives one obvious enforcement point (§3.5); C#/.NET is the operator's
  preferred backend stack.
- **Consequences:**
  - Everything RLS did moves into function code — the negative-test matrix
    moves to the API layer (§3.5).
  - Supabase remains running only to serve v1 production until cutover, then
    is decommissioned after a snapshot (ADR-016, OD-4).
  - Supersedes v1 ADR-006 (RLS boundary) and the hosting half of ADR-009.

## ADR-012 — Next.js static export + TypeScript + Tailwind v4 + next-intl

- **Status:** ✅ locked 2026-07-19.
- **Context:** v1 is no-build vanilla HTML/JS with an in-page translation
  dictionary (v1 ADR-009/-010) — deliberate then, but the v2 feature set
  (host editor, admin queue, themed bilingual UI) makes hand-rolled DOM code
  and copy-pasted page chrome the bottleneck.
- **Decision:** Frontend = **Next.js App Router with `output: "export"`**
  (pure static HTML/JS, no SSR/middleware), **TypeScript**, **Tailwind v4**
  (CSS-first config), **next-intl** with locales `es`/`en`,
  `localePrefix: "always"`, Spanish default; **light AND dark themes** via a
  `data-theme` attribute set pre-paint.
- **Rationale:** Componentization and typed data contracts for the larger v2
  surface; **SEO parity with v1 via per-locale prerendered HTML** (every
  `/es/...` and `/en/...` page is real static HTML at deploy time, as
  crawlable as v1's hand-written pages); static export keeps SWA Free-tier
  hosting and CDN-cacheable assets.
- **Consequences:**
  - **Constraint accepted: no middleware, no SSR, no route handlers.** Locale
    routing must be fully static (hence `localePrefix: "always"` + host-level
    `/` → `/es/` redirect); all dynamic data is client-fetched from `/api/*`.
  - Every string ships in both `messages/es.json` and `en.json` (§4.7).
  - Supersedes v1 ADR-010 (in-page dictionary) and the no-build half of
    ADR-009.

## ADR-013 — SWA built-in auth, GitHub + Microsoft only

- **Status:** ✅ locked 2026-07-19.
- **Context:** v2 needs sign-in for booking and hosting (ADR-014/-015). v1
  used Supabase email/password auth. SWA Free tier offers preconfigured
  GitHub and Microsoft (`aad`) providers; email/password does not exist and
  custom OIDC requires the Standard tier.
- **Decision:** Use **SWA built-in auth only**, with **GitHub and Microsoft**
  as the only providers. No email/password, no custom OIDC. Roles:
  `anonymous` / `authenticated` / `admin` (custom role, 3 invitees — §3.3).
- **Rationale:** Zero auth code and zero credential storage on our side; the
  session is enforced at the platform edge and the principal is delivered to
  functions ready-parsed (§3.4). The target audience (corporate/relocating
  professionals, small host pool) overwhelmingly holds a Microsoft or GitHub
  identity.
- **Consequences:**
  - **Accepted friction:** users without either account cannot book or host
    (they can still browse and send inquiries anonymously). Monitor; the
    **escape hatch is SWA Standard tier + custom OIDC or Entra External ID**
    if the funnel shows meaningful loss.
  - No password reset / account management surface to build or secure.
  - Deactivation must be enforced at the function layer (§3.7) since the
    platform session cannot be banned on Free tier.

## ADR-014 — Marketplace model with admin review queue

- **Status:** ✅ locked 2026-07-19. **Supersedes** v1's curated/owner-portal
  model (v1 §1.4 "no tenant or owner editing of listings"; owner portal +
  `owner_leads`).
- **Context:** In v1 only admins created listings; owners had a read-only
  portal and a "become a partner" lead form. That caps supply at operator
  bandwidth and makes every new home a manual data-entry task.
- **Decision:** v2 is a **marketplace**: anonymous visitors browse/search/see
  details; **booking requires sign-in**; **any signed-in user may create and
  manage property listings** ("host" — a state, not a role). New **and
  edited** listings enter an **admin review queue** and only go public after
  approval (lifecycle §2.2.1). Admin = 3 invited users (§3.3). Host dashboard
  = own listings + availability + booking-interest logs for own properties.
- **Rationale:** Self-serve supply with editorial control: the review queue
  preserves v1's "verified/curated" trust signal (the reason customers use
  Ebrostay over open portals) while removing the operator from the data-entry
  loop. Login-gated booking gives every request an accountable identity.
- **Consequences:**
  - Property gains the `draft → pending_review → published | rejected(note)
    → archived` lifecycle with per-role transitions (§2.2.1); nothing is
    public without an admin approval.
  - `owner_leads` and the owner portal are 🗑️ not carried; payout details and
    guest info are 🔜 re-scoped for later (§2.1).
  - Review latency becomes a product metric; the queue must stay small (3
    admins).
  - Host-facing surfaces (editor, dashboard) must meet the same i18n/theme
    bar as public pages (§4.7).

## ADR-015 — Booking = login-gated log-then-draft

- **Status:** ✅ locked 2026-07-19. **Supersedes ADR-002's** unwired Edge
  Function path (and re-scopes its live mailto/WhatsApp MVP).
- **Context:** v1's live booking flow was client-only mailto/WhatsApp — zero
  record of demand — while a complete server pipeline (`request-booking` Edge
  Fn + Resend emails + `booking_requests` table) sat built but unwired
  (v1 ADR-002). The operator wants request telemetry and identity without
  losing the low-friction channel that demonstrably works.
- **Decision:** Booking is **login-gated** and **log-then-draft**: the widget
  is visible to all but actionable only signed-in. On submit, `POST
  /api/booking-requests` logs the **full request** (property, dates, month
  count, itemized estimate, tenant names, user identity, locale, chosen
  channel) to Cosmos; the server **recomputes the estimate and flags
  client/server mismatch**; then the client opens the pre-crafted **email or
  WhatsApp draft** (v1 bilingual summary format carried). **No transactional
  email for now** — Resend is 🗑️ dropped; a **notification hook point** is
  left in the function where **Azure Communication Services email** can be
  added later (OD-2). Business rules carried **exactly** from docs/spec/05:
  whole-month billing (end-exclusive, round up, min 1), commission =
  min(15% rent, one month) VAT incl. with the visible discount line, total =
  rent + commission + deposit, >11 months → two-contract message, all figures
  labelled estimates, **no online payment** (v1 ADR-001 stands).
- **Rationale:** Logging first captures every lead and its computed economics
  even if the user abandons the draft; the server recomputation operationalizes
  the v1 parity guard (docs/spec/05 §5.6) as a production tripwire instead of
  a test-only promise; keeping the draft as the delivery channel preserves the
  proven, zero-infrastructure operator workflow.
- **Consequences:**
  - `bookingRequests` (§2.4) is written by the **live** flow — v1's unwired
    machinery becomes v2's core path; the admin Requests viewer is real (§4.5).
  - The v2 resolution of v1 open decision #2 applies: **expired holds are
    excluded from overlap checks, identically client & server** (§2.2.3).
  - Anonymous users lose v1's account-free booking request — the accepted cost
    of identity + logging (they can still send an inquiry anonymously).
  - Confirmation remains manual/off-platform; accepting a stay = an admin/host
    recording a confirmed availability block (§4.5).

## ADR-016 — Fresh start, no data migration

- **Status:** ✅ locked 2026-07-19.
- **Context:** v1 production data lives in Supabase Postgres (a handful of
  listings, profiles keyed to Supabase Auth ids, availability rows). v2
  changes identity keys (SWA principal ids), document shapes, and the listing
  ownership model.
- **Decision:** **No Supabase migration.** v1 prod data is not imported; v2
  production starts empty and fills through the host flow. **Seed data (the 4
  v1 sample homes) is used for dev/tests only** (§2.7). v1 prod data stays in
  Supabase until a **decommission snapshot** is taken (OD-4), then the project
  is retired.
- **Rationale:** The dataset is tiny and operator-owned — re-entering it
  through the v2 host/admin flow doubles as end-to-end validation of the
  editor and review queue. Identity cannot be mapped anyway (Supabase Auth →
  SWA principals is a different keyspace). A migration pipeline would cost
  more than the data it moves.
- **Consequences:**
  - Cutover checklist includes manually re-listing current homes via the v2
    editor before DNS moves (OD-1).
  - Historical v1 rows (inquiries, blocks) exist only in the decommission
    snapshot, not in v2.
  - No dual-write or sync period; v1 and v2 data are fully independent.

## ADR-017 — Drop the graceful-degradation fallback

- **Status:** ✅ locked 2026-07-19. **Supersedes v1 ADR-009** (sample-data
  fallback half; v1 R-CORE-1 does not carry to v2).
- **Context:** v1's front end ran fully on built-in sample data when Supabase
  was absent — load-bearing when the backend was optional and the site had to
  demo from a static host. In v2 the API is a first-class, co-deployed part of
  the same SWA resource, and core v2 features (auth, review queue, logged
  booking) cannot exist without it.
- **Decision:** **v2 requires the API.** There is no `data.js` equivalent, no
  `isConfigured()` branch, and no sample-data rendering path in production
  code. API failures surface as designed bilingual error/retry states. Sample
  homes exist **only as seed data for dev/tests** (§2.7).
- **Rationale:** The fallback's premise (backend optional) is gone; keeping a
  second data path would double every data-access branch, mask real outages,
  and contradict the logged booking flow. SWA co-deploys app and API
  atomically, so "static up, API down" is an incident, not a mode.
- **Consequences:**
  - Availability of `/api` is now part of the production SLO; monitoring via
    App Insights (§1.3) matters from cutover day.
  - Tests seed Cosmos (or the emulator) instead of relying on built-ins.
  - Local frontend work needs `func start`/`swa start` or a dev Cosmos —
    accepted DX cost (§1.4).

## ADR-018 — .NET 9 on managed functions now; .NET 10 when supported

- **Status:** ✅ locked 2026-07-19 (with a standing upgrade trigger, OD-3).
- **Context:** SWA **managed** functions constrain the runtime menu:
  `dotnet-isolated:9.0` is the newest .NET accepted; SWA currently **rejects
  net10**. Meanwhile **.NET 9 (STS) is out of Microsoft support since May
  2026**. Bring-your-own Functions would allow .NET 10 today but requires SWA
  Standard tier and a separately managed Functions app — cost and complexity
  the project avoids on purpose.
- **Decision:** Ship on **.NET 9 isolated** as a **consciously accepted,
  temporarily unsupported bridge**, and **upgrade to .NET 10 the moment SWA
  managed functions support it** (bump TFM + `platform.apiRuntime`, redeploy —
  §1.6).
- **Rationale:** Staying on managed functions preserves Free-tier hosting,
  same-origin `/api`, and zero infra to run. The unsupported window is a
  bounded, known risk on a small, low-attack-surface API; the alternative
  (.NET 8 LTS) trades a supported-but-older runtime for a *larger* upgrade
  gap later, and SWA's .NET 10 support is expected on the usual cadence.
- **Consequences:**
  - **Watch item (OD-3):** check SWA runtime support regularly; the upgrade is
    to be executed immediately on availability, not batched.
  - Until then, no expectation of .NET 9 servicing patches — mitigated by the
    thin API surface and platform-level TLS/auth termination.
  - `staticwebapp.config.json` and `Ebrostay.Api.csproj` are the only two
    files the upgrade touches (§1.6).

## ADR-019 — Cosmos free tier NoSQL + Blob public-read with API-mediated uploads

- **Status:** ✅ locked 2026-07-19; amended 2026-07-20 (serverless → free tier).
- **Context:** v2 needs a datastore and photo storage under the Azure
  consolidation (ADR-011). The workload is tiny and spiky (a few documents,
  bursts of reads), and photos must be publicly addressable for `<img>` tags
  without auth handshakes. Originally provisioned as **serverless**
  (pay-per-RU, ~€0 but nonzero); the subscription's one **free-tier** slot was
  unused, so the empty account was recreated the next day.
- **Decision:** **Cosmos DB free tier (NoSQL API, provisioned)** — account
  `ebrostay-cosmos`, database `ebrostay` with **1000 RU/s shared** across the
  containers per §2.1 (exactly the free-tier allowance: first 1000 RU/s +
  25 GB free forever), embedded photos/availability per §2.2. **Go paid when
  there are real users**: raise provisioned RU/s (or migrate to
  serverless/autoscale) when usage approaches the free allowance. **Azure
  Blob Storage** — account `ebrostayphotos`, container **`property-photos`**,
  **public read**; **uploads only via the API**, which validates, compresses,
  sets 1-year cache headers, and maintains the embedded photo list (§2.6). No
  SAS tokens or storage keys in the client.
- **Rationale:** Free tier makes the datastore **literally €0** (serverless
  was only approximately so), the 1000 RU/s allowance is far above this
  workload, and the slot was unused. The document model matches the v1 access
  pattern (a listing is always read whole). Public-read blobs keep photo
  serving CDN-simple, exactly like v1's public Supabase bucket; funneling
  writes through the API is what RLS did for the v1 bucket, plus validation
  and compression v1 did client-side only.
- **Consequences:**
  - No relational constraints: invariants live in function code with ETag
    optimistic concurrency (§2.2.3); cross-document consistency is by design
    unnecessary (embedding).
  - Blob URLs are permanent and cacheable for a year — replacing a photo means
    a new blob name, not an overwrite.
  - Anyone can read any photo URL — do not upload non-public imagery
    (unchanged from v1's public bucket).

## ADR-020 — DeepSeek retained for the AI assistant

- **Status:** ✅ locked 2026-07-19.
- **Context:** v1's editor AI assistant (extract/translate/describe) runs on
  DeepSeek via a Supabase Edge Function, with an existing funded API key
  (docs/spec/07 §7.3). The Edge Function dies with Supabase (ADR-011); the
  feature's value grows in v2 where non-expert hosts do their own data entry.
- **Decision:** **Retain DeepSeek** and port the assistant to a C# function
  (`POST /api/ai-assistant`, §4.6) using the **existing key** in Functions app
  settings. Actions carried: extract, translate, describe. Audience widened:
  **hosts for their own listings + admins** (ownership enforced server-side).
- **Rationale:** The integration is proven, cheap, and OpenAI-API-compatible
  (trivially portable to C#); no reason to re-evaluate vendors mid-replatform.
  AI-assisted entry directly lowers the marketplace's listing-quality burden.
- **Consequences:**
  - v1's degradation contract carries: no key → `503 ai_not_configured`,
    editor stays usable (§4.6).
  - v1's privacy rule carries: property text only, never personal data
    (DeepSeek hosted API runs in China — docs/spec/07 §7.3); swapping
    `DEEPSEEK_URL`-style endpoint config remains the EU-hosting escape hatch.
  - Vendor swap later = one function + one app setting.

## ADR-021 — Fresh SWA `ebrostay-v2` in eastus2; data in spaincentral

- **Status:** ✅ locked 2026-07-19; amended 2026-07-20 (reuse → fresh resource).
- **Context:** Azure made **westeurope location-ineligible for new resources**
  at provisioning time — both for SWAs and for the data accounts. Data
  (`ebrostay-cosmos`, `ebrostayphotos`) went to **spaincentral**. For the SWA,
  the plan was to reuse the v1-era resource **`ebrostay-home`** (Free,
  westeurope, grandfathered) — but in practice it **rejects every deployment
  token** ("No matching Static Web App was found or the api key was invalid"),
  including freshly reset keys, from both CI and the SWA CLI.
- **Decision:** Create a **fresh Free-tier SWA `ebrostay-v2`** in **eastus2**
  (host `gentle-plant-000592f0f.7.azurestaticapps.net`) as the v2 deploy
  target of `swa-v2.yml` (§1.5); keep data in spaincentral. Accept the
  split-region layout. Leave `ebrostay-home` (stale v1 content) untouched
  until cutover, then delete it.
- **Rationale:** The old resource is undeployable; SWA offers no European
  region other than the ineligible westeurope, and the SWA region only places
  the managed functions — static assets are globally distributed. The
  functions ↔ Cosmos hop (eastus2 ↔ spaincentral) is the only cross-region
  path; tolerable now, and fixable later by recreating in westeurope when
  eligible or via Standard tier + BYO functions in Spain (pairs with the
  .NET 10 upgrade, ADR-018).
- **Consequences:**
  - Records the region-ineligibility constraint and the dead v1 resource so
    nobody "cleans up" v2 onto it.
  - Admin role invitations (§3.3) and the custom-domain cutover (OD-1) happen
    on **`ebrostay-v2`**.
  - Deployment token lives in the `AZURE_STATIC_WEB_APPS_API_TOKEN_V2` GitHub
    secret; Cosmos/Blob credentials are app settings on `ebrostay-v2`.
  - Delete `ebrostay-home` (and its disabled workflow + GitHub linkage) at
    cutover.

## ADR-022 — Stay duration ≥31 days & ≤12 months; billing stays monthly

> ⚠️ **Point 4 (monthly billing) is superseded by ADR-023** (2026-07-26):
> rent is pro-rated daily. Points 1–3 (the day-based duration limits) stand.

- **Status:** ✅ locked 2026-07-22. Amends the duration limits of v1 ADR-005
  (which set an 11-month cap) in light of Spanish-law research
  ([07-legal-notes.md](07-legal-notes.md)).
- **Context:** v1 (and the early v2 build) capped stays at **11 whole months**
  with a ">11 → two contracts" message. Research into the LAU shows the real
  constraint differently: under **current** law the temporary-rental regime is
  set by *purpose*, not duration (no statutory month cap); a **proposed 2026
  reform** (agreed politically Nov 2025, not yet law) makes it explicit — a
  temporary stay must be **≥ 31 days and ≤ 12 months**, and anything **over 12
  months auto-converts to a protected habitual-residence tenancy**. Separately,
  the whole-month billing *rounds up*, so an 11½-month stay billed as 12 months
  wrongly tripped the old ">11" cap even though it is legally fine.
- **Decision:**
  1. **Limits (deliberately simple, day-based):** a bookable stay is **≥ 31
     days** and **< 365 days** (`MIN_STAY_DAYS = 31`, `MAX_STAY_DAYS = 365` in
     `app/lib/pricing.ts`; **leap years ignored** — a flat 365). This is
     *slightly stricter* than the reform's "≤ 12 months" (it disallows a full
     365-day year), chosen for simplicity and as the safer side of the line.
  2. **Duration is measured in DAYS, not billed months** — `tooShort =
     end < addDays(start, 31)`, `tooLong = end >= addDays(start, 365)`, never
     `billedMonths > N`. This fixes the rounding bug: an 11½-month stay bills as
     12 months but is well under 365 days, so it is *not* flagged.
  3. **UI framing is "up to 12 months"; the calc is the day count.** The hero
     month-band offers **1–12** and marketing says "1–12 months" — the friendly,
     round promise. The *enforced* ceiling is still `< 365 days` on the booking
     date-picker. The ~1-day gap between "12 months" (≈365 days) and "< 365
     days" is immaterial — nobody distinguishes 11.99 from 12.0 months — and it
     errs on the safe side.
  4. **Billing stays monthly** (whole-month, round-up, min 1 — ADR-005 rounding
     retained). **Daily proration is deferred** ("monthly until we need daily",
     product-owner call) — it is legal and freely contractible (LAU art. 17,
     "salvo pacto en contrario"), recorded in [../BACKLOG.md](../BACKLOG.md) for
     when the sub-month/exact-date model lands.
- **Rationale:** A dumb day count (< 365 days, no leap-year math) is easy to
  reason about and audit, sits safely inside the reform's 12-month ceiling, and
  removes the whole-month rounding bug that rejected legal sub-year bookings.
- **Consequences:**
  - `pricing.ts` (day-count calc), `MonthBand` (1–12), the property estimate
    (tooShort/tooLong), and user-facing copy on "1–12 months".
  - The **≥31-day floor and <365-day ceiling** are enforced on the booking date
    range (property page); the hero band is a coarse duration proxy for search.
  - Contract-side rules the app does not enforce but ops must honor: state the
    temporality cause; don't chain >2 temporary contracts per guest (reform).
  - Open sub-decisions in the backlog: daily-proration switch + its day-count
    basis; per-property min/max vs. the global legal cap.

---

## ADR-023 — Rent is pro-rated daily at price÷30; rent collected per calendar month

- **Status:** ✅ locked 2026-07-26 (product owner: Raphael). **Supersedes the
  billing rule of v1 ADR-005** (whole-month, round-up, min 1) and **replaces
  point 4 of ADR-022** ("billing stays monthly"). Amends **ADR-004**'s
  commission cap wording. Closes the `[P][M]` billing-method item in
  [../BACKLOG.md](../BACKLOG.md), including its open sub-decision on the
  daily-rate basis. Duration limits (≥31 days, <365 days) are **unchanged**.
- **Context:** whole-month billing rounds *up*, so 10 Jul → 11 Aug — a 32-day
  stay — was billed as **two full months**. In a mid-term market where stays
  are planned against a relocation date rather than a calendar month, that is a
  visible unfairness and it is the single thing guests query most. ADR-022
  deferred proration ("monthly until we need daily"); we now need daily. LAU
  art. 17 makes monthly only a default, "salvo pacto en contrario", so daily
  proration is freely contractible.
- **Decision:**
  1. **Daily rate = listed price ÷ 30, fixed.** The headline price is a price
     for **thirty days**, not "a calendar month". Chosen over ÷actual-days
     (which makes the same home cost €30.65/day in July and €33.93/day in
     February) and over ×12÷365, because a visitor can divide by 30 in their
     head and the rate never moves. **Accepted cost:** a 31-day calendar month
     bills 31/30 of the headline price, and a 365-day year bills ~1.4% above
     twelve headline months. The UI never says "per month" unqualified — the
     booking panel reads "/ 30 days" with the daily rate beneath it.
  2. **Rent = billed days × daily rate**, end-exclusive: 1 Sept → 1 Oct is
     **30 days**, priced at exactly the headline figure.
  3. **Commission = min(15% × rent, 30 days' rent)**. Since 30 × (price÷30) is
     the listed price, the cap is numerically ADR-004's "one month's rent"
     restated in days; intent and the discount line are unchanged. The cap now
     binds from **~200 days** rather than "7 whole months".
  4. **Collection is per CALENDAR month, not per 30-day block.** The first
     instalment covers move-in → end of that month and is due **at move-in**,
     together with the **deposit** and the Ebrostay service fee. Then one
     instalment per calendar month; the last is a part-month. A guest may
     pre-pay any number of months up front. Exact intervals are agreed before
     move-in (there is no checkout to enforce them yet — see Consequences).
  5. **Utilities are never in the instalments.** They are metered and settled
     in a **final bill after move-out**, together with any documented damage;
     the deposit is returned once that bill is settled. This is what
     `billsPolicy: "capped"` has always meant, and the detail page now derives
     its bills wording from that field instead of asserting a fixed "capped
     utilities" line on every listing (ADR-008 unchanged).
  6. **Rounding.** Money is settled to cents. Instalments round independently,
     so the remainder is absorbed by the **last** instalment — the schedule
     always sums to the quoted total.
- **Rationale:** pays for nights actually stayed, removes the round-up
  distortion that ADR-022 had to work around in its duration check, and keeps
  one number (÷30) a guest can verify unaided. Calendar-month collection is
  what the market and Spanish practice expect, and it is orthogonal to how the
  rent is *computed*.
- **Consequences:**
  - `app/lib/pricing.ts`: `billedMonths()` **removed**; `dailyRate()`,
    `stayDays()`, `paymentSchedule()` added; `Estimate.months` → `.days`+`.rate`.
  - Booking panel: headline is "/ 30 days" + daily rate; the rent row reads
    "N days × €X"; a **payment-schedule preview** lists the instalments and the
    final bill. The WhatsApp/mailto request text quotes days, not months.
  - **A 30-day stay is not bookable** — the ≥31-day legal floor (ADR-022)
    stands. "30 days" is a *price basis*, never an offer. Any copy that implies
    a bookable month must say 31 days.
  - Not yet enforced anywhere: there is no checkout and no booking endpoint, so
    the schedule is **a quotation, not a commitment**. Instalment capture,
    prepayment choice and the final-bill flow land with the booking flow
    (§4.3); the preview must stay in sync with it.
  - `docs/spec/05-business-rules.md` §5.1.1–5.1.2 describe the v1 whole-month
    behaviour and remain accurate **for v1** (still live on `main`); they are no
    longer the v2 rule. CLAUDE.md points at that file — v2 pricing now follows
    this ADR.
  - Seed data: `maxStayMonths` corrected 12 → 11 (12 calendar months is 365
    days on the nose, which ADR-022 disallows).
  - **`stayTerms` is a controlled vocabulary, not free text** (confirmed
    2026-07-26). The document holds only keys; a key renders only if it is in
    `DECLARED` in `StayTerms.tsx` **and** has copy in both message files —
    anything else is skipped silently. These cards read as Ebrostay's
    contractual commitments, so a database field must never be able to
    introduce wording that was not written and reviewed in both languages.
    Adding a term is therefore a code + copy change, deliberately. If owners
    ever need their own words, that is a **separate** free-text "house rules"
    field, visibly theirs and passed through the admin review queue (§2.2.1) —
    not mixed into these cards.

---

## Open decisions

The v2 residue — items locked decisions deliberately left open, with their
resolution paths.

| # | Decision | Status | Question | Resolution path |
| --- | --- | --- | --- | --- |
| OD-1 | **Cutover date criteria** | 🔜 | When exactly does DNS move from GitHub Pages to the SWA? Locked only as "early: once the redesigned public site + API are solid; host/admin ship incrementally after". | Define the go/no-go checklist: public pages + search + property detail + booking flow green under the (pending) test gate; current homes re-listed via the v2 editor (ADR-016); custom domain + www configured on the SWA; rollback = DNS revert to Pages. |
| OD-2 | **ACS email timing** | 🔜 | When to wire Azure Communication Services email into the booking hook point (staff notification, guest copy)? | Ship after cutover once request volume justifies it; the hook point in `POST /api/booking-requests` (§4.3) is the only touch point. Requires ACS resource + verified sender domain. |
| OD-3 | **.NET 10 availability watch** | 🔜 | SWA managed functions do not yet accept `net10`. | Check the SWA supported-runtimes list on each Azure update cycle; upgrade immediately on availability per §1.6 / ADR-018. |
| OD-4 | **Supabase decommission snapshot** | 🔜 | v1 prod data stays in Supabase until decommission (ADR-016). What is kept, and when is the project deleted? | After cutover + a settling period: export full `pg_dump` + storage bucket archive to operator-held storage, verify readability, then delete the Supabase project. Date to be set with OD-1. |
| OD-5 | **Published-edit review visibility** | 🔜 | §2.2.1 takes the simple rule: editing a published listing pulls it from public view until re-approved. Should the prior published version instead stay live while the edit awaits review (draft-over-live)? | Keep the simple rule for launch; revisit if hosts complain about visibility gaps. Draft-over-live = store a `pendingRevision` sub-document on the property; approve = promote. Pure additive change. |
