/**
 * Selection alignment holds across the full transform matrix: zoom, pan, DPR,
 * rotation angle, and flip.
 *
 * `geometryAuthority.spec.ts` proves the outline lands on the ink and that the chrome
 * follows a flip. This file is the systematic sweep the task requires: every
 * combination of the viewport variables, checked against the ONE authority — the
 * engine's own `chromeGeometry` mapped to client pixels through `documentToClient` —
 * against where the DOM chrome actually renders.
 *
 * The invariant is the same everywhere: for a selected layer, every handle the overlay
 * draws sits on the point the engine says that handle is at, to within a pixel and a
 * half. If the two ever computed the transform differently — a `/zoom` shortcut instead
 * of the full inverse, a pan offset applied once too many or once too few, a DPR the
 * DOM measurement forgot — the two would diverge by exactly that error, and it would
 * grow with the variable that was mishandled. So the sweep is not busywork: each axis
 * rules out a specific class of coordinate-space bug.
 *
 * Runs against the BUILT harness on 5200; the engine module is not reachable from the
 * dev server.
 *
 * One responsibility per file: selection alignment across the viewport matrix.
 */

import { expect, test, type Page } from "@playwright/test";

const HARNESS = "http://localhost:5200/index.html";

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

interface Point {
  readonly x: number;
  readonly y: number;
}

async function ready(page: Page, layerId: string): Promise<void> {
  await page.waitForSelector(`g[data-layer-id="${layerId}"]`, { state: "attached" });
  await page.waitForFunction(
    (id) => {
      if (window.__pydeeEngineStatus !== "ready") {
        return false;
      }
      const bridge = window.__pydeeGestureBridge;
      const geometry = bridge?.chromeGeometry(id, 1);
      return geometry !== null && geometry !== undefined && Number.isFinite(geometry.center.x);
    },
    layerId,
    { timeout: 20_000 },
  );
  await page.waitForSelector("[data-handle]");
}

