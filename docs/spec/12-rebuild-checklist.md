# Ebrostay Reconstruction Spec — §12 Rebuild-from-scratch checklist

> Baseline: as-built (branch `main`, 2026-06-25). Status tags: ✅ active · 🔜 planned/unwired · 🗑️ dormant-to-remove · 🐞 suspected bug · 🚫 out-of-scope (MVP).

The operational "do this in order" to stand the system up from nothing to a running
clone on `ebrostay.com`. Steps are ordered by dependency. Each step says what it
produces and how to verify it before moving on.

> **Two baked decisions to honor as you build (see §11):**
> 1. **Live booking is the client-side mailto/WhatsApp MVP** (`property.html` /
>    `property.js`). The server `request-booking` Edge Function +
>    `booking_requests` table + admin **Requests** tab are 🔜 **planned/unwired** —
>    you may deploy them, but nothing in the UI calls them yet.
> 2. The **Stripe paid path is 🗑️ dormant-to-remove**: do **not** apply
>    `upgrade-2026-06-stripe-bookings.sql`, do not create the `bookings` table, do
>    not wire any payment provider in this rebuild.

A site with **no backend at all** is a valid stopping point: skip §12.1–§12.7,
leave `supabase-config.js` on placeholders, and the site runs entirely on `data.js`
sample data (graceful degradation, see §3.3). The steps below add the live backend.

---

## 12.0 Prerequisites

- A GitHub repository containing the static site (the file inventory in §3.6).
- Node 20+ locally (for `npm ci`, `npm run config`, and Playwright).
- A Supabase account.
- The **Supabase CLI** (`supabase`) — only needed to deploy Edge Functions
  (§12.5). Storage bucket and schema are done from the SQL Editor / dashboard.
- A domain (`ebrostay.com`) with DNS you control (GoDaddy in our case).
- API keys for the optional integrations: **Resend** (email) and **DeepSeek** (AI
  editor). Not required to reach a running clone; see §7.

---

## 12.1 Create the Supabase project (West EU)

1. supabase.com → **New project**. Name it (e.g. `ebrostay`), set a strong DB
   password (save it), choose the **West EU** region (closest to Spain/Zaragoza).
2. Wait ~1 minute for provisioning.

**Verify:** the project dashboard loads and **Project Settings → API** shows a
**Project URL** and an **anon public** key.

---

## 12.2 Create the schema — run `supabase/schema.sql`

1. Left sidebar → **SQL Editor**.
2. Open `supabase/schema.sql`, copy **all** of it, paste, **Run**.

`schema.sql` is the single source of truth for a fresh project. It creates, in one
idempotent script (`create table if not exists`, `drop policy if exists` /
`create policy`, `create or replace function`):

- Tables: `properties`, `availability_blocks`, `profiles`, `favorites` (🚫 out-of-scope (MVP)),
  `bookings` (🗑️ legacy Stripe — present in schema but unused), `inquiries`,
  `property_photos`. (Full field-by-field detail in §4.)
- The `handle_new_user()` trigger on `auth.users` → seeds a `profiles` row on
  sign-up (§8).
- The `is_admin()` security-definer helper used throughout RLS (§8).
- All **RLS policies** for those tables (§8).
- The **`property-photos` storage bucket** (public) and its storage policies —
  **already created here**, so §12.6 is a no-op on a fresh project.
- **Seed data:** the **4 current Ebrostay homes** and their availability blocks.

**Verify:** "Success". Then **Table editor → `properties`** shows 4 rows;
`availability_blocks` is populated; `storage.buckets` contains `property-photos`.

---

## 12.3 Apply upgrade migrations (only if the project predates a feature)

A project created straight from the current `schema.sql` **already includes**
everything below — skip this whole step for a clean rebuild. The `upgrade-*.sql`
files exist to bring **older** projects forward incrementally. **Each is idempotent
/ safe to run more than once** (`add column if not exists`, `create table if not
exists`, `create extension if not exists`, guarded policy drops).

Run, in the SQL Editor, only the ones your project is missing:

