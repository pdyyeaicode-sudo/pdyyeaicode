/**
 * offsetLayer tests, focused on the case that was silently wrong: a group whose
 * children carry their own transforms.
 *
 * The property asserted is the one a user sees — every child ends up displaced by
 * the SAME amount in the group's space — rather than the intermediate per-child
 * numbers, which would pass for a self-consistent but wrong conversion.
 *
 * `offsetLayer` used to hand the same `(dx, dy)` to every descendant. A child's
 * geometry lives inside its own transform, so a child rotated 90 degrees moved
 * perpendicular to the drag and a child scaled 2x moved twice as far: dragging a
 * group pulled it apart.
 */

import { describe, expect, it } from "vitest";

import { offsetLayer } from "./helpers";
import { parseSvgTransform, transformPoint, type Matrix2D } from "../renderer/matrix2d";
import type { DocumentLayer, GroupLayer, ShapeLayer } from "../types/documentModel";

function rect(id: string, x: number, y: number, transform?: string): ShapeLayer {
  return {
    id,
    role: "shapes",
    name: id,
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "rect",
    field: "shape",
    geometry: { type: "rect", x, y, width: 10, height: 10 },
    fill: "#000000",
    ...(transform === undefined ? {} : { transform }),
  };
}

function group(id: string, children: DocumentLayer[], transform?: string): GroupLayer {
  return {
    id,
    role: "shapes",
    name: id,
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "group",
    children,
    ...(transform === undefined ? {} : { transform }),
  };
}

const matrixOf = (transform: string | undefined): Matrix2D =>
  parseSvgTransform(transform).matrix;

/**
 * Where a leaf's geometry origin sits in the coordinate space of `root`.
 *
 * Computed here independently of the code under test, by composing each
 * transform on the way down.
 */
function positionInRootSpace(
  root: DocumentLayer,
  targetId: string,
  accumulated: Matrix2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
): { x: number; y: number } | null {
  const own = matrixOf((root as { transform?: string }).transform);
  const here: Matrix2D = {
    a: accumulated.a * own.a + accumulated.c * own.b,
    b: accumulated.b * own.a + accumulated.d * own.b,
    c: accumulated.a * own.c + accumulated.c * own.d,
    d: accumulated.b * own.c + accumulated.d * own.d,
    e: accumulated.a * own.e + accumulated.c * own.f + accumulated.e,
    f: accumulated.b * own.e + accumulated.d * own.f + accumulated.f,
  };

  if (root.id === targetId && root.kind !== "group") {
    const geometry = (root as ShapeLayer).geometry;
    if (geometry.type !== "rect") {
      throw new Error("only rect leaves are measured here");
    }
    return transformPoint(here, { x: geometry.x, y: geometry.y });
  }
  if (root.kind === "group") {
    for (const child of root.children) {
      const found = positionInRootSpace(child, targetId, here);
      if (found !== null) {
        return found;
      }
    }
  }
  return null;
}

describe("offsetLayer on a leaf", () => {
  it("offsets rect geometry directly", () => {
    const moved = offsetLayer(rect("r", 10, 20), 5, -3) as ShapeLayer;
    expect(moved.geometry).toMatchObject({ x: 15, y: 17 });
  });

  it("offsets text and image position", () => {
    const text: DocumentLayer = {
      id: "t",
      role: "headline",
      name: "t",
      editable: true,
      locked: false,
      visible: true,
      opacity: 100,
      kind: "text",
      field: "headline",
      elementId: "t-el",
      content: "hi",
      x: 4,
      y: 6,
      fontFamily: "Inter",
      fontSize: 12,
      fontWeight: "normal",
      textAlign: "left",
      fill: "#000000",
    };
    expect(offsetLayer(text, 2, 3)).toMatchObject({ x: 6, y: 9 });
  });

  it("leaves a leaf's own transform alone — the delta is already in its space", () => {
    const moved = offsetLayer(rect("r", 10, 20, "rotate(90)"), 5, 0) as ShapeLayer;
    expect(moved.transform).toBe("rotate(90)");
    expect(moved.geometry).toMatchObject({ x: 15, y: 20 });
  });
});

