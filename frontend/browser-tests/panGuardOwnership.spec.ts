/**
 * Who owns a pointerdown over a shape: the object drag, or the viewport pan?
 *
 * Both pan entry points decide with the SAME DOM question:
 *
 *   useViewport.ts     isBackgroundLeftDrag = !event.target.closest("[data-layer-id], [data-element-id]")
 *   CenterStage.tsx    isCanvasObject       =  target.closest("[data-layer-id], [data-element-id], g[data-role][data-editable='true']")
 *
 * So "is this press on an object?" is answered by asking the DOM what element is under
 * the pointer. That is sound while the design objects ARE the DOM. It stops being sound
 * the moment the engine owns the surface, because `hideDesignObjects` then applies
 * `visibility: hidden` to `.svg-canvas-markup` — and a `visibility: hidden` subtree is
 * not hit-testable, so the pointer passes straight through the shape.
 *
 * This spec measures the predicate directly instead of inferring it: it asks the browser
 * what `elementFromPoint` returns over the middle of a known shape, and whether that
 * element satisfies the selector both guards use. No pan is simulated and no product
 * code is exercised — the point is to establish the FACT the guards are built on.
 *
 * Runs against the built harness on 5200, where the engine really loads, because the
 * whole question only arises once the engine owns the surface.
 *
 * One responsibility per file: pointer ownership of a press over a design object.
 */

import { expect, test, type Page } from "@playwright/test";

const HARNESS = "http://localhost:5200/index.html";

/** The `target` fixture rect: x 100..180, y 100..160, so its centre is (140, 130). */
const TARGET_CENTRE_DOC = { x: 140, y: 130 };

/** The selector both pan guards use to decide "this press is on an object". */
const OBJECT_SELECTOR = "[data-layer-id], [data-element-id]";

interface Ownership {
  readonly elementFromPoint: string;
  /** True when the element under the pointer satisfies the guards' selector. */
  readonly guardSeesAnObject: boolean;
  /** Whether the design markup is hidden, i.e. whether the engine owns the surface. */
  readonly designObjectsHidden: string | null;
  readonly engineStatus: string;
}

async function measure(page: Page, renderer: "svg" | "skia"): Promise<Ownership> {
  const flag = renderer === "skia" ? "renderer=skia" : "editor=1&renderer=svg";
  await page.goto(`${HARNESS}?${flag}&commit=1&zoom=1&select=target`);
  await page.waitForSelector('g[data-layer-id="target"]', { state: "attached" });

  if (renderer === "skia") {
    await page.waitForFunction(() => window.__pydeeEngineStatus === "ready", undefined, {
      timeout: 20_000,
    });
  }
  await page.waitForSelector("[data-handle]");

  return page.evaluate(
    ([doc, selector]) => {
      const point = doc as { x: number; y: number };
      // Convert the document point to a client point through the design canvas's own
      // rect, so this works at any zoom without the test knowing the transform.
      const canvas = document.querySelector(
        'canvas[data-role="skia-canvas"]',
      ) as HTMLCanvasElement | null;
      let clientX: number;
      let clientY: number;
      if (canvas !== null && canvas.width > 0) {
        const rect = canvas.getBoundingClientRect();
        clientX = rect.left + (point.x * rect.width) / canvas.width;
        clientY = rect.top + (point.y * rect.height) / canvas.height;
      } else {
        const layer = document.querySelector('g[data-layer-id="target"]')!;
        const rect = layer.getBoundingClientRect();
        clientX = rect.left + rect.width / 2;
        clientY = rect.top + rect.height / 2;
      }

      const element = document.elementFromPoint(clientX, clientY);
      const markup = document.querySelector(".svg-canvas-markup") as HTMLElement | null;
      const describe = (node: Element | null): string => {
        if (node === null) {
          return "null";
        }
        const role = node.getAttribute("data-role");
        const layerId = node.getAttribute("data-layer-id");
        return [
          node.tagName.toLowerCase(),
          role === null ? "" : `[data-role=${role}]`,
          layerId === null ? "" : `[data-layer-id=${layerId}]`,
          node.className === "" ? "" : `.${String(node.className).split(" ")[0]}`,
        ].join("");
      };

      return {
        elementFromPoint: describe(element),
        guardSeesAnObject: element !== null && element.closest(selector as string) !== null,
        designObjectsHidden: markup?.dataset.designObjectsHidden ?? null,
        engineStatus: String(window.__pydeeEngineStatus),
      };
    },
    [TARGET_CENTRE_DOC, OBJECT_SELECTOR] as const,
  );
}

test.describe("a press over a shape is recognised as being on an object", () => {
  test.describe.configure({ timeout: 120_000 });

  test("SVG renderer: the guards see the object", async ({ page }) => {
    const result = await measure(page, "svg");
    console.log(`[pan guard svg] ${JSON.stringify(result)}`);

    expect(result.designObjectsHidden, "the design markup should be visible here").toBe("false");
    expect(
      result.guardSeesAnObject,
      `elementFromPoint over the shape returned ${result.elementFromPoint}, which does not `
        + "satisfy the selector both pan guards use",
    ).toBe(true);
  });

  test("engine renderer: the guards must STILL see the object", async ({ page }) => {
    /*
      The regression. With the engine owning the surface, `hideDesignObjects` applies
      `visibility: hidden` to `.svg-canvas-markup`. A hidden subtree is not hit-testable,
      so `elementFromPoint` over the middle of the shape returns something that is not a
      design object — and both pan guards conclude the press was on empty background.

      The consequence is the reported symptom: the object drag starts (it gets its id from
      the ENGINE, which is unaffected) and the viewport pan starts too, from the same
      pointer stream. The shape moves and the whole canvas moves with it.
    */
    const result = await measure(page, "skia");
    console.log(`[pan guard skia] ${JSON.stringify(result)}`);

    expect(result.engineStatus, "the engine must be painting for this case to apply").toBe(
      "ready",
    );
    expect(result.designObjectsHidden, "the design markup should be hidden here").toBe("true");
    expect(
      result.guardSeesAnObject,
      `elementFromPoint over the shape returned ${result.elementFromPoint}, so both pan `
        + "guards treat this press as empty background while the engine drags the shape",
    ).toBe(true);
  });
});
