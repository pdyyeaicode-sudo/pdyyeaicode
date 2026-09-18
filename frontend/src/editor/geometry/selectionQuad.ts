/**
 * selectionQuad — chrome positions from four corners, never from a box and an angle.
 *
 * The selection chrome used to be described as `{ x, y, width, height, angle }` and
 * drawn by rotating a rectangle about its own top-left with CSS. That reduction has
 * four degrees of freedom. An affine transform has six, and the two that go missing
 * are exactly the two that matter:
 *
 *   - a FLIP has no representation. `atan2` of the top edge plus two positive edge
 *     lengths cannot say "mirrored", so a horizontally flipped object reported an
 *     angle as though it had been rotated, and its box landed somewhere else.
 *   - a SKEW has no representation at all. Two edge lengths and one angle describe a
 *     rectangle; a sheared quad is not one, and no (origin, w, h, angle) fits it.
 *
 * The C++ side has always stored corners explicitly for this reason — see the
 * comment on `OrientedBounds` in engine/include/pydee/selection.h: "a stored angle is
 * a second representation that can disagree with the corners, and disagreeing
 * representations are the bug". This module is the TypeScript half of that decision.
 *
 * Everything here is derived from the four corners:
 *
 *   corner handles   the corners themselves
 *   edge handles     midpoints of the corresponding edges
 *   rotation handle  the top edge's midpoint, pushed along that edge's OUTWARD normal
 *   pivot            the centroid
 *
 * so there is no trigonometry to get wrong and nothing that has to be kept in sync
 * with the matrix the renderer used.
 *
 * Coordinates are VIEWPORT pixels — the host element's own coordinate system — because
 * that is what a `left`/`top` on an absolutely-positioned div needs. The conversion
 * from world space happens once, per corner, in `quadFromWorldCorners`.
 *
 * One responsibility per file: deriving chrome positions from a selection quad.
 */

import { worldToViewport, worldPoint, type CanvasView } from "./coordinateSpaces";
import type { ResizeHandleId } from "./selectionGeometry";

export interface QuadPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * The four corners in draw order: top-left, top-right, bottom-right, bottom-left.
 *
 * "Top-left" names the corner of the object's OWN local box, not whichever corner
 * happens to be highest on screen. That is what keeps a handle attached to the same
 * corner of the object through any rotation or flip, which is in turn what lets a
 * drag resize along the object's own axes.
 */
export type SelectionQuad = readonly [QuadPoint, QuadPoint, QuadPoint, QuadPoint];

/** An axis-aligned rect, for the few consumers that genuinely need one. */
export interface QuadBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Map four world-space corners into viewport pixels.
 *
 * Each corner is converted INDEPENDENTLY. Converting an origin and then deriving the
 * rest from lengths and an angle is the reduction this module exists to remove.
 *
 * Returns null when any corner is non-finite, so the caller draws nothing rather than
 * drawing a box somewhere arbitrary.
 */
export function quadFromWorldCorners(
  view: CanvasView,
  corners: readonly QuadPoint[],
): SelectionQuad | null {
  if (corners.length !== 4) {
    return null;
  }
  const points: QuadPoint[] = [];
  for (const corner of corners) {
    const point = worldToViewport(view, worldPoint(corner.x, corner.y));
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return null;
    }
    points.push({ x: point.x, y: point.y });
  }
  return [points[0], points[1], points[2], points[3]] as const;
}

function midpoint(a: QuadPoint, b: QuadPoint): QuadPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Where a resize handle sits.
 *
 * Corners are corners; edge handles are edge midpoints. Both follow rotation, scale,
 * flip and skew for free, because they are interpolations of points that already have
 * the whole transform applied to them.
 */
export function quadHandlePosition(quad: SelectionQuad, handle: ResizeHandleId): QuadPoint {
  const [topLeft, topRight, bottomRight, bottomLeft] = quad;
  switch (handle) {
    case "nw":
      return topLeft;
    case "ne":
      return topRight;
    case "se":
      return bottomRight;
    case "sw":
      return bottomLeft;
    case "n":
      return midpoint(topLeft, topRight);
    case "e":
      return midpoint(topRight, bottomRight);
    case "s":
      return midpoint(bottomRight, bottomLeft);
    case "w":
      return midpoint(bottomLeft, topLeft);
  }
}

