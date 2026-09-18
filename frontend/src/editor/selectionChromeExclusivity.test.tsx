import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorCanvas } from "./EditorCanvas";
import { resetEngineLoaderForTests } from "./renderer/engineLoader";
import type { DesignOutput } from "../types";

/**
 * ONE selected object produces ONE production selection-chrome system.
 *
 * There are two chrome renderers, and that is deliberate: `SelectionOverlay` draws DOM
 * elements over the SVG renderer, and `SelectionCanvas` paints pixels inside the engine
 * stage's transform. Exactly one of them may be live at a time.
 *
 * They stopped being mutually exclusive because they were gated on DIFFERENT conditions:
 *
 *   SelectionOverlay   chromeHidden={engineOwnsSurface}   "is the engine PAINTING"
 *   SelectionCanvas    mounted when skiaOverlayEnabled    "was the engine ASKED for"
 *
 * Those agree whenever the engine loads. They disagree in exactly the case this file
 * reproduces — the flag is on, the engine is unavailable — and then BOTH drew: the DOM
 * chrome around the shape, and the canvas chrome offset from it, because the two live in
 * different coordinate contexts (the SVG wrapper's, and the native-size stage's). That is
 * the two-boxes report.
 *
 * jsdom is the natural place to pin it: the WASM artifact can never load here, so
 * `engineOwnsSurface` is false while the renderer flag is on by default — precisely the
 * failing configuration, with no mocking required to reach it.
 *
 * One responsibility per file: selection chrome mutual exclusivity.
 */

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" data-printrocket="true" data-version="1.0">
<defs></defs>
<g data-role="shapes" data-editable="true" data-layer-id="shape-1">
<rect data-field="shape" data-element-id="shape-el-1" x="20" y="20" width="60" height="60" fill="#ff0000"/>
</g>
</svg>`;

const designOutput: DesignOutput = {
  requestId: "chrome-exclusivity",
  svgLayers: [],
  composedSVG: SAMPLE_SVG,
  printMeta: { bleed: 3, cmykSafe: true, trimMarks: true },
};

function setSearch(search: string): void {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, search },
  });
}

function renderSelected() {
  return render(
    <EditorCanvas
      designOutput={designOutput}
      activeLayer="shape-1"
      selection={{ layerIds: ["shape-1"] }}
      onLayerSelect={vi.fn()}
      onLayerTextUpdate={vi.fn()}
      onLayerTransform={vi.fn()}
    />,
  );
}

/**
 * How many production chrome systems are live.
 *
 * Counted from what is actually in the document rather than from the flags that decide
 * it, so a future change that adds a third renderer is caught too.
 *
 *  - the DOM overlay counts when it is present AND not chrome-hidden. `opacity: 0` with
 *    `pointerEvents: none` is how it steps aside for the engine, so `data-chrome-hidden`
 *    is the honest signal rather than mere presence.
 *  - the canvas chrome counts when its element exists at all: it is only mounted when it
 *    is meant to be drawing.
 */
function liveChromeSystems(container: HTMLElement): string[] {
  const live: string[] = [];
  const overlay = container.querySelector('[data-role="selection-overlay"]');
  if (overlay !== null && overlay.getAttribute("data-chrome-hidden") !== "true") {
    live.push("SelectionOverlay");
  }
  if (container.querySelector('canvas[data-role="selection-canvas"]') !== null) {
    live.push("SelectionCanvas");
  }
  return live;
}

/**
 * Let pending microtasks and the engine-load rejection settle.
 *
 * The invariant is asserted ACROSS this window rather than after it, because the failure
 * being guarded against is momentary as well as steady: the canvas chrome used to mount
 * as soon as the flag was read, i.e. before the engine had reported anything, so a check
 * that only ran once the loader had settled could miss it.
 */
async function settle(): Promise<void> {
  for (let flush = 0; flush < 8; flush += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

afterEach(() => {
  setSearch("");
  resetEngineLoaderForTests();
  vi.restoreAllMocks();
});

describe("selection chrome is mutually exclusive", () => {
  it("draws exactly one chrome system, at every point while the engine is resolving", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // The default: the engine is requested, and in jsdom it can never load.
    setSearch("");

    const { container } = renderSelected();

    // Sampled repeatedly rather than once, so a chrome system that appears for a few
    // frames while the engine is still loading is caught too.
    const observed: string[] = [];
    for (let sample = 0; sample < 8; sample += 1) {
      observed.push(liveChromeSystems(container).join("+"));
      await act(async () => {
        await Promise.resolve();
      });
    }
    observed.push(liveChromeSystems(container).join("+"));

    expect(
      Array.from(new Set(observed)),
      `chrome systems observed over the engine's resolution: ${observed.join(" -> ")}`,
    ).toEqual(["SelectionOverlay"]);
  });

  it("draws exactly one chrome system when the SVG renderer is requested", () => {
    setSearch("?renderer=svg");
    const { container } = renderSelected();
    expect(liveChromeSystems(container)).toEqual(["SelectionOverlay"]);
  });

  it("keeps the DOM overlay as the visible chrome in the fallback state", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setSearch("");

    const { container } = renderSelected();
    await settle();

    // The LEFT box in the report: the DOM overlay, untouched and still the visible one.
    const overlay = container.querySelector('[data-role="selection-overlay"]');
    expect(overlay).not.toBeNull();
    expect(overlay!.getAttribute("data-chrome-hidden")).toBe("false");
  });

  it("never mounts the canvas chrome while the engine is not painting", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setSearch("");

    const { container } = renderSelected();
    // The RIGHT box in the report. Its absence, before and after the loader settles, is
    // the fix.
    expect(container.querySelector('canvas[data-role="selection-canvas"]')).toBeNull();
    await settle();
    expect(container.querySelector('canvas[data-role="selection-canvas"]')).toBeNull();
  });

  it("still mounts the engine overlay itself, so only the CHROME was gated", () => {
    // The design surface is a separate concern from the selection chrome, and gating one
    // must not have disabled the other — otherwise the engine could never take over.
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setSearch("");

    const { container } = renderSelected();
    expect(container.querySelector('[data-role="skia-overlay"]')).not.toBeNull();
    expect(container.querySelector('[data-role="skia-stage"]')).not.toBeNull();
    // And the design canvas is there, so the engine still has a surface to paint on.
    expect(container.querySelector('canvas[data-role="skia-canvas"]')).not.toBeNull();
  });
});
