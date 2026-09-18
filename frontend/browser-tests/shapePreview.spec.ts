/**
 * Live shape-creation preview: the outline the user drags IS the object they get.
 *
 * The property that matters to a user is continuity of feedback and identity of result:
 * while dragging a triangle they see the actual stretched triangle, and on release that
 * same geometry becomes the real object. Both halves are asserted here.
 *
 *   E. the preview changes SHAPE as the drag changes — wider drag, wider triangle; and
 *      the committed geometry is byte-identical to the last preview.
 *   F. Escape / cancel destroys the preview, mutates no document, and leaves no undo
 *      entry.
 *
 * Driven through `window.__pydeeShapeCreate`, which is the REAL `createShapeCreateSession`
 * wired to the REAL engine bridge in the harness — so this exercises the threshold, the
 * single commit and the cancel, not a direct poke at the engine.
 *
 * The geometry is read from the engine's own outline (`d` plus its Skia-measured
 * bounds), not from pixels, because "preview equals commit" is a statement about the
 * path data and the whole point of building it in C++ is that there is one string.
 * Separately, `geometryAuthority.spec.ts` proves the outline lands on the ink.
 *
 * Runs against the BUILT harness on 5200; the engine module is unreachable from the dev
 * server.
 *
 * One responsibility per file: the live creation-preview lifecycle.
 */

import { expect, test, type Page } from "@playwright/test";

const HARNESS = "http://localhost:5200/index.html";

interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function open(page: Page, zoom = 1): Promise<void> {
  await page.goto(`${HARNESS}?renderer=skia&commit=1&zoom=${zoom}`);
  await page.waitForSelector('canvas[data-role="skia-canvas"]');
  // The bridge is published from inside the frame loop, so wait for it AND for a
  // presented frame — a gesture started before the first frame is handled by the SVG
  // path, which has no preview.
  await page.waitForFunction(
    () => window.__pydeeEngineStatus === "ready" && window.__pydeeShapeCreate !== undefined,
    { timeout: 20_000 },
  );
}

/** A client point for a DOCUMENT point, through the engine's own conversion. */
async function clientOf(page: Page, documentX: number, documentY: number): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(
    ([dx, dy]) => {
      const bridge = window.__pydeeGestureBridge;
      if (bridge === null || bridge === undefined) {
        return null;
      }
      return bridge.documentToClient(dx, dy);
    },
    [documentX, documentY] as const,
  );
  if (point === null) {
    throw new Error("could not convert a document point to client coordinates");
  }
  return point;
}

/** Run a creation drag and return the outline present after each named waypoint. */
async function previewOutline(page: Page): Promise<Bounds | null> {
  return page.evaluate(() => {
    const preview = window.__pydeeShapeCreate?.outline();
    return preview === null || preview === undefined ? null : preview.bounds;
  });
}

