# Ebrostay v2 — Backlog

Deferred ideas, polish, and follow-ups that came up during the v2 rebuild but
were consciously postponed. This is the living "later" list — add to it freely.
Formal product/architecture decisions live in
[`docs/spec-v2/05-decision-log.md`](spec-v2/05-decision-log.md) (§5 open
decisions OD-1…OD-5); this file is for the craft, ops, and content items that
aren't spec-level decisions.

Legend: **[P]** polish · **[O]** ops/infra · **[L]** legal/content · **[D]** design-system · size ≈ S/M/L.

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

## Search & stay model
- **[P][M]** **Overlapping availability search when the month selector is used**
  (Raphael, 2026-07-22). Today search requires an exact date-range fit
  (moveIn → moveIn + N whole months). When the user expresses a stay as a
  *duration* via the month-band (not exact dates), the search should instead
  find properties with **any** window that can fit ~N months — an
  overlap/flexible search — rather than a hard fixed-range fit.
- **[P][M]** **Exact-date / sub-month stays.** Bookings aren't limited to whole
  months — a stay is any duration from **30 days up to just under 12 months**
  (Raphael: `30 … 12×30−1` days). The current model simplifies to whole months
  (billing rounds up; the hero band is 1–11). Allow exact date-range search and
  booking, decoupled from whole-month *billing*. (Pin down the day-count basis:
  30-day months vs. a real calendar year — matters at the boundary.)
- **[P][S]** **Link duration ↔ dates.** When the whole-month stay-length
  selector changes, move the to-date picker (and vice-versa). Note the current
  layout: the hero has a month-band but no explicit checkout picker; the
  property page has a from/to `DateRangePicker` but no month-band — so this
  implies putting both controls on at least one surface, a small design choice.
- **[L][M]** **Duration limits: ≥31 days and ≤12 months** (researched 2026-07-22,
  see [spec-v2/07-legal-notes.md](spec-v2/07-legal-notes.md)). Findings: under
  *current* LAU the regime is set by **purpose, not duration** — no statutory
  12-month line; but a **proposed 2026 reform** (not yet law) makes it explicit:
  min **31 days**, max **12 months**, over-12 auto-converts to a protected
  habitual-residence tenancy, and >2 chained temporary contracts reclassify.
  Product impact: change the model from "1–11 whole months" to **31 days up to
  12 months**; the 31-day floor matters (not 30). Touches `pricing.ts`
  (`MAX_STAY_MONTHS`), the picker/band caps, ADR-004/005, `docs/spec/05`.
- **[P][S]** **Live bug at the month boundary.** Because billing rounds *up* to
  whole months, a legal ~11½-month stay rounds to 12 billed months and wrongly
  triggers the two-contract/over-limit message. Fix by basing the over-limit
  trigger on **actual calendar duration** (does the stay reach 12 months?), not
  the rounded-up billed count. Small change to `pricing.ts`.
- **[P][M]** **Billing method — decide whole-month vs. daily proration.** Legally
  **free to choose** (LAU art. 17: monthly is only the default "salvo pacto en
  contrario"; no proration mandate or bar) and daily proration is common in the
  mid-term segment. Recommendation leaning to **pro-rate partial edges to a daily
  rate** — fairer for mid-term guests and it dissolves the whole-month rounding
  distortion. Open sub-decision: daily-rate basis (rent÷30 vs. ÷actual days in
  month vs. ×12÷365). Reworks ADR-004/005 pricing math + `app/lib/pricing.ts`.
- **[L][M]** **Platform compliance to confirm with an abogado** (see legal notes
  §C): NRA rental-registry number (RD 1312/2024) + a possible **platform duty to
  display/verify the NRA and pull non-compliant listings** — if real, this is a
  direct obligation on Ebrostay-as-platform, high priority; the Aragón fianza
  deposit/registration handling (with a possible temporada exemption — sources
  conflict); and the 2-month deposit for temporada. None independently verified
  yet (research rate-limited mid-run).

## Infra & ops
- **[O][S]** Delete the old v1 SWA `ebrostay-home` (westeurope) at cutover — it
  rejects all deployment tokens and still serves a stale v1; its main-branch
  workflow is already disabled in GitHub.
- **[O][S]** Merge [PR #60](https://github.com/ebrostay/home/pull/60) (v1
  as-built spec refresh) into `main` — still open.
- **[O][M]** Region split: SWA is in `eastus2`, data in `spaincentral`
  (westeurope was ineligible for new resources). Revisit at scale — either
  recreate the SWA in westeurope when eligible, or move to Standard tier + BYO
  functions in Spain (pairs naturally with the .NET 10 upgrade). See ADR-021.
- **[O][S]** `.NET 9 → .NET 10` on SWA managed functions the moment SWA accepts
  `net10` (ADR-018 / OD-3). .NET 9 is already past Microsoft support.
- **[O][S]** Azure Communication Services email on the booking-log hook when
  request volume justifies it (OD-2) — the hook point is already in the
  booking-request endpoint.
- **[O][S]** Supabase decommission snapshot before deleting the v1 project
  (OD-4) — `pg_dump` + storage bucket archive, verify, then delete.
- **[O][S]** Cosmos free tier → paid/serverless when real users arrive
  (Raphael's call). Currently 1000 RU/s shared = €0.

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
  (spec-v2 §4.3 parity guard).
- **[P][M]** Authorization negative-test matrix (v1's biggest gap): anon →
  host/admin endpoints, host A → host B's listing, non-admin → review
  endpoints.
