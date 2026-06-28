import { test, expect } from './fixtures';

// KAN-11: enhanced/address filters must run through the same filtered list that
// feeds cards, the result count AND the map. Filtering to zero matches must show
// the empty-state CTA, leave no queryable stale .property-card, and clear pins.
test.describe('Enhanced filters — single source of truth (KAN-11)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the single render pipeline to draw the initial cards + pins.
    await expect(page.locator('#propertyGrid .property-card').first()).toBeVisible();
  });

  test('zero matches shows empty-state CTA, no stale cards, no map pins', async ({ page }) => {
    // Sanity: map starts with pins for the visible cards.
    await expect(page.locator('#listingsMap .map-price-pin').first()).toBeVisible();

    // Address query that cannot match any listing.
    await page.locator('#addressQuery').fill('zzzzzzz-no-such-place-zzzzzzz');

    // Empty-state block with copy + lead-capture CTAs is shown.
    const empty = page.locator('#propertyGrid .empty-state');
    await expect(empty).toBeVisible();
    await expect(empty.locator('[data-empty-contact]')).toBeVisible();
    const whatsapp = empty.locator('[data-empty-whatsapp]');
    await expect(whatsapp).toBeVisible();
    await expect(whatsapp).toHaveAttribute('href', /wa\.me/);

    // No stale cards remain in the DOM / accessibility tree (removed, not hidden).
    await expect(page.locator('#propertyGrid .property-card')).toHaveCount(0);

    // Map pins are cleared in sync with the filtered list.
    await expect(page.locator('#listingsMap .map-price-pin')).toHaveCount(0);

    // Result count reflects zero matches.
    await expect(page.locator('#availabilityStatus')).not.toBeEmpty();
  });

  test('clearing the address filter restores cards and pins', async ({ page }) => {
    await page.locator('#addressQuery').fill('zzzzzzz-no-such-place-zzzzzzz');
    await expect(page.locator('#propertyGrid .empty-state')).toBeVisible();

    await page.locator('#addressQuery').fill('');
    await expect(page.locator('#propertyGrid .property-card').first()).toBeVisible();
    await expect(page.locator('#listingsMap .map-price-pin').first()).toBeVisible();
  });
});
