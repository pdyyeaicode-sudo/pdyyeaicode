/**
 * setGradientCommand — apply a gradient to a layer as ONE undoable step.
 *
 * A gradient edit touches two places: the artboard's `<defs>`, which holds the
 * paint server, and the layer's `fill`, which references it. Recording those as
 * two commands would make undo take two presses and, worse, allow a half-undone
 * state where a fill points at a definition that no longer exists.
 *
 * Exactly invertible: `undo` restores both the previous `defs` string and the
 * previous fill verbatim, so a gradient replacing a solid colour and a gradient
 * replacing another gradient both round-trip.
 *
 * One responsibility per file: this module defines a single command factory.
 */

import type { Command, CreativeDocument, DocumentLayer } from "../types/documentModel";
import {
  gradientFillReference,
  removeGradientFromDefs,
  upsertGradientInDefs,
  type GradientDefinition,
} from "../gradients/gradientModel";
import { mapLayerInDoc } from "./helpers";

/** Which paint the gradient is applied to. */
export type GradientTarget = "fill" | "stroke";

interface GradientSnapshot {
  readonly defs: string;
  readonly paint: string | undefined;
}

/**
 * Apply `gradient` to `layerId`.
 *
 * `previous` is captured by the caller from the live document, because a command
 * must be invertible without reading global state at undo time.
 */
export function setGradientCommand(
  layerId: string,
  gradient: GradientDefinition,
  previous: GradientSnapshot,
  target: GradientTarget = "fill",
): Command {
  const reference = gradientFillReference(gradient.id);

  return {
    type: "setGradient",
    label: gradient.kind === "linear" ? "Linear gradient" : "Radial gradient",
    apply: (doc: CreativeDocument): CreativeDocument =>
      withDefs(
        mapLayerInDoc(doc, layerId, (layer) => withPaint(layer, target, reference)),
        (defs) => upsertGradientInDefs(defs, gradient),
      ),
    undo: (doc: CreativeDocument): CreativeDocument =>
      withDefs(
        mapLayerInDoc(doc, layerId, (layer) => withPaint(layer, target, previous.paint)),
        // The previous defs string is restored verbatim rather than by removing
        // the gradient: the edit may have REPLACED an existing definition, and
        // removal would lose it.
        () => previous.defs,
      ),
  };
}

/** Remove a gradient from the document and restore a solid paint. */
export function clearGradientCommand(
  layerId: string,
  gradientId: string,
  previous: GradientSnapshot,
  solidColor: string,
  target: GradientTarget = "fill",
): Command {
  return {
    type: "clearGradient",
    label: "Remove gradient",
    apply: (doc: CreativeDocument): CreativeDocument =>
      withDefs(
        mapLayerInDoc(doc, layerId, (layer) => withPaint(layer, target, solidColor)),
        (defs) => removeGradientFromDefs(defs, gradientId),
      ),
    undo: (doc: CreativeDocument): CreativeDocument =>
      withDefs(
        mapLayerInDoc(doc, layerId, (layer) => withPaint(layer, target, previous.paint)),
        () => previous.defs,
      ),
  };
}

/**
 * Replace the active artboard's `defs`.
 *
 * Only the active artboard is touched, matching every other command factory, so
 * the history layer's post-condition check behaves consistently.
 */
function withDefs(
  doc: CreativeDocument,
  transform: (defs: string) => string,
): CreativeDocument {
  return {
    ...doc,
    pages: doc.pages.map((page) => ({
      ...page,
      artboards: page.artboards.map((artboard) =>
        page.id === doc.activePageId && artboard.id === doc.activeArtboardId
          ? { ...artboard, defs: transform(artboard.defs) }
          : artboard,
      ),
    })),
  };
}

function withPaint(
  layer: DocumentLayer,
  target: GradientTarget,
  value: string | undefined,
): DocumentLayer {
  // Only shape-like layers carry a stroke; text and image layers have a fill
  // only, so a stroke target on them is ignored rather than inventing a field.
  if (target === "stroke") {
    return "stroke" in layer ? ({ ...layer, stroke: value } as DocumentLayer) : layer;
  }
  return "fill" in layer ? ({ ...layer, fill: value } as DocumentLayer) : layer;
}
