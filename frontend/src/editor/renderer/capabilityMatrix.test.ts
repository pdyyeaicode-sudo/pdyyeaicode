/**
 * Tests that keep the capability matrix honest.
 *
 * The matrix is only useful if it cannot drift from reality, so these drive the
 * real encoder for each declared feature and check BOTH directions:
 *
 *  - declared supported, but the encoder reports it unsupported  -> fail
 *  - declared unsupported, but the encoder emits it silently     -> fail
 *
 * The second direction is what stops the matrix from quietly becoming fiction
 * after a feature starts working.
 */

import { describe, expect, it } from "vitest";

import type { Artboard, DocumentLayer, ShapeLayer, TextLayer } from "../types/documentModel";
import {
  CAPABILITY_MATRIX,
  formatCapabilityMatrix,
  supportedBySkia,
  unsupportedBySkia,
} from "./capabilityMatrix";
import { encodeScene } from "./sceneCodec";
import { extractRenderScene } from "./sceneExtractor";

function makeArtboard(layers: DocumentLayer[]): Artboard {
  return {
    id: "artboard-1",
    width: 200,
    height: 200,
    printMeta: { bleed: 3, cmykSafe: true, trimMarks: true },
    layers,
    defs: "",
    rootAttributes: {},
  };
}

function shape(id: string, overrides: Partial<ShapeLayer> = {}): ShapeLayer {
  return {
    id,
    role: "shapes",
    name: id,
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "rect",
    field: "shape",
    geometry: { type: "rect", x: 10, y: 10, width: 50, height: 50 },
    fill: "#ff0000",
    ...overrides,
  };
}

function text(id: string, overrides: Partial<TextLayer> = {}): TextLayer {
  return {
    id,
    role: "headline",
    name: id,
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "text",
    elementId: `${id}-el`,
    field: "headline",
    content: "Hello",
    x: 10,
    y: 40,
    fontFamily: "Inter",
    fontSize: 24,
    fontWeight: "normal",
    textAlign: "left",
    fill: "#000000",
    ...overrides,
  };
}

/** Encode a single-layer document and report how the encoder treated it. */
function encodeOne(layer: DocumentLayer) {
  const scene = extractRenderScene(makeArtboard([layer]));
  const encoded = encodeScene(scene);
  return {
    nodeCount: encoded.nodeCount,
    skipped: encoded.skippedNodeIds,
    diagnostics: encoded.diagnostics,
    hasEngineDiagnostic: encoded.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "engine-unsupported-node"
        || diagnostic.code === "engine-unsupported-paint",
    ),
  };
}

describe("capability matrix integrity", () => {
  it("has no duplicate feature names", () => {
    const names = CAPABILITY_MATRIX.map((entry) => entry.feature);
    expect(new Set(names).size).toBe(names.length);
  });

  it("documents a note for every entry", () => {
    for (const entry of CAPABILITY_MATRIX) {
      expect(entry.note.length, `${entry.feature} needs a note`).toBeGreaterThan(0);
    }
  });

  it("never claims parity for a feature the engine does not render", () => {
    for (const entry of CAPABILITY_MATRIX) {
      if (entry.skia === "none") {
        expect(entry.parityTested, `${entry.feature} cannot be parity-tested`).toBe(false);
      }
    }
  });

  it("renders as a readable table", () => {
    const table = formatCapabilityMatrix();
    expect(table).toContain("feature");
    expect(table).toContain("rect");
    expect(table.split("\n").length).toBe(CAPABILITY_MATRIX.length + 2);
  });
});

