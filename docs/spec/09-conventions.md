# Ebrostay Reconstruction Spec — §9 Conventions (i18n, Theme, SEO, Accessibility)

> Baseline: as-built (branch `main`, 2026-06-25). Status tags: ✅ active · 🔜 planned/unwired · 🗑️ dormant-to-remove · 🐞 suspected bug · 🚫 out-of-scope (MVP).

This section captures the cross-cutting rules every page obeys: how text is
translated and switched between Spanish and English; how prices and dates are
formatted per locale; how the light/dark theme is selected and stored; the SEO,
AI-crawler and PWA surface; the accessibility patterns; and the visual/style
token system. Sibling cross-references: data model (§4), business rules and the
billed-months / commission math (§5), per-page functional detail (§6),
integrations such as Umami / Leaflet / flatpickr (§7), decision log (§11).

The product is **bilingual ES/EN as a first-class requirement** — every
user-facing string lives in a dictionary, not in markup, and both languages must
round-trip cleanly. Spanish is the default and the fallback.

---

## 9.1 Internationalization (i18n) ✅

### 9.1.1 Mechanism overview

There is **no i18n library and no build step**. Translation is a plain in-page
dictionary plus a re-render pass over the DOM. The pieces:

| Piece | Where | Role |
| --- | --- | --- |
| `translations` object | `data.js` (top of file) | The dictionary: `translations.es` and `translations.en`, each a flat map of `key → string`. |
| `data-i18n` attribute | every page's HTML | Marks an element whose **text content** is a translation key. |
| `data-i18n-attr` attribute | HTML | Marks an element whose **attribute(s)** are translation keys (e.g. `alt`, `placeholder`, `content`). |
| `currentLanguage` | `site.js` / `property.js` | The active language code (`"es"` or `"en"`). |
| `t(key)` | per page | Lookup helper with fallback. |
| `interpolate(key, values)` | per page | `t()` + `{placeholder}` substitution. |
| `applyLanguage(language)` | per page | The re-render pass. |
| Language buttons | header (`.language-switch`) | `<button data-lang="es">` / `data-lang="en">` toggles. |

### 9.1.2 The dictionary (`translations` in `data.js`)

`data.js` opens with two constants and the dictionary:

```js
const CONTACT_EMAIL = "info@ebrostay.com";
const WHATSAPP_NUMBER = "34678715418";

const translations = {
  es: { "meta.title": "Ebrostay | Alquiler corporativo de media estancia en Zaragoza", /* … */ },
  en: { "meta.title": "Ebrostay | Mid-term corporate rentals in Zaragoza", /* … */ }
};
```

- **Flat, dotted keys.** Keys are dot-namespaced strings (e.g. `"hero.title"`,
  `"book.commission"`) but the object is **one level deep** — the dot is part of
  the literal key, not a nested path. ~345 keys per language.
- **`es` and `en` must stay key-aligned.** A missing `en` key silently falls
  back to `es` (see lookup below), so untranslated strings render in Spanish
  rather than as a raw key.
- **Placeholders** use single curly braces: `{count}`, `{price}`, `{date}`,
  `{guests}`, `{email}`, `{amount}`, `{floor}`, `{size}`, `{rating}`,
  `{property}`. `interpolate()` substitutes them with `replaceAll`.
- **Property copy lives in the dictionary too** (sample-data mode): keys like
  `properties.pedro1.name`, `.area`, `.copy`, `.details`, `.priceNote`. When the
  backend is configured these are superseded by per-row DB text (see §4/§5); in
  sample-data mode they are the source.

### 9.1.3 Key namespaces

The namespace prefix groups keys by screen/area. Full set (status note where it
helps):

