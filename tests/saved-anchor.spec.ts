import { test, expect } from '@playwright/test';

// KAN-13 — The header "Guardados" link must not create dead same-page #search
// anchors on pages that have no #search section (account / about / partner /
// privacy / property). On those pages it should point at the home search and
// activate saved-only mode on arrival.

test.describe('KAN-13 — Guardados cross-page anchor', () => {
  test('account.html Guardados points to index.html#saved, not account.html#search', async ({ page }) => {
    await page.goto('/account.html');
    const saved = page.locator('.saved-flats-link');
    await expect(saved).toBeVisible();
    const href = await saved.getAttribute('href');
    expect(href).toBe('index.html#saved');
    expect(href).not.toContain('account.html');
    expect(href).not.toBe('#search');
  });

  test('about.html Guardados points to index.html#saved', async ({ page }) => {
    await page.goto('/about.html');
    const saved = page.locator('.saved-flats-link');
    await expect(saved).toBeVisible();
    await expect(saved).toHaveAttribute('href', 'index.html#saved');
  });

  test('no non-index page generates a same-page #search anchor', async ({ page }) => {
    for (const url of ['/account.html', '/about.html', '/partner.html', '/privacy.html']) {
      await page.goto(url);
      const href = await page.locator('.saved-flats-link').getAttribute('href');
      expect(href, `${url} saved link`).toBe('index.html#saved');
      // The page itself must not contain a #search section to anchor to.
      expect(await page.locator('#search').count(), `${url} has no #search`).toBe(0);
    }
  });

  test('homepage Guardados stays in-page (#search) — no cross-page redirect', async ({ page }) => {
    await page.goto('/');
    const saved = page.locator('.saved-flats-link');
    await expect(saved).toBeVisible();
    await expect(saved).toHaveAttribute('href', '#search');
  });

  test('landing on index.html#saved activates saved-only mode', async ({ page }) => {
    await page.goto('/index.html#saved');
    const saved = page.locator('.saved-flats-link');
    await expect(saved).toBeVisible();
    await expect(saved).toHaveClass(/is-active/);
  });

  test('Guardados label keeps the saved count', async ({ page }) => {
    await page.goto('/account.html');
    await page.evaluate(() => {
      localStorage.setItem('ebrostay-favorites', JSON.stringify(['pedro1', 'pedro2']));
    });
    await page.reload();
    const label = page.locator('.saved-flats-link span');
    await expect(label).toContainText('(2)');
  });

  test('navigating from account Guardados lands saved-only on home', async ({ page }) => {
    await page.goto('/account.html');
    await page.locator('.saved-flats-link').click();
    await page.waitForURL(/index\.html#saved$/);
    const saved = page.locator('.saved-flats-link');
    await expect(saved).toHaveClass(/is-active/);
  });
});
