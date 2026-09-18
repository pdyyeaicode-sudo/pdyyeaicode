/**
 * Tests for sceneCodec — the encoder half of the engine wire contract.
 *
 * These assert the byte layout directly. The companion integration test feeds
 * the same output to the real C++ decoder; together they mean a format change on
 * either side cannot pass unnoticed.
 */

import { describe, expect, it } from "vitest";

import type { Artboard, DocumentLayer, ShapeLayer, TextLayer } from "../types/documentModel";
import { SCENE_FORMAT_VERSION, SCENE_MAGIC, encodeScene, parseCssColorToArgb } from "./sceneCodec";
import { extractRenderScene } from "./sceneExtractor";

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
    x: 10,
    y: 40,
    fontFamily: "Inter",
    fontSize: 24,
    fontWeight: "normal",
    textAlign: "left",
    fill: "#000000",
    ...overrides,
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

function readHeader(buffer: Uint8Array) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return {
    magic: view.getUint32(0, true),
    version: view.getUint32(4, true),
    width: view.getFloat64(8, true),
    height: view.getFloat64(16, true),
    nodeCount: view.getUint32(24, true),
  };
}

/** Field offsets of the first node, which begins right after the 28-byte header. */
const FIRST_NODE = 28;

function readFirstNodeHeader(buffer: Uint8Array) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return {
    parentIndex: view.getUint32(FIRST_NODE, true),
    kind: view.getUint8(FIRST_NODE + 4),
    blendMode: view.getUint8(FIRST_NODE + 5),
    flags: view.getUint8(FIRST_NODE + 6),
    reserved: view.getUint8(FIRST_NODE + 7),
    opacity: view.getFloat64(FIRST_NODE + 8, true),
  };
}

describe("encodeScene header", () => {
  it("writes the magic, version and artboard size", () => {
    const scene = extractRenderScene(makeArtboard([makeRect("r1")]));
    const encoded = encodeScene(scene);
    const header = readHeader(encoded.buffer);

    expect(header.magic).toBe(SCENE_MAGIC);
    expect(header.version).toBe(SCENE_FORMAT_VERSION);
    expect(header.width).toBe(800);
    expect(header.height).toBe(600);
    expect(header.nodeCount).toBe(1);
  });

  it("counts only the nodes actually written", () => {
    const scene = extractRenderScene(
      makeArtboard([
        makeRect("r1"),
        {
          id: "img1",
          role: "image-slots",
          name: "img1",
          editable: true,
          locked: false,
          visible: true,
          opacity: 100,
          kind: "image",
          href: "data:image/png;base64,AAAA",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
        },
      ]),
    );
    const encoded = encodeScene(scene);

    expect(encoded.nodeCount).toBe(1);
    expect(readHeader(encoded.buffer).nodeCount).toBe(1);
  });
});

describe("encodeScene node header", () => {
  it("marks a root node and keeps the reserved byte zero", () => {
    const scene = extractRenderScene(makeArtboard([makeRect("r1")]));
    const node = readFirstNodeHeader(encodeScene(scene).buffer);

    expect(node.parentIndex).toBe(0xffffffff);
    expect(node.kind).toBe(0); // rect
    expect(node.blendMode).toBe(0); // normal
    expect(node.reserved).toBe(0);
    expect(node.opacity).toBe(1);
  });

  it("sets the bounds flag when bounds are known", () => {
    const scene = extractRenderScene(makeArtboard([makeRect("r1")]));
    // bit1 = has local bounds
    expect(readFirstNodeHeader(encodeScene(scene).buffer).flags & 0b10).toBe(0b10);
  });

  it("sets the isolate flag for a group that needs its own layer", () => {
    const scene = extractRenderScene(
      makeArtboard([
        {
          id: "g",
          role: "shapes",
          name: "g",
          editable: true,
          locked: false,
          visible: true,
          opacity: 50,
          kind: "group",
          children: [makeRect("child")],
        },
      ]),
    );
    const encoded = encodeScene(scene);
    const node = readFirstNodeHeader(encoded.buffer);

    expect(node.kind).toBe(3); // group
    expect(node.flags & 0b1).toBe(0b1); // isolate
    expect(node.opacity).toBeCloseTo(0.5, 10);
    expect(encoded.nodeCount).toBe(2);
  });

  it("encodes blend modes by their engine enum index", () => {
    const scene = extractRenderScene(
      makeArtboard([makeRect("r1", { blendMode: "multiply" })]),
    );
    expect(readFirstNodeHeader(encodeScene(scene).buffer).blendMode).toBe(1);

    const luminosity = extractRenderScene(
      makeArtboard([makeRect("r2", { blendMode: "luminosity" })]),
    );
    expect(readFirstNodeHeader(encodeScene(luminosity).buffer).blendMode).toBe(15);
  });
});

