import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Page load', () => {
  test('has correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/Ebrostay/);
  });

  test('defaults to English when browser locale is not Spanish', async ({ page }) => {
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('.language-option.is-active')).toHaveText('EN');
  });
});

test.describe('Page load — Spanish browser locale', () => {
  test.use({ locale: 'es-ES' });

  test('defaults to Spanish when browser locale is Spanish', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('.language-option.is-active')).toHaveText('ES');
  });
});

test.describe('Bills quick filter (KAN-10)', () => {
  test('"Bills included" filter excludes capped-utilities (Movera) listings', async ({ page }) => {
    await page.route(/supabase\.co/, route => route.fulfill({ status: 500, body: '{"error":"test-blocked"}' }));
    await page.goto('/');

    // Movera (capped) and Pedro (included) cards both exist unfiltered.
    await expect(page.locator('[data-property-id="movera1"]')).toBeVisible();
    await expect(page.locator('[data-property-id="pedro1"]')).toBeVisible();

    await page.locator('[data-quick="bills"]').click();

    // Capped listings must be filtered out; genuinely-included ones remain.
    await expect(page.locator('[data-property-id="movera0"]')).toHaveCount(0);
    await expect(page.locator('[data-property-id="movera1"]')).toHaveCount(0);
    await expect(page.locator('[data-property-id="pedro1"]')).toBeVisible();
  });
});

test.describe('Header', () => {
  test('shows brand logo and wordmark', async ({ page }) => {
    await expect(page.locator('.brand-mark')).toBeVisible();
    await expect(page.locator('.brand-wordmark')).toContainText('Ebrostay');
  });

  test('shows language switcher with ES and EN options', async ({ page }) => {
    const switcher = page.locator('.language-switch');
    await expect(switcher.locator('[data-lang="es"]')).toBeVisible();
    await expect(switcher.locator('[data-lang="en"]')).toBeVisible();
  });

  test('shows search CTA link', async ({ page }) => {
    await expect(page.locator('.nav-cta')).toBeVisible();
  });

  test('account link exists in header', async ({ page }) => {
    // admin-link is hidden by JS unless the user is an admin
    await expect(page.locator('.header-actions .admin-link')).toBeAttached();
  });

  test('nav CTA scrolls to search section', async ({ page }) => {
    await page.locator('.nav-cta').click();
    await expect(page.locator('#search')).toBeInViewport();
  });
});

test.describe('Hero section', () => {
  test('shows hero heading', async ({ page }) => {
    await expect(page.locator('.hero h1')).toBeVisible();
  });

  test('shows three trust signals', async ({ page }) => {
    // enhance.js injects icon spans inside each trust item; target direct children only
    const trustItems = page.locator('.trust-row > span');
    await expect(trustItems).toHaveCount(3);
  });

  test('trust signal uses request-only copy, no live online-payment claim', async ({ page }) => {
    const trustRow = page.locator('.trust-row');
    // online payment is not live yet: the trust row must not promise it
    await expect(trustRow).not.toContainText(/pago online/i);
    await expect(trustRow).not.toContainText(/online (booking|payment)/i);
    // and must use the request-only wording instead
    await expect(trustRow).toContainText(/sin pago ahora|no payment now/i);
  });

  test('search form has all required fields', async ({ page }) => {
    const form = page.locator('#heroSearch');
    await expect(form.locator('[name="city"]')).toBeVisible();
    // flatpickr replaces date inputs with hidden ones; check they exist in DOM
    await expect(form.locator('[name="checkIn"]')).toBeAttached();
    await expect(form.locator('[name="checkOut"]')).toBeAttached();
    await expect(form.locator('[name="guestCount"]')).toBeVisible();
    await expect(form.locator('button[type="submit"]')).toBeVisible();
  });

  test('city field defaults to Zaragoza', async ({ page }) => {
    await expect(page.locator('#heroSearch [name="city"]')).toHaveValue('Zaragoza');
  });

  test('guest count defaults to 2', async ({ page }) => {
    await expect(page.locator('#heroSearch [name="guestCount"]')).toHaveValue('2');
  });

  test('submitting hero search scrolls to marketplace', async ({ page }) => {
    await page.locator('#heroSearch button[type="submit"]').click();
    await expect(page.locator('#search')).toBeInViewport();
  });
});

