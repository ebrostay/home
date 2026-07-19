# Ebrostay v2 Target Spec — §1 Architecture

> Target: branch `redesign/v2`, locked 2026-07-19. Status tags: ✅ decided/locked · 🔜 planned · 🗑️ not carried from v1.
> v1 reference: [docs/spec/03-architecture.md](../spec/03-architecture.md). Decisions: [ADR-011, ADR-012, ADR-018, ADR-019, ADR-021](05-decision-log.md).

---

## 1.1 System shape ✅

One Azure Static Web Apps (SWA) resource fronts everything: static assets,
built-in auth, and the managed Functions API under one origin (no CORS).

```
                         ┌────────────────────────────────────────────────┐
                         │  Azure Static Web Apps  "ebrostay-home" (Free) │
  Browser ──────────────▶│                                                │
   │  GET /es/… /en/…    │  Static assets  = Next.js export (app/out)     │
   │  GET /.auth/*       │  /.auth/*       = SWA built-in auth            │
   │  fetch /api/*       │                   (GitHub + Microsoft)         │
   │                     │  /api/*         = managed Functions (api/,     │
   │                     │                   C# .NET 9 isolated)          │
   │                     └────────────┬───────────────────┬───────────────┘
   │                                  │                    │
   │                                  ▼                    ▼
   │                     Cosmos DB serverless      Azure Blob Storage
   │                     acct "ebrostay-cosmos"    acct "ebrostayphotos"
   │                     db "ebrostay" (§2)        container
   │                                               "property-photos"
   │                                               (public read; writes
   │                                                only via /api)
   │
   ├── photo <img> URLs ──────────────────────────▶ Blob public URLs
   ├── Leaflet tiles ─────▶ OpenStreetMap tile servers
   ├── geocoding (editor) ▶ Nominatim (client-direct, per docs/spec/07 §7.4)
   └── analytics ─────────▶ Umami Cloud (script + events, docs/spec/07 §7.8)

   /api/ai-assistant ─────▶ DeepSeek chat completions API (server-side only)
```

Consequences of the shape:

- **Static export only** (`output: "export"`): no Next middleware, no SSR, no
  route handlers. All dynamic data is fetched client-side from `/api/*`
  (ADR-012). The `/` → `/es/` redirect and 404 handling live in
  `staticwebapp.config.json`, not in Next.
- **The API is required** — v1's sample-data/graceful-degradation fallback is
  🗑️ dropped (ADR-017). There is no `data.js` equivalent; if `/api` is down the
  site shows error states, it does not silently render stale sample homes.
- **Authorization is enforced in every C# function** by parsing
  `x-ms-client-principal` (§3). SWA route rules are convenience/UX only.
- **Secrets never reach the client**: DeepSeek key, Cosmos and Blob connection
  strings live only in Functions app settings (§1.3). The browser talks to
  Blob (public read) and to Nominatim/OSM/Umami directly, none of which need a
  secret.

## 1.2 Hosting & regions ✅

All Azure resources sit in resource group **`ebrostay`**.

| Resource | Name | Tier / SKU | Region | Notes |
| --- | --- | --- | --- | --- |
| Static Web App | `ebrostay-home` | **Free** | **westeurope** | **Reused v1 SWA resource.** Default host `thankful-sea-0e236161e.7.azurestaticapps.net`. westeurope is **location-ineligible for NEW SWA resources**; this one is grandfathered — a reason in itself to reuse rather than recreate (ADR-021). Hosts static assets + managed functions + built-in auth. |
| Cosmos DB account | `ebrostay-cosmos` | **Serverless**, NoSQL API | **spaincentral** | Database `ebrostay`, containers per §2. Pay-per-RU; ~€0 at this scale. |
| Storage account | `ebrostayphotos` | Standard LRS | **spaincentral** | Blob container **`property-photos`**, public-read (blob-level). Uploads/deletes **only via the API** (ADR-019). |

Data (spaincentral) and compute/hosting (westeurope) are in different regions;
accepted — latency is negligible for this workload and westeurope cannot be
chosen for the new data resources' companions anyway (ADR-021 records the
constraint and the trade-off).

Production DNS: **`ebrostay.com` stays on GitHub Pages (branch `main`, v1)**
until cutover. Cutover is **early**: DNS moves to the SWA once the redesigned
public site + API are solid; host/admin features ship incrementally afterwards
on the same resource. v1 remains archived on `main`. (Open decision OD-1, §5.)

## 1.3 Configuration surface ✅

