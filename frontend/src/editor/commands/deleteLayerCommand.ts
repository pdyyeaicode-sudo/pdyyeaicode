/**
 * deleteLayerCommand — remove a top-level layer and capture enough to restore
 * it. `apply` removes the layer by id; `undo` reinserts the captured layer at
 * its exact prior position, restoring the document precisely.
 *
 * The caller captures the layer and its original index before building the
 * command, so the operation is pure and exactly invertible.
 *
 * One responsibility per file: this module defines a single command factory.
 */

import type { Command, CreativeDocument, DocumentLayer } from "../types/documentModel";
import { insertLayerAtPosition, mapActiveArtboardLayers, removeLayerFromTree, type LayerPosition } from "./helpers";

/**
 * Build a command that deletes `layer` and restores it at its exact
 * parent group and index position on undo.
 */
export function deleteLayerCommand(
  layer: DocumentLayer,
  position: number | LayerPosition
): Command {
  const pos: LayerPosition = typeof position === "number"
    ? { parentId: null, index: position }
    : position;

  return {
    type: "delete-layer",
    label: `Delete ${layer.kind}`,
    apply: (doc: CreativeDocument): CreativeDocument =>
      mapActiveArtboardLayers(doc, (layers) => removeLayerFromTree(layers, layer.id)),
    undo: (doc: CreativeDocument): CreativeDocument =>
      mapActiveArtboardLayers(doc, (layers) => insertLayerAtPosition(layers, layer, pos)),
  };
}
