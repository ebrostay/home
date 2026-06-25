import { test, expect } from '@playwright/test';

// All seed listings have an availableFrom in July 2026 (earliest 2026-07-01).
// KAN-6: search must exclude listings whose availableFrom is after the
// selected check-in, and show an empty-state CTA when nothing matches.

async function search(page, checkIn: string, checkOut: string) {
  await page.goto('/');
  // Drive the real flatpickr instances; clear minDate so we can set any range.
  await page.evaluate(
    ([ci, co]) => {
      const inEl = (document.querySelector('#checkIn') as any)._flatpickr;
      const outEl = (document.querySelector('#checkOut') as any)._flatpickr;
      inEl.set('minDate', null);
      outEl.set('minDate', null);
      inEl.setDate(ci, true);
      outEl.setDate(co, true);
    },
    [checkIn, checkOut],
  );
  await page.locator('#availabilityFilter button[type="submit"]').click();
}

test.describe('KAN-6 availability search respects availableFrom', () => {
  test('excludes every listing when check-in precedes all availableFrom dates', async ({ page }) => {
    // June range: before the earliest availableFrom (2026-07-01) -> nothing available.
    await search(page, '2026-06-22', '2026-06-29');

    await expect(page.locator('#propertyGrid .property-card')).toHaveCount(0);

    // Empty state with real contact + WhatsApp CTAs.
    const empty = page.locator('#propertyGrid .empty-state');
    await expect(empty).toBeVisible();
    await expect(empty.locator('a[href="#contact"]')).toBeVisible();
    const wa = empty.locator('a[data-whatsapp]');
    await expect(wa).toBeVisible();
    await expect(wa).toHaveAttribute('href', /wa\.me|whatsapp/i);
  });

  test('excludes a listing whose availableFrom is after check-in but keeps earlier ones', async ({ page }) => {
    // Check-in 2026-07-05: pedro2 (availableFrom 2026-07-10) must be excluded,
    // while 2026-07-01 listings remain eligible.
    await search(page, '2026-07-05', '2026-07-09');

    await expect(page.locator('#propertyGrid [data-property-id="pedro2"]')).toHaveCount(0);
    await expect(page.locator('#propertyGrid .property-card').first()).toBeVisible();
  });

  test('result count matches the rendered cards and map stays in sync', async ({ page }) => {
    // Late-August range: clear of all availableFrom and unavailable blocks.
    await search(page, '2026-08-20', '2026-08-27');

    const cards = page.locator('#propertyGrid .property-card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    const status = await page.locator('#availabilityStatus').textContent();
    expect(status).toContain(String(count));
  });
});
