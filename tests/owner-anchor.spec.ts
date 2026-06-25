import { test, expect } from '@playwright/test';

// KAN-24: owner entry points must land on a real in-page #owner anchor.
test.describe('Owner anchor — homepage (KAN-24)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('an element with id="owner" exists on the homepage', async ({ page }) => {
    await expect(page.locator('#owner')).toHaveCount(1);
  });

  test('footer "Owners" link points to an in-page anchor that exists', async ({ page }) => {
    const footerOwners = page.locator('.footer-nav a[href*="#owner"]');
    await expect(footerOwners).toBeAttached();
    const href = await footerOwners.getAttribute('href');
    expect(href).toBeTruthy();
    const id = (href as string).split('#')[1];
    expect(id).toBe('owner');
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  });

  test('tenant-side owner CTA points to an in-page anchor that exists', async ({ page }) => {
    const cta = page.locator('a[data-i18n="split.ownerCta"]');
    await expect(cta).toBeAttached();
    const href = await cta.getAttribute('href');
    expect(href).toBe('#owner');
    await expect(page.locator('#owner')).toHaveCount(1);
  });

  test('every in-page hash link on the homepage resolves to an existing element', async ({ page }) => {
    const hrefs = await page.locator('a[href*="#"]').evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).getAttribute('href') || ''),
    );
    const inPageIds = hrefs
      .filter((h) => h === undefined ? false : (h.startsWith('#') || h.startsWith('index.html#')))
      .map((h) => h.split('#')[1])
      .filter((id) => id && id.length > 0);

    for (const id of inPageIds) {
      await expect(page.locator(`#${id}`), `anchor #${id} should exist`).toHaveCount(1);
    }
  });
});
