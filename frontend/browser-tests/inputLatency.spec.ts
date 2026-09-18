/**
 * Input-to-render latency: how long after a pointer sample the object is visibly there.
 *
 * ## What is measured, and what is not
 *
 * Per trial: `t0` is taken immediately before dispatching one `pointermove`, then every
 * animation frame the VISIBLE representation is read until it reflects that sample's
 * position; `t1` is that frame. The latency is `t1 - t0`.
 *
 * Read from pixels on the engine path (the right edge of the shape's colour along one
 * scanline) and from layout on the SVG path (the element's own rect). Both answer the
 * same question — "when did the thing the user looks at move" — through whatever each
 * renderer actually uses.
 *
 * Two honest limitations, stated rather than hidden:
 *
 *  1. An animation-frame callback runs BEFORE the browser composites, so this is time
 *     until our code produced the new visible state, not time until photons. The
 *     compositor's presentation step is not observable from a page.
 *  2. The measurement floor is therefore about one frame period. Latency IS quantised
 *     by the display, so the interesting question is not "is the median under 16ms" —
 *     it cannot be — but "does the TAIL stay inside one or two frames".
 *
 * The engine's own decomposition (`__pydeeFrameReports`) covers what happens inside a
 * frame, where nothing is quantised: sample -> render returned -> pixels handed to the
 * canvas. That is where headroom is visible.
 *
 * The dispatch is deliberately jittered against the frame clock. Firing every sample
 * immediately after a frame boundary would measure the best case only, and real input
 * arrives at an arbitrary phase.
 *
 * One responsibility per file: measuring pointer-to-visible latency.
 */

import { expect, test, type Page } from "@playwright/test";

const HARNESS = "/browser-tests/harness/index.html";
/** The BUILT harness. Vite's dev server will not serve the engine module. */
const BUILT_HARNESS = "http://localhost:5200/index.html";

const TRIALS = 30;

interface LatencySummary {
  readonly trials: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly minMs: number;
  /** Trials where the visible state never caught up within the timeout. */
  readonly missed: number;
  readonly engineLoaded: boolean;
  /** Engine-internal decomposition, present only on the Skia path. */
  readonly engine: {
    readonly frames: number;
    readonly medianInputMs: number;
    readonly p95InputMs: number;
    readonly medianPresentMs: number;
    readonly p95PresentMs: number;
    readonly maxPresentMs: number;
    readonly medianRenderMs: number;
    readonly medianReadbackMs: number;
    readonly medianWasmReadMs: number;
    readonly medianUploadMs: number;
    readonly medianCoalesced: number;
  } | null;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index];
}

