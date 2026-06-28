import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/about.html');
});

test.describe('About page — structure', () => {
  test('has correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/Ebrostay/);
  });

  test('shows header with brand, language switcher, and search CTA', async ({ page }) => {
    await expect(page.locator('.brand-wordmark')).toBeVisible();
    await expect(page.locator('.language-switch')).toBeVisible();
    await expect(page.locator('.nav-cta')).toBeVisible();
  });

  test('brand logo links back to homepage', async ({ page }) => {
    await expect(page.locator('a.brand')).toHaveAttribute('href', 'index.html');
  });
});

test.describe('About page — intro', () => {
  test('shows intro kicker and heading', async ({ page }) => {
    await expect(page.locator('.about-intro .section-kicker').first()).toBeVisible();
    await expect(page.locator('.about-intro h1, .about-intro h2').first()).toBeVisible();
  });

  test('shows intro lead paragraph', async ({ page }) => {
    await expect(page.locator('.about-lead').first()).toBeVisible();
  });
});

test.describe('About page — mission and vision', () => {
  test('shows two value cards', async ({ page }) => {
    await expect(page.locator('.value-band .value-card')).toHaveCount(6);
  });

  test('each value card has a heading', async ({ page }) => {
    const headings = page.locator('.value-card h3');
    for (const h of await headings.all()) {
      await expect(h).not.toBeEmpty();
    }
  });
});

test.describe('About page — bridge story', () => {
  test('shows bridge section kicker', async ({ page }) => {
    const kickers = page.locator('.section-kicker');
    const texts = await kickers.allTextContents();
    expect(texts.some(t => /puente|bridge/i.test(t))).toBe(true);
  });

  test('shows two bridge paragraphs', async ({ page }) => {
    // the bridge section has two .about-lead paragraphs
    await expect(page.locator('.about-lead')).toHaveCount(4);
  });
});

test.describe('About page — split band', () => {
  test('shows two audience cards', async ({ page }) => {
    await expect(page.locator('.split-band .split-card')).toHaveCount(2);
  });

  test('business card CTA links to search', async ({ page }) => {
    const cta = page.locator('.split-card:not(.is-owner) a.button');
    await expect(cta).toHaveAttribute('href', /search/);
  });

  test('owner card CTA links to owner section', async ({ page }) => {
    const cta = page.locator('.split-card.is-owner a.button');
    await expect(cta).toHaveAttribute('href', /owner/);
  });
});

test.describe('About page — first principles', () => {
  test('shows four first-principle cards in the principles section', async ({ page }) => {
    // the second .value-band (first principles) has 4 cards
    const secondBand = page.locator('.value-band').last();
    await expect(secondBand.locator('.value-card')).toHaveCount(4);
  });
});

test.describe('About page — final CTA', () => {
  test('shows three CTA buttons', async ({ page }) => {
    await expect(page.locator('.about-ctas a.button')).toHaveCount(3);
  });

  test('find property CTA links to search', async ({ page }) => {
    const cta = page.locator('.about-ctas a.button').first();
    await expect(cta).toHaveAttribute('href', /search/);
  });
});

test.describe('About page — language switching', () => {
  test('switches UI to English', async ({ page }) => {
    await page.locator('[data-lang="en"]').click();
    await expect(page.locator('[data-lang="en"]')).toHaveClass(/is-active/);
    // nav CTA text changes
    await expect(page.locator('.nav-cta')).toContainText(/search|find/i);
  });

  test('switches back to Spanish', async ({ page }) => {
    await page.locator('[data-lang="en"]').click();
    await page.locator('[data-lang="es"]').click();
    await expect(page.locator('[data-lang="es"]')).toHaveClass(/is-active/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  });
});
