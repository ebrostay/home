# Ebrostay v2 Target Specification (`docs/spec-v2/`)

> Target: branch `redesign/v2`, locked 2026-07-19 (product owner: Raphael).
> Status tags: ✅ decided/locked · 🔜 planned (build or later phase) · 🗑️ not carried from v1.

This directory is the **target architecture and delta specification** for the
Ebrostay v2 rebuild. It is prescriptive: it records the locked 2026-07-19
decisions and everything an implementer needs that *differs* from v1.

## Relationship to `docs/spec/` (the v1 baseline)

- **`docs/spec/` (§00–§12) is the functional reference.** It describes v1
  as-built and remains the authoritative source for everything v2 carries over
  unchanged — above all the **business rules in
  [`docs/spec/05-business-rules.md`](../spec/05-business-rules.md)** (billed
  months, commission/cap, filtering, sorting, validation states), which v2 must
  reproduce **exactly, to the cent and to the day**.
- **`docs/spec-v2/` specifies the deltas**: new stack, new product model
  (marketplace + review queue), new auth, new data layer, and the decisions
  that resolve v1's open items. Where a v1 rule carries over, this spec
  cross-references it (e.g. "pricing per docs/spec/05 §5.1") instead of
  duplicating it; where anything **changes**, the change is restated here in
  full.
- The v2 decision log ([05-decision-log.md](05-decision-log.md)) **continues
  the v1 ADR numbering** (v1 ends at ADR-010; v2 starts at ADR-011). Several
  v2 ADRs explicitly supersede v1 ADRs.

## Index

| File | Contents |
| --- | --- |
| [01-architecture.md](01-architecture.md) | System shape, hosting/regions, config surface, local dev, CI/deploy, runtime versions & the .NET 10 upgrade trigger |
| [02-data-model.md](02-data-model.md) | Cosmos DB database/containers, document schemas, property status lifecycle, embedded availability, Blob storage, seed data |
| [03-auth-and-roles.md](03-auth-and-roles.md) | SWA built-in auth, role model, admin invitations, `x-ms-client-principal` contract, profile bootstrap, deactivation |
| [04-functional-flows.md](04-functional-flows.md) | Public browse/search, property detail & estimate, login-gated booking flow, host flow, admin flow, AI assistant, i18n/theme |
| [05-decision-log.md](05-decision-log.md) | ADR-011 … ADR-021 + open decisions |

## v2 in one paragraph

Ebrostay v2 rebuilds ebrostay.com (mid-term corporate rentals, 1–11 months,
Zaragoza) as a **Next.js App Router static export** (TypeScript, Tailwind v4,
next-intl ES/EN with `localePrefix: "always"` and Spanish default, light and
dark themes via `data-theme`) served by the reused v1 **Azure Static Web Apps
Free-tier** resource, with **C# Azure Functions (.NET 9 isolated, → .NET 10
when SWA supports it)** as SWA managed functions, **Cosmos DB serverless**
for data and **Azure Blob Storage** for photos. The product pivots from a
curated catalogue to a **marketplace**: anonymous visitors browse and search;
**booking requires sign-in** (SWA built-in auth, GitHub + Microsoft only);
**any signed-in user may create listings**, which pass through an **admin
review queue** (3 invited admins) before publication. The booking flow is
**log-then-draft**: the server records the full request in Cosmos, recomputes
the estimate for parity, then the client opens the v1 bilingual email or
WhatsApp draft — no online payment, no transactional email (an ACS hook point
is reserved). v1 pricing/filtering rules carry over verbatim; v2 is a **fresh
data start** (no Supabase migration, no sample-data fallback — the API is
required), and production `ebrostay.com` stays on GitHub Pages until an early
DNS cutover once the public site + API are solid.
