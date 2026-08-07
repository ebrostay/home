import { expect, test, type ConsoleMessage, type Page, type Route } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Every page in the app, opened in both languages, asserting the one thing a
// page must always do: render without throwing.
//
// This exists because on 2026-07-30 the owner's portfolio page died with
// `RangeError: Invalid time value` — a formatter met a timestamp it could not
// read and took the whole route down — and nothing in the suite noticed. The
// API bug behind it is pinned in api/Ebrostay.Api.Tests, and the formatter in
// lib/portfolio.test.ts; this is the net that catches the *class*, on routes
// no unit test covers.
//
// It is hermetic: every /api/* call is served from e2e/fixtures, so no
// Functions host, Cosmos emulator or Azurite needs to be running, and the
// suite cannot go red because seed data drifted. Re-record the fixtures from
// a running stack when the API's response shape changes — the shapes matter
// more than the values, which is why they were recorded rather than written.

const FIXTURES = join(__dirname, "fixtures");
const fixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

// A one-pixel PNG stands in for every image and map tile. The alternative is
// letting the page reach Azurite and openstreetmap.org, which makes the suite
// depend on a running emulator and on the network.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const REVIEW_ID = "01d061dcb79c400cb83dbcfc9e9390ed";

/** Serves the API from recorded fixtures and every image from a pixel.
 *  Returns the paths it had no fixture for, so an endpoint added later shows
 *  up as an explicit gap rather than a silent empty array. */
async function stubBackend(page: Page): Promise<string[]> {
  const unstubbed: string[] = [];

  await page.route("**/*", async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";

    // Photos live in blob storage (Azurite on :10000 locally) and map tiles on
    // openstreetmap.org. Neither should decide whether this suite passes.
    if (/\.(png|jpe?g|webp|avif|gif|svg)$/i.test(path) || url.port === "10000") {
      return route.fulfill({ contentType: "image/png", body: PIXEL });
    }

    // Third parties — the umami analytics script today. Served empty with the
    // right content type rather than aborted: a blocked or mistyped script is
    // itself a console error, which would fail every test in this file for a
    // reason that has nothing to do with the page.
    if (!local) {
      const type = route.request().resourceType();
      if (type === "image" || type === "font") {
        return route.fulfill({ contentType: "image/png", body: PIXEL });
      }
      return route.fulfill({
        contentType: type === "stylesheet" ? "text/css" : "application/javascript",
        body: "",
      });
    }

    if (!path.startsWith("/api/")) return route.continue();

    const json = (body: string) =>
      route.fulfill({ contentType: "application/json", body });

    if (path === "/api/me") return json(fixture("me.json"));
    if (path === "/api/properties") return json(fixture("properties.json"));
    if (path === "/api/nearby/vocabulary") return json(fixture("nearby-vocabulary.json"));

    // The AI-assisted import (ADR-033). The GET fixture's `result` is the same
    // payload infra/stub-extractor.mjs's FIXTURE sends over the real callback,
    // so one body is the source of truth for both the manual stub and this
    // suite — a drift between them would otherwise only show up by hand.
    if (path === "/api/import" && route.request().method() === "POST") {
      return route.fulfill({
        status: 202,
        contentType: "application/json",
        body: fixture("import-start.json"),
      });
    }
    if (path === "/api/import/imp_test") return json(fixture("import-job-done.json"));

    if (path === "/api/host/properties") return json(fixture("host-properties.json"));

    if (path.startsWith("/api/host/properties/")) {
      const id = path.split("/")[4];
      return json(fixture(id === REVIEW_ID ? "host-property-review.json" : "host-property.json"));
    }

    // Both route lookups under a property — the saved nearby entry's
    // (`…/nearby/{entryId}/route`) and a guest's own saved place
    // (`…/place-route`, ADR-039). Matched BEFORE the detail fixture below,
    // which would otherwise answer them with a whole listing document.
    if (/\/route$/.test(path) || path.endsWith("/place-route")) {
      return json(fixture("route.json"));
    }

    if (path.startsWith("/api/properties/")) return json(fixture("property-detail.json"));

    unstubbed.push(path);
    return json("[]");
  });

  return unstubbed;
}

// React logs this as an *error* on every dev page load, from the pre-paint
// theme bootstrap in app/[locale]/layout.tsx. It is dev-only noise that does
// not exist in the production build, and it has been investigated and
// reported as a bug twice. Nothing else is allowed through: this list is the
// whole reason a console assertion is usable at all, so keep it short and
// keep each entry's justification with it.
const ALLOWED_CONSOLE = [/Encountered a script tag while rendering React component/];

// Next's dev overlay and the app's own failure states. If any of these text
// fragments is on the page, it rendered but did not work.
const FAILURE_TEXT = [
  "This page couldn't load",
  "This page couldn’t load",
  "Unhandled Runtime Error",
  "Application error",
];

