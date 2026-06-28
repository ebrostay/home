import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

// KAN-23: the email + WhatsApp request CTAs must build from one normalized
// payload that includes the entered check-in, check-out and tenant names, and
// must stay blocked until those required fields are filled in.
const PROPERTY_URL = '/property.html?id=movera1#book';

// Both dates fall outside movera1's disabled ranges so flatpickr accepts them.
const CHECK_IN = '2026-08-20';
const CHECK_OUT = '2026-10-20';
const TENANTS = ['Ada Lovelace', 'Alan Turing'];

async function bootProperty(page: Page) {
  await page.route(/supabase\.co/, route =>
    route.fulfill({ status: 500, body: '{"error":"test-blocked"}' }),
  );
  await page.goto(PROPERTY_URL);
  await expect(page.locator('#detailName')).not.toBeEmpty();
  // The booking widget only enhances once flatpickr is wired up.
  await expect(page.locator('#bookingWidget')).toBeVisible();
}

// Drive the flatpickr instances directly so the widget's onChange recompute runs.
async function fillDates(page: Page, checkIn: string, checkOut: string) {
  await page.evaluate(
    ([ci, co]) => {
      const start = (document.querySelector('#bookingStart') as any)?._flatpickr;
      const end = (document.querySelector('#bookingEnd') as any)?._flatpickr;
      start.setDate(ci, true);
      end.setDate(co, true);
    },
    [checkIn, checkOut],
  );
}

async function fillTenants(page: Page, tenants: string[]) {
  const textarea = page.locator('#bookingTenants');
  await textarea.fill(tenants.join('\n'));
  await textarea.dispatchEvent('input');
}

test.describe('KAN-23 booking request payload', () => {
  test('CTAs are blocked while required fields are empty', async ({ page }) => {
    await bootProperty(page);
    for (const id of ['#bookingEmailButton', '#bookingWhatsappButton']) {
      const button = page.locator(id);
      await expect(button).toHaveAttribute('aria-disabled', 'true');
      // A blocked CTA carries no destination yet.
      expect(await button.getAttribute('href')).toBeNull();
    }
  });

  test('dates alone do not activate the CTAs (a tenant is required)', async ({ page }) => {
    await bootProperty(page);
    await fillDates(page, CHECK_IN, CHECK_OUT);
    await expect(page.locator('#bookingEmailButton')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#bookingWhatsappButton')).toHaveAttribute('aria-disabled', 'true');
  });

  test('email + WhatsApp share one payload with dates and tenants', async ({ page }) => {
    await bootProperty(page);
    await fillDates(page, CHECK_IN, CHECK_OUT);
    await fillTenants(page, TENANTS);

    const emailButton = page.locator('#bookingEmailButton');
    const whatsappButton = page.locator('#bookingWhatsappButton');

    // Required fields are set, so the CTAs are active again.
    await expect(emailButton).not.toHaveAttribute('aria-disabled', 'true');
    await expect(whatsappButton).not.toHaveAttribute('aria-disabled', 'true');

    const emailHref = decodeURIComponent((await emailButton.getAttribute('href')) || '');
    const whatsappHref = decodeURIComponent((await whatsappButton.getAttribute('href')) || '');

    expect(emailHref).toMatch(/^mailto:/);
    expect(whatsappHref).toMatch(/wa\.me/);

    // Both channels carry the entered dates (formatted, locale-agnostic) and
    // every tenant name. Default page locale is Spanish (ago/oct).
    for (const href of [emailHref, whatsappHref]) {
      expect(href).toMatch(/20\s+(aug|ago)\w*\s+2026/i);
      expect(href).toMatch(/20\s+(oct)\w*\s+2026/i);
      for (const tenant of TENANTS) {
        expect(href).toContain(tenant);
      }
    }
  });

  test('summary updates live when fields change', async ({ page }) => {
    await bootProperty(page);
    await fillDates(page, CHECK_IN, CHECK_OUT);
    await fillTenants(page, ['First Tenant']);

    let href = decodeURIComponent((await page.locator('#bookingWhatsappButton').getAttribute('href')) || '');
    expect(href).toContain('First Tenant');
    expect(href).not.toContain('Second Tenant');

    // Edit the tenants — the CTA payload must reflect it immediately.
    await fillTenants(page, ['First Tenant', 'Second Tenant']);
    href = decodeURIComponent((await page.locator('#bookingWhatsappButton').getAttribute('href')) || '');
    expect(href).toContain('First Tenant');
    expect(href).toContain('Second Tenant');
  });
});
