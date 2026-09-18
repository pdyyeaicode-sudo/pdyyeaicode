/**
 * The engine at REAL document sizes, with real content.
 *
 * Every earlier measurement used a 400x400 artboard holding four small rects. The editor's
 * actual default document is 1080x1080 — 7.3 times the area — and Phase 6 established that
 * the engine's dominant per-frame cost is reading the surface back through JavaScript, which
 * is proportional to pixel COUNT. A benchmark on the small fixture therefore understates the
 * real cost by that factor, and no amount of frame-rate averaging on it would reveal the
 * problem.
 *
 * So this file measures the SCALING LAW rather than a single number:
 *
 *   for each artboard size: render cost, readback cost, upload cost, delivered frame rate
 *
 * and reports readback cost per megapixel, which is the figure that predicts every other
 * size. `?content=heavy` adds a full-bleed gradient, a radial-gradient blob, text at three
 * sizes and a group of twelve bezier paths, so gradient resolution, skparagraph shaping,
 * layer isolation and the path parser are all exercised — the four-rect fixture exercises
 * none of them.
 *
 * ## What is asserted, and what is only reported
 *
 * Asserted: the engine loads, the gesture actually runs, the scene contains the content it
 * claims to, and the frame rate stays above a floor at which a drag is still usable.
 *
 * Reported: the per-stage costs and the derived cost per megapixel. Absolute timings on a CI
 * machine are not reproducible, so turning them into thresholds would produce a flaky test
 * that says nothing. The scaling law is the durable result.
 *
 * ## Why this file is serial, and why its assertions are ratios
 *
 * Playwright runs specs in parallel by default. Five benchmarks competing for the same CPU
 * inflated every timing by about five times and produced nonsense — a 400x400 artboard
 * reported as SLOWER than a 1080x1080 one. So the whole file is one serial describe.
 *
 * Even serialised, other spec files still run alongside it in a full-suite run, so the
 * assertions are deliberately RATIOS measured within a single page: a full repaint's cost
 * against a gesture frame's, and repainted pixels against artboard pixels. Contention scales
 * both sides of a ratio equally, so those hold regardless of machine load, while absolute
 * milliseconds do not. The absolute numbers are logged, and the ones quoted in
 * engine/CONTEXT.md come from a dedicated `--workers=1` run.
 *
 * One responsibility per file: engine cost as a function of document size and content.
 */

import { expect, test, type Page } from "@playwright/test";

/** The BUILT harness. Vite's dev server will not serve the engine module. */
const HARNESS = "http://localhost:5200/index.html";

/**
 * 400 is the historical fixture, 1080 the editor's real default, 1350 an Instagram
 * portrait. Deliberately not larger: a print artboard at 300dpi would take minutes per
 * frame on this path, and the point is to find where the budget breaks, not to watch it
 * break by two orders of magnitude.
 */
const SIZES = [400, 800, 1080, 1350] as const;

const FRAME_BUDGET_MS = 16.7;

/**
 * How long the gesture runs.
 *
 * Long enough that a large artboard still produces a useful number of frames: at 1350x1350
 * a full repaint takes hundreds of milliseconds, so a one-second window could collect only
 * three samples and the median would then be dominated by the startup frame rather than by
 * the steady state.
 */
const GESTURE_WINDOW_MS = 2000;