async function measure(
  page: Page,
  url: string,
  renderer: "svg" | "skia",
): Promise<LatencySummary> {
  await page.goto(url);
  await page.waitForSelector('g[data-layer-id="target"]', { state: "attached" });
  if (renderer === "skia") {
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
    await page.waitForTimeout(400);
  }

  return page.evaluate(
    async ([trials, mode]) => {
      const layer = document.querySelector('g[data-layer-id="target"]');
      const markup = document.querySelector(".svg-canvas-markup");
      const canvas = document.querySelector<HTMLCanvasElement>('[data-role="skia-canvas"]');
      if (layer === null || markup === null) {
        throw new Error("harness is missing the target layer");
      }
      const container = markup.closest("div") ?? markup;
      const context = canvas === null ? null : canvas.getContext("2d");

      const startBox = layer.getBoundingClientRect();
      const startX = startBox.left + startBox.width / 2;
      const startY = startBox.top + startBox.height / 2;

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

      const nextFrame = (): Promise<number> =>
        new Promise((resolve) => requestAnimationFrame((now) => resolve(now)));

      /**
       * The right-hand edge of the shape, in DOCUMENT pixels.
       *
       * On the engine path this is read from the pixels the engine painted, which is
       * the only representation there is. On the SVG path it is the element's own rect,
       * converted through the canvas-free equivalent: at zoom 1 a screen pixel is a
       * document pixel, and the fixture runs at zoom 1.
       *
       * The context is requested with NO attributes on purpose. `getContext("2d", …)`
       * returns null when a context already exists and the attributes differ, and the
       * renderer created this one with the defaults — so asking for
       * `willReadFrequently` here silently disabled the whole probe and every trial
       * reported a miss.
       */
      /**
       * Whether the visible representation reflects a translation of `delta`.
       *
       * On the engine path this reads the pixels the engine painted — the only
       * representation there is — at a COLUMN three pixels inside the shape's new right
       * edge. A column and not a row, and three sample rows 20px apart with two
       * required to match, because a padding ellipse is 18x12: it can cover at most one
       * of those rows and cannot fake the result. A single row was not enough — with 200
       * padding objects, ellipses drawn over the shape split its 80px run into segments
       * and half the trials reported a miss.
       *
       * The probe point is chosen to be OUTSIDE the shape at the previous sample's
       * position, so a frame that has not caught up cannot satisfy it.
       *
       * The context is requested with NO attributes on purpose. `getContext("2d", …)`
       * returns null when a context already exists and the attributes differ, and the
       * renderer created this one with the defaults — so asking for
       * `willReadFrequently` here silently disabled the whole probe and every trial
       * reported a miss.
       */
      const reflectsDelta = (delta: number): boolean => {
        if (mode === "skia") {
          if (context === null || canvas === null) {
            return false;
          }
          const probeX = Math.round(180 + delta - 3);
          if (probeX < 0 || probeX >= canvas.width) {
            return false;
          }
          const column = context.getImageData(probeX, 100, 1, 61).data;
          let hits = 0;
          for (const row of [5, 25, 45]) {
            const offset = row * 4;
            // The fixture's `target` rect is #e11d48: strongly red, weakly green.
            if (
              column[offset] > 180
              && column[offset + 1] < 90
              && column[offset + 3] > 200
            ) {
              hits += 1;
            }
          }
          return hits >= 2;
        }
        const box = layer.getBoundingClientRect();
        return box.left - startBox.left >= delta - 1;
      };

      send("pointerdown", startX, startY, layer);
      // One settling frame so the gesture is established before the first trial.
      await nextFrame();

      const latencies: number[] = [];
      let missed = 0;

      for (let trial = 0; trial < (trials as number); trial += 1) {
        /*
          6px per trial, so the probe point three pixels inside the NEW right edge is
          three pixels clear of the OLD one. A smaller step puts the probe inside Skia's
          antialiased boundary at the previous position and a frame that has not caught
          up would satisfy it; a larger step runs the shape off the 400px artboard within
          the trial count.
        */
        const delta = 6 + trial * 6;
        const probeX = Math.round(180 + delta - 3);
        /*
          Skip the range where the fixture's `spun` layer paints OVER the probe.

          `spun` is a green rect occupying x 280..320 and rows 90..150, and it is drawn
          after `target`, so while the probe column is inside it the shape is genuinely
          hidden there. Six of thirty trials fell in that band — a deterministic fixture
          overlap, not a latency result, and counting it as a miss would make a
          measurement look unreliable for a reason that has nothing to do with what is
          being measured.
        */
        if (mode === "skia" && probeX > 276 && probeX < 324) {
          continue;
        }

        // Jitter the phase against the frame clock: dispatching right after a frame
        // boundary every time would measure only the best case.
        await new Promise((resolve) => setTimeout(resolve, (trial % 5) * 3));

        const dispatchedMs = performance.now();
        send("pointermove", startX + delta, startY, container);

        let caughtUp = false;
        for (let frame = 0; frame < 12; frame += 1) {
          await nextFrame();
          if (reflectsDelta(delta)) {
            latencies.push(performance.now() - dispatchedMs);
            caughtUp = true;
            break;
          }
        }
        if (!caughtUp) {
          missed += 1;
        }
      }

      send("pointerup", startX + 6 + (trials as number) * 6, startY, container);

      const sorted = [...latencies].sort((a, b) => a - b);
      const round = (value: number): number => Math.round(value * 10) / 10;
      const at = (fraction: number): number =>
        sorted.length === 0
          ? 0
          : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];

      const reports = window.__pydeeFrameReports ?? [];
      const column = (pick: (report: (typeof reports)[number]) => number): number[] =>
        reports.map(pick).sort((a, b) => a - b);
      const inputs = column((report) => report.inputLatencyMs);
      const presents = column((report) => report.presentLatencyMs);
      const renders = column((report) => report.frameDurationMs);
      const readbacks = column((report) => report.readbackMs);
      const wasmReads = column((report) => report.wasmReadMs);
      const uploads = column((report) => report.uploadMs);
      const coalesced = column((report) => report.coalescedSamples);
      const pick = (values: number[], fraction: number): number =>
        values.length === 0
          ? 0
          : values[Math.min(values.length - 1, Math.floor(values.length * fraction))];

      return {
        trials: latencies.length,
        medianMs: round(at(0.5)),
        p95Ms: round(at(0.95)),
        maxMs: round(sorted[sorted.length - 1] ?? 0),
        minMs: round(sorted[0] ?? 0),
        missed,
        engineLoaded: canvas !== null && !(document.body.textContent ?? "").includes("skia: unavailable"),
        engine: reports.length === 0
          ? null
          : {
              frames: reports.length,
              medianInputMs: round(pick(inputs, 0.5)),
              p95InputMs: round(pick(inputs, 0.95)),
              medianPresentMs: round(pick(presents, 0.5)),
              p95PresentMs: round(pick(presents, 0.95)),
              maxPresentMs: round(presents[presents.length - 1] ?? 0),
              medianRenderMs: round(pick(renders, 0.5)),
              medianReadbackMs: round(pick(readbacks, 0.5)),
              medianWasmReadMs: round(pick(wasmReads, 0.5)),
              medianUploadMs: round(pick(uploads, 0.5)),
              medianCoalesced: pick(coalesced, 0.5),
            },
      };
    },
    [TRIALS, renderer] as const,
  );
}

