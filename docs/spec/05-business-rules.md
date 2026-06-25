# Ebrostay Reconstruction Spec — §5 Business Rules & Algorithms

> Baseline: as-built (branch `main`, 2026-06-25). Status tags: ✅ active · 🔜 planned/unwired · 🗑️ dormant-to-remove · 🐞 suspected bug · 🚫 out-of-scope (MVP).

This section is the authoritative source for **every numeric output in the UI**.
A faithful rebuild that follows the pseudocode and constants here reproduces the
listing prices, the booking estimate, the calendar limits, and the filtered
result set **to the cent and to the day**.

Two computations exist for pricing:

| Computation | File | Status | Role |
| --- | --- | --- | --- |
| **Client estimate** | `property.js` → `computeEstimate()` | ✅ **active** | The **authoritative live pricing** shown to the visitor (MVP booking flow is client-side mailto/WhatsApp). |
| **Server estimate** | `supabase/functions/request-booking/index.ts` | 🔜 **planned / unwired** | Built and deployed, but `requestBooking()` has **no caller** in the front end. Must stay in **parity** with the client. |

> **Parity rule:** the two must agree on `months`, `rent`, `commission`, `deposit`
> and `total` for every input. Divergences are flagged inline with 🐞. The only
> *intended* divergence is presentation (the client shows a "commission discount"
> line; the server emails the net commission directly).

Shared constants (identical in both files):

```
MAX_STAY_MONTHS / MAX_MONTHS = 11
COMMISSION_PCT               = 0.15      // 15%, VAT 21% already included
```

All dates are ISO `YYYY-MM-DD` strings, parsed at **UTC midnight**
(`new Date(`${d}T00:00:00Z`)`) for all month arithmetic, so results are
timezone-independent. (Display-only parsing in `formatDate` uses local midnight;
this never feeds a calculation.)

---

## 5.1 Pricing

### 5.1.1 Billed months — whole months, round up, min 1, end-date EXCLUSIVE ✅

**Plain language.** A stay is billed in **whole calendar months** counted from the
start date. The end date is the **exclusive check-out date**: a stay running from
the start to *exactly* `start + N months` is billed as **N** months. Any partial
month rounds **up**. The minimum is **1** month.

Because months are counted by **calendar arithmetic** (`setUTCMonth(+1)`), the
literal number of days in a billed month varies (28–31). "10 Jul → 10 Aug" is one
billed month regardless of July having 31 days; "10 Feb → 10 Mar" is also one
billed month though February is shorter.

**Pseudocode** (identical in `property.js:284` and `index.ts:37`):

```
addMonths(startDate, n):
    d = Date(startDate @ UTC midnight)
    d.UTCMonth += n              // calendar add; JS rolls overflow forward
    return d as YYYY-MM-DD

billedMonths(startDate, endDate):
    months = (end.year - start.year) * 12 + (end.month - start.month)
    if months < 1: months = 1
    while addMonths(startDate, months) < endDate:   // string compare, ISO sorts lexically
        months += 1
    return months
```

The `while` loop is what forces **round-up**: it keeps adding whole months until
`start + months` reaches or passes the requested checkout.

> **Day-overflow note.** `setUTCMonth` rolls overflow forward: `addMonths("2026-01-31", 1)`
> → `2026-03-03` (Jan 31 + 1 month = "Feb 31" → Mar 3). This is inherited JS
> behavior and is **identical** on client and server, so it does not break parity,
> but it can make end-of-month start dates count an extra month. Worked example
> E4 below.

**Worked examples** (the canonical acceptance cases):

| # | start | end (checkout, exclusive) | year/month diff | round-up loop | **months** |
| --- | --- | --- | --- | --- | --- |
| E1 | 2026-07-10 | **2026-08-10** | 1 | `addMonths(...,1)=2026-08-10` not `< end` → stop | **1** |
| E2 | 2026-07-10 | **2026-08-11** | 1 | `2026-08-10 < 2026-08-11` → +1 = 2; `2026-09-10` not `<` → stop | **2** |
| E3 | 2026-07-10 | 2026-07-15 | 0 → min 1 | `2026-08-10` not `< 2026-07-15` | **1** |
| E4 | 2026-01-31 | 2026-02-28 | 1 | `addMonths(...,1)`=`2026-03-03`; `2026-03-03 < 2026-02-28`? no → stop | **1** |
| E5 | 2026-07-10 | 2027-06-10 | 11 | `2027-06-10` not `< end` | **11** |
| E6 | 2026-07-10 | 2027-06-11 | 11 | +1 = **12** → exceeds `MAX_STAY_MONTHS` → `toolong` |