type RouteCase = {
  /** Path after the locale prefix, e.g. "/about". */
  path: string;
  /** What proves this page actually rendered its own content. */
  expect: { es: string | RegExp; en: string | RegExp };
  /** The not-found page is supposed to answer 404; every other page is not. */
  status?: number;
  /** Console errors expected on THIS route only. Scoped per route on purpose:
   *  a global allowance would blind every other page to the same class. */
  allowConsole?: RegExp[];
  /** Simulate a signed-out visitor for this route: /api/me answers
   *  unauthenticated AND the owner endpoints (e.g. /api/host/properties)
   *  answer 401, matching what a real signed-out visitor gets everywhere.
   *  The shared fixture is an authenticated user, which suits every page
   *  except the ones whose entire job is the signed-out state: /sign-in
   *  forwards signed-in visitors away, so under the shared fixture the test
   *  would assert against the page it redirected to; /host shows a
   *  different component entirely when signed out. */
  anonMe?: true;
};

const ROUTES: RouteCase[] = [
  { path: "/", expect: { es: /Zaragoza/, en: /Zaragoza/ } },
  { path: "/about", expect: { es: /propietarios/i, en: /owners/i } },
  { path: "/privacy", expect: { es: /datos/i, en: /data/i } },
  // Where a signed-out visitor is sent, including by the 401 override. Both
  // buttons must render: email into the Entra tenant, Microsoft DIRECTLY to
  // the consumer login (ADR-036 as amended). If this row renders without
  // "Microsoft", the second door has gone missing.
  { path: "/sign-in", expect: { es: /Microsoft/, en: /Microsoft/ }, anonMe: true },
  { path: "/property?id=pedro1", expect: { es: /Pedro II/, en: /Pedro II/ } },
  // The same page signed out, where the booking panel shows a sign-in door
  // instead of the two request channels (ADR-015). The estimate above it is
  // unchanged, so the case still asserts the home actually rendered; what
  // the gate itself does is pinned by its own test further down.
  {
    path: "/property?id=pedro1",
    expect: { es: /Entrar para solicitar/, en: /Sign in to request/ },
    anonMe: true,
  },
  { path: "/design", expect: { es: /dise/i, en: /design/i } },
  { path: "/design/type", expect: { es: /tipograf/i, en: /type/i } },
  { path: "/host", expect: { es: /vivienda/i, en: /home/i } },
  // The same route signed out, which since 2026-08-01 is a different page:
  // the owner pitch, not the portfolio. Both faces are covered because the
  // bug that made this route public was that only one of them existed.
  {
    path: "/host",
    expect: { es: /Publica tu vivienda/i, en: /List your home/i },
    anonMe: true,
  },
  // The offer, not step 1 (ADR-033): /host/new opens on the import start
  // screen now, and the nine steps sit behind "Start with a blank form".
  // This case therefore renders StartScreen and nothing else — the nine steps
  // are covered by "the blank form reaches the nine steps" below, which is
  // where DraftBar, SectionNav, StepCard, StepFooter and AddressFields
  // actually get opened. Neither case can stand in for the other, and the
  // route-enumeration guard at the bottom of this file cannot tell: the path
  // is listed either way.
  { path: "/host/new", expect: { es: /anunciada/i, en: /listed/i } },
  { path: "/host/manage?id=pedro1", expect: { es: /Pedro II/, en: /Pedro II/ } },
  // The listing in review: the state whose "submitted on <date>" line is what
  // crashed the portfolio. Worth its own case, not just a row in the list.
  { path: `/host/manage?id=${REVIEW_ID}`, expect: { es: /./, en: /./ } },
  { path: "/host/edit?id=pedro1", expect: { es: /Pedro II/, en: /Pedro II/ } },
  // app/not-found.tsx, which no other test reaches. It must render its own
  // page, not the browser's — and it must still say 404.
  {
    path: "/no-such-page",
    expect: { es: /./, en: /./ },
    status: 404,
    allowConsole: [
      // The page's own 404 status, which is the point of the route.
      /Failed to load resource.*404/,
      // not-found.tsx renders outside the [locale] layout, so it carries its
      // own copy of the pre-paint theme bootstrap. React's dev build rewrites
      // an inline <script> during client render, so the hydrated attributes
      // differ from the server's — the same dev-only artefact as the warning
      // in ALLOWED_CONSOLE, reported under a different message. The bootstrap
      // itself works: it ships in the prerendered HTML and runs before paint.
      /A tree hydrated but some attributes of the server rendered HTML didn't match/,
    ],
  },
];

