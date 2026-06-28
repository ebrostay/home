import { test, expect } from './fixtures';

// movera1 has no videoUrl in data.js — its video CTAs must stay hidden (KAN-16).
const NO_VIDEO_URL = '/property.html?id=movera1';

test.describe('Property video CTA — no videoUrl', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/supabase\.co/, route =>
      route.fulfill({ status: 500, body: '{"error":"test-blocked"}' })
    );
    await page.goto(NO_VIDEO_URL);
    await expect(page.locator('#detailName')).not.toBeEmpty();
  });

  test('sticky-panel video CTA is hidden', async ({ page }) => {
    await expect(page.locator('#detailVideoButton')).toBeHidden();
  });

  test('media-tabs video CTA is hidden', async ({ page }) => {
    // give enhance.js a tick to build the media tabs
    await expect(page.locator('.detail-media-tabs')).toBeVisible();
    await expect(page.locator('[data-media-video]')).toBeHidden();
  });

  test('no video CTA carries a dead href="#"', async ({ page }) => {
    // No anchor that ends in "#" should remain as a video link.
    const sticky = await page.locator('#detailVideoButton').getAttribute('href');
    expect(sticky === null || !sticky.endsWith('#')).toBeTruthy();
    const tab = await page.locator('[data-media-video]').getAttribute('href');
    expect(tab === null || !tab.endsWith('#')).toBeTruthy();
  });
});

test.describe('Property video CTA — with videoUrl', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/supabase\.co/, route =>
      route.fulfill({ status: 500, body: '{"error":"test-blocked"}' })
    );
    // Inject a videoUrl onto movera1 in the local data so the real render path runs.
    await page.route(/data\.js/, async route => {
      const res = await route.fetch();
      let body = await res.text();
      body +=
        '\n;(function(){var p=properties.find(function(x){return x.id==="movera1";});' +
        'if(p)p.videoUrl="https://www.youtube.com/watch?v=KAN16";})();\n';
      route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/javascript' },
        body,
      });
    });
    await page.goto(NO_VIDEO_URL);
    await expect(page.locator('#detailName')).not.toBeEmpty();
  });

  test('sticky-panel video CTA links out in a new tab', async ({ page }) => {
    const cta = page.locator('#detailVideoButton');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', 'https://www.youtube.com/watch?v=KAN16');
    await expect(cta).toHaveAttribute('target', '_blank');
    await expect(cta).toHaveAttribute('rel', /noopener/);
  });

  test('media-tabs video CTA links out in a new tab', async ({ page }) => {
    const tab = page.locator('[data-media-video]');
    await expect(tab).toBeVisible();
    await expect(tab).toHaveAttribute('href', 'https://www.youtube.com/watch?v=KAN16');
    await expect(tab).toHaveAttribute('target', '_blank');
    await expect(tab).toHaveAttribute('rel', /noopener/);
  });
});
