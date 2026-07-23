import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { EditorCanvas, wrapSvgWithViewport } from "./EditorCanvas";
import type { DesignOutput } from "../types";

/**
 * EditorCanvas rendering smoke tests (task 5.1, Req 1.1, 1.3, 10.9).
 *
 * Verifies the canvas wraps the Canonical_SVG layer groups in a single viewport
 * group carrying the `translate(...) scale(...)` transform, and that every
 * `<g data-role>` layer is preserved as a distinct child — never merged.
 */

const COMPOSED_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80" data-printrocket="true">',
  '<defs><style>.f{fill:#000}</style></defs>',
  '<g data-role="background" data-editable="false"><rect x="0" y="0" width="100" height="80"/></g>',
  '<g data-role="headline" data-editable="true" data-layer-id="h1"><text data-field="headline" data-element-id="t1">Hi</text></g>',
  "</svg>",
].join("");

function makeDesignOutput(composedSVG: string): DesignOutput {
  return {
    requestId: "req-1",
    svgLayers: [],
    composedSVG,
    printMeta: { bleed: 0, cmykSafe: true, trimMarks: false },
  };
}

const noop = (): void => {
  /* intentional no-op for the rendering smoke test */
};

describe("wrapSvgWithViewport", () => {
  it("nests every data-role group inside one viewport wrapper without merging", () => {
    const wrapped = wrapSvgWithViewport(COMPOSED_SVG, 1, 0, 0);
    const doc = new DOMParser().parseFromString(wrapped, "image/svg+xml");
    const root = doc.documentElement;

    const wrapper = root.querySelector("g[data-viewport]");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.getAttribute("transform")).toBe("translate(0 0) scale(1)");

    // Both layer groups survive as separate children of the wrapper (Req 10.9).
    const roleGroups = wrapper?.querySelectorAll(":scope > g[data-role]");
    expect(roleGroups?.length).toBe(2);
    expect(roleGroups?.[0]?.getAttribute("data-role")).toBe("background");
    expect(roleGroups?.[1]?.getAttribute("data-role")).toBe("headline");

    // <defs> stays outside the viewport wrapper, preserved verbatim.
    expect(root.querySelector(":scope > defs")).not.toBeNull();
  });

  it("reflects a non-identity viewport in the wrapper transform", () => {
    const wrapped = wrapSvgWithViewport(COMPOSED_SVG, 2, 15, -30);
    const doc = new DOMParser().parseFromString(wrapped, "image/svg+xml");
    const wrapper = doc.documentElement.querySelector("g[data-viewport]");
    expect(wrapper?.getAttribute("transform")).toBe("translate(15 -30) scale(2)");
  });

  it("returns the original markup unchanged when there are no data-role groups", () => {
    const plain = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';
    expect(wrapSvgWithViewport(plain, 1, 0, 0)).toBe(plain);
  });

  it("returns the original markup unchanged when parsing fails", () => {
    const broken = "<svg><g data-role='x'>";
    expect(wrapSvgWithViewport(broken, 1, 0, 0)).toBe(broken);
  });
});

describe("EditorCanvas", () => {
  it("renders the design with the viewport wrapper and layer groups in the DOM", () => {
    const { container } = render(
      <EditorCanvas
        designOutput={makeDesignOutput(COMPOSED_SVG)}
        activeLayer={null}
        onLayerSelect={noop}
        onLayerTextUpdate={noop}
        onLayerTransform={noop}
      />,
    );

    const wrapper = container.querySelector("g[data-viewport]");
    expect(wrapper).not.toBeNull();
    expect(container.querySelectorAll("g[data-role]").length).toBe(2);

    // Inert selection-overlay seam present for task 5.5.
    expect(container.querySelector('[data-role="selection-overlay"]')).not.toBeNull();
  });

  it("renders the empty-state canvas when no design is loaded", () => {
    const { getByText } = render(
      <EditorCanvas
        designOutput={null}
        activeLayer={null}
        onLayerSelect={noop}
        onLayerTextUpdate={noop}
        onLayerTransform={noop}
      />,
    );

    expect(getByText(/no design has been generated yet/i)).toBeInTheDocument();
  });
});
