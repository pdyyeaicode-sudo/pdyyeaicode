/**
 * resizeLayerCommand — resize a layer by replacing its spatial snapshot. Both
 * the previous and next snapshots are captured at construction so `undo`
 * restores the exact prior geometry/size (design.md "Command / History
 * System"). Callers compute and clamp the resulting geometry before building
 * the command; the command itself only substitutes captured values.
 *
 * Shapes carry a `ShapeGeometry`; images carry a position+size box; text layers
 * carry a position (their box is glyph-driven, so only x/y are restored).
 *
 * One responsibility per file: this module defines a single command factory.
 */

import type { Command, CreativeDocument, DocumentLayer, ShapeGeometry } from "../types/documentModel";
import { mapLayerInDoc } from "./helpers";

/** Spatial snapshot captured for a resize, discriminated by layer family. */
export type ResizeSnapshot =
  | { kind: "geometry"; geometry: ShapeGeometry }
  | { kind: "box"; x: number; y: number; width: number; height: number };

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

  if (layer.kind === "image") {
    return { ...layer, x: snapshot.x, y: snapshot.y, width: snapshot.width, height: snapshot.height };
  }
  if (layer.kind === "text") {
    return { ...layer, x: snapshot.x, y: snapshot.y };
  }
  return layer;
}
