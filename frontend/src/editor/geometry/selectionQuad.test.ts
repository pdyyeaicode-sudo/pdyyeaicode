import { describe, expect, it } from "vitest";

import {
  quadBox,
  quadCentroid,
  quadCornerRotationZone,
  quadFromWorldCorners,
  quadHandlePosition,
  quadIsDegenerate,
  quadIsFlipped,
  quadPolygonPoints,
  quadRotationHandle,
  type SelectionQuad,
} from "./selectionQuad";
import { canvasViewFrom, clientPoint } from "./coordinateSpaces";

/**
 * The cases that discriminate a quad from a box-and-angle.
 *
 * An unrotated square is not one of them: every representation agrees there, which is
 * why the reduction survived so long. The tests that matter are the flip and the skew,
 * because those are the two degrees of freedom `(x, y, width, height, angle)` cannot
 * carry.
 */

const UNROTATED: SelectionQuad = [
  { x: 10, y: 20 },
  { x: 110, y: 20 },
  { x: 110, y: 80 },
  { x: 10, y: 80 },
];

/** Rotated 90 degrees clockwise about its own centre. */
const ROTATED: SelectionQuad = [
  { x: 90, y: 0 },
  { x: 90, y: 100 },
  { x: 30, y: 100 },
  { x: 30, y: 0 },
];

/** Mirrored horizontally: the local top-left is now on the RIGHT. */
const FLIPPED: SelectionQuad = [
  { x: 110, y: 20 },
  { x: 10, y: 20 },
  { x: 10, y: 80 },
  { x: 110, y: 80 },
];

/** Sheared: the top edge is offset from the bottom edge. No rectangle fits this. */
const SKEWED: SelectionQuad = [
  { x: 30, y: 20 },
  { x: 130, y: 20 },
  { x: 110, y: 80 },
  { x: 10, y: 80 },
];

describe("quadHandlePosition", () => {
  it("puts corner handles exactly on the corners", () => {
    expect(quadHandlePosition(UNROTATED, "nw")).toEqual({ x: 10, y: 20 });
    expect(quadHandlePosition(UNROTATED, "ne")).toEqual({ x: 110, y: 20 });
    expect(quadHandlePosition(UNROTATED, "se")).toEqual({ x: 110, y: 80 });
    expect(quadHandlePosition(UNROTATED, "sw")).toEqual({ x: 10, y: 80 });
  });

  it("puts edge handles on edge midpoints", () => {
    expect(quadHandlePosition(UNROTATED, "n")).toEqual({ x: 60, y: 20 });
    expect(quadHandlePosition(UNROTATED, "e")).toEqual({ x: 110, y: 50 });
    expect(quadHandlePosition(UNROTATED, "s")).toEqual({ x: 60, y: 80 });
    expect(quadHandlePosition(UNROTATED, "w")).toEqual({ x: 10, y: 50 });
  });

  it("keeps each handle on the OBJECT's own corner through a rotation", () => {
    // "nw" is the object's local top-left. After a 90-degree turn it is at the top
    // right of the screen, and it must still be reported as nw — that is what makes a
    // drag resize along the object's own axis rather than the screen's.
    expect(quadHandlePosition(ROTATED, "nw")).toEqual({ x: 90, y: 0 });
    expect(quadHandlePosition(ROTATED, "n")).toEqual({ x: 90, y: 50 });
  });

  it("follows a flip, which a box and an angle cannot express", () => {
    // The local top-left is at screen x=110. A representation storing an origin plus
    // positive extents plus an angle would have to call this a 180-degree rotation,
    // which puts every handle on the wrong corner.
    expect(quadHandlePosition(FLIPPED, "nw")).toEqual({ x: 110, y: 20 });
    expect(quadHandlePosition(FLIPPED, "ne")).toEqual({ x: 10, y: 20 });
    expect(quadHandlePosition(FLIPPED, "n")).toEqual({ x: 60, y: 20 });
  });

  it("follows a skew, which no rectangle fits at all", () => {
    expect(quadHandlePosition(SKEWED, "nw")).toEqual({ x: 30, y: 20 });
    expect(quadHandlePosition(SKEWED, "sw")).toEqual({ x: 10, y: 80 });
    // The west edge's midpoint is genuinely not above the south-west corner.
    expect(quadHandlePosition(SKEWED, "w")).toEqual({ x: 20, y: 50 });
  });
});

describe("quadCentroid", () => {
  it("is the object's centre under any of the four transforms", () => {
    expect(quadCentroid(UNROTATED)).toEqual({ x: 60, y: 50 });
    expect(quadCentroid(ROTATED)).toEqual({ x: 60, y: 50 });
    expect(quadCentroid(FLIPPED)).toEqual({ x: 60, y: 50 });
    expect(quadCentroid(SKEWED)).toEqual({ x: 70, y: 50 });
  });
});

