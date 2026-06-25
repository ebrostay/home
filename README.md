# Ebrostay Website

Website for [ebrostay.com](https://ebrostay.com/) — the platform for **mid-term corporate rentals (1–12 months) in Zaragoza, Spain**. Ebrostay connects companies and relocating professionals with verified, furnished, move-in-ready homes, and gives property owners fully hands-off management.

It is a **static front end** (plain HTML/CSS/JavaScript, no build step) hosted on **GitHub Pages**, backed by an **optional Supabase** project for data, accounts, and booking requests. When Supabase is not configured the site still runs fully on built-in sample data.

> **Payments:** online card payment (previously Stripe) has been removed. Guests now send a **booking request**; Ebrostay receives an email with the stay details and fee estimate, reviews it, and confirms by email. A new payment provider (Revolut Business) will be wired in later.

## Highlights

- **Bilingual (ES/EN)** UI driven by an in-page translation dictionary.
- **Listings & search** with date/guest/type/budget filters and sorting.
- **Property pages** with photo galleries, availability calendars, rental conditions, floor plans, and an interactive location map.
- **Interactive maps** via Leaflet + OpenStreetMap tiles.
- **Booking requests**: pick dates, see an estimated total (full stay billed in whole months + commission + refundable deposit, computed server-side), and send a request. Ebrostay is emailed and confirms manually — no online charge.
- **Tenant accounts**: stays and arrival details.
- **Owner portal** with payout (IBAN) details capture.
- **Admin panel** to manage listings, availability, photos, and detailed property data.
- **SEO/AI-ready**: per-page meta + JSON-LD, `sitemap.xml`, `robots.txt`, and `llms.txt`.

## Tech Stack

- **Front end:** static HTML, CSS, and vanilla JavaScript (no bundler, no framework).
- **Maps:** [Leaflet](https://leafletjs.com/) 1.9.4 with OpenStreetMap tiles.
- **Date pickers:** flatpickr.
- **Backend (optional):** [Supabase](https://supabase.com/) — Postgres with Row Level Security, Auth, Storage, and Edge Functions.
- **Email:** [Resend](https://resend.com/) (from the `request-booking` Edge Function) for booking-request notifications.
- **Hosting:** GitHub Pages, deployed via GitHub Actions, on the custom domain `ebrostay.com`.

## Project Structure

### Pages
| File | Purpose |
| --- | --- |
| `index.html` | Home: hero search, listings grid, map, inquiry form, sign-in dialog |
| `property.html` | Property detail: gallery, availability calendar, conditions, floor plans, location map, booking-request CTA |
| `booking.html` | Booking detail: stay facts and arrival info for a confirmed stay |
| `account.html` | Tenant account: stays, arrival details |
| `partner.html` | Owner portal: properties, stays, and payout (IBAN) details |
| `admin.html` | Admin: manage availability and "available from" dates |
| `admin-property.html` | Admin: full property editor (details, photos, geocoding) |
| `about.html` | Mission, vision, and the bridge story |
| `privacy.html` | Privacy policy and legal notice |
| `404.html` | Not-found page |

### Scripts
| File | Purpose |
| --- | --- |
| `data.js` | ES/EN translation dictionary and built-in sample property data |
| `backend.js` | Supabase bridge — auth, listings, availability, inquiries, booking requests; falls back to sample data when unconfigured |
| `supabase-config.js` | Supabase URL + anon key (public-safe) |
| `site.js` | Home page logic: search, filtering, listings map, inquiry form, auth |
| `property.js` | Property detail logic: gallery, calendar, map, booking requests |
| `booking.js` | Booking detail page logic |
| `account.js` | Tenant account dashboard |
| `admin.js` / `admin-property.js` | Admin panel and property editor |
| `partner.js` | Owner portal logic |
| `nav.js` | Shared navigation behavior |

### Backend (`supabase/`)
- `schema.sql` — full database schema, RLS policies, and seed data for the current homes. Running this on a fresh project is all that's needed.
- `upgrade-2026-06-*.sql` — incremental migrations for projects created before a feature existed (each is safe to re-run). Cover property photos, richer property details, guest bookings/info, availability holds, the owner portal, and booking requests.
- `functions/` — Supabase Edge Functions (Deno/TypeScript):
  - `request-booking` — computes price/commission/availability server-side, records the booking request, and emails Ebrostay (and an acknowledgement to the guest) via Resend. Needs the `RESEND_API_KEY` secret to send mail; without it the request is still recorded for the admin panel.
  - `ai-property-assistant` — DeepSeek-powered helper for the property editor: extracts listing fields from a pasted document and translates text fields between ES and EN. Needs the `DEEPSEEK_API_KEY` secret; see [`docs/spec/07-integrations.md`](docs/spec/07-integrations.md).

### Other
- `assets/` — logos, icons, hero images, and property photos.
- `styles.css` — all site styling.
- `docs/spec/` — the full reconstruction specification (overview, architecture, data model, business rules, functional spec, integrations, auth/security, conventions, acceptance criteria, decision log, and a rebuild-from-scratch checklist). Start at [`docs/spec/00-outline.md`](docs/spec/00-outline.md).
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
4. Run `supabase/upgrade-2026-06-booking-requests.sql` to add the booking-requests table, then deploy the `request-booking` Edge Function in `supabase/functions/`. To have requests emailed to you, set the `RESEND_API_KEY` Edge Function secret (and optionally `EMAIL_FROM` / `EMAIL_TO`). Without it, requests are still saved and visible in the admin panel.
5. Grant yourself admin with `update public.profiles set is_admin = true where email = 'you@example.com';`.

The anon key is designed to be public — all access is enforced by database RLS policies and server-side Edge Functions. The Resend key lives only in Supabase secrets.

Full instructions, including upgrade migrations and where each kind of data lives, are in the reconstruction spec — see the [rebuild-from-scratch checklist](docs/spec/12-rebuild-checklist.md) and [architecture](docs/spec/03-architecture.md).

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
