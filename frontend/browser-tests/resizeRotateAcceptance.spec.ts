/**
 * Acceptance matrix for resize and rotate, measured through the real editor.
 *
 * The invariant asserted for resize is the definition of the operation, not a
 * restatement of the implementation:
 *
 *     dragging handle H moves H to the pointer,
 *     and leaves the OPPOSITE anchor exactly where it was.
 *
 * That holds for every rotation, scale and nesting, so the same assertion covers
 * the whole matrix instead of needing per-case expected numbers — which is what
 * made earlier attempts either trivial or wrong. Handle positions are read from
 * the overlay's own `[data-handle]` elements, so a box that disagreed with its
 * handles would fail here too.
 *
 * For rotate the invariant is:
 *
 *     the shape's CENTRE does not move, and its screen orientation changes by the
 *     dragged angle.
 *
 * Every case runs against `?commit=1`, which puts the genuine command pipeline
 * behind the gesture, so a resize that looks right during the drag but commits in
 * the wrong space still fails.
 *
 * Layers exercised (all from the harness fixture):
 *   - `target`  — plain, untransformed
 *   - `rotated` — a rotated TEXT layer, whose resize commits as a transform
 *   - `nested`  — inside `translate(40 30) scale(2)`, with its own `rotate(25 …)`
 *
 * One responsibility per file: resize/rotate acceptance under real transforms.
 */

import { expect, test, type Page } from "@playwright/test";

const HARNESS = "/browser-tests/harness/index.html";

const CORNERS = ["nw", "ne", "se", "sw"] as const;
const SIDES = ["n", "e", "s", "w"] as const;
const ALL_HANDLES = [...CORNERS, ...SIDES] as const;

const OPPOSITE: Record<string, string> = {
  nw: "se",
  n: "s",
  ne: "sw",
  e: "w",
  se: "nw",
  s: "n",
  sw: "ne",
  w: "e",
};

interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * The layer GROUP, not its primitive.
 *
 * `serializeArtboard` writes `data-layer-id` onto both the `<g>` and the primitive
 * it wraps, so an unscoped `[data-layer-id="x"]` matches two elements after a
 * document round-trip. The group is what "the layer" means here.
 */
const layerSelector = (layerId: string): string => `g[data-layer-id="${layerId}"]`;

async function open(page: Page, layerId: string, zoom: number): Promise<void> {
  await page.goto(`${HARNESS}?editor=1&commit=1&zoom=${zoom}&select=${layerId}`);
  await page.waitForSelector(layerSelector(layerId));
  // The overlay measures in a layout effect; wait for whatever handles it draws.
  // Text layers deliberately get only the horizontal pair, so waiting for "nw"
  // specifically would hang on them.
  await page.waitForSelector("[data-handle]");
}

