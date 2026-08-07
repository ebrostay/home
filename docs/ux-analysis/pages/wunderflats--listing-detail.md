# Wunderflats — listing detail

- **URL:** wunderflats.com/en/furnished-apartment/…/645cf27c2735c3057851adb8
  (Berlin Kreuzberg, captured 2026-08-07, 1280px, EN)
- **Page height:** ~5,870px. Single main column ~700px; floating/sticky
  booking card right (~370px) that starts **on top of the hero photo**.

## Structure, top to bottom

| # | Block | Pattern | Content |
| --- | --- | --- | --- |
| 0 | Header | nav | logo, Apartments, Wishlist, For landlords, lang, Sign in |
| 1 | Hero gallery | media | one **full-bleed photo**, "View gallery" + Save + Share overlaid; booking card floats over its right edge |
| 2 | Title block | identity | h1 → **street address with postcode** → 32 m², floor 1 → 1 room · 1 bed · 2 people |
| 3 | About this listing | prose | "Entire apartment" → owner description (read more) → Additional information (read more) |
| 4 | Services | data | label/value list: confirmation of residence (Anmeldung!), letterbox labels, broadcasting fee, cleaning, parking, concierge, fitness — **including what is NOT available** |
| 5 | Amenities | data | grouped 4-col: Essentials / Kitchen / Bedroom / Bathroom / Other — plain text, no icons |
| 6 | Beds | data | bed inventory by room (1 double bed — bedroom) |
| 7 | Availability | calendar | min stay / max stay / available from + **12-month calendar strip** |
| 8 | House rules | prose+data | rules prose (read more) + pets/smoking pills |
| 9 | Cost overview | commerce | rent €1,690 → charges included (furniture surcharge, operating costs, heating, electricity, internet) → deposit €2,500 → final cleaning €249 → one-time service fee €299 |
| 10 | Certifications | data | energy certificate status |
| 11 | Agents blurb | trust | "Wunderflats Agents" personal support note (under rail) |
| 12 | Similar apartments | nav | 3 cards |
| 13 | SEO footer | nav | city links, legal |
| R | Booking card (floating→sticky) | commerce | **RENT €1,690 / month up front** → stay-duration range picker → Request to book → inline validation helper. Below lg a fixed top callout bar (dates + Request to book) takes over. |

**Overlays:** photo lightbox, date picker; read-more disclosures ×3.
**Jumps:** none — no anchor nav, no in-page links. **Exits:** Request to book
(wizard), similar apartments. **No map anywhere on the page** — location is a
text address only.

## Observed principles

- **First viewport contract:** one photograph and one price. The two facts
  people filter on are answered before a single scroll — the inverse of
  Spotahome's gated price.
- **The page is a contract, not a pitch:** flat single-column document read —
  services (including *not available*), full fee table with deposit,
  cleaning, and service fee, bed inventory, certificates. German rental
  bureaucracy (Anmeldung, Wohnungsgeberbestätigung) is a first-class content
  block. Reads like a Mietvertrag annex with photos.
- **Radical linearity:** no anchor bar, no jumps, few patterns (label/value
  list, plain text columns). Low interaction density: besides dates and
  read-mores there is nothing to *do* — and consequently nothing to learn by
  playing.
- **Honest negatives** ("Cleaning: not available") — stating absence builds
  the same trust Spotahome buys with guarantee cards, at near-zero pixels.
- **Trust is procedural, not promotional:** one agents note; otherwise trust
  is carried by completeness and precision of the information itself.
- **Location is underserved:** address text only, no map, no neighbourhood
  narrative — a striking hole for a relocation product.
