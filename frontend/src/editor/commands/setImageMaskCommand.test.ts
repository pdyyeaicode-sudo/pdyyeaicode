import { describe, expect, it } from "vitest";

import type {
  CreativeDocument,
  ImageLayer,
  ShapeLayer,
} from "../types/documentModel";
import { findLayer, getActiveArtboard } from "./helpers";
import {
  fitImageToMask,
  imageMaskSnapshot,
  setImageMaskCommand,
} from "./setImageMaskCommand";

const IMAGE: ImageLayer = {
  id: "image-1",
  role: "image-slots",
  name: "Photo",
  editable: true,
  locked: false,
  visible: true,
  opacity: 100,
  kind: "image",
  href: "data:image/png;base64,source",
  x: 10,
  y: 20,
  width: 400,
  height: 200,
};

const FRAME: ShapeLayer = {
  id: "frame-1",
  role: "shapes",
  name: "Square Frame",
  editable: true,
  locked: false,
  visible: true,
  opacity: 100,
  kind: "rect",
  field: "frame",
  geometry: { type: "rect", x: 50, y: 60, width: 100, height: 100 },
  fill: "none",
  stroke: "#000000",
  strokeWidth: 1,
};

function documentWithLayers(): CreativeDocument {
  return {
    schemaVersion: 1,
    name: "Mask test",
    activePageId: "page-1",
    activeArtboardId: "artboard-1",
    pages: [
      {
        id: "page-1",
        name: "Page 1",
        artboards: [
          {
            id: "artboard-1",
            width: 500,
            height: 500,
            printMeta: { bleed: 0, cmykSafe: false, trimMarks: false },
            layers: [FRAME, IMAGE],
            defs: "",
            rootAttributes: { "data-printrocket": "true" },
          },
        ],
      },
    ],
  };
}

describe("fitImageToMask", () => {
  it("covers the frame while retaining the image aspect ratio", () => {
    expect(fitImageToMask(IMAGE, FRAME)).toEqual({
      clipPathId: "frame-1",
      x: 0,
      y: 60,
      width: 200,
      height: 100,
    });
  });
});

describe("setImageMaskCommand", () => {
  it("preserves the raster source and restores the exact placement on undo", () => {
    const document = documentWithLayers();
    const command = setImageMaskCommand(
      IMAGE.id,
      imageMaskSnapshot(IMAGE),
      fitImageToMask(IMAGE, FRAME),
    );

    const applied = command.apply(document);
    const appliedArtboard = getActiveArtboard(applied);
    const masked = appliedArtboard ? findLayer(appliedArtboard.layers, IMAGE.id) : null;

    expect(masked?.kind).toBe("image");
    if (masked?.kind === "image") {
      expect(masked.href).toBe(IMAGE.href);
      expect(masked.clipPathId).toBe(FRAME.id);
      expect(masked.x).toBe(0);
      expect(masked.width).toBe(200);
    }

    const undone = command.undo(applied);
    const undoneArtboard = getActiveArtboard(undone);
    const restored = undoneArtboard ? findLayer(undoneArtboard.layers, IMAGE.id) : null;
    expect(restored).toEqual(IMAGE);
  });
});
