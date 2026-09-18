/**
 * selectionGeometry — the selection box, derived from the SAME transform the
 * renderers paint with.
 *
 * The rule this file exists to enforce: an object's selection geometry is a
 * mathematical consequence of its world transform, never an independent
 * measurement. Previously the overlay measured the DOM (`getBoundingClientRect`,
 * `getScreenCTM`) while the renderers used `RenderScene.worldTransform`. Two
 * sources of truth for the same fact will always diverge; the only question is
 * when. So:
 *
 *     worldCorner = node.worldTransform x localCorner
 *
 * and everything the overlay draws — box, four corner handles, four side handles,
 * rotation handle, hit areas — is generated from those corners. Rotation, scale,
 * skew, flip and every ancestor group transform come along for free, because they
 * are already inside `worldTransform`.
 *
 * ## Why an oriented box rather than an axis-aligned one
 *
 * An AABB of a rotated object is strictly larger than the object and its corners
 * are not the object's corners, so handles cannot sit on them. Photoshop,
 * Illustrator, Figma and Canva all show the *oriented* box for a single selection
 * and fall back to an AABB only for a multi-selection, where there is no single
 * orientation to honour. This file follows that: `obbForNode` is oriented,
 * `obbForNodes` unions into an axis-aligned world box and says so in its type.
 *
 * ## Resize happens in LOCAL space, on purpose
 *
 * A corner drag must resize along the object's own rotated axes, not along screen
 * X/Y. Converting the pointer into the node's local space makes that automatic:
 * local space is the rotated frame, the bounds are axis-aligned there, and the
 * opposite corner stays fixed by construction. Doing it in screen space would need
 * an explicit un-rotate step that is easy to get wrong and impossible to extend to
 * skew.
 *
 * One responsibility per file: deriving selection geometry from world transforms.
 */

import {
  localPoint,
  localToWorld,
  worldLengthToViewport,
  worldPoint,
  worldToLocal,
  worldToViewport,
  type CanvasView,
  type LocalPoint,
  type ViewportPoint,
  type WorldPoint,
  type WorldRect,
} from "./coordinateSpaces";
import type { Matrix2D, RectF } from "../renderer/matrix2d";

