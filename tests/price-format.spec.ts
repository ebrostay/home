import { test, expect } from './fixtures';

// KAN-20: a single locale-aware formatter (formatPrice in data.js) must drive
// every price surface. The listing card and the detail page for the same
// property must render the *identical* string, and no surface may show the
// old "1350.00 EUR" style (stray decimals on whole euros).

const STRAY_DECIMALS = /\d[.,]\d{2}\b/; // e.g. 1350.00 / 1350,00

async function blockSupabase(page) {
  await page.route(/supabase\.co/, route =>
    route.fulfill({ status: 500, body: '{"error":"test-blocked"}' })
  );
}

test.describe('KAN-20 price formatting', () => {
  test('card and detail prices match and have no stray decimals (es)', async ({ page }) => {
    await blockSupabase(page);

    // Listing card price for pedro1 (force Spanish for a deterministic locale)
    await page.goto('/index.html');
    await page.locator('[data-lang="es"]').click();
    const cardPrice = page.locator('[data-property-id="pedro1"] .property-price strong');
    await expect(cardPrice).not.toBeEmpty();
    await expect(cardPrice).toContainText('mes');
    const cardText = (await cardPrice.innerText()).trim();

    // Detail page price for the same property
    await page.goto('/property.html?id=pedro1');
    await page.locator('[data-lang="es"]').click();
    const detailPrice = page.locator('#detailPrice');
    await expect(detailPrice).not.toBeEmpty();
    const detailText = (await detailPrice.innerText()).trim();

    // Same exact formatted string on both surfaces.
    expect(detailText).toBe(cardText);

    // Locale-aware Spanish format, whole euros, no ".00" tail.
    expect(cardText).not.toMatch(STRAY_DECIMALS);
    expect(detailText).not.toMatch(STRAY_DECIMALS);
    expect(cardText).toMatch(/EUR\/mes/);
    expect(cardText).toMatch(/1\.350|950/); // thousands separator "." in Spanish
  });

  test('English prices share the same format across card and detail', async ({ page }) => {
    await blockSupabase(page);

    await page.goto('/index.html');
    await page.locator('[data-lang="en"]').click();
    const cardPrice = page.locator('[data-property-id="movera0"] .property-price strong');
    await expect(cardPrice).not.toBeEmpty();
    await expect(cardPrice).toContainText('month');
    const cardText = (await cardPrice.innerText()).trim();

    await page.goto('/property.html?id=movera0');
    await page.locator('[data-lang="en"]').click();
    const detailText = (await page.locator('#detailPrice').innerText()).trim();

    expect(detailText).toBe(cardText);
    expect(cardText).not.toMatch(STRAY_DECIMALS);
    expect(cardText).toMatch(/EUR\/month/);
    expect(cardText).toMatch(/1,350/); // thousands separator "," in English
  });
});
