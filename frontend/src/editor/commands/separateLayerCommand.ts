/**
 * separateLayerCommand — remove a nested layer from its parent group
 * and place it directly at the root level of the active artboard.
 * `apply` moves the layer; `undo` restores it back to its original nested position.
 *
 * One responsibility per file: this module defines a single command factory.
 */

import type { Command, CreativeDocument, DocumentLayer } from "../types/documentModel";
import { insertLayerAt, insertLayerAtPosition, mapActiveArtboardLayers, removeLayerFromTree, type LayerPosition } from "./helpers";

/**
 * Build a command that separates a nested `layer` from its group, placing it
 * as a standalone layer at the root level.
 */
export function separateLayerCommand(
  layer: DocumentLayer,
  position: LayerPosition
): Command {
  return {
    type: "separate-layer",
    label: `Separate ${layer.name}`,
    apply: (doc: CreativeDocument): CreativeDocument =>
      mapActiveArtboardLayers(doc, (layers) => {
        // Remove from the current nested group position
        const withoutLayer = removeLayerFromTree(layers, layer.id);

        // Find the index of the parent group in the root layers list to insert next to it
        const parentIndex = withoutLayer.findIndex((l) => l.id === position.parentId);
        const insertIndex = parentIndex !== -1 ? parentIndex + 1 : withoutLayer.length;

        // Insert at root level
        return insertLayerAt(withoutLayer, layer, insertIndex);
      }),
    undo: (doc: CreativeDocument): CreativeDocument =>
      mapActiveArtboardLayers(doc, (layers) => {
        // Remove from root level
        const withoutLayer = removeLayerFromTree(layers, layer.id);
        // Insert back to original group and index position
        return insertLayerAtPosition(withoutLayer, layer, position);
      }),
  };
}
