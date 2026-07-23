import { describe, expect, it } from "vitest";

import {
  buildFilterValue,
  buildPositionCommand,
  buildSizeCommand,
  clampFontSize,
  getLayerBox,
  getLayerFill,
  getLayerStroke,
  getLayerStrokeWidth,
  isTextLayer,
  parseEffects,
  parseHexColor,
  supportsSizeEditing,
  validateCoordinate,
  validateFontSize,
  validateHexColor,
  validateOpacityPercent,
  validateStrokeWidth,
} from "./propertyEditing";
import type {
  CreativeDocument,
  DocumentLayer,
  ImageLayer,
  ShapeLayer,
  TextLayer,
} from "./types/documentModel";
import { getActiveArtboard } from "./commands";

/**
 * Unit tests for the pure Properties_Panel editing helpers (task 10.1).
 *
 * These cover the validation gate (Req 9.3/9.5), font-size clamping (Req 6.6),
 * the position/size box derivation, the translate/resize command construction
 * (Req 9.2), and the shadow/blur effect filter (Req 9.6).
 */

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("validateCoordinate (Req 9.2, 9.3)", () => {
  it("accepts numbers within 0..100000", () => {
    expect(validateCoordinate("0", "X")).toEqual({ ok: true, value: 0 });
    expect(validateCoordinate("100000", "X")).toEqual({ ok: true, value: 100000 });
    expect(validateCoordinate("123.5", "X")).toEqual({ ok: true, value: 123.5 });
  });

  it("rejects empty, non-numeric, and out-of-range values", () => {
    expect(validateCoordinate("", "X").ok).toBe(false);
    expect(validateCoordinate("   ", "X").ok).toBe(false);
    expect(validateCoordinate("abc", "X").ok).toBe(false);
    expect(validateCoordinate("12px", "X").ok).toBe(false);
    expect(validateCoordinate("-1", "X").ok).toBe(false);
    expect(validateCoordinate("100001", "X").ok).toBe(false);
    expect(validateCoordinate("Infinity", "X").ok).toBe(false);
  });

  it("names the offending field in the error", () => {
    const result = validateCoordinate("-5", "Width");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Width");
    }
  });
});

describe("validateOpacityPercent (Req 9.4, 9.5)", () => {
  it("accepts integers within 0..100", () => {
    expect(validateOpacityPercent("0")).toEqual({ ok: true, value: 0 });
    expect(validateOpacityPercent("100")).toEqual({ ok: true, value: 100 });
    expect(validateOpacityPercent("55")).toEqual({ ok: true, value: 55 });
  });

  it("rejects out-of-range and non-integer values", () => {
    expect(validateOpacityPercent("-1").ok).toBe(false);
    expect(validateOpacityPercent("101").ok).toBe(false);
    expect(validateOpacityPercent("50.5").ok).toBe(false);
    expect(validateOpacityPercent("abc").ok).toBe(false);
  });
});

describe("validateStrokeWidth (Req 9.4)", () => {
  it("accepts non-negative numbers, rejects negatives and junk", () => {
    expect(validateStrokeWidth("0")).toEqual({ ok: true, value: 0 });
    expect(validateStrokeWidth("2.5")).toEqual({ ok: true, value: 2.5 });
    expect(validateStrokeWidth("-1").ok).toBe(false);
    expect(validateStrokeWidth("x").ok).toBe(false);
  });
});

describe("parseHexColor / validateHexColor (Req 9.5)", () => {
  it("parses 6-digit hex with or without a leading # and normalizes to lowercase", () => {
    expect(parseHexColor("#FF6B00")).toBe("#ff6b00");
    expect(parseHexColor("ff6b00")).toBe("#ff6b00");
    expect(parseHexColor("  #AbCdEf  ")).toBe("#abcdef");
  });

  it("rejects non-6-digit and malformed colors", () => {
    expect(parseHexColor("#fff")).toBeNull();
    expect(parseHexColor("#12345")).toBeNull();
    expect(parseHexColor("#1234567")).toBeNull();
    expect(parseHexColor("red")).toBeNull();
    expect(parseHexColor("#gggggg")).toBeNull();
  });

  it("validateHexColor returns a named error when unparseable", () => {
    expect(validateHexColor("#123abc", "Fill")).toEqual({ ok: true, value: "#123abc" });
    const result = validateHexColor("nope", "Fill");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Fill");
    }
  });
});

