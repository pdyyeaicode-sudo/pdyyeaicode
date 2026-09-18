/**
 * resizeLayerCommand — resize a layer by replacing its spatial snapshot. Both
 * the previous and next snapshots are captured at construction so `undo`
 * restores the exact prior geometry/size (design.md "Command / History
 * System"). Callers compute and clamp the resulting geometry before building
 * the command; the command itself only substitutes captured values.
 *
 * Three snapshot kinds, because three families of layer store their size
 * differently:
 *
 *  - `geometry` — shapes, whose `ShapeGeometry` numbers are rewritten.
 *  - `box` — images, whose x/y/width/height IS their geometry, and text layers,
 *    for which only the position is restorable (the box is glyph-driven).
 *  - `transform` — text, groups and path data, whose size cannot be expressed as
 *    four numbers. `geometry/resizeGeometry.ts` explains why an approximate path
 *    rescale is refused rather than guessed.
 *
 * One responsibility per file: this module defines a single command factory.
 */

import type { Command, CreativeDocument, DocumentLayer, ResizeSnapshot } from "../types/documentModel";
import { mapLayerInDoc } from "./helpers";

/**
 * The snapshot union lives in `documentModel` so there is exactly ONE definition.
 *
 * It used to be declared here as well and the two drifted: widening one left the
 * other narrower, and the mismatch surfaced only where a prop typed from one file
 * was handed to a component typed from the other. Re-exported for existing import
 * sites.
 */
export type { ResizeSnapshot };

/**
 * Build a command that resizes `layerId` from `prev` to `next`. `prev` and
 * `next` are captured at construction so the operation is exactly invertible.
 */
export function resizeLayerCommand(layerId: string, prev: ResizeSnapshot, next: ResizeSnapshot): Command {
  return {
    type: "resize",
    label: "Resize layer",
    apply: (doc: CreativeDocument): CreativeDocument =>
      mapLayerInDoc(doc, layerId, (layer) => applySnapshot(layer, next)),
    undo: (doc: CreativeDocument): CreativeDocument =>
      mapLayerInDoc(doc, layerId, (layer) => applySnapshot(layer, prev)),
  };
}

function applySnapshot(layer: DocumentLayer, snapshot: ResizeSnapshot): DocumentLayer {
  if (snapshot.kind === "geometry") {
    if (layer.kind !== "text" && layer.kind !== "image" && layer.kind !== "group") {
      return { ...layer, geometry: snapshot.geometry };
    }
    return layer;
  }

  // Applies to every layer kind: a transform is how a text layer, a group or a
  // path records a size change, and `undo` restores the previous string exactly.
  if (snapshot.kind === "transform") {
    return { ...layer, transform: snapshot.transform };
  }

  if (layer.kind === "image") {
    return { ...layer, x: snapshot.x, y: snapshot.y, width: snapshot.width, height: snapshot.height };
  }
  if (layer.kind === "text") {
    return { ...layer, x: snapshot.x, y: snapshot.y };
  }
  return layer;
}
