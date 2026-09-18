import { expect, test } from "@playwright/test";

const HARNESS = "http://localhost:5200/index.html";

test("probe: is the DOM overlay hidden once the engine is painting?", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`${HARNESS}?renderer=skia&zoom=1&select=target`);
  await page.waitForSelector('g[data-layer-id="target"]', { state: "attached" });
  await page.waitForFunction(() => window.__pydeeEngineStatus === "ready", { timeout: 20_000 });
  // Give React a beat to react to the ready status.
  await page.waitForTimeout(500);

  const report = await page.evaluate(() => {
    const overlay = document.querySelector('[data-role="selection-overlay"]') as HTMLElement | null;
    const markup = document.querySelector(".svg-canvas-markup") as HTMLElement | null;
    return {
      engineStatus: window.__pydeeEngineStatus,
      chromeHidden: overlay?.getAttribute("data-chrome-hidden") ?? "n/a",
      overlayOpacity: overlay === null ? "n/a" : getComputedStyle(overlay).opacity,
      overlayPointerEvents: overlay === null ? "n/a" : getComputedStyle(overlay).pointerEvents,
      domObjectsHidden: markup?.getAttribute("data-design-objects-hidden") ?? "n/a",
    };
  });
  console.log("HIDE:", JSON.stringify(report, null, 2));
  expect(true).toBe(true);
});
