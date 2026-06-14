# Style-guide adherence audit — Ebrostay website

**Date:** 2026-06-14
**Scope:** The website in this repo (`/home`) checked against the **Ebrostay Design System** ("the style guide") in the `ebrostay-design-system` repo (`project/tokens/*`, `project/SKILL.md`, `project/readme.md`, `project/guidelines/*`).
**Method:** Static review of `styles.css` (3,085 lines), the page HTML, and JS. No browser rendering.

> The design system is the source of truth: warm Mediterranean palette, **light-running** type (display/headings at weight **600**), a **flat** elevation system (hairlines, not shadows), consolidated radii, tracked-out uppercase eyebrows, glass/blur over imagery, and a full dark theme.

---

## Verdict at a glance

The website is **visually in the right family** — correct fonts, the Ebro-green/terracotta/stone palette, glass search bar, mono numerals, scroll-reveal, reduced-motion support. But it **does not consume the design-system tokens** (it re-declares its own ad-hoc variable set), and it **systematically breaks the type-weight rule**, which is the brand's defining "calm, light" lever.

| Area | Status | Notes |
|---|---|---|
| Fonts (families) | ✅ Good | Bricolage / Hanken / JetBrains Mono loaded |
| Color palette (hues) | 🟡 Mostly | Right palette, a few off-token greens/surfaces |
| **Type weights** | 🔴 **Off-spec** | 850/900 dominate; spec wants 600 |
| Eyebrows (uppercase tracking) | 🔴 Off-spec | `letter-spacing: 0` instead of tracked-out |
| Radii | 🟡 Partial | Off-scale values (3/6/10/13/16/28px) reintroduced |
| Elevation / shadows | 🟡 Heavier | Higher opacities than the "flat" spec |
| Tokenization | 🔴 Diverged | Own variable names, not the DS tokens |
| Dark mode | 🔴 Missing | DS ships a full `[data-theme="dark"]`; site has none |
| Motion / states | ✅ Good | reveal, reduced-motion, spring easing present |
| Glass / blur | ✅ Good | used on header + search, over imagery |

---

## What already adheres well

- **Type families** — `Bricolage Grotesque` (display), `Hanken Grotesque` (body), `JetBrains Mono` (prices/refs) are loaded and used; mono is applied to prices/stats (`styles.css:2963-3024`).
- **Palette hues** — core tokens match the DS exactly: `--green #1f8a57`, `--clay #d9632a`, `--paper #faf9f6`, `--star #e6a52a`, stone neutrals.
- **Glass/blur signature** — `backdrop-filter: blur()` on the sticky header and the hero search (`styles.css:88, 3039`), used over imagery as intended.
- **Motion discipline** — scroll-reveal (`.reveal`/`.is-in`, `enhance.js`), spring easing token, and a `prefers-reduced-motion` block (`styles.css:3079`).
- **Focus ring** — a 3px green ring on inputs (`styles.css:2633`), close to the DS `--ring-focus`.
- **Voice/casing** — buttons are sentence case, copy is local and concrete (Spanish-first with i18n), no emoji in UI. Matches the brand-voice guidelines.

---

## Findings & improvements

### 1. 🔴 Type weights run far too heavy (highest-impact)
**Spec:** "The system runs **LIGHT**. Display & headings sit at **600**, not 700/800… `--weight-strong: 700` reserve for rare, deliberate accents. Use the semantic weight aliases, not raw numbers." (`readme.md`, `tokens/typography.css`)

**Found:** Of ~111 `font-weight` declarations in `styles.css`, only **4** are at 600. The histogram:

| weight | 600 | 650 | 700 | 750 | 760 | 800 | 850 | 880 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|
| count | 4 | 3 | 21 | 11 | 1 | 10 | **30** | 1 | **14** | 1 |

`850` is the single most common weight; `900` is used 14×. Examples: `.eyebrow{font-weight:900}` (`:194`), `.nav-links{font-weight:760}` (`:111`), `.language-option{font-weight:900}` (`:130`), `.nav-cta{font-weight:850}` (`:140`).

**Compounding bug:** the Google Fonts import only loads weights **up to 800** (`…Hanken+Grotesque:wght@400;500;600;700;800…`). All **46** declarations at 850/880/900/950 request weights that aren't loaded — the browser clamps/synthesizes them, so they render inconsistently *and* miss the brand's intended lightness.

**Improvement:**
- Map the site to the semantic weight scale: **600** for display/headings/emphasis, **400** for body, **500** for medium UI, **700** only for rare deliberate accents.
- Replace every 750/760/850/880/900/950 declaration accordingly (eyebrows, nav, CTAs, stats).
- Stop requesting unloaded weights once the above is done.

---

### 2. 🔴 Uppercase eyebrows are not tracked out
**Spec:** "Uppercase is reserved for small **eyebrow** labels (tracked-out)" — `--tracking-caps: 0.08em`.
**Found:** `.eyebrow, .section-kicker { text-transform: uppercase; letter-spacing: 0; }` (`styles.css:189-197`). Uppercase with zero tracking reads cramped and off-brand. (One later rule correctly uses `0.08em` at `:2984`, so the system is inconsistent with itself.)
**Improvement:** set eyebrow tracking to `0.08em` and weight to 600 across all eyebrow/kicker styles.

---

