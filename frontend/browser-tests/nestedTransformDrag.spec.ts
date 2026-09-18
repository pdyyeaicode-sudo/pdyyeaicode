/**
 * Browser verification of drag geometry inside a TRANSFORMED ancestor group.
 *
 * `dragCoordinateSpace.spec.ts` established that a CSS `px` translate on an SVG
 * child is scaled by the wrapper's `scale(zoom)`, and the drag path was corrected
 * to pass the document-space delta. That correction assumed the only scale between
 * the element and the screen is the viewport zoom.
 *
 * That assumption is false the moment a layer sits inside a group that carries its
 * own transform, which the document model allows on any layer
 * (`DocumentLayer.transform`). `useCanvasDrag` still computes `dx / zoom` and
 * nothing else, so an ancestor scale multiplies the preview a second time.
 *
 * Two separate questions are measured here, both in a real layout engine because
 * jsdom computes no layout and cannot answer either:
 *
 *   1. How far does an element actually move on screen when its ancestor group is
 *      scaled? (Does `dx / zoom` still track the pointer?)
 *   2. Does writing `element.style.transform` PRESERVE the element's own SVG
 *      `transform` attribute, or replace it? `useCanvasDrag`'s comment claims it
 *      composes. In CSS Transforms the SVG attribute is a presentation attribute
 *      for the same property, and an inline style wins over a presentation
 *      attribute — which would mean a rotated layer loses its rotation for the
 *      duration of every drag.
 *
 * Nothing here reads editor code; it measures the platform so the editor's maths
 * can be written against a fact instead of a belief.
 *
 * One responsibility per file: drag geometry under nested/transformed ancestors.
 */

import { expect, test } from "@playwright/test";

const ARTBOARD = 400;

interface Fixture {
  readonly zoom: number;
  /** Transform on the ancestor group between the viewport and the target. */
  readonly groupTransform: string;
  /** Transform attribute on the target layer itself. */
  readonly targetTransform: string;
}

function page({ zoom, groupTransform, targetTransform }: Fixture): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; }
  #host { position: relative; width: 1400px; height: 1000px; overflow: hidden; }
</style></head>
<body>
  <div id="host">
    <div class="svg-canvas-wrapper" style="width:${ARTBOARD}px;height:${ARTBOARD}px;background:#fff;transform:translate(0px, 0px) scale(${zoom});transform-origin:0 0;">
      <div class="svg-canvas-markup" style="width:100%;display:flex;align-items:center;justify-content:center;">
        <svg xmlns="http://www.w3.org/2000/svg" width="${ARTBOARD}" height="${ARTBOARD}" viewBox="0 0 ${ARTBOARD} ${ARTBOARD}">
          <g data-viewport transform="translate(0 0) scale(1)">
            <g data-role="shapes" data-editable="true" data-layer-id="outer"${
              groupTransform === "" ? "" : ` transform="${groupTransform}"`
            }>
              <g data-role="shapes" data-editable="true" data-layer-id="target"${
                targetTransform === "" ? "" : ` transform="${targetTransform}"`
              }>
                <rect x="100" y="100" width="80" height="60" fill="#e11d48"/>
              </g>
            </g>
          </g>
        </svg>
      </div>
    </div>
  </div>
