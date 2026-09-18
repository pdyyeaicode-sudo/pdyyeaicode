/**
 * sceneCodec — encodes a `RenderScene` into the engine's binary wire format.
 *
 * This is the TypeScript half of the contract defined in
 * `engine/include/pydee/scene_codec.h`. The two MUST agree byte for byte; the
 * integration test feeds this encoder's output to the real C++ decoder so a
 * divergence fails a test rather than corrupting a document silently.
 *
 * Why binary rather than JSON (spec §46):
 *  - The engine carries no JSON parser.
 *  - Scenes are uploaded on every document change; parsing text there is waste.
 *  - A versioned header lets the format evolve without silent misreads.
 *
 * The wire layout is a FLAT node array in paint order with parent indices.
 * Depth-first pre-order emission guarantees parents precede their children, so
 * the decoder rebuilds the tree in one pass and cycles are unrepresentable.
 *
 * Honesty about coverage: the engine build renders rect, ellipse, path, text and
 * group, with solid and gradient paints. Image nodes are NOT silently dropped —
 * they are reported in `diagnostics`, so the dual-renderer parity harness knows
 * the encoded scene is incomplete instead of reporting a false visual difference.
 *
 * Paint servers cross as an id only. The engine parses the artboard's `<defs>`
 * and resolves them, which keeps gradient geometry, percentage resolution and
 * transform composition in one implementation rather than two that can drift.
 *
 * One responsibility per file: RenderScene → wire format encoding.
 */

import type {
  RenderBlendMode,
  RenderGroupNode,
  RenderNode,
  RenderPaint,
  RenderScene,
  RenderStroke,
  SceneDiagnostic,
} from "./renderScene";
import { isGroupNode } from "./renderScene";

/** Must match `kSceneMagic` / `kSceneVersion` in scene_codec.h. */
export const SCENE_MAGIC = 0x53445950;
export const SCENE_FORMAT_VERSION = 3;
const NO_PARENT = 0xffffffff;

/** Wire values for node kinds; order matches `WireNodeKind` in C++. */
const WIRE_KIND = {
  rect: 0,
  ellipse: 1,
  path: 2,
  group: 3,
  text: 4,
} as const;

/** Wire values for paint kinds; order matches `WirePaintKind` in C++. */
const WIRE_PAINT = {
  none: 0,
  solid: 1,
  linearGradient: 2,
  radialGradient: 3,
  reference: 4,
} as const;

const FLAG_ISOLATE = 1 << 0;
const FLAG_HAS_LOCAL_BOUNDS = 1 << 1;

/** Text style bits packed into the text payload; matches scene_codec.h. */
const TEXT_STYLE_BOLD = 1 << 0;
const TEXT_STYLE_ITALIC = 1 << 1;
const TEXT_STYLE_RTL = 1 << 2;
const TEXT_STYLE_UNDERLINE = 1 << 3;
const TEXT_STYLE_LINE_THROUGH = 1 << 4;

/** Wire values for text alignment. */
const TEXT_ALIGN_WIRE: Readonly<Record<"left" | "center" | "right", number>> = {
  left: 0,
  center: 1,
  right: 2,
};

/**
 * Blend mode indices. The order is significant: it must match the `BlendMode`
 * enum in `engine/include/pydee/scene.h` exactly.
 */
const BLEND_MODE_ORDER: readonly RenderBlendMode[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
  "plus-lighter",
];

const BLEND_MODE_INDEX: ReadonlyMap<RenderBlendMode, number> = new Map(
  BLEND_MODE_ORDER.map((mode, index) => [mode, index]),
);

/** Maximum id length the `u16` id field can carry. */
const MAX_ID_BYTES = 0xffff;

export interface EncodedScene {
  readonly buffer: Uint8Array;
  /** Nodes actually written, after skipping kinds the engine cannot render. */
  readonly nodeCount: number;
  /** Ids that were skipped, so callers never assume full coverage. */
  readonly skippedNodeIds: readonly string[];
  readonly diagnostics: readonly SceneDiagnostic[];
}

/** Growable little-endian byte writer. */
class ByteWriter {
  private buffer: ArrayBuffer;
  private view: DataView;
  private bytes: Uint8Array;
  private length = 0;

