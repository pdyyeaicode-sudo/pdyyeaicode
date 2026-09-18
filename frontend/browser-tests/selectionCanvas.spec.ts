/**
 * Phase 3: selection chrome is drawn on a canvas that shares the design's transform.
 *
 * The property under test is COINCIDENCE, and it is checked in the only way that
 * cannot be faked: by reading pixels. The selection canvas is the same size as the
 * design canvas and sits inside the same pan/zoom transform, so a handle drawn at
 * document coordinate `p` must land on the pixel where the engine drew `p`. If the two
 * were separately transformed — as the DOM overlay was — they would agree at zoom 1 and
 * drift at zoom 2 and 4, which is why every case runs at all three.
 *
 * Reading pixels rather than element rects is deliberate: an element rect would tell us
 * where a DOM node is, which is the measurement this migration removed.
 *
 * Runs against the BUILT harness on 5200; the engine module is unreachable from the dev
 * server, so a dev-server run would test the SVG path while claiming to test this one.
 *
 * One responsibility per file: selection chrome coincides with the rendered object.
 */

import { expect, test, type Page } from "@playwright/test";

const HARNESS = "http://localhost:5200/index.html";
const DESIGN_CANVAS = 'canvas[data-role="skia-canvas"]';
const SELECTION_CANVAS = 'canvas[data-role="selection-canvas"]';

/** The fixture's plain rect, in document coordinates. See harness/main.tsx. */
const TARGET = { x: 100, y: 100, width: 80, height: 60 };

async function open(page: Page, zoom: number, select = "target"): Promise<void> {
  await page.goto(`${HARNESS}?renderer=skia&commit=1&zoom=${zoom}&select=${select}`);
  await page.waitForSelector(DESIGN_CANVAS);
  await page.waitForSelector(SELECTION_CANVAS, { state: "attached" });
  // Wait for the capability, not a string: the readout says "loading" before the
  // scene is uploaded, so polling on its text would pass before anything is drawn.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const probe = (
            window as unknown as { __pydeeHitTest?: (x: number, y: number) => string | null }
          ).__pydeeHitTest;
          const canvas = document.querySelector(
            'canvas[data-role="skia-canvas"]',
          ) as HTMLCanvasElement | null;
          if (probe === undefined || canvas === null) {
            return null;
          }
          const rect = canvas.getBoundingClientRect();
          if (rect.width <= 0) {
            return null;
          }
          return probe(
            rect.left + (140 * rect.width) / canvas.width,
            rect.top + (130 * rect.height) / canvas.height,
          );
        }),
      { timeout: 20_000 },
    )
    .toBe("target");
}

