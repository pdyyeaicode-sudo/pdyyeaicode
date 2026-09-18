/**
 * transformDelta — moving an object by a world-space delta, in whichever space
 * the write actually lands in.
 *
 * A drag produces one fact: "the pointer moved this far across the artboard".
 * Turning that into a document edit needs the delta expressed in the space the
 * edit is written to, and the editor writes to THREE different spaces:
 *
 * | Consumer | Space | Why |
 * |---|---|---|
 * | the Pydee engine (`setNodeDocumentTranslation`) | world | it does the conversion itself |
 * | the DOM preview (`transform` attribute prepend) | parent | an element's transform maps its own space into its parent's |
 * | `translateLayerCommand` (`offsetLayer`) | local | it shifts geometry coordinates, which live inside the node's own transform |
 *
 * Passing the same number to all three is only correct when every transform in
 * the chain is the identity. `useCanvasDrag` used to compute `dx / zoom` and hand
 * that to all of them, which is why a layer inside a scaled group over-travelled
 * by the group's scale and a layer inside a rotated group travelled in the wrong
 * DIRECTION. Both were measured in Chromium — see
 * browser-tests/nestedTransformDrag.spec.ts.
 *
 * ## The maths, and why it is this and not a division
 *
 * To move a node by world translation `T`, its local transform `L` must become
 * `L' = P⁻¹ · T · P · L`, where `P` is the parent's world transform. Writing
 * `P = [M | p]` and `T = [I | t]`:
 *
 * ```
 * P⁻¹ · T · P = [M⁻¹ | -M⁻¹p] · [M | p + t] = [I | M⁻¹t]
 * ```
 *
 * So the conversion is the inverse of the basis's LINEAR part applied to the
 * delta — no translation term, because a delta has no position. Dividing by a
 * scalar (`zoom`) is the special case where `M` is a uniform scale with no
 * rotation, which is exactly the case the old code assumed.
 *
 * This is the same expression the engine evaluates in
 * `bindings.cpp::setNodeDocumentTranslation`. That is not a coincidence to be
 * maintained by hand: engine-parity.mts applies a translation through the engine
 * and through this module and requires the resulting world transforms to agree to
 * 1e-9, so the two cannot drift.
 *
 * One responsibility per file: converting a world-space delta between spaces.
 */

import { IDENTITY, invert, multiply, type Matrix2D } from "../renderer/matrix2d";

/** A delta, in whatever space its producer names. */
export interface Delta {
  readonly dx: number;
  readonly dy: number;
}

/**
 * `delta`, re-expressed in the space that `basis` maps OUT of.
 *
 * Returns null for a singular or non-finite basis: a collapsed ancestor makes the
 * gesture meaningless, and moving the node by an unconverted delta would send it
 * somewhere arbitrary. Reported, never approximated.
 */
export function worldDeltaInSpaceOf(basis: Matrix2D, delta: Delta): Delta | null {
  const inverse = invert(basis);
  if (inverse === null) {
    return null;
  }
  // Linear part only. Including `e`/`f` would add the basis's own position to a
  // displacement, which is the classic "pan applied twice" bug in another guise.
  const dx = inverse.a * delta.dx + inverse.c * delta.dy;
  const dy = inverse.b * delta.dx + inverse.d * delta.dy;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return null;
  }
  return { dx, dy };
}

/** The minimum a node must expose. Structural, so any scene node satisfies it. */
export interface TransformChainNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly localTransform: Matrix2D;
  readonly worldTransform: Matrix2D;
}

/**
 * The parent's world transform, taken from the parent itself where possible.
 *
 * `world = parentWorld · local`, so the parent's matrix could also be recovered as
 * `world · local⁻¹`. The direct lookup is preferred because it needs no inversion
 * and therefore still works when the node's own transform is singular. When a
 * `parentId` is set but the parent is absent from the scene, that is a real
 * inconsistency and null is returned rather than silently treating the node as a
 * root — which would drag it by an unconverted delta.
 */
export function parentWorldTransform(
  node: TransformChainNode,
  lookup: (id: string) => TransformChainNode | undefined,
): Matrix2D | null {
  if (node.parentId === null) {
    // A root's parent space IS world space only if its world transform is its own
    // local transform. Asserting that here would need a tolerance; instead the
    // relationship is checked in transformDelta.test.ts against real scenes.
    return IDENTITY;
  }
  const parent = lookup(node.parentId);
  if (parent === undefined) {
    return null;
  }
  return parent.worldTransform;
}

/** Every delta a drag needs, derived from one world-space displacement. */
export interface DragDeltas {
  /** Unchanged world/document delta, for the engine and for snapping. */
  readonly world: Delta;
  /** For a `transform` attribute prepend on the element. */
  readonly parent: Delta;
  /** For `offsetLayer`, which shifts geometry inside the node's own transform. */
  readonly local: Delta;
}

/**
 * All three representations of one world-space drag delta.
 *
 * Returns null when any required transform is singular, so callers refuse the
 * gesture instead of committing a wrong position.
 */
export function dragDeltasFor(
  node: TransformChainNode,
  lookup: (id: string) => TransformChainNode | undefined,
  worldDelta: Delta,
): DragDeltas | null {
  const parentWorld = parentWorldTransform(node, lookup);
  if (parentWorld === null) {
    return null;
  }
  const parent = worldDeltaInSpaceOf(parentWorld, worldDelta);
  const local = worldDeltaInSpaceOf(node.worldTransform, worldDelta);
  if (parent === null || local === null) {
    return null;
  }
  return { world: worldDelta, parent, local };
}

/**
 * The node's local transform after a world-space translation, i.e. `P⁻¹·T·P·L`.
 *
 * Exists so the parity suite can compare this module against the engine on the
 * one observable both produce: the node's resulting world transform.
 */
export function localTransformAfterWorldTranslation(
  node: TransformChainNode,
  lookup: (id: string) => TransformChainNode | undefined,
  worldDelta: Delta,
): Matrix2D | null {
  const parentWorld = parentWorldTransform(node, lookup);
  if (parentWorld === null) {
    return null;
  }
  const inParentSpace = worldDeltaInSpaceOf(parentWorld, worldDelta);
  if (inParentSpace === null) {
    return null;
  }
  const translation: Matrix2D = {
    a: 1,
    b: 0,
    c: 0,
    d: 1,
    e: inParentSpace.dx,
    f: inParentSpace.dy,
  };
  return multiply(translation, node.localTransform);
}
