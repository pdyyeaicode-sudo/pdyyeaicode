/**
 * Phase 8: the renderer must not influence the DOCUMENT.
 *
 * Every earlier parity spec compares positions on screen. This one compares the
 * thing that actually persists: the canonical SVG the commit produces. That is the
 * only artefact that is saved, exported, printed and reopened, so it is the only
 * place where a difference between the two renderers is permanent rather than
 * cosmetic.
 *
 * The invariant is stated as an equality between two independent runs:
 *
 *     the same screen gesture, on the same document, at the same zoom,
 *     produces byte-identical canonical SVG under either renderer.
 *
 * Byte-identical rather than approximately equal, deliberately. The two paths solve
 * the gesture with different arithmetic — C++ doubles in the engine, JavaScript in
 * `gestureSolve.ts` — and `engine-parity.mts` already pins them to 1e-9. Canonical
 * serialization snaps to a 0.001px authoring grid, which is four orders of magnitude
 * coarser than that. So if the markup ever differs it is not floating-point noise:
 * it is a genuine disagreement about what the gesture meant.
 *
 * The gesture is driven from the DOM `[data-handle]` elements, which exist on BOTH
 * paths (the engine path keeps them at `opacity: 0` so the canvas geometry owns the
 * hit test). Using one source for the screen coordinates is what makes this a test
 * of the SOLVE and the COMMIT rather than of handle placement — handle placement is
 * asserted separately, at the bottom of this file, against the engine's own chrome
 * geometry.
 *
 * Runs against the BUILT harness on 5200 for both renderers. The dev server cannot
 * serve the engine module, so a Skia run pointed at 5199 silently measures the SVG
 * path and reports a false pass.
 *
 * One responsibility per file: renderer-independence of the committed document.
 */

import { expect, test, type Page } from "@playwright/test";

const HARNESS = "http://localhost:5200/index.html";

type Renderer = "svg" | "skia";

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Outcome {
  readonly markup: string;
  readonly undoDepth: number;
  readonly translates: number;
  readonly resizes: number;
  readonly rotates: number;
}

/**
 * The layer GROUP, not its primitive: `serializeArtboard` writes `data-layer-id`
 * onto both, so an unscoped selector matches two nodes after a round-trip.
 */
const layerSelector = (layerId: string): string => `g[data-layer-id="${layerId}"]`;

async function open(
  page: Page,
  renderer: Renderer,
  layerId: string,
  zoom: number,
  artboard?: number,
): Promise<void> {
  const flag = renderer === "skia" ? "renderer=skia" : "editor=1";
  const size = artboard === undefined ? "" : `&artboard=${artboard}`;
  await page.goto(`${HARNESS}?${flag}&commit=1&zoom=${zoom}&select=${layerId}${size}`);
  await page.waitForSelector(layerSelector(layerId), { state: "attached" });

  if (renderer === "skia") {
    // Wait for a PRESENTED frame, not just for geometry: until then the editor keeps
    // the DOM as the visual surface and the DOM chrome as the pointer target, so a
    // gesture started in between is solved by the SVG path.
    await page.waitForFunction(
      (id) => {
        if (window.__pydeeEngineStatus !== "ready") {
          return false;
        }
        const bridge = window.__pydeeGestureBridge;
        if (bridge === null || bridge === undefined) {
          return false;
        }
        const geometry = bridge.chromeGeometry(id, 1);
        return geometry !== null && Number.isFinite(geometry.center.x);
      },
      layerId,
      { timeout: 20_000 },
    );
  }

  // Both paths draw the DOM handles; the engine path just keeps them invisible.
  await page.waitForSelector("[data-handle]");
  await page.waitForFunction(() => typeof window.__pydeeMarkup === "function");

  // A parity test that ran the SAME renderer twice would pass trivially, so the
  // renderer is asserted rather than assumed.
  expect(await page.evaluate(() => window.__pydeeRenderer)).toBe(renderer);
}

