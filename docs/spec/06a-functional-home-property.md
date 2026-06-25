# Ebrostay Reconstruction Spec — §6a Functional Spec: Home & Property Pages

> Baseline: as-built (branch `main`, 2026-06-25). Status tags: ✅ active · 🔜 planned/unwired · 🗑️ dormant-to-remove · 🐞 suspected bug · 🚫 out-of-scope (MVP).

This section specifies the two public-facing tenant pages — the **Home / marketplace**
(`index.html` + `site.js`, progressively enhanced by `enhance.js`) and the
**Property detail** page (`property.html` + `property.js` + `gallery.js`, enhanced by
`enhance.js`) — plus the three **static pages** (`about.html`, `privacy.html`,
`404.html`). Pricing and filter **formulas** are referenced here but defined in
**§5 Business rules**; this section documents the **UI** (controls, states, copy,
actions). Booking is the **client-side mailto/WhatsApp MVP** — there is no Stripe and no
online payment (decision baked in §11). Data/field semantics live in **§4**;
i18n/theme/SEO conventions in **§9**.

**Conventions used below**
- All visible strings carry a `data-i18n` key (textContent) or `data-i18n-attr`
  (`attr:key`) and resolve through the ES/EN dictionary in `data.js` via
  `t(key) = translations[lang][key] || translations.es[key] || key`. Default language
  is `localStorage[ebrostay-language]` or browser language (es if `navigator.language`
  starts `es`, else en).
- "Backend configured" means `EbrostayBackend.isConfigured()` is true (Supabase keys
  present). When not configured the site runs on sample data from `data.js` with
  mailto fallbacks (graceful degradation — §3).

---

## 6a.1 HOME (`index.html` / `site.js`)

### 6a.1.1 Layout (regions, top → bottom)

| Region | Container | Owner | Notes |
| --- | --- | --- | --- |
| Header | `header.site-header` | static + `enhance.js` | Brand, language switch, "Mi cuenta", "Buscar vivienda" CTA; enhance.js adds theme toggle, audience switch, saved-flats link, support FAB. |
| Hero + hero search | `section.hero` / `form#heroSearch` | static / `site.js` | Kicker, H1, copy, 4-field search, trust row. |
| Owner panel (audience=owner) | `.audience-owner-panel` | `enhance.js` | Injected after hero search; shown only in owner mode. |
| Marketplace | `section.marketplace#search` | static / `site.js` | Toolbar (status + sort), filter toggle, 3-column layout. |
| ↳ Filter panel | `aside.filter-panel` / `form#availabilityFilter` | static + `enhance.js` | City, dates, guests, type, budget, amenities; enhance.js injects address/min-beds/min-baths. |
| ↳ Results column | `section.results-column` | `site.js` | Quick filters + `#propertyGrid` (cards). |
| ↳ Map panel | `aside.map-panel` | `site.js` | Leaflet `#listingsMap`, hidden Google `#googleMap` iframe fallback, address buttons. |
| Value band "why" | `section.value-band#why` | static | Marketing; one card carries a "Próximamente" badge (booking). |
| Split band | `section.split-band` | static | Tenant vs owner cards. |
| How-it-works | `section.how-section#how` | static | 3 steps. |
| Contact | `section.contact-section#contact` / `form#inquiryForm` | static / `site.js` | Inquiry form + WhatsApp CTA. |
| Owner view | `div#ownerView` (`#owner` … `#owner-apply`) | static | Owner pitch, compare table, features, 3 steps, owner lead form `#ownerForm`. |
| Footer | `footer.site-footer` | static | Brand, footer nav, email. |
| Auth dialog | `dialog#authDialog` | `site.js` | Modal; sign-in/up/reset/recover + SSO + success panel. |

`marketplace-layout` is a 3-column grid (filter / results / map) collapsing to stacked on
mobile, where the filter panel becomes a toggle (`#filterToggle` adds `.is-open`).

### 6a.1.2 Controls

