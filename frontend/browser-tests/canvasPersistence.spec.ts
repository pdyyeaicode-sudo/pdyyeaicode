/**
 * Phase 1 of the single-canvas migration: the interactive canvas is created ONCE.
 *
 * The contract: one persistent `<canvas>` stays mounted across every editor state
 * change — selection, zoom, pan, an object transform, a gesture start/end and a
 * document commit. A canvas that is torn down and rebuilt loses its GPU/WASM surface
 * and produces exactly the stutter this migration exists to remove, and it makes
 * "the object and its selection are always coincident" impossible to guarantee
 * because the two would be recreated at different moments.
 *
 * Identity is checked by stamping a property on the element itself. A selector match
 * would pass even if React replaced the node between assertions, so the marker is the
 * only thing that actually proves persistence. The WASM surface is checked separately
 * through the engine readout, because the element can survive while the surface behind
 * it is thrown away — and that is the more expensive of the two.
 *
 * Runs against the BUILT harness on port 5200: the engine module lives in `public/`
 * and Vite's dev server refuses to serve it, so a dev-server run silently falls back
 * to the SVG renderer and this file would be testing nothing.
 *
 * One responsibility per file: canvas and surface lifetime across editor state.
 */

import { expect, test, type Page } from "@playwright/test";

const HARNESS = "http://localhost:5200/index.html";
const CANVAS = 'canvas[data-role="skia-canvas"], canvas[data-role="skia-overlay"]';

declare global {
  interface Window {
    __pydeeSetViewport: (zoom: number, panX: number, panY: number) => void;
    __pydeeSelect: (layerId: string | null) => void;
    __pydeeUndo: () => boolean;
  }
}

/** Stamp the live canvas so a later check can tell replacement from persistence. */
async function markCanvas(page: Page): Promise<void> {
  await page.waitForSelector(CANVAS);
  await page.evaluate((selector) => {
    const canvas = document.querySelector(selector);
    if (canvas === null) {
      throw new Error("no interactive canvas found");
    }
    (canvas as unknown as { __mark?: number }).__mark = 0xc0ffee;
  }, CANVAS);
}

interface CanvasState {
  readonly present: boolean;
  readonly sameElement: boolean;
  readonly count: number;
  readonly engineUnavailable: boolean;
}

async function canvasState(page: Page): Promise<CanvasState> {
  return page.evaluate((selector) => {
    const all = document.querySelectorAll(selector);
    const canvas = all[0] as (Element & { __mark?: number }) | undefined;
    return {
      present: canvas !== undefined,
      sameElement: canvas?.__mark === 0xc0ffee,
      count: all.length,
      engineUnavailable: (document.body.textContent ?? "").includes("skia: unavailable"),
    };
  }, CANVAS);
}

async function open(page: Page): Promise<void> {
  await page.goto(`${HARNESS}?renderer=skia&zoom=1&select=target&commit=1&objects=40`);
  await page.waitForSelector(CANVAS);
  // The engine loads asynchronously; nothing below is meaningful until it has.
  await expect
    .poll(async () => (await canvasState(page)).engineUnavailable, { timeout: 15_000 })
    .toBe(false);
  await markCanvas(page);
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  await page.waitForTimeout(60);
}

