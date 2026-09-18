/**
 * gestureSolve — the TypeScript mirror of engine/src/gesture.cpp.
 *
 * ## Why this file exists at all, given the point is to hand calculation to C++
 *
 * It is the SVG backend's implementation. The engine artifact is a build output
 * that is not committed, and the canonical-SVG renderer has to stay a working
 * fallback (it is also the export path), so resize and rotate cannot simply stop
 * working when the engine is absent. What this file is NOT is a second design: it
 * evaluates the same three expressions, in the same order, and `engine-parity.mts`
 * runs both over the same snapshots and fails the build if they disagree by more
 * than 1e-9. When the engine is loaded, none of this runs.
 *
 * ## The three expressions
 *
 *     move    local' = P⁻¹ · T(Δ)        · P · L₀
 *     rotate  local' = P⁻¹ · R(δ, pivot) · P · L₀
 *     resize  local' =      L₀ · B(from → to)
 *
 * `P` is the parent's world transform, `L₀` the node's own transform at pointer-down.
 *
 * The asymmetry is not a style choice. Move and rotate compose on the LEFT, in the
 * parent's space, because "move/turn the object as it appears on screen" is a
 * statement about world space. Resize composes on the RIGHT, in the node's own
 * space, because "make this box that box" is a statement about local geometry.
 *
 * The editor's previous rotation appended `rotate(δ cx cy)` to the node's transform
 * with `cx,cy` measured in the PARENT's space — a right-composition carrying a
 * left-composition's pivot. Those agree only when the node's existing transform is
 * itself a rotation about that same point, which is exactly what the browser
 * fixture happened to be, so the defect never showed up in a test. See
 * gestureSolve.test.ts, "an existing rotation about a non-centre pivot".
 *
 * ## Solve from a snapshot, never from current state
 *
 * `GestureSnapshot` is captured once at pointer-down and never mutated, so frame
 * 200 of a drag is computed from the same base as frame 1 and a stream of pointer
 * samples cannot accumulate rounding error. It also makes the solve a pure
 * function, which is what lets the parity suite compare it against C++ at all.
 *
 * Nothing here falls back silently: a singular ancestor, a zero-extent box or a
 * non-finite result is REPORTED, because a plausible-looking transform is the class
 * of bug this replaces.
 *
 * One responsibility per file: solving an in-flight gesture into a transform.
 */

import { worldPoint, type WorldPoint } from "./coordinateSpaces";
import {
  obbCenter,
  obbForNode,
  obbCorners,
  resizeLocalBounds,
  type OrientedBox,
  type ResizeHandleId,
} from "./selectionGeometry";
import { boundsMapping } from "./resizeGeometry";
import {
  invert,
  multiply,
  rotation,
  translation,
  type Matrix2D,
  type RectF,
} from "../renderer/matrix2d";

/** Which gesture is in flight. All three reduce to one local transform. */
export type GestureKind = "move" | "resize" | "rotate";

/** Keyboard state that changes what a drag means. */
export interface GestureModifiers {
  /** Shift on a corner: keep the local aspect ratio. */
  readonly preserveAspect?: boolean;
  /** Alt: resize symmetrically about the box centre. */
  readonly fromCenter?: boolean;
  /** Rotation step in degrees. Zero or absent means no snapping. */
  readonly angleSnapDegrees?: number;
}

/**
 * Everything a gesture needs, captured at pointer-down and then immutable.
 *
 * `parentWorld` and `baseLocal` are both stored even though
 * `obb.worldTransform === parentWorld · baseLocal`, because the solve needs both
 * factors and recovering one by inverting the other fails for a singular node
 * transform — a node scaled to zero on one axis is still draggable.
 */
export interface GestureSnapshot {
  readonly kind: GestureKind;
  /** Meaningful for a resize only. */
  readonly handle: ResizeHandleId;
  readonly obb: OrientedBox;
  /** Ancestors only, excluding the node's own transform. */
  readonly parentWorld: Matrix2D;
  /** The node's own transform when the gesture began. */
  readonly baseLocal: Matrix2D;
  readonly pointerStart: WorldPoint;
  /** The fixed point of a rotation: the box's own centre, in world space. */
  readonly pivot: WorldPoint;
}

