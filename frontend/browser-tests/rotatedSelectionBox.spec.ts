/**
 * The selection outline must sit ON the shape, including when the shape is
 * rotated.
 *
 * The reported symptom: a rotated text layer showed its selection box in a
 * completely different place from the text, which also made the shape feel
 * ungrabbable — the box is where a user aims, and it was not over the glyphs.
 *
 * Root cause, two compounding bugs:
 *   1. The box was rotated about its own SCREEN-space centre, while the SVG
 *      element rotates about the SVG-space pivot in `rotate(a cx cy)`. Different
 *      pivots, so the two diverged as soon as the pivot was not the centre.
 *   2. `parseRotation` read only the FIRST `rotate()` in the transform, and
 *      rotations were APPENDED on every gesture, so after two rotations the box
 *      used a stale angle.
 *
 * Both are gone: the box is now derived from the element's real `getScreenCTM()`,
 * which already composes every transform in the chain.
 *
 * This has to be a browser test. `getScreenCTM` and `getBBox` both return zeros in
 * jsdom, so the whole computation is unobservable there.
 *
 * A third defect blocked verifying any of this: `SelectionOverlay`'s measuring
 * `useLayoutEffect` depended on `[hostRef, selectedKey, composedSvg, viewport…]`,
 * none of which changes when `SVGCanvas` injects the SVG. `hostRef` is a stable
 * object, so if the effect ran before that markup existed it bailed out with
 * `setHandleBox(null)` and never ran again — no outline and no handles at all.
 * Same defect class as the `useCanvasDrag` bug: a ref in a dependency array is not
 * a readiness signal. The rendered `<svg>` is now tracked in state.
 *
 * These have to be browser tests: `getScreenCTM` and `getBBox` both return zeros
 * in jsdom, so the whole computation is unobservable there.
 *
 * One responsibility per file: selection outline geometry for transformed shapes.
 */

import { expect, test, type Page } from "@playwright/test";

const HARNESS = "/browser-tests/harness/index.html";
/** Rotated 35 degrees about (250 300) in the harness document. */
const ROTATED_LAYER = '[data-layer-id="rotated"]';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function centreOf(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * The selection outline's rendered rect.
 *
 * Found by `data-role`, not by a class name containing "selectionBox". The outline is
 * a `<polygon>` through the four world corners now, rather than a rotated `<div>`: a
 * rotated div can only ever be a parallelogram with equal opposite sides drawn about
 * one pivot, which cannot represent a flip or a skew. `getBoundingClientRect` on the
 * polygon returns its tight client-space box, so this measurement is if anything
 * stricter than it was.
 */
async function selectionOutlineRect(page: Page): Promise<Rect> {
  const rect = await page.evaluate(() => {
    const outline = document.querySelector('[data-role="selection-outline"]');
    if (outline === null) {
      return null;
    }
    const box = outline.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
  if (rect === null) {
    throw new Error("selection outline was not rendered");
  }
  return rect;
}

async function shapeRect(page: Page, selector: string): Promise<Rect> {
  const box = await page.locator(selector).boundingBox();
  if (box === null) {
    throw new Error(`${selector} has no layout box`);
  }
  return box;
}

test.describe("selection outline on a rotated shape", () => {
  for (const zoom of [1, 2]) {
    test(`zoom ${zoom}: the outline is centred on the shape it selects`, async ({ page }) => {
      await page.goto(`${HARNESS}?editor=1&zoom=${zoom}&select=rotated`);
      await page.waitForSelector(ROTATED_LAYER);
      // The outline is measured in a layout effect, so wait for it to appear.
      await expect
        .poll(async () => selectionOutlineRect(page).then(() => true).catch(() => false), {
          timeout: 10_000,
        })
        .toBe(true);

      const shape = await shapeRect(page, ROTATED_LAYER);
      const outline = await selectionOutlineRect(page);

      const shapeCentre = centreOf(shape);
      const outlineCentre = centreOf(outline);
      const offset = Math.hypot(
        outlineCentre.x - shapeCentre.x,
        outlineCentre.y - shapeCentre.y,
      );

      // Before the fix this was well over a hundred pixels — the outline sat
      // clear of the glyphs entirely. A few pixels of tolerance covers the
      // difference between the glyph ink box and the layout box.
      expect(offset, `outline offset from shape centre at zoom ${zoom}`).toBeLessThan(12);
    });
  }

  test("the outline covers a comparable area to the shape, not a stretched box", async ({
    page,
  }) => {
    await page.goto(`${HARNESS}?editor=1&zoom=1&select=rotated`);
    await page.waitForSelector(ROTATED_LAYER);
    await expect
      .poll(async () => selectionOutlineRect(page).then(() => true).catch(() => false), {
        timeout: 10_000,
      })
      .toBe(true);

    const shape = await shapeRect(page, ROTATED_LAYER);
    const outline = await selectionOutlineRect(page);

    // The rotated outline's axis-aligned bounds should match the shape's, since
    // both describe the same rotated quad.
    expect(outline.width).toBeCloseTo(shape.width, -1);
    expect(outline.height).toBeCloseTo(shape.height, -1);
  });

  test("an unrotated shape still gets an exact outline", async ({ page }) => {
    await page.goto(`${HARNESS}?editor=1&zoom=2&select=target`);
    await page.waitForSelector('[data-layer-id="target"]');
    await expect
      .poll(async () => selectionOutlineRect(page).then(() => true).catch(() => false), {
        timeout: 10_000,
      })
      .toBe(true);

    const shape = await shapeRect(page, '[data-layer-id="target"]');
    const outline = await selectionOutlineRect(page);

    expect(outline.x).toBeCloseTo(shape.x, 0);
    expect(outline.y).toBeCloseTo(shape.y, 0);
    expect(outline.width).toBeCloseTo(shape.width, 0);
    expect(outline.height).toBeCloseTo(shape.height, 0);
  });
});