E1 vs E2 is the load-bearing distinction: **10 Jul→10 Aug = 1 month**;
**10 Jul→11 Aug = 2 months.**

### 5.1.2 Rent, commission, deposit, total ✅

**Plain language.**

- **Rent** = billed months × monthly price (`price_number` / `priceNumber`).
- **Commission** = `min(15% × rent, one month's rent)`. It is capped at **one
  month's rent**: for stays of 7+ months the raw 15% would exceed a month, so the
  cap binds.
- The **"commission discount"** line is presentation-only: when the cap binds, the
  client shows the **raw** 15% commission, then a separate negative line for the
  amount shaved off by the cap (`raw − capped`). The total uses the **capped**
  commission. (The server emails the net/capped commission with no discount line.)
- **Deposit** = `deposit_amount` (`depositAmount`) when set, else **0**.
- **Total** = rent + (capped) commission + deposit.

**Pseudocode** (`property.js:316` `computeEstimate`):

```
price       = property.priceNumber
rent        = months * price
commissionRaw = 0.15 * rent
commission    = min(commissionRaw, price)          // cap = one month
capped        = commissionRaw > price + 0.001       // tolerance avoids float noise
discount      = capped ? commissionRaw - commission : 0
deposit       = property.depositAmount || 0
total         = rent + commission + deposit
```

Server equivalent (`index.ts:205`) computes the same `rent`, `commission` (same
`min`), `deposit`, `total`; it stores each `.toFixed(2)` and has **no** `capped`/
`discount` concept.

**When does the cap bind?** `0.15 × months × price > price` ⟺ `0.15 × months > 1`
⟺ `months > 6.667` ⟺ **months ≥ 7**. So 1–6 month stays show raw commission with
no discount line; 7–11 month stays show the cap + a discount line.

**Worked example A — short stay, deposit, cap NOT binding** (property `pedro0`,
price 950, depositAmount unset in sample → deposit 0; here we assume a deposit of
500 to exercise the line):

```
start 2026-09-01, end 2026-12-01  → months = 3
rent        = 3 × 950            = 2850.00
commissionRaw = 0.15 × 2850      =  427.50
commission  = min(427.50, 950)   =  427.50   (cap not binding; capped=false)
deposit     = 500.00
total       = 2850 + 427.50 + 500 = 3777.50
```

UI lines (client): Rent (3 months) 2.850 EUR · Commission 427,50 EUR · Fianza
500 EUR · **Total estimado 3.777,50 EUR**. No discount line.

**Worked example B — long stay, cap BINDS, discount line shown** (price 1350,
deposit 1350):

```
start 2026-07-10, end 2027-06-10 → months = 11   (E5)
rent          = 11 × 1350        = 14850.00
commissionRaw = 0.15 × 14850     =  2227.50
commission    = min(2227.50, 1350) = 1350.00     (cap binds; capped=true)
discount      = 2227.50 − 1350.00 =   877.50
deposit       = 1350.00
total         = 14850 + 1350 + 1350 = 17550.00
```

UI lines (client):

| line | value |
| --- | --- |
| Rent (11 months) | 14.850 EUR |
| Commission | 2.227,50 EUR  ← **raw** shown |
| Commission discount | −877,50 EUR |
| Fianza | 1.350 EUR |
| **Total estimado** | **17.550 EUR** |

> Note the displayed total (17.550) equals rent + **capped** commission + deposit,
> not rent + the displayed raw commission. The discount line reconciles the two.

**Server (parity) for example B:** `rent_eur=14850.00`, `commission_eur=1350.00`
(net), `deposit_eur=1350.00`, `total_eur=17550.00`. Emails render
"Comisión (15%, IVA incl.) 1350.00 EUR" with no discount row. **Totals match.** ✅

### 5.1.3 Money formatting

Amounts route through `formatPrice(amount, lang)` (data.js): ES groups with `.`
(`14.850 EUR`), EN with `,` (`14,850 EUR`), no decimals on whole euros; cents shown
only when present (`427,50 EUR` / `427.50 EUR`). The **server** stores raw
`.toFixed(2)` strings and emails `"<value> EUR"` un-grouped — a presentation
difference, not a value difference.

---

## 5.2 Filtering (`site.js`)

