/**
 * Micro-movement fidelity: does the object follow deliberate sub-pixel pointer motion?
 *
 * Frame rate says nothing about this. A renderer can hold 60fps while quantising every
 * position to whole pixels, waiting for a large delta before it reacts, or dropping
 * samples — and all three feel like the object is stuck. This file measures the property
 * directly.
 *
 * ## The acceptance criteria, stated as measurements
 *
 * 1. **Minimum detectable post-gesture movement.** After the gesture has started, the
 *    smallest increment driven here (0.25 screen px) must change the object's transform.
 *    Every increment, every time — not on average.
 * 2. **Fidelity.** The object's screen displacement must equal the pointer's screen
 *    displacement, at every zoom, for rotated objects and for objects inside scaled
 *    groups.
 * 3. **No dropped or intermediate states.** The transform after each sample must be the
 *    one that sample implies, not a lagging or averaged value.
 *
 * ## What is observed, and why
 *
 * The object's position is read from the ENGINE's world transform for the node — the
 * matrix Skia is handed to draw with. At a quarter of a pixel, pixel probing cannot
 * distinguish movement from antialiasing, so a pixel assertion would either be
 * insensitive or measure the rasteriser rather than the transform. The transform is the
 * authoritative "where the object is": the same matrix produces the pixels, so a
 * transform that advanced by 0.25px IS a render at 0.25px further on.
 *
 * That claim is then tied to real pixels: `pixelsFollowTheTransform` drives an
 * accumulation of sub-pixel steps until it sums to a resolvable distance and asserts the
 * painted shape actually moved. So the sub-pixel work is verified through the transform,
 * and the transform is verified against the pixels.
 *
 * ## Tolerance, and where it comes from
 *
 * `TOLERANCE_PX = 0.01` document pixels. The path from `clientX` to the world transform
 * is a subtraction, a matrix inverse and a multiply, all in IEEE doubles, so the only
 * error is floating-point rounding at ~1e-13. A hundredth of a pixel is four orders of
 * magnitude above that and eight times SMALLER than the smallest increment driven, so a
 * quantiser at any scale that matters — a whole pixel, a half, even a tenth — fails.
 *
 * Snapping is deliberately OFF (`?snap=` absent). Alignment snapping legitimately pulls
 * an object off the pointer, and it is the one feature that is allowed to; measuring
 * fidelity with it on would measure snapping.
 *
 * One responsibility per file: sub-pixel fidelity of an active transform gesture.
 */

import { expect, test, type Page } from "@playwright/test";

/** The BUILT harness. Vite's dev server will not serve the engine module. */
const HARNESS = "http://localhost:5200/index.html";

/**
 * Document pixels. See the file header: the path is pure double arithmetic, so this is
 * four orders of magnitude above the floating-point floor and eight times below the
 * smallest increment driven.
 */
const TOLERANCE_PX = 0.01;

/** Increments in SCREEN pixels, from far below one pixel up to one. */
const INCREMENTS = [0.25, 0.5, 1] as const;

interface StepResult {
  readonly increment: number;
  /** The object's world-space displacement after each sample. */
  readonly observed: readonly number[];
  /** What each sample implied, in document pixels. */
  readonly expected: readonly number[];
  readonly maxErrorPx: number;
  /** Samples after which the transform did not change at all. */
  readonly deadSamples: number;
  readonly pointerType: string;
}

async function ready(page: Page, layerId: string, zoom: number): Promise<void> {
  await page.goto(`${HARNESS}?renderer=skia&zoom=${zoom}&select=${layerId}`);
  await page.waitForSelector(`g[data-layer-id="${layerId}"]`, { state: "attached" });
  /*
    Two conditions, because "the engine can answer geometry questions" and "the engine
    is the surface" are different facts and there is a real window between them.

    `chromeGeometry` responds as soon as the scene is uploaded. The editor keeps the DOM
    as the visual surface, and the DOM chrome as the pointer target, until the engine
    reports a PRESENTED frame. A gesture started in between is handled by the SVG path,
    so this suite would measure the wrong renderer and report zero movement from the
    engine — which is exactly how it failed when the renderer default flipped.
  */
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
    { timeout: 15000 },
  );
}

/**
 * Drag `layerId` in `increment`-sized screen steps and report where it went.
 *
 * The gesture is started with one movement past the drag threshold, and only the steps
 * AFTER that are measured — the threshold decides when a gesture begins and is not part
 * of transform precision.
 */
