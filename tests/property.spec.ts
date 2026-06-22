import { test, expect } from '@playwright/test';

// pedro1 is a known property in data.js
const PROPERTY_URL = '/property.html?id=pedro1';

test.describe('Property detail page', () => {
  test.beforeEach(async ({ page }) => {
    // Block Supabase API calls so the page falls back to local data.js immediately.
    // Without this, boot() awaits a live network round-trip before populating the page.
    await page.route(/supabase\.co/, route => route.fulfill({ status: 500, body: '{"error":"test-blocked"}' }));
    await page.goto(PROPERTY_URL);
    await expect(page.locator('#detailName')).not.toBeEmpty();
  });

  test('has correct page title', async ({ page }) => {
    await expect(page).toHaveTitle(/Ebrostay/);
  });

  test('shows header with brand and language switcher', async ({ page }) => {
    await expect(page.locator('.brand-wordmark')).toBeVisible();
    await expect(page.locator('.language-switch')).toBeVisible();
    await expect(page.locator('.nav-cta')).toBeVisible();
  });

  test('back link points to search section', async ({ page }) => {
    await expect(page.locator('.detail-back')).toBeVisible();
    await expect(page.locator('.detail-back')).toHaveAttribute('href', /search/);
  });

  test('property name and price are populated', async ({ page }) => {
    await expect(page.locator('#detailName')).not.toBeEmpty();
    await expect(page.locator('#detailPrice')).not.toBeEmpty();
  });

  test('shows availability status', async ({ page }) => {
    await expect(page.locator('#detailAvailable')).toBeVisible();
  });

  test('amenities grid is populated', async ({ page }) => {
    const amenities = page.locator('#detailAmenities');
    await expect(amenities).toBeVisible();
    await expect(amenities.locator('li, .amenity-item, span, div').first()).toBeVisible();
  });

  test('availability calendar is rendered', async ({ page }) => {
    await expect(page.locator('.detail-calendar-wrap')).toBeVisible();
    // scope to the detail wrap — there are multiple flatpickr instances on the page
    await expect(page.locator('.detail-calendar-wrap .flatpickr-calendar')).toBeVisible();
  });

  test('calendar legend is visible', async ({ page }) => {
    await expect(page.locator('.calendar-legend')).toBeVisible();
  });

  test('default calendar heading says dates are available, not unavailable (KAN-5)', async ({ page }) => {
    await page.goto('/property.html?id=movera1');
    await expect(page.locator('#detailName')).not.toBeEmpty();
    const copy = page.locator('[data-i18n="detail.blockedCopy"]');
    await expect(copy).toBeVisible();
    // ES default: no conflicting range selected -> should say "disponibles", never "no están disponibles"
    await expect(copy).toContainText(/disponibles/);
    await expect(copy).not.toContainText(/no están disponibles/);
    // EN wording
    await page.locator('[data-lang="en"]').click();
    await expect(copy).toContainText(/currently available/i);
    await expect(copy).not.toContainText(/unavailable/i);
  });

  test('contact buttons are visible', async ({ page }) => {
    await expect(page.locator('#bookingEmailButton')).toBeVisible();
    await expect(page.locator('#bookingWhatsappButton')).toBeVisible();
  });

  // Once the required booking fields are filled in, the CTAs activate and point
  // at the prefilled mailto/wa.me request (see booking-request.spec.ts for the
  // full payload coverage). Drive flatpickr directly so its onChange fires.
  async function fillBookingRequest(page: import('@playwright/test').Page) {
    await page.evaluate(() => {
      const start = (document.querySelector('#bookingStart') as any)?._flatpickr;
      const end = (document.querySelector('#bookingEnd') as any)?._flatpickr;
      start.setDate('2026-08-20', true);
      end.setDate('2026-10-20', true);
    });
    const textarea = page.locator('#bookingTenants');
    await textarea.fill('Test Tenant');
    await textarea.dispatchEvent('input');
  }

  test('email button has mailto href once required fields are set', async ({ page }) => {
    await fillBookingRequest(page);
    const href = await page.locator('#bookingEmailButton').getAttribute('href');
    expect(href).toMatch(/mailto:/);
  });

  test('whatsapp button links to wa.me once required fields are set', async ({ page }) => {
    await fillBookingRequest(page);
    const href = await page.locator('#bookingWhatsappButton').getAttribute('href');
    expect(href).toMatch(/wa\.me/);
  });

  test('share button is present', async ({ page }) => {
    await expect(page.locator('#shareButton')).toBeVisible();
  });

  test('media section is populated', async ({ page }) => {
    // JS adds .property-media and a background-image; no <img> tag is used
    await expect(page.locator('#detailMedia')).toHaveClass(/property-media/);
  });

  test('shows no fake scarcity or placeholder review text (KAN-17)', async ({ page }) => {
    // Trust strip must render with factual content, not scarcity/placeholder copy.
    await expect(page.locator('.trust-detail-strip')).toBeVisible();
    const body = page.locator('body');
    await expect(body).not.toContainText(/visitas hoy|visits today/i);
    await expect(body).not.toContainText(/alta demanda|high demand/i);
    await expect(body).not.toContainText(/próximamente|coming soon/i);
    await expect(body).not.toContainText(/opiniones públicas en preparación|public reviews in preparation/i);
    // Factual trust copy is present instead.
    await expect(page.locator('.trust-detail-strip')).toContainText(/vivienda verificada|verified home/i);
  });

  test('shows no scarcity or placeholder text in English (KAN-17)', async ({ page }) => {
    // Load the page already in English so the trust strip renders English copy.
    await page.addInitScript(() => localStorage.setItem('ebrostay-language', 'en'));
    await page.goto(PROPERTY_URL);
    await expect(page.locator('#detailName')).not.toBeEmpty();
    const body = page.locator('body');
    await expect(body).not.toContainText(/visits today|visitas hoy/i);
    await expect(body).not.toContainText(/coming soon|próximamente/i);
    await expect(body).not.toContainText(/in preparation|en preparación/i);
    await expect(page.locator('.trust-detail-strip')).toContainText(/verified home|deposit protected/i);
  });

  test('switches to English', async ({ page }) => {
    await page.locator('[data-lang="en"]').click();
    await expect(page.locator('[data-lang="en"]')).toHaveClass(/is-active/);
    await expect(page.locator('#bookingEmailButton')).toContainText(/email/i);
  });
});

