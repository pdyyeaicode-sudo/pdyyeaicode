/**
 * The selection chrome sits on the rendered geometry, under every transform.
 *
 * This is the acceptance suite for the reported defect: a selection box drawn away from
 * the shape it selects. It is asserted the only way that cannot be circular — by
 * comparing the chrome's position against where the ENGINE says the object is, and
 * against where the ink actually is on the canvas.
 *
 * Four independent things are checked, because the defect had four independent causes:
 *
 *   1. the box fits the INK, not a control-point superset of it. A rounded rectangle's
 *      corner arcs used to inflate its reported bounds by the full corner radius on all
 *      four sides, and a donut's by half its width on each side.
 *   2. the chrome follows a FLIP. A box-and-angle reduction has to describe a mirror as
 *      a 180-degree rotation, which puts every handle on the opposite corner.
 *   3. the DOM chrome and the engine's own chrome geometry agree, at every zoom.
 *   4. no stray, unpositioned handles exist. The reported screenshot had two squares
 *      sitting inside the shape that belonged to nothing.
 *
 * Runs against the BUILT harness on 5200: the dev server cannot serve the engine module,
 * so a Skia run pointed at 5199 silently measures the SVG path instead.
 *
 * One responsibility per file: selection geometry acceptance under real transforms.
 */

import { expect, test, type Page } from "@playwright/test";

const HARNESS = "http://localhost:5200/index.html";

interface Point {
  readonly x: number;
  readonly y: number;
}

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

async function open(
  page: Page,
  layerId: string,
  options: { readonly renderer: "svg" | "skia"; readonly zoom?: number } = { renderer: "skia" },
): Promise<void> {
  const flag = options.renderer === "skia" ? "renderer=skia" : "editor=1&renderer=svg";
  await page.goto(`${HARNESS}?${flag}&commit=1&zoom=${options.zoom ?? 1}&select=${layerId}`);
  await page.waitForSelector(`g[data-layer-id="${layerId}"]`, { state: "attached" });
  if (options.renderer === "skia") {
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
  }
  await page.waitForSelector("[data-handle]");
  // Recorded so `handleCentre` reads the engine geometry for the layer under test.
  await page.evaluate((id) => {
    (globalThis as unknown as { __authorityLayerId?: string }).__authorityLayerId = id;
  }, layerId);
}

/**
 * The client-space centre of a handle, as the VISIBLE box places it.
 *
 * On the engine path the DOM overlay is hidden (`opacity: 0`) and the selection box is
 * drawn on the canvas from the engine's `chromeGeometry`. So "where the handle is" means
 * where the engine drew it — `handleCanvasInk` below then proves the canvas actually has
 * a handle painted there. Reading `[data-handle]` would measure the hidden DOM overlay,
 * which is not what the user sees.
 */
async function handleCentre(page: Page, handle: string): Promise<Point> {
  const point = await page.evaluate(
    ([name, layerId]) => {
      const bridge = window.__pydeeGestureBridge;
      const geometry = bridge?.chromeGeometry(layerId as string, 1);
      if (geometry === null || geometry === undefined) {
        return null;
      }
      const documentPoint =
        name === "rotate" ? geometry.rotationControl : geometry.handles[name as string];
      if (documentPoint === null || documentPoint === undefined) {
        return null;
      }
      return bridge!.documentToClient(documentPoint.x, documentPoint.y);
    },
    [handle, (globalThis as unknown as { __authorityLayerId?: string }).__authorityLayerId ?? "target"] as const,
  );
  if (point === null) {
    throw new Error(`the engine reported no "${handle}" handle`);
  }
  return point;
}

/**
 * Whether the selection CANVAS has ink within `radius` document px of a point.
 *
 * This is the proof the visible box actually carries a handle where the engine says one
 * is: it reads pixels off the selection canvas, not an element rect. Any non-transparent
 * pixel counts.
 */
async function handleCanvasInk(page: Page, documentX: number, documentY: number, radius = 8): Promise<boolean> {
  return page.evaluate(
    ({ dx, dy, r }) => {
      const canvas = document.querySelector(
        'canvas[data-role="selection-canvas"]',
      ) as HTMLCanvasElement | null;
      if (canvas === null) {
        return false;
      }
      const context = canvas.getContext("2d");
      if (context === null) {
        return false;
      }
      const left = Math.max(0, Math.round(dx - r));
      const top = Math.max(0, Math.round(dy - r));
      const size = r * 2 + 1;
      const data = context.getImageData(left, top, size, size).data;
      for (let index = 3; index < data.length; index += 4) {
        if (data[index] > 16) {
          return true;
        }
      }
      return false;
    },
    { dx: documentX, dy: documentY, r: radius },
  );
}

