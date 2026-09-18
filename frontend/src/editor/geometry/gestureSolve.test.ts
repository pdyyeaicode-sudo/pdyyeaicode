/**
 * The assertions here are the DEFINITIONS of the three operations, not restatements
 * of the implementation:
 *
 *   move    a point on the object lands exactly one world delta further on
 *   resize  the dragged handle reaches the pointer, the opposite anchor is fixed
 *   rotate  the object's own centre does not move
 *
 * Each holds for every rotation, scale and nesting, so the same assertion covers the
 * whole matrix instead of needing per-case expected numbers — which is what made
 * earlier attempts at this either trivial or wrong.
 *
 * The scene used throughout is the one the browser fixture could NOT distinguish: a
 * node inside `translate(40 30) scale(2)` carrying its own rotation about a pivot
 * that is not its own centre.
 */

import { describe, expect, it } from "vitest";

import {
  beginGesture,
  boundsMappingMatrix,
  localTransformAfterWorldTransform,
  rotationDeltaDegrees,
  solveGesture,
  type GestureNode,
  type GestureSnapshot,
} from "./gestureSolve";
import { worldPoint } from "./coordinateSpaces";
import {
  anchorWorldPosition,
  handleWorldPosition,
  obbAngleDegrees,
  obbCenter,
  obbForNode,
  RESIZE_HANDLES,
  type ResizeHandleId,
} from "./selectionGeometry";
import {
  IDENTITY,
  invert,
  multiply,
  rotation,
  scaling,
  transformPoint,
  translation,
  type Matrix2D,
} from "../renderer/matrix2d";

const PARENT_WORLD: Matrix2D = multiply(translation(40, 30), scaling(2, 2));

/**
 * A 40x20 rect whose own transform rotates it about the LOCAL ORIGIN.
 *
 * The box centre is (20, 10), so the existing rotation's pivot is not the centre.
 * That is the detail that separates a left-composition from a right-composition;
 * when they coincide (as in the old browser fixture, whose rotation pivot WAS its
 * centre) both give the same answer and prove nothing.
 */
function nestedRotatedNode(existingRotationDegrees = 25): GestureNode {
  const localTransform = rotation(existingRotationDegrees, 0, 0);
  return {
    id: "n",
    localTransform,
    worldTransform: multiply(PARENT_WORLD, localTransform),
    localBounds: { x: 0, y: 0, width: 40, height: 20 },
  };
}

function snapshotFor(
  node: GestureNode,
  kind: GestureSnapshot["kind"],
  handle: ResizeHandleId,
  pointer: { x: number; y: number },
): GestureSnapshot {
  const started = beginGesture(node, PARENT_WORLD, kind, handle, worldPoint(pointer.x, pointer.y));
  if (!started.ok) {
    throw new Error(`snapshot failed: ${started.reason}`);
  }
  return started.snapshot;
}

/** Where the node's local point ends up after the frame. */
function worldAfter(
  snapshot: GestureSnapshot,
  localTransform: Matrix2D,
  local: { x: number; y: number },
): { x: number; y: number } {
  return transformPoint(multiply(snapshot.parentWorld, localTransform), local);
}

describe("boundsMappingMatrix", () => {
  it("maps the source box exactly onto the destination box", () => {
    const matrix = boundsMappingMatrix(
      { x: 10, y: 20, width: 40, height: 20 },
      { x: -5, y: 0, width: 80, height: 60 },
    );
    expect(matrix).not.toBeNull();
    if (matrix === null) return;
    const topLeft = transformPoint(matrix, { x: 10, y: 20 });
    const bottomRight = transformPoint(matrix, { x: 50, y: 40 });
    expect(topLeft.x).toBeCloseTo(-5, 10);
    expect(topLeft.y).toBeCloseTo(0, 10);
    expect(bottomRight.x).toBeCloseTo(75, 10);
    expect(bottomRight.y).toBeCloseTo(60, 10);
  });

  it("preserves a flip rather than clamping it", () => {
    const matrix = boundsMappingMatrix(
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 0, y: 0, width: -10, height: 10 },
    );
    expect(matrix?.a).toBe(-1);
  });

  it("refuses a zero-extent source instead of dividing by zero", () => {
    expect(boundsMappingMatrix({ x: 0, y: 0, width: 0, height: 10 }, { x: 0, y: 0, width: 5, height: 10 })).toBeNull();
    expect(boundsMappingMatrix({ x: 0, y: 0, width: 10, height: 0 }, { x: 0, y: 0, width: 5, height: 10 })).toBeNull();
  });
});