async function handleCentre(page: Page, handle: string): Promise<Point> {
  const box = await page.locator(`[data-handle="${handle}"]`).first().boundingBox();
  if (box === null) {
    throw new Error(`handle "${handle}" has no layout box`);
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The selection's centre, taken from its own handles rather than from a layer rect. */
async function selectionCentre(page: Page): Promise<Point> {
  const nw = await handleCentre(page, "nw");
  const se = await handleCentre(page, "se");
  return { x: (nw.x + se.x) / 2, y: (nw.y + se.y) / 2 };
}

async function readOutcome(page: Page): Promise<Outcome> {
  return page.evaluate(() => ({
    markup: window.__pydeeMarkup(),
    undoDepth: window.__pydeeUndoDepth(),
    translates: window.__pydeeCommits.length,
    resizes: window.__pydeeResizes.length,
    rotates: window.__pydeeRotates.length,
  }));
}

/** Drag from a point to a point through several samples, one frame apart. */
async function dragFrom(page: Page, from: Point, to: Point, samples = 6): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= samples; step += 1) {
    const fraction = step / samples;
    await page.mouse.move(from.x + (to.x - from.x) * fraction, from.y + (to.y - from.y) * fraction);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  }
  await page.mouse.up();
  // Let the commit round-trip through the document pipeline and re-render.
  await page.waitForTimeout(120);
}

/** Swing a point around a pivot, for a rotation drag. */
function swing(from: Point, pivot: Point, degrees: number): Point {
  const radius = Math.hypot(from.x - pivot.x, from.y - pivot.y);
  const angle = Math.atan2(from.y - pivot.y, from.x - pivot.x) + (degrees * Math.PI) / 180;
  return { x: pivot.x + Math.cos(angle) * radius, y: pivot.y + Math.sin(angle) * radius };
}

/**
 * The three gestures under test, each expressed as "where to press, where to go",
 * resolved against whichever page is open.
 *
 * Written as a table so both renderers provably receive the SAME instruction: a
 * hand-written pair of drags per renderer could differ by a pixel and the parity
 * assertion would be measuring that instead.
 */
const GESTURES = {
  async move(page: Page): Promise<void> {
    const centre = await selectionCentre(page);
    await dragFrom(page, centre, { x: centre.x + 47, y: centre.y + 23 });
  },
  async resize(page: Page): Promise<void> {
    const se = await handleCentre(page, "se");
    await dragFrom(page, se, { x: se.x + 34, y: se.y + 21 });
  },
  async rotate(page: Page): Promise<void> {
    const centre = await selectionCentre(page);
    const grip = await handleCentre(page, "rotate-ne");
    await dragFrom(page, grip, swing(grip, centre, 37));
  },
} as const;

type GestureName = keyof typeof GESTURES;

async function runGesture(
  page: Page,
  renderer: Renderer,
  gesture: GestureName,
  layerId: string,
  zoom: number,
): Promise<{ readonly before: string; readonly after: Outcome }> {
  await open(page, renderer, layerId, zoom);
  const before = await page.evaluate(() => window.__pydeeMarkup());
  await GESTURES[gesture](page);
  return { before, after: await readOutcome(page) };
}

test.describe("the committed document is the same under either renderer", () => {
  // Two page loads and an engine boot per case; the default 30s is not enough
  // under parallelism, and the work is real rather than accidental.
  test.describe.configure({ timeout: 120_000 });

  for (const gesture of ["move", "resize", "rotate"] as const) {
    test(`${gesture}: canonical SVG is byte-identical`, async ({ page }) => {
      const svg = await runGesture(page, "svg", gesture, "target", 1);
      const skia = await runGesture(page, "skia", gesture, "target", 1);

      // Both runs must have started from the same document, or the comparison
      // below would be measuring the fixture rather than the gesture.
      expect(skia.before, "the two renderers started from different markup").toBe(svg.before);

      // And the gesture must actually have changed something, or "identical"
      // would be satisfied by both renderers doing nothing.
      expect(svg.after.markup, `${gesture} committed nothing on the SVG path`).not.toBe(svg.before);
      expect(skia.after.markup, `${gesture} committed nothing on the engine path`).not.toBe(
        skia.before,
      );

      expect(skia.after.markup).toBe(svg.after.markup);
    });
  }

  test("a rotated, nested layer resizes to the same document under either renderer", async ({
    page,
  }) => {
    // `nested` sits inside `translate(40 30) scale(2)` and carries its own
    // `rotate(25 30 20)`. A resize there is where the two solvers have the most
    // room to disagree: the mapping has to be expressed in the node's local space
    // through a parent scale, and getting the space wrong is invisible on an
    // untransformed rect.
    const svg = await runGesture(page, "svg", "resize", "nested", 1);
    const skia = await runGesture(page, "skia", "resize", "nested", 1);

    expect(skia.before).toBe(svg.before);
    expect(svg.after.markup).not.toBe(svg.before);
    expect(skia.after.markup).toBe(svg.after.markup);
  });

  test("parity holds at zoom 2, where a zoom-factor error is no longer invisible", async ({
    page,
  }) => {
    const svg = await runGesture(page, "svg", "move", "target", 2);
    const skia = await runGesture(page, "skia", "move", "target", 2);

    expect(skia.before).toBe(svg.before);
    expect(svg.after.markup).not.toBe(svg.before);
    expect(skia.after.markup).toBe(svg.after.markup);
  });
});

