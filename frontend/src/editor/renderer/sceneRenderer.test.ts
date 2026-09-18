/**
 * Tests for sceneRenderer via the DisplayListRecorder.
 *
 * These are the parity tests: they pin the exact command sequence a backend
 * receives, so when the Skia backend lands, any divergence in paint order,
 * transform composition, group isolation, clipping or culling shows up as a
 * command diff rather than a vague visual difference.
 */

import { describe, expect, it } from "vitest";

import type { Artboard, DocumentLayer, GroupLayer, ShapeLayer } from "../types/documentModel";
import { DisplayListRecorder } from "./displayListRecorder";
import { IDENTITY, scaling } from "./matrix2d";
import { extractRenderScene } from "./sceneExtractor";
import { renderScene } from "./sceneRenderer";

function makeArtboard(layers: DocumentLayer[]): Artboard {
  return {
    id: "artboard-1",
    width: 400,
    height: 300,
    printMeta: { bleed: 3, cmykSafe: true, trimMarks: true },
    layers,
    defs: "",
    rootAttributes: {},
  };
}

function makeRect(id: string, overrides: Partial<ShapeLayer> = {}): ShapeLayer {
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
    geometry: { type: "rect", x: 0, y: 0, width: 50, height: 50 },
    fill: "#00ff00",
    ...overrides,
  };
}

function makeGroup(
  id: string,
  children: DocumentLayer[],
  overrides: Partial<GroupLayer> = {},
): GroupLayer {
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
    ...overrides,
  };
}

function record(layers: DocumentLayer[], options: Parameters<typeof renderScene>[2] = { viewTransform: IDENTITY }) {
  const scene = extractRenderScene(makeArtboard(layers));
  const recorder = new DisplayListRecorder();
  const stats = renderScene(scene, recorder, options);
  return { recorder, stats, scene };
}

describe("renderScene frame lifecycle", () => {
  it("opens and closes exactly one frame and keeps save/restore balanced", () => {
    const { recorder } = record([makeGroup("g", [makeRect("a"), makeRect("b")])]);
    const ops = recorder.getCommands().map((command) => command.op);

    expect(ops[0]).toBe("beginFrame");
    expect(ops[ops.length - 1]).toBe("endFrame");
    expect(ops.filter((op) => op === "beginFrame")).toHaveLength(1);
    expect(ops.filter((op) => op === "save").length).toBe(
      ops.filter((op) => op === "restore").length,
    );
    expect(recorder.isBalanced()).toBe(true);
  });

  it("passes artboard size, pixel ratio and view transform to the backend", () => {
    const { recorder } = record([makeRect("a")], {
      viewTransform: scaling(2, 2),
      pixelRatio: 3,
    });
    const first = recorder.getCommands()[0];
    expect(first.op).toBe("beginFrame");
    if (first.op === "beginFrame") {
      expect(first.frame.width).toBe(400);
      expect(first.frame.height).toBe(300);
      expect(first.frame.pixelRatio).toBe(3);
      expect(first.frame.viewTransform).toEqual(scaling(2, 2));
    }
  });

  it("clears only when a background colour is supplied", () => {
    const without = record([makeRect("a")]);
    expect(without.recorder.getCommands().some((command) => command.op === "clear")).toBe(false);

    const withColor = record([makeRect("a")], {
      viewTransform: IDENTITY,
      backgroundColor: "#ffffff",
    });
    expect(withColor.recorder.toTrace()).toContain("clear #ffffff");
  });
});

