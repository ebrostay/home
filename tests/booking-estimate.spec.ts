import { test, expect } from '@playwright/test';

// KAN-7: a check-in -> check-out exactly N months apart must bill as N months.
// pedro1: priceNumber 950, no deposit, commission = 15% of rent (capped at one
// month's rent). availableFrom 2026-07-01; unavailable Jul 4-10 and Aug 12-18.
// The widget preselects dates carried in the ?from/&to URL params.

test.describe('Booking estimate — whole-month counting (KAN-7)', () => {
  test.beforeEach(async ({ page }) => {
    // Block Supabase so the page falls back to local data.js immediately.
    await page.route(/supabase\.co/, route =>
      route.fulfill({ status: 500, body: '{"error":"test-blocked"}' }));
  });

  test('10 Jul -> 10 Aug bills as 1 month with the correct total', async ({ page }) => {
    // Exactly one month: check-in 2026-07-11, check-out 2026-08-11.
    await page.goto('/property.html?id=pedro1&from=2026-07-11&to=2026-08-11');
    await expect(page.locator('#detailName')).not.toBeEmpty();
    // Use English so the labels are stable.
    await page.locator('[data-lang="en"]').click();
    await expect(page.locator('[data-lang="en"]')).toHaveClass(/is-active/);

    const summary = page.locator('#bookingSummary');
    await expect(summary).toContainText('1 month');
    // Must NOT be billed as two months.
    await expect(summary).not.toContainText('2 months');

    // rent = 1 * 950, commission = 15% * 950 = 142.50, deposit 0
    // total = 950 + 142.50 = 1092.50. Locale-aware format (KAN-20, en-GB):
    // whole euros drop decimals, cents keep minimal decimals, "," thousands.
    await expect(summary.locator('.is-total')).toContainText('1,092.5 EUR');
    await expect(summary).toContainText('950 EUR'); // rent line
    await expect(summary).toContainText('142.5 EUR'); // commission line
  });

  test('email and whatsapp prefilled summaries use the corrected 1-month count', async ({ page }) => {
    await page.goto('/property.html?id=pedro1&from=2026-07-11&to=2026-08-11');
    await expect(page.locator('#detailName')).not.toBeEmpty();
    await page.locator('[data-lang="en"]').click();
    await expect(page.locator('[data-lang="en"]')).toHaveClass(/is-active/);

    await expect(page.locator('#bookingSummary')).toContainText('1 month');

    const emailHref = await page.locator('#bookingEmailButton').getAttribute('href');
    const waHref = await page.locator('#bookingWhatsappButton').getAttribute('href');
    const email = decodeURIComponent(emailHref || '');
    const wa = decodeURIComponent(waHref || '');

    for (const body of [email, wa]) {
      expect(body).toContain('1 month');
      expect(body).not.toContain('2 months');
      expect(body).toContain('1,092.5 EUR'); // estimated total (KAN-20 format)
    }
  });

  test('a two-month stay still bills as 2 months', async ({ page }) => {
    // check-in 2026-09-01, check-out 2026-11-01 -> exactly 2 months, no conflicts.
    await page.goto('/property.html?id=pedro1&from=2026-09-01&to=2026-11-01');
    await expect(page.locator('#detailName')).not.toBeEmpty();
    await page.locator('[data-lang="en"]').click();
    await expect(page.locator('[data-lang="en"]')).toHaveClass(/is-active/);

    const summary = page.locator('#bookingSummary');
    await expect(summary).toContainText('2 months');
    // rent = 2 * 950 = 1900, commission = 15% * 1900 = 285 (below one-month cap)
    // total = 1900 + 285 = 2185 -> "2,185 EUR" (KAN-20 locale format, en-GB)
    await expect(summary.locator('.is-total')).toContainText('2,185 EUR');
  });
});
