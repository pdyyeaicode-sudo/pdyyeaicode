/**
 * Frames delivered while RESIZING and ROTATING — the guardrail for Phase 4.
 *
 * `dragFrameRate.spec.ts` measures a move, which was migrated first. Resize and rotate
 * were the two gestures still writing an SVG `transform` attribute synchronously on
 * every pointer sample, so they are the ones this file has to hold to the same
 * standard:
 *
 *   - frames delivered over a fixed wall-clock second of continuous gesturing
 *   - the 95th-percentile gap between frames, which is what a stutter shows up in
 *   - SVG attribute writes on design objects, which must be ZERO on the engine path
 *
 * The pointer samples are driven from inside the page rather than through Playwright,
 * so the rate is not limited by protocol roundtrips — a gesture that only receives 20
 * samples a second cannot demonstrate anything about coalescing.
 *
 * Thresholds are loose on purpose: a CI machine's absolute frame rate is not
 * reproducible, and the useful output is the logged comparison plus the mutation
 * count, which IS deterministic.
 *
 * One responsibility per file: measuring frame rate under resize and rotate.
 */

import { expect, test, type Page } from "@playwright/test";

const HARNESS = "/browser-tests/harness/index.html";
/**
 * The BUILT harness. The Skia case must use it: Vite's dev server refuses to serve the
 * engine module through import analysis, so a dev-server run silently measures the SVG
 * renderer while claiming to measure Skia.
 */
const BUILT_HARNESS = "http://localhost:5200/index.html";
const DURATION_MS = 1000;

interface GestureProfile {
  readonly frames: number;
  readonly fps: number;
  readonly p95GapMs: number;
  readonly longestGapMs: number;
  readonly overBudgetFrames: number;
  readonly samples: number;
  /** Attribute writes on design objects during the gesture. */
  readonly domMutations: number;
  /** React commits, counted as attribute writes anywhere in the overlay chrome. */
  readonly chromeMutations: number;
  readonly engineLoaded: boolean;
  /** Where the gesture actually started, so a missed handle is visible. */
  readonly grabbed: boolean;
}

/**
 * Where a piece of chrome is, in client coordinates.
 *
 * Read from the engine on the Skia path, because that is the only authority there —
 * the DOM handles are `pointer-events: none`. Read from the DOM handle on the SVG path,
 * which is that renderer's authority.
 */
