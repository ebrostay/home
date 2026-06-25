# Ebrostay Reconstruction Spec — §6b Functional Spec: Account, Owner & Admin

> Baseline: as-built (branch `main`, 2026-06-25). Status tags: ✅ active · 🔜 planned/unwired · 🗑️ dormant-to-remove · 🐞 suspected bug · 🚫 out-of-scope (MVP).

This section documents every authenticated/admin-facing page: the tenant
**Account** (`account.html`), the **Owner/Partner** portal (`partner.html`), the
**Admin** panel (`admin.html`), the **Admin property editor**
(`admin-property.html`), and the 🗑️ dormant **Booking detail** (`booking.html`).
All five share a common shell — header with ES/EN language switch, theme bootstrap
inline script, footer nav, and the standard script stack (`supabase-js`,
`supabase-config.js`, `data.js`, `backend.js`, page script, `lucide`, `enhance.js`).
All five carry `<meta name="robots" content="noindex,nofollow">`.

> **Access-control reminder (applies to every page below).** The JavaScript role
> gates (`getIsAdmin()`, `getIsOwner()`, the `isAdmin` arg passed to
> `onAuthChanged`) are **cosmetic** — they only decide which DOM to show. The real
> boundary is **Postgres RLS** plus the `security definer` RPCs, enforced
> server-side regardless of what the client renders (see §8). A hidden control is
> not a protected control; a non-admin who calls the REST/RPC endpoint directly is
> rejected by the database, not by the JS.

---

## 6b.1 ACCOUNT — `account.html` / `account.js`

Tenant self-service: see your stays, sign out, deactivate your account.

### Layout

```
header (brand · ES/EN · "Mi cuenta" link · "Buscar vivienda" CTA)
main.account-page
  ← "Volver al sitio" back link
  §accountLoading        (spinner copy, shown first)
  §signedOutPanel [hidden]   kicker · h1 · copy · "Entrar" button
  §accountPanel    [hidden]
     kicker "Mi cuenta" · h1 "Mis reservas" · #accountEmail
     copy
     ul#bookingsList  (paid 🗑️ + assigned ✅ cards)
     §account-actions  h2 + [Salir] [Desactivar mi cuenta]
footer
```

### Controls

| Control | id | Type | Default / state | Notes |
| --- | --- | --- | --- | --- |
| Language ES/EN | `[data-lang]` | buttons | from `localStorage[ebrostay-language]` → `es` | re-renders `[data-i18n]`, re-renders bookings |
| Account email | `#accountEmail` | text span | empty | set to `user.email` |
| Bookings list | `#bookingsList` | `<ul>` | loading placeholder | rendered by `renderBookings()` |
| Logout | `#logoutButton` | button | label `auth.logout` | |
| Deactivate | `#deleteAccountButton` | button (`.danger`) | label `account.deactivate` | two-click arm via `dataset.armed` |

No free-text inputs on this page; nothing to validate.

### States

| State | Trigger | What renders |
| --- | --- | --- |
| Loading | initial; before first auth event | `#accountLoading` visible, both panels hidden |
| Backend not configured | `isConfigured()` false | `showPanel(null)` → signed-out panel |
| Signed-out | `onAuthChanged(null)` | `#signedOutPanel`: "Inicia sesión para ver tus reservas." + "Entrar" → `index.html#authDialog` |
| Signed-in (loading list) | user present | `#accountPanel` shown; list shows `account.loading` placeholder |
| Empty | both lists empty | one `<li class="bookings-empty">` with `bookings.empty` |
| Error | `loadMyBookings()` returns `null` (both queries failed) | `<li class="bookings-empty">` with `bookings.error` |
| Success | lists returned | paid cards then assigned cards |

### Actions

- **`loadAccount(user)`** → `EbrostayBackend.loadMyBookings()` returns
  `{ paid, assigned }`:
  - **`paid` 🗑️ dormant-to-remove** — read from the `bookings` table
    (`user_id = auth.uid()`). Rendered as `booking-card` **links** to
    `booking.html?id=…` (the 🗑️ detail page), showing `bookings.paidLabel`, dates,
    `months`, `formatPrice(amount_eur)`, and a "view details" CTA. Part of the
    removed Stripe path — should be deleted along with the table and `booking.html`.
  - **`assigned` ✅ active** — read from `availability_blocks` where
    `user_id = auth.uid()`. Rendered as **non-clickable** cards (`<span>`, not `<a>`)
    with `bookings.assignedLabel`, property name, optional address, and the
    `start_date – end_date` range. This is the real "my stays" feature.
