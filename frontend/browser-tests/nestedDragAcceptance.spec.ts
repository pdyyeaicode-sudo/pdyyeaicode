/**
 * Acceptance: a layer inside a TRANSFORMED ancestor stays under the cursor.
 *
 * `nestedTransformDrag.spec.ts` measured the platform on a fixture and proved two
 * facts: an ancestor scale multiplies a translate again, and an ancestor rotation
 * redirects it. This file drives the REAL editor — `EditorCanvas` -> `SVGCanvas`
 * -> `useCanvasDrag`, with the render scene wired in — and asserts the only thing
 * a user cares about:
 *
 *     the shape under the cursor stays under the cursor,
 *     at every zoom, whatever transforms its ancestors carry.
 *
 * The `nested` layer in the harness sits inside `translate(40 30) scale(2)` AND
 * carries its own `rotate(25 …)`. Under the previous `dx / zoom` conversion its
 * preview travelled 2x the pointer and its committed geometry offset was rotated
 * by 25 degrees, so it drifted further on every gesture.
 *
 * Why this cannot be a jsdom test: it needs real layout to measure screen
 * displacement, and the defect is invisible at zoom 1 with no ancestor transform —
 * which is the only configuration jsdom could have described.
 *
 * `?editor=1` is required: `EditorCanvas` owns the unwrapped design output and is
 * therefore the only place the scene can be built with document layer ids.
 *
 * One responsibility per file: end-to-end drag acceptance under nested transforms.
 */

import { expect, test, type Page } from "@playwright/test";

