# Ebrostay v2 — Backlog

Deferred ideas, polish, and follow-ups that came up during the v2 rebuild but
were consciously postponed. This is the living "later" list — add to it freely.
Formal product/architecture decisions live in
[`docs/spec/05-decision-log.md`](spec/05-decision-log.md) (open
decisions **OD-1…OD-8** at the end of that file); this file is for the craft,
ops, and content items that aren't spec-level decisions — plus, since the
2026-08-01 consolidation, the roll-up of **decided-but-unbuilt** work below so
every open thread is findable from one place.

Legend: **[P]** polish · **[O]** ops/infra · **[L]** legal/content · **[D]** design-system · **[B]** decided build work · size ≈ S/M/L.

## Remaining v2 build (decided in the spec, not yet built)

The spec (`docs/spec/`) is the requirement; these are pointers, not
re-specifications.

- **[B][L]** **Booking endpoint** — `POST /api/booking-requests` (spec §4.3,
  ADR-015): day-based validation (ADR-022), server recompute with the
  ADR-023/026 estimate shape — the parity tripwire **must** cover
  `cleaningFee` and stay in sync with the client's payment-schedule preview —
  plus the ACS notification hook point (OD-2). Afterwards: the host
  booking-interest log endpoint Manage is designed around.
- **[B][S]** **Inquiries endpoint** — `POST /api/inquiries` (spec §2.5) and
  the contact-form wiring.
- **[B][M]** **Admin surface residue** — the console itself is ✅ **built
  2026-08-08** (spec §4.5): the review queue with approve/reject-with-note,
  all-properties management, and people with deactivate/reactivate. What is
  still open is the queued obligations from five ADRs, which the first build
  deliberately did not carry: the **live Catastro comparison** (ADR-027 —
  `luso`/surface/postcode/centroid, never from a stored copy), the **photo
  EXIF location column** (ADR-019 amendment), the **declined-suggestions
  context row** (ADR-027 amendment, Decision 6 rules), the **per-stay
  `turnoverDaysOverride` control** (ADR-026 — the field and enforcement exist,
  the control does not), and the **street-band map** the admin is meant to see
  when reviewing a listing (ADR-041 point 2 — the band itself already derives
  and takes effect without this). Plus the two tabs that wait on endpoints
  that do not exist yet: **booking-request triage** (§4.3) and the
  **inquiries viewer** (§2.5) — both are blocked by the two items above this
  one, not by the console. Decide reviewer preview of unpublished listings
  (ADR-029 Decision 5): the queue has landed, so this one is now due.
- **[P][S]** **Owner-side band preview in the editor (ADR-041 residue).**
  `LocationPicker` (`app/components/host/fields/LocationPicker.tsx`) still
  shows only the exact pin — the ADR's "the owner confirms the band in the
  editor's map preview" step is not built. Today the only place an owner can
  see their own band is the public preview of their own listing (§2.2,
  ADR-029). Independent of the admin surface above.
- **[B][M]** **AI assistant port** — `POST /api/ai-assistant` (ADR-020,
  spec §4.6): extract/translate/describe on DeepSeek with the existing key;
  the translate button drops into ADR-027's English-approval panel. Keep it
  separate from the async import path (ADR-033).
- **[B][M]** **Cutover** — the OD-1 go/no-go checklist: re-list current homes
  through the v2 editor (ADR-016), custom domain + www on `ebrostay-home`,
  DNS move, rollback = revert to Pages. Then OD-4 (Supabase snapshot) and the
  SWA resource cleanup below.
- **[B][S]** **Stay record** — Manage's Stays table derives dates/length/rent
  from availability blocks but has no stay reference, no stay type, and no
  *agreed* rent distinct from the live price (spec §4.4; ADR-025 makes
  price edits non-retroactive, which needs the agreed rent stored somewhere).
  Payout details re-scope rides on it (spec §2.1).

## Design & frontend
- **[D][M]** Rewrite the Claude Design project's `components/` library to v2. It
  has a full component set (Button, Card, Rating, Input, Select, PropertyCard,
  SearchBar…) + `ui_kits/dashboard` that exist ONLY in the Claude Design
  project, never exported to the repo, and are still v1-styled (they render via
  compat aliases). Mirror the real v2 components now that they exist, then
  export project→repo to restore parity.