  constructor(initialCapacity = 1024) {
    this.buffer = new ArrayBuffer(initialCapacity);
    this.view = new DataView(this.buffer);
    this.bytes = new Uint8Array(this.buffer);
  }

  get offset(): number {
    return this.length;
  }

  u8(value: number): void {
    this.ensure(1);
    this.view.setUint8(this.length, value & 0xff);
    this.length += 1;
  }

  u16(value: number): void {
    this.ensure(2);
    this.view.setUint16(this.length, value & 0xffff, true);
    this.length += 2;
  }

  u32(value: number): void {
    this.ensure(4);
    // `>>> 0` keeps values such as 0xFFFFFFFF unsigned.
    this.view.setUint32(this.length, value >>> 0, true);
    this.length += 4;
  }

  f64(value: number): void {
    this.ensure(8);
    this.view.setFloat64(this.length, value, true);
    this.length += 8;
  }

  utf8(value: string): number {
    const encoded = new TextEncoder().encode(value);
    this.ensure(encoded.byteLength);
    this.bytes.set(encoded, this.length);
    this.length += encoded.byteLength;
    return encoded.byteLength;
  }

  /** Overwrite a previously written u32, used to patch the node count. */
  patchU32(offset: number, value: number): void {
    this.view.setUint32(offset, value >>> 0, true);
  }

  /** Overwrite a previously written u16, used to patch a UTF-8 byte length. */
  patchU16(offset: number, value: number): void {
    this.view.setUint16(offset, value & 0xffff, true);
  }

  finish(): Uint8Array {
    return this.bytes.slice(0, this.length);
  }

  private ensure(extra: number): void {
    if (this.length + extra <= this.buffer.byteLength) {
      return;
    }
    let capacity = this.buffer.byteLength * 2;
    while (capacity < this.length + extra) {
      capacity *= 2;
    }
    const grown = new ArrayBuffer(capacity);
    new Uint8Array(grown).set(this.bytes.subarray(0, this.length));
    this.buffer = grown;
    this.view = new DataView(grown);
    this.bytes = new Uint8Array(grown);
  }
}

/** Encode a scene for the engine. */
export function encodeScene(scene: RenderScene): EncodedScene {
  const writer = new ByteWriter();
  const diagnostics: SceneDiagnostic[] = [];
  const skippedNodeIds: string[] = [];

  writer.u32(SCENE_MAGIC);
  writer.u32(SCENE_FORMAT_VERSION);
  writer.f64(scene.width);
  writer.f64(scene.height);
  const nodeCountOffset = writer.offset;
  writer.u32(0); // patched once the real count is known

  let nodeCount = 0;

  const writeNodes = (nodes: readonly RenderNode[], parentIndex: number): void => {
    for (const node of nodes) {
      const kind = wireKindOf(node);
      if (kind === null) {
        skippedNodeIds.push(node.id);
        diagnostics.push({
          nodeId: node.id,
          code: "engine-unsupported-node",
          detail: `The engine build does not render "${node.kind}" nodes yet, so it was omitted from the encoded scene.`,
        });
        continue;
      }

      const index = nodeCount;
      nodeCount += 1;
      writeNodeHeader(writer, node, kind, parentIndex, diagnostics);
      writeNodePayload(writer, node, diagnostics);

      if (isGroupNode(node)) {
        writeNodes(node.children, index);
      }
    }
  };

  writeNodes(scene.roots, NO_PARENT);
  writer.patchU32(nodeCountOffset, nodeCount);

  return {
    buffer: writer.finish(),
    nodeCount,
    skippedNodeIds,
    diagnostics,
  };
}

function wireKindOf(node: RenderNode): number | null {
  switch (node.kind) {
    case "rect":
      return WIRE_KIND.rect;
    case "ellipse":
      return WIRE_KIND.ellipse;
    case "path":
    case "polygon":
    case "line":
      // Polygons and lines are exactly expressible as paths, so they are encoded
      // as paths rather than adding engine node kinds that would duplicate
      // geometry the renderer already handles.
      return WIRE_KIND.path;
    case "text":
      return WIRE_KIND.text;
    case "group":
      return WIRE_KIND.group;
    case "image":
      // Needs the asset manager: decoding, caching and GPU upload.
      return null;
    default:
      return null;
  }
}

