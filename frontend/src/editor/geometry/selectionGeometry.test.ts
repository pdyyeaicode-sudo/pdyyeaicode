/**
 * Tests for selection geometry.
 *
 * These are the invariants the selection UI rests on, and they are asserted
 * numerically rather than by "something moved":
 *
 *   - each OBB corner equals the transformed corresponding object corner
 *   - the selection centre equals the transformed object centre
 *   - handle positions lie exactly on the box corners and edge midpoints
 *   - a corner drag resizes along the object's ROTATED local axes
 *   - the opposite anchor stays fixed
 *   - failures are reported by reason, never substituted with another box
 */

import { describe, expect, it } from "vitest";

import {
  aabbForNodes,
  anchorWorldPosition,
  handleAtViewportPoint,
  handleWorldPosition,
  obbAngleDegrees,
  obbCenter,
  obbCorners,
  obbForNode,
  obbIsFlipped,
  obbToViewport,
  resizeLocalBounds,
  RESIZE_HANDLES,
  type OrientedBox,
  type TransformedNode,
} from "./selectionGeometry";
import { canvasViewFrom, worldPoint, viewportPoint } from "./coordinateSpaces";
import {
  IDENTITY,
  multiply,
  rotation,
  scaling,
  transformPoint,
  translation,
  type Matrix2D,
} from "../renderer/matrix2d";

const BOUNDS = { x: 10, y: 20, width: 100, height: 50 };

function node(worldTransform: Matrix2D, bounds = BOUNDS): TransformedNode {
  return { id: "n1", worldTransform, localBounds: bounds };
}

function obbOf(worldTransform: Matrix2D, bounds = BOUNDS): OrientedBox {
  const result = obbForNode(node(worldTransform, bounds));
  if (!result.ok) {
    throw new Error(`expected an OBB, got ${result.reason}`);
  }
  return result.obb;
}

/** The four local corners, in the same order `obbCorners` returns. */
const localCorners = (b = BOUNDS) => [
  { x: b.x, y: b.y },
  { x: b.x + b.width, y: b.y },
  { x: b.x + b.width, y: b.y + b.height },
  { x: b.x, y: b.y + b.height },
];

describe("obbForNode", () => {
  it("puts every corner exactly where the transform puts the object's corner", () => {
    // Rotation, non-uniform scale and translation together, so no single
    // simplification could accidentally pass.
    const world = multiply(multiply(translation(200, 120), rotation(37)), scaling(1.5, 0.75));
    const obb = obbOf(world);

    const expected = localCorners().map((corner) => transformPoint(world, corner));
    obbCorners(obb).forEach((actual, index) => {
      expect(actual.x, `corner ${index} x`).toBeCloseTo(expected[index].x, 9);
      expect(actual.y, `corner ${index} y`).toBeCloseTo(expected[index].y, 9);
    });
  });

  it("centre equals the transformed object centre", () => {
    const world = multiply(translation(-30, 90), rotation(115));
    const obb = obbOf(world);

    const expected = transformPoint(world, {
      x: BOUNDS.x + BOUNDS.width / 2,
      y: BOUNDS.y + BOUNDS.height / 2,
    });
    const centre = obbCenter(obb);
    expect(centre.x).toBeCloseTo(expected.x, 9);
    expect(centre.y).toBeCloseTo(expected.y, 9);
  });

  it("includes the full ancestor chain, not just the local transform", () => {
    // A group rotated 90 degrees containing a child translated (5, 0). If only the
    // child's local transform were used, the corner would be to the RIGHT of the
    // group origin instead of below it.
    const groupWorld = rotation(90);
    const childWorld = multiply(groupWorld, translation(5, 0));
    const obb = obbOf(childWorld, { x: 0, y: 0, width: 10, height: 10 });

    // local (0,0) -> +(5,0) -> rotate 90 -> (0,5)
    expect(obb.topLeft.x).toBeCloseTo(0, 9);
    expect(obb.topLeft.y).toBeCloseTo(5, 9);
  });

  it("reports missing bounds instead of inventing a box", () => {
    const result = obbForNode({ id: "text-1", worldTransform: IDENTITY, localBounds: null });
    expect(result).toEqual({ ok: false, reason: "bounds-unavailable", nodeId: "text-1" });
  });

  it("reports a singular transform instead of drawing a collapsed box", () => {
    const result = obbForNode(node(scaling(0, 1)));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("singular-transform");
    }
  });

  it("reports non-finite bounds", () => {
    const result = obbForNode(
      node(IDENTITY, { x: 0, y: 0, width: Number.NaN, height: 10 }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("non-finite-geometry");
    }
  });
});