- **[D][S]** Self-host the fonts (Familjen Grotesk, Onest, Spline Sans Mono) in
  the design-system repo instead of the Google Fonts CDN `@import`
  (`tokens/fonts.css`). The ebrostay-home app already self-hosts via
  `next/font/google`; only the DS repo/project is CDN-loaded.
- **[P][S]** Convert the wordmark SVG text (`app/public/brand/logo-wordmark*.svg`)
  to outlined paths for standalone use (email signatures, print, OG images) —
  they currently reference Familjen by name and fall back to Onest where the
  font isn't loaded.
- **[P][S]** Home listing cards don't surface amenities as badges (the amenity
  data is now in the summary projection and drives filtering — could also show
  the top 2–3 as chips on the card).
- **[P][M]** Pretty property URLs (`/property/{slug}` instead of `?id={slug}`)
  via SWA rewrites — cosmetic + marginally better SEO. Current `?id=` model
  works with static export today.
- **[P][S]** **Finish or drop `app/public/site.webmanifest`** (found 2026-08-01
  during the pre-admin-queue cleanup). It ships on every deploy and is inert on
  three counts: nothing links it (`metadata` in `app/app/[locale]/layout.tsx`
  sets `icons` but not `manifest`, so no `<link rel="manifest">` is ever
  emitted); both icons it names — `/brand/ebrostay-icon-192.png` and `-512.png`
  — were deleted in `0e1a236` as outdated branding, so they would 404 if it
  *were* linked; and its description still says "1 to 11 months" against
  ADR-022. Its colours are current (`#1f8a57` = light-mode `--brand`,
  `#f6f8f6` = `--inverse`). To finish: regenerate the two PNGs from the current
  mark, add `manifest: "/site.webmanifest"` to the metadata, fix the copy. To
  drop: delete the file — no user-visible change, since nothing fetches it.
  Only affects Add-to-Home-Screen / desktop install, never normal browsing or
  SEO, so the honest default is drop unless mobile-install polish is wanted.

## Listing page — competitor-analysis follow-ups (2026-08-07)

From the five-site comparison in
[`docs/ux-analysis/`](ux-analysis/README.md) (structure maps, comparison,
[info inventory](ux-analysis/info-inventory.md)). Net finding: nothing on
the page is dead weight; every real gap is contractual or a one-line fact.

- **[L][M]** **Cancellation policy + required paperwork on the listing** —
  the one info group where 3 of 4 competitors answer (Spotahome's refund
  ladder, Flatio's named policy, Blueground's ID checks) and we are silent
  everywhere. **Needs an ADR first** — it's company policy, not per-listing
  copy, and it collides with the existing item below about `stayTerms`
  `cancellation` being a per-listing field one home could silently opt out
  of (Host & listing editor section). Decide policy → then a compact
  "before you book" block near the booking-panel CTA.
- **[P][S]** **Honest negatives in Conditions** — state what a home lacks
  ("no lift", "no parking", bills capped at X) instead of omitting it.
  Wunderflats and Flatio both prove stated absence reads as confidence.
  Mostly derivable from existing fields (amenities, `billsPolicy`); parking
  may want a real field rather than an amenity.
