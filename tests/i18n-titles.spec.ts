import { test, expect } from './fixtures';

// KAN-25: document titles (and share metadata) must follow the active language.

test.describe('KAN-25 — about.html document title follows language', () => {
  test('English title is shown after switching to English', async ({ page }) => {
    await page.goto('/about.html');
    // default is Spanish
    await expect(page).toHaveTitle(/Misión/);

    await page.locator('[data-lang="en"]').click();
    await expect(page.locator('[data-lang="en"]')).toHaveClass(/is-active/);
    await expect(page).toHaveTitle('Ebrostay | Mission, vision and our story');
    await expect(page).not.toHaveTitle(/Misión/);
  });

  test('og:title and twitter:title follow the active language', async ({ page }) => {
    await page.goto('/about.html');
    await page.locator('[data-lang="en"]').click();
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'Ebrostay | Mission, vision and our story',
    );
    await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute(
      'content',
      'Ebrostay | Mission, vision and our story',
    );
  });

  test('switching back to Spanish restores the Spanish title', async ({ page }) => {
    await page.goto('/about.html');
    await page.locator('[data-lang="en"]').click();
    await page.locator('[data-lang="es"]').click();
    await expect(page).toHaveTitle('Ebrostay | Misión, visión y nuestra historia');
  });
});

test.describe('KAN-25 — account.html document title follows language', () => {
  // account.html persists language via localStorage and applies it on load.
  test('English title is shown when language is English', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('ebrostay-language', 'en');
    });
    await page.goto('/account.html');
    await expect(page).toHaveTitle('Ebrostay | My account');
    await expect(page).not.toHaveTitle(/Mi cuenta/);
  });

  test('switching language updates the document title', async ({ page }) => {
    await page.goto('/account.html');
    await expect(page).toHaveTitle('Ebrostay | Mi cuenta');
    await page.locator('[data-lang="en"]').click();
    await expect(page).toHaveTitle('Ebrostay | My account');
  });
});