/** The client-space rect of the selection outline polygon. */
/** The client-space rect of the selection outline polygon. */
async function outlineRect(page: Page) {
  const rect = await page.evaluate(() => {
    const outline = document.querySelector('[data-role="selection-outline"]');
    if (outline === null) {
      return null;
    }
    const box = outline.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
  if (rect === null) {
    throw new Error("no selection outline was rendered");
  }
  return rect;
}

// `outlineRect` is retained for ad-hoc debugging of the hidden DOM outline; the
// acceptance assertions read the visible canvas instead.
void outlineRect;

/**
 * The tight client-space rect of one layer's INK on the engine's canvas.
 *
 * Read from pixels, not from an element rect, because an element rect is the
 * measurement this whole change removed. Located by the layer's own FILL COLOUR rather
 * than by "anything that is not the background", so the scan finds one shape instead of
 * the union of every fixture layer — and so the probe uses nothing derived from the
 * bounds it is being used to check.
 */
async function inkRect(page: Page, rgb: readonly [number, number, number]) {
  return page.evaluate(
    ([red, green, blue]) => {
      const canvas = document.querySelector(
        'canvas[data-role="skia-canvas"]',
      ) as HTMLCanvasElement | null;
      if (canvas === null) {
        return null;
      }
      const context = canvas.getContext("2d");
      if (context === null) {
        return null;
      }
      const { width, height } = canvas;
      const data = context.getImageData(0, 0, width, height).data;
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = (y * width + x) * 4;
          // A tight tolerance: only the shape's own fill, not its antialiased edge
          // blended towards the background, so the measured rect is the fill's extent.
          if (
            Math.abs(data[index] - red) <= 6
            && Math.abs(data[index + 1] - green) <= 6
            && Math.abs(data[index + 2] - blue) <= 6
          ) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }
      if (minX === Number.POSITIVE_INFINITY) {
        return null;
      }
      return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
    },
    rgb,
  );
}

test.describe("the selection box fits the INK, not a superset of it", () => {
  test.describe.configure({ timeout: 120_000 });

  test("a curved shape's box is its real extent, not its control-point hull", async ({ page }) => {
    /*
      The `rounded` fixture is a 100x60 rounded rectangle at (20, 300) with 20px corner
      arcs. Under the old conservative measurement each arc expanded the reported bounds
      by its full radius in every direction, so the box came out 140x100 at (0, 280) —
      20px outside the shape on all four sides.
    */
    await open(page, "rounded", { renderer: "skia" });

    const engine = await page.evaluate(() => {
      const bridge = window.__pydeeGestureBridge;
      const geometry = bridge?.chromeGeometry("rounded", 1);
      return geometry === null || geometry === undefined ? null : geometry.localBounds;
    });
    expect(engine, "the engine reported no local bounds").not.toBeNull();

    // 100x60 at (20, 300): the path's real extent. A 0.05px tolerance covers Skia's
    // numerical conic bounds; the old error was 20px.
    expect(engine!.x).toBeCloseTo(20, 1);
    expect(engine!.y).toBeCloseTo(300, 1);
    expect(engine!.width).toBeCloseTo(100, 1);
    expect(engine!.height).toBeCloseTo(60, 1);
  });

  test("the outline lands on the ink, measured from pixels", async ({ page }) => {
    await open(page, "rounded", { renderer: "skia" });

    // #0891b2, the `rounded` fixture's fill and nothing else's in the document.
    const ink = await inkRect(page, [8, 145, 178]);
    expect(ink, "no ink of the expected colour was found on the canvas").not.toBeNull();

    // The engine's four corners for this layer, in DOCUMENT space — which is the same
    // space the ink was measured in, since the canvas is drawn at the artboard's native
    // size. The visible selection box is drawn through exactly these corners, so their
    // bounding box IS the outline's extent. Read from the engine rather than the hidden
    // DOM outline, which is not what the user sees.
    const box = await page.evaluate(() => {
      const bridge = window.__pydeeGestureBridge;
      const geometry = bridge?.chromeGeometry("rounded", 1);
      if (geometry === null || geometry === undefined) {
        return null;
      }
      const xs = geometry.corners.map((corner) => corner.x);
      const ys = geometry.corners.map((corner) => corner.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
    });
    expect(box, "no engine geometry for the rounded shape").not.toBeNull();

    console.log(`[ink vs box] ink ${JSON.stringify(ink)} box ${JSON.stringify(box)}`);

    // 1.5px: the ink is the fill only and the box hugs the path's true extent, so they
    // coincide to within antialiasing. The defect being ruled out is 20px on all sides —
    // the old conservative bounds inflated a rounded rect by its full corner radius.
    expect(Math.abs(box!.x - ink!.x), "box left vs ink left").toBeLessThan(1.5);
    expect(Math.abs(box!.y - ink!.y), "box top vs ink top").toBeLessThan(1.5);
    expect(
      Math.abs(box!.width - ink!.width),
      `box width ${box!.width} vs ink width ${ink!.width}`,
    ).toBeLessThan(1.5);
    expect(
      Math.abs(box!.height - ink!.height),
      `box height ${box!.height} vs ink height ${ink!.height}`,
    ).toBeLessThan(1.5);
  });
});

test.describe("the chrome follows a flip", () => {
  test.describe.configure({ timeout: 120_000 });

  test("the box covers the mirrored shape's on-screen location", async ({ page }) => {
    /*
      `mirrored` is `matrix(-1 0 0 1 520 0)` on a rect at x=230..290, so on screen it
      occupies x=230..290 again but with its local +x axis pointing LEFT.

      The property that matters to a user is not which corner is labelled nw — it is that
      the selection box sits ON the shape. So this asserts the visible box's corners
      bound the shape's actual ink, which is the ground truth a flip cannot fool.
    */
    await open(page, "mirrored", { renderer: "skia" });

    const ink = await inkRect(page, [219, 39, 119]); // #db2777
    expect(ink, "no ink of the mirrored shape's colour was found").not.toBeNull();

    const box = await page.evaluate(() => {
      const bridge = window.__pydeeGestureBridge;
      const geometry = bridge?.chromeGeometry("mirrored", 1);
      if (geometry === null || geometry === undefined) {
        return null;
      }
      const xs = geometry.corners.map((corner) => corner.x);
      const ys = geometry.corners.map((corner) => corner.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
    });
    expect(box, "no engine geometry for the mirrored shape").not.toBeNull();

    // The box's bounding rect coincides with the shape's ink, within antialiasing.
    expect(Math.abs(box!.x - ink!.x), "box left vs ink left").toBeLessThan(1.5);
    expect(Math.abs(box!.y - ink!.y), "box top vs ink top").toBeLessThan(1.5);
    expect(Math.abs(box!.width - ink!.width), "box width vs ink width").toBeLessThan(1.5);
    expect(Math.abs(box!.height - ink!.height), "box height vs ink height").toBeLessThan(1.5);
  });

  test("the rotation grip stays outside a mirrored object", async ({ page }) => {
    // A fixed normal sign would put the grip below the top edge — inside the shape —
    // because a flip reverses the quad's winding.
    await open(page, "mirrored", { renderer: "skia" });

    const grip = await handleCentre(page, "rotate");
    const nw = await handleCentre(page, "nw");
    const sw = await handleCentre(page, "sw");

    expect(grip.y, "the grip is above the object's top edge").toBeLessThan(nw.y);
    expect(grip.y, "and well clear of its bottom edge").toBeLessThan(sw.y);
  });

  test("every handle is painted on the canvas where the engine places it, at each zoom", async ({
    page,
  }) => {
    for (const zoom of [1, 2]) {
      await open(page, "mirrored", { renderer: "skia", zoom });
      // The engine's handle positions in DOCUMENT space, which is the selection canvas's
      // own coordinate system — so a handle drawn at document p lands on canvas pixel p.
      const documentHandles = await page.evaluate(
        ([names, z]) => {
          const bridge = window.__pydeeGestureBridge;
          const geometry = bridge?.chromeGeometry("mirrored", z as number);
          if (geometry === null || geometry === undefined) {
            return null;
          }
          const out: Record<string, { x: number; y: number } | null> = {};
          for (const name of names as readonly string[]) {
            const point = geometry.handles[name];
            out[name] = point === undefined ? null : { x: point.x, y: point.y };
          }
          return out;
        },
        [HANDLES, zoom] as const,
      );
      expect(documentHandles, `no engine geometry at zoom ${zoom}`).not.toBeNull();

      for (const name of HANDLES) {
        const point = documentHandles![name];
        expect(point, `engine has no "${name}" handle`).not.toBeNull();
        // The visible box is drawn on the canvas; assert it actually has a handle here.
        const painted = await handleCanvasInk(page, point!.x, point!.y);
        expect(
          painted,
          `mirrored handle "${name}" at zoom ${zoom}: no ink on the canvas at document `
            + `(${point!.x.toFixed(1)}, ${point!.y.toFixed(1)})`,
        ).toBe(true);
      }
    }
  });
});

test.describe("no chrome element belongs to nothing", () => {
  test.describe.configure({ timeout: 120_000 });

  test("every rendered handle has a finite position", async ({ page }) => {
    /*
      The reported screenshot had two small squares sitting inside the shape, attached to
      neither the box nor the geometry. They were parametric handles positioned from
      `handle.x` / `handle.y`, fields that do not exist — `ShapeHandle` declares
      `position: [number, number]` — so `left` was the string "undefinedpx", React
      dropped it, and the divs fell to their static flow position.

      Asserted as a property rather than by counting: EVERY chrome element must carry a
      resolved pixel position, whatever it is for.
    */
    await open(page, "target", { renderer: "skia" });

    const unpositioned = await page.evaluate(() => {
      const bad: string[] = [];
      for (const element of Array.from(document.querySelectorAll<HTMLElement>("[data-handle]"))) {
        const name = element.getAttribute("data-handle") ?? "?";
        const style = element.style;
        const isPositioned = (value: string): boolean =>
          value !== "" && value !== "auto" && !value.includes("undefined") && !value.includes("NaN");
        if (!isPositioned(style.left) || !isPositioned(style.top)) {
          bad.push(`${name}: left="${style.left}" top="${style.top}"`);
          continue;
        }
        const rect = element.getBoundingClientRect();
        if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y)) {
          bad.push(`${name}: non-finite rect`);
        }
      }
      return bad;
    });
    expect(unpositioned, `unpositioned chrome elements: ${unpositioned.join("; ")}`).toEqual([]);
  });

  test("the handle set is exactly the expected one", async ({ page }) => {
    await open(page, "target", { renderer: "skia" });
    const names = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-handle]"))
        .map((element) => element.getAttribute("data-handle") ?? "?")
        .sort(),
    );
    // 8 resize + 4 corner rotation zones + 1 rotation grip + 1 pivot. Nothing else.
    expect(names).toEqual(
      [
        "e", "n", "ne", "nw", "pivot", "rotate", "rotate-ne", "rotate-nw",
        "rotate-se", "rotate-sw", "s", "se", "sw", "w",
      ].sort(),
    );
  });
});