/** SVG path data for geometry the engine renders as a path. */
function pathDataFor(node: RenderNode): string {
  switch (node.kind) {
    case "path":
      return node.d;
    case "line":
      return `M ${node.x1} ${node.y1} L ${node.x2} ${node.y2}`;
    case "polygon": {
      if (node.points.length === 0) {
        return "";
      }
      const [first, ...rest] = node.points;
      const segments = rest.map(([x, y]) => `L ${x} ${y}`).join(" ");
      return `M ${first[0]} ${first[1]}${segments === "" ? "" : ` ${segments}`} Z`;
    }
    default:
      return "";
  }
}

/**
 * Apply `text-transform` at encode time.
 *
 * This is a presentation-only transform: the document model keeps the author's
 * original string, and only the rendered content is cased. Doing it here means
 * the engine needs no locale-casing logic and the SVG renderer's CSS
 * `text-transform` stays the source of truth for the shipping path.
 */
function applyTextTransform(
  content: string,
  transform: "none" | "uppercase" | "lowercase" | "capitalize" | undefined,
): string {
  switch (transform) {
    case "uppercase":
      return content.toUpperCase();
    case "lowercase":
      return content.toLowerCase();
    case "capitalize":
      // Capitalize the first letter of each whitespace-separated word, leaving
      // the rest untouched, which is what CSS `capitalize` does.
      return content.replace(/(^|\s)(\S)/g, (_match, prefix: string, letter: string) =>
        prefix + letter.toUpperCase(),
      );
    default:
      return content;
  }
}

function writeNodeHeader(
  writer: ByteWriter,
  node: RenderNode,
  kind: number,
  parentIndex: number,
  diagnostics: SceneDiagnostic[],
): void {
  let flags = 0;
  if (isGroupNode(node) && node.isolate) {
    flags |= FLAG_ISOLATE;
  }
  if (node.localBounds !== null) {
    flags |= FLAG_HAS_LOCAL_BOUNDS;
  }

  writer.u32(parentIndex);
  writer.u8(kind);
  writer.u8(BLEND_MODE_INDEX.get(node.blendMode) ?? 0);
  writer.u8(flags);
  writer.u8(0); // reserved, must be zero

  writer.f64(node.opacity);
  writer.f64(node.localTransform.a);
  writer.f64(node.localTransform.b);
  writer.f64(node.localTransform.c);
  writer.f64(node.localTransform.d);
  writer.f64(node.localTransform.e);
  writer.f64(node.localTransform.f);

  if (node.localBounds !== null) {
    writer.f64(node.localBounds.x);
    writer.f64(node.localBounds.y);
    writer.f64(node.localBounds.width);
    writer.f64(node.localBounds.height);
  }

  // Reserve the length slot, write the bytes, then patch: UTF-8 length in bytes
  // is not the same as the string's length in UTF-16 code units.
  const lengthOffset = writer.offset;
  writer.u16(0);
  const byteLength = writer.utf8(node.id);
  if (byteLength > MAX_ID_BYTES) {
    diagnostics.push({
      nodeId: node.id,
      code: "engine-unsupported-node",
      detail: `Layer id is ${byteLength} bytes, which exceeds the ${MAX_ID_BYTES}-byte wire limit.`,
    });
  }
  writer.patchU16(lengthOffset, byteLength);
}

