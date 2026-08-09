# CLAUDE.md

Ebrostay **v2 redesign branch** (`redesign/v2`) — rebuild of ebrostay.com
(mid-term corporate rentals, Zaragoza) on Azure. **The spec for this branch is
`docs/spec/` (self-contained)** — start at its README. v1 (static HTML/JS +
Supabase) is still the production site and lives on `main`, together with its
own as-built spec; rules v2 carries from v1 are restated in
`docs/spec/08-carried-v1-rules.md`.

## Stack & layout

- `app/` — Next.js App Router with **`output: "export"`** (static HTML only — no
  middleware, no server components at runtime), TypeScript, Tailwind v4
  (CSS-first config in `app/app/globals.css`), next-intl.
- `api/` — C# Azure Functions, **.NET 9 isolated** (SWA managed functions;
  upgrade to .NET 10 when SWA supports it). Route prefix `api` (host.json).
- Hosting: Azure Static Web Apps (`ebrostay-home`, Standard, westeurope) —
  frontend + managed functions + built-in auth over **Entra External ID**
  (Ebrostay email/password account + Microsoft; ADR-035/036). Cosmos DB free
  tier (NoSQL) + Blob Storage for photos.

## Commands

- `cd app && npm run dev` — frontend dev server (pages under `/es` … `/en`)
- `cd app && npm run build` — static export to `app/out` (must stay green)
- `cd app && npm test` — pure-logic unit tests (vitest, `app/lib` only)
- `cd app && npm run test:e2e` — opens every page in `es` and `en` in a real
  browser and fails on an uncaught exception or console error (Playwright,
  `app/e2e`). Hermetic: `/api/*` is served from recorded fixtures, so nothing
  else needs to be running. Add a page, add a case — a guard test enumerates
  the routes and fails if one is missing.
- `~/.dotnet/dotnet test api/Ebrostay.Api.Tests` — API model/validation tests
- `~/.dotnet/dotnet build api` — build the API (or `cd api && func start`)
- `swa start app/out --api-location api` — full local emulation incl. auth

## Conventions

- **Bilingual ES/EN is a hard requirement**: every user-facing string goes in
  `app/messages/es.json` **and** `en.json`. Spanish is default. Routes are
  always locale-prefixed (`localePrefix: "always"`); import `Link`/`useRouter`
  from `@/i18n/navigation`, never from `next/link`/`next/navigation`.
- **Light and dark mode** both first-class. Theme is `data-theme` on `<html>`
  (set pre-paint by the bootstrap script in `app/app/[locale]/layout.tsx`,
  re-stamped on every mount by `components/site/ThemeSync.tsx` because a
  locale switch remounts the root layout and React strips every attribute off
  the `<html>` singleton); Tailwind `dark:` variant keys off it. Never use
  `@media (prefers-color-scheme)` directly. **Anything that must be true of
  the first painted frame belongs in a layout effect, not `useEffect`** —
  `useBeforePaint` in `components/site/theme.ts` is the shared one.
- **Static export limits**: no Next middleware, no route handlers, no dynamic
  SSR. Dynamic data is fetched client-side from `/api/*`. Auth-gated routes
  live in `app/public/staticwebapp.config.json`. The bare domain is **rewritten**
  there, never redirected: `app/public/index.html` resolves a language
  client-side and forwards to `/es/` or `/en/` (ADR-038, rule in
  `app/lib/locale.ts`). Bare `next dev` 404s on `/` — it never serves
  `public/` for that path — so browse `:4280`, where the rewrite applies.
- **Authorization is enforced in the C# functions** (read
  `x-ms-client-principal`), never only via SWA route rules or UI gates.
- Business rules live in the **decision log** `docs/spec/05-decision-log.md`
  (ADR-011…ADR-036) plus the carried v1 rules in
  `docs/spec/08-carried-v1-rules.md` — read the ADRs before touching pricing.
  Current rules: rent **pro-rated daily at price ÷ 30**, collected per
  calendar month (ADR-023); 15% commission capped at 30 days' rent (ADR-004
  as amended); stay **≥31 and <365 days** (ADR-022); a per-stay cleaning fee
  outside the commission base (ADR-026).
- Secrets never in the client or repo: Functions app settings only.
- **The backlog is in Jira, not the repo.** Project **KAN** on
  <https://ebrostay.atlassian.net> — label `v2`, grouped under eleven `v2 · …`
  epics; JQL `project = KAN AND labels = v2`. Reach it with the `atlassian`
  MCP tools (`mcp__atlassian__*`; cloudId
  `f802775e-fd43-401d-b1d5-ff6ad2248882`). `docs/BACKLOG.md` was removed on
  2026-08-09 — its completed entries are the appendix at the end of
  `docs/spec/05-decision-log.md`, the file itself is in git history at
  `dd4250f`. Spec-level open questions stay in the repo as OD-1…OD-10.

## Skills & plugins

- **frontend-design** (`.claude/skills/frontend-design/`) — use for any
  visual/UI work (the v2 visual identity is built with it; keep the Ebrostay
  logo).
- **cosmosdb-best-practices** (`.claude/skills/cosmosdb-best-practices/`) — use
  whenever touching Cosmos DB: data modeling, partition keys, queries, indexing
  policy, or C# SDK usage in `api/`. Vendored (MIT) from the
  [azure-cosmos-db-assistant](https://github.com/AzureCosmosDB/cosmosdb-claude-code-plugin)
  plugin so it travels with the repo; re-sync by copying `skills/` from upstream.
- **superpowers** plugin — workflow skills (brainstorming, planning, TDD,
  debugging); offer it when a task fits.
- **typescript-lsp / csharp-lsp** plugins — real compiler diagnostics,
  go-to-definition and find-references over `app/` and `api/`. Prefer them over
  grepping for a symbol.
- Per-machine install of the plugins above and the language-server binaries they
  shell out to is **`docs/DEVELOPMENT.md` §8** — not repeated here, since it is
  one-time setup rather than a working convention.