describe("declared as supported, and actually encoded", () => {
  it.each([
    ["rect", shape("r")],
    ["ellipse", shape("e", { kind: "ellipse", geometry: { type: "ellipse", cx: 50, cy: 50, rx: 20, ry: 10 } })],
    ["path", shape("p", { kind: "path", geometry: { type: "path", d: "M0 0 L 10 10" } })],
    [
      "polygon",
      shape("poly", {
        kind: "polygon",
        geometry: { type: "polygon", points: [[0, 0], [10, 0], [0, 10]] },
      }),
    ],
    ["line", shape("l", { kind: "line", geometry: { type: "line", x1: 0, y1: 0, x2: 10, y2: 10 } })],
    ["text", text("t")],
  ] as const)("%s encodes with no unsupported diagnostic", (feature, layer) => {
    const declared = CAPABILITY_MATRIX.find((entry) => entry.feature === feature);
    expect(declared?.skia, `${feature} should be declared supported`).toBe("full");

    const result = encodeOne(layer);
    expect(result.nodeCount).toBeGreaterThan(0);
    expect(result.skipped).toEqual([]);
    expect(result.hasEngineDiagnostic, `${feature} reported unsupported: ${JSON.stringify(result.diagnostics)}`).toBe(false);
  });

  it("text-transform is applied rather than reported", () => {
    const result = encodeOne(text("t", { content: "abc", textTransform: "uppercase" }));
    expect(result.hasEngineDiagnostic).toBe(false);
    expect(result.nodeCount).toBe(1);
  });

  it("blend modes encode without a diagnostic", () => {
    const result = encodeOne(shape("r", { blendMode: "multiply" }));
    expect(result.hasEngineDiagnostic).toBe(false);
  });
});

describe("declared as unsupported, and reported rather than silent", () => {
  it("image is skipped with a reason", () => {
    const declared = CAPABILITY_MATRIX.find((entry) => entry.feature === "image");
    expect(declared?.skia).toBe("none");

    const result = encodeOne({
      id: "img",
      role: "image-slots",
      name: "img",
      editable: true,
      locked: false,
      visible: true,
      opacity: 100,
      kind: "image",
      href: "data:image/png;base64,AAAA",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });

    expect(result.nodeCount).toBe(0);
    expect(result.skipped).toEqual(["img"]);
    expect(result.hasEngineDiagnostic).toBe(true);
  });

  it("a gradient reference is forwarded to the engine, not flattened to a colour", () => {
    const declared = CAPABILITY_MATRIX.find((entry) => entry.feature === "gradient");
    expect(declared?.skia).toBe("full");

    const result = encodeOne(shape("r", { fill: "url(#grad-1)" }));
    // No diagnostic: the engine resolves the reference against the `<defs>` it
    // parsed itself. The encoder's only job is to carry the id across.
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.code === "engine-unsupported-paint"),
    ).toBe(false);
    expect(result.nodeCount).toBe(1);
  });

  it("text decoration is encoded rather than reported", () => {
    const declared = CAPABILITY_MATRIX.find((entry) => entry.feature === "text-decoration");
    expect(declared?.skia).toBe("full");

    const result = encodeOne(text("t", { textDecoration: "underline" }));
    expect(result.diagnostics.some((d) => d.detail.includes("Text decoration"))).toBe(false);
    expect(result.nodeCount).toBe(1);
  });

  it("vertical writing is reported", () => {
    const declared = CAPABILITY_MATRIX.find((entry) => entry.feature === "vertical-writing");
    expect(declared?.skia).toBe("none");

    const result = encodeOne(text("t", { writingMode: "vertical-rl" }));
    expect(result.diagnostics.some((d) => d.detail.includes("Writing mode"))).toBe(true);
  });
});

describe("matrix summaries", () => {
  it("lists the features the engine renders", () => {
    const supported = supportedBySkia();
    expect(supported).toContain("rect");
    expect(supported).toContain("text");
    expect(supported).toContain("gradient");
    expect(supported).toContain("text-decoration");
    expect(supported).not.toContain("image");
  });

  it("lists the features that must still report a diagnostic", () => {
    const unsupported = unsupportedBySkia();
    expect(unsupported).toContain("image");
    expect(unsupported).toContain("vertical-writing");
    expect(unsupported).not.toContain("rect");
    expect(unsupported).not.toContain("gradient");
  });

  it("keeps PDF export on the SVG path deliberately", () => {
    const entry = CAPABILITY_MATRIX.find((item) => item.feature === "print-pdf-export");
    expect(entry?.svg).toBe("full");
    expect(entry?.skia).toBe("none");
    expect(entry?.note).toContain("canonical SVG");
  });
});