test.describe('Marketplace / search section', () => {
  test('shows section heading', async ({ page }) => {
    await expect(page.locator('.marketplace h2')).toBeVisible();
  });

  test('shows filter panel with all filter fields', async ({ page }) => {
    const panel = page.locator('#availabilityFilter');
    await expect(panel.locator('#cityFilter')).toBeVisible();
    // flatpickr replaces date inputs with hidden ones; check they exist in DOM
    await expect(panel.locator('#checkIn')).toBeAttached();
    await expect(panel.locator('#checkOut')).toBeAttached();
    await expect(panel.locator('#guestCount')).toBeVisible();
    await expect(panel.locator('#propertyType')).toBeVisible();
    await expect(panel.locator('#maxBudget')).toBeVisible();
  });

  test('property type dropdown has expected options', async ({ page }) => {
    const select = page.locator('#propertyType');
    await expect(select.locator('option[value="all"]')).toBeAttached();
    await expect(select.locator('option[value="apartment"]')).toBeAttached();
    await expect(select.locator('option[value="room"]')).toBeAttached();
    await expect(select.locator('option[value="home"]')).toBeAttached();
  });

  test('amenity checkboxes are present', async ({ page }) => {
    const amenities = ['wifi', 'desk', 'lift', 'ac', 'washer', 'parking'];
    for (const amenity of amenities) {
      await expect(page.locator(`input[name="amenities"][value="${amenity}"]`)).toBeAttached();
    }
  });

  test('shows sort dropdown with three options', async ({ page }) => {
    const sort = page.locator('#sortBy');
    await expect(sort.locator('option[value="best"]')).toBeAttached();
    await expect(sort.locator('option[value="price"]')).toBeAttached();
    await expect(sort.locator('option[value="new"]')).toBeAttached();
  });

  test('shows quick filter buttons', async ({ page }) => {
    await expect(page.locator('[data-quick="checked"]')).toBeVisible();
    await expect(page.locator('[data-quick="bills"]')).toBeVisible();
    // deposit button is removed by enhance.js
  });

  test('property grid container is present', async ({ page }) => {
    await expect(page.locator('#propertyGrid')).toBeAttached();
  });

  test('reset button clears guest count to default', async ({ page }) => {
    await page.locator('#guestCount').fill('5');
    await page.locator('#resetAvailability').click();
    await expect(page.locator('#guestCount')).toHaveValue('2');
  });
});

test.describe('Why Ebrostay section', () => {
  test('shows four value cards', async ({ page }) => {
    await expect(page.locator('.value-card')).toHaveCount(4);
  });

  test('each value card has a title', async ({ page }) => {
    const cards = page.locator('.value-card h3');
    await expect(cards).toHaveCount(4);
    for (const card of await cards.all()) {
      await expect(card).not.toBeEmpty();
    }
  });
});

test.describe('How it works section', () => {
  test('shows three steps', async ({ page }) => {
    // scope to #how to avoid matching the owner section's .steps div
    await expect(page.locator('#how .steps article')).toHaveCount(3);
  });

  test('steps are numbered 01, 02, 03', async ({ page }) => {
    const numbers = page.locator('#how .steps article span');
    await expect(numbers.nth(0)).toHaveText('01');
    await expect(numbers.nth(1)).toHaveText('02');
    await expect(numbers.nth(2)).toHaveText('03');
  });
});

test.describe('Split band (tenants vs owners)', () => {
  test('shows two cards', async ({ page }) => {
    await expect(page.locator('.split-card')).toHaveCount(2);
  });

  test('tenant card links to search section', async ({ page }) => {
    const cta = page.locator('.split-card:not(.is-owner) a.button');
    await expect(cta).toHaveAttribute('href', '#search');
  });

  test('owner card links to owner section', async ({ page }) => {
    const cta = page.locator('.split-card.is-owner a.button');
    await expect(cta).toHaveAttribute('href', '#owner');
  });
});

