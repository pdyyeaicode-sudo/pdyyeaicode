import { expect, test } from "@playwright/test";

const HARNESS = "http://localhost:5200/index.html";

test("probe: is the selection box drawn on the canvas?", async ({ page }) => {
  test.setTimeout(60_000);
  const logs: string[] = [];
  page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`PAGEERROR: ${e.message}`));

  await page.goto(`${HARNESS}?renderer=skia&zoom=1&select=target`);
  await page.waitForSelector('g[data-layer-id="target"]', { state: "attached" });
  await page.waitForFunction(() => window.__pydeeEngineStatus === "ready", { timeout: 20_000 });
  await page.waitForTimeout(300);

  const report = await page.evaluate(() => {
    const out: Record<string, unknown> = {};
    out.engineStatus = window.__pydeeEngineStatus;

    // Does the engine agree on where "target" is?
    const bridge = window.__pydeeGestureBridge;
    out.chromeGeometry = bridge?.chromeGeometry("target", 1) ?? null;

    // Is the selection canvas present, and what size?
    const selCanvas = document.querySelector(
      'canvas[data-role="selection-canvas"]',
    ) as HTMLCanvasElement | null;
    out.selectionCanvasExists = selCanvas !== null;
    if (selCanvas !== null) {
      out.selectionCanvasSize = { w: selCanvas.width, h: selCanvas.height };
      const rect = selCanvas.getBoundingClientRect();
      out.selectionCanvasClientRect = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };

      // Count non-transparent pixels.
      const ctx = selCanvas.getContext("2d");
      if (ctx !== null) {
        const data = ctx.getImageData(0, 0, selCanvas.width, selCanvas.height).data;
        let painted = 0;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 8) painted += 1;
        }
        out.selectionCanvasPaintedPixels = painted;
      }
    }

    // Is the DOM overlay outline present and what opacity?
    const overlay = document.querySelector('[data-role="selection-overlay"]') as HTMLElement | null;
    out.overlayChromeHidden = overlay?.getAttribute("data-chrome-hidden") ?? null;
    out.overlayOpacity = overlay === null ? null : getComputedStyle(overlay).opacity;
    out.domOutlineExists = document.querySelector('[data-role="selection-outline"]') !== null;
    out.domHandleCount = document.querySelectorAll("[data-handle]").length;

    return out;
  });

  console.log("PROBE:", JSON.stringify(report, null, 2));
  console.log("CONSOLE:", logs.slice(-15).join("\n  "));
  expect(true).toBe(true);
});