test.describe("pointer-to-visible latency", () => {
  for (const objects of [1, 200]) {
    test(`SVG renderer, ${objects} object(s)`, async ({ page }) => {
      const result = await measure(
        page,
        `${HARNESS}?editor=1&zoom=1&select=target&objects=${objects}`,
        "svg",
      );
      console.log(`[latency svg objects=${objects}] ${JSON.stringify(result)}`);

      expect(result.trials, "no trial produced a measurement").toBeGreaterThan(TRIALS / 2);
      // Two frames at 60Hz. Beyond that a drag reads as lagging behind the cursor.
      expect(result.p95Ms, `SVG p95 latency with ${objects} objects`).toBeLessThan(34);
    });

    test(`Skia renderer, ${objects} object(s)`, async ({ page }) => {
      const result = await measure(
        page,
        `${BUILT_HARNESS}?renderer=skia&zoom=1&select=target&objects=${objects}`,
        "skia",
      );
      console.log(`[latency skia objects=${objects}] ${JSON.stringify(result)}`);

      expect(result.engineLoaded, "the Skia engine did not load; measurement is invalid").toBe(
        true,
      );
      expect(result.trials, "no trial produced a measurement").toBeGreaterThan(TRIALS / 2);
      expect(result.missed, `${result.missed} trials never caught up`).toBe(0);
      expect(result.p95Ms, `Skia p95 latency with ${objects} objects`).toBeLessThan(34);

      // The engine's own decomposition must exist, or the numbers above are being
      // attributed to a renderer that reported nothing.
      expect(result.engine, "the engine reported no frames").not.toBeNull();
      if (result.engine === null) {
        return;
      }
      /*
        The BUDGET, split where the measurement says the time actually goes.

        `render` is the engine drawing the scene. `readback` is `readPixels` ->
        `Uint8ClampedArray` -> `ImageData` -> `putImageData`, which is pure copying and
        was measured at THREE TIMES the cost of rendering before the buffer was reused
        (7.8ms vs 2.5ms median on a 400x400 artboard). It is asserted separately so a
        regression in either cannot hide behind the other, and so the copy path stays
        visible as the dominant term it is — at 1080x1080 it moves 4.6MB per frame.
      */
      expect(
        result.engine.medianRenderMs,
        `engine render median was ${result.engine.medianRenderMs}ms`,
      ).toBeLessThan(8);
      expect(
        result.engine.medianReadbackMs,
        `pixel readback median was ${result.engine.medianReadbackMs}ms `
          + `(${result.engine.medianWasmReadMs}ms in WASM, ${result.engine.medianUploadMs}ms `
          + "uploading), which is the cost of copying the surface through JavaScript",
      ).toBeLessThan(12);
    });
  }
});

declare global {
  interface Window {
    __pydeeFrameReports: Array<{
      inputLatencyMs: number;
      presentLatencyMs: number;
      frameDurationMs: number;
      readbackMs: number;
      damagedPixels: number;
      coalescedSamples: number;
      patchCalls: number;
      nodesDrawn: number;
    }>;
    __pydeeGestureBridge?: {
      chromeGeometry(layerId: string, zoom: number): { center: { x: number; y: number } } | null;
    } | null;
  }
}
