# Ebrostay Reconstruction Spec — §3 Architecture

> Baseline: as-built (branch `main`, 2026-06-25). Status tags: ✅ active · 🔜 planned/unwired · 🗑️ dormant-to-remove · 🐞 suspected bug · 🚫 out-of-scope (MVP).

This section gives the **shape of the system**: enough to stand up an equivalent
skeleton, its configuration, and its deploy pipeline. It does not cover the data
model (see §4), the business algorithms (§5), per-screen behavior (§6), the
integrations in detail (§7), or the security/RLS model (§8) — it cross-references
them where they touch architecture.

---

## 3.1 One-paragraph summary

Ebrostay is a **static front end** — plain HTML, CSS, and vanilla JavaScript with
**no build step, no bundler, no framework** — served as flat files from a CDN
(GitHub Pages, custom domain `ebrostay.com`). It is backed by an **optional**
Supabase project (Postgres + RLS, Auth, Storage, Edge Functions). The single most
important architectural property is **graceful degradation**: if Supabase
credentials are absent or the Supabase JS SDK failed to load, every page still
renders and works from built-in sample data in `data.js`. The only "build" is a
trivial token-substitution step (`scripts/inject-config.js`) that bakes the
Supabase URL and anon key into `supabase-config.js`; everything else is shipped
verbatim.

---

## 3.2 Component & data-flow overview

```
                                  ┌──────────────────────────────────────────────┐
                                  │  BROWSER (static HTML/CSS/vanilla JS)          │
                                  │                                                │
   page DOM  ── data-i18n ──────▶ │  data.js      translation dict + 4 sample      │
                                  │               properties (the FALLBACK)        │
                                  │  supabase-config.js   SUPABASE_URL + ANON_KEY  │
                                  │                                                │
   user actions ───────────────▶ │  site.js / property.js / account.js /          │
                                  │  partner.js / admin*.js / booking.js / nav.js  │
                                  │            │                                   │
                                  │            ▼                                   │
                                  │     backend.js  (EbrostayBackend)              │
                                  │     isConfigured()? ── no ──▶ use data.js      │
                                  │            │ yes                               │
                                  └────────────┼───────────────────────────────────┘
                                               │  window.supabase JS SDK (CDN)
                                               ▼
          ┌────────────────────────────────────────────────────────────────────┐
          │  SUPABASE PROJECT (West EU)                                          │
          │                                                                      │
          │   PostgREST  ◀── SELECT/INSERT (RLS-gated, anon key)                 │
          │   Auth       ◀── sign-up / sign-in / session (anon key)              │
          │   Storage    ◀── property-photos bucket (public read, admin write)   │
          │   Edge Funcs ◀── invoked from client with the anon JWT               │
          │      ├─ request-booking        🔜 planned/unwired                    │
          │      │     service role · computes fees · writes booking_requests    │
          │      │     │                                                          │
          │      │     ├──▶ Resend  (team + guest emails)        [§7]            │
          │      │     └──▶ (no other egress)                                     │
          │      └─ ai-property-assistant  ✅ admin editor only                  │
          │            service role · extract / translate / describe             │
          │            └──▶ DeepSeek chat-completions API          [§7]          │
          └──────────────────────────────────────────────────────────────────────┘

   Browser also talks DIRECTLY to two third parties (no Supabase hop):
     • Nominatim (OpenStreetMap)  — admin-property.js geocoding of an address [§7]
     • OpenStreetMap tile servers — Leaflet map tiles on home + property pages [§7]
```

**Trust boundary.** The browser holds only the **public anon key**. It is safe to
publish because every table is protected by Row Level Security (§8). Anything that
needs elevated rights runs **inside an Edge Function under the service-role key**,
which never leaves Supabase secrets. There is **no application server** of our own.

**Three classes of client → backend traffic:**

| Channel | Auth used | Examples | Section |
| --- | --- | --- | --- |
| PostgREST (REST) | anon key + (optional) user JWT, RLS-gated | load published properties, favorites (🚫 out-of-scope (MVP)), inquiries, availability | §4, §8 |
| Auth | anon key | sign-up, sign-in, session, password reset | §8 |
| Storage | anon key (public read) / user JWT (admin write) | property photo public URLs; admin uploads | §4, §8 |
| Edge Functions | user JWT forwarded; function uses service role internally | `request-booking` 🔜, `ai-property-assistant` ✅ | §7 |

---

