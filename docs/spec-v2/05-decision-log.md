# Ebrostay v2 Target Spec — §5 Decision Log (ADR-011 … ADR-024)

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
| ADR-024 | Listings are `paused`, not `archived` — and reopen without re-review | ✅ locked |
| ADR-025 | Pricing and availability edits apply live; only content edits re-review | ✅ locked |
| ADR-026 | Turnover days between stays, and who is paid for the clean | ✅ locked & built |

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
  uppercased), `copyEnApproved` (bool).
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
- `copyEnApproved` gates **only** the description. It is the one paragraph
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
