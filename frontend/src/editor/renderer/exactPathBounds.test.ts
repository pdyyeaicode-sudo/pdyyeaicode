import { describe, expect, it } from "vitest";

import { exactPathBounds } from "./exactPathBounds";
import { conservativePathBounds } from "./pathBounds";
import { generateShapePath } from "../hooks/useShapeDrawing";
import type { RectF } from "./matrix2d";

/**
 * The property under test is the one the selection box depends on:
 *
 *     for a shape generated to fill the box (x, y, w, h),
 *     the tight bounds of its path data ARE that box.
 *
 * Every generator in `generateShapePath` builds its geometry from `left/right/
 * top/bottom`, so any disagreement is a defect in either the generator or the
 * measurement — and either way it is a selection box that does not fit its shape.
 *
 * The same cases are asserted against `conservativePathBounds` to record HOW WRONG
 * the superset is, because "conservative" reads as a small safety margin and it is
 * not: a donut's box comes out at twice the shape's size. Those numbers are the
 * reason this module exists, so they are pinned rather than described.
 */

const BOX: RectF = { x: 40, y: 60, width: 120, height: 90 };

/**
 * Shapes whose generated path is expected to exactly fill the drag box.
 *
 * `rectangle`, `circle`, `ellipse`, `line` and `triangle` are deliberately absent:
 * they are built in `getShapePreviewPath`'s own switch and never reach
 * `generateShapePath`, which returns "" for them.
 */
const FILLS_ITS_BOX = [
  "rounded-rect",
  "diamond",
  "hexagon",
  "octagon",
  "cross",
  "donut",
  "chat-bubble",
  "banner",
  "shield",
] as const;

/**
 * Shapes that deliberately do NOT fill the box, with the reason.
 *
 * Recorded rather than excluded silently: an inscribed shape is a design choice, a
 * shape that overflows its box is a defect, and only an explicit list distinguishes
 * them.
 */
const INSCRIBED: Readonly<Record<string, string>> = {
  star: "inscribed in a circle of radius min(w,h)/2, so it is square inside a non-square box",
  badge: "inscribed in a circle of radius min(w,h)/2, like star",
  pentagon: "the generator's vertices start at 38% height, so the top edge is the only apex",
  heart: "the generator uses `bottom * 0.9` as a control coordinate, which is not a box-relative value",
};

function boundsOf(shape: string): RectF {
  const d = generateShapePath(
    shape as Parameters<typeof generateShapePath>[0],
    BOX.x,
    BOX.y,
    BOX.width,
    BOX.height,
  );
  expect(d, `${shape} generated no path data`).not.toBe("");
  const bounds = exactPathBounds(d);
  expect(bounds, `${shape} produced no measurable bounds`).not.toBeNull();
  return bounds!;
}