describe("localTransformAfterWorldTransform", () => {
  it("reduces a world translation to the inverse of the parent's linear part", () => {
    const local = localTransformAfterWorldTransform(PARENT_WORLD, IDENTITY, translation(40, -10));
    expect(local).not.toBeNull();
    if (local === null) return;
    // The parent scales by 2, so 40 world units is 20 parent units. Dividing by a
    // zoom would only be correct because this parent happens to be a uniform scale.
    expect(local.e).toBeCloseTo(20, 10);
    expect(local.f).toBeCloseTo(-5, 10);
    expect(local.a).toBeCloseTo(1, 10);
  });

  it("redirects the delta when an ancestor rotates", () => {
    // A quarter-turn parent turns a rightward world drag into a downward local one.
    const parent = rotation(90, 0, 0);
    const local = localTransformAfterWorldTransform(parent, IDENTITY, translation(10, 0));
    expect(local).not.toBeNull();
    if (local === null) return;
    expect(local.e).toBeCloseTo(0, 9);
    expect(local.f).toBeCloseTo(-10, 9);
  });

  it("reports a singular parent instead of moving the node by an unmapped delta", () => {
    expect(
      localTransformAfterWorldTransform(scaling(0, 1), IDENTITY, translation(10, 0)),
    ).toBeNull();
  });
});

describe("rotationDeltaDegrees", () => {
  const pivot = { x: 10, y: 20 };
  const at = (degrees: number) => ({
    x: pivot.x + 50 * Math.cos((degrees * Math.PI) / 180),
    y: pivot.y + 50 * Math.sin((degrees * Math.PI) / 180),
  });

  it("measures the signed angle swept about the pivot", () => {
    expect(rotationDeltaDegrees(pivot, at(0), at(37))).toBeCloseTo(37, 9);
    expect(rotationDeltaDegrees(pivot, at(0), at(-37))).toBeCloseTo(-37, 9);
  });

  it("snaps to the caller's step, in both directions", () => {
    expect(rotationDeltaDegrees(pivot, at(0), at(37), 15)).toBeCloseTo(30, 9);
    expect(rotationDeltaDegrees(pivot, at(0), at(-37), 15)).toBeCloseTo(-30, 9);
  });

  it("takes the short way round the boundary", () => {
    expect(rotationDeltaDegrees(pivot, at(170), at(-170))).toBeCloseTo(20, 9);
    expect(rotationDeltaDegrees(pivot, at(-170), at(170))).toBeCloseTo(-20, 9);
  });

  it("reports that a point has no angle to itself", () => {
    expect(rotationDeltaDegrees(pivot, pivot, at(10))).toBeNull();
    expect(rotationDeltaDegrees(pivot, at(10), pivot)).toBeNull();
  });
});

describe("solveGesture: move", () => {
  it("lands the object exactly one world delta further on, through a scaled ancestor", () => {
    const node = nestedRotatedNode();
    const snapshot = snapshotFor(node, "move", "nw", { x: 0, y: 0 });
    const before = transformPoint(node.worldTransform, { x: 20, y: 10 });

    const result = solveGesture(snapshot, worldPoint(37, -11));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = worldAfter(snapshot, result.frame.localTransform, { x: 20, y: 10 });
    expect(after.x - before.x).toBeCloseTo(37, 9);
    expect(after.y - before.y).toBeCloseTo(-11, 9);
    expect(result.frame.worldDelta).toEqual({ dx: 37, dy: -11 });
    // A move changes no geometry.
    expect(result.frame.localBounds).toEqual(node.localBounds);
    expect(result.frame.angleDegrees).toBe(0);
  });

  it("reports the corners of the moved box, offset by the same delta", () => {
    const node = nestedRotatedNode();
    const snapshot = snapshotFor(node, "move", "nw", { x: 0, y: 0 });
    const result = solveGesture(snapshot, worldPoint(12, 8));
    expect(result.ok).toBe(true);
    if (!result.ok || result.frame.corners === null) {
      throw new Error("expected corners");
    }
    expect(result.frame.corners[0].x).toBeCloseTo(snapshot.obb.topLeft.x + 12, 9);
    expect(result.frame.corners[0].y).toBeCloseTo(snapshot.obb.topLeft.y + 8, 9);
  });
});

