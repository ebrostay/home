import type { FullConfig } from "@playwright/test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

// Compile every route ONCE, serially, before the parallel suite is allowed to
// touch the dev server.
//
// Why this exists (2026-08-01, the second and third time it cost an hour):
// `next dev` rewrites `.next-e2e/dev/build-manifest.json` as each route
// compiles, and four Playwright workers requesting fifty-seven routes at once
// makes many of those rewrites concurrent. Two overlapping writes leave the
// file as a complete JSON document followed by the tail of the longer one it
// replaced, and every render after that dies reading it:
//
//   SyntaxError: Unexpected non-whitespace character after JSON at position 992
//
// The failure is loud in the wrong way: thirty to forty tests go red at once,
// none of them about the code under test, each one green when re-run alone.
// Deleting `.next-e2e` repairs it and prevents nothing — it is a race, and a
// cold cache is when it is MOST likely, because that is when everything
// compiles at once.
//
// `reuseExistingServer: false` in the config already rules out the other way
// in (two suite runs sharing one server and one `.next-e2e`). This closes the
// remaining one: after this file has run, every route the suite opens is
// already built, so the workers do no first-compiles and there is nothing left
// to interleave.
//
// Plain requests, not a browser: the route compile happens when the HTML is
// served, which is what writes the manifest. The client chunks that follow are
// already in the manifest by then.

/** Long enough to cover a cold `next dev` first compile of the heaviest route
 *  (the nine-step wizard), short enough to fail the run rather than hang it. */
const ROUTE_TIMEOUT_MS = 60_000;
/** The server may not be listening yet — Playwright's `webServer.url` probe
 *  and this setup are not ordered against each other in every version, so this
 *  waits rather than assuming. */
const BOOT_TIMEOUT_MS = 120_000;

export default async function warmUp(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) throw new Error("global-setup: no baseURL on the chromium project");

  const started = Date.now();
  await waitForServer(baseURL);

  // Derived from the filesystem, not from a list kept beside the suite's own:
  // a route added later must be warmed without anybody remembering to add it
  // here. Same walk the "every route has a case" guard does.
  const routes = pageRoutes(join(__dirname, "..", "app", "[locale]"));

  const targets = [
    // The bare domain's redirector, which is a static file rather than a
    // route — `public/index.html`, opened by the language-choice tests.
    `${baseURL}/index.html`,
    ...["es", "en"].flatMap((locale) =>
      routes.map((path) => `${baseURL}/${locale}${path === "/" ? "/" : path}`),
    ),
    // `app/not-found.tsx`, which no locale route resolves to.
    `${baseURL}/es/no-such-page`,
  ];

  for (const url of targets) {
    // Serial, deliberately. Concurrency here would rebuild the exact race
    // this file exists to remove.
    await get(url, ROUTE_TIMEOUT_MS);
  }

  console.log(
    `[warm-up] compiled ${targets.length} routes in ${Math.round((Date.now() - started) / 1000)}s`,
  );
}

/** Every `page.tsx` under `app/[locale]`, as the path after the locale. */
function pageRoutes(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return pageRoutes(join(dir, entry.name), `${prefix}/${entry.name}`);
    return entry.name === "page.tsx" ? [prefix || "/"] : [];
  });
}

async function waitForServer(baseURL: string) {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  for (;;) {
    try {
      await get(`${baseURL}/es/`, 10_000);
      return;
    } catch (err) {
      if (Date.now() > deadline) {
        throw new Error(`global-setup: ${baseURL} never answered — ${String(err)}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

/** A status is not checked: `/es/no-such-page` is meant to be a 404, and the
 *  compile — the thing being forced here — has already happened by the time
 *  any status comes back. Only a transport failure or a timeout is an error. */
async function get(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    // Drain it: an unread body can leave the connection open, and the next
    // request would then queue behind it rather than compiling the next route.
    await res.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
}
