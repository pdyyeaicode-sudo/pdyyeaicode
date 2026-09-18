/**
 * The gesture-end commit hitch — the one frame a user is most likely to notice.
 *
 * Releasing the pointer runs a chain that a drag frame never touches:
 *
 *   canonical SVG -> artboardFromDesignOutput -> command.apply -> serializeArtboard
 *                 -> React re-render -> innerHTML parse
 *                 -> extractRenderScene -> encodeScene -> loadScene -> render
 *
 * Every step is proportional to the size of the WHOLE document, not to what moved. So
 * the drag can be perfectly smooth and the release can still stutter, and a frame-rate
 * average over the gesture hides it completely — which is why this is measured
 * separately.
 *
 * What is measured:
 *
 *  - the longest animation-frame gap AFTER release, which is the hitch as experienced
 *  - the longest gap DURING the drag, as the baseline it should be compared against
 *  - `longtask` entries, which Chromium reports for any task over 50ms
 *  - the harness's per-stage timing of the document pipeline (parse / apply / serialise)
 *
 * Both renderers and two document sizes, because the whole point is that the cost
 * scales with the document rather than with the gesture.
 *
 * The thresholds are loose — a CI machine's absolute timing is not reproducible — and
 * the value of this file is the logged breakdown. What IS asserted is the shape of the
 * result: a commit must not cost hundreds of milliseconds, and the pipeline stages must
 * actually have been measured.
 *
 * One responsibility per file: measuring the cost of committing a gesture.
 */

import { expect, test, type Page } from "@playwright/test";

const HARNESS = "/browser-tests/harness/index.html";
/** The BUILT harness. Vite's dev server will not serve the engine module. */
const BUILT_HARNESS = "http://localhost:5200/index.html";

interface CommitProfile {
  /** Longest animation-frame gap while the pointer was down. */
  readonly dragMaxGapMs: number;
  /** Longest animation-frame gap in the window after release. */
  readonly commitMaxGapMs: number;
  /** How much worse the worst post-release frame was than the worst drag frame. */
  readonly excessMs: number;
  readonly longTasks: number;
  readonly longestTaskMs: number;
  /** Per-stage document pipeline timing, from the harness. */
  readonly pipeline: {
    readonly parseMs: number;
    readonly applyMs: number;
    readonly serialiseMs: number;
    readonly totalMs: number;
    readonly markupBytes: number;
  } | null;
  readonly committed: number;
  readonly engineLoaded: boolean;
}

