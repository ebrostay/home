# Listing detail — information inventory

One level below the structure maps: **which piece of information exists on
which page**, regardless of where it sits. Cells record what the captured
page actually showed (2026-08-07, desktop 1280px). Legend:

- ✓ present as a first-class fact
- ~ present but weakened: buried, boilerplate, gated, or implied
- ⌂ present only after entering dates / in an overlay / at checkout
- — absent

The last column is the verdict for Ebrostay v2: **keep** (have it, it
earns its place), **gap** (missing, should exist), **consider** (missing,
worth a deliberate decision), **skip** (missing on purpose — the absence
is the choice).

## 1 · Identity & basics

| Info | Ebro | Spot | Wund | Flat | Blue | Ebrostay verdict |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| Title = identifiable home (street/name) | ✓ | — SEO phrase | — marketing | — marketing | ✓ street+ID | keep — only we and Blueground say *which* home |
| Property type (apartment/studio…) | ✓ | ✓ | ✓ | ✓ | ✓ | keep |
| Bedrooms / bathrooms | ✓ | ✓ | ✓ | ✓ | ✓ | keep |
| Size m² | ✓ | ✓ | ✓ | ✓ | ✓ | keep |
| Floor number | ✓ | — | ✓ | ✓ | ✓ | keep |
| Sleeps / max occupancy | ✓ | — | ✓ | ✓ | — | keep |
| Neighbourhood named up top | ✓ badge | ~ breadcrumb | ~ in title | ✓ | ✓ breadcrumb | keep |
| Full street address w/ number | ✓ + copy button | — | ✓ + postcode | — | ~ street only | keep — copyable address is already best-in-class |
| Listing ID | — | ~ in page title | — | ~ URL only | ✓ | skip — IDs are operator vocabulary, not guest vocabulary |
| Verified/checked marker | ✓ | ✓ + date | ~ prose | ~ via protection | ✓ vetted | **consider** — Spotahome's "checked on <date>" beats a bare badge; our badge could carry the date |

## 2 · Media

| Info | Ebro | Spot | Wund | Flat | Blue | Ebrostay verdict |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| Photo gallery + lightbox | ✓ | ✓ | ✓ | ✓ | ✓ | keep |
| Photo count stated | — | ~ | — | — | ✓ (14) | consider — one number, sets expectations |
| Floor plan | ✓ | — | — | — | — | keep — **unique**; corporate bookers plan furniture/desks |
| Photos referenced from the text | ✓ | — | — | — | — | keep — unique |
| Street view | — | — | — | ✓ | — | skip — the map + photos already answer it; streetview panes age badly |
| Video / 3D tour | — | — | — | — | — | skip — nobody has it; revisit only with demand |

## 3 · Price & money

| Info | Ebro | Spot | Wund | Flat | Blue | Ebrostay verdict |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| Rent visible without dates | ✓ | — | ✓ | ✓ | — | keep — the lane |
| Honest unit (/30 days) | ✓ | — /month | — /month | ✓ avg | — | keep |
| Per-day rate | ✓ | — | — | — | — | keep — unique, and it *is* the billing model (ADR-023) |
| Utilities/bills policy | ✓ | ✓ | ✓ itemized | ✓ | ~ boilerplate | keep |
| Deposit amount | ✓ | — | ✓ | ✓ (0 €) | — | keep |
| Platform fee / commission amount | ✓ + cap | ⌂ | ✓ (€299) | ⌂ | ⌂ | keep — cap discount visible is unique |
| Cleaning fee | ✓ | — | ✓ (€249) | — | — | keep |
| Total for the chosen stay | ✓ live | ⌂ | — | ⌂ | ⌂ | keep |
| Payment schedule (what, when) | ✓ inline, signed out | ⌂ overlay | — | ⌂ overlay | ⌂ checkout | keep — sharpest differentiator; consider *labeling* it ("no quote — this is the price") |
| Price qualifier honesty (avg/exact) | ✓ exact | n/a | ~ | ✓ "avg" | n/a | keep |
| Currency selector | — | — | — | — | ✓ | skip — EUR-only market |

## 4 · Stay terms & contract

| Info | Ebro | Spot | Wund | Flat | Blue | Ebrostay verdict |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| Min / max stay | ✓ | ✓ | ✓ | ✓ | ~ in prose | keep |
| Available from | ✓ | ✓ | ✓ | ✓ | ✓ | keep |
| Availability calendar in page | ✓ month-band | ✓ 24-mo | ✓ 12-mo | ✓ day-level | ⌂ picker | keep |
| Calendar freshness ("updated…") | — | ✓ 3 d | — | ✓ 12 h | ~ FAQ claim | **gap** — cheap trust on the month-band, twice validated |
| Contract type / pro-rating explained | ✓ | ✓ daily | — | — | — | keep |
| Move-in / move-out clock times | — | — | — | ✓ 15:00/10:00 | ✓ 4pm–12am | **consider** — hosts will be asked anyway; one Conditions row |
| Notice period / early departure | ✓ | ✓ 30 d | — | — | — | keep |
| Cancellation policy | — | ✓ ladder | — | ✓ named | ⌂ needs dates | **gap** — 3 of 4 answer it; we answer it nowhere (ADR needed) |
| Required documents / checks | — | ✓ list | ~ | ~ | ✓ ID+background | **gap** — belongs with the cancellation block (same ADR) |
| Lease readable before booking | — | — | — | ✓ | — | consider — long-term: strong trust move for corporate bookers |
| House rules (smoking/pets/parties) | ✓ | ✓ | ✓ | ✓ | ✓ | keep |

## 5 · Living quality