| Migration file | Adds | Idempotent |
| --- | --- | --- |
| `upgrade-2026-06-property-photos.sql` | `property_photos` table + `property-photos` bucket + editor support | ✅ |
| `upgrade-2026-06-property-details.sql` | bedrooms/bathrooms/size/floor, min/max stay, deposit, utilities cap, pet/smoking/couples/self-checkin policies, energy rating, beds, video | ✅ |
| `upgrade-2026-06-guest-info.sql` | property `address`; tenant guest-info; booking customer names | ✅ |
| `upgrade-2026-06-guest-bookings.sql` | `availability_blocks.user_id` FK → `profiles` (so users see "Mis reservas") | ✅ |
| `upgrade-2026-06-availability-holds.sql` | `btree_gist` extension; `hold_expires_at` on blocks; **no-overlap GiST guard** (§5) | ✅ |
| `upgrade-2026-06-owner-portal.sql` | `profiles.is_owner`, `properties.owner_id`, `owner_payout_details`, leads | ✅ |
| `upgrade-2026-06-bills-policy.sql` | `properties.bills_policy` (`included`/`capped`/`excluded`) superseding legacy `bills_included` | ✅ |
| `upgrade-2026-06-booking-requests.sql` 🔜 | `booking_requests` table for the planned server booking path | ✅ |
| `upgrade-2026-06-stripe-bookings.sql` 🗑️ | **DO NOT RUN** — dormant Stripe `bookings` path; excluded by decision (§11) | ✅ but skip |

> Several of these were already applied to the live project as named migrations
> (`property_address_guest_info_booking_names`, `availability_holds_and_overlap_guard`,
> `owner_portal`); the `.sql` files are kept "for reference" and re-runnable.

**Verify:** the columns/tables named above exist (Table editor or
`select column_name from information_schema.columns where table_name='properties'`).

---

## 12.4 Seed verification

Before connecting the front end, confirm the data the site expects is present:

```sql
select count(*) from public.properties;            -- expect 4 (the seeded homes)
select count(*) from public.availability_blocks;   -- > 0 (seeded blocks)
select id, name, price_number, bills_policy, is_published from public.properties;
```

All 4 homes should be `is_published = true` with a non-null `bills_policy`. The
front end loads only published rows (`backend.js → loadProperties()` filters
`is_published = true`).

---

## 12.5 Connect the front end — put URL + anon key into `supabase-config.js`

1. **Project Settings → API** → copy **Project URL** and **anon public** key.
2. Choose one method:
   - **Manual (matches README / GitHub Pages path):** edit `supabase-config.js`
     and replace the two placeholder constants:
     ```js
     const SUPABASE_URL = "https://xxxx.supabase.co";
     const SUPABASE_ANON_KEY = "eyJ...";   // anon public key (safe to publish)
     ```
   - **Templated (matches the Azure pipeline / local dev):** put the values in
     `.env` (copy from `.env.example`) and run `npm run config` — this regenerates
     `supabase-config.js` from `supabase-config.template.js` via
     `scripts/inject-config.js` (§3.4).
3. Commit and push (or merge the PR).

The anon key is **public-safe** — all access is enforced by RLS (§8). Once present,
`isConfigured()` flips the site to live mode (§3.3): the three conditions
`SUPABASE_URL` starts with `https://`, anon key length > 20, and `window.supabase`
loaded.