A property is shown on the home grid only if it passes **all** of: enhanced
filters → quick filters → the main predicate. The same boolean drives cards, the
`role="status"` count, and the map markers (one pipeline — R-Home-1).

### 5.2.1 Main predicate ✅ (R-Home-3)

`isAvailable(property, filter)` (`site.js:197`). A property **passes** iff every
clause holds:

| Clause | Rule | Comparison |
| --- | --- | --- |
| city | `filter.city` empty **or** `property.city` contains it | substring, lowercased |
| type | `filter.propertyType === "all"` **or** `property.type === filter.propertyType` | exact |
| budget | `!filter.maxBudget` **or** `property.priceNumber ≤ filter.maxBudget` | ≤ |
| guests | `property.guests ≥ filter.guests` | ≥ |
| amenities | **every** checked amenity ∈ `property.amenities` | all-present (AND) |
| available-from | if range chosen: `filter.checkIn ≥ property.availableFrom` | ≥ (check-in not before listing opens) |
| no overlap | if range chosen: range does **not** overlap any `unavailable` block | **exclusive** (see below) |

**Pseudocode:**

```
isAvailable(property, filter):
    if not passesEnhancedFilters(property): return false
    if not passesQuickFilters(property):    return false
    if not filter: return true
    if filter.city and not property.city.includes(filter.city): return false
    if filter.propertyType != "all" and property.type != filter.propertyType: return false
    if filter.maxBudget and property.priceNumber > filter.maxBudget: return false
    if property.guests < filter.guests: return false
    if any(a not in property.amenities for a in filter.amenities): return false
    if filter.checkIn and filter.checkOut:
        if property.availableFrom and filter.checkIn < availableFrom: return false
        return not any( rangesOverlap(checkIn, checkOut, blockStart, blockEnd)
                        for [blockStart, blockEnd] in property.unavailable )
    return true

rangesOverlap(startA, endA, startB, endB):
    return startA < endB and startB < endA       // STRICT — touching does NOT overlap
```

> **🐞 / inconsistency flag — overlap inclusivity differs across the codebase.**
> The home-grid filter uses **strict** `<` (exclusive): a requested range whose
> checkout equals a block's start, or whose check-in equals a block's end, is
> treated as **available**. But the property-page estimate (`rangeHasConflict`,
> §5.4) and the GiST DB constraint use **inclusive** `[]` bounds. So a range that
> *touches* a block can pass the home filter yet be rejected as a `conflict` on the
> property page. Document as intentional only if blocks are stored as
> *exclusive-checkout* ranges; otherwise this is a one-day edge inconsistency.

**Worked example F** — block `["2026-07-04","2026-07-10"]` on `pedro0`:

| requested check-in → check-out | `rangesOverlap` (home) | shown on grid? |
| --- | --- | --- |
| 2026-07-10 → 2026-08-10 | `start 07-10 < 08-10` ✓ and `07-04 < 07-10`?… `startB(07-04) < endA(08-10)`✓ → both true → **overlap** | **excluded** |
| 2026-07-11 → 2026-08-11 | `07-11 < 08-11`✓, `07-04 < 08-11`✓ → still overlaps because block end 07-10 ≥ check-in? No: `endB(07-10) > startA(07-11)`? `startA(07-11) < endB(07-10)` is **false** → **no overlap** | **shown** |

(Note: the home grid passes the **dates as `Date` objects**; `rangesOverlap`
compares `checkIn < blockEnd && blockStart < checkOut`. Check-in 2026-07-11 vs
block end 2026-07-10 → `07-11 < 07-10` false → no overlap.)

### 5.2.2 Quick filters ✅ (R-Home-5) — combinable AND

`passesQuickFilters` (`site.js:152`), keys held in the `quickFilters` Set:

| Chip key | Predicate |
| --- | --- |
| `checked` | `property.checked === true` (verified listings) |
| `bills` | `billsPolicyOf(property) === "included"` |
| `deposit` | `property.depositProtected === true` |

`billsPolicyOf` (`data.js:1525`) returns `property.billsPolicy` if set, else falls
back to the legacy boolean: `billsIncluded ? "included" : "excluded"`. So
"Gastos incluidos" hides `capped` and `excluded` homes. Multiple chips apply
**jointly (AND)**.

### 5.2.3 Enhanced filters ✅ (R-Home-7, injected by `enhance.js`)

`passesEnhancedFilters(property, enhanced)` (`site.js:189`); inputs read by
`getEnhancedFilters()` (`site.js:162`):