describe("obbAngleDegrees", () => {
  it.each([0, 15, 45, 90, 135, 180, 270])("derives %i degrees from the corners", (angle) => {
    const obb = obbOf(rotation(angle));
    // atan2 wraps at 180, so compare on the unit circle rather than numerically.
    const expected = ((angle % 360) + 360) % 360;
    const actual = ((obbAngleDegrees(obb) % 360) + 360) % 360;
    expect(Math.cos((actual * Math.PI) / 180)).toBeCloseTo(
      Math.cos((expected * Math.PI) / 180),
      9,
    );
    expect(Math.sin((actual * Math.PI) / 180)).toBeCloseTo(
      Math.sin((expected * Math.PI) / 180),
      9,
    );
  });
});

describe("flip", () => {
  it("detects a horizontal flip from the transform determinant", () => {
    expect(obbIsFlipped(obbOf(scaling(-1, 1)))).toBe(true);
    expect(obbIsFlipped(obbOf(scaling(1, -1)))).toBe(true);
    // Two reflections cancel, so this is a 180 degree rotation, not a flip.
    expect(obbIsFlipped(obbOf(scaling(-1, -1)))).toBe(false);
    expect(obbIsFlipped(obbOf(rotation(45)))).toBe(false);
  });

  it("still places corners at the transformed object corners when flipped", () => {
    const world = multiply(translation(50, 0), scaling(-1, 1));
    const obb = obbOf(world);
    const expected = localCorners().map((corner) => transformPoint(world, corner));
    obbCorners(obb).forEach((actual, index) => {
      expect(actual.x).toBeCloseTo(expected[index].x, 9);
      expect(actual.y).toBeCloseTo(expected[index].y, 9);
    });
  });
});

describe("handle positions", () => {
  it("corner handles sit exactly on the box corners at any rotation", () => {
    const obb = obbOf(multiply(translation(10, 10), rotation(28)));
    expect(handleWorldPosition(obb, "nw")).toEqual(obb.topLeft);
    expect(handleWorldPosition(obb, "ne")).toEqual(obb.topRight);
    expect(handleWorldPosition(obb, "se")).toEqual(obb.bottomRight);
    expect(handleWorldPosition(obb, "sw")).toEqual(obb.bottomLeft);
  });

  it("side handles sit exactly on the edge midpoints", () => {
    const obb = obbOf(rotation(62));
    const north = handleWorldPosition(obb, "n");
    expect(north.x).toBeCloseTo((obb.topLeft.x + obb.topRight.x) / 2, 9);
    expect(north.y).toBeCloseTo((obb.topLeft.y + obb.topRight.y) / 2, 9);
  });

  it("every handle's anchor is the opposite handle", () => {
    const obb = obbOf(rotation(17));
    expect(anchorWorldPosition(obb, "nw")).toEqual(handleWorldPosition(obb, "se"));
    expect(anchorWorldPosition(obb, "n")).toEqual(handleWorldPosition(obb, "s"));
    expect(anchorWorldPosition(obb, "e")).toEqual(handleWorldPosition(obb, "w"));
  });
});

