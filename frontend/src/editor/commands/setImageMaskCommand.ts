/**
 * Nondestructive image masking.
 *
 * The source raster remains unchanged in `ImageLayer.href`. Masking only
 * updates the image placement and its reference to an existing shape layer,
 * so apply/undo are exact and remain compatible with command history.
 */

import type {
  Command,
  CreativeDocument,
  DocumentLayer,
  ImageLayer,
  ShapeLayer,
} from "../types/documentModel";
import { mapLayerInDoc } from "./helpers";

export interface ImageMaskSnapshot {
  clipPathId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MaskBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function imageMaskSnapshot(image: ImageLayer): ImageMaskSnapshot {
  return {
    ...(image.clipPathId ? { clipPathId: image.clipPathId } : {}),
    x: image.x,
    y: image.y,
    width: image.width,
    height: image.height,
  };
}

export function isMaskShape(layer: DocumentLayer): layer is ShapeLayer {
  return (
    layer.kind === "rect" ||
    layer.kind === "ellipse" ||
    layer.kind === "polygon" ||
    layer.kind === "path"
  );
}

export function getMaskBounds(mask: ShapeLayer): MaskBounds | null {
  const { geometry } = mask;
  switch (geometry.type) {
    case "rect":
      return {
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
      };
    case "ellipse":
      return {
        x: geometry.cx - geometry.rx,
        y: geometry.cy - geometry.ry,
        width: geometry.rx * 2,
        height: geometry.ry * 2,
      };
    case "polygon": {
      if (geometry.points.length < 3) {
        return null;
      }
      const xs = geometry.points.map(([x]) => x);
      const ys = geometry.points.map(([, y]) => y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return {
        x,
        y,
        width: Math.max(...xs) - x,
        height: Math.max(...ys) - y,
      };
    }
    case "path":
    case "line":
    default:
      return null;
  }
}

/**
 * Fit the image over the mask bounds while retaining its current aspect ratio.
 * Free-form paths can still be used as masks, but keep the existing placement
 * because their bounds cannot be derived safely without resolving SVG paths.
 */
export function fitImageToMask(image: ImageLayer, mask: ShapeLayer): ImageMaskSnapshot {
  const bounds = getMaskBounds(mask);
  if (
    bounds === null ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    image.width <= 0 ||
    image.height <= 0
  ) {
    return { ...imageMaskSnapshot(image), clipPathId: mask.id };
  }

  const scale = Math.max(bounds.width / image.width, bounds.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;

  return {
    clipPathId: mask.id,
    x: bounds.x + (bounds.width - width) / 2,
    y: bounds.y + (bounds.height - height) / 2,
    width,
    height,
  };
}

export function setImageMaskCommand(
  imageId: string,
  previous: ImageMaskSnapshot,
  next: ImageMaskSnapshot,
): Command {
  return {
    type: "set-image-mask",
    label: next.clipPathId ? "Apply image mask" : "Remove image mask",
    apply: (doc: CreativeDocument): CreativeDocument =>
      mapLayerInDoc(doc, imageId, (layer) => applySnapshot(layer, next)),
    undo: (doc: CreativeDocument): CreativeDocument =>
      mapLayerInDoc(doc, imageId, (layer) => applySnapshot(layer, previous)),
  };
}

function applySnapshot(layer: DocumentLayer, snapshot: ImageMaskSnapshot): DocumentLayer {
  if (layer.kind !== "image") {
    return layer;
  }

  const { clipPathId: _currentClipPathId, ...withoutClipPath } = layer;
  return {
    ...withoutClipPath,
    ...(snapshot.clipPathId ? { clipPathId: snapshot.clipPathId } : {}),
    x: snapshot.x,
    y: snapshot.y,
    width: snapshot.width,
    height: snapshot.height,
  };
}
