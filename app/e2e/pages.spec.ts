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
  /** Serve /api/me as signed-out for this route. The shared fixture is an
   *  authenticated user, which suits every page except the one whose entire
   *  job is the signed-out state: /sign-in forwards signed-in visitors away,
   *  so under the shared fixture the test would assert against the page it
   *  redirected to. */
  anonMe?: true;
};

const ROUTES: RouteCase[] = [
  { path: "/", expect: { es: /Zaragoza/, en: /Zaragoza/ } },
  { path: "/about", expect: { es: /propietarios/i, en: /owners/i } },
  { path: "/privacy", expect: { es: /datos/i, en: /data/i } },
  // Where a signed-out visitor is sent, including by the 401 override. It
  // carries one button to Entra's hosted page; the choice of provider lives
  // there and cannot be moved here (see Choices.tsx).
  { path: "/sign-in", expect: { es: /Entra en Ebrostay/i, en: /Sign in to Ebrostay/i }, anonMe: true },
  { path: "/property?id=pedro1", expect: { es: /Pedro II/, en: /Pedro II/ } },
  { path: "/design", expect: { es: /dise/i, en: /design/i } },
  { path: "/design/type", expect: { es: /tipograf/i, en: /type/i } },
  { path: "/host", expect: { es: /vivienda/i, en: /home/i } },
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

    test(`${url} renders without errors`, async ({ page }) => {
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
