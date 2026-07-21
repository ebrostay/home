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