describe("encodeScene ordering", () => {
  it("emits parents before children so the decoder needs one pass", () => {
    const scene = extractRenderScene(
      makeArtboard([
        {
          id: "outer",
          role: "shapes",
          name: "outer",
          editable: true,
          locked: false,
          visible: true,
          opacity: 100,
          kind: "group",
          children: [
            {
              id: "inner",
              role: "shapes",
              name: "inner",
              editable: true,
              locked: false,
              visible: true,
              opacity: 100,
              kind: "group",
              children: [makeRect("leaf")],
            },
          ],
        },
      ]),
    );
    const encoded = encodeScene(scene);
    expect(encoded.nodeCount).toBe(3);

    // The first node is the outer group and must be a root.
    expect(readFirstNodeHeader(encoded.buffer).parentIndex).toBe(0xffffffff);
  });
});

describe("encodeScene coverage reporting", () => {
  it("encodes text nodes now that the engine renders them", () => {
    const scene = extractRenderScene(makeArtboard([makeText("t1")]));
    const encoded = encodeScene(scene);

    expect(encoded.nodeCount).toBe(1);
    expect(encoded.skippedNodeIds).toEqual([]);
    expect(readFirstNodeHeader(encoded.buffer).kind).toBe(4); // text
  });

  it("encodes polygons and lines as paths, which the engine already renders", () => {
    const scene = extractRenderScene(
      makeArtboard([
        makeRect("poly", {
          kind: "polygon",
          geometry: {
            type: "polygon",
            points: [
              [0, 0],
              [10, 0],
              [0, 10],
            ],
          },
        }),
        makeRect("line", {
          kind: "line",
          geometry: { type: "line", x1: 0, y1: 0, x2: 10, y2: 10 },
          stroke: "#000000",
          strokeWidth: 2,
        }),
      ]),
    );
    const encoded = encodeScene(scene);

    expect(encoded.nodeCount).toBe(2);
    expect(encoded.skippedNodeIds).toEqual([]);
    // Both are emitted with the path wire kind.
    expect(readFirstNodeHeader(encoded.buffer).kind).toBe(2);
    expect(encoded.diagnostics).toEqual([]);
  });

  it("applies text-transform at encode time without mutating the document", () => {
    const layer = makeText("t1", { content: "hello world", textTransform: "uppercase" });
    const scene = extractRenderScene(makeArtboard([layer]));
    const encoded = encodeScene(scene);

    const decoded = new TextDecoder().decode(encoded.buffer);
    expect(decoded).toContain("HELLO WORLD");
    // The document model keeps the author's original string.
    expect(layer.content).toBe("hello world");
    // It is applied, so it is no longer reported as unsupported.
    expect(encoded.diagnostics).toEqual([]);
  });

  it("capitalizes each word for text-transform: capitalize", () => {
    const scene = extractRenderScene(
      makeArtboard([makeText("t1", { content: "hello wide world", textTransform: "capitalize" })]),
    );
    const decoded = new TextDecoder().decode(encodeScene(scene).buffer);
    expect(decoded).toContain("Hello Wide World");
  });

  it("encodes text decoration and still reports what remains unsupported", () => {
    const underlined = encodeScene(
      extractRenderScene(makeArtboard([makeText("t1", { textDecoration: "underline" })])),
    );
    // Underline is now a style bit, so nothing is reported for it.
    expect(underlined.diagnostics).toEqual([]);
    expect(underlined.nodeCount).toBe(1);

    const vertical = encodeScene(
      extractRenderScene(makeArtboard([makeText("t3", { writingMode: "vertical-rl" })])),
    );
    expect(vertical.diagnostics[0]?.detail).toContain("Writing mode");
  });

  it("still reports image nodes as unsupported", () => {
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
          href: "data:image/png;base64,AAAA",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
        },
      ]),
    );
    const encoded = encodeScene(scene);

    expect(encoded.nodeCount).toBe(0);
    expect(encoded.skippedNodeIds).toEqual(["img1"]);
    expect(encoded.diagnostics[0]).toMatchObject({ code: "engine-unsupported-node" });
  });

  it("carries a paint server across as an id, with no diagnostic", () => {
    const scene = extractRenderScene(
      makeArtboard([makeRect("r1", { fill: "url(#grad-1)" })]),
    );
    const encoded = encodeScene(scene);

    expect(encoded.nodeCount).toBe(1);
    // Resolution belongs to the engine, which parses `<defs>` itself. Reporting
    // here would be reporting on something this file no longer decides.
    expect(encoded.diagnostics).toEqual([]);

    // The id must be present in the buffer for the engine to resolve it.
    expect(new TextDecoder().decode(encoded.buffer)).toContain("grad-1");
  });

  it("reports an unparsable colour", () => {
    const scene = extractRenderScene(
      makeArtboard([makeRect("r1", { fill: "not-a-colour" })]),
    );
    expect(encodeScene(scene).diagnostics[0]).toMatchObject({
      code: "engine-unsupported-paint",
    });
  });

  it("encodes a clean scene with no diagnostics", () => {
    const scene = extractRenderScene(makeArtboard([makeRect("r1")]));
    expect(encodeScene(scene).diagnostics).toEqual([]);
  });
});