### 3. 🔴 Site does not consume the design-system tokens
**Spec:** DS exposes a single token surface (`--brand`, `--text-strong/body/muted`, `--surface-*`, `--space-1…16`, `--radius-sm…2xl`, `--shadow-*`, `--weight-*`, `--text-xs…6xl`). "Use these aliases rather than raw numbers."
**Found:** `styles.css:1-36` redeclares a parallel, renamed set (`--ink`, `--muted`, `--paper`, `--sunken`, `--mist`, `--line`, `--radius`). There is **no spacing scale** (`--space-*` absent — paddings/margins are hardcoded px throughout) and **no type scale** tokens (`--text-*`); font sizes are ad-hoc `clamp()`/rem values.
**Improvement:** adopt the DS tokens as the foundation (ideally `@import` the DS `tokens/*.css`, or paste them verbatim), then alias the legacy names to them (`--ink: var(--text-strong)` etc.) so existing rules keep working while the vocabulary converges. Introduce and use the `--space-*` and `--text-*` scales.

---

### 4. 🟡 Corner radii reintroduce the "dropped" in-between values
**Spec:** consolidated radii — `sm 8 / md 12 / lg 18 / xl 24 / 2xl 30 / pill`. "The in-between values were dropped so the system feels deliberate."
**Found:** the site defines only `--radius:12`, `--radius-lg:18`, `--radius-pill` and hardcodes off-scale values: `border-radius` 6px ×12, 8px ×21, plus one-offs at **3px, 10px, 13px, 16px, 28px** (e.g. `:24px` and `:28px` for large panels instead of the 24/30 tokens). Missing tokens: `--radius-sm (8)`, `--radius-xl (24)`, `--radius-2xl (30)`.
**Improvement:** add the missing radius tokens; snap every hardcoded radius to the nearest scale step (3→8, 6→8, 10→8/12, 13→12, 16→18, 28→30); use `--radius-xl/2xl` for booking card / hero bands.

---

### 5. 🟡 Elevation is heavier than the "flat" system
**Spec:** "Separation comes from **hairline borders**, not drop-shadows… shadows kept light." DS values top out around `rgba(42,39,34,0.12)` ambient and `--shadow-brand` at `0.22` alpha.
**Found:** site shadows carry higher opacities — `--shadow: …0.12` plus a heavier contact layer, and `--shadow-brand: …0.28` (`styles.css:21-25`). Net effect is a slightly more "floaty" UI than the crisp, flat intent.
**Improvement:** dial shadow alphas down to the DS values; lean on `--hairline` (1px `--border-subtle`) for resting separation; reserve `--shadow-lg/xl` for genuinely floating chrome (menus, the search bar) and `--shadow-brand` for primary-button hover only.

---

### 6. 🔴 No dark theme
**Spec:** "A full dark theme ships via `[data-theme="dark"]`… toggle wired into the website header." The DS `tokens/colors.css` defines the complete dark override.
**Found:** no `data-theme`, `prefers-color-scheme`, or `color-scheme` anywhere in the site's CSS/HTML/JS.
**Note:** the DS prose is internally inconsistent (one section says "No dark mode is defined yet"), but the **tokens and SKILL ship dark mode**, so it's the intended end-state.
**Improvement:** if dark mode is in scope, adopt the DS semantic-alias approach — once the site uses the DS tokens (Finding #3), add the `[data-theme="dark"]` block and a header toggle; components adapt for free. If out of scope, record that decision so the gap is intentional.

---

### 7. 🟡 A few off-token colors
**Spec:** "Green is… the only saturated color used at scale"; use the palette scale, not ad-hoc hues.
**Found:** non-token values: `background: #1da851` (`:621`) and `#54b884` (`:1312`) are greens outside the scale (brand is `#1f8a57`; nearest steps are `#43a06f`/`#71bd91`); `#fbfaf6` (×5, e.g. `:388,1489,1543`) is an off-by-one page surface vs the token `#faf9f6`.
**Improvement:** replace with the nearest scale tokens (`--green` / `--green-400` / `--paper`).

---

### 8. 🟡 Hero display is tighter/larger than the type scale
**Spec:** display sizes are the fluid `--text-2xl…6xl` (max **76px** / 4.75rem); display leading is `1.08–1.22`; tracking `-0.02em`.
**Found:** `.hero h1 { font-size: clamp(3rem, 7vw, 6rem); line-height: 0.96; letter-spacing: -0.035em; }` (`:199-204, 2596`) — up to **96px**, leading below the `1.08` floor, and tighter tracking than `--tracking-tight`.
**Improvement:** cap the hero at `--text-6xl`, raise line-height to ≥1.08, and use `-0.02em` tracking (or adopt the `--text-6xl` token directly).

---

### 9. 🟢 Minor / nice-to-have
- **Glass blur radius** varies (6/10/14px) vs the DS standard `--glass-blur: 16px` (`:88, 2674, 3039`) — standardize on 16px for glass surfaces.
- **Focus-ring alpha** is `0.30` vs DS `0.40` (`:2633`); inputs use `:focus` rather than `:focus-visible` (DS shows the ring for keyboard users only).
- **No skeleton loader** — the DS provides `.ebr-skeleton` shimmer for loading states; the site has reveal but no skeleton. Add if there are async data loads.
- **Font loading is inconsistent across pages** — `404.html` omits JetBrains Mono and loads Hanken only to `700`, while other pages load to `800`. Align the `<link>` once weights are fixed (Finding #1).

---

## Suggested order of work

1. **Type weights → 600/400 scale** (Finding #1) and **eyebrow tracking** (#2) — biggest brand payoff, low risk.
2. **Adopt DS tokens + spacing/type scales** (#3); alias legacy names so nothing breaks.
3. **Snap radii to scale** (#4) and **lighten shadows** (#5).
4. **Off-token colors** (#7) and **hero display** (#8).
5. **Dark mode** (#6) — only after tokens land; otherwise record it as out of scope.
6. **Minor polish** (#9).