| Filter | Source | Predicate |
| --- | --- | --- |
| address search | `#addressQuery` (lowercased, trimmed) | `propertyMatchesText` substring across the concatenated, lowercased fields below |
| min bedrooms | `#minBedrooms` (0/1/2/3/4) | `Number(property.bedrooms || 0) ≥ minBedrooms` |
| min bathrooms | `#minBathrooms` (0/1/2/3) | `Number(property.bathrooms || 0) ≥ minBathrooms` |
| saved only 🚫 out-of-scope (MVP) | `localStorage["ebrostay-saved-only"] === "true"` | `favorites.has(String(property.id))` |

**Address search scans exactly these fields** (`propertyMatchesText`, `site.js:176`),
joined by spaces, lowercased:

```
property.address, property.addressKey, property.city,
t(property.areaKey), t(property.nameKey), t(property.copyKey),
property.detailsKey ? t(property.detailsKey) : ""
```

i.e. raw address + address key + city + **translated** area/name/description/details
in the **current language**. A `0` value for min beds/baths means "any" (the clause
is skipped because `if (enhanced.minBedrooms && …)` short-circuits on 0).

---

## 5.3 Sorting ✅ (R-Home-6)

`sortProperties(list, selectedSort)` (`site.js:218`):

| key | ordering |
| --- | --- |
| `best` (default) | `rating` **desc**, tie-break `priceNumber` **asc** |
| `price` | `priceNumber` **asc** |
| `new` | `isNew` **desc** (true first), tie-break `priceNumber` **asc** |

```
compare(a, b):
    if sort == "price": return a.priceNumber - b.priceNumber
    if sort == "new":   return (b.isNew - a.isNew) || (a.priceNumber - b.priceNumber)
    default ("best"):   return (b.rating - a.rating) || (a.priceNumber - b.priceNumber)
```

`Number(true) = 1`, `Number(false) = 0`, so `b.isNew - a.isNew` puts new arrivals
first. Sort is a stable copy (`[...list].sort`).

**Worked example G** — sample set (rating / price / isNew):

| id | rating | price | isNew |
| --- | --- | --- | --- |
| pedro0 | 4.8 | 950 | false |
| pedro2 | 4.7 | 980 | true |
| movera0 | 4.9 | 1350 | true |
| movera1 | 4.7 | 1350 | true |

- **best:** movera0 (4.9) → pedro0 (4.8) → [pedro2, movera1 tie 4.7 → price 980 < 1350] → pedro2 → movera1.
- **price:** pedro0 (950) → pedro2 (980) → [movera0, movera1 tie 1350].
- **new:** isNew-true first by price: pedro2 (980) → [movera0, movera1 (1350)] → then pedro0 (false).

---

## 5.4 Availability — blocks, holds & overlap

### 5.4.1 Block vs hold ✅

A row in `availability_blocks` is either a **confirmed block** or a temporary
**hold**, distinguished by `hold_expires_at` (`upgrade-2026-06-availability-holds.sql`):

| `hold_expires_at` | meaning |
| --- | --- |
| `NULL` | **confirmed block** — a manually taken stay; permanently unavailable. |
| future timestamp | **active hold** — temporarily reserved until it expires. |
| past timestamp | **expired hold** — should be treated as available again. |

**Client mapping (`backend.js:101`)** — what becomes `property.unavailable`:

```
unavailable = availability_blocks
    .filter(b => !b.hold_expires_at || new Date(b.hold_expires_at) > new Date())
    .map(b => [b.start_date, b.end_date])
```

So the client keeps **confirmed blocks + still-active holds** and **drops expired
holds**. `property.unavailable` is the `[ [start,end], … ]` array consumed by every
overlap test in §5.2 and §5.4.2.

### 5.4.2 Overlap tests — three variants (mind the bounds)

| Where | Function | Bounds | Notes |
| --- | --- | --- | --- |
| Home grid | `rangesOverlap` (`site.js:122`) | **strict `<`** (exclusive) | touching is allowed |
| Property estimate | `rangeHasConflict` (`property.js:298`) | **`<=` / inclusive** | `start <= to && from <= end` |
| DB constraint | GiST `daterange(start,end,'[]')` | **inclusive `[]`** | confirmed rows only |
| Server function | REST `lte/gte` (`index.ts:196`) | **inclusive** | `start_date ≤ bookingEnd AND end_date ≥ startDate` |