describe("parseCssColorToArgb", () => {
  it("parses hex in every SVG-relevant length", () => {
    expect(parseCssColorToArgb("#f00")).toBe(0xffff0000);
    expect(parseCssColorToArgb("#ff0000")).toBe(0xffff0000);
    expect(parseCssColorToArgb("#FF0000")).toBe(0xffff0000);
    // CSS hex is #RRGGBBAA; the wire format is AARRGGBB.
    expect(parseCssColorToArgb("#ff000080")).toBe(0x80ff0000);
    expect(parseCssColorToArgb("#f008")).toBe(0x88ff0000);
  });

  it("parses rgb and rgba functions", () => {
    expect(parseCssColorToArgb("rgb(255, 0, 0)")).toBe(0xffff0000);
    expect(parseCssColorToArgb("rgba(255, 0, 0, 0.5)")).toBe(0x80ff0000);
    expect(parseCssColorToArgb("rgb(100%, 0%, 0%)")).toBe(0xffff0000);
  });

  it("treats none and transparent as no paint", () => {
    expect(parseCssColorToArgb("none")).toBeNull();
    expect(parseCssColorToArgb("transparent")).toBeNull();
    expect(parseCssColorToArgb("")).toBeNull();
  });

  it("parses the basic keywords the canonical SVG uses", () => {
    expect(parseCssColorToArgb("white")).toBe(0xffffffff);
    expect(parseCssColorToArgb("black")).toBe(0xff000000);
  });

  it("returns null for anything it cannot resolve, rather than guessing", () => {
    expect(parseCssColorToArgb("hsl(0, 100%, 50%)")).toBeNull();
    expect(parseCssColorToArgb("#12345")).toBeNull();
    expect(parseCssColorToArgb("rebeccapurple")).toBeNull();
  });
});
