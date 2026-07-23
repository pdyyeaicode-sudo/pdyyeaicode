/**
 * clipboard.ts — unit tests
 */

import { describe, it, expect } from "vitest";
import {
  serializeLayers,
  deserializeLayers,
  remapLayerIds,
  offsetLayerPosition,
  unlockLayer,
} from "./clipboard";
import type { DocumentLayer } from "../types/documentModel";

const mockRectLayer: DocumentLayer = {
  id: "rect1",
  kind: "rect",
  role: "shapes",
  name: "Rectangle 1",
  editable: true,
  locked: false,
  visible: true,
  opacity: 100,
  field: "rect1",
  geometry: { type: "rect", x: 10, y: 20, width: 100, height: 50 },
  fill: "#ff0000",
};

const mockTextLayer: DocumentLayer = {
  id: "text1",
  kind: "text",
  role: "headline",
  name: "Text 1",
  editable: true,
  locked: false,
  visible: true,
  opacity: 100,
  elementId: "text1",
  field: "text1",
  content: "Hello World",
  x: 50,
  y: 100,
  fontFamily: "Arial",
  fontSize: 24,
  fontWeight: "normal",
  textAlign: "left",
  fill: "#000000",
};

const mockGroupLayer: DocumentLayer = {
  id: "group1",
  kind: "group",
  role: "shapes",
  name: "Group 1",
  editable: true,
  locked: false,
  visible: true,
  opacity: 100,
  children: [mockRectLayer, mockTextLayer],
};

describe("clipboard utilities", () => {
  describe("serializeLayers", () => {
    it("should serialize single layer to JSON", () => {
      const json = serializeLayers([mockRectLayer]);
      const data = JSON.parse(json);

      expect(data.type).toBe("creative-studio-layers");
      expect(data.version).toBe(1);
      expect(data.layers).toHaveLength(1);
      expect(data.layers[0].id).toBe("rect1");
    });

    it("should serialize multiple layers", () => {
      const json = serializeLayers([mockRectLayer, mockTextLayer]);
      const data = JSON.parse(json);

      expect(data.layers).toHaveLength(2);
      expect(data.layers[0].kind).toBe("rect");
      expect(data.layers[1].kind).toBe("text");
    });

    it("should include original bounds", () => {
      const json = serializeLayers([mockRectLayer]);
      const data = JSON.parse(json);

      expect(data.originalBounds).toBeDefined();
      expect(data.originalBounds.x).toBe(10);
      expect(data.originalBounds.y).toBe(20);
      expect(data.originalBounds.width).toBe(100);
      expect(data.originalBounds.height).toBe(50);
    });
  });

  describe("deserializeLayers", () => {
    it("should deserialize valid JSON", () => {
      const json = serializeLayers([mockRectLayer]);
      const layers = deserializeLayers(json);

      expect(layers).toHaveLength(1);
      expect(layers[0].id).toBe("rect1");
      expect(layers[0].kind).toBe("rect");
    });

    it("should return empty array for invalid JSON", () => {
      const layers = deserializeLayers("not valid json");

      expect(layers).toEqual([]);
    });

    it("should return empty array for wrong data type", () => {
      const invalidData = JSON.stringify({ type: "wrong-type", layers: [] });
      const layers = deserializeLayers(invalidData);

      expect(layers).toEqual([]);
    });

    it("should return empty array for unsupported version", () => {
      const invalidData = JSON.stringify({ type: "creative-studio-layers", version: 99, layers: [] });
      const layers = deserializeLayers(invalidData);

      expect(layers).toEqual([]);
    });

    it("should preserve layer properties through round-trip", () => {
      const json = serializeLayers([mockRectLayer]);
      const layers = deserializeLayers(json);

      expect(layers[0]).toMatchObject({
        kind: "rect",
        name: "Rectangle 1",
        editable: true,
        locked: false,
        visible: true,
        opacity: 100,
      });
    });
  });

  describe("remapLayerIds", () => {
    it("should generate new unique ID for layer", () => {
      const remapped = remapLayerIds(mockRectLayer);

      expect(remapped.id).not.toBe(mockRectLayer.id);
      expect(remapped.id).toBeTruthy();
    });

    it("should preserve all other properties", () => {
      const remapped = remapLayerIds(mockRectLayer);

      expect(remapped.kind).toBe(mockRectLayer.kind);
      expect(remapped.name).toBe(mockRectLayer.name);
      expect(remapped.editable).toBe(mockRectLayer.editable);
    });

    it("should recursively remap group children", () => {
      const remapped = remapLayerIds(mockGroupLayer) as typeof mockGroupLayer;

      expect(remapped.id).not.toBe(mockGroupLayer.id);
      expect(remapped.children).toHaveLength(2);
      expect(remapped.children[0].id).not.toBe(mockRectLayer.id);
      expect(remapped.children[1].id).not.toBe(mockTextLayer.id);
    });

    it("should ensure all IDs are unique", () => {
      const remapped = remapLayerIds(mockGroupLayer) as typeof mockGroupLayer;

      const ids = [remapped.id, remapped.children[0].id, remapped.children[1].id];
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("offsetLayerPosition", () => {
    it("should offset rect geometry", () => {
      const offset = offsetLayerPosition(mockRectLayer, 20, 30);

      if (offset.kind === "rect" && offset.geometry && offset.geometry.type === "rect") {
        expect(offset.geometry.x).toBe(30);
        expect(offset.geometry.y).toBe(50);
      }
    });

    it("should offset text position", () => {
      const offset = offsetLayerPosition(mockTextLayer, 15, 25);

      expect((offset as typeof mockTextLayer).x).toBe(65);
      expect((offset as typeof mockTextLayer).y).toBe(125);
    });

    it("should recursively offset group children", () => {
      const offset = offsetLayerPosition(mockGroupLayer, 10, 10) as typeof mockGroupLayer;

      const rectChild = offset.children[0];
      const textChild = offset.children[1] as typeof mockTextLayer;

      if (rectChild.kind === "rect" && rectChild.geometry && rectChild.geometry.type === "rect") {
        expect(rectChild.geometry.x).toBe(20);
        expect(rectChild.geometry.y).toBe(30);
      }
      expect(textChild.x).toBe(60);
      expect(textChild.y).toBe(110);
    });
  });

  describe("unlockLayer", () => {
    it("should unlock locked layer", () => {
      const lockedLayer = { ...mockRectLayer, locked: true };
      const unlocked = unlockLayer(lockedLayer);

      expect(unlocked.locked).toBe(false);
    });

    it("should recursively unlock group children", () => {
      const lockedGroup: DocumentLayer = {
        ...mockGroupLayer,
        locked: true,
        children: [
          { ...mockRectLayer, locked: true },
          { ...mockTextLayer, locked: true },
        ],
      };

      const unlocked = unlockLayer(lockedGroup) as typeof lockedGroup;

      expect(unlocked.locked).toBe(false);
      expect(unlocked.children[0].locked).toBe(false);
      expect(unlocked.children[1].locked).toBe(false);
    });
  });
});
