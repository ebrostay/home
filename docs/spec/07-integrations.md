# Ebrostay Reconstruction Spec — §7 Integrations

> Baseline: as-built (branch `main`, 2026-06-25). Status tags: ✅ active · 🔜 planned/unwired · 🗑️ dormant-to-remove · 🐞 suspected bug · 🚫 out-of-scope (MVP).

This section catalogues every external dependency the system talks to, and how
each is wired. The guiding principle is **graceful degradation**: the front end
is a static site that runs with no backend at all (`backend.js` →
`isConfigured()` → built-in sample data). Each integration below either layers
on top of that, or is invoked only from a path that is itself optional.

| # | Integration | Role | Where | Status |
| --- | --- | --- | --- | --- |
| 7.1 | Supabase | Auth, data (PostgREST), Storage, Edge Functions | `backend.js`, all pages | ✅ active |
| 7.2 | Resend | Transactional email for booking requests | `request-booking` Edge Fn | 🔜 planned/unwired |
| 7.3 | DeepSeek | AI extract / translate / describe in the editor | `ai-property-assistant` Edge Fn | ✅ active |
| 7.4 | Nominatim | Address geocoding in the editor | `admin-property.js` | ✅ active |
| 7.5 | Leaflet + OpenStreetMap | Maps & tiles (Google Maps iframe fallback) | `site.js`, `property.js`, `admin-property.js` | ✅ active |
| 7.6 | flatpickr | Date-range pickers | `site.js`, `property.js` | ✅ active |
| 7.7 | Tesseract.js | OCR for scanned PDFs / images in the editor | `admin-property.js` | ✅ active |
| 7.8 | Umami | Privacy-friendly analytics events | `site.js`, `property.js` | ✅ active |

Other CDN-loaded libraries that are not "integrations" in the service sense but
are required for a faithful rebuild: `@supabase/supabase-js@2` (all pages),
`pdfjs-dist@3.11.174` (editor PDF text/image extraction), `lucide@0.453.0`
(icons). They are listed in §3 (architecture) and §9 (conventions); only the
service integrations are detailed here.

---

## 7.1 Supabase — ✅ active

The single backend. One project provides Auth, the PostgREST data API, Storage,
and Edge Functions, all reached through the official `@supabase/supabase-js@2`
client created in `backend.js`. The client is built **only** when configuration
is present; otherwise the whole module no-ops and the site serves sample data.

| Aspect | Detail |
| --- | --- |
| Purpose | Authentication, data access, file storage, server-side functions |
| Where used | `backend.js` (the bridge); every page's JS via `window.EbrostayBackend` |
| Config / secret | `SUPABASE_URL`, `SUPABASE_ANON_KEY` (public anon key, baked into the static site via `supabase-config.js`, injected by `scripts/inject-config.js`). Server secrets — `SUPABASE_SERVICE_ROLE_KEY` — live only inside Edge Functions, never in the browser. |
| Client guard | `isConfigured()` requires `SUPABASE_URL` to start with `https://`, the anon key length > 20, and `window.supabase` to be loaded. Fail → static fallback. |
| Failure behavior | Any load error degrades to built-in `properties` data (`loadProperties()` logs a warning and returns `false`). The site never hard-fails on a missing/broken backend. |

### Auth

Email/password is the primary method; OAuth/SSO providers are surfaced only when
the Supabase project has them enabled. All auth runs client-side through
`supabase.auth.*`; there is no app server.

| Operation | `backend.js` function | Supabase call |
| --- | --- | --- |
| Sign in | `signIn(email, password)` | `auth.signInWithPassword` |
| Sign up | `signUp(email, password)` → `{ needsConfirmation, error }` (confirmation needed when a user exists but no session) | `auth.signUp` |
| Sign out | `signOut()` | `auth.signOut` |
| Password reset (request) | `resetPassword(email)` — `redirectTo` = current page URL | `auth.resetPasswordForEmail` |
| Password update (recovery) | `updatePassword(password)` | `auth.updateUser` |
| OAuth/SSO sign-in | `signInWithProvider(provider)` — `redirectTo` = current page | `auth.signInWithOAuth` |
| Session/role hydration | `refreshAuth()` reads the user, then `profiles.is_admin` / `is_owner` | `auth.getUser` + `profiles` select |

