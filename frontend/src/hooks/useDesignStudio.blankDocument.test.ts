import { act, renderHook } from "@testing-library/react";

import { useDesignStudio } from "./useDesignStudio";

function readTopLevelRoles(svgMarkup: string): string[] {
  const root = new DOMParser().parseFromString(svgMarkup, "image/svg+xml").documentElement;
  if (!(root instanceof SVGSVGElement)) {
    throw new Error("Expected an SVG root.");
  }
  return Array.from(root.children)
    .filter((element) => element.tagName.toLowerCase() === "g")
    .map((group) => group.getAttribute("data-role"))
    .filter((role): role is string => role !== null);
}

describe("useDesignStudio blank documents", () => {
  it("starts with only a background and creates semantic layers on demand", () => {
    const { result } = renderHook(() => useDesignStudio());

    act(() => {
      result.current.newDocument(640, 480);
    });

    const blankOutput = result.current.designOutput;
    expect(blankOutput).not.toBeNull();
    expect(blankOutput?.svgLayers.map((layer) => layer.id)).toEqual(["background"]);
    expect(readTopLevelRoles(blankOutput?.composedSVG ?? "")).toEqual(["background"]);

    act(() => {
      result.current.addTextLayer();
    });

    const outputWithText = result.current.designOutput;
    expect(outputWithText).not.toBeNull();
    expect(outputWithText?.svgLayers.map((layer) => layer.role)).toEqual([
      "background",
      "headline",
    ]);
    expect(readTopLevelRoles(outputWithText?.composedSVG ?? "")).toEqual([
      "background",
      "headline",
    ]);
  });
});
