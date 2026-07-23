/**
 * Barrel for the Command set (Command / History System).
 *
 * Re-exports every command factory and the shared pure helpers so callers (the
 * dispatcher in `useDesignStudio`, tools, and panels) can import from a single
 * entry point. Each command lives in its own single-responsibility module.
 */

export { translateLayerCommand } from "./translateLayerCommand";
export { resizeLayerCommand, type ResizeSnapshot } from "./resizeLayerCommand";
export { rotateLayerCommand, type RotateSnapshot } from "./rotateLayerCommand";
export {
  setPropertyCommand,
  type LayerPropName,
  type LayerPropValue,
} from "./setPropertyCommand";
export { createLayerCommand } from "./createLayerCommand";
export { textEditCommand } from "./textEditCommand";
export { reorderLayerCommand } from "./reorderLayerCommand";
export { groupCommand, type GroupCommandOptions } from "./groupCommand";
export { ungroupCommand } from "./ungroupCommand";
export { deleteLayerCommand } from "./deleteLayerCommand";
export { separateLayerCommand } from "./separateLayerCommand";
export { batchTranslateCommand, type LayerOffset } from "./batchTranslateCommand";
export { batchPropertyCommand } from "./batchPropertyCommand";
export {
  fitImageToMask,
  getMaskBounds,
  imageMaskSnapshot,
  isMaskShape,
  setImageMaskCommand,
  type ImageMaskSnapshot,
  type MaskBounds,
} from "./setImageMaskCommand";

// Re-export BoxSnapshot from documentModel for backwards compatibility
export type { BoxSnapshot } from "../types/documentModel";

export {
  getActiveArtboard,
  mapActiveArtboardLayers,
  mapLayerInDoc,
  mapLayerTree,
  findLayer,
  findParentChain,
  insertLayerAt,
  removeLayerById,
  removeLayerFromTree,
  findLayerPosition,
  insertLayerAtPosition,
  type LayerPosition,
  moveLayer,
  offsetLayer,
  translatePathData,
  mintId,
} from "./helpers";
