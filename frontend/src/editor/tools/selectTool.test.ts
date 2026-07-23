import { describe, expect, it } from "vitest";

import type {
  CreativeDocument,
  DocumentLayer,
  ImageLayer,
  ShapeLayer,
  TextLayer,
} from "../types/documentModel";
import { getActiveArtboard } from "../commands";
import type { BBox, LayerBox } from "../selectionMath";
import {
  applyCornerDelta,
  computeNudgeDelta,
  cornerResizeCommand,
  dragTranslateCommand,
  fitGeometryToBox,
  NUDGE_STEP_PX,
  scalePathData,
  type SnapContext,
} from "./selectTool";

/**
 * Example unit tests for the pure select/move/transform logic (task 7.1,
 * Req 4.1–4.6). These cover drag-translate by delta, center-snap, the 1px arrow
 * nudge, corner-handle resize (geometry + box snapshots), locked-layer
 * inertness, and the no-op → no-command rule. Each command is verified against
 * the round-trip invariant `undo(apply(doc))` deep-equals `doc`.
 */

function baseLayer(overrides: Partial<DocumentLayer> & { id: string; kind: DocumentLayer["kind"] }): DocumentLayer {
  const common = {
    role: "shapes" as const,
    name: "Layer",
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
  };
  return { ...common, ...overrides } as DocumentLayer;
}

function rectLayer(locked = false): ShapeLayer {
  return {
    id: "rect-1",
    role: "shapes",
    name: "Rect",
    editable: true,
    locked,
    visible: true,
    opacity: 100,
    kind: "rect",
    field: "shape",
    geometry: { type: "rect", x: 10, y: 20, width: 200, height: 100 },
    fill: "#FF6B00",
  };
}