async function grabPoint(
  page: Page,
  which: "se" | "rotation",
  engine: boolean,
): Promise<{ x: number; y: number } | null> {
  if (engine) {
    return page.evaluate((key) => {
      const bridge = window.__pydeeGestureBridge;
      if (bridge === null || bridge === undefined) {
        return null;
      }
      const geometry = bridge.chromeGeometry("target", 1);
      if (geometry === null) {
        return null;
      }
      const point = key === "rotation" ? geometry.rotationControl : geometry.handles.se;
      return point === null || point === undefined
        ? null
        : bridge.documentToClient(point.x, point.y);
    }, which);
  }
  const selector = which === "rotation" ? '[data-handle="rotate-nw"]' : '[data-handle="se"]';
  const box = await page.locator(selector).first().boundingBox();
  return box === null ? null : { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function profile(
  page: Page,
  url: string,
  which: "se" | "rotation",
  engine: boolean,
): Promise<GestureProfile> {
  await page.goto(url);
  // `state: "attached"`: on the engine path the SVG design objects are deliberately
  // `visibility: hidden`, so waiting for visibility would time out on exactly the
  // configuration under test.
  await page.waitForSelector('g[data-layer-id="target"]', { state: "attached" });
  if (engine) {
    await page.waitForFunction(
      () => {
        const bridge = window.__pydeeGestureBridge;
        const geometry = bridge?.chromeGeometry("target", 1);
        return geometry !== null && geometry !== undefined && Number.isFinite(geometry.center.x);
      },
      undefined,
      { timeout: 15000 },
    );
  } else {
    await page.waitForSelector("[data-handle]");
  }

  const grab = await grabPoint(page, which, engine);
  if (grab === null) {
    throw new Error(`no "${which}" grab point available`);
  }

  return page.evaluate(
    async ([duration, startX, startY, mode]) => {
      const markup = document.querySelector(".svg-canvas-markup");
      const overlay = document.querySelector('[data-role="selection-overlay"]');
      if (markup === null || overlay === null) {
        throw new Error("harness is missing the canvas or the overlay");
      }

      const send = (type: string, x: number, y: number, target: EventTarget): void => {
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

      // Down on the element that is actually at the grab point, so the real routing
      // runs: a DOM handle on the SVG path, the host's own listener on the engine path.
      const under = document.elementFromPoint(startX as number, startY as number)
        ?? document.body;
      send("pointerdown", startX as number, startY as number, under);

      let domMutations = 0;
      const designObserver = new MutationObserver((records) => {
        domMutations += records.length;
      });
      designObserver.observe(markup, {
        subtree: true,
        attributes: true,
        attributeFilter: ["transform", "x", "y", "width", "height", "d", "points"],
      });

      let chromeMutations = 0;
      const chromeObserver = new MutationObserver((records) => {
        chromeMutations += records.length;
      });
      chromeObserver.observe(overlay, { subtree: true, attributes: true, childList: true });

      const frameTimes: number[] = [];
      let samples = 0;
      const begin = performance.now();

      await new Promise<void>((resolve) => {
        const step = (now: number): void => {
          frameTimes.push(now);
          const elapsed = now - begin;
          // Four samples per frame, as a high-rate mouse produces. A resize travels
          // outward; a rotation swings around the shape.
          for (let index = 0; index < 4; index += 1) {
            const progress = elapsed / (duration as number) + index * 0.002;
            const point = mode === "rotation"
              ? {
                  // Swing about the artboard's rough centre, which the fixture's
                  // `target` layer sits near.
                  x: (startX as number) + Math.sin(progress * Math.PI) * 60,
                  y: (startY as number) - Math.cos(progress * Math.PI) * 60 + 60,
                }
              : {
                  x: (startX as number) + progress * 90,
                  y: (startY as number) + progress * 60,
                };
            send("pointermove", point.x, point.y, window);
            samples += 1;
          }
          if (elapsed >= (duration as number)) {
            resolve();
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });

      send("pointercancel", startX as number, startY as number, window);
      designObserver.disconnect();
      chromeObserver.disconnect();

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

      const canvas = document.querySelector('[data-role="skia-canvas"]');
      const readout = document.body.textContent ?? "";

      return {
        frames: frameTimes.length,
        fps: Math.round((frameTimes.length / spanMs) * 1000 * 10) / 10,
        p95GapMs: Math.round((gaps[Math.floor(gaps.length * 0.95)] ?? 0) * 10) / 10,
        longestGapMs: Math.round(longestGapMs * 10) / 10,
        overBudgetFrames,
        samples,
        domMutations,
        chromeMutations,
        engineLoaded: canvas !== null && !readout.includes("skia: unavailable"),
        // The measurement badge only exists while a gesture is running, so its
        // presence proves the press actually started one rather than missing the
        // handle and measuring an idle page.
        grabbed: overlay.textContent !== "",
      };
    },
    [DURATION_MS, grab.x, grab.y, which] as const,
  );
}

test.describe("frames delivered while resizing and rotating", () => {
  for (const which of ["se", "rotation"] as const) {
    test(`SVG renderer, ${which}`, async ({ page }) => {
      const result = await profile(
        page,
        `${HARNESS}?editor=1&zoom=1&select=target`,
        which,
        false,
      );
      console.log(`[handle-frames svg ${which}] ${JSON.stringify(result)}`);

      expect(result.grabbed, "the gesture never started, so nothing was measured").toBe(true);
      expect(result.fps, `SVG frame rate during ${which}`).toBeGreaterThan(20);
      // The compatibility renderer previews through the DOM, but now at most once per
      // FRAME rather than once per sample. Asserted as a ratio so the claim is about
      // coalescing rather than about an absolute count on this machine.
      expect(
        result.domMutations,
        `${result.domMutations} design mutations for ${result.samples} samples`,
      ).toBeLessThan(result.samples / 2);
    });

    test(`Skia renderer, ${which}`, async ({ page }) => {
      const result = await profile(
        page,
        `${BUILT_HARNESS}?renderer=skia&zoom=1&select=target`,
        which,
        true,
      );
      console.log(`[handle-frames skia ${which}] ${JSON.stringify(result)}`);

      expect(result.engineLoaded, "the Skia engine did not load; measurement is invalid").toBe(
        true,
      );
      expect(result.grabbed, "the gesture never started, so nothing was measured").toBe(true);
      expect(result.fps, `Skia frame rate during ${which}`).toBeGreaterThan(20);

      // THE Phase 4 contract, and the reason the gesture moved into the engine: a
      // whole resize or rotate must not touch one design-object attribute.
      expect(
        result.domMutations,
        `a ${which} gesture mutated ${result.domMutations} design-object attributes; `
          + "the engine path must mutate none",
      ).toBe(0);
    });
  }
});

declare global {
  interface Window {
    __pydeeGestureBridge?: {
      chromeGeometry(
        layerId: string,
        zoom: number,
      ): {
        center: { x: number; y: number };
        handles: Record<string, { x: number; y: number }>;
        rotationControl: { x: number; y: number } | null;
      } | null;
      documentToClient(x: number, y: number): { x: number; y: number } | null;
    } | null;
  }
}