test.describe("one gesture is one undoable step", () => {
  test.describe.configure({ timeout: 120_000 });

  for (const renderer of ["svg", "skia"] as const) {
    for (const gesture of ["move", "resize", "rotate"] as const) {
      test(`${renderer}/${gesture}: exactly one command, and undo restores the document`, async ({
        page,
      }) => {
        await open(page, renderer, "target", 1);

        /*
          The baseline is taken AFTER one gesture-and-undo, not from the fixture.

          The fixture markup has never been through `parseCanonicalSvg ->
          serializeArtboard`, and that round-trip is not the identity on hand-written
          input: it writes `<defs/>` for `<defs></defs>` and adds `data-layer-id` to a
          nested primitive that only carried `data-element-id`. Comparing against the
          raw fixture fails on those two cosmetic differences and says nothing about
          undo. One warm-up cycle puts the document in its serialized form, which is
          the form every subsequent save produces.
        */
        await GESTURES[gesture](page);
        await page.evaluate(() => window.__pydeeUndo());
        await page.waitForTimeout(80);
        const baseline = await readOutcome(page);
        expect(baseline.undoDepth, "the warm-up left a command on the stack").toBe(0);

        await GESTURES[gesture](page);
        const after = await readOutcome(page);

        // One command, not one per pointer sample. A per-sample commit would make
        // undo require six presses to reverse one drag, and would put six full
        // document round-trips inside the gesture.
        expect(after.undoDepth, `${renderer}/${gesture} pushed ${after.undoDepth} commands`).toBe(1);

        // And it was the RIGHT kind of command: a rotate that commits as a resize
        // would still be one step.
        const counter = { move: "translates", resize: "resizes", rotate: "rotates" } as const;
        expect(
          after[counter[gesture]] - baseline[counter[gesture]],
          `${renderer}/${gesture} reported the wrong commit kind`,
        ).toBe(1);
        expect(after.markup, `${renderer}/${gesture} committed nothing`).not.toBe(baseline.markup);

        const restored = await page.evaluate(() => {
          const undone = window.__pydeeUndo();
          return { undone, depth: window.__pydeeUndoDepth() };
        });
        expect(restored.undone).toBe(true);
        expect(restored.depth).toBe(0);

        // Byte-identical. An undo that merely moves the shape back to roughly the
        // right place leaves a transform attribute written, which changes the export.
        await expect.poll(() => page.evaluate(() => window.__pydeeMarkup())).toBe(baseline.markup);
      });
    }
  }
});

test.describe("a cancelled pointer does not abandon the gesture", () => {
  test.describe.configure({ timeout: 120_000 });

  /*
    Asserting the DELIBERATE behaviour, which is the opposite of the obvious one.

    Chromium fires `pointercancel` when the element holding the capture leaves the
    document, and React replaces the rendered markup routinely during a drag. Treating
    that as "the user gave up" killed every gesture after the first commit; treating it
    as "the user finished" committed a partial drag. So `useCanvasDrag.dragCancelled`
    keeps the gesture alive and lets the real `pointerup` finish it — move and up are
    on the window, so they arrive without the capture.

    The invariant is therefore: a cancel mid-drag changes nothing about the outcome.
    Exactly one command, and the same document as an uninterrupted drag.
  */
  for (const renderer of ["svg", "skia"] as const) {
    test(`${renderer}: a mid-drag pointercancel still commits exactly once`, async ({ page }) => {
      await open(page, renderer, "target", 1);

      const centre = await selectionCentre(page);
      const target = { x: centre.x + 47, y: centre.y + 23 };

      // First the same drag WITHOUT a cancel, to establish the expected document.
      await dragFrom(page, centre, target);
      const clean = await readOutcome(page);
      await page.evaluate(() => window.__pydeeUndo());
      await page.waitForTimeout(80);
      const baseline = await readOutcome(page);

      // Then the same drag, interrupted by a cancel halfway through.
      await page.mouse.move(centre.x, centre.y);
      await page.mouse.down();
      for (let step = 1; step <= 6; step += 1) {
        const fraction = step / 6;
        await page.mouse.move(
          centre.x + (target.x - centre.x) * fraction,
          centre.y + (target.y - centre.y) * fraction,
        );
        if (step === 3) {
          await page.evaluate(() => {
            window.dispatchEvent(
              new PointerEvent("pointercancel", {
                bubbles: true,
                pointerId: 1,
                pointerType: "mouse",
              }),
            );
          });
        }
        await page.evaluate(
          () => new Promise((resolve) => requestAnimationFrame(() => resolve(null))),
        );
      }
      await page.mouse.up();
      await page.waitForTimeout(150);

      const interrupted = await readOutcome(page);
      expect(
        interrupted.undoDepth - baseline.undoDepth,
        `${renderer}: an interrupted drag pushed `
          + `${interrupted.undoDepth - baseline.undoDepth} commands`,
      ).toBe(1);
      expect(
        interrupted.markup,
        `${renderer}: an interrupted drag committed a different document`,
      ).toBe(clean.markup);
    });
  }
});