**Provider discovery.** Provider buttons (Google, Azure, …) only render once the
provider is configured in the Supabase dashboard. `getEnabledProviders()` fetches
the public settings endpoint and returns the `external` map:

```
GET {SUPABASE_URL}/auth/v1/settings
Headers: apikey: {SUPABASE_ANON_KEY}
→ { "external": { "google": true, "azure": false, ... }, ... }
```

On any error it returns `{}` (no provider buttons shown). The buttons read
truthy keys of `settings.external`.

**Recovery flow.** `init()` registers `auth.onAuthStateChange`; a
`PASSWORD_RECOVERY` event fires `callbacks.onPasswordRecovery?.()` so the page can
show the "set a new password" UI (the reset email links back to the same page).
Every auth state change re-runs `refreshAuth()`.

> Full role assignment, RLS policy text, the signup trigger, and the
> client-gate-vs-server-gate distinction (`getIsAdmin()` is cosmetic) live in
> **§8 Auth & security**. This section covers only the *integration wiring*.

### Data access (PostgREST)

All reads/writes go through the PostgREST REST API via the JS client's
table-builder. Public listing reads use the anon key under RLS; everything else
is scoped to the signed-in user or to admins by RLS. Representative calls:

| Function | Table(s) | Notes |
| --- | --- | --- |
| `loadProperties()` | `properties` + embedded `availability_blocks`, `property_photos` | `is_published = true`, ordered by price. Retries **without** `property_photos` if that table is absent (older DBs). |
| `loadMyBookings()` | `bookings`, `availability_blocks` | RLS-scoped to `user_id`. |
| `sendInquiry(fields)` | `inquiries` (insert) | Contact form lead capture; logs a warning on error, returns `{ ok }`. |
| `submitOwnerLead(fields)` | `owner_leads` (insert) | Public owner application. |
| `saveFavorite` / `loadFavorites` | `favorites` | 🚫 out-of-scope (MVP). Upsert / delete / select per user. |
| `loadBookingRequests` / `updateBookingRequestStatus` | `booking_requests` | Admin-only via RLS. |
| `loadOwnerDashboard` / `saveOwnerPayout` | `properties`, `bookings`, `owner_payout_details` | Owner-scoped. |
| `deactivateAccount()` | RPC `deactivate_my_account` | `security definer`; signs out after. |
| `setPropertyPublished` / `deleteProperty` | `properties` (+ storage cleanup) | Admin-only. |

### Storage

One **public** bucket: `property-photos`. Every listing image and floor plan is
an object in this bucket; the row in `property_photos` stores its `storage_path`,
`sort_order`, and `is_floorplan` flag.

| Aspect | Detail |
| --- | --- |
| Bucket | `property-photos` (public read) |
| Path convention | `{propertyId}/{Date.now()}-{slug}.{ext}` (uploads from the editor) |
| Public URL | `photoUrl(storagePath)` → `sb.storage.from("property-photos").getPublicUrl(path).data.publicUrl` |
| Upload | `sb.storage.from("property-photos").upload(path, file)` (editor) |
| Delete | `deleteProperty` removes objects **first** (best-effort) before deleting the row, because storage objects do **not** cascade with DB rows. |

Photos are sorted by `sort_order` then `storage_path`; the first non-floorplan
photo is the listing cover (`coverUrl`).

### Edge Functions

Invoked from the browser with `sb.functions.invoke(name, { body })`. Two
functions exist; both verify the Supabase JWT server-side.

| Function | `backend.js` caller(s) | Body | Detailed in |
| --- | --- | --- | --- |
| `request-booking` | `requestBooking(propertyId, startDate, endDate, tenantNames)` | `{ propertyId, startDate, endDate, tenantNames }` | §7.2 |
| `ai-property-assistant` | `aiExtractProperty`, `aiTranslateField`, `aiGenerateDescription` | `{ action, ... }` (see §7.3) | §7.3 |