</body></html>`;
}

interface Measurement {
  readonly before: DOMRectLike;
  readonly after: DOMRectLike;
  readonly screenDx: number;
  readonly screenDy: number;
}

interface DOMRectLike {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Apply a CSS translate, exactly as `applyDomTranslate` does, and measure. */
async function measureCssTranslate(
  browserPage: import("@playwright/test").Page,
  fixture: Fixture,
  dx: number,
  dy: number,
): Promise<Measurement> {
  await browserPage.setContent(page(fixture));
  return browserPage.evaluate(
    ({ dx: x, dy: y }) => {
      const element = document.querySelector<SVGGElement>('[data-layer-id="target"]');
      if (element === null) {
        throw new Error("fixture is missing the target layer");
      }
      const read = (): DOMRectLike => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      };
      const before = read();
      element.style.transform = `translate(${x}px, ${y}px)`;
      const after = read();
      return {
        before,
        after,
        screenDx: after.left - before.left,
        screenDy: after.top - before.top,
      };
    },
    { dx, dy },
  );
}

/**
 * The world -> screen scale actually in force for the target element.
 *
 * Read from `getScreenCTM`, which is the browser's own answer and therefore the
 * ground truth the editor's arithmetic has to match.
 */
async function screenScale(
  browserPage: import("@playwright/test").Page,
  fixture: Fixture,
): Promise<{ a: number; b: number; c: number; d: number }> {
  await browserPage.setContent(page(fixture));
  return browserPage.evaluate(() => {
    const element = document.querySelector<SVGGraphicsElement>('[data-layer-id="target"]');
    if (element === null) {
      throw new Error("fixture is missing the target layer");
    }
    const parent = element.parentNode as SVGGraphicsElement | null;
    if (parent === null) {
      throw new Error("fixture is missing the ancestor group");
    }
    const ctm = parent.getScreenCTM();
    if (ctm === null) {
      throw new Error("no screen CTM");
    }
    return { a: ctm.a, b: ctm.b, c: ctm.c, d: ctm.d };
  });
}

test.describe("drag preview inside a transformed ancestor group", () => {
  test("an ancestor scale multiplies a CSS translate a second time", async ({ page: p }) => {
    const zoom = 1;
    const pointerScreenDx = 40;
    // What useCanvasDrag applies today: the pointer delta divided by zoom only.
    const editorDelta = pointerScreenDx / zoom;

    const { screenDx } = await measureCssTranslate(
      p,
      { zoom, groupTransform: "scale(2)", targetTransform: "" },
      editorDelta,
      0,
    );

    // The pointer asked for 40 screen px. The group's scale(2) doubles it.
    expect(screenDx).toBeCloseTo(80, 3);
    expect(screenDx).not.toBeCloseTo(pointerScreenDx, 1);
  });

  test("zoom and the ancestor scale compound", async ({ page: p }) => {
    for (const zoom of [1, 2, 4]) {
      const pointerScreenDx = 40;
      const editorDelta = pointerScreenDx / zoom;
      const { screenDx } = await measureCssTranslate(
        p,
        { zoom, groupTransform: "scale(2)", targetTransform: "" },
        editorDelta,
        0,
      );
      // dx/zoom cancels the wrapper scale, leaving exactly the group's factor.
      expect(screenDx, `zoom ${zoom}`).toBeCloseTo(pointerScreenDx * 2, 3);
    }
  });

  test("dividing by the FULL ancestor scale tracks the pointer at every zoom", async ({
    page: p,
  }) => {
    for (const zoom of [0.5, 1, 2, 4]) {
      for (const groupScale of [1, 2, 3]) {
        const pointerScreenDx = 40;
        const ctm = await screenScale(p, {
          zoom,
          groupTransform: `scale(${groupScale})`,
          targetTransform: "",
        });
        // The correct conversion: divide the screen delta by the scale the
        // element's PARENT actually contributes, which is what getScreenCTM
        // reports. `zoom` is only one factor of it.
        const parentDelta = pointerScreenDx / ctm.a;

        const { screenDx } = await measureCssTranslate(
          p,
          { zoom, groupTransform: `scale(${groupScale})`, targetTransform: "" },
          parentDelta,
          0,
        );
        expect(screenDx, `zoom ${zoom}, group scale ${groupScale}`).toBeCloseTo(
          pointerScreenDx,
          3,
        );
      }
    }
  });

  test("an ancestor ROTATION redirects a CSS translate", async ({ page: p }) => {
    // A translate written in the parent's space comes out rotated on screen, so a
    // drag inside a rotated group travels in the wrong DIRECTION, not merely the
    // wrong distance. Dividing by a scalar cannot fix this.
    const { screenDx, screenDy } = await measureCssTranslate(
      p,
      { zoom: 1, groupTransform: "rotate(90)", targetTransform: "" },
      40,
      0,
    );
    expect(Math.abs(screenDx)).toBeLessThan(0.01);
    expect(screenDy).toBeCloseTo(40, 3);
  });

  test("style.transform REPLACES the element's own transform attribute", async ({ page: p }) => {
    // A quarter turn swaps the rect's on-screen width and height. If the CSS
    // translate composed with the attribute, the box would stay 60x80.
    await p.setContent(
      page({ zoom: 1, groupTransform: "", targetTransform: "rotate(90 140 130)" }),
    );
    const result = await p.evaluate(() => {
      const element = document.querySelector<SVGGElement>('[data-layer-id="target"]');
      if (element === null) {
        throw new Error("fixture is missing the target layer");
      }
      const rotated = element.getBoundingClientRect();
      element.style.transform = "translate(10px, 0px)";
      const withStyle = element.getBoundingClientRect();
      return {
        rotatedWidth: rotated.width,
        rotatedHeight: rotated.height,
        styledWidth: withStyle.width,
        styledHeight: withStyle.height,
      };
    });

    // Rotated: the 80x60 rect presents as 60x80.
    expect(result.rotatedWidth).toBeCloseTo(60, 1);
    expect(result.rotatedHeight).toBeCloseTo(80, 1);
    // With the inline style applied, the rotation is GONE — the box is 80x60
    // again. This is the platform behaviour the editor has to account for.
    expect(result.styledWidth).toBeCloseTo(80, 1);
    expect(result.styledHeight).toBeCloseTo(60, 1);
  });

  test("composing the translate into the transform attribute preserves rotation", async ({
    page: p,
  }) => {
    await p.setContent(
      page({ zoom: 1, groupTransform: "", targetTransform: "rotate(90 140 130)" }),
    );
    const result = await p.evaluate(() => {
      const element = document.querySelector<SVGGElement>('[data-layer-id="target"]');
      if (element === null) {
        throw new Error("fixture is missing the target layer");
      }
      const original = element.getAttribute("transform") ?? "";
      const before = element.getBoundingClientRect();
      // Prepending the translate keeps it in the PARENT's space, which is where a
      // drag delta belongs, and leaves the element's own rotation intact.
      element.setAttribute("transform", `translate(25 0) ${original}`);
      const after = element.getBoundingClientRect();
      return {
        width: after.width,
        height: after.height,
        dx: after.left - before.left,
        dy: after.top - before.top,
      };
    });

    expect(result.width).toBeCloseTo(60, 1);
    expect(result.height).toBeCloseTo(80, 1);
    expect(result.dx).toBeCloseTo(25, 3);
    expect(result.dy).toBeCloseTo(0, 3);
  });
});