| Namespace | Scope |
| --- | --- |
| `meta.*` | Per-page `<title>` and meta description strings (`meta.title`, `meta.description`, `meta.account.title`, `meta.about.title`, `meta.property.title`). |
| `nav.*` | Header/footer nav + CTA labels. |
| `hero.*` | Home hero copy, trust badges, image alt. |
| `search.*` / `filters.*` / `quick.*` | Search bar, filter panel, quick-filter chips. |
| `market.*` | Listings section heading. |
| `status.*` | Result-count live-region messages (`status.all`, `status.matches`, `status.one`, `status.none`, `status.saved*`, `status.invalid`). |
| `empty.*` | Empty-results state. |
| `listing.*` / `badge.*` / `type.*` / `amenity.*` / `spec.*` | Listing card + property spec line. |
| `detail.*` / `cond.*` / `movein.*` / `cal.*` / `gallery.*` | Property-detail page sections. |
| `book.*` / `booking.*` / `bookings.*` | Booking widget, booking detail page, account bookings list. |
| `request.*` / `whatsapp.*` | mailto/WhatsApp request-summary builder. |
| `account.*` / `auth.*` | Account page + auth dialog (login/signup/reset/recover, Google/Outlook SSO). |
| `partner.*` / `owners.*` | Owner portal + owners marketing page. |
| `admin.*` | Admin panel + property editor (largest namespace; includes `admin.ai.*` for the DeepSeek assistant, `admin.geocode*`, `admin.billsPolicy.*`). |
| `guest.*` | Tenant guest-info fields. |
| `about.*` / `why.*` / `split.*` / `how.*` | Marketing/about sections. |
| `contact.*` / `form.*` / `email.*` | Contact form + mailto template. |
| `map.*` | Home map panel. |
| `properties.*` | Sample-data property copy (per-property). |
| `notfound.*` | Property not-found state. |
| `share.*` | Share button. |
| `common.*` | Yes/No. |

### 9.1.4 Lookup, fallback, interpolation

```js
const t = (key) => translations[currentLanguage][key] || translations.es[key] || key;

function interpolate(key, values) {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, value),
    t(key)
  );
}
```

Fallback chain: **active language → Spanish → the raw key**. The raw-key
fallback means a totally missing key renders its dotted string verbatim (a
visible-but-survivable failure mode), which is the intended last resort.

### 9.1.5 `applyLanguage()` — the re-render pass

Switching language (or first paint) calls `applyLanguage(language)`. On the home
page (`site.js`) it does:

```js
function applyLanguage(language) {
  currentLanguage = translations[language] ? language : "es";   // guard → es
  localStorage.setItem("ebrostay-language", currentLanguage);     // persist
  document.documentElement.lang = currentLanguage;               // <html lang>
  document.title = t("meta.title");                              // tab title

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);                         // text nodes
  });

  document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    el.dataset.i18nAttr.split(";").forEach((pair) => {            // attributes
      const [attribute, key] = pair.split(":");
      if (attribute && key) el.setAttribute(attribute, t(key));
    });
  });

  languageButtons.forEach((b) => {                               // toggle UI
    b.classList.toggle("is-active", b.dataset.lang === currentLanguage);
    b.setAttribute("aria-pressed", String(b.dataset.lang === currentLanguage));
  });

  Object.values(datePickers).forEach((p) => p.set("locale", flatpickrLocale()));
  setAuthMode(authMode);                                          // re-render dialog
  document.querySelectorAll("[data-whatsapp]").forEach((l) => {   // re-build links
    l.href = whatsappLink(t("whatsapp.general"));
  });
  renderProperties();                                             // re-render cards
}
```

What a rebuild must reproduce, in order:

1. **Guard** the language to a known code, defaulting to `es`.
2. **Persist** to `localStorage["ebrostay-language"]`.
3. Set `<html lang>` and `document.title`.
4. Replace `textContent` for every `[data-i18n]` element.
5. Replace attributes for every `[data-i18n-attr]` element. Syntax is
   `attr:key` pairs joined by `;` — e.g. `data-i18n-attr="content:meta.description"`
   or `data-i18n-attr="alt:hero.imageAlt"`.
6. Sync the language toggle's `is-active` class and `aria-pressed`.
7. Re-point flatpickr locale (Spanish picker uses `flatpickr.l10ns.es`,
   otherwise `"default"`).