describe("solveGesture: rotate", () => {
  it("keeps the object's own centre fixed, whatever its existing transform", () => {
    const node = nestedRotatedNode(25);
    const geometry = obbForNode(node);
    if (!geometry.ok) throw new Error(geometry.reason);
    const centre = obbCenter(geometry.obb);

    const radians = (30 * Math.PI) / 180;
    const snapshot = snapshotFor(node, "rotate", "nw", { x: centre.x + 100, y: centre.y });
    expect(snapshot.pivot.x).toBeCloseTo(centre.x, 10);
    expect(snapshot.pivot.y).toBeCloseTo(centre.y, 10);

    const result = solveGesture(
      snapshot,
      worldPoint(centre.x + 100 * Math.cos(radians), centre.y + 100 * Math.sin(radians)),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frame.angleDegrees).toBeCloseTo(30, 9);

    const moved = worldAfter(snapshot, result.frame.localTransform, { x: 20, y: 10 });
    expect(moved.x).toBeCloseTo(centre.x, 8);
    expect(moved.y).toBeCloseTo(centre.y, 8);

    // And it really turned by the dragged angle.
    const after = obbForNode({
      id: "after",
      worldTransform: multiply(snapshot.parentWorld, result.frame.localTransform),
      localBounds: node.localBounds,
    });
    if (!after.ok) throw new Error(after.reason);
    expect(obbAngleDegrees(after.obb) - obbAngleDegrees(geometry.obb)).toBeCloseTo(30, 8);
  });

  it("an existing rotation about a non-centre pivot: the OLD formulation moved the object", () => {
    // NON-VACUITY for the test above. Appending `rotate(δ, pivotInParentSpace)` to
    // the node's own transform — a right-composition carrying a left-composition's
    // pivot — is what the editor used to do. On this scene it moves the centre by
    // about ten world units. If both formulations agreed, the assertion above would
    // be measuring nothing.
    const node = nestedRotatedNode(25);
    const geometry = obbForNode(node);
    if (!geometry.ok) throw new Error(geometry.reason);
    const centre = obbCenter(geometry.obb);

    const inverse = invert(PARENT_WORLD);
    if (inverse === null) throw new Error("parent must be invertible");
    const pivotInParent = transformPoint(inverse, { x: centre.x, y: centre.y });
    const appended = multiply(node.localTransform, rotation(30, pivotInParent.x, pivotInParent.y));
    const wrong = transformPoint(multiply(PARENT_WORLD, appended), { x: 20, y: 10 });

    expect(Math.hypot(wrong.x - centre.x, wrong.y - centre.y)).toBeGreaterThan(5);
  });

  it("coincides with the old formulation when the existing pivot IS the centre", () => {
    // Why the defect stayed hidden: the browser fixture's layers were rotated about
    // their own centres, and there the two compositions are identical.
    const localTransform = rotation(25, 20, 10);
    const node: GestureNode = {
      id: "n",
      localTransform,
      worldTransform: multiply(PARENT_WORLD, localTransform),
      localBounds: { x: 0, y: 0, width: 40, height: 20 },
    };
    const geometry = obbForNode(node);
    if (!geometry.ok) throw new Error(geometry.reason);
    const centre = obbCenter(geometry.obb);

    const inverse = invert(PARENT_WORLD);
    if (inverse === null) throw new Error("parent must be invertible");
    const pivotInParent = transformPoint(inverse, { x: centre.x, y: centre.y });
    const appended = multiply(localTransform, rotation(30, pivotInParent.x, pivotInParent.y));
    const wrong = transformPoint(multiply(PARENT_WORLD, appended), { x: 20, y: 10 });

    expect(Math.hypot(wrong.x - centre.x, wrong.y - centre.y)).toBeLessThan(1e-9);
  });

  it("refuses a pointer sitting exactly on the pivot", () => {
    const node = nestedRotatedNode(0);
    const geometry = obbForNode(node);
    if (!geometry.ok) throw new Error(geometry.reason);
    const centre = obbCenter(geometry.obb);
    const snapshot = snapshotFor(node, "rotate", "nw", { x: centre.x, y: centre.y });
    const result = solveGesture(snapshot, worldPoint(centre.x + 10, centre.y));
    expect(result).toEqual({ ok: false, reason: "pointer-on-pivot" });
  });
});