async function stepDrag(
  page: Page,
  layerId: string,
  increment: number,
  zoom: number,
  pointerType: "mouse" | "pen",
): Promise<StepResult> {
  return page.evaluate(
    async ([id, step, scale, kind]) => {
      const layer = document.querySelector(`g[data-layer-id="${id}"]`);
      const markup = document.querySelector(".svg-canvas-markup");
      const bridge = window.__pydeeGestureBridge;
      if (layer === null || markup === null || bridge === null || bridge === undefined) {
        throw new Error("harness is not ready");
      }
      const container = markup.closest("div") ?? markup;

      const box = layer.getBoundingClientRect();
      const startX = box.left + box.width / 2;
      const startY = box.top + box.height / 2;

      const send = (type: string, x: number, y: number, target: EventTarget): void => {
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: kind === "pen" ? 7 : 1,
            pointerType: kind as string,
            // FRACTIONAL on purpose. `clientX` is a double, and a pen or a precision
            // trackpad genuinely produces values like this.
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
            buttons: 1,
            isPrimary: true,
          }),
        );
      };

      const nextFrame = (): Promise<void> =>
        new Promise((resolve) => requestAnimationFrame(() => resolve()));

      /** The object's world centre, from the matrix the engine renders with. */
      const centre = (): { x: number; y: number } => {
        const geometry = bridge.chromeGeometry(id as string, scale as number);
        if (geometry === null) {
          throw new Error("no geometry for the selected layer");
        }
        return geometry.center;
      };

      send("pointerdown", startX, startY, layer);

      // Cross the gesture-start threshold. This movement is NOT measured: the threshold
      // exists to distinguish a click from a drag, and it is allowed to consume travel.
      // 6 screen px clears the 1px precise-pointer threshold with margin.
      send("pointermove", startX + 6, startY, container);
      await nextFrame();

      const origin = centre();
      let pointerX = startX + 6;
      const observed: number[] = [];
      const expected: number[] = [];
      let deadSamples = 0;
      let previous = origin.x;

      for (let index = 1; index <= 12; index += 1) {
        pointerX += step as number;
        send("pointermove", pointerX, startY, container);
        // One frame, because the retained-state store publishes once per frame. Waiting
        // longer would hide a dropped sample; not waiting at all would read the state
        // before it was applied.
        await nextFrame();

        const now = centre().x;
        observed.push(now - origin.x);
        // A screen displacement is a document displacement divided by the zoom. This is
        // the whole reason sub-pixel input matters: at 4x, one screen pixel is a quarter
        // of a document pixel.
        expected.push(((step as number) * index) / (scale as number));
        if (now === previous) {
          deadSamples += 1;
        }
        previous = now;
      }

      send("pointerup", pointerX, startY, container);

      let maxErrorPx = 0;
      for (let index = 0; index < observed.length; index += 1) {
        maxErrorPx = Math.max(maxErrorPx, Math.abs(observed[index] - expected[index]));
      }

      return {
        increment: step as number,
        observed,
        expected,
        maxErrorPx: Math.round(maxErrorPx * 1e6) / 1e6,
        deadSamples,
        pointerType: kind as string,
      };
    },
    [layerId, increment, zoom, pointerType] as const,
  );
}

test.describe("an active gesture follows sub-pixel pointer motion", () => {
  for (const zoom of [1, 2, 4]) {
    for (const increment of INCREMENTS) {
      test(`zoom ${zoom}, ${increment}px steps: every sample moves the object`, async ({
        page,
      }) => {
        await ready(page, "target", zoom);
        const result = await stepDrag(page, "target", increment, zoom, "mouse");
        console.log(`[subpixel zoom=${zoom} step=${increment}] ${JSON.stringify(result)}`);

        // 1. NO DEAD ZONE. Every sample after gesture start changed the transform.
        expect(
          result.deadSamples,
          `${result.deadSamples} of ${result.observed.length} samples left the object `
            + `exactly where it was, at ${increment}px steps`,
        ).toBe(0);

        // 2. FIDELITY. The displacement is what the pointer asked for, not a rounded or
        //    lagging version of it.
        expect(
          result.maxErrorPx,
          `worst deviation ${result.maxErrorPx}px over ${result.observed.length} samples; `
            + `observed ${JSON.stringify(result.observed)} expected `
            + `${JSON.stringify(result.expected)}`,
        ).toBeLessThan(TOLERANCE_PX);

        // 3. MONOTONIC. A quantiser shows up as a staircase — several samples sharing a
        //    value and then a jump — which the two assertions above already exclude, but
        //    a strictly increasing series states the intent directly.
        for (let index = 1; index < result.observed.length; index += 1) {
          expect(
            result.observed[index],
            `sample ${index} did not advance past sample ${index - 1}`,
          ).toBeGreaterThan(result.observed[index - 1]);
        }
      });
    }
  }
});

