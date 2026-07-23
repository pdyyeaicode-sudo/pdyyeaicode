import { describe, expect, it } from "vitest";

import {
  computeHandles,
  isFullyEnclosed,
  rectFromPoints,
  selectEnclosed,
  toggleSelection,
  transformBBox,
  unionBBoxes,
  type BBox,
  type LayerBox,
} from "./selectionMath";

/**
 * Unit tests for the pure selection math (task 5.5).
 *
 * These cover the three behaviors the task calls out — selection toggle, the
 * fully-enclosed marquee predicate, and the combined bounding-box union — plus
 * the supporting handle geometry. The companion SelectionOverlay component feeds
 * DOM-measured boxes into these same helpers.
 */

describe("toggleSelection (Req 1.9, 1.10)", () => {
  it("adds a layer when it is absent", () => {
    expect(toggleSelection(["a"], "b")).toEqual(["a", "b"]);
  });

  it("removes a layer when it is already present", () => {
    expect(toggleSelection(["a", "b"], "a")).toEqual(["b"]);
  });

  it("toggling the same id twice restores the original set", () => {
    const start = ["a", "b"];
    const once = toggleSelection(start, "c");
    const twice = toggleSelection(once, "c");
    expect(twice).toEqual(start);
  });

  it("does not mutate the input array", () => {
    const start = ["a"];
    toggleSelection(start, "b");
    expect(start).toEqual(["a"]);
  });
});

describe("unionBBoxes (Req 1.12)", () => {
  it("returns null for an empty set", () => {
    expect(unionBBoxes([])).toBeNull();
  });

  it("returns the same box for a single input", () => {
    const box: BBox = { x: 5, y: 10, width: 20, height: 30 };
    expect(unionBBoxes([box])).toEqual(box);
  });

  it("computes the axis-aligned union of multiple boxes", () => {
    const a: BBox = { x: 0, y: 0, width: 10, height: 10 };
    const b: BBox = { x: 20, y: 5, width: 10, height: 40 };
    expect(unionBBoxes([a, b])).toEqual({ x: 0, y: 0, width: 30, height: 45 });
  });

  it("handles negative coordinates", () => {
    const a: BBox = { x: -10, y: -5, width: 5, height: 5 };
    const b: BBox = { x: 10, y: 10, width: 5, height: 5 };
    expect(unionBBoxes([a, b])).toEqual({ x: -10, y: -5, width: 25, height: 20 });
  });
});

describe("isFullyEnclosed (marquee 'fully enclosed' predicate, Req 1.12)", () => {
  const outer: BBox = { x: 0, y: 0, width: 100, height: 100 };

  it("is true when the inner box is wholly inside", () => {
    expect(isFullyEnclosed({ x: 10, y: 10, width: 20, height: 20 }, outer)).toBe(true);
  });

  it("is true when edges touch the boundary", () => {
    expect(isFullyEnclosed({ x: 0, y: 0, width: 100, height: 100 }, outer)).toBe(true);
  });

  it("is false when the inner box only partially overlaps", () => {
    expect(isFullyEnclosed({ x: 90, y: 90, width: 20, height: 20 }, outer)).toBe(false);
  });

  it("is false when the inner box is entirely outside", () => {
    expect(isFullyEnclosed({ x: 200, y: 200, width: 10, height: 10 }, outer)).toBe(false);
  });
});

describe("selectEnclosed (Req 1.12 marquee)", () => {
  const items: LayerBox[] = [
    { id: "inside", box: { x: 10, y: 10, width: 10, height: 10 } },
    { id: "crossing", box: { x: 95, y: 10, width: 20, height: 10 } },
    { id: "outside", box: { x: 200, y: 200, width: 5, height: 5 } },
  ];

  it("returns only layers fully enclosed by the marquee", () => {
    expect(selectEnclosed(items, { x: 0, y: 0, width: 100, height: 100 })).toEqual(["inside"]);
  });

  it("returns an empty set for a degenerate (zero-area) marquee", () => {
    expect(selectEnclosed(items, { x: 0, y: 0, width: 0, height: 0 })).toEqual([]);
  });

  it("returns an empty set when nothing is enclosed", () => {
    expect(selectEnclosed(items, { x: 0, y: 0, width: 5, height: 5 })).toEqual([]);
  });
});

describe("rectFromPoints", () => {
  it("normalizes regardless of drag direction", () => {
    const forward = rectFromPoints(10, 20, 40, 60);
    const backward = rectFromPoints(40, 60, 10, 20);
    expect(forward).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    expect(backward).toEqual(forward);
  });
});

describe("computeHandles (Req 1.12)", () => {
  it("produces eight handles around the box in a stable order", () => {
    const handles = computeHandles({ x: 0, y: 0, width: 100, height: 50 });
    expect(handles.map((handle) => handle.position)).toEqual([
      "nw",
      "n",
      "ne",
      "e",
      "se",
      "s",
      "sw",
      "w",
    ]);
    expect(handles.find((handle) => handle.position === "se")).toEqual({
      position: "se",
      x: 100,
      y: 50,
    });
    expect(handles.find((handle) => handle.position === "n")).toEqual({
      position: "n",
      x: 50,
      y: 0,
    });
  });
});

describe("transformBBox", () => {
  it("maps a model-space box through the viewport transform", () => {
    const result = transformBBox(
      { x: 10, y: 20, width: 30, height: 40 },
      { zoom: 2, panX: 5, panY: -5 },
    );
    expect(result).toEqual({ x: 25, y: 35, width: 60, height: 80 });
  });
});
