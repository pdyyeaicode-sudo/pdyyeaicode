/**
 * Where the drag frame budget actually goes.
 *
 * Motivation: Fabric.js-based editors feel smooth because a drag mutates one
 * retained object and re-renders a single `<canvas>` — no DOM writes, no layout,
 * no reflow. Our SVG path writes a `transform` attribute per pointer sample, and
 * React can rebuild the whole `<svg>` subtree mid-gesture. That is a real
 * architectural difference, but "our canvas feels slower" is a claim, and the
 * fix depends on WHICH part is slow.
 *
 * So this file measures, per drag, on the real editor:
 *
 *   1. total handler time for a fixed number of pointermove samples
 *   2. the worst single sample (the one that drops a frame)
 *   3. how many times React replaces nodes inside `.svg-canvas-markup`
 *   4. how many layout flushes the gesture forces
 *
 * Events are dispatched IN PAGE rather than through Playwright's mouse so the
 * numbers are our handler cost, not the harness's pacing.
 *
 * These are diagnostics with generous thresholds, not tight performance gates: a
 * CI machine's absolute timings are not reproducible. They fail only on numbers
 * that would be visible jank at 60fps (16.7ms per frame).
 *
 * One responsibility per file: measuring drag cost on the live editor.
 */

import { expect, test, type Page } from "@playwright/test";

const HARNESS = "/browser-tests/harness/index.html";
const SAMPLES = 60;

interface DragProfile {
  readonly totalMs: number;
  readonly worstSampleMs: number;
  readonly meanSampleMs: number;
  readonly subtreeReplacements: number;
  readonly attributeWrites: number;
}

/**
 * Dispatch a synthetic drag and profile it.
 *
 * `pointerdown` goes to the layer, moves go to the container the hook listens on,
 * which is how the real gesture flows.
 */
async function profileDrag(page: Page, url: string): Promise<DragProfile> {
  await page.goto(url);
  await page.waitForSelector('g[data-layer-id="target"]');

  return page.evaluate(async (samples) => {
    const layer = document.querySelector('g[data-layer-id="target"]');
    if (layer === null) {
      throw new Error("target layer missing");
    }
    const markup = document.querySelector(".svg-canvas-markup");
    if (markup === null) {
      throw new Error("markup container missing");
    }

    let subtreeReplacements = 0;
    let attributeWrites = 0;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "childList" && record.removedNodes.length > 0) {
          subtreeReplacements += 1;
        }
        if (record.type === "attributes") {
          attributeWrites += 1;
        }
      }
    });
    observer.observe(markup, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["transform"],
    });

    const box = layer.getBoundingClientRect();
    const startX = box.left + box.width / 2;
    const startY = box.top + box.height / 2;

    const send = (type: string, x: number, y: number, target: Element): void => {
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

    // setPointerCapture on a synthetic pointer id throws in Chromium; stub it so
    // the hook's capture call cannot abort the gesture.
    const container = markup.closest("div") ?? markup;
    for (const element of [layer, container]) {
      (element as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture =
        () => undefined;
      (element as unknown as { releasePointerCapture: (id: number) => void })
        .releasePointerCapture = () => undefined;
      (element as unknown as { hasPointerCapture: (id: number) => boolean })
        .hasPointerCapture = () => true;
    }

    send("pointerdown", startX, startY, layer);

    const durations: number[] = [];
    const overallStart = performance.now();
    for (let index = 1; index <= samples; index += 1) {
      const x = startX + index;
      const y = startY + index * 0.5;
      const before = performance.now();
      send("pointermove", x, y, container);
      // Force the layout the browser would do before painting, so the cost of the
      // attribute write is included rather than deferred out of the measurement.
      void (layer as SVGGraphicsElement).getBoundingClientRect().left;
      durations.push(performance.now() - before);
    }
    const totalMs = performance.now() - overallStart;
    send("pointerup", startX + samples, startY + samples * 0.5, container);

    // Let any renders the last sample triggered land before disconnecting.
    await new Promise((resolve) => setTimeout(resolve, 120));
    observer.disconnect();

    return {
      totalMs,
      worstSampleMs: Math.max(...durations),
      meanSampleMs: durations.reduce((sum, value) => sum + value, 0) / durations.length,
      subtreeReplacements,
      attributeWrites,
    };
  }, SAMPLES);
}

test.describe("drag cost on the SVG renderer", () => {
  test("profile a 60-sample drag with snapping off", async ({ page }) => {
    const profile = await profileDrag(page, `${HARNESS}?editor=1&zoom=1&select=target`);
    console.log(`[svg, snap off] ${JSON.stringify(profile)}`);

    // A single pointer sample must fit comfortably inside a 16.7ms frame. This is
    // the number that decides whether the canvas feels attached to the cursor.
    expect(profile.worstSampleMs, "worst pointermove exceeded a frame budget").toBeLessThan(16.7);
    expect(profile.meanSampleMs, "mean pointermove cost").toBeLessThan(4);
  });

  test("profile the same drag with snapping ON, which is the editor default", async ({ page }) => {
    const profile = await profileDrag(page, `${HARNESS}?editor=1&zoom=1&select=target&snap=1`);
    console.log(`[svg, snap on] ${JSON.stringify(profile)}`);

    // Snapping recomputes guides and sets React state per sample, which is the
    // path that rebuilds the SVG subtree. Recorded so the cost of that choice is
    // visible rather than assumed.
    expect(profile.worstSampleMs, "worst pointermove exceeded a frame budget").toBeLessThan(16.7);
  });

  test("the drag does not rebuild the SVG subtree once per sample", async ({ page }) => {
    const profile = await profileDrag(page, `${HARNESS}?editor=1&zoom=1&select=target&snap=1`);
    console.log(`[svg, subtree] ${JSON.stringify(profile)}`);

    // One rebuild per pointer sample would mean the whole document is re-parsed
    // and re-injected 60 times in a gesture — the definition of jank. A handful is
    // expected; 60 is not.
    expect(profile.subtreeReplacements, "React rebuilt the subtree per sample").toBeLessThan(
      SAMPLES / 2,
    );
  });
});
