/**
 * Playwright configuration for BENCHMARKS, which have different needs from tests.
 *
 * A correctness test wants parallelism; a benchmark wants to be alone on the machine. Run
 * together, five two-second gesture benchmarks on six workers starved the correctness suite
 * — six of `resizeRotateAcceptance`'s handle-drag cases timed out while passing on their own
 * — and every timing the benchmarks reported was inflated about fivefold. A 400x400 artboard
 * measured SLOWER than a 1080x1080 one, which is how the contention was noticed.
 *
 * So: one worker, longer timeouts, and only the benchmark specs. The default config ignores
 * these files; this one runs nothing else.
 *
 * The absolute numbers quoted in engine/CONTEXT.md come from this configuration. Numbers from
 * a shared run are not comparable to them and should not be recorded as if they were.
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./browser-tests",
  testMatch: [
    "**/realisticContent.spec.ts",
    "**/inputLatency.spec.ts",
    "**/commitHitch.spec.ts",
    "**/dragFrameRate.spec.ts",
    "**/handleGestureFrameRate.spec.ts",
    "**/canvasSmoothness.spec.ts",
  ],
  // One at a time. A benchmark that shares a CPU is measuring the scheduler.
  workers: 1,
  fullyParallel: false,
  // No retries: a benchmark that needed a retry produced a number nobody should trust.
  retries: 0,
  // Generous, because these deliberately run multi-second gestures over four artboard sizes.
  timeout: 240_000,
  reporter: [["list"]],
  webServer: [
    {
      command: "npx vite --port 5199 --strictPort",
      url: "http://localhost:5199/browser-tests/harness/index.html?zoom=1",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // The Skia benchmarks MUST use the built harness: Vite's dev server refuses to serve
      // the engine module through import analysis, so a dev-server run silently measures the
      // SVG renderer while reporting itself as Skia.
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
    deviceScaleFactor: 1,
    // Matches the default config: the harness host is 1200x900 and a viewport smaller than it
    // silently clips the bottom-right, which reads as "the object did not move".
    viewport: { width: 1400, height: 1000 },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        deviceScaleFactor: 1,
        viewport: { width: 1400, height: 1000 },
      },
    },
  ],
});
