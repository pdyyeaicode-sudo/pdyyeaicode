/**
 * Playwright configuration, scoped to browser-only questions.
 *
 * These tests exist for behaviour that jsdom cannot answer because it computes no
 * layout — chiefly how CSS transforms on SVG children compose with ancestor
 * transforms. Everything else stays in Vitest, which is far faster.
 *
 * `testDir` is deliberately separate from `src/` so `npm test` (Vitest) and
 * `npm run test:browser` (Playwright) never try to run each other's files.
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./browser-tests",
  /*
    Benchmarks are excluded from the default run and have their own script.

    They are not flaky and they are not slow to no purpose: `realisticContent` drives five
    two-second gestures across four artboard sizes, `inputLatency` runs 30 timed trials per
    renderer, and `commitHitch` waits out a commit four times. Run alongside the correctness
    suite on six workers they saturate the machine, and the victims are the tests that drive
    eight handle drags with settling waits — six of `resizeRotateAcceptance`'s cases timed
    out that way while passing on their own.
    
    Correctness tests and benchmarks want opposite things from a machine: one wants
    parallelism, the other wants to be alone. `npm run test:bench` runs these with a single
    worker, which is also the only way their absolute timings mean anything.
  */
  testIgnore: [
    "**/realisticContent.spec.ts",
    "**/inputLatency.spec.ts",
    "**/commitHitch.spec.ts",
  ],
  // Layout measurements must be reproducible, so no retries: a flaky result here
  // would mean the measurement itself is wrong.
  retries: 0,
  fullyParallel: true,
  reporter: [["list"]],
  // Two servers, for two different needs.
  //
  // The dev server is fast and fine for pure layout questions. The Skia overlay
  // needs the PRODUCTION build, because it dynamically imports the engine module
  // out of `public/`, which Vite's dev server refuses to serve through import
  // analysis. Testing the built artifact is the more faithful check regardless.
  webServer: [
    {
      command: "npx vite --port 5199 --strictPort",
      url: "http://localhost:5199/browser-tests/harness/index.html?zoom=1",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command:
        "npx vite build --config browser-tests/vite.harness.config.ts && npx vite preview --config browser-tests/vite.harness.config.ts",
      url: "http://localhost:5200/",
      reuseExistingServer: true,
      timeout: 240_000,
    },
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:5199",
    // A fixed device pixel ratio keeps getBoundingClientRect values stable
    // regardless of the host display.
    deviceScaleFactor: 1,
    // Large enough to contain the harness host (1200x900) in full, so a layer at
    // 4x zoom is still reachable by the mouse. A viewport smaller than the host
    // silently clips the bottom-right, and a drag to an off-screen point does
    // nothing — which reads as "the handle did not move" rather than as a
    // reachability problem.
    viewport: { width: 1400, height: 1000 },
  },
  projects: [
    {
      name: "chromium",
      // The viewport and pixel ratio are repeated here on purpose: a project's
      // `use` REPLACES the top-level one for the keys it sets, and
      // `devices["Desktop Chrome"]` sets `viewport`. Spreading it without
      // restating the viewport put the tests back on 1280x720 while the config
      // above claimed otherwise.
      use: {
        ...devices["Desktop Chrome"],
        deviceScaleFactor: 1,
        viewport: { width: 1400, height: 1000 },
      },
    },
  ],
});
