# Ebrostay v2 Target Spec — §5 Decision Log (ADR-011 … ADR-042)

> Target: branch `redesign/v2`, locked 2026-07-19 (product owner: Raphael).
> Continues the v1 log (v1 spec §11, ADR-001–010 — on `main`; the v1→v2 disposition map is in [§8.5](08-carried-v1-rules.md)) with the same format: **Title · Status · Context · Decision · Rationale · Consequences**. Status tags: ✅ decided/locked · 🔜 planned · 🗑️ not carried.

v1 ADRs that remain in force in v2 unchanged: **ADR-001** (no online payment),
**ADR-004** (commission 15% VAT incl., cap restated as 30 days' rent by
ADR-023), **ADR-008** (three-state `billsPolicy`; the legacy
boolean is dropped in v2 — fresh start). Superseded v1 ADRs are noted per entry.

Supersessions **within** this log: **ADR-013** (SWA preconfigured providers)
is superseded by **ADR-035** (Entra External ID); **ADR-021** (fresh SWA in
eastus2) is amended by **ADR-035** (SWA Standard, recreated in West Europe);
point 4 of **ADR-022** (monthly billing) is replaced by **ADR-023** (daily
proration). Open items every locked decision deliberately left behind are
collected in the **Open decisions** table at the end of this file (OD-1…OD-10).
Craft, ops and content items live in Jira — project **KAN** on
<https://ebrostay.atlassian.net>, label `v2` (see the appendix at the end).

**Each open decision also has a tracking ticket** (this table stays the
authority; the ticket exists so nothing falls off a board): OD-1 → KAN-51 ·
OD-2 → KAN-79 · OD-3 → KAN-78 · OD-4 → KAN-80 · OD-5 → KAN-113 ·
OD-6 → KAN-114 · OD-7 → KAN-115 · OD-8 → KAN-116 · OD-9 → KAN-65.
OD-10 is decided. JQL: `project = KAN AND labels = "open-decision"`.

