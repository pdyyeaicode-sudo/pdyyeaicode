/**
 * selectionMath — pure, side-effect-free geometry and set algebra for the
 * Editor_Canvas selection subsystem (task 5.5).
 *
 * Everything here is a pure function over plain numbers/strings so it is
 * trivially unit- and property-testable (supports Property 8 selection-set
 * transitions and Property 28 combined selection bounding box). The functions
 * never touch the DOM or the Document_Model: the `SelectionOverlay` component
 * reads on-screen bounding boxes from the SVG (via `getBoundingClientRect`) and
 * feeds those plain `BBox` values into these helpers.
 *
 * Conventions:
 *   - A `BBox` is an axis-aligned box `{ x, y, width, height }` where `(x, y)`
 *     is the top-left corner and `width`/`height` are non-negative.
 *   - "Fully enclosed" means an inner box lies entirely within an outer box,
 *     matching Requirement 1's marquee selection ("fully enclosed"), not mere
 *     intersection.
 *
 * One responsibility per file: selection set algebra + selection geometry.
 */

import type { Viewport } from "./types/documentModel";

/** Axis-aligned bounding box with a top-left origin and non-negative size. */
export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A layer identifier paired with its (screen-space) bounding box and optional rotation. */
export interface LayerRotation {
  angle: number;
  cx: number;
  cy: number;
}

export interface LayerBox {
  id: string;
  box: BBox;
  rotation?: LayerRotation;
}

/** The eight selection-handle anchor positions around a bounding box. */
export type HandlePosition = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export interface ResizeBoxOptions {
  minSize?: number;
  preserveAspectRatio?: boolean;
  resizeFromCenter?: boolean;
}

/** A single selection handle anchor in the same coordinate space as its box. */
export interface SelectionHandle {
  position: HandlePosition;
  x: number;
  y: number;
}

/**
 * Toggle a layer's membership in a selection set (Req 1.9, 1.10): add it when
 * absent, remove it when present. Pure: returns a new array, never mutates the
 * input. Toggling the same id twice restores the original set.
 */
export function toggleSelection(layerIds: readonly string[], layerId: string): string[] {
  return layerIds.includes(layerId)
    ? layerIds.filter((id) => id !== layerId)
    : [...layerIds, layerId];
}

/**
 * Compute the axis-aligned union of a set of bounding boxes — the combined
 * bounding box used to draw the selection handles (Req 1.12, Property 28).
 * Returns `null` for an empty input so callers render no handles.
 */