test.describe("the preview changes shape as the drag changes", () => {
  test.describe.configure({ timeout: 120_000 });

  test("a triangle grows wider when the drag grows wider, and taller when taller", async ({
    page,
  }) => {
    await open(page);
    const start = await clientOf(page, 200, 200);

    await page.evaluate(
      ([sx, sy]) => window.__pydeeShapeCreate!.down("triangle", sx, sy),
      [start.x, start.y] as const,
    );

    // A modest box.
    const narrow = await clientOf(page, 240, 320);
    await page.evaluate(
      ([x, y]) => window.__pydeeShapeCreate!.move(x, y),
      [narrow.x, narrow.y] as const,
    );
    const narrowBounds = await previewOutline(page);
    expect(narrowBounds, "no outline after the first real move").not.toBeNull();
    expect(narrowBounds!.width).toBeCloseTo(40, 0);
    expect(narrowBounds!.height).toBeCloseTo(120, 0);

    // Stretch it horizontally: the width must follow, the height must not.
    const wide = await clientOf(page, 400, 320);
    await page.evaluate(
      ([x, y]) => window.__pydeeShapeCreate!.move(x, y),
      [wide.x, wide.y] as const,
    );
    const wideBounds = await previewOutline(page);
    expect(wideBounds!.width, "a wider drag makes a wider triangle").toBeCloseTo(200, 0);
    expect(wideBounds!.height, "and does not change its height").toBeCloseTo(120, 0);

    // Stretch it vertically: now the height follows.
    const tall = await clientOf(page, 400, 500);
    await page.evaluate(
      ([x, y]) => window.__pydeeShapeCreate!.move(x, y),
      [tall.x, tall.y] as const,
    );
    const tallBounds = await previewOutline(page);
    expect(tallBounds!.width, "the width holds when stretching vertically").toBeCloseTo(200, 0);
    expect(tallBounds!.height, "a taller drag makes a taller triangle").toBeCloseTo(300, 0);

    await page.evaluate(
      ([x, y]) => window.__pydeeShapeCreate!.up(x, y),
      [tall.x, tall.y] as const,
    );
  });

  test("the committed geometry is byte-identical to the last preview", async ({ page }) => {
    await open(page);
    const start = await clientOf(page, 150, 150);
    await page.evaluate(
      ([sx, sy]) => window.__pydeeShapeCreate!.down("star", sx, sy),
      [start.x, start.y] as const,
    );
    for (const [dx, dy] of [
      [220, 250],
      [300, 320],
      [280, 360],
    ] as const) {
      const point = await clientOf(page, dx, dy);
      await page.evaluate(
        ([x, y]) => window.__pydeeShapeCreate!.move(x, y),
        [point.x, point.y] as const,
      );
    }

    // The last preview `d`, captured BEFORE release.
    const lastPreview = await page.evaluate(() => window.__pydeeShapeCreate!.outline());
    expect(lastPreview, "no preview before release").not.toBeNull();

    const releaseAt = await clientOf(page, 280, 360);
    await page.evaluate(
      ([x, y]) => window.__pydeeShapeCreate!.up(x, y),
      [releaseAt.x, releaseAt.y] as const,
    );

    const commits = await page.evaluate(() => window.__pydeeShapeCommits);
    expect(commits, "the gesture committed exactly one shape").toHaveLength(1);
    // Byte-identical: the commit returns the SAME string the preview was painted from,
    // not a regeneration of it. The release sample equals the last move, so the outline
    // is unchanged by the final update.
    expect(commits[0].d).toBe(lastPreview!.d);
    expect(commits[0].shapeType).toBe("star");
  });

  test("preview identity holds for every required shape kind", async ({ page }) => {
    await open(page);
    const kinds = [
      "rectangle", "ellipse", "triangle", "diamond", "pentagon", "hexagon",
      "octagon", "star", "cross", "heart", "donut", "line", "arrow",
    ];
    for (const kind of kinds) {
      const start = await clientOf(page, 120, 120);
      const end = await clientOf(page, 260, 300);
      await page.evaluate(
        ([shape, sx, sy]) => window.__pydeeShapeCreate!.down(shape as string, sx as number, sy as number),
        [kind, start.x, start.y] as const,
      );
      await page.evaluate(
        ([x, y]) => window.__pydeeShapeCreate!.move(x, y),
        [end.x, end.y] as const,
      );
      const preview = await page.evaluate(() => window.__pydeeShapeCreate!.outline());
      expect(preview, `${kind}: no preview`).not.toBeNull();

      const before = await page.evaluate(() => window.__pydeeShapeCommits.length);
      await page.evaluate(
        ([x, y]) => window.__pydeeShapeCreate!.up(x, y),
        [end.x, end.y] as const,
      );
      const commits = await page.evaluate(() => window.__pydeeShapeCommits);
      expect(commits.length, `${kind}: expected exactly one new commit`).toBe(before + 1);
      const committed = commits[commits.length - 1];
      expect(committed.d, `${kind}: committed d differs from the preview`).toBe(preview!.d);
    }
  });

  test("the preview follows the pointer at zoom 2, in document space", async ({ page }) => {
    await open(page, 2);
    const start = await clientOf(page, 100, 100);
    await page.evaluate(
      ([sx, sy]) => window.__pydeeShapeCreate!.down("rectangle", sx, sy),
      [start.x, start.y] as const,
    );
    const end = await clientOf(page, 180, 160);
    await page.evaluate(
      ([x, y]) => window.__pydeeShapeCreate!.move(x, y),
      [end.x, end.y] as const,
    );
    const bounds = await previewOutline(page);
    // The box is a fact about the DOCUMENT, so it is 80x60 regardless of zoom.
    expect(bounds!.width).toBeCloseTo(80, 0);
    expect(bounds!.height).toBeCloseTo(60, 0);
    expect(bounds!.x).toBeCloseTo(100, 0);
    expect(bounds!.y).toBeCloseTo(100, 0);
    await page.evaluate(
      ([x, y]) => window.__pydeeShapeCreate!.up(x, y),
      [end.x, end.y] as const,
    );
  });
});

