# Ebrostay v2 — listing detail

- **URL:** `/{locale}/property?id={slug}` (captured: `/en/property?id=pedro1` on
  delightful-sand-063f8a703.7.azurestaticapps.net, 2026-08-07, 1280px)
- **Source of truth:** `app/app/[locale]/property/page.tsx` — geometry below is
  the deployed page; sections a light listing lacks (nearby list, floor plan,
  description figures) are taken from source and marked *(conditional)*.
- **Page height:** ~3,470px measured on a minimal listing; ~5,000px canonical.

## Structure, top to bottom

| # | Block | Pattern | Content |
| --- | --- | --- | --- |
| 0 | Header (sticky) | nav | logo, Find a home / Manage Property / How it works, ES\|EN, theme, Sign in |
| 1 | Back link | nav | "← All homes in Zaragoza" — returns to the exact result list left behind |
| 2 | Title block | identity | Verified + neighbourhood badges → h1 → area, Zaragoza |
| 3 | Photo mosaic | media | Fancybox gallery; floor-plan pill when one exists |
| — | *two-column grid begins* | | main column + 380px sticky rail |
| 4 | Key facts | data | bedrooms · bathrooms · m² · floor · sleeps, big mono numerals + Share |
| 5 | About | prose | rich text; **place chips** and **photo figures** are live references |
| 6 | Amenities | data | 2-col icon list |
| 7 | Availability | calendar | the 12-cell month-band + 3-state legend + "open from" date |
| 8 | Stay terms | data | min/max stay, notice, billing rules |
| 9 | Conditions | data | 3-col card grid: deposit, bills, energy, pets, smoking… |
| 10 | Where you'll be | map | address plate (show-on-map + copy) → sticky map with travel-profile toggle → Nearby list *(conditional)* → Your places (guest's own list) |
| 11 | Floor plan | media | *(conditional)* line-art image on white card |
| R | Booking panel (rail, sticky) | commerce | price/30 days + per-day rate → date range picker → cost breakdown (rent, commission, cap discount, deposit, cleaning) → total → payment-schedule disclosure → CTA (WhatsApp/email, sign-in gated) → reassurance line |

**Overlays:** photo lightbox (mosaic and description figures), date-range
calendar popover, payment schedule `<details>`.

**Jumps:** description place-chip → neighbourhood map (draws route);
description photo figure → lightbox; mosaic floor-plan pill → floor-plan
section; address plate → map recentre; nearby/your-places row → map route.
**Exits:** back link, CTA (wa.me / mailto), sign-in.

## Observed principles

- **First viewport contract:** identity + photos. Price appears on scroll (or
  immediately on tall screens) in the rail — always with the honest unit
  ("/ 30 days" + per-day rate).
- **Price honesty is the differentiator:** full itemized cost *and* the
  month-by-month payment schedule are computable before any contact, signed
  out. No competitor mapped so far does this.
- **Reading order:** ambient, no anchor nav — the page trusts its ~11-section
  length to be scannable. The one enforced jump is content-driven (chips in
  the prose point at the map).
- **Interaction density is high:** the description is an *instrument* (chips
  select places, figures open photos), the map draws routes per travel
  profile, the guest can pin their own places. The page answers "how would I
  live here", not just "what is it".
- **Trust is a whisper:** one Verified badge; no guarantee cards, no
  how-it-works. Against Spotahome's five trust modules this is either calm
  confidence or a gap — decide deliberately (see comparison).
- **Pattern economy:** strong — mono-numeral data rows, card grids and the
  month-band recur; nothing appears only once stylistically.