export function unionBBoxes(boxes: readonly BBox[]): BBox | null {
  if (boxes.length === 0) {
    return null;
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Build a normalized `BBox` from two corner points (e.g. marquee anchor and the
 * current pointer). The result always has a non-negative width/height
 * regardless of drag direction.
 */
export function rectFromPoints(x0: number, y0: number, x1: number, y1: number): BBox {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}

/**
 * Whether `inner` lies entirely within `outer` (edges touching counts as
 * enclosed). This is the marquee "fully enclosed" predicate from Requirement 1
 * — a layer is selected only when its whole bounding box is inside the rubber
 * band, not merely overlapping it.
 */
export function isFullyEnclosed(inner: BBox, outer: BBox): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * Given the editable layers' bounding boxes and a marquee rectangle, return the
 * ids of every layer fully enclosed by the marquee (Req 1.12 marquee behavior).
 * A degenerate (zero-area) marquee encloses nothing, so the selection becomes
 * empty.
 */
export function selectEnclosed(items: readonly LayerBox[], marquee: BBox): string[] {
  if (marquee.width <= 0 || marquee.height <= 0) {
    return [];
  }
  return items.filter((item) => isFullyEnclosed(item.box, marquee)).map((item) => item.id);
}

/**
 * Compute the eight handle anchor points around a bounding box: the four
 * corners and the four edge midpoints (Req 1.12). Returned in a stable order
 * (nw, n, ne, e, se, s, sw, w) in the box's own coordinate space.
 */
export function computeHandles(box: BBox): SelectionHandle[] {
  const left = box.x;
  const top = box.y;
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const midX = box.x + box.width / 2;
  const midY = box.y + box.height / 2;
  return [
    { position: "nw", x: left, y: top },
    { position: "n", x: midX, y: top },
    { position: "ne", x: right, y: top },
    { position: "e", x: right, y: midY },
    { position: "se", x: right, y: bottom },
    { position: "s", x: midX, y: bottom },
    { position: "sw", x: left, y: bottom },
    { position: "w", x: left, y: midY },
  ];
}

/** Compute a constrained box while dragging any of the eight resize handles. */
export function resizeBoxFromHandle(
  origin: BBox,
  handle: HandlePosition,
  pointer: { x: number; y: number },
  options: ResizeBoxOptions = {},
): BBox {
  const minSize = Math.max(1, options.minSize ?? 1);
  const centerX = origin.x + origin.width / 2;
  const centerY = origin.y + origin.height / 2;
  let left = origin.x;
  let right = origin.x + origin.width;
  let top = origin.y;
  let bottom = origin.y + origin.height;
  const fromCenter = options.resizeFromCenter === true;

  if (fromCenter) {
    if (handle.includes("w") || handle.includes("e")) {
      const halfWidth = Math.max(minSize / 2, Math.abs(pointer.x - centerX));
      left = centerX - halfWidth;
      right = centerX + halfWidth;
    }
    if (handle.includes("n") || handle.includes("s")) {
      const halfHeight = Math.max(minSize / 2, Math.abs(pointer.y - centerY));
      top = centerY - halfHeight;
      bottom = centerY + halfHeight;
    }
  } else {
    if (handle.includes("w")) left = Math.min(pointer.x, right - minSize);
    if (handle.includes("e")) right = Math.max(pointer.x, left + minSize);
    if (handle.includes("n")) top = Math.min(pointer.y, bottom - minSize);
    if (handle.includes("s")) bottom = Math.max(pointer.y, top + minSize);
  }

  if (options.preserveAspectRatio && handle.length === 2 && origin.width > 0 && origin.height > 0) {
    const ratio = origin.width / origin.height;
    let width = Math.max(minSize, right - left);
    let height = Math.max(minSize, bottom - top);
    if (width / height > ratio) height = Math.max(minSize, width / ratio);
    else width = Math.max(minSize, height * ratio);

    if (fromCenter) {
      left = centerX - width / 2;
      right = centerX + width / 2;
      top = centerY - height / 2;
      bottom = centerY + height / 2;
    } else {
      if (handle.includes("w")) left = right - width;
      else right = left + width;
      if (handle.includes("n")) top = bottom - height;
      else bottom = top + height;
    }
  }

  return {
    x: left,
    y: top,
    width: Math.max(minSize, right - left),
    height: Math.max(minSize, bottom - top),
  };
}

/** Return the shortest signed angle between two vectors, optionally snapped. */
export function rotationDeltaDegrees(
  center: { x: number; y: number },
  start: { x: number; y: number },
  current: { x: number; y: number },
  snapDegrees?: number,
): number {
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x) * 180 / Math.PI;
  const currentAngle = Math.atan2(current.y - center.y, current.x - center.x) * 180 / Math.PI;
  let delta = currentAngle - startAngle;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  if (snapDegrees && snapDegrees > 0) delta = Math.round(delta / snapDegrees) * snapDegrees;
  return delta;
}

/** Rotate a point around a center by a given angle in degrees. */
export function rotatePoint(
  point: { x: number; y: number },
  center: { x: number; y: number },
  angleDegrees: number,
): { x: number; y: number } {
  const angleRad = angleDegrees * Math.PI / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/** Un-rotate a point around a center by a given angle in degrees (applies negative angle). */
export function unrotatePoint(
  point: { x: number; y: number },
  center: { x: number; y: number },
  angleDegrees: number,
): { x: number; y: number } {
  return rotatePoint(point, center, -angleDegrees);
}

/**
 * Map a model-space `BBox` through the viewport transform
 * `screen = model * zoom + pan` (matching `viewportMath`). Provided so callers
 * that hold model-space bounds can derive on-screen handle positions; the
 * `SelectionOverlay` itself reads already-transformed boxes from the DOM, but
 * this keeps the mapping pure and testable.
 */
export function transformBBox(box: BBox, viewport: Viewport): BBox {
  return {
    x: box.x * viewport.zoom + viewport.panX,
    y: box.y * viewport.zoom + viewport.panY,
    width: box.width * viewport.zoom,
    height: box.height * viewport.zoom,
  };
}
