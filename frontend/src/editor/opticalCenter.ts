import type { ShapeLayer, ImageLayer, GroupLayer, TextLayer } from "./types/documentModel";
import { getLayerBox } from "./propertyEditing";

/**
 * Calculates the optical center (centroid) of a layer, which may differ from
 * the geometric center of its bounding box.
 */
export function getOpticalCenter(layer: ShapeLayer | ImageLayer | GroupLayer | TextLayer): { x: number, y: number } {
  // If it's a polygon, compute true centroid
  if (layer.kind === "polygon") {
    const pts = (layer.geometry as any).points as Array<[number, number]>;
    let sumX = 0;
    let sumY = 0;
    for (const [px, py] of pts) {
      sumX += px;
      sumY += py;
    }
    return {
      x: sumX / pts.length,
      y: sumY / pts.length
    };
  }

  // If it's an ellipse, it's just cx/cy
  if (layer.kind === "ellipse") {
    return {
      x: (layer.geometry as any).cx,
      y: (layer.geometry as any).cy
    };
  }

  // Fallback to bounding box center
  const box = getLayerBox(layer as any);
  if (!box) return { x: 0, y: 0 };
  return {
    x: box.x + (box.width / 2),
    y: box.y + (box.height / 2)
  };
}