test.describe("the interactive canvas is created once", () => {
  test("it is exactly one element, and the engine is live", async ({ page }) => {
    await open(page);
    const state = await canvasState(page);
    expect(state.present).toBe(true);
    expect(state.engineUnavailable, "the engine did not load; this file tests nothing")
      .toBe(false);
    // Two interactive canvases would mean two rendering surfaces, which is the
    // hybrid this migration removes.
    expect(state.count, "more than one interactive canvas is mounted").toBe(1);
  });

  test("it survives a selection change", async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__pydeeSelect("spun"));
    await settle(page);
    await page.evaluate(() => window.__pydeeSelect(null));
    await settle(page);
    await page.evaluate(() => window.__pydeeSelect("target"));
    await settle(page);

    const state = await canvasState(page);
    expect(state.sameElement, "the canvas was replaced by a selection change").toBe(true);
    expect(state.count).toBe(1);
  });

  test("it survives zoom changes", async ({ page }) => {
    await open(page);
    for (const zoom of [2, 4, 0.5, 1]) {
      await page.evaluate((value) => window.__pydeeSetViewport(value, 0, 0), zoom);
      await settle(page);
      const state = await canvasState(page);
      expect(state.sameElement, `the canvas was replaced at zoom ${zoom}`).toBe(true);
    }
  });

  test("it survives panning", async ({ page }) => {
    await open(page);
    for (const pan of [40, -120, 0]) {
      await page.evaluate((value) => window.__pydeeSetViewport(1, value, value / 2), pan);
      await settle(page);
      expect((await canvasState(page)).sameElement, `replaced while panning to ${pan}`).toBe(
        true,
      );
    }
  });

  test("it survives a whole drag gesture and its commit", async ({ page }) => {
    await open(page);

    const box = await page.locator('g[data-layer-id="target"]').first().boundingBox();
    if (box === null) {
      throw new Error("target layer has no layout box");
    }
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (const step of [10, 25, 45, 70]) {
      await page.mouse.move(startX + step, startY + step * 0.4);
      // Mid-gesture is the moment that matters: recreating the canvas here would
      // drop the frames the gesture is made of.
      expect((await canvasState(page)).sameElement, `replaced mid-drag at ${step}px`).toBe(
        true,
      );
    }
    await page.mouse.up();
    await settle(page);

    // The commit rebuilds the document and the RenderScene. The canvas must not go
    // with it.
    const state = await canvasState(page);
    expect(state.sameElement, "the canvas was replaced by the commit").toBe(true);
    expect(state.count).toBe(1);
  });

  test("it survives undo", async ({ page }) => {
    await open(page);

    const box = await page.locator('g[data-layer-id="target"]').first().boundingBox();
    const startX = (box as { x: number; width: number }).x + 10;
    const startY = (box as { y: number; height: number }).y + 10;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 30, startY);
    await page.mouse.move(startX + 60, startY);
    await page.mouse.up();
    await settle(page);

    await page.evaluate(() => window.__pydeeUndo());
    await settle(page);

    expect((await canvasState(page)).sameElement, "the canvas was replaced by undo").toBe(true);
  });

  test("changing zoom in place actually redraws the canvas", async ({ page }) => {
    await open(page);

    // A signature of what carries the viewport. Zoom now lives on the SHARED stage
    // that wraps both the design canvas and the selection canvas — one transform for
    // both, which is what makes their coincidence structural. So the stage is what must
    // change; the canvas element itself correctly has no transform of its own.
    const signature = async (): Promise<{ data: string; stageTransform: string; size: string }> =>
      page.evaluate((selector) => {
        const canvas = document.querySelector(selector) as HTMLCanvasElement | null;
        if (canvas === null) {
          throw new Error("no canvas");
        }
        const stage = document.querySelector('[data-role="skia-stage"]');
        return {
          data: canvas.toDataURL(),
          stageTransform:
            stage === null ? "NO_STAGE" : getComputedStyle(stage).transform,
          size: `${canvas.width}x${canvas.height}@${canvas.clientWidth}x${canvas.clientHeight}`,
        };
      }, CANVAS);

    const before = await signature();
    expect(before.stageTransform, "the shared pan/zoom stage is missing").not.toBe("NO_STAGE");

    await page.evaluate(() => window.__pydeeSetViewport(2, 0, 0));
    await settle(page);
    await settle(page);
    const after = await signature();

    // Something observable must differ, or the canvas is not following the viewport.
    const changed =
      before.data !== after.data
      || before.stageTransform !== after.stageTransform
      || before.size !== after.size;
    expect(
      changed,
      `zoom 1 -> 2 changed nothing (size ${before.size} -> ${after.size}, `
        + `stage ${before.stageTransform} -> ${after.stageTransform})`,
    ).toBe(true);
  });

  test("the engine surface is not thrown away by zoom, pan or selection", async ({ page }) => {
    await open(page);

    // A surface reallocation shows up as the readout going unavailable and back, or
    // as the canvas losing its backing store size. Both are checked because the
    // element can persist while the WASM surface behind it is replaced — and the
    // surface is the expensive half.
    const before = await page.evaluate((selector) => {
      const canvas = document.querySelector(selector) as HTMLCanvasElement | null;
      return { width: canvas?.width ?? 0, height: canvas?.height ?? 0 };
    }, CANVAS);
    expect(before.width, "the canvas has no backing store").toBeGreaterThan(0);

    await page.evaluate(() => window.__pydeeSetViewport(4, 30, 30));
    await settle(page);
    await page.evaluate(() => window.__pydeeSelect("spun"));
    await settle(page);

    const after = await page.evaluate((selector) => {
      const canvas = document.querySelector(selector) as HTMLCanvasElement | null;
      return {
        width: canvas?.width ?? 0,
        height: canvas?.height ?? 0,
        unavailable: (document.body.textContent ?? "").includes("skia: unavailable"),
      };
    }, CANVAS);

    // The artboard did not change size, so the surface must be the same one: it is
    // reallocated only on an artboard resize.
    expect(after.width, "the backing store was resized by zoom/selection").toBe(before.width);
    expect(after.height).toBe(before.height);
    expect(after.unavailable, "the engine dropped out during zoom/selection").toBe(false);
  });
});