#### Hero search — `form#heroSearch`
| Control | id / name | Type | Default | Validation |
| --- | --- | --- | --- | --- |
| City | `name=city` | `select` | `Zaragoza` (only option) | — |
| Check-in | `name=checkIn` | text → flatpickr | today (`defaultStayRange`) | `minDate=today`; sets check-out `minDate` on change |
| Check-out | `name=checkOut` | text → flatpickr | today + 1 month | `minDate` ≥ check-in |
| Guests | `name=guestCount` | `number` | `2` | `min=1 max=8` |
| Submit | — | submit | — | Copies values to filter panel (see Actions) |

Flatpickr: `dateFormat Y-m-d`, `altInput` (`altFormat j M Y`), `disableMobile`, locale es
when language es. If flatpickr is absent, inputs degrade to plain text.

#### Filter panel — `form#availabilityFilter`
| Control | id / name | Type | Default | Validation / options |
| --- | --- | --- | --- | --- |
| City | `#cityFilter` `name=city` | select | `Zaragoza` | only Zaragoza |
| Check-in | `#checkIn` `name=checkIn` | flatpickr | today | `minDate=today` |
| Check-out | `#checkOut` `name=checkOut` | flatpickr | today+1mo | `minDate` ≥ check-in; **check-out ≤ check-in → `status.invalid`, no search** (R-Home-4) |
| Guests | `#guestCount` `name=guestCount` | number | `2` | `min=1 max=8` |
| Type | `#propertyType` `name=propertyType` | select | `all` | `all`/`apartment`/`room`/`home` |
| Budget | `#maxBudget` `name=maxBudget` | number | empty (= no limit) | `min=0 step=1`, placeholder `filters.anyBudget` |
| Amenities | `name=amenities` (checkbox group) | checkbox ×6 | none | `wifi`,`desk`,`lift`,`ac`,`washer`,`parking` (AND) |
| Apply | — | submit | — | runs filtered render |
| Reset | `#resetAvailability` | button | — | clears all filters/quick/enhanced |
| **Address** 🔧 | `#addressQuery` `name=addressQuery` | search | empty | `enhance.js`-injected; substring over name/area/address/city/description |
| **Min bedrooms** 🔧 | `#minBedrooms` `name=minBedrooms` | select | `0` (Any) | `0/1+/2+/3+/4+` |
| **Min bathrooms** 🔧 | `#minBathrooms` `name=minBathrooms` | select | `0` (Any) | `0/1+/2+/3+` |

🔧 = injected by `enhance.js`. The sort `<select id="sortBy">` lives in the toolbar but is
`form="availabilityFilter"` so it is read by the filter form.

#### Sort — `#sortBy`
| Value | Label key | Order |
| --- | --- | --- |
| `best` (default) | `filters.sortBest` | rating desc, then price asc |
| `price` | `filters.sortPrice` | price asc |
| `new` | `filters.sortNew` | isNew desc, then price asc |

Changing it calls `renderProperties()` immediately. (Formulas: §5.)

#### Quick filters — `.quick-filters [data-quick]`
| Button | `data-quick` | Predicate | Label key |
| --- | --- | --- | --- |
| Verificadas | `checked` | `property.checked` | `quick.verified` |
| Gastos incluidos | `bills` | `billsPolicyOf(property)==='included'` | `quick.bills` |
| Fianza reembolsable | `deposit` | `property.depositProtected` | `quick.deposit` |
| **Ver guardados** 🔧 🚫 out-of-scope (MVP) | (`.saved-quick-filter`, `data-saved-flats-link`) | `favorites.has(id)` | `filtersSaved` |

> 🚫 **Out of scope for MVP (removed 2026-06-25).** The favorites / saved-homes feature (heart toggle, saved-only filter, `favorites` table sync, header *Guardados* link) has been removed from the MVP build. This section documents the deferred design only; none of it is wired in the current build.

Toggling sets `.is-active` + `aria-pressed`, marks `mapNeedsFit=true`, re-renders.
Multiple quick filters combine with AND. Saved-only is mirrored to
`localStorage[ebrostay-saved-only]` and to the header saved link.