/** One frame's answer. `localTransform` is the only value that must be applied. */
export interface GestureFrame {
  readonly kind: GestureKind;
  /** Assign to the node's local transform. */
  readonly localTransform: Matrix2D;
  /**
   * The node's local bounds for this frame.
   *
   * Changed by a resize, unchanged by a move or a rotate. The document commit needs
   * this and not merely the matrix, because a resize is stored as geometry.
   */
  readonly localBounds: RectF;
  /** Degrees applied by a rotate. Zero otherwise. */
  readonly angleDegrees: number;
  /** World displacement applied by a move. Zero otherwise. */
  readonly worldDelta: { readonly dx: number; readonly dy: number };
  /**
   * The resulting world corners in draw order, or null for a degenerate result.
   *
   * Derived from the SNAPSHOT's local bounds through the new world matrix, because
   * the preview leaves the node's geometry alone and carries the change in the
   * transform. Returned so selection chrome can draw without repeating any of this.
   */
  readonly corners: readonly WorldPoint[] | null;
}

/** Why a frame could not be solved. Matches GestureFailureName in gesture.cpp. */
export type GestureFailure =
  | "singular-parent"
  | "singular-transform"
  | "degenerate-bounds"
  | "non-finite-result"
  | "pointer-on-pivot";

export type GestureResult =
  | { readonly ok: true; readonly frame: GestureFrame }
  | { readonly ok: false; readonly reason: GestureFailure };

const finite = (value: number): boolean => Number.isFinite(value);

const finiteMatrix = (m: Matrix2D): boolean =>
  [m.a, m.b, m.c, m.d, m.e, m.f].every(finite);

/**
 * The affine that maps local bounds `from` onto `to`, as a matrix.
 *
 * Built from `boundsMapping` rather than from its own arithmetic, so the numbers
 * here and the ones `resizeShapeGeometry` commits come from one place. Returns null
 * for a zero-extent source, where the scale factor is undefined.
 */
export function boundsMappingMatrix(from: RectF, to: RectF): Matrix2D | null {
  const mapping = boundsMapping(from, to);
  if (mapping === null) {
    return null;
  }
  const matrix: Matrix2D = {
    a: mapping.scaleX,
    b: 0,
    c: 0,
    d: mapping.scaleY,
    e: mapping.translateX,
    f: mapping.translateY,
  };
  return finiteMatrix(matrix) ? matrix : null;
}

/**
 * `local' = parentWorld⁻¹ · world · parentWorld · baseLocal`.
 *
 * The general form of the drag conversion: apply `world` as seen in world space to
 * a node whose transform is written in its parent's space. For a pure translation
 * this reduces to `[I | M⁻¹t]`, which is why dividing a delta by `zoom` looks right
 * until an ancestor rotates.
 */
export function localTransformAfterWorldTransform(
  parentWorld: Matrix2D,
  baseLocal: Matrix2D,
  world: Matrix2D,
): Matrix2D | null {
  const inverse = invert(parentWorld);
  if (inverse === null) {
    return null;
  }
  const result = multiply(multiply(inverse, multiply(world, parentWorld)), baseLocal);
  return finiteMatrix(result) ? result : null;
}

/**
 * Clockwise-positive degrees from `start` to `current` about `pivot`.
 *
 * Wrapped into (-180, 180] so a drag across the boundary turns the short way rather
 * than jumping a full revolution. Returns null when either vector has zero length:
 * there is no angle from a point to itself, and reporting 0 would silently freeze
 * the gesture.
 */
export function rotationDeltaDegrees(
  pivot: { readonly x: number; readonly y: number },
  start: { readonly x: number; readonly y: number },
  current: { readonly x: number; readonly y: number },
  snapDegrees = 0,
): number | null {
  const startDx = start.x - pivot.x;
  const startDy = start.y - pivot.y;
  const currentDx = current.x - pivot.x;
  const currentDy = current.y - pivot.y;
  if ((startDx === 0 && startDy === 0) || (currentDx === 0 && currentDy === 0)) {
    return null;
  }

  const startAngle = (Math.atan2(startDy, startDx) * 180) / Math.PI;
  const currentAngle = (Math.atan2(currentDy, currentDx) * 180) / Math.PI;
  let delta = currentAngle - startAngle;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;

  if (snapDegrees > 0) {
    delta = Math.round(delta / snapDegrees) * snapDegrees;
  }
  return finite(delta) ? delta : null;
}

/** The minimum a node must expose for a gesture. Structural, so any scene node fits. */
export interface GestureNode {
  readonly id: string;
  readonly localTransform: Matrix2D;
  readonly worldTransform: Matrix2D;
  readonly localBounds: RectF | null;
}

/**
 * Capture the snapshot for a gesture on `node`.
 *
 * `parentWorld` is supplied by the caller rather than derived here, because only
 * the scene knows the chain and `transformDelta.parentWorldTransform` already
 * answers it from the parent itself — which works even when the node's own
 * transform is singular.
 */