- **Logout** → `signOut()` then `window.location.href = "index.html"`.
- **Deactivate (two-click)**:
  1. First click: `dataset.armed = "yes"`, label swaps to
     `account.deactivateConfirm` ("¿Seguro? Pulsa de nuevo").
  2. Second click: `deactivateAccount()` → RPC `deactivate_my_account()` (sets
     `deactivated_at`, bans the auth user, signs out). On success →
     `index.html`. On error: disarm, label → `account.deactivateError`.
  - Re-rendering language while armed preserves the confirm label (guarded by
    `dataset.armed !== "yes"`).

### Access control

- Tenant-only content; gated by session presence (`onAuthChanged`). No admin/owner
  role needed. Client gate cosmetic; RLS scopes `bookings`/`availability_blocks`
  reads to `user_id = auth.uid()` and `deactivate_my_account()` is
  authenticated-only (§8).

### Copy (keys)

| Key | ES |
| --- | --- |
| `meta.account.title` | Ebrostay \| Mi cuenta |
| `account.title` | Mi cuenta |
| `account.signedOutTitle` | Inicia sesión para ver tus reservas. |
| `account.signedOutCopy` | Tus estancias pagadas y asignadas… aparecen aquí cuando entras con tu cuenta. |
| `auth.login` | Entrar |
| `bookings.title` | Mis reservas |
| `bookings.copy` | Las estancias confirmadas con tu cuenta aparecen aquí. |
| `bookings.paidLabel` 🗑️ | (paid badge) |
| `bookings.assignedLabel` ✅ | (assigned badge) |
| `bookings.viewDetails` 🗑️ | Ver detalles |
| `bookings.empty` | (empty list) |
| `bookings.error` | (load error) |
| `account.sessionTitle` | Sesión y cuenta |
| `auth.logout` | Salir |
| `account.deactivate` | Desactivar mi cuenta |
| `account.deactivateConfirm` | (confirm prompt) |
| `account.deactivateError` | (error) |
| `account.loading` | Cargando tu cuenta… |

---

## 6b.2 OWNER / PARTNER — `partner.html` / `partner.js`

Owner portal: portfolio metrics, property list, and bank/IBAN payout details.

### Layout

```
header
main.admin-page
  kicker "Portal de propietarios" · h1
  #partnerLoading        (shown first)
  §partnerSignedOut [hidden]   sign-in copy + #partnerLogin form (email/password)
  §partnerNotOwner  [hidden]   "not an owner yet" + "Quiero unirme" CTA
  §partnerDashboard [hidden]
     toolbar: #partnerEmail · [Salir]
     .partner-grid: 4 metrics (Props, Bookings, Revenue, Payout)
     "Tus viviendas" → ul#partnerProps
     "Reservas recientes" → table#partnerBookings   🗑️
     "Datos de pago" → form#payoutForm
footer
```

### Controls

| Control | id / name | Type | Default | Validation |
| --- | --- | --- | --- | --- |
| Login email | `#partnerLogin [name=email]` | email | — | `required` |
| Login password | `[name=password]` | password | — | `required` |
| Login submit | `#partnerLogin` | submit | — | `signIn()`; error → `auth.error` |
| Logout | `#partnerLogout` | button | — | reloads page |
| Account holder | `[name=account_holder]` | text | prefilled | none |
| IBAN | `[name=iban]` | text | prefilled; placeholder `ES.. …` | **normalized on save**: `replace(/\s+/g,"").toUpperCase()` |
| Bank name | `[name=bank_name]` | text | prefilled | trimmed |
| Tax id (NIF/NIE) | `[name=tax_id]` | text | prefilled | trimmed |
| Billing address | `[name=billing_address]` | text | prefilled | trimmed |
| Payout notes | `[name=payout_notes]` | textarea (2 rows) | prefilled | trimmed; optional |
| Save payout | `#payoutForm` | submit | — | `saveOwnerPayout()` |

### Routing by role / States

`showState(state)` toggles four sections. `onAuthChanged(user, isAdmin)`:

