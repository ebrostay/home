# Ebrostay Website

Website for [ebrostay.com](https://ebrostay.com/) — the platform for **mid-term corporate rentals (1–12 months) in Zaragoza, Spain**. Ebrostay connects companies and relocating professionals with verified, furnished, move-in-ready homes, and gives property owners fully hands-off management.

It is a **static front end** (plain HTML/CSS/JavaScript, no build step) hosted on **GitHub Pages**, backed by an **optional Supabase** project for data, accounts, and bookings, and **Stripe** for payments and owner payouts. When Supabase is not configured the site still runs fully on built-in sample data.

## Highlights

- **Bilingual (ES/EN)** UI driven by an in-page translation dictionary.
- **Listings & search** with date/guest/type/budget filters, sorting, and favorites.
- **Property pages** with photo galleries, availability calendars, rental conditions, floor plans, and live travel times to city landmarks.
- **Interactive maps** via Leaflet + OpenStreetMap tiles.
- **Online booking & payment** through Stripe Checkout: full stay (billed in whole months) + commission + refundable deposit, with server-side pricing and double-booking protection.
- **Tenant accounts**: bookings, invoices, saved homes, and arrival details.
- **Owner portal** with Stripe Connect onboarding and automated payouts.
- **Admin panel** to manage listings, availability, photos, and detailed property data.
- **SEO/AI-ready**: per-page meta + JSON-LD, `sitemap.xml`, `robots.txt`, and `llms.txt`.

## Tech Stack

- **Front end:** static HTML, CSS, and vanilla JavaScript (no bundler, no framework).
- **Maps:** [Leaflet](https://leafletjs.com/) 1.9.4 with OpenStreetMap tiles.
- **Date pickers:** flatpickr.
- **Backend (optional):** [Supabase](https://supabase.com/) — Postgres with Row Level Security, Auth, Storage, and Edge Functions.
- **Payments:** [Stripe](https://stripe.com/) Checkout and Stripe Connect (Express accounts).
- **Hosting:** GitHub Pages, deployed via GitHub Actions, on the custom domain `ebrostay.com`.

## Project Structure

### Pages
| File | Purpose |
| --- | --- |
| `index.html` | Home: hero search, listings grid, map, inquiry form, sign-in dialog |
| `property.html` | Property detail: gallery, availability calendar, conditions, floor plans, travel times, booking CTA |
| `booking.html` | Booking flow that opens Stripe Checkout |
| `account.html` | Tenant account: bookings, invoices, saved homes, arrival details |
| `partner.html` | Owner portal: Stripe Connect onboarding and payout status |
| `owners.html` | Owners marketing landing page |
| `admin.html` | Admin: manage availability and "available from" dates |
| `admin-property.html` | Admin: full property editor (details, photos, geocoding) |
| `about.html` | Mission, vision, and the bridge story |
| `privacy.html` | Privacy policy and legal notice |
| `404.html` | Not-found page |

### Scripts
| File | Purpose |
| --- | --- |
| `data.js` | ES/EN translation dictionary and built-in sample property data |
| `backend.js` | Supabase bridge — auth, listings, availability, favorites, inquiries, bookings; falls back to sample data when unconfigured |
| `supabase-config.js` | Supabase URL + anon key and the Stripe publishable key (all public-safe) |
| `site.js` | Home page logic: search, filtering, listings map, inquiry form, auth |
| `property.js` | Property detail logic: gallery, calendar, travel times, map |
| `booking.js` | Booking page logic and Stripe Checkout hand-off |
| `account.js` | Tenant account dashboard |
| `admin.js` / `admin-property.js` | Admin panel and property editor |
| `partner.js` / `owners.js` | Owner portal and owners landing logic |
| `nav.js` | Shared navigation behavior |

### Backend (`supabase/`)
- `schema.sql` — full database schema, RLS policies, and seed data for the current homes. Running this on a fresh project is all that's needed.
- `upgrade-2026-06-*.sql` — incremental migrations for projects created before a feature existed (each is safe to re-run). Cover property photos, richer property details, guest bookings/info, Stripe bookings, availability holds, and the owner portal.
- `functions/` — Supabase Edge Functions (Deno/TypeScript):
  - `create-booking-checkout` — computes price/commission/availability server-side and creates a Stripe Checkout session.
  - `stripe-webhook` — handles Stripe events to confirm bookings and payouts.
  - `owner-connect` — Stripe Connect Express onboarding and payout-status checks for owners.
  - `ai-property-assistant` — DeepSeek-powered helper for the property editor: extracts listing fields from a pasted document and translates text fields between ES and EN. Needs the `DEEPSEEK_API_KEY` secret; see [`docs/deepseek-ai-setup.md`](docs/deepseek-ai-setup.md).

### Other
- `assets/` — logos, icons, hero images, and property photos.
- `styles.css` — all site styling.
- `docs/` — `supabase-setup.md` (step-by-step backend setup) and design notes.
- `sitemap.xml`, `robots.txt`, `llms.txt`, `site.webmanifest` — SEO, crawler, AI, and PWA metadata.
- `CNAME`, `.nojekyll` — GitHub Pages custom domain and bypass of Jekyll processing.

## Running Locally

No build step is required. Serve the folder with any static server, for example:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening the files directly via `file://` mostly works, but a local server is recommended so that `fetch` and module loading behave like production.

## Backend Setup (optional)

The site runs on built-in sample data out of the box. To enable dynamic listings, accounts, bookings, and the admin panel, connect a Supabase project:

1. Create a free Supabase project (West EU region recommended).
2. Run `supabase/schema.sql` in the SQL Editor to create tables, RLS policies, and seed data.
3. Put your **Project URL** and **anon public** key into `supabase-config.js`.
4. For payments, deploy the Edge Functions in `supabase/functions/` and set the Stripe secret key as an Edge Function secret (never commit it). The Stripe **publishable** key goes in `supabase-config.js`.
5. Grant yourself admin with `update public.profiles set is_admin = true where email = 'you@example.com';`.

The anon key and Stripe publishable key are designed to be public — all access is enforced by database RLS policies and server-side Edge Functions. The Stripe **secret** key lives only in Supabase secrets.

Full instructions, including upgrade migrations and where each kind of data lives, are in [`docs/supabase-setup.md`](docs/supabase-setup.md).

## Deployment

Pushing to `main` triggers the GitHub Actions workflow in `.github/workflows/pages.yml`, which publishes the repository root to GitHub Pages at the custom domain `ebrostay.com`.

### GoDaddy DNS for GitHub Pages

```text
A     @      185.199.108.153
A     @      185.199.109.153
A     @      185.199.110.153
A     @      185.199.111.153
CNAME www    <your-github-username>.github.io
```

Keep existing mail, DMARC, and nameserver records unless you intentionally change email providers.

## Contact

- Email: info@ebrostay.com
- Location: Zaragoza, Spain
- Website: https://ebrostay.com/
