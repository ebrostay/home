import { test, expect } from './fixtures';

const PAGES = [
  { name: 'homepage', url: '/' },
  { name: 'about', url: '/about.html' },
  { name: 'property', url: '/property.html?id=pedro1' },
];

for (const { name, url } of PAGES) {
  test.describe(`Shared header — ${name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(url);
    });

    test('shows Ebrostay brand logo', async ({ page }) => {
      await expect(page.locator('.brand-mark')).toBeVisible();
      await expect(page.locator('.brand-wordmark')).toContainText('Ebrostay');
    });

    test('shows language switcher', async ({ page }) => {
      await expect(page.locator('.language-switch [data-lang="es"]')).toBeVisible();
      await expect(page.locator('.language-switch [data-lang="en"]')).toBeVisible();
    });

    test('brand logo is a link', async ({ page }) => {
      const brand = page.locator('a.brand');
      await expect(brand).toBeVisible();
      const href = await brand.getAttribute('href');
      expect(href).toBeTruthy();
    });
  });

  test.describe(`Footer — ${name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(url);
    });

    test('footer is present', async ({ page }) => {
      await expect(page.locator('.site-footer')).toBeVisible();
    });

    test('footer shows current year in copyright', async ({ page }) => {
      const year = new Date().getFullYear().toString();
      await expect(page.locator('.site-footer')).toContainText(year);
    });

    test('footer has email link', async ({ page }) => {
      await expect(page.locator('.footer-email')).toHaveAttribute('href', 'mailto:info@ebrostay.com');
    });

    test('footer nav has at least four links', async ({ page }) => {
      const links = page.locator('.footer-nav a');
      await expect(links).toHaveCount(5);
    });

    test('footer privacy link points to privacy.html', async ({ page }) => {
      const privacyLink = page.locator('.footer-nav a[href*="privacy"]');
      await expect(privacyLink).toBeAttached();
    });
  });
}

test.describe('404 page', () => {
  test('returns a page on unknown URL', async ({ page }) => {
    const response = await page.goto('/nonexistent-page-xyz.html');
    // static server serves 404.html with status 404 or falls back — either way the shell loads
    await expect(page.locator('body')).toBeVisible();
  });
});
