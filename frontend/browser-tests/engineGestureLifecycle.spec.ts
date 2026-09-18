/**
 * Phase 4: resize and rotate solved by the C++ runtime, driven through the painted
 * chrome.
 *
 * Two things are asserted here that no earlier spec could:
 *
 * 1. **The gesture starts from where the handle was DRAWN.** With the chrome on a
 *    canvas there is no DOM element under the cursor, so the press is resolved by
 *    asking the engine what is at that point. A target that disagreed with the
 *    drawing would fail here, which is the whole risk of leaving the DOM.
 *
 * 2. **Rotation composes on the left, about a WORLD pivot.** The `offcentre` fixture
 *    layer is rotated about its own top-left CORNER, not its centre. For a layer whose
 *    existing rotation pivot IS its centre — which every other fixture layer happens
 *    to be — appending `rotate(δ pivotInParentSpace)` to its transform and prepending
 *    `P⁻¹·R(δ, worldPivot)·P` give the SAME matrix, so the editor's real rotation
 *    defect passed every test it had. On this layer they differ by roughly 15px at a
 *    45 degree drag, so the invariant "a rotation about the object's own centre cannot
 *    move that centre" finally discriminates.
 *
 * The rotate cases run on BOTH renderers. The engine solves the gesture in C++ and the
 * SVG path solves it in TypeScript, and both must satisfy the same invariant — which
 * is the browser-level counterpart of the 480-frame parity comparison in
 * engine-parity.mts.
 *
 * The measured error is reported in the failure message so a regression says how far
 * off it was, not merely that it was off.
 *
 * One responsibility per file: the gesture lifecycle through the real editor.
 */

import { expect, test, type Page } from "@playwright/test";

/**
 * The BUILT harness on 5200, not the dev server.
 *
 * Vite's dev server refuses to serve `/engine/pydee-engine.mjs` through import
 * analysis ("this file is in /public"), so a Skia test pointed at 5199 silently
 * measures the SVG renderer instead — a false pass that looks like a real one.
 */
const HARNESS = "http://localhost:5200/index.html";

interface Point {
  readonly x: number;
  readonly y: number;
}

const layerSelector = (layerId: string): string => `g[data-layer-id="${layerId}"]`;

async function open(
  page: Page,
  layerId: string,
  options: { readonly renderer: "svg" | "skia"; readonly zoom?: number },
): Promise<void> {
  const renderer = options.renderer === "skia" ? "renderer=skia" : "editor=1";
  await page.goto(`${HARNESS}?${renderer}&commit=1&zoom=${options.zoom ?? 1}&select=${layerId}`);
  await page.waitForSelector(layerSelector(layerId), { state: "attached" });

  if (options.renderer === "skia") {
    // Two conditions. `chromeGeometry` answers as soon as the scene is uploaded, but the
    // editor keeps the DOM chrome as the pointer target until the engine reports a
    // PRESENTED frame — so a press in between is routed through the DOM handles and this
    // suite would silently measure the SVG path. Waiting for the readout's string alone
    // is no good either: it starts as "loading" and races the upload.
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
      { timeout: 15000 },
    );
  } else {
    await page.waitForSelector("[data-handle]");
  }
}

