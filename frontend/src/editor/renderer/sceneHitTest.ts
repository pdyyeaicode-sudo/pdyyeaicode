/**
 * sceneHitTest — geometric pointer resolution against a `RenderScene`
 * (spec §27 "Selection and interaction engine", §79 "Hit testing").
 *
 * Today the editor resolves clicks through the DOM (`closest("[data-layer-id]")`),
 * which only works because every layer is a real SVG element. A Skia surface is
 * a single canvas with no per-layer DOM, so selection must be computed from the
 * same transforms used to paint. This module is that computation, and it is
 * backend-independent: identical results on SVG and Skia.
 *
 * Resolution order is topmost-first (reverse paint order), matching what the
 * user sees. Testing is two-phase: a cheap world-bounds rejection, then an
 * exact geometry test in the node's own local space via the inverse transform,
 * so rotation, scale and skew are handled correctly.
 *
 * One responsibility per file: pointer → scene node resolution.
 */

import {
  invert,
  rectContainsPoint,
  transformPoint,
  type Matrix2D,
  type Point2D,
  type RectF,
} from "./matrix2d";
import { flattenLeaves, type RenderLeafNode, type RenderScene } from "./renderScene";

export interface HitTestOptions {
  /**
   * Extra slop in document units, so thin strokes and small handles remain
   * clickable at low zoom. Defaults to 0.
   */
  readonly tolerance?: number;
  /** Include locked layers. Defaults to false (locked layers ignore input). */
  readonly includeLocked?: boolean;
}

/** Topmost node containing `documentPoint`, or null when nothing is hit. */
export function hitTestScene(
  scene: RenderScene,
  documentPoint: Point2D,
  options: HitTestOptions = {},
): RenderLeafNode | null {
  const candidates = hitTestSceneAll(scene, documentPoint, options);
  return candidates.length > 0 ? candidates[0] : null;
}

/**
 * Every node containing `documentPoint`, topmost first. Used by alt-click
 * "select behind" and by diagnostics.
 */
export function hitTestSceneAll(
  scene: RenderScene,
  documentPoint: Point2D,
  options: HitTestOptions = {},
): RenderLeafNode[] {
  const tolerance = options.tolerance ?? 0;
  const includeLocked = options.includeLocked ?? false;
  const hits: RenderLeafNode[] = [];

  // flattenLeaves yields back-to-front; reverse so the topmost wins.
  const leaves = flattenLeaves(scene);
  for (let index = leaves.length - 1; index >= 0; index -= 1) {
    const node = leaves[index];
    if (!includeLocked && !node.hitTestable) {
      continue;
    }
    if (node.opacity <= 0) {
      continue;
    }
    if (node.worldBounds === null) {
      // Bounds unknown (for example text awaiting font metrics). Refusing to
      // guess is correct: report nothing rather than a wrong hit.
      continue;
    }
    // Thin geometry (a horizontal line has zero-height bounds) is still visible
    // through its stroke, so the rejection box must include the stroke's world
    // half-width or the cheap phase would discard a genuine hit.
    const scale = maxAxisScale(node.worldTransform);
    const worldPadding = tolerance + strokeHalfWidth(node) * scale;
    if (!rectContainsPoint(inflate(node.worldBounds, worldPadding), documentPoint)) {
      continue;
    }
    if (hitsGeometry(node, documentPoint, tolerance, scale)) {
      hits.push(node);
    }
  }
  return hits;
}

function inflate(rect: RectF, amount: number): RectF {
  if (amount === 0) {
    return rect;
  }
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

/**
 * Largest scale factor the transform applies to any direction. Used to convert
 * padding between world and local space conservatively.
 */
function maxAxisScale(m: Matrix2D): number {
  const scale = Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d));
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/** Half the stroke width in local units, or 0 when nothing is stroked. */
function strokeHalfWidth(node: RenderLeafNode): number {
  switch (node.kind) {
    case "line":
      // A line is only ever visible through its stroke.
      return Math.max(node.stroke.width, 0) / 2;
    case "rect":
    case "ellipse":
    case "polygon":
    case "path":
      return node.stroke.paint.kind === "none" ? 0 : Math.max(node.stroke.width, 0) / 2;
    default:
      return 0;
  }
}

/** Exact per-geometry test, performed in the node's own local space. */
function hitsGeometry(
  node: RenderLeafNode,
  documentPoint: Point2D,
  tolerance: number,
  worldScale: number,
): boolean {
  const inverse = invert(node.worldTransform);
  if (inverse === null) {
    // Degenerate transform: the node occupies no area, so it cannot be hit.
    return false;
  }
  const local = transformPoint(inverse, documentPoint);
  // Tolerance is specified in document units; convert it into this node's local
  // space so the slop stays visually constant at any zoom or object scale.
  const localTolerance = tolerance / worldScale;
  const pad = localTolerance + strokeHalfWidth(node);

  switch (node.kind) {
    case "rect":
      return rectContainsPoint(
        inflate({ x: node.x, y: node.y, width: node.width, height: node.height }, pad),
        local,
      );
    case "ellipse": {
      const rx = node.rx + pad;
      const ry = node.ry + pad;
      if (rx <= 0 || ry <= 0) {
        return false;
      }
      const dx = (local.x - node.cx) / rx;
      const dy = (local.y - node.cy) / ry;
      return dx * dx + dy * dy <= 1;
    }
    case "line":
      return distanceToSegment(local, node.x1, node.y1, node.x2, node.y2) <= pad;
    case "polygon":
      return pointInPolygon(local, node.points)
        || (pad > 0 && node.localBounds !== null
          && rectContainsPoint(inflate(node.localBounds, pad), local));
    case "path":
    case "text":
    case "image":
      // `path` uses its conservative bounds (exact curve containment belongs to
      // the Skia backend via SkPath::contains). `text` and `image` are
      // rectangular by definition.
      return node.localBounds !== null
        && rectContainsPoint(inflate(node.localBounds, pad), local);
    default: {
      const unhandled: never = node;
      throw new Error(`Unhandled hit-test node: ${JSON.stringify(unhandled)}`);
    }
  }
}

function distanceToSegment(
  point: Point2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(point.x - x1, point.y - y1);
  }
  const t = Math.min(
    1,
    Math.max(0, ((point.x - x1) * dx + (point.y - y1) * dy) / lengthSquared),
  );
  return Math.hypot(point.x - (x1 + t * dx), point.y - (y1 + t * dy));
}

/** Even-odd ray casting, matching the SVG default `fill-rule`. */
function pointInPolygon(
  point: Point2D,
  points: readonly (readonly [number, number])[],
): boolean {
  if (points.length < 3) {
    return false;
  }
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const straddles = yi > point.y !== yj > point.y;
    if (!straddles) {
      continue;
    }
    const intersectX = xi + ((point.y - yi) / (yj - yi)) * (xj - xi);
    if (point.x < intersectX) {
      inside = !inside;
    }
  }
  return inside;
}