**Invocation/error idiom.** All callers wrap `invoke` in `try/catch`, never
throw, and normalize the result to `{ ok, code }`. The function's error code is
recovered from the response body:

```js
let code = "server_error";
try { code = (await error.context?.json())?.error || code; } catch { /* keep default */ }
return { ok: false, code };
```

When Supabase itself is unconfigured (`getClient()` is null), the AI helpers
short-circuit to `{ ok: false, code: "not_configured" }` without a network call.

---

## 7.2 Resend (email) — 🔜 planned/unwired

| Aspect | Detail |
| --- | --- |
| Purpose | Transactional email on a new booking request: a notification to the Ebrostay team and an acknowledgement to the customer. |
| Where used | `supabase/functions/request-booking/index.ts` (`sendEmail` → `https://api.resend.com/emails`). |
| Config / secret | `RESEND_API_KEY` (required); `EMAIL_FROM` (default `Ebrostay <reservas@ebrostay.com>`); `EMAIL_TO` (default `info@ebrostay.com`). All are Edge Function secrets. |
| Status | **🔜 planned/unwired.** The Resend code is complete and correct, *but the live site never invokes `request-booking`.* The booking widget on the property page uses the mailto/WhatsApp MVP flow (see §6.2 and §11). `backend.js` exposes `requestBooking()`, but no UI calls it. The function works if invoked directly. |

### What the function does (when invoked)

1. Verifies the JWT, rejects deactivated users.
2. Recomputes price, commission, deposit, and availability **server-side** (the
   client only sends property, dates, and tenant names — see §5 for the
   algorithm and the client/server parity note).
3. **Inserts the `booking_requests` row first** — this is the reliable record the
   admin panel reads; it must succeed even if email later fails.
4. Sends the team email, then (if the user has an email) the customer email.

### Templates

Two inline-HTML templates, both Spanish, branded (dark header `#0c1a14`, cream
body `#f7f6f0`). Values are HTML-escaped via `escapeHtml`.

| Template | Function | To | Subject | Notable content |
| --- | --- | --- | --- | --- |
| Team | `teamEmailHtml(r)` | `EMAIL_TO` | `Nueva solicitud de reserva: {name} ({start} → {end})` | Full fee breakdown + customer email + tenant names; `reply_to` set to the customer. Deposit row shown only when > 0. |
| Customer | `customerEmailHtml(r)` | the signed-in user's email | `Hemos recibido tu solicitud: {name}` | Acknowledgement + estimated total; "no charge has been made" disclaimer; footer with `info@ebrostay.com`. |

### Request to Resend

```json
POST https://api.resend.com/emails
Authorization: Bearer {RESEND_API_KEY}
Content-Type: application/json

{
  "from": "Ebrostay <reservas@ebrostay.com>",
  "to": ["info@ebrostay.com"],
  "reply_to": "customer@example.com",
  "subject": "Nueva solicitud de reserva: Ático San José (2026-07-01 → 2026-10-01)",
  "html": "<div>…branded HTML…</div>"
}
```

Success response (parsed for `id`, used only for logging):

```json
{ "id": "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }
```

### Failure behavior (important)

`sendEmail` **does not throw on a non-2xx response** — Resend returns 4xx/5xx as
a normal response, so the code must inspect `res.ok` or a bad key fails silently.
The contract:

| Condition | Returned by `sendEmail` | Effect |
| --- | --- | --- |
| `RESEND_API_KEY` missing | `{ ok: false, error: "no_api_key" }` | logged; request still succeeds |
| Resend non-2xx (bad key, unverified domain) | `{ ok: false, error: "http_{status}" }` | logged with body excerpt |
| Network/fetch throw | `{ ok: false, error: "network" }` | logged |
| Success | `{ ok: true, id }` | logged |

**A failed email never fails the request.** The saved `booking_requests` row is
the source of truth. The function's HTTP response carries an `emailed` flag (the
*team* email outcome) plus an `emailError` code when it failed:

```json
{ "ok": true, "emailed": true }
```
```json
{ "ok": true, "emailed": false, "emailError": "http_401" }
```

The customer email outcome is logged but not surfaced in the response.

---

## 7.3 DeepSeek (AI assistant) — ✅ active