test.describe("the engine's chrome geometry agrees with the DOM overlay's", () => {
  test.describe.configure({ timeout: 120_000 });

  /*
    This is the measurement behind the "who owns the screen position" question.

    The DOM overlay places its handles from `useSelectionGeometry`, which reads the
    SVG subtree. The canvas places them from `worldTransform x localCorner` inside the
    engine. Both are drawn over the same object, so they must land on the same client
    pixel — and if they do not, anything the editor still positions in the DOM (the
    inline text editor above all) is placed wrong on the engine path.

    Asserted at three zooms, because the two systems agree at zoom 1 by construction
    and can only diverge by a scale factor.
  */
  for (const zoom of [1, 2, 4]) {
    test(`zoom ${zoom}: every handle lands on the same client pixel`, async ({ page }) => {
      await open(page, "skia", "target", zoom);
      await expectChromeAgreement(page, zoom);
    });
  }

  test("an artboard LARGER than its host is not silently refitted", async ({ page }) => {
    /*
      The default document is 1080x1080 and the harness host is 1200x900, so an
      artboard bigger than the space it is shown in is the normal case, not an edge
      case. `.canvas :global(svg) { max-width: 100% }` used to shrink the design
      markup to fit — 1200/1350 = 0.888 — while the engine canvas kept its native
      size, so the DOM geometry and the engine geometry disagreed by that factor at
      zoom 1, before any zoom was applied.
    */
    await open(page, "skia", "target", 1, 1350);
    await expectChromeAgreement(page, 1);

    // And the SVG markup really is at native scale now, so `useSelectionGeometry`
    // and the engine are measuring the same thing rather than agreeing by luck.
    const renderedWidth = await page.evaluate(() => {
      const svg = document.querySelector(".svg-canvas-markup > svg");
      return svg === null ? null : svg.getBoundingClientRect().width;
    });
    expect(renderedWidth, "the design markup was refitted to its host").toBeCloseTo(1350, 0);
  });
});

/** Assert the engine's handle positions and the DOM overlay's coincide. */
async function expectChromeAgreement(page: Page, zoom: number): Promise<void> {
  const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
  const engine = await page.evaluate(
    ([names, z]) => {
      const bridge = window.__pydeeGestureBridge;
      if (bridge === null || bridge === undefined) {
        return null;
      }
      const geometry = bridge.chromeGeometry("target", z as number);
      if (geometry === null) {
        return null;
      }
      const out: Record<string, { x: number; y: number } | null> = {};
      for (const name of names as readonly string[]) {
        const point = geometry.handles[name];
        out[name] = point === undefined ? null : bridge.documentToClient(point.x, point.y);
      }
      return out;
    },
    [handles, zoom] as const,
  );
  expect(engine, "the engine reported no chrome geometry").not.toBeNull();

  for (const name of handles) {
    const enginePoint = engine![name];
    expect(enginePoint, `the engine reported no "${name}" handle`).not.toBeNull();
    const domPoint = await handleCentre(page, name);
    const distance = Math.hypot(enginePoint!.x - domPoint.x, enginePoint!.y - domPoint.y);
    expect(
      distance,
      `handle "${name}" at zoom ${zoom}: engine (${enginePoint!.x.toFixed(2)}, `
        + `${enginePoint!.y.toFixed(2)}) vs DOM (${domPoint.x.toFixed(2)}, `
        + `${domPoint.y.toFixed(2)}) — ${distance.toFixed(2)}px apart`,
    ).toBeLessThan(1.5);
  }
}