describe("exactPathBounds on primitives", () => {
  it("measures a straight-line polygon exactly", () => {
    expect(exactPathBounds("M 10 20 L 50 20 L 50 60 L 10 60 Z")).toEqual({
      x: 10,
      y: 20,
      width: 40,
      height: 40,
    });
  });

  it("does not include a cubic's control points, which lie outside the curve", () => {
    // A cubic from (0,0) to (100,0) with both controls pulled to y=100 reaches
    // only y=75 — three quarters of the control offset. A control-point box would
    // say 100.
    const bounds = exactPathBounds("M 0 0 C 0 100 100 100 100 0");
    expect(bounds!.x).toBeCloseTo(0, 9);
    expect(bounds!.width).toBeCloseTo(100, 9);
    expect(bounds!.y).toBeCloseTo(0, 9);
    expect(bounds!.height).toBeCloseTo(75, 9);

    expect(conservativePathBounds("M 0 0 C 0 100 100 100 100 0")!.height).toBe(100);
  });

  it("measures a quadratic's real apex", () => {
    // Apex of a symmetric quadratic is at half the control offset.
    const bounds = exactPathBounds("M 0 0 Q 50 100 100 0");
    expect(bounds!.height).toBeCloseTo(50, 9);
  });

  it("reflects the implied control point of S", () => {
    // Second cubic's first control is the reflection of (0,100) about (100,0),
    // i.e. (200,-100). Measured tightly the curve dips to y = -75 on the way back
    // up, which an implementation that ignores the reflection cannot see.
    const bounds = exactPathBounds("M 0 0 C 0 100 100 100 100 0 S 200 -100 200 0");
    expect(bounds!.y).toBeCloseTo(-75, 9);
    expect(bounds!.height).toBeCloseTo(150, 9);
  });

  it("measures a half-circle arc as its true half, not as a full radius box", () => {
    // sweep-flag 1 turns in the direction of increasing angle, which with SVG's
    // y-down axis bulges UPWARD. Centre (50, 0), radius 50, so the arc runs from
    // 180 degrees through 270 to 360 and its extreme is (50, -50).
    const d = "M 0 0 A 50 50 0 0 1 100 0";
    const bounds = exactPathBounds(d);
    expect(bounds!.x).toBeCloseTo(0, 9);
    expect(bounds!.width).toBeCloseTo(100, 9);
    expect(bounds!.y).toBeCloseTo(-50, 9);
    expect(bounds!.height).toBeCloseTo(50, 9);

    // The superset expands by the radius around BOTH endpoints: 200 x 100, and
    // reaching 50px below the geometry, which the arc never touches.
    const loose = conservativePathBounds(d)!;
    expect(loose.x).toBe(-50);
    expect(loose.y).toBe(-50);
    expect(loose.width).toBe(200);
    expect(loose.height).toBe(100);
  });

  it("bulges the other way for the opposite sweep flag", () => {
    const bounds = exactPathBounds("M 0 0 A 50 50 0 0 0 100 0")!;
    expect(bounds.y).toBeCloseTo(0, 9);
    expect(bounds.height).toBeCloseTo(50, 9);
  });

  it("measures a rotated ellipse arc using the rotated stationary angles", () => {
    // A quarter of an ellipse rotated 45 degrees. Checked against the closed form
    // rather than a magic number: the extreme in x of a rotated ellipse is at
    // sqrt((rx cos phi)^2 + (ry sin phi)^2) from the centre.
    const d = "M 0 0 A 80 40 45 1 1 0 0.0001";
    const bounds = exactPathBounds(d);
    expect(bounds).not.toBeNull();
    const phi = Math.PI / 4;
    const halfWidth = Math.hypot(80 * Math.cos(phi), 40 * Math.sin(phi));
    const halfHeight = Math.hypot(80 * Math.sin(phi), 40 * Math.cos(phi));
    expect(bounds!.width).toBeCloseTo(halfWidth * 2, 4);
    expect(bounds!.height).toBeCloseTo(halfHeight * 2, 4);
  });

  it("returns null for path data with no coordinates", () => {
    expect(exactPathBounds("")).toBeNull();
    expect(exactPathBounds("Z")).toBeNull();
  });

  it("reads implicit separators and exponents", () => {
    // "10-5" is two numbers, and 1e2 is 100. Generated path data contains both.
    expect(exactPathBounds("M0 0L10-5")).toEqual({ x: 0, y: -5, width: 10, height: 5 });
    expect(exactPathBounds("M 0 0 L 1e2 0")!.width).toBe(100);
  });
});