| Aspect | Detail |
| --- | --- |
| Purpose | AI help in the property editor: parse a pasted/uploaded document into listing fields, translate one field ES↔EN, or write a fresh description from facts (+ optional photos). |
| Where used | `supabase/functions/ai-property-assistant/index.ts` (calls `https://api.deepseek.com/chat/completions`, the OpenAI-compatible API). Invoked from the editor via `aiExtractProperty` / `aiTranslateField` / `aiGenerateDescription` in `backend.js`. |
| Config / secret | `DEEPSEEK_API_KEY` (required, Edge Function secret); `DEEPSEEK_MODEL` (optional, default `deepseek-v4-pro`). Generation params: `temperature 0.2`, `max_tokens 2000`. |
| Access | Server verifies the JWT **and** requires `profiles.is_admin` or `is_owner`; deactivated users rejected. Writes nothing to the DB — text transform only. |
| Input cap | `MAX_INPUT = 24000` chars per call (the client also slices to 24000). |
| Privacy | DeepSeek's hosted API runs in China (GDPR note in `docs/deepseek-ai-setup.md`): send only property text, no tenant/owner personal data. To process personal data, repoint `DEEPSEEK_URL` at an EU/US-hosted equivalent. |

### Operations (`action`)

| `action` | Caller | Request body | Response | JSON mode |
| --- | --- | --- | --- | --- |
| `translate` | `aiTranslateField(text, source, target, field)` | `{ action, text, source, target, field }` | `{ text }` (translated, trimmed) | no |
| `extract` | `aiExtractProperty(text)` | `{ action, text }` | `{ fields }` (sanitized listing fields, ES+EN) | yes |
| `describe` | `aiGenerateDescription(fields, images)` | `{ action, fields, images[] }` | `{ fields }` (`copy_es/en`, `details_es/en`) | no |

- **translate** — system prompt fixes source/target language; preserves numbers,
  currencies, units; returns only the translation. `source`/`target` default to
  Spanish unless `"en"`.
- **extract** — system prompt instructs the model to ignore portal boilerplate
  (Idealista/Fotocasa exports) and return a JSON object with any of the known
  keys, **both ES and EN for every text field**. Output runs through
  `sanitizeFields`: whitelists string/number fields, validates `type` ∈
  {apartment, room, home}, `energy_rating` ∈ A–G, and `amenities` ⊆ a fixed set.
- **describe** — builds a compact fact sheet (`buildFactsString`) from the
  current form fields; optionally attaches up to 3 photos as `data:image/` URLs
  (each < 3 MB) for DeepSeek vision. If the model rejects image input, it
  **retries once with facts only**. Output parsed leniently (`extractJson`
  recovers a `{…}` substring) and filtered to the four description keys.

### Example — extract

```json
// request
{ "action": "extract", "text": "Alquilo piso reformado de 2 dormitorios en San José, 65 m²..." }
```
```json
// response
{
  "fields": {
    "name": "Bright 2-bedroom apartment in San José",
    "type": "apartment",
    "bedrooms": 2, "size_m2": 65,
    "area_es": "San José", "area_en": "San José",
    "copy_es": "Piso reformado y luminoso...", "copy_en": "Bright, renovated apartment...",
    "amenities": ["wifi", "heating", "lift"]
  }
}
```

### Degradation

