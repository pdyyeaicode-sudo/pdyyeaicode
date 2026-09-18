/**
 * transformDelta tests.
 *
 * The cases are chosen to fail for the OLD implementation (`dx / zoom` handed to
 * every consumer): an ancestor scale, an ancestor rotation, the node's own
 * rotation, and a nested combination of all three. Each asserts the property that
 * actually matters — after the conversion, the node's world position moved by
 * exactly the requested world delta — rather than asserting the intermediate
 * numbers, which would pass for a wrong-but-self-consistent implementation.
 */

import { describe, expect, it } from "vitest";

import {
  IDENTITY,
  multiply,
  rotation,
  scaling,
  transformPoint,
  translation,
  type Matrix2D,
} from "../renderer/matrix2d";
import {
  dragDeltasFor,
  localTransformAfterWorldTranslation,
  parentWorldTransform,
  worldDeltaInSpaceOf,
  type TransformChainNode,
} from "./transformDelta";

/** Build a chain of nodes with correctly accumulated world transforms. */
function chain(locals: ReadonlyArray<{ id: string; local: Matrix2D }>): {
  nodes: TransformChainNode[];
  lookup: (id: string) => TransformChainNode | undefined;
} {
  const nodes: TransformChainNode[] = [];
  let parentWorld = IDENTITY;
  let parentId: string | null = null;
  for (const { id, local } of locals) {
    const worldTransform = multiply(parentWorld, local);
    nodes.push({ id, parentId, localTransform: local, worldTransform });
    parentWorld = worldTransform;
    parentId = id;
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return { nodes, lookup: (id) => byId.get(id) };
}

/** Where a node's local origin lands in world space. */
function worldOrigin(world: Matrix2D): { x: number; y: number } {
  return transformPoint(world, { x: 0, y: 0 });
}

describe("worldDeltaInSpaceOf", () => {
  it("is the identity when the basis is the identity", () => {
    expect(worldDeltaInSpaceOf(IDENTITY, { dx: 12, dy: -3 })).toEqual({ dx: 12, dy: -3 });
  });

  it("ignores the basis translation, because a delta has no position", () => {
    const basis = translation(500, -900);
    expect(worldDeltaInSpaceOf(basis, { dx: 7, dy: 7 })).toEqual({ dx: 7, dy: 7 });
  });

  it("divides by the basis scale", () => {
    const result = worldDeltaInSpaceOf(scaling(2, 4), { dx: 10, dy: 8 });
    expect(result).not.toBeNull();
    expect(result?.dx).toBeCloseTo(5, 12);
    expect(result?.dy).toBeCloseTo(2, 12);
  });

  it("rotates the delta back out of a rotated basis", () => {
    // A basis rotated 90 degrees: a world +x delta is a local -y delta.
    const result = worldDeltaInSpaceOf(rotation(90), { dx: 10, dy: 0 });
    expect(result).not.toBeNull();
    expect(result?.dx).toBeCloseTo(0, 9);
    expect(result?.dy).toBeCloseTo(-10, 9);
  });

  it("returns null for a singular basis instead of guessing", () => {
    expect(worldDeltaInSpaceOf(scaling(0, 1), { dx: 5, dy: 5 })).toBeNull();
  });

  it("returns null for a non-finite basis", () => {
    expect(worldDeltaInSpaceOf({ ...IDENTITY, a: Number.NaN }, { dx: 1, dy: 1 })).toBeNull();
  });
});

describe("parentWorldTransform", () => {
  it("is the identity for a root", () => {
    const { nodes, lookup } = chain([{ id: "root", local: translation(10, 10) }]);
    expect(parentWorldTransform(nodes[0], lookup)).toEqual(IDENTITY);
  });

  it("is the parent's world transform, ancestors included", () => {
    const { nodes, lookup } = chain([
      { id: "a", local: multiply(translation(100, 50), scaling(2, 2)) },
      { id: "b", local: translation(10, 5) },
      { id: "c", local: rotation(30) },
    ]);
    expect(parentWorldTransform(nodes[2], lookup)).toEqual(nodes[1].worldTransform);
    expect(parentWorldTransform(nodes[1], lookup)).toEqual(nodes[0].worldTransform);
  });

  it("returns null when the parent is missing, rather than treating it as a root", () => {
    const orphan: TransformChainNode = {
      id: "orphan",
      parentId: "gone",
      localTransform: IDENTITY,
      worldTransform: IDENTITY,
    };
    expect(parentWorldTransform(orphan, () => undefined)).toBeNull();
  });
});

describe("dragDeltasFor", () => {
  it("passes the world delta through untouched", () => {
    const { nodes, lookup } = chain([{ id: "n", local: scaling(3, 3) }]);
    const deltas = dragDeltasFor(nodes[0], lookup, { dx: 9, dy: -6 });
    expect(deltas?.world).toEqual({ dx: 9, dy: -6 });
  });

  it("divides the PARENT delta by the ancestor scale, not by zoom", () => {
    // The bug this replaces: a layer inside scale(2) moved twice as far as the
    // pointer, because only the viewport zoom was accounted for.
    const { nodes, lookup } = chain([
      { id: "group", local: scaling(2, 2) },
      { id: "leaf", local: translation(10, 10) },
    ]);
    const deltas = dragDeltasFor(nodes[1], lookup, { dx: 40, dy: 0 });
    expect(deltas?.parent.dx).toBeCloseTo(20, 12);
    expect(deltas?.parent.dy).toBeCloseTo(0, 12);
  });

  it("gives DIFFERENT parent and local deltas when the node itself is rotated", () => {
    const { nodes, lookup } = chain([
      { id: "group", local: IDENTITY },
      { id: "leaf", local: rotation(90) },
    ]);
    const deltas = dragDeltasFor(nodes[1], lookup, { dx: 10, dy: 0 });
    // In the parent's space the delta is unchanged...
    expect(deltas?.parent.dx).toBeCloseTo(10, 9);
    expect(deltas?.parent.dy).toBeCloseTo(0, 9);
    // ...but geometry written inside the node's own rotation must be rotated back.
    expect(deltas?.local.dx).toBeCloseTo(0, 9);
    expect(deltas?.local.dy).toBeCloseTo(-10, 9);
  });

  it("refuses the gesture when an ancestor is collapsed", () => {
    const { nodes, lookup } = chain([
      { id: "group", local: scaling(0, 1) },
      { id: "leaf", local: IDENTITY },
    ]);
    expect(dragDeltasFor(nodes[1], lookup, { dx: 1, dy: 1 })).toBeNull();
  });
});

describe("the property that matters: the node lands exactly where asked", () => {
  const cases: Array<{ name: string; locals: Array<{ id: string; local: Matrix2D }> }> = [
    { name: "identity chain", locals: [{ id: "leaf", local: IDENTITY }] },
    {
      name: "scaled ancestor",
      locals: [
        { id: "g", local: scaling(2, 2) },
        { id: "leaf", local: translation(5, 5) },
      ],
    },
    {
      name: "rotated ancestor",
      locals: [
        { id: "g", local: rotation(37) },
        { id: "leaf", local: translation(5, 5) },
      ],
    },
    {
      name: "mirrored ancestor",
      locals: [
        { id: "g", local: scaling(-1, 1) },
        { id: "leaf", local: IDENTITY },
      ],
    },
    {
      name: "nested scale + rotation + mirror, node rotated too",
      locals: [
        { id: "a", local: multiply(translation(30, 20), scaling(2, 2)) },
        { id: "b", local: rotation(15) },
        { id: "c", local: scaling(-1, 1) },
        { id: "leaf", local: rotation(-8) },
      ],
    },
  ];

  const deltas = [
    { dx: 40, dy: 0 },
    { dx: 0, dy: -25 },
    { dx: -13.5, dy: 7.25 },
    { dx: 0.001, dy: 0.001 },
  ];

  for (const testCase of cases) {
    for (const worldDelta of deltas) {
      it(`${testCase.name}: (${worldDelta.dx}, ${worldDelta.dy})`, () => {
        const { nodes, lookup } = chain(testCase.locals);
        const leaf = nodes[nodes.length - 1];
        const parentWorld = parentWorldTransform(leaf, lookup);
        expect(parentWorld).not.toBeNull();

        const nextLocal = localTransformAfterWorldTranslation(leaf, lookup, worldDelta);
        expect(nextLocal).not.toBeNull();

        const before = worldOrigin(leaf.worldTransform);
        const after = worldOrigin(multiply(parentWorld as Matrix2D, nextLocal as Matrix2D));

        // The whole point: whatever the transform chain does, the object moves by
        // exactly the world delta that was asked for.
        expect(after.x - before.x).toBeCloseTo(worldDelta.dx, 9);
        expect(after.y - before.y).toBeCloseTo(worldDelta.dy, 9);
      });
    }
  }

  it("a LOCAL geometry offset also lands the node exactly where asked", () => {
    // The commit path writes geometry, not a transform, so it needs the local
    // delta. Verified as the same displacement property.
    const { nodes, lookup } = chain([
      { id: "g", local: multiply(rotation(25), scaling(3, 3)) },
      { id: "leaf", local: rotation(-40) },
    ]);
    const leaf = nodes[1];
    const worldDelta = { dx: 17, dy: -9 };
    const converted = dragDeltasFor(leaf, lookup, worldDelta);
    expect(converted).not.toBeNull();

    // Offsetting geometry by `local` moves the node's local origin by that much
    // inside its own space; map both through the unchanged world transform.
    const before = transformPoint(leaf.worldTransform, { x: 0, y: 0 });
    const after = transformPoint(leaf.worldTransform, {
      x: (converted as { local: { dx: number; dy: number } }).local.dx,
      y: (converted as { local: { dx: number; dy: number } }).local.dy,
    });
    expect(after.x - before.x).toBeCloseTo(worldDelta.dx, 9);
    expect(after.y - before.y).toBeCloseTo(worldDelta.dy, 9);
  });
});