| State | Condition | View |
| --- | --- | --- |
| `loading` | initial (and while resolving) | `#partnerLoading` |
| `signedout` | no `user`, or backend not configured | `#partnerSignedOut` + login form |
| `notowner` | signed in but `!getIsOwner() && !isAdmin` | `#partnerNotOwner` + "Quiero unirme" → `index.html#owner` |
| `dashboard` | owner **or** admin | metrics + props + bookings + payout |

`lastUser` guard ignores repeated auth events for the same user.

### Metrics (`renderDashboard`)

| Metric | id | Source | Status |
| --- | --- | --- | --- |
| Properties | `#metricProps` | `properties.length` | ✅ |
| Bookings | `#metricBookings` | `bookings.length` | 🗑️ from `bookings` table |
| Revenue (gross) | `#metricRevenue` | Σ `amount_eur` where `status==="paid"`, `toLocaleString("es-ES") + " €"` | 🗑️ |
| Payout | `#metricPayout` | `payout?.iban ? "✓" : "—"` | ✅ |

### Properties list (`#partnerProps`) ✅

From `loadOwnerDashboard()` → `properties` (RLS-scoped to `owner_id = auth.uid()`).
Each `admin-prop-card` (cursor default, **not** a link) shows cover, name, address
("…, Zaragoza"), a published/unpublished chip, and `price_number EUR/mes`. Empty →
`partner.noProps`.

### Bookings table (`#partnerBookings`) 🗑️ dormant-to-remove

Reads `bookings` rows for the owner's property ids. Columns: property, check-in,
check-out, months, amount, status (paid badge / `partner.pending`). Empty →
`partner.noBookings`. Part of the removed Stripe path; will be empty once `bookings`
is dropped.

### Payout form ✅

On submit, builds the payload and calls `saveOwnerPayout()` (upsert into
`owner_payout_details` keyed by `owner_id`). **IBAN is uppercased and stripped of
all whitespace**; the other text fields are trimmed. Result toast:
`partner.payoutSaved` (success) or `form.errorSend` (error). On success the
dashboard is reloaded and the form re-prefilled from the saved row.

### Access control

- Owner **or** admin lands on the dashboard; everyone else gets `signedout` /
  `notowner`. Client gate cosmetic; the real isolation is RLS: an owner reads only
  their own properties and only their own `owner_payout_details` row; admins are
  **read-only** on payout rows (R-RLS-7, §8). 🐞 The dashboard does **not** verify
  payout writes against another owner — RLS does.

### Copy (keys)

`partner.kicker`, `partner.title`, `partner.signinCopy`, `partner.notOwner`,
`owners.cta` ("Quiero unirme"), `partner.metricProps`, `partner.metricBookings`,
`partner.metricRevenue` ("Ingresos de reservas (bruto)"), `partner.metricPayout`,
`partner.propsTitle`, `partner.bookingsTitle`, `partner.payoutTitle`,
`partner.payoutCopy`, `partner.holder`, `partner.iban`, `partner.bank`,
`partner.taxId`, `partner.billing`, `partner.notes`, `partner.savePayout`,
`partner.payoutSaved`, `partner.noProps`, `partner.noBookings`, `partner.pending`,
`partner.thStatus`, `auth.email/password/signin/logout/error`,
`admin.published/unpublished`, `admin.th.property/checkin/checkout/months/amount`.

---

## 6b.3 ADMIN — `admin.html` / `admin.js`

Admin-only dashboard with four tabs: Properties · Requests · Bookings · Users.

### Layout

```
header (brand · ES/EN · "Ir al sitio" · "Acceso administración")
main.admin-page
  kicker "Administración" · h1 · copy
  #adminStatus [hidden]  (page-level + toast statuses)
  form#adminLogin [hidden]  (email/password)
  #adminToolbar [hidden]  (#adminUserEmail · [Salir])
  #adminPanel  [hidden]
     nav.admin-main-tabs: [Propiedades][Solicitudes][Reservas][Usuarios]
     §properties:  prop list ul#adminPropList + [Añadir vivienda]
     §requests:    table#adminRequestsTable           🔜
     §bookings:    table#adminBookingsTable + table#adminAssignedTable   🗑️/✅
     §users:       ul#adminUserList
footer
```

### Controls