#### Map panel controls
| Control | Selector | Action |
| --- | --- | --- |
| Address buttons | `[data-map-address]` (`pedro`, `movera`) | `focusMap(key)` → pans Leaflet (or swaps Google iframe `src`), sets `.is-active` |

#### Contact (inquiry) form — `form#inquiryForm`
| Field | name | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| Name | `name` | text (`autocomplete=name`) | yes | falls back to "Guest" if blank |
| Email | `email` | email | yes | — |
| Property/zona | `property` | text | no | placeholder `form.propertyPlaceholder`; prefilled by card "Solicitar" |
| Message | `message` | textarea (rows 5) | no | placeholder `form.messagePlaceholder` |
| Submit | — | submit | — | `form.button` |
| Note | `.form-note` | — | — | `form.note`; becomes success/error after submit |

`#ownerForm` (owner lead) mirrors this with extra `phone`, `units`, `city` fields and
submits the same way (sendInquiry / mailto). Both share the WhatsApp CTA
(`wa.me/34678715418`).

#### Header / audience / theme (injected by `enhance.js`)
| Control | Selector | States | Action |
| --- | --- | --- | --- |
| Language | `.language-option[data-lang]` (es/en) | one `.is-active` | `applyLanguage()` re-translates + re-renders |
| Theme toggle | `.theme-toggle` | moon/sun icon | toggles `html[data-theme=dark]`, persists `ebrostay-theme` |
| Audience switch | `.audience-switch--compact [data-audience-option=tenant|owner]` | `role=radio`, `.is-active`, `aria-checked` | sets `html[data-audience]`; owner mode hides `.hero-search`+`.marketplace`, shows `.audience-owner-panel`; persists `ebrostay-audience` |
| Saved-flats link 🚫 out-of-scope (MVP) | `.saved-flats-link [data-saved-flats-link]` | `.is-active` + count | toggles saved-only; href `#search` (home) or `index.html#saved` |
| Mi cuenta | `.admin-link[href=account.html]` | hidden in owner mode | navigates to account page |
| Buscar vivienda CTA | `.nav-cta` | tenant: `nav.cta`→`#search`; owner: `ownerNavCta`→`index.html#owner-apply` (or `ownerNavDashboard`→`partner.html` on portal) | navigation |
| Support FAB | `.support-fab` / `.support-panel` | open/closed | opens WhatsApp with prefilled help text |

### 6a.1.3 Card anatomy — `article.property-card[data-property-id]`

| Element | Selector / class | Content | Action |
| --- | --- | --- | --- |
| Media link | `a.property-media.property-{addressKey}` | first photo as bg (gradient overlay), `aria-label`=name | → `property.html?id={id}` |
| Availability pill | `.availability-pill` | `listing.available` | — |
| Favorite heart 🚫 out-of-scope (MVP) | `button.favorite-button[data-favorite={id}]` | label `listing.favorite` / `listing.saved`; `.is-active` when saved | toggles favorite (persist + DB sync), re-renders |
| Kicker | `.section-kicker` | `type.{type} - {areaKey}` | — |
| Title | `h3 > a.property-title-link` | name | → detail |
| Price | `.property-price strong` + `.price-note` | `listing.price` (`{price}/mes`) + optional `priceNoteKey` | — |
| Description | `<p>` | stripped rich-text of `copyKey` | — |
| Badges | `.property-badges span` | from `badgeList()`: `badge.checked`, `badge.deposit`, bills badge | — |
| Specs/meta | `.property-meta span` | `propertySpecs()` (beds/baths/m²…), capacity, rating, "from {date}" | — |
| Amenities | `.amenity-list span` | `amenity.{key}` per amenity | — |
| **View** | `a.details-button` | `listing.view` | → `property.html?id={id}` |
| **Map** | `button[data-map-focus={id}]` | `listing.map` | `focusProperty()` → pans map, opens popup, scrolls map into view |
| **Request** | `button.request-button[data-request={id}]` | `listing.request` | `requestProperty()` → prefills contact form property+message, scrolls to `#contact` |
| **Book** | `a.button.primary` | `listing.book` | → `property.html?id={id}#book` |

