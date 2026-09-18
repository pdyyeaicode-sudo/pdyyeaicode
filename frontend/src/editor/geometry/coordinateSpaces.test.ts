/**
 * Tests for the coordinate-space model.
 *
 * These pin the invariants the whole selection system rests on: every conversion
 * round-trips, lengths are scaled but never translated, and zoom and pan cannot be
 * applied twice.
 */

import { describe, expect, it } from "vitest";

import {
  canvasViewFrom,
  clientPoint,
  clientToWorld,
  localPoint,
  localToWorld,
  viewportPoint,
  viewportToWorld,
  worldLengthToViewport,
  worldPoint,
  worldRect,
  worldRectToViewport,
  worldToClient,
  worldToLocal,
  worldToViewport,
} from "./coordinateSpaces";
import { multiply, rotation, scaling, translation } from "../renderer/matrix2d";

/** Host at (50, 30); artboard origin at (100, 80) after pan; zoom 2. */
const VIEW = canvasViewFrom({ left: 50, top: 30 }, { left: 100, top: 80 }, 2)!;

describe("canvasViewFrom", () => {
  it("folds pan into the world origin so it cannot be applied twice", () => {
    // The wrapper rect already reflects pan, scroll and page layout, so there is
    // no separate pan term for a caller to add a second time.
    expect(VIEW.originClient).toEqual(clientPoint(100, 80));
    expect(VIEW.zoom).toBe(2);
  });

  it("refuses an unusable view rather than returning a default", () => {
    expect(canvasViewFrom({ left: 0, top: 0 }, { left: 0, top: 0 }, 0)).toBeNull();
    expect(canvasViewFrom({ left: 0, top: 0 }, { left: 0, top: 0 }, Number.NaN)).toBeNull();
    expect(
      canvasViewFrom({ left: Number.NaN, top: 0 }, { left: 0, top: 0 }, 1),
    ).toBeNull();
  });

  it("clamps a nonsensical device pixel ratio to 1", () => {
    expect(canvasViewFrom({ left: 0, top: 0 }, { left: 0, top: 0 }, 1, 0)?.devicePixelRatio).toBe(1);
    expect(canvasViewFrom({ left: 0, top: 0 }, { left: 0, top: 0 }, 1, -2)?.devicePixelRatio).toBe(1);
  });
});

describe("world <-> client", () => {
  it("scales by zoom and offsets by the world origin", () => {
    expect(worldToClient(VIEW, worldPoint(0, 0))).toEqual(clientPoint(100, 80));
    expect(worldToClient(VIEW, worldPoint(10, 5))).toEqual(clientPoint(120, 90));
  });

  it("round-trips", () => {
    const original = worldPoint(37.25, -11.5);
    const back = clientToWorld(VIEW, worldToClient(VIEW, original));
    expect(back.x).toBeCloseTo(original.x, 9);
    expect(back.y).toBeCloseTo(original.y, 9);
  });
});

describe("world <-> viewport", () => {
  it("subtracts the host origin so the overlay can position absolutely", () => {
    // world (0,0) is client (100,80); the host is at client (50,30); so the
    // artboard origin sits at (50,50) inside the host.
    expect(worldToViewport(VIEW, worldPoint(0, 0))).toEqual(viewportPoint(50, 50));
    expect(worldToViewport(VIEW, worldPoint(10, 10))).toEqual(viewportPoint(70, 70));
  });

  it("round-trips", () => {
    const original = worldPoint(-4.75, 200.125);
    const back = viewportToWorld(VIEW, worldToViewport(VIEW, original));
    expect(back.x).toBeCloseTo(original.x, 9);
    expect(back.y).toBeCloseTo(original.y, 9);
  });
});

describe("lengths", () => {
  it("are scaled but never translated", () => {
    // The bug this prevents: adding the origin offset to a distance.
    expect(worldLengthToViewport(VIEW, 10)).toBe(20);
    expect(worldLengthToViewport(VIEW, 0)).toBe(0);
  });

  it("agree with the difference between two converted points", () => {
    const a = worldToViewport(VIEW, worldPoint(3, 3));
    const b = worldToViewport(VIEW, worldPoint(13, 3));
    expect(b.x - a.x).toBe(worldLengthToViewport(VIEW, 10));
  });
});

describe("local <-> world", () => {
  it("uses the node's world transform, which includes the parent chain", () => {
    // A child translated (5,5) inside a group scaled 2x and translated (10,0).
    const groupWorld = multiply(translation(10, 0), scaling(2, 2));
    const childWorld = multiply(groupWorld, translation(5, 5));

    const mapped = localToWorld(childWorld, localPoint(0, 0));
    // (0,0) -> +(5,5) -> x2 -> (10,10) -> +(10,0) -> (20,10)
    expect(mapped.x).toBeCloseTo(20, 9);
    expect(mapped.y).toBeCloseTo(10, 9);
  });

  it("round-trips through a rotation", () => {
    const world = multiply(translation(100, 50), rotation(37));
    const original = localPoint(12, -8);
    const back = worldToLocal(world, localToWorld(world, original));
    expect(back).not.toBeNull();
    expect(back?.x).toBeCloseTo(original.x, 9);
    expect(back?.y).toBeCloseTo(original.y, 9);
  });

  it("returns null for a singular transform instead of inventing a point", () => {
    // A node collapsed to zero width has no inverse; a caller must report that,
    // not fall back to an arbitrary position.
    expect(worldToLocal(scaling(0, 1), worldPoint(5, 5))).toBeNull();
  });
});

describe("worldRectToViewport", () => {
  it("converts the corner as a position and the extents as lengths", () => {
    const rect = worldRectToViewport(VIEW, worldRect(10, 10, 20, 30));
    expect(rect).toEqual({ x: 70, y: 70, width: 40, height: 60, space: "viewport" });
  });
});
