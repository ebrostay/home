import { test, expect } from '@playwright/test';

// KAN-28 — Admin pre-login should use admin-specific navigation and support copy.
// The /admin surface must not expose tenant booking / saved-home flows before auth.

test.describe('Admin pre-login surface', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin.html');
    // Let enhance.js run (it injects the support widget and tenant nav on other pages).
    await page.waitForFunction(() => !!document.querySelector('.support-fab'));
  });

  test('header shows no tenant Saved-homes nav', async ({ page }) => {
    await expect(page.locator('.saved-flats-link')).toHaveCount(0);
    await expect(page.locator('.header-actions')).not.toContainText('Guardados');
    await expect(page.locator('.header-actions')).not.toContainText('Saved');
  });

  test('header shows no tenant "Find a stay" CTA', async ({ page }) => {
    const header = page.locator('.header-actions');
    await expect(header).not.toContainText('Buscar vivienda');
    await expect(header).not.toContainText('Find a stay');
    // No header link routes into tenant search / saved / account flows.
    await expect(page.locator('.header-actions a[href*="index.html#search"]')).toHaveCount(0);
    await expect(page.locator('.header-actions a[href*="account.html"]')).toHaveCount(0);
  });

  test('header CTA supports admin login only', async ({ page }) => {
    const cta = page.locator('.header-actions .nav-cta');
    await expect(cta).toBeVisible();
    await expect(cta).toContainText('Acceso administración');
    await expect(cta).toHaveAttribute('href', '#adminLogin');
  });

  test('floating help widget uses admin support copy', async ({ page }) => {
    await page.locator('.support-fab').click();
    const panel = page.locator('.support-panel');
    await expect(panel.locator('h3')).toContainText('administración');
    await expect(panel.locator('p')).not.toContainText('reservar');
    await expect(panel.locator('textarea')).toHaveAttribute(
      'placeholder',
      /administraci|necesito ayuda/i,
    );
    // The tenant booking placeholder must not leak onto the admin surface.
    await expect(panel.locator('textarea')).not.toHaveAttribute(
      'placeholder',
      /intentando reservar/i,
    );
  });

  test('admin support copy stays admin-specific in English', async ({ page }) => {
    await page.locator('.language-switch [data-lang="en"]').click();
    await page.locator('.support-fab').click();
    const panel = page.locator('.support-panel');
    await expect(panel.locator('h3')).toContainText('Admin support');
    await expect(panel.locator('textarea')).not.toHaveAttribute(
      'placeholder',
      /trying to book/i,
    );
  });
});