export function beginGesture(
  node: GestureNode,
  parentWorld: Matrix2D,
  kind: GestureKind,
  handle: ResizeHandleId,
  pointerWorld: WorldPoint,
): { readonly ok: true; readonly snapshot: GestureSnapshot }
  | { readonly ok: false; readonly reason: string } {
  const geometry = obbForNode(node);
  if (!geometry.ok) {
    return { ok: false, reason: geometry.reason };
  }
  if (!finite(pointerWorld.x) || !finite(pointerWorld.y)) {
    return { ok: false, reason: "non-finite-geometry" };
  }
  return {
    ok: true,
    snapshot: {
      kind,
      handle,
      obb: geometry.obb,
      parentWorld,
      baseLocal: node.localTransform,
      pointerStart: pointerWorld,
      // Derived from the four world corners, so it is the real centre whatever the
      // transform. Reconstructing it as `x + width/2` of the UNROTATED box is off by
      // the rotation for any rotated layer.
      pivot: obbCenter(geometry.obb),
    },
  };
}

/**
 * One frame of the gesture.
 *
 * Pure: the same snapshot and pointer always give the same transform, whatever
 * happened in between.
 */
export function solveGesture(
  snapshot: GestureSnapshot,
  pointerWorld: WorldPoint,
  modifiers: GestureModifiers = {},
): GestureResult {
  if (!finite(pointerWorld.x) || !finite(pointerWorld.y)) {
    return { ok: false, reason: "non-finite-result" };
  }

  switch (snapshot.kind) {
    case "move": {
      const dx = pointerWorld.x - snapshot.pointerStart.x;
      const dy = pointerWorld.y - snapshot.pointerStart.y;
      const local = localTransformAfterWorldTransform(
        snapshot.parentWorld,
        snapshot.baseLocal,
        translation(dx, dy),
      );
      if (local === null) {
        return { ok: false, reason: "singular-parent" };
      }
      return {
        ok: true,
        frame: frameFor(snapshot, local, snapshot.obb.localBounds, 0, { dx, dy }),
      };
    }

    case "rotate": {
      const delta = rotationDeltaDegrees(
        snapshot.pivot,
        snapshot.pointerStart,
        pointerWorld,
        modifiers.angleSnapDegrees ?? 0,
      );
      if (delta === null) {
        return { ok: false, reason: "pointer-on-pivot" };
      }
      // Composed on the LEFT, about a WORLD pivot. This is what makes the object's
      // own centre a fixed point regardless of its existing transform or ancestors.
      const local = localTransformAfterWorldTransform(
        snapshot.parentWorld,
        snapshot.baseLocal,
        rotation(delta, snapshot.pivot.x, snapshot.pivot.y),
      );
      if (local === null) {
        return { ok: false, reason: "singular-parent" };
      }
      return {
        ok: true,
        frame: frameFor(snapshot, local, snapshot.obb.localBounds, delta, { dx: 0, dy: 0 }),
      };
    }

    case "resize": {
      const next = resizeLocalBounds(snapshot.obb, snapshot.handle, pointerWorld, {
        preserveAspect: modifiers.preserveAspect === true,
        fromCenter: modifiers.fromCenter === true,
      });
      if (next === null) {
        return { ok: false, reason: "singular-transform" };
      }
      const mapping = boundsMappingMatrix(snapshot.obb.localBounds, next);
      if (mapping === null) {
        return { ok: false, reason: "degenerate-bounds" };
      }
      // Composed on the RIGHT, in the node's own space. Prepending would move the
      // node instead of resizing it.
      const local = multiply(snapshot.baseLocal, mapping);
      if (!finiteMatrix(local)) {
        return { ok: false, reason: "non-finite-result" };
      }
      return { ok: true, frame: frameFor(snapshot, local, next, 0, { dx: 0, dy: 0 }) };
    }
  }
}

/**
 * Assemble the frame, including the resulting world corners.
 *
 * The corners run through `obbForNode`, the same entry point the committed
 * selection uses, so a preview box and a committed box are produced by one code
 * path and cannot disagree about what a corner is.
 */
function frameFor(
  snapshot: GestureSnapshot,
  localTransform: Matrix2D,
  localBounds: RectF,
  angleDegrees: number,
  worldDelta: { readonly dx: number; readonly dy: number },
): GestureFrame {
  const preview = obbForNode({
    id: "gesture-preview",
    worldTransform: multiply(snapshot.parentWorld, localTransform),
    localBounds: snapshot.obb.localBounds,
  });
  return {
    kind: snapshot.kind,
    localTransform,
    localBounds,
    angleDegrees,
    worldDelta,
    // Null rather than a guessed box: SelectionCanvas draws nothing for a
    // non-finite corner, which is the correct response to a degenerate transform.
    corners: preview.ok ? obbCorners(preview.obb).map((p) => worldPoint(p.x, p.y)) : null,
  };
}
