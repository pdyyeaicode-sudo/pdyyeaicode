/**
 * Tests for sceneExtractor — the one place the Document_Model is interpreted
 * for rendering. These assert the properties that must hold for BOTH the SVG
 * backend and the future Skia backend: paint order, composed transforms,
 * un-premultiplied group alpha, honest bounds, and a reason for every fallback.
 */

import { describe, expect, it } from "vitest";

import type {
  Artboard,
  DocumentLayer,
  GroupLayer,
  ShapeLayer,
  TextLayer,
} from "../types/documentModel";
import { extractRenderScene, classifyPaint } from "./sceneExtractor";
import { findSceneNode, flattenLeaves, isGroupNode } from "./renderScene";
import type { TextMetricsProvider } from "./textMeasurement";

function makeArtboard(layers: DocumentLayer[]): Artboard {
  return {
    id: "artboard-1",
    width: 800,
    height: 600,
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
    geometry: { type: "rect", x: 10, y: 20, width: 100, height: 50 },
    fill: "#ff0000",
    ...overrides,
  };
}

function makeText(id: string, overrides: Partial<TextLayer> = {}): TextLayer {
  return {
    id,
    role: "headline",
    name: id,
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "text",
    elementId: `${id}-el`,
    field: "headline",
    content: "Hello",
    x: 100,
    y: 200,
    fontFamily: "Inter",
    fontSize: 48,
    fontWeight: "bold",
    textAlign: "left",
    fill: "#111111",
    ...overrides,
  };
}