## 3.3 Graceful-degradation mechanism (the core invariant)

All backend access funnels through one module, `backend.js`, exposed as the global
`EbrostayBackend`. Two private helpers decide whether the site runs "live" or
"static":

```js
function isConfigured() {
  return Boolean(
    typeof SUPABASE_URL === "string" &&
    SUPABASE_URL.startsWith("https://") &&     // URL present and looks like a URL
    typeof SUPABASE_ANON_KEY === "string" &&
    SUPABASE_ANON_KEY.length > 20 &&           // key present and plausibly real
    typeof window.supabase !== "undefined"     // the Supabase JS SDK actually loaded
  );
}

function getClient() {
  if (!client && isConfigured()) {
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;                               // null when not configured
}
```

**Exactly three conditions must all hold** for "live" mode:

1. `SUPABASE_URL` is a string starting with `https://`. The un-injected template
   placeholder `"__SUPABASE_URL__"` fails this test, so an un-configured checkout
   is automatically static.
2. `SUPABASE_ANON_KEY` is a string **longer than 20 characters**. The placeholder
   `"__SUPABASE_ANON_KEY__"` is 22 chars — note this is a near-miss; a real anon
   JWT is hundreds of characters, so in practice the `https://` check on the URL is
   the decisive guard. (See §11 / 🐞 watch-item: the length threshold is weak.)
3. `window.supabase` is defined — i.e. the Supabase JS SDK `<script>` (loaded from
   a CDN in each page `<head>`) executed successfully. If the CDN is blocked or the
   script is missing, the site degrades even with valid credentials.

**Fallback path.** Every data-loading method in `EbrostayBackend` calls
`getClient()` first; on `null` it returns `false`/empty, and the calling page
(`site.js`, `property.js`, …) then reads from the `properties` array and
`translations` dictionary in `data.js`. Concretely, `loadProperties()` opens with:

```js
const sb = getClient();
if (!sb) return false;   // caller falls back to data.js sample data
```

The same pattern wraps auth, favorites (🚫 out-of-scope (MVP)), availability, inquiries, and booking. The
net effect: **no page ever hard-fails on a missing or broken backend.** It silently
serves the 4 seeded sample homes and the bilingual UI from `data.js`.

> Cross-ref: the field-by-field mapping from a DB row to the in-memory property
> object (and the legacy `bills_included` → `bills_policy` fallback logic) lives in
> `backend.js → mapRowToProperty()`; documented in §4 and §5.

---

## 3.4 Configuration files

| File | Tracked in git? | Role |
| --- | --- | --- |
| `supabase-config.template.js` | ✅ yes | Source template. Declares `const SUPABASE_URL = "__SUPABASE_URL__";` and `const SUPABASE_ANON_KEY = "__SUPABASE_ANON_KEY__";`. The two `__…__` tokens are replaced at deploy time. |
| `supabase-config.js` | ✅ yes (with placeholders) | The file the pages actually `<script src>`. In the repo it holds the **placeholder** values (so a fresh clone runs static). On deploy it is **overwritten** with real values by the inject step. May also be edited by hand for a manual setup (README §"Backend Setup" step 3). |
| `.env.example` | ✅ yes | Documents the two variables: `SUPABASE_URL=https://your-project.supabase.co` and `SUPABASE_ANON_KEY=your-anon-key`. |
| `.env` | ❌ no (gitignored) | Local-only. Copied from `.env.example` and filled with real values so `npm run config` works on a dev machine. |
| `scripts/inject-config.js` | ✅ yes | The "build". See below. |

**`scripts/inject-config.js` behavior (Node, zero deps):**

1. Read `SUPABASE_URL` / `SUPABASE_ANON_KEY` from the process environment.
2. If either is missing, **load `.env`** from the repo root (naive `KEY=VALUE`
   per-line parser) and re-read.
3. If still missing → print an error and `exit(1)`.
4. Read `supabase-config.template.js`, replace `__SUPABASE_URL__` and
   `__SUPABASE_ANON_KEY__` with the resolved values, write the result to
   `supabase-config.js`.
5. Log `supabase-config.js generated.`

**npm scripts** (`package.json`):

| Script | Command | Purpose |
| --- | --- | --- |
| `npm run config` | `node scripts/inject-config.js` | Generate `supabase-config.js` from env/`.env`. |
| `npm test` | `playwright test` | E2E suite (see §3.7). |
| `npm run test:ui` | `playwright test --ui` | Interactive runner. |
| `npm run test:report` | `playwright show-report` | Open last HTML report. |