8. Re-render any dynamic regions (auth dialog, WhatsApp links, the listing grid /
   property detail) so dictionary-driven dynamic content also flips.

**`data-i18n-attr` syntax (the contract):**

```html
<meta name="description" data-i18n-attr="content:meta.description" content="…">
<img alt="…" data-i18n-attr="alt:hero.imageAlt">
```

> 🐞 / 🔜 **note for the rebuild:** `data-i18n` overwrites `textContent`, so an
> element that mixes a translated label with markup (icons, nested spans) must
> wrap only the text node — see the `detail.back` pattern
> (`<a>&larr; <span data-i18n="detail.back">…</span></a>`). Putting `data-i18n`
> on the `<a>` itself would wipe the arrow.

### 9.1.6 Property page i18n + SEO meta updates (`property.js`)

`property.js` has its own `applyLanguage()` and additionally **re-renders the
detail content and the SEO/social meta** in the active language via
`renderDetail()` → `updateSeoTags()`:

- `document.title`, `meta[name="description"]`, `meta[property="og:title"]`,
  `meta[name="twitter:title"]`, `meta[property="og:description"]`,
  `meta[property="og:image"]` (first photo), and the canonical `<link>` are all
  rewritten from the property's translated name/copy.
- The JSON-LD `<script id="propertyJsonLd">` is removed and rebuilt (see §9.3.4).

So switching language on a property page updates the social-share preview text,
not just the visible copy.

### 9.1.7 Persistence and default language

| Concern | Rule |
| --- | --- |
| Storage key | `localStorage["ebrostay-language"]` — `"es"` or `"en"`. |
| Default (no stored value) | Browser language: `navigator.language?.startsWith("es") ? "es" : "en"`. |
| Initialization | `let currentLanguage = localStorage.getItem("ebrostay-language") \|\| (navigator.language?.startsWith("es") ? "es" : "en");` then `applyLanguage(currentLanguage)` at end of script. |
| Static HTML default | `<html lang="es">` and Spanish text are baked into the markup, so the first paint (before JS) is Spanish; `applyLanguage` then corrects to the stored/detected language. |
| Progressive enhancement | `enhance.js` independently reads `ebrostay-language` and re-applies `[data-i18n]` / `[data-i18n-attr]` for content it injects, writing the same storage key. |

---

## 9.2 Formatting conventions ✅

### 9.2.1 Prices — `formatPrice(number, language)` (`data.js`)

All euro amounts on cards and the property page go through one shared helper, so
formatting is locale-correct and consistent:

```js
function formatPrice(number, language) {
  const amount = Number(number) || 0;
  const locale = language === "en" ? "en-GB" : "es-ES";
  const hasCents = Math.round(amount * 100) % 100 !== 0;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: hasCents ? 2 : 0
  }).format(amount);
  return `${formatted} EUR`;
}
```

| Locale | Thousands sep. | Whole euros | With cents | Currency token |
| --- | --- | --- | --- | --- |
| ES (`es-ES`) | period `.` | `1.350 EUR` | `1.350,50 EUR` | literal ` EUR` suffix |
| EN (`en-GB`) | comma `,` | `1,350 EUR` | `1,350.50 EUR` | literal ` EUR` suffix |

Rules:

- **No decimals on whole-euro amounts** — `maximumFractionDigits` is 0 unless the
  amount actually has cents (`hasCents`), in which case 2 decimals.
- The string ` EUR` is **appended literally**, not via `Intl` currency style
  (this keeps "EUR" rather than the "€" symbol in body text).
- **Map pins are the one exception:** the pin label swaps `EUR → €`
  (`formatPrice(...).replace("EUR", "€").trim()`) to stay compact.
- Per-month display uses `interpolate("listing.price", { price })` →
  `"{price}/mes"` (ES) / `"{price}/month"` (EN).

### 9.2.2 Dates — `formatDate(date)` (`site.js` / `property.js`)