Hovering a card emphasizes its map pin (`setPinEmphasis`); clicking a pin highlights the
card (`highlightCard` adds `.is-map-highlight` for 3.2s and scrolls it into view) — the
marker↔card link is two-way (R-Home-10).

### 6a.1.4 Map panel behavior
- **Leaflet** (`#listingsMap`): OSM tiles, `scrollWheelZoom:false`, initial view
  `[41.6516,-0.865] z12`. One `divIcon` price pin per filtered property (label =
  `formatPrice` with `€`); co-located addresses stack via `--pin-stack`. On
  filter/sort change `mapNeedsFit=true` → `fitBounds` (padding 42, maxZoom 15). Marker
  popup shows name, area, price. Marker click → `highlightCard`.
- **Google fallback**: if `L` is undefined, `#listingsMap` is hidden and the `#googleMap`
  iframe is shown with `mapSources.pedro`; address buttons swap `src`.
- The **filtered list is the single source of truth** for cards, the count, and markers
  (R-Home-1).

### 6a.1.5 States

| State | Trigger | UI |
| --- | --- | --- |
| Default | no filter, no quick, no enhanced | status `status.all` ({count} of all); all cards + pins |
| Filtered | Apply / hero submit | status `status.matches`/`status.one`; subset of cards + auto-fit map |
| Saved-only 🚫 out-of-scope (MVP) | saved toggle on | status `status.saved`/`status.savedOne`/`status.savedNone`; only favorited cards |
| Invalid dates | check-out ≤ check-in | status `status.invalid`, search **not** re-run (R-Home-4) |
| Empty | 0 matches | `.empty-state` with `empty.title`/`empty.body`, Contact + WhatsApp CTAs; **all pins cleared** (R-Home-8) |
| Loading | backend fetching properties | sample/last list shown; on `onPropertiesLoaded` → `mapNeedsFit=true`, re-render |
| Inquiry success | sendInquiry ok | `.form-note` = `form.sent`, `.is-success`, form reset, umami `inquiry-sent` |
| Inquiry error | sendInquiry fail | `.form-note` = `form.errorSend`, `.is-error` |
| Inquiry (no backend) | not configured | opens `mailto:info@ebrostay.com` with prefilled subject/body |

### 6a.1.6 Auth dialog — `dialog#authDialog` (`site.js`)

Four modes (`AUTH_MODES`), driven by `setAuthMode()`:

| Mode | Title key | Submit key | Email | Password (autocomplete) | Tabs | Forgot | SSO |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `signin` (default) | `auth.title` | `auth.signin` | ✓ | ✓ (current-password) | ✓ | ✓ | ✓ |
| `signup` | `auth.signupTitle` | `auth.signup` | ✓ | ✓ (new-password) | ✓ | — | ✓ |
| `reset` (forgot) | `auth.resetTitle` | `auth.resetSend` | ✓ | — | ✓ | — | — |
| `recover` (from email link) | `auth.recoverTitle` | `auth.recoverSave` | — | ✓ (new-password) | — | — | — |

Controls: email (`minlength` n/a), password (`minlength=6`), `#authMessage` (status),
tabs `#authTabs [data-auth-mode]`, `#authForgot`, `#authClose`, SSO block `#authProviders`
(Google `data-provider=google`, Outlook/Azure `data-provider=azure` — each `hidden` until
`getEnabledProviders()` reports it enabled).

Submit actions: `signup`→`signUp()` (on `needsConfirmation` show success
`auth.successEmailTitle`/`auth.successConfirmCopy`; else close); `reset`→`resetPassword()`
(success `auth.successResetCopy`); `recover`→`updatePassword()` (success
`auth.successRecoverTitle`); `signin`→`signIn()` (close on success). Errors set
`#authMessage` `.is-error` with `auth.signupError`/`auth.resetError`/`auth.recoverError`/
`auth.error`. SSO buttons call `signInWithProvider(provider)`. Success panel
`#authSuccess` shows a check icon + dynamic title/copy + close.