Property-page conflict test:

```
rangeHasConflict(startDate, endDate):
    return any( startDate <= to && from <= endDate
                for [from, to] in property.unavailable )   // inclusive both ends
```

### 5.4.3 GiST no-overlap constraint ✅ (confirmed-only)

```sql
alter table public.availability_blocks
  add constraint availability_no_overlap
  exclude using gist (
    property_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (hold_expires_at is null);
```

The `WHERE (hold_expires_at is null)` clause means the DB **only enforces
no-overlap among confirmed blocks**. Holds (active or expired) may overlap each
other and confirmed blocks at the database level; overlap of holds is a UI/app
concern, not a DB invariant. Ranges are **inclusive** on both ends (`'[]'`).

### 5.4.4 🐞 Server overlap check does not exclude expired holds

`request-booking` (🔜) queries **all** `availability_blocks` rows for the property
without filtering `hold_expires_at`:

```ts
const { data: overlap } = await admin
  .from("availability_blocks")
  .select("id")
  .eq("property_id", property.id)
  .lte("start_date", bookingEnd)
  .gte("end_date", startDate)
  .limit(1);
if (overlap?.length) return json({ error: "dates_unavailable" }, 409);   // index.ts:196–203
```

**Bug:** this counts **expired holds** (and active holds) as blocking, whereas the
client (`backend.js:103`) drops expired holds before showing availability. **Result
if this path is ever wired:** a date range the client offers as free can be
**rejected 409** by the server because a long-dead hold still overlaps it.

**Fix to restore parity:** add `.or("hold_expires_at.is.null,hold_expires_at.gt." + nowISO)`
(or filter confirmed-only with `.is("hold_expires_at", null)` if holds should not
block requests at all — a product decision). Until decided, this is an **open item**
(requirements §5, decision 2) and the parity guard (R-BReq-6 / R-Prop-5) must cover
the hold case before activation.

---

## 5.5 Validation rules

### 5.5.1 Date-range validity ✅

- **Home search (R-Home-4):** `getFilterFromForm(form, requireValidRange=true)`
  (`site.js:130`) — if `checkOut <= checkIn`, sets the inline status to
  `t("status.invalid")` and returns `null` (search does not run).
- **Property estimate:** `computeEstimate` returns `{status:"empty"}` when either
  date is missing **or** `endDate <= startDate` — no estimate, CTAs stay blocked.
- **Server (🔜):** rejects `bookingEnd <= startDate` with **400 `bad_request`**;
  also **409 `dates_unavailable`** if `startDate < today` or
  `startDate < available_from`.

### 5.5.2 Estimate states ✅ (R-Prop-6)

`computeEstimate` (`property.js:316`) returns exactly one status:

| status | trigger | UI |
| --- | --- | --- |
| `empty` | missing date or `end <= start` | no summary; CTAs blocked |
| `conflict` | `rangeHasConflict` true (overlaps a block, inclusive) | shows `book.rangeUnavailable`; no estimate |
| `toolong` | `billedMonths > 11` | shows `book.splitNote` (two-contract message) |
| `ok` | otherwise | full itemized estimate rendered |

### 5.5.3 Min/max stay on the date pickers ✅ (R-Prop-7)

In `initBookingWidget` (`property.js:469`) the **end-date** picker bounds are
derived from the start date:

```
minEndFor(start) = bookingEndDate(start, max(1, property.minStayMonths || 1))
maxEndFor(start) = let byStay = bookingEndDate(start, min(11, property.maxStayMonths || 11))
                   let block  = nextBlockAfter(start)            // first block start >= start
                   if no block: return byStay
                   let beforeBlock = block − 1 day
                   return min(beforeBlock, byStay)               // earlier of the two
```

where `bookingEndDate(start, n) = addMonths(start, n) − 1 day` (the inclusive last
night for an `n`-month stay). So:

- **min selectable checkout** = `start + min_stay months − 1 day` (default min_stay 1).
- **max selectable checkout** = **earlier of** `start + min(max_stay, 11) months − 1 day`
  **and** `(next block start) − 1 day`. The picker never lets a stay cross into the
  next block, and never exceeds 11 months.

Start-date picker: `minDate = max(today, available_from)`; blocked ranges
(`property.unavailable`) are `disable`d (struck through). When the start changes,
the end picker's min/max are recomputed and the end snaps up to the new min if it
fell below it.