describe("quadRotationHandle", () => {
  it("sits above an unrotated object", () => {
    const handle = quadRotationHandle(UNROTATED, 28)!;
    expect(handle.x).toBeCloseTo(60, 9);
    expect(handle.y).toBeCloseTo(20 - 28, 9);
  });

  it("follows the object's own top edge when rotated", () => {
    // The rotated quad's top edge runs down the screen at x=90, so its outward normal
    // points to the right (+x) — away from the centre at x=60.
    const handle = quadRotationHandle(ROTATED, 28)!;
    expect(handle.x).toBeCloseTo(90 + 28, 9);
    expect(handle.y).toBeCloseTo(50, 9);
  });

  it("stays OUTSIDE a mirrored object rather than landing on top of it", () => {
    // A flip reverses the quad's winding, so a fixed normal sign would put the grip
    // below the top edge — inside the shape. Choosing the sign by pointing away from
    // the centroid is what prevents that.
    const handle = quadRotationHandle(FLIPPED, 28)!;
    expect(handle.x).toBeCloseTo(60, 9);
    expect(handle.y).toBeCloseTo(20 - 28, 9);
  });

  it("reports a degenerate quad instead of placing a grip", () => {
    const collapsed: SelectionQuad = [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ];
    expect(quadRotationHandle(collapsed, 28)).toBeNull();
  });
});

describe("quadCornerRotationZone", () => {
  it("pushes each zone diagonally outward from the centre", () => {
    const zone = quadCornerRotationZone(UNROTATED, "nw", Math.SQRT2 * 10)!;
    // Direction from the centre (60,50) to the corner (10,20) is (-50,-30)/58.31.
    const length = Math.hypot(-50, -30);
    expect(zone.x).toBeCloseTo(10 + (-50 / length) * Math.SQRT2 * 10, 9);
    expect(zone.y).toBeCloseTo(20 + (-30 / length) * Math.SQRT2 * 10, 9);
  });

  it("stays outside the shape when the shape is rotated past a right angle", () => {
    // The old code offset by a fixed screen diagonal per corner NAME, so once the
    // object turned far enough the "north-west" zone pointed into the shape. Here the
    // direction is measured, so every zone is farther from the centre than its corner.
    for (const corner of ["nw", "ne", "se", "sw"] as const) {
      const centre = quadCentroid(ROTATED);
      const at = quadHandlePosition(ROTATED, corner);
      const zone = quadCornerRotationZone(ROTATED, corner, 20)!;
      const cornerDistance = Math.hypot(at.x - centre.x, at.y - centre.y);
      const zoneDistance = Math.hypot(zone.x - centre.x, zone.y - centre.y);
      expect(zoneDistance, `${corner} zone`).toBeGreaterThan(cornerDistance);
    }
  });
});

describe("quadIsFlipped", () => {
  it("distinguishes a mirror from a rotation", () => {
    expect(quadIsFlipped(UNROTATED)).toBe(false);
    expect(quadIsFlipped(ROTATED)).toBe(false);
    expect(quadIsFlipped(SKEWED)).toBe(false);
    expect(quadIsFlipped(FLIPPED)).toBe(true);
  });
});

describe("quadIsDegenerate", () => {
  it("detects a quad collapsed onto a line even when its edges are long", () => {
    const line: SelectionQuad = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 0 },
    ];
    expect(quadIsDegenerate(line)).toBe(true);
    expect(quadIsDegenerate(UNROTATED)).toBe(false);
    expect(quadIsDegenerate(SKEWED)).toBe(false);
  });
});

describe("quadBox", () => {
  it("is the axis-aligned hull, which grows when the object rotates", () => {
    expect(quadBox(UNROTATED)).toEqual({ x: 10, y: 20, width: 100, height: 60 });
    expect(quadBox(ROTATED)).toEqual({ x: 30, y: 0, width: 60, height: 100 });
    expect(quadBox(SKEWED)).toEqual({ x: 10, y: 20, width: 120, height: 60 });
  });
});

describe("quadFromWorldCorners", () => {
  const view = canvasViewFrom(
    { left: 0, top: 0, width: 800, height: 600 } as DOMRect,
    { left: 100, top: 50, width: 400, height: 400 } as DOMRect,
    2,
    1,
  );

  it("produces a usable view for these fixtures", () => {
    expect(view).not.toBeNull();
  });
  it("converts each corner independently", () => {
    const quad = quadFromWorldCorners(view!, [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 30 },
      { x: 0, y: 30 },
    ])!;
    expect(quad).not.toBeNull();
    // World (0,0) is the wrapper's top-left, and zoom 2 doubles every offset.
    expect(quad[0]).toEqual({ x: 100, y: 50 });
    expect(quad[1]).toEqual({ x: 200, y: 50 });
    expect(quad[2]).toEqual({ x: 200, y: 110 });
    expect(quad[3]).toEqual({ x: 100, y: 110 });
  });

  it("refuses a non-finite corner rather than drawing somewhere arbitrary", () => {
    expect(
      quadFromWorldCorners(view!, [
        { x: 0, y: 0 },
        { x: Number.NaN, y: 0 },
        { x: 50, y: 30 },
        { x: 0, y: 30 },
      ]),
    ).toBeNull();
  });

  it("refuses anything that is not four corners", () => {
    expect(quadFromWorldCorners(view!, [{ x: 0, y: 0 }])).toBeNull();
  });
});

describe("quadPolygonPoints", () => {
  it("emits the corners in draw order", () => {
    expect(quadPolygonPoints(UNROTATED)).toBe("10,20 110,20 110,80 10,80");
  });
});
