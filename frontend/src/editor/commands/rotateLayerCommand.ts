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
  if (snap.kind !== "transform") {
    return layer;
  }
  if (snap.transform === undefined || snap.transform.trim() === "") {
    /*
      The key is REMOVED, not set to `undefined`.

      `{ ...layer, transform: undefined }` leaves `transform` present with an
      undefined value, and the serializer's `'transform' in layer` check then tried
      to escape `undefined` and threw — which unmounted the editor on the first
      Ctrl+Z after rotating a shape that had no transform before. The serializer is
      now type-safe about this as well, but producing the object correctly here means
      no other consumer has to defend against it.
    */
    const { transform: _dropped, ...withoutTransform } = layer as DocumentLayer & {
      transform?: string;
    };
    return withoutTransform as DocumentLayer;
  }
  return { ...layer, transform: snap.transform };
}

export default rotateLayerCommand;