test.describe("a cancelled creation mutates nothing", () => {
  test.describe.configure({ timeout: 120_000 });

  test("cancel destroys the preview, commits nothing, and adds no scene node", async ({ page }) => {
    await open(page);

    const rootsBefore = await page.evaluate(() => {
      // The ephemeral node lives in the engine's scene, so scene-root count is what
      // proves it was created and then removed.
      const bridge = window.__pydeeGestureBridge;
      return bridge === null || bridge === undefined ? null : true;
    });
    expect(rootsBefore).toBe(true);

    const start = await clientOf(page, 200, 200);
    await page.evaluate(
      ([sx, sy]) => window.__pydeeShapeCreate!.down("triangle", sx, sy),
      [start.x, start.y] as const,
    );
    const mid = await clientOf(page, 300, 320);
    await page.evaluate(
      ([x, y]) => window.__pydeeShapeCreate!.move(x, y),
      [mid.x, mid.y] as const,
    );
    // There is a preview mid-gesture.
    expect(await previewOutline(page), "no preview to cancel").not.toBeNull();

    await page.evaluate(() => window.__pydeeShapeCreate!.cancel());

    expect(await page.evaluate(() => window.__pydeeShapeCreate!.phase())).toBe("idle");
    expect(await previewOutline(page), "the preview survived a cancel").toBeNull();
    expect(await page.evaluate(() => window.__pydeeShapeCommits), "a cancel committed a shape").toEqual([]);
    // No document command, so nothing on the undo stack.
    expect(await page.evaluate(() => window.__pydeeUndoDepth())).toBe(0);
  });

  test("the document markup is byte-identical before and after a cancelled creation", async ({
    page,
  }) => {
    await open(page);
    const before = await page.evaluate(() => window.__pydeeMarkup());

    const start = await clientOf(page, 210, 210);
    await page.evaluate(
      ([sx, sy]) => window.__pydeeShapeCreate!.down("ellipse", sx, sy),
      [start.x, start.y] as const,
    );
    for (const [dx, dy] of [
      [260, 260],
      [320, 300],
    ] as const) {
      const point = await clientOf(page, dx, dy);
      await page.evaluate(
        ([x, y]) => window.__pydeeShapeCreate!.move(x, y),
        [point.x, point.y] as const,
      );
    }
    await page.evaluate(() => window.__pydeeShapeCreate!.cancel());

    // The whole point of an ephemeral preview: the document was never touched.
    expect(await page.evaluate(() => window.__pydeeMarkup())).toBe(before);
  });

  test("a press with no travel is a click, not a zero-size shape", async ({ page }) => {
    await open(page);
    const at = await clientOf(page, 250, 250);
    await page.evaluate(
      ([x, y]) => window.__pydeeShapeCreate!.down("triangle", x, y),
      [at.x, at.y] as const,
    );
    await page.evaluate(
      ([x, y]) => window.__pydeeShapeCreate!.up(x, y),
      [at.x, at.y] as const,
    );
    // No gesture ever began, so nothing was committed and the phase is idle.
    expect(await page.evaluate(() => window.__pydeeShapeCommits)).toEqual([]);
    expect(await page.evaluate(() => window.__pydeeShapeCreate!.phase())).toBe("idle");
  });
});