The only runtime devDependency is `@playwright/test`. There is **no application
dependency** — the site ships as static files plus CDN `<script>` tags.

---

## 3.5 Hosting & deploy pipeline

Two deploy targets coexist in `.github/workflows/`. **GitHub Pages is the
canonical production deploy** described in the README; an Azure Static Web Apps
workflow runs in parallel (a secondary/transitional target).

### 3.5.1 GitHub Pages (canonical) — `.github/workflows/pages.yml`

Trigger: push to `main` or `staging`, or manual `workflow_dispatch`.

```
push to main/staging
   │
   ├─ job: test
   │    checkout → setup-node 20 (npm cache) → npm ci
   │    → npx playwright install --with-deps chromium
   │    → npx playwright test         (uploads playwright-report/ on failure)
   │
   └─ job: deploy   (needs: test)     environment: github-pages
        checkout main      → path: site
        checkout staging   → path: site/staging   (staging served under /staging)
        configure-pages (enablement: true)
        upload-pages-artifact (path: site)
        deploy-pages
```

Key facts a rebuild must reproduce:

- **Deploy is gated on tests** (`deploy` `needs: test`). A red Playwright run blocks
  publish.
- The repository **root** is published as-is (`path: site`). No build output dir —
  the HTML/CSS/JS files are the artifact.
- `staging` branch is checked out into `site/staging`, so a preview of staging is
  served at `ebrostay.com/staging`.
- `concurrency: { group: pages, cancel-in-progress: false }` serializes deploys.
- Permissions: `contents: read`, `pages: write`, `id-token: write` (OIDC).

> Note: `pages.yml` does **not** run `inject-config.js`. For the GitHub Pages path,
> `supabase-config.js` is expected to already contain real values committed to the
> branch (per README/`docs/supabase-setup.md` manual step), or to remain placeholder
> (static mode). The Supabase secret injection only happens in the Azure workflow.

### 3.5.2 Azure Static Web Apps (secondary) — `azure-static-web-apps-*.yml`

Trigger: push to `main` (production) and PRs to `main` (staging slots).

- Same `test` job (Playwright on chromium) gates deploy.
- Adds an **inject step**: runs `node scripts/inject-config.js` with
  `SUPABASE_URL`/`SUPABASE_ANON_KEY` taken from repo secrets —
  `*_PROD` on push to `main`, `*_STAGING` on PRs. This is the one pipeline that
  bakes real credentials in at deploy time rather than committing them.
- `app_location: "/"`, `output_location: "."`, `app_build_command: "echo skip"`
  (no real build).
- Hardening already in place (recent commits): the PR deploy uses
  `continue-on-error` so Azure refusing a staging slot is a **warning, not a
  failure**; the close-PR job also tolerates a missing staging environment.

### 3.5.3 Custom domain & DNS

- `CNAME` (repo root) contains the single line `ebrostay.com` → tells GitHub Pages
  to serve on the apex domain.
- `.nojekyll` (repo root, 1 byte) → disables GitHub's Jekyll processing so files/
  folders beginning with `_` and the raw assets are served verbatim.
- DNS (GoDaddy), from README — four GitHub Pages apex A-records plus a `www` CNAME:

  ```text
  A     @      185.199.108.153
  A     @      185.199.109.153
  A     @      185.199.110.153
  A     @      185.199.111.153
  CNAME www    <your-github-username>.github.io
  ```

  Existing mail / DMARC / nameserver records are left intact unless email providers
  change.

---

## 3.6 File / asset inventory

Top-level **pages** (`*.html`) — each is a standalone document with its own
`<head>` (per-page meta + JSON-LD) and a matching `*.js`:

| File | Owns | Status |
| --- | --- | --- |
| `index.html` | Home: hero search, filter panel, quick filters, sort, listings grid, listings map, inquiry form, sign-in dialog, owner-mode nav | ✅ |
| `property.html` | Property detail: gallery/lightbox, video, floor plans, conditions table, move-in cost, location map, availability calendar, **booking widget (mailto/WhatsApp MVP)** | ✅ |
| `booking.html` | Booking detail: stay facts + arrival info for a confirmed stay | ✅ |
| `account.html` | Tenant account: stays, saved homes (🚫 out-of-scope (MVP)), arrival details, deactivation | ✅ |
| `partner.html` | Owner portal: properties, stays, payout (IBAN) details | ✅ |
| `admin.html` | Admin panel: properties / requests / bookings / users tabs, availability + "available from" management | ✅ (Requests tab content 🔜) |
| `admin-property.html` | Admin full property editor: details form, photos/floorplans, geocoding, AI assistant, guest info, availability blocks | ✅ |
| `about.html` | Mission/vision/bridge-story static content | ✅ |
| `privacy.html` | Privacy policy + legal notice | ✅ |
| `404.html` | Not-found page (GitHub Pages serves it on unknown paths) | ✅ |