function writeNodePayload(
  writer: ByteWriter,
  node: RenderNode,
  diagnostics: SceneDiagnostic[],
): void {
  switch (node.kind) {
    case "rect":
      writer.f64(node.x);
      writer.f64(node.y);
      writer.f64(node.width);
      writer.f64(node.height);
      writer.f64(node.cornerRadius);
      writePaint(writer, node.fill, node.id, diagnostics);
      writeStroke(writer, node.stroke, node.id, diagnostics);
      return;
    case "ellipse":
      writer.f64(node.cx);
      writer.f64(node.cy);
      writer.f64(node.rx);
      writer.f64(node.ry);
      writePaint(writer, node.fill, node.id, diagnostics);
      writeStroke(writer, node.stroke, node.id, diagnostics);
      return;
    case "path":
    case "polygon":
    case "line": {
      const d = pathDataFor(node);
      if (d === "") {
        diagnostics.push({
          nodeId: node.id,
          code: "unsupported-geometry",
          detail: `No path data could be produced for this ${node.kind} node.`,
        });
      }
      const lengthOffset = writer.offset;
      writer.u32(0);
      writer.patchU32(lengthOffset, writer.utf8(d));
      // A line has no fill in SVG; only rect/ellipse/path/polygon carry one.
      const fill: RenderPaint = node.kind === "line" ? { kind: "none" } : node.fill;
      writePaint(writer, fill, node.id, diagnostics);
      writeStroke(writer, node.stroke, node.id, diagnostics);
      return;
    }
    case "text": {
      writer.f64(node.x);
      writer.f64(node.y);
      writer.f64(node.fontSize);
      writer.f64(node.letterSpacing ?? 0);
      writer.f64(node.lineHeight ?? 0);

      let styleFlags = 0;
      if (node.fontWeight === "bold") {
        styleFlags |= TEXT_STYLE_BOLD;
      }
      if (node.fontStyle === "italic") {
        styleFlags |= TEXT_STYLE_ITALIC;
      }
      if (node.direction === "rtl") {
        styleFlags |= TEXT_STYLE_RTL;
      }
      // One decoration at a time: the decoder rejects both bits set, because
      // that would mean the two halves of the codec disagree.
      if (node.textDecoration === "underline") {
        styleFlags |= TEXT_STYLE_UNDERLINE;
      } else if (node.textDecoration === "line-through") {
        styleFlags |= TEXT_STYLE_LINE_THROUGH;
      }
      writer.u8(styleFlags);
      writer.u8(TEXT_ALIGN_WIRE[node.textAlign]);

      // Typography the engine does not implement yet is reported rather than
      // dropped, so the overlay never looks subtly wrong for an unknown reason.
      if (node.writingMode !== undefined && node.writingMode !== "horizontal-tb") {
        diagnostics.push({
          nodeId: node.id,
          code: "engine-unsupported-node",
          detail: `Writing mode "${node.writingMode}" is not supported by the engine yet.`,
        });
      }

      const familyOffset = writer.offset;
      writer.u16(0);
      writer.patchU16(familyOffset, writer.utf8(node.fontFamily));

      const contentOffset = writer.offset;
      writer.u32(0);
      writer.patchU32(
        contentOffset,
        writer.utf8(applyTextTransform(node.content, node.textTransform)),
      );

      writePaint(writer, node.fill, node.id, diagnostics);
      return;
    }
    case "group":
      return;
    default:
      return;
  }
}

function writePaint(
  writer: ByteWriter,
  paint: RenderPaint,
  nodeId: string,
  diagnostics: SceneDiagnostic[],
): void {
  if (paint.kind === "none") {
    writer.u8(WIRE_PAINT.none);
    writer.u32(0);
    return;
  }
  if (paint.kind === "paint-server") {
    // Only the id crosses the boundary. The engine parses the artboard's
    // `<defs>` itself, so gradient geometry, percentage resolution and
    // `gradientTransform` composition have exactly one implementation. An id the
    // engine cannot resolve is counted by it, not guessed at here.
    const encoded = new TextEncoder().encode(paint.referenceId);
    if (encoded.byteLength > MAX_ID_BYTES) {
      diagnostics.push({
        nodeId,
        code: "engine-unsupported-paint",
        detail: `Paint server id is ${encoded.byteLength} bytes, which exceeds the ${MAX_ID_BYTES}-byte wire limit.`,
      });
      writer.u8(WIRE_PAINT.none);
      writer.u32(0);
      return;
    }
    writer.u8(WIRE_PAINT.reference);
    writer.u32(0);
    const lengthOffset = writer.offset;
    writer.u16(0);
    writer.patchU16(lengthOffset, writer.utf8(paint.referenceId));
    return;
  }

  const color = parseCssColorToArgb(paint.color);
  if (color === null) {
    diagnostics.push({
      nodeId,
      code: "engine-unsupported-paint",
      detail: `Colour "${paint.color}" could not be parsed; nothing is painted for it.`,
    });
    writer.u8(WIRE_PAINT.none);
    writer.u32(0);
    return;
  }
  writer.u8(WIRE_PAINT.solid);
  writer.u32(color);
}

