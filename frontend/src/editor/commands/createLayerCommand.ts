/**
 * createLayerCommand — insert a newly built layer (shape, image, text, or path)
 * into the active artboard's top-level layer list. `apply` inserts the layer at
 * the target position and `undo` removes it, restoring the prior state exactly
 * (Req 5.5, 7.5, 8.4; design.md "Command / History System").
 *
 * The fully-formed layer (including its unique `data-layer-id` and non-empty
 * `data-field`) is built and validated by the caller; degenerate shapes are
 * discarded before a command is created (Req 5.7).
 *
 * One responsibility per file: this module defines a single command factory.
 */

import type { Command, CreativeDocument, DocumentLayer } from "../types/documentModel";
import { insertLayerAt, mapActiveArtboardLayers, removeLayerById, insertLayerAtPosition, type LayerPosition } from "./helpers";

/**
 * Build a command that inserts `layer` at `position` among the active
 * artboard's layers. When `position` is a LayerPosition, it is inserted at that
 * parent group and index.
 */
export function createLayerCommand(layer: DocumentLayer, position?: number | LayerPosition): Command {
  return {
    type: "create-layer",
    label: `Create ${layer.kind}`,
    apply: (doc: CreativeDocument): CreativeDocument =>
      mapActiveArtboardLayers(doc, (layers) => {
        if (position && typeof position === "object") {
          return insertLayerAtPosition(layers, layer, position);
        }
        
        // Find the top-level group matching the layer's role
        const groupIndex = layers.findIndex(l => l.kind === "group" && l.role === layer.role);
        if (groupIndex === -1) {
          // Fallback: append at top level if no matching group exists
          return insertLayerAt(layers, layer, typeof position === "number" ? position : layers.length);
        }
        
        // Insert into the matching group's children
        const group = layers[groupIndex];
        if (group.kind !== "group") return layers;
        
        const nextGroup = {
          ...group,
          children: insertLayerAt(group.children, layer, typeof position === "number" ? position : group.children.length)
        };
        
        const nextLayers = [...layers];
        nextLayers[groupIndex] = nextGroup;
        return nextLayers;
      }),
    undo: (doc: CreativeDocument): CreativeDocument =>
      mapActiveArtboardLayers(doc, (layers) => removeLayerById(layers, layer.id)),
  };
}