/** The eight resize handles, named by compass direction on the UNROTATED box. */
export type ResizeHandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const CORNER_HANDLES: readonly ResizeHandleId[] = ["nw", "ne", "se", "sw"];
export const SIDE_HANDLES: readonly ResizeHandleId[] = ["n", "e", "s", "w"];
export const RESIZE_HANDLES: readonly ResizeHandleId[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

/**
 * An oriented box in world space.
 *
 * Corners are stored explicitly and in a fixed order rather than as
 * position + size + angle, because a stored angle is a second representation that
 * can disagree with the corners. With corners, the angle is derived and cannot
 * drift.
 */
export interface OrientedBox {
  readonly topLeft: WorldPoint;
  readonly topRight: WorldPoint;
  readonly bottomRight: WorldPoint;
  readonly bottomLeft: WorldPoint;
  /** The local-space rect these corners came from, for resize maths. */
  readonly localBounds: RectF;
  /** local -> world, including every ancestor. */
  readonly worldTransform: Matrix2D;
}

/** Why an OBB could not be produced. Never a silent fallback. */
export type SelectionGeometryFailure =
  /** The node has no resolved bounds — for example text with no font yet. */
  | "bounds-unavailable"
  /** The world transform is singular; the node is collapsed to a line or point. */
  | "singular-transform"
  /** A coordinate was NaN or infinite somewhere in the chain. */
  | "non-finite-geometry";

export interface SelectionGeometryError {
  readonly ok: false;
  readonly reason: SelectionGeometryFailure;
  readonly nodeId: string;
}

export interface SelectionGeometryOk {
  readonly ok: true;
  readonly obb: OrientedBox;
}

export type SelectionGeometryResult = SelectionGeometryOk | SelectionGeometryError;

/** The minimum a node must expose. Structural, so any scene node satisfies it. */
export interface TransformedNode {
  readonly id: string;
  readonly worldTransform: Matrix2D;
  readonly localBounds: RectF | null;
}

const finitePoint = (point: { x: number; y: number }): boolean =>
  Number.isFinite(point.x) && Number.isFinite(point.y);

/**
 * The oriented world-space box of one node.
 *
 * This is the single entry point for "where is this object". Anything that needs
 * an object's on-screen geometry goes through here.
 */
export function obbForNode(node: TransformedNode): SelectionGeometryResult {
  const bounds = node.localBounds;
  if (bounds === null) {
    return { ok: false, reason: "bounds-unavailable", nodeId: node.id };
  }
  if (
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
  ) {
    return { ok: false, reason: "non-finite-geometry", nodeId: node.id };
  }

  // A singular transform maps the box onto a line or a point. Reported rather
  // than drawn, because a zero-area selection cannot be resized meaningfully and
  // silently substituting a different box is exactly the class of bug this file
  // replaces.
  if (worldToLocal(node.worldTransform, worldPoint(0, 0)) === null) {
    return { ok: false, reason: "singular-transform", nodeId: node.id };
  }

  const corner = (x: number, y: number): WorldPoint =>
    localToWorld(node.worldTransform, localPoint(x, y));

  const topLeft = corner(bounds.x, bounds.y);
  const topRight = corner(bounds.x + bounds.width, bounds.y);
  const bottomRight = corner(bounds.x + bounds.width, bounds.y + bounds.height);
  const bottomLeft = corner(bounds.x, bounds.y + bounds.height);

  if (![topLeft, topRight, bottomRight, bottomLeft].every(finitePoint)) {
    return { ok: false, reason: "non-finite-geometry", nodeId: node.id };
  }

  return {
    ok: true,
    obb: {
      topLeft,
      topRight,
      bottomRight,
      bottomLeft,
      localBounds: bounds,
      worldTransform: node.worldTransform,
    },
  };
}

/** The four corners in draw order, for polygon output and iteration. */
export function obbCorners(obb: OrientedBox): readonly WorldPoint[] {
  return [obb.topLeft, obb.topRight, obb.bottomRight, obb.bottomLeft];
}

/** Centre of the oriented box, in world space. */
export function obbCenter(obb: OrientedBox): WorldPoint {
  return worldPoint(
    (obb.topLeft.x + obb.bottomRight.x) / 2,
    (obb.topLeft.y + obb.bottomRight.y) / 2,
  );
}

/**
 * Rotation of the box's top edge, in degrees clockwise from the +x axis.
 *
 * Derived, never stored. This is what the overlay rotates its handle set by.
 */
export function obbAngleDegrees(obb: OrientedBox): number {
  const dx = obb.topRight.x - obb.topLeft.x;
  const dy = obb.topRight.y - obb.topLeft.y;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** True when the transform mirrors the object, so handle naming stays meaningful. */
export function obbIsFlipped(obb: OrientedBox): boolean {
  const m = obb.worldTransform;
  // A negative determinant means an odd number of reflections.
  return m.a * m.d - m.b * m.c < 0;
}

/**
 * Axis-aligned world bounds of a MULTI-selection.
 *
 * Deliberately a different type from `OrientedBox`: several objects with different
 * rotations have no single orientation, so pretending otherwise would be a lie in
 * the type system. Matches how every mature editor behaves.
 */
export interface WorldRectResult {
  readonly rect: WorldRect;
  readonly errors: readonly SelectionGeometryError[];
}

export function aabbForNodes(nodes: readonly TransformedNode[]): WorldRectResult | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const errors: SelectionGeometryError[] = [];
  let any = false;

  for (const node of nodes) {
    const result = obbForNode(node);
    if (!result.ok) {
      errors.push(result);
      continue;
    }
    any = true;
    for (const point of obbCorners(result.obb)) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  if (!any) {
    return null;
  }
  return {
    rect: { x: minX, y: minY, width: maxX - minX, height: maxY - minY, space: "world" },
    errors,
  };
}

/**
 * Position of a handle on the box, in world space.
 *
 * Computed by interpolating the corners, so every handle rotates, scales, skews
 * and flips with the object automatically. Nothing here knows what a rotation is.
 */
export function handleWorldPosition(obb: OrientedBox, handle: ResizeHandleId): WorldPoint {
  const { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl } = obb;
  const mid = (a: WorldPoint, b: WorldPoint): WorldPoint =>
    worldPoint((a.x + b.x) / 2, (a.y + b.y) / 2);

  switch (handle) {
    case "nw": return tl;
    case "ne": return tr;
    case "se": return br;
    case "sw": return bl;
    case "n":  return mid(tl, tr);
    case "e":  return mid(tr, br);
    case "s":  return mid(br, bl);
    case "w":  return mid(bl, tl);
  }
}

/**
 * The corner that stays fixed while `handle` is dragged.
 *
 * Side handles anchor the opposite edge, which is why they return the edge
 * midpoint rather than a corner.
 */
export function anchorWorldPosition(obb: OrientedBox, handle: ResizeHandleId): WorldPoint {
  return handleWorldPosition(obb, OPPOSITE_HANDLE[handle]);
}

const OPPOSITE_HANDLE: Readonly<Record<ResizeHandleId, ResizeHandleId>> = {
  nw: "se",
  n: "s",
  ne: "sw",
  e: "w",
  se: "nw",
  s: "n",
  sw: "ne",
  w: "e",
};

/**
 * Position of the rotation handle, offset from the top edge along its OUTWARD
 * normal.
 *
 * The offset is a viewport distance so the handle sits the same distance from the
 * box at every zoom, which is what makes it grabbable when zoomed far out. It
 * therefore has to be computed with the view rather than in pure world space.
 */
export function rotationHandleViewport(
  view: CanvasView,
  obb: OrientedBox,
  offsetPx = 28,
): ViewportPoint {
  const topMid = worldToViewport(view, handleWorldPosition(obb, "n"));
  const bottomMid = worldToViewport(view, handleWorldPosition(obb, "s"));

  // Outward normal of the top edge is simply the direction away from the bottom.
  const dx = topMid.x - bottomMid.x;
  const dy = topMid.y - bottomMid.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length === 0) {
    // A degenerate box has no meaningful "up"; put the handle above the point so
    // it is still reachable rather than returning something non-finite.
    return { x: topMid.x, y: topMid.y - offsetPx, space: "viewport" };
  }
  return {
    x: topMid.x + (dx / length) * offsetPx,
    y: topMid.y + (dy / length) * offsetPx,
    space: "viewport",
  };
}

/** The box and its handles, already converted for the overlay to position. */
export interface ViewportSelection {
  readonly corners: readonly ViewportPoint[];
  /** Top-left corner, for an element positioned then rotated about its origin. */
  readonly origin: ViewportPoint;
  /** Length of the top edge in viewport px. */
  readonly width: number;
  /** Length of the left edge in viewport px. */
  readonly height: number;
  /** Degrees, derived from the top edge. */
  readonly angle: number;
  readonly handles: Readonly<Record<ResizeHandleId, ViewportPoint>>;
  readonly rotation: ViewportPoint;
  readonly center: ViewportPoint;
  readonly flipped: boolean;
}

/**
 * Convert an OBB into everything the overlay needs, in one pass.
 *
 * `origin` + `angle` + `width`/`height` describe an element positioned at the
 * top-left corner and rotated about that same corner. Rotating about the corner
 * rather than the centre is deliberate: the corner is a point we have exactly,
 * whereas a centre pivot re-introduces the mismatch where the box rotated about a
 * different point from the object.
 */
export function obbToViewport(view: CanvasView, obb: OrientedBox): ViewportSelection {
  const corners = obbCorners(obb).map((point) => worldToViewport(view, point));
  const [tl, tr, , bl] = corners;

  const handles = {} as Record<ResizeHandleId, ViewportPoint>;
  for (const handle of RESIZE_HANDLES) {
    handles[handle] = worldToViewport(view, handleWorldPosition(obb, handle));
  }

  return {
    corners,
    origin: tl,
    width: Math.hypot(tr.x - tl.x, tr.y - tl.y),
    height: Math.hypot(bl.x - tl.x, bl.y - tl.y),
    // The angle is computed in VIEWPORT space. It equals the world angle because
    // world -> viewport is a uniform scale plus a translation, and a uniform scale
    // preserves angles — but computing it from the drawn corners means the drawn
    // box can never disagree with the drawn handles.
    angle: (Math.atan2(tr.y - tl.y, tr.x - tl.x) * 180) / Math.PI,
    handles,
    rotation: rotationHandleViewport(view, obb),
    center: worldToViewport(view, obbCenter(obb)),
    flipped: obbIsFlipped(obb),
  };
}

/**
 * New local bounds after dragging `handle` to `pointerWorld`.
 *
 * Done entirely in the node's LOCAL space, which is what makes a diagonal drag
 * resize along the object's own rotated axes. The opposite anchor is fixed by
 * construction: only the edges the handle touches move.
 *
 * `preserveAspect` scales the axis with the larger relative change and derives the
 * other from it, so the drag follows the pointer along its dominant direction
 * rather than fighting it.
 *
 * Negative extents are preserved rather than clamped, because a flip is a valid
 * transform. Callers that cannot represent a flip must normalise and say so.
 */
export function resizeLocalBounds(
  obb: OrientedBox,
  handle: ResizeHandleId,
  pointerWorld: WorldPoint,
  options: { readonly preserveAspect?: boolean; readonly fromCenter?: boolean } = {},
): RectF | null {
  const pointerLocal = worldToLocal(obb.worldTransform, pointerWorld);
  if (pointerLocal === null) {
    return null;
  }

  const bounds = obb.localBounds;
  let left = bounds.x;
  let top = bounds.y;
  let right = bounds.x + bounds.width;
  let bottom = bounds.y + bounds.height;

  const movesLeft = handle === "nw" || handle === "w" || handle === "sw";
  const movesRight = handle === "ne" || handle === "e" || handle === "se";
  const movesTop = handle === "nw" || handle === "n" || handle === "ne";
  const movesBottom = handle === "sw" || handle === "s" || handle === "se";

  if (options.fromCenter === true) {
    const centreX = bounds.x + bounds.width / 2;
    const centreY = bounds.y + bounds.height / 2;
    if (movesLeft || movesRight) {
      const half = Math.abs(pointerLocal.x - centreX);
      left = centreX - half;
      right = centreX + half;
    }
    if (movesTop || movesBottom) {
      const half = Math.abs(pointerLocal.y - centreY);
      top = centreY - half;
      bottom = centreY + half;
    }
  } else {
    if (movesLeft) left = pointerLocal.x;
    if (movesRight) right = pointerLocal.x;
    if (movesTop) top = pointerLocal.y;
    if (movesBottom) bottom = pointerLocal.y;
  }

  let width = right - left;
  let height = bottom - top;

  if (options.preserveAspect === true && bounds.width !== 0 && bounds.height !== 0) {
    const isCorner = (CORNER_HANDLES as readonly string[]).includes(handle);
    if (isCorner) {
      const ratio = Math.abs(bounds.height / bounds.width);
      // Follow whichever axis the pointer moved further along, so the gesture
      // never feels like it is resisting the cursor.
      if (Math.abs(width) * ratio > Math.abs(height)) {
        const signed = Math.sign(height || 1) * Math.abs(width) * ratio;
        if (movesTop) top = bottom - signed;
        else bottom = top + signed;
        height = signed;
      } else {
        const signed = Math.sign(width || 1) * (Math.abs(height) / ratio);
        if (movesLeft) left = right - signed;
        else right = left + signed;
        width = signed;
      }
    }
  }

  if (![left, top, width, height].every(Number.isFinite)) {
    return null;
  }
  return { x: left, y: top, width, height };
}

/**
 * Which handle is under a viewport point, or null.
 *
 * Hit areas are square in VIEWPORT space and centred on the handle, so they rotate
 * with the box automatically — the handle positions already did. `radiusPx` should
 * match the rendered handle size so the visual and the hit area agree.
 */
export function handleAtViewportPoint(
  selection: ViewportSelection,
  point: ViewportPoint,
  radiusPx = 7,
): ResizeHandleId | "rotate" | null {
  const near = (target: ViewportPoint): boolean =>
    Math.abs(point.x - target.x) <= radiusPx && Math.abs(point.y - target.y) <= radiusPx;

  if (near(selection.rotation)) {
    return "rotate";
  }
  // Corners take precedence over sides: they overlap at small box sizes, and a
  // corner is the more specific intent.
  for (const handle of CORNER_HANDLES) {
    if (near(selection.handles[handle])) {
      return handle;
    }
  }
  for (const handle of SIDE_HANDLES) {
    if (near(selection.handles[handle])) {
      return handle;
    }
  }
  return null;
}

/** Local-space corner of the box that `handle` corresponds to, for anchor maths. */
export function handleLocalPosition(obb: OrientedBox, handle: ResizeHandleId): LocalPoint {
  const b = obb.localBounds;
  const left = b.x;
  const right = b.x + b.width;
  const top = b.y;
  const bottom = b.y + b.height;
  const midX = b.x + b.width / 2;
  const midY = b.y + b.height / 2;

  switch (handle) {
    case "nw": return localPoint(left, top);
    case "n":  return localPoint(midX, top);
    case "ne": return localPoint(right, top);
    case "e":  return localPoint(right, midY);
    case "se": return localPoint(right, bottom);
    case "s":  return localPoint(midX, bottom);
    case "sw": return localPoint(left, bottom);
    case "w":  return localPoint(left, midY);
  }
}