The dialog opens automatically when the URL hash is `#login`, `#auth`, or `#authDialog`
(then the hash is stripped). `onPasswordRecovery` (Supabase recovery link) opens it in
`recover` mode.

**🐞/🗑️ Auth-chip header is dormant on Home.** `site.js` queries `#authButton`,
`#userChip`, `#userEmail`, `#logoutButton`, `#adminLink` and `updateAuthUI()` toggles
them, **but none of these ids exist in `index.html` (static) and `enhance.js` does not
inject them** — so the visible "Sign in" button, signed-in chip, logout, and admin link
never render on the home page. The only account entry point is the static
`.admin-link[href=account.html]` ("Mi cuenta"); the auth dialog is reachable only via the
`#login`/`#auth` hash or a recovery link. A faithful rebuild should either add these
header elements or remove the dead `updateAuthUI` wiring. (Cross-check §8/§10.)

### 6a.1.7 Actions (buttons/links → target)

| Trigger | Handler | Effect |
| --- | --- | --- |
| Hero submit | `heroSearch.submit` | copy city/dates/guests to filter panel; persist `ebrostay-search-dates`; `umami search{source:hero}`; scroll to `#search`; render |
| Filter Apply | `availabilityFilter.submit` | validate dates; build `activeFilter`; persist search dates; `umami search{source:filters}`; collapse mobile panel; render |
| Filter Reset | `#resetAvailability` | clear `activeFilter`/quick/enhanced; reset form to Zaragoza/2 guests; clear pickers; render |
| Sort change | `#sortBy` | render |
| Quick filter | `[data-quick]` | toggle set; render |
| Favorite 🚫 out-of-scope (MVP) | `[data-favorite]` | toggle in `favorites`; persist `ebrostay-favorites`; if signed in `saveFavorite()`; render |
| Card Map | `[data-map-focus]` | `focusProperty()` |
| Card Request | `[data-request]` | prefill `#contact`, scroll |
| Card View/Book | `<a>` | navigate to detail (Book appends `#book`) |
| Contact submit | `#inquiryForm` | sendInquiry (or mailto) |
| Language | `[data-lang]` | `applyLanguage()` |

### 6a.1.8 Key copy (ES / EN keys)
`hero.kicker/title/copy`, `hero.trust1..3`, `search.city/moveIn/moveOut/guests/button`,
`market.kicker/title`, `filters.*` (city, checkIn, checkOut, guests, type[All|Apartment|
Room|Home], budget, anyBudget, mustHave, sort[Best|Price|New], apply, reset, show),
`amenity.{wifi|desk|lift|ac|washer|parking}`, `quick.{verified|bills|deposit}`,
`listing.{available|favorite|saved|price|capacity|rating|from|view|map|request|book}`,
`badge.{checked|deposit}`, `status.{all|matches|one|none|invalid|saved|savedOne|savedNone|
savedEmpty}`, `empty.{title|body|contact|whatsapp}`, `map.{title|copy|pedro|movera}`,
`form.{name|email|property|message|button|note|sent|errorSend|propertyPlaceholder|
messagePlaceholder}`, `auth.*`, `nav.{home|how|owners|about|privacy|cta|contact}`,
`bookings.button` ("Mi cuenta"). Enhanced/owner/support keys live in `enhance.js`'s own
dictionary (`filtersSaved`, `filtersAddress`, `filtersBedrooms`, `filtersBathrooms`,
`owner*`, `assistant*`).

### 6a.1.9 localStorage keys (Home)
`ebrostay-language`, `ebrostay-theme`, `ebrostay-favorites` (JSON id array),
`ebrostay-search-dates` (`{checkIn,checkOut,guests}`), `ebrostay-saved-only`,
`ebrostay-audience`, `ebrostay-audience-seen`, `ebrostay-return-to` (post-login redirect,
30-min TTL).