describe("offsetLayer on a group moves every child by the SAME amount", () => {
  const cases: Array<{ name: string; childTransforms: Array<string | undefined> }> = [
    { name: "untransformed children", childTransforms: [undefined, undefined] },
    { name: "one rotated child", childTransforms: [undefined, "rotate(90)"] },
    { name: "one scaled child", childTransforms: [undefined, "scale(2)"] },
    { name: "rotated and mirrored children", childTransforms: ["rotate(37)", "scale(-1 1)"] },
    {
      name: "translated, rotated and scaled children",
      childTransforms: ["translate(15 -4) rotate(20)", "scale(0.5 3) rotate(-12)"],
    },
  ];

  const deltas = [
    { dx: 12, dy: 0 },
    { dx: 0, dy: -7 },
    { dx: -5.5, dy: 3.25 },
  ];

  for (const testCase of cases) {
    for (const delta of deltas) {
      it(`${testCase.name}: (${delta.dx}, ${delta.dy})`, () => {
        const children = testCase.childTransforms.map((transform, index) =>
          rect(`child-${index}`, 10 * index, 5 * index, transform),
        );
        const parent = group("g", children);

        const before = children.map((child) => positionInRootSpace(parent, child.id));
        const moved = offsetLayer(parent, delta.dx, delta.dy);
        const after = children.map((child) => positionInRootSpace(moved, child.id));

        for (let index = 0; index < children.length; index += 1) {
          expect(before[index]).not.toBeNull();
          expect(after[index]).not.toBeNull();
          // Every child displaced by exactly the group's delta, in the GROUP's
          // space. Handing the raw delta to a rotated child moved it sideways.
          expect(
            (after[index] as { x: number }).x - (before[index] as { x: number }).x,
            `child ${index} dx`,
          ).toBeCloseTo(delta.dx, 9);
          expect(
            (after[index] as { y: number }).y - (before[index] as { y: number }).y,
            `child ${index} dy`,
          ).toBeCloseTo(delta.dy, 9);
        }
      });
    }
  }

  it("works through a NESTED group with its own transform", () => {
    const leaf = rect("leaf", 3, 4, "rotate(-25)");
    const inner = group("inner", [leaf], "translate(20 10) scale(2)");
    const outer = group("outer", [inner], "rotate(15)");

    const delta = { dx: 9, dy: -4 };
    const before = positionInRootSpace(outer, "leaf");
    const moved = offsetLayer(outer, delta.dx, delta.dy);
    const after = positionInRootSpace(moved, "leaf");

    // The delta is in OUTER's own space, and `positionInRootSpace` composes
    // outer's `rotate(15)` on top, so the displacement seen from the root is the
    // delta ROTATED. Asserting the raw delta here would be asserting the wrong
    // space — the same class of mistake this whole file exists to prevent.
    const outerMatrix = matrixOf(outer.transform);
    const expected = {
      x: outerMatrix.a * delta.dx + outerMatrix.c * delta.dy,
      y: outerMatrix.b * delta.dx + outerMatrix.d * delta.dy,
    };

    expect((after as { x: number }).x - (before as { x: number }).x).toBeCloseTo(expected.x, 9);
    expect((after as { y: number }).y - (before as { y: number }).y).toBeCloseTo(expected.y, 9);
    // And the magnitude is preserved, because a rotation cannot stretch it — which
    // is what proves the nested `scale(2)` was accounted for rather than applied.
    expect(Math.hypot(expected.x, expected.y)).toBeCloseTo(
      Math.hypot(delta.dx, delta.dy),
      9,
    );
  });

  it("stays exactly invertible", () => {
    const parent = group("g", [
      rect("a", 0, 0, "rotate(30)"),
      rect("b", 20, 10, "scale(2 0.5)"),
    ]);
    const roundTripped = offsetLayer(offsetLayer(parent, 6, -2.5), -6, 2.5);
    expect(roundTripped).toEqual(parent);
  });
});

describe("what offsetLayer refuses", () => {
  it("returns the group unchanged when a child's transform is singular", () => {
    // scale(0) collapses the child, so no delta maps into its space. Moving the
    // other children and not this one would silently pull the group apart.
    const parent = group("g", [rect("a", 0, 0), rect("b", 10, 10, "scale(0 1)")]);
    expect(offsetLayer(parent, 5, 5)).toBe(parent);
  });

  it("returns the group unchanged when a child's transform cannot be parsed", () => {
    const parent = group("g", [rect("a", 0, 0, "shear(2)")]);
    expect(offsetLayer(parent, 5, 5)).toBe(parent);
  });
});