/** Whether the selection canvas has any ink near a DOCUMENT point. */
async function selectionInkNear(
  page: Page,
  documentX: number,
  documentY: number,
  radius = 6,
): Promise<boolean> {
  return page.evaluate(
    ({ selector, dx, dy, r }) => {
      const canvas = document.querySelector(selector) as HTMLCanvasElement | null;
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
    { selector: SELECTION_CANVAS, dx: documentX, dy: documentY, r: radius },
  );
}

test.describe("selection chrome is drawn in document space", () => {
  test("the selection canvas exists and shares the design canvas's size", async ({ page }) => {
    await open(page, 1);

    const sizes = await page.evaluate(
      ({ design, selection }) => {
        const d = document.querySelector(design) as HTMLCanvasElement | null;
        const s = document.querySelector(selection) as HTMLCanvasElement | null;
        if (d === null || s === null) {
          return null;
        }
        const dr = d.getBoundingClientRect();
        const sr = s.getBoundingClientRect();
        return {
          backing: { d: `${d.width}x${d.height}`, s: `${s.width}x${s.height}` },
          // Same displayed rect means the same effective transform. This is the
          // structural guarantee: they are inside ONE transformed parent.
          rect: {
            d: `${Math.round(dr.left)},${Math.round(dr.top)} ${Math.round(dr.width)}x${Math.round(dr.height)}`,
            s: `${Math.round(sr.left)},${Math.round(sr.top)} ${Math.round(sr.width)}x${Math.round(sr.height)}`,
          },
        };
      },
      { design: DESIGN_CANVAS, selection: SELECTION_CANVAS },
    );

    expect(sizes).not.toBeNull();
    expect(sizes?.backing.s, "backing stores differ").toBe(sizes?.backing.d);
    expect(sizes?.rect.s, "displayed rects differ, so the transforms differ").toBe(
      sizes?.rect.d,
    );
  });

  for (const zoom of [1, 2, 4]) {
    test(`zoom ${zoom}: handles land on the object's own corners`, async ({ page }) => {
      await open(page, zoom);

      // All four corners of the fixture rect, in DOCUMENT coordinates. The canvas is
      // artboard-sized, so document coordinates are its pixel coordinates whatever
      // the zoom — that is the whole point of drawing inside the shared transform.
      const corners = [
        { name: "nw", x: TARGET.x, y: TARGET.y },
        { name: "ne", x: TARGET.x + TARGET.width, y: TARGET.y },
        { name: "se", x: TARGET.x + TARGET.width, y: TARGET.y + TARGET.height },
        { name: "sw", x: TARGET.x, y: TARGET.y + TARGET.height },
      ];
      for (const corner of corners) {
        expect(
          await selectionInkNear(page, corner.x, corner.y),
          `no handle drawn at the ${corner.name} corner at zoom ${zoom}`,
        ).toBe(true);
      }

      // And nothing is drawn far away from the selected object.
      expect(
        await selectionInkNear(page, 20, 380),
        `selection ink found away from the object at zoom ${zoom}`,
      ).toBe(false);
    });
  }

  test("the outline follows a ROTATED object's real corners", async ({ page }) => {
    await open(page, 1, "spun");

    // `spun` is a 60x40 rect rotated 90 degrees about (300, 120), so its corners are
    // at (280, 90), (320, 90), (320, 150), (280, 150). An axis-aligned box around the
    // UNROTATED geometry would put handles at (270, 100) and (330, 140) instead.
    for (const corner of [
      { name: "top-left", x: 280, y: 90 },
      { name: "bottom-right", x: 320, y: 150 },
    ]) {
      expect(
        await selectionInkNear(page, corner.x, corner.y),
        `no handle at the rotated ${corner.name} corner`,
      ).toBe(true);
    }
  });

  test("nothing is drawn when the selection is empty", async ({ page }) => {
    await open(page, 1);
    await page.evaluate(() => window.__pydeeSelect(null));
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    await page.waitForTimeout(60);

    for (const corner of [
      { x: TARGET.x, y: TARGET.y },
      { x: TARGET.x + TARGET.width, y: TARGET.y + TARGET.height },
    ]) {
      expect(
        await selectionInkNear(page, corner.x, corner.y),
        "selection chrome survived an empty selection",
      ).toBe(false);
    }
  });

  test("the box follows the object during a drag, in the same frame", async ({ page }) => {
    await open(page, 1);

    const grab = await page.evaluate(
      ({ selector }) => {
        const canvas = document.querySelector(selector) as HTMLCanvasElement;
        const rect = canvas.getBoundingClientRect();
        return {
          x: rect.left + (140 * rect.width) / canvas.width,
          y: rect.top + (130 * rect.height) / canvas.height,
          scale: rect.width / canvas.width,
        };
      },
      { selector: DESIGN_CANVAS },
    );

    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 40 * grab.scale, grab.y);
    await page.mouse.move(grab.x + 60 * grab.scale, grab.y);
    // One frame for the coalesced redraw of both surfaces.
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );

    // The object moved 60 document px right, so its north-west handle must now be at
    // document x 160, and must NOT still be at 100.
    const atNewCorner = await selectionInkNear(page, TARGET.x + 60, TARGET.y);
    const atOldCorner = await selectionInkNear(page, TARGET.x, TARGET.y, 3);
    await page.mouse.up();

    expect(atNewCorner, "the selection box did not follow the drag").toBe(true);
    expect(atOldCorner, "the selection box was left behind at the old position").toBe(false);
  });
});

declare global {
  interface Window {
    __pydeeSelect: (layerId: string | null) => void;
  }
}
