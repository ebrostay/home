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
};

const ROUTES: RouteCase[] = [
  { path: "/", expect: { es: /Zaragoza/, en: /Zaragoza/ } },
  { path: "/about", expect: { es: /propietarios/i, en: /owners/i } },
  { path: "/privacy", expect: { es: /datos/i, en: /data/i } },
  { path: "/property?id=pedro1", expect: { es: /Pedro II/, en: /Pedro II/ } },
  { path: "/design", expect: { es: /dise/i, en: /design/i } },
  { path: "/design/type", expect: { es: /tipograf/i, en: /type/i } },
  { path: "/host", expect: { es: /vivienda/i, en: /home/i } },
  // The offer, not step 1 (ADR-033): /host/new opens on the import start
  // screen now, and the nine steps sit behind "Start with a blank form".
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
  for (const { path, expect: expected, status, allowConsole = [] } of ROUTES) {
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
