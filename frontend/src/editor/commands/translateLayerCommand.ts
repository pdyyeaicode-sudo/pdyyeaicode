/**
 * translateLayerCommand — move a layer by a pixel delta (drag, arrow-key nudge,
 * or snapped delta). Pure and exactly invertible: `apply` offsets by `(dx, dy)`
 * and `undo` offsets by `(-dx, -dy)` (design.md "Concrete command examples").
 *
 * Callers validate/clamp the delta before building the command; a zero delta
 * should be dropped by the dispatcher rather than recorded (Req 4.5, 4.6).
 *
 * One responsibility per file: this module defines a single command factory.
 */

import type { Command, CreativeDocument } from "../types/documentModel";
import { mapLayerInDoc, offsetLayer } from "./helpers";

/** Build a command that translates `layerId` by `(dx, dy)` pixels. */
export function translateLayerCommand(layerId: string, dx: number, dy: number): Command {
  return {
    type: "translate",
    label: "Move layer",
    apply: (doc: CreativeDocument): CreativeDocument =>
      mapLayerInDoc(doc, layerId, (layer) => offsetLayer(layer, dx, dy)),
    undo: (doc: CreativeDocument): CreativeDocument =>
      mapLayerInDoc(doc, layerId, (layer) => offsetLayer(layer, -dx, -dy)),
  };
}