**Worked example H** — `movera0`, price 1350, `minStayMonths = 1`, no `maxStayMonths`
(→ 11), `availableFrom = 2026-07-01`, block `["2026-07-26","2026-08-02"]`:

```
start = 2026-07-15
minEnd = bookingEndDate("2026-07-15", 1) = addMonths(+1)=2026-08-15, −1 day = 2026-08-14
byStay = bookingEndDate("2026-07-15", 11) = 2027-06-15, −1 = 2027-06-14
nextBlockAfter("2026-07-15") = "2026-07-26"  → beforeBlock = 2026-07-25
maxEnd = min(2026-07-25, 2027-06-14) = 2026-07-25
```

So from a 2026-07-15 start the visitor may pick a checkout between **2026-08-14**
(min stay) and **2026-07-25** (day before the block). Here `minEnd (08-14) >
maxEnd (07-25)` — the block sits inside the minimum stay, so **no valid checkout
exists** and the widget offers an empty selectable window; the visitor must choose
a start that clears the block (the calendar still disables 07-26…08-02 directly).

### 5.5.4 Required fields to enable booking CTAs ✅ (R-Prop-9)

`buildRequestPayload` (`property.js:377`) sets `valid` and `updateRequestLinks`
(`property.js:430`) gates the `#bookingEmailButton` / `#bookingWhatsappButton`:

```
tenants = #bookingTenants split on "\n", trimmed, non-empty
est     = computeEstimate(start, end)
valid   = est.status == "ok"  AND  tenants.length > 0
```

- `valid === false` → both CTAs get `aria-disabled="true"`, class `is-disabled`,
  `title = t("request.missingFields")`; a click is intercepted
  (`handleRequestClick`) → `event.preventDefault()` + toast, **no navigation**.
- `valid === true` → attributes removed; hrefs set:
  - **email:** `mailto:${CONTACT_EMAIL}?subject=…&body=${encodeURIComponent(buildRequestSummary("email"))}`
  - **whatsapp:** `whatsappLink(buildRequestSummary("whatsapp"))` → `https://wa.me/<num>?text=…`

So the booking CTAs require **both dates chosen (a valid `ok` estimate) AND at
least one tenant name**. Server-side (🔜) requires a JWT, `propertyId`, and ISO
`startDate`; tenant names are optional there (stored, truncated to 800 chars).

### 5.5.5 Server validation order (🔜, for parity reference)

`request-booking` (`index.ts:146`) validates in this order; first failure wins:

| Step | Check | Failure |
| --- | --- | --- |
| 1 | valid JWT, user not deactivated | 401 `unauthorized` |
| 2 | `propertyId` + ISO `startDate` present | 400 `bad_request` |
| 3 | property exists **and** published | 404 `not_found` |
| 4 | resolve `bookingEnd` (from `endDate`, else `addMonthsMinusDay(start, months∈[1,11])`); `bookingEnd > startDate` | 400 `bad_request` |
| 5 | `billedMonths ≤ min(11, max_stay_months)` | 400 `max_stay` |
| 6 | `billedMonths ≥ max(1, min_stay_months)` | 400 `min_stay` |
| 7 | `startDate ≥ today` and `startDate ≥ available_from` | 409 `dates_unavailable` |
| 8 | no overlapping block (🐞 §5.4.4 — does not exclude expired holds) | 409 `dates_unavailable` |
| 9 | insert `booking_requests` row (before email) | 500 `server_error` on insert fail; email failure never fails the request |

Response on success: `{ ok:true, emailed:<bool>, emailError?:<code> }`.

---

## 5.6 Parity summary

| Aspect | Client (✅) | Server (🔜) | Parity |
| --- | --- | --- | --- |
| `billedMonths` | identical algorithm | identical algorithm | ✅ match |
| rent = months × price | yes | yes | ✅ |
| commission = min(15%×rent, price) | yes | yes | ✅ value match |
| commission **presentation** | raw + discount line | net only | intended divergence (display) |
| deposit | `depositAmount \|\| 0` | `deposit_amount \|\| 0` | ✅ |
| total | rent + capped comm + deposit | same | ✅ |
| overlap bounds | grid exclusive / estimate inclusive | inclusive | ⚠️ grid vs estimate differ (§5.2.1) |
| expired holds in overlap | excluded (client drops them) | **NOT excluded** | 🐞 divergence (§5.4.4) |
| max stay | 11 / `min(11,max_stay)` | `min(11,max_stay)` | ✅ |
