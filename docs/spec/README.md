# Ebrostay v2 Target Specification (`docs/spec/`)

> Target: branch `redesign/v2`, locked 2026-07-19 (product owner: Raphael).
> Status tags: ✅ decided/locked · 🔜 planned (build or later phase) · 🗑️ not carried from v1.

This directory is the **target architecture and delta specification** for the
Ebrostay v2 rebuild. It is prescriptive: it records the locked 2026-07-19
decisions and everything an implementer needs that *differs* from v1.

## Relationship to the v1 spec

- **This directory is self-contained** (since 2026-08-01). The v1 spec
  (§00–§12) was retired from this branch: everything v2 still carries from it
  is restated in [08-carried-v1-rules.md](08-carried-v1-rules.md) — the
  formatting rules, the booking-draft format, the requirement IDs, and the
  carried integrations — together with a disposition table saying where each
  v1 section went.
- **v1 remains the live production site** (`main` / ebrostay.com until the
  OD-1 cutover), and its full as-built spec lives on `main` (`docs/spec/`
  there) and in git history. Anything about v1 *as deployed* is answered
  there, not here.
- The v2 decision log ([05-decision-log.md](05-decision-log.md)) **continues
  the v1 ADR numbering** (v1 ends at ADR-010; v2 starts at ADR-011) and its
  header maps every v1 ADR to its v2 fate. v1 ADRs still in force: ADR-001
  (no online payment), ADR-004 (commission, cap as amended), ADR-008
  (`billsPolicy`).

## Index

| File | Contents |
| --- | --- |
| [01-architecture.md](01-architecture.md) | System shape, hosting/regions, config surface, local dev, CI/deploy, runtime versions & the .NET 10 upgrade trigger |
| [02-data-model.md](02-data-model.md) | Cosmos DB database/containers, document schemas, property status lifecycle, embedded availability, Blob storage, seed data |
| [03-auth-and-roles.md](03-auth-and-roles.md) | SWA built-in auth, role model, admin invitations, `x-ms-client-principal` contract, profile bootstrap, deactivation |
| [04-functional-flows.md](04-functional-flows.md) | Public browse/search, property detail & estimate, login-gated booking flow, host flow, admin flow, AI assistant, i18n/theme |
| [05-decision-log.md](05-decision-log.md) | ADR-011 … ADR-038 + open decisions OD-1…OD-8 |
| [06-design-language.md](06-design-language.md) | The v2 identity: palette, type, availability semantics, the month-band signature, component inventory, copy rules |
| [07-legal-notes.md](07-legal-notes.md) | Spanish rental-law research (LAU, 2026 reform, deposits, NRA) behind ADR-022/023 — not legal advice |
| [08-carried-v1-rules.md](08-carried-v1-rules.md) | Rules carried verbatim from the retired v1 spec: requirement IDs, money/date formatting, the booking-draft format, Nominatim/Leaflet/DeepSeek/Umami — plus the v1→v2 disposition table |

## Where the backlog lives

**Jira, not this repo.** Craft, ops, legal and follow-up work is tracked in
project **KAN** on <https://ebrostay.atlassian.net>.

- Everything from the v2 rebuild carries the label **`v2`**, grouped under
  eleven epics named `v2 · …` (remaining build, design & frontend, listing
  page, search & stay model, infra & ops, host & listing editor, auth &
  accounts, legal & content, testing & quality, and two residue epics).
- The 62 items migrated out of the old `docs/BACKLOG.md` on 2026-08-09 also
  carry **`from-backlog`**. Find them with:

  ```
  project = KAN AND labels = v2 ORDER BY created DESC
  ```

- `docs/BACKLOG.md` no longer exists. Its twelve already-completed entries were
  folded into the appendix at the end of
  [05-decision-log.md](05-decision-log.md); the full original file is in git
  history at commit `dd4250f`.

**Spec-level** open questions are not in Jira — they stay in this directory,
as OD-1…OD-10 at the end of the decision log.

## v2 in one paragraph

Ebrostay v2 rebuilds ebrostay.com (mid-term corporate rentals, stays **≥31
days and <365 days**, ADR-022, Zaragoza) as a **Next.js App Router static
export** (TypeScript, Tailwind v4, next-intl ES/EN with
`localePrefix: "always"` and Spanish default, light and dark themes via
`data-theme`) served by the **Azure Static Web Apps Standard** resource
**`ebrostay-home`** (West Europe, ADR-035; supersedes the Free-tier
`ebrostay-v2` of ADR-021), with **C# Azure Functions (.NET 9 isolated,
→ .NET 10 when SWA supports it)** as SWA managed functions, **Cosmos DB free
tier** for data and **Azure Blob Storage** for photos. The product pivots from
a curated catalogue to a **marketplace**: anonymous visitors browse and
search; **booking requires sign-in** — an **Entra External ID** tenant behind
`/sign-in` offers an Ebrostay email/password account or one-hop Microsoft
sign-in (Google 🔜, ADR-035/036); **any signed-in user may create listings**
(a nine-step wizard with AI-assisted import from a portal URL, ADR-030/033),
which pass through an **admin review queue** (3 invited admins) before
publication — content edits re-enter review, pricing/availability edits apply
live (ADR-025). Rent is **pro-rated daily at price÷30 and collected per
calendar month** (ADR-023, superseding v1's whole-month billing); commission
is 15% capped at 30 days' rent (ADR-004 as amended); v1's filtering/sorting
rules carry over verbatim. The booking flow is **log-then-draft**: the server
records the full request in Cosmos, recomputes the estimate for parity, then
the client opens the v1 bilingual email or WhatsApp draft — no online payment,
no transactional email (an ACS hook point is reserved). v2 is a **fresh data
start** (no Supabase migration, no sample-data fallback — the API is
required), and production `ebrostay.com` stays on GitHub Pages until an early
DNS cutover once the public site + API are solid (OD-1).