function imageLayer(): ImageLayer {
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

function textLayer(): TextLayer {
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

function docWith(layers: DocumentLayer[]): CreativeDocument {
  return {
    schemaVersion: 1,
    name: "Test",
    activePageId: "page-1",
    activeArtboardId: "artboard-1",
    pages: [
      {
        id: "page-1",
        name: "Page 1",
        artboards: [
          {
            id: "artboard-1",
            width: 1000,
            height: 1000,
            printMeta: { bleed: 3, cmykSafe: true, trimMarks: true },
            layers,
            defs: "",
            rootAttributes: { "data-printrocket": "true", "data-version": "1.0" },
          },
        ],
      },
    ],
  };
}

function clone(doc: CreativeDocument): CreativeDocument {
  return JSON.parse(JSON.stringify(doc)) as CreativeDocument;
}

function findLayer(doc: CreativeDocument, id: string): DocumentLayer {
  const artboard = getActiveArtboard(doc);
  const layer = artboard?.layers.find((l) => l.id === id);
  if (!layer) {
    throw new Error(`layer ${id} not found`);
  }
  return layer;
}

const rectBox: BBox = { x: 10, y: 20, width: 200, height: 100 };

describe("computeNudgeDelta (Req 4.4)", () => {
  it("maps each direction to a 1px unit delta", () => {
    expect(computeNudgeDelta("left")).toEqual({ dx: -1, dy: 0 });
    expect(computeNudgeDelta("right")).toEqual({ dx: 1, dy: 0 });
    expect(computeNudgeDelta("up")).toEqual({ dx: 0, dy: -1 });
    expect(computeNudgeDelta("down")).toEqual({ dx: 0, dy: 1 });
    expect(NUDGE_STEP_PX).toBe(1);
  });
});

describe("dragTranslateCommand (Req 4.1, 4.5, 4.6)", () => {
  it("translates a shape by the pointer delta", () => {
    const layer = rectLayer();
    const doc = docWith([layer]);
    const original = clone(doc);
    const command = dragTranslateCommand(layer, rectBox, 15, -7.5);
    expect(command).not.toBeNull();
    const next = command!.apply(doc);
    const moved = findLayer(next, "rect-1") as ShapeLayer;
    expect(moved.geometry).toEqual({ type: "rect", x: 25, y: 12.5, width: 200, height: 100 });
    expect(command!.undo(next)).toEqual(original);
  });

  it("returns null for a zero delta (no-op → no Command)", () => {
    const layer = rectLayer();
    expect(dragTranslateCommand(layer, rectBox, 0, 0)).toBeNull();
  });

  it("returns null for a locked layer (inert)", () => {
    const layer = rectLayer(true);
    expect(dragTranslateCommand(layer, rectBox, 25, 25)).toBeNull();
  });
});

describe("dragTranslateCommand center-snap (Req 4.2)", () => {
  const snapCtx: SnapContext = {
    allLayerBoxes: [] as LayerBox[],
    artboard: { width: 1000, height: 1000 },
    zoom: 1,
  };

  it("snaps the layer center to the canvas center when within 5px", () => {
    // Rect is 200x100; centering it on a 1000x1000 canvas needs x=400, y=450.
    // Start near-centered so the proposed center is within 5px of canvas center.
    const layer = rectLayer();
    const box: BBox = { x: 397, y: 448, width: 200, height: 100 };
    // Drag by a small delta that lands the center within threshold.
    const command = dragTranslateCommand(layer, box, 0, 0, snapCtx);
    expect(command).not.toBeNull();
    const doc = docWith([{ ...layer, geometry: { type: "rect", x: 397, y: 448, width: 200, height: 100 } }]);
    const moved = findLayer(command!.apply(doc), "rect-1") as ShapeLayer;
    // Center snapped to (500, 500) => top-left (400, 450).
    expect(moved.geometry).toEqual({ type: "rect", x: 400, y: 450, width: 200, height: 100 });
  });

  it("does not snap when the center is outside the 5px threshold", () => {
    const layer = rectLayer();
    const box: BBox = { x: 0, y: 0, width: 200, height: 100 };
    expect(dragTranslateCommand(layer, box, 0, 0, snapCtx)).toBeNull();
  });
});

describe("cornerResizeCommand (Req 4.3, 4.5, 4.6)", () => {
  it("resizes a rect along the SE diagonal by the drag delta", () => {
    const layer = rectLayer();
    const doc = docWith([layer]);
    const original = clone(doc);
    const command = cornerResizeCommand(layer, rectBox, "se", 50, 60);
    expect(command).not.toBeNull();
    const next = command!.apply(doc);
    const resized = findLayer(next, "rect-1") as ShapeLayer;
    expect(resized.geometry).toEqual({ type: "rect", x: 10, y: 20, width: 250, height: 160 });
    expect(command!.undo(next)).toEqual(original);
  });

  it("resizes from the NW handle moving the origin and shrinking the box", () => {
    const layer = rectLayer();
    const command = cornerResizeCommand(layer, rectBox, "nw", 10, 5);
    const doc = docWith([layer]);
    const resized = findLayer(command!.apply(doc), "rect-1") as ShapeLayer;
    expect(resized.geometry).toEqual({ type: "rect", x: 20, y: 25, width: 190, height: 95 });
  });

  it("captures a box snapshot for an image and round-trips", () => {
    const layer = imageLayer();
    const doc = docWith([layer]);
    const original = clone(doc);
    const box: BBox = { x: 100, y: 100, width: 200, height: 150 };
    const command = cornerResizeCommand(layer, box, "se", 100, 50);
    expect(command).not.toBeNull();
    const next = command!.apply(doc);
    const resized = findLayer(next, "image-1") as ImageLayer;
    expect({ x: resized.x, y: resized.y, width: resized.width, height: resized.height }).toEqual({
      x: 100,
      y: 100,
      width: 300,
      height: 200,
    });
    expect(command!.undo(next)).toEqual(original);
  });

  it("returns null for an SE resize of text (size is glyph-driven, no origin change)", () => {
    const layer = textLayer();
    const box: BBox = { x: 40, y: 60, width: 120, height: 40 };
    expect(cornerResizeCommand(layer, box, "se", 30, 20)).toBeNull();
  });

  it("returns a command for an NW resize of text (origin moves)", () => {
    const layer = textLayer();
    const doc = docWith([layer]);
    const box: BBox = { x: 40, y: 60, width: 120, height: 40 };
    const command = cornerResizeCommand(layer, box, "nw", 8, 4);
    expect(command).not.toBeNull();
    const moved = findLayer(command!.apply(doc), "text-1") as TextLayer;
    // NW handle drag (8,4) on box origin (40,60) → new origin (48,64); the box
    // snapshot restores text x/y to the resized box origin.
    expect({ x: moved.x, y: moved.y }).toEqual({ x: 48, y: 64 });
  });

  it("returns null for a zero-delta resize (no-op → no Command)", () => {
    const layer = rectLayer();
    expect(cornerResizeCommand(layer, rectBox, "se", 0, 0)).toBeNull();
  });

  it("returns null for a locked layer (inert)", () => {
    const layer = rectLayer(true);
    expect(cornerResizeCommand(layer, rectBox, "se", 50, 50)).toBeNull();
  });

  it("returns null for a group layer (no resizable box)", () => {
    const group = baseLayer({ id: "g-1", kind: "group", children: [] });
    expect(cornerResizeCommand(group, rectBox, "se", 10, 10)).toBeNull();
  });
});

describe("applyCornerDelta", () => {
  const box: BBox = { x: 10, y: 20, width: 200, height: 100 };
  it("se grows from the NW anchor", () => {
    expect(applyCornerDelta(box, "se", 30, 40)).toEqual({ x: 10, y: 20, width: 230, height: 140 });
  });
  it("ne moves the top and grows the right", () => {
    expect(applyCornerDelta(box, "ne", 30, 40)).toEqual({ x: 10, y: 60, width: 230, height: 60 });
  });
  it("sw moves the left and grows the bottom", () => {
    expect(applyCornerDelta(box, "sw", 30, 40)).toEqual({ x: 40, y: 20, width: 170, height: 140 });
  });
});

describe("fitGeometryToBox", () => {
  const prev: BBox = { x: 0, y: 0, width: 100, height: 100 };
  const next: BBox = { x: 0, y: 0, width: 200, height: 50 };

  it("maps an ellipse to the box center and radii", () => {
    const result = fitGeometryToBox({ type: "ellipse", cx: 50, cy: 50, rx: 50, ry: 50 }, prev, next);
    expect(result).toEqual({ type: "ellipse", cx: 100, cy: 25, rx: 100, ry: 25 });
  });

  it("scales line endpoints proportionally", () => {
    const result = fitGeometryToBox({ type: "line", x1: 0, y1: 0, x2: 100, y2: 100 }, prev, next);
    expect(result).toEqual({ type: "line", x1: 0, y1: 0, x2: 200, y2: 50 });
  });

  it("scales polygon points proportionally", () => {
    const result = fitGeometryToBox(
      { type: "polygon", points: [[0, 0], [100, 0], [50, 100]] },
      prev,
      next,
    );
    expect(result).toEqual({ type: "polygon", points: [[0, 0], [200, 0], [100, 50]] });
  });
});

describe("scalePathData", () => {
  it("scales absolute path coordinates from prevBox to nextBox", () => {
    const prev: BBox = { x: 0, y: 0, width: 100, height: 100 };
    const next: BBox = { x: 0, y: 0, width: 200, height: 50 };
    expect(scalePathData("M 0 0 L 100 100 Z", prev, next)).toBe("M 0 0 L 200 50 Z");
  });
});
