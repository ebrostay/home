# Listing detail — cross-site comparison

Pages mapped (2026-08-07, desktop 1280px): Ebrostay v2, Spotahome
(Zaragoza), Wunderflats (Berlin), Flatio (Barcelona), Blueground (Madrid).
Flatio and Blueground carry no Zaragoza inventory — worth noting: **in
Zaragoza itself the only mapped competitor actually present is Spotahome.**

## Matrix

| Dimension | Ebrostay v2 | Spotahome | Wunderflats | Flatio | Blueground |
| --- | --- | --- | --- | --- | --- |
| Page height | ~5,000px | 7,822px | ~5,870px | **9,148px** | 5,088px |
| Layout | 2-col, sticky rail | 2-col, sticky rail ×2 | 1-col, floating→sticky card | 2-col, sticky price card | 2-col, static card + **scroll-injected anchor bar** |
| Price in first viewport | yes, /30 days + per-day | **no** — needs dates | yes, €/month | yes, **avg /30 days** + utilities note | **no** — needs dates |
| Full cost before contact | **itemized + inline schedule** | overlay after dates | fee table in page | deposit 0 € in page; timeline behind link+dates | checkout only (FAQ promise) |
| Deposit stated in page | yes | no | yes (€2,500) | yes (0 €) | no |
| Photo surface | mosaic | mosaic + map tab | full-bleed hero | mosaic (1+4) | mosaic (1+4) |
| Title = | home name | SEO phrase | marketing phrase | marketing phrase | **street name + unit ID** |
| Key facts row | yes | yes | yes | yes | yes |
| Urgency/social proof | no | views/favs/interested | no | **seen-by counter + "soon gone"** | **"act fast" banner** |
| Anchor/section nav | no | **7-tab sticky bar** | no | no | **6-station fixed bar on scroll** |
| Host/operator identity | no (owner-only bar) | landlord card + verified | none | **avatar, tenure, rating, response 14h, approval 44%** | partner disclosure |
| Internet quality | amenity only | amenity only | amenity only | **Mbps section** | amenity only |
| Availability display | 12-cell month-band | 24-month grid | 12-month strip | day-level calendar | date-picker only (overlay) |
| Calendar freshness note | no | "updated 3 days ago" | no | **"updated 12 hours ago"** | real-time claim in FAQ |
| Map | interactive + routes + profiles | gallery tab only | **none** | street view + travel times | **full-width map + 12 POI categories** |
| Neighbourhood narrative | nearby list + guest's places | auto-POI sentence | none | travel-time list | editorial prose |
| Cancellation on page | no | refund ladder | no | named policy ("Friendly 7-days") | gated behind dates |
| Required documents / checks | no | document list | contract note | contract readable pre-booking | ID + background checks |
| FAQ block | no | how-to-book steps | no | yes | yes (+ per-answer feedback) |
| Booking CTA | WhatsApp/email, sign-in gated | check availability | request wizard | continue ("pay nothing yet") | select dates → checkout |
| Similar properties | no | yes | yes | yes | yes (15 cards) |

## Baseline (what a mid-term visitor now expects)

1. Photo mosaic (1 large + n) with "view all" → lightbox. *(4 of 4 competitors — Wunderflats' full-bleed hero is the outlier)*
2. Title → facts row → long scroll; booking element right. *(5 of 5)*
3. Amenity inventory with "show all" containment. *(5 of 5)*
4. Some calendar/availability visual with min/max stay. *(5 of 5)*
5. Similar properties + SEO tail. *(4 of 4 competitors; Ebrostay skips — fine while inventory is small)*
6. A cancellation answer somewhere on the page. *(3 of 4; Ebrostay lacks)*
7. An FAQ/how-it-works education block. *(3 of 4; the mid-term model needs teaching)*

**Divided, not baseline:** price gating (Spotahome + Blueground gate;
Wunderflats + Flatio + Ebrostay show); urgency theater (3 of 4 use it);
persistent scroll chrome — every competitor keeps *something* pinned, but
they split on what: the CTA (Spotahome, Wunderflats, Flatio) or an
orientation index (Blueground's scroll-injected anchor bar; Spotahome runs
both). Below lg all four collapse to a fixed booking bar. Ebrostay pins
header + booking panel — CTA-persistent, like the majority.

## The four competitor archetypes

- **Spotahome — the insurer:** sells safety of transacting; price is the
  lead magnet.
- **Wunderflats — the notary:** sells contractual completeness; page is a
  dossier, dead but honest.
- **Flatio — the community:** sells the host relationship and the nomad
  lifestyle; warm but sprawling (9k px) and salted with urgency.
- **Blueground — the operator:** sells process certainty at scale; listing
  as SKU, price as quote.

Ebrostay's lane is confirmed but sharpened: **the ledger** — the only page
where the full cost, per-day rate, and month-by-month schedule are facts on
the page rather than quotes behind a form, combined with the only
neighbourhood instrument that answers "how would *I* live here" (routes,
profiles, own places) instead of listing POI categories (Blueground) or
travel-time estimates (Flatio).

## Instructions for Ebrostay (updated for 5 sites)

1. **Keep price in the first viewport, itemized, in /30-days units.**
   Flatio validates the unit; Spotahome and Blueground's gating is
   lead-capture, not UX. The inline signed-out payment schedule remains the
   sharpest single differentiator — protect it, say it out loud
   ("no quote, this is the price").
2. **Adopt honest negatives** (Wunderflats "not available", Flatio's
   not-available flags): state what a home lacks in Conditions.
3. **Close the contractual gap — now 3 of 4 competitors cover it:** a
   compact cancellation + required-paperwork block near the CTA
   (Spotahome's ladder, Flatio's named policy, Blueground's checks all
   prove demand). Needs an ADR.
4. **Calendar-freshness signal** on the month-band ("updated N hours ago")
   — Spotahome and Flatio both do it; cheap trust for a page whose whole
   identity is the calendar.
5. **Consider a Wi-Fi speed fact** (Flatio): for corporate/remote tenants
   this is a filter criterion, one mono numeral in Key facts or Conditions.
6. **Decide the operator-identity question deliberately.** Every archetype
   answers "who am I dealing with" except Ebrostay's guest view. A small
   operator plate (Ebrostay, Zaragoza-local, response time) would borrow
   Flatio's warmth without marketplace theater. Needs design intent, not
   copy of a host profile.
7. **Do not add:** urgency counters (3 of 4 use them — being the calm
   exception is now a *visible* differentiator, not an absence), price
   gating, platform-voice duplicate descriptions. **Anchor bar: hold, but
   watch it** — now 2 of 4 run one (Spotahome in-flow, Blueground fixed on
   scroll), yet both pages are also the ones drowning in platform sections;
   at Ebrostay's ~5k px with 8 scannable sections an index still signals
   bloat rather than curing it. Revisit only if the page grows past ~6k px
   (e.g. via instruction 3's block plus reviews someday).
8. **Education lives on How-it-works, not the listing** — Flatio and
   Blueground push FAQ onto every listing and pay for it in page length;
   Ebrostay has a dedicated page for that job. One link near the CTA
   suffices.