async function profile(page: Page, url: string, engine: boolean): Promise<CommitProfile> {
  await page.goto(url);
  await page.waitForSelector('g[data-layer-id="target"]', { state: "attached" });
  if (engine) {
    await page.waitForFunction(
      () => {
        const bridge = window.__pydeeGestureBridge;
        const geometry = bridge?.chromeGeometry("target", 1);
        return geometry !== null && geometry !== undefined && Number.isFinite(geometry.center.x);
      },
      undefined,
      { timeout: 15000 },
    );
  } else {
    await page.waitForTimeout(500);
  }

  return page.evaluate(async () => {
    const layer = document.querySelector('g[data-layer-id="target"]');
    const markup = document.querySelector(".svg-canvas-markup");
    if (layer === null || markup === null) {
      throw new Error("harness is missing the target layer");
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

    const longTasks: number[] = [];
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasks.push(entry.duration);
        }
      });
      observer.observe({ entryTypes: ["longtask"] });
    } catch {
      // Not every engine exposes longtask. The frame-gap measurement below does not
      // depend on it, so its absence degrades the report rather than invalidating it.
      observer = null;
    }

    // Frame timestamps, recorded continuously across the whole run so the drag and the
    // commit are measured by the same clock and the same mechanism.
    const frames: number[] = [];
    let running = true;
    const record = (now: number): void => {
      frames.push(now);
      if (running) {
        requestAnimationFrame(record);
      }
    };
    requestAnimationFrame(record);

    const nextFrame = (): Promise<void> =>
      new Promise((resolve) => requestAnimationFrame(() => resolve()));

    // --- drag ---------------------------------------------------------------
    send("pointerdown", startX, startY, layer);
    for (let step = 1; step <= 20; step += 1) {
      send("pointermove", startX + step * 3, startY + step, container);
      await nextFrame();
    }
    const releasedAtMs = performance.now();
    send("pointerup", startX + 60, startY + 20, container);

    // Keep recording well past the commit: React's re-render, the markup parse, the
    // re-extract and the scene upload are spread over several frames.
    await new Promise((resolve) => setTimeout(resolve, 600));
    running = false;
    observer?.disconnect();

    const gapsBefore: number[] = [];
    const gapsAfter: number[] = [];
    for (let index = 1; index < frames.length; index += 1) {
      const gap = frames[index] - frames[index - 1];
      if (frames[index] <= releasedAtMs) {
        gapsBefore.push(gap);
      } else {
        gapsAfter.push(gap);
      }
    }
    const round = (value: number): number => Math.round(value * 10) / 10;
    const dragMaxGapMs = gapsBefore.length === 0 ? 0 : Math.max(...gapsBefore);
    const commitMaxGapMs = gapsAfter.length === 0 ? 0 : Math.max(...gapsAfter);

    const timings = window.__pydeeCommitTimings ?? [];
    const last = timings[timings.length - 1] ?? null;

    return {
      dragMaxGapMs: round(dragMaxGapMs),
      commitMaxGapMs: round(commitMaxGapMs),
      excessMs: round(Math.max(0, commitMaxGapMs - dragMaxGapMs)),
      longTasks: longTasks.length,
      longestTaskMs: round(longTasks.length === 0 ? 0 : Math.max(...longTasks)),
      pipeline: last === null
        ? null
        : {
            parseMs: round(last.parseMs),
            applyMs: round(last.applyMs),
            serialiseMs: round(last.serialiseMs),
            totalMs: round(last.totalMs),
            markupBytes: last.markupBytes,
          },
      committed: timings.length,
      engineLoaded:
        document.querySelector('[data-role="skia-canvas"]') !== null
        && !(document.body.textContent ?? "").includes("skia: unavailable"),
    };
  });
}

test.describe("the cost of committing a gesture", () => {
  for (const objects of [1, 200]) {
    test(`SVG renderer, ${objects} object(s)`, async ({ page }) => {
      const result = await profile(
        page,
        `${HARNESS}?editor=1&commit=1&zoom=1&select=target&objects=${objects}`,
        false,
      );
      console.log(`[commit svg objects=${objects}] ${JSON.stringify(result)}`);

      expect(result.committed, "the gesture did not commit").toBeGreaterThan(0);
      expect(result.pipeline, "no pipeline timing was recorded").not.toBeNull();
      // A commit that blocks for a third of a second reads as the editor freezing.
      expect(
        result.commitMaxGapMs,
        `the worst frame after release was ${result.commitMaxGapMs}ms`,
      ).toBeLessThan(300);
    });

    test(`Skia renderer, ${objects} object(s)`, async ({ page }) => {
      const result = await profile(
        page,
        `${BUILT_HARNESS}?renderer=skia&commit=1&zoom=1&select=target&objects=${objects}`,
        true,
      );
      console.log(`[commit skia objects=${objects}] ${JSON.stringify(result)}`);

      expect(result.engineLoaded, "the Skia engine did not load; measurement is invalid").toBe(
        true,
      );
      expect(result.committed, "the gesture did not commit").toBeGreaterThan(0);
      expect(result.pipeline, "no pipeline timing was recorded").not.toBeNull();
      expect(
        result.commitMaxGapMs,
        `the worst frame after release was ${result.commitMaxGapMs}ms`,
      ).toBeLessThan(300);
    });
  }
});

declare global {
  interface Window {
    __pydeeCommitTimings: Array<{
      label: string;
      parseMs: number;
      applyMs: number;
      serialiseMs: number;
      totalMs: number;
      markupBytes: number;
      atMs: number;
    }>;
    __pydeeGestureBridge?: {
      chromeGeometry(layerId: string, zoom: number): { center: { x: number; y: number } } | null;
    } | null;
  }
}
