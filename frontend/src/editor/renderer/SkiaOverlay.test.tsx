/**
 * Tests that the engine renderer cannot take the document away.
 *
 * The engine is now the DEFAULT, which changes what has to be guaranteed here.
 * Three things:
 *
 *  1. `?renderer=svg` renders exactly what the editor always did — no extra canvas,
 *     no engine fetch.
 *  2. By default the overlay mounts, and with no built artifact it reports the engine
 *     as unavailable while leaving the SVG renderer and its interaction surfaces
 *     untouched.
 *  3. Crucially: while the engine is not painting, the SVG design objects stay
 *     VISIBLE. `EditorCanvas` hides them so the canvas can be the only visual
 *     surface, and doing that on the strength of the flag alone turned a missing
 *     WASM artifact into a blank canvas. jsdom never has the artifact, so this file
 *     is the natural place to pin it.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorCanvas } from "../EditorCanvas";
import { SkiaOverlay } from "./SkiaOverlay";
import { createGestureChannel } from "../interaction/gestureChannel";
import { resetEngineLoaderForTests } from "./engineLoader";
import type { DesignOutput } from "../../types";

const VIEWPORT = { zoom: 1, panX: 0, panY: 0 };

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" data-printrocket="true" data-version="1.0">
<defs></defs>
<g data-role="shapes" data-editable="true" data-layer-id="shape-1">
<rect data-field="shape" data-element-id="shape-el-1" x="20" y="20" width="60" height="60" fill="#ff0000"/>
</g>
</svg>`;

const designOutput: DesignOutput = {
  requestId: "test-request",
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

function renderCanvas() {
  return render(
    <EditorCanvas
      designOutput={designOutput}
      activeLayer={null}
      onLayerSelect={vi.fn()}
      onLayerTextUpdate={vi.fn()}
      onLayerTransform={vi.fn()}
    />,
  );
}

afterEach(() => {
  setSearch("");
  resetEngineLoaderForTests();
  vi.restoreAllMocks();
});

describe("SkiaOverlay gating", () => {
  it("adds nothing to the canvas when the SVG renderer is requested", () => {
    setSearch("?renderer=svg");
    const { container } = renderCanvas();

    expect(container.querySelector('[data-role="skia-overlay"]')).toBeNull();
    expect(container.querySelector("canvas")).toBeNull();
    // The SVG renderer is still there, unchanged.
    expect(container.querySelector('[data-layer-id="shape-1"]')).not.toBeNull();
    expect(container.querySelector('[data-role="selection-overlay"]')).not.toBeNull();
  });

  it("mounts the overlay by default, without disturbing the SVG renderer", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setSearch("");

    const { container } = renderCanvas();

    const overlay = container.querySelector('[data-role="skia-overlay"]');
    expect(overlay).not.toBeNull();
    // Purely visual: it must never intercept pointer input.
    expect((overlay as HTMLElement).style.pointerEvents).toBe("none");
    expect(overlay?.getAttribute("aria-hidden")).toBe("true");

    // The SVG layers and selection overlay are untouched, so interaction still
    // works exactly as before.
    expect(container.querySelector('[data-layer-id="shape-1"]')).not.toBeNull();
    expect(container.querySelector('[data-role="selection-overlay"]')).not.toBeNull();

    // The overlay must parse the ORIGINAL canonical SVG. Parsing the
    // viewport-wrapped variant makes canonicalSvg synthesize layer ids, which
    // would silently break id parity with the document.
    const synthesizedIdWarnings = warn.mock.calls.filter((call) =>
      String(call[0]).includes("synthesized id"),
    );
    expect(synthesizedIdWarnings).toEqual([]);
  });

  it("reports the engine as unavailable when the artifact is not built", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setSearch("");

    renderCanvas();

    await waitFor(() => {
      expect(screen.getByText(/skia: unavailable/)).toBeInTheDocument();
    });
  });
});

describe("the fallback keeps the document on screen", () => {
  it("leaves the SVG design objects VISIBLE while the engine is not painting", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setSearch("");

    const { container } = renderCanvas();

    // Before the engine has answered at all.
    expect(
      container.querySelector('[data-design-objects-hidden="true"]'),
      "the design objects were hidden before the engine had painted anything",
    ).toBeNull();

    await waitFor(() => {
      expect(screen.getByText(/skia: unavailable/)).toBeInTheDocument();
    });

    // And after it has reported that it cannot paint. This is the blank-canvas
    // guard: the flag asked for the engine, the engine is not there, and the
    // document is still on screen.
    const markup = container.querySelector(".svg-canvas-markup") as HTMLElement | null;
    expect(markup).not.toBeNull();
    expect(markup!.dataset.designObjectsHidden).toBe("false");
    expect(markup!.style.visibility).not.toBe("hidden");

    // The selection chrome is likewise still the DOM's, so the editor is usable
    // rather than merely visible.
    const overlay = container.querySelector('[data-role="selection-overlay"]');
    expect(overlay?.getAttribute("data-chrome-hidden")).toBe("false");

    // Never silent: the fallback says why.
    const fallbackWarnings = warn.mock.calls.filter((call) =>
      String(call[0]).includes("Falling back to the canonical-SVG renderer"),
    );
    expect(fallbackWarnings.length).toBeGreaterThan(0);
  });
});

describe("SkiaOverlay drag wiring", () => {
  it("subscribes to the gesture channel and unsubscribes on unmount", () => {
    const channel = createGestureChannel();
    const { unmount } = render(
      <SkiaOverlay designOutput={designOutput} viewport={VIEWPORT} gestures={channel} />,
    );

    // The seam that lets a live drag reach the engine without React re-rendering
    // the canvas on every pointer sample.
    expect(channel.listenerCount()).toBe(1);

    unmount();
    expect(channel.listenerCount()).toBe(0);
  });

  it("survives gesture events before the engine has loaded", () => {
    const channel = createGestureChannel(() => {
      throw new Error("a listener threw; the drag would be stranded");
    });
    render(<SkiaOverlay designOutput={designOutput} viewport={VIEWPORT} gestures={channel} />);

    // The engine loads asynchronously, so a drag can start before it exists.
    // Dropping those events must be silent, not a crash.
    expect(() => {
      channel.emit({ phase: "begin", layerId: "shape-1", dx: 0, dy: 0 });
      channel.emit({ phase: "move", layerId: "shape-1", dx: 5, dy: 5 });
      channel.emit({ phase: "end", layerId: "shape-1", dx: 5, dy: 5 });
    }).not.toThrow();
  });

  it("does not subscribe when no channel is supplied", () => {
    // The overlay is still correct without one; it just repaints only when the
    // document changes.
    expect(() =>
      render(<SkiaOverlay designOutput={designOutput} viewport={VIEWPORT} />),
    ).not.toThrow();
  });
});

describe("EditorCanvas gesture wiring", () => {
  it("mounts the engine by default and not when the SVG renderer is requested", () => {
    setSearch("?renderer=svg");
    const { container } = renderCanvas();
    // Opted out, so there is no subscriber and the drag path pays nothing.
    expect(container.querySelector('[data-role="skia-overlay"]')).toBeNull();

    setSearch("");
    const enabled = renderCanvas();
    expect(enabled.container.querySelector('[data-role="skia-overlay"]')).not.toBeNull();
  });
});
