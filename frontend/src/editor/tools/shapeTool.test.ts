/**
 * Unit tests for the pure shape builders (task 7.4).
 *
 * These exercise the creation contract from Req 5.1–5.7: a new editable layer
 * added to the `shapes` group with a unique `data-layer-id` and non-empty
 * `data-field`; default fill (closed) / stroke (line) from Brand_Kit
 * primaryColor else Accent_Color; 0.5px coordinate snapping; degenerate shapes
 * discarded with no Command; exactly one layer + one Command per creation.
 */

import { describe, expect, it } from "vitest";
import type { BrandKit } from "../../types";
import type { CreativeDocument, ShapeLayer } from "../types/documentModel";
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_LINE_STROKE_WIDTH,
  buildShapeLayer,
  createShapeCommand,
  resolveDefaultColor,
  snapHalf,
  type ShapeInput,
  type ShapeToolContext,
} from "./shapeTool";

const BRAND_KIT: BrandKit = {
  primaryColor: "#FF6B00",
  secondaryColor: "#FFD700",
  fontFamily: "Arial",
  logoUrl: "https://cdn.example/logo.png",
  tone: "bold",
};

const emptyCtx = (): ShapeToolContext => ({ existingIds: [] });

// A minimal document with a single page/artboard so create commands can be
// applied end-to-end (the active artboard starts with zero layers).
function makeDoc(): CreativeDocument {
  return {
    schemaVersion: 1,
    name: "Test",
    pages: [
      {
        id: "page-1",
        name: "Page 1",
        artboards: [
          {
            id: "art-1",
            width: 800,
            height: 600,
            printMeta: { bleed: 0, cmykSafe: false, trimMarks: false },
            layers: [],
            defs: "",
            rootAttributes: {},
          },
        ],
      },
    ],
    activePageId: "page-1",
    activeArtboardId: "art-1",
  };
}

