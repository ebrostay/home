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

  test('contact buttons are visible', async ({ page }) => {
    await expect(page.locator('#bookingEmailButton')).toBeVisible();
    await expect(page.locator('#bookingWhatsappButton')).toBeVisible();
  });

  test('email button has mailto href', async ({ page }) => {
    const href = await page.locator('#bookingEmailButton').getAttribute('href');
    expect(href).toMatch(/mailto:/);
  });

  test('whatsapp button links to wa.me', async ({ page }) => {
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

  test('switches to English', async ({ page }) => {
    await page.locator('[data-lang="en"]').click();
    await expect(page.locator('[data-lang="en"]')).toHaveClass(/is-active/);
    await expect(page.locator('#bookingEmailButton')).toContainText(/email/i);
  });
});

test.describe('Property detail page — invalid ID', () => {
  test('redirects to search on unknown property ID', async ({ page }) => {
    await page.route(/supabase\.co/, route => route.fulfill({ status: 500, body: '{"error":"test-blocked"}' }));
    await page.goto('/property.html?id=nonexistent');
    // JS redirects to index.html#search when the property is not found
    await expect(page).toHaveURL(/#search/);
  });
});