function makeGroup(id: string, children: DocumentLayer[], overrides: Partial<GroupLayer> = {}): GroupLayer {
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

/** Deterministic metrics so text bounds are asserted, never guessed. */
const fixedMetrics: TextMetricsProvider = {
  measure: (request) => ({
    width: request.content.length * 10,
    height: 60,
    firstLineAscent: 40,
    lineCount: 1,
  }),
};

describe("extractRenderScene structure", () => {
  it("carries artboard identity, size and revision", () => {
    const scene = extractRenderScene(makeArtboard([makeRect("r1")]), { revision: 7 });
    expect(scene.artboardId).toBe("artboard-1");
    expect(scene.width).toBe(800);
    expect(scene.height).toBe(600);
    expect(scene.revision).toBe(7);
  });

  it("preserves document paint order back to front", () => {
    const scene = extractRenderScene(
      makeArtboard([makeRect("bottom"), makeRect("middle"), makeRect("top")]),
    );
    expect(flattenLeaves(scene).map((node) => node.id)).toEqual(["bottom", "middle", "top"]);
    expect(scene.roots.map((node) => node.zIndex)).toEqual([0, 1, 2]);
  });

  it("excludes invisible layers entirely", () => {
    const scene = extractRenderScene(
      makeArtboard([makeRect("shown"), makeRect("hidden", { visible: false })]),
    );
    expect(flattenLeaves(scene).map((node) => node.id)).toEqual(["shown"]);
    expect(findSceneNode(scene, "hidden")).toBeNull();
  });

  it("keeps groups as nodes instead of flattening them", () => {
    const scene = extractRenderScene(
      makeArtboard([makeGroup("g1", [makeRect("child1"), makeRect("child2")])]),
    );
    expect(scene.roots).toHaveLength(1);
    const group = scene.roots[0];
    expect(isGroupNode(group)).toBe(true);
    if (isGroupNode(group)) {
      expect(group.children.map((child) => child.id)).toEqual(["child1", "child2"]);
      expect(group.children.every((child) => child.parentId === "g1")).toBe(true);
    }
  });
});

describe("extractRenderScene transforms", () => {
  it("composes ancestor transforms into worldTransform", () => {
    const scene = extractRenderScene(
      makeArtboard([
        makeGroup("g1", [makeRect("child", { transform: "translate(5 0)" })], {
          transform: "translate(10 0)",
        }),
      ]),
    );
    const child = findSceneNode(scene, "child");
    expect(child?.localTransform.e).toBe(5);
    expect(child?.worldTransform.e).toBe(15);
  });

  it("maps bounds through the world transform", () => {
    const scene = extractRenderScene(
      makeArtboard([makeRect("r1", { transform: "translate(10 20)" })]),
    );
    const node = findSceneNode(scene, "r1");
    expect(node?.localBounds).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    expect(node?.worldBounds).toEqual({ x: 20, y: 40, width: 100, height: 50 });
  });

  it("reports an unsupported transform function instead of dropping it silently", () => {
    const scene = extractRenderScene(
      makeArtboard([makeRect("r1", { transform: "frobnicate(3)" })]),
    );
    expect(scene.diagnostics).toEqual([
      {
        nodeId: "r1",
        code: "unsupported-transform",
        detail: "Ignored transform function: frobnicate(3)",
      },
    ]);
  });
});

describe("extractRenderScene compositing", () => {
  it("does not premultiply group alpha into children", () => {
    const scene = extractRenderScene(
      makeArtboard([makeGroup("g1", [makeRect("child", { opacity: 80 })], { opacity: 50 })]),
    );
    const group = findSceneNode(scene, "g1");
    const child = findSceneNode(scene, "child");
    expect(group?.opacity).toBeCloseTo(0.5, 10);
    expect(child?.opacity).toBeCloseTo(0.8, 10);
  });

  it("isolates a group whose alpha, blend mode, clip or effects need compositing", () => {
    const transparent = extractRenderScene(
      makeArtboard([makeGroup("g", [makeRect("c")], { opacity: 40 })]),
    );
    const blended = extractRenderScene(
      makeArtboard([makeGroup("g", [makeRect("c")], { blendMode: "multiply" })]),
    );
    const clipped = extractRenderScene(
      makeArtboard([makeGroup("g", [makeRect("c")], { clipPathId: "mask" })]),
    );
    const plain = extractRenderScene(makeArtboard([makeGroup("g", [makeRect("c")])]));

    for (const scene of [transparent, blended, clipped]) {
      const group = findSceneNode(scene, "g");
      expect(group !== null && isGroupNode(group) && group.isolate).toBe(true);
    }
    const plainGroup = findSceneNode(plain, "g");
    expect(plainGroup !== null && isGroupNode(plainGroup) && plainGroup.isolate).toBe(false);
  });

  it("falls back to normal blending for an unknown mode and says why", () => {
    const scene = extractRenderScene(
      makeArtboard([makeRect("r1", { blendMode: "frobnicate" })]),
    );
    expect(findSceneNode(scene, "r1")?.blendMode).toBe("normal");
    expect(scene.diagnostics[0]).toMatchObject({ nodeId: "r1", code: "unknown-blend-mode" });
  });

  it("clamps out-of-range opacity into 0..1", () => {
    const scene = extractRenderScene(
      makeArtboard([makeRect("low", { opacity: -20 }), makeRect("high", { opacity: 400 })]),
    );
    expect(findSceneNode(scene, "low")?.opacity).toBe(0);
    expect(findSceneNode(scene, "high")?.opacity).toBe(1);
  });

  it("marks locked layers as not hit-testable while still drawing them", () => {
    const scene = extractRenderScene(makeArtboard([makeRect("r1", { locked: true })]));
    expect(findSceneNode(scene, "r1")?.hitTestable).toBe(false);
    expect(flattenLeaves(scene)).toHaveLength(1);
  });
});

describe("extractRenderScene geometry", () => {
  it("derives exact bounds for an ellipse", () => {
    const scene = extractRenderScene(
      makeArtboard([
        makeRect("e1", {
          kind: "ellipse",
          geometry: { type: "ellipse", cx: 50, cy: 60, rx: 10, ry: 20 },
        }),
      ]),
    );
    const node = findSceneNode(scene, "e1");
    expect(node?.localBounds).toEqual({ x: 40, y: 40, width: 20, height: 40 });
    expect(node?.boundsAccuracy).toBe("exact");
  });

  it("normalises line bounds regardless of point order", () => {
    const scene = extractRenderScene(
      makeArtboard([
        makeRect("l1", {
          kind: "line",
          geometry: { type: "line", x1: 30, y1: 40, x2: 10, y2: 20 },
        }),
      ]),
    );
    expect(findSceneNode(scene, "l1")?.localBounds).toEqual({
      x: 10,
      y: 20,
      width: 20,
      height: 20,
    });
  });

  it("measures path bounds tightly, not as a control-point superset", () => {
    const scene = extractRenderScene(
      makeArtboard([
        makeRect("p1", { kind: "path", geometry: { type: "path", d: "M0 0 L 10 10" } }),
      ]),
    );
    expect(findSceneNode(scene, "p1")?.boundsAccuracy).toBe("exact");
    expect(findSceneNode(scene, "p1")?.localBounds).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
  });

  it("does not include a curve's control points in a path's bounds", () => {
    // The box the selection chrome draws. A superset would report height 100 for
    // this curve, which never rises above 75 — and a rounded rectangle or a donut
    // is off by far more than that.
    const scene = extractRenderScene(
      makeArtboard([
        makeRect("p2", {
          kind: "path",
          geometry: { type: "path", d: "M 0 0 C 0 100 100 100 100 0" },
        }),
      ]),
    );
    expect(findSceneNode(scene, "p2")?.localBounds?.height).toBeCloseTo(75, 9);
  });

  it("builds parametric shapes through the existing geometry providers", () => {
    const scene = extractRenderScene(
      makeArtboard([
        makeRect("star1", {
          kind: "path",
          geometry: {
            type: "parametric",
            shapeType: "star",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            parameters: { points: 5, innerRatio: 0.5 },
          },
        }),
      ]),
    );
    const node = findSceneNode(scene, "star1");
    expect(node?.kind).toBe("path");
    if (node?.kind === "path") {
      expect(node.d.startsWith("M")).toBe(true);
    }
    expect(node?.boundsAccuracy).toBe("exact");
  });

  it("follows the PAINTED geometry when a parametric shape does not fill its box", () => {
    /*
      A five-pointed star inscribed in a 100x100 box does not touch three of its
      four edges: the outer points sit at -90, -18, 54, 126 and 198 degrees, so the
      lowest ink is at 50 + 50*sin(54) = 90.45 and the leftmost at
      50 - 50*cos(18) = 2.45.

      The extractor used to report the declared 100x100 box and label it "exact",
      so the selection outline stood roughly 10px below the star's lowest point and
      2.5px outside both sides. It now reports the ink and says so.
    */
    const scene = extractRenderScene(
      makeArtboard([
        makeRect("star2", {
          kind: "path",
          geometry: {
            type: "parametric",
            shapeType: "star",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            parameters: { points: 5, innerRatio: 0.5 },
          },
        }),
      ]),
    );
    const bounds = findSceneNode(scene, "star2")?.localBounds;
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeCloseTo(0, 6);
    expect(bounds!.y + bounds!.height).toBeCloseTo(50 + 50 * Math.sin((54 * Math.PI) / 180), 6);
    expect(bounds!.x).toBeCloseTo(50 - 50 * Math.cos((18 * Math.PI) / 180), 6);

    // And the divergence from the declared box is reported rather than hidden.
    expect(scene.diagnostics).toEqual([
      expect.objectContaining({ nodeId: "star2", code: "bounds-mismatch" }),
    ]);
  });

  it("keeps an unknown parametric shape selectable and explains the gap", () => {
    const scene = extractRenderScene(
      makeArtboard([
        makeRect("unknown1", {
          kind: "path",
          geometry: {
            type: "parametric",
            shapeType: "not-registered",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            parameters: {},
          },
        }),
      ]),
    );
    const node = findSceneNode(scene, "unknown1");
    expect(node?.localBounds).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    expect(scene.diagnostics[0]).toMatchObject({ code: "unsupported-geometry" });
  });
});

describe("extractRenderScene text", () => {
  it("reports unknown bounds when no font metrics are available", () => {
    const scene = extractRenderScene(makeArtboard([makeText("t1")]));
    const node = findSceneNode(scene, "t1");
    expect(node?.localBounds).toBeNull();
    expect(node?.boundsAccuracy).toBe("pending-measurement");
    expect(scene.diagnostics[0]).toMatchObject({
      nodeId: "t1",
      code: "text-measurement-unavailable",
    });
  });

  it("uses provided metrics and honours text alignment", () => {
    const left = extractRenderScene(makeArtboard([makeText("t1")]), {
      textMetrics: fixedMetrics,
    });
    expect(findSceneNode(left, "t1")?.localBounds).toEqual({
      x: 100,
      y: 160,
      width: 50,
      height: 60,
    });

    const centred = extractRenderScene(
      makeArtboard([makeText("t2", { textAlign: "center" })]),
      { textMetrics: fixedMetrics },
    );
    expect(findSceneNode(centred, "t2")?.localBounds).toEqual({
      x: 75,
      y: 160,
      width: 50,
      height: 60,
    });
    expect(centred.diagnostics).toEqual([]);
  });

  it("keeps text as text and preserves typography fields", () => {
    const scene = extractRenderScene(
      makeArtboard([
        makeText("t1", { letterSpacing: 1.5, direction: "rtl", fontStyle: "italic" }),
      ]),
      { textMetrics: fixedMetrics },
    );
    const node = findSceneNode(scene, "t1");
    expect(node?.kind).toBe("text");
    if (node?.kind === "text") {
      expect(node.content).toBe("Hello");
      expect(node.elementId).toBe("t1-el");
      expect(node.letterSpacing).toBe(1.5);
      expect(node.direction).toBe("rtl");
      expect(node.fontStyle).toBe("italic");
    }
  });
});

describe("classifyPaint", () => {
  it("keeps a paint-server reference instead of inventing gradient stops", () => {
    expect(classifyPaint("url(#grad-1)", "#000000")).toEqual({
      kind: "paint-server",
      referenceId: "grad-1",
      raw: "url(#grad-1)",
    });
  });

  it("maps none and empty to no paint", () => {
    expect(classifyPaint("none", "#000000")).toEqual({ kind: "none" });
    expect(classifyPaint("", "#000000")).toEqual({ kind: "none" });
  });

  it("uses the SVG initial fill when the document omits one", () => {
    expect(classifyPaint(undefined, "#000000")).toEqual({ kind: "solid", color: "#000000" });
  });

  it("treats an absent stroke as no stroke", () => {
    expect(classifyPaint(undefined, "none")).toEqual({ kind: "none" });
  });
});

describe("extractRenderScene image", () => {
  it("reports a missing source", () => {
    const scene = extractRenderScene(
      makeArtboard([
        {
          id: "img1",
          role: "image-slots",
          name: "img1",
          editable: true,
          locked: false,
          visible: true,
          opacity: 100,
          kind: "image",
          href: "",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        },
      ]),
    );
    expect(scene.diagnostics[0]).toMatchObject({ nodeId: "img1", code: "missing-image-href" });
    expect(findSceneNode(scene, "img1")?.localBounds).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
  });
});