describe("obbToViewport", () => {
  const view = canvasViewFrom({ left: 0, top: 0 }, { left: 100, top: 50 }, 2)!;

  it("edge lengths scale by zoom and the angle is preserved", () => {
    const obb = obbOf(rotation(30));
    const selection = obbToViewport(view, obb);

    expect(selection.width).toBeCloseTo(BOUNDS.width * 2, 6);
    expect(selection.height).toBeCloseTo(BOUNDS.height * 2, 6);
    // A uniform scale preserves angles.
    expect(selection.angle).toBeCloseTo(30, 6);
  });

  it("handles land on the converted corners, so the visual matches the maths", () => {
    const obb = obbOf(multiply(translation(5, 5), rotation(41)));
    const selection = obbToViewport(view, obb);

    expect(selection.handles.nw.x).toBeCloseTo(selection.corners[0].x, 9);
    expect(selection.handles.nw.y).toBeCloseTo(selection.corners[0].y, 9);
    expect(selection.handles.se.x).toBeCloseTo(selection.corners[2].x, 9);
  });

  it("the rotation handle sits off the top edge, away from the box centre", () => {
    const obb = obbOf(IDENTITY);
    const selection = obbToViewport(view, obb);
    const topMid = selection.handles.n;

    // Unrotated, "away from the bottom" is straight up, i.e. smaller y.
    expect(selection.rotation.x).toBeCloseTo(topMid.x, 6);
    expect(selection.rotation.y).toBeLessThan(topMid.y);
    expect(topMid.y - selection.rotation.y).toBeCloseTo(28, 6);
  });

  it("keeps the rotation handle the same distance away at every zoom", () => {
    const obb = obbOf(IDENTITY);
    for (const zoom of [0.5, 1, 2, 4]) {
      const zoomed = canvasViewFrom({ left: 0, top: 0 }, { left: 0, top: 0 }, zoom)!;
      const selection = obbToViewport(zoomed, obb);
      const distance = selection.handles.n.y - selection.rotation.y;
      expect(distance, `zoom ${zoom}`).toBeCloseTo(28, 6);
    }
  });
});

describe("resizeLocalBounds", () => {
  it("resizes along the object's ROTATED axes, not screen axes", () => {
    // Rotated 90 degrees: dragging the east handle moves the object's local +x,
    // which points DOWN the screen. A screen-space implementation would resize
    // width from a vertical drag, which is the bug this guards.
    const obb = obbOf(rotation(90), { x: 0, y: 0, width: 100, height: 50 });

    // World point 40 units below the origin is local (40, 0) after un-rotating.
    const next = resizeLocalBounds(obb, "e", worldPoint(0, 40));
    expect(next).not.toBeNull();
    expect(next?.width).toBeCloseTo(40, 6);
    expect(next?.height).toBeCloseTo(50, 6);
  });

  it("keeps the opposite anchor fixed", () => {
    const obb = obbOf(IDENTITY, { x: 0, y: 0, width: 100, height: 50 });
    const next = resizeLocalBounds(obb, "nw", worldPoint(20, 10));

    // The south-east corner must not have moved.
    expect(next).not.toBeNull();
    expect((next?.x ?? 0) + (next?.width ?? 0)).toBeCloseTo(100, 6);
    expect((next?.y ?? 0) + (next?.height ?? 0)).toBeCloseTo(50, 6);
    expect(next?.x).toBeCloseTo(20, 6);
    expect(next?.y).toBeCloseTo(10, 6);
  });

  it("a side handle moves only its own edge", () => {
    const obb = obbOf(IDENTITY, { x: 0, y: 0, width: 100, height: 50 });
    const next = resizeLocalBounds(obb, "s", worldPoint(999, 80));

    expect(next?.x).toBe(0);
    expect(next?.width).toBe(100);
    expect(next?.y).toBe(0);
    expect(next?.height).toBeCloseTo(80, 6);
  });

  it("preserves aspect ratio on a corner when asked", () => {
    const obb = obbOf(IDENTITY, { x: 0, y: 0, width: 100, height: 50 });
    const next = resizeLocalBounds(obb, "se", worldPoint(200, 60), { preserveAspect: true });

    expect(next).not.toBeNull();
    // Ratio 0.5 preserved: the dominant axis wins and the other follows.
    expect(Math.abs((next?.height ?? 0) / (next?.width ?? 1))).toBeCloseTo(0.5, 6);
  });

  it("resizes about the centre when asked", () => {
    const obb = obbOf(IDENTITY, { x: 0, y: 0, width: 100, height: 50 });
    const next = resizeLocalBounds(obb, "e", worldPoint(70, 0), { fromCenter: true });

    // Centre stays at x = 50, so half-width becomes 20 and the box spans 30..70.
    expect(next?.x).toBeCloseTo(30, 6);
    expect(next?.width).toBeCloseTo(40, 6);
  });

  it("allows a flip through zero rather than clamping", () => {
    const obb = obbOf(IDENTITY, { x: 0, y: 0, width: 100, height: 50 });
    const next = resizeLocalBounds(obb, "e", worldPoint(-30, 0));

    // A negative width is a horizontal flip, which is a legitimate transform.
    expect(next?.width).toBeCloseTo(-30, 6);
  });

  it("returns null for a singular transform instead of guessing", () => {
    const obb: OrientedBox = {
      ...obbOf(IDENTITY),
      worldTransform: scaling(0, 0),
    };
    expect(resizeLocalBounds(obb, "se", worldPoint(1, 1))).toBeNull();
  });
});