describe("clampFontSize / validateFontSize (Req 6.6)", () => {
  it("clamps to the 12..200 range and reports adjustment", () => {
    expect(clampFontSize(5)).toEqual({ value: 12, adjusted: true });
    expect(clampFontSize(500)).toEqual({ value: 200, adjusted: true });
    expect(clampFontSize(48)).toEqual({ value: 48, adjusted: false });
  });

  it("validateFontSize clamps numeric input and rejects junk", () => {
    expect(validateFontSize("8")).toEqual({ ok: true, value: { value: 12, adjusted: true } });
    expect(validateFontSize("64")).toEqual({ ok: true, value: { value: 64, adjusted: false } });
    expect(validateFontSize("").ok).toBe(false);
    expect(validateFontSize("big").ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Layer box derivation
// ---------------------------------------------------------------------------

function rect(): ShapeLayer {
  return {
    id: "rect-1",
    role: "shapes",
    name: "Rect",
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "rect",
    field: "shape",
    geometry: { type: "rect", x: 10, y: 20, width: 200, height: 100 },
    fill: "#ff6b00",
    stroke: "#000000",
    strokeWidth: 2,
  };
}

function ellipse(): ShapeLayer {
  return {
    id: "ellipse-1",
    role: "shapes",
    name: "Ellipse",
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "ellipse",
    field: "shape",
    geometry: { type: "ellipse", cx: 50, cy: 60, rx: 30, ry: 20 },
    fill: "#1a1a1a",
  };
}

function image(): ImageLayer {
  return {
    id: "image-1",
    role: "image-slots",
    name: "Image",
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "image",
    href: "data:image/png;base64,AAAA",
    x: 100,
    y: 100,
    width: 200,
    height: 150,
  };
}

function text(): TextLayer {
  return {
    id: "text-1",
    role: "headline",
    name: "Headline",
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "text",
    elementId: "headline-1",
    field: "headline",
    content: "50% OFF",
    x: 40,
    y: 80,
    fontFamily: "General Sans",
    fontSize: 64,
    fontWeight: "bold",
    textAlign: "center",
    fill: "#000000",
  };
}

describe("getLayerBox", () => {
  it("derives a top-left box for each editable layer family", () => {
    expect(getLayerBox(rect())).toEqual({ x: 10, y: 20, width: 200, height: 100 });
    expect(getLayerBox(ellipse())).toEqual({ x: 20, y: 40, width: 60, height: 40 });
    expect(getLayerBox(image())).toEqual({ x: 100, y: 100, width: 200, height: 150 });
    expect(getLayerBox(text())).toEqual({ x: 40, y: 80, width: 0, height: 64 });
  });

  it("returns null for groups and free-form paths", () => {
    const path: ShapeLayer = { ...rect(), id: "p", kind: "path", geometry: { type: "path", d: "M0 0 L10 10" } };
    expect(getLayerBox(path)).toBeNull();
    const group: DocumentLayer = {
      id: "g",
      role: "cta",
      name: "G",
      editable: true,
      locked: false,
      visible: true,
      opacity: 100,
      kind: "group",
      children: [],
    };
    expect(getLayerBox(group)).toBeNull();
  });

  it("derives a bounding box for line and polygon shapes", () => {
    const line: ShapeLayer = { ...rect(), id: "l", kind: "line", geometry: { type: "line", x1: 5, y1: 30, x2: 25, y2: 10 } };
    expect(getLayerBox(line)).toEqual({ x: 5, y: 10, width: 20, height: 20 });
    const poly: ShapeLayer = { ...rect(), id: "poly", kind: "polygon", geometry: { type: "polygon", points: [[0, 0], [10, 0], [5, 8]] } };
    expect(getLayerBox(poly)).toEqual({ x: 0, y: 0, width: 10, height: 8 });
  });
});

describe("supportsSizeEditing / isTextLayer / readers", () => {
  it("only rect, ellipse, and image support size editing", () => {
    expect(supportsSizeEditing(rect())).toBe(true);
    expect(supportsSizeEditing(ellipse())).toBe(true);
    expect(supportsSizeEditing(image())).toBe(true);
    expect(supportsSizeEditing(text())).toBe(false);
  });

  it("reads fill, stroke, and stroke width where applicable", () => {
    expect(getLayerFill(rect())).toBe("#ff6b00");
    expect(getLayerStroke(rect())).toBe("#000000");
    expect(getLayerStrokeWidth(rect())).toBe(2);
    expect(getLayerFill(text())).toBe("#000000");
    expect(getLayerStroke(text())).toBeNull();
    expect(getLayerFill(image())).toBeNull();
    expect(isTextLayer(text())).toBe(true);
    expect(isTextLayer(rect())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Command construction
// ---------------------------------------------------------------------------

function docWith(layer: DocumentLayer): CreativeDocument {
  return {
    schemaVersion: 1,
    name: "Doc",
    activePageId: "page-1",
    activeArtboardId: "artboard-1",
    pages: [
      {
        id: "page-1",
        name: "Page 1",
        artboards: [
          {
            id: "artboard-1",
            width: 1080,
            height: 1080,
            printMeta: { bleed: 0, cmykSafe: false, trimMarks: false },
            layers: [layer],
            defs: "",
            rootAttributes: {},
          },
        ],
      },
    ],
  };
}

function topLayer(doc: CreativeDocument): DocumentLayer {
  const artboard = getActiveArtboard(doc);
  if (!artboard) {
    throw new Error("missing artboard");
  }
  return artboard.layers[0];
}

describe("buildPositionCommand (Req 9.2)", () => {
  it("moves the layer box origin to the committed coordinate", () => {
    const layer = rect();
    const command = buildPositionCommand(layer, "x", 60);
    expect(command).not.toBeNull();
    const next = command!.apply(docWith(layer));
    expect(getLayerBox(topLayer(next))).toEqual({ x: 60, y: 20, width: 200, height: 100 });
  });

  it("returns null for a no-op (unchanged coordinate)", () => {
    expect(buildPositionCommand(rect(), "x", 10)).toBeNull();
  });

  it("returns null for layers without an editable box", () => {
    const path: ShapeLayer = { ...rect(), kind: "path", geometry: { type: "path", d: "M0 0 L1 1" } };
    expect(buildPositionCommand(path, "x", 5)).toBeNull();
  });
});

describe("buildSizeCommand (Req 9.2)", () => {
  it("resizes a rect while keeping its origin fixed", () => {
    const layer = rect();
    const command = buildSizeCommand(layer, "width", 300);
    expect(command).not.toBeNull();
    const next = command!.apply(docWith(layer));
    expect(getLayerBox(topLayer(next))).toEqual({ x: 10, y: 20, width: 300, height: 100 });
  });

  it("resizes an ellipse keeping its top-left fixed", () => {
    const layer = ellipse(); // box { x:20, y:40, w:60, h:40 }
    const command = buildSizeCommand(layer, "width", 100);
    expect(command).not.toBeNull();
    const next = command!.apply(docWith(layer));
    expect(getLayerBox(topLayer(next))).toEqual({ x: 20, y: 40, width: 100, height: 40 });
  });

  it("resizes an image box", () => {
    const layer = image();
    const command = buildSizeCommand(layer, "height", 300);
    expect(command).not.toBeNull();
    const next = command!.apply(docWith(layer));
    expect(getLayerBox(topLayer(next))).toEqual({ x: 100, y: 100, width: 200, height: 300 });
  });

  it("returns null for no-op and unsupported layers", () => {
    expect(buildSizeCommand(rect(), "width", 200)).toBeNull();
    expect(buildSizeCommand(text(), "width", 50)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Effects (Req 9.6)
// ---------------------------------------------------------------------------

describe("parseEffects / buildFilterValue (Req 9.6)", () => {
  it("decodes shadow and blur from a filter string", () => {
    expect(parseEffects(undefined)).toMatchObject({ shadow: false, blur: 0 });
    expect(parseEffects("blur(4px)")).toMatchObject({ shadow: false, blur: 4 });
    expect(parseEffects("drop-shadow(0px 4px 8px rgba(0,0,0,0.35))")).toMatchObject({ shadow: true, blur: 0 });
    expect(parseEffects("drop-shadow(0px 4px 8px #000) blur(2px)")).toMatchObject({ shadow: true, blur: 2 });
  });

  it("builds an SVG filter string from effect state", () => {
    expect(buildFilterValue({ shadow: false, blur: 0 })).toBe("");
    expect(buildFilterValue({ shadow: false, blur: 6 })).toBe("blur(6px)");
    expect(buildFilterValue({ shadow: true, blur: 0 })).toContain("drop-shadow(");
    const both = buildFilterValue({ shadow: true, blur: 3 });
    expect(both).toContain("drop-shadow(");
    expect(both).toContain("blur(3px)");
  });

  it("round-trips effect state through build then parse", () => {
    const state = { shadow: true, blur: 5 };
    expect(parseEffects(buildFilterValue(state))).toMatchObject(state);
  });
});
// ---------------------------------------------------------------------------


