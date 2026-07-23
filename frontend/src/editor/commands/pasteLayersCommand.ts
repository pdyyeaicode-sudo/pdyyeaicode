/**
 * pasteLayersCommand — Paste layers from clipboard with offset
 * 
 * Creates new layers from clipboard data with remapped IDs and 20px offset.
 * Supports pasting single layers, multiple layers, and groups with children.
 */

import type { Command, CreativeDocument, DocumentLayer } from "../types/documentModel";
import { getActiveArtboard, insertLayerAt, removeLayerById } from "./helpers";
import { remapLayerIds, offsetLayerPosition, unlockLayer } from "../utils/clipboard";

const PASTE_OFFSET = 20; // pixels

export interface PasteLayersCommandOptions {
  layers: DocumentLayer[];
  targetArtboardId?: string;
}

export function pasteLayersCommand(options: PasteLayersCommandOptions): Command {
  const { layers } = options;
  
  // Prepare layers: remap IDs, apply offset, unlock
  const preparedLayers = layers.map(layer => {
    const remapped = remapLayerIds(layer);
    const offset = offsetLayerPosition(remapped, PASTE_OFFSET, PASTE_OFFSET);
    return unlockLayer(offset);
  });
  
  const pastedIds = preparedLayers.map(l => l.id);

  return {
    type: "paste-layers",
    label: `Paste ${preparedLayers.length} layer${preparedLayers.length === 1 ? "" : "s"}`,

    apply(doc: CreativeDocument): CreativeDocument {
      const artboard = getActiveArtboard(doc);
      if (!artboard) {
        return doc;
      }

      // Insert all pasted layers at the end (top of z-order)
      let updatedLayers = [...artboard.layers];
      preparedLayers.forEach(layer => {
        updatedLayers = insertLayerAt(updatedLayers, layer, updatedLayers.length);
      });

      return {
        ...doc,
        pages: doc.pages.map(page =>
          page.id === doc.activePageId
            ? {
                ...page,
                artboards: page.artboards.map(ab =>
                  ab.id === doc.activeArtboardId
                    ? { ...ab, layers: updatedLayers }
                    : ab
                ),
              }
            : page
        ),
      };
    },

    undo(doc: CreativeDocument): CreativeDocument {
      const artboard = getActiveArtboard(doc);
      if (!artboard) {
        return doc;
      }

      // Remove all pasted layers
      let updatedLayers = artboard.layers;
      pastedIds.forEach(id => {
        updatedLayers = removeLayerById(updatedLayers, id);
      });

      return {
        ...doc,
        pages: doc.pages.map(page =>
          page.id === doc.activePageId
            ? {
                ...page,
                artboards: page.artboards.map(ab =>
                  ab.id === doc.activeArtboardId
                    ? { ...ab, layers: updatedLayers }
                    : ab
                ),
              }
            : page
        ),
      };
    },
  };
}
