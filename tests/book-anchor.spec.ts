import { test, expect } from '@playwright/test';

// movera1 is a published property in data.js. The "Reservar" links on the home
// result cards point to property.html?id=...#book — the booking widget must be
// scrolled into view and focused after the page hydrates in JS (KAN-8).
const BOOK_URL = '/property.html?id=movera1#book';

test.describe('Reservar #book anchor', () => {
  test.beforeEach(async ({ page }) => {
    // Block Supabase so the page falls back to local data.js immediately.
    await page.route(/supabase\.co/, route => route.fulfill({ status: 500, body: '{"error":"test-blocked"}' }));
    await page.goto(BOOK_URL);
    await expect(page.locator('#detailName')).not.toBeEmpty();
  });

  test('has a stable #book anchor after hydration', async ({ page }) => {
    await expect(page.locator('#book')).toHaveCount(1);
  });

  test('scrolls the booking widget into view', async ({ page }) => {
    // Wait for the booking widget to be revealed during hydration.
    const widget = page.locator('#bookingWidget');
    await expect(widget).toBeVisible();
    await expect(widget).toBeInViewport();
  });

  test('moves focus to the first booking input or heading', async ({ page }) => {
    // After hydration focus must land inside the booking card — on the visible
    // start-date input (a flatpickr field) or the booking heading.
    await expect(page.locator('#bookingWidget')).toBeVisible();
    await expect(async () => {
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return {
          tag: el?.tagName || '',
          insideBook: !!el?.closest?.('#book'),
        };
      });
      // Focus lands inside the booking card, on the booking heading (or, if the
      // date widget is hidden, the first heading of the request card).
      const ok = info.insideBook && (info.tag === 'INPUT' || info.tag === 'H4');
      expect(ok).toBeTruthy();
    }).toPass();
  });
});