test.describe('Contact section', () => {
  test('shows WhatsApp button', async ({ page }) => {
    const btn = page.locator('[data-whatsapp]');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('href', /wa\.me/);
  });

  test('shows exactly one lead form (no duplicate contact forms)', async ({ page }) => {
    // KAN-14: the Contact section must hold a single primary lead form.
    const section = page.locator('#contact');
    await expect(section.locator('form')).toHaveCount(1);
    await expect(section.locator('#inquiryForm')).toBeVisible();
    // The old chat-style duplicate must no longer be injected.
    await expect(page.locator('.contact-chat')).toHaveCount(0);
  });

  test('inquiry form has all required fields', async ({ page }) => {
    const form = page.locator('#inquiryForm');
    await expect(form.locator('[name="name"]')).toBeVisible();
    await expect(form.locator('[name="email"]')).toBeVisible();
    await expect(form.locator('[name="message"]')).toBeVisible();
    await expect(form.locator('button[type="submit"]')).toBeVisible();
  });

  test('name and email fields are required', async ({ page }) => {
    const form = page.locator('#inquiryForm');
    await expect(form.locator('[name="name"]')).toHaveAttribute('required', '');
    await expect(form.locator('[name="email"]')).toHaveAttribute('required', '');
  });

  test('submitting the inquiry form shows a confirmation', async ({ page }) => {
    // Force the backend path so submission resolves to an in-page confirmation
    // (instead of a mailto: handoff) and assert the success note appears.
    await page.evaluate(() => {
      (window as any).EbrostayBackend = {
        isConfigured: () => true,
        sendInquiry: async () => ({ ok: true }),
        getIsAdmin: () => false,
        loadFavorites: async () => []
      };
    });
    const form = page.locator('#inquiryForm');
    await form.locator('[name="name"]').fill('Test User');
    await form.locator('[name="email"]').fill('test@example.com');
    await form.locator('[name="message"]').fill('Need a 3 month stay.');
    await form.locator('button[type="submit"]').click();
    await expect(form.locator('.form-note.is-success')).toBeVisible();
  });
});

test.describe('Language switching', () => {
  test('switches UI to English when EN is clicked', async ({ page }) => {
    await page.locator('[data-lang="en"]').click();
    await expect(page.locator('[data-lang="en"]')).toHaveClass(/is-active/);
    await expect(page.locator('.nav-cta')).toContainText(/search|find/i);
  });

  test('switches back to Spanish when ES is clicked', async ({ page }) => {
    await page.locator('[data-lang="en"]').click();
    await page.locator('[data-lang="es"]').click();
    await expect(page.locator('[data-lang="es"]')).toHaveClass(/is-active/);
  });
});

test.describe('Saved homes — header Guardados (KAN-12)', () => {
  test('header Guardados applies the saved-only filter to cards, quick filter, status and map pins', async ({ page }) => {
    await page.locator('#propertyGrid .property-card').first().waitFor();

    const cards = page.locator('#propertyGrid .property-card');
    const totalCount = await cards.count();
    expect(totalCount).toBeGreaterThan(1); // need an unsaved card to prove filtering

    // Save exactly one listing.
    await cards.first().locator('.favorite-button').click();

    // Activate saved-only via the header Guardados link.
    await page.locator('.saved-flats-link').click();

    // Only the saved card stays visible.
    await expect(page.locator('#propertyGrid .property-card:not([hidden])')).toHaveCount(1);

    // The saved quick filter button shows its active state (shared code path).
    await expect(page.locator('.saved-quick-filter')).toHaveClass(/is-active/);

    // Status reflects the saved-only state (count-agnostic: singular or plural).
    await expect(page.locator('#availabilityStatus')).toContainText(/saved homes?|viviendas? guardadas?/i);

    // Map pins match the single visible card.
    await expect(page.locator('.leaflet-marker-icon')).toHaveCount(1);
  });
});