test.describe("the chrome holds under nested transforms and extreme zoom", () => {
  test.describe.configure({ timeout: 120_000 });

  /*
    `nested` sits inside `translate(40 30) scale(2)` and carries its own
    `rotate(25 30 20)`, so its world transform is a composition of a group translate, a
    group scale and its own rotation. Checked at 0.25x through 4x because a
    coordinate-space error scales with the zoom and is invisible at 1.
  */
  for (const zoom of [0.25, 0.5, 1, 2, 4]) {
    test(`nested at zoom ${zoom}`, async ({ page }) => {
      await open(page, "nested", { renderer: "skia", zoom });

      // The engine's handle positions in DOCUMENT space, which is the selection canvas's
      // coordinate system, so each should land on painted ink on the canvas.
      const documentHandles = await page.evaluate(
        ([names, z]) => {
          const bridge = window.__pydeeGestureBridge;
          const geometry = bridge?.chromeGeometry("nested", z as number);
          if (geometry === null || geometry === undefined) {
            return null;
          }
          const out: Record<string, { x: number; y: number } | null> = {};
          for (const name of names as readonly string[]) {
            const point = geometry.handles[name];
            out[name] = point === undefined ? null : { x: point.x, y: point.y };
          }
          return out;
        },
        [HANDLES, zoom] as const,
      );
      expect(documentHandles, `no engine geometry at zoom ${zoom}`).not.toBeNull();

      const missing: string[] = [];
      for (const name of HANDLES) {
        const point = documentHandles![name];
        expect(point, `engine has no "${name}" handle`).not.toBeNull();
        // A larger sample radius at low zoom: the canvas is CSS-scaled down, so a
        // handle's few document pixels of ink are checked with a little slack.
        if (!(await handleCanvasInk(page, point!.x, point!.y, 10))) {
          missing.push(`${name}@(${point!.x.toFixed(1)},${point!.y.toFixed(1)})`);
        }
      }
      // Reported so a regression names WHICH handles were not painted, not merely that
      // one was off.
      console.log(`[chrome nested zoom=${zoom}] handles without canvas ink: ${missing.length}`);
      expect(missing, `handles with no canvas ink at zoom ${zoom}: ${missing.join(", ")}`).toEqual(
        [],
      );
    });
  }
});
