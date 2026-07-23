/**
 * batchDeleteCommand — Delete multiple layers atomically
 * 
 * Removes multiple layers in a single command, preserving them for undo.
 * Filters out locked layers before deletion.
 */

import type { Command, CreativeDocument, DocumentLayer } from "../types/documentModel";
import { getActiveArtboard, removeLayerById, insertLayerAtPosition, findLayerPosition, type LayerPosition } from "./helpers";
import { LOCKED_ROLES } from "../types/documentModel";

export interface BatchDeleteCommandOptions {
  layerIds: string[];
}

interface DeletedLayerInfo {
  layer: DocumentLayer;
  position: LayerPosition;
}

export function batchDeleteCommand(options: BatchDeleteCommandOptions): Command {
  const { layerIds } = options;
  const deletedLayers: DeletedLayerInfo[] = [];

  return {
    type: "batch-delete",
    label: `Delete ${layerIds.length} layer${layerIds.length === 1 ? "" : "s"}`,

    apply(doc: CreativeDocument): CreativeDocument {
      const artboard = getActiveArtboard(doc);
      if (!artboard) {
        return doc;
      }

      let updatedLayers = artboard.layers;
      deletedLayers.length = 0; // Clear for re-apply

      // Collect layers to delete and their positions
      layerIds.forEach(layerId => {
        const position = findLayerPosition(updatedLayers, layerId);
        if (!position) return;

        // Find the actual layer using the position
        let layer: DocumentLayer | null = null;
        if (position.parentId) {
          // Find parent group and get layer from its children
          const findLayerById = (layers: DocumentLayer[], id: string): DocumentLayer | null => {
            for (const l of layers) {
              if (l.id === id) return l;
              if (l.kind === 'group' && l.children) {
                const found = findLayerById(l.children, id);
                if (found) return found;
              }
            }
            return null;
          };
          const parentLayer = findLayerById(updatedLayers, position.parentId);
          if (parentLayer && parentLayer.kind === 'group' && parentLayer.children) {
            layer = parentLayer.children[position.index];
          }
        } else {
          layer = updatedLayers[position.index];
        }

        if (!layer) return;

        // Skip locked layers and role-locked layers
        if (layer.locked || LOCKED_ROLES.has(layer.role)) {
          return;
        }

        deletedLayers.push({ layer, position });
      });

      // Remove layers (in reverse order to maintain indices)
      deletedLayers.reverse().forEach(({ layer }) => {
        updatedLayers = removeLayerById(updatedLayers, layer.id);
      });

      // Reverse back for undo
      deletedLayers.reverse();

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

      let updatedLayers = artboard.layers;

      // Re-insert layers at their original positions
      deletedLayers.forEach(({ layer, position }) => {
        updatedLayers = insertLayerAtPosition(updatedLayers, layer, position);
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