/** Screen-space centre of a layer's rendered group. */
async function layerCentre(page: Page, layerId: string): Promise<Point> {
  const box = await page.locator(layerSelector(layerId)).first().boundingBox();
  if (box === null) {
    throw new Error(`layer "${layerId}" has no layout box`);
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function layerBox(page: Page, layerId: string) {
  const box = await page.locator(layerSelector(layerId)).first().boundingBox();
  if (box === null) {
    throw new Error(`layer "${layerId}" has no layout box`);
  }
  return box;
}

/**
 * Where the engine says a piece of chrome is, in CLIENT coordinates.
 *
 * Read from the engine rather than from a DOM element, because on this path the
 * engine's answer is the only one there is — and the pixels were drawn from it.
 */
async function chromePoint(
  page: Page,
  layerId: string,
  which: "rotation" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w",
  zoom: number,
): Promise<Point> {
  const point = await page.evaluate(
    ([id, key, z]) => {
      const bridge = window.__pydeeGestureBridge;
      if (bridge === null || bridge === undefined) {
        return null;
      }
      const geometry = bridge.chromeGeometry(id as string, z as number);
      if (geometry === null) {
        return null;
      }
      const documentPoint = key === "rotation"
        ? geometry.rotationControl
        : geometry.handles[key as string];
      if (documentPoint === null || documentPoint === undefined) {
        return null;
      }
      return bridge.documentToClient(documentPoint.x, documentPoint.y);
    },
    [layerId, which, zoom] as const,
  );
  if (point === null) {
    throw new Error(`the engine reported no "${which}" chrome for layer "${layerId}"`);
  }
  return point;
}

/** Drag from a point through several samples, then release. */
async function dragFrom(page: Page, from: Point, to: Point, samples = 6): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= samples; step += 1) {
    const fraction = step / samples;
    await page.mouse.move(
      from.x + (to.x - from.x) * fraction,
      from.y + (to.y - from.y) * fraction,
    );
    // One animation frame between samples, so the frame-driven writes actually run
    // rather than all coalescing into a single frame at the end.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  }
  await page.mouse.up();
  await page.waitForTimeout(80);
}

/** Swing a point around `pivot` by `degrees`. */
function swing(from: Point, pivot: Point, degrees: number): Point {
  const radius = Math.hypot(from.x - pivot.x, from.y - pivot.y);
  const start = Math.atan2(from.y - pivot.y, from.x - pivot.x);
  const angle = start + (degrees * Math.PI) / 180;
  return {
    x: pivot.x + Math.cos(angle) * radius,
    y: pivot.y + Math.sin(angle) * radius,
  };
}

test.describe("the engine's own handle regions start the gesture", () => {
  test("a press where a handle is DRAWN reports that handle, and nothing else does", async ({
    page,
  }) => {
    await open(page, "target", { renderer: "skia" });

    const probes = await page.evaluate(() => {
      const bridge = window.__pydeeGestureBridge;
      if (bridge === null || bridge === undefined) {
        return null;
      }
      const geometry = bridge.chromeGeometry("target", 1);
      if (geometry === null) {
        return null;
      }
      const at = (point: { x: number; y: number }) => {
        const client = bridge.documentToClient(point.x, point.y);
        return client === null ? null : bridge.handleAt("target", client.x, client.y, 1);
      };
      const centreClient = bridge.documentToClient(geometry.center.x, geometry.center.y);
      return {
        handles: Object.fromEntries(
          Object.entries(geometry.handles).map(([name, point]) => [name, at(point)]),
        ),
        rotation: geometry.rotationControl === null ? null : at(geometry.rotationControl),
        body: at(geometry.center),
        far: centreClient === null
          ? null
          : bridge.handleAt("target", centreClient.x + 400, centreClient.y + 400, 1),
      };
    });

    expect(probes).not.toBeNull();
    if (probes === null) return;

    for (const name of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
      expect(probes.handles[name], `handle "${name}"`).toEqual({
        region: "resize",
        handle: name,
      });
    }
    expect(probes.rotation?.region).toBe("rotate");
    expect(probes.body?.region).toBe("body");
    expect(probes.far?.region).toBe("none");
  });

  test("the DOM handles are no longer the pointer target on the engine path", async ({ page }) => {
    await open(page, "target", { renderer: "skia" });

    // Still in the DOM — the marquee and the text-editing affordances live in the same
    // subtree — but not interactive, so one press cannot start two gestures.
    const chrome = page.locator('[data-role="selection-overlay"]');
    await expect(chrome).toHaveAttribute("data-chrome-hidden", "true");
    const styles = await chrome.evaluate((node) => {
      const computed = window.getComputedStyle(node);
      return { opacity: computed.opacity, pointerEvents: computed.pointerEvents };
    });
    expect(styles.opacity).toBe("0");
    expect(styles.pointerEvents).toBe("none");
  });

  test("dragging the engine's south-east handle resizes the shape and commits it", async ({
    page,
  }) => {
    await open(page, "target", { renderer: "skia" });
    const before = await layerBox(page, "target");

    const grab = await chromePoint(page, "target", "se", 1);
    await dragFrom(page, grab, { x: grab.x + 40, y: grab.y + 30 });

    const commits = await page.evaluate(() => window.__pydeeResizes);
    expect(commits.length, "the resize reached the document").toBe(1);
    expect((commits[0].next as { kind: string }).kind).toBe("geometry");

    const after = await layerBox(page, "target");
    expect(after.width - before.width).toBeCloseTo(40, 0);
    expect(after.height - before.height).toBeCloseTo(30, 0);
  });

  test("a press in empty space does not start a gesture", async ({ page }) => {
    await open(page, "target", { renderer: "skia" });
    const centre = await layerCentre(page, "target");

    await dragFrom(page, { x: centre.x + 300, y: centre.y + 250 }, { x: centre.x + 340, y: centre.y + 280 });

    expect(await page.evaluate(() => window.__pydeeResizes.length)).toBe(0);
    expect(await page.evaluate(() => window.__pydeeRotates.length)).toBe(0);
  });
});

test.describe("rotation is composed about a world pivot, on both renderers", () => {
  for (const renderer of ["svg", "skia"] as const) {
    test(`${renderer}: a layer rotated about its own CORNER keeps its centre`, async ({ page }) => {
      await open(page, "offcentre", { renderer });
      const centreBefore = await layerCentre(page, "offcentre");
      const boxBefore = await layerBox(page, "offcentre");

      // Grab the rotation control from whichever authority this renderer has: the
      // engine's geometry, or the DOM zone the SVG chrome draws.
      const grab = renderer === "skia"
        ? await chromePoint(page, "offcentre", "rotation", 1)
        : await (async () => {
            const box = await page.locator('[data-handle="rotate-nw"]').first().boundingBox();
            if (box === null) throw new Error("no rotate-nw zone");
            return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
          })();

      await dragFrom(page, grab, swing(grab, centreBefore, 45), 8);

      const commits = await page.evaluate(() => window.__pydeeRotates);
      expect(commits.length, `${renderer}: no rotation was committed`).toBe(1);

      const centreAfter = await layerCentre(page, "offcentre");
      const error = Math.hypot(centreAfter.x - centreBefore.x, centreAfter.y - centreBefore.y);
      // THE DISCRIMINATING ASSERTION. The formulation this replaces moves this
      // layer's centre by about 15px at 45 degrees, because its existing rotation
      // pivot is its top-left corner rather than its centre. 4px covers the
      // half-pixel snapping in the rendered box, not a composition error.
      expect(
        error,
        `${renderer}: the centre moved ${error.toFixed(2)}px; the old left/right `
          + "composition mix-up moves it about 15px",
      ).toBeLessThan(4);

      // And it really turned: a 45 degree rotation grows the axis-aligned box.
      const boxAfter = await layerBox(page, "offcentre");
      expect(boxAfter.height, `${renderer}: the shape did not turn`).toBeGreaterThan(
        boxBefore.height + 5,
      );
    });
  }

  test("a rotation commits as one matrix, so repeated rotations cannot accumulate text", async ({
    page,
  }) => {
    await open(page, "offcentre", { renderer: "skia" });
    const centre = await layerCentre(page, "offcentre");

    for (const degrees of [30, 30]) {
      const grab = await chromePoint(page, "offcentre", "rotation", 1);
      await dragFrom(page, grab, swing(grab, centre, degrees), 6);
    }

    const commits = await page.evaluate(() => window.__pydeeRotates);
    expect(commits.length).toBe(2);
    for (const commit of commits) {
      const next = commit.next as { kind: string; transform?: string };
      expect(next.kind).toBe("transform");
      // A matrix, not a growing list of rotate() calls. The string surgery that used
      // to fold those is gone along with the string form.
      expect(next.transform ?? "").toMatch(/^matrix\(/);
      expect(next.transform ?? "").not.toContain("rotate(");
    }

    // Two 30 degree turns about the same centre is a 60 degree turn about it.
    const after = await layerCentre(page, "offcentre");
    expect(Math.hypot(after.x - centre.x, after.y - centre.y)).toBeLessThan(5);
  });
});

test.describe("the gesture is cancellable and does not leak", () => {
  test("a cancelled rotate commits nothing and leaves the shape where it was", async ({ page }) => {
    await open(page, "offcentre", { renderer: "skia" });
    const boxBefore = await layerBox(page, "offcentre");

    const grab = await chromePoint(page, "offcentre", "rotation", 1);
    const centre = await layerCentre(page, "offcentre");
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    const swung = swing(grab, centre, 40);
    await page.mouse.move(swung.x, swung.y);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));

    // A real pointercancel, which the browser emits for reasons that have nothing to
    // do with intent. Committing there would edit the document by accident.
    await page.evaluate(() => {
      window.dispatchEvent(
        new PointerEvent("pointercancel", { pointerId: 1, bubbles: true, cancelable: true }),
      );
    });
    await page.mouse.up();
    await page.waitForTimeout(80);

    expect(await page.evaluate(() => window.__pydeeRotates.length)).toBe(0);
    const boxAfter = await layerBox(page, "offcentre");
    expect(Math.abs(boxAfter.x - boxBefore.x)).toBeLessThan(1.5);
    expect(Math.abs(boxAfter.y - boxBefore.y)).toBeLessThan(1.5);
    expect(Math.abs(boxAfter.width - boxBefore.width)).toBeLessThan(1.5);
  });

  test("the engine holds no gesture after a completed drag", async ({ page }) => {
    await open(page, "target", { renderer: "skia" });
    const grab = await chromePoint(page, "target", "e", 1);
    await dragFrom(page, grab, { x: grab.x + 25, y: grab.y });

    // A leaked snapshot would make the NEXT press solve from stale geometry, which is
    // the class of defect `dragAfterCommit` exists for.
    const second = await chromePoint(page, "target", "e", 1);
    await dragFrom(page, second, { x: second.x + 25, y: second.y });
    expect(await page.evaluate(() => window.__pydeeResizes.length)).toBe(2);

    const box = await layerBox(page, "target");
    // 80px wide originally, plus two 25px drags.
    expect(box.width).toBeCloseTo(130, 0);
  });

  test("a second gesture in quick succession commits against the CURRENT document", async ({
    page,
  }) => {
    // The defect this closes was a stale closure, found by measurement rather than by
    // reading: the window pointer listeners were installed by a callback memoized with
    // no dependencies, so `pointerup` ran the FIRST render's commit — and that closure
    // read the document as it was before any edit. A second 25px drag then computed its
    // bounds ratio (105 -> 130) against the ORIGINAL 80-wide geometry and committed a
    // SHRINK to 99.05px.
    //
    // Two drags with no settling wait between them is what makes it reachable.
    await open(page, "target", { renderer: "skia" });

    const first = await chromePoint(page, "target", "e", 1);
    await dragFrom(page, first, { x: first.x + 25, y: first.y }, 4);

    const second = await chromePoint(page, "target", "e", 1);
    await page.mouse.move(second.x, second.y);
    await page.mouse.down();
    await page.mouse.move(second.x + 25, second.y);
    await page.mouse.up();
    await page.waitForTimeout(300);

    const box = await layerBox(page, "target");
    expect(
      box.width,
      `two 25px drags on an 80px shape should give 130px, got ${box.width.toFixed(2)}`,
    ).toBeCloseTo(130, 0);
  });
});

declare global {
  interface Window {
    __pydeeResizes: Array<{ layerId: string; prev: unknown; next: unknown }>;
    __pydeeRotates: Array<{ layerId: string; prev: unknown; next: unknown }>;
    __pydeeGestureBridge?: {
      chromeGeometry(
        layerId: string,
        zoom: number,
      ): {
        corners: Array<{ x: number; y: number }>;
        center: { x: number; y: number };
        angle: number;
        handles: Record<string, { x: number; y: number }>;
        rotationControl: { x: number; y: number } | null;
      } | null;
      documentToClient(x: number, y: number): { x: number; y: number } | null;
      handleAt(
        layerId: string,
        clientX: number,
        clientY: number,
        zoom: number,
      ): { region: string; handle: string } | null;
    } | null;
  }
}