const HARNESS = "/browser-tests/harness/index.html";

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function rectOf(page: Page, layerId: string): Promise<Rect> {
  const box = await page.locator(`[data-layer-id="${layerId}"]`).boundingBox();
  if (box === null) {
    throw new Error(`layer "${layerId}" has no layout box`);
  }
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

interface DragOutcome {
  readonly before: Rect;
  readonly during: Rect;
  readonly after: Rect;
  readonly pointer: { dx: number; dy: number };
  readonly committed: { layerId: string; dx: number; dy: number } | undefined;
  readonly transformDuring: string | null;
  readonly transformBefore: string | null;
}

/** A real multi-sample pointer drag on `layerId`, measured in screen pixels. */
async function dragLayer(
  page: Page,
  layerId: string,
  zoom: number,
  pointer: { dx: number; dy: number },
  options: { readonly commit?: boolean } = {},
): Promise<DragOutcome> {
  const commit = options.commit === true ? "&commit=1" : "";
  await page.goto(`${HARNESS}?editor=1&zoom=${zoom}${commit}`);
  await page.waitForSelector(`[data-layer-id="${layerId}"]`);

  const before = await rectOf(page, layerId);
  const transformBefore = await page
    .locator(`[data-layer-id="${layerId}"]`)
    .getAttribute("transform");

  // Grab near the middle of the shape so the pointer is unambiguously inside it.
  const grabX = before.x + before.width / 2;
  const grabY = before.y + before.height / 2;

  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  for (const fraction of [0.2, 0.5, 0.8, 1]) {
    await page.mouse.move(grabX + pointer.dx * fraction, grabY + pointer.dy * fraction);
  }

  // The preview is written in an animation frame, not in the pointer handler, so
  // one frame must be yielded before it can be measured. See the comment in
  // dragAfterCommit.spec.ts.
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  const during = await rectOf(page, layerId);  const transformDuring = await page
    .locator(`[data-layer-id="${layerId}"]`)
    .getAttribute("transform");

  await page.mouse.up();

  // Give React a frame to re-render from the committed document before measuring
  // where the shape actually ended up.
  await page.waitForTimeout(50);

  const after = await rectOf(page, layerId);
  const committed = await page.evaluate(() => window.__pydeeCommits.at(-1));

  return { before, during, after, pointer, committed, transformDuring, transformBefore };
}

declare global {
  interface Window {
    __pydeeCommits: Array<{ layerId: string; dx: number; dy: number }>;
  }
}

test.describe("a layer inside a scaled, translated ancestor", () => {
  for (const zoom of [1, 2, 4]) {
    test(`zoom ${zoom}: the preview tracks the pointer exactly`, async ({ page }) => {
      const pointer = { dx: 48, dy: 24 };
      const result = await dragLayer(page, "nested", zoom, pointer);

      // The decisive assertion. Under `dx / zoom` this was 2x the pointer,
      // because the ancestor's scale(2) applied a second time.
      expect(result.during.x - result.before.x, `zoom ${zoom} preview dx`).toBeCloseTo(
        pointer.dx,
        0,
      );
      expect(result.during.y - result.before.y, `zoom ${zoom} preview dy`).toBeCloseTo(
        pointer.dy,
        0,
      );
    });
  }

  test("the preview preserves the layer's own rotation", async ({ page }) => {
    const result = await dragLayer(page, "nested", 1, { dx: 40, dy: 0 });

    // A 40x20 rect rotated 25 degrees and scaled 2x presents as neither 80x40 nor
    // 40x20; whatever it is, dragging must not change it. Writing
    // `style.transform` used to override the rotation outright, so the box
    // visibly changed shape for the duration of the gesture.
    expect(result.during.width).toBeCloseTo(result.before.width, 1);
    expect(result.during.height).toBeCloseTo(result.before.height, 1);

    // The rotation is still in the attribute, with the drag translate PREPENDED.
    expect(result.transformBefore).toContain("rotate(25");
    expect(result.transformDuring).toContain("rotate(25");
    expect(result.transformDuring?.startsWith("translate(")).toBe(true);
  });

  test("the committed delta is in the layer's own space, so the shape does not jump", async ({
    page,
  }) => {
    const pointer = { dx: 48, dy: 24 };
    // `commit: true` runs the real pipeline: command -> document -> canonical SVG
    // -> re-render. Without it the shape springs back and this cannot be measured.
    const result = await dragLayer(page, "nested", 2, pointer, { commit: true });

    // After release the document owns the position. If the commit were in the
    // wrong space the shape would snap somewhere else the instant the preview was
    // dropped, which is the drift users saw accumulate over several drags.
    expect(result.after.x - result.before.x, "committed dx on screen").toBeCloseTo(
      pointer.dx,
      0,
    );
    expect(result.after.y - result.before.y, "committed dy on screen").toBeCloseTo(
      pointer.dy,
      0,
    );

    // The commit is expressed in the LAYER's local space: 48 screen px at zoom 2
    // is 24 world px, and the ancestor scale(2) plus the node's own rotate(25)
    // make the local delta neither 24 nor 48.
    expect(result.committed?.layerId).toBe("nested");
    const localMagnitude = Math.hypot(result.committed?.dx ?? 0, result.committed?.dy ?? 0);
    const worldMagnitude = Math.hypot(pointer.dx / 2, pointer.dy / 2);
    // scale(2) halves the local magnitude; rotation preserves it.
    expect(localMagnitude).toBeCloseTo(worldMagnitude / 2, 2);
  });

  test("an untransformed layer is unaffected by the change", async ({ page }) => {
    // The simple case must keep working: the conversion has to reduce to the
    // identity when nothing in the chain transforms anything.
    const pointer = { dx: 60, dy: 20 };
    const result = await dragLayer(page, "target", 2, pointer);

    expect(result.during.x - result.before.x).toBeCloseTo(pointer.dx, 0);
    expect(result.during.y - result.before.y).toBeCloseTo(pointer.dy, 0);
    // 60 screen px at zoom 2 is 30 world px, and world == local here.
    expect(result.committed?.dx).toBeCloseTo(30, 3);
    expect(result.committed?.dy).toBeCloseTo(10, 3);
  });
});