| Condition | Server | Editor behavior |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` not set | `503 { "error": "ai_not_configured" }` | shows a friendly "AI is not configured" message; the rest of the editor works normally. |
| Not admin/owner | `403 { "error": "forbidden" }` | — |
| Not authenticated | `401 { "error": "unauthorized" }` | — |
| Upstream/model error | `500 { "error": "server_error" }` | shows `admin.ai.error`. |
| Supabase unconfigured | (no call) | `{ ok: false, code: "not_configured" }`. |

The helpers in `backend.js` never throw, so the editor always shows a status
rather than crashing.

---

## 7.4 Nominatim (geocoding) — ✅ active

| Aspect | Detail |
| --- | --- |
| Purpose | Resolve a typed address into coordinates + a clean human-readable address for the property editor's location confirmation. |
| Where used | `admin-property.js` (`fetchGeocodeCandidates`, `describeGeoResult`, `geocodeIntoForm`). |
| Config / secret | None — **client-direct** to the public OpenStreetMap Nominatim endpoint. No API key. |
| Endpoint | `GET https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=10&accept-language={es|en}&q={query}` |
| Failure behavior | Catch → status `admin.geocodeError`. No candidates → `admin.geocodeNone`. Geocoding is optional; lat/lng can be left as-is. |

**Spain-prioritized results.** Ebrostay operates in Zaragoza, so results are
ranked with Spanish addresses first (`spainRank`: `country_code === "es"` → 0,
else 1; stable sort preserves Nominatim relevance within each group).

**Query loosening.** OSM often lacks the house number or wants the official
street name, so the search tries progressively looser queries until one matches:

1. the query as typed (appending `", Zaragoza, España"` if it isn't already located),
2. the same with digits removed,
3. the same with street-type words stripped (`calle`, `c/`, `avenida`, `paseo`, `plaza`, …).

Results are de-duplicated by `place_id`. The chosen candidate fills the hidden
`lat`/`lng` inputs (6 decimals) and the `city` field if empty, and drops a
Leaflet pin (§7.5) for visual confirmation.

> Nominatim's usage policy expects a descriptive `User-Agent`/`Referer` and ≤ 1
> req/s. The current client sets only `Accept: application/json`; for a
> production rebuild, add identification and throttling (noted for §11).

---

## 7.5 Leaflet + OpenStreetMap — ✅ active

| Aspect | Detail |
| --- | --- |
| Purpose | Interactive maps: the listings map (home), the property-detail map, and the editor's address-confirmation pin. |
| Where used | `site.js` (`initListingsMap`), `property.js` (`initDetailMap`), `admin-property.js` (`showAdminMapPin`). |
| Library | `leaflet@1.9.4` — CSS from `unpkg.com/leaflet@1.9.4/dist/leaflet.css`, JS from `unpkg.com/leaflet@1.9.4/dist/leaflet.js` (in the `<head>`/footer of `index.html`, `property.html`, `admin-property.html`). |
| Tiles | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (`maxZoom: 19`), with the standard OSM copyright attribution. No tile API key. |
| Config / secret | None. |

Maps are built only when `typeof L !== "undefined"` (the library loaded) and
coordinates exist. The detail map uses a custom price-pin `divIcon`; the home map
clusters markers in a `layerGroup` and `fitBounds` to the visible listings.

### Google Maps embed fallback

When Leaflet fails to load on the **home** page, `initListingsMap()` hides the
Leaflet container and shows a Google Maps `?output=embed` iframe instead
(`#googleMap`). The iframe `src` comes from a small per-address map:

```js
const mapSources = {
  pedro:  "https://www.google.com/maps?q=Pedro%20II%20El%20Catolico%203%2C%20Zaragoza%20Spain&output=embed",
  movera: "https://www.google.com/maps?q=Movera%207%2C%20Zaragoza%20Spain&output=embed"
};
```

Selecting/searching a listing repoints the iframe by `addressKey`
(`mapSources[property.addressKey]`). This is keyed off the legacy static
`address_key` values, not arbitrary coordinates — so the fallback only covers the
seed addresses. (Detail and editor maps have no iframe fallback; they simply
render nothing if Leaflet is unavailable.)

---

## 7.6 flatpickr — ✅ active

| Aspect | Detail |
| --- | --- |
| Purpose | Accessible date-range pickers for the stay search (home) and the booking widget (property). |
| Where used | `site.js` (`setupDatePickers`: hero + filter check-in/check-out), `property.js` (booking-widget start/end + the availability calendar). |
| Library | `flatpickr@4.6.13` — CSS + JS from `cdn.jsdelivr.net`, plus the Spanish locale `dist/l10n/es.js`. Loaded on `index.html` and `property.html`. |
| Config | `dateFormat: "Y-m-d"`, `altInput: true`, `altFormat: "j M Y"`, `minDate: "today"`, `disableMobile: true`. |
| Locale | `flatpickrLocale()` → `flatpickr.l10ns.es` when the UI language is Spanish, else `"default"`. Locale is re-applied on language switch (`picker.set("locale", …)`). |
| Failure behavior | Every initializer guards `if (typeof flatpickr === "undefined") return;` — native `<input type="date">` remains usable, so date entry degrades gracefully. |

