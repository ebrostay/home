import { defineConfig, devices } from "@playwright/test";

// Port of its own so a `npm run dev` you already have open on 3000 keeps
// working while the suite runs.
const PORT = 3021;

export default defineConfig({
  testDir: "./e2e",
  // The suite asserts on uncaught exceptions and console errors. A retry would
  // hide a render crash that only fires on a cold module load, which is
  // exactly the class of bug this exists to catch.
  retries: 0,
  fullyParallel: true,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // `next dev`, not the static export: the pages are client-rendered, so
    // this exercises the same component code, and `npm run build` already
    // guards the export itself. Every /api/* call is stubbed in the spec, so
    // no Functions host, Cosmos emulator or Azurite needs to be running.
    command: `NEXT_DIST_DIR=.next-e2e npm run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}/es/`,
    // Never reuse: a server on this port is not "already warmed up for you",
    // it is a SECOND run of this suite in the same checkout — and two runs
    // share one dev server and one .next-e2e, which is how 2026-08-01's
    // half-hour went. The symptom is not a clean failure: pages start
    // answering 500 from a turbopack manifest read as two concatenated JSON
    // documents, 30-40 tests go red at once, and none of them are about the
    // code you changed. Refusing to reuse turns that into "port 3021 is
    // already used", which says what is wrong and what to do about it.
    // The cost is ~10s of server start per run, which is the cheaper half of
    // this trade by a wide margin.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