```js
function formatDate(date) {
  return new Intl.DateTimeFormat(currentLanguage === "es" ? "es-ES" : "en-GB", {
    day: "2-digit", month: "short", year: "numeric"
  }).format(date);
}
```

| Locale | Pattern | Example |
| --- | --- | --- |
| ES (`es-ES`) | `dd mmm yyyy` (short month, lower-case, day first) | `01 jul 2026` |
| EN (`en-GB`) | `dd mmm yyyy` (day first) | `01 Jul 2026` |

- Date strings stored as ISO `YYYY-MM-DD` are parsed as **local midnight** via
  `new Date(\`${value}T00:00:00\`)` (`dateValue`) to avoid UTC off-by-one.
- Booking/availability math (billed months, end-exclusive, overlap) is in §5;
  this section covers display only.

---

## 9.3 Theme — light / dark ✅

### 9.3.1 Mechanism

Dark mode is driven by a single attribute, `data-theme="dark"`, on the
`<html>` element. Absence of the attribute = light (the default). The CSS dark
block re-points **only the semantic alias tokens**; raw color scales stay fixed
(see §9.6).

| Concern | Rule |
| --- | --- |
| Switch | `document.documentElement.setAttribute("data-theme", "dark")` / `removeAttribute` for light. |
| Storage key | `localStorage["ebrostay-theme"]` — `"dark"` or `"light"`. |
| OS fallback | When nothing is stored, follow `(prefers-color-scheme: dark)`. |
| `color-scheme` | The dark block sets `color-scheme: dark` so form controls/scrollbars match. |
| `theme-color` meta | `<meta name="theme-color" content="#1f8a57">` (brand green) on every page; the manifest `theme_color` matches. |

### 9.3.2 Pre-render no-flash script (inline in every `<head>`)

To avoid a light-to-dark flash, an inline blocking script runs **before** body
paint, in every one of the 11 pages' `<head>`:

```html
<script>(function(){try{
  var stored = localStorage.getItem("ebrostay-theme");
  var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (stored === "dark" || (stored === null && prefersDark)) {
    document.documentElement.setAttribute("data-theme","dark");
  }
}catch(e){}})();</script>
```

Logic: explicit stored `"dark"` wins; if nothing is stored, follow the OS; a
stored `"light"` (non-null, non-`"dark"`) stays light even if the OS prefers
dark. Wrapped in `try/catch` so private-mode storage errors are non-fatal.
**Light-first by design** — the page is light unless something opts it into dark.

### 9.3.3 Theme toggle (injected by `enhance.js`)

The toggle button is **not in the static HTML**; `enhance.js` injects a
`.theme-toggle` button into `.header-actions` (before the language switch):

- Reads/writes `localStorage["ebrostay-theme"]`.
- Icon flips moon ⇄ sun (Lucide icons) with the current theme.
- `aria-label` is localized: ES `"Activar modo oscuro"` / `"Activar modo claro"`,
  EN `"Switch to dark mode"` / `"Switch to light mode"`, picked from the active
  language button.
- Toggling sets/removes `data-theme`, persists, re-syncs the icon, and refreshes
  the icon set.

### 9.3.4 (continued in §9.6) — the CSS custom-property system underpins the theme.

---

## 9.4 SEO / AI / PWA ✅

### 9.4.1 Per-page `<head>` (static)

Each page ships hand-written, Spanish-default head tags; JS upgrades them per
language/property at runtime (see §9.1.6).

| Tag | Home (`index.html`) | Property (`property.html`) |
| --- | --- | --- |
| `<title>` | `data-i18n="meta.title"` | static, then `"{name} \| Ebrostay"` via JS |
| `meta description` | `data-i18n-attr="content:meta.description"` | static, then per-property via JS |
| `meta robots` | (default index) | `index,follow` |
| `og:title` / `og:description` / `og:type` / `og:image` | present (`og:type=website`, OG image `assets/ebrostay-og.jpg`) | present; title/description/image rewritten per property by JS |
| `twitter:title` | — | present, rewritten by JS |
| `link canonical` | `https://ebrostay.com/` | `#canonicalLink`, rewritten to `…?id={id}` by JS |
| `theme-color` | `#1f8a57` | `#1f8a57` |
| icons / manifest | favicon SVG + apple-touch + `site.webmanifest` | same |

