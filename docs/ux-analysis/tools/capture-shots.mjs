// Section-screenshot capture for the ux-analysis compare page.
//
// For every site in REGIONS: open the listing at 1280px, dismiss/hide cookie
// chrome, force lazy content to load, then cut one JPEG per info group using
// the page-absolute geometry measured in the structure maps (viewer.html).
// Output: JPEGs into --outdir (for eyeballing) and, with --inject, the same
// images written as data URIs into compare.html between the SHOTS markers so
// the page stays a single self-contained file (Artifact-publishable).
//
// Run from the repo root:
//   node docs/ux-analysis/tools/capture-shots.mjs --outdir /tmp/shots --inject
//
// Playwright is borrowed from app/ (the e2e dependency); no extra install.

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const { chromium } = createRequire(join(repo, 'app/package.json'))('playwright-core');

const args = process.argv.slice(2);
const outdir = args.includes('--outdir') ? args[args.indexOf('--outdir') + 1] : join(here, '../../../.shots');
const inject = args.includes('--inject');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;

// One clip per info group, in page-absolute CSS px at a 1280px viewport.
// `fixed: <scrollY>` captures the viewport (not the full page) after
// scrolling — for chrome that only exists in the scrolled state.
const REGIONS = {
  ebrostay: {
    url: 'https://delightful-sand-063f8a703.7.azurestaticapps.net/en/property?id=pedro1',
    shots: {
      nav:      { x: 0,   y: 0,    w: 1280, h: 64 },
      identity: { x: 24,  y: 120,  w: 828,  h: 200 },
      gallery:  { x: 24,  y: 300,  w: 828,  h: 400 },
      commerce: { x: 876, y: 689,  w: 380,  h: 610 },
      living:   { x: 24,  y: 780,  w: 828,  h: 580 },
      calendar: { x: 24,  y: 1320, w: 828,  h: 290 },
      trust:    { x: 24,  y: 1970, w: 828,  h: 340 },
      location: { x: 24,  y: 2300, w: 828,  h: 680 },
    },
  },
  spotahome: {
    url: 'https://www.spotahome.com/zaragoza/for-rent:apartments/1611151',
    cookies: ['button:has-text("Deny Non-essential")'],
    shots: {
      nav:      { x: 110, y: 1470, w: 700, h: 75 },
      identity: { x: 120, y: 595,  w: 680, h: 190 },
      gallery:  { x: 120, y: 120,  w: 845, h: 440 },
      commerce: { x: 790, y: 85,   w: 376, h: 310 },
      living:   { x: 120, y: 1530, w: 680, h: 640 },
      calendar: { x: 120, y: 6200, w: 680, h: 360 },
      trust:    { x: 790, y: 390,  w: 376, h: 520 },
    },
  },
  wunderflats: {
    url: "https://wunderflats.com/en/furnished-apartment/fantastic-flat-in-kreuzberg's-bergmannkiez-including-monthly-cleaning/645cf27c2735c3057851adb8",
    cookies: ['button:has-text("Reject all")'],
    shots: {
      nav:      { x: 0,   y: 0,    w: 1280, h: 90 },
      identity: { x: 0,   y: 700,  w: 1280, h: 300 },
      gallery:  { x: 0,   y: 100,  w: 1280, h: 560 },
      commerce: { x: 950, y: 290,  w: 330,  h: 560 },
      living:   { x: 0,   y: 985,  w: 1280, h: 760 },
      calendar: { x: 0,   y: 2990, w: 1280, h: 640 },
    },
  },
  flatio: {
    url: 'https://www.flatio.com/rent/apartment/129864-barcelona',
    cookies: ['button:has-text("Customise Cookies")', 'button:has-text("Reject All")'],
    shots: {
      nav:      { x: 0,   y: 0,    w: 1280, h: 70 },
      identity: { x: 70,  y: 500,  w: 750,  h: 185 },
      gallery:  { x: 70,  y: 78,   w: 750,  h: 415 },
      commerce: { x: 845, y: 550,  w: 380,  h: 460 },
      living:   { x: 70,  y: 795,  w: 750,  h: 550 },
      calendar: { x: 70,  y: 4880, w: 750,  h: 580 },
      trust:    { x: 70,  y: 4260, w: 750,  h: 625 },
      location: { x: 70,  y: 2640, w: 750,  h: 580 },
    },
  },
  blueground: {
    url: 'https://www.theblueground.com/p/furnished-apartments/mad-1013511p',
    cookies: ['button:has-text("Close")'],
    shots: {
      nav:      { x: 0,  y: 0,    w: 1280, h: 66, fixed: 1800 },
      identity: { x: 64, y: 90,   w: 770,  h: 175 },
      gallery:  { x: 64, y: 262,  w: 770,  h: 345 },
      commerce: { x: 830, y: 590, w: 410,  h: 450 },
      living:   { x: 64, y: 845,  w: 770,  h: 380 },
      trust:    { x: 64, y: 1655, w: 770,  h: 320 },
      location: { x: 64, y: 2020, w: 1160, h: 700 },
    },
  },
};