describe("solveGesture: resize", () => {
  it("moves the dragged handle to the pointer and pins the opposite anchor", () => {
    const node = nestedRotatedNode();
    const geometry = obbForNode(node);
    if (!geometry.ok) throw new Error(geometry.reason);

    for (const handle of RESIZE_HANDLES) {
      const grab = handleWorldPosition(geometry.obb, handle);
      const snapshot = snapshotFor(node, "resize", handle, grab);
      const anchorBefore = anchorWorldPosition(geometry.obb, handle);

      // Not axis-aligned, so an error in either axis shows up rather than cancelling.
      const pointer = worldPoint(grab.x + 26, grab.y + 18);
      const result = solveGesture(snapshot, pointer);
      expect(result.ok, `${handle} should solve`).toBe(true);
      if (!result.ok) continue;

      const after = obbForNode({
        id: "after",
        worldTransform: multiply(snapshot.parentWorld, result.frame.localTransform),
        localBounds: node.localBounds,
      });
      if (!after.ok) throw new Error(after.reason);

      const anchorAfter = anchorWorldPosition(after.obb, handle);
      expect(anchorAfter.x, `${handle}: anchor x moved`).toBeCloseTo(anchorBefore.x, 8);
      expect(anchorAfter.y, `${handle}: anchor y moved`).toBeCloseTo(anchorBefore.y, 8);

      const handleAfter = handleWorldPosition(after.obb, handle);
      const isCorner = handle === "nw" || handle === "ne" || handle === "se" || handle === "sw";
      if (isCorner) {
        expect(handleAfter.x, `${handle}: did not reach the pointer`).toBeCloseTo(pointer.x, 8);
        expect(handleAfter.y, `${handle}: did not reach the pointer`).toBeCloseTo(pointer.y, 8);
      } else {
        // A side handle only tracks the pointer along its own axis, but it must move.
        expect(Math.hypot(handleAfter.x - grab.x, handleAfter.y - grab.y)).toBeGreaterThan(1);
      }
    }
  });

  it("reports the new local bounds, which is what the document commits", () => {
    const node = nestedRotatedNode(0);
    const geometry = obbForNode(node);
    if (!geometry.ok) throw new Error(geometry.reason);
    const grab = handleWorldPosition(geometry.obb, "e");
    const snapshot = snapshotFor(node, "resize", "e", grab);

    const result = solveGesture(snapshot, worldPoint(grab.x + 40, grab.y));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 40 world units through a 2x ancestor is 20 local units.
    expect(result.frame.localBounds.width).toBeCloseTo(60, 8);
    expect(result.frame.localBounds.height).toBeCloseTo(20, 8);
  });

  it("refuses a zero-extent box instead of producing an infinite matrix", () => {
    const localTransform = IDENTITY;
    const node: GestureNode = {
      id: "thin",
      localTransform,
      worldTransform: localTransform,
      localBounds: { x: 0, y: 0, width: 0, height: 10 },
    };
    const snapshot = snapshotFor(node, "resize", "e", { x: 0, y: 5 });
    expect(solveGesture(snapshot, worldPoint(30, 5))).toEqual({
      ok: false,
      reason: "degenerate-bounds",
    });
  });

  it("honours aspect lock and centre resize", () => {
    const node = nestedRotatedNode(0);
    const geometry = obbForNode(node);
    if (!geometry.ok) throw new Error(geometry.reason);
    const grab = handleWorldPosition(geometry.obb, "se");
    const snapshot = snapshotFor(node, "resize", "se", grab);

    const locked = solveGesture(snapshot, worldPoint(grab.x + 40, grab.y + 4), {
      preserveAspect: true,
    });
    expect(locked.ok).toBe(true);
    if (!locked.ok) return;
    const ratio = locked.frame.localBounds.width / locked.frame.localBounds.height;
    expect(ratio).toBeCloseTo(2, 8);

    const centred = solveGesture(snapshot, worldPoint(grab.x + 40, grab.y + 40), {
      fromCenter: true,
    });
    expect(centred.ok).toBe(true);
    if (!centred.ok) return;
    // Symmetric about the centre, so the box keeps its centre and grows both ways.
    const bounds = centred.frame.localBounds;
    expect(bounds.x + bounds.width / 2).toBeCloseTo(20, 8);
    expect(bounds.y + bounds.height / 2).toBeCloseTo(10, 8);
  });
});

describe("beginGesture", () => {
  it("refuses a node with no bounds rather than inventing a box", () => {
    const started = beginGesture(
      { id: "n", localTransform: IDENTITY, worldTransform: IDENTITY, localBounds: null },
      IDENTITY,
      "move",
      "nw",
      worldPoint(0, 0),
    );
    expect(started).toEqual({ ok: false, reason: "bounds-unavailable" });
  });

  it("refuses a collapsed node", () => {
    const started = beginGesture(
      {
        id: "n",
        localTransform: scaling(0, 1),
        worldTransform: scaling(0, 1),
        localBounds: { x: 0, y: 0, width: 10, height: 10 },
      },
      IDENTITY,
      "resize",
      "se",
      worldPoint(0, 0),
    );
    expect(started).toEqual({ ok: false, reason: "singular-transform" });
  });

  it("refuses a non-finite pointer", () => {
    const started = beginGesture(
      nestedRotatedNode(),
      PARENT_WORLD,
      "move",
      "nw",
      worldPoint(Number.NaN, 0),
    );
    expect(started).toEqual({ ok: false, reason: "non-finite-geometry" });
  });
});