### 9.4.2 JSON-LD structured data

- **Home / general pages:** a static `RealEstateAgent` (Organization-style) block
  — `name`, `url`, `logo`, `image`, `email`, `description`, `address`
  (Zaragoza / Aragón / ES), `areaServed`, `priceRange: "€€"`.
- **Property pages:** a dynamic `<script id="propertyJsonLd" type="application/ld+json">`
  rebuilt by `updateSeoTags()` on every render/language change. `@type` maps from
  the property type:

  | property.type | schema.org `@type` |
  | --- | --- |
  | `apartment` | `Apartment` |
  | `room` | `Room` |
  | `home` | `House` |
  | (unknown) | `Accommodation` |

  The object carries `name`, `description` (rich-text stripped), `url`, up to 6
  `image`s, `PostalAddress`, `GeoCoordinates` (lat/lng), optional
  `numberOfBedrooms` / `numberOfBathroomsTotal` / `floorSize` (m², `unitCode MTK`),
  `occupancy` (max guests), an `Offer` with `price`/`priceCurrency EUR` and a
  per-`MONTH` `UnitPriceSpecification`, and a `RealEstateAgent` `provider`
  (Ebrostay).

### 9.4.3 `sitemap.xml`

Static XML listing 7 URLs: home (`priority 1.0`), `about.html` (0.5),
`privacy.html` (0.3), and the four sample properties
`property.html?id={pedro1,pedro2,movera0,movera1}` (0.8 each). Referenced from
`robots.txt`. **Rebuild note:** property URLs are hard-coded — a backend-driven
catalogue would need this regenerated.

### 9.4.4 `robots.txt`

- `User-agent: *` → `Allow: /`, with `Disallow` on the private pages:
  `/admin.html`, `/admin-property.html`, `/account.html`, `/booking.html`.
- A second block **explicitly welcomes AI crawlers** by name — `GPTBot`,
  `OAI-SearchBot`, `ChatGPT-User`, `ClaudeBot`, `Claude-Web`, `PerplexityBot`,
  `Google-Extended`, `Applebot-Extended`, `CCBot` — same Allow/Disallow set.
- `Sitemap: https://ebrostay.com/sitemap.xml`.

### 9.4.5 `llms.txt`

A human/AI-readable summary at the site root, **bilingual (EN then ES)**:
a one-paragraph product description, a **Properties** list (4 sample units with
URL, address, from-price), a **How booking works** 3-step summary, and a
**Contact** block (email `info@ebrostay.com`, Zaragoza, website, about URL).
Intended for LLM crawlers welcomed in `robots.txt`.

### 9.4.6 PWA — `site.webmanifest`

```json
{
  "name": "Ebrostay", "short_name": "Ebrostay",
  "description": "Furnished mid-stay rentals in Zaragoza — book online, fully digital.",
  "start_url": "/", "display": "standalone",
  "background_color": "#faf9f6", "theme_color": "#1f8a57",
  "icons": [ 192px PNG, 512px PNG, favicon.svg "any" ]
}
```

`background_color` is the light page surface (`--surface-page` / `#faf9f6`);
`theme_color` is brand green. Linked from every page via
`<link rel="manifest" href="site.webmanifest">` plus favicon SVG and
`apple-touch-icon` (`assets/ebrostay-icon-180.png`).

### 9.4.7 `.nojekyll`

An empty `.nojekyll` file at the repo root disables GitHub Pages' Jekyll
processing so files/folders beginning with `_` and the raw asset tree are served
verbatim. **Required for the static deploy** (see §3).

---

## 9.5 Accessibility ✅

### 9.5.1 Landmarks & semantics

- One `<header class="site-header">`, `<main>` (with `id="top"` on home,
  `class="detail-page"` on property), `<footer>` per page.