const HIDE_CHROME = `
  [class*="cookie" i], [id*="cookie" i], [class*="consent" i],
  [id*="onetrust" i], [id*="usercentrics" i], .cky-consent-container,
  [class*="survey" i], [class*="Feedback" i], [class*="chat" i][class*="widget" i]
  { display: none !important; }`;

mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch({ headless: !args.includes('--headed') });
const manifest = {};

for (const [site, cfg] of Object.entries(REGIONS)) {
  if (only && !only.includes(site)) continue;
  console.log(`— ${site}`);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  try {
    await page.goto(cfg.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    // the tallest defined region must exist, or the page hasn't really rendered
    const need = Math.max(...Object.values(cfg.shots).filter(r => r.fixed === undefined).map(r => r.y + r.h));
    for (let tries = 0; tries < 10; tries++) {
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      if (h >= need) break;
      if (tries === 9) throw new Error(`page stuck at ${h}px, need ${need}px`);
      await page.waitForTimeout(2000);
    }
    for (const sel of cfg.cookies ?? []) {
      try { await page.locator(sel).first().click({ timeout: 4000 }); await page.waitForTimeout(600); }
      catch { console.log(`   (cookie step skipped: ${sel})`); }
    }
    await page.addStyleTag({ content: HIDE_CHROME });
    // walk the page so lazy sections and maps actually render
    await page.evaluate(async () => {
      const H = document.documentElement.scrollHeight;
      for (let y = 0; y < H; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(2500);

    manifest[site] = {};
    for (const [group, r] of Object.entries(cfg.shots)) {
      let buf;
      if (r.fixed !== undefined) {
        await page.evaluate(y => window.scrollTo(0, y), r.fixed);
        await page.waitForTimeout(900);
        buf = await page.screenshot({ type: 'jpeg', quality: 70, clip: { x: r.x, y: r.y, width: r.w, height: r.h } });
        await page.evaluate(() => window.scrollTo(0, 0));
      } else {
        buf = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: true, clip: { x: r.x, y: r.y, width: r.w, height: r.h } });
      }
      writeFileSync(join(outdir, `${site}--${group}.jpg`), buf);
      manifest[site][group] = `data:image/jpeg;base64,${buf.toString('base64')}`;
      console.log(`   ${group} ${(buf.length / 1024).toFixed(0)}kB`);
    }
  } catch (e) {
    console.error(`   FAILED: ${e.message}`);
  } finally {
    await page.close();
  }
}
await browser.close();

writeFileSync(join(outdir, 'manifest.json'), JSON.stringify(Object.fromEntries(
  Object.entries(manifest).map(([s, g]) => [s, Object.keys(g)])), null, 2));

if (inject) {
  const target = join(here, '../compare.html');
  const html = readFileSync(target, 'utf8');
  const START = '/*__SHOTS_START__*/', END = '/*__SHOTS_END__*/';
  const a = html.indexOf(START), b = html.indexOf(END);
  if (a === -1 || b === -1) { console.error('markers not found in compare.html'); process.exit(1); }
  // merge over what's already injected, so --only reruns don't drop other sites
  const block = html.slice(a + START.length, b);
  let existing = {};
  try { existing = JSON.parse(block.slice(block.indexOf('{'), block.lastIndexOf('}') + 1)); } catch { /* placeholder */ }
  const merged = { ...existing, ...manifest };
  writeFileSync(target, html.slice(0, a + START.length) + `\nconst SHOTS = ${JSON.stringify(merged)};\n` + html.slice(b));
  console.log(`injected ${Object.values(manifest).reduce((n, g) => n + Object.keys(g).length, 0)} shots into compare.html`);
}
console.log('done');
