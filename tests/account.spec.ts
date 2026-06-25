import { test, expect } from '@playwright/test';

test.describe('Account sign-in CTA (KAN-22)', () => {
  test('signed-out CTA targets a real auth element, not a dead #login anchor', async ({ page }) => {
    await page.goto('/account.html');

    const cta = page.locator('#signedOutPanel a.button.primary');
    const href = await cta.getAttribute('href');
    expect(href).toBeTruthy();

    // No dead #login anchor anywhere in account navigation.
    expect(href).not.toContain('#login');
    await expect(page.locator('a[href*="#login"]')).toHaveCount(0);

    // The CTA must point at an element id that actually exists in the target DOM.
    const [path, hash] = href!.split('#');
    expect(hash).toBeTruthy();
    await page.goto('/' + path);
    await expect(page.locator('#' + hash)).toHaveCount(1);
  });

  test('navigating to the auth target opens the real login modal', async ({ page }) => {
    await page.goto('/index.html#authDialog');
    await expect(page.locator('#authDialog')).toBeVisible();
    await expect(page.locator('#authForm')).toBeVisible();
  });
});
