# CLAUDE.md

Ebrostay **v2 redesign branch** (`redesign/v2`) — rebuild of ebrostay.com
(mid-term corporate rentals, Zaragoza) on Azure. v1 (static HTML/JS + Supabase,
still the production site) lives on `main`; its full spec is in `docs/spec/`
and is the functional reference here.

## Stack & layout

- `app/` — Next.js App Router with **`output: "export"`** (static HTML only — no
  middleware, no server components at runtime), TypeScript, Tailwind v4
  (CSS-first config in `app/app/globals.css`), next-intl.
- `api/` — C# Azure Functions, **.NET 9 isolated** (SWA managed functions;
  upgrade to .NET 10 when SWA supports it). Route prefix `api` (host.json).
- Hosting: Azure Static Web Apps — frontend + managed functions + built-in auth
  (GitHub/Microsoft). Cosmos DB serverless (NoSQL) + Blob Storage for photos.

## Commands

- `cd app && npm run dev` — frontend dev server (pages under `/es` … `/en`)
- `cd app && npm run build` — static export to `app/out` (must stay green)
- `~/.dotnet/dotnet build api` — build the API (or `cd api && func start`)
- `swa start app/out --api-location api` — full local emulation incl. auth

## Conventions

- **Bilingual ES/EN is a hard requirement**: every user-facing string goes in
  `app/messages/es.json` **and** `en.json`. Spanish is default. Routes are
  always locale-prefixed (`localePrefix: "always"`); import `Link`/`useRouter`
  from `@/i18n/navigation`, never from `next/link`/`next/navigation`.
- **Light and dark mode** both first-class. Theme is `data-theme` on `<html>`
  (set pre-paint by the bootstrap script in `app/app/[locale]/layout.tsx`);
  Tailwind `dark:` variant keys off it. Never use `@media (prefers-color-scheme)`
  directly.
- **Static export limits**: no Next middleware, no route handlers, no dynamic
  SSR. Dynamic data is fetched client-side from `/api/*`. `/` → `/es/` redirect
  and auth-gated routes live in `app/public/staticwebapp.config.json`.
- **Authorization is enforced in the C# functions** (read
  `x-ms-client-principal`), never only via SWA route rules or UI gates.
- Business rules (pricing: whole-month billing, 15% commission capped at one
  month, 11-month max) are specified in `docs/spec/05-business-rules.md` — v2
  must match them exactly.
- Secrets never in the client or repo: Functions app settings only.

## Skills & plugins

- **frontend-design** (`.claude/skills/frontend-design/`) — use for any
  visual/UI work (the v2 visual identity is built with it; keep the Ebrostay
  logo).
- **superpowers** plugin — workflow skills (brainstorming, planning, TDD,
  debugging); offer it when a task fits.
