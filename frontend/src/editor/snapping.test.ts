/**
 * Unit tests for the pure snapping helper (task 6.1).
 *
 * These exercise the threshold predicate (Req 2.1, 2.4, 2.6), per-axis snap
 * offsets (Req 2.2, 4.2), multiple simultaneous guides (Req 2.5), and the
 * on-screen-threshold zoom division (Req 2.1, 2.4). The optional property test
 * for Property 9 lives in task 6.2.
 */

import { describe, expect, it } from "vitest";

import type { BBox, LayerBox } from "./selectionMath";
import {
  SNAP_THRESHOLD_PX,
  collectReferenceLines,
  computeDragSnap,
  computeSnap,
  effectiveModelThreshold,
  referenceLinesFromBox,
  type ReferenceLine,
} from "./snapping";

const box = (x: number, y: number, width: number, height: number): BBox => ({
  x,
  y,
  width,
  height,
});

describe("effectiveModelThreshold", () => {
  it("divides the on-screen threshold by zoom so it is a true on-screen 5px", () => {
    expect(effectiveModelThreshold(5, 1)).toBe(5);
    expect(effectiveModelThreshold(5, 2)).toBe(2.5);
    expect(effectiveModelThreshold(5, 0.5)).toBe(10);
  });

  it("falls back to the raw threshold for non-finite or non-positive zoom", () => {
    expect(effectiveModelThreshold(5, 0)).toBe(5);
    expect(effectiveModelThreshold(5, -3)).toBe(5);
    expect(effectiveModelThreshold(5, Number.NaN)).toBe(5);
  });
});

describe("referenceLinesFromBox", () => {
  it("produces left/center/right on x and top/center/bottom on y", () => {
    const refs = referenceLinesFromBox("a", box(10, 20, 100, 40));
    const x = refs.filter((r) => r.axis === "x").map((r) => r.position);
    const y = refs.filter((r) => r.axis === "y").map((r) => r.position);
    expect(x).toEqual([10, 60, 110]);
    expect(y).toEqual([20, 40, 60]);
    expect(refs.every((r) => r.source === "a")).toBe(true);
  });
});

describe("collectReferenceLines", () => {
  it("includes every other layer plus the Artboard edges and center", () => {
    const others: LayerBox[] = [{ id: "l1", box: box(0, 0, 50, 50) }];
    const refs = collectReferenceLines(others, { width: 200, height: 100 });
    expect(refs.filter((r) => r.source === "l1")).toHaveLength(6);
    const artboard = refs.filter((r) => r.source === "artboard");
    expect(artboard.filter((r) => r.axis === "x").map((r) => r.position)).toEqual([0, 100, 200]);
    expect(artboard.filter((r) => r.axis === "y").map((r) => r.position)).toEqual([0, 50, 100]);
  });

  it("omits Artboard references when no artboard is given", () => {
    const refs = collectReferenceLines([{ id: "l1", box: box(0, 0, 50, 50) }], null);
    expect(refs.every((r) => r.source === "l1")).toBe(true);
  });
});

describe("computeSnap — threshold predicate (Req 2.1, 2.6)", () => {
  it("shows a guide only when a reference is within threshold", () => {
    const refs: ReferenceLine[] = [
      { axis: "x", position: 100, source: "near", kind: "edge-start" },
      { axis: "x", position: 200, source: "far", kind: "edge-start" },
    ];
    // Dragged left edge at 103 → near (100) within 5px, far (200) not.
    const result = computeSnap(box(103, 0, 20, 20), refs, 5);
    expect(result.guides.map((g) => g.source)).toEqual(["near"]);
  });

  it("hides all guides when no reference is within threshold (Req 2.6)", () => {
    const refs: ReferenceLine[] = [{ axis: "x", position: 100, source: "a", kind: "center" }];
    const result = computeSnap(box(0, 0, 20, 20), refs, 5);
    expect(result.guides).toHaveLength(0);
    expect(result.snappedX).toBe(false);
    expect(result.snappedY).toBe(false);
    expect(result.offsetX).toBe(0);
    expect(result.offsetY).toBe(0);
  });

  it("treats a reference exactly at the threshold distance as within range", () => {
    const refs: ReferenceLine[] = [{ axis: "x", position: 105, source: "edge", kind: "edge-start" }];
    const result = computeSnap(box(100, 0, 20, 20), refs, 5);
    expect(result.guides).toHaveLength(1);
    expect(result.offsetX).toBe(5);
  });
});