describe("handleAtViewportPoint", () => {
  const view = canvasViewFrom({ left: 0, top: 0 }, { left: 0, top: 0 }, 1)!;

  it("finds a rotated corner handle, because hit areas follow the corners", () => {
    const obb = obbOf(rotation(45));
    const selection = obbToViewport(view, obb);
    const corner = selection.handles.ne;

    expect(handleAtViewportPoint(selection, viewportPoint(corner.x, corner.y))).toBe("ne");
  });

  it("prefers a corner over a side where they overlap", () => {
    const obb = obbOf(IDENTITY, { x: 0, y: 0, width: 2, height: 2 });
    const selection = obbToViewport(view, obb);
    // With a tiny box every handle is within the hit radius of every other.
    expect(handleAtViewportPoint(selection, selection.handles.nw)).toBe("nw");
  });

  it("returns null away from every handle", () => {
    const obb = obbOf(IDENTITY);
    const selection = obbToViewport(view, obb);
    expect(handleAtViewportPoint(selection, viewportPoint(-500, -500))).toBeNull();
  });

  it("finds the rotation handle", () => {
    const obb = obbOf(IDENTITY);
    const selection = obbToViewport(view, obb);
    expect(handleAtViewportPoint(selection, selection.rotation)).toBe("rotate");
  });

  it("covers every resize handle", () => {
    const obb = obbOf(rotation(12));
    const selection = obbToViewport(view, obb);
    for (const handle of RESIZE_HANDLES) {
      expect(handleAtViewportPoint(selection, selection.handles[handle], 3)).toBe(handle);
    }
  });
});

describe("aabbForNodes", () => {
  it("unions the world corners of a multi-selection", () => {
    const first = node(IDENTITY, { x: 0, y: 0, width: 10, height: 10 });
    const second = node(translation(90, 40), { x: 0, y: 0, width: 10, height: 10 });

    const result = aabbForNodes([first, second]);
    expect(result?.rect).toEqual({ x: 0, y: 0, width: 100, height: 50, space: "world" });
    expect(result?.errors).toEqual([]);
  });

  it("keeps going past a node with no geometry, and reports it", () => {
    const good = node(IDENTITY, { x: 0, y: 0, width: 10, height: 10 });
    const bad: TransformedNode = { id: "bad", worldTransform: IDENTITY, localBounds: null };

    const result = aabbForNodes([good, bad]);
    expect(result?.rect.width).toBe(10);
    expect(result?.errors).toHaveLength(1);
    expect(result?.errors[0].nodeId).toBe("bad");
  });

  it("returns null when nothing has geometry", () => {
    expect(
      aabbForNodes([{ id: "a", worldTransform: IDENTITY, localBounds: null }]),
    ).toBeNull();
  });
});