Top-level **scripts** (`*.js`):

| File | Owns | Status |
| --- | --- | --- |
| `data.js` | The **fallback**: ES/EN translation dictionary (`translations`) + 4 built-in sample properties (`properties`). | ✅ |
| `backend.js` | `EbrostayBackend` bridge — `isConfigured()`/`getClient()`, `mapRowToProperty()`, auth, listings, availability, favorites (🚫 out-of-scope (MVP)), inquiries, booking requests; static fallback. | ✅ |
| `supabase-config.js` | Public `SUPABASE_URL` + `SUPABASE_ANON_KEY` constants (placeholder in repo). | ✅ |
| `site.js` | Home logic: search, filtering, sorting, listings map, inquiry form, auth dialog. | ✅ |
| `property.js` | Property detail: gallery, calendar, map, **client-side booking (mailto/WhatsApp)** + client fee estimate. | ✅ |
| `booking.js` | Booking detail page logic. | ✅ |
| `account.js` | Tenant account dashboard. | ✅ |
| `admin.js` | Admin panel shell + properties/requests/bookings/users tabs. | ✅ (Requests tab 🔜) |
| `admin-property.js` | Property editor: forms, photo upload/order, Nominatim geocoding, AI assistant calls. | ✅ |
| `partner.js` | Owner portal logic (role routing, metrics, payout form). | ✅ |
| `nav.js` | Shared header/nav behavior across pages. | ✅ |
| `gallery.js` | Gallery / lightbox helper. | ✅ |
| `enhance.js` | Progressive-enhancement helpers (e.g. enhanced filters). | ✅ |
| `rich-text.js` | Rich-text rendering/editing helper for editor copy fields. | ✅ |
| `photo-order.js` | Drag-to-reorder photos in the editor. | ✅ |

Top-level **infra/SEO/config** files:

| File | Role |
| --- | --- |
| `styles.css` | All site styling (single stylesheet). |
| `supabase-config.template.js` | Token source for the inject step (§3.4). |
| `CNAME` | GitHub Pages apex domain `ebrostay.com`. |
| `.nojekyll` | Disable Jekyll on Pages. |
| `.env.example` | Documents the two config vars. |
| `sitemap.xml`, `robots.txt`, `llms.txt`, `site.webmanifest` | SEO, crawler, AI, PWA metadata (detail in §9). |
| `assets/` | Logos, icons, hero images, property photos. |
| `scripts/inject-config.js` | The config "build". |
| `supabase/` | Backend: `schema.sql`, `upgrade-*.sql`, `functions/`. See §3.5 of §12 and §4/§7/§8. |
| `docs/` | This spec + setup notes. |
| `tests/` | Playwright E2E specs. |

> Dormant artifact: `supabase/upgrade-2026-06-stripe-bookings.sql` and the
> `bookings` table belong to the removed Stripe paid path — 🗑️ dormant-to-remove
> (see §11). They are inventoried in §4 but should not be wired into a rebuild.

---

## 3.7 Test setup

- **Runner:** Playwright (`@playwright/test`), config in `playwright.config.ts`.
- **Tests dir:** `./tests`. Single project: `chromium` (Desktop Chrome). Fully
  parallel, `retries: 0`, HTML reporter.
- **Web server under test:** the config's `webServer` block boots the static site
  with `npx http-server . -p 8080 --silent` and points `baseURL` at
  `http://localhost:8080`. `reuseExistingServer` is on locally and off in CI.
- **Why this matters for a rebuild:** the tests exercise the **static-mode**
  behavior (no Supabase configured), validating that graceful degradation (§3.3)
  produces a working site from `data.js` alone. CI runs `npx playwright install
  --with-deps chromium` then `npx playwright test`; a failure uploads
  `playwright-report/` and blocks deploy (§3.5).

> Cross-ref: the acceptance criteria these tests assert against live in §10; the
> per-screen expectations they encode live in §6.
