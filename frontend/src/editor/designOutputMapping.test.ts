import { describe, expect, it } from "vitest";

import { artboardFromDesignOutput, designOutputFromArtboard } from "./designOutputMapping";
import { CanonicalSvgError } from "./canonicalSvg";
import type { DesignOutput, PrintMeta } from "../types";

/**
 * Representative Canonical_SVG mirroring the backend composer output: an
 * `<svg data-printrocket>` root with the canonical `<g data-role>` groups,
 * including locked layers (background, logo, print-marks).
 */
const COMPOSED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" data-printrocket="true" data-version="1.0">
<g data-role="background" data-editable="false" data-layer-id="background">
<image href="https://cdn.example/bg.png" x="0" y="0" width="1080" height="1080"/>
</g>
<g data-role="shapes" data-editable="true" data-layer-id="shapes">
<rect data-field="shape" data-element-id="box-1" x="10" y="20" width="200" height="100" fill="#FF6B00"/>
</g>
<g data-role="headline" data-editable="true" data-layer-id="headline">
<text data-field="headline" data-element-id="headline-1" x="540" y="80" fill="#000000" font-size="64" text-anchor="middle">50% OFF</text>
</g>
<g data-role="logo" data-editable="false" data-layer-id="logo">
<image href="https://cdn.example/logo.png" x="900" y="20" width="120" height="120"/>
</g>
<g data-role="print-marks" data-editable="false" data-layer-id="print-marks" visibility="hidden"></g>
</svg>`;

const PRINT_META: PrintMeta = { bleed: 3, cmykSafe: true, trimMarks: true };

function makeDesignOutput(overrides: Partial<DesignOutput> = {}): DesignOutput {
  return {
    requestId: "req-123",
    composedSVG: COMPOSED_SVG,
    svgLayers: [],
    printMeta: PRINT_META,
    ...overrides,
  };
}

describe("artboardFromDesignOutput", () => {
  it("carries printMeta from the DesignOutput onto the Artboard (Req 12.3)", () => {
    const artboard = artboardFromDesignOutput(makeDesignOutput());
    expect(artboard.printMeta).toEqual(PRINT_META);
  });

  it("preserves the canonical layer roles in document order without flattening (Req 10.9)", () => {
    const artboard = artboardFromDesignOutput(makeDesignOutput());
    expect(artboard.layers.map((layer) => layer.role)).toEqual([
      "background",
      "shapes",
      "headline",
      "logo",
      "print-marks",
    ]);
    // Locked roles remain locked / non-editable.
    const logo = artboard.layers.find((layer) => layer.role === "logo");
    expect(logo?.locked).toBe(true);
    expect(logo?.editable).toBe(false);
  });

  it("propagates CanonicalSvgError on non-canonical input", () => {
    const bad = makeDesignOutput({ composedSVG: "<svg><g/></svg>" });
    expect(() => artboardFromDesignOutput(bad)).toThrow(CanonicalSvgError);
  });
});

describe("designOutputFromArtboard", () => {
  it("round-trips structurally: layer ids/roles and printMeta are preserved", () => {
    const original = makeDesignOutput();
    const artboard = artboardFromDesignOutput(original);
    const result = designOutputFromArtboard(artboard, original.requestId);

    expect(result.requestId).toBe("req-123");
    expect(result.printMeta).toEqual(PRINT_META);

    // Re-parsing the serialized output yields a structurally equal Artboard
    // (same roles, same order — never flattened).
    const reparsed = artboardFromDesignOutput(result);
    expect(reparsed.layers.map((layer) => layer.role)).toEqual(
      artboard.layers.map((layer) => layer.role),
    );
    expect(reparsed.layers.map((layer) => layer.id)).toEqual(
      artboard.layers.map((layer) => layer.id),
    );
  });

  it("derives one svgLayer per top-level group with matching ids and editability", () => {
    const artboard = artboardFromDesignOutput(makeDesignOutput());
    const result = designOutputFromArtboard(artboard, "req-123");

    expect(result.svgLayers.map((layer) => layer.id)).toEqual([
      "background",
      "shapes",
      "headline",
      "logo",
      "print-marks",
    ]);
    const editableById = Object.fromEntries(
      result.svgLayers.map((layer) => [layer.id, layer.isEditable]),
    );
    expect(editableById.shapes).toBe(true);
    expect(editableById.logo).toBe(false);
    expect(editableById["print-marks"]).toBe(false);
  });

  it("defaults requestId to an empty string when not provided", () => {
    const artboard = artboardFromDesignOutput(makeDesignOutput());
    const result = designOutputFromArtboard(artboard);
    expect(result.requestId).toBe("");
  });
});