test.describe('Property detail page — cost policy badges (KAN-10)', () => {
  test('capped-utilities listing shows a capped badge, not a plain bills-included badge', async ({ page }) => {
    await page.route(/supabase\.co/, route => route.fulfill({ status: 500, body: '{"error":"test-blocked"}' }));
    await page.goto('/property.html?id=movera1');
    await expect(page.locator('#detailName')).not.toBeEmpty();

    const badges = page.locator('#detailBadges span');
    await expect(badges).toContainText([/tope|capped/i]);
    // The plain "bills included" badge must NOT appear for a capped listing.
    await expect(page.locator('#detailBadges')).not.toContainText(/Gastos incluidos|Bills included/);
  });

  test('fully-included listing shows the bills-included badge', async ({ page }) => {
    await page.route(/supabase\.co/, route => route.fulfill({ status: 500, body: '{"error":"test-blocked"}' }));
    await page.goto('/property.html?id=pedro1');
    await expect(page.locator('#detailName')).not.toBeEmpty();
    await expect(page.locator('#detailBadges')).toContainText(/Gastos incluidos|Bills included/);
  });
});

// KAN-21: the floating "Need help?" support FAB must not cover the gallery
// thumbnail strip on media-heavy property pages, and the last thumbnail must
// remain fully clickable. movera1 has multiple photos so the thumbnail strip
// (carousel nav) renders.
test.describe('Property detail page — support FAB vs gallery thumbnails (KAN-21)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.route(/supabase\.co/, route => route.fulfill({ status: 500, body: '{"error":"test-blocked"}' }));
    await page.goto('/property.html?id=movera1');
    await expect(page.locator('#detailName')).not.toBeEmpty();
  });

  test('FAB does not overlap the last gallery thumbnail and thumb is clickable', async ({ page }) => {
    const fab = page.locator('.support-fab');
    const thumbs = page.locator('.ebro-cf-thumb');
    await expect(fab).toBeVisible();
    await expect(thumbs.first()).toBeVisible();

    const count = await thumbs.count();
    expect(count).toBeGreaterThan(1);
    const lastThumb = thumbs.nth(count - 1);

    // Reproduce the KAN-21 condition: bring the thumbnail strip into view so it
    // sits in the FAB's fixed bottom-right band, where the overlap was reported.
    const strip = page.locator('.ebro-cf-thumbs');
    await strip.scrollIntoViewIfNeeded();

    const rectsOverlap = (a: any, b: any) =>
      a.x < b.x + b.width && a.x + a.width > b.x &&
      a.y < b.y + b.height && a.y + a.height > b.y;

    const fabBox = await fab.boundingBox();
    const stripBox = await strip.boundingBox();
    expect(fabBox).not.toBeNull();
    expect(stripBox).not.toBeNull();

    // The FAB must not cover the gallery thumbnail strip (the reported bug:
    // the FAB sat over the strip's bottom-right). Without the fix the FAB
    // overlaps the strip; with it, the FAB clears above the strip.
    expect(
      rectsOverlap(fabBox!, stripBox!),
      'support FAB must not overlap the gallery thumbnail strip'
    ).toBe(false);

    // No individual thumbnail may overlap the FAB either.
    for (let i = 0; i < count; i++) {
      const box = await thumbs.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(
        rectsOverlap(fabBox!, box!),
        `support FAB must not overlap gallery thumbnail #${i + 1}`
      ).toBe(false);
    }

    // The last thumbnail must be actually clickable (no element intercepts the click).
    await lastThumb.scrollIntoViewIfNeeded();
    await lastThumb.click({ timeout: 2000 });
    await expect(lastThumb).toHaveClass(/is-active/);
  });
});

test.describe('Property detail page — invalid ID', () => {
  test('shows an explicit not-found state and does not silently redirect', async ({ page }) => {
    await page.route(/supabase\.co/, route => route.fulfill({ status: 500, body: '{"error":"test-blocked"}' }));
    await page.goto('/property.html?id=DOESNOTEXIST');

    // Stays on the property page — no silent redirect to search.
    await expect(page).toHaveURL(/property\.html\?id=DOESNOTEXIST/);
    await expect(page).not.toHaveURL(/#search/);

    // The friendly not-found state is shown, and the listing layout is hidden
    // (so unpublished IDs never flash the fallback catalogue).
    const notFound = page.locator('#detailNotFound');
    await expect(notFound).toBeVisible();
    await expect(page.locator('#notFoundTitle')).not.toBeEmpty();
    await expect(page.locator('#detailMain')).toBeHidden();

    // CTA back to current listings.
    const listings = page.locator('#notFoundListings');
    await expect(listings).toBeVisible();
    await expect(listings).toHaveAttribute('href', /#search/);

    // Contact / WhatsApp help CTA.
    const whatsapp = page.locator('#notFoundWhatsapp');
    await expect(whatsapp).toBeVisible();
    await expect(whatsapp).toHaveAttribute('href', /wa\.me/);
  });
});
