import { describe, it, expect } from "vitest";

// Minimal sanity test confirming the Vitest runner and the jsdom environment
// (DOMParser, XMLSerializer, SVG DOM) are wired up correctly.
describe("test environment sanity", () => {
  it("runs the test runner", () => {
    expect(true).toBe(true);
  });

  it("exposes jsdom DOM APIs (DOMParser/XMLSerializer/SVG)", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" data-printrocket="true"></svg>';
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const root = doc.documentElement;
    expect(root.getAttribute("data-printrocket")).toBe("true");
    expect(new XMLSerializer().serializeToString(root)).toContain(
      "data-printrocket",
    );
  });
});
