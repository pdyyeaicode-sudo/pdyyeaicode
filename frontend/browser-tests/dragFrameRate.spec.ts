/**
 * Frames actually delivered during a drag — the number that matches what a user
 * calls "smooth".
 *
 * `canvasSmoothness.spec.ts` measures our JavaScript handler cost, which is now
 * ~0.03ms per pointer sample. That is not the whole story: after the handler writes
 * one `transform` attribute, the BROWSER still has to re-style, re-layout and
 * re-raster that SVG subtree, and none of that shows up in a `performance.now()`
 * bracket around the handler. A single `<canvas>` avoids it entirely — the engine
 * paints one texture — which is the architectural claim being tested here.
 *
 * So this measures, over a fixed wall-clock second of continuous dragging:
 *
 *   - how many animation frames were delivered (60 is the ceiling)
 *   - the longest gap between frames (a single 100ms gap is visible as a stutter)
 *   - how many frames exceeded the 16.7ms budget
 *
 * Both renderers are profiled from the same harness so the comparison is direct.
 * `?renderer=skia` mounts the Skia canvas; without it the SVG DOM is the renderer.
 *
 * Thresholds are deliberately loose — a CI machine's absolute frame rate is not
 * reproducible — and the test's real output is the logged comparison.
 *
 * One responsibility per file: measuring delivered frame rate under drag.
 */

import { expect, test, type Page } from "@playwright/test";

const HARNESS = "/browser-tests/harness/index.html";
/**
 * The built harness, served by the preview server.
 *
 * The Skia case MUST use this: the engine module lives in `public/` and Vite's dev
 * server refuses to serve it through import analysis, so a dev-server run silently
 * falls back to the SVG renderer and produces a number that looks like a Skia
 * measurement but is not one. That happened on the first run of this file.
 */
const BUILT_HARNESS = "http://localhost:5200/index.html";
const DURATION_MS = 1000;

interface FrameProfile {
  readonly frames: number;
  readonly fps: number;
  readonly longestGapMs: number;
  readonly overBudgetFrames: number;
  readonly p95GapMs: number;
  readonly samples: number;
  /** SVG attribute writes on design objects during the gesture. */
  readonly domMutations: number;
  /** True when a Skia canvas is present AND reported a live engine. */
  readonly engineLoaded: boolean;
}

/**
 * Drag continuously for `DURATION_MS`, driving pointer moves from inside the page
 * so the rate is not limited by Playwright's protocol roundtrips.
 */