for (const locale of ["es", "en"] as const) {
  for (const { path, expect: expected, status, allowConsole = [], anonMe } of ROUTES) {
    const url = `/${locale}${path}`;

    test(`${url}${anonMe ? " (signed out)" : ""} renders without errors`, async ({ page }) => {
      const crashes: string[] = [];
      const consoleErrors: string[] = [];

      page.on("pageerror", (err) => crashes.push(err.stack ?? err.message));
      page.on("console", (msg: ConsoleMessage) => {
        if (msg.type() !== "error") return;
        const text = msg.text();
        if ([...ALLOWED_CONSOLE, ...allowConsole].some((rx) => rx.test(text))) return;
        consoleErrors.push(text);
      });

      const unstubbed = await stubBackend(page);

      // Registered after stubBackend on purpose: Playwright matches routes
      // newest-first, so this wins over the shared fixture.
      if (anonMe) {
        await page.route("**/api/me", (route: Route) =>
          route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({
              authenticated: false, userId: null, name: null, provider: null,
              roles: ["anonymous"], isAdmin: false, isDeactivated: false,
            }),
          }),
        );

        // A signed-out visitor is signed out everywhere. Without this the
        // owner endpoint keeps answering 200 from the fixture and the page
        // under test is the portfolio, not the pitch.
        await page.route("**/api/host/properties", (route: Route) =>
          route.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
        );
      }

      const response = await page.goto(url, { waitUntil: "networkidle" });
      if (status) expect(response?.status(), `HTTP status for ${url}`).toBe(status);
      else expect(response?.status(), `HTTP status for ${url}`).toBeLessThan(400);

      // An uncaught exception during render is the failure this file exists
      // for, so it is asserted first and reported in full.
      expect(crashes, `uncaught exception on ${url}`).toEqual([]);

      const body = await page.locator("body").innerText();
      for (const fragment of FAILURE_TEXT) {
        expect(body, `${url} rendered a failure state`).not.toContain(fragment);
      }

      await expect(page.locator("main")).toBeVisible();
      expect(body.trim().length, `${url} rendered no text`).toBeGreaterThan(50);
      expect(body).toMatch(expected[locale]);

      expect(consoleErrors, `console errors on ${url}`).toEqual([]);
      expect(unstubbed, `endpoints with no fixture, reached from ${url}`).toEqual([]);
    });
  }
}

// The nine steps, which are the largest component in the app and which no
// route case reaches any more: /host/new opens on the import offer, and the
// wizard is one click behind it (ADR-033). Same assertions the route cases
// make — an uncaught exception and a console error are the failures this file
// exists for, and moving the wizard behind a button must not move it out of
// their reach.
const BLANK_FORM = {
  es: { button: "Empezar con el formulario en blanco", step: /direcci/i, exit: "Guardar y salir" },
  en: { button: "Start with a blank form", step: /address/i, exit: "Save and exit" },
} as const;

for (const locale of ["es", "en"] as const) {
  const { button, step, exit } = BLANK_FORM[locale];

  test(`/${locale}/host/new — the blank form reaches the nine steps`, async ({ page }) => {
    const crashes: string[] = [];
    const consoleErrors: string[] = [];

    page.on("pageerror", (err) => crashes.push(err.stack ?? err.message));
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (ALLOWED_CONSOLE.some((rx) => rx.test(text))) return;
      consoleErrors.push(text);
    });

    const unstubbed = await stubBackend(page);

    await page.goto(`/${locale}/host/new`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: button }).click();

    // The step card's own question, the draft bar, and the rail: three
    // components the offer screen deliberately does not render.
    await expect(page.locator("main")).toContainText(step);
    await expect(page.getByRole("button", { name: exit })).toBeVisible();
    await expect(page.getByRole("navigation").last()).toBeVisible();

    expect(crashes, `uncaught exception on the ${locale} wizard`).toEqual([]);
    const body = await page.locator("body").innerText();
    for (const fragment of FAILURE_TEXT) {
      expect(body, `the ${locale} wizard rendered a failure state`).not.toContain(fragment);
    }
    expect(consoleErrors, `console errors on the ${locale} wizard`).toEqual([]);
    expect(unstubbed, "endpoints with no fixture, reached from the wizard").toEqual([]);
  });
}

// The pasted-link path (ADR-033), starting from `phase === "start"` — the
// screen /host/new opens on — through `POST /api/import` and the poll's
// `GET /api/import/{id}` to the nine steps with the merge already applied.
// Asserting the address field's actual value and the banner naming the
// source is deliberate: a test that only checked "no crash" would stay green
// even if the merge silently dropped every field on the floor, which is
// exactly the failure this fixture pair exists to catch.
const IMPORT_URL = "https://www.idealista.com/inmueble/107294518/";
const IMPORT_CASE = {
  es: { read: "Leer este anuncio", street: "Dirección", exit: "Guardar y salir" },
  en: { read: "Read this listing", street: "Street address", exit: "Save and exit" },
} as const;

