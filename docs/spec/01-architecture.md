# Ebrostay v2 Target Spec — §1 Architecture

> Target: branch `redesign/v2`, locked 2026-07-19; hosting and auth amended 2026-07-31 (ADR-035). Status tags: ✅ decided/locked · 🔜 planned · 🗑️ not carried from v1.
> v1 architecture: superseded (v1 spec on `main`). Decisions: [ADR-011, ADR-012, ADR-018, ADR-019, ADR-021, ADR-028, ADR-033, ADR-035](05-decision-log.md).

---

## 1.1 System shape ✅

One Azure Static Web Apps (SWA) resource fronts everything: static assets,
built-in auth, and the managed Functions API under one origin (no CORS).

```
                         ┌──────────────────────────────────────────────────┐
                         │  Azure Static Web Apps "ebrostay-home" (Standard)│
  Browser ──────────────▶│                                                  │
   │  GET /es/… /en/…    │  Static assets  = Next.js export (app/out)       │
   │  GET /.auth/*       │  /.auth/*       = SWA built-in auth via custom   │
   │  fetch /api/*       │                   OIDC: "ebrostay" (Entra        │
   │                     │                   External ID: email+password,   │
   │                     │                   Microsoft) + "ebrostay-msa"    │
   │                     │                   (direct MSA) — ADR-035/036, §3 │
   │                     │  /api/*         = managed Functions (api/,       │
   │                     │                   C# .NET 9 isolated)            │
   │                     └────────────┬───────────────────┬─────────────────┘
   │                                  │                    │
   │                                  ▼                    ▼
   │                     Cosmos DB free tier       Azure Storage
   │                     acct "ebrostay-cosmos"    acct "ebrostayphotos"
   │                     db "ebrostay" (§2,        blob "property-photos"
   │                     8 containers)             (public read; writes
   │                                               only via /api)
   │                                               queue "import-jobs"
   │                                               (ADR-033)
   │
   ├── photo <img> URLs ──────────────────────────▶ Blob public URLs
   ├── Leaflet tiles ─────▶ OpenStreetMap tile servers
   ├── geocoding (editor) ▶ Nominatim (client-direct, §8.4.1)
   ├── cadastre (editor) ─▶ Catastro datos-no-protegidos (client-direct,
   │                        ADR-027 — the browser's own User-Agent is why)
   └── analytics ─────────▶ Umami Cloud (script + events, §8.4.4)

   Functions, outbound (server-side only — key/User-Agent constraints):
     nearby search ──────▶ Overpass API (POI candidates, cached per cell)
     nearby measure/route ▶ OpenRouteService (ORS_API_KEY, ADR-028)
     import handover ────▶ Storage queue → third-party extractor pipeline,
                            which calls back POST /api/import/{id}/callback
                            with a per-job token (ADR-033)
     /api/ai-assistant 🔜 ▶ DeepSeek chat completions API (ADR-020, port
                            from v1 not yet built)
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
- **Secrets never reach the client**: the ORS key, OIDC client secrets, Cosmos
  and Storage connection strings live only in SWA/Functions app settings
  (§1.3). The browser talks to Blob (public read) and to
  Nominatim/Catastro/OSM/Umami directly, none of which need a secret.

## 1.2 Hosting & regions ✅

All Azure resources sit in resource group **`ebrostay`**.

| Resource | Name | Tier / SKU | Region | Notes |
| --- | --- | --- | --- | --- |
| Static Web App | `ebrostay-home` | **Standard** (custom auth requires it, ~$9/mo — ADR-035) | **westeurope** | Default host `delightful-sand-063f8a703.7.azurestaticapps.net`. Recreated 2026-07-31 for the Entra External ID move; West Europe accepted new resources again by then. Hosts static assets + managed functions + built-in auth (custom OIDC). Supersedes the Free-tier `ebrostay-v2` (host `gentle-plant-000592f0f…`, ADR-021); the superseded resources were deleted — `ebrostay-home` is the **only** SWA in either subscription (verified 2026-08-01, `az staticwebapp list`). |
| Entra External ID tenant | `ebrostay` | external tenant, **$0** below 50k MAU | EU | Tenant id `172e1505-039e-4565-87e9-4fad91983d51`; sign-in pages at `ebrostay.ciamlogin.com`. **Hand-provisioned, not reproducible from the repo** — ADR-035 records every object; branding assets in `infra/entra/`. |
| Cosmos DB account | `ebrostay-cosmos` | **Free tier**, NoSQL API, provisioned | **spaincentral** | Database `ebrostay` with **1000 RU/s shared** across the 8 containers per §2. Free tier = first 1000 RU/s + 25 GB free forever (one per subscription) → literally **€0**; move to paid/serverless when real usage outgrows it (ADR-019). |
| Storage account | `ebrostayphotos` | Standard LRS | **spaincentral** | Blob container **`property-photos`**, public-read (blob-level), uploads/deletes **only via the API** (ADR-019); queue **`import-jobs`** for the AI-assisted import handover (ADR-033). |

Data (spaincentral) and compute/hosting (westeurope) are still in different
regions, but since ADR-035 both are European — the functions ↔ Cosmos hop no
longer crosses the Atlantic. ADR-021 records the original eastus2 constraint
for history.

Production DNS: **`ebrostay.com` stays on GitHub Pages (branch `main`, v1)**
until cutover. Cutover is **early**: DNS moves to the SWA once the redesigned
public site + API are solid; host/admin features ship incrementally afterwards
on the same resource. v1 remains archived on `main`. (Open decision OD-1, §5.)

## 1.3 Configuration surface ✅

| Surface | File / location | Holds |
| --- | --- | --- |
| SWA config | `app/public/staticwebapp.config.json` (copied into `app/out` by the export) | **No `/` rule** — since 2026-08-01 the bare domain resolves a language client-side in `app/public/index.html`, which SWA serves as the directory index (ADR-038); the `/` → `/es/` 302 that used to sit here pre-empted it at the edge, and `e2e/pages.spec.ts` guards against its return. 404 rewrite to `/404.html`; 401 → 302 `/es/sign-in/`; long-cache headers for `/_next/static/*`; `platform.apiRuntime: "dotnet-isolated:9.0"`; the **`auth.identityProviders.customOpenIdConnectProviders`** block wiring `ebrostay` (Entra External ID) and `ebrostay-msa` (direct MSA) per ADR-035/036; convenience route rules for auth-gated paths (`/{es,en}/account/*` → `authenticated`; `…/admin/*` → `admin`) — **cosmetic only**, see §3.5. `/host/*` carries no such rule: since 2026-08-01 the owner working routes bounce in-app via `RequireOwner` instead, and `/host` itself is public. |
| SWA / Functions app settings | Applied by `infra/main.bicep` (`swaAppSettings`) plus hand-set auth secrets; never in the repo | Bicep-managed: `COSMOS_ENDPOINT`, `COSMOS_KEY`, `COSMOS_DATABASE`, `PHOTOS_CONNECTION`, `IMPORTS_CONNECTION`, `PHOTOS_CONTAINER`, `ORS_API_KEY`, `PIPELINE_WAKEUP_URL`, `IMPORT_CALLBACK_BASE_URL` (derived from the SWA's own hostname — ADR-033 Decision 15). Hand-set: `EBROSTAY_OIDC_CLIENT_ID`/`_SECRET`, `EBROSTAY_MSA_OIDC_CLIENT_ID`/`_SECRET` (ADR-035/036); `PLATFORM_CLEANING_FEE_EUR` (ADR-026). Future: `DEEPSEEK_API_KEY` when the assistant port lands (ADR-020 🔜), `ACS_*` when the email hook is wired (OD-2). |
| Local API settings | `api/local.settings.json` (gitignored; template `api/local.settings.sample.json`) | Same keys as above pointing at dev resources / emulators — see [docs/DEVELOPMENT.md](../DEVELOPMENT.md) §4. |
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
- **Test gate (partial):** `npm test` (the vitest unit suite) runs before the
  build and fails the deploy. The Playwright e2e suite and the .NET tests are
  **not** in CI yet — tracked in [BACKLOG](../BACKLOG.md).
- **Build:** Node 24, `npm ci && npm run build` in `app/` → static export in
  `app/out`. The API is published in the workflow —
  `dotnet publish -c Release -r win-x64 --self-contained false
  -p:PublishReadyToRun=true` — because SWA caps managed-function content at
  100 MiB and a RID-agnostic publish ships SkiaSharp natives for ~20 runtimes
  (477 MB, rejected upload, stale site — 2026-07-28). A size-check step fails
  the run **before** upload if the publish exceeds the cap.
- **Deploy:** `Azure/static-web-apps-deploy@v1` with `app_location: app/out`,
  `skip_app_build: true`, `api_location: api/bin/publish`, and
  `skip_api_build: true` — the input is undeclared in the action (GitHub
  annotates it) but load-bearing: without it Oryx tries to build the compiled
  output and fails the run. Auth: deployment-token secret
  **`AZURE_STATIC_WEB_APPS_API_TOKEN_V2`** (now pointing at `ebrostay-home`).
- **Post-deploy verification:** the workflow polls `/api/health` (worker boot
  — ReadyToRun makes a wrong RID fail at startup, silently, if unchecked) and
  then `/api/properties` (real Cosmos read path), absorbing the cold start on
  the runner rather than on the first visitor.
- The **old v1 Azure workflow on `main` is disabled**; `main` keeps only the
  GitHub Pages deploy that serves production `ebrostay.com` until cutover
  (§1.2).

Deploying to the SWA resource does **not** affect production while DNS still
points at GitHub Pages — the v2 deployment is reachable on the
`delightful-sand-…azurestaticapps.net` host for review until cutover.

## 1.6 Runtime versions & the .NET 10 upgrade trigger ✅

| Component | Now | Trigger to change |
| --- | --- | --- |
| Functions runtime | **.NET 9 isolated** (`net9.0`, `apiRuntime: dotnet-isolated:9.0`) | **Upgrade to .NET 10 the moment SWA managed functions accept it.** SWA currently rejects `net10`; .NET 9 is **out of Microsoft support since May 2026** and is consciously accepted as a bridge (ADR-018). Upgrade = bump the TFM in `api/Ebrostay.Api.csproj` + `platform.apiRuntime` in `staticwebapp.config.json`, then redeploy. Watch item OD-3 (§5). |
| Node (CI) | 22 | Follow Next.js LTS requirements. |
| Next.js / Tailwind / next-intl | current majors (Tailwind v4, CSS-first config) | Routine dependency maintenance; no structural trigger. |