| Info | Ebro | Spot | Wund | Flat | Blue | Ebrostay verdict |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| Owner-voice description | ✓ bilingual | ~ untranslated | ✓ | ✓ | — corporate | keep — only bilingual-by-design one |
| Platform-voice second description | — | ✓ | — | — | ✓ | skip — saying everything twice is Spotahome's disease |
| Amenity list | ✓ | ✓ | ✓ | ✓ | ✓ | keep |
| Explicit "not available" flags | — | — | ✓ | ✓ | — | **gap** — honest negatives, costs one line each |
| Per-room inventory (what's in which room) | — | ✓ | ✓ beds | ✓ + m² | — | consider — photos + floor plan may already carry this; decide, don't drift |
| Bed sizes | — | ~ | ✓ | ✓ | ~ prose | consider — one fact corporate bookers ask ("is it a real double?") |
| Internet speed (Mbps) | — | — | — | ✓ | — | **gap** for our audience — one mono numeral in Conditions |
| Parking answer (even "no") | ~ amenity only | — | ✓ not avail. | ✓ | ✓ add-on | gap — fold into honest negatives |
| Energy certificate | ✓ cond. | ✓ | ✓ | — | — | keep |
| Heating/AC specifics | ✓ amenity | ✓ | ✓ | ✓ | ✓ | keep |

## 6 · Location & neighbourhood

| Info | Ebro | Spot | Wund | Flat | Blue | Ebrostay verdict |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| Map in page | ✓ interactive | ⌂ gallery tab | — | — | ✓ + POI layer | keep |
| Curated nearby places | ✓ | ~ auto sentence | — | — | — | keep |
| Travel times to POIs | ✓ per profile | — | — | ✓ static list | — | keep — ours are computed per travel mode, theirs are copy |
| Route drawing / travel profiles | ✓ | — | — | — | — | keep — unique |
| Guest's own places | ✓ | — | — | — | — | keep — unique |
| POI category browsing | — | — | — | — | ✓ 12 cat. | skip — categories answer "what's around", our list answers "what do I care about"; two tools, we chose the sharper one |
| Neighbourhood narrative prose | ~ in description | ~ auto | — | ~ host text | ✓ editorial | consider — one owner-written paragraph per area, reusable across listings |

## 7 · People & trust

| Info | Ebro | Spot | Wund | Flat | Blue | Ebrostay verdict |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| Host/operator identity for guests | — | ✓ card | — | ✓ avatar+tenure | ~ partner note | **consider** (deliberate design): a small "Ebrostay, Zaragoza" operator plate — see comparison §instruction 6 |
| Response time / approval stats | — | ~ 24h promise | — | ✓ 14h · 44% | — | consider — only once real data exists; a fake stat is worse than none |
| Reviews / rating for this home | — | — | — | ✓ 4.8 (2) | — | skip for now — no inventory history; revisit at scale |
| Guarantee / protection package | — | ✓✓ | ~ | ✓✓ (AXA) | ~ standards | skip — marketplace insurance theater; our trust = transparency + direct operator |
| Social proof / urgency counters | — | ✓ | — | ✓ | ✓ | skip — calm is the brand; 3 of 4 prove it's now a visible differentiator |
| How-it-works / FAQ on listing | — | ✓ | — | ✓ | ✓ | skip on listing — link to the dedicated page near the CTA (instruction 8) |
| Direct human contact channel | ✓ WA/email | ✓ team | — | ✓ question | ✓ phone/WA | keep — ours is the *operator*, not an agent pool |
| Feedback widgets / surveys | — | — | — | — | ✓ | skip |

## 8 · Navigation & cross-sell

| Info | Ebro | Spot | Wund | Flat | Blue | Ebrostay verdict |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| Back to search results (state kept) | ✓ | ✓ | — | ✓ | — | keep — ours restores filters + scroll |
| Anchor/section index | — | ✓ | — | — | ✓ on scroll | hold (comparison §instruction 7) |
| Similar listings | — | ✓ | ✓ | ✓ | ✓ | consider once inventory >~10 homes; pointless before |
| Breadcrumb | — | ✓ | — | — | ✓ | skip — back-link does the job at our depth |
| SEO tail content | — | ✓ | ✓ | ✓✓ 2,000px | ~ | skip on the listing — SEO belongs to city/landing pages |

## The answer to "are we missing something / showing too much?"

**Missing (act):**

1. **Cancellation policy + required paperwork** — the one info group where
   3 of 4 competitors answer and we are silent. Needs an ADR (booking
   behaviour), then a compact block near the CTA. *(§4)*
2. **Honest negatives** — "no parking", "no lift", bills caps: Wunderflats
   and Flatio prove absence-stated-plainly reads as confidence. *(§5)*
3. **Calendar freshness** on the month-band. *(§4)*
4. **Internet speed** as a fact, for the corporate/remote audience. *(§5)*

**Missing (decide deliberately, no rush):** checked-on date on the
Verified badge, move-in/out clock times, bed sizes, operator plate,
neighbourhood paragraph, photo count, per-room inventory, readable lease,
similar-listings (at scale), reviews (at scale).

**Showing something unnecessary?** No — the page has no dead weight to
cut. Every Ebrostay-only item (floor plan, per-day rate, inline payment
schedule, routes/profiles, your-places, text-referenced photos) is either
the differentiation itself or directly serves the "ledger" identity. The
risk sits entirely on the missing side. The discipline to maintain is what
we *keep out*: platform-voice duplicates, urgency counters, guarantee
theater, SEO tails, feedback chrome — every competitor page is longer than
ours, and none of that length is information.
