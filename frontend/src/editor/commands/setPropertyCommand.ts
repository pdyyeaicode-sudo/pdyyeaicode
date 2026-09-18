/**
 * setPropertyCommand — change a single editable property of a layer (fill,
 * stroke, stroke-width, opacity, name, visibility, or typography). The previous
 * and next values are captured at construction so `undo` restores the exact
 * prior value (design.md "Concrete command examples").
 *
 * Validation and clamping happen in the caller BEFORE the command is built
 * (font-size clamped to 12..200 per Req 6.6; opacity rejected outside 0..100
 * per Req 9.5; unparseable colors rejected per Req 9.5). A rejected value
 * yields no command at all.
 *
 * One responsibility per file: this module defines a single command factory.
 */

import type { Command, CreativeDocument, DocumentLayer } from "../types/documentModel";
import { mapLayerInDoc } from "./helpers";

/** Editable layer properties addressable by `setPropertyCommand`. */
export type LayerPropName =
  | "name"
  | "opacity"
  | "visible"
  | "locked"
  | "fill"
  | "stroke"
  | "strokeWidth"
  | "filter"
  | "fontFamily"
  | "fontSize"
  | "fontWeight"
  | "fontStyle"
  | "textDecoration"
  | "textAlign"
  | "lineHeight"
  | "letterSpacing"
  | "wordSpacing"
  | "baselineShift"
  | "textTransform"
  | "direction"
  | "writingMode"
  | "href"
  | "width"
  | "height"
  | "geometry"
  | "blendMode"
  | "effectStack"
  | "clipPathId";

export type LayerPropValue = string | number | boolean | object | undefined;

/**
 * Build a command that sets `prop` on `layerId` to `nextValue`, restoring
 * `prevValue` on undo. The caller supplies validated/clamped values.
 */
export function setPropertyCommand(
  layerId: string,
  prop: LayerPropName,
  prevValue: LayerPropValue,
  nextValue: LayerPropValue,
): Command {
  return {
    type: "set-property",
    label: `Edit ${prop}`,
    apply: (doc: CreativeDocument): CreativeDocument =>
      mapLayerInDoc(doc, layerId, (layer) => withProperty(layer, prop, nextValue)),
    undo: (doc: CreativeDocument): CreativeDocument =>
      mapLayerInDoc(doc, layerId, (layer) => withProperty(layer, prop, prevValue)),
  };
}

function withProperty(layer: DocumentLayer, prop: LayerPropName, value: LayerPropValue): DocumentLayer {
  // The caller targets a layer that actually carries `prop`; the structural
  // assignment below stays type-safe because every value is a primitive that
  // matches the corresponding field's type.
  return { ...layer, [prop]: value } as DocumentLayer;
}