Check-in/check-out are linked: choosing a check-in sets the check-out picker's
`minDate`. Defaults are today → today + 1 month.

---

## 7.7 Tesseract.js (OCR) — ✅ active

| Aspect | Detail |
| --- | --- |
| Purpose | OCR text out of sources with no text layer — scanned PDFs (rendered page-by-page via pdf.js) and image files — so the AI extractor (§7.3) can read them. |
| Where used | `admin-property.js` (`loadTesseract`, `ocrImages`, used inside `extractTextFromFile`). |
| Library | `tesseract.js@5` from `cdn.jsdelivr.net`. |
| Loading | **On-demand.** `loadTesseract()` injects the script tag the *first time* OCR is needed, memoized in `tesseractLoader`. It never weighs down the common digital-PDF / pasted-text path. |
| Config | Worker language `"spa+eng"` (Spanish + English). |
| Failure behavior | OCR errors are caught and return `""` (no text); the autofill then shows `admin.ai.noText`/`admin.ai.empty`. |

**Where OCR kicks in.** `extractTextFromFile` first tries pdf.js for a real text
layer; if a PDF yields < 20 non-whitespace chars it is treated as scanned and its
pages (capped, e.g. 8) are rendered to canvases and OCR'd. Image uploads go
straight to OCR. Progress is reported per page to the editor status line.

> All file reading is **in the browser** — the AI Edge Function only ever
> receives plain text, never file uploads (lower cost, simpler server).

---

## 7.8 Umami (analytics) — ✅ active

| Aspect | Detail |
| --- | --- |
| Purpose | Privacy-friendly, cookieless web analytics — page views + a few custom events. |
| Where used | `site.js` (`trackEvent` → `window.umami?.track`), `property.js` (direct `window.umami?.track`). |
| Script | `https://cloud.umami.is/script.js`, `data-website-id="bbc35688-d574-4fed-af9b-a03f37ed9429"`, loaded `defer` in the `<head>` of `index.html` and `property.html`. |
| Config / secret | None client-side beyond the public website id. |
| PII | **None sent.** Event payloads carry only a property id, a channel, and date strings — no names, emails, or message bodies. |
| Failure behavior | All calls use optional chaining (`window.umami?.track`), so a blocked/missing script is a silent no-op. The detail page waits for the deferred script before firing `view-property`. |

### Custom events

| Event | Fired from | Payload |
| --- | --- | --- |
| `search` | `site.js` hero & filter submit | `{ source: "hero" \| "filters", checkIn, checkOut }` |
| `inquiry-sent` | `site.js` contact form success | — |
| `view-property` | `property.js` on detail load | `{ property: id }` |
| `booking-request` | `property.js` on email/WhatsApp click | `{ property: id, channel: "whatsapp" \| "email" }` |
| `share` | `property.js` share action | `{ property: id }` |

The `booking-request` event's `channel` distinguishes the two MVP booking paths
(mailto vs WhatsApp) — the only telemetry on the unwired-vs-MVP booking decision
(§11).

---

## Provisioning summary (for §12 cross-reference)

| Integration | What to provision | Where the secret/config goes |
| --- | --- | --- |
| Supabase | Project, schema, RLS, `property-photos` bucket, both Edge Functions | `SUPABASE_URL` + anon key → `supabase-config.js`; service role → function env |
| Resend | API key, verified sending domain | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_TO` → `request-booking` secrets |
| DeepSeek | API key + balance | `DEEPSEEK_API_KEY` (+ optional `DEEPSEEK_MODEL`) → `ai-property-assistant` secrets |
| Nominatim | none (public) | — (add a descriptive User-Agent for production) |
| Leaflet / OSM | none (public CDN + tiles) | — |
| flatpickr | none (public CDN) | — |
| Tesseract.js | none (public CDN) | — |
| Umami | Umami Cloud site | public `data-website-id` in the HTML `<head>` |