- Brand/footer logos: decorative mark uses `alt=""`; the footer logo carries
  `alt="Ebrostay"`.
- Hero image has a translated `alt` via `data-i18n-attr="alt:hero.imageAlt"`.
- Listing/floor-plan images carry translated `alt` text; gallery images use
  `loading="lazy"`.

### 9.5.2 Live regions (`role="status"` / `aria-live`)

| Region | Markup | Purpose |
| --- | --- | --- |
| Result-count status | `<span id="availabilityStatus" role="status">` | Announces `status.*` count messages after filtering. |
| Listings grid | `<div id="propertyGrid" aria-live="polite">` | Cards re-render politely; SR users hear results update. |
| Empty state | `<div class="empty-state" role="status">` | Announces "no homes" state. |
| Auth dialog message | `<p id="authMessage" role="status">` | Login/signup feedback. |
| Toasts | created with `setAttribute("role","status")` | Share-copied etc. |

### 9.5.3 Toggle / disabled state semantics

- **`aria-pressed`** on toggle-style buttons reflecting on/off: language buttons,
  quick-filter chips, floor-plan zoom button, and the audience (company/owner)
  toggle. `applyLanguage` / filter handlers keep `aria-pressed` in sync with
  visual `is-active`.
- **`aria-disabled`** (not the `disabled` attribute) on the booking
  email/WhatsApp buttons when the date range is invalid — the click handler still
  fires to *nudge* the visitor (explain why) rather than being inert. Rebuilds
  must keep this "soft-disabled, still clickable to explain" behavior.
- Audience toggle uses `role="radiogroup"` with a localized `aria-label`.

### 9.5.4 Focus management — the `#book` anchor transfer

When a listing card's "Request" link points to `property.html…#book`, the
property page transfers focus into the booking widget rather than leaving it on
the page top:

1. Resolve the target: the booking widget if visible, else the `#book` anchor.
2. `scrollIntoView({ behavior: "smooth", block: "center" })`.
3. Pick a focus target — the widget heading (`h4`) or the anchor's heading;
   give it `tabindex="-1"` if it isn't natively focusable.
4. **Claim focus *after* async widgets settle.** The Leaflet map grabs focus
   while it initializes, so focus is claimed on `window "load"` (or, if already
   loaded, after a double `requestAnimationFrame`), with `preventScroll: true`
   so the smooth scroll isn't clobbered.

This deferred-focus ordering is load-bearing — a naive immediate `.focus()` is
stolen by the map. Calendar inputs that are programmatic-only are hidden from AT
(`aria-hidden="true" tabindex="-1"`).

### 9.5.5 Keyboard / motion

- Interactive controls are real `<button>` / `<a>` elements (keyboard-operable by
  default); icon-only buttons carry `aria-label` (share, gallery prev/next/close,
  theme toggle). Inline SVG icons use `aria-hidden="true"`.
- Motion: scroll-reveal animations respect `prefers-reduced-motion` (a reduced
  block in `styles.css`); spring/`ease-*` tokens are defined in `:root` (§9.6).

---

## 9.6 Visual / style system ✅

Summarized from `style-guide-audit.md` (2026-06-14 audit; all findings since
fixed in the same change set). The site mirrors the **Ebrostay Design System**
tokens in `styles.css :root`, then aliases legacy variable names to them so older
rules keep working.

### 9.6.1 Design language

Warm Mediterranean palette, **light-running** type (display/headings at weight
**600**, body 400, 700 reserved for rare accents), a **flat** elevation system
(hairline borders do the separating, shadows kept light), consolidated radii,
tracked-out uppercase eyebrows, and glass/blur chrome over imagery — plus a full
dark theme (§9.3).

### 9.6.2 Token system (`styles.css :root`)

Rules reference **semantic aliases**, never raw scales, so the dark block
(`[data-theme="dark"]`) can re-point everything in one place.

