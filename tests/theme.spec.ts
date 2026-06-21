import { test, expect } from '@playwright/test';

const PAGES = ['/', '/about.html', '/property.html?id=pedro1', '/booking.html', '/privacy.html'];

test.describe('Dark mode — browser prefers dark, no stored theme', () => {
  test.use({ colorScheme: 'dark' });

  for (const url of PAGES) {
    test(`applies dark mode on ${url}`, async ({ page }) => {
      await page.goto(url);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    });
  }
});

test.describe('Light mode — browser prefers light, no stored theme', () => {
  test.use({ colorScheme: 'light' });

  for (const url of PAGES) {
    test(`does not apply dark mode on ${url}`, async ({ page }) => {
      await page.goto(url);
      await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    });
  }
});

test.describe('Stored theme overrides browser preference', () => {
  test('stored "dark" wins over light browser preference', async ({ page, context }) => {
    await context.addInitScript(() => localStorage.setItem('ebrostay-theme', 'dark'));
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('stored "light" wins over dark browser preference', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'dark' });
    await ctx.addInitScript(() => localStorage.setItem('ebrostay-theme', 'light'));
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    await ctx.close();
  });
});