describe("a generated shape's tight bounds ARE its drag box", () => {
  for (const shape of FILLS_ITS_BOX) {
    it(`${shape}`, () => {
      const bounds = boundsOf(shape);
      // 1e-6, not 1e-9: the generators build coordinates by multiplying the box by
      // fractions like 0.33 and 0.15, so the last bit is not recoverable. A real
      // mismatch is a whole pixel or more.
      expect(bounds.x, `${shape} x`).toBeCloseTo(BOX.x, 6);
      expect(bounds.y, `${shape} y`).toBeCloseTo(BOX.y, 6);
      expect(bounds.width, `${shape} width`).toBeCloseTo(BOX.width, 6);
      expect(bounds.height, `${shape} height`).toBeCloseTo(BOX.height, 6);
    });
  }

  for (const [shape, reason] of Object.entries(INSCRIBED)) {
    it(`${shape} is inscribed, not box-filling (${reason})`, () => {
      const bounds = boundsOf(shape);
      // The weaker but still load-bearing guarantee: an inscribed shape must never
      // leave its box. A shape that overflows would be a generator defect, and the
      // selection box would be too small rather than too large.
      expect(bounds.x, `${shape} left of its box`).toBeGreaterThanOrEqual(BOX.x - 1e-6);
      expect(bounds.y, `${shape} above its box`).toBeGreaterThanOrEqual(BOX.y - 1e-6);
      expect(
        bounds.x + bounds.width,
        `${shape} right of its box`,
      ).toBeLessThanOrEqual(BOX.x + BOX.width + 1e-6);
      expect(
        bounds.y + bounds.height,
        `${shape} below its box`,
      ).toBeLessThanOrEqual(BOX.y + BOX.height + 1e-6);
    });
  }

  it("cloud OVERFLOWS its own box, which is a generator defect", () => {
    /*
      Found by this suite, and reported rather than papered over.

      `generateShapePath("cloud")` places its arc ENDPOINTS inside the box but the
      arcs themselves bulge past it: the right-hand pair has radius w*0.2 while its
      endpoints sit only w*0.1 from the right edge, so the curve reaches roughly
      4% of the width outside.

      Two consequences, both real under the OLD behaviour where the recorded
      `data-shape-bounds` was trusted: that strip of the cloud was unselectable and
      unhittable, because both used the declared box. Measuring the path fixes
      that — the box now contains the ink — at the cost of a selection box slightly
      larger than the drag box for this one shape.

      Reshaping the cloud's silhouette is a visual decision and is left alone
      deliberately. The magnitude is pinned so that if someone does fix the
      generator, this test says so instead of silently passing.
    */
    const bounds = boundsOf("cloud");
    const overflowRight = bounds.x + bounds.width - (BOX.x + BOX.width);
    expect(overflowRight).toBeGreaterThan(0);
    expect(overflowRight / BOX.width).toBeCloseTo(0.0416, 3);
    // It does not escape in any other direction.
    expect(bounds.x).toBeGreaterThanOrEqual(BOX.x - 1e-6);
    expect(bounds.y).toBeGreaterThanOrEqual(BOX.y - 1e-6);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(BOX.y + BOX.height + 1e-6);
  });
});

describe("how far off the conservative superset is", () => {
  /**
   * These are the numbers behind the reported symptom. Pinned so a future change
   * that makes the superset tighter — or looser — is visible rather than silent.
   */
  const overshoot = (
    shape: string,
  ): { widthRatio: number; heightRatio: number; offsetX: number; offsetY: number } => {
    const d = generateShapePath(
      shape as Parameters<typeof generateShapePath>[0],
      BOX.x,
      BOX.y,
      BOX.width,
      BOX.height,
    );
    const tight = exactPathBounds(d)!;
    const loose = conservativePathBounds(d)!;
    return {
      widthRatio: loose.width / tight.width,
      heightRatio: loose.height / tight.height,
      offsetX: tight.x - loose.x,
      offsetY: tight.y - loose.y,
    };
  };

  it("a donut's superset box is twice the shape horizontally and exact vertically", () => {
    /*
      The superset's error is DIRECTION-DEPENDENT, which is why the symptom looks
      like an offset rather than a uniform inflation.

      A donut's arc endpoints sit at (cx +- rx, cy). Expanding by rx horizontally
      reaches cx +- 2rx, so the box comes out twice as wide and shifted half a width
      left. Expanding by ry vertically reaches cy +- ry, which is exactly the real
      top and bottom — so the vertical extent happens to be correct.
    */
    const result = overshoot("donut");
    expect(result.widthRatio).toBeCloseTo(2, 3);
    expect(result.heightRatio).toBeCloseTo(1, 3);
    expect(result.offsetX).toBeCloseTo(BOX.width / 2, 3);
    expect(result.offsetY).toBeCloseTo(0, 3);
  });

  it("a rounded rectangle's superset box overshoots by its corner radius", () => {
    const radius = Math.min(BOX.width, BOX.height) * 0.2;
    const result = overshoot("rounded-rect");
    expect(result.offsetX).toBeCloseTo(radius, 3);
    expect(result.offsetY).toBeCloseTo(radius, 3);
  });

  it("a straight-line shape is measured identically by both", () => {
    // The discriminator: the superset is only wrong where there are curves, which
    // is why a plain rectangle's selection box always looked correct and a rounded
    // one did not.
    const result = overshoot("cross");
    expect(result.widthRatio).toBeCloseTo(1, 9);
    expect(result.offsetX).toBeCloseTo(0, 9);
    expect(result.offsetY).toBeCloseTo(0, 9);
  });
});