describe("renderScene ordering and nesting", () => {
  it("draws leaves in document paint order, including inside groups", () => {
    const { recorder } = record([
      makeRect("bottom"),
      makeGroup("g", [makeRect("inner1"), makeRect("inner2")]),
      makeRect("top"),
    ]);
    expect(recorder.getDrawnNodeIds()).toEqual(["bottom", "inner1", "inner2", "top"]);
  });

  it("concatenates each node's local transform inside its own save scope", () => {
    const { recorder } = record([makeRect("a", { transform: "translate(10 20)" })]);
    const trace = recorder.toTrace();
    const saveIndex = trace.indexOf("save");
    const concatIndex = trace.findIndex((line) => line.startsWith("concatTransform"));
    const drawIndex = trace.findIndex((line) => line.startsWith("draw rect #a"));
    const restoreIndex = trace.indexOf("restore");

    expect(saveIndex).toBeLessThan(concatIndex);
    expect(concatIndex).toBeLessThan(drawIndex);
    expect(drawIndex).toBeLessThan(restoreIndex);
    expect(trace[concatIndex]).toBe("concatTransform matrix(1 0 0 1 10 20)");
  });

  it("opens an isolated layer for a translucent group and closes it", () => {
    const { recorder } = record([
      makeGroup("g", [makeRect("a"), makeRect("b")], { opacity: 50 }),
    ]);
    const ops = recorder.getCommands().map((command) => command.op);
    expect(ops.filter((op) => op === "beginLayer")).toHaveLength(1);
    expect(ops.filter((op) => op === "endLayer")).toHaveLength(1);
    expect(ops.indexOf("beginLayer")).toBeLessThan(ops.indexOf("endLayer"));
    expect(recorder.toTrace()).toContain("beginLayer #g alpha=0.5 blend=normal");
  });

  it("does not open a layer for a plain group", () => {
    const { recorder, stats } = record([makeGroup("g", [makeRect("a")])]);
    expect(recorder.getCommands().some((command) => command.op === "beginLayer")).toBe(false);
    expect(stats.layersOpened).toBe(0);
  });

  it("nests groups without flattening them", () => {
    const { recorder } = record([
      makeGroup("outer", [makeGroup("inner", [makeRect("leaf")])]),
    ]);
    expect(recorder.getDrawnNodeIds()).toEqual(["leaf"]);
    expect(recorder.getMaxDepth()).toBeGreaterThanOrEqual(3);
  });
});

describe("renderScene culling", () => {
  it("skips nodes whose world bounds are outside the visible region", () => {
    const { recorder, stats } = record(
      [
        makeRect("visible", { geometry: { type: "rect", x: 0, y: 0, width: 50, height: 50 } }),
        makeRect("offscreen", {
          geometry: { type: "rect", x: 5000, y: 5000, width: 50, height: 50 },
        }),
      ],
      { viewTransform: IDENTITY, cullRect: { x: 0, y: 0, width: 400, height: 300 } },
    );
    expect(recorder.getDrawnNodeIds()).toEqual(["visible"]);
    expect(stats.nodesCulled).toBe(1);
    expect(stats.nodesDrawn).toBe(1);
  });

  it("never culls a node whose bounds are unknown", () => {
    const scene = extractRenderScene(
      makeArtboard([
        {
          id: "t1",
          role: "headline",
          name: "t1",
          editable: true,
          locked: false,
          visible: true,
          opacity: 100,
          kind: "text",
          elementId: "t1-el",
          field: "headline",
          content: "Unmeasured",
          x: 0,
          y: 0,
          fontFamily: "Inter",
          fontSize: 24,
          fontWeight: "normal",
          textAlign: "left",
          fill: "#000000",
        },
      ]),
    );
    const recorder = new DisplayListRecorder();
    renderScene(scene, recorder, {
      viewTransform: IDENTITY,
      cullRect: { x: 10000, y: 10000, width: 10, height: 10 },
    });
    expect(recorder.getDrawnNodeIds()).toEqual(["t1"]);
  });
});

describe("renderScene clipping", () => {
  it("resolves a clip reference to the referenced layer's geometry", () => {
    const { recorder, stats } = record([
      makeRect("mask", { geometry: { type: "rect", x: 5, y: 5, width: 20, height: 10 } }),
      makeRect("clipped", { clipPathId: "mask" }),
    ]);
    expect(stats.clipsApplied).toBe(1);
    expect(stats.unresolvedClips).toEqual([]);
    expect(recorder.toTrace()).toContain("setClip rect 5,5,20,10 r=0");
  });

  it("reports an unresolved clip instead of silently drawing unclipped", () => {
    const { stats } = record([makeRect("clipped", { clipPathId: "does-not-exist" })]);
    expect(stats.clipsApplied).toBe(0);
    expect(stats.unresolvedClips).toEqual(["does-not-exist"]);
  });
});
