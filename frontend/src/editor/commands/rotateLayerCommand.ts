import type { Command, CreativeDocument, DocumentLayer } from "../types/documentModel";
import { mapLayerInDoc } from "./helpers";

/** Transform snapshot used for rotation command. */
export type RotateSnapshot = { kind: "transform"; transform?: string };

export function rotateLayerCommand(layerId: string, prev: RotateSnapshot, next: RotateSnapshot): Command {
  return {
    type: "rotate",
    label: "Rotate layer",
    apply: (doc: CreativeDocument): CreativeDocument =>
      mapLayerInDoc(doc, layerId, (layer) => applySnapshot(layer, next)),
    undo: (doc: CreativeDocument): CreativeDocument =>
      mapLayerInDoc(doc, layerId, (layer) => applySnapshot(layer, prev)),
  };
}

function applySnapshot(layer: DocumentLayer, snap: RotateSnapshot): DocumentLayer {
  if (snap.kind === "transform") {
    return { ...layer, transform: snap.transform };
  }
  return layer;
}

export default rotateLayerCommand;