| ADR | Title | Status |
| --- | --- | --- |
| ADR-011 | Azure stack replaces Supabase (SWA + Functions + Cosmos + Blob) | ✅ locked |
| ADR-012 | Next.js static export + TypeScript + Tailwind v4 + next-intl | ✅ locked |
| ADR-013 | SWA built-in auth, GitHub + Microsoft only | ⛔ superseded by ADR-035 |
| ADR-014 | Marketplace model with admin review queue | ✅ locked |
| ADR-015 | Booking = login-gated log-then-draft | ✅ locked |
| ADR-016 | Fresh start, no data migration | ✅ locked |
| ADR-017 | Drop the graceful-degradation fallback | ✅ locked |
| ADR-018 | .NET 9 on managed functions now; .NET 10 when supported | ✅ locked |
| ADR-019 | Cosmos free tier NoSQL + Blob public-read with API-mediated uploads | ✅ locked |
| ADR-020 | DeepSeek retained for the AI assistant | ✅ locked |
| ADR-021 | Fresh SWA `ebrostay-v2` in eastus2; data in spaincentral | ✅ locked · amended by ADR-035 (SWA now `ebrostay-home`, Standard, West Europe) |
| ADR-022 | Stay duration ≥31 days & ≤12 months; billing stays monthly | ✅ locked · point 4 replaced by ADR-023 |
| ADR-023 | Rent is pro-rated daily at price÷30; rent collected per calendar month | ✅ locked |
| ADR-024 | Off-market listings are `paused`, not `archived`, and reopen without re-review | ✅ locked |
| ADR-025 | Pricing and availability edits apply live; only content edits re-review | ✅ locked |
| ADR-026 | Turnover days between stays, and who is paid for the clean | ✅ locked |
| ADR-027 | The listing editor: one diff, one save, and what it deliberately cannot do | ✅ locked |
| ADR-028 | "What's nearby": measured, not typed; numbers eager, geometry lazy | ✅ locked |
| ADR-029 | The guest page answers to its own owner in every lifecycle state | ✅ locked |
| ADR-030 | "Add a property": a wizard over the editor's own components | ✅ locked |
| ADR-031 | No turnaround after the owner's own use | ✅ locked |
| ADR-032 | The listing description is a closed rich-text schema, not HTML | ✅ locked |
| ADR-033 | AI-assisted import: an async job the API owns and an extractor it does not trust | ✅ locked · amended 2026-08-03 (unknown marks dropped by the owner's PUT) |
| ADR-034 | The listing description field is `description`, not `copy` | ✅ locked · consequence recorded 2026-08-03 (a re-seed does not cover owner drafts) |
| ADR-035 | Entra External ID: an Ebrostay account, Microsoft sign-in, our own branding | ✅ locked & built |
| ADR-036 | The provider choice stays on Entra's hosted page; one-hop Microsoft via a direct provider | ✅ locked & built |
| ADR-037 | `/host` is public, and the sign-in bounce moved into the app | ✅ locked & built |
| ADR-038 | The bare domain picks a language; every other URL still states one | ✅ locked & built |
| ADR-039 | "Your places" is measured, not estimated, and the browser keeps it | ✅ locked & built |
| ADR-040 | One map, one travel toggle, one selection | ✅ locked & built |
| ADR-041 | Address precision: the street-band design | ✅ locked |
| ADR-042 | Closing an account is a reversible request, and `closed` is a public state | ✅ locked & built |

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
    routing must be fully static (hence `localePrefix: "always"`; the bare
    domain was a host-level `/` → `/es/` redirect until ADR-038 replaced it
    with a client-side one that reads the visitor's language); all dynamic
    data is client-fetched from `/api/*`.
  - Every string ships in both `messages/es.json` and `en.json` (§4.7).
  - Supersedes v1 ADR-010 (in-page dictionary) and the no-build half of
    ADR-009.

## ADR-013 — SWA built-in auth, GitHub + Microsoft only

> ⛔ **Superseded by ADR-035** (2026-07-31), which exercised exactly the escape
> hatch this ADR named: SWA moved to Standard tier and sign-in now goes through
> **Entra External ID** (Ebrostay email/password account + Microsoft), behind
> custom OIDC providers. The preconfigured GitHub/`aad` providers are gone.
> Kept for the reasoning; §3 describes the current state.

- **Status:** ⛔ superseded 2026-07-31 (was ✅ locked 2026-07-19).
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
    → paused` lifecycle with per-role transitions (§2.2.1); nothing is
    public without an admin approval. (The terminal state was named
    `archived` here until ADR-024 renamed it and made it reversible.)
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

### Amendment 2026-07-28 — what "validates, compresses" actually means

✅ **Built 2026-07-28**, to this design. `PhotoPipeline` and `PhotoStore` in
`api/Services/`, `POST /api/host/properties/{id}/photos`. Written before
building rather than after, because most of it is a security boundary and
retrofitting one is how you get holes. What the build settled is recorded at
the end of this amendment.

**The starting fact: `property-photos` is public-read.** An upload is not a
file we store, it is a URL we host and hand out. Whatever lands there is
served to anyone, with whatever `Content-Type` it carries. That, not
"malware", is why this needs care.

**Re-encoding is the control that does most of the work.** Decode to pixels,
write out a fresh WebP. Anything that is not pixels — appended archives,
polyglot files, script in metadata, EXIF — does not survive the round trip.
It is the same operation as resizing, so one pass pays for both. What it does
*not* defend is a file crafted against the decoder itself: image parsers have
a long CVE history, so read dimensions from the header **before** decoding
(a 10 KB PNG can declare 50000×50000 and take the Function's memory with it),
and keep the library patched.

The rest, none of which re-encoding covers:

| Check | Because |
| --- | --- |
| Sniff magic bytes; set `Content-Type` from an allowlist (`image/jpeg`, `image/png`, `image/webp`) | Blob serves whatever `Content-Type` is set on it. A client-supplied `text/html` is stored XSS on our own storage account. |
| **Refuse SVG** | A legitimate image format that can carry `<script>`, and opened directly rather than inside an `<img>` it executes in the storage origin. No flat photo is a vector. |
| Blob name generated server-side (GUID under the property id) | Never the client's filename — that is path traversal and cross-listing overwrite in one. |
| Byte cap and dimension cap, before decode | Decompression bombs, and `MaxPhotos = 40` only caps the count. |
| Ownership from `x-ms-client-principal` | The caller must own the listing. The same rule as everywhere else (§3.5). |

**Client-side resizing stays, with its purpose corrected.** It is a *transfer*
optimisation, not a security control and not how the served sizes are
produced: mobile uplink is several times slower than downlink, and an owner
posting twelve 8 MP photos should not wait two minutes. So the browser
downscales to a **generous ceiling (~2560px long edge), never to a final
size** — a browser-made thumbnail would be a lossy master we could never
derive a new size from — using `createImageBitmap` with `resizeWidth` so the
downscale happens *during* decode rather than by allocating a 50 MP canvas on
a low-end phone. If it fails for any reason, upload the original untouched.
The server's behaviour does not change either way: browser output is untrusted
input, and the resize is a hint that usually happens to be honoured.

No SAS token appears in the client, per the locked decision above. Bytes go
client → Function → Blob. (A quarantine-container pattern would get the bytes
off the request path but needs a SAS in the browser, so it is out.)

**HEIC: refused, with copy that says so** (product owner, 2026-07-28 —
resolving what this amendment first recorded as an open question). Neither the
browser nor the Function decodes HEIC without adding a codec, and the codec
that would do it drags in a far wider parser surface than the one format needs.
iOS generally converts to JPEG when picking through a file input, so this
mainly catches a HEIC copied to a desktop. It is therefore detected by its
`ftyp` brand and refused as `photo_heic` — *"that is a HEIC file, export it as
JPEG"* — rather than falling through to "that is not an image", which is true
of nothing the owner did. Revisit if owners actually hit it.

### What the build settled

- **SkiaSharp + MetadataExtractor**, both permissively licensed and both
  managed-plus-small-native rather than a full ImageMagick. `SKCodec.Create`
  reads dimensions from the header without decoding, which is exactly the
  pre-decode check this amendment asks for.
- **Three sizes, not one** (product owner): 2560 master, 1600 detail, 800 card,
  measured off what renders (§2.2.2). The browser's ~2560 output becomes the
  stored master and the other two are derived from it server-side.
- **EXIF orientation has to be applied by hand.** It lives in the metadata the
  re-encode destroys, so without an explicit upright pass every portrait photo
  from a phone would publish on its side. Verified: a 3000×2000 file with
  `Orientation=6` stores as 1707×2560.
- **Uploading does not move `status`.** A photo is a transfer, not a claim; the
  content save that follows is what carries a listing back into review
  (ADR-025). It applies live for the same reason — holding bytes until Save
  would lose an eight-photo upload to a closed tab.
- **Dropping a photo now deletes its blobs**, all three, and only after the
  document write succeeds. Deleting first would strand a listing pointing at
  photos that no longer exist if the ETag check then failed; this order leaks
  an orphan instead, which is the cheaper failure.
- **Measured**: a 1.03 MB 3000×2000 JPEG uploads as 459 KB after the browser
  downscale (−56%) and stores as 318 KB / 188 KB / 75 KB. The card a search
  result actually needs is **75 KB against the 1 MB original**.

### Amendment 2026-07-28 — photo EXIF: stripped from the file, kept for review

Phone photos carry GPS. Publishing one with EXIF intact hands the exact
doorway to anyone who downloads it, which silently defeats §4.2's rule that
the address is shown only to guests who book. So the **published image always
has EXIF stripped** — that part is not a trade-off.

But the coordinates themselves are worth something to a reviewer (product
owner, 2026-07-28): photos taken far from the pin, or scattered across several
places, say something about whether this listing is one real home. So they are
**extracted and kept as data, on a photo that no longer carries them**:
`capturedLat`, `capturedLng`, `capturedAt`, all nullable, admin-only and never
in the public projection (§2.2.2).

Three things this decision has to be honest about:

1. **EXIF is forgeable.** `exiftool` rewrites GPS in seconds. So this is a
   signal, never a verification, and the review surface must say so. It is
   the same discipline as ADR-027's refusal of a `MATCHED` badge.
2. **Which means client-reported coordinates are acceptable here**, unlike the
   Catastro answer ADR-027 refused to store. The difference is that the
   Catastro has an authoritative source we can just ask, so a client copy was
   strictly worse than a live query; photo EXIF has no authority anywhere. The
   choice is a weak signal or no signal, not a weak copy of a strong one. The
   Function extracts from whatever it receives; where the browser resized
   first and stripped them on the way, it sends them alongside.
3. **Missing coordinates are normal and must not be flagged.** WhatsApp strips
   EXIF, so do most social platforms; screenshots and edited exports have
   none; plenty of people keep location services off. Flagging absence would
   flag nearly every listing and train reviewers to ignore the column.

**Storing it is itself a privacy decision.** These are location data derived
from an owner's own photos, and an owner who uploads a shot taken at their
private home tells us where they live. Admin-only, out of every public
projection, and deleted with the photo.

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

> ⚠️ **Amended by ADR-035** (2026-07-31): the move to SWA **Standard** for
> custom auth recreated the app as **`ebrostay-home` in West Europe** (host
> `delightful-sand-063f8a703.7.azurestaticapps.net`) — West Europe accepted new
> resources again by then, dissolving the region constraint this ADR recorded.
> Data stays in spaincentral. The superseded `ebrostay-v2` resource was
> deleted — `ebrostay-home` is the only SWA (verified 2026-08-01).

- **Status:** ✅ locked 2026-07-19; amended 2026-07-20 (reuse → fresh resource); amended 2026-07-31 by ADR-035 (fresh Standard resource in West Europe).
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
     "salvo pacto en contrario"), recorded in the backlog for when the
     sub-month/exact-date model lands. (It landed: ADR-023, below.)
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
  commission cap wording. Closes the `[P][M]` billing-method backlog item
  (appendix at the end of this file), including its open sub-decision on the
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
  - The v1 spec's §5.1.1–5.1.2 (on `main`) describe the v1 whole-month
    behaviour and remain accurate **for v1** (still the live production site);
    they are no longer the v2 rule. CLAUDE.md and §4.2/§4.3 point at this ADR
    for pricing.
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

## ADR-024 — Off-market listings are `paused`, not `archived`, and reopen without re-review

- **Status:** ✅ locked 2026-07-26 (product owner: Raphael). **Amends
  ADR-014**'s lifecycle (§2.2.1); the stored value changes `archived` →
  `paused` and gains a `paused → published` "reopen" transition.
- **Decision:** A listing an owner takes off the market is **`paused`**. It is
  closed to new requests and absent from search, the listing and its history
  are kept, and the owner can **reopen** it without going back through review.
- **Rationale:** "Archived" describes what the database does; "paused"
  describes what the owner did. In a portfolio of two to six homes nobody
  retires a flat — they take it off the market for a season and put it back.
  Naming the state after the record rather than the intent was quietly
  pushing a reversible act into a terminal-sounding one, and an owner who
  reads "archive" next to a home they still own will not click it.
- **Consequences:**
  - Reopening does **not** re-enter the review queue: the listing was approved
    before it was paused and pausing changes nothing about its content.
    **Editing** while paused follows the normal rule (§2.2.1) and returns the
    listing to `pending_review`.
  - There is now no terminal state. Nothing in v2 hard-deletes a listing —
    consistent with §4.5's "no hard delete in v2 scope" for users.
  - Visibility is unchanged: `paused` documents are private to their host and
    admins, exactly as `archived` was. `status` remains the single source of
    visibility.
  - No data migration: no document has ever carried `archived`. Any writer
    added later must use `paused`.
  - Admin takedown keeps working — an admin pauses a listing; the word is
    softer but the effect on visibility is identical.

---

## ADR-025 — Pricing and availability edits apply live; only content edits re-review

- **Status:** ✅ locked 2026-07-27 (product owner: Raphael). **Amends
  ADR-014** and the `published → pending_review` row of §2.2.1, which until now
  sent *any* edit of a published listing back to the review queue.
- **Decision:** Edits split by kind, not by page:
  - **Operational** — `priceNumber`, `depositAmount`, `billsPolicy`,
    `utilitiesCapEur`, `minStayMonths`, and the availability calendar. These
    **apply immediately** and leave `status` untouched. A published home stays
    published and stays in search.
  - **Content** — everything else: name, address, coordinates, bilingual copy,
    capacity, amenities, photos, stay terms. Unchanged rule: editing a
    published listing returns it to `pending_review` and it is not public
    until re-approved.
- **Rationale:** The two edits are different acts. Review exists to check what
  a listing *claims* — that the copy is honest, the photos are of this home,
  the address is real. A number has nothing to review: an owner who drops the
  rent by 50 € is not making a new claim, and a reviewer approving it is
  rubber-stamping. Meanwhile the cost of the old rule was severe and backwards
  — adjusting a price or closing a week in the calendar would pull the home out
  of public search for as long as the queue took, so the owner's incentive was
  to leave a wrong price up. An availability block is worse still: the block
  exists *because* those dates are taken, and hiding the listing does not
  un-take them.
- **Consequences:**
  - Enforced structurally, not by a runtime diff: `PUT /api/host/properties/{id}/pricing`
    and `…/availability` accept payloads that cannot express a content or
    status change (`api/Models/HostWrites.cs`). The content editor keeps the
    generic `PUT /api/host/properties/{id}` and the re-review rule.
  - Price changes are **not retroactive.** A confirmed stay keeps the rent it
    was agreed at; the new price applies to new requests only. Payout rows are
    therefore never recomputed from the live price field (§4.4).
  - Availability writes replace the owner's `confirmed` blocks and preserve
    unexpired `hold` entries untouched — a hold belongs to the booking flow,
    and saving a calendar must not release one. Overlap validation and ETag
    optimistic concurrency are unchanged (§2.2.3).
  - A draft or rejected listing does not become published by saving a price:
    `status` is simply never assigned on these paths.
  - Abuse surface considered and accepted: an owner could bait-and-switch a
    price after approval. Mitigation is the audit trail (`updatedAt` moves) and
    admin visibility, not a review gate — the same trade every marketplace
    makes on operational fields.

---

## ADR-026 — Turnover days between stays, and who is paid for the clean

- **Status:** ✅ locked and ✅ **built** 2026-07-27 (product owner: Raphael).
  **Extends ADR-023** (which already settles utilities after
  move-out) and the availability rules of §2.2.3.
- **Context.** v2 has been modelling a stay as a half-open range and nothing
  else, which quietly assumes a home is relettable the moment the keys come
  back. It is not. Ebrostay lets homes for **months**, so a turnover is not a
  housekeeping task between two hotel nights — it is an inspection against the
  inventory, a meter reading (which ADR-023's final bill depends on), a deep
  clean rather than a turnover clean, and whatever repairs six months of
  occupancy produced. Industry practice for mid-term lets is a **2–5 day**
  gap, and a week where repainting is likely; a deep clean of an 80–90 m²
  three-bed alone runs 8–12 person-hours against 2–3 for a short let. Today
  search would happily offer a move-in on the morning the previous tenant
  moves out.

  This also corrects a vocabulary error: v2 briefly counted stays in
  **nights**, which is short-let language. The unit here is **days of
  occupancy**, and the boundary event is the return of the keys. Spanish
  practice for an *arrendamiento de temporada* is entrada/salida, never
  "noches".

### Decision 1 — `turnoverDays`, derived and overridable

- A listing carries **`turnoverDays`** (integer, owner-settable, platform
  default **3**). The days immediately following any *blocking* entry are
  treated as unavailable.
- The buffer is **derived, not stored**: it is applied inside the single
  overlap predicate of §2.2.3, so nothing on the calendar duplicates a rule
  and changing the number takes effect everywhere at once.
- A **per-stay override** — `turnoverDaysOverride` on the availability entry —
  extends the buffer for one stay when operations cannot get a cleaning team
  into the slot. Admin-set from the admin panel; the owner sees the effect,
  not the control. Absent means "use the listing's number".
- The buffer is shown to the owner as its own calendar state (**turnaround**),
  distinct from booked and from a block they closed themselves, so nobody
  wonders why those days are shut. It is invisible to guests: to a visitor
  those days are simply unavailable, and *why* a home is unavailable is not
  their business.
- The buffer never extends past a range the owner has already closed by hand,
  and two adjacent stays produce one buffer, not two.

**Rationale for deriving rather than auto-blocking:** an auto-created block is
stored data that restates a rule, and it goes stale the moment the rule or the
stay changes — the classic two-numbers-for-one-fact failure this codebase has
already paid for twice (portfolio occupancy, payout rows). One predicate, one
number.

### Decision 2 — a cleaning fee with two sources

- A listing carries **`cleaningBy`**: `"host"` | `"platform"`.
  - `"host"` — the owner arranges the clean and sets **`cleaningFeeEur`**.
  - `"platform"` — Ebrostay arranges it, and the fee is the **platform
    default**, not owner-settable. Stored as a platform setting, not on the
    listing, so it can be repriced without touching every document.
- The fee is a **pass-through, not rent**: it is **not** commissionable, and it
  does not enter the daily pro-rate. It appears in the estimate as its own
  line, the way the deposit does.
- It is charged **once per stay**, at move-in alongside the deposit and the
  service fee — not deducted from the deposit at move-out. Deducting from the
  deposit makes a routine, known cost look like a penalty for damage, and
  invites the dispute that the deposit exists to avoid.

**Rationale:** the cost is real either way — a deep clean after a six-month
stay is not absorbed by goodwill. Today it is silently coming out of either the
deposit or the owner's margin, and neither is stated to anyone. Naming it makes
the owner's payout honest and the tenant's total complete.

### Consequences — outstanding work

- ✅ **Data model (§2.2):** `cleaningBy`, `cleaningFeeEur` and `turnoverDays`
  on the property; `turnoverDaysOverride` on the availability entry (§2.2.3).
  All defaulted, so documents written before this change stay valid and pick
  up a 3-day turnaround automatically.
- ✅ **The platform fee** lives in the `PLATFORM_CLEANING_FEE_EUR` app setting
  (`api/Services/PlatformSettings.cs`, placeholder 120 €) and is resolved
  server-side: the public projection returns one already-resolved
  `cleaningFeeEur`, so a visitor is quoted a number and never learns who
  arranges the clean.
- ✅ **The buffer lives in the public projection** (`BlockingRanges`), not at
  each consumer. The search grid, the detail calendar, the estimate conflict
  check and the band all read that one list, so they cannot disagree about
  whether a home is free the day after a stay — and a guest is given dates, not
  reasons. The owner's projection stays RAW and the editor derives the
  turnaround client-side (`lib/availability.ts`), because the blocks it is
  drawing include ones not yet saved.
- ✅ **Owner writes preserve the override.** The availability payload replaces
  the owner's blocks wholesale, so an unchanged block carries its admin-set
  override back in, matched on its dates. A block whose dates moved is a
  different stay whose staffing was never agreed, and correctly loses it.
- ✅ **Pricing (`lib/pricing.ts`):** a `cleaningFee` term in `Estimate` and on
  the payment schedule's first instalment, excluded from the commission base.
  🔜 when the booking endpoint is built,
  `bookingRequests.clientEstimate`/`serverEstimate` must carry the field so the
  parity tripwire (§4.3) covers it.
- ✅ **Owner UI:** `cleaningBy`, the fee and `turnoverDays` in the pricing
  fieldset; the payout preview shows the fee as income only when the owner
  arranges the clean, and as "we arrange it" otherwise — Ebrostay's fee is
  Ebrostay's, and showing it in their payout would be inventing income.
  Turnaround is its own hatched state on the day calendar with a legend entry,
  distinct from a booking: an owner looking at a full month needs to know which
  days earned and which were the cost of the ones that did. The band counts it
  as taken rather than gaining a fourth state — a 3-day window never fills a
  month, and "partial" already says so.
- 🔜 **Admin UI for the per-stay override.** The field and its enforcement
  exist; the control does not, so today it is set by hand.
- 🔜 **Turnover days in the payout preview** as unsold inventory.
- **Admin UI:** the per-stay override.
- **Commercial note worth carrying forward:** the buffer is unsold inventory
  and it scales against short stays — 3 days costs ~1.6% of a six-month stay
  and ~10% of repeated one-month stays. That is an argument for setting
  `minStayMonths` from turnover economics rather than from the 31-day legal
  floor alone (ADR-022), and it is the owner's call per listing.
- **Not decided here:** whether Ebrostay's platform cleaning fee varies by size
  or by stay length. Flat to start; revisit with real cost data.

---

## ADR-027 — The listing editor: one diff, one save, and what it deliberately cannot do

- **Status:** ✅ locked and ✅ **built** 2026-07-27 (product owner: Raphael);
  amended 2026-07-28 (declined suggestions — see below).
  **Implements** the content half of ADR-025 and the `published → pending_review`
  row of §2.2.1. Design handoff: `design_handoff_property_edit`.
- **Context.** ADR-025 split owner editing by the *kind* of change: operational
  edits apply live, content edits re-enter review. Manage shipped the
  operational half. This is the other half — the page an owner opens once or
  twice a year to correct what the listing *claims*. The handoff also supplies
  a create-a-listing wizard sharing the same fields, so the controls are built
  page-agnostic from the start rather than extracted later.

### Decision 1 — One payload, one diff, one save bar

- The whole page is a single `PUT /api/host/properties/{id}` carrying the
  content half of the document. Manage saves per section; the editor does not.
- Rationale: on Manage each section is a **separate decision** with its own
  consequence — a price change and a calendar change are unrelated acts, and
  pairing them under one button would make an owner think about both to do
  either. Here every field feeds one review, and the owner's real question
  before saving is *"what goes back to the queue?"* — a question only a
  whole-page diff can answer.
- Consequence: exactly one `changedSections()` deep-compare against the saved
  baseline (`lib/listing.ts`), and every downstream signal reads it — the
  rail's discs, the save-bar chips, the count, the review note, the save
  button. Duplicating that comparison is how the rail and the chips start
  disagreeing about what changed.

### Decision 2 — The re-review rule is applied server-side, from status alone

- `published` and `paused` → `pending_review` on save, `reviewNote` cleared.
  `draft`, `pending_review` and `rejected` are left untouched: resubmitting a
  rejected listing is an explicit act, not a side effect of typing in it.
- The client *predicts* this in the save bar ("the listing goes back to
  review") but never decides it. A UI that computed the transition would be a
  second copy of §2.2.1.

### Decision 3 — Photos may be reordered, re-flagged and dropped; never added

- The payload's photo list is validated against the URLs **already on the
  document**. Anything else is `photo_unknown`.
- This is a security rule, not tidiness: every URL in that list renders in a
  public `<img>` on the listing page, so a payload that accepted arbitrary
  URLs would let an owner point their listing at any host on the internet.
- Position comes from the array's order, not from a client-supplied index —
  an index the client owns arrives with gaps and repeats, and the gallery
  reorders itself silently.
- Adding photos needs the API-mediated upload of ADR-019, which is **not
  built**. Until it is, the section manages the photos a listing already has.

### Decision 4 — New fields: postcode, cadastral reference, English approval

- `postcode` (5 digits, validated), `cadastralRef` (stored as typed,
  uppercased), `descriptionEnApproved` (bool).
- **The Catastro IS queried**, which supersedes this decision's first draft.
  Its free *datos no protegidos* services are public, keyless and answer with
  permissive CORS, so the editor calls them client-direct exactly like
  Nominatim (§1.1). A 20-character reference that passes the checksum is
  looked up live and the panel reports the register's own answer: address,
  postcode, built surface, use and year, plus the parcel centroid from a
  second call.
  - **Still no `MATCHED` badge.** The panel says "according to the Catastro"
    and shows what it said. "Verified" would be read as "we verified this
    listing", which is a much larger claim than "this reference names a real
    property" — and the register answers about the property, never about who
    owns it. Ownership stays with the documents.
  - **A `User-Agent` is mandatory.** Without one every endpoint, including its
    own WSDL, returns `400 No se puede procesar su petición`. A browser sends
    one automatically, so client-direct is the *lower-risk* option here — a
    Function would have to remember. Observed to fail intermittently under
    rapid use, so the fallback copy is not decoration.
  - **One automatic retry after 2 s, then a button.** The service drops
    requests with a bare `TypeError: Failed to fetch` and no pattern, so a
    single failure says very little and the honest response is to ask again.
    What is *not* retried is a refusal: a 4xx is the service answering, and an
    aborted request is nobody waiting. After two failures the panel offers
    "try again" rather than leaving the owner to nudge a field back and forth
    to force a re-query, which is what people were actually doing. The retry
    count is part of each lookup's key, so pressing it clears the failure it is
    retrying instead of leaving an error on screen beside a spinner.
  - **Rate limiting is ours to choose.** The Catastro publishes no figure, so
    `lib/throttle.ts` applies the same one request a second Nominatim asks
    for — a free government service we would rather not be blocked from. Each
    host gets its own budget; one implementation, two instances. The slot is
    reserved *before* the wait, not after: the obvious version spaces
    sequential calls and lets concurrent ones fire together, which is the only
    case that matters.
  - **Coordinates give the 14-character PARCEL**, not the 20-character unit: a
    point identifies a building, and a building holds many flats. The owner
    still supplies the six characters that name theirs.
  - Euskadi and Navarra keep their own foral cadastres and are absent from
    these services, so "not found" never proves a reference wrong.
- **The register is also asked the other way round: address → reference.** For
  the owner without the IBI receipt to hand, `ConsultaVia` lists the streets of
  Zaragoza and `Consulta_DNPLOC` lists every property at a number, each with
  its full 20 characters and its floor and door. The owner picks their flat
  from the register's own list; the reference lands in the field and the panel
  above resolves it like any other. Two requests, behind the same throttle.
  - **It is a search the owner drives, not a derivation from the address**, and
    that is forced by the service:
    - The street-type prefix is **mandatory** — a request without a `Sigla`
      fails — and unguessable: *César Augusto* is both an avenue and a square
      in Zaragoza.
    - The name must be the register's own. Case and accents are ignored, but
      the Catastro **inverts articles and surnames**: *Camino de las Torres*
      is filed as `TORRES, DE LAS`, which `TORRES` finds and `LAS TORRES` does
      not.
    Every attempt to turn typed text into a query is therefore a way to be
    confidently wrong. The address only seeds the box.
  - **But the typed street-type word is kept and used.** It cannot go in the
    search box — the register indexes names, not "Calle Movera" — so it is
    held aside and used to break a tie: Zaragoza has a Barrio Movera, a Calle
    Movera and a Diseminado Movera, and "Calle Movera 7" already names one of
    them. The word only decides between candidates whose names match what was
    typed **exactly**, so a wrong or stale mapping cannot conjure a match out
    of a different street — it just fails to help. Every word→`Sigla` mapping
    was read back off the live service (`PS SAGASTA`, `RD HISPANIDAD`), not
    guessed.
  - **The postcode is the cross-check, not a search key.** Neither service
    takes one, but `Consulta_DNPLOC` returns `dp` per property, so the
    register's postcode is compared against the listing's and a difference is
    shown. This is the only thing that catches the answer that looks right and
    is not — every Movera in Zaragoza will cheerfully return a list of flats,
    and only the postcode says which district they are in. It warns; it never
    blocks, because the listing's own postcode may be the wrong one.
  - **One match returns a different document.** Several properties come back as
    an `<lrcdnp>` list, exactly one as a whole `<bico>` record. Both shapes are
    parsed.
  - **"No such number" sometimes carries the street's real numbers and
    sometimes carries nothing** — Alfonso I answers 5 with `1, 2, 3, 4, 6, 7,
    10`, Movera answers 999 with an empty response, and `ConsultaNumero` is no
    help because it needs a number that already exists. So the two outcomes are
    separate results and the "here are the ones that do exist" heading is never
    shown over an empty list.
  - **Street-type codes are written out; floor and door codes are not.** The
    two look like the same decision and are not. `CL`/`AV`/`DS` are
    administrative codes nobody writes by hand — a Spaniard writes "C/ Movera"
    — and the chip list is where the owner is *choosing between types* rather
    than recognising their own, so they render as "Calle", "Avenida",
    "Diseminado", with an unmapped code falling through to itself. They stay in
    **Spanish in both locales**: "Calle Movera" is what the deed, the IBI
    receipt and the post say, and "Movera Street" exists nowhere.
  - **Floor and door codes are passed through, not translated.** The Catastro
    publishes no table for them, and real data returns `S1`, `BJ` and `-1`
    alongside `01`. A list whose whole job is recognition is the wrong place to
    invent a vocabulary — an owner reads their own door.
  - **The list cannot be filtered to homes.** `Consulta_DNPLOC` does not return
    `luso`, so garages, storerooms and shops appear beside the flats. The note
    under the list says so, and picking one surfaces its use in the panel
    above, which is where a garage gives itself away.
- **The check digits ARE verified**, which is a different claim and worth
  making. The last two characters of a 20-character urban reference are a
  checksum over the other eighteen, so a mistyped one is caught in the browser
  with no API call (`lib/listing.ts`, verified against the published algorithm
  and two real references). It proves the string is well-formed, never that
  the property exists — so it is a **warning, not a rejection**, and is not
  enforced server-side: rural references and the foral cadastres of Euskadi
  and Navarra are checked by other rules, and refusing a valid reference is
  worse than accepting a typo. Note the handoff's own example,
  `4721903XM7147S0001WK`, fails it — its check digits should be `BT`.
- **No tourist-licence field.** The handoff offers one; Ebrostay lets
  *mid-term* homes, so a *vivienda de uso turístico* licence is the wrong
  instrument and asking for it would suggest the wrong product.
- `descriptionEnApproved` gates **only** the description. It is the one paragraph
  read as the owner's own voice and the only one long enough for a bad
  translation to mislead; area, details and beds are short labels.
- **The owner writes both languages.** The handoff promises machine
  translation with an approval gate; the gate ships, the translation does not.
  ADR-020 keeps DeepSeek for the editor assistant, so the translate button
  drops into the same panel later with no redesign.

### Decision 4b — The owner keeps the last word; the disagreement is what review sees

- **A Catastro value is filled in only where the field is empty.** Anything the
  owner has already written is *offered* against, never replaced — the same
  rule the geocoder follows. Nothing is locked. (Coordinates were exempt from
  this and were being overwritten on every page load; see the 2026-07-28
  amendment below, which also settles what a second visit does.)
- **Because the register is often stale.** A reform nobody declared, a surface
  measured to a different boundary, a change of use still working through:
  the Catastro being authoritative about the *record* does not make it right
  about the *home*. An owner who says 94 m² against a register that says 78 may
  simply be correct.
- **So the discrepancy is the deliverable, not a nuisance.** A listing whose
  surface area disagrees with the register is exactly the kind of claim review
  exists to look at, so the differences stay on screen for the owner and go on
  to the reviewer.
- **Nothing from the Catastro is stored.** The listing keeps `cadastralRef` —
  the *question* — and both the editor and, later, the review queue ask the
  register live. Two reasons, and the second is the stronger:
  1. A stored answer is a second copy of a fact somebody else maintains, stale
     from the moment it is written — the failure this codebase has already
     paid for in portfolio occupancy and payout rows.
  2. The client is what reports it. A stored snapshot would be a claim the
     owner could forge, and a reviewer would be reading the owner's word for
     what the register said.
- **🔜 Requirement on the admin review queue** (§4.5, not built): when
  reviewing a listing that carries a `cadastralRef`, query the Catastro at that
  moment and show the comparison. Do not read a stored copy — there isn't one,
  deliberately. §4.5 lists the four signals; the important one is **`luso`,
  the register's use classification**, which the editor deliberately says
  nothing about. A reference resolving to `Comercial` or
  `Almacén-Estacionamiento` is probably not a home — but a legitimately
  reclassified property exists, and warning its owner on every visit would
  train them to ignore the panel. It is a reviewer's judgement, not a form
  validation (product owner, 2026-07-28).
- **🔜 Requirement on the create-a-listing wizard:** the cadastral reference
  should come *early and prominently*, not sit as an optional field near the
  end. It is the cheapest verification in the flow and it prefills the address,
  postcode, surface area and pin — asking for it first makes the rest of the
  wizard shorter. `CadastrePanel` is self-contained for exactly this.

### Decision 5 — What the handoff asks for that has no model, and is not faked

Each of these is a subsystem, not a control. Shipping the UI without the model
behind it would show an owner a state nothing maintains.

- **Rooms & levels, photo→room tagging, floor-plan pins.** No room entity, no
  per-photo room tag, no pin coordinates. The handoff's completeness ledger
  (`WITHOUT A ROOM`, `ROOMS PINNED`) is built on them, so the ledger reports
  what does exist instead: photo count, the API's own section-completeness
  count (the same list that gates submit-for-review, so the bar and the gate
  cannot drift), and how many bilingual pairs are complete in both languages.
- **Legal & verification documents.** 🔜 See below — this one has a shape
  worth recording.
- **"Notice to leave · 30 días".** The handoff renders it as settled platform
  policy. **No ADR decides it**, so the read-only policy block shows what *is*
  decided — the ADR-022 stay window and the 48-hour cancellation — and the
  notice period waits for a decision rather than being invented in a UI.

### 🔜 Document upload — the input for a future decision

Not built, and deliberately not stubbed: a checklist an owner can tick but
nobody verifies would show `UPLOADED` next to a file that does not exist. The
handoff's five rows are recorded here as the requirement:

| Document | Note from the handoff |
| --- | --- |
| Photo ID or NIE | Both sides, of the owner named on the deed |
| Proof of ownership | Nota simple, deed, or latest IBI receipt |
| Cadastral reference | Matches the address |
| Energy certificate | Required by law for any let in Spain |
| IBAN for payouts | Must belong to the owner or their company |

What a decision here has to settle:

- **Storage.** These are identity, ownership and banking documents. They
  **cannot** go in the `property-photos` container, which is public-read by
  ADR-019 — anyone with the URL reads it. They need a private container with
  short-lived, server-issued access, and a retention rule.
- **Who verifies.** `UPLOADED` is the owner's claim; `VERIFIED` is a decision
  someone at Ebrostay makes. That is a second admin surface, alongside the
  listing review queue.
- **Where the IBAN lives.** It is payout data about the *host*, not a fact
  about the *property* — on a portfolio of six homes it should be entered once,
  which puts it on the profile rather than in this list.
- **Legal basis and retention** under GDPR for holding ID scans at all
  (§07-legal-notes), including how long after a host leaves.

### Consequences

- ✅ `PUT /api/host/properties/{id}` (`DetailsUpdate`), `PUT …/status`
  (`StatusUpdate`, ADR-024 pause/reopen), the `HostListing` projection, and
  `HostValidation.CheckDetails`. Neither payload can express a price, a
  calendar or an arbitrary status — the ADR-025 boundary stays structural.
- ✅ Every section body is a controlled `value` / `onChange` component under
  `components/host/fields/`, page-agnostic, so the create-a-listing wizard
  composes the same controls into steps without a second implementation.
- ✅ The amenity vocabulary gains six keys from the handoff (`furnished`,
  `dryer`, `dishwasher`, `tv`, `storage`, `concierge`). The handoff's
  seventeenth chip, *Se admiten mascotas*, is **not** an amenity — it is
  `petsAllowed`, and listing it twice lets one listing answer it both ways.
- ✅ Deleting a listing is not in this build. The handoff itself asks for a
  typed confirmation; a listing carries stay history, and "keep the data,
  close the listing" is what `paused` is for (ADR-024).
- ✅ **§2.2.1's `any → paused` row narrowed to `published → paused`.** Read
  together with `paused → published` ("reopen, no re-review"), the old pair let
  an owner pause a `draft` and reopen it into `published` — self-publishing a
  listing no reviewer ever saw. Owners now pause only what is live; admins keep
  the any → any row. Reopening from a remembered prior status would need a
  `pausedFrom` field, and there is no use for one yet.
- 🔜 The `cleaning` entry in `stayTerms` now contradicts ADR-026 — it promises
  the clean is arranged *and paid* by Ebrostay, while the tenant is charged a
  named cleaning fee. It is derivable from `cleaningBy`/`cleaningFeeEur` and
  should stop being a declared per-listing term. Likewise `cancellation`: the
  editor presents it as platform-wide policy, which is what it is, so carrying
  it per listing lets one home silently opt out of a company promise.

### Amendment 2026-07-28 — an external answer is offered once, and remembered when declined

Decision 4b says a value from an outside source fills only an empty field and
is otherwise *offered*, "the same rule the geocoder follows". The geocoder did
not, in fact, follow it. This amendment fixes the defect that exposed and
settles what happens on the second visit.

#### The defect

`AddressFields` runs its lookup on mount, because a saved listing arrives with
its address already filled. It then applied the top hit through a guard that
checked only whether the owner had dragged the pin **in that session** — false
by definition on a fresh page — so the stored coordinates were overwritten
every time. Postcode and area behaved correctly; coordinates were exempted from
the gap-fill rule because there is no empty coordinate to test against, and the
exemption quietly turned "fill what is missing" into "overwrite on sight".

Observed on every seeded listing. On `EBR-P-0201` the page opened with one
unsaved address change moving the pin **5 km**, from Movera to Torrero — the
same address ambiguity the cadastral finder already catches. A geocoder never
returns stored coordinates to the seventh decimal, so a listing whose address
is perfectly good opened dirty too.

The cost is not a stray badge. `address` is reviewable, so an owner who trusted
the save bar would move their pin and pull a published listing out of the
search results, having touched nothing. `CadastrePanel` carried the identical
guard against the parcel centroid; it had simply never fired, because no seeded
listing has a `cadastralRef`.

#### Decision 1 — A pin that arrived from the server is a decision already made

Coordinates join the gap-fill rule. A listing that loads with a pin keeps it;
an outside source may only *offer* a different one, through the two-pin
comparison already built for the case where the owner placed the pin by hand.

The distinction the old guard drew — did **this session** place the pin —
was never the interesting one. What matters is whether a pin exists at all.

#### Decision 2 — Remember the answer that was declined, not the fact of declining

An offer that cannot be ended is a nag, and people end nags by pressing the
affirmative button. Storing a boolean (`pinSuggestionDismissed`) would end it
permanently, including for an answer the register genuinely changed later —
which is the one case worth interrupting for.

So what is stored is **what was declined**, and the live answer is compared
against it on every visit:

| Fresh answer vs. the declined one | Behaviour |
| --- | --- |
| Nothing declined | Offer, as today |
| Same | The owner has already ruled on this. No call to action |
| Different | A new fact, not a repeat. Offer again, and say it changed |

Shape (§2.2.4), a list on the listing document:

```jsonc
"declinedSuggestions": [
  {
    "field": "pin",              // pin | postcode | area | size
    "source": "osm",             // osm | catastro
    "value": "41.628945,-0.881226",
    "for": "Calle Movera 7, Zaragoza",
    "at": "2026-07-28"
  }
]
```

- **Identity is `(field, source)`**, and a new decline for the same pair
  replaces the old one. The list is therefore self-limiting at one entry per
  combination; the write path caps it anyway, and rejects any other `field` or
  `source`.
- **`for` is the input that produced the suggestion** — the typed address for
  OSM, the `cadastralRef` for the Catastro. When that input changes the entry
  is dropped, because a decision about the old address says nothing about the
  new one. This is the same rule the lookups themselves follow: every answer
  carries the question it answers.
- **`value` is the canonical string form of what was offered**, but the pin is
  **not compared as a string**. Two geocodes of the same doorway differ in the
  last digits, and string equality would re-offer forever — exactly the defect
  above in a new costume. The pin is parsed and compared by distance using the
  existing `SAME_PLACE_M` (25 m); everything else is an exact match.

#### Decision 3 — A declined suggestion is demoted, not hidden

Once declined the **call to action goes away entirely**. Not a smaller banner:
a quieter permanent banner is still permanent, and still gets clicked to make
it stop.

The information stays. `CadastrePanel` already lists what the register says
differently; a declined row remains in that list without its **Usar este**
button, carrying the date it was reviewed. The register's answer is never
concealed from the owner — it stops being a demand and becomes a record.

#### Decision 4 — Change detection is that same comparison, not a job

The page queries live on every load, so comparing the answer against the
declined one **is** the change detector. It costs nothing extra and fires
exactly when it is useful: the owner is on the page and can act.

A timer-triggered Function sweeping every listing is buildable and is **not
built**. Cadastral records change on the order of years, the review queue
already asks live at the moment that matters, and a background job that
notices a change nobody is present to act on has to invent a notification
channel to be worth anything. Revisit if reviewers report stale approvals.

#### Decision 5 — Declining is not a content edit

A decline **must not** send the listing back to review, and Decision 2 of this
ADR makes any save of the content payload do exactly that. So it does not ride
that payload.

- Its own endpoint, writing only this list and never touching `status`.
- It applies **live**, on the click, like an operational edit under ADR-025 —
  it changes nothing a guest sees.
- It is absent from `FIELDS`/`changedSections()` and therefore from the rail,
  the chips and the save bar. An owner dismissing a suggestion has not made an
  unsaved change.

#### Decision 6 — How this sits with "nothing from the Catastro is stored"

Decision 4b forbids storing the register's answer, for two reasons: a stored
copy goes stale, and the client is what reports it. This stores a value that
came from the register, so the tension is real and is resolved deliberately
rather than by not noticing it.

What is stored is **a record of a human decision, fingerprinted by the value it
was about** — not a fact about the property. Nothing reads it as a claim about
the home: it is never displayed as the register's answer, never compared
against by anything except the fresh live answer, and never fills a field.
Staleness is not a failure mode here; a fingerprint going stale *is the signal*.

Two guardrails, and they are the load-bearing part:

- **The review queue ignores it entirely.** A reviewer queries the Catastro at
  that moment (§4.5) and sees the disagreement regardless of what the owner
  declined. The worst a forged entry achieves is silencing a reminder in the
  owner's own editor.
- **It is shown to the reviewer as context, never as a resolution** — "owner
  declined this on 28 Jul" alongside the live comparison. A declined suggestion
  is a thing a reviewer may want to know; it is not an answer to the question
  they are being asked.

#### Consequences

- ✅ `declinedSuggestions` on the listing document (§2.2.4), projected beside
  `listing` rather than inside it, and `PUT …/declined` — which validates
  `field`/`source` against closed vocabularies, caps the list, refuses a
  repeated `(field, source)`, and cannot express a status change. `At` is
  server-stamped and preserved across an unchanged entry, so one dismissal does
  not redate the others.
- ✅ The two-pin comparison is now the *only* way an outside source moves a
  saved pin, in both `AddressFields` and `CadastrePanel`.
- ✅ `lib/declined.ts` holds the comparison, including the rule that the pin is
  stored as a string and compared by distance.
- ✅ ES/EN strings for the demoted row and for "this changed since you reviewed
  it", plus the three new error codes.
- ✅ `pinIsManual` renamed `pinIsPlaced` — it means "a pin exists", whoever
  placed it, and the old name described the question that turned out to be the
  wrong one.
- 🔜 §4.5 gains the declined-suggestion column, under the rules of Decision 6.
  The review queue itself is still unbuilt.

---

## ADR-028 — "What's nearby": measured, not typed; numbers eager, geometry lazy

- **Status:** ✅ locked and ✅ **built** 2026-07-29 (product owner: Raphael).
  Replaced the `PLACEHOLDER_NEARBY` stand-in in
  `app/lib/detail-placeholders.ts`, whose own header instructed its deletion
  once the API had fields — deleted, no remaining importers. Working notes and
  the full build-level design:
  `docs/superpowers/specs/2026-07-28-whats-nearby-design.md` — **this ADR is
  the primary record; that document elaborates it.** What the build settled is
  recorded at the end of this ADR.
- **Context.** The detail page's "What's nearby" panel shows generic Zaragoza
  facts identical for every listing, with times measured from "central
  Zaragoza" rather than from the home. It needs per-listing data, which means
  it needs an editor. The shape of that editor is the whole decision: a text
  box beside a place name invites an owner to make their flat sound closer
  than it is.

### Decision 1 — The owner chooses places; the system measures distances

- An owner picks a group, gets real places around their pin, and selects which
  the listing mentions. **They never type a distance or a duration.**
- Rationale: a number beside a place name is a promise a guest reads as fact,
  and it is the one part of a listing where the owner has both the motive and
  the opportunity to be optimistic. The same reasoning removed the "Hosted
  by …" block on 2026-07-28 — a page-level claim with nothing behind it.
- Consequence: if the routing service cannot be reached, the entry **is not
  saved**. A listing with no nearby section beats one with a fabricated
  figure. This is the one place the feature stops rather than degrades.

### Decision 2 — Distance is a walking route, not a straight line

- Figures come from a routing engine, computed **once at pick time** and
  stored on the document.
- Rationale: Zaragoza has a river. A straight line of 300 m is a 2 km walk if
  the bridge is the other way, so straight-line figures are optimistic exactly
  where the error matters most.
- Candidates are ranked using the engine's **matrix** endpoint — one request
  returns the distance from the pin to every candidate at once — so a category
  open costs one request per profile rather than one per candidate.

### Decision 3 — OpenRouteService, called from a Function, behind one seam

- Provider: **ORS**, hosted by HeiGIT. Account `info@ebrostay.com` (GitHub
  sign-in); HeiGIT permits one account per person. Key in **`ORS_API_KEY`**,
  Functions app settings only.
- **Server-side is not a preference, it is forced three times over:** the key
  cannot go in the client (§1 secrets rule); ORS requires a real `User-Agent`,
  which a browser will not let us set — the mirror image of the Catastro case
  in ADR-027 Decision 4, where the browser's automatic header made
  client-direct the *lower*-risk option; and a one-request-per-second promise
  can only be kept from a place that sees all the traffic.
- `OrsClient` is the only class that knows ORS exists. The terms may change
  "effective immediately upon posting", and self-hosting OSRM (BSD-2-Clause)
  or ORS itself (GPL-3.0, no network clause) speaks the same request shape.
- **Terms as read 2026-07-28** (`account.heigit.org/info/tos`): commercial use
  is **not** restricted; results are **CC-BY-SA 4.0**, not CC-BY; attribution
  `© openrouteservice by HeiGIT | Data from OpenStreetMap` is required
  wherever results are shown; there is **no restriction on caching or storing
  results**; repeatedly exceeding quota can disable the account **without
  notice**. Requests therefore carry coordinates and a profile and nothing
  else — no listing id, no owner id, no address string.

### Decision 4 — Numbers eager, geometry lazy, and the endpoint takes ids

- Distances are written when the owner saves. **Route geometry is fetched the
  first time anyone asks for it** and cached write-through, so each
  `(entry, profile)` pair costs exactly one call ever.
- The public endpoint is `GET /api/properties/{id}/nearby/{entryId}/route`
  and takes **`(propertyId, entryId, profile)` — never coordinates.** Origin
  and destination are read from the stored document.
- This is a security rule of the same family as ADR-027 Decision 3: there,
  photo URLs had to already be on the document because each renders in a
  public `<img>`; here, coordinates must come from the document because
  otherwise an anonymous caller could route arbitrary points at our expense on
  an account that can be disabled for overuse. Unknown ids 404 without
  touching ORS.
- Consequence: nothing a guest sees **on page load** depends on a third party.
  The figures are on the document. Only a first-ever click on a route can fail,
  and it fails to a named message beside a figure that is still correct.

### Decision 5 — Routes are referenced, not embedded

- `nearbyRoutes`, partitioned by `/propertyId` (the shape `bookingRequests`
  already uses), id `{entryId}-{profile}`, always a point read, 180-day TTL,
  index everything excluded but the partition key.
- Rationale is correctness before performance: routes are written by an
  **anonymous** lazy path while the property document is written by the
  owner's save. Embedding would make the public path read-modify-write the hot
  document, where it can clobber a save outright. That access correlation is
  also near zero — every detail page load would carry geometry almost no
  reader wants.
- The TTL is the design, not housekeeping: these are a cache, so road-network
  changes propagate with no admin work.

### Decision 6 — Reach is a map of profiles; radius is per group

- Entries store `Reach: { "foot": {…}, "car": {…} }` rather than two scalar
  pairs, so a third profile is configuration rather than a migration. The
  profile list stays **closed and validated server-side**.
- The **profile toggle belongs to the guest**, not the owner: owners choose
  places, and walking distance is the right proxy for whether something is
  genuinely nearby. The editor shows and ranks by walking figures while
  storing both.
- **Search radius is per group.** "Nearby" is 800 m for a bus stop and 10 km
  for a hospital; one fixed radius is wrong at both ends.
- **Drive time excludes parking**, and walking has no equivalent hidden cost.
  Labelled "drive", never the default. Every mapping product has this problem
  and none solves it; naming it beats shipping it quietly.

### Decision 7 — Type is a fixed translated vocabulary with a Spanish-first hatch

- The second line of an entry is a **vocabulary key**, translated once in
  `messages/*.json` under a shared `nearby.type.*` namespace used by both the
  editor and the public page. No owner translation work, and consistent
  wording across every listing.
- The escape hatch takes **Spanish required, English optional**, falling back
  to Spanish with an attention flag — mirroring `enNotApproved` (ADR-027
  Decision 4) rather than inventing a parallel state. Common misses get
  promoted into the vocabulary over time.
- Place **names are one string, not bilingual**: they are proper nouns.

### Decision 8 — Derived figures are never accepted from the client

- On save, entries are matched by id against the stored document and their
  measured figures carried over — the `kept[p.Url]` pattern of ADR-027
  Decision 3. New entries, moved entries, and **every entry when the pin
  moves** are re-measured server-side.
- Moving the pin invalidates every distance because the *origin* changed.
  Recomputing is not overwriting the owner's work — they never authored these
  numbers — but an entry that lands beyond its group's radius is now a bad
  *selection*, so it is flagged `needsCheck` rather than silently kept or
  silently dropped. This is the same instinct as the two-pin comparison, applied
  to the one case where the data is derived rather than authored.
- Entry ids are **server-generated**, like photo filenames: a client-supplied
  id would let a caller point the route cache at an entry it does not own.

### Decision 9 — The neighbourhood is one section, not two

- Detail-page sections 7 ("Where you'll be") and 9 ("What's nearby") merge.
- Rationale: the route line has to be drawn in the same viewport as the list
  that was clicked, and the two halves fix each other's weakness — a map with
  nothing to click is inert, a list of places with no map is abstract.
- `YourPlaces` is deliberately **untouched** despite computing its times as
  `km ÷ speed` on a straight line, so the page will briefly carry two
  standards of rigour. It routes to arbitrary addresses a visitor types, which
  is exactly the unbounded, guest-triggered, uncacheable workload Decision 4
  exists to avoid.

  **Superseded 2026-08-01 by ADR-039.** "Briefly" ran for four days. The two
  standards of rigour turned out to be the real cost — a typed guess and a
  measured route, in the same type, one row apart — and it is paid every time
  a guest reads the page, whereas the workload this paragraph refuses is
  bounded by five saved places and a browser-side cache. `YourPlaces` is now
  measured. What survives intact is the sentence Decision 4 actually protects:
  the origin still comes from the stored document, never from the request.

### What this deliberately does not do

- **No city-wide POI set.** Hospitals and the AVE station are shared city
  facts, but which of them are worth showing is a product question with no
  evidence yet. Owners choose first; optimise on a real decision base.
- **No timer-driven refresh of stale measurements.** `MeasuredAt` records when
  figures were computed and nothing refreshes them: Cosmos `_ts` is
  document-level, and embedded fields cannot carry a TTL. **SWA managed
  functions support HTTP triggers only**, so the eventual answer is lazy
  refresh on save, or an admin endpoint driven by a GitHub Actions cron.
- **No admin review surface** for nearby entries; it joins the Catastro check
  and the photo location check waiting on §4.5.
- **No transit or cycling profile** in v1, though Decision 6 admits them
  without a migration.

### Consequences to watch

- **Cross-instance rate limiting is awkward on Consumption**, where in-process
  throttling is per-instance and therefore no limit at all. Durable Functions
  are unavailable on managed functions, so the limiter is a Cosmos counter
  document with ETag concurrency, fronted by a candidate cache that caps
  outbound volume structurally. Retries are bounded to **one** — an aggressive
  retry against an account that can be disabled for overuse is the single most
  dangerous thing this feature could contain.
- **Local development consumes production quota**, since no ORS emulator
  exists. A fixture switch is required, both to spare the quota and because
  the failure paths cannot otherwise be tested at all.
- **The ORS account is personal**, one per person by HeiGIT's terms. An
  operational concern only if someone other than the owner has to run this.
- **Deploying `properties`'s indexing policy triggers a background reindex.**
  Task 2 gave the live, populated `properties` container its first explicit
  `indexingPolicy` (excluding `/nearby/*`, the embedded array this ADR adds).
  Cosmos runs the transformation non-disruptively in the background, but it
  is not instant — expect it on the next deploy of `infra/main.bicep`.

### What the build settled

- **The matrix returns per-destination, not per-request.** ORS answers a
  category's whole matrix in one call, but it returns `null` for any one
  destination it cannot route to (no mapped footpath, an uncrossable road) —
  that is not an outage. `OrsClient.MatrixAsync` therefore returns
  `NearbyReach?[]`, not `NearbyReach[]` (design change during Task 4's
  review): one unroutable POI drops out of that candidate's `reach` instead of
  failing the whole category. The same shape is why a place can be reachable
  on foot but genuinely absent by car, rather than showing a false zero.
- **A duplicate entry id would have bricked a listing.** Task 7's review
  caught that two entries sharing one `id` in a save payload wrote both under
  that id and made every future save of that listing throw an uncaught
  `ArgumentException` — a corrupted document with no way back. Fixed both
  ways: validation now rejects a payload that would *create* the duplicate
  (`nearby_duplicate_id`), and the save's own id lookup is built the same
  defensive way as the photo merge (`GroupBy(...).First()`, not
  `ToDictionary`), so a document that somehow already carries one is not
  unrecoverable either.
- **The type vocabulary being server-only (the pre-flight ruling, not a
  build surprise) had a real corollary: an unknown type had to degrade
  somewhere.** A type served before its translation shipped — or a
  vocabulary key the client's build predates — needed a fallback rather than
  a thrown `MISSING_MESSAGE` or a leaked raw machine key. `nearby.unknownType`
  ("Place" / "Lugar") was added to both catalogues and is now the only path
  `typeLabel()` can take for an unrecognised type, in both the editor and the
  public page.
- **Two culture bugs, one root cause, caught before they shipped.** `Cell()`
  (the Overpass cache key) and the `serviceBudget` document id both format a
  `DateTimeOffset`/coordinate into a Cosmos id — and both were originally
  written with the current culture, which is calendar-dependent (e.g. Thai
  Buddhist years) and would have scattered cache entries and budget counters
  across ids that never matched each other. Both caught in review before
  merge; the plan itself was corrected at the source so no later task could
  copy the bug forward.
- **"One unroutable POI shouldn't fail a category" has a save-time twin that
  stayed a hard stop.** A *candidate* missing a profile's figure is simply
  omitted from that profile's view. An *entry the owner is trying to save*
  that no profile can route to is refused outright (`nearby_unroutable`) —
  the ruling drawn during Task 7's review was that storing an entry with an
  empty `reach` is worse than asking the owner to pick a different place, so
  degrade-gracefully and refuse-to-save are deliberately different responses
  to the same underlying "ORS couldn't route this" fact.
- **`needsCheck` is earned by a measurement, not a save.** An early version of
  the merge logic cleared the flag on any save that happened not to touch the
  flagged entry. Fixed so the flag, like `Reach` and `MeasuredAt`, is only
  ever set or cleared by an actual re-measurement — never as a side effect of
  saving something else on the same listing.
- **Flagged entries stay visible, by ruling.** A `needsCheck` entry (one that
  re-measured beyond 1.5× its group's radius after the pin moved) is not
  hidden from the public page: the figure is accurate, and silently dropping
  a place the owner chose to mention would be a worse failure than showing an
  honest number for something a bit far. It is a signal for the owner and a
  future admin surface, never a suppression.
- **The client keeps no copy of the type list, so the editor has to survive
  its own network call failing.** `GET /api/nearby/vocabulary` is cached an
  hour server-side, but the very first load still depends on it; the section
  shows its own retry state rather than the editor assuming a static list
  that no longer exists on the client.
- **The neighbourhood merge (Decision 9) surfaced a second standard living
  next to the new one.** `YourPlaces` still computes `km ÷ speed` on a
  straight line for guest-typed addresses. Left as-is per the ADR — it solves
  a different, unbounded problem (arbitrary destinations, not a fixed list of
  owner-picked places) that the lazy-route design is specifically built to
  avoid taking on. **Closed 2026-08-01 by ADR-039**: the second standard was
  the more expensive of the two problems, and it is now measured.
- **⚠️ The account's first real call surfaced a build defect that fixtures
  structurally could not catch.** Task 13 ran the full verification list with
  `ORS_FIXTURES` unset — the first time any request actually left the process
  for ORS. Every one of them failed: `OrsClient.SendAsync` throws
  `System.FormatException` while *building* the named `HttpClient`
  (`Program.cs`, the `"ors"` registration), before a single byte reaches the
  network. The cause is `c.DefaultRequestHeaders.Add("Authorization", key)` —
  `HttpHeaders.Add` validates a known header against its typed parser, and
  `Authorization` is parsed as `AuthenticationHeaderValue` (`scheme
  credential`); ORS's bare key has no scheme token, so the parser rejects it
  every time, for any key. **Fixture mode could never have exercised this**:
  `Fixtures` returns before `MatrixAsync`/`RouteAsync` ever call
  `factory.CreateClient("ors")`, so the one code path real traffic must take
  was never built, let alone run, until this task set `ORS_FIXTURES` unset for
  the first time. Confirmed reproducible (100%, not a flaky network symptom)
  and confirmed to cost nothing against the real account: `OrsBudget` still
  increments before the throw, so the local counter moved, but no request ever
  left the machine. **Reported and left unfixed for one round** ("report it
  and stop" rather than patch production code unasked), then **fixed on
  explicit instruction, same task**: `Add` → `TryAddWithoutValidation`, with a
  comment on the line naming the exact failure mode so a future "tidy" doesn't
  reintroduce it. Confirmed live afterward against the real account: a real
  Overpass candidate search returned real Zaragoza bus stops with real ORS
  matrix figures; the resulting route's decoded polyline had 5 points for the
  walking profile and 3 for driving, with **the walking segments' bearings
  swinging 212° → 120° → 211° → 121°** against a **127° straight-line
  bearing** origin-to-destination — a real routed path bending around a
  block, not a 2-point interpolation; moving the pin ~5 km and re-saving
  re-measured the same entry to 8,404 m / 101 min on foot and correctly set
  `needsCheck: true` (beyond 1.5× the transport group's 800 m radius); the
  second click on an already-drawn route cost the browser 0 bytes
  (`transferSize: 0`) against 364 on the first. Recorded here rather than
  silently patched, because the ADR is the place this class of gap belongs:
  code review, and 12 tasks of fixture-mode testing, are not a substitute for
  exercising the seam a design ADR calls "the ONLY class that knows
  OpenRouteService exists." A network double proves the code that talks to the
  double; it does not prove the code that talks to the network.
- **The pin can move under an open finder, and everything on screen was built
  as if it could not** (found 2026-07-29, in use). The server side was right
  all along — a moved pin clears every `reach`/`measuredAt`, re-measures all
  entries in the same save, recomputes `needsCheck`, and drops the route cache
  — but three client surfaces still showed the old pin's world:
  - `NearbyMap` created the home marker inside its mount effect and never
    touched it again. `[home.lat, home.lng]` was in the deps, which read as
    "react to the pin moving" and did nothing of the kind: the effect's own
    `mapRef.current` guard returns immediately on re-run. `LocationPicker` had
    solved this correctly from the start with a `setLatLng` effect on
    `[lat, lng]`; the newer map simply did not follow it.
  - The candidate list outlived the pin it was searched around, so places
    found near the old address were drawn against a home marker at the new
    one — a picture of distances that were never true. `Search`'s `ready`
    variant now carries the pin it was fetched for and staleness is *derived*
    (`visibleSearch`), never synced through a `setSearch` in an effect.
  - Nothing said the figures were stale before the save that fixes them. The
    `needsCheck` flag is earned by a re-measurement, so between moving the pin
    and saving there was no signal at all — the numbers simply kept rendering.
    A note now says so, driven by the page's diff against the saved pin.

  The common root is worth naming: the pin was treated as an initial
  condition by everything downstream of the address section, when it is a
  value that changes mid-session.
- **Discovery was measured for the first time on 2026-07-29, and three of its
  four assumptions were wrong.** Decision 6 settled a radius *per group*, and
  the search took that to mean one radius, one element type and nearest-N. An
  owner reported seeing "dozens of bus stops, no tram or train"; probing
  Overpass directly explained all of it and more.
  - **One radius per group is too coarse.** For Pedro II el Católico 3 the
    nearest tram is 1705 m and for Movera 7 the nearest station is 1172 m —
    both outside transport's 800 m, so neither was ever fetched. A bus stop
    at 800 m is a fact about the street; the tram is a fact about the city.
    Radius is now per TYPE where it differs (tram 2500, rail 3000), and
    `RadiusMetres(group, type)` is also what `needsCheck` measures against —
    against the group's 800 m, every tram stop would be flagged the moment it
    was saved.
  - **Nearest-N is a popularity contest the densest type always wins.** Within
    800 m of that same listing there are 38 bus stops, 11 bike shares, 5 taxi
    ranks and one railway station; the nearest 20 were 15 bus stops, 4 bike
    shares and a taxi rank. Delicias, 595 m away and well inside the radius,
    placed about 24th. Per-type quotas now cap each type, as HARD caps — a
    first attempt kept a fill pass for the leftover slots and measurement
    showed it restoring the original 17-bus-stops-of-30 answer, which is a
    decision made and then undone in the same method.
  - **`node` alone cannot see a park.** Within 2 km there are 38 named parks
    and 92 swimming pools, and every one is an OSM *way* — the outdoors group
    had never once returned a park. Area-mapped features are now queried with
    `nwr` + `out center`. Selectively, though: food returns the identical 91
    elements either way and takes ~1.3 s as `node` against ~7.5 s as `nwr`.
  - **A gym was in no group at all.** `leisure=sports_centre` is the sports
    complex; a gym carries `leisure=fitness_centre`, which nothing queried.
    Added as type `gym`, and the group is now "Sport & outdoors" — it holds
    pools, sports centres and gyms, so "Outdoors" was already inaccurate.
  - Overpass gets **three attempts** now (700 ms, 1.4 s; 3 s for a 429, which
    is its slot limiter rather than a busy moment). One in three identical
    small queries returned 504 during sampling, and the group an owner most
    often saw fail — food — was simply the heaviest query. Its radius is also
    down from 1000 m to 600 m.
  - The candidate cache cell carries a **version** (`v5|…`). Cells live 30
    days, so without it a widened radius would reach an already-visited
    neighbourhood a month late, and only the neighbourhoods nobody had opened
    would get the fix.
  - The editor shows **three per type** with "Show N more places". Client-side
    on one payload, not a paged endpoint: an ORS matrix costs the same single
    request whether it carries 20 destinations or 30, so paging would double
    what browsing spends against the 1,500/day ceiling for nothing.
  - A second chip row **filters to one found type** — "All 30 · Supermarket 7
    · Market 7 · Bakery 8 · Corner shop 8". Quotas fixed what the search
    *returns*; this fixes what the owner can *reach* in it, because one
    distance-sorted list still buries whatever is naturally furthest away —
    corner shops are on every street and the supermarket, the one worth
    naming, sits at the bottom under a dozen of them. Chips exist only for
    types this search actually found, so no chip ever empties the list, and
    the row is hidden below two types. Selecting a type lifts the three-per-
    type cap entirely: with one type on screen there is nothing left to bury,
    and answering "show me supermarkets" with three of them and a button
    would be the same burial in a smaller box.
  - The map **re-frames itself** when the filter changes, and only then. Per-
    type radii made this necessary rather than nice: a view framed for bus
    stops (800 m) has the stations off-screen, and one framed for stations
    (3 km) has every bus stop in one unreadable clump. Measured on Pedro II
    el Católico 3, the fit now lands on **z15 for bus and bike share and z13
    for tram and rail** — a 4× scale change — with every pin inside the
    viewport in each case. The trigger is a caller-supplied `fitKey` naming
    the QUESTION the pins answer (search, group, type, expansion), never the
    pin arrays themselves, so clicking a row, drawing a route or adding a
    place still leaves the view exactly where the owner put it. Chosen pins
    are excluded from the bounds: they are not type-filtered, so one saved
    tram stop 2 km out would stretch a bus-stop frame back to uselessness.
  - **The editor memoizes candidate lookups on the exact pin and group.** A
    category open costs two matrix requests (one per profile), and the search
    re-ran on every finder reopen and every revisited group: Transport →
    Groceries → Transport → Groceries, close, reopen was 5 lookups = **10
    matrix requests**; measured in the browser it is now 2 lookups = 4. The
    pin is NOT rounded the way the server rounds its Overpass cell — that
    rounding is exactly what Decision 2 refuses for a measurement, and a
    full-precision key needs no such compromise: a hit is the answer the
    server would have given. Successes only, so the retry button still
    retries; module-level, so it dies on reload rather than needing an
    eviction policy. It does nothing for a second owner, a second listing or
    a reload — a server-side matrix cache keyed the same way would, and stays
    open alongside the budget question below.

---

## ADR-029 — The guest page answers to its own owner in every lifecycle state

- **Status:** ✅ locked and ✅ **built** 2026-07-29 (product owner: Raphael).
  **Amends the "Public projection" rule of §2.2** ("published docs only"),
  which until now described `GET /api/properties/{id}` exactly.
- **Context.** An owner submits a listing and cannot look at it. The guest
  page 404s on anything but `published`, so "View as guest" was disabled in
  the manage bar and the portfolio row, and the `review` row's own primary
  button — labelled **View submission** — was a disabled button that had
  never been able to show a submission. The gap fell hardest exactly where an
  owner most wants the page: while review holds the listing they just sent,
  and while a `rejected` listing waits for them to understand what the
  reviewer saw.

### Decision 1 — One exception, resolved from the principal, and nothing wider

- `GET /api/properties/{id}` returns the **ordinary public projection** to the
  owner of that listing in any state, marked with `previewStatus`. Ownership
  is `doc.hostId == principal.userId`, read from `x-ms-client-principal` in
  the Function (§3.4) — the same rule the host endpoints use.
- The **list** endpoint is untouched. Preview is per-URL and never puts an
  unpublished listing into search results, where the owner is not the only
  reader.
- Nothing about the *body* changes: an owner previewing sees precisely the
  public projection, because a preview that differs from the page it predicts
  is not a preview. `previewStatus` is the sole addition, and it is `null` on
  every read a guest can perform.

### Decision 2 — Everyone else gets the same flat 404, not a challenge

- Anonymous callers and signed-in non-owners get **404**, byte-identical to
  the answer for an id that never existed. Not 401, not 403.
- Rationale: ids are guessable and the URL is public. A 401 on one id and a
  404 on another is an existence oracle — it tells a stranger walking the id
  space which listings are real but withheld, which is precisely the fact the
  unpublished states exist to keep. An authentication challenge is a worse
  leak than the page it protects.

### Decision 3 — `no-store` on the preview response only

- The preview body carries `Cache-Control: no-store`; the published response
  is left as it was.
- Rationale: this is an owner-specific body on a URL that is otherwise public,
  anonymous and cacheable. Any shared cache between the Function and the
  browser that kept it would serve one owner's unpublished listing to whoever
  asked next. The published path has no such hazard and gains nothing from
  the header.

### Decision 4 — The page says why, and says it without a second request

- `PreviewNotice` renders above everything from `previewStatus` alone, in the
  words the portfolio already uses for that state (`bucketOfStatus`).
- It is deliberately **not** merged into `OwnerBar`, which establishes
  ownership by fetching the caller's own portfolio and swallows failures. The
  bar may silently not render; "nobody else can see this page" may not. One
  comes from the payload that drew the page, the other from a request allowed
  to fail — so they stay separate components.
- Tone follows `Badge.tsx`'s semantics (amber = waiting on review, danger =
  rejected) rather than the portfolio pill's river-for-review, because the
  notice sits directly above the river-toned `OwnerBar` and two soft blue
  boxes in a stack read as one repeated thing.

### Decision 5 — Reviewers are not owners, and are not in scope

- Admins get no preview here. There is no review queue yet; when there is, it
  reaches the same seam by widening the ownership test in one function, and
  that is the moment to decide whether a reviewer sees `previewStatus` too.

### Amendment (2026-08-01) — the routes the previewed page draws, too

- **Context.** Decision 1 named `GET /api/properties/{id}` and only that. The
  two anonymous route endpoints the same page calls —
  `GET /api/properties/{id}/nearby/{entryId}/route` (ADR-028) and
  `GET /api/properties/{id}/place-route` (ADR-039) — kept deciding on status
  alone, so an owner previewing a `pending_review` listing got the page and
  then a **404 on every route in it**. The guest page reads that 404 as "this
  place's route isn't available anymore", so the preview told its owner each
  of their own places had been removed.
- **Decision.** Both route endpoints extend the same exception to the same
  owner, on the same terms: the ownership test is `ListingVisibility`, shared
  with `PropertiesFunctions.Get` so the two surfaces cannot drift apart again,
  and Decision 3's `no-store` applies to a preview route exactly as it does to
  a preview body.
- What does **not** change: which statuses are public. The route surface has
  always served a `paused` listing to everyone (a guest holding the link
  should not watch their routes break) and the detail endpoint has always
  served `published` only. That difference is deliberate; only the owner half
  is shared.
- **Cost, accepted:** previewing an unpublished listing spends ORS quota, and
  `RouteCache` writes those routes to Cosmos before the listing is public.
  Both are the same spend the listing incurs the moment it publishes, brought
  forward — and a preview that cannot draw a route is not a preview.

### Consequences

- Three controls that were disabled placeholders became real links:
  `ContextBar`'s "View as guest" in every state, the portfolio row's
  "Preview" on `changes`, and the `review` row's "View submission".
- **OD-5 is unaffected.** This changes who may *look* at an unpublished
  listing, not what the public sees while an edit is in review — the question
  of whether the prior published version stays live is still open.

---

## ADR-030 — "Add a property": a wizard over the editor's own components

- **Status:** ✅ locked and ✅ **built** 2026-07-29 (product owner: Raphael).
  Completes steps 1 and 4 of the lifecycle §4.4 has described since v2 began
  ("Create listing → `draft`", "Submit → `pending_review`") and never had a
  route or an endpoint for.
- **Context.** A listing could be edited, priced, paused, previewed and
  reviewed — but not *created*. There was no `/host/new`, no
  `POST /api/host/properties`, and `CheckStatus` accepted only
  `published ⇄ paused`, so nothing an owner could press brought a listing into
  existence or put one in front of a reviewer. Both "Add a property" buttons
  on the portfolio were rendered `disabled`. Every home in the system arrived
  by seed script.

### Decision 1 — The wizard owns no fields

Nine steps, and every one but Paperwork is a step-shaped wrapper around a
component in `app/components/host/fields/` that the editor already uses. The
wizard holds **one draft `HostListing`**, plus a `HostPricing` and a
`HostRange[]`, and hands the whole object to each step — which is the shape
those components were written for, and said so in their comments a year before
this page existed.

The alternative — a create form with its own fields — would have been a second
place to spell every rule the editor already spells: the geocoder's
proposal-not-overwrite posture, the cadastral tri-state, the sequential
uploader, the English approval gate. Two spellings of one rule diverge on the
first bug fixed in only one of them.

**Consequence:** a change to any field component lands on both surfaces at
once, and neither page can drift into asking for a home differently than the
other asks about it.

### Decision 2 — The document is created on leaving step 1, not on arrival

`POST /api/host/properties` takes **no body** and mints an empty owned
`draft`. It is called when the owner completes the address step.

- Not on arrival: an owner who opens the page and closes the tab would leave
  an empty `Draft` row in their portfolio, and the portfolio is a list of
  homes, not of intentions.
- Not later: photo uploads are live writes that need a real id (ADR-019), and
  the promise on screen — *"DRAFT · SAVED AS YOU GO"* — has to be true before
  the owner has typed enough to mind losing it.

`MaxOpenDrafts = 8` bounds what one button can create. It is not a limit on
how many homes anyone may list: finishing a draft frees its slot.

**A draft may be nameless, and only a draft.** The wizard asks *where* before
it asks *what to call it*, so its first save carries no name — and
`CheckDetails` used to reject that outright. The rule now applies to every
status but `draft`, which puts it on the line the two check sets already draw:
an empty name makes a listing **incomplete**, which `HostProjection.Sections`
counts and submit enforces; it does not make the payload **unsafe**.

### Decision 3 — Submit is a status transition, gated by the same eleven checks the progress bar counts

`PUT …/status` accepts `pending_review` from `draft` or `rejected` alone, and
only when `HostProjection.SectionsDone(doc) == SectionsTotal`. That function
already existed and already fed the portfolio's draft progress bar; making it
the submit gate is what stops a bar reading 11/11 from coexisting with a
submit that bounces.

Resubmitting **clears `reviewNote`**: the note explains a rejection, and the
owner has just changed the thing it was about.

Hosts still never write `published` (ADR-024, §3.5). Nothing here is a new
power — it is the one transition an owner always had on paper.

### Decision 4 — Blocking belongs at submit; steps gate only what the next step needs

Two different questions, and the handoff conflated them. A step gates on what
makes the *following* steps work — an address before the nearby search that
measures from its pin, a pin before photos are worth taking — and everything
else is reported at submit by `blockersOf` from `lib/listing.ts`, the same
list the editor's save bar shows. Unmet requirements surface on the **rail**,
never in a modal: a wizard that stops you at step 4 for something you meant to
do at step 8 is a wizard you fight.

Photos and Nearby carry a **skip** link. It advances exactly like Continue —
the difference is permission, not behaviour.

### Decision 5 — Saved on leaving a step, not on every keystroke

The handoff asked for autosave "on every field change". A content `PUT` is not
a cheap write: it re-measures every nearby entry when the pin has moved
(ADR-028) and it is the call that moves an approved listing back into review.
Fired per keystroke it would be both.

So the draft persists when a step is **left** — Continue, Skip, a rail jump,
or Save and exit — through the same three endpoints the editor and Manage use
(`PUT …`, `PUT …/pricing`, `PUT …/availability`). Photo uploads remain the
exception they already are: bytes are stored the moment they arrive.

### Decision 6 — Nearby is a step, and Paperwork is a picture of one

**Nearby** joins as a skippable step directly after Address, where the pin it
measures from has just been placed. It is in `SECTIONS` for the editor and
`NearbyEditor` ships; a listing created without it would go live missing the
section ADR-028 built.

**Paperwork** ships inside its `NOT BUILT YET · DESIGN INTENT` frame, exactly
as the prototype marks it. There is no document model, no upload endpoint and
no terms record — so the five rows are inert and submit does not require them.
It is shown rather than dropped because the five documents are what an owner
will be asked for, and knowing that at the point of listing is worth more than
a tidy page. It is the one place in the product where design intent is on
screen, and it is labelled as such.

### Decision 7 — One nav, extended, not a second one

The step rail is `SectionNav` with an `onSelect` prop and a
`done`/`now`/`ahead` disc set. That component already climbs rail → bar →
sheet by **measuring** whether the row fits rather than by guessing a
breakpoint, which is what makes it right in both languages; the wizard's rail
has the same problem and would have solved it the same way. A copy would have
undone the consolidation that produced it.

### What this deliberately does not do

- **No reference until the listing is real.** `EBR-P-####` is what an owner
  quotes at us in a support thread, and a draft nobody has looked at has
  nothing to quote. Both surfaces already render the no-reference case.
- **No documents, no terms record, no `MATCHED` badge** — see Decision 6 and
  ADR-027.
- **No bulk import and no duplicate-a-listing.** "Add another home" restarts
  the same single-property wizard.

### Consequences

- Both disabled "Add a property" buttons became real links to
  `/{locale}/host/new`.
- `HostProjection.SectionsDone` is public: one function answers "how complete
  is this listing" for the progress bar and for the submit gate.
- A `rejected` listing now has a way back into the queue from the owner's
  side, which ADR-029 gave them the ability to *look* at but not to act on.

---

## ADR-031 — No turnaround after the owner's own use

- **Status:** ✅ locked and ✅ **built** 2026-07-29 (product owner: Raphael).
  **Amends ADR-026**, which applied the `turnoverDays` buffer to every
  blocking range without asking what the range was.
- **Context.** An owner closing a weekend for themselves watched the calendar
  hatch a turnaround after it — days made unsellable for a clean nobody will
  staff. The buffer pays for what a TENANT stay leaves behind (the deep clean,
  the inspection, the meter reading, possibly at the platform fee); after the
  owner's own use, none of that is scheduled, no fee is charged, and the owner
  answers for their own home's state. The blanket rule was also mildly
  self-defeating: an owner who noticed could shorten the block by the buffer
  length, beating the rule while making the calendar less honest.

### Decision 1 — Blocks carry a `kind`, and the server decides it

`AvailabilityRange` gains `kind`: `"own_use"` carries no turnaround, `null`
is a stay and keeps the full ADR-026 buffer. The owner's availability
endpoint **stamps** it, never accepts it: a span already on the document
keeps what it was (the same span-match that preserves the admin's
`turnoverDaysOverride`), and a span the owner writes for the first time is
their own use — the only thing that endpoint can express. Stays arrive by
seed or by Ebrostay, labelled `null`, and keep their buffer through any
number of owner calendar saves.

**Null is the safe default on purpose.** Every block predating the field is
treated as a stay: an unlabelled block over-blocks a few days rather than
letting a tenant into a home nobody prepared. No migration.

### Decision 2 — Said before the dates are picked

The close-dates control carries the warning up front: *"Dates you close
yourself get no turnaround days, and we don't arrange the clean after them.
If a stay starts right when they end, the home has to be ready."* The rule
without the sentence would trade one surprise (phantom blocked days) for a
worse one (a tenant at the door of an unprepared home, and an owner who was
never told that was now their job).

### What this deliberately does not do

- **No kind picker.** The owner is not asked "is this a stay or own use?" —
  everything they can write through their own calendar is own use, because
  Ebrostay owns every tenant conversation (§4.3) and therefore every stay.
  An owner recording a stay by hand is the platform's data-entry gap
  (§4.5's missing stay record), not a case to design an owner control for.
- **The admin override still outranks both kinds**, so a real edge case —
  own use that does somehow need staffed work after it — has an escape hatch
  that already existed.

### Consequences

- `PublicProjection.Turnover` (C#) and `turnoverOf` (client) both apply the
  kind; `lib/availability.test.ts` pins the two-sided contract.
- The band and day calendar draw no turnaround hatch after own-use blocks —
  including in the seconds before a new block is saved, which is why the
  editor stamps its local copy too.
- **Open, deliberately:** whether the turnaround should skip or extend over
  weekends and public holidays. The buffer is calendar days today; a 2-day
  turnaround ending on a Saturday is staffed by nobody. Parked as OD-6.

---

## ADR-032 — The listing description is a closed rich-text schema, not HTML

- **Status:** ✅ locked and ✅ **built** 2026-07-30 (product owner: Raphael).
  Carries the design at
  `docs/superpowers/specs/2026-07-29-rich-text-editor-design.md` (D1–D14) into
  the log, plus two decisions made during implementation. **Amends ADR-027**
  (the editor's one-diff-one-save shape and the English approval gate, both
  preserved) and **ADR-019** (the photo pipeline; the upload endpoint stays
  the only way bytes reach Blob Storage).
- **Naming.** This ADR was written while the field was called `copy`. It was
  renamed to `description` by **ADR-034** and the text below has been updated
  to the current name; the decision itself is unchanged. Where the *legacy
  stored shape* is discussed, the old name is kept deliberately — a document
  written before ADR-034 really does carry `copy`.
- **Context.** `description` was a plain `{ es, en }` string pair, rendered on the
  guest page as one `<p>`. An owner describing a kitchen could not show it,
  and an owner mentioning the tram could not point at the stop the listing
  already knows the walking time to. `description` becomes a pair of ProseMirror-style
  JSON documents, drawn from a **closed set of node types** — two of which are
  references into data the listing already holds (its photos, its nearby
  entries) rather than free text.

### Decision 1 — Tiptap (ProseMirror), headless, MIT

The schema *is* the allowlist and *is* the data structure: a document cannot
hold a node the schema has no definition for, so pasting from Word, from a
competitor's listing, or from a crafted page all produce the same result —
everything representable survives, everything else is dropped at the door,
with no filter to keep in step with the attack surface. Headless matters
because the editing surface then uses our own Tailwind tokens rather than
fighting a vendor's chrome. Rejected: Lexical and Plate/Slate (thinner ground
under the schema, capability neither needs); Quill/TinyMCE/CKEditor (not
headless, and paid-or-GPL).

### Decision 2 — Store the ProseMirror JSON document. Never HTML

No HTML string is built, on either side, at any point. `@tiptap/html`'s
`generateHTML` is deliberately unused. The injection sink — `<script>`,
`<iframe>`, `javascript:`, `data:`, `onerror=`, the mXSS family — does not
exist rather than being filtered. `dangerouslySetInnerHTML` still appears
exactly once in the app (`app/app/not-found.tsx`, the pre-paint theme
bootstrap, project-authored content only); this feature adds no second use.

### Decision 3 — `description` only. `details`, `beds`, `priceNote` stay plain

`details` is short, factual, and read on the detail page as a table rather
than as prose — the reason ADR-027 leaves it ungated is the same reason a
formatted block there would undermine it. Other surfaces get a slimmed-down
variant later; not designed here (§13 of the design).

### Decision 4 — Replace the description's shape outright. No compatibility field, no migration

ADR-016's fresh start already paid for this. A new document field kept beside
the old string field as a
fallback would outlive everyone who remembers why it exists, and would keep
the old shape writable — and therefore validated — forever. The seed
regenerates instead of converting; see "Re-seeding is not optional" below.

### Decision 5 — References store an id, resolved at render

A photo reference holds a URL already on the property document; a place
reference holds a `nearby[]` entry id. Names and distances are read from the
stored records at render time, never carried in the reference itself — a
place chip is bilingual for free, and a measured distance cannot be inflated
by the text. Same posture as ADR-028 Decision 8 (reach figures are measured,
never client-supplied).

### Decision 6 — No links

`href` does not exist anywhere in the schema — not rejected, unrepresentable.
No URL to validate, no scheme allowlist, no `rel` policy, no link-spam queue.

### Decision 7 — Six block types, four reference types, two marks. Closed

`doc`, `paragraph`, `heading` (level always 3), `bulletList`/`orderedList` +
`listItem`, `callout`. Reference/atom nodes: `photoFigure`, `placeCard`
(block-level) and `photoRef`, `placeRef` (inline). Marks: `bold`, `italic`.
Nothing else — no colour, font, size, alignment, highlight, table, code
block, rule, blockquote-as-quote, image-by-URL, embed, or iframe. Anything
absent is absent because it was decided against, not overlooked.

### Decision 8 — Invalid documents are rejected, not repaired

`HostValidation.RichText` (`api/Models/HostWrites.cs`, mirrored by
`validateDoc` in `app/lib/rich-text.ts`) walks the tree and refuses on the
first failure with one of ten error codes. Silent repair would delete an
owner's words with no explanation; the editor makes every one of these
states unreachable through normal use, so a rejection means a bug or
tampering, not a legitimate edit gone wrong.

### Decision 9 — References validate against the *incoming* photo and nearby arrays

Not the stored ones. One save can both delete a photo and reference it in the
same payload; validating against the document already on file would let a
dangling reference through while the photo pipeline deletes the blob
underneath it.

### Decision 10 — `HiddenFromGallery`, negative, defaulting to `false`

Not `InGallery`. **A C# `bool` defaults to `false`, and no stored Cosmos
document carries this field at all** — every property written before this
feature simply lacks it. A positive `InGallery` flag would deserialize
missing-field-as-false on every one of those documents and **empty every
gallery on the site** the moment this shipped. The negative name reads worse
and fails safe; the failure mode of a bool nobody thought to set is
"nothing is hidden," which is what every pre-existing listing already is.

### Decision 11 — "Used in the description" is derived, never stored

It is a fact about the document body (`referencedPhotoUrls`/
`referencedEntryIds` walk it live). Storing it would be a denormalised copy
that goes stale on the next edit, with a reconciliation bug to then go own.

### Decision 12 — The callout is "Good to know," styled as an aside

Labelled, not iconography-heavy or alert-coloured. The callout is
structurally the most authoritative element an owner can place on the page;
stay duration, pets, smoking and check-in are all fields the booking engine
already enforces (ADR-022, the `terms` section), and prose that contradicts
them is a dispute with our own UI as evidence. ADR-027's re-review on
content edits is the backstop; the styling decides how often it fires.

### Decision 13 — The guest page downloads no editor code

`app/components/ui/RichText.tsx` is the renderer: ~80 lines, zero
dependencies, imports no Tiptap. Tiptap loads only inside the authenticated
host editor (code-split). Verified by grepping the static export (§11.9 of
the design; confirmed clean for `/property` in Task 11's report).

### Decision 14 — Two checkpoints: the style book, then the vertical slice

The schema and the two components (`RichTextEditor`, `RichText`) are
identical either way; the style-book page (`/design`, fixtures only, no API,
no persistence) exists so the node set could be judged before the C# validator
was written against it — changing the schema after that point would mean
writing the validator twice.

### Decision 15 — The server remaps client-minted nearby ids into the description on save

`NearbyEditor` mints client temp ids (`local-…`) for a place added in the
same edit that also mentions it. `HostFunctions.cs` assigns each unknown
entry a fresh **server** id on save and discards the temp one — but the
description validator (Decision 9) builds its reference set from the
*incoming* payload, so a `placeRef` to a just-added place passes validation,
is stored holding the now-discarded temp id, and matches nothing ever again.
Silent orphaning on the single most ordinary flow there is: add a place,
mention it, save. Photos are unaffected — a photo's identity is a URL the
server assigns at upload and never re-mints.

**The fix:** while rebuilding the nearby array, the server records
`incoming id → final id` for every entry it newly generates, then rewrites
`placeRef`/`placeCard` `entryId` attributes in both `Description.Es` and `Description.En`
through that map before storing — after validation, which still runs against
the incoming ids, so a reference to an entry absent from the payload entirely
is still rejected with `description_place_unknown`.

**Why this does not violate Decision 8 ("reject, never repair").** Decision 8
protects the owner's *words* — silently deleting or altering prose is what it
forbids. This rewrites an identifier the server itself minted a moment
earlier, to point at the entry the owner actually chose; the prose is
untouched and the reference keeps its meaning, whereas leaving the temp id in
place would silently lose that meaning instead. **Why not accept the
client's id instead:** ADR-028 makes entry ids server-generated specifically
so a caller cannot point the route cache at an entry it does not own; the
remap works with that rule rather than around it. Full reasoning:
addendum to `docs/superpowers/plans/2026-07-29-rich-text-editor.md`,
2026-07-30.

### Legacy plain-string `copy` throws, not degrades — re-seeding is not optional

A property document still holding the old `{ es: "…", en: "…" }` string pair
cannot deserialize into `BilingualDoc`: Newtonsoft.Json (the Cosmos SDK's own
serializer, not `System.Text.Json` — `Ebrostay.Api.csproj`) throws reading
the `Description` property, which takes the **whole** document read down with it.
That is not confined to the one listing's own detail page: `PropertyGet`
point-reads a single id, so it only cost that listing a 500 — but
`PropertiesFunctions.List` ran the identical deserialization inside its feed
loop with no per-document isolation, so the same throw took the entire
public listings endpoint (`GET /api/properties`) down with it, every
published listing along with the one that was actually bad. `List` now
catches a per-document deserialization failure, logs it, and skips just that
document (see its own comment); `PropertyGet` has no equivalent and still
hard-fails that one listing's detail page, which is the narrower, correct
blast radius for a point read. Decision 4's "no migration" is therefore
conditional on **every environment that holds one being re-seeded**:
`infra/seed-source.json` / `infra/local-bootstrap.mjs` locally, and a
re-seed of the staging listings as an explicit deployment step before the
API carrying `BilingualDoc` ships — staging must not be deployed to first.

### What this deliberately does not do

- No machine translation between the two documents (ADR-020 still owns plain
  translation; a reference-preserving document translation is harder and not
  started).
- No plain-text projection of `description` for SEO, cards, or search — nothing
  consumes plain text today.
- No CSP `globalHeaders` — worth doing, independent of this feature, and
  `app/public/staticwebapp.config.json` still ships none.
- No slimmed-down rich-text variant for other surfaces — designed against a
  real second surface when one exists, not guessed at here.

### Consequences

- `PropertyDoc.Description` is `BilingualDoc?` (`api/Models/PropertyDoc.cs`), not
  `Bilingual?`. `Bilingual` itself is untouched — `Details`, `Beds`,
  `PriceNote` keep using it (Decision 3).
- `PropertyPhoto`, `PhotoWrite`, `PublicPhoto`, `HostPhoto` all gain
  `HiddenFromGallery` (Decision 10); every cover-photo pick and every gallery
  filter across the codebase excludes it (three call sites found and fixed
  during Task 11: `PublicProjection.ToSummary`, `HostProjection.ToHostProperty`,
  `PhotoManager.tsx`'s own cover pick).
- The `properties` indexing policy excludes `/description/*`, the same reasoning
  ADR-028 applied to `/nearby/*`: nothing ever queries into the document tree,
  and every save would otherwise index it.
- `FIELDS.description`'s diff no longer compares `description` with `bi()`'s raw
  object equality; `rich-text.ts`'s `canonical()` serializer (sorted keys,
  absent normalised to `null`) is what the differ compares, so a tree built by
  Tiptap and a tree parsed from the API — which can differ in key order and in
  absent-versus-null at every node — do not falsely show as "changed."
- 29 C# tests (`Ebrostay.Api.Tests`) covered the validator and the cover-photo
  fix at the unit level even before this round; this round adds one more, a
  true integration test through the save endpoint itself (see the fix-round
  addendum below) — the one adversarial case unit tests structurally couldn't
  reach.

---

## ADR-033 — AI-assisted import: an async job the API owns and an extractor it does not trust

- **Status:** ✅ locked and ✅ **built** 2026-07-30 (product owner: Raphael);
  amended 2026-08-03 (an unknown mark is dropped by the owner's PUT rather
  than rejected — see after Decision 8). Carries the design at
  `docs/superpowers/specs/2026-07-30-ai-assisted-import-design.md` into the
  log, plus five decisions made during implementation. **Extends ADR-030**
  (the wizard gains a step 0 in front of it; nothing inside the nine steps
  changes but one banner and one glyph) and **sits beside ADR-020** (the
  DeepSeek assistant) rather than replacing it.
- **Context.** Most owners arriving at *Add a property* already have the flat
  listed on a portal, and retyping it is why drafts get abandoned. The design
  reads a pasted portal URL and proposes a filled form. Extraction takes 30
  seconds or more and the computational work is going to a separate pipeline
  that does not exist yet and will be operated by a third party.

### Decision 1 — Asynchronous, because SWA leaves no other option

SWA caps every `/api` request at **45 seconds** and managed functions accept
**HTTP triggers only**. A 30s+ synchronous endpoint was never available. The
reading screen of §10.2 is therefore the architecture, not a UX flourish, and
the escape hatch on it (*Start filling it in meanwhile*) is what turns the
constraint into a feature.

### Decision 2 — Stay on managed functions; do not move to Standard/BYOF

Nothing in the design needs a non-HTTP trigger: API→queue is an SDK *write*,
pipeline→API is HTTP, client→API is HTTP. The one job a timer would do —
reaping a stuck job — is done lazily on read instead, the same pattern
`RouteCache` uses for stale geometry.

Moving would cost ~$9/mo, a second Function App with its own storage and
deploy pipeline, and **SWA pull-request preview environments** (bring-your-own
backends cannot be linked to them), in exchange for capabilities this design
does not use. The C# is portable either way — hosting configuration, not code
— so this stays cheap to revisit if the pipeline ever needs something HTTP
cannot carry.

### Decision 3 — A Storage Queue, not the Cosmos change feed

The storage account already exists for photos, so the queue adds no resource
and no cost floor, and it brings visibility timeout, dequeue count and a poison
queue — retry semantics for free. The change feed brings none of those and we
would rebuild them; it needs a lease container (extra RU on a free-tier
account); and it delivers *every* write to the job document, including our own
stage updates, so the consumer must filter and be idempotent.

The deciding argument is the integration contract. For a service that does not
exist yet and is not ours, "read a queue message" is universally implementable;
"host a change-feed processor against our database" couples someone else's
roadmap to our schema.

A 10-second queue poll costs ~8,640 transactions/day ≈ **$0.0004/day**. The
polling-cost worry that motivated the question is real for a hosted HTTP
service and negligible for a storage queue. A wakeup ping exists behind
`PIPELINE_WAKEUP_URL` and is **advisory** — the queue stays the source of
truth, so a failed ping costs latency, not the job.

### Decision 4 — The result lands on the job, never on the listing

`importJobs` (partition `/id`, 7-day TTL) holds the proposal. The **merge is
client-side**, because only the client knows which fields the owner has already
typed into — §10.2 requires that an arriving import fill only untouched fields,
and during *Start filling it in meanwhile* there may be no draft at all yet.

Three consequences, and they are the reason for the shape:

- The pipeline needs **no Cosmos credential and no knowledge of `PropertyDoc`**.
- `HostWrites.cs` validation is untouched: the import adds **no new writer to
  the `properties` container**. The listing is still only ever written by the
  wizard's own save.
- A forged callback can poison **one job's proposal**, which arrives visibly
  marked and editable. That blast radius is what makes an anonymous callback
  endpoint acceptable at all.

### Decision 5 — Per-job callback tokens, not a shared secret

The pipeline is third-party. Its entire credential surface is a process-only
queue SAS and, per job, a random token minted at enqueue and compared with
`FixedTimeEquals`. A leaked token is scoped to one job and dies with it. A
mismatch answers `404`, never `403` — a job id is not a thing to confirm the
existence of.

### Decision 6 — The callback enforces policy rather than trusting the extractor

`imported[]` is validated against a closed key vocabulary and **never inferred
from "field is non-empty"** (a field the owner typed and a field we filled look
identical in the data). Values are clamped against `HostValidation`'s limits.
And the **English is stripped, silently and always** — §10.5's rule that the
English is never imported even from a portal's English tab is enforced at the
boundary, so a pipeline that returns it does not get to change the product.

### Decision 7 — Progress is a stage enum; polling is the transport

`queued → fetching → reading → matching → done | failed | cancelled`, reported
through the same callback. **No percentage and no bar**: the duration is not
knowable, and a bar that stalls at 80% is a lie with a number on it. Where the
pipeline reports only `done`/`failed`, the client advances the three status
lines on elapsed time and a real reported stage always overrides the estimate.

The client polls `GET /api/import/{id}` — a Cosmos **point read, 1 RU** —
every 2s, and the response carries the result in the same body as the `done`
stage. SSE and long-polling are refused by the same 45-second cap; Web PubSub
or SignalR is an entire service for one screen with one viewer.

### Decision 8 — `imported[]` persists on the property document

`PropertyDoc` gains `imported: string[]` and `importSource`. Not optional: the
design cut the summary screen and made the marks the entire review surface, so
marks living only in client state would mean a reload returns the owner to a
form in which twenty machine-proposed values are indistinguishable from their
own.

### Amendment 2026-08-03 — a mark this API no longer knows is dropped, not rejected

Persisting the marks (Decision 8) put a **code-versioned vocabulary inside a
stored document**, and the first change to that vocabulary stranded every
document written before it. ADR-034 renamed the import key `copy` to
`description` four days after this shipped. Four local drafts imported before
that rename came back from the GET still carrying `copy`; the client echoed it
into the PUT, as it must; `CheckImported` refused the whole save with
`imported_unknown_field`. The listing became **permanently unsaveable** — the
owner retypes a description, presses *Continue*, and loses it to a 400 naming
a field they have never heard of, with no path out of it from the UI. Nothing
in the editor can clear that mark: `clearMark` removes the key the owner just
edited, and `copy` is not a key any current control produces.

The rule now distinguishes the two directions the vocabulary travels:

- **The callback ASSERTS it.** An external pipeline naming a field it filled is
  the boundary where an unknown key means the pipeline and this API disagree
  about what exists. `ImportValidation.CheckCallback` still refuses it, before
  anything is written. Unchanged.
- **The owner's PUT only ECHOES it.** Every mark on that payload was written by
  this API and handed back on the GET, so an unknown key there cannot be a
  client inventing a claim — it can only be a vocabulary that shrank underneath
  a stored document. `HostValidation.KnownImported` filters those out and the
  save proceeds; `imported_unknown_field` is no longer reachable from the
  content PUT. The cap (`imported_too_many`) still applies to what *arrived*,
  before filtering, because that bounds the payload rather than reading it.

**This is not the repair ADR-032 Decision 8 refuses.** That decision rejects
rather than repairs *rich text*, where silent repair deletes an owner's words.
A mark carries no words. It is review state — "nobody has looked at this value
yet" — and one naming a field that no longer exists is already inert: it maps
to no step, renders no glyph and gates no completeness check. Dropping it costs
nothing anybody wrote, and the stale mark clears itself on the first save, so
the fix is also the migration.

The general form, worth stating because the next vocabulary change will meet
it: **a closed set that lives in code and is persisted in documents must be
lenient on the way back in.** Otherwise every removal from that set is a
silent, retroactive denial of service against the documents that still use it.

### Decision 9 — The URL flow ships first; the document flow waits on a privacy answer

Not merely a size decision. ADR-020's rule is *property text only, never
personal data*. A pasted portal URL is a public advert; an uploaded agency
dossier can carry the owner's NIE, bank details, a signed mandate. Sending that
to a third-party extractor is a different question and is answered before Card
B ships (OD-7). `source` is a discriminated union from day one, so adding
`{ kind: "document" }` is additive and does not version the pipeline contract.

Card B **renders disabled with a "coming soon" label** rather than being
hidden: the start screen's job is to tell an owner what this feature is before
they spend effort on it, and a card saying "documents, not yet" answers a
question an absent card leaves them guessing at. It is `disabled` +
`aria-disabled` with **no drop, dragover or change handler attached at all** —
the design's rule that a dead control must be plainly dead applies with more
force to a whole card than to a button.

### Decision 10 — `ImportDecision`: the transition rules are a pure type, not function bodies

The job's stage-transition rules — `Next` (apply/no-op/conflict), `Reap`,
`ExceedsRunningCap`, `TokenMatches`, and `Cancel`'s own idempotence — were
pulled out of `ImportFunctions` into `api/Models/ImportDecision.cs`: a static
class that does no I/O and is a pure function of a document, a callback, and
(where time matters) the caller's own `now`. `ImportFunctions` is now a thin
wrapper that reads a job with its etag, asks `ImportDecision` what happens, and
writes the answer back — which is what makes the six guarantees (a duplicate
completion is a no-op, an out-of-order stage report cannot walk the status line
backwards, a job past its deadline fails itself, two at once is the cap, a
token compare costs the same time whether it matches, cancelling a terminal job
writes nothing) unit-testable without a Cosmos emulator.

### Decision 11 — Optimistic concurrency is load-bearing, not hygiene

Every job write (`ImportFunctions.ReplaceAsync`) carries `IfMatchEtag`. Without
it, the poll's own reaper could overwrite a completed extraction with
`failed`/`timeout` — a successful read reported to the owner as a timeout,
silently. `Cancel` retries once against a fresh etag when its first write loses
a race, and answers a new `cancel_conflict` (409) if it loses twice, rather
than a `204` that would claim a cancellation that did not happen — a stale
write here is never treated as "someone else finished it for me."

### Decision 12 — The amenity vocabulary is filtered client-side, in `mergeImport`, never server-side

`HostWrites.cs` deliberately keeps the amenity vocabulary off the API: shipping
a new amenity needs no API deploy. The consequence is that the server-side
shape check (`^[a-z0-9-]{1,32}$`) cannot reject an out-of-vocabulary key — it
passes, is stored on the job, and is filtered only when `mergeImport` (Task 6)
applies it against `AMENITY_KEYS`. An unfiltered key would render as nothing on
the amenities step, which is why the fixture correction in commit `c86bade`
(the stub's amenity names had to match `app/lib/amenity-icons.ts`, not a
portal's own words) mattered enough to bring the whole URL flow down for
review, not just tidy a fixture.

### Decision 13 — Cleared marks are part of the save condition, never part of `changedSections`

`marksDiffer` (Task 6) makes a mark clearing on its own enough to enable Save —
an owner who has looked at every marked field but changed nothing must still be
able to leave. But marks are deliberately **excluded** from `changedSections`,
the signal that drives the editor's dirty indicator and its re-review trigger.
Without the split, a pricing-only edit — or an edit that exactly reverts to the
imported value — would flip a section to "changed" for no reason a reload could
explain, and a later reload would re-mark a field the owner had already looked
at.

### Decision 14 — The arrival set is not persisted, by decision

`arrived` (Task 8, `page.tsx`) answers "did the portal send anything for this
step" and is kept only in client state, never written to `PropertyDoc`. On a
resumed draft the banner cannot tell "this step received nothing" from "the
owner has already reviewed it" — both look identical once the marks are gone —
so it renders no body line rather than guess between them: truthful in every
state, at the cost of saying less on a screen the owner has already seen once.
`nearby` is the one step exempt from the guess in the first place: no import
key maps to it (`IMPORT_STEP_OF` in `app/lib/import.ts`, read one-directionally
on purpose), so absence there is certain rather than unknown, and it keeps its
true nothing-line always.

### Decision 15 — The callback host is the SWA's own hostname, never the custom domain

`IMPORT_CALLBACK_BASE_URL` is set from `swa.properties.defaultHostname`, and
stays there after cutover rather than moving to `ebrostay.com`.

Immediately decisive: `ebrostay.com` is still v1 on GitHub Pages (ADR-016), so
callbacks addressed there today would reach a static site with no
`/api/import/…` to receive them. But the choice holds after cutover too, for
three reasons that outlast the migration:

- **Nobody ever reads this URL.** It is written into a queue message and
  consumed by a service. A pretty domain buys nothing; reachability is the
  only property that matters.
- **Fewer things in front of it.** The custom domain depends on our DNS being
  right and our certificate renewing, and anything we later put in front of it
  — Front Door, a CDN, a WAF — sits in the callback path. Those are tuned for
  browser traffic, and a machine POSTing JSON with an unusual header is the
  shape they most like to challenge. A blocked callback fails *silently*: the
  job simply sits until the reaper times it out and the owner is told the read
  took too long.
- **The bicep derives it.** `'https://${swa.properties.defaultHostname}'` is
  correct in every environment including per-PR preview environments, each of
  which gets its own hostname, with nothing to remember.

The cost: deleting and recreating the SWA changes the hostname. Rare, it would
break much else besides, and the next `az deployment` picks up the new value.
Moving callbacks to a custom domain later is a one-line app-setting change —
which is exactly the flexibility Decision 16 exists to preserve.

### Decision 16 — The pipeline is asked to allowlist the callback host on its own side

The queue message carries the reply address rather than the pipeline holding
it, because each environment has a different hostname — local, per-PR preview,
staging, production — and one pipeline instance must serve all of them.

That flexibility costs something, and the mitigation is stated here as an
expectation on the pipeline rather than left implicit: **it should hold a list
of acceptable callback hosts in its own configuration** (`*.azurestaticapps.net`
today) and refuse a message whose `callbackUrl` does not match.

**The risk it addresses is SSRF, not token theft.** This is worth stating
plainly because the intuitive reading is wrong: the callback token is minted
per job by us, so anyone forging a message supplies their own token and has
nothing of ours to steal. The real exposure is the pipeline's shape — a service
that fetches one URL from a message and POSTs to another URL from the same
message is a ready-made proxy. Anyone who can put a message on that queue
(a leaked or over-permissioned SAS, a bug on our side) can aim it at an
internal endpoint, a cloud metadata service, or a host they control, with the
pipeline's credentials and reputation rather than their own. A secondary and
likelier benefit: if *we* misconfigure `IMPORT_CALLBACK_BASE_URL`, the
allowlist turns a silent failure into a loud one.

**The list must live on the pipeline's side, never in the message.** A check
that travels with the data it checks is not a check — an attacker forging the
message forges the allowlist with it. Our side of this is documentary: we
undertake to send callback URLs only on hosts we have named in advance, and to
tell the pipeline team before that set changes.

### Consequences

- New: `importJobs` container, `import-jobs` storage queue,
  `api/Functions/ImportFunctions.cs`, `app/lib/import.ts`. No SWA plan change.
- ADR-020's assistant stays what it is — short, synchronous, in-function text
  operations on text the owner already typed. **Do not merge the two paths**;
  they are different latency classes and one of them cannot fit in 45 seconds.
- The step numbers in the design handoff's §10.3–10.5 predate the ninth step
  and are off by one past the first. Banner variants are chosen by `StepKey`,
  never by number. `nearby` takes the did-not-touch banner: nothing an advert
  publishes belongs in a measured walking time.
- The price is carried across unchanged and flagged, never multiplied by 30/31.
  Portals quote a calendar month; ADR-023's field is thirty days flat, and a
  guess about the owner's intent has no business in the one field with contract
  consequences.
- Rate limits (2 running, 20/day per owner) reuse the `serviceBudget`
  container, which exists for exactly this cross-instance counting.
- We never fetch the portal, never store the source page, and never re-host its
  images. Only the pipeline reads the page the owner pointed at.

---

## ADR-034 — The listing description field is `description`, not `copy`

- **Status.** Accepted, 2026-07-30. Built the same day. **Amends ADR-032**
  (the rich-text schema, unchanged — only the field's name moves).
- **Context.** The field holding a listing's written description has been
  called `copy` since the first v2 data model. It is the publishing sense of
  the word — *ad copy*, what a copywriter writes — and it was never argued
  for in any ADR; it simply arrived with the original schema and stayed.
  The name collides with the far more common engineering sense of "copy" as
  *duplicate*, and the collision is not hypothetical: `02-data-model.md` uses
  "copy" to mean duplicate three times in prose ("a second copy of a rule",
  "not a copy of the register", "its own copy") while a field named `copy`
  sits in the same document meaning something else entirely.

### Decision 1 — Rename to `description`, everywhere, in one change

`copy` → `description` in the stored document, both API projections, the
client types, the message keys and the docs. Derived names follow:
`copyEnApproved` → `descriptionEnApproved`, `CopyDoc` → `DescriptionDoc`, the
ten `copy_*` validation error codes → `description_*`, `MaxCopy*` →
`MaxDescription*`. `description` is what the UI has always called it, what the
editor's section is already named, and it carries no second meaning.

### Decision 2 — Done now, while the only stored data is four sample homes

The cost of this rename is a re-seed, and the only environments holding the
field are the local emulator and staging's four regenerable sample listings.
The same rename after real owners have written real descriptions would need a
migration, a compatibility read path, or both — precisely what ADR-032
Decision 4 refused to build for the shape change. Taking it now costs one
`node infra/seed.mjs` run.

### Decision 3 — What is deliberately NOT renamed

The publishing sense of "copy" is correct in several places and stays: the
About page's `rootsCopy`/`bridgeCopy` section fields, `06-design-language.md`'s
"Copy rules", every prose use meaning wording or duplicate, and `copyright`.
The rename was applied by pattern and then reviewed line by line; the review
caught two false positives a blind pass would have shipped — `SKBitmap.Copy()`
in `PhotoPipeline` (a bitmap duplicate, renamed to `.Description()`, which
failed the build) and two orphaned local bindings in `listing.ts` and
`listing.test.ts` where the object key moved but the variable did not. The
second pair compiled clean in one case and would have silently returned an
object with the wrong key.

### Consequences to watch

- **A pre-rename document no longer throws; it goes blank.** ADR-032's
  "Legacy plain-string `copy` throws, not degrades" described a 500, because
  the old string pair could not deserialize into `BilingualDoc`. After this
  rename a stale document carries `copy`, which is now an *unmapped* member —
  Newtonsoft's default `MissingMemberHandling` ignores it, so `description`
  reads as `null` and the listing renders with no description at all. Quieter
  than a 500 and harder to notice: nothing logs it. `PropertiesFunctions`'s
  per-document `TryParse` guard still stands, but this failure never reaches
  it. Re-seeding remains mandatory; forgetting now looks like blank listings.
- **A re-seed does not cover owner drafts, so Decision 2's premise was
  incomplete** (found 2026-08-03). "The cost of this rename is a re-seed" was
  true of the *four sample homes* and of the `description` field itself. It was
  not true of `imported[]`: the same rename moved a key inside an array that
  ADR-033 Decision 8 persists on **every** property document, and
  `infra/seed.mjs` regenerates the samples while leaving owner drafts
  untouched. Four local drafts imported hours before this ADR landed kept the
  key `copy`, and the API's refusal to recognise it made each of them
  permanently unsaveable — a failure mode neither this ADR nor ADR-033
  anticipated, and one that cost real debugging four days later. Fixed by
  ADR-033's 2026-08-03 amendment (unknown marks are dropped by the owner's
  PUT), which also self-heals the affected documents on their next save. The
  lesson generalises past this rename: **before renaming or removing a key,
  ask which stored arrays name it as data**, not only which fields hold it.
- The `properties` indexing policy excludes `/description/*` where it
  excluded `/copy/*` (`infra/main.bicep`). Deploying it re-triggers the
  background index transformation ADR-028 describes.
- ADR-032's text was updated to the current name rather than left frozen,
  because that document is read as a working reference. Its "Naming" bullet
  records that it was written when the field was `copy`, and the passages
  about the *legacy stored shape* keep the old name deliberately — a document
  written before this ADR really does carry `copy`.

---

## ADR-035 — Entra External ID: an Ebrostay account, Microsoft sign-in, our own branding

- **Status:** ✅ locked & built 2026-07-31. **Supersedes ADR-013.** Amends ADR-021.
- **Context:** v2 shipped on SWA **Free** with the platform's *preconfigured*
  providers — a single Microsoft-owned app registration shared by every
  Free-plan static web app. Three problems followed. The OAuth consent screen
  asked guests to grant **"Azure Static Web Apps"** access to their account:
  an app that is not ours, whose name we cannot change, shown to someone about
  to hand over identity documents to rent a flat. There was **no
  email/password sign-up**, so anyone without a GitHub or Microsoft account
  could not book or host. And GitHub is a poor fit for people renting homes.
  ADR-013 accepted this and named the escape hatch: *"SWA Standard tier +
  custom OIDC or Entra External ID"*. This is that hatch.

- **Decision:** A **Microsoft Entra External ID external tenant**
  (`ebrostay`, `172e1505-039e-4565-87e9-4fad91983d51`, EU-located) is the
  single OIDC provider Static Web Apps sees, registered as
  `customOpenIdConnectProviders.ebrostay`. It brokers, behind one
  Ebrostay-branded page:
  - **Ebrostay account** — email + password, hosted by Entra
  - **Microsoft account** — personal MSAs, via custom OIDC federation
  - Google 🔜 planned; Apple 🗑️ not carried

  SWA moves to the **Standard** plan (custom auth requires it) and the app is
  recreated as `ebrostay-home` in **West Europe**.

- **Rationale:** Entra brokering keeps `userId` stable per person. Registering
  each provider directly against SWA would mint a separate principal — and so
  a separate `profiles` document and a disjoint set of listings — for the same
  human depending on which button they pressed. `userId` is the Entra
  `objectidentifier`, one per user object.

  Email + password over one-time passcode because **hosts** carry the economic
  stake, sign in most often, and expect a conventional login. Password reset,
  email verification and lockout are all provided by the platform; we store no
  credential.

- **Consequences:**
  - **~$9/month** for SWA Standard. Entra External ID is **$0** below 50,000
    MAU; expected usage is dozens.
  - Sign-in pages live at `ebrostay.ciamlogin.com`. A custom login domain would
    need Azure Front Door at ~$35/month — deferred, purely additive.
  - Changing the local-account method later affects **only new users**.
  - **Apple deferred:** $99/year Apple Developer Program plus a manual client
    secret rotation every 6 months whose failure mode is silent.
  - `userDetails` carries the **display name**, not the email. The email
    arrives as `preferred_username`.
  - Federated users carry a
    `http://schemas.microsoft.com/identity/claims/identityprovider` claim
    naming the upstream provider — the only way to tell an MSA user from a
    local account, since SWA reports `identityProvider: "ebrostay"` for both.
  - The privacy policy changes: Microsoft becomes a **processor** for
    credentials (§5.6 of the design spec). No cookie banner follows — the
    session cookie was always strictly necessary.

### Correction to the original analysis

The first draft of this decision **dropped Microsoft** on the grounds that
external tenants federate only *one nominated organisation*, not "any Microsoft
account". **That was wrong.** Personal Microsoft accounts are supported via a
custom OIDC provider against
`https://login.microsoftonline.com/consumers/v2.0/.well-known/openid-configuration`
with issuer `https://login.live.com` — documented by Microsoft, not a
workaround. Microsoft is **included**.

### Scope decision: `openid email`, without `profile`

The MSA federation requests **`openid email`** only. OIDC's `profile` scope is
a coarse bundle — name, picture, website, gender, birthdate, locale — and
Microsoft renders it to the user as *"View your basic profile (name, picture,
username)"*. On a page preceding an identity-document exchange, asking for a
profile picture we never read is a cost with no benefit.

**These two settings are coupled and must move together.** Dropping `profile`
removes the only source of a name, so the display name now comes from the user
flow's **attribute collection** step, which prompts for it at sign-up. Remove
Display Name from the user flow's user attributes and `userDetails` goes empty
for federated users, giving blank avatars. Verified working 2026-07-31:
`userDetails: "Raphael Goj"` from a `name` claim that Microsoft never sent.

Invoicing data (legal name, NIF/CIF, fiscal address) was never obtainable from
an identity provider and belongs in our own account page, collected explicitly.
So the narrower consent screen costs nothing we would have used.

### Two consent screens, only one of which we can remove

| Screen | Removable? |
| --- | --- |
| Entra permissions prompt, on sign-up | **Yes** — grant admin consent on the app registration. External tenants do not let customer users consent for themselves, so without it every guest reads *"This application is not published by Microsoft."* |
| `login.live.com` consumer consent, on Microsoft sign-in | **No.** Personal account holders consent individually; there is no tenant admin to pre-consent. Only improvable — logo, terms and privacy links, and eventually publisher verification to clear *"unverified"*. |

A consequence worth designing around: the **Ebrostay account path shows no
permission screen at all**, the Microsoft path always will.

### Manual setup — not reproducible from this repository

None of the following is in code or Bicep. It was done by hand in the portals
on 2026-07-31 and would have to be repeated by hand to rebuild the tenant.

**Entra external tenant `ebrostay`** — created in the Microsoft Entra admin
center (the Azure portal creates workforce tenants only). **Country/Region and
domain name are immutable.** Linked to subscription
`2cda7364-dba2-4b44-aff0-f5a6fcfac010`.

| Object | Where | Detail |
| --- | --- | --- |
| App registration `Ebrostay web` | external tenant | `c6e22d86-c3e4-44a8-aa8a-089e84a1a5b9`. Audience: this directory only. Redirect URI `https://delightful-sand-063f8a703.7.azurestaticapps.net/.auth/login/ebrostay/callback`. Client secret → SWA app settings `EBROSTAY_OIDC_CLIENT_ID` / `EBROSTAY_OIDC_CLIENT_SECRET`. **Admin consent granted.** |
| App registration `Ebrostay` (MSA federation) | external tenant | `7a654cfb-f11c-48c9-abfa-2512aa512cd3`. Audience **All Microsoft account users**. **Two** redirect URIs — `…ciamlogin.com/<tenant-id>/federation/oauth2` and `…ciamlogin.com/ebrostay.onmicrosoft.com/federation/oauth2`; Entra uses either. Branding & properties carries the logo, terms and privacy URLs shown on the consumer consent screen. |
| Custom OIDC provider `Microsoft account` | external tenant → External Identities → All identity providers → **Custom** | Well-known `https://login.microsoftonline.com/consumers/v2.0/.well-known/openid-configuration`; issuer `https://login.live.com`; client auth **`client_secret_post`** (`client_secret_basic` unsupported, `private_key_jwt` offered but unsupported); scope `openid email`; response type `code`; default claims mapping. |
| User flow `ebrostay-home` | external tenant | Type *Sign up and sign in*. Identity providers: **Email with password** + Microsoft account. User attributes: **Display Name**, Email. **The application must be added under Applications** — without it the page serves sign-in with no way to sign up. |
| Company branding | external tenant → Custom Branding | Favicon, background image, banner + square logos, custom CSS, terms/privacy footer links. See **Branding** below — the assets and the stylesheet are in `infra/entra/`, but uploading them is manual. |

### Branding — assets are in the repo, uploading them is not

`infra/entra/` holds everything the tenant's appearance depends on.
Nothing there is deployed by CI; each item is uploaded by hand at
**Custom Branding → Default sign-in → Edit**.

| File | Tab | Field |
| --- | --- | --- |
| `branding/entra-banner-245x36.png` | Sign-in form | Banner logo |
| `branding/entra-banner-245x36.png` | Header | Header logo |
| `branding/entra-square-light-240.png` | Sign-in form | Square logo (light) |
| `branding/entra-square-dark-240.png` | Sign-in form | Square logo (dark) |
| `signin.css` | Layout | Custom CSS |

The PNGs are rendered from the `.svg` sources beside them, which reuse
the exact paths from `app/public/brand/logo-wordmark.svg` — the arch and
water line are the site's artwork, not a redraw. The wordmark's
typeface substitutes when rasterised, because Familjen Grotesk is a
Google font not installed locally; a proper export from the original
brand assets should replace these if one exists.

#### What the banner logo does *not* cover

Entra emits `.ext-banner-logo` **only on the first sign-in page.** Every
variant reached afterwards — "Pick an account", and the sign-in form
behind "Use another account" — omits the element entirely and renders
the **tenant name as plain text** instead. Verified on the live page:
`document.querySelector('.ext-banner-logo')` returns `null` there.

No CSS or configuration puts a logo where there is no element to hold
one. The only lever is **Tenant properties → Name**, which is why it is
set to `Ebrostay` and not `EBROSTAY`: that string is the branding on
those screens, and it also appears in the verification email Entra sends
new users and in the near-empty frame during sign-out.

#### Custom CSS: available, but on borrowed time

Microsoft withdrew custom CSS for Entra ID tenants created after
5 January 2026 and is deprecating its positioning properties.
**External ID tenants are exempt from both** — but the same notice calls
this "the first step toward retiring the custom CSS feature entirely",
with no carve-out for External ID. So `signin.css` is written to lose
gracefully: no `position`, `margin`, `transform`, `opacity`, `overflow`
or `filter`, and nothing structural depends on it.

Three things that cost real time and are recorded in the file itself:

1. **Entra strips CSS custom properties.** A `:root` block is discarded
   and every `var()` resolves to nothing, so those declarations are
   dropped *silently* while literals still apply. The result was a form
   floating unreadably on the background photograph with the title in
   Times. Every value in the file is now a literal, each carrying the
   `globals.css` token name it was copied from — so drift is visible,
   at the cost of having to sync it by hand.
2. **The footer sits on a scrim Entra supplies** — measured as
   `rgba(0, 0, 0, 0.6)`. It needs *light* text. Painting it `--muted`
   grey, and later `--brand-strong` green via a bare `a` selector, both
   produced roughly 1.5:1. Card links are now scoped to
   `.ext-sign-in-box a` so a generic rule cannot reach the footer again.
3. **Custom OIDC providers get a generic icon, and CSS cannot fix it.**
   Only built-in providers get brand marks, so the Microsoft option
   ships with an anonymous blue circle. `content:` on
   `.ext-promoted-fed-cred-box img` does not take — the rule was written,
   and removed again once it proved not to work on the live page. The
   icon is out of reach from the stylesheet; anything better has to come
   from somewhere other than custom CSS.

#### How to change this file safely

Every defect above looked correct in the stylesheet and wrong in
`getComputedStyle`. After any edit, load the page and measure rather
than eyeball:

```js
const b = document.querySelector('.ext-sign-in-box');
getComputedStyle(b).backgroundColor;                    // expect rgb(255, 255, 255)
getComputedStyle(document.querySelector('.ext-footer-item')).color; // expect rgb(246, 248, 246)
document.querySelector('.ext-banner-logo');             // null on picker variants — expected
```

Note also that `aadcdn` caches branding hard: allow a few minutes and a
hard reload before concluding an upload did nothing.

**Traps that cost time and are not obvious from any error message:**

1. **Redirect URI mismatch is silent until it isn't** — register both spellings.
2. **`unauthorized_client: not enabled for consumers`** means the client ID in
   the OIDC provider does not match an app whose audience includes personal
   accounts. In our case the provider simply held the **wrong client ID**; the
   app was fine. Compare the ID in the failing `login.live.com` URL against the
   registration before changing anything.
3. **IdP edits do not take effect on a live user flow** — untick the provider,
   Save, tick it, Save.
4. **Testing a changed scope against an existing user proves nothing.** The
   user object already holds a consent grant and attributes. Delete the user
   from **Entra ID → Users** and sign up again.
5. SWA accepts the discovery document from `ebrostay.ciamlogin.com` even though
   it declares an issuer on the tenant-ID host — an OIDC Discovery violation
   that would justify rejection. It works, and guests see the branded host, so
   no Front Door is needed. **This is tolerated behaviour, not a guarantee.**

## ADR-036 — The provider choice stays on Entra's hosted page

**Date:** 2026-08-01 · **Status:** accepted · **Amends:** ADR-035

A Microsoft-branded button on our own `/sign-in` that hands the browser
straight to the Microsoft account login **cannot be built** while sign-in
goes through SWA built-in auth and Entra External ID. Every mechanism was
tested to the wire; record them so nobody pays for this twice:

1. **Custom CSS** cannot touch the provider tile's icon. `content:` on
   the `<img>` does not survive Entra's sanitiser.
2. **`loginParameterNames` works — as `name=value` pairs.** Bare names
   (`["domain_hint"]`) forward nothing, which is what made an earlier
   test conclude SWA forwards nothing at all. `["prompt=login"]` and
   `["domain_hint=…"]` demonstrably reach the authorize URL. This is the
   one durable positive finding.
3. **`domain_hint` cannot reach a custom OIDC provider.** Wire-traced
   for five values under both flow states (provider in/out of the user
   flow): `login.live.com` triggers Entra's *built-in* MSA federation —
   a WS-Fed hop (`wa=wsignin1.0`, `wtrealm=urn:federation:MicrosoftOnline`,
   SAML 1.1 incoming token in the logs) that matches B2B guests instead
   of running the CIAM user flow, so SWA never gets a session.
   `live.com` hits the same path via Microsoft's first-party client and
   errors. `consumers` and `login.microsoftonline.com` are ignored.
   Unlike B2C, an External ID provider has **no Domain hint property**
   to claim a hint value of its own; the built-in federation owns the
   namespace.
4. **A Microsoft-only user flow cannot exist.** Every sign-up/sign-in
   flow must keep an email method: the portal's Email Accounts control
   is a radio group with no "none", and Graph rejects or ignores every
   shape that removes `EmailPassword-OAUTH` from
   `onAuthenticationMethodLoadStart`. (Binding an app to a flow via
   Graph also requires the service principal to carry the
   `WindowsAzureActiveDirectoryIntegratedApp` tag, or the appId is
   rejected as "invalid".)

**Therefore:** the hosted page keeps the provider choice — email form
plus the Microsoft tile (generic icon and all), plus Google's genuinely
branded button once configured (Google is a built-in provider and has
none of these problems). Our `/sign-in` page stays as the branded front
door and states which accounts work; it forwards signed-in visitors.

**Verified behaviour worth trusting** (Tests A/B/B2, 2026-08-01): an
address Entra recognises as a Microsoft account is handed to
`login.live.com` at *sign-in* with no password asked, even with the
provider unticked; the *Create one* branch always makes a local password
account regardless of domain; a known local account always beats the
Microsoft routing at sign-in. Deterministic, no duplicates. Untested:
federate-first-then-Create-one at the same address, and gmail-vs-Google
once Google lands.

### Amendment (2026-08-01, same day): one-hop Microsoft via a DIRECT provider

The "therefore" above assumed identity unity was non-negotiable. Asked
directly, the owner priced it at ~zero: two accounts for a person who
uses both doors is acceptable, one-hop Microsoft login is not optional.
That reverses ADR-035's rejection of the direct option, and none of the
four dead mechanisms are needed for it:

- `ebrostay-msa` points SWA straight at
  `login.microsoftonline.com/consumers` — no Entra in the path. The
  Microsoft button on `/sign-in` is real and lands on the live login in
  one hop.
- App `7a654cfb` (audience `AzureADandPersonalMicrosoftAccount`) serves
  both roles: the Entra IdP's client AND SWA's direct client. It carries
  the federation redirect URIs plus the SWA callback, and two secrets —
  `Ebrostay web` (IdP, do not touch) and `swa-direct-msa` (SWA app
  settings, expires 2028-07-31).
- **Consequence, permanent per user:** a Microsoft-door userId is the
  MSA `oid`; an email-door userId is a tenant `oid`. Same human, two
  Cosmos identities. Support answer: "which button did you use?"
- The Microsoft tile on the hosted page (enabled during testing) is now
  redundant with the direct button but harmless; keeping it is a
  cosmetic call, not an architectural one.

---

## ADR-037 — `/host` is public, and the sign-in bounce moved into the app

**Date:** 2026-08-01 · **Status:** accepted

`/es/host/*` and `/en/host/*` carried `allowedRoles: ["authenticated"]`.
An owner following a bookmark while signed out was therefore 401'd at the
edge and redirected to a bare sign-in form before the app could say
anything — answering a question they had not asked yet. Two things were
wrong with that redirect, both structural:

1. **It was always Spanish.** `responseOverrides` is a **single global
   map** in Static Web Apps: one 401 target for the whole site, no
   per-route variant. `/en/host/` therefore sent English visitors to
   `/es/sign-in/`. There is no configuration-only fix; the platform
   cannot express it.
2. **It discarded the destination.** SWA does not pass the original URL
   to the redirect target, so even a correct-locale bounce landed the
   visitor on sign-in with nowhere to return to.

**Decision.** `/host` becomes a public route with two faces: signed out
it is the owner pitch (`components/host/HostPitch.tsx`), signed in it is
the portfolio. Its three working sub-routes — `/host/new`, `/host/edit`,
`/host/manage` — lose their edge rules too and bounce in-app through
`components/host/RequireOwner.tsx`, which reads `useAuth()` and sends the
visitor to `signInPath(currentPath())`. That is locale-correct by
construction and round-trips the destination, query string included:
`/es/host/manage?id=pedro1` → `/es/sign-in/?redirect=/es/host/manage/?id=pedro1`.

**Why this is safe, and why it was never really a weakening.** §3.5 is
already explicit that route rules are cosmetic and the C# functions are
the boundary: every `Host*` function calls
`profiles.RequireActiveAsync(ClientPrincipal.Parse(req))` before any read
or write. What the rules gated was a **prerendered HTML shell** holding
no data. Ungating it exposes markup, not records. `/account/*` and
`/admin/*` keep their rules — nothing there has a public face — and
`responseOverrides.401` stays as their backstop.

**Consequences.**

- The pages are prerendered at build time, where no visitor exists, so
  the auth-unresolved render is what a stranger paints. It must name
  nobody: `/host` renders a bare skeleton until `/api/me` answers, and
  the sub-routes render `RequireOwner`'s skeleton. A first cut branched
  on the portfolio endpoint's 401 instead and shipped
  `<h1>Gestiona tu vivienda</h1>` plus an "Add property" button into the
  static HTML of a public page.
- Ungating made the sub-routes crawlable. They carry
  `robots: { index: false, follow: false }` via a `layout.tsx` each, or
  six near-empty pages enter the index.
- `/host` is now an acquisition surface and needs its own metadata; the
  page is a client component, so it comes from `host/layout.tsx`.
- The nav's owner segment collapses to a single href in both auth
  states. It previously pointed at `/about#hosts` when signed out while
  its matcher only recognised `/host`, so the segment silently never
  highlighted — the bug that surfaced all of the above. The model now
  lives in `app/lib/nav.ts`, where it is unit-tested.
- **"How it works" now owns the whole of `/about`**, reversing its
  earlier `match: () => false`. That was defended on the grounds that
  `/about` is also where the footer's "About" link goes, so highlighting
  would fire for someone who arrived by the other door — overruled the
  same day: a segment that can never light up reads as broken to the
  person looking at it, and the footer link is the rarer arrival. Note
  the hash is not, and cannot be, part of the match — `usePathname()`
  never sees one, so `/about#how` and `/about#hosts` are the same
  pathname. Reading `window.location.hash` in the matcher would make
  `lib/nav.ts` browser-only and untestable, which is the whole reason it
  was moved out of the component; `lib/nav.test.ts` pins that.

---

## ADR-038 — The bare domain picks a language; every other URL still states one

**Date:** 2026-08-01 · **Status:** accepted

`https://ebrostay.com/` answered `302 → /es/` for everyone. An English
visitor landed in Spanish, switched to English, came back the next day
and landed in Spanish again — the site had no memory of the only
language decision they had ever made, and no interest in the one their
browser was already broadcasting. v1 did better: `site.js` read
`navigator.language` on first load. The behaviour was lost in the v2
rebuild rather than retired, and nobody decided to drop it.

**Decision.** The bare domain — and only the bare domain — resolves a
language and forwards to `/es/` or `/en/`. In order:

1. **A language chosen here before**, from `localStorage`
   (`ebrostay-language`). Written by the header's language switch and by
   nothing else.
2. **A language the browser says they read**: the first entry of
   `navigator.languages` whose primary subtag is `es` or `en`. Region is
   ignored — `es-AR` and `es-419` are Spanish, `en-GB` is English.
3. **English**, if the browser listed its languages and neither was
   among them. A browser that has said it reads German has told us
   something, and for companies relocating people to Zaragoza English is
   the second language far more often than Spanish is. v1 resolved the
   same way.
4. **Spanish**, if there was no signal at all — no stored choice, no
   languages. The site default (`i18n/routing.ts`), the sitemap's
   `x-default`, and the answer a visitor with JavaScript off gets.

Every other URL is unchanged. Locale prefixes stay mandatory
(`localePrefix: "always"`), `/es/…` is always Spanish and `/en/…` always
English, and nothing sniffs a language on a page that already names one.
This is a decision about the one address that carries no answer, not a
negotiation over the ones that do.

**Only the switch writes the preference.** Arriving on `/en/property?id=…`
from a link a colleague sent is not a statement about which language you
want the site in; treating it as one would pin a Spanish-speaking
visitor to English for every later visit on the strength of somebody
else's link. The rule matches the theme toggle: the control writes,
navigation does not.

**Why it is a static file and not a Next page.** The redirector is
`app/public/index.html` — 3 KB, an inline `<script>` in `<head>`, no
framework. It could have been `app/page.tsx`, which would have made the
rule importable from `lib/locale.ts` instead of hand-copied into a
script tag. It is not, for two reasons. A root-level page renders
outside the `[locale]` layout, so Next wraps it in its synthesised root
layout and the export nests a second `<html>` inside the first — visible
today in `out/404.html`, tolerable for a 404 and not for the site's
entry point. And it would put the whole React runtime on the critical
path of a page whose entire job is to leave: the inline script redirects
during head parse, before a single chunk is fetched. The cost is the
duplication, which is the same trade the pre-paint theme bootstrap
already makes and is handled the same way — `resolveLocale()` in
`app/lib/locale.ts` holds the rule and is unit-tested, the script mirrors
it branch for branch, and the e2e suite runs the script rather than the
function so a drift between them fails a test.

**The edge redirect had to go.** `staticwebapp.config.json`'s
`"/" → /es/ 302` was decided by the CDN before any HTML was served —
with it in place no script anywhere could have had an opinion, which is
why the stub sitting at that address had been dead code since it was
written. In its place `/` carries a **rewrite** to `/index.html`, which
serves the redirector rather than pre-empting it.

The rewrite is not decoration. In production SWA would resolve the
directory index on its own, but the everyday local stack is
`swa start http://localhost:3000` — the emulator in proxy mode, where
there is no directory to index: it hands `/` to `next dev`, which has no
route for it and answers its 404 page. Deleting the redirect without
adding the rewrite fixed the bare domain in production and broke it on
the machine of everyone working on it. `pages.spec.ts` asserts only that
no **redirect** rule sits on `/`, which is the thing that would silence
the redirector; a rewrite is what makes it reachable.

**Consequences.**

- `next dev` does not serve `public/` for `/` — it hands the path to the
  App Router, which 404s. The bare domain therefore only works under SWA:
  in production and via `swa start`. The e2e suite opens `/index.html`,
  which is the same bytes and the same script; the untested link is SWA's
  own directory-index behaviour, verified by hand against `app/out`. A
  `swa-export` entry in `.claude/launch.json` serves the built export for
  exactly this check.
- The query string and hash survive the redirect, so a campaign or
  shortened link into the bare domain keeps what it was carrying. What
  the destination does with it is the destination's business: the home
  page rewrites its own query to `writeResultsState()`'s output on mount
  and drops anything it does not recognise.
- With JavaScript off, `/` shows a two-link page and a `<noscript>` meta
  refresh to `/es/`. Crawlers that do run JavaScript will follow the
  script; `/` keeps `rel="canonical"` to `/es/` plus `hreflang`
  alternates, and both locale homes are listed explicitly in the sitemap,
  so neither is reached only through this page.
- `location.replace`, not `location.href`: the redirector leaves no
  history entry, so Back from `/es/` returns where the visitor came from
  instead of bouncing through it again.
- A visitor who has chosen a language is now sent there from `/` even if
  they meant to see the other one. The header switch is two clicks away
  on every page and rewrites the stored choice, which is the same escape
  hatch the theme toggle offers.

---

## ADR-039 — "Your places" is measured, not estimated, and the browser keeps it

**Date:** 2026-08-01 · **Status:** accepted · **Amends:** ADR-028

The "Your places" section on the property page asked a guest to type a
label, pick a travel mode from five, and **type a distance in kilometres**.
It then multiplied that distance by a table of average speeds for
Zaragoza and printed a number of minutes. Every part of that is now gone.

The number was the problem. It was rendered in the same type, in the same
row position, as the measured figures the "What's nearby" list shows two
sections above — and it was arithmetic on a guess. A guest comparing two
homes had no way to tell that one column was routed and the other was the
output of `km ÷ 4.8 km/h`, and the section that asked for the distance was
also the section that presented the answer as fact. Nothing about the
layout admitted that the person reading the figure had supplied its only
input.

**Decision.** The guest gives an address, and nothing else. It is
geocoded (Nominatim, client-direct, the same lookup the listing editor
uses), and the route from this listing to it is measured by
OpenRouteService under the same two profiles the nearby list offers —
`foot` and `car`. Distance, time and the line on the map all come from
one answer. Five places, and the browser keeps them.

**The places stay in the browser.** Not "for now": that is the decision.
An office address, a school and a gym are a description of somebody's
life, and Ebrostay has no use for them — nothing in the booking flow,
the listing flow or the admin flow reads a saved place. Keeping them in
`localStorage` (`app/lib/places.ts`) means they need no account, work on
the first visit, survive a locale switch, and never appear in a Cosmos
document or a backup. If they ever have to follow a guest between
devices, that is a new decision with a new privacy question, not a
migration of this one.

**The endpoint takes a destination, which the anonymous route endpoint
deliberately does not.** `GET /api/properties/{id}/place-route?lat&lng&profile`.
`PropertyNearbyRoute` refuses coordinates on purpose — it takes ids and
`RouteCache` resolves both ends from the stored document — and the reason
that rule cannot be kept here is structural: a saved place is not on the
listing and has no id we could resolve. So the bound moves rather than
disappearing:

- The **origin** is still read from the stored listing and never from the
  request. A caller cannot route between two points of their own choosing;
  they can only route *from one of our published homes*.
- The destination is bounds-checked to the Zaragoza box, the same check
  `HostNearbyPreviewRoute` already makes.
- `OrsBudget` caps the day at 1,500 calls and fails closed, so the worst
  an abusive caller achieves is degraded routing for a day. Never a bill.
- Nothing is written. This path does **not** go through `RouteCache`.

That last one is a deliberate departure from how the nearby routes work,
and it is a privacy decision before it is a cost one. Caching a guest's
own destination server-side would store *where somebody works*, keyed by
*the home they were looking at* — a record we would then own, in exchange
for a hit rate close to zero, because these destinations are personal and
two guests rarely share one. The browser caches instead
(`ebrostay-place-routes`, bounded at 80 entries, keyed on listing +
destination rounded to ~1 m + profile), which is what actually keeps an
ordinary visit to five calls and a revisit to none. The response is
`private, max-age=86400` for the same reason: the URL carries the guest's
destination, and a shared cache keyed on it has no business holding one.

**Five.** Enough for the office, the school, the gym and two more; few
enough that the list stays a glanceable comparison rather than a second
results page, and that one listing view can never cost more than five
measurements per profile. Enforced at the add button and again in
`parsePlaces`, because a store written by an older build is not a store
we control.

**Its own profile toggle, and its own map.** The nearby section owns a
`foot`/`car` toggle already, and one shared control would have been
tidier. It is not shared because this section renders for every listing
while the nearby section renders only for a listing that has entries —
binding a guest's places to a toggle that may not exist would make the
common case depend on the optional one. The two controls offer the same
two profiles and read the same figures, so they agree about everything
except which one you last touched.

> **Reversed the same day by ADR-040.** The dependency this avoids is
> real, and duplicating the control was the wrong way out of it: the
> toggle and the map belong to the *section*, not to the nearby list, so
> moving them up costs nothing and sharing them costs a page that asks
> one question twice. "They agree about everything except which one you
> last touched" was the tell — two controls that must agree are one
> control in the wrong place.

**Consequences.**

- Saved places from the previous shape have no coordinates and cannot be
  routed. `parsePlaces` drops them silently on first read rather than
  showing a row with no figure — one key that cleans itself up, pinned by
  `lib/places.test.ts`.
- Adding a place needs Nominatim, so it fails where the address lookup
  fails. That is a convenience lost, not a section: the places already
  saved keep measuring, and the field says what happened.
- The class comments on `NearbyFunctions` and `RouteCache` asserted that
  no anonymous path routes to a caller-supplied point. Both were rewritten
  rather than left to rot — a security invariant that has quietly stopped
  being true is worse than one that was never claimed.

---

## ADR-040 — One map, one travel toggle, one selection

**Date:** 2026-08-01 · **Status:** accepted · **Amends:** ADR-028, ADR-039

ADR-039 gave "Your places" its own `foot`/`car` toggle and its own map,
reasoning that binding the guest's list to controls owned by the nearby
list would make the common case depend on the optional one — the nearby
section renders only for a listing that has entries, the places list
renders for every listing. The reasoning was sound and the conclusion was
wrong: it duplicated the control instead of moving it.

What it produced was a page asking one question twice. Two travel toggles
that could disagree, two maps a route could land on, and two independent
selections — so a guest could have a nearby entry highlighted in one list
and a place highlighted in the other while exactly one line was drawn,
with nothing on screen saying which list the line belonged to.

**Decision.** One map, one toggle, one selection, all owned by the
property page, which is the only node above everything that reads them.
`Nearby` and `YourPlaces` both render no control and mount no map.

**The places list moved inside the neighbourhood section.** That is what
makes the map sticky in a way that helps: `position: sticky` is scoped to
the sticky element's own parent, so a map inside section 7 stops being
visible the moment section 7 scrolls past — which is exactly when a guest
reading a list in section 8 needs it. One section, map pinned at its top,
both lists scrolling under it. This is the same argument Task 12 used to
merge sections 7 and 9 in the first place, applied one list further.

Sticky from `lg` up only, matching the booking panel's own rule. A 240 px
map plus a toggle pinned to the top of a phone leaves almost nothing to
scroll; below that breakpoint the map stays where it is and selecting a
place scrolls it back into view (`block: "nearest"`, so a map already on
screen does not jump).

**The toggle rides with the map**, not above either list. It governs both
lists and the line on the map, and a control that scrolls away from the
figures it changes is a control you have to remember.

**Clearing the map belongs to the page, and nowhere else.** Both lists
call `onRoute` only with a destination they actually have; neither ever
calls it with `(null, null)`. This is not stylistic. Effects run in tree
order, so if each list cleared its own line, moving the selection from one
list to the other would be correct in one direction and would erase the
new line in the other, depending on which list happened to render first.
The page clears in the same handler that changes the selection, so there
is no ordering to get wrong.

**Consequences.**

- `Nearby` lost its internal profile state, its `Segmented`, and its
  `useImperativeHandle`. A description place chip now selects through the
  page directly, and the "does this entry have a figure under the active
  profile" guard moved there with it — the page is what knows both the
  entries and the profile.
- Both lists now key their fetched routes by entry **and** profile and
  store only terminal states, so "measuring" is the absence of an entry.
  Switching profile and back redraws from memory instead of re-fetching,
  and every `setState` happens in a promise callback rather than
  synchronously in an effect.
- `#whats-nearby` and `#your-places` are now anchors on the page. They
  exist because both lists live inside one `<section>`, so "the places
  list" is no longer addressable as a section — the e2e suite says so
  first, but a future in-page nav will want them too.
- `detail.places.profileLabel`, `.profile.*` and `.mapLabel` are gone from
  both message files. They named a control and a map this list no longer
  owns.

---

## ADR-041 — Address precision on the public listing

**Date:** 2026-08-07 · **Status:** ✅ locked 2026-08-07 ·
**Amended 2026-08-08** — *where the band is derived, and who signs it off.*
See the amendment at the end of this ADR. ·
**Relates to:** ADR-039, ADR-040 (map and routes) ·
**Source:** the five-site comparison in `docs/ux-analysis/` and the
backlog item "Address precision policy". Written in plain language at the
product owner's request.

### Context

The public listing page shows the exact home location before any booking:

- The title contains the street, the house number, and the unit
  ("Pedro II el Católico 3 - 1 IZQ").
- The address plate shows the full postal line. It has a copy button.
- The map pin is on the building. Route lines start at the building.
- The anonymous API sends exact `lat`/`lng` and the `address` field.

The same page also shows when the home is empty (the availability band),
the floor number, and a floor plan.

No competitor shows the house number before booking. Wunderflats shows
street and postcode. Blueground and Spotahome show the street name.
Flatio shows only the neighbourhood. Evidence:
`docs/ux-analysis/compare.html`, identity group.

**Risk.** A vacant furnished home is a known target for squatting
("okupación") and burglary in Spain. Our page tells a stranger which
door, which floor, what is inside, and when nobody is there. The exact
address also enables listing-clone fraud: scammers copy a real address
into a fake listing.

**Value of the current behaviour.** An exact address lets a booker check
the commute before booking. It fits the transparency principle of the
design (spec §6.1). The route feature needs true coordinates to draw
correct lines.

### Decision — the street is the disclosure unit

> Earlier drafts listed two more options (keep everything exact; hide only
> the house number) and an offset pin inside a ~200 m circle. The product
> owner rejected them on 2026-08-07: a circle is pointless when the street
> name is public, and the street name should stay — it carries real
> commute value. The design below replaces all of them and is validated by
> a working prototype: `docs/ux-analysis/prototypes/street-band.html`
> (real OSM street geometry, real ORS routes).

1. **Text.** The public page shows the neighbourhood and the street name,
   without the house number. Listings get neutral public titles — today
   the title *is* the address plus the unit.
   *Amended 2026-08-07 (product owner), after first build:* the original
   text also removed the address plate and its copy button. That went
   further than the decision required — the plate was never the leak, the
   house number on it was. The plate stays, showing the street name and
   the neighbourhood only; its copy control puts "street, Zaragoza" on
   the clipboard, which resolves mid-street in a maps app — the same
   disclosure as the band. The street name ships in the public detail as
   `streetName`, derived from OSM with the band.
2. **Map.** The map highlights the street. No pin, no circle. The label
   says: "the home is on this street". The band renders in river blue
   (`--river-deep`) — information, not selection; routes stay brand
   green.
   **Long streets get a segment, not the whole street.** The band is the
   whole street or a ~250 m segment, whichever is shorter. The segment is
   cut at junction nodes so it covers whole blocks ("from Calle A to
   Calle B"), and the home sits **off-center** by a fixed per-listing
   offset — never in the middle, and stable across requests so it cannot
   be averaged out.
   **The geometry is derived, not typed.** At listing save/approval, the
   server reverse-geocodes the stored coordinate to its OSM way, merges
   same-named neighbour ways, and cuts the segment. The host enters
   nothing; the owner confirms the band in the editor's map preview, and
   the admin sees it in review. OSM data is ODbL — the map's existing
   attribution covers it.
3. **Travel times become honest ranges.** For each saved place and each
   travel profile, the server routes from **both street ends and from the
   true door**, takes the minimum and maximum, rounds them outward to
   whole minutes, and returns **one merged response**: "4–6 min". The
   exact point never reaches the browser.
   The end samples sit **~10 m inside the street, never on the junction
   node**. On the node, the router snaps to the crossing street and can
   exit a one-way street against its direction (found by the product
   owner on the prototype map). Measured on this one-way street: car to
   the tram from the downstream end was 1.9 min sampled on the junction
   (illegal exit) and 3.6 min sampled inside (legal). The inset applies
   to bike routes too — the router respects one-way for both.
4. **The true door must be in the sample set.** This is not optional. The
   prototype measured that the true door can fall *outside* the two-end
   range (Plaza del Pilar on foot: ends 35.0 and 35.6 min, door 36.1 min
   — routing snaps to one side of the street and to one-way loops). With
   the door in the sample set, the shown range always contains the truth.
5. **Route lines.** The boundary routes share the road once they
   converge. The map must not draw that shared part twice: split at the
   fork, draw the shared trunk once as one solid line, and draw only the
   short stubs from the street ends as light dashed branches. The result
   reads as a small fan at the street (the uncertainty) and one line for
   the rest (the shared truth). No line ends at a door. The prototype
   implements this split.
6. **API.** The anonymous detail response carries street geometry instead
   of `lat`/`lng`, and no `address`. The route endpoints return only the
   merged range and the two boundary lines. The outward rounding also
   blunts triangulation: an attacker who computes the public end-routes
   himself cannot read the door's exact time off the band edge.
7. **After booking.** The guest receives the exact address once the
   booking is confirmed, through the existing channels (WhatsApp /
   email).

**Measured cost of the blur (prototype, Pedro II el Católico, ~190 m
street, 4 places × 3 profiles):** ranges are 1–2 minutes wide on foot and
about 1 minute by bike and car. Example: walk to the tram 4–6 min, walk
to Plaza del Pilar 35–37 min. The commute answer a booker needs survives
almost untouched.

### Rationale

The design closes every leak at once — title, address plate, pin, route
lines, and API — while the one thing the location data is *for*
pre-booking, the commute answer, survives almost untouched (ranges 1–2
minutes wide). The alternatives protected less (hiding only the number)
or destroyed more (an offset pin draws routes from a false point; the
band's ranges are honest by construction). Every mechanism was validated
on the prototype with real routing data before the lock.

### Consequences

- Public listing titles must change to neutral names.
- **The search map is in scope, not only the detail page.** The anonymous
  list payload (`PropertySummary`) carries exact `lat`/`lng` today, so
  the search pin marks the door even if the detail page hides it. Fix:
  the list payload's point becomes the **midpoint of the published
  segment**, derived server-side from the band — never the door (the
  home is off-center in the segment by design). `ResultsMap` and its
  pin-grouping need no change; at city zoom the shift is smaller than a
  pin. The same rule applies to every anonymous route endpoint,
  including "your places" (ADR-039): a route line drawn from the true
  coordinates marks the building, so all of them return the merged
  fan-and-trunk shape.
- The detail API, the map component, the routes, the address plate, and
  the e2e fixtures change. The seed data keeps true coordinates; the API
  computes the street band and the merged ranges server-side.
  `RouteCache` stays the only id→coordinates authority (ADR-028/039/040)
  — the merge lives behind it.
- Each route lookup costs three ORS calls instead of one (two ends + the
  door). `OrsBudget` and the route cache absorb this; cached entries are
  per listing, not per visitor.
- The floor plan and the availability band can stay. Without an address
  they identify nothing.
- The booking confirmation flow gains one duty: deliver the exact
  address.

### Amendment 2026-08-07 — three build-time notes

✅ **Built 2026-08-07**, to this design overall, with three points worth
recording so the built behaviour and the written design do not silently
drift apart: two clarifications the ADR's text above does not spell out,
and one part of the design that is not built yet.

- **Point 3's per-profile range is computed only for a profile already
  routable to that place.** `NearbyEntry.ReachBands` is built from the same
  ORS matrix call as the owner-exact `Reach`, restricted to the profiles
  that made it into `Reach` in the first place (`HostFunctions.cs`) — a
  profile the true door cannot reach has no `Reach` entry at all (existing
  ADR-028 rule) and so has nothing to show a public range for either. The
  ADR's text reads "for each saved place and each travel profile" without
  this qualifier; the qualifier is the pre-existing per-profile-routability
  rule applied consistently, not a new restriction.
- **The public reach figure carries a coarsened distance the ADR's text
  never mentions.** `PublicReach` pairs the point-3 minute range with a
  `metres` figure, rounded to the nearest 50 m, so the existing "· 400 m"
  UI label keeps working without exposing the precise measured distance.
  The ADR's worked example ("4–6 min") only ever discusses minutes. The
  route endpoints (§4.2.1, §4.2.2) carry the same coarsening on their
  `metres: [lo, hi]` range, floor/ceil to 50 m rather than round —
  `PropertyPlaceRoute` accepts any destination in the Zaragoza box, so a
  finer band on that response would let a caller sweep probe destinations
  along the street and read the door's network distance off the range at
  whatever finer precision was used, defeating the point of the band.
- **Point 2's "the owner confirms the band in the editor's map preview, and
  the admin sees it in review" is not built.** The host editor's
  `LocationPicker` (`app/components/host/fields/LocationPicker.tsx`) is
  unchanged by this design — it still shows only the exact pin, never the
  band — and there is no admin review surface for it to appear on either
  (the admin queue itself was still 🔜 when this was written; it shipped
  2026-08-08, and the band preview it lacks is KAN-48). The band derives
  and takes effect regardless: an owner who wants to see it today has only
  the public preview of their own listing (§2.2, ADR-029) to look at. Left
  as a backlog item rather than reopening the ADR.

### Settled with the lock, and what stays open

- Long streets: **settled** — the segment rule above is part of the
  design from day one; avenue listings are the normal case, not an edge
  case.
- Owner and admin views: **settled, yes** — they keep the exact address
  and coordinates. The restriction applies to anonymous and guest views
  only.
- Release moment for the exact address (confirmed booking or signed
  contract): deliberately open → **OD-9**.
- Public naming scheme for listings: **OD-10, decided 2026-08-07** —
  generated formula (street without number + neighbourhood) prefilled in
  the editor, owner override through the existing review queue.
  Implementation is unblocked.

### Amendment 2026-08-08 — the band is derived in review, and a person signs it

**What went wrong.** The band was derived on the owner's save (`PUT
/api/host/properties/{id}`) and, for anything without one, on the guest's read
(`GET /api/properties/{id}`). Derivation is three sequential queries to
`overpass-api.de`, the free community endpoint. Measured against `movera0` on
2026-08-08: **8–9 s per query, 32.7 s end to end, and `504` on two probes in
three.**

Three consequences, none of them visible until measured:

1. **The guest waited 32 s for a page**, saw only its skeleton, and therefore
   saw no map — the very thing the wait was buying.
2. **A failed derivation stored nothing**, so *every* subsequent read of that
   listing paid the same 30 s and still showed no map. A listing that failed
   once was slow and mapless for ever.
3. **The owner's save could be lost outright.** SWA kills any `/api` request at
   45 s (ADR-033 Decision 1) and the document was written ~225 lines *after*
   the derivation. A slow Overpass took the whole save — photos, price, text —
   with nothing said. `pinMoved` is a 0.000001° threshold, ≈11 cm, so every
   nudge of the pin during a first listing paid it again.

**Decision.** Derivation happens in exactly one place: **the reviewer's panel**
(`POST /api/staff/properties/{id}/band`). Nothing on the owner's path or the
guest's path calls Overpass any more.

- A moved pin **clears** the band (a band from the old pin names the old
  street) but derives nothing.
- The reviewer presses *Derive*, sees the line drawn on a map, and either
  approves it or presses it again. This is the first time in the design that a
  person ever looks at the band before a guest does — it was derived data going
  straight to the public map, unread.
- **Publishing requires a band and an explicit tick.**
  `AdminValidation.CheckApprove` returns `band_missing` without one and
  `band_not_confirmed` without the reviewer's confirmation, which asserts two
  things: it is the right street, and it is long enough not to identify the
  individual home. A re-derivation clears the tick — a new line is a new
  judgement.
- `BandDisclosure` warns when a band is under **60 m** (roughly one urban block
  face). Advisory only: a 40 m band over a block of forty flats is fine and a
  40 m band over one villa is not, and only a person can tell those apart.

**Bounds, since Overpass stays third-party and unreliable.**
`StreetBandService` caps the whole derivation at **20 s** (not per query) and
de-duplicates concurrent runs per listing through `SingleFlight`, so a
double-clicked *Retry* costs three queries and not six. `bandAttemptedAt` is
stamped whether or not it succeeded, so the panel can say when it last tried.

**What this does not fix.** The dependency itself. Self-hosting the OSM query
service is KAN-73; the retry button is the
mitigation until then. ORS cannot take this over — it has no named-way
geometry, and its quota is already spent on routing.

**Consequence accepted.** A listing can now be published-blocked by a third
party being down. That is the right way round: the alternative was publishing
homes with no map and no one owning the problem.

---

## ADR-042 — Closing an account is a reversible request, and `closed` is a public state

**Date:** 2026-08-08 · **Status:** ✅ locked and built 2026-08-08
(product owner: Raphael) ·
**Extends ADR-024** (the pause/reopen pairing) with a sixth status neither
ADR-014 nor ADR-024 anticipated · **Amends §3.7**, which recorded
self-service deletion as deferred ·
**Source:** `docs/superpowers/specs/2026-08-08-account-page-design.md`.

### Context

`components/site/AuthMenu.tsx:79` has linked every signed-in user to
`/account` since the menu existed. **The route never did.**
`staticwebapp.config.json` gates `/es/account/*` and `/en/account/*` to
authenticated users, so the visitor passed the auth check and landed on the
404 page. Opening your own account menu and clicking the first item was a dead
end, for every user, for the whole of v2. It is the second half of the bug
ADR-037 fixed on `/about`'s owner CTA, and it was recorded in
the backlog from 2026-08-01 with the honest interim ("hide the menu
entry") never taken.

§3.7 already assigned this page its work — it is where
`/.auth/purge/{provider}` and support contact were meant to live — and §3.7's
deferred "self-service deletion" was the other thing the product owner asked
for in the same session.

### Decision — a request, not a deletion

An owner asks to close their account. `profiles.deletionRequestedAt` (§2.3) is
stamped, their listings move (§2.2.1), and every write endpoint refuses them
(`RequireWritableAsync`, §3.7). **Nothing is deleted, and the owner can take
the whole thing back** with `DELETE /api/account/closure`. An admin sees the
request in the users tab and acts out of band.

1. **A timestamp, not a boolean.** The guard only asks whether it is null, but
   the field is also the only record that a request was made and *when* — the
   thing an admin needs in order to act on it. Same shape as the queue's
   `submittedAt`.
2. **Not `isDeactivated` reused.** The two mean opposite things about who
   holds the controls: deactivation is done to you and locks you out; a
   closure is made by you and must leave you able to reach the page that
   cancels it.
3. **`closed` is publicly visible, not hidden.** This is the decision inside
   the decision. A home whose guest is mid-stay must not vanish from the site
   the moment its owner asks to leave — the guest would read a live stay's
   listing 404ing as the operator disappearing, which is precisely the fear a
   mid-term rental is trying not to trigger. So `closed` reads as public to
   `PublicStatus.IsPublic` and to `ListingVisibility.ForRoutes`, and only
   `published` had to move on a request; `paused`, `draft` and `rejected` are
   already invisible, and moving `paused` to `closed` would make it *more*
   visible, not less.
4. **`pending_review → draft` on the same request.** No reviewer should be
   able to approve a home for an owner who is leaving. The owner resubmits if
   they cancel — and resubmitting re-runs the completeness checks
   (`HostValidation.CheckStatus`), which this endpoint has no business
   bypassing.
5. **Cancelling lands listings in `paused`, and restores only what moved.**
   Two reasons, and the second is a guard, not a preference. Nothing returns
   to search without a deliberate act by its owner — the ADR-024 reopen is
   still the only door into `published`. And a blanket "restore everything to
   `paused`" would push a `draft` into `paused`, from which `paused →
   published` is an owner action needing no review: a listing published that
   no reviewer ever read. That is exactly the trap ADR-027 narrowed the
   `→ paused` transition to prevent (§2.2.1). Restoring only the listings the
   closure actually moved keeps that guard intact.
6. **An owner cannot set `closed`, and cannot leave it.**
   Two different mechanisms, one per direction: `HostValidation.OwnerStatuses`
   excludes it as a **target**, and the **current-status** clauses in
   `HostValidation.CheckStatus` are what refuse every move out of it (see
   §2.2.1 — adding `"closed"` to the array while trusting it to cover the
   "from" side would accept it from any status). It is the first status in v2
   an owner cannot set. That is why an **admin** path had
   to exist: `AdminValidation.Pausable` carries `closed`, so
   `PUT /api/staff/properties/{id}/status` can pause one. Without it,
   deactivating a closing owner left a public home that no endpoint in the
   product could move — their own `DELETE /api/account/closure` is refused
   once `isDeactivated` is set. `closed` is in `AdminValidation.Rejectable`
   for the same shape of reason: a takedown is not less urgent because the
   owner is leaving. It is **not** in `Settable` for `published` — putting a
   departing owner's home back into search is a second deliberate act from
   `paused`, never a side effect of a takedown being reversed.
7. **A closing admin loses the whole admin surface, reads included.**
   `RequireAdminAsync` now layers on `RequireWritableAsync`, so the refusals
   are one ordered chain: 401 anon → 403 deactivated → 403 closing → 403 not
   an admin. Product owner, 2026-08-08: *"Closed is closed, don't want
   surprises for admin acc closures which are the most critical accounts."*
   Note the deliberate asymmetry with owners, whose **reads deliberately still
   work**: an owner's portfolio and cancel button are theirs to see, whereas
   the admin surface is other people's homes and other people's accounts, none
   of it theirs to read on the way out — and half a moderation console, a
   queue you can open but not act on, is the surprise the decision names. The
   way back stays open: the closure endpoints sit on `RequireActiveAsync`, not
   on either stricter guard, because guarding the cancel with the guard the
   request switched on would make the request irreversible by the person who
   made it. The rule reaches past `/api/staff/*`: `GET /api/host/properties/{id}`
   loads through `ListingVisibility.MayWrite`, which admits an admin to
   anybody's listing, so it now applies `ListingVisibility.MayRead` — the same
   predicate minus the admin's cross-account half once that admin is closing —
   and answers 404. Reads a closing admin keeps: their **own** listings and
   their own portfolio, exactly as any closing owner does.

### What is deliberately not built

- **Hard deletion.** §3.7's "records are kept — never deleted" (v1 ADR-007
  intent) is unchanged, and no endpoint deletes a profile. Reversing that is a
  decision, not an endpoint, and gets its own ADR. The admin's "decide how to
  proceed" step is left unbuilt on purpose; the product owner will refine the
  flow later.
- **Invoices or payments blocking a closure.** v2 has no invoice or payment
  concept at all — the Stripe path was not carried (ADR-016). There is nothing
  to query, so the rule is recorded here and dropped from the build.
- **A guest bookings or stays list on `/account`.** `bookingRequests` is empty
  until `POST /api/booking-requests` exists (§4.3), and tenant-assigned stays
  are explicitly not carried into v2 (§2.2.3).

### Consequences

- **A closure request has no terminal action.** It will sit visible in the
  users tab, unresolved, until the deferred hard-delete ADR lands. That is
  intended and it is also the honest cost: the product currently offers a
  person a way to ask to leave and no way to finish leaving.
- **The fan-out is not atomic across documents.** Listings are written first
  and the profile flag last, deliberately: an interrupted run leaves an
  account still open with some listings already moved, which the owner can fix
  by pressing the button again, because both maps are pure functions of the
  current status and therefore idempotent. The other order would leave an
  account closing with listings still public, which nothing retries. The cost
  is a real intermediate state — *listings `closed`, flag unset* — in which
  the owner is fully writable and holds a live listing, which is why `closed`
  had to join `ListingVisibility.ReEntersReview` (§2.2.1). A listing the
  fan-out could not deserialize (ADR-032's legacy plain-string `copy`) is
  skipped rather than failing the whole request, and the count comes back as
  `unreadableListings` — a 200 does not by itself prove every listing moved.
  The count is not decoration: `/account` reads it and, when it is above zero,
  shows the same `account.error` sentence a 502 gets instead of the clean
  "Your account is closing" face. Without that branch the API's honesty stopped
  at the wire — the owner saw a success, a `published` home stayed in search,
  and being write-blocked they could no longer pause it themselves.
- **`closed` is public, so anything reasoning about "is this listing live"
  must consider it.** Three gates answer that question and they are not the
  same set; §2.2.1 lists them, and adding a seventh status means checking all
  three. Three separate gates had to be found and corrected during this build
  alone.
- **When a booking endpoint ships it must refuse a `closed` listing.** Nothing
  can over-book one today only because no such endpoint exists (§2.4).
- **The account menu is no longer a dead end.** With `/admin` shipped the same
  day, both of its links resolve; the backlog item recorded on 2026-08-01 is
  closed.
- `staticwebapp.config.json` gained the exact `/es/account` and `/en/account`
  paths alongside the wildcards, matching what `/admin` got the same day.
  Cosmetic either way per §3.5 — the functions are the boundary.

---

## Open decisions

The v2 residue — items locked decisions deliberately left open, with their
resolution paths. The craft, ops and content items that are not spec-level
decisions used to be mirrored in `docs/BACKLOG.md`; since 2026-08-09 they are
Jira tickets in **KAN** — see the appendix at the end of this file.

| # | Decision | Status | Question | Resolution path |
| --- | --- | --- | --- | --- |
| OD-1 | **Cutover date criteria** | 🔜 | When exactly does DNS move from GitHub Pages to the SWA? Locked only as "early: once the redesigned public site + API are solid; host/admin ship incrementally after". | Define the go/no-go checklist: public pages + search + property detail + booking flow green under the (pending) test gate; current homes re-listed via the v2 editor (ADR-016); custom domain + www configured on the SWA; rollback = DNS revert to Pages. |
| OD-2 | **ACS email timing** | 🔜 | When to wire Azure Communication Services email into the booking hook point (staff notification, guest copy)? | Ship after cutover once request volume justifies it; the hook point in `POST /api/booking-requests` (§4.3) is the only touch point. Requires ACS resource + verified sender domain. |
| OD-3 | **.NET 10 availability watch** | 🔜 | SWA managed functions do not yet accept `net10`. | Check the SWA supported-runtimes list on each Azure update cycle; upgrade immediately on availability per §1.6 / ADR-018. |
| OD-4 | **Supabase decommission snapshot** | 🔜 | v1 prod data stays in Supabase until decommission (ADR-016). What is kept, and when is the project deleted? | After cutover + a settling period: export full `pg_dump` + storage bucket archive to operator-held storage, verify readability, then delete the Supabase project. Date to be set with OD-1. |
| OD-5 | **Published-edit review visibility** | 🔜 | §2.2.1 takes the simple rule: editing a published listing pulls it from public view until re-approved. Should the prior published version instead stay live while the edit awaits review (draft-over-live)? | Keep the simple rule for launch; revisit if hosts complain about visibility gaps. Draft-over-live = store a `pendingRevision` sub-document on the property; approve = promote. Pure additive change. |
| OD-6 | **Turnaround vs weekends and holidays** | 🔜 | The ADR-026 buffer is calendar days; a 2-day turnaround ending on a Saturday is staffed by nobody. Should it count working days, or extend over weekends and Aragón public holidays? | Leaning (2026-07-29): count **working days**. Blocked on one operational fact — does the turnaround crew work Saturdays? If yes, the problem collapses to holidays only. Decide once real stays flow; needs a hand-maintained Zaragoza holiday list (national + Aragón + local: Pilar, San Valero, Cincomarzada) served from ONE place, because the C# projection and the client calendar must agree day-for-day. Raised with ADR-031. |
| OD-7 | **Personal data in an uploaded import document** | 🔜 | ADR-020's privacy rule is *property text only, never personal data*. A pasted portal URL is a public advert, but the document flow's agency dossier or listing sheet can carry the owner's NIE, bank details or a signed mandate — and the extractor is third-party. What may leave, and does the owner have to be told what we send? | Blocks Card B of the start screen; the URL flow ships without it (ADR-033 Decision 9). Options, cheapest first: (a) strip nothing but state it plainly at the drop zone and log what was sent; (b) run a pre-pass in our own function that redacts ID numbers and IBANs before the blob is handed over; (c) keep documents in-house on the ADR-020 assistant and never send them out. Needs a data-processing answer before build, not during. |
| OD-8 | **Import failure-state design** | 🔜 | The failure *codes* are a closed set and their behaviour is specified (login wall, 404, withdrawn, unreadable, timeout, pipeline error — each lands the owner in a blank wizard, never on a dead end). The reading card's failure layout is not designed. | Design alongside the first real pipeline, when the actual failure mix is known rather than guessed. Until then the reading card shows the named reason plus the blank-form route, which is correct if plain. Raised with ADR-033. |
| OD-9 | **Exact-address release moment** | 🔜 | ADR-041 hides the exact address pre-booking. When does the guest receive it: on confirmed booking, or only on signed contract? | Decide with the first real booking under the street-band design; the delivery channel (WhatsApp/email) exists either way. The safer default until decided: signed contract. Raised with ADR-041. |
| OD-10 | **Public naming scheme for listings** | ✅ decided 2026-08-07 | Today a listing's title *is* its address plus unit ("Pedro II el Católico 3 - 1 IZQ"). ADR-041 needs neutral public names. What is the scheme? | **Decided: formula by default, owner override on top.** The public name is generated: street without number + neighbourhood ("Pedro II el Católico — Universidad"). Language-neutral, calm, zero work per listing. The editor **prefills** this formula; the owner may replace it with a custom name, which passes the existing content-review queue like any content edit. Two listings on one street get a quiet disambiguator — its exact form is an implementation detail. URLs use ids, so names never break links. Raised with and unblocks ADR-041. |

---

## Appendix — resolved backlog items (folded in 2026-08-09)

`docs/BACKLOG.md` was the living "later" list from the v2 rebuild. On
2026-08-09 its **62 open items** moved to Jira — project **KAN** on
<https://ebrostay.atlassian.net>, under eleven `v2 ·` epics, every issue
labelled `v2` and `from-backlog`. The file was then deleted; its full text is
in git history at commit `dd4250f`.

What did **not** move is below. These twelve entries were already struck
through as done, and they are not tasks — they record *why* something is the
way it is, which is what this file is for. Each one is a pointer to the ADR
that actually decided it; the ADR remains the authority.

| Was | Outcome |
| --- | --- |
| **Honest negatives in Conditions** — state what a home lacks instead of omitting it | ✅ **2026-08-09**, in the Amenities section rather than Conditions. The nine baseline amenities (`BASELINE_KEYS`, `app/lib/amenities.ts`) are asked outright in the wizard and the ones a listing does not claim are named under "Not available". Parking did **not** get a field of its own — it is one of the nine. Bills are still not stated as an absence: KAN. |
| **Implement the street-band design** | ✅ **Built 2026-08-07** — ADR-041. The public listing no longer discloses the door: street name without number, a river-blue street band on the map (no pin), travel times as server-merged best–worst ranges routed from both segment ends plus the true door, route rendering split at the fork, exact address only after booking. Geometry derives from OSM at save/approval (`StreetBandService`) and lazily backfills on first read of a published pre-ADR-041 listing. Full detail: spec §2.2 / §4.2.1 / §4.2.2. |
| **Exact-date / sub-month stays** | ✅ **Done in substance — ADR-022/023** (2026-07-22/26). Stays are any duration **≥31 and <365 days**, booked by exact dates on the property page, billed by the day. Search granularity remained open and is now KAN. |
| **Duration limits: ≥31 days and ≤12 months** | ✅ **Decided 2026-07-22 — ADR-022:** ≥31 and <365 days, enforced as a day count in `pricing.ts`; UI framing "1–12 months". Research in [`07-legal-notes.md`](07-legal-notes.md). Ops-side rule the app does not enforce: state the temporality cause; do not chain >2 temporary contracts per guest. |
| **Live bug at the month boundary** | ✅ **Fixed by ADR-022 point 2:** the over-limit trigger is the actual day count (`end >= start + 365 days`), never the rounded-up billed months, so a legal ~11½-month stay no longer trips it. |
| **Billing method — whole-month vs. daily proration** | ✅ **Decided 2026-07-26 — ADR-023: daily proration, rate = price ÷ 30, fixed.** The daily-rate basis was settled in the same ADR. Collected per calendar month; built in `app/lib/pricing.ts`. |
| **SWA resource cleanup at cutover** | ✅ **Done.** Verified 2026-08-01 with `az staticwebapp list` across both subscriptions: `ebrostay-home` (Standard, westeurope) is the only Static Web App that exists. |
| **`infra/main.bicep` missing the four ADR-035 auth settings** | ✅ **Fixed 2026-08-01.** `swaName` now defaults to `ebrostay-home`; the four OIDC client id/secret params are `@secure()` and wired into `swaAppSettings`, so the whole-collection PUT can no longer wipe them; header/region comments corrected. Compiles. Still **never deployed**. Two residues went to KAN: the `PIPELINE_WAKEUP_URL` nit, and the fact that `what-if` cannot preview the app settings at all. |
| **Region split: SWA in `eastus2`, data in `spaincentral`** | ✅ **Resolved 2026-07-31 by ADR-035** — the Standard-tier recreation landed the SWA in westeurope, so both compute and data are European. ADR-021 records the original constraint. |
| **Self-service deactivation** | ✅ **Answered 2026-08-08 by ADR-042 — with a different mechanism than the item assumed.** The plan was "a user-initiated deactivation endpoint is the same flag set by self". ADR-042 rejected that: `isDeactivated` is done *to* an account by an admin and locks it out, while a closure is asked for *by* its owner and must leave them able to reach the page that cancels it. Closure is its own field (`profiles.deletionRequestedAt`), its own guard (`RequireWritableAsync`), its own pair of endpoints. Hard deletion is still open: KAN. |
| **`/about`'s "List my home" CTA is a 404** | ✅ **Fixed 2026-08-01.** It linked to `/account`, a route that has never existed, so the one CTA aimed at owners on that page was dead for the whole of v2. Now `/host`, which answers it in either state — the owner pitch signed out, the portfolio signed in (ADR-037). |
| **The account menu points at two pages that do not exist** | ✅ **Fixed 2026-08-08: both pages shipped.** `components/site/AuthMenu.tsx` linked `/account` and, for admins, `/admin`; neither route was built, and both are gated in `staticwebapp.config.json`, so a signed-in user who opened their own menu and clicked "Account" passed the auth check and landed on the 404 page — for the whole of v2. `/admin` is the admin console (spec §4.5); `/account` is spec §3.7's page (ADR-042). The interim never had to be taken. |