for (const locale of ["es", "en"] as const) {
  const { read, street, exit } = IMPORT_CASE[locale];

  test(`/${locale}/host/new — a pasted link reaches the nine steps with marks`, async ({
    page,
  }) => {
    const crashes: string[] = [];
    const consoleErrors: string[] = [];

    page.on("pageerror", (err) => crashes.push(err.stack ?? err.message));
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (ALLOWED_CONSOLE.some((rx) => rx.test(text))) return;
      consoleErrors.push(text);
    });

    const unstubbed = await stubBackend(page);

    // Fresh load, no `?import=` — this is `phase === "start"`, the offer
    // screen, before anything is pasted.
    await page.goto(`/${locale}/host/new`, { waitUntil: "networkidle" });

    await page.locator("#import-url").fill(IMPORT_URL);
    await page.getByRole("button", { name: read }).click();

    // The merge landed: the address field carries the fixture's value, not a
    // placeholder or an empty control, and the banner names the source that
    // filled it — the same fixture body infra/stub-extractor.mjs sends for
    // real, per Task 9's brief.
    await expect(page.getByLabel(street)).toHaveValue("Calle de Bilbao, 12");
    await expect(page.locator("main")).toContainText(/Idealista/);
    await expect(page.getByRole("button", { name: exit })).toBeVisible();

    expect(crashes, `uncaught exception on the ${locale} import`).toEqual([]);
    const body = await page.locator("body").innerText();
    for (const fragment of FAILURE_TEXT) {
      expect(body, `the ${locale} import rendered a failure state`).not.toContain(fragment);
    }
    expect(consoleErrors, `console errors on the ${locale} import`).toEqual([]);
    expect(unstubbed, "endpoints with no fixture, reached from the import").toEqual([]);
  });
}

// The booking gate (ADR-015). Two halves, and both have to hold: signed out
// the two request channels must be GONE — not merely styled as disabled,
// which a `pointer-events-none` link already looks like and which leaves the
// mailto: and wa.me hrefs sitting in the markup — and the sign-in link must
// carry this exact URL back, query string included, so the round trip ends on
// the home they were looking at rather than the front page.
for (const locale of ["es", "en"] as const) {
  const label = locale === "es" ? "Entrar para solicitar" : "Sign in to request";
  // Belongs to the request buttons, not to the sign-in door: it answers "what
  // happens when I press that?", and signed out there is no request to
  // reassure anybody about yet.
  const reassurance =
    locale === "es" ? "Todavía no se te cobra nada" : "You won't be charged yet";

  test(`/${locale}/property — the request channels are behind the login`, async ({ page }) => {
    await stubBackend(page);
    await page.route("**/api/me", (route: Route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: false, userId: null, name: null, provider: null,
          roles: ["anonymous"], isAdmin: false, isDeactivated: false,
        }),
      }),
    );

    await page.goto(`/${locale}/property?id=pedro1`, { waitUntil: "networkidle" });

    const panel = page.getByRole("complementary");
    await expect(panel.getByRole("link", { name: label })).toBeVisible();
    await expect(panel.locator('a[href^="mailto:"]')).toHaveCount(0);
    await expect(panel.locator('a[href*="wa.me"]')).toHaveCount(0);

    // The whole point of the door: it comes back here, query string and all.
    // Trailing slashes on both paths — `trailingSlash` is on, so that is what
    // the router hands out, and it is the same shape ADR-037 documents for
    // the owner bounce (/es/sign-in/?redirect=/es/host/manage/?id=pedro1).
    await expect(panel.getByRole("link", { name: label })).toHaveAttribute(
      "href",
      `/${locale}/sign-in/?redirect=${encodeURIComponent(`/${locale}/property/?id=pedro1`)}`,
    );

    await expect(panel).not.toContainText(reassurance);

    // The estimate is NOT gated — it is the reason to be on the page at all.
    await expect(panel).toContainText("€");
  });
}

// The signed-in face, which the route case above cannot distinguish from a
// gate that simply never engages: with the shared (authenticated) fixture
// both channels must be back, hrefs and all.
//
// The dates are in the URL and they are not incidental. The panel's own
// default stay (today → a month on) collides with the fixture's August block,
// and a blocked panel renders both channels with NO href — so an <a> without
// one is not a link at all, and this test would fail against a perfectly
// working gate. These two are a free window after the last block, and long
// enough to clear ADR-022's 31-day floor.
test("/en/property — a signed-in visitor gets both request channels", async ({ page }) => {
  await stubBackend(page);
  await page.goto("/en/property?id=pedro1&from=2026-09-01&to=2026-10-05", {
    waitUntil: "networkidle",
  });

  const panel = page.getByRole("complementary");
  await expect(panel.getByRole("link", { name: "Request on WhatsApp" })).toHaveAttribute(
    "href",
    /^https:\/\/wa\.me\/\d+\?text=/,
  );
  await expect(panel.getByRole("link", { name: "Request by email" })).toHaveAttribute(
    "href",
    /^mailto:.+@.+\?subject=/,
  );
  await expect(panel.getByRole("link", { name: "Sign in to request" })).toHaveCount(0);

  // And the line that describes those buttons comes back with them.
  await expect(panel).toContainText("You won't be charged yet");
});

