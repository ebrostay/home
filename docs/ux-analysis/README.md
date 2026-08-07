# UX structure analysis — competitor comparison framework

A repeatable procedure that turns any rental-platform page into a **schematic
structure map**: where which information sits, how it is patterned (list,
table, grid, prose, calendar, map…), and where the reader can jump. The maps
are rendered side by side on one open pan/zoom pane (`viewer.html`) so a whole
page — and a whole market — can be read at a glance, stripped of branding.

**Goal:** establish the baseline the competitors share, find where they
differentiate, and derive an instruction set for the Ebrostay listing page:
adhere where convention carries meaning, challenge where it is only habit.

## Contents

| File | What it is |
| --- | --- |
| `viewer.html` | The open pane. Self-contained; open in a browser, drag to pan, scroll/buttons to zoom. All page data is embedded in the `PAGES` array. |
| `pages/<site>--listing-detail.md` | Per-page text documentation: structure inventory + observed design principles. |
| `comparison.md` | The growing synthesis: baseline / divergence matrix and differentiation notes. |
| `info-inventory.md` | One level deeper: which information group exists on which page (✓/~/⌂/—), with a per-row verdict for Ebrostay — keep / gap / consider / skip. |
| `compare.html` | Deepest level: per info group, live-page screenshots side by side + feature tables (business/UI/usability) + heuristic scores, with site filters. Self-contained (screenshots embedded). |
| `tools/capture-shots.mjs` | Re-captures the section screenshots (Playwright, borrowed from `app/`) and injects them into `compare.html`. `node docs/ux-analysis/tools/capture-shots.mjs --outdir /tmp/shots --inject` (add `--only <site>` to redo one site, `--headed` if a site blocks headless). |

Mapped so far (2026-08-07, desktop 1280px): **Ebrostay v2**, **Spotahome**
(Zaragoza), **Wunderflats** (Berlin), **Flatio** (Barcelona), **Blueground**
(Madrid) — listing detail page each. Next: other page types (search
results, homepage).

## The procedure (add one page at a time)

### 1. Capture

Open the target page at 1280px viewport (Claude: browser pane, or any
browser). Dismiss cookie banners (deny non-essential). Then:

- Screenshot the first viewport (above-the-fold judgment needs it).
- Run the structural sweep in the console — it lists every heading and
  landmark with page-absolute geometry:

```js
(() => {
  const items = [];
  document.querySelectorAll('h1,h2,h3,aside,[data-test],[data-testid]').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 8) return;
    items.push({ t: el.tagName, y: Math.round(r.top + window.scrollY),
      h: Math.round(r.height), x: Math.round(r.left), w: Math.round(r.width),
      label: String(el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80) });
  });
  return { docH: document.documentElement.scrollHeight,
    items: items.sort((a, b) => a.y - b.y) };
})()
```

- Pull the full page text (reader mode / `document.body.innerText`) to know
  what each block *contains*, not just where it sits.
- **Scroll-state sweep — mandatory.** The static sweep runs at scroll 0 and
  misses everything a page injects on scroll (anchor-index bars, bottom
  booking bars, back-to-top chrome). Scroll mid-page, wait a beat, then
  enumerate every visible fixed/sticky element:

```js
(() => {
  window.scrollTo(0, Math.round(document.documentElement.scrollHeight / 3));
  return new Promise(res => setTimeout(() => {
    const out = [];
    document.querySelectorAll('body *').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') return;
      const r = el.getBoundingClientRect();
      if (r.width < 100 || r.height < 20 || r.bottom < 0 || r.top > innerHeight) return;
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return;
      out.push({ pos: cs.position, top: Math.round(r.top), h: Math.round(r.height),
        w: Math.round(r.width), cls: String(el.className).slice(0, 50),
        text: String(el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 110) });
    });
    res(out);
  }, 800));
})()
```

  (This gap cost us Blueground's scroll-injected anchor bar on the first
  pass — 2026-08-07.)
