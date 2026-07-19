# Ebrostay v2 (redesign branch)

This is the **`redesign/v2` long-living branch** — a ground-up rebuild of
[ebrostay.com](https://ebrostay.com/), the platform for **mid-term corporate
rentals (1–11 months) in Zaragoza, Spain**. The v1 static site (plain
HTML/CSS/JS + Supabase, still live in production) remains on `main`; its
reverse-engineered specification is preserved in [`docs/spec/`](docs/spec/) and
is the functional reference for this rebuild.

## v2 architecture

| Piece | Tech |
| --- | --- |
| Frontend (`app/`) | Next.js (App Router, **static export**), TypeScript, Tailwind CSS, next-intl (ES/EN), light + dark themes |
| API (`api/`) | C# Azure Functions, **.NET 9 isolated** (SWA managed functions; move to .NET 10 when SWA supports it) |
| Data | Azure Cosmos DB (serverless, NoSQL API) |
| Photos | Azure Blob Storage (public-read container, uploads via the API) |
| Hosting | Azure Static Web Apps (Free tier) — frontend + managed functions + built-in auth (GitHub/Microsoft) |

Product model in v2: anonymous visitors browse and search; **booking and
property posting require sign-in**; any signed-in user can post listings, which
go through an **admin review queue** before publication. See `docs/spec/` (v1
baseline) and the v2 target spec (in progress) for details.

## Repo layout

```
app/   Next.js frontend (static export → app/out)
api/   Azure Functions API (C#, .NET 9 isolated)
docs/  v1 reconstruction spec (§00–§12) + v2 target spec
assets/  brand assets carried over from v1
```

## Develop

```bash
# Frontend
cd app
npm install
npm run dev          # http://localhost:3000/es

# API (requires .NET 9 SDK; install script: https://dot.net/v1/dotnet-install.sh)
cd api
cp local.settings.sample.json local.settings.json   # first time
func start           # requires Azure Functions Core Tools v4

# Full emulation (static site + API + SWA auth emulation)
npm run build --prefix app
swa start app/out --api-location api
```

## Deploy

GitHub Actions deploys this branch to Azure Static Web Apps (workflow added
with the infrastructure setup). Production `ebrostay.com` stays on the v1
GitHub Pages deploy from `main` until cutover.