| Control | id / name | Type | Notes |
| --- | --- | --- | --- |
| Login email/password | `#adminLogin [name=email/password]` | email/password | both `required`; `signIn()` |
| Logout | `#adminLogout` | button | `signOut()` |
| Main tabs | `[data-main-tab]` | buttons | toggle `[data-main-panel]` visibility |
| Add property | `#adminAddProperty` | button | `window.prompt` for name → insert → redirect |
| Publish toggle | `[data-toggle-publish=<id>]` | button | `setPropertyPublished()` |
| Delete property | `[data-delete-prop=<id>]` | button (`.danger`) | two-click arm → `deleteProperty()` |
| Request status | `[data-request-id][data-request-status]` | button | `updateBookingRequestStatus()` 🔜 |
| Delete user | `[data-delete-user=<id>]` | button (`.danger`) | two-click arm → `admin_delete_user` RPC |

### States (`routeUI(user, isAdmin)`)

| State | Condition | View |
| --- | --- | --- |
| Not configured | `!isConfigured()` | status `admin.notConfigured`; login/toolbar/panel hidden |
| Signed-out | no `user` | `#adminLogin` shown; status hidden |
| Signed-in, not admin | `user && !isAdmin` | toolbar shown; status `admin.notAdmin`; **panel hidden** |
| Admin | `user && isAdmin` | panel shown; `loadAdminData()` runs |
| Error | any load query errors | toast `admin.error` (auto-hides 5 s) |
| Saved | mutation succeeds | toast `admin.saved` (auto-hides 2.6 s) |

`adminStatus` distinguishes **page-level** keys (`admin.notConfigured`,
`admin.notAdmin` — persistent banner) from **toast** keys (everything else).

### Data load (`loadAdminData`)

`Promise.all` of five queries: `properties` (+ photos), `loadBookingRequests()`,
`bookings` (all), `availability_blocks` where `user_id is not null` (+ property &
profile email), and `profiles` (+ admin/deactivated flags + `bookings(count)`).

### Properties tab ✅

`renderPropList()` — each row links to `admin-property.html?id=<id>`, showing cover,
name, location (`address · area`), a truncated description (rich-text stripped),
published/unpublished chip, `price_number EUR/mes`, and an "edit" affordance. Below
the card sit two buttons:

- **Publish toggle** → `setPropertyPublished(id, !is_published)`; flips chip in
  place, toast `admin.saved`.
- **Delete (two-click)** → first click arms (`admin.deletePropertyConfirm`), second
  calls `deleteProperty(id)` — removes storage photos best-effort, then deletes the
  row (DB cascades blocks/photos/favorites/guest-info). Row removed from local
  state, toast `admin.saved`.

**Add property** (`addProperty`): `prompt` for a name → `slugify(name)` +
4-char random suffix → insert a draft row with defaults (`type:"apartment"`,
`city:"zaragoza"`, `address_key:"pedro"`, `guests:2`, `price_label:"0 EUR"`,
`price_number:0`, Zaragoza lat/lng `41.6516/-0.8809`, `is_published:false`,
`amenities:[]`) → redirect to the editor. `slugify`: lowercase, strip diacritics,
non-alnum→`-`, trim, ≤24 chars, fallback `"vivienda"`.

### Requests tab 🔜 planned/unwired

Reads `booking_requests` via `loadBookingRequests()`. **Nothing writes this table**
(the `request-booking` Edge Function is exported but has no front-end caller — see
§6.2/§3.3), so the tab renders **empty** in practice. Documented for if/when the
Edge-Function booking path is wired.

- Columns: requested-at, property, check-in, check-out, tenants, total (`… EUR`),
  email, status chip, actions.
- **Status lifecycle**: `new → contacted → confirmed | declined`. Chip colors:
  new/contacted/confirmed = `is-live`, declined = `is-off`.
- **Action buttons** (`requestActions`):
  - `new` → [Mark contacted] [Mark confirmed] [Mark declined]
  - `contacted` → [Mark confirmed] [Mark declined]
  - `confirmed` / `declined` → no actions (terminal).
- Clicking disables the button, calls `updateBookingRequestStatus(id, status)`;
  on success updates the local row + re-renders + toast; on failure re-enables +
  `admin.error`.
- Empty → `admin.noRequests`.

### Bookings tab 🗑️/✅

Two tables:

- **Confirmed bookings** (`#adminBookingsTable`) — **🗑️ dormant-to-remove**. Reads
  the `bookings` table. Columns: confirmed-at, property, check-in, check-out,
  months, amount, customer name, customer email, invoice link (`bookings.invoice`).
  Empty → `admin.noBookings`. Part of the removed Stripe path.
- **Assigned stays** (`#adminAssignedTable`) — **✅ active**. Reads
  `availability_blocks` with `user_id is not null`. Columns: property, check-in,
  check-out, guest email. The real "manually assigned stays" view (mirror of the
  account "assigned" list).

### Users tab ✅

`renderUsers()` — one `<li>` per `profiles` row: email (or id), an admin chip
(`admin.adminChip`) if `is_admin`, a deactivated chip (`admin.deactivatedChip`) if
`deactivated_at`, and a bookings count (`admin.bookingsCount` interpolating
`{count}`).

- **Delete user (two-click)** rendered **only when `!is_admin`** — admins have no
  delete button at all. First click arms (`admin.deleteUserConfirm`), second calls
  RPC `admin_delete_user({ target_user })`. The RPC body re-checks `is_admin()`
  server-side and **refuses to delete an admin** (`cannot delete an admin account`)
  — so the missing button is cosmetic; the server is the real guard. On success →
  `admin.saved` + reload; on error → `admin.error`.

### Access control

- Admin-only. `isAdmin` arg from `onAuthChanged` decides UI; **server RLS** scopes
  every read/write (`properties`/`booking_requests`/`bookings`/
  `availability_blocks`/`profiles`) to admins and the two RPCs
  (`admin_delete_user`, `deactivate_my_account`) self-check `is_admin()` (§8). A
  non-admin who reaches an admin-only REST/RPC call directly is rejected by the DB.

### Copy (keys)

`admin.title/copy`, `auth.admin`, `admin.navSite/navLogin`, `admin.signinFirst`,
`admin.notConfigured`, `admin.notAdmin`, `admin.error`, `admin.saved`,
`admin.tabProperties/tabRequests/tabBookings/users`, `admin.propListCopy`,
`admin.addProperty`, `admin.addPropertyName`, `admin.editProperty`,
`admin.publish/unlist`, `admin.deleteProperty/deletePropertyConfirm`,
`admin.published/unpublished`, `admin.requestsTitle/requestsCopy`,
`admin.reqMarkContacted/reqMarkConfirmed/reqMarkDeclined`,
`admin.reqStatus.<status>`, `admin.noRequests`, `admin.confirmedBookings`,
`admin.confirmedCopy`, `admin.assignedStays/assignedCopy`, `admin.noBookings`,
`admin.users/usersCopy`, `admin.adminChip`, `admin.deactivatedChip`,
`admin.bookingsCount`, `admin.deleteUser/deleteUserConfirm`, `admin.noBlocks`
(reused as prop-list empty), `bookings.invoice`,
`admin.th.confirmed/property/checkin/checkout/months/amount/name/email/invoice/requested/tenants/total/status/actions`.

---

## 6b.4 ADMIN PROPERTY EDITOR — `admin-property.html` / `admin-property.js`

The single richest page: full property edit, photo management, geocoding, AI
assistant, guest info, and availability blocks for one property (`?id=`).

### Access gate / States

`routeUI(user, isAdmin)`:

| Condition | Result |
| --- | --- |
| `!isConfigured()` **or** no `?id` | `window.location.replace("admin.html")` |
| no `user` | redirect to `admin.html` |
| `user && !isAdmin` | toolbar shown; status `admin.notAdmin`; editor emptied |
| `user && isAdmin` | `loadProperty()` builds the editor |

`loadProperty()` fails (missing row / error) → status `admin.error`. Auth re-fires
are ignored after first successful route (`routed` guard). Extra Leaflet, pdf.js,
and (lazy) Tesseract.js libraries load on this page.

### A. Details form (`renderEditForm` → `editPayloadFromForm`)

One `<form data-edit-form>` grouped into fieldsets:

| Fieldset (`admin.section.*`) | Fields |
| --- | --- |
| `basic` | name; type `<select>` (apartment/room/home); guests, rating, bedrooms, bathrooms, size_m2, floor_number (numbers) |
| `price` | price_number; price_note_es / price_note_en (bilingual pair) |
| `conditions` | min_stay_months, max_stay_months, deposit_amount, upfront_rent_eur, utilities_cap_eur; **bills_policy** `<select>` (included/capped/excluded); energy_rating `<select>` (—/A–G); video_url |
| `textsEs` | area_es; copy_es, details_es (rich-text textareas); beds_es |
| `textsEn` | area_en; copy_en, details_en (rich-text); beds_en |
| `location` | address + "Find" button + geocode panel/map; city; address_key; hidden lat/lng |
| `owner` | owner_email |
| amenities (`admin.field.amenities`) | **14 checkboxes**: wifi, desk, balcony, lift, ac, heating, kitchen, terrace, washer, dishwasher, tv, microwave, oven, parking |
| status (`admin.section.status`) | **flags**: is_new, checked, deposit_protected, pets_allowed, smoking_allowed, couples_allowed, self_checkin, is_published |

**bills_policy default**: explicit `row.bills_policy`, else derived —
`bills_included ? (utilities_cap_eur ? "capped" : "included") : "excluded"`. On
save, the legacy `bills_included` boolean is kept in sync: `policy !== "excluded"`.

**Rich-text toolbar** (`copy_*`/`details_*`): B / I / bullet buttons insert a
Markdown subset around the textarea selection (`applyRichCommand`); rendered on the
property page via `rich-text.js`.

**Save** (`editPayloadFromForm` → `update properties`): builds a typed payload
(`textOrNull`/`numberOrNull`; `price_label = "<n> EUR"`; amenities from checked
boxes; flags from `formData.has`). Then:
1. **Silent geocode on save** — if `address` changed since `geoResolvedFor`,
   `fetchGeocodeCandidates(address)[0]` fills lat/lng so the listing always gets a
   pin.
2. **Owner resolution** — if `owner_email` changed: empty → `owner_id = null`;
   else lookup `profiles` by `ilike(email)`; unknown → `admin.ownerNotFound` (abort
   save); found → `owner_id` set + `profiles.is_owner = true`.
3. `update … eq("id", propertyId)` → `admin.saved` + reload, or `admin.error`.

### B. Photo management (`renderPhotoSection` × 2)

Two independent grids — **Photos** (`is_floorplan=false`) and **Floor plans**
(`is_floorplan=true`). Each grid:

- **Upload** (`[data-photo-input]`, `accept="image/*" multiple`) → `uploadPhotos`:
  per file, sanitize name → upload to `property-photos/<id>/<ts>-<name>` →
  insert `property_photos` row with `sort_order` incremented by 10. Toast
  `admin.uploading` then `admin.saved`; reloads.
- **Drag-reorder** — HTML5 dnd; drop only within the same group (photos vs
  floorplans); `applyPhotoOrder` renumbers via `PhotoOrder.renumber` to clean
  10/20/30… and persists only moved rows (`update sort_order`); save error reloads
  to resync.
- **Move ◀/▶** (`[data-move-photo][data-move-dir]`) — keyboard/touch reorder one
  step via `movePhotoStep`; ends disabled at the boundary.
- **Delete** (`[data-delete-photo][data-path]`) — `storage.remove([path])` then
  delete the `property_photos` row; reload.
- **Cover** — the **first Photos tile** (sorted by `sort_order`) is the listing
  cover, badged `admin.cover`; there is **no separate "make cover"** action —
  reorder to set it. Floor plans have no cover badge.

`coverUrl`/`sortedPhotos` sort by `sort_order` then `storage_path`.

### C. Geocoding (Nominatim)

- **"Find address"** (`[data-geocode]`) → `geocodeIntoForm` → `fetchGeocodeCandidates`:
  queries `nominatim.openstreetmap.org/search` (jsonv2, addressdetails, limit 10,
  `accept-language` per UI), **loosening progressively** (full → strip numbers →
  strip street-type words), appending ", Zaragoza, España" when the query isn't
  already located. De-duplicates by `place_id`, **Spanish results first**
  (`spainRank`).
- Result panel: a `<select>` of candidates when >1 (`admin.geocodeFoundMany`),
  otherwise a single match (`admin.geocodeFound`). `applyGeoCandidate` fills hidden
  lat/lng (`toFixed(6)`), fills `city` if empty, shows the proposed street/locality,
  drops a **Leaflet map pin** (`showAdminMapPin`), and records `geoResolvedFor`.
