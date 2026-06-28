import { test, expect } from './fixtures';

test.describe('Booking page — unauthenticated', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/booking.html');
  });

  test('has correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/Ebrostay/);
  });

  test('shows header', async ({ page }) => {
    await expect(page.locator('.brand-wordmark')).toBeVisible();
    await expect(page.locator('.language-switch')).toBeVisible();
  });

  test('shows not-found state when no booking ID is provided', async ({ page }) => {
    // without auth or a valid booking param the page shows the not-found block
    await expect(page.locator('#bookingNotFound')).toBeVisible({ timeout: 8000 });
  });

  test('detail section is hidden when no booking found', async ({ page }) => {
    await expect(page.locator('#bookingNotFound')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#bookingDetail')).toBeHidden();
  });

  test('shows footer', async ({ page }) => {
    await expect(page.locator('.site-footer')).toBeVisible();
  });
});

test.describe('Booking page — language switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/booking.html');
  });

  test('switches to English', async ({ page }) => {
    await page.locator('[data-lang="en"]').click();
    await expect(page.locator('[data-lang="en"]')).toHaveClass(/is-active/);
  });

  test('switches back to Spanish', async ({ page }) => {
    await page.locator('[data-lang="en"]').click();
    await page.locator('[data-lang="es"]').click();
    await expect(page.locator('[data-lang="es"]')).toHaveClass(/is-active/);
  });
});
