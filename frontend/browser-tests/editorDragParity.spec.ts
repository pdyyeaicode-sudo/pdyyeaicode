/**
 * Drag coordinate-space parity, measured through the REAL editor.
 *
 * `dragCoordinateSpace.spec.ts` establishes the CSS/SVG semantics on a fixture.
 * This file drives the actual `SVGCanvas` + `useCanvasDrag` with real Chromium
 * pointer events and measures three things in the same screen-space coordinate
 * system:
 *
 *   1. the pointer's screen displacement (what we asked for)
 *   2. the SVG preview's screen displacement (`getBoundingClientRect`)
 *   3. the committed document-space delta (recorded by the harness)
 *
 * The invariant that matters to a user: at ANY zoom, the shape under the cursor
 * stays under the cursor. That is a single assertion — SVG screen displacement
 * equals pointer screen displacement — and it must hold at every zoom, not just
 * at 1 where a zoom-factor error is invisible.
 *
 * One responsibility per file: end-to-end drag coordinate-space parity.
 */

import { expect, test, type Page } from "@playwright/test";

const HARNESS = "/browser-tests/harness/index.html";
const LAYER = '[data-layer-id="target"]';

interface DragResult {
  readonly pointerDelta: number;
  readonly svgDelta: number;
  readonly committed: { layerId: string; dx: number; dy: number } | undefined;
}

async function boxOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).boundingBox();
  if (box === null) {
    throw new Error(`${selector} has no layout box`);
  }
  return { x: box.x, y: box.y };
}

/**
 * Perform a real pointer drag of `pointerDelta` screen pixels and measure the
 * outcome.
 *
 * The move is issued in several steps because a single jump would not exercise
 * the threshold promotion, and because a real drag is a stream of samples.
 */
async function drag(page: Page, zoom: number, pointerDelta: number): Promise<DragResult> {
  await page.goto(`${HARNESS}?zoom=${zoom}`);
  await page.waitForSelector(LAYER);

  const start = await boxOf(page, LAYER);
  const grabX = start.x + 10;
  const grabY = start.y + 10;

  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  // Cross the drag threshold, then travel the rest.
  for (const fraction of [0.25, 0.5, 0.75, 1]) {
    await page.mouse.move(grabX + pointerDelta * fraction, grabY);
  }

  // Measured while the pointer is still down, so this is the PREVIEW, which is
  // what the user sees during the gesture.
  // The preview is written in an animation frame; yield one before measuring.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  const during = await boxOf(page, LAYER);

  await page.mouse.up();

  const committed = await page.evaluate(() => window.__pydeeCommits.at(-1));

  return {
    pointerDelta,
    svgDelta: during.x - start.x,
    committed,
  };
}

test.describe("drag preview tracks the pointer at every zoom", () => {
  test("zoom 1: preview, pointer and commit all agree", async ({ page }) => {
    const result = await drag(page, 1, 60);

    expect(result.svgDelta).toBeCloseTo(result.pointerDelta, 0);
    // At zoom 1 the document delta equals the screen delta, which is exactly why
    // a zoom-factor bug is invisible in a zoom-1-only test.
    expect(result.committed?.dx).toBeCloseTo(60, 1);
  });

  test("zoom 2: the preview must not over-travel", async ({ page }) => {
    const result = await drag(page, 2, 60);

    // The document-space commit is correct either way: dx / zoom.
    expect(result.committed?.dx).toBeCloseTo(30, 1);

    // The preview is the assertion under test. Before the fix this measured 120
    // for a 60px pointer move — the shape ran away from the cursor at 2x speed.
    expect(result.svgDelta).toBeCloseTo(result.pointerDelta, 0);
  });

  test("zoom 0.5 and zoom 4 hold the same invariant", async ({ page }) => {
    for (const zoom of [0.5, 4]) {
      const result = await drag(page, zoom, 40);
      expect(result.svgDelta, `preview at zoom ${zoom}`).toBeCloseTo(40, 0);
      expect(result.committed?.dx, `commit at zoom ${zoom}`).toBeCloseTo(40 / zoom, 1);
    }
  });

  test("the preview is released cleanly, leaving no residual transform", async ({ page }) => {
    await page.goto(`${HARNESS}?zoom=2`);
    await page.waitForSelector(LAYER);

    const start = await boxOf(page, LAYER);
    await page.mouse.move(start.x + 10, start.y + 10);
    await page.mouse.down();
    await page.mouse.move(start.x + 50, start.y + 10);
    await page.mouse.up();

    // The commit hands the offset to the document; the preview must be gone or the
    // layer would render at double the offset once the document catches up. Both
    // channels are checked: the `transform` attribute the preview now writes, and
    // the inline style an older build used, so a stale bundle cannot leave an
    // override behind.
    const residual = await page.locator(LAYER).evaluate((el) => ({
      style: (el as SVGElement).style.transform,
      attribute: el.getAttribute("transform"),
    }));
    expect(residual.style).toBe("");
    expect(residual.attribute).toBeNull();
  });
});