---

## 6a.2 PROPERTY DETAIL (`property.html` / `property.js`)

Loaded by query `?id=`. `boot()` finds the property in `properties`; if absent →
not-found state. Optional `?from`/`?to`/`guests` deep-link the booking widget.

### 6a.2.1 Layout
| Region | Selector | Notes |
| --- | --- | --- |
| Not-found | `#detailNotFound` (hidden) | shown for unknown/unpublished id |
| Main wrap | `#detailMain` | hidden when not-found |
| Back link | `.detail-back` | → `index.html#search` |
| Media | `#detailMedia` + `#detailGallery` | gallery + thumbnails; enhance.js adds media tabs + lightbox |
| Content `<article>` | `.detail-content` | kicker, name, copy, badges, meta, About, Amenities, Conditions, Availability calendar, Floor plans, Location map |
| Aside (sticky) | `.detail-aside` / `#book` | price, share, move-in box, booking widget, request CTAs, video CTA, note |
| Footer | `.site-footer` | shared |

### 6a.2.2 Controls

#### Booking widget — `#bookingWidget` (hidden until flatpickr loads)
| Control | id | Type | Default | Validation |
| --- | --- | --- | --- | --- |
| Start | `#bookingStart` | flatpickr | preselected from search/URL if valid | `minDate = max(today, available_from)`; disabled = blocked ranges |
| End | `#bookingEnd` | flatpickr | start + min-stay | `minDate = start + min_stay`; `maxDate = min(start+min(11,max_stay), day before next block)` |
| Tenants | `#bookingTenants` | textarea (rows 2) | empty | one name/line; **≥1 required** to enable CTAs |
| Min-stay note | `#bookingMinStay` | text (hidden) | — | shown when `min_stay > 1` (`book.minStay`) |
| Split note | `#bookingSplit` | text (hidden) | — | shows `book.rangeUnavailable` (conflict) or `book.splitNote` (>11mo) |
| Summary | `#bookingSummary` (`<ul>`) | live | — | rendered from estimate |
| VAT tip | `#bookingVatTip` | text | — | `book.vatExempt` (tenants present) / `book.vatCompany` |

Date pickers: `dateFormat Y-m-d`, `altInput`/`altFormat j M Y`, `disable` = blocked
ranges, locale es when language es. Changing start re-derives end min/max and bumps end if
needed.

#### Request CTAs (outside the widget, always present)
| Control | id | Disabled-until-valid | Action |
| --- | --- | --- | --- |
| Solicitar por email | `#bookingEmailButton` | `aria-disabled`/`.is-disabled` until payload valid | `mailto:info@ebrostay.com` with subject `request.emailSubject – {name}` + branded body |
| Solicitar por WhatsApp | `#bookingWhatsappButton` | same | `wa.me/34678715418?text=` branded summary (`*bold*` header/total) |
| Ver vídeo | `#detailVideoButton` | **hidden when no `video_url`** | opens `video_url` in new tab (`rel=noopener`); href removed entirely when absent |
| Compartir | `#shareButton` | — | `navigator.share` or clipboard copy of deep link (`?id&from&to&guests`); toast `share.copied` |

`buildRequestPayload().valid` is true only when the estimate status is `ok` **and** ≥1
tenant. While invalid, clicking a CTA is blocked and shows toast `request.missingFields`;
the href is stripped. On valid click, `umami booking-request{property,channel}` fires.

#### Conditions table — `#detailConditions` (rendered if any row present)
Rows (label key → value), each only if the field is set: `cond.minStay`, `cond.maxStay`
(stay = months, `cond.month`/`cond.months`), `cond.deposit`, `cond.upfront`,
`cond.utilities`, `cond.energy`, `cond.beds`, `cond.pets`/`cond.smoking`/`cond.couples`
(`common.yes`/`common.no`), `cond.selfCheckin`.

