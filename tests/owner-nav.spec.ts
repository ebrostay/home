import { test, expect } from './fixtures';

test.describe('Owner mode header navigation (KAN-26)', () => {
  test('tenant mode shows account and search CTA', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('.header-actions');
    await expect(header.locator(".admin-link[href*='account.html']")).toBeVisible();
    const cta = header.locator('.nav-cta');
    await expect(cta).toHaveAttribute('href', /#search/);
  });

  test('switching to owner mode hides Find a stay / My account links', async ({ page }) => {
    await page.goto('/');
    // Switch to the owner audience via the compact header toggle.
    await page.locator('[data-audience-option="owner"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-audience', 'owner');

    const header = page.locator('.header-actions');
    // Tenant "My account" link is hidden.
    await expect(header.locator(".admin-link[href*='account.html']")).toBeHidden();
    // Primary CTA points to owner onboarding, not tenant search.
    const cta = header.locator('.nav-cta');
    await expect(cta).toHaveAttribute('href', /#owner/);
    await expect(cta).not.toHaveText(/Find a (stay|home)|Buscar/i);
  });

  test('toggling back to tenant restores tenant nav', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-audience-option="owner"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-audience', 'owner');
    await page.locator('[data-audience-option="tenant"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-audience', 'tenant');

    const header = page.locator('.header-actions');
    await expect(header.locator(".admin-link[href*='account.html']")).toBeVisible();
    await expect(header.locator('.nav-cta')).toHaveAttribute('href', /#search/);
  });

  test('partner portal shows owner nav, not tenant nav', async ({ page }) => {
    await page.goto('/partner.html');
    const header = page.locator('.header-actions');
    // Tenant "My account" link hidden on owner portal.
    await expect(header.locator(".admin-link[href*='account.html']")).toBeHidden();
    // CTA is owner-focused (onboarding or portal), never tenant search.
    const cta = header.locator('.nav-cta');
    const href = await cta.getAttribute('href');
    expect(href).not.toMatch(/#search/);
    expect(href).toMatch(/#owner|partner\.html/);
  });
});
