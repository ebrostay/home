# Blueground — listing detail

- **URL:** theblueground.com/p/furnished-apartments/mad-1013511p (Palacio,
  Madrid — captured 2026-08-07, 1280px, EN). **No Zaragoza inventory.**
  This unit is "managed by a partner"; Blueground-operated units share the
  same template.
- **Page height:** 5,088px. Single main column ~700px; **static** (not
  sticky) booking card ~390px at x836.

## Structure, top to bottom

| # | Block | Pattern | Content |
| --- | --- | --- | --- |
| 0 | Header | nav | logo, Contact, language, **currency selector** — hides on scroll |
| 0b | **Anchor-index bar** | nav | *appears fixed on scroll, replacing the header:* Photos · About this home · What this home offers · About the neighborhood · Similar homes · Booking & stay rules — active section underlined |
| 1 | Title block | identity | breadcrumb (Palacio, Madrid) → **h1 = street name** → 1 bed · 1 bath · 49 m² · 1st floor · **ID** · Share/Save |
| 2 | Photo mosaic | media | 1 large + 4 grid, "View all photos (14)" |
| 3 | Urgency banner | trust | "This home is popular! Act fast before it's gone" |
| 4 | Managed by a partner | trust | vetted third-party disclosure |
| 5 | About this home | prose | copywritten walkthrough → **Add-ons** (pets, off-site parking) → **Keep in mind** (rules, 31 nights–11 months, contract required) |
| 6 | What this home offers | data | amenity grid, "View all amenities (18)" |
| 7 | Trusted partner | trust | booking/payment via Blueground, partner does move-in; standard kit (Wi-Fi, utilities set up, linens) |
| 8 | About the neighborhood | map | **full-width Google Map (500px) with POI category chips** (supermarkets, gyms, restaurants… 12 categories) + editorial neighbourhood prose |
| 9 | Similar homes | nav | 15-card paginated carousel with per-card availability dates |
| 10 | Booking & stay rules | data | cancellation: **"add dates to get the details"** · booking confirmation (ID/background checks) · home rules (move-in 4pm–12am…) |
| 11 | FAQ | trust | accordions with **"Did you find this helpful?"** per answer; pricing FAQ promises "full payment timeline" at checkout |
| 12 | Contact block | trust | phone, WhatsApp, email (sales-mad@) + survey banner + "anything missing on this page?" feedback widget |
| 13 | Footer | nav | corporate links |
| R | Booking card (static ≥lg, right) | commerce | "Available from 08 Aug 2026" → Select dates → **"Add dates to see prices"** → "Any questions? Message us". Below lg a **fixed bottom booking bar** takes over. |

**Overlays:** photo lightbox, date-picker calendar (min-stay aware).
**Jumps:** the scroll-injected anchor bar → 6 sections. **Exits:** checkout
flow, similar homes, WhatsApp/phone/email.

## Observed principles

- **Standardized product, not a listing:** street-name titles, unit IDs, a
  currency selector, copywritten descriptions in one corporate voice,
  "Add-ons / Keep in mind" as a fixed rubric. The inventory reads like SKUs
  — the opposite pole from Flatio's host-with-avatar.
- **Price gated like Spotahome** ("Add dates to see prices") — and even the
  cancellation policy needs dates. The page treats price as a quote, not a
  fact; the FAQ *promises* transparency ("full payment timeline") that the
  page itself withholds.
- **The strongest neighbourhood treatment among competitors:** a real map
  with 12 POI categories plus editorial prose. Still no travel times, no
  routes, no personalisation — categories, not answers.
- **Operational trust:** vetting, ID/background checks, precise move-in
  windows, dedicated sales channel per city. Aimed at relocations/corporate
  bookers who need process certainty rather than reassurance badges.
- **Feedback instrumentation everywhere** (per-FAQ "helpful?", page-gap
  widget, survey) — the page is a product being A/B-measured, and it shows.
- **Persistent chrome is navigational, not commercial (on desktop):** the
  booking card doesn't stick, but on scroll the header swaps for a fixed
  anchor-index bar with the active section underlined — the page keeps you
  *oriented* rather than keeping the CTA in your face. (Below lg the
  priorities flip: a fixed bottom booking bar takes over and there is no
  index.) *Correction 2026-08-07: the first pass missed the scroll-injected
  bar because the sweep ran at scroll 0 — see README, scroll-state sweep.*