async function handleCentre(page: Page, handle: string): Promise<Point> {
  const box = await page.locator(`[data-handle="${handle}"]`).first().boundingBox();
  if (box === null) {
    throw new Error(`handle "${handle}" has no layout box`);
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * The worst distance, over all eight handles, between where the engine says the handle
 * is and where the DOM drew it. One number, so a sweep reports a magnitude rather than
 * a pass/fail per handle.
 *
 * `zoom` is passed to `chromeGeometry` because the rotation control's offset is a screen
 * length and the engine divides it by the zoom; the eight resize handles do not depend
 * on it, but passing the real zoom keeps the call honest.
 */
async function worstHandleGap(page: Page, layerId: string, zoom: number): Promise<number> {
  const engine = await page.evaluate(
    ([id, names, z]) => {
      const bridge = window.__pydeeGestureBridge;
      const geometry = bridge?.chromeGeometry(id as string, z as number);
      if (geometry === null || geometry === undefined) {
        return null;
      }
      const out: Record<string, { x: number; y: number } | null> = {};
      for (const name of names as readonly string[]) {
        const point = geometry.handles[name];
        out[name] = point === undefined ? null : bridge!.documentToClient(point.x, point.y);
      }
      return out;
    },
    [layerId, HANDLES, zoom] as const,
  );
  expect(engine, `no engine geometry for "${layerId}"`).not.toBeNull();

  let worst = 0;
  for (const name of HANDLES) {
    const enginePoint = engine![name];
    expect(enginePoint, `engine has no "${name}" handle for "${layerId}"`).not.toBeNull();
    const domPoint = await handleCentre(page, name);
    worst = Math.max(worst, Math.hypot(enginePoint!.x - domPoint.x, enginePoint!.y - domPoint.y));
  }
  return worst;
}

test.describe("alignment across zoom", () => {
  test.describe.configure({ timeout: 120_000 });

  for (const zoom of [0.25, 0.5, 1, 2, 4]) {
    test(`the plain target is aligned at zoom ${zoom}`, async ({ page }) => {
      await page.goto(`${HARNESS}?renderer=skia&zoom=${zoom}&select=target`);
      await ready(page, "target");
      const gap = await worstHandleGap(page, "target", zoom);
      console.log(`[align zoom=${zoom}] worst ${gap.toFixed(3)}px`);
      expect(gap, `worst handle gap at zoom ${zoom}`).toBeLessThan(1.5);
    });
  }
});

test.describe("alignment across pan", () => {
  test.describe.configure({ timeout: 120_000 });

  for (const pan of [
    { x: 0, y: 0 },
    { x: 120, y: 0 },
    { x: 0, y: -90 },
    { x: -160, y: 140 },
  ]) {
    test(`aligned after panning to (${pan.x}, ${pan.y})`, async ({ page }) => {
      await page.goto(`${HARNESS}?renderer=skia&zoom=2&select=target`);
      await ready(page, "target");
      // Pan in place, without reloading — the whole point is that the canvas survives a
      // pan and the chrome tracks it.
      await page.evaluate(
        ([px, py]) => window.__pydeeSetViewport(2, px, py),
        [pan.x, pan.y] as const,
      );
      // One frame for the CSS transform and the overlay effect to settle.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
      const gap = await worstHandleGap(page, "target", 2);
      console.log(`[align pan=(${pan.x},${pan.y})] worst ${gap.toFixed(3)}px`);
      expect(gap, `worst handle gap after pan (${pan.x}, ${pan.y})`).toBeLessThan(1.5);
    });
  }
});

test.describe("alignment across rotation angle", () => {
  test.describe.configure({ timeout: 120_000 });

  // 90 is the one a box-and-angle reduction is most likely to mishandle, and 15/45/135
  // catch a sign or an axis error that a right angle would hide.
  for (const angle of [15, 45, 90, 135]) {
    test(`a shape rotated ${angle} degrees is aligned`, async ({ page }) => {
      const layerId = `rot${angle}`;
      await page.goto(`${HARNESS}?renderer=skia&zoom=1&select=${layerId}`);
      await ready(page, layerId);
      const gap = await worstHandleGap(page, layerId, 1);
      console.log(`[align rotate=${angle}] worst ${gap.toFixed(3)}px`);
      expect(gap, `worst handle gap at ${angle} degrees`).toBeLessThan(1.5);
    });
  }
});

test.describe("alignment for a flipped shape", () => {
  test.describe.configure({ timeout: 120_000 });

  for (const zoom of [1, 2]) {
    test(`the mirrored shape is aligned at zoom ${zoom}`, async ({ page }) => {
      await page.goto(`${HARNESS}?renderer=skia&zoom=${zoom}&select=mirrored`);
      await ready(page, "mirrored");
      const gap = await worstHandleGap(page, "mirrored", zoom);
      console.log(`[align flip zoom=${zoom}] worst ${gap.toFixed(3)}px`);
      expect(gap, `worst handle gap for the flip at zoom ${zoom}`).toBeLessThan(1.5);
    });
  }
});

test.describe("alignment at device pixel ratios above 1", () => {
  test.describe.configure({ timeout: 120_000 });

  /*
    DPR is the axis a DOM measurement is most likely to forget, because
    `getBoundingClientRect` reports CSS pixels while the canvas backing store is in
    device pixels. `clientToDocument`/`documentToClient` use the backing-store-to-rect
    RATIO, which cancels the DPR out — so this proves the conversion does not
    accidentally reintroduce it.

    Each DPR runs in its own context via `test.use`; the config pins DPR 1 for every
    other spec so their `getBoundingClientRect` values stay stable.
  */
  for (const dpr of [1.25, 1.5, 2, 3]) {
    test.describe(`DPR ${dpr}`, () => {
      test.use({ deviceScaleFactor: dpr });

      test("a rotated shape is aligned", async ({ page }) => {
        await page.goto(`${HARNESS}?renderer=skia&zoom=2&select=rot45`);
        await ready(page, "rot45");
        const gap = await worstHandleGap(page, "rot45", 2);
        console.log(`[align dpr=${dpr}] worst ${gap.toFixed(3)}px`);
        expect(gap, `worst handle gap at DPR ${dpr}`).toBeLessThan(1.5);
      });
    });
  }
});

test.describe("the whole matrix at once", () => {
  test.describe.configure({ timeout: 120_000 });

  test.use({ deviceScaleFactor: 2 });

  test("nested + rotated + zoom 4 + pan + DPR 2 stays aligned", async ({ page }) => {
    // Every variable moved off its default at once, on the layer with the deepest
    // transform chain: `nested` sits inside translate+scale and carries its own
    // rotation. If any two conversions disagreed, this is where the errors would
    // compound rather than cancel.
    await page.goto(`${HARNESS}?renderer=skia&zoom=4&select=nested`);
    await ready(page, "nested");
    await page.evaluate(() => window.__pydeeSetViewport(4, -120, 80));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    const gap = await worstHandleGap(page, "nested", 4);
    console.log(`[align matrix] nested zoom=4 pan=(-120,80) dpr=2 worst ${gap.toFixed(3)}px`);
    expect(gap, "worst handle gap under the full matrix").toBeLessThan(1.5);
  });
});