// "Your places" (ADR-039), which the route case above cannot reach: a fresh
// browser context has an empty store, so the section renders its empty state
// and measures nothing. Seeded with two places BEFORE the page loads, the
// three things that make the section worth having must hold — the figures
// come from the route endpoint and not from arithmetic on a typed distance,
// the foot/car toggle re-measures against a different key, and a route drawn
// for a selected place lands on this section's own map.
//
// `addInitScript` rather than an `evaluate` after load: the store is read in a
// mount effect, so writing it afterwards would race the very render under
// test.
const SEEDED_PLACES = [
  { id: "seed-a", label: "Plaza del Pilar", detail: "Casco Histórico · 50003", lat: 41.6564, lng: -0.8785 },
  { id: "seed-b", label: "Estación Delicias", detail: "Delicias · 50011", lat: 41.6588, lng: -0.9109 },
];

test("/en/property — saved places are measured, and the toggle re-measures", async ({ page }) => {
  await stubBackend(page);
  await page.addInitScript((places) => {
    localStorage.setItem("ebrostay-your-places", JSON.stringify(places));
    localStorage.removeItem("ebrostay-place-routes");
  }, SEEDED_PLACES);

  await page.goto("/en/property?id=pedro1", { waitUntil: "networkidle" });

  // Both lists now live inside the neighbourhood section (ADR-040), so they
  // are addressed by their own anchors — a `section` filter would match the
  // outer one too and count the nearby entries as places.
  const section = page.locator("#your-places");
  const rows = section.getByRole("listitem");
  await expect(rows).toHaveCount(2);

  // route.json: minutes [4, 6], metres [340, 400]. Both figures are the
  // SERVER's — a row showing anything else means the section went back to
  // computing its own. The row renders the range for minutes and the upper
  // bound for metres (YourPlaces.tsx).
  for (const label of ["Plaza del Pilar", "Estación Delicias"]) {
    const row = rows.filter({ hasText: label });
    await expect(row).toContainText("4–6 min");
    await expect(row).toContainText("400 m");
  }

  // ONE map on the page (ADR-040), and it belongs to the neighbourhood
  // section — the places list mounts none of its own. This assertion is what
  // fails if a second one ever comes back.
  const neighbourhood = page.locator("#neighbourhood");
  await expect(page.locator(".leaflet-container")).toHaveCount(1);
  await expect(section.locator(".leaflet-container")).toHaveCount(0);

  // One selection across BOTH lists, because there is one line to draw.
  // `[aria-pressed]` picks a row's own select button over the remove button
  // beside it, which carries the same place name in its label.
  await rows.first().locator("button[aria-pressed]").click();
  await expect(neighbourhood.locator('button[aria-pressed="true"]')).toHaveCount(1);

  // Selecting in the nearby list takes the selection away from the places
  // list rather than lighting up a second row.
  await page.locator("#whats-nearby").locator("button[aria-pressed]").first().click();
  await expect(neighbourhood.locator('button[aria-pressed="true"]')).toHaveCount(1);
  await expect(section.locator('button[aria-pressed="true"]')).toHaveCount(0);

  // The one travel toggle lives with the map, not inside either list, and it
  // re-measures the places list too. The wrapping label, not the radio:
  // `Segmented` renders a visually-hidden input (arrow-key navigation for
  // free) behind visible label text, and the label is what a guest clicks.
  await expect(section.getByRole("radiogroup")).toHaveCount(0);
  await expect(page.getByRole("radiogroup", { name: "Travel mode" })).toHaveCount(1);
  const carRequest = page.waitForRequest(
    (r) => r.url().includes("place-route") && r.url().includes("profile=car"),
  );
  await neighbourhood.locator("label").filter({ hasText: "By car" }).click();
  await carRequest;
});

test("/en/property — the fifth saved place is the last one", async ({ page }) => {
  await stubBackend(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "ebrostay-your-places",
      JSON.stringify(
        // Six offered, five kept: the cap is enforced on the way in, not only
        // at the button, because a store this build did not write is not a
        // store it controls.
        Array.from({ length: 6 }, (_, i) => ({
          id: `seed-${i}`,
          label: `Place ${i}`,
          detail: "",
          lat: 41.65 + i / 1000,
          lng: -0.88,
        })),
      ),
    );
  });

  await page.goto("/en/property?id=pedro1", { waitUntil: "networkidle" });

  const section = page.locator("#your-places");
  await expect(section.getByRole("listitem")).toHaveCount(5);
  await expect(section.getByRole("button", { name: "Add a place" })).toHaveCount(0);
  await expect(section).toContainText("Remove one to add another");
});