interface SizeProfile {
  readonly size: number;
  readonly megapixels: number;
  readonly fps: number;
  readonly p95GapMs: number;
  readonly overBudgetFrames: number;
  readonly frames: number;
  /** The FIRST frame after the scene uploads, which is always a full repaint. */
  readonly fullRenderMs: number;
  readonly fullReadMs: number;
  readonly fullReadMsPerMegapixel: number;
  /** Engine medians over the gesture, where damage tracking applies. */
  readonly renderMs: number;
  readonly wasmReadMs: number;
  readonly uploadMs: number;
  readonly presentMs: number;
  /** Median repainted pixels as a fraction of the artboard. The point of the whole change. */
  readonly damageFraction: number;
  /** Nodes drawn on the FULL frame, so scene population is checkable. */
  readonly fullNodesDrawn: number;
  /** Nodes drawn per gesture frame; small because the rest are culled by the damage rect. */
  readonly nodesDrawn: number;
  /** Gesture frames the engine actually reported, so a thin median is visible as one. */
  readonly gestureFrames: number;
  readonly engineLoaded: boolean;
  readonly gestureRan: boolean;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function profileSize(page: Page, size: number, objects: number): Promise<SizeProfile> {
  /*
    Fit-to-viewport zoom, as the editor itself does.

    Pinning zoom to 1 for an artboard larger than the 1200x900 harness host puts the
    fixture's `target` layer at a NEGATIVE screen y — off the top of the window — and the
    press then lands on the gradient background instead. Measured at 1350x1350: the target
    did not move at all, and the "gesture" was dragging a full-bleed rect whose damage rect
    is the whole artboard, which reported as 6.4fps and 91% damage.

    That was the benchmark being unrealistic, not the engine being slow: `useViewport`
    computes a fit zoom for exactly this reason, so a document larger than the window is
    never viewed at 1:1. The engine still renders at the artboard's native pixel size, so
    the cost model is unchanged — only the interaction geometry becomes realistic.
  */
  const zoom = Math.min(1, Math.round((900 / size) * 1000) / 1000);
  await page.goto(
    `${HARNESS}?renderer=skia&zoom=${zoom}&select=target&artboard=${size}&content=heavy&objects=${objects}`,
  );
  await page.waitForSelector('g[data-layer-id="target"]', { state: "attached" });
  await page.waitForFunction(
    (currentZoom) => {
      const bridge = window.__pydeeGestureBridge;
      const geometry = bridge?.chromeGeometry("target", currentZoom);
      return geometry !== null && geometry !== undefined && Number.isFinite(geometry.center.x);
    },
    zoom,
    { timeout: 30000 },
  );

  const raw = await page.evaluate(async ([budget, windowMs, currentZoom]) => {
    const layer = document.querySelector('g[data-layer-id="target"]');
    const markup = document.querySelector(".svg-canvas-markup");
    const canvas = document.querySelector<HTMLCanvasElement>('[data-role="skia-canvas"]');
    const bridge = window.__pydeeGestureBridge;
    if (layer === null || markup === null || canvas === null || bridge === null
      || bridge === undefined) {
      throw new Error("harness is not ready");
    }
    const container = markup.closest("div") ?? markup;

    /*
      The press position comes from the ENGINE, not from the SVG element's rect.

      Those two disagree when the artboard is larger than the host: the SVG canvas wrapper
      is fitted to the container by CSS while the Skia stage renders at native size and
      overflows, so at 1350x1350 the SVG reported the layer 0.888x smaller and in a
      different place. On the engine path the engine's own geometry is the authority — it is
      what drew the pixels.
    */
    const geometry = bridge.chromeGeometry("target", currentZoom as number);
    if (geometry === null) {
      throw new Error("no geometry for the target layer");
    }
    const start = bridge.documentToClient(geometry.center.x, geometry.center.y);
    if (start === null) {
      throw new Error("could not convert the target's centre to client coordinates");
    }
    const startX = start.x;
    const startY = start.y;
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

    // The report from the FULL repaint that follows the scene upload, kept separately: it
    // is the cost damage tracking exists to avoid, and it is also the only frame on which
    // scene population can be checked (a damaged frame deliberately draws almost nothing).
    const fullFrames = [...window.__pydeeFrameReports];
    // Discard everything from loading and the first paint: those are one-off costs and
    // averaging them into a gesture would flatter or penalise it arbitrarily.
    window.__pydeeFrameReports.length = 0;

    send("pointerdown", startX, startY, layer);
    send("pointermove", startX + 8, startY, container);

    const frameTimes: number[] = [];
    const begin = performance.now();
    await new Promise<void>((resolve) => {
      const step = (now: number): void => {
        frameTimes.push(now);
        const elapsed = now - begin;
        // Four samples per frame, as a high-rate pointer produces.
        for (let index = 0; index < 4; index += 1) {
          const travel = 8 + (elapsed / 1000) * 120 + index * 0.25;
          send("pointermove", startX + travel, startY + travel * 0.35, container);
        }
        if (elapsed >= (windowMs as number)) {
          resolve();
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    send("pointerup", startX + 130, startY + 45, container);

    const gaps: number[] = [];
    let overBudgetFrames = 0;
    for (let index = 1; index < frameTimes.length; index += 1) {
      const gap = frameTimes[index] - frameTimes[index - 1];
      gaps.push(gap);
      if (gap > (budget as number)) {
        overBudgetFrames += 1;
      }
    }
    gaps.sort((a, b) => a - b);
    const spanMs = frameTimes[frameTimes.length - 1] - frameTimes[0];
    const reports = window.__pydeeFrameReports;
    // The costliest full frame recorded before the gesture: that is the whole-surface
    // repaint, which is what the damaged path replaces.
    const worstFull = fullFrames.reduce<(typeof fullFrames)[number] | null>(
      (worst, report) =>
        worst === null || report.wasmReadMs > worst.wasmReadMs ? report : worst,
      null,
    );

    return {
      frames: frameTimes.length,
      fps: spanMs <= 0 ? 0 : Math.round((frameTimes.length / spanMs) * 1000 * 10) / 10,
      p95GapMs: Math.round((gaps[Math.floor(gaps.length * 0.95)] ?? 0) * 10) / 10,
      overBudgetFrames,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      fullRenderMs: worstFull?.frameDurationMs ?? 0,
      fullReadMs: worstFull?.wasmReadMs ?? 0,
      fullNodesDrawn: worstFull?.nodesDrawn ?? 0,
      renders: reports.map((report) => report.frameDurationMs),
      wasmReads: reports.map((report) => report.wasmReadMs),
      uploads: reports.map((report) => report.uploadMs),
      presents: reports.map((report) => report.presentLatencyMs),
      damaged: reports.map((report) => report.damagedPixels),
      nodes: reports.map((report) => report.nodesDrawn),
      engineLoaded: !(document.body.textContent ?? "").includes("skia: unavailable"),
      // The badge exists only while a gesture runs, so its presence proves the press
      // started one rather than missing and measuring an idle page.
      gestureRan: reports.length > 0,
    };
  }, [FRAME_BUDGET_MS, GESTURE_WINDOW_MS, zoom] as const);

  const megapixels = (raw.canvasWidth * raw.canvasHeight) / 1e6;
  const wasmReadMs = median(raw.wasmReads);
  const round = (value: number): number => Math.round(value * 100) / 100;

  return {
    size,
    megapixels: round(megapixels),
    fps: raw.fps,
    p95GapMs: raw.p95GapMs,
    overBudgetFrames: raw.overBudgetFrames,
    frames: raw.frames,
    fullRenderMs: round(raw.fullRenderMs),
    fullReadMs: round(raw.fullReadMs),
    fullReadMsPerMegapixel: megapixels === 0 ? 0 : round(raw.fullReadMs / megapixels),
    renderMs: round(median(raw.renders)),
    wasmReadMs: round(wasmReadMs),
    uploadMs: round(median(raw.uploads)),
    presentMs: round(median(raw.presents)),
    damageFraction:
      megapixels === 0 ? 1 : round(median(raw.damaged) / (raw.canvasWidth * raw.canvasHeight)),
    fullNodesDrawn: raw.fullNodesDrawn,
    nodesDrawn: median(raw.nodes),
    gestureFrames: raw.renders.length,
    engineLoaded: raw.engineLoaded,
    gestureRan: raw.gestureRan,
  };
}

/**
 * Serial, and all in one describe.
 *
 * Parallel workers on one machine made a 400x400 artboard measure slower than a 1080x1080
 * one. A benchmark that competes with other benchmarks is measuring the scheduler.
 */
test.describe.configure({ mode: "serial" });

test.describe("engine cost as the document grows", () => {
  for (const size of SIZES) {
    test(`${size}x${size} with realistic content`, async ({ page }) => {
      // A benchmark legitimately takes longer than an assertion: a 2-second gesture plus a
      // scene upload that, at 1350x1350, includes several hundred-millisecond full repaints.
      // The default 30s budget covered the old one-second window and no longer does.
      test.setTimeout(180_000);
      const result = await profileSize(page, size, 60);
      console.log(`[realistic ${size}] ${JSON.stringify(result)}`);

      expect(result.engineLoaded, "the Skia engine did not load; measurement is invalid").toBe(
        true,
      );
      expect(
        result.gestureFrames,
        `only ${result.gestureFrames} gesture frames were recorded, which is too few for a `
          + "median to mean anything",
      ).toBeGreaterThan(6);
      // Checked on the FULL frame. A damaged frame deliberately draws almost nothing — that
      // is the feature — so asserting a high node count per gesture frame would now be
      // asserting that damage tracking is broken.
      expect(
        result.fullNodesDrawn,
        `the full repaint drew only ${result.fullNodesDrawn} nodes, so the scene is not the `
          + "heavy one this benchmark claims to measure",
      ).toBeGreaterThan(60);

      // THE fix, stated as a measurement, and contention-proof because it counts PIXELS.
      // Without damage tracking this is 1.0 by definition.
      expect(
        result.damageFraction,
        `a gesture frame repainted ${(result.damageFraction * 100).toFixed(1)}% of the `
          + "artboard; the whole point is for this to be small",
      ).toBeLessThan(0.35);

      // A ratio within one page, so machine load cancels: a gesture frame's readback must be
      // dramatically cheaper than the full repaint's on the SAME run.
      const saving = result.fullReadMs / Math.max(0.01, result.wasmReadMs);
      expect(
        saving,
        `a gesture frame read ${result.wasmReadMs}ms against ${result.fullReadMs}ms for a full `
          + `repaint (${saving.toFixed(0)}x); a ratio near 1 means damage tracking is not engaging`,
      ).toBeGreaterThan(4);

      // An absolute floor purely to catch a collapse. Deliberately far below the real
      // numbers, which are logged: an fps threshold tight enough to be interesting would
      // flake whenever another spec file runs alongside this one.
      expect(result.fps, `${size}x${size} delivered ${result.fps}fps`).toBeGreaterThan(12);
    });
  }
});

test("damage tracking is what removes the dependence on document size", async ({ page }) => {
  // Two full profiles in one test, so the comparison is unaffected by anything between them.
  test.setTimeout(240_000);
  /*
    THE decision-driving comparison, and the record of why the change was made.

    Before damage tracking, both rendering and readback were proportional to artboard AREA:
    measured at 34ms per megapixel to read and 44ms to render, so the editor's default
    1080x1080 document cost ~92ms per drag frame — 11fps — to move one small object. Both
    scaled, so no amount of tuning either one would have helped.

    Two things are asserted here:

      1. A FULL repaint still scales with area. That is the cost that was there all along,
         and it has to still be visible or this test is not measuring the right thing.
      2. A GESTURE frame does NOT, because it repaints the damage instead. This is the
         property that makes the architecture viable at real document sizes.
  */
  const small = await profileSize(page, 400, 60);
  const large = await profileSize(page, 1080, 60);
  console.log(`[damage scaling] small=${JSON.stringify(small)} large=${JSON.stringify(large)}`);
  expect(small.engineLoaded && large.engineLoaded).toBe(true);

  // 1. A FULL repaint's cost grows with the document. Compared as ABSOLUTE cost between the
  //    two runs rather than per-megapixel, because the two runs are separate pages and only
  //    the direction of the change is robust to machine load.
  expect(small.fullReadMs, "no full-repaint readback was measured").toBeGreaterThan(0);
  expect(
    large.fullReadMs,
    `a full repaint read ${small.fullReadMs}ms at 400x400 and ${large.fullReadMs}ms at `
      + "1080x1080; the larger artboard has 7.3x the pixels, so it must cost more",
  ).toBeGreaterThan(small.fullReadMs);

  // 2. A gesture frame's readback is nearly independent of the document size, because it
  //    tracks the damage rather than the artboard. Without damage tracking this ratio would
  //    be about 7.3 — the area ratio.
  const gestureRatio = large.wasmReadMs / Math.max(0.01, small.wasmReadMs);
  expect(
    gestureRatio,
    `a GESTURE frame read ${small.wasmReadMs}ms at 400x400 and ${large.wasmReadMs}ms at `
      + `1080x1080 (ratio ${gestureRatio.toFixed(2)}); the artboard is 7.3x larger, so a `
      + "ratio near 7 would mean damage tracking is not engaging",
  ).toBeLessThan(3);

  // 3. And the repainted area shrinks as a FRACTION as the document grows, because the
  //    object being dragged does not grow with it. This is a pixel count, so it is exact.
  expect(
    large.damageFraction,
    `a gesture repainted ${(large.damageFraction * 100).toFixed(1)}% of the 1080x1080 artboard `
      + `against ${(small.damageFraction * 100).toFixed(1)}% of the 400x400 one`,
  ).toBeLessThanOrEqual(small.damageFraction);

  console.log(
    `[damage verdict] at 1080x1080: full repaint reads ${large.fullReadMs}ms, a gesture frame `
      + `reads ${large.wasmReadMs}ms and repaints `
      + `${(large.damageFraction * 100).toFixed(1)}% of the artboard, delivering ${large.fps}fps`,
  );
});