test.describe("the preview survives React replacing the SVG subtree", () => {
  test("a paused drag keeps its preview after the subtree is rebuilt", async ({ page }) => {
    // `EditorCanvas` injects the markup through `dangerouslySetInnerHTML`, and a
    // MutationObserver on `.svg-canvas-markup` records `childList +1 -1` several
    // times during a single gesture. The node captured at pointerdown therefore
    // becomes detached mid-drag, which used to freeze the preview entirely — the
    // layer did not move until the commit landed.
    //
    // `snap=1` matters: the re-renders come from the snap-guide state updates, so
    // with snapping off there is no mid-drag render at all and this test would
    // pass without exercising the guard. Snapping is on by default in the editor.
    await page.goto(`${HARNESS}?editor=1&zoom=2&snap=1`);
    await page.waitForSelector(LAYER);

    const start = await boxOf(page, LAYER);
    const grabX = start.x + 10;
    const grabY = start.y + 10;

    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await page.mouse.move(grabX + 60, grabY);

    // Hold still, long enough for every render the last move triggered to land.
    await page.waitForTimeout(400);

    // The preview is written in an animation frame; yield one before measuring.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  const during = await boxOf(page, LAYER);
    await page.mouse.up();

    expect(during.x - start.x).toBeCloseTo(60, 0);
  });

  test("the SVG subtree really is replaced, so the guard is load-bearing", async ({ page }) => {
    // If React ever stops replacing the subtree this test fails, which is the
    // signal to simplify the guard rather than leave dead complexity behind.
    //
    // The replacements are driven by the snap-guide state updates, so snapping has
    // to be on — which is the editor's default. Measured: with `snap=0` there is no
    // mid-drag re-render at all, so the guard is only load-bearing while snapping
    // (or anything else that sets React state per pointer sample) is active.
    await page.goto(`${HARNESS}?editor=1&zoom=2&snap=1`);
    await page.waitForSelector(LAYER);

    await page.evaluate(() => {
      const bag = window as unknown as { __replacements: number };
      bag.__replacements = 0;
      const markup = document.querySelector(".svg-canvas-markup")!;
      new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === "childList" && record.removedNodes.length > 0) {
            bag.__replacements += 1;
          }
        }
      }).observe(markup, { childList: true, subtree: true });
    });

    const start = await boxOf(page, LAYER);
    await page.mouse.move(start.x + 10, start.y + 10);
    await page.mouse.down();
    for (const step of [15, 30, 45, 60]) {
      await page.mouse.move(start.x + 10 + step, start.y + 10);
      await page.waitForTimeout(40);
    }
    await page.mouse.up();

    const replacements = await page.evaluate(
      () => (window as unknown as { __replacements: number }).__replacements,
    );
    expect(replacements).toBeGreaterThan(0);
  });
});