async function profile(page: Page, url: string): Promise<FrameProfile> {
  await page.goto(url);
  // `state: "attached"`, not the default "visible": when the engine is the visual
  // surface the SVG design objects are deliberately `visibility: hidden`, so waiting
  // for visibility would time out on exactly the configuration under test. They keep
  // their layout, which is all this profile needs from them.
  await page.waitForSelector('g[data-layer-id="target"]', { state: "attached" });
  // Give a flag-gated renderer time to load its module before measuring.
  await page.waitForTimeout(600);

  return page.evaluate(async (duration) => {
    const layer = document.querySelector('g[data-layer-id="target"]');
    const markup = document.querySelector(".svg-canvas-markup");
    if (layer === null || markup === null) {
      throw new Error("harness is missing the target layer");
    }
    const container = markup.closest("div") ?? markup;

    const box = layer.getBoundingClientRect();
    const startX = box.left + box.width / 2;
    const startY = box.top + box.height / 2;

    const send = (type: string, x: number, y: number, target: Element): void => {
      target.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType: "mouse",
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
          buttons: 1,
        }),
      );
    };

    send("pointerdown", startX, startY, layer);

    // Count SVG attribute writes on design objects. In the target architecture this
    // must be ZERO during a gesture: no design object is attached to the DOM for
    // interactive rendering.
    let domMutations = 0;
    const observer = new MutationObserver((records) => {
      domMutations += records.length;
    });
    observer.observe(markup, {
      subtree: true,
      attributes: true,
      attributeFilter: ["transform", "x", "y", "width", "height", "d", "points"],
    });

    const frameTimes: number[] = [];
    let samples = 0;
    const begin = performance.now();

    await new Promise<void>((resolve) => {
      const step = (now: number): void => {
        frameTimes.push(now);
        // Several pointer samples per frame, as a high-rate mouse produces.
        const elapsed = now - begin;
        for (let index = 0; index < 4; index += 1) {
          const travel = (elapsed / duration) * 120 + index * 0.25;
          send("pointermove", startX + travel, startY + travel * 0.4, container);
          samples += 1;
        }
        if (elapsed >= duration) {
          resolve();
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });

    send("pointerup", startX + 120, startY + 48, container);
    observer.disconnect();

    let longestGapMs = 0;
    let overBudgetFrames = 0;
    const gaps: number[] = [];
    for (let index = 1; index < frameTimes.length; index += 1) {
      const gap = frameTimes[index] - frameTimes[index - 1];
      gaps.push(gap);
      longestGapMs = Math.max(longestGapMs, gap);
      if (gap > 16.7) {
        overBudgetFrames += 1;
      }
    }
    gaps.sort((a, b) => a - b);
    const spanMs = frameTimes[frameTimes.length - 1] - frameTimes[0];

    // A Skia canvas that never got its engine renders nothing; the readout the
    // overlay publishes is the only reliable signal that the engine is live.
    const canvas = document.querySelector('[data-role="skia-canvas"], canvas[data-role="skia-overlay"]');
    const readout = document.body.textContent ?? "";
    const engineLoaded = canvas !== null && !readout.includes("skia: unavailable");

    return {
      frames: frameTimes.length,
      fps: Math.round((frameTimes.length / spanMs) * 1000 * 10) / 10,
      longestGapMs: Math.round(longestGapMs * 10) / 10,
      overBudgetFrames,
      p95GapMs: Math.round((gaps[Math.floor(gaps.length * 0.95)] ?? 0) * 10) / 10,
      samples,
      domMutations,
      engineLoaded,
    };
  }, DURATION_MS);
}

test.describe("frames delivered while dragging", () => {
  for (const objects of [1, 200]) {
    test(`SVG renderer, ${objects} object(s)`, async ({ page }) => {
      const result = await profile(page, `${HARNESS}?editor=1&zoom=1&select=target&objects=${objects}`);
      console.log(`[frames svg objects=${objects}] ${JSON.stringify(result)}`);

      // A drag that cannot sustain 30fps is visibly stuttering.
      expect(result.fps, `SVG frame rate with ${objects} objects`).toBeGreaterThan(20);

      // The compatibility renderer still writes one attribute per frame. Asserted so
      // that if it ever stops, we know the SVG path broke rather than improved.
      expect(
        result.domMutations,
        "the SVG renderer should still be previewing through the DOM",
      ).toBeGreaterThan(0);
    });

    test(`Skia renderer, ${objects} object(s)`, async ({ page }) => {
      const result = await profile(
        page,
        `${BUILT_HARNESS}?renderer=skia&zoom=1&select=target&objects=${objects}`,
      );
      console.log(`[frames skia objects=${objects}] ${JSON.stringify(result)}`);

      // The engine MUST have loaded, or this is an SVG measurement wearing a Skia
      // label — which is exactly what the first run of this file produced.
      expect(result.engineLoaded, "the Skia engine did not load; measurement is invalid").toBe(
        true,
      );
      expect(result.fps, `Skia frame rate with ${objects} objects`).toBeGreaterThan(20);

      // THE Phase 2 contract. With the engine as the visual surface, a whole gesture
      // must not touch a single design object in the DOM. This is the number that
      // says the hybrid is gone, and it is asserted rather than merely logged.
      expect(
        result.domMutations,
        `a gesture mutated ${result.domMutations} design-object attributes; the engine path must mutate none`,
      ).toBe(0);

      // And the SVG design layer must not be painted, or there would still be two
      // visual surfaces even with zero mutations.
      const hidden = await page.evaluate(() => {
        const markup = document.querySelector(".svg-canvas-markup");
        return markup === null ? null : getComputedStyle(markup).visibility;
      });
      expect(hidden, "the SVG design objects are still visible").toBe("hidden");
    });
  }
});
