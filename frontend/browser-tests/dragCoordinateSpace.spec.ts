/**
 * Browser verification of the drag preview's coordinate space.
 *
 * CONTEXT.md §8 recorded a *suspicion*, not a finding: `useCanvasDrag` previews a
 * drag with `applyDomTranslate(el, snapX * zoom, snapY * zoom)` while the dragged
 * element sits inside `.svg-canvas-wrapper`, which carries `scale(zoom)`. If
 * Chromium maps a CSS `px` translate on an SVG child to SVG *user units*, that
 * translate is scaled a second time by the wrapper and the preview travels
 * `zoom x` further than the pointer.
 *
 * jsdom cannot answer this — it computes no layout, and `getBoundingClientRect`
 * returns zeros — so the question was deliberately left open rather than "fixed"
 * on reasoning alone. This file answers it with a real layout engine.
 *
 * The DOM and CSS below are copied from the editor, not approximated:
 *   - wrapper styles from `SVGCanvas.tsx` (`.svg-canvas-wrapper`)
 *   - markup container styles from `SVGCanvas.tsx` (`.svg-canvas-markup`)
 *   - the viewport `<g data-viewport transform="translate(0 0) scale(1)">` that
 *     `EditorCanvas.wrapSvgWithViewport` injects with an IDENTITY transform
 *   - the exact transform string `applyDomTranslate` writes
 *
 * What is measured, all in screen pixels via `getBoundingClientRect`:
 *   - the pointer displacement we asked for
 *   - the resulting SVG element displacement
 *
 * One responsibility per file: verifying the drag preview's coordinate space.
 */

import { expect, test } from "@playwright/test";

const ARTBOARD = 400;

/**
 * Build the editor's canvas structure at a given zoom.
 *
 * `transformOrigin: 0 0` and the `translate(pan) scale(zoom)` order are what the
 * editor uses; both matter to the result.
 */
function page(zoom: number): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; }
  #host { position: relative; width: 1200px; height: 900px; overflow: hidden; }
</style></head>
<body>
  <div id="host">
    <div class="svg-canvas-wrapper" style="width:${ARTBOARD}px;height:${ARTBOARD}px;background:#fff;transform:translate(0px, 0px) scale(${zoom});transform-origin:0 0;">
      <div class="svg-canvas-markup" style="width:100%;display:flex;align-items:center;justify-content:center;">
        <svg xmlns="http://www.w3.org/2000/svg" width="${ARTBOARD}" height="${ARTBOARD}" viewBox="0 0 ${ARTBOARD} ${ARTBOARD}">
          <g data-viewport transform="translate(0 0) scale(1)">
            <g data-role="shapes" data-editable="true" data-layer-id="target">
              <rect x="100" y="100" width="80" height="60" fill="#e11d48"/>
            </g>
          </g>
        </svg>
      </div>
    </div>
  </div>
</body></html>`;
}

/**
 * Measure how far the element actually moves on screen for a given translate.
 *
 * `documentDelta` is what `useCanvasDrag` calls `snapX` — the pointer's screen
 * displacement divided by zoom. `appliedValue` is what gets written into the CSS
 * transform.
 */
async function measure(
  browserPage: import("@playwright/test").Page,
  zoom: number,
  appliedValue: number,
): Promise<{ before: number; after: number; screenDelta: number }> {
  await browserPage.setContent(page(zoom));
  return browserPage.evaluate((value) => {
    const element = document.querySelector<SVGGElement>('[data-layer-id="target"]');
    if (element === null) {
      throw new Error("test fixture is missing the target layer");
    }
    const before = element.getBoundingClientRect().left;
    element.style.transform = `translate(${value}px, 0px)`;
    // Force layout so the measurement reflects the new transform.
    const after = element.getBoundingClientRect().left;
    return { before, after, screenDelta: after - before };
  }, appliedValue);
}

test.describe("CSS translate on an SVG child inside a scaled wrapper", () => {
  test("at zoom 1 a translate of N px moves the element N screen px", async ({ page: p }) => {
    const { screenDelta } = await measure(p, 1, 40);
    expect(screenDelta).toBeCloseTo(40, 3);
  });

  test("a CSS px translate is scaled by the ancestor scale(zoom)", async ({ page: p }) => {
    // This is the decisive measurement. If Chromium treated the `px` as screen
    // pixels, the element would move 40 screen px regardless of zoom.
    const { screenDelta } = await measure(p, 2, 40);
    expect(screenDelta).toBeCloseTo(80, 3);
  });

  test("the editor's current formula over-travels by exactly the zoom factor", async ({
    page: p,
  }) => {
    const zoom = 2;
    const pointerScreenDelta = 40;
    // `useCanvasDrag` computes snapX = dx / zoom (document px) and then applies
    // `snapX * zoom` to the DOM.
    const documentDelta = pointerScreenDelta / zoom;
    const currentFormula = documentDelta * zoom;

    const { screenDelta } = await measure(p, zoom, currentFormula);

    // The pointer moved 40 screen px; the preview moved 80.
    expect(screenDelta).toBeCloseTo(pointerScreenDelta * zoom, 3);
    expect(screenDelta).not.toBeCloseTo(pointerScreenDelta, 1);
  });

  test("applying the document-space delta directly tracks the pointer exactly", async ({
    page: p,
  }) => {
    for (const zoom of [0.5, 1, 2, 4]) {
      const pointerScreenDelta = 40;
      const documentDelta = pointerScreenDelta / zoom;

      const { screenDelta } = await measure(p, zoom, documentDelta);

      // The corrected formula: translate by the DOCUMENT delta and let the
      // wrapper's scale convert it back to screen pixels.
      expect(screenDelta, `zoom ${zoom}`).toBeCloseTo(pointerScreenDelta, 3);
    }
  });

  test("the viewBox maps one user unit to one CSS pixel in this layout", async ({ page: p }) => {
    // The correction above is only valid while the SVG's viewBox and its
    // width/height agree. If a future change introduces a viewBox scale, the
    // conversion needs that factor too — so it is asserted rather than assumed.
    await p.setContent(page(1));
    const ratio = await p.evaluate(() => {
      const svg = document.querySelector("svg");
      if (svg === null) {
        throw new Error("test fixture is missing the svg root");
      }
      const box = svg.getBoundingClientRect();
      const viewBox = svg.getAttribute("viewBox")?.split(/\s+/) ?? [];
      return box.width / Number(viewBox[2]);
    });
    expect(ratio).toBeCloseTo(1, 6);
  });
});
