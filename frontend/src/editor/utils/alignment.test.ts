/**
 * alignment.test.ts — Unit tests for alignment and distribution algorithms
 */

import { describe, it, expect } from "vitest";
import {
  getSelectionBounds,
  alignLayers,
  distributeLayers,
  type AlignMode,
  type DistributeMode,
} from "./alignment";
import type { CreativeDocument } from "../types/documentModel";

function createTestDocument(layers: any[]): CreativeDocument {
  return {
    schemaVersion: 1,
    name: "Test Document",
    pages: [
      {
        id: "page1",
        name: "Page 1",
        artboards: [
          {
            id: "artboard1",
            width: 800,
            height: 600,
            printMeta: { bleed: 0, cmykSafe: false, trimMarks: false },
            layers,
            defs: "",
            rootAttributes: {},
          } as any,
        ],
      },
    ],
    activePageId: "page1",
    activeArtboardId: "artboard1",
  };
}

describe("alignment utilities", () => {
  describe("getSelectionBounds", () => {
    it("should compute union bounds for multiple layers", () => {
      const doc = createTestDocument([
        { id: "layer1", kind: "rect", geometry: { type: "rect", x: 10, y: 20, width: 50, height: 30 }, editable: true },
        { id: "layer2", kind: "rect", geometry: { type: "rect", x: 80, y: 40, width: 40, height: 60 }, editable: true },
      ]);
      
      const bounds = getSelectionBounds(["layer1", "layer2"], doc);
      expect(bounds).toEqual({ x: 10, y: 20, width: 110, height: 80 });
    });

    it("should filter out locked layers", () => {
      const doc = createTestDocument([
        { id: "layer1", kind: "rect", geometry: { type: "rect", x: 10, y: 20, width: 50, height: 30 }, editable: true, locked: false },
        { id: "layer2", kind: "rect", geometry: { type: "rect", x: 200, y: 200, width: 40, height: 60 }, editable: true, locked: true },
      ]);
      
      const bounds = getSelectionBounds(["layer1", "layer2"], doc);
      // Should only include layer1
      expect(bounds).toEqual({ x: 10, y: 20, width: 50, height: 30 });
    });

    it("should filter out role-locked layers", () => {
      const doc = createTestDocument([
        { id: "layer1", kind: "rect", geometry: { type: "rect", x: 10, y: 20, width: 50, height: 30 }, editable: true, role: "content" },
        { id: "layer2", kind: "rect", geometry: { type: "rect", x: 200, y: 200, width: 40, height: 60 }, editable: true, role: "logo" },
      ]);
      
      const bounds = getSelectionBounds(["layer1", "layer2"], doc);
      // Should only include layer1 (logo is role-locked)
      expect(bounds).toEqual({ x: 10, y: 20, width: 50, height: 30 });
    });

    it("should return null when no valid layers", () => {
      const doc = createTestDocument([]);
      const bounds = getSelectionBounds(["nonexistent"], doc);
      expect(bounds).toBeNull();
    });
  });

  describe("alignLayers", () => {
    it("should align left to selection", () => {
      const doc = createTestDocument([
        { id: "layer1", kind: "rect", geometry: { type: "rect", x: 10, y: 20, width: 50, height: 30 }, editable: true },
        { id: "layer2", kind: "rect", geometry: { type: "rect", x: 80, y: 40, width: 40, height: 60 }, editable: true },
      ]);
      
      const offsets = alignLayers(["layer1", "layer2"], "left", "selection", doc);
      
      // layer1 is already at x=10 (leftmost), layer2 should move to x=10
      expect(offsets).toHaveLength(1);
      expect(offsets[0]).toEqual({ layerId: "layer2", dx: -70, dy: 0 });
    });

    it("should align center horizontal to selection", () => {
      const doc = createTestDocument([
        { id: "layer1", kind: "rect", geometry: { type: "rect", x: 10, y: 20, width: 50, height: 30 }, editable: true },
        { id: "layer2", kind: "rect", geometry: { type: "rect", x: 80, y: 40, width: 40, height: 60 }, editable: true },
      ]);
      
      const offsets = alignLayers(["layer1", "layer2"], "center-horizontal", "selection", doc);
      
      // Selection bounds: x=10, width=110, center=65
      // layer1 center: 10+25=35, needs to move to 65 (dx=30)
      // layer2 center: 80+20=100, needs to move to 65 (dx=-35)
      expect(offsets).toHaveLength(2);
      expect(offsets.find(o => o.layerId === "layer1")).toMatchObject({ dx: 30, dy: 0 });
      expect(offsets.find(o => o.layerId === "layer2")).toMatchObject({ dx: -35, dy: 0 });
    });

    it("should align right to selection", () => {
      const doc = createTestDocument([
        { id: "layer1", kind: "rect", geometry: { type: "rect", x: 10, y: 20, width: 50, height: 30 }, editable: true },
        { id: "layer2", kind: "rect", geometry: { type: "rect", x: 80, y: 40, width: 40, height: 60 }, editable: true },
      ]);
      
      const offsets = alignLayers(["layer1", "layer2"], "right", "selection", doc);
      
      // Rightmost edge is at 120, layer1 should move from 60 to 120
      expect(offsets).toHaveLength(1);
      expect(offsets[0]).toEqual({ layerId: "layer1", dx: 60, dy: 0 });
    });

    it("should align top to selection", () => {
      const doc = createTestDocument([
        { id: "layer1", kind: "rect", geometry: { type: "rect", x: 10, y: 20, width: 50, height: 30 }, editable: true },
        { id: "layer2", kind: "rect", geometry: { type: "rect", x: 80, y: 40, width: 40, height: 60 }, editable: true },
      ]);
      
      const offsets = alignLayers(["layer1", "layer2"], "top", "selection", doc);
      
      // layer1 is already at y=20 (topmost), layer2 should move to y=20
      expect(offsets).toHaveLength(1);
      expect(offsets[0]).toEqual({ layerId: "layer2", dx: 0, dy: -20 });
    });

    it("should align center vertical to selection", () => {
      const doc = createTestDocument([
        { id: "layer1", kind: "rect", geometry: { type: "rect", x: 10, y: 20, width: 50, height: 30 }, editable: true },
        { id: "layer2", kind: "rect", geometry: { type: "rect", x: 80, y: 40, width: 40, height: 60 }, editable: true },
      ]);
      
      const offsets = alignLayers(["layer1", "layer2"], "center-vertical", "selection", doc);
      
      // Selection bounds: y=20, height=80, center=60
      // layer1 center: 20+15=35, needs to move to 60 (dy=25)
      // layer2 center: 40+30=70, needs to move to 60 (dy=-10)
      expect(offsets).toHaveLength(2);
      expect(offsets.find(o => o.layerId === "layer1")).toMatchObject({ dx: 0, dy: 25 });
      expect(offsets.find(o => o.layerId === "layer2")).toMatchObject({ dx: 0, dy: -10 });
    });

    it("should align bottom to selection", () => {
      const doc = createTestDocument([
        { id: "layer1", kind: "rect", geometry: { type: "rect", x: 10, y: 20, width: 50, height: 30 }, editable: true },
        { id: "layer2", kind: "rect", geometry: { type: "rect", x: 80, y: 40, width: 40, height: 60 }, editable: true },
      ]);
      
      const offsets = alignLayers(["layer1", "layer2"], "bottom", "selection", doc);
      
      // Bottommost edge is at 100, layer1 should move from 50 to 100
      expect(offsets).toHaveLength(1);
      expect(offsets[0]).toEqual({ layerId: "layer1", dx: 0, dy: 50 });
    });

    it("should align to artboard when target is artboard", () => {
      const doc = createTestDocument([
        { id: "layer1", kind: "rect", geometry: { type: "rect", x: 10, y: 20, width: 50, height: 30 }, editable: true },
      ]);
      
      const offsets = alignLayers(["layer1"], "left", "artboard", doc);
      
      // Artboard x=0, layer should move to x=0
      expect(offsets).toHaveLength(1);
      expect(offsets[0]).toEqual({ layerId: "layer1", dx: -10, dy: 0 });
    });

    it("should filter out locked layers", () => {
      const doc = createTestDocument([
        { id: "layer1", kind: "rect", geometry: { type: "rect", x: 10, y: 20, width: 50, height: 30 }, editable: true, locked: false },
        { id: "layer2", kind: "rect", geometry: { type: "rect", x: 80, y: 40, width: 40, height: 60 }, editable: true, locked: true },
      ]);
      
      const offsets = alignLayers(["layer1", "layer2"], "left", "selection", doc);
      
      // Only layer1 should be included, and it's already at the left
      expect(offsets).toHaveLength(0);
    });
  });

  describe("distributeLayers", () => {
    it("should distribute horizontally", () => {
      const doc = createTestDocument([
        { id: "layer1", kind: "rect", geometry: { type: "rect", x: 0, y: 0, width: 20, height: 20 }, editable: true },
        { id: "layer2", kind: "rect", geometry: { type: "rect", x: 50, y: 0, width: 20, height: 20 }, editable: true },
        { id: "layer3", kind: "rect", geometry: { type: "rect", x: 100, y: 0, width: 20, height: 20 }, editable: true },
      ]);
      
      const offsets = distributeLayers(["layer1", "layer2", "layer3"], "horizontal", doc);
      
      // Total space: 120 (0 to 120)
      // Total layer size: 60
      // Gap: (120-60)/2 = 30
      // layer1: x=0 (stays)
      // layer2: should be at 0+20+30=50 (already there, dx=0)
      // layer3: x=100 (stays)
      expect(offsets).toHaveLength(0); // Already evenly distributed
    });

    it("should distribute vertically", () => {
      const doc = createTestDocument([
        { id: "layer1", kind: "rect", geometry: { type: "rect", x: 0, y: 0, width: 20, height: 20 }, editable: true },
        { id: "layer2", kind: "rect", geometry: { type: "rect", x: 0, y: 30, width: 20, height: 20 }, editable: true },
        { id: "layer3", kind: "rect", geometry: { type: "rect", x: 0, y: 100, width: 20, height: 20 }, editable: true },
      ]);
      
      const offsets = distributeLayers(["layer1", "layer2", "layer3"], "vertical", doc);
      
      // Total space: 120 (0 to 120)
      // Total layer size: 60
      // Gap: (120-60)/2 = 30
      // layer1: y=0 (stays)
      // layer2: should be at 0+20+30=50 (currently at 30, dy=20)
      // layer3: y=100 (stays)
      expect(offsets).toHaveLength(1);
      expect(offsets[0]).toMatchObject({ layerId: "layer2", dx: 0, dy: 20 });
    });

    it("should return empty array for fewer than 3 layers", () => {
      const doc = createTestDocument([
        { id: "layer1", kind: "rect", geometry: { type: "rect", x: 0, y: 0, width: 20, height: 20 }, editable: true },
        { id: "layer2", kind: "rect", geometry: { type: "rect", x: 50, y: 0, width: 20, height: 20 }, editable: true },
      ]);
      
      const offsets = distributeLayers(["layer1", "layer2"], "horizontal", doc);
      expect(offsets).toHaveLength(0);
    });

    it("should filter out locked layers", () => {
      const doc = createTestDocument([
        { id: "layer1", kind: "rect", geometry: { type: "rect", x: 0, y: 0, width: 20, height: 20 }, editable: true, locked: false },
        { id: "layer2", kind: "rect", geometry: { type: "rect", x: 50, y: 0, width: 20, height: 20 }, editable: true, locked: true },
        { id: "layer3", kind: "rect", geometry: { type: "rect", x: 100, y: 0, width: 20, height: 20 }, editable: true, locked: false },
      ]);
      
      const offsets = distributeLayers(["layer1", "layer2", "layer3"], "horizontal", doc);
      
      // With locked layer filtered out, only 2 layers remain (need 3+)
      expect(offsets).toHaveLength(0);
    });
  });
});