**Verify:** locally, `npx http-server . -p 8080`, open the home page — listings
should now come from Supabase (network tab shows requests to your project URL),
not the 4 static samples. If the SDK fails to load you'll silently see the samples
(that's the fallback working).

---

## 12.6 Create the `property-photos` storage bucket

**Already done by `schema.sql` (§12.2).** Only act here if you built the DB without
the full schema:

- Storage → **New bucket** → name `property-photos`, **public**.
- Apply the storage policies from §8: public `select`; `insert`/`update`/`delete`
  only when `bucket_id = 'property-photos' and public.is_admin()`.

**Verify:** `select id, public from storage.buckets where id='property-photos';`
returns one public row.

---

## 12.7 Deploy Edge Functions and set secrets

The functions live in `supabase/functions/`. Deploy with the Supabase CLI (link the
project first: `supabase link --project-ref <ref>`):

```bash
supabase functions deploy ai-property-assistant     # ✅ used by the admin editor
supabase functions deploy request-booking           # 🔜 planned/unwired
```

Set the secrets each function reads (`Deno.env.get`). `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are **auto-injected** by Supabase into deployed
functions — you only set the application secrets:

```bash
# ai-property-assistant (DeepSeek)  — §7
supabase secrets set DEEPSEEK_API_KEY=sk-...
# optional: DEEPSEEK_MODEL (defaults to deepseek-v4-pro)

# request-booking (Resend email)    — §7, 🔜
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set EMAIL_FROM="Ebrostay <reservas@ebrostay.com>"   # optional, has default
supabase secrets set EMAIL_TO="info@ebrostay.com"                    # optional, has default
```

| Secret | Used by | Required? | Default if unset |
| --- | --- | --- | --- |
| `DEEPSEEK_API_KEY` | `ai-property-assistant` | Yes (for AI extract/translate) | none → AI calls fail |
| `DEEPSEEK_MODEL` | `ai-property-assistant` | No | `deepseek-v4-pro` |
| `RESEND_API_KEY` | `request-booking` 🔜 | No | unset → email skipped, request still recorded |
| `EMAIL_FROM` | `request-booking` 🔜 | No | `Ebrostay <reservas@ebrostay.com>` |
| `EMAIL_TO` | `request-booking` 🔜 | No | `info@ebrostay.com` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | both | auto-injected | provided by Supabase |

> Because today's booking flow is the **client mailto/WhatsApp MVP**, deploying
> `request-booking` is optional for a faithful as-built clone. Deploy it only to
> stage the planned path; nothing in the shipped UI invokes it yet (§11).

**Verify:** in the admin property editor (`admin-property.html`), the AI assistant
"extract from document" / "translate" actions return content. For `request-booking`,
`supabase functions list` shows it deployed (it will simply be uncalled).

---

## 12.8 Grant yourself admin

1. On the deployed (or local) site: **Entrar → Crear cuenta**, register with your
   email, and confirm the email Supabase sends. This fires `handle_new_user()` and
   creates your `profiles` row (§8).
2. In the SQL Editor, promote yourself:
   ```sql
   update public.profiles set is_admin = true where email = 'you@example.com';
   ```
   (Owner portal access, if needed: `set is_owner = true` similarly.)

**Verify:** reload the site — an **Administración** link appears in the header,
opening `admin.html`. The client gate `getIsAdmin()` is cosmetic; real enforcement
is the `is_admin()`-based RLS on every write (§8).

---

## 12.9 Configure GitHub Pages + DNS

1. **Pages:** the workflow `.github/workflows/pages.yml` publishes the repo root to
   GitHub Pages on push to `main` (deploy gated on the Playwright `test` job, §3.5).
   In repo **Settings → Pages**, confirm the source is "GitHub Actions".
2. **Custom domain:** `CNAME` (root) already contains `ebrostay.com`; `.nojekyll`
   (root) disables Jekyll. Set the custom domain in Settings → Pages to
   `ebrostay.com` and enable "Enforce HTTPS" once the cert is issued.
3. **DNS (GoDaddy):** point the apex at GitHub Pages and `www` at your Pages host:
   ```text
   A     @      185.199.108.153
   A     @      185.199.109.153
   A     @      185.199.110.153
   A     @      185.199.111.153
   CNAME www    <your-github-username>.github.io
   ```
   Leave existing mail / DMARC / nameserver records untouched unless you're
   intentionally changing email providers.

**Verify:** `https://ebrostay.com` serves the site; `https://ebrostay.com/staging`
serves the `staging` branch preview (the deploy job checks out `staging` into
`site/staging`).

---

## 12.10 Smoke test (end-to-end)

Run through these against the live URL; each maps to §6/§10 acceptance criteria:

| # | Action | Expected | Mode it proves |
| --- | --- | --- | --- |
| 1 | Open home | 4+ listings render; ES/EN toggle works | front end + i18n |
| 2 | (live) network tab on load | requests hit your `*.supabase.co` URL, not just statics | §3.3 live mode |
| 3 | Filter by dates/guests/type/budget; sort | grid updates per §5 rules | §5 filtering/sorting |
| 4 | Open a property | gallery, calendar, conditions, map all render | §6.2 |
| 5 | Property booking widget: pick dates | client fee estimate shows; **mailto/WhatsApp** opens prefilled (no online charge) | ✅ MVP booking |
| 6 | Sign up + confirm email | account created; `profiles` row exists | §8 trigger |
| 7 | Save a favorite 🚫 out-of-scope (MVP) | persists across reload (favorites table) | RLS user scope |
| 8 | Submit the home inquiry form | row appears in `inquiries` | §6.1 |
| 9 | As admin: open `admin.html` | Administración link present; tabs load (Requests tab is 🔜 empty) | §8 admin gate |
| 10 | As admin: edit a property, upload a photo, geocode an address, run AI extract | photo lands in `property-photos`; lat/lng filled via Nominatim; AI returns fields | §6.6, §7 |
| 11 | Force static mode (blank `supabase-config.js`) | site still fully works on the 4 samples | §3.3 fallback |

Passing 1–11 = a running clone faithful to the as-built baseline.

---

## 12.11 What NOT to do (decision guardrails — see §11)

- ❌ Do not run `upgrade-2026-06-stripe-bookings.sql` or create/use the `bookings`
  table — Stripe path is 🗑️ dormant-to-remove.
- ❌ Do not wire `request-booking` / `booking_requests` / the admin **Requests** tab
  into the live UI — they are 🔜 planned/unwired. The live booking path is the
  client mailto/WhatsApp MVP only.
- ✅ Keep the anon key public and rely on RLS (§8); never ship the service-role key
  to the browser — it lives only in Edge Function secrets.