| Surface | File / location | Holds |
| --- | --- | --- |
| SWA config | `app/public/staticwebapp.config.json` (copied into `app/out` by the export) | `/` → `/es/` 302 redirect; 404 rewrite to `/404.html`; `platform.apiRuntime: "dotnet-isolated:9.0"`; 🔜 convenience route rules for auth-gated paths (`/es/host/*`, `/es/admin/*`, … → `allowedRoles`) — **cosmetic only**, see §3.5. |
| Functions app settings | Azure portal / SWA "Environment variables" (never in the repo) | `COSMOS_CONNECTION_STRING` (or endpoint + key), `BLOB_CONNECTION_STRING`, `DEEPSEEK_API_KEY` (+ optional `DEEPSEEK_MODEL`), future `ACS_*` when the email hook is wired. |
| Local API settings | `api/local.settings.json` (gitignored; template `api/local.settings.sample.json`) | Same keys as above pointing at dev resources / emulators. |
| Functions host | `api/host.json` | `routePrefix: "api"`; App Insights sampling. |
| Frontend | `app/next.config.ts`, `app/i18n/routing.ts` | `output: "export"`; locales `["es","en"]`, `defaultLocale: "es"`, `localePrefix: "always"`. |
| Client env | — | **None.** No public keys, no per-env config shipped to the browser (the v1 `supabase-config.js` pattern has no v2 equivalent). Umami's `data-website-id` is public by design. |

## 1.4 Local development ✅

```bash
# Frontend only (fastest loop; /api calls need one of the options below)
cd app && npm install && npm run dev        # http://localhost:3000/es

# API only (requires .NET 9 SDK + Azure Functions Core Tools v4)
cd api && cp local.settings.sample.json local.settings.json   # first time
func start

# Full emulation — static site + API + SWA auth emulation (roles incl. admin)
npm run build --prefix app                  # static export → app/out
swa start app/out --api-location api
```

The SWA CLI (`swa start`) is the **only** way to exercise auth locally: it
serves a fake `/.auth/*` that lets you pick a principal and roles (including
`admin`), and injects `x-ms-client-principal` into function calls exactly like
production. Auth-dependent work must be verified under `swa start`, not
`npm run dev`.

Dev data: seed the 4 v1 sample homes (§2.7) into a dev Cosmos database (or the
Cosmos emulator); the frontend has **no** built-in fallback data (ADR-017).

## 1.5 CI / deployment ✅

Workflow: [`.github/workflows/swa-v2.yml`](../../.github/workflows/swa-v2.yml).

- **Trigger:** push to `redesign/v2` (+ manual `workflow_dispatch`).
- **Build:** Node 22, `npm ci && npm run build` in `app/` → static export in
  `app/out`.
- **Deploy:** `Azure/static-web-apps-deploy@v1` with
  `app_location: app/out`, `skip_app_build: true` (the export is prebuilt in
  the workflow; Oryx must not rebuild it) and `api_location: api` (the .NET
  API **is** built by the deploy action). Auth: deployment-token secret
  **`AZURE_STATIC_WEB_APPS_API_TOKEN_V2`**.
- **Test gate: 🔜 TODO.** There is no test job yet (noted in the workflow
  itself). When the v2 Playwright/API test task lands, tests become a required
  `needs:` job ahead of the deploy step.
- The **old v1 Azure workflow on `main` is disabled**; `main` keeps only the
  GitHub Pages deploy that serves production `ebrostay.com` until cutover
  (§1.2).

Deploying to the SWA resource does **not** affect production while DNS still
points at GitHub Pages — the v2 deployment is reachable on the
`thankful-sea-…azurestaticapps.net` host for review until cutover.

## 1.6 Runtime versions & the .NET 10 upgrade trigger ✅

| Component | Now | Trigger to change |
| --- | --- | --- |
| Functions runtime | **.NET 9 isolated** (`net9.0`, `apiRuntime: dotnet-isolated:9.0`) | **Upgrade to .NET 10 the moment SWA managed functions accept it.** SWA currently rejects `net10`; .NET 9 is **out of Microsoft support since May 2026** and is consciously accepted as a bridge (ADR-018). Upgrade = bump the TFM in `api/Ebrostay.Api.csproj` + `platform.apiRuntime` in `staticwebapp.config.json`, then redeploy. Watch item OD-3 (§5). |
| Node (CI) | 22 | Follow Next.js LTS requirements. |
| Next.js / Tailwind / next-intl | current majors (Tailwind v4, CSS-first config) | Routine dependency maintenance; no structural trigger. |
