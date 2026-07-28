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

**Setting up a machine from scratch: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)** —
prerequisites, the Cosmos DB and Azurite emulators, seeding, skills and
plugins, and troubleshooting. Nothing local needs an Azure subscription.

Once set up, three processes:

```bash
npm run dev --prefix app                                              # :3000
cd api && func start                                                  # :7071
npx swa start http://localhost:3000 --api-devserver-url http://localhost:7071
```

Then browse **<http://localhost:4280>** — *not* :3000. The SWA emulator is what
injects the `x-ms-client-principal` header the API reads, so on :3000 every
authenticated call returns 401 and the pages that need one look broken for
reasons of their own.

```bash
npm run build --prefix app    # static export → app/out; must stay green
```

## Deploy

GitHub Actions deploys this branch to Azure Static Web Apps (workflow added
with the infrastructure setup). Production `ebrostay.com` stays on the v1
GitHub Pages deploy from `main` until cutover.
