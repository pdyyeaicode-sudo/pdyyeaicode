/**
 * resizeGeometry — turn new LOCAL bounds into the layer's actual geometry.
 *
 * `selectionGeometry.resizeLocalBounds` answers "what rectangle should this
 * object occupy in its own space". This file answers "what does that mean for
 * the numbers the document stores", which is a different question per geometry
 * kind: a rect has x/y/width/height, an ellipse has a centre and radii, a
 * polygon has a point list.
 *
 * ## Why this file exists at all
 *
 * `resizeLayerCommand` accepts `{ kind: "box" }` and `{ kind: "geometry" }`
 * snapshots, and `applySnapshot` handles a box only for image and text layers —
 * for a shape it returns the layer UNCHANGED. `SelectionOverlay` was passing a box
 * for everything, so resizing any rect, ellipse, line, polygon or path silently
 * did nothing to the document: the handles moved, the measurement label counted
 * up, and on release the shape snapped back. Producing a real `ShapeGeometry` is
 * what makes shape resize work.
 *
 * ## The one case that cannot be rewritten
 *
 * Path data cannot be rescaled exactly without a full path parser that also maps
 * elliptical arc radii and axis rotation. Rather than approximate that silently,
 * `resizeShapeGeometry` returns null for a path and the caller composes an affine
 * into the layer's `transform` instead — which is exact for every command type,
 * arcs included. The tradeoff is that a transform also scales stroke width, so it
 * is used only where the alternative would be wrong.
 *
 * All mapping is a local-space affine: scale about the old bounds' origin, then
 * translate onto the new bounds. Negative extents are preserved, because a resize
 * dragged past its anchor is a flip and a flip is a valid transform.
 *
 * One responsibility per file: mapping new local bounds onto document geometry.
 */

import type { RectF } from "../renderer/matrix2d";
import type { ShapeGeometry } from "../types/documentModel";

/** The affine that maps `from` onto `to`, in the geometry's own space. */
export interface BoundsMapping {
  readonly scaleX: number;
  readonly scaleY: number;
  readonly translateX: number;
  readonly translateY: number;
}

/**
 * Solve `to = scale * (point - from.origin) + to.origin`.
 *
 * Returns null when `from` has zero extent on an axis, because the scale factor
 * is then undefined — a zero-width shape cannot be scaled to a non-zero width by
 * multiplication. The caller reports that rather than dividing by zero and
 * producing Infinity.
 */
export function boundsMapping(from: RectF, to: RectF): BoundsMapping | null {
  if (from.width === 0 || from.height === 0) {
    return null;
  }
  const scaleX = to.width / from.width;
  const scaleY = to.height / from.height;
  if (![scaleX, scaleY, to.x, to.y, from.x, from.y].every(Number.isFinite)) {
    return null;
  }
  return {
    scaleX,
    scaleY,
    translateX: to.x - from.x * scaleX,
    translateY: to.y - from.y * scaleY,
  };
}

const mapX = (mapping: BoundsMapping, x: number): number => x * mapping.scaleX + mapping.translateX;
const mapY = (mapping: BoundsMapping, y: number): number => y * mapping.scaleY + mapping.translateY;

/**
 * The SVG transform string that applies `mapping` in the geometry's own space.
 *
 * Appended to the layer's existing transform, so it acts on geometry coordinates
 * rather than in the parent's space. Used for the live preview of every geometry
 * kind, and as the commit mechanism for paths.
 */
export function boundsMappingTransform(mapping: BoundsMapping): string {
  const format = (value: number): string =>
    Number.parseFloat(value.toFixed(6)).toString();
  return (
    `translate(${format(mapping.translateX)} ${format(mapping.translateY)}) `
    + `scale(${format(mapping.scaleX)} ${format(mapping.scaleY)})`
  );
}

/**
 * `geometry` resized so its bounds go from `from` to `to`.
 *
 * Returns null when the geometry cannot be rewritten exactly (path data) or when
 * the mapping is undefined (zero-extent source). Never returns an approximation.
 */
export function resizeShapeGeometry(
  geometry: ShapeGeometry,
  from: RectF,
  to: RectF,
): ShapeGeometry | null {
  const mapping = boundsMapping(from, to);
  if (mapping === null) {
    return null;
  }

  switch (geometry.type) {
    case "rect": {
      // Normalised so a flipped drag produces a positive-extent rect at the
      // mirrored position: SVG rejects a negative width outright.
      const x1 = mapX(mapping, geometry.x);
      const y1 = mapY(mapping, geometry.y);
      const x2 = mapX(mapping, geometry.x + geometry.width);
      const y2 = mapY(mapping, geometry.y + geometry.height);
      return {
        ...geometry,
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      };
    }
    case "ellipse":
      return {
        ...geometry,
        cx: mapX(mapping, geometry.cx),
        cy: mapY(mapping, geometry.cy),
        // Radii are lengths, so only the scale applies — and they must stay
        // positive, which is what makes a mirrored ellipse identical to itself.
        rx: Math.abs(geometry.rx * mapping.scaleX),
        ry: Math.abs(geometry.ry * mapping.scaleY),
      };
    case "line":
      return {
        ...geometry,
        x1: mapX(mapping, geometry.x1),
        y1: mapY(mapping, geometry.y1),
        x2: mapX(mapping, geometry.x2),
        y2: mapY(mapping, geometry.y2),
      };
    case "polygon":
      return {
        ...geometry,
        points: geometry.points.map(
          ([x, y]) => [mapX(mapping, x), mapY(mapping, y)] as [number, number],
        ),
      };
    case "parametric": {
      const x1 = mapX(mapping, geometry.x);
      const y1 = mapY(mapping, geometry.y);
      const x2 = mapX(mapping, geometry.x + geometry.width);
      const y2 = mapY(mapping, geometry.y + geometry.height);
      // The parameters stay as authored: they are ratios and flags interpreted
      // against width/height by the shape generator, so rescaling the box is the
      // whole resize. Scaling them too would compound.
      return {
        ...geometry,
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      };
    }
    case "path":
      // Deliberately not attempted. See the file header: exact path rescaling
      // needs arc radius and axis-rotation mapping, and a wrong curve is worse
      // than a transform that also scales the stroke.
      return null;
  }
}

/** True when `resizeShapeGeometry` can rewrite this kind exactly. */
export function isRewritableGeometry(geometry: ShapeGeometry): boolean {
  return geometry.type !== "path";
}
