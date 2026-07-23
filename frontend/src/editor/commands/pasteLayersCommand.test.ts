/**
 * pasteLayersCommand — unit tests
 */

import { describe, it, expect } from "vitest";
import { pasteLayersCommand } from "./pasteLayersCommand";
import type { CreativeDocument, DocumentLayer } from "../types/documentModel";

const mockDocument: CreativeDocument = {
  schemaVersion: 1,
  name: "Test Document",
  activePageId: "page1",
  activeArtboardId: "artboard1",
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
          layers: [
            {
              id: "existing1",
              kind: "rect",
              role: "shapes",
              name: "Existing Rectangle",
              editable: true,
              locked: false,
              visible: true,
              opacity: 100,
              field: "rect1",
              geometry: { type: "rect", x: 0, y: 0, width: 100, height: 100 },
            } as DocumentLayer,
          ],
          defs: "",
          rootAttributes: {},
        },
      ],
    },
  ],
};

const layerToPaste: DocumentLayer = {
  id: "paste1",
  kind: "rect",
  role: "shapes",
  name: "Pasted Rectangle",
  editable: true,
  locked: false,
  visible: true,
  opacity: 100,
  field: "rect2",
  geometry: { type: "rect", x: 50, y: 50, width: 100, height: 100 },
};

describe("pasteLayersCommand", () => {
  it("should paste layer with new ID", () => {
    const command = pasteLayersCommand({ layers: [layerToPaste] });
    const result = command.apply(mockDocument);

    const artboard = result.pages[0].artboards[0];
    expect(artboard.layers).toHaveLength(2);
    
    const pastedLayer = artboard.layers[1];
    expect(pastedLayer.id).not.toBe("paste1"); // ID should be remapped
    expect(pastedLayer.name).toBe("Pasted Rectangle");
  });

  it("should apply 20px offset to pasted layer", () => {
    const command = pasteLayersCommand({ layers: [layerToPaste] });
    const result = command.apply(mockDocument);

    const pastedLayer = result.pages[0].artboards[0].layers[1];
    if (pastedLayer.kind === "rect" && pastedLayer.geometry) {
      const geom = pastedLayer.geometry;
      if (geom.type === "rect") {
        expect(geom.x).toBe(70); // 50 + 20
        expect(geom.y).toBe(70); // 50 + 20
      }
    }
  });

  it("should paste multiple layers", () => {
    const layer2: DocumentLayer = {
      ...layerToPaste,
      id: "paste2",
      name: "Second Pasted",
    };
    
    const command = pasteLayersCommand({ layers: [layerToPaste, layer2] });
    const result = command.apply(mockDocument);

    const artboard = result.pages[0].artboards[0];
    expect(artboard.layers).toHaveLength(3);
  });

  it("should unlock locked layers when pasting", () => {
    const lockedLayer: DocumentLayer = {
      ...layerToPaste,
      locked: true,
    };
    
    const command = pasteLayersCommand({ layers: [lockedLayer] });
    const result = command.apply(mockDocument);

    const pastedLayer = result.pages[0].artboards[0].layers[1];
    expect(pastedLayer.locked).toBe(false);
  });

  it("should undo paste by removing pasted layers", () => {
    const command = pasteLayersCommand({ layers: [layerToPaste] });
    const applied = command.apply(mockDocument);
    const undone = command.undo(applied);

    const artboard = undone.pages[0].artboards[0];
    expect(artboard.layers).toHaveLength(1);
    expect(artboard.layers[0].id).toBe("existing1");
  });

  it("should handle paste with group containing children", () => {
    const groupLayer: DocumentLayer = {
      id: "group1",
      kind: "group",
      role: "shapes",
      name: "Group",
      editable: true,
      locked: false,
      visible: true,
      opacity: 100,
      children: [layerToPaste],
    };
    
    const command = pasteLayersCommand({ layers: [groupLayer] });
    const result = command.apply(mockDocument);

    const pastedGroup = result.pages[0].artboards[0].layers[1] as typeof groupLayer;
    expect(pastedGroup.kind).toBe("group");
    expect(pastedGroup.children).toHaveLength(1);
    expect(pastedGroup.children[0].id).not.toBe("paste1"); // Child ID remapped
  });

  it("should generate correct command label", () => {
    const command1 = pasteLayersCommand({ layers: [layerToPaste] });
    expect(command1.label).toBe("Paste 1 layer");

    const command2 = pasteLayersCommand({ layers: [layerToPaste, layerToPaste] });
    expect(command2.label).toBe("Paste 2 layers");
  });
});
