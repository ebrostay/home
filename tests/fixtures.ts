import { test as base, expect } from '@playwright/test';

// Shared test base for the whole suite.
//
// Globally block every Supabase network call so tests never touch a live
// project (production especially). Without this, pages that boot the real
// backend would download property photos from the Supabase CDN on each run,
// burning egress. With it, the site falls back to the local sample data in
// data.js. Individual specs may still add their own `page.route(/supabase\.co/)`
// block — that's harmless and redundant alongside this one.
export const test = base.extend<{ blockSupabase: void }>({
  blockSupabase: [
    async ({ page }, use) => {
      await page.route(/supabase\.co/, (route) =>
        route.fulfill({ status: 500, body: '{"error":"test-blocked"}' })
      );
      await use();
    },
    { auto: true },
  ],
});

export { expect };