- **[P][S]** **Calendar-freshness stamp on the month-band** ("updated N
  hours ago") — Spotahome and Flatio both do it; cheap trust for a page
  whose identity is the calendar. Needs the availability-blocks
  last-modified timestamp surfaced in the property projection.
- **[P][S]** **Internet speed as a fact** — one mono numeral (Mbps) in
  Conditions; only Flatio has it and it's a filter criterion for exactly
  our corporate/remote audience. Needs a listing field + editor input;
  owner enters their speed-test result.
- ~~**[L][L]** **Implement the street-band design — ADR-041, locked
  2026-08-07.**~~ ✅ **Built 2026-08-07.** The public listing no longer
  discloses the door: street name without number, a river-blue street band
  on the map (no pin), travel times as server-merged best–worst ranges
  routed from both segment ends plus the true door (ends sampled ~10 m
  inside the street), route rendering split at the fork (stubs + one
  trunk), exact address only after booking. Street geometry derives from
  OSM at save/approval (`StreetBandService`: reverse-geocode → merge ways →
  cut ≤~250 m segment at junctions, home off-center) and lazily backfills
  on first read of a published pre-ADR-041 listing. Detail API drops
  `address`/`lat`/`lng` for `band`; list API's `lat`/`lng` is now the
  segment midpoint; `NearbyFunctions` + `RouteCache` merge a 3-sample route
  (both band samples + the door) on every anonymous route endpoint incl.
  your-places; `NeighbourhoodMap` (guest-facing map + fan-and-trunk), the
  editor's OD-10 name prefill, and e2e fixtures all updated; seed data
  untouched (true coords stay server-side). Full detail: spec
  §2.2/§4.2.1/§4.2.2. Four residues carried forward as their own backlog
  items: rename existing listings, OD-9, and confirm backfilled bands
  (below); an editor/admin band preview the ADR also calls for but is not
  built (the "Admin surface" and "Owner-side band preview in the editor"
  items above).
- **[O][S]** **Rename the existing listings post-deploy (ADR-041
  residue).** Every current listing's `name` is its address
  ("Pedro II el Católico 3 - 1 IZQ") — the wizard's OD-10 name prefill only
  applies to a listing saved from now on, so each existing one needs a
  manual rename through the editor. Small inventory, minutes of work, but
  until it's done the public page's own title still leaks the door. Do this
  **immediately after deploy**.
- **[O][S]** **OD-9 remains open (ADR-041 residue).** The exact address is
  still released manually, over WhatsApp or email, once a booking is agreed
  — the safer default until OD-9 (`docs/spec/05-decision-log.md`) is decided
  is **signed contract**, not confirmed booking. Decide with the first real
  booking under the street-band design; the delivery channel exists either
  way, so nothing here is blocked on the decision.
- **[O][S]** **Confirm backfilled bands in the owner preview (ADR-041
  residue).** A published listing saved before ADR-041 gets its `band`
  lazily, on its first `GET /api/properties/{id}` after deploy (§2.2) —
  that is the ADR's owner-confirmation step for pre-existing listings.
  Open each one's owner preview after deploy and check the band looks
  right (right street, sane segment) before trusting it in front of a
  guest.
- **[P][—]** **Decide-deliberately tier, no rush** (full verdicts in the
  [info inventory](ux-analysis/info-inventory.md)): checked-on date on the
  Verified badge, move-in/out clock times, bed sizes, an operator identity
  plate for guests, a per-area neighbourhood paragraph, photo count in the
  mosaic, per-room inventory, lease readable pre-booking; at scale only:
  reviews, similar listings. The keep-out list (urgency counters, platform
  voice, guarantee theater, SEO tails) is equally binding — it's what keeps
  the page shorter than every competitor's.

## Search & stay model
- **[P][M]** **Overlapping availability search when the month selector is used**
  (Raphael, 2026-07-22). Today search requires an exact date-range fit
  (moveIn → moveIn + N whole months). When the user expresses a stay as a
  *duration* via the month-band (not exact dates), the search should instead
  find properties with **any** window that can fit ~N months — an
  overlap/flexible search — rather than a hard fixed-range fit.
- ~~**[P][M]** **Exact-date / sub-month stays.**~~ ✅ **Done in substance —
  ADR-022/023** (2026-07-22/26): stays are any duration **≥31 and <365 days**,
  booked by exact dates on the property page, billed by the day. What remains
  is the *search* granularity — the hero still expresses duration in whole
  months — which is the overlapping-search item above plus the duration↔dates
  link below.
- **[P][S]** **Link duration ↔ dates.** When the stay-length selector changes,
  move the to-date picker (and vice-versa). Note the current layout: the hero
  has a month-band (1–12 since ADR-022) but no explicit checkout picker; the
  property page has a from/to `DateRangePicker` but no month-band — so this
  implies putting both controls on at least one surface, a small design choice.
- ~~**[L][M]** **Duration limits: ≥31 days and ≤12 months**~~ ✅ **Decided
  2026-07-22 — ADR-022:** ≥31 and <365 days, enforced as a day count in
  `pricing.ts`; UI framing "1–12 months". The research lives in
  [spec/07-legal-notes.md](spec/07-legal-notes.md); the
  still-unverified compliance questions from it are the **platform compliance**
  item below. Ops-side rule the app does not enforce: state the temporality
  cause; don't chain >2 temporary contracts per guest.
- ~~**[P][S]** **Live bug at the month boundary.**~~ ✅ **Fixed by ADR-022
  point 2:** the over-limit trigger is the actual day count
  (`end >= start + 365 days`), never the rounded-up billed months, so a legal
  ~11½-month stay no longer trips it.
- ~~**[P][M]** **Billing method — decide whole-month vs. daily proration.**~~
  ✅ **Decided 2026-07-26 — ADR-023: daily proration, rate = price÷30, fixed**
  (the sub-decision on the daily-rate basis was settled in the same ADR);
  collected per calendar month; built in `app/lib/pricing.ts`.
- **[P][S]** **Per-listing minimum stay from turnover economics.** ADR-026's
  commercial note: the turnover buffer is unsold inventory that scales against
  short stays (~1.6% of a six-month stay, ~10% of repeated one-month stays) —
  an argument for guiding owners to set `minStayMonths` from turnover cost
  rather than the 31-day legal floor alone. Owner guidance/UI hint, per
  listing.
- **[P][S]** **Platform cleaning fee: flat vs. by size or stay length.**
  ADR-026 left it deliberately flat (`PLATFORM_CLEANING_FEE_EUR`, placeholder
  120 €); revisit with real cost data.
- **[L][M]** **Platform compliance to confirm with an abogado** (see legal notes
  §C): NRA rental-registry number (RD 1312/2024) + a possible **platform duty to
  display/verify the NRA and pull non-compliant listings** — if real, this is a
  direct obligation on Ebrostay-as-platform, high priority; the Aragón fianza
  deposit/registration handling (with a possible temporada exemption — sources
  conflict); and the 2-month deposit for temporada. None independently verified
  yet (research rate-limited mid-run).

## Infra & ops
- **[O][L]** **Self-host the OSM query service behind `StreetBandService` (and
  `OverpassClient`).** Both call `https://overpass-api.de`, the free community
  endpoint run by volunteers with no availability promise. Measured 2026-08-08
  against listing `movera0`: three sequential queries, **8–9 s each**, and
  **two of three probes returned `504`**. That is the whole reason the band
  derivation had to come off the request path. ADR-041 needs named-way
  geometry, so this cannot move to openrouteservice — ORS has no equivalent
  (POIs returns points; `/export` returns the routing graph
  [without street names](https://giscience.github.io/openrouteservice/api-reference/endpoints/export/)),
  and routing quota is already capped at 1500/day in `OrsBudget`. Options,
  cheapest first: (a) a paid hosted Overpass instance; (b) our own Overpass
  container over a Spain-only OSM extract (Geofabrik `aragon-latest.osm.pbf` is
  small enough to be cheap); (c) keep the public endpoint and accept that a
  reviewer sometimes has to press *Retry*. Until this lands, the admin retry
  button is the mitigation, not the fix.
- ~~**[O][S]** SWA resource cleanup at cutover — retire `ebrostay-v2` and the
  dead v1 SWA.~~ ✅ **Done.** Verified 2026-08-01 with `az staticwebapp list`
  across both subscriptions: `ebrostay-home` (Standard, westeurope, host
  `delightful-sand-063f8a703…`) is the only Static Web App that exists.
- ~~**[O][M]** `infra/main.bicep` missing the four ADR-035 auth settings; stale
  `swaName` / eastus2 comments.~~ ✅ **Fixed 2026-08-01.** `swaName` now
  defaults to `ebrostay-home`; `EBROSTAY_OIDC_CLIENT_ID` / `_SECRET` and
  `EBROSTAY_MSA_OIDC_CLIENT_ID` / `_SECRET` are `@secure()` required params
  wired into `swaAppSettings`, so the whole-collection PUT can no longer wipe
  them; header/region comments corrected. Compiles (`az bicep build`).
  `what-if` against the live app is clean on the data plane — see the item
  below for what it could *not* check. Still **never deployed**.
  Remaining nit: the template
  sets `PIPELINE_WAKEUP_URL: ''`, which the live app does not have — a deploy
  would add it empty. Harmless; decide whether it belongs.
- **[O][M]** **`what-if` cannot check the app settings — the template's most
  dangerous resource is the one it can't verify.** Run 2026-08-01 against the
  live app, `Microsoft.Web/staticSites/ebrostay-home/config/appsettings`
  returned **`Unsupported` — "Cannot get the current status of the resource via
  the GET method."** Not masked values, not a partial diff: no preview at all.
  So `swaAppSettings` is a whole-collection PUT whose blast radius (deleting
  the settings that keep sign-in working) is invisible to the only
  drift-detection we have — and the SWA resource itself comes back `Ignore`,
  because it's declared `existing`. The manual
  `az staticwebapp appsettings list … | jq -r 'keys[]'` diff in the file header
  is therefore not advice, it is the **sole control**, and it depends on a
  human remembering. Pick one:
  - **(a) Give up the ownership.** Drop `swaAppSettings` from the template and
    manage settings from a checked-in script. The template shrinks to the data
    plane, where `what-if` genuinely works. Simplest and most honest.
  - **(b) Automate the control.** Keep the block, add a preflight that diffs
    live keys against the template's key list and refuses to deploy on
    mismatch. Keeps IaC ownership and closes the gap `what-if` leaves.
  - (c) Bring the SWA itself under bicep. Fixes `Ignore`, does **not** fix
    `Unsupported`, and risks the deployment binding — buys the least.

  Rest of that run, for the record: 13 × `Modify` on Cosmos/Storage, all
  artifact (server-populated properties the template doesn't declare —
  `sqlEndpoint`, `defaultIdentity`, per-container `indexingPolicy.automatic`
  and `conflictResolutionPolicy.conflictResolutionPath`, encryption-scope
  defaults). Two checked rather than assumed: `sqlDatabases/ebrostay → Create
  properties.options` is a phantom (live is manual 1000 RU/s, matching
  `sharedDatabaseThroughput`; throughput is a separate child resource the
  database GET doesn't return), and `nearbyRoutes → Array
  …indexingPolicy.excludedPaths` is the one real content diff — intended, but
  it triggers an index transformation on deploy.
- **[O][M]** **Nothing in the repo can recreate `ebrostay-home`.** The SWA
  resource, its Standard SKU, the custom-auth/OIDC wiring (ADR-035/036) and the
  deployment token exist only as CLI commands somebody ran by hand on
  2026-07-31. `infra/provision.sh` records the *`ebrostay-v2`* build, not this
  one. If the app were deleted, recovery means reconstructing it from the ADR
  notes. This is the other half of "the IaC isn't in sync": the template
  describes the data plane truthfully and the compute plane not at all. Either
  extend it to cover the SWA, or write the ADR-035 provisioning down the way
  `provision.sh` recorded the last one.
- **[O][S]** **`infra/provision.sh` line 17–21 can get the live app deleted.**
  The file is explicitly provisioning *history* (2026-07-19/20), so its
  `ebrostay-v2` / eastus2 text is correct as a record and should not be
  rewritten — but the paragraph saying `ebrostay-home` "rejects all deployment
  tokens", "serves a stale v1 deploy" and "can be deleted at cutover" now names
  the **live Standard SWA**, because ADR-035 reused the name after deleting the
  original (West US 2, deleted 2026-07-31). Add a dated note marking that
  paragraph as referring to the deleted West US 2 resource.
- **[O][S]** Merge [PR #60](https://github.com/ebrostay/home/pull/60) (v1
  as-built spec refresh) into `main` — still open.
- ~~**[O][M]** Region split: SWA in `eastus2`, data in `spaincentral`.~~
  ✅ **Resolved 2026-07-31 by ADR-035** — the Standard-tier recreation landed
  the SWA in westeurope, so both compute and data are European. (ADR-021
  records the original constraint.)
- **[O][S]** `.NET 9 → .NET 10` on SWA managed functions the moment SWA accepts
  `net10` (ADR-018 / OD-3). .NET 9 is already past Microsoft support. Note the
  CI publish is `win-x64` + ReadyToRun — re-verify the RID against the host
  when the runtime moves (the workflow's own comments explain why).
- **[O][S]** Azure Communication Services email on the booking-log hook when
  request volume justifies it (OD-2) — the hook point is already in the
  booking-request endpoint.
- **[O][S]** Supabase decommission snapshot before deleting the v1 project
  (OD-4) — `pg_dump` + storage bucket archive, verify, then delete.
- **[O][S]** Cosmos free tier → paid/serverless when real users arrive
  (Raphael's call). Currently 1000 RU/s shared = €0.
- **[O][S]** Add a **Content-Security-Policy** — `app/public/staticwebapp.config.json`
  defines no `globalHeaders`, so the site ships none. Nothing depends on it
  today: the rich-text design stores JSON and never builds an HTML string, and
  `dangerouslySetInnerHTML` appears nowhere in the app. That is exactly why it
  is worth having — a CSP is the backstop for the bug class those choices make
  unreachable, not a substitute for them. Watch out for Leaflet's inline styles
  and the pre-paint theme bootstrap in `app/app/[locale]/layout.tsx`, which is
  an inline `<script>` and will need a hash or a nonce. Raised 2026-07-29 while
  designing the description editor
  ([design §8](superpowers/specs/2026-07-29-rich-text-editor-design.md)).

## Host & listing editor
- **[P][M]** **`stayTerms` `cleaning` and `cancellation` should stop being
  per-listing declared terms** (ADR-027 consequence, still open): `cleaning`
  now contradicts ADR-026 — it promises the clean is arranged *and paid* by
  Ebrostay while the tenant is charged a named cleaning fee — and is derivable
  from `cleaningBy`/`cleaningFeeEur`; `cancellation` is platform-wide policy,
  and carrying it per listing lets one home silently opt out of a company
  promise.
- **[L][M]** **Document upload subsystem** (ADR-027 records the five required
  documents and what a decision must settle): a **private** container with
  short-lived server-issued access (never `property-photos`, which is
  public-read), an UPLOADED-vs-VERIFIED admin surface, the IBAN on the
  *profile* rather than the listing, and a GDPR legal basis + retention rule
  for ID scans. Until then the wizard's Paperwork step stays a
  `NOT BUILT YET · DESIGN INTENT` frame (ADR-030 Decision 6). Related: OD-7.
- **[P][S]** **"Notice to leave · 30 días" is undecided.** The design handoff
  rendered it as settled platform policy; no ADR decides it (ADR-027
  Decision 5). Decide the notice period before the read-only policy block may
  show it.
- **[P][S]** **Views/analytics for Manage's Performance section** — Umami is
  write-only from the client, so the views figure is an honest empty state
  (spec §4.4). Needs a read source (Umami API or App Insights) before it
  can be real.
- **[P][S]** **Turnover days in the payout preview** as unsold inventory
  (ADR-026 🔜) — the owner should see what the buffer costs next to what the
  stay earned.
- **[P][S]** **Server-side ORS matrix cache** keyed on the exact pin + group —
  the client memo (ADR-028) helps one session only; a server-side twin would
  serve a second owner, a second listing, or a reload, and eases the 1,500/day
  budget. Left open alongside the budget question in ADR-028.

## Auth & accounts
- **[P][M]** **Google sign-in** (ADR-035 🔜): a built-in Entra External ID
  provider — genuinely branded button, none of the custom-OIDC icon problems
  (ADR-036). Untested interaction to check when it lands: gmail-vs-Google at
  the same address.
- **[O][S]** **Custom login domain** — sign-in pages live at
  `ebrostay.ciamlogin.com`; moving them under ebrostay.com needs Azure Front
  Door (~$35/mo). Deferred, purely additive (ADR-035).
- **[D][S]** **Entra sign-in branding debt** (ADR-035): the uploaded banner /
  square logos were rasterised with a substituted typeface — replace with a
  proper export from the original brand assets; the account-picker variants
  show the tenant *name* text, not the logo (no element to style); custom CSS
  is "on borrowed time" per Microsoft's deprecation notice, and `signin.css`
  is written to lose gracefully — keep it that way. The now-redundant
  Microsoft tile on the hosted page is a cosmetic call (ADR-036).
- ~~**[P][S]** **Self-service deactivation**~~ ✅ **Answered 2026-08-08 by
  ADR-042 — with a different mechanism than this line assumed.** The plan here
  was "a user-initiated deactivation endpoint is the same flag set by self".
  ADR-042 rejected that: `isDeactivated` is done *to* an account by an admin
  and locks it out, while a closure is asked for *by* its owner and must leave
  them able to reach the page that cancels it. So closure is its own field,
  `profiles.deletionRequestedAt`, its own guard (`RequireWritableAsync`), and
  its own pair of endpoints. **What is still open is hard deletion** — §3.7's
  "records are kept, never deleted" is unchanged, no endpoint deletes a
  profile, and a closure request therefore has no terminal action until that
  gets its own ADR.
- ~~**[P][S]** **`/about`'s "List my home" CTA is a 404**~~ ✅ **Fixed
  2026-08-01:** it linked to `/account`, a route that has never existed, so
  the one CTA aimed at owners on that page was dead for the whole of v2. Now
  `/host`, which answers it in either state — the owner pitch signed out, the
  portfolio signed in (ADR-037).
- ~~**[B][S]** **The account menu points at two pages that do not exist**~~
  ✅ **Fixed 2026-08-08: both pages shipped.** (Found 2026-08-01 while fixing
  the CTA above.) `components/site/AuthMenu.tsx` links `/account` and, for
  admins, `/admin`; neither route was built, and both are gated in
  `staticwebapp.config.json`, so a signed-in user who opened their own menu and
  clicked "Account" passed the auth check and landed on the 404 page — for the
  whole of v2. Unlike the `/about` CTA these could not be repointed; they
  wanted the pages that were always intended, and both now exist.
  **`/admin`** is the admin console (review queue, properties, users — spec
  §4.5, built 2026-08-08); the **Admin surface** item at the top of this file
  keeps only its queued per-ADR obligations. **`/account`** is spec §3.7's
  page: identity, the `/.auth/purge/{provider}` link, support contact, and
  owner-initiated account closure (**ADR-042** — see **Self-service
  deactivation** below, which that ADR answers with a different mechanism).
  The interim never had to be taken.

## Legal & content
- **[L][S]** Privacy: lawyer to confirm the data-location wording — the policy
  is worded around data residency (Spain Central) but compute/hosting is in
  `eastus2` (US). Flagged during the v1→v2 privacy port.
- **[L][S]** Privacy: the account-deletion section says "withdraw access from
  your GitHub/Microsoft account" — reconcile with the real account UX once
  Task 8/account pages exist.
- **[L][S]** Privacy: keep the "Last updated" stamp current on future edits.

## Testing & quality (feeds Task 14)
- **[P][M]** Pricing parity test: the client `computeEstimate` (`app/lib/pricing.ts`)
  vs the server recompute in the booking endpoint — must agree to the cent
  (spec §4.3 parity guard), on the **ADR-023/026 shape**: rate, rent,
  commission + cap/discount, deposit, **cleaningFee**, total, and the
  payment-schedule preview staying in sync with what the endpoint quotes.
- **[P][M]** Authorization negative-test matrix (v1's biggest gap): anon →
  host/admin endpoints, host A → host B's listing, non-admin → review
  endpoints, deactivated → everything (spec §3.5).
- **[O][S]** **CI runs only the vitest unit suite** (`npm test` in
  `swa-v2.yml`). The Playwright e2e suite (hermetic, fixture-served — no
  services needed, so it *can* run in CI) and `dotnet test
  api/Ebrostay.Api.Tests` are not gates yet.

## Account closure — residues (ADR-042, built 2026-08-08/09)

- **[B][S]** **An unreadable listing has no repair path.** The closure fan-out
  skips a listing `PropertyDocParser.TryParse` cannot read (ADR-032's legacy
  plain-string `copy`) rather than costing the owner every other one, counts it
  in `unreadableListings`, and the account page now says so and points at
  support. But nothing in the product can *fix* such a document: the owner is
  write-blocked by `RequireWritableAsync`, and the admin properties table reads
  through the same parser, so the row it would be repaired from does not render.
  Today the answer is a direct Cosmos edit. Either the admin surface needs a
  raw-document editor for the unparseable case, or a one-off migration should
  retire the legacy shape before it can be hit at cutover.
- **[O][S]** **`/api/account/closure` is missing from the endpoint tables** in
  [`spec/04-functional-flows.md`](spec/04-functional-flows.md), and §4.5 does
  not mention the users tab's `deletionRequestedAt` column. §2 (data model),
  §3.7 (auth) and ADR-042 were all updated on 2026-08-09; §4 is the one place a
  reader looks for an endpoint and does not find this one.
- **[P][M]** **Nothing mechanically enforces the three-gates rule.** A listing
  status is checked by three predicates with two different sets —
  `PublicStatus.IsPublic` (`published`, `closed`), `ListingVisibility.ForRoutes`
  and `ListingVisibility.ReEntersReview` (both also `paused`). Adding `closed`
  missed two of the three; each was caught by review, not by a test. The rule is
  now written down in §2.2.1, but editorially. A `PropertyStatus.All` array with
  a per-gate membership assertion would turn the next omission into a test
  failure instead of a review catch — worth doing before a fourth status exists.
- **[P][S]** **`account_deactivated` is in no admin page's `KNOWN` error list**
  (`admin/properties`, `admin/review`, `admin/users`), so a deactivated admin
  sees "could not be read. Reload the page" on every panel and reloading never
  helps. Pre-dates ADR-042 — the closing half is now caught by `RequireAdmin`'s
  gate, which is what makes the deactivated half the only one left.