// A page added later must not quietly escape this file. Without this, the
// suite only ever covers the routes someone remembered to list — and the
// routes nobody is thinking about are exactly the ones that break unnoticed.
test("every route under app/[locale] has a case in this file", () => {
  const root = join(__dirname, "..", "app", "[locale]");

  const pages = (dir: string, prefix = ""): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.isDirectory()) return pages(join(dir, entry.name), `${prefix}/${entry.name}`);
      return entry.name === "page.tsx" ? [prefix || "/"] : [];
    });

  // ROUTES carries query strings; the route itself is the part before "?".
  const covered = new Set(ROUTES.map((r) => r.path.split("?")[0]));

  expect(pages(root).filter((p) => !covered.has(p)), "routes with no test case").toEqual([]);
});

// Undo/redo are the only toolbar tools with a disabled state, and the only
// ones whose effect is a document-wide history step rather than a mark on the
// selection — neither is checkable without a real editor, so it is checked
// here. The style book at /design is the one page that renders the editor
// without an owner session or a listing behind it.
test("the editor's undo and redo walk the history", async ({ page }) => {
  await stubBackend(page);
  await page.goto("/en/design", { waitUntil: "networkidle" });

  const body = page.locator(".ProseMirror").first();
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const redo = page.getByRole("button", { name: "Redo", exact: true });

  // Nothing typed yet: there is no history to walk in either direction.
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  await body.click();
  await page.keyboard.type("Zaragoza");
  await expect(body).toContainText("Zaragoza");
  await expect(undo).toBeEnabled();

  await undo.click();
  await expect(body).not.toContainText("Zaragoza");
  await expect(redo).toBeEnabled();

  await redo.click();
  await expect(body).toContainText("Zaragoza");
});

// The regression itself, at the level it actually bit: not "is the formatter
// correct" (lib/portfolio.test.ts) or "does the API return ISO"
// (api/Ebrostay.Api.Tests/CosmosDateSafeSerializerTests.cs), but "can one
// unreadable field in one listing cost the owner the whole page". It could,
// and it did. The malformed value here is verbatim what the API returned.
test("a listing with an unreadable timestamp does not take down the portfolio", async ({
  page,
}) => {
  const crashes: string[] = [];
  page.on("pageerror", (err) => crashes.push(err.stack ?? err.message));

  await stubBackend(page);

  // Registered after stubBackend so it wins: Playwright matches the most
  // recently added route first.
  await page.route("**/api/host/properties", async (route) => {
    const rows = JSON.parse(fixture("host-properties.json"));
    rows[0].updatedAt = "07/22/2026 12:00:00";
    rows[0].status = "pending_review";
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(rows) });
  });

  await page.goto("/es/host", { waitUntil: "networkidle" });

  expect(crashes, "uncaught exception from one bad timestamp").toEqual([]);

  const body = await page.locator("body").innerText();
  for (const fragment of FAILURE_TEXT) expect(body).not.toContain(fragment);

  // The other listings are still there — the damage stayed inside the one row.
  const rows = JSON.parse(fixture("host-properties.json")) as { name: string }[];
  const named = rows.filter((r) => r.name).slice(1, 4);
  for (const row of named) expect(body).toContain(row.name);
});

// The reported bug: signed out, the owner segment pointed at /about#hosts
// while its matcher only knew /host, so the pill went blank. It is one href
// now — asserted in both auth states, because the whole failure was that the
// two states disagreed.
for (const anon of [false, true]) {
  test(`the owner nav segment is highlighted on /host${anon ? " (signed out)" : ""}`, async ({
    page,
  }) => {
    await stubBackend(page);

    if (anon) {
      await page.route("**/api/me", (route: Route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            authenticated: false, userId: null, name: null, provider: null,
            roles: ["anonymous"], isAdmin: false, isDeactivated: false,
          }),
        }),
      );
      await page.route("**/api/host/properties", (route: Route) =>
        route.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
      );
    }

    await page.goto("/en/host", { waitUntil: "networkidle" });

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link", { name: "Manage Property" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav.getByRole("link", { name: "Find a home" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });
}

