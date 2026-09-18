import { expect, test } from "@playwright/test";

const HARNESS = "http://localhost:5200/index.html";

test("probe: dom handle vs engine handle for nested", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`${HARNESS}?renderer=skia&zoom=1&select=nested`);
  await page.waitForSelector('g[data-layer-id="nested"]', { state: "attached" });
  await page.waitForFunction(() => window.__pydeeEngineStatus === "ready", { timeout: 20_000 });
  await page.waitForSelector("[data-handle]");
  await page.waitForTimeout(300);

  const report = await page.evaluate(() => {
    const out: Record<string, unknown> = {};
    // How many selection overlays and how many nw handles?
    out.overlayCount = document.querySelectorAll('[data-role="selection-overlay"]').length;
    out.nwHandleCount = document.querySelectorAll('[data-handle="nw"]').length;
    out.selectionCanvasCount = document.querySelectorAll('canvas[data-role="selection-canvas"]').length;

    const bridge = window.__pydeeGestureBridge;
    const geom = bridge?.chromeGeometry("nested", 1);
    if (geom !== null && geom !== undefined) {
      const nw = geom.handles["nw"];
      const client = bridge!.documentToClient(nw.x, nw.y);
      out.nwEngine = client;
    }

    // Each nw handle's client rect.
    out.nwDom = Array.from(document.querySelectorAll('[data-handle="nw"]')).map((el) => {
      const r = el.getBoundingClientRect();
      const overlay = el.closest('[data-role="selection-overlay"]');
      return {
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        chromeHidden: overlay?.getAttribute("data-chrome-hidden") ?? "n/a",
      };
    });
    return out;
  });
  console.log("HANDLES:", JSON.stringify(report, null, 2));
  expect(true).toBe(true);
});
