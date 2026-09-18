/**
 * Tests for sceneHitTest — the geometric replacement for DOM-based selection.
 *
 * The cases that matter are the ones a bounding-box-only implementation gets
 * wrong: ellipse corners, rotated rectangles, and locked layers. These must
 * behave identically on the SVG and Skia backends, because both resolve clicks
 * through this module rather than through the DOM.
 */

import { describe, expect, it } from "vitest";

import type { Artboard, DocumentLayer, ShapeLayer } from "../types/documentModel";
import { hitTestScene, hitTestSceneAll } from "./sceneHitTest";
import { extractRenderScene } from "./sceneExtractor";
import type { TextMetricsProvider } from "./textMeasurement";

function makeArtboard(layers: DocumentLayer[]): Artboard {
  return {
    id: "artboard-1",
    width: 400,
    height: 400,
    printMeta: { bleed: 3, cmykSafe: true, trimMarks: true },
    layers,
    defs: "",
    rootAttributes: {},
  };
}

function makeShape(id: string, overrides: Partial<ShapeLayer> = {}): ShapeLayer {
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
    geometry: { type: "rect", x: 0, y: 0, width: 100, height: 100 },
    fill: "#123456",
    ...overrides,
  };
}

function sceneOf(layers: DocumentLayer[], textMetrics?: TextMetricsProvider) {
  return extractRenderScene(makeArtboard(layers), textMetrics ? { textMetrics } : {});
}

describe("hitTestScene ordering", () => {
  it("returns the topmost node when objects overlap", () => {
    const scene = sceneOf([makeShape("under"), makeShape("over")]);
    expect(hitTestScene(scene, { x: 50, y: 50 })?.id).toBe("over");
  });

  it("returns every hit topmost-first", () => {
    const scene = sceneOf([makeShape("under"), makeShape("over")]);
    expect(hitTestSceneAll(scene, { x: 50, y: 50 }).map((node) => node.id)).toEqual([
      "over",
      "under",
    ]);
  });

  it("returns null when the point misses everything", () => {
    const scene = sceneOf([makeShape("a")]);
    expect(hitTestScene(scene, { x: 500, y: 500 })).toBeNull();
  });
});

describe("hitTestScene respects layer state", () => {
  it("ignores locked layers by default and includes them on request", () => {
    const scene = sceneOf([makeShape("locked", { locked: true })]);
    expect(hitTestScene(scene, { x: 10, y: 10 })).toBeNull();
    expect(hitTestScene(scene, { x: 10, y: 10 }, { includeLocked: true })?.id).toBe("locked");
  });

  it("ignores fully transparent layers", () => {
    const scene = sceneOf([makeShape("ghost", { opacity: 0 })]);
    expect(hitTestScene(scene, { x: 10, y: 10 })).toBeNull();
  });

  it("never hits an invisible layer, which is absent from the scene", () => {
    const scene = sceneOf([makeShape("hidden", { visible: false })]);
    expect(hitTestScene(scene, { x: 10, y: 10 })).toBeNull();
  });
});

describe("hitTestScene geometry precision", () => {
  it("rejects a point inside an ellipse's bounding box but outside the ellipse", () => {
    const scene = sceneOf([
      makeShape("e", {
        kind: "ellipse",
        geometry: { type: "ellipse", cx: 50, cy: 50, rx: 50, ry: 50 },
      }),
    ]);
    // Corner of the bounding box: inside the box, outside the circle.
    expect(hitTestScene(scene, { x: 2, y: 2 })).toBeNull();
    expect(hitTestScene(scene, { x: 50, y: 50 })?.id).toBe("e");
  });

  it("uses the inverse world transform for a rotated rectangle", () => {
    const scene = sceneOf([
      makeShape("r", {
        geometry: { type: "rect", x: 0, y: 0, width: 100, height: 20 },
        transform: "rotate(45)",
      }),
    ]);
    // Inside the rotated strip.
    expect(hitTestScene(scene, { x: 28.28, y: 42.43 })?.id).toBe("r");
    // Inside the axis-aligned world box, but outside the rotated rectangle.
    expect(hitTestScene(scene, { x: 0, y: 60 })).toBeNull();
  });

  it("tests polygons by containment, not by bounding box", () => {
    const scene = sceneOf([
      makeShape("tri", {
        kind: "polygon",
        geometry: {
          type: "polygon",
          points: [
            [0, 0],
            [100, 0],
            [0, 100],
          ],
        },
      }),
    ]);
    expect(hitTestScene(scene, { x: 10, y: 10 })?.id).toBe("tri");
    // Opposite corner of the bounding box lies outside the triangle.
    expect(hitTestScene(scene, { x: 90, y: 90 })).toBeNull();
  });

  it("hits a thin line only within its stroke width or tolerance", () => {
    const scene = sceneOf([
      makeShape("l", {
        kind: "line",
        geometry: { type: "line", x1: 0, y1: 0, x2: 100, y2: 0 },
        stroke: "#000000",
        strokeWidth: 2,
      }),
    ]);
    expect(hitTestScene(scene, { x: 50, y: 0.5 })?.id).toBe("l");
    expect(hitTestScene(scene, { x: 50, y: 8 })).toBeNull();
    expect(hitTestScene(scene, { x: 50, y: 8 }, { tolerance: 10 })?.id).toBe("l");
  });

  it("reports no hit for text whose bounds are still unmeasured", () => {
    const textLayer: DocumentLayer = {
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
      content: "Hello",
      x: 0,
      y: 50,
      fontFamily: "Inter",
      fontSize: 40,
      fontWeight: "normal",
      textAlign: "left",
      fill: "#000000",
    };

    expect(hitTestScene(sceneOf([textLayer]), { x: 10, y: 40 })).toBeNull();

    const measured = sceneOf([textLayer], {
      measure: () => ({ width: 100, height: 48, firstLineAscent: 36, lineCount: 1 }),
    });
    expect(hitTestScene(measured, { x: 10, y: 40 })?.id).toBe("t1");
  });

  it("finds nodes nested inside groups using composed transforms", () => {
    const scene = sceneOf([
      {
        id: "g",
        role: "shapes",
        name: "g",
        editable: true,
        locked: false,
        visible: true,
        opacity: 100,
        kind: "group",
        transform: "translate(200 0)",
        children: [makeShape("child")],
      },
    ]);
    expect(hitTestScene(scene, { x: 250, y: 50 })?.id).toBe("child");
    expect(hitTestScene(scene, { x: 50, y: 50 })).toBeNull();
  });
});