// Every segment, on the route it owns, in both languages — and exactly one lit
// at a time. The per-route unit tests live in lib/nav.test.ts; this is the
// assertion that the model is actually WIRED to what the header renders, which
// is the half that broke: the matcher was right about /host all along, the
// href was pointing somewhere else.
//
// "How it works" owns the whole of /about as of 2026-08-01. It matched nothing
// before that, and a segment that can never light up reads as broken.
// The landmark's own accessible name is translated too — the pre-existing
// owner-segment test above hardcodes the English one and only ever visits
// /en, which is why it never noticed.
const SEGMENTS = {
  es: {
    nav: "Navegación principal",
    find: "Buscar vivienda",
    list: "Gestiona tu vivienda",
    how: "Cómo funciona",
  },
  en: {
    nav: "Main navigation",
    find: "Find a home",
    list: "Manage Property",
    how: "How it works",
  },
} as const;

for (const locale of ["es", "en"] as const) {
  for (const [key, route] of [
    ["find", "/"],
    ["list", "/host"],
    ["how", "/about"],
  ] as const) {
    test(`/${locale}${route} lights exactly the ${key} nav segment`, async ({ page }) => {
      await stubBackend(page);
      await page.goto(`/${locale}${route}`, { waitUntil: "networkidle" });

      const { nav: navLabel, ...labels } = SEGMENTS[locale];
      const nav = page.getByRole("navigation", { name: navLabel });

      for (const [otherKey, label] of Object.entries(labels)) {
        const link = nav.getByRole("link", { name: label, exact: true });
        if (otherKey === key) {
          await expect(link, `${label} should be current on ${route}`).toHaveAttribute(
            "aria-current",
            "page",
          );
        } else {
          await expect(link, `${label} should NOT be current on ${route}`).not.toHaveAttribute(
            "aria-current",
            "page",
          );
        }
      }
    });
  }
}

// The bare domain, which since 2026-08-01 picks a language instead of always
// answering Spanish (ADR-038).
//
// These open /index.html, not "/". The file IS what "/" serves — SWA resolves
// a directory to its index, in production and under `swa start` — but the
// suite runs on `next dev`, which hands "/" to the App Router and gets a 404
// (public/ is never consulted for it). /index.html reaches the same bytes and
// runs the same script; the only untested link in the chain is SWA's own
// directory-index behaviour, and the guard below watches the one piece of
// config that has ever broken it.
//
// Tested here rather than only in lib/locale.test.ts, which pins the rule
// itself, because the code that actually runs is a hand-written copy of
// resolveLocale() inlined in app/public/index.html — and a copy that has
// drifted is exactly the failure a unit test on the original cannot see.
const ROOT_CASES = [
  { browser: "es-ES", lands: "/es/" },
  { browser: "en-GB", lands: "/en/" },
  // Reads neither. English is the deliberate answer, not the site default.
  { browser: "de-DE", lands: "/en/" },
] as const;

for (const { browser, lands } of ROOT_CASES) {
  test.describe(`the bare domain, browser language ${browser}`, () => {
    test.use({ locale: browser });

    test(`lands on ${lands}`, async ({ page }) => {
      await stubBackend(page);
      await page.goto("/index.html", { waitUntil: "networkidle" });
      expect(new URL(page.url()).pathname).toBe(lands);
    });
  });
}

test.describe("the bare domain, with a language already chosen here", () => {
  // A Spanish browser, so a stored "en" can only have come from the switch.
  test.use({ locale: "es-ES" });

  test("honours the stored choice over the browser", async ({ page }) => {
    await stubBackend(page);
    await page.addInitScript(() => {
      localStorage.setItem("ebrostay-language", "en");
    });

    await page.goto("/index.html", { waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).toBe("/en/");
  });

  test("the language switch is what writes that choice", async ({ page }) => {
    await stubBackend(page);
    await page.goto("/es/", { waitUntil: "networkidle" });

    // Nothing stored yet: arriving on a page is not a preference.
    expect(await page.evaluate(() => localStorage.getItem("ebrostay-language"))).toBeNull();

    await page
      .getByRole("group", { name: "Idioma / Language" })
      .first()
      .getByRole("button", { name: "en", exact: true })
      .click();
    await page.waitForURL(/\/en\//);

    expect(await page.evaluate(() => localStorage.getItem("ebrostay-language"))).toBe("en");
  });
});

test.describe("the bare domain, carrying a query", () => {
  test.use({ locale: "en-US" });

  // "/" is where a campaign or shortened link lands, so the redirector has to
  // hand its query on rather than swallow it.
  //
  // What is asserted is the navigation the redirector performed, not the URL
  // the tab settles on: the home page owns its own query string and rewrites
  // it to writeResultsState()'s output on mount ([locale]/page.tsx), which
  // clears any param it does not recognise. That is that page's contract, and
  // reading the final URL here would test it instead of this one.
  test("hands the query string on to the language it picked", async ({ page }) => {
    await stubBackend(page);

    const navigated: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigated.push(frame.url());
    });

    await page.goto("/index.html?utm_source=newsletter", { waitUntil: "networkidle" });

    expect(navigated.map((url) => new URL(url).pathname + new URL(url).search)).toContain(
      "/en/?utm_source=newsletter",
    );
  });
});