test.describe("sub-pixel fidelity survives the transform chain", () => {
  /*
    `rotated` carries its own rotation, `nested` sits inside `translate(40 30) scale(2)`
    and also rotates. Both are cases where a delta has to be converted rather than merely
    copied: the ancestor scale multiplies it and the rotation redirects it. A conversion
    that quantised anywhere would show up here even if the flat case looked fine.
  */
  for (const layerId of ["rotated", "nested", "offcentre"] as const) {
    for (const zoom of [1, 4]) {
      test(`${layerId} at zoom ${zoom}: 0.25px steps still land exactly`, async ({ page }) => {
        await ready(page, layerId, zoom);
        const result = await stepDrag(page, layerId, 0.25, zoom, "mouse");
        console.log(`[subpixel ${layerId} zoom=${zoom}] ${JSON.stringify(result)}`);

        expect(result.deadSamples, `${result.deadSamples} samples were swallowed`).toBe(0);
        expect(
          result.maxErrorPx,
          `worst deviation ${result.maxErrorPx}px; a rotated or scaled ancestor must not `
            + "change the distance travelled, only the direction it is written in",
        ).toBeLessThan(TOLERANCE_PX);
      });
    }
  }
});

test.describe("input devices", () => {
  /*
    A pen is the device that actually produces fractional coordinates on real hardware,
    and it takes the same code path with a different `pointerType` — which matters because
    the gesture-start threshold is chosen by pointer type. Touch is deliberately not
    covered here: its 4px threshold exists to absorb finger wobble, so a 0.25px step
    would never start a gesture, and asserting otherwise would be asserting that the
    threshold is broken.
  */
  for (const pointerType of ["mouse", "pen"] as const) {
    test(`${pointerType}: 0.5px steps are applied at full precision`, async ({ page }) => {
      await ready(page, "target", 2);
      const result = await stepDrag(page, "target", 0.5, 2, pointerType);
      console.log(`[subpixel device=${pointerType}] ${JSON.stringify(result)}`);

      expect(result.deadSamples, `${pointerType}: ${result.deadSamples} samples swallowed`).toBe(
        0,
      );
      expect(result.maxErrorPx, `${pointerType}: worst deviation ${result.maxErrorPx}px`)
        .toBeLessThan(TOLERANCE_PX);
    });
  }
});

test("pixels follow the transform, so the sub-pixel path is not merely bookkeeping", async ({
  page,
}) => {
  /*
    The tests above assert on the engine's world transform, because a quarter of a pixel
    cannot be distinguished from antialiasing in a pixel probe. This one closes the loop:
    it accumulates 0.25px steps until they sum to a distance a rasteriser can resolve and
    checks the PAINTED shape actually moved by it. If the transform were advancing while
    the render ignored it, this fails and the others would not.
  */
  await ready(page, "target", 1);

  const moved = await page.evaluate(async () => {
    const layer = document.querySelector('g[data-layer-id="target"]');
    const markup = document.querySelector(".svg-canvas-markup");
    const canvas = document.querySelector<HTMLCanvasElement>('[data-role="skia-canvas"]');
    if (layer === null || markup === null || canvas === null) {
      throw new Error("harness is not ready");
    }
    // No attributes: `getContext("2d", …)` returns null when a context already exists
    // with different ones, and the renderer created this one with the defaults.
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("no 2d context");
    }
    const container = markup.closest("div") ?? markup;

    const box = layer.getBoundingClientRect();
    const startX = box.left + box.width / 2;
    const startY = box.top + box.height / 2;
    const send = (type: string, x: number, y: number, target: EventTarget): void => {
      target.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType: "mouse",
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
          buttons: 1,
        }),
      );
    };
    const nextFrame = (): Promise<void> =>
      new Promise((resolve) => requestAnimationFrame(() => resolve()));

    /** The shape's right edge on one scanline, to the nearest pixel. */
    const rightEdge = (): number => {
      const row = context.getImageData(0, 130, canvas.width, 1).data;
      let rightmost = -1;
      for (let x = 0; x < 260; x += 1) {
        const offset = x * 4;
        // #e11d48: strongly red, weakly green. Scanned only up to x=260 so the fixture's
        // green `spun` rect at 280..320 cannot be mistaken for it.
        if (row[offset] > 180 && row[offset + 1] < 90 && row[offset + 3] > 200) {
          rightmost = x;
        }
      }
      return rightmost;
    };

    send("pointerdown", startX, startY, layer);
    send("pointermove", startX + 6, startY, container);
    await nextFrame();
    const before = rightEdge();

    // 40 steps of 0.25px = 10px, comfortably resolvable, and every step is individually
    // below what a whole-pixel quantiser could represent.
    let pointerX = startX + 6;
    for (let index = 0; index < 40; index += 1) {
      pointerX += 0.25;
      send("pointermove", pointerX, startY, container);
      await nextFrame();
    }
    const after = rightEdge();
    send("pointerup", pointerX, startY, container);
    return { before, after };
  });

  expect(moved.before, "the shape was not found before the drag").toBeGreaterThan(0);
  // 40 x 0.25px = 10px. One pixel of slack for the antialiased boundary.
  expect(
    moved.after - moved.before,
    `the painted shape moved ${moved.after - moved.before}px for 10px of accumulated `
      + "sub-pixel input",
  ).toBeGreaterThanOrEqual(9);
});

