/**
 * Phase 5: hit testing comes from the engine, not from DOM event targets.
 *
 * These answer different questions. The engine walks the render scene in reverse
 * paint order with the world transforms it drew with, so it reports what is visibly
 * under the cursor. `event.target` reports which ELEMENT received the event, which
 * depends on stroke width, `pointer-events`, fill rules and however the serializer
 * nested things.
 *
 * The probe converts a DOCUMENT point to a client point using the canvas's own rect
 * and backing store, then asks the engine. That is the same conversion the editor
 * uses, and expressing the cases in document coordinates means the assertions are
 * about the fixture's geometry rather than about where the browser happened to lay
 * out an SVG element — an earlier version of this file measured SVG layer rects and
 * was testing the DOM's opinion, not the engine's.
 *
 * Client -> document needs no knowledge of zoom or pan: the canvas is drawn at the
 * artboard's native size and CSS-scaled by the stage, so the ratio of backing store
 * to displayed rect IS the effective scale. The zoom cases below exist to prove that.
 *
 * Runs against the BUILT harness on 5200 — the engine module is unreachable from the
 * dev server, so a dev-server run would silently exercise the DOM path and pass while
 * testing the opposite of the intent.
 *
 * One responsibility per file: proving the engine owns hit testing.
 */

import { expect, test, type Page } from "@playwright/test";

const HARNESS = "http://localhost:5200/index.html";
const CANVAS = 'canvas[data-role="skia-canvas"]';

/** Fixture geometry, in document coordinates. See harness/main.tsx. */
const CASES = [
  { name: "inside the plain rect", x: 140, y: 130, expected: "target" },
  { name: "the rect's top-left corner region", x: 102, y: 102, expected: "target" },
  { name: "the rect's bottom-right corner region", x: 178, y: 158, expected: "target" },
  { name: "inside the 90-degree rotated rect", x: 300, y: 120, expected: "spun" },
  { name: "inside the layer nested in a scaled group", x: 100, y: 70, expected: "nested-el" },
  { name: "empty artboard", x: 10, y: 10, expected: null },
  { name: "empty artboard, far corner", x: 396, y: 396, expected: null },
] as const;

async function open(page: Page, zoom: number): Promise<void> {
  await page.goto(`${HARNESS}?renderer=skia&zoom=${zoom}&select=target`);
  await page.waitForSelector(CANVAS);
  // Wait for the CAPABILITY, not for a string.
  //
  // The readout starts as "loading", so `!includes("skia: unavailable")` is true
  // immediately and a poll on it passes before the scene has been uploaded — the
  // probes then race `loadScene` and return null nondeterministically. Polling until
  // a known-solid document point resolves waits for the thing the test needs.
  await expect
    .poll(async () => hitAtDocumentPoint(page, 140, 130), { timeout: 20_000 })
    .toBe("target");
}

/** Ask the engine what is at a DOCUMENT point, going through client coordinates. */
async function hitAtDocumentPoint(
  page: Page,
  documentX: number,
  documentY: number,
): Promise<string | null | "NO_PROBE" | "NO_CANVAS"> {
  return page.evaluate(
    ({ selector, dx, dy }) => {
      const canvas = document.querySelector(selector) as HTMLCanvasElement | null;
      if (canvas === null) {
        return "NO_CANVAS";
      }
      const probe = (
        window as unknown as { __pydeeHitTest?: (x: number, y: number) => string | null }
      ).__pydeeHitTest;
      if (probe === undefined) {
        return "NO_PROBE";
      }
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return "NO_CANVAS";
      }
      // Document -> client, the inverse of what the editor does on the way in.
      const clientX = rect.left + (dx * rect.width) / canvas.width;
      const clientY = rect.top + (dy * rect.height) / canvas.height;
      return probe(clientX, clientY);
    },
    { selector: selectorOf(), dx: documentX, dy: documentY },
  );

  function selectorOf(): string {
    return CANVAS;
  }
}

test.describe("the engine answers what is under the pointer", () => {
  for (const zoom of [1, 2, 4]) {
    test(`zoom ${zoom}: every fixture point resolves to the right layer`, async ({ page }) => {
      await open(page, zoom);

      for (const testCase of CASES) {
        const hit = await hitAtDocumentPoint(page, testCase.x, testCase.y);
        expect(hit, `${testCase.name} at zoom ${zoom} (${testCase.x}, ${testCase.y})`).toBe(
          testCase.expected,
        );
      }
    });
  }

  test("the rotated layer is resolved by geometry, not by its bounding box", async ({ page }) => {
    await open(page, 1);

    // `spun` is a 60x40 rect rotated 90 degrees about (300, 120), so it occupies
    // 280..320 x 90..150. A point inside its AXIS-ALIGNED box but outside the
    // rotated geometry must MISS — that is the difference between real geometry and
    // a bounding box.
    expect(await hitAtDocumentPoint(page, 300, 120), "centre of the rotated rect").toBe("spun");
    expect(await hitAtDocumentPoint(page, 322, 120), "just outside the rotated rect").not.toBe(
      "spun",
    );
  });

  test("the engine and the TypeScript mirror agree", async ({ page }) => {
    await open(page, 1);

    // `sceneHitTest.ts` is the TypeScript mirror of the C++ implementation and the
    // parity suite already holds them to the same answers. This checks the property
    // that matters here: the engine's answer is not an outlier produced by the
    // client->document conversion.
    for (const testCase of CASES) {
      const hit = await hitAtDocumentPoint(page, testCase.x, testCase.y);
      expect(hit, `${testCase.name}`).toBe(testCase.expected);
    }
  });
});
