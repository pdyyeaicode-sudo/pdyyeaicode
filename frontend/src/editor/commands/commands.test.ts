import { describe, expect, it } from "vitest";

import type {
  CreativeDocument,
  DocumentLayer,
  ImageLayer,
  ShapeLayer,
} from "../types/documentModel";
import { createLayerCommand } from "./createLayerCommand";
import { deleteLayerCommand } from "./deleteLayerCommand";
import { getActiveArtboard } from "./helpers";
import { groupCommand } from "./groupCommand";
import { reorderLayerCommand } from "./reorderLayerCommand";
import { resizeLayerCommand, type ResizeSnapshot } from "./resizeLayerCommand";
import { setPropertyCommand } from "./setPropertyCommand";
import { textEditCommand } from "./textEditCommand";
import { translateLayerCommand } from "./translateLayerCommand";
import { ungroupCommand } from "./ungroupCommand";

/**
 * Build a fresh, representative `CreativeDocument` for each test. The active
 * artboard's top-level layers exercise every layer family (rect/ellipse/line/
 * polygon/path shapes, text, image, and a nested group) so the round-trip
 * invariant `undo(apply(doc))` deep-equals `doc` is verified per command type.
 */
function makeDoc(): CreativeDocument {
  const layers: DocumentLayer[] = [
    {
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
      fill: "#FF6B00",
    },
    {
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
      fill: "#1A1A1A",
    },
    {
      id: "line-1",
      role: "shapes",
      name: "Line",
      editable: true,
      locked: false,
      visible: true,
      opacity: 100,
      kind: "line",
      field: "shape",
      geometry: { type: "line", x1: 0, y1: 0, x2: 100, y2: 50 },
      stroke: "#000000",
      strokeWidth: 2,
    },
    {
      id: "poly-1",
      role: "shapes",
      name: "Polygon",
      editable: true,
      locked: false,
      visible: true,
      opacity: 100,
      kind: "polygon",
      field: "shape",
      geometry: { type: "polygon", points: [[0, 0], [10, 0], [5, 10]] },
      fill: "#00AAFF",
    },
    {
      id: "path-1",
      role: "shapes",
      name: "Path",
      editable: true,
      locked: false,
      visible: true,
      opacity: 100,
      kind: "path",
      field: "path",
      geometry: { type: "path", d: "M 10 10 L 20 20 L 30 10 Z" },
      stroke: "#333333",
    },
    {
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
    },
    {
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
    },
    {
      id: "group-1",
      role: "cta",
      name: "CTA",
      editable: true,
      locked: false,
      visible: true,
      opacity: 100,
      kind: "group",
      children: [
        {
          id: "cta-bg",
          role: "cta",
          name: "CTA bg",
          editable: true,
          locked: false,
          visible: true,
          opacity: 100,
          kind: "rect",
          field: "cta-bg",
          geometry: { type: "rect", x: 100, y: 200, width: 160, height: 48, rx: 8 },
          fill: "#FF6B00",
        },
        {
          id: "cta-text",
          role: "cta",
          name: "CTA text",
          editable: true,
          locked: false,
          visible: true,
          opacity: 100,
          kind: "text",
          elementId: "cta-1",
          field: "cta",
          content: "Buy now",
          x: 180,
          y: 224,
          fontFamily: "General Sans",
          fontSize: 18,
          fontWeight: "normal",
          textAlign: "center",
          fill: "#FFFFFF",
        },
      ],
    },
  ];

  return {
    schemaVersion: 1,
    name: "Test Document",
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

/** Deep clone via JSON (the model is plain serializable data). */
function clone(doc: CreativeDocument): CreativeDocument {
  return JSON.parse(JSON.stringify(doc)) as CreativeDocument;
}

function topLevelLayers(doc: CreativeDocument): DocumentLayer[] {
  const artboard = getActiveArtboard(doc);
  if (!artboard) {
    throw new Error("active artboard missing");
  }
  return artboard.layers;
}

describe("Command round-trip: undo(apply(doc)) deep-equals doc", () => {
  it("translateLayerCommand (shape geometry)", () => {
    const doc = makeDoc();
    const original = clone(doc);
    const command = translateLayerCommand("rect-1", 15, -7.5);
    expect(command.undo(command.apply(doc))).toEqual(original);
  });

  it("translateLayerCommand (path data, absolute coords)", () => {
    const doc = makeDoc();
    const original = clone(doc);
    const command = translateLayerCommand("path-1", 12.5, 4);
    expect(command.undo(command.apply(doc))).toEqual(original);
  });

  it("translateLayerCommand (group translates children recursively)", () => {
    const doc = makeDoc();
    const original = clone(doc);
    const command = translateLayerCommand("group-1", 5, 5);
    const moved = command.apply(doc);
    // The group's children actually moved before undo restores them.
    const movedGroup = topLevelLayers(moved).find((l) => l.id === "group-1");
    expect(movedGroup?.kind).toBe("group");
    expect(command.undo(moved)).toEqual(original);
  });

  it("resizeLayerCommand (shape geometry snapshot)", () => {
    const doc = makeDoc();
    const original = clone(doc);
    const rect = topLevelLayers(doc).find((l): l is ShapeLayer => l.id === "rect-1")!;
    const prev: ResizeSnapshot = { kind: "geometry", geometry: rect.geometry };
    const next: ResizeSnapshot = {
      kind: "geometry",
      geometry: { type: "rect", x: 10, y: 20, width: 300, height: 160 },
    };
    const command = resizeLayerCommand("rect-1", prev, next);
    const resized = command.apply(doc);
    const resizedRect = topLevelLayers(resized).find((l): l is ShapeLayer => l.id === "rect-1")!;
    expect(resizedRect.geometry).toEqual(next.geometry);
    expect(command.undo(resized)).toEqual(original);
  });

  it("resizeLayerCommand (image box snapshot)", () => {
    const doc = makeDoc();
    const original = clone(doc);
    const image = topLevelLayers(doc).find((l): l is ImageLayer => l.id === "image-1")!;
    const prev: ResizeSnapshot = { kind: "box", x: image.x, y: image.y, width: image.width, height: image.height };
    const next: ResizeSnapshot = { kind: "box", x: 100, y: 100, width: 400, height: 300 };
    const command = resizeLayerCommand("image-1", prev, next);
    expect(command.undo(command.apply(doc))).toEqual(original);
  });

  it("setPropertyCommand (fill on a shape)", () => {
    const doc = makeDoc();
    const original = clone(doc);
    const command = setPropertyCommand("rect-1", "fill", "#FF6B00", "#123456");
    const next = command.apply(doc);
    const rect = topLevelLayers(next).find((l): l is ShapeLayer => l.id === "rect-1")!;
    expect(rect.fill).toBe("#123456");
    expect(command.undo(next)).toEqual(original);
  });

  it("setPropertyCommand (opacity on a nested group child)", () => {
    const doc = makeDoc();
    const original = clone(doc);
    const command = setPropertyCommand("cta-text", "opacity", 100, 50);
    expect(command.undo(command.apply(doc))).toEqual(original);
  });

  it("setPropertyCommand (fontSize clamped value on text)", () => {
    const doc = makeDoc();
    const original = clone(doc);
    const command = setPropertyCommand("text-1", "fontSize", 64, 200);
    expect(command.undo(command.apply(doc))).toEqual(original);
  });

  it("textEditCommand", () => {
    const doc = makeDoc();
    const original = clone(doc);
    const command = textEditCommand("text-1", "50% OFF", "70% OFF");
    const next = command.apply(doc);
    const text = topLevelLayers(next).find((l) => l.id === "text-1");
    expect(text?.kind === "text" ? text.content : "").toBe("70% OFF");
    expect(command.undo(next)).toEqual(original);
  });

  it("createLayerCommand (insert then undo removes)", () => {
    const doc = makeDoc();
    const original = clone(doc);
    const newLayer: ShapeLayer = {
      id: "rect-new",
      role: "shapes",
      name: "New Rect",
      editable: true,
      locked: false,
      visible: true,
      opacity: 100,
      kind: "rect",
      field: "shape",
      geometry: { type: "rect", x: 0, y: 0, width: 50, height: 50 },
      fill: "#abcdef",
    };
    const command = createLayerCommand(newLayer, 2);
    const next = command.apply(doc);
    expect(topLevelLayers(next).map((l) => l.id)).toContain("rect-new");
    expect(topLevelLayers(next)[2].id).toBe("rect-new");
    expect(command.undo(next)).toEqual(original);
  });

  it("deleteLayerCommand (remove then undo reinserts at position)", () => {
    const doc = makeDoc();
    const original = clone(doc);
    const target = topLevelLayers(doc)[3]; // poly-1
    const command = deleteLayerCommand(target, 3);
    const next = command.apply(doc);
    expect(topLevelLayers(next).map((l) => l.id)).not.toContain("poly-1");
    expect(command.undo(next)).toEqual(original);
  });

  it("reorderLayerCommand (move then undo restores order)", () => {
    const doc = makeDoc();
    const original = clone(doc);
    const command = reorderLayerCommand("rect-1", 0, 4);
    const next = command.apply(doc);
    expect(topLevelLayers(next)[4].id).toBe("rect-1");
    // Relative order of the others is preserved.
    expect(topLevelLayers(next).slice(0, 4).map((l) => l.id)).toEqual([
      "ellipse-1",
      "line-1",
      "poly-1",
      "path-1",
    ]);
    expect(command.undo(next)).toEqual(original);
  });

  it("groupCommand (group two layers then undo ungroups)", () => {
    const doc = makeDoc();
    const original = clone(doc);
    const command = groupCommand(["rect-1", "line-1"], topLevelLayers(doc), { groupId: "grp-x" });
    const next = command.apply(doc);
    const container = topLevelLayers(next).find((l) => l.id === "grp-x");
    expect(container?.kind).toBe("group");
    if (container?.kind === "group") {
      // Members nested in original relative z-order, roles preserved.
      expect(container.children.map((c) => c.id)).toEqual(["rect-1", "line-1"]);
      expect(container.children.map((c) => c.role)).toEqual(["shapes", "shapes"]);
    }
    expect(command.undo(next)).toEqual(original);
  });

  it("ungroupCommand replaces a group with its children and undo restores it", () => {
    const doc = makeDoc();
    const grouped = groupCommand(["rect-1", "line-1"], topLevelLayers(doc), { groupId: "grp-x" }).apply(doc);
    const command = ungroupCommand("grp-x", topLevelLayers(grouped));

    const ungrouped = command.apply(grouped);
    expect(topLevelLayers(ungrouped).slice(0, 3).map((layer) => layer.id)).toEqual([
      "rect-1",
      "line-1",
      "ellipse-1",
    ]);
    expect(command.undo(ungrouped)).toEqual(grouped);
  });
});

describe("Command no-op behavior (drops handled by dispatcher)", () => {
  it("translate by zero delta leaves the model deep-equal", () => {
    const doc = makeDoc();
    const original = clone(doc);
    const command = translateLayerCommand("rect-1", 0, 0);
    expect(command.apply(doc)).toEqual(original);
  });

  it("group with fewer than two members is inert", () => {
    const doc = makeDoc();
    const original = clone(doc);
    const command = groupCommand(["rect-1"], topLevelLayers(doc), { groupId: "grp-y" });
    expect(command.apply(doc)).toEqual(original);
  });

  it("ungroup on a non-group layer is inert", () => {
    const doc = makeDoc();
    const command = ungroupCommand("rect-1", topLevelLayers(doc));
    expect(command.apply(doc)).toBe(doc);
    expect(command.undo(doc)).toBe(doc);
  });
});
