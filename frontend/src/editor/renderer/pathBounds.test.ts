/**
 * Tests for pathBounds. The point of these cases is that a naive
 * "pair up every number in the d attribute" scan gets H, V and A wrong; a wrong
 * box breaks culling and hit-testing, so each command form is asserted.
 */

import { describe, expect, it } from "vitest";

import { conservativePathBounds } from "./pathBounds";

describe("conservativePathBounds", () => {
  it("handles horizontal and vertical commands, which take one argument", () => {
    expect(conservativePathBounds("M0 0 H 10 V 5 Z")).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 5,
    });
  });

  it("handles relative commands", () => {
    expect(conservativePathBounds("m 5 5 l 10 0")).toEqual({
      x: 5,
      y: 5,
      width: 10,
      height: 0,
    });
  });

  it("includes cubic control points as a superset", () => {
    // The curve itself never reaches y=100, but the control point does; a
    // superset is required to stay safe for culling.
    expect(conservativePathBounds("M0 0 C 0 100 10 100 10 0")).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 100,
    });
  });

  it("expands arcs by their radii", () => {
    expect(conservativePathBounds("M0 0 A 5 5 0 0 1 10 0")).toEqual({
      x: -5,
      y: -5,
      width: 20,
      height: 10,
    });
  });

  it("treats repeated parameter groups as implicit line-tos", () => {
    expect(conservativePathBounds("M0 0 L 10 10 20 -5")).toEqual({
      x: 0,
      y: -5,
      width: 20,
      height: 15,
    });
  });

  it("closes back to the subpath start", () => {
    expect(conservativePathBounds("M 10 10 L 20 10 Z")).toEqual({
      x: 10,
      y: 10,
      width: 10,
      height: 0,
    });
  });

  it("returns a zero-size box for a lone move", () => {
    expect(conservativePathBounds("M 1 2")).toEqual({ x: 1, y: 2, width: 0, height: 0 });
  });

  it("returns null when there are no usable coordinates", () => {
    expect(conservativePathBounds("")).toBeNull();
    expect(conservativePathBounds("Z")).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(conservativePathBounds("nonsense")).toBeNull();
  });
});