test("many samples inside one frame render the NEWEST, not an average or the first", async ({
  page,
}) => {
  /*
    The latest-pointer buffer, stated as a measurement.

    High-rate input and display cadence are decoupled on purpose: pointer events overwrite
    retained state and the store publishes once per animation frame. That is coalescing,
    not dropping — but it is only correct if the frame renders the NEWEST sample. Rendering
    an earlier one is a dropped state; rendering the mean is interpolation, which puts the
    object behind the pointer.

    Eight 0.25px samples are dispatched with no frame between them, so all eight land in
    one frame's worth of input. The rendered transform must equal the EIGHTH.
  */
  await ready(page, "target", 1);

  const result = await page.evaluate(async () => {
    const layer = document.querySelector('g[data-layer-id="target"]');
    const markup = document.querySelector(".svg-canvas-markup");
    const bridge = window.__pydeeGestureBridge;
    if (layer === null || markup === null || bridge === null || bridge === undefined) {
      throw new Error("harness is not ready");
    }
    const container = markup.closest("div") ?? markup;
    const box = layer.getBoundingClientRect();
    const startX = box.left + box.width / 2;
    const startY = box.top + box.height / 2;

    const send = (type: string, x: number, y: number, target: EventTarget): void => {
      target.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType: "mouse",
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
          buttons: 1,
        }),
      );
    };
    const nextFrame = (): Promise<void> =>
      new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const centreX = (): number => {
      const geometry = bridge.chromeGeometry("target", 1);
      if (geometry === null) {
        throw new Error("no geometry");
      }
      return geometry.center.x;
    };

    send("pointerdown", startX, startY, layer);
    send("pointermove", startX + 6, startY, container);
    await nextFrame();
    const origin = centreX();

    // Eight samples, no awaits: they all arrive before the next frame runs.
    const samples = 8;
    const step = 0.25;
    for (let index = 1; index <= samples; index += 1) {
      send("pointermove", startX + 6 + step * index, startY, container);
    }
    await nextFrame();
    const rendered = centreX() - origin;
    send("pointerup", startX + 6 + step * samples, startY, container);

    return {
      rendered,
      newest: step * samples,
      first: step,
      mean: (step * (samples + 1)) / 2,
    };
  });

  console.log(`[subpixel coalesced] ${JSON.stringify(result)}`);

  // The newest sample, exactly.
  expect(
    Math.abs(result.rendered - result.newest),
    `rendered ${result.rendered}px; newest sample implied ${result.newest}px`,
  ).toBeLessThan(TOLERANCE_PX);
  // And demonstrably NOT the alternatives, so the assertion above is not passing by
  // coincidence on a scene where they happen to be close.
  expect(Math.abs(result.newest - result.first)).toBeGreaterThan(TOLERANCE_PX * 10);
  expect(Math.abs(result.newest - result.mean)).toBeGreaterThan(TOLERANCE_PX * 10);
});

declare global {
  interface Window {
    __pydeeGestureBridge?: {
      chromeGeometry(
        layerId: string,
        zoom: number,
      ): { center: { x: number; y: number } } | null;
    } | null;
  }
}