describe("computeSnap — per-axis independence (Req 2.2, 4.2)", () => {
  it("snaps each axis independently to its nearest in-threshold reference", () => {
    const refs: ReferenceLine[] = [
      { axis: "x", position: 100, source: "vx", kind: "edge-start" },
      { axis: "y", position: 50, source: "hy", kind: "edge-start" },
    ];
    // left edge at 97 → +3 on x; top edge at 53 → -3 on y.
    const result = computeSnap(box(97, 53, 20, 20), refs, 5);
    expect(result.offsetX).toBe(3);
    expect(result.offsetY).toBe(-3);
    expect(result.snappedX).toBe(true);
    expect(result.snappedY).toBe(true);
  });

  it("snaps only the axis that has an in-threshold reference", () => {
    const refs: ReferenceLine[] = [{ axis: "x", position: 100, source: "vx", kind: "edge-start" }];
    // x snaps (+2), y has no reference so offsetY stays 0.
    const result = computeSnap(box(98, 500, 20, 20), refs, 5);
    expect(result.offsetX).toBe(2);
    expect(result.snappedX).toBe(true);
    expect(result.offsetY).toBe(0);
    expect(result.snappedY).toBe(false);
  });

  it("snaps the center candidate when the center is the closest", () => {
    const refs: ReferenceLine[] = [{ axis: "x", position: 60, source: "c", kind: "center" }];
    // box x=10 w=100 → center 60 exactly aligned → offset 0 but snapped.
    const result = computeSnap(box(10, 0, 100, 20), refs, 5);
    expect(result.offsetX).toBe(0);
    expect(result.snappedX).toBe(true);
  });
});

describe("computeSnap — multiple simultaneous guides (Req 2.5)", () => {
  it("returns a guide for every in-threshold reference across both axes", () => {
    const refs: ReferenceLine[] = [
      { axis: "x", position: 100, source: "a", kind: "edge-start" },
      { axis: "x", position: 102, source: "b", kind: "center" },
      { axis: "y", position: 50, source: "c", kind: "edge-start" },
    ];
    const result = computeSnap(box(100, 50, 4, 0), refs, 5);
    expect(result.guides).toHaveLength(3);
    expect(result.guides.filter((g) => g.axis === "x")).toHaveLength(2);
    expect(result.guides.filter((g) => g.axis === "y")).toHaveLength(1);
  });

  it("snaps x to the nearest reference when several are in range", () => {
    const refs: ReferenceLine[] = [
      { axis: "x", position: 104, source: "far", kind: "edge-start" },
      { axis: "x", position: 101, source: "near", kind: "edge-start" },
    ];
    // left edge at 100 → near(101) is closest → +1.
    const result = computeSnap(box(100, 0, 20, 20), refs, 5);
    expect(result.offsetX).toBe(1);
  });
});

describe("computeDragSnap", () => {
  it("excludes the dragged layer from its own references and honors zoom", () => {
    const layers: LayerBox[] = [
      { id: "dragged", box: box(100, 100, 50, 50) },
      { id: "other", box: box(0, 100, 50, 50) },
    ];
    // At zoom 1, top edges (100) align → snapped on y with offset 0.
    const result = computeDragSnap("dragged", box(100, 102, 50, 50), layers, null, 1);
    expect(result.guides.every((g) => g.source !== "dragged")).toBe(true);
    expect(result.snappedY).toBe(true);
    expect(result.offsetY).toBe(-2);
  });

  it("uses a tighter model threshold when zoomed in", () => {
    const layers: LayerBox[] = [
      { id: "dragged", box: box(0, 0, 20, 20) },
      { id: "other", box: box(4, 0, 20, 20) },
    ];
    // Nearest reference (other's left edge at 4) is 4px from the dragged left
    // edge. At zoom 1 the model threshold is 5px → snaps; at zoom 2 it is 2.5px
    // → no snap. Same model geometry, different on-screen threshold.
    const atOne = computeDragSnap("dragged", box(0, 0, 20, 20), layers, null, 1);
    expect(atOne.snappedX).toBe(true);
    expect(atOne.offsetX).toBe(4);

    const zoomedIn = computeDragSnap("dragged", box(0, 0, 20, 20), layers, null, 2);
    expect(zoomedIn.snappedX).toBe(false);
  });

  it("defaults the screen threshold to the 5px constant", () => {
    expect(SNAP_THRESHOLD_PX).toBe(5);
  });
});