// The redirector only ever runs because "/" is NOT redirected at the edge.
// Putting that route rule back — it was there until 2026-08-01, and it is the
// obvious-looking way to make the bare domain work — would send every visitor
// to /es/ before a byte of HTML was served, and every test above would stay
// green, because none of them can go through "/" on `next dev`. This is the
// only thing standing between that rule and a silent regression.
test("staticwebapp.config.json does not redirect / at the edge", () => {
  const config = JSON.parse(
    readFileSync(join(__dirname, "..", "public", "staticwebapp.config.json"), "utf8"),
  ) as { routes?: { route: string; redirect?: string }[] };

  const root = (config.routes ?? []).filter((r) => r.route === "/" && r.redirect);
  expect(root, 'a "/" redirect rule would pre-empt the language redirector').toEqual([]);
});

// The route sweep above only LOADS pages. This is the one interaction test:
// the lightbox is the detail page's main control, and every failure mode
// worth having (opens blank, counter stuck, Esc dead) survives a page that
// renders perfectly fine. The design page is the target because it serves
// eight photos from public/brand with no fixture and no seeded data behind
// it.
//
// Fancybox builds its dialog at document.body, so once open its markup —
// counter, carousel, thumbnail strip — is NOT a descendant of the design
// page's gallery <section>. Only the trigger tiles live there; everything
// after the click is queried from `page`, not from that section.
test("the lightbox opens, advances and closes", async ({ page }) => {
  await stubBackend(page);
  await page.goto("/en/design", { waitUntil: "networkidle" });

  // Anchored on the section's own heading, which is exact; the mosaic's
  // trigger tiles are `<a data-fancybox>` anchors, Fancybox's bind contract.
  const gallerySection = page.locator("section").filter({
    has: page.locator(".ledger-rule", { hasText: /^gallery \(as shipped\)$/ }),
  });
  await expect(gallerySection).toHaveCount(1);

  // Third tile (index 2) — opens the lightbox on photo 3 of 8.
  await gallerySection.locator("a[data-fancybox]").nth(2).click();

  // Fancybox's counter renders `{page + 1}/{pages}` with no spaces around
  // the "/" (dist/fancybox — the f-counter template) — this is the library
  // default, not a value chosen to make the test pass.
  const counter = page.locator(".f-counter");
  await expect(counter).toHaveText("3/8");

  // Fancybox binds its keyboard map at document level while open, so the
  // press reaches it regardless of which element holds focus.
  await page.keyboard.press("ArrowRight");
  await expect(counter).toHaveText("4/8");

  await page.keyboard.press("Escape");

  // The close runs a 350 ms zoom-back tween before the dialog is destroyed;
  // a retrying web-first assertion, not an immediate read, is what makes
  // this deterministic.
  await expect(counter).toHaveCount(0);
});

// The back-swipe flash (fixed 2026-08-03): the router remounts the results
// page on every return from a home, and it used to blank the list to its
// skeleton while refetching — on a phone, a white flash and a scroll jump on
// every back gesture. The list is now remembered across the remount
// (lib/lastKnown.ts) and revalidated silently, so going back must paint
// cards on the first frame and never create a skeleton node at all. The
// MutationObserver is what makes "never" testable: a flash that is painted
// and replaced within one commit would already be gone by the time an
// after-the-fact query ran.
test("returning from a home paints the remembered list, not the skeleton", async ({ page }) => {
  await stubBackend(page);
  await page.goto("/en/", { waitUntil: "networkidle" });

  const firstCard = page.locator("[id^=home-]").first();
  await expect(firstCard).toBeVisible();
  const cardId = await firstCard.getAttribute("id");

  await firstCard.locator("a[href*='property']").first().click();
  await expect(page).toHaveURL(/\/property\/?\?/);
  await expect(page.locator("h1")).toBeVisible();

  await page.evaluate(() => {
    const w = window as typeof window & { __skeletons: number };
    w.__skeletons = 0;
    new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (!(n instanceof Element)) continue;
          w.__skeletons +=
            (n.matches(".skeleton") ? 1 : 0) + n.querySelectorAll(".skeleton").length;
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  });

  await page.goBack();
  await expect(page.locator(`#${cardId}`)).toBeVisible();
  // The card the visitor left from is put back under their eye, and no
  // skeleton ever entered the document on the way.
  await expect(page.locator(`#${cardId}`)).toBeInViewport();
  expect(
    await page.evaluate(
      () => (window as typeof window & { __skeletons: number }).__skeletons,
    ),
  ).toBe(0);
});