- Empty → `admin.geocodeNone` (error); fetch throw → `admin.geocodeError`.
- Statuses: `admin.geocodeSearching/Found/FoundMany/None/Error`, hint
  `admin.addressHint`, confirm `admin.geocodeConfirmQ`.

### D. AI assistant (`renderAiSection`, DeepSeek via `ai-property-assistant`)

| Control | Behavior |
| --- | --- |
| File input `[data-ai-file]` | accepts pdf/txt/md/csv/image; filename echoed |
| Paste textarea `[data-ai-paste]` | freeform source text |
| ✦ Autofill `[data-ai-autofill]` | `runAutofill()` |
| Auto-translate toggle `[data-ai-toggle]` | persisted `localStorage[ebrostay-ai-autotranslate]` |
| Per-field ✦ `[data-ai-translate]` | translate one bilingual field to its pair |

**`runAutofill`** pipeline:
1. **Text extraction** (`extractTextFromFile`): digital PDF via pdf.js (≤30 pages);
   if the text layer is near-empty (<20 non-space chars) → render pages and **OCR**
   (Tesseract `spa+eng`, ≤8 pages); image files → OCR; else read as text. No text +
   no paste → `admin.ai.noText`. Falls back to pasted text.
2. **Extract** → `aiExtractProperty(text)` → `populateFormFromAi` (fills **only
   empty** fields; whitelisted field set; validates type/energy against allowed
   values; checks amenity boxes).
3. **Image extraction** (`extractImagesFromFile`): pull embedded image XObjects
   from PDFs / the image itself, skip tiny logos (<200 px), flatten transparency to
   white, JPEG-encode, and **pre-classify** photo vs floorplan via
   `looksLikeFloorplan` heuristic (mostly-white + low-saturation). Review strip
   (`renderExtractedImages`): each thumbnail gets a Photo/Floor plan/Skip
   `<select>`; **"Add images to listing"** (`uploadExtractedImages`) uploads the
   non-skipped ones to storage + `property_photos`.
4. **Description generation** — if all of copy_es/copy_en/details_es/details_en are
   empty, downscale ≤3 extracted images to data-URIs and call
   `aiGenerateDescription(fields, images)` → populate.
5. Final toast `admin.ai.filled`.

**Per-field / auto translate** (`translateFromField`): on the ✦ button or (when the
toggle is on) on `change` of any `[data-translate-group]` field, translate to the
counterpart language via `aiTranslateField(value, source, target, group)` and write
into the paired input; `lastTranslated` dedupe avoids re-translating unchanged text.

**Graceful degradation**: every AI helper in `backend.js` returns
`{ ok:false, code:"not_configured" }` when Supabase/the function/`DEEPSEEK_API_KEY`
is absent (no throw). The editor maps that to `admin.ai.notConfigured` and stays
fully usable; other failures → `admin.ai.error`. Statuses: `admin.ai.reading/ocr/
thinking/writing/extractingImages/translating/filled/empty/noText/error/notConfigured`.

### E. Guest info form (`renderGuestInfoForm`) ✅

One `<form data-guest-info-form>` over `property_guest_info` (one row per property,
**upsert** keyed by `property_id`): wifi_name, wifi_password, checkin_time,
checkout_time, emergency_phone, key_pickup (textarea), notes (textarea). Save →
`admin.saved` + reload, or `admin.error`. (RLS: tenant reads only when they have an
assigned block on that property — §8.)

### F. Availability blocks ✅

- **Available-from** (`[data-available-form]`, `availableFrom` date) → updates
  `properties.available_from` (or null). Toast `admin.saved`.
- **Block list** — sorted by `start_date`; each shows the range and, when assigned,
  the guest email (`admin.guest: <email>`), with a Delete button
  (`[data-delete-block]` → `delete availability_blocks` + reload). Empty →
  `admin.noBlocks`.
- **Add block** (`[data-block-form]`): `startDate`, `endDate` (both `required`),
  optional `guestEmail`. Validation: `endDate ≥ startDate` (else `admin.error`).
  Guest email → lookup `profiles` by `ilike(email)`; unknown → `admin.guestNotFound`
  (abort); found → `user_id` set. Insert `availability_blocks` → `admin.saved` +
  reload. Assigning `user_id` is exactly what makes a stay appear in the tenant's
  account "assigned" list (6b.1) and the admin "Assigned stays" table (6b.3).