function writeStroke(
  writer: ByteWriter,
  stroke: RenderStroke,
  nodeId: string,
  diagnostics: SceneDiagnostic[],
): void {
  writePaint(writer, stroke.paint, nodeId, diagnostics);
  writer.f64(stroke.width);
}

/**
 * Parse a CSS/SVG colour into 0xAARRGGBB, or null when it cannot be resolved.
 *
 * Deliberately limited to the forms the Canonical_SVG actually produces — hex,
 * `rgb()`/`rgba()`, and the two keywords that mean "no paint" — plus a handful of
 * basic keywords. Anything else returns null and is reported by the caller
 * instead of being guessed at.
 */
export function parseCssColorToArgb(value: string): number | null {
  const input = value.trim().toLowerCase();
  if (input === "" || input === "none" || input === "transparent") {
    return null;
  }

  const named = NAMED_COLORS.get(input);
  if (named !== undefined) {
    return named;
  }

  if (input.startsWith("#")) {
    return parseHexColor(input.slice(1));
  }

  const functional = /^rgba?\(([^)]+)\)$/.exec(input);
  if (functional !== null) {
    return parseRgbFunction(functional[1]);
  }

  return null;
}

function parseHexColor(hex: string): number | null {
  const expand = (character: string): string => character + character;

  let normalized: string;
  if (hex.length === 3) {
    normalized = `ff${[...hex].map(expand).join("")}`;
  } else if (hex.length === 4) {
    const [r, g, b, a] = [...hex];
    normalized = `${expand(a)}${expand(r)}${expand(g)}${expand(b)}`;
  } else if (hex.length === 6) {
    normalized = `ff${hex}`;
  } else if (hex.length === 8) {
    // CSS hex is #RRGGBBAA; the wire format is AARRGGBB.
    normalized = `${hex.slice(6, 8)}${hex.slice(0, 6)}`;
  } else {
    return null;
  }

  if (!/^[0-9a-f]{8}$/.test(normalized)) {
    return null;
  }
  return Number.parseInt(normalized, 16) >>> 0;
}

function parseRgbFunction(body: string): number | null {
  const parts = body.split(/[,/]/).map((part) => part.trim()).filter((part) => part !== "");
  if (parts.length < 3 || parts.length > 4) {
    return null;
  }

  const channels: number[] = [];
  for (const part of parts.slice(0, 3)) {
    const percent = part.endsWith("%");
    const parsed = Number.parseFloat(percent ? part.slice(0, -1) : part);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    const scaled = percent ? (parsed / 100) * 255 : parsed;
    channels.push(clampByte(scaled));
  }

  let alpha = 255;
  if (parts.length === 4) {
    const alphaPart = parts[3];
    const percent = alphaPart.endsWith("%");
    const parsed = Number.parseFloat(percent ? alphaPart.slice(0, -1) : alphaPart);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    alpha = clampByte(percent ? (parsed / 100) * 255 : parsed * 255);
  }

  return (((alpha << 24) | (channels[0] << 16) | (channels[1] << 8) | channels[2]) >>> 0);
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

const NAMED_COLORS: ReadonlyMap<string, number> = new Map<string, number>([
  ["black", 0xff000000],
  ["white", 0xffffffff],
  ["red", 0xffff0000],
  ["lime", 0xff00ff00],
  ["green", 0xff008000],
  ["blue", 0xff0000ff],
  ["yellow", 0xffffff00],
  ["cyan", 0xff00ffff],
  ["aqua", 0xff00ffff],
  ["magenta", 0xffff00ff],
  ["fuchsia", 0xffff00ff],
  ["gray", 0xff808080],
  ["grey", 0xff808080],
  ["silver", 0xffc0c0c0],
  ["maroon", 0xff800000],
  ["olive", 0xff808000],
  ["navy", 0xff000080],
  ["teal", 0xff008080],
  ["purple", 0xff800080],
  ["orange", 0xffffa500],
]);
