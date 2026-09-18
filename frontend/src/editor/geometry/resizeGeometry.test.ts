/**
 * resizeGeometry tests.
 *
 * The property asserted throughout is the one the user sees: after the rewrite,
 * the geometry's own bounds equal the requested bounds. Asserting the individual
 * numbers would pass for a mapping that is self-consistent but wrong.
 */

import { describe, expect, it } from "vitest";

import {
  boundsMapping,
  boundsMappingTransform,
  isRewritableGeometry,
  resizeShapeGeometry,
} from "./resizeGeometry";
import type { RectF } from "../renderer/matrix2d";
import type { ShapeGeometry } from "../types/documentModel";

/** Bounds of a geometry, computed independently of the code under test. */
function boundsOf(geometry: ShapeGeometry): RectF {
  switch (geometry.type) {
    case "rect":
    case "parametric":
      return { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height };
    case "ellipse":
      return {
        x: geometry.cx - geometry.rx,
        y: geometry.cy - geometry.ry,
        width: geometry.rx * 2,
        height: geometry.ry * 2,
      };
    case "line":
      return {
        x: Math.min(geometry.x1, geometry.x2),
        y: Math.min(geometry.y1, geometry.y2),
        width: Math.abs(geometry.x2 - geometry.x1),
        height: Math.abs(geometry.y2 - geometry.y1),
      };
    case "polygon": {
      const xs = geometry.points.map(([x]) => x);
      const ys = geometry.points.map(([, y]) => y);
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
    }
    case "path":
      throw new Error("path bounds are not computed here");
  }
}

const FROM: RectF = { x: 10, y: 20, width: 40, height: 30 };

const geometries: Array<{ name: string; geometry: ShapeGeometry }> = [
  { name: "rect", geometry: { type: "rect", x: 10, y: 20, width: 40, height: 30, rx: 4 } },
  { name: "ellipse", geometry: { type: "ellipse", cx: 30, cy: 35, rx: 20, ry: 15 } },
  { name: "line", geometry: { type: "line", x1: 10, y1: 20, x2: 50, y2: 50 } },
  {
    name: "polygon",
    geometry: {
      type: "polygon",
      points: [
        [10, 20],
        [50, 20],
        [30, 50],
      ],
    },
  },
  {
    name: "parametric",
    geometry: {
      type: "parametric",
      shapeType: "star",
      x: 10,
      y: 20,
      width: 40,
      height: 30,
      parameters: { points: 5, innerRatio: 0.5 },
    },
  },
];

const targets: RectF[] = [
  { x: 10, y: 20, width: 80, height: 30 },
  { x: 10, y: 20, width: 40, height: 90 },
  { x: 0, y: 0, width: 40, height: 30 },
  { x: -25, y: 8.5, width: 12.5, height: 7.25 },
  { x: 100, y: 100, width: 1, height: 1 },
];

describe("resizeShapeGeometry lands on exactly the requested bounds", () => {
  for (const { name, geometry } of geometries) {
    for (const to of targets) {
      it(`${name} -> ${to.width}x${to.height} at (${to.x}, ${to.y})`, () => {
        const resized = resizeShapeGeometry(geometry, FROM, to);
        expect(resized).not.toBeNull();
        const bounds = boundsOf(resized as ShapeGeometry);
        expect(bounds.x).toBeCloseTo(to.x, 9);
        expect(bounds.y).toBeCloseTo(to.y, 9);
        expect(bounds.width).toBeCloseTo(to.width, 9);
        expect(bounds.height).toBeCloseTo(to.height, 9);
      });
    }
  }

  it("keeps a rect's corner radius, which is not a resize concern", () => {
    const resized = resizeShapeGeometry(geometries[0].geometry, FROM, targets[0]);
    expect(resized).toMatchObject({ rx: 4 });
  });

  it("keeps parametric parameters, which are ratios against the box", () => {
    const resized = resizeShapeGeometry(geometries[4].geometry, FROM, targets[1]);
    expect(resized).toMatchObject({ parameters: { points: 5, innerRatio: 0.5 } });
  });
});