### Access control

- Admin + valid `?id` only; otherwise hard redirect to `admin.html`. All
  `properties`/`property_photos`/`property_guest_info`/`availability_blocks`/storage
  writes are admin-gated by RLS server-side (client gate cosmetic, §8). Owner/guest
  lookups (`ilike` on `profiles`) succeed for admins via RLS.

### Copy (key families)

`admin.section.basic/price/conditions/textsEs/textsEn/location/owner/status`,
`admin.field.*` (name, type, guests, rating, bedrooms, bathrooms, size, floor,
priceNumber, priceNoteEs/En, minStay, maxStay, deposit, upfront, utilitiesCap,
billsPolicy, energy, video, areaEs/En, copyEs/En, detailsEs/En, bedsEs/En,
addressFull, city, addressKey, ownerEmail, amenities, guestEmail),
`admin.billsPolicy.included/capped/excluded`, `admin.energyNone`, `type.<key>`,
`amenity.<key>` (×14), `admin.flag.isNew/checked/deposit/pets/smoking/couples/
selfCheckin/published`, `admin.photos/floorplans/addPhotos/addFloorplans/
floorplansCopy/reorderHint/noPhotos/noFloorplans/cover/moveLeft/moveRight/delete/
uploading`, `admin.ai.*`, `admin.rtBold/rtItalic/rtBullet/rtHint`,
`admin.geocode*`, `admin.availability/availableFrom/blocks/from/to/add/save/
noBlocks/guest`, `admin.guestInfo/guestInfoCopy/guestNotFound/ownerNotFound/
ownerHint`, `guest.wifiName/wifiPassword/checkinTime/checkoutTime/emergencyPhone/
keyPickup/notes`, `admin.saveChanges`, `admin.backToPanel`.

---

## 6b.5 BOOKING DETAIL — `booking.html` / `booking.js` 🗑️ dormant-to-remove

> **Status: dormant-to-remove.** This page is part of the abandoned Stripe/paid
> path and should be deleted along with the `bookings` table and the account "paid
> bookings" list. Documented here only for completeness.

- **Reachability**: only via `booking.html?id=<id>` links rendered by the account
  page's **paid** list (6b.1) — itself 🗑️. With the paid path removed, the page is
  unreachable.
- **What it does**: reads `?id`, and on first auth event calls
  `loadBookingDetail(id)` → a `bookings` row (RLS-scoped to the owner) plus that
  property's `property_guest_info`. Renders cover, title, address, facts (start/end
  dates, months, paid amount, an 8-char uppercase reference), invoice/PDF/receipt
  links, a "view listing" link, and the tenant-only stay info (wifi, key pickup,
  check-in/out times, emergency phone, notes) — or a "we'll send details" pending
  message.
- **States**: `loading` → `notfound` (no `?id`, signed-out, or no row) → `detail`.
- **Access control**: tenant session; RLS limits the `bookings` read to the owning
  user. Cosmetic client gate only.
- **Copy**: `booking.back/kicker/notFoundTitle/notFoundCopy/viewProperty/
  guestInfoTitle/guestInfoPending/guestInfoHelp/paidAmount/reference`,
  `book.start/end/months`, `bookings.invoice/pdf/receipt`, `guest.*`.

---

### Status summary for §6b

| Area | Status |
| --- | --- |
| Account: assigned stays, logout, deactivate | ✅ |
| Account: paid bookings list → `booking.html` | 🗑️ |
| Owner: properties count, payout ✓, properties list, payout form | ✅ |
| Owner: bookings count, gross revenue, recent-bookings table | 🗑️ |
| Admin: Properties tab (publish, delete, add) | ✅ |
| Admin: Requests tab (`booking_requests`) | 🔜 (empty — nothing writes it) |
| Admin: Bookings tab — confirmed bookings | 🗑️ |
| Admin: Bookings tab — assigned stays | ✅ |
| Admin: Users tab (list, delete non-admin) | ✅ |
| Admin property editor (details, photos, geocoding, AI, guest info, blocks) | ✅ (AI degrades to not_configured) |
| Booking detail page | 🗑️ |
| 🐞 `availability_blocks.user_id` world-readable (guest email/uuid leak) | flagged, see §8 / R-RLS-6 |
