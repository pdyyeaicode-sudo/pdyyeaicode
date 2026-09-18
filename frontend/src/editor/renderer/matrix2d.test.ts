/**
 * Tests for matrix2d — the transform foundation shared by rendering, bounds
 * and hit-testing. Composition order and SVG parsing are asserted explicitly
 * because a silent convention flip here would misplace every object.
 */

import { describe, expect, it } from "vitest";

import {
  IDENTITY,
  decompose,
  invert,
  isIdentity,
  multiply,
  parseSvgTransform,
  rectIntersects,
  rotation,
  scaling,
  skewX,
  toSvgTransform,
  transformPoint,
  transformRect,
  translation,
  unionRect,
} from "./matrix2d";

describe("matrix2d composition", () => {
  it("applies the inner matrix first", () => {
    const outer = translation(10, 20);
    const inner = rotation(90);
    const composed = multiply(outer, inner);

    expect(transformPoint(composed, { x: 1, y: 0 })).toEqual(
      transformPoint(outer, transformPoint(inner, { x: 1, y: 0 })),
    );
    const result = transformPoint(composed, { x: 1, y: 0 });
    expect(result.x).toBeCloseTo(10, 10);
    expect(result.y).toBeCloseTo(21, 10);
  });

  it("rotates about an explicit centre without moving that centre", () => {
    const m = rotation(90, 5, 5);
    const centre = transformPoint(m, { x: 5, y: 5 });
    expect(centre.x).toBeCloseTo(5, 10);
    expect(centre.y).toBeCloseTo(5, 10);

    const moved = transformPoint(m, { x: 6, y: 5 });
    expect(moved.x).toBeCloseTo(5, 10);
    expect(moved.y).toBeCloseTo(6, 10);
  });

  it("recognises the identity matrix", () => {
    expect(isIdentity(IDENTITY)).toBe(true);
    expect(isIdentity(translation(0.5, 0))).toBe(false);
  });
});

describe("matrix2d inversion", () => {
  it("inverts a translation", () => {
    const inverse = invert(translation(10, 20));
    expect(inverse).not.toBeNull();
    expect(inverse).toMatchObject({ e: -10, f: -20 });
  });

  it("round-trips a point through a rotate-scale-translate chain", () => {
    const m = multiply(multiply(translation(30, -12), rotation(37)), scaling(2, 3));
    const inverse = invert(m);
    expect(inverse).not.toBeNull();
    const roundTripped = transformPoint(inverse!, transformPoint(m, { x: 7, y: -4 }));
    expect(roundTripped.x).toBeCloseTo(7, 9);
    expect(roundTripped.y).toBeCloseTo(-4, 9);
  });

  it("returns null for a singular matrix instead of throwing", () => {
    expect(invert(scaling(0, 1))).toBeNull();
    expect(invert({ a: NaN, b: 0, c: 0, d: 1, e: 0, f: 0 })).toBeNull();
  });
});

describe("matrix2d rectangles", () => {
  it("computes the axis-aligned box of a rotated rectangle", () => {
    const box = transformRect(rotation(90), { x: 0, y: 0, width: 10, height: 20 });
    expect(box.x).toBeCloseTo(-20, 9);
    expect(box.y).toBeCloseTo(0, 9);
    expect(box.width).toBeCloseTo(20, 9);
    expect(box.height).toBeCloseTo(10, 9);
  });

  it("unions two rectangles", () => {
    expect(
      unionRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 5, width: 5, height: 20 }),
    ).toEqual({ x: 0, y: 0, width: 25, height: 25 });
  });

  it("detects intersection including touching edges", () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectIntersects(a, { x: 10, y: 0, width: 5, height: 5 })).toBe(true);
    expect(rectIntersects(a, { x: 11, y: 0, width: 5, height: 5 })).toBe(false);
  });
});

describe("parseSvgTransform", () => {
  it("returns identity for empty input", () => {
    expect(parseSvgTransform(undefined).matrix).toEqual(IDENTITY);
    expect(parseSvgTransform("   ").matrix).toEqual(IDENTITY);
    expect(parseSvgTransform(null).unsupported).toEqual([]);
  });

  it("applies a transform list left-to-right in SVG order", () => {
    const { matrix, unsupported } = parseSvgTransform("translate(10,20) rotate(90)");
    expect(unsupported).toEqual([]);
    const point = transformPoint(matrix, { x: 1, y: 0 });
    expect(point.x).toBeCloseTo(10, 9);
    expect(point.y).toBeCloseTo(21, 9);
  });

  it("parses every supported function form", () => {
    expect(parseSvgTransform("matrix(1 0 0 1 5 6)").matrix).toEqual({
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 5,
      f: 6,
    });
    expect(parseSvgTransform("translate(4)").matrix).toEqual(translation(4, 0));
    expect(parseSvgTransform("scale(3)").matrix).toEqual(scaling(3, 3));
    expect(parseSvgTransform("skewX(8)").matrix.c).toBeCloseTo(skewX(8).c, 12);
    expect(parseSvgTransform("skewY(8)").matrix.b).toBeCloseTo(Math.tan((8 * Math.PI) / 180), 12);
    expect(parseSvgTransform("rotate(15 160 40)").matrix).toMatchObject({
      a: expect.closeTo(Math.cos((15 * Math.PI) / 180), 9),
    });
  });

  it("reports unsupported names and wrong arities rather than ignoring them", () => {
    const unknown = parseSvgTransform("frobnicate(1)");
    expect(unknown.matrix).toEqual(IDENTITY);
    expect(unknown.unsupported).toEqual(["frobnicate(1)"]);

    const badArity = parseSvgTransform("translate(1 2 3)");
    expect(badArity.matrix).toEqual(IDENTITY);
    expect(badArity.unsupported).toEqual(["translate(1 2 3)"]);
  });

  it("keeps valid functions when a later one is unsupported", () => {
    const parsed = parseSvgTransform("translate(5 5) frobnicate(2)");
    expect(parsed.matrix).toEqual(translation(5, 5));
    expect(parsed.unsupported).toEqual(["frobnicate(2)"]);
  });
});

describe("toSvgTransform", () => {
  it("serializes compactly and normalises negative zero", () => {
    expect(toSvgTransform(IDENTITY)).toBe("matrix(1 0 0 1 0 0)");
    expect(toSvgTransform({ a: 1, b: -0, c: 0, d: 1, e: 2.5, f: 0 })).toBe(
      "matrix(1 0 0 1 2.5 0)",
    );
  });
});

describe("decompose", () => {
  it("recovers translation, rotation and scale", () => {
    const composed = multiply(multiply(translation(12, -8), rotation(30)), scaling(2, 3));
    const parts = decompose(composed);
    expect(parts.translateX).toBeCloseTo(12, 9);
    expect(parts.translateY).toBeCloseTo(-8, 9);
    expect(parts.rotationDeg).toBeCloseTo(30, 7);
    expect(parts.scaleX).toBeCloseTo(2, 7);
    expect(parts.scaleY).toBeCloseTo(3, 7);
    expect(parts.skewXDeg).toBeCloseTo(0, 7);
  });

  it("recovers a horizontal shear", () => {
    const parts = decompose(skewX(20));
    expect(parts.skewXDeg).toBeCloseTo(20, 7);
    expect(parts.rotationDeg).toBeCloseTo(0, 7);
  });

  it("does not produce NaN for a degenerate matrix", () => {
    const parts = decompose(scaling(0, 0));
    expect(Number.isNaN(parts.scaleX)).toBe(false);
    expect(Number.isNaN(parts.rotationDeg)).toBe(false);
  });
});