describe("flips", () => {
  it("normalises a mirrored rect instead of emitting a negative width", () => {
    // A drag past the anchor produces negative extents; SVG rejects a negative
    // width outright, so the rect is mirrored in place.
    const flipped = resizeShapeGeometry(geometries[0].geometry, FROM, {
      x: 10,
      y: 20,
      width: -40,
      height: 30,
    });
    expect(flipped).not.toBeNull();
    const bounds = boundsOf(flipped as ShapeGeometry);
    expect(bounds.width).toBeCloseTo(40, 9);
    expect(bounds.x).toBeCloseTo(-30, 9);
  });

  it("keeps ellipse radii positive under a mirror", () => {
    const flipped = resizeShapeGeometry(geometries[1].geometry, FROM, {
      x: 10,
      y: 20,
      width: 40,
      height: -30,
    });
    expect(flipped).toMatchObject({ ry: 15 });
  });

  it("mirrors a polygon's point order-independently", () => {
    const flipped = resizeShapeGeometry(geometries[3].geometry, FROM, {
      x: 10,
      y: 20,
      width: -40,
      height: 30,
    });
    expect(flipped).not.toBeNull();
    const bounds = boundsOf(flipped as ShapeGeometry);
    expect(bounds.width).toBeCloseTo(40, 9);
  });
});

describe("what is refused rather than approximated", () => {
  it("returns null for path data", () => {
    const path: ShapeGeometry = { type: "path", d: "M0 0 A 10 5 30 1 0 20 20 Z" };
    expect(resizeShapeGeometry(path, FROM, targets[0])).toBeNull();
    expect(isRewritableGeometry(path)).toBe(false);
  });

  it("returns null when the source has zero extent", () => {
    expect(boundsMapping({ x: 0, y: 0, width: 0, height: 10 }, targets[0])).toBeNull();
    expect(
      resizeShapeGeometry(geometries[0].geometry, { x: 0, y: 0, width: 40, height: 0 }, targets[0]),
    ).toBeNull();
  });

  it("returns null for a non-finite target", () => {
    expect(
      boundsMapping(FROM, { x: 0, y: 0, width: Number.NaN, height: 10 }),
    ).toBeNull();
  });
});

describe("boundsMappingTransform", () => {
  it("expresses the same mapping as an SVG transform", () => {
    const mapping = boundsMapping(FROM, { x: 0, y: 0, width: 80, height: 60 });
    expect(mapping).not.toBeNull();
    // scale 2x, and the translate that puts the scaled origin back at 0.
    expect(boundsMappingTransform(mapping!)).toBe("translate(-20 -40) scale(2 2)");
  });

  it("round-trips through the shared SVG transform parser", async () => {
    const { parseSvgTransform, transformPoint } = await import("../renderer/matrix2d");
    const to: RectF = { x: -25, y: 8.5, width: 12.5, height: 7.25 };
    const mapping = boundsMapping(FROM, to);
    const parsed = parseSvgTransform(boundsMappingTransform(mapping!));
    expect(parsed.unsupported).toEqual([]);

    // The transform must move the old bounds' corners onto the new bounds'.
    const topLeft = transformPoint(parsed.matrix, { x: FROM.x, y: FROM.y });
    const bottomRight = transformPoint(parsed.matrix, {
      x: FROM.x + FROM.width,
      y: FROM.y + FROM.height,
    });
    expect(topLeft.x).toBeCloseTo(to.x, 4);
    expect(topLeft.y).toBeCloseTo(to.y, 4);
    expect(bottomRight.x).toBeCloseTo(to.x + to.width, 4);
    expect(bottomRight.y).toBeCloseTo(to.y + to.height, 4);
  });
});
