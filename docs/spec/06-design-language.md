# Ebrostay v2 Target Spec — §6 Design Language

> Target: branch `redesign/v2`, established 2026-07-20 with the
> `frontend-design` skill. Living reference: **`/[locale]/design`** (the style
> book page renders every token and component in both themes).
> Decision: new identity, **logo kept** (the v1 bridge-over-Ebro mark).

## 6.1 Concept — "the calm ledger of a stay"

Mid-term rentals are contracts measured in months — marketed as "1–12
months", enforced as ≥31 and <365 days, priced by the day at price÷30
(ADR-022/023). The design speaks the month language: disciplined ledger
rules, tabular numerals, month units made tangible. Warmth comes from the
photography; the UI itself stays cool, precise, and trustworthy.

**Availability semantics are system-wide and non-negotiable:**

| Color | Meaning |
| --- | --- |
| river blue | open / informational ("open water") |
| bridge green | selected / yours / live |
| occupied (ink-solid) | taken / closed |

These derive from the logo itself: the green stone bridge, the blue Ebro.

## 6.2 Palette

Defined in `app/app/globals.css` (`:root` + `[data-theme="dark"]`, mapped to
Tailwind utilities via `@theme inline`). Anchors:

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--brand` | `#1f8a57` (the logo green) | `#35a873` | actions, selected |
| `--river` | `#9cc4f0` (the logo river) | `#9cc4f0` | open, info |
| `--river-soft` | `#e9f1fa` | `#182634` | open-month wash, info surfaces |
| `--ink` | `#15251f` | `#e8efea` | headings/strong text (theme-relative!) |
| `--occupied` | `#26362e` | `#46554d` | taken months — **never** derive from `--ink` (it flips with theme) |
| `--page` | `#f6f8f6` limestone | `#0f1713` green-charcoal | page background |

No terracotta/clay: v1's warm accent was deliberately dropped (photography
carries the warmth). Status hues (`--warn`, `--danger`) are reserved for
review/rejection states.

## 6.3 Typography

| Role | Face | Usage |
| --- | --- | --- |
| Display | **Familjen Grotesk** (`--font-display`) | headlines, card titles; tight leading, −0.015em tracking. Chosen 2026-07-22 via the `/design/type` side-by-side (kept warm-grotesque tone, replaced Bricolage — which was also v1's display face — for a genuinely distinct form) |
| Body | **Onest** (`--font-sans`) | everything else |
| Data | **Spline Sans Mono** (`--font-mono`, class `.data`) | prices, dates, month labels, section eyebrows; tabular numerals |

Loaded via `next/font/google` in `[locale]/layout.tsx` (self-hosted at build,
no external font requests — CSP-friendly).

## 6.4 The signature: the month-band

A 12-cell strip — the product's whole domain ("1–12 months", ADR-022; it
was 11 cells until the duration limits moved) made physical. Implemented in
`app/components/MonthBand.tsx`:

- **`MonthBandSelect`** — stay-length control (hero, booking widget). Cells
  1–N green (selected span), rest river-wash. Radiogroup semantics.
- **`AvailabilityBand`** — a listing's next 12 calendar months as thin bars.
  **Three states**, because stays start mid-month and a binary band would
  mislead (product-owner call, 2026-07-21): river = fully open, split
  river/occupied = partially booked, occupied-solid = taken. Labels are
  **3-letter localized months** (`Intl` short, periods stripped — single
  initials were ambiguous: J = ene/jun/jul); a hairline tick plus a small
  `’YY` mark under January indicate the year boundary (2026-07-22 call).
  `role="img"` with a translated summary label. The
  band is a glanceable SUMMARY only — day-level truth lives in the
  `DateRangePicker` on the property page. Both share one color language.

The load animation (`.month-cell-enter`, 35 ms stagger) is the design's one
orchestrated motion moment. Everything else transitions at 150 ms.
`prefers-reduced-motion` disables all of it.

**Restraint rule:** the band appears only where it carries data (hero
selector, cards, calendars). It is NOT a decorative divider — an 11-segment
ornamental rule was considered and rejected.

## 6.5 Structural voice

- **Ledger rule** (`.ledger-rule`): hairline + small-caps mono label — the
  section divider. Labels are content words, never fake numbering.
- Radii: `--radius-card` 14 px, `--radius-control` 8 px.
- Elevation: two shadows only (`--shadow-card`, `--shadow-pop`).
- Focus: 2 px river-tinted outline (`--ring`), offset 2 px, on
  `:focus-visible` — never removed.

## 6.6 Component inventory (Task 5 scope)

