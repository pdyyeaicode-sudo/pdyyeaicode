/**
 * reorderLayerCommand — move a top-level layer to a new z-position. `apply`
 * moves the layer from `fromIndex` to `toIndex`; `undo` moves it back, and both
 * preserve the relative order of all other layers (Req 3.3; design.md
 * "Command / History System").
 *
 * The caller computes valid in-range indices before building the command.
 *
 * One responsibility per file: this module defines a single command factory.
 */

import type { Command, CreativeDocument, DocumentLayer } from "../types/documentModel";
import { mapActiveArtboardLayers, moveLayer } from "./helpers";

/**
 * Build a command that moves the top-level layer at `fromIndex` to `toIndex`.
 * `layerId` is retained for history/inspector display and intent matching.
 */
export function reorderLayerCommand(
  layerId: string,
  fromIndex: number,
  toIndex: number,
  parentId: string | null = null,
): Command {
  return {
    type: "reorder",
    label: `Reorder ${layerId}`,
    apply: (doc: CreativeDocument): CreativeDocument =>
      mapActiveArtboardLayers(
        doc,
        (layers) => moveLayerWithinParent(layers, parentId, fromIndex, toIndex),
      ),
    undo: (doc: CreativeDocument): CreativeDocument =>
      mapActiveArtboardLayers(
        doc,
        (layers) => moveLayerWithinParent(layers, parentId, toIndex, fromIndex),
      ),
  };
}

function moveLayerWithinParent(
  layers: DocumentLayer[],
  parentId: string | null,
  fromIndex: number,
  toIndex: number,
): DocumentLayer[] {
  if (parentId === null) {
    return moveLayer(layers, fromIndex, toIndex);
  }
  return layers.map((layer) => {
    if (layer.id === parentId && layer.kind === "group") {
      return {
        ...layer,
        children: moveLayer(layer.children, fromIndex, toIndex),
      };
    }
    if (layer.kind === "group") {
      return {
        ...layer,
        children: moveLayerWithinParent(layer.children, parentId, fromIndex, toIndex),
      };
    }
    return layer;
  });
}