- Note the rest of the interactive structure by hand: "read more"
  disclosures, overlays (lightbox, payment breakdown), and every jump
  (where → where). For our own page, the source is the better capture —
  read the page component instead of the DOM.

Beware mid-load sweeps: run the snippet only once the page has settled, or
the geometry lies (lazy sections report collapsed heights). And check
`innerWidth` in the sweep output — a resized pane silently renders the
mobile layout, whose bars differ from desktop's.

### 2. Encode

Add one object to `PAGES` in `viewer.html`. Schema (all y/h in real page px
at 1280 viewport; the viewer scales by `SCALE`):

```js
{
  id: 'spotahome',            // unique slug
  brand: 'Spotahome',         // artboard title
  url: '…',                   // the captured page
  capturedAt: '2026-08-07',
  pageHeight: 7822,           // docH from the sweep
  note: 'one-line thesis of this page's structure',
  columns: [                  // vertical lanes on the artboard
    { id: 'main', x: 120, w: 650 },
    { id: 'rail', x: 796, w: 364, sticky: true, label: 'sticky rail' },
  ],
  blocks: [                   // ordered content blocks
    { id: 'gallery', col: 'main', y: 130, h: 430, type: 'media',
      label: 'Photo mosaic', note: '1 large + 2 stacked · Photos/Map tabs' },
    …
  ],
  overlays: [                 // satellite panes: modals, lightboxes, wizards
    { id: 'lightbox', label: 'Photo lightbox', type: 'media' },
  ],
  arrows: [                   // from/to are block or overlay ids
    { from: 'anchorbar', to: 'pricing', kind: 'jump' },   // in-page scroll
    { from: 'gallery', to: 'lightbox', kind: 'open' },    // opens overlay
    { from: 'cta', to: null, kind: 'exit', label: 'booking wizard' }, // leaves page
  ],
}
```

**Block types** (the color code — keep to these nine):

| type | meaning |
| --- | --- |
| `nav` | chrome, breadcrumbs, back links, anchor bars |
| `identity` | title, badges, address, key facts, social proof |
| `media` | galleries, hero photos, floor plans |
| `prose` | descriptions, free text, read-more bodies |
| `data` | fact lists, amenity grids, label/value tables, fee tables |
| `calendar` | availability strips and calendars |
| `map` | maps and geo/nearby content |
| `commerce` | price, booking panel, CTAs, payment schedule |
| `trust` | guarantees, verification, cancellation policy, landlord identity, how-it-works |

### 3. Render

Open `viewer.html`. The new artboard appears beside the others at the same
scale. Check it against the screenshot: proportions roughly right, nothing
missing, arrows pointing where the page actually jumps.

### 4. Document

Write `pages/<site>--listing-detail.md`: the structure inventory (top to
bottom), then **observed principles** — what the layout argues, judged on:

- **First viewport contract** — what is promised before any scroll?
- **Price honesty** — when is the full cost knowable, and in what shape?
- **Reading order** — is there one? Is it enforced (anchors) or ambient?
- **Pattern economy** — how many distinct content patterns carry the page?
- **Trust placement** — where do guarantees/verification interrupt the read?
- **Navigation model** — linear scroll, anchor jumps, overlays, exits.
- **Interaction density** — what can be *done* on the page vs merely read?

### 5. Compare

Update `comparison.md`: extend the matrix, then re-ask the two questions —
*what does everyone do* (that's the baseline a visitor expects) and *what
does only one site do* (that's either an edge or a mistake — decide which).

## Judgment stance

The maps are evidence, not verdicts. A convention shared by every competitor
is a user expectation we break only with a reason (and the reason goes in the
decision log). A divergence is an invitation: understand why it exists before
copying or rejecting it. Everything actionable for Ebrostay ends up as
instructions in `comparison.md` § "Instructions for Ebrostay", and anything
that changes pricing/booking behaviour still needs an ADR in
`docs/spec/05-decision-log.md`.