/** The quad's centroid, which is the object's centre under any affine transform. */
export function quadCentroid(quad: SelectionQuad): QuadPoint {
  return {
    x: (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4,
    y: (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4,
  };
}

/** Unit vector from `from` towards `to`, or null when they coincide. */
function unitTowards(from: QuadPoint, to: QuadPoint): QuadPoint | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 1e-9) {
    return null;
  }
  return { x: dx / length, y: dy / length };
}

/**
 * Where the rotation grip sits: off the top edge, along its outward normal.
 *
 * The normal's SIGN is chosen by pointing away from the centroid rather than by a
 * winding assumption. A flip reverses the quad's winding, so a fixed sign would put
 * the grip inside a mirrored object — on top of the shape instead of above it.
 *
 * Returns null for a degenerate quad, which is the signal to draw no grip rather than
 * to place one at the centre.
 */
export function quadRotationHandle(quad: SelectionQuad, offsetPixels: number): QuadPoint | null {
  const [topLeft, topRight] = quad;
  const centre = quadCentroid(quad);
  const anchor = midpoint(topLeft, topRight);
  const along = unitTowards(topLeft, topRight);
  if (along === null) {
    return null;
  }
  // Either perpendicular; pick the one leading away from the centre.
  const normal = { x: -along.y, y: along.x };
  const towardsCentre = unitTowards(anchor, centre);
  const sign = towardsCentre === null
    ? 1
    : normal.x * towardsCentre.x + normal.y * towardsCentre.y > 0
      ? -1
      : 1;
  return {
    x: anchor.x + normal.x * sign * offsetPixels,
    y: anchor.y + normal.y * sign * offsetPixels,
  };
}

/**
 * The rotation ZONE just outside a corner.
 *
 * Pushed along the direction from the centroid through that corner, so it stays
 * diagonally outside the object however the object is oriented. The old code used a
 * fixed screen diagonal per corner name, which pointed into the shape as soon as it
 * was rotated past 90 degrees.
 */
export function quadCornerRotationZone(
  quad: SelectionQuad,
  corner: "nw" | "ne" | "se" | "sw",
  offsetPixels: number,
): QuadPoint | null {
  const point = quadHandlePosition(quad, corner);
  const outward = unitTowards(quadCentroid(quad), point);
  if (outward === null) {
    return null;
  }
  return { x: point.x + outward.x * offsetPixels, y: point.y + outward.y * offsetPixels };
}

/** The quad's axis-aligned bounding box, for consumers that need a rect. */
export function quadBox(quad: SelectionQuad): QuadBox {
  const xs = [quad[0].x, quad[1].x, quad[2].x, quad[3].x];
  const ys = [quad[0].y, quad[1].y, quad[2].y, quad[3].y];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

/**
 * True when the quad encloses no area.
 *
 * Checked by the cross product of two edges rather than by comparing edge lengths,
 * because a sheared quad can have two long edges and still be collapsed onto a line.
 */
export function quadIsDegenerate(quad: SelectionQuad): boolean {
  const [topLeft, topRight, , bottomLeft] = quad;
  const ax = topRight.x - topLeft.x;
  const ay = topRight.y - topLeft.y;
  const bx = bottomLeft.x - topLeft.x;
  const by = bottomLeft.y - topLeft.y;
  const cross = ax * by - ay * bx;
  return !Number.isFinite(cross) || Math.abs(cross) < 1e-9;
}

/**
 * True when the transform mirrors the object.
 *
 * The signed area of the quad in the order tl -> tr -> br -> bl is positive for an
 * unmirrored object in a y-down coordinate system and negative for a mirrored one.
 * Reported rather than folded into an angle, which is where it used to get lost.
 */
export function quadIsFlipped(quad: SelectionQuad): boolean {
  const [topLeft, topRight, , bottomLeft] = quad;
  const ax = topRight.x - topLeft.x;
  const ay = topRight.y - topLeft.y;
  const bx = bottomLeft.x - topLeft.x;
  const by = bottomLeft.y - topLeft.y;
  return ax * by - ay * bx < 0;
}

/** `points` attribute for an SVG polygon drawn through the quad. */
export function quadPolygonPoints(quad: SelectionQuad): string {
  return quad.map((point) => `${point.x},${point.y}`).join(" ");
}