/** Centre of a handle element, in screen coordinates. */
async function handleCentre(page: Page, handle: string): Promise<Point> {
  const box = await page.locator(`[data-handle="${handle}"]`).first().boundingBox();
  if (box === null) {
    throw new Error(`handle "${handle}" has no layout box`);
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function layerCentre(page: Page, layerId: string): Promise<Point> {
  const box = await layerBox(page, layerId);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function layerBox(page: Page, layerId: string) {
  const box = await page.locator(layerSelector(layerId)).first().boundingBox();
  if (box === null) {
    throw new Error(`layer "${layerId}" has no layout box`);
  }
  return box;
}

/** Drag a handle by a screen displacement, with several samples. */
async function dragHandle(page: Page, handle: string, delta: Point): Promise<void> {
  const from = await handleCentre(page, handle);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (const fraction of [0.25, 0.5, 0.75, 1]) {
    await page.mouse.move(from.x + delta.x * fraction, from.y + delta.y * fraction);
  }
  await page.mouse.up();
  // Let the commit re-render before anything is measured.
  await page.waitForTimeout(60);
}

test.describe("resize keeps the opposite anchor fixed, for every handle", () => {
  /*
    Eight page loads per test, because each handle starts from a clean document.

    The default 30-second budget was always marginal for that and only started failing when
    the suite grew heavier: under six-way parallelism these six cases timed out while passing
    on their own. The work is real, so the budget is what was wrong.
  */
  test.describe.configure({ timeout: 120_000 });

  for (const layerId of ["target", "nested"] as const) {
    for (const zoom of [1, 2, 4]) {
      test(`${layerId} at zoom ${zoom}: all eight handles`, async ({ page }) => {
        for (const handle of ALL_HANDLES) {
          await open(page, layerId, zoom);

          const anchorName = OPPOSITE[handle];
          const anchorBefore = await handleCentre(page, anchorName);
          const handleBefore = await handleCentre(page, handle);

          // A displacement that is not axis-aligned, so a mistake in either axis
          // shows up rather than cancelling.
          await dragHandle(page, handle, { x: 26, y: 18 });

          const anchorAfter = await handleCentre(page, anchorName);
          const handleAfter = await handleCentre(page, handle);

          // The anchor is fixed by construction. 1.5px of slack covers the
          // half-pixel rounding in handle placement, not a coordinate-space error,
          // which would be off by the zoom or the group's scale.
          expect(
            Math.hypot(anchorAfter.x - anchorBefore.x, anchorAfter.y - anchorBefore.y),
            `${layerId}/${handle} at zoom ${zoom}: anchor "${anchorName}" moved`,
          ).toBeLessThan(1.5);

          // And the gesture actually did something: the dragged handle moved.
          expect(
            Math.hypot(handleAfter.x - handleBefore.x, handleAfter.y - handleBefore.y),
            `${layerId}/${handle} at zoom ${zoom}: the dragged handle did not move`,
          ).toBeGreaterThan(2);
        }
      });
    }
  }
});

test.describe("resize reaches the document", () => {
  test("a shape resize is committed as geometry, not silently dropped", async ({ page }) => {
    await open(page, "target", 1);
    const before = await layerBox(page, "target");

    await dragHandle(page, "e", { x: 40, y: 0 });

    const commits = await page.evaluate(() => window.__pydeeResizes);
    expect(commits.length).toBe(1);
    // A rect must be rewritten as geometry: `applySnapshot` ignores a box snapshot
    // for shape layers, so a box here would mean the resize did nothing at all.
    expect((commits[0].next as { kind: string }).kind).toBe("geometry");

    // The shape stayed resized after the preview was released and the document
    // took over.
    const after = await layerBox(page, "target");
    expect(after.width - before.width).toBeCloseTo(40, 0);
    expect(after.height).toBeCloseTo(before.height, 0);
  });

  test("a text resize is committed as a transform, because text has no size field", async ({
    page,
  }) => {
    await open(page, "rotated", 1);
    const before = await layerBox(page, "rotated");

    // Text layers deliberately expose only the horizontal pair, because a vertical
    // drag on glyphs has no meaning without changing the font size.
    await dragHandle(page, "e", { x: 30, y: 0 });

    const commits = await page.evaluate(() => window.__pydeeResizes);
    expect(commits.length).toBe(1);
    expect((commits[0].next as { kind: string }).kind).toBe("transform");

    // It grew, and it is still there — a transform snapshot that dropped the
    // original rotation would move it somewhere else entirely.
    const after = await layerBox(page, "rotated");
    expect(after.width).toBeGreaterThan(before.width);
  });

  test("undo restores the exact prior geometry", async ({ page }) => {
    await open(page, "target", 1);
    const before = await layerBox(page, "target");

    await dragHandle(page, "se", { x: 35, y: 25 });
    const resized = await layerBox(page, "target");
    expect(resized.width).toBeGreaterThan(before.width + 20);

    const undone = await page.evaluate(() => window.__pydeeUndo());
    expect(undone).toBe(true);
    await page.waitForTimeout(60);

    const after = await layerBox(page, "target");
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
    expect(after.width).toBeCloseTo(before.width, 1);
    expect(after.height).toBeCloseTo(before.height, 1);
  });

  test("a flip past the anchor is preserved rather than clamped", async ({ page }) => {
    await open(page, "target", 1);
    const before = await layerBox(page, "target");

    // Drag the west edge far past the east edge.
    await dragHandle(page, "w", { x: before.width + 60, y: 0 });

    const after = await layerBox(page, "target");
    // The shape is on the other side of its anchor and still has real area, which
    // is what "a flip is a valid transform" means in practice.
    expect(after.x).toBeGreaterThan(before.x + before.width - 2);
    expect(after.width).toBeGreaterThan(5);
  });
});

test.describe("rotate", () => {
  for (const zoom of [1, 2, 4]) {
    test(`zoom ${zoom}: the shape's centre stays put while it turns`, async ({ page }) => {
      await open(page, "target", zoom);
      const centreBefore = await layerCentre(page, "target");
      const boxBefore = await layerBox(page, "target");

      // The corner rotation zones sit just outside the corners; grab the north-west
      // one and swing it around the centre.
      const grab = await handleCentre(page, "rotate-nw");
      await page.mouse.move(grab.x, grab.y);
      await page.mouse.down();
      const radius = Math.hypot(grab.x - centreBefore.x, grab.y - centreBefore.y);
      const startAngle = Math.atan2(grab.y - centreBefore.y, grab.x - centreBefore.x);
      for (const fraction of [0.25, 0.5, 0.75, 1]) {
        const angle = startAngle + (Math.PI / 4) * fraction;
        await page.mouse.move(
          centreBefore.x + Math.cos(angle) * radius,
          centreBefore.y + Math.sin(angle) * radius,
        );
      }
      await page.mouse.up();
      await page.waitForTimeout(80);

      const commits = await page.evaluate(() => window.__pydeeRotates);
      expect(commits.length, `zoom ${zoom}: no rotation was committed`).toBe(1);

      const centreAfter = await layerCentre(page, "target");
      // A rotation about the shape's own centre cannot move that centre. A pivot
      // read from the wrong coordinate space would translate it, and the error
      // would grow with zoom — which is why this runs at 4x too.
      expect(
        Math.hypot(centreAfter.x - centreBefore.x, centreAfter.y - centreBefore.y),
        `zoom ${zoom}: the centre moved`,
      ).toBeLessThan(2 + zoom);

      // And it really rotated: an axis-aligned rect turned 45 degrees has a larger
      // axis-aligned bounding box.
      const boxAfter = await layerBox(page, "target");
      expect(boxAfter.width, `zoom ${zoom}: the shape did not turn`).toBeGreaterThan(
        boxBefore.width + 5,
      );
    });
  }

  for (const zoom of [1, 2, 4]) {
    test(`zoom ${zoom}: rotating a nested layer keeps its centre, so the pivot is in parent space`, async ({
      page,
    }) => {
      await open(page, "nested", zoom);
      const centreBefore = await layerCentre(page, "nested");

      const grab = await handleCentre(page, "rotate-ne");
      const radius = Math.hypot(grab.x - centreBefore.x, grab.y - centreBefore.y);
      const startAngle = Math.atan2(grab.y - centreBefore.y, grab.x - centreBefore.x);

      await page.mouse.move(grab.x, grab.y);
      await page.mouse.down();
      for (const fraction of [0.3, 0.6, 1]) {
        const angle = startAngle + (Math.PI / 6) * fraction;
        await page.mouse.move(
          centreBefore.x + Math.cos(angle) * radius,
          centreBefore.y + Math.sin(angle) * radius,
        );
      }
      await page.mouse.up();
      await page.waitForTimeout(80);

      const centreAfter = await layerCentre(page, "nested");
      // The decisive case: the layer sits inside a scaled, translated group. A pivot
      // taken in the SVG root's space instead of the parent's would be off by the
      // group's transform, and a centre reconstructed from the UNROTATED box would
      // be off by the layer's own rotation. Either sends the shape away from its own
      // centre, by more at higher zoom.
      expect(
        Math.hypot(centreAfter.x - centreBefore.x, centreAfter.y - centreBefore.y),
        `zoom ${zoom}: nested layer's centre moved during rotation`,
      ).toBeLessThan(2 + zoom);
    });
  }
});

declare global {
  interface Window {
    __pydeeResizes: Array<{ layerId: string; prev: unknown; next: unknown }>;
    __pydeeRotates: Array<{ layerId: string; prev: unknown; next: unknown }>;
    __pydeeUndo: () => boolean;
  }
}