#### Move-in cost box — `#detailMoveIn` (hidden unless ≥1 row)
Itemizes `movein.upfront` (upfront rent) + `movein.deposit`; shows `movein.total` when
both present. (Box = upfront + deposit, R-Prop-3.)

#### Availability calendar — `#detailCalendar` (inline flatpickr)
`inline`, `showMonths` 2 (≥720px) / 1 (mobile), localized; `minDate = max(today,
available_from)`; `disable` = blocked ranges; `onDayCreate` adds `.is-booked`
(struck-through) to blocked days; selection is immediately cleared (read-only display).
Legend `cal.legend`.

#### Floor plans — `#floorplanSection` / `#floorplanImages` (hidden if none)
Each plan is a `button.floorplan-link` with `<img>`; click toggles `.is-zoomed`
(in-place zoom, `aria-pressed`), not a new tab.

#### Media tabs (injected by `enhance.js`) — `.detail-media-tabs`
| Tab | data attr | Action |
| --- | --- | --- |
| Fotos | `data-media-photos` | open lightbox at index 0 |
| Plano | `data-media-floorplan` | scroll to `#floorplanSection`; hidden when that section is hidden |
| Vídeo | `data-media-video` | mirrors `#detailVideoButton`: hidden when no video; else opens `video_url` (listens for `ebrostay:video-cta-updated`) |
| Compartir | `data-media-share` | proxies `#shareButton` |

#### Gallery / lightbox (`gallery.js` + enhance.js)
Swipeable carousel built from `property.photos`; thumbnail strip `#detailGallery` doubles
as nav; click/double-click opens the `.gallery-lightbox` overlay (prev/next, Esc/arrow
keys, click-outside to close). Exposed as `window.__ebroGallery`.

#### Location map — `#detailMap` (Leaflet)
OSM tiles, `scrollWheelZoom:false`, view `[lat,lng] z15`, single price pin. Address line
`#detailAddress` shown only when `property.address` is set ("{address}, Zaragoza").

### 6a.2.3 Estimate states (live pricing — client-side MVP, R-Prop-5/-6)
`computeEstimate(start,end)` (formula in §5) returns a status that drives the summary:

| Status | Trigger | UI |
| --- | --- | --- |
| `empty` | missing/invalid dates | summary cleared; no VAT tip |
| `conflict` | range overlaps a block | `#bookingSplit` = `book.rangeUnavailable`; CTAs href stripped |
| `toolong` | > 11 billed months | `#bookingSplit` = `book.splitNote` (two-contract message) |
| `ok` | valid range | summary rows: stay range, rent (`book.rent` + months), commission (`book.commission`), optional commission-discount line (when capped, `book.commissionDiscount`), optional deposit (`cond.deposit`), total (`book.estimateTotal`); VAT tip |

Constants used by the UI: `MAX_STAY_MONTHS = 11`, `COMMISSION_PCT = 0.15`, commission
capped at one month's rent (excess shown as a discount line). All euro amounts via
`formatPrice` (locale-aware).

### 6a.2.4 Page-level states
| State | Trigger | UI |
| --- | --- | --- |
| Loading | backend configured | `await EbrostayBackend.init({})` before lookup |
| Default | id found | full detail rendered; SEO/JSON-LD updated per property |
| Not-found | unknown/unpublished id | `#detailMain` hidden, `#detailNotFound` shown: `notfound.title`/`notfound.copy` + "Ver viviendas disponibles" (`index.html#search`) + WhatsApp help (`notfound.whatsappText`); language switch still works; HTTP 200, **no redirect** (R-Prop-1) |
| Booking widget unavailable | flatpickr absent | widget hidden; request CTAs still work (manual message) |
| `#book` deep-link | hash `#book` (from card "Reservar") | `scrollToBooking()` scrolls booking card into view and focuses its heading |

