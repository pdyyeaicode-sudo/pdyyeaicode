/**
 * Do the SVG renderer and the Skia engine share one screen-space coordinate
 * system during a drag?
 *
 * They reach the screen by completely different routes, which is exactly why this
 * needs measuring rather than reasoning about:
 *
 *   SVG   — a CSS `translate()` on an SVG element, resolved in SVG user units and
 *           then scaled by `.svg-canvas-wrapper`'s `scale(zoom)`.
 *   Skia  — `setNodeDocumentTranslation` moves the node inside the engine, the
 *           artboard is rasterised at native size, and the resulting `<canvas>` is
 *           scaled by its own CSS transform.
 *
 * A discrepancy would mean the comparison overlay is lying about parity, which is
 * the one thing the dual-renderer stage exists to avoid.
 *
 * Measurement strategy: the shape is the only red thing on the artboard, so its
 * position is found by scanning the canvas bitmap for the leftmost red column.
 * Bitmap coordinates are document pixels, which makes the two renderers directly
 * comparable once the zoom factor is accounted for.
 *
 * One responsibility per file: cross-renderer coordinate-space parity.
 */

import { expect, test, type Page } from "@playwright/test";

/**
 * The preview server serving the built harness.
 *
 * Absolute rather than relative to `baseURL`, because the engine module is only
 * reachable from the production build — see `vite.harness.config.ts`.
 */
const HARNESS = "http://localhost:5200/index.html";
const LAYER = '[data-layer-id="target"]';
const SKIA_CANVAS = '[data-role="skia-canvas"]';

/** Leftmost bitmap column containing the shape's red, or null when absent. */
async function redColumnInCanvas(page: Page): Promise<number | null> {
  return page.evaluate((selector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(selector);
    if (canvas === null || canvas.width === 0) {
      return null;
    }
    const context = canvas.getContext("2d");
    if (context === null) {
      return null;
    }
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let x = 0; x < width; x += 1) {
      for (let y = 0; y < height; y += 1) {
        const offset = (y * width + x) * 4;
        // The fill is #e11d48: strongly red, clearly not the background.
        if (data[offset] > 150 && data[offset + 1] < 110 && data[offset + 3] > 200) {
          return x;
        }
      }
    }
    return null;
  }, SKIA_CANVAS);
}

async function svgLeft(page: Page): Promise<number> {
  const box = await page.locator(LAYER).boundingBox();
  if (box === null) {
    throw new Error("target layer has no layout box");
  }
  return box.x;
}

test.describe("SVG and Skia share one screen-space coordinate system", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
      throw new Error(`harness threw: ${error.message}`);
    });
  });

  for (const zoom of [1, 2]) {
    test(`zoom ${zoom}: both renderers move by the pointer's screen displacement`, async ({
      page,
    }) => {
      // `commit=1` so the gesture actually reaches the document — the post-gesture
      // parity check below has nothing to compare against otherwise.
      await page.goto(`${HARNESS}?renderer=skia&commit=1&zoom=${zoom}`);
      // `state: "attached"`: with the engine as the visual surface the SVG design
      // objects are deliberately `visibility: hidden`. They keep their layout, which
      // is all the SVG-side measurement below needs.
      await page.waitForSelector(LAYER, { state: "attached" });

      // The engine loads asynchronously and the overlay reports its state, so wait
      // for real pixels rather than a timeout.
      await expect(page.locator(SKIA_CANVAS)).toBeVisible();
      await expect
        .poll(async () => redColumnInCanvas(page), { timeout: 30_000 })
        .not.toBeNull();

      const pointerDelta = 60;
      const documentDelta = pointerDelta / zoom;

      const svgBefore = await svgLeft(page);
      const skiaBefore = await redColumnInCanvas(page);
      expect(skiaBefore).not.toBeNull();

      const grabX = svgBefore + 10;
      const grabY = (await page.locator(LAYER).boundingBox())!.y + 10;

      await page.mouse.move(grabX, grabY);
      await page.mouse.down();
      for (const fraction of [0.25, 0.5, 0.75, 1]) {
        await page.mouse.move(grabX + pointerDelta * fraction, grabY);
      }

      // Both are read mid-gesture: the preview is what the user is looking at.
      // Skia repaints through a rAF frame loop, so poll rather than assume the
      // frame already landed.
      await expect
        .poll(async () => redColumnInCanvas(page), { timeout: 5_000 })
        .not.toBe(skiaBefore);

      const svgAfter = await svgLeft(page);
      const skiaAfter = await redColumnInCanvas(page);
      await page.mouse.up();

      const svgScreenDelta = svgAfter - svgBefore;
      // The canvas bitmap is in document pixels; its CSS transform applies the
      // same zoom the SVG wrapper does, so multiplying makes the two comparable.
      const skiaScreenDelta = (skiaAfter! - skiaBefore!) * zoom;

      // 1. The engine moved by the document delta in its own bitmap. With one
      //    interactive surface this IS the preview the user is looking at.
      expect(skiaAfter! - skiaBefore!, "skia bitmap vs document delta").toBeCloseTo(
        documentDelta,
        0,
      );
      // 2. And therefore by the pointer's displacement on screen.
      expect(skiaScreenDelta, "skia vs pointer on screen").toBeCloseTo(pointerDelta, 0);

      // 3. The SVG design layer does NOT move during the gesture, and that is the
      //    point of the migration rather than a regression: the engine owns the
      //    interactive surface, so the DOM is not written per frame. Asserting the
      //    old "both previews move together" would be asserting the hybrid back into
      //    existence.
      expect(svgScreenDelta, "the SVG must not preview while the engine owns the surface")
        .toBeCloseTo(0, 0);

      // 4. Parity is instead checked on the COMMITTED document: once the gesture
      //    ends, both renderers describe the same artboard, so the SVG catches up to
      //    where the engine already drew. This is the property Phase 8 needs — the
      //    compatibility backend still agrees with the engine.
      await expect
        .poll(async () => Math.round(await svgLeft(page)), { timeout: 5_000 })
        .toBe(Math.round(svgBefore + pointerDelta));
    });
  }
});