describe("snapHalf (Req 5.6)", () => {
  it("rounds to the nearest 0.5px increment", () => {
    expect(snapHalf(10)).toBe(10);
    expect(snapHalf(10.2)).toBe(10);
    expect(snapHalf(10.3)).toBe(10.5);
    expect(snapHalf(10.74)).toBe(10.5);
    expect(snapHalf(10.75)).toBe(11);
  });

  it("treats non-finite values as 0", () => {
    expect(snapHalf(Number.NaN)).toBe(0);
    expect(snapHalf(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("resolveDefaultColor (Req 5.2, 5.3)", () => {
  it("uses Brand_Kit primaryColor when a Brand_Kit is active", () => {
    expect(resolveDefaultColor({ existingIds: [], brandKit: BRAND_KIT })).toBe("#FF6B00");
  });

  it("uses the supplied Accent_Color when no Brand_Kit is active", () => {
    expect(resolveDefaultColor({ existingIds: [], accentColor: "#123456" })).toBe("#123456");
  });

  it("falls back to the built-in Accent_Color when nothing is supplied", () => {
    expect(resolveDefaultColor(emptyCtx())).toBe(DEFAULT_ACCENT_COLOR);
  });

  it("ignores a blank Brand_Kit primaryColor and falls through to Accent_Color", () => {
    const ctx: ShapeToolContext = {
      existingIds: [],
      brandKit: { ...BRAND_KIT, primaryColor: "  " },
      accentColor: "#abcdef",
    };
    expect(resolveDefaultColor(ctx)).toBe("#abcdef");
  });
});

describe("buildShapeLayer — closed shapes (Req 5.1, 5.2)", () => {
  it("builds a rectangle in the shapes group with fill, unique id, and field", () => {
    const layer = buildShapeLayer(
      { kind: "rect", x: 10, y: 20, width: 100, height: 50 },
      { existingIds: [], brandKit: BRAND_KIT },
    );
    expect(layer).not.toBeNull();
    const rect = layer as ShapeLayer;
    expect(rect.role).toBe("shapes");
    expect(rect.kind).toBe("rect");
    expect(rect.editable).toBe(true);
    expect(rect.locked).toBe(false);
    expect(rect.opacity).toBe(100);
    expect(rect.fill).toBe("#FF6B00");
    expect(rect.stroke).toBeUndefined();
    expect(rect.field.length).toBeGreaterThan(0);
    expect(rect.id.length).toBeGreaterThan(0);
    expect(rect.geometry).toEqual({ type: "rect", x: 10, y: 20, width: 100, height: 50 });
  });

  it("builds an ellipse with Accent_Color fill when no Brand_Kit is active", () => {
    const layer = buildShapeLayer(
      { kind: "ellipse", cx: 50, cy: 60, rx: 30, ry: 20 },
      { existingIds: [], accentColor: "#00ff00" },
    );
    const ellipse = layer as ShapeLayer;
    expect(ellipse.fill).toBe("#00ff00");
    expect(ellipse.geometry).toEqual({ type: "ellipse", cx: 50, cy: 60, rx: 30, ry: 20 });
  });

  it("builds a polygon (>= 3 vertices) as a closed, filled shape", () => {
    const layer = buildShapeLayer(
      { kind: "polygon", points: [[0, 0], [10, 0], [5, 10]] },
      emptyCtx(),
    );
    const poly = layer as ShapeLayer;
    expect(poly.kind).toBe("polygon");
    expect(poly.fill).toBe(DEFAULT_ACCENT_COLOR);
    expect(poly.stroke).toBeUndefined();
  });

  it("snaps every coordinate to the 0.5px grid (Req 5.6)", () => {
    const layer = buildShapeLayer(
      { kind: "rect", x: 10.2, y: 20.3, width: 100.74, height: 50.75 },
      emptyCtx(),
    );
    expect((layer as ShapeLayer).geometry).toEqual({
      type: "rect",
      x: 10,
      y: 20.5,
      width: 100.5,
      height: 51,
    });
  });
});

describe("buildShapeLayer — lines (Req 5.3)", () => {
  it("paints the default color as stroke, not fill", () => {
    const layer = buildShapeLayer(
      { kind: "line", x1: 0, y1: 0, x2: 100, y2: 0 },
      { existingIds: [], brandKit: BRAND_KIT },
    );
    const line = layer as ShapeLayer;
    expect(line.kind).toBe("line");
    expect(line.stroke).toBe("#FF6B00");
    expect(line.strokeWidth).toBe(DEFAULT_LINE_STROKE_WIDTH);
    expect(line.fill).toBeUndefined();
  });

  it("keeps a horizontal line (0 height bounding box) as a valid shape", () => {
    const layer = buildShapeLayer({ kind: "line", x1: 0, y1: 5, x2: 50, y2: 5 }, emptyCtx());
    expect(layer).not.toBeNull();
  });

  it("paints an open asset path with the Brand_Kit stroke", () => {
    const layer = buildShapeLayer(
      { kind: "path", d: "M0 0 L100 0", fill: "none" },
      { existingIds: [], brandKit: BRAND_KIT },
    ) as ShapeLayer;

    expect(layer.fill).toBe("none");
    expect(layer.stroke).toBe("#FF6B00");
    expect(layer.strokeWidth).toBe(DEFAULT_LINE_STROKE_WIDTH);
  });
});

describe("buildShapeLayer — degenerate shapes discarded (Req 5.7)", () => {
  it("discards a rectangle with 0 width or 0 height", () => {
    expect(buildShapeLayer({ kind: "rect", x: 0, y: 0, width: 0, height: 50 }, emptyCtx())).toBeNull();
    expect(buildShapeLayer({ kind: "rect", x: 0, y: 0, width: 50, height: 0 }, emptyCtx())).toBeNull();
  });

  it("discards a rectangle that snaps down to 0 width", () => {
    expect(buildShapeLayer({ kind: "rect", x: 0, y: 0, width: 0.2, height: 50 }, emptyCtx())).toBeNull();
  });

  it("discards an ellipse with a 0 radius", () => {
    expect(buildShapeLayer({ kind: "ellipse", cx: 5, cy: 5, rx: 0, ry: 10 }, emptyCtx())).toBeNull();
  });

  it("discards a zero-length line", () => {
    expect(buildShapeLayer({ kind: "line", x1: 7, y1: 7, x2: 7, y2: 7 }, emptyCtx())).toBeNull();
  });

  it("discards a polygon with fewer than 3 vertices", () => {
    expect(buildShapeLayer({ kind: "polygon", points: [[0, 0], [10, 10]] }, emptyCtx())).toBeNull();
  });

  it("discards a collinear polygon (0-area bounding box)", () => {
    expect(
      buildShapeLayer({ kind: "polygon", points: [[0, 0], [0, 5], [0, 10]] }, emptyCtx()),
    ).toBeNull();
  });
});

describe("buildShapeLayer — unique ids (Req 5.1)", () => {
  it("mints ids that differ across repeated creations", () => {
    const a = buildShapeLayer({ kind: "rect", x: 0, y: 0, width: 1, height: 1 }, emptyCtx());
    const b = buildShapeLayer({ kind: "rect", x: 0, y: 0, width: 1, height: 1 }, emptyCtx());
    expect((a as ShapeLayer).id).not.toBe((b as ShapeLayer).id);
  });

  it("never reuses an id already present in the document", () => {
    const existing = new Set<string>();
    let ctx: ShapeToolContext = { existingIds: existing };
    for (let i = 0; i < 25; i += 1) {
      const layer = buildShapeLayer({ kind: "rect", x: 0, y: 0, width: 1, height: 1 }, ctx);
      const id = (layer as ShapeLayer).id;
      expect(existing.has(id)).toBe(false);
      existing.add(id);
      ctx = { existingIds: existing };
    }
  });
});

describe("createShapeCommand — exactly one layer + one command (Req 5.4, 5.5, 5.7)", () => {
  it("adds exactly one layer to the shapes group on apply", () => {
    const input: ShapeInput = { kind: "rect", x: 0, y: 0, width: 100, height: 100 };
    const command = createShapeCommand(input, emptyCtx());
    expect(command).not.toBeNull();

    const doc = makeDoc();
    const next = command!.apply(doc);
    const layers = next.pages[0].artboards[0].layers;
    expect(layers).toHaveLength(1);
    expect(layers[0].role).toBe("shapes");
  });

  it("is exactly invertible (undo restores the prior document)", () => {
    const command = createShapeCommand({ kind: "ellipse", cx: 50, cy: 50, rx: 25, ry: 25 }, emptyCtx());
    const doc = makeDoc();
    const applied = command!.apply(doc);
    const reverted = command!.undo(applied);
    expect(reverted).toEqual(doc);
  });

  it("returns null (records nothing) for a degenerate shape", () => {
    expect(createShapeCommand({ kind: "rect", x: 0, y: 0, width: 0, height: 0 }, emptyCtx())).toBeNull();
  });
});