`app/components/`: `site/Header` (sticky, frosted `bg-surface/92`),
`site/Footer`, `site/Logo` (inline SVG mark + wordmark), `site/ThemeToggle`
(persists `ebrostay-theme`, pre-paint bootstrap in layout), 
`site/LanguageSwitch` (locale-preserving route swap), `ui/Button`
(primary/secondary/ghost/danger × sm/md/lg), `ui/Field` + `Input`/`Textarea`
(label/hint/error, `aria-describedby` wired), `ui/Select` (**Radix UI
Select** — trigger styled identically to `Input`; the popup is ours: themed,
opens below the trigger, identical across browsers), `ui/Badge` (the
marketplace status vocabulary), `ui/Dialog` (native `<dialog>`),
`MonthBand`, `PropertyCard` (photo, badges, specs line, price in data voice,
availability band).

## 6.7 Copy rules (carried into every later task)

- Every user-facing string exists in `messages/es.json` **and** `en.json`;
  Spanish is the default register. ICU plurals for counts (`{n, plural, …}`).
- Prices: force digit grouping (`useGrouping: "always"` — es-ES alone doesn't
  group 4-digit numbers; rule R-X-2 (§8.1/§8.2) requires `1.350`).
- Buttons say what they do ("Solicitar reserva", never "Enviar"); money is
  always labelled an estimate (R-CORE-2).
- **Voice** (adopted from the v1 design system's brand-voice guideline —
  §6.9): plain, confident, local; lead with the benefit ("Book your home in
  Zaragoza in minutes"), never platform-speak ("seamless booking solutions");
  be specific and unhedged ("Free cancellation up to 48h before check-in",
  never "policies may apply.*"). Vague hedging erodes trust.

## 6.8 Decisions & notes from the design pass

- Rejected directions: cream+serif+terracotta (template default, and too close
  to v1's stone/clay); near-black + acid accent; broadsheet hairlines.
- Dark mode bug fixed during review: occupied cells originally used
  `--ink`/70, which is *light* in dark theme — inverted the semantics. Hence
  the dedicated `--occupied` token (6.2).
- es-ES price grouping and `baños` pluralization bugs caught on the style
  book; both fixed in messages/PropertyCard.
- Header frost lowered from /85 to /92 opacity — display type smeared through
  too loudly under the sticky header.
- Date picking: **react-day-picker v10** (`ui/DateRangePicker`), inline range
  calendar themed via `.rdp-root` token overrides in `globals.css` — selected
  span = brand green, booked days = occupied-solid with a diagonal slash
  drawn behind the number (hotel-calendar mark), today =
  river underline; `es`/`en-GB` locales built in. Replaces v1's flatpickr,
  which needed hand-patched Safari/dark-mode/month-dropdown CSS. Booked spans
  are passed as both `disabled` and the `booked` modifier; `excludeDisabled`
  guards user-drawn ranges from crossing them.
- Selects: native `<select>` reviewed and replaced with **Radix UI Select**
  (2026-07-21, product-owner call). Safari mis-sized the native closed
  control, and macOS anchors the native menu over the control instead of
  below it. Radix gives an owned, themed popup below the trigger with the
  a11y/keyboard machinery maintained upstream — unlike v1's hand-rolled
  dropdown (its Safari/stacking bugs are in the v1 git history). Native
  `<option>` elements are not used anywhere.

## 6.9 Relationship to the v1 design system (2026-07-21 A/B)

The v1 DS (github.com/ebrostay/ebrostay-design-system, synced to the
"Ebrostay Design System" Claude Design project) was compared against this
system after the v2 identity shipped. **Convergences** (independent — the v2
pass never saw the DS): Bricolage Grotesque as display face (later replaced:
once the convergence surfaced, a `/design/type` side-by-side led to
**Familjen Grotesk** on 2026-07-22 — warm-grotesque tone kept, v1's exact
face deliberately not), mono for prices/refs, hairline-first restraint,
`data-theme` dark mode, plain-voice copy. **Deliberate divergences kept** (the "restart" axes, product-owner
call): no clay/terracotta, cool limestone vs warm stone, green-charcoal vs
warm-black dark, tighter radii, the month-band signature and availability
color semantics.

**Adopted from the DS** (identity-neutral craft, approved 2026-07-21):
1. Logo asset pack → `app/public/brand/` (wordmark ± inverse, mark inverse,
   dark app icon, SVG favicon — wired via layout `metadata.icons`). The
   header keeps the HTML wordmark (theme-aware); SVGs are for favicons, OG,
   email.
2. Fluid display type scale (`--text-2xl…6xl` clamp() steps + tight
   line-heights) overriding Tailwind's fixed steps.
3. Dark-mode translucent hairlines (`--line*` as white-alpha on dark) and
   the `--star` rating-gold token (river-deep already serves the info role).
4. The skeleton loader pattern (`.skeleton`, reduced-motion-gated), restyled
   with v2 tokens.
5. Brand-voice do/don'ts folded into §6.7.

The DS's React UI kits (Header/Home/Results/Detail/Auth) serve as
**feature-coverage checklists** for the public-pages and auth tasks — never
as styling sources.