### 6a.2.5 Key copy (ES / EN keys)
`detail.{back|about|amenities|conditions|blocked|blockedCopy|floorplan|floorplanCopy|
floorplanZoom|location|locationCopy|addressLabel|emailButton|whatsappButton|video}`,
`book.{title|start|end|tenants|tenantsPlaceholder|note|stay|rent|commission|
commissionDiscount|estimateTotal|minStay|months|splitNote|rangeUnavailable|vatExempt|
vatCompany}`, `movein.{title|upfront|deposit|total}`, `cond.*`, `common.{yes|no}`,
`cal.legend`, `request.{summaryHeader|summaryFooter|propertyLabel|areaLabel|priceLabel|
estimateLabel|tenantsLabel|emailSubject|missingFields}`, `share.{button|text|copied}`,
`notfound.{title|copy|listings|whatsapp|whatsappText}`, `listing.*` (shared).

### 6a.2.6 localStorage keys (Property)
Reads `ebrostay-language`, `ebrostay-theme`, `ebrostay-search-dates` (booking prefill),
`ebrostay-saved-only`; writes `ebrostay-language`. Share/prefill also honor URL
`?from`/`?to`/`guests`.

---

## 6a.3 STATIC PAGES

### 6a.3.1 About — `about.html`
Marketing page, fully static markup translated by an inline `applyLanguage` script
(same `data-i18n`/`data-i18n-attr` mechanism; title key `meta.about.title`). Sections, in
order: **Intro** (`about.kicker/title/lead`); **Mission & vision** value cards
(`about.visionLabel/Copy`, `about.missionLabel/Copy`); **The bridge** narrative
(`about.bridgeKicker/Title/Lead/Lead2` — explains the logo/Ebro-river bridge);
**Split band** for companies vs owners (`about.bizTag/Title/Copy/biz1..3`,
`about.ownerTag/Title/Copy/owner1..3`); **First principles** value grid
(`about.fpKicker/Title/Lead`, `about.fp1t..fp4t`/`fp1c..fp4c`); **Roots → Europe** CTA
band (`about.rootsKicker/ctaTitle/ctaCopy` + buttons `about.ctaFind`/`ctaList`/
`nav.contact`). All CTAs link to `index.html#search`, `index.html#owner`,
`index.html#contact`. Header/footer identical to Home (no auth, no marketplace JS). Loads
`data.js` + `enhance.js` + lucide.

### 6a.3.2 Privacy — `privacy.html`
Static legal page with **two pre-translated blocks** (`[data-lang-content=es]` shown,
`[data-lang-content=en]` hidden) rather than `data-i18n` keys — language toggling for
these blocks is not wired in the inline script (only `#year` is set). Sections (ES + EN):
**Responsable/Controller**, **Qué datos / What data** (account, booking requests — notes
no online payment, contact form, Umami cookieless analytics), **Cookies & local storage**
(language, favorites, session), **Conservación / Retention** (Supabase + GitHub Pages),
**Tus derechos / Your rights** (access/rectification/erasure/objection/portability;
account deactivation; AEPD), **Aviso legal / Legal notice** (prices include monthly rent,
deposit refundable). "Volver al inicio" → `index.html`.
🐞 The static ES/EN blocks do not respond to the language switch (no toggle logic);
the EN block is reachable only by removing the `hidden` attribute manually.

### 6a.3.3 404 — `404.html`
Self-contained fallback (inline styles, no shared CSS). `<meta http-equiv="refresh"
content="3; url=/">` auto-redirects to `/` after 3s; `<meta robots=noindex>`. Bilingual
inline copy ("Esta página no existe." / "Taking you to the home page…") + link to
`ebrostay.com`. Theme bootstrap script + lucide + `enhance.js` load but there is no
`data.js` i18n. Serves as the GitHub Pages 404.

---

*Cross-references:* pricing/filter/sort/availability formulas → **§5**; field semantics
and `bills_policy`/`deposit_protected` → **§4**; auth/RLS and the dormant auth-chip
security note → **§8**; i18n/theme/SEO/JSON-LD conventions → **§9**; testable ACs
(R-Home-*, R-Prop-*) → **§10**.