| Group | Tokens (representative) |
| --- | --- |
| Color scales (fixed) | `--green-50…900` (brand `#1f8a57` = `--green-500`), `--clay-50…900` (terracotta `#d9632a`), `--stone-0…900` warm neutrals, plus `--blue-500 --amber-500 --red-500`. |
| Semantic text | `--text-strong / -body / -muted / -subtle / -inverse / -brand`. |
| Semantic surfaces | `--surface-page (#faf9f6) / -card / -sunken / -inverse / -brand-soft / -accent-soft`. |
| Glass | `--glass-strong`, `--glass-light`, `--glass-blur: 16px`. |
| Borders | `--border-subtle / -default / -strong` (hairlines). |
| Brand/feedback | `--brand`, `--brand-hover`, `--brand-active`, `--accent`, `--info`, `--warning`, `--danger`, `--focus-ring (alpha 0.40)`, `--star #e6a52a`. |
| Spacing (4px base) | `--space-1…16` (`0.25rem`→`10rem`). |
| Type families | `--font-display` Bricolage Grotesque, `--font-sans` Hanken Grotesque, `--font-mono` JetBrains Mono. |
| Type scale | fixed `--text-xs…xl` + fluid `clamp()` `--text-2xl…6xl` (display caps at `4.75rem`/76px). |
| Weights | `--weight-body 400`, `--weight-medium 500`, `--weight-heading/-display/-emphasis 600`, `--weight-strong 700`. |
| Leading / tracking | `--leading-tight 1.08 … -relaxed 1.65`; `--tracking-tight -0.02em`, `--tracking-caps 0.08em` (eyebrows). |
| Radii | `--radius-sm 8 / -md 12 / -lg 18 / -xl 24 / -2xl 30 / -pill 999px`. |
| Shadows (flat) | `--shadow-xs…xl` (warm-tinted, low alpha), `--shadow-brand` (green, hover only). |
| Motion | `--ease-out / -inout / -spring`; `--dur-fast 120ms / -base 200ms / -slow 360ms`. |
| Legacy aliases | `--ink → --text-strong`, `--paper → --surface-page`, `--line → --border-subtle`, `--green → --brand`, `--radius → --radius-md`, `--shadow → --shadow-lg`, etc. |

### 9.6.3 Type & component conventions

- **Fonts** are loaded from Google Fonts: Bricolage Grotesque (display), Hanken
  Grotesque `400;500;600;700` (body/UI), JetBrains Mono `400;500;600` (prices,
  references, stats). The same `<link>` is used on every page.
- **Mono numerals:** prices, reference codes and stat figures use the mono font.
- **Eyebrows / kickers:** uppercase, `--tracking-caps` (0.08em), weight 600.
- **Hero display:** capped at `--text-6xl`, line-height ≥ 1.08, tracking
  `-0.02em`.
- **Voice/casing:** buttons sentence-case; Spanish-first concrete copy; no emoji
  in UI chrome (the WhatsApp button keeps its third-party brand green by design).
- **Glass:** `backdrop-filter: blur(16px)` on the sticky header and hero search,
  used over imagery.
- **Focus:** 3px green ring via `--ring-focus`.

### 9.6.4 Theme re-point (dark)

`[data-theme="dark"]` sets `color-scheme: dark` and overrides the semantic text/
surface/border aliases to warm near-black surfaces (e.g. `--surface-page #15140f`,
`--surface-card #1f1d17`, `--text-strong #f5f3ee`, `--text-brand → --green-300`),
keeping the Mediterranean warmth at night. Components adapt for free because they
consume aliases, not raw values.

---

### Cross-references

- Billed-months math, commission (15% capped at one month), overlap/availability:
  **§5**.
- Per-page control/state/copy inventories (the ES/EN strings in context): **§6**.
- Umami analytics, Leaflet/OSM, flatpickr, Nominatim, DeepSeek, Resend: **§7**.
- Data model for property fields surfaced here (`type`, `bills_policy`,
  lat/lng, `priceNumber`): **§4**.
- Rationale (no-online-payment, static-site, dark-mode adoption): **§11**.
