import { test, expect } from './fixtures';

// KAN-27 — the floating help widget must adapt its copy to the page context:
// owner (partner.html), account (account.html), or tenant (default).

test.describe('Help widget — context-aware copy', () => {
  test('partner.html shows owner-support copy, not booking language', async ({ page }) => {
    await page.goto('/partner.html');
    await page.locator('.support-fab').click();
    const panel = page.locator('.support-panel');
    await expect(panel).toHaveClass(/is-open/);

    const placeholder = await panel.locator('textarea').getAttribute('placeholder');
    expect(placeholder || '').not.toMatch(/trying to book|intentando reservar/i);
    expect(placeholder || '').toMatch(/owner|propietario/i);

    const copy = (await panel.locator('p').textContent()) || '';
    expect(copy).toMatch(/owner|propietario/i);
  });

  test('account.html shows account-support copy, not new-booking language', async ({ page }) => {
    await page.goto('/account.html');
    await page.locator('.support-fab').click();
    const panel = page.locator('.support-panel');
    await expect(panel).toHaveClass(/is-open/);

    const placeholder = await panel.locator('textarea').getAttribute('placeholder');
    expect(placeholder || '').not.toMatch(/trying to book|intentando reservar/i);
    expect(placeholder || '').toMatch(/booking|reserva/i);
  });

  test('index.html keeps tenant booking copy', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('.support-fab').click();
    const panel = page.locator('.support-panel');
    const placeholder = await panel.locator('textarea').getAttribute('placeholder');
    expect(placeholder || '').toMatch(/trying to book|intentando reservar/i);
  });
});
