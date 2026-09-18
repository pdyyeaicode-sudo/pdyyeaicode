/**
 * sceneExtractor — builds a `RenderScene` from the authoritative `Artboard`
 * (spec §64 "Rendering phases": scene validation → visibility → bounds →
 * command generation).
 *
 * This is the one place that interprets the Document_Model for rendering. Both
 * the current SVG backend and the future Skia/WASM backend consume its output,
 * so a layer can never be interpreted two different ways by two renderers
 * (spec §63: all targets consume the same scene).
 *
 * Guarantees:
 *  - Pure: no DOM, no globals, no mutation of the input document.
 *  - Stable ids: nodes carry the document's own `data-layer-id` (spec §4).
 *  - Paint order preserved: index 0 of `layers` is painted first (furthest back).
 *  - Groups are preserved so isolated compositing stays correct (spec §12).
 *  - Every construct it cannot fully represent is reported in `diagnostics`
 *    with a reason — never dropped silently (AGENTS.md).
 *
 * One responsibility per file: Document_Model → RenderScene extraction.
 */

import { buildParametricPath } from "../geometry/GeometryEngine";
import type {
  Artboard,
  DocumentLayer,
  EffectNode,
  GroupLayer,
  ImageLayer,
  ShapeLayer,
  TextLayer,
} from "../types/documentModel";
import {
  IDENTITY,
  multiply,
  parseSvgTransform,
  transformRect,
  unionRect,
  type Matrix2D,
  type RectF,
} from "./matrix2d";
import { exactPathBounds } from "./exactPathBounds";
import {
  RENDER_BLEND_MODES,
  type BoundsAccuracy,
  type RenderBlendMode,
  type RenderNode,
  type RenderNodeBase,
  type RenderPaint,
  type RenderScene,
  type RenderStroke,
  type SceneDiagnostic,
} from "./renderScene";
import { textBoundsFromMetrics, type TextMetricsProvider } from "./textMeasurement";

export interface SceneExtractionOptions {
  /** Document revision used by the backend as a cache key (spec §31). */
  readonly revision?: number;
  /**
   * Supplies real font metrics. When omitted, text nodes are emitted with
   * `boundsAccuracy: "pending-measurement"` and a diagnostic, rather than an
   * invented approximation.
   */
  readonly textMetrics?: TextMetricsProvider;
}

/** SVG's initial `fill` is black; absent fill must paint, not disappear. */
const SVG_DEFAULT_FILL = "#000000";
/** SVG's initial `stroke-width`. */
const SVG_DEFAULT_STROKE_WIDTH = 1;

interface ExtractionContext {
  readonly diagnostics: SceneDiagnostic[];
  readonly textMetrics: TextMetricsProvider | null;
}

/** Build the render scene for one artboard. */
export function extractRenderScene(
  artboard: Artboard,
  options: SceneExtractionOptions = {},
): RenderScene {
  const context: ExtractionContext = {
    diagnostics: [],
    textMetrics: options.textMetrics ?? null,
  };

  const roots = extractLayers(artboard.layers, null, IDENTITY, context);

  return {
    artboardId: artboard.id,
    width: artboard.width,
    height: artboard.height,
    roots,
    revision: options.revision ?? 0,
    diagnostics: context.diagnostics,
  };
}

function extractLayers(
  layers: readonly DocumentLayer[],
  parentId: string | null,
  parentWorld: Matrix2D,
  context: ExtractionContext,
): RenderNode[] {
  const nodes: RenderNode[] = [];
  layers.forEach((layer, index) => {
    // Invisible layers are excluded from the scene entirely: they must not be
    // painted, culled against, or hit-tested (spec §65).
    if (!layer.visible) {
      return;
    }
    const node = extractLayer(layer, parentId, parentWorld, index, context);
    if (node !== null) {
      nodes.push(node);
    }
  });
  return nodes;
}

function extractLayer(
  layer: DocumentLayer,
  parentId: string | null,
  parentWorld: Matrix2D,
  zIndex: number,
  context: ExtractionContext,
): RenderNode | null {
  const parsedTransform = parseSvgTransform(layer.transform);
  for (const unsupported of parsedTransform.unsupported) {
    context.diagnostics.push({
      nodeId: layer.id,
      code: "unsupported-transform",
      detail: `Ignored transform function: ${unsupported}`,
    });
  }

  const localTransform = parsedTransform.matrix;
  const worldTransform = multiply(parentWorld, localTransform);
  const blendMode = normalizeBlendMode(layer.id, layer.blendMode, context);
  const effects: readonly EffectNode[] = layer.effectStack ?? [];

  const base = {
    id: layer.id,
    parentId,
    role: layer.role,
    name: layer.name,
    localTransform,
    worldTransform,
    opacity: normalizeOpacity(layer.opacity),
    blendMode,
    hitTestable: !layer.locked,
    zIndex,
    clipPathId: layer.clipPathId,
    effects,
    legacyFilter: layer.filter,
  } as const;

  switch (layer.kind) {
    case "group":
      return extractGroup(layer, base, worldTransform, context);
    case "text":
      return extractText(layer, base, worldTransform, context);
    case "image":
      return extractImage(layer, base, worldTransform, context);
    default:
      return extractShape(layer, base, worldTransform, context);
  }
}

/**
 * The shared node fields, minus the bounds each geometry kind computes itself.
 * Derived from `RenderNodeBase` so the field list is never duplicated.
 */
type NodeBaseFields = Omit<
  RenderNodeBase,
  "localBounds" | "worldBounds" | "boundsAccuracy"
>;

function extractGroup(
  layer: GroupLayer,
  base: NodeBaseFields,
  worldTransform: Matrix2D,
  context: ExtractionContext,
): RenderNode {
  const children = extractLayers(layer.children, layer.id, worldTransform, context);

  if (layer.raw !== undefined && children.length === 0) {
    context.diagnostics.push({
      nodeId: layer.id,
      code: "preserved-raw-markup",
      detail: "Layer holds verbatim markup that the scene cannot describe; the backend must pass it through.",
    });
  }

  // A group's own bounds live in its local space: map each child's bounds by
  // that child's local transform, then union.
  let localBounds: RectF | null = null;
  let accuracy: BoundsAccuracy = "exact";
  for (const child of children) {
    if (child.localBounds !== null) {
      const mapped = transformRect(child.localTransform, child.localBounds);
      localBounds = localBounds === null ? mapped : unionRect(localBounds, mapped);
    }
    accuracy = worstAccuracy(accuracy, child.boundsAccuracy);
  }

  return {
    ...base,
    kind: "group",
    children,
    isolate: requiresIsolation(base.opacity, base.blendMode, base.clipPathId, base.effects),
    localBounds,
    worldBounds: localBounds === null ? null : transformRect(worldTransform, localBounds),
    boundsAccuracy: accuracy,
  };
}

function extractText(
  layer: TextLayer,
  base: NodeBaseFields,
  worldTransform: Matrix2D,
  context: ExtractionContext,
): RenderNode {
  const metrics = context.textMetrics?.measure({
    content: layer.content,
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    fontWeight: layer.fontWeight,
    fontStyle: layer.fontStyle ?? "normal",
    letterSpacing: layer.letterSpacing,
    wordSpacing: layer.wordSpacing,
    lineHeight: layer.lineHeight,
    direction: layer.direction,
  }) ?? null;

  if (metrics === null) {
    context.diagnostics.push({
      nodeId: layer.id,
      code: "text-measurement-unavailable",
      detail: `No font metrics for "${layer.fontFamily}" at ${layer.fontSize}px; bounds are unknown until the font is loaded.`,
    });
  }

  const localBounds = metrics === null
    ? null
    : textBoundsFromMetrics(layer.x, layer.y, layer.textAlign, metrics);

  return {
    ...base,
    kind: "text",
    elementId: layer.elementId,
    content: layer.content,
    x: layer.x,
    y: layer.y,
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    fontWeight: layer.fontWeight,
    fontStyle: layer.fontStyle ?? "normal",
    textAlign: layer.textAlign,
    textDecoration: layer.textDecoration ?? "none",
    direction: layer.direction ?? "ltr",
    fill: classifyPaint(layer.fill, SVG_DEFAULT_FILL),
    lineHeight: layer.lineHeight,
    letterSpacing: layer.letterSpacing,
    wordSpacing: layer.wordSpacing,
    baselineShift: layer.baselineShift,
    textTransform: layer.textTransform,
    writingMode: layer.writingMode,
    localBounds,
    worldBounds: localBounds === null ? null : transformRect(worldTransform, localBounds),
    boundsAccuracy: metrics === null ? "pending-measurement" : "exact",
  };
}

function extractImage(
  layer: ImageLayer,
  base: NodeBaseFields,
  worldTransform: Matrix2D,
  context: ExtractionContext,
): RenderNode {
  if (layer.href === "") {
    context.diagnostics.push({
      nodeId: layer.id,
      code: "missing-image-href",
      detail: "Image layer has no source; nothing will be painted for it.",
    });
  }
  const localBounds: RectF = {
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
  };
  return {
    ...base,
    kind: "image",
    href: layer.href,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    localBounds,
    worldBounds: transformRect(worldTransform, localBounds),
    boundsAccuracy: "exact",
  };
}

function extractShape(
  layer: ShapeLayer,
  base: NodeBaseFields,
  worldTransform: Matrix2D,
  context: ExtractionContext,
): RenderNode | null {
  const fill = classifyPaint(layer.fill, SVG_DEFAULT_FILL);
  const stroke: RenderStroke = {
    paint: classifyPaint(layer.stroke, "none"),
    width: layer.strokeWidth ?? SVG_DEFAULT_STROKE_WIDTH,
  };
  const geometry = layer.geometry;

  switch (geometry.type) {
    case "rect": {
      const localBounds: RectF = {
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
      };
      return {
        ...base,
        kind: "rect",
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
        cornerRadius: geometry.rx ?? 0,
        fill,
        stroke,
        localBounds,
        worldBounds: transformRect(worldTransform, localBounds),
        boundsAccuracy: "exact",
      };
    }
    case "ellipse": {
      const localBounds: RectF = {
        x: geometry.cx - geometry.rx,
        y: geometry.cy - geometry.ry,
        width: geometry.rx * 2,
        height: geometry.ry * 2,
      };
      return {
        ...base,
        kind: "ellipse",
        cx: geometry.cx,
        cy: geometry.cy,
        rx: geometry.rx,
        ry: geometry.ry,
        fill,
        stroke,
        localBounds,
        worldBounds: transformRect(worldTransform, localBounds),
        boundsAccuracy: "exact",
      };
    }
    case "line": {
      const localBounds: RectF = {
        x: Math.min(geometry.x1, geometry.x2),
        y: Math.min(geometry.y1, geometry.y2),
        width: Math.abs(geometry.x2 - geometry.x1),
        height: Math.abs(geometry.y2 - geometry.y1),
      };
      return {
        ...base,
        kind: "line",
        x1: geometry.x1,
        y1: geometry.y1,
        x2: geometry.x2,
        y2: geometry.y2,
        stroke,
        localBounds,
        worldBounds: transformRect(worldTransform, localBounds),
        boundsAccuracy: "exact",
      };
    }
    case "polygon": {
      const localBounds = boundsOfPoints(geometry.points);
      if (localBounds === null) {
        context.diagnostics.push({
          nodeId: layer.id,
          code: "unsupported-geometry",
          detail: "Polygon has no usable vertices.",
        });
      }
      return {
        ...base,
        kind: "polygon",
        points: geometry.points,
        fill,
        stroke,
        localBounds,
        worldBounds: localBounds === null ? null : transformRect(worldTransform, localBounds),
        boundsAccuracy: "exact",
      };
    }
    case "path": {
      /*
        Measured TIGHTLY, not conservatively.

        `conservativePathBounds` is a correct superset and it is the wrong answer
        here. Its overshoot is not a small margin: a donut's two half-arcs have
        radius w/2, so the superset reports a box twice as wide as the shape and
        offset by half a width; a rounded rectangle is inflated by its corner
        radius on all four sides. `localBounds` is what the selection chrome, the
        hit test and the C++ engine all read, so that overshoot WAS the selection
        box sitting away from its shape.

        `exactPathBounds` solves the cubic/quadratic derivative per axis and
        converts arcs to centre form, so every reported edge is touched by the
        path. See exactPathBounds.test.ts for the measured deltas.
      */
      const localBounds = exactPathBounds(geometry.d);
      if (localBounds === null) {
        context.diagnostics.push({
          nodeId: layer.id,
          code: "unsupported-geometry",
          detail: "Path data contains no usable coordinates.",
        });
      }
      return {
        ...base,
        kind: "path",
        d: geometry.d,
        fill,
        stroke,
        localBounds,
        worldBounds: localBounds === null ? null : transformRect(worldTransform, localBounds),
        boundsAccuracy: "exact",
      };
    }
    case "parametric": {
      const declaredBounds: RectF = {
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
      };
      // Reuse the existing parametric geometry providers rather than
      // reimplementing shape math (AGENTS.md: extend, never duplicate).
      const d = buildParametricPath(geometry.shapeType, declaredBounds, geometry.parameters);
      if (d === "") {
        context.diagnostics.push({
          nodeId: layer.id,
          code: "unsupported-geometry",
          detail: `No geometry provider registered for parametric shape "${geometry.shapeType}"; the layer stays selectable but paints nothing.`,
        });
        return {
          ...base,
          kind: "path",
          d,
          fill,
          stroke,
          localBounds: declaredBounds,
          worldBounds: transformRect(worldTransform, declaredBounds),
          // Honest: there is no geometry to measure, so the box is the declared
          // rect and nothing has verified it.
          boundsAccuracy: "conservative",
        };
      }

      /*
        The GENERATED geometry is measured. The declared rect is not trusted.

        This used to return the declared rect with `boundsAccuracy: "exact"` on the
        strength of a comment saying the path is built inside those bounds. That is
        an assertion, not a measurement, and it is false for several registered
        generators: a star and a badge are inscribed in a circle of radius
        min(w,h)/2 so they do not fill a non-square box, and the `cloud` generator's
        arcs bulge about 4% of the width past the right edge. Whenever the two
        disagree the selection box, the hit area and the painted shape disagree with
        it too, and nothing detected it.
      */
      const inkBounds = exactPathBounds(d);
      if (inkBounds === null) {
        context.diagnostics.push({
          nodeId: layer.id,
          code: "unsupported-geometry",
          detail: `Parametric shape "${geometry.shapeType}" generated path data with no usable coordinates.`,
        });
      } else if (!rectsMatch(inkBounds, declaredBounds)) {
        // Not an error: an inscribed shape is a legitimate design. Reported so the
        // discrepancy is visible rather than being a mystery when a handle does not
        // sit where the drag box was.
        context.diagnostics.push({
          nodeId: layer.id,
          code: "bounds-mismatch",
          detail:
            `Parametric shape "${geometry.shapeType}" paints `
            + `${formatRect(inkBounds)} inside a declared box of ${formatRect(declaredBounds)}. `
            + "Selection geometry follows the painted geometry.",
        });
      }
      const localBounds = inkBounds ?? declaredBounds;
      return {
        ...base,
        kind: "path",
        d,
        fill,
        stroke,
        localBounds,
        worldBounds: transformRect(worldTransform, localBounds),
        boundsAccuracy: inkBounds === null ? "conservative" : "exact",
      };
    }
    default:
      return null;
  }
}

function boundsOfPoints(points: readonly (readonly [number, number])[]): RectF | null {
  if (points.length === 0) {
    return null;
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (minX === Number.POSITIVE_INFINITY) {
    return null;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Whether two rects are the same to within authoring precision.
 *
 * 0.001px, matching the grid `canonicalSvg` snaps coordinates to. Anything finer
 * is not representable in the document, so reporting it as a mismatch would be
 * noise; anything coarser is a real difference between the declared box and the
 * ink.
 */
function rectsMatch(first: RectF, second: RectF): boolean {
  const tolerance = 1e-3;
  return (
    Math.abs(first.x - second.x) <= tolerance
    && Math.abs(first.y - second.y) <= tolerance
    && Math.abs(first.width - second.width) <= tolerance
    && Math.abs(first.height - second.height) <= tolerance
  );
}

function formatRect(rect: RectF): string {
  const round = (value: number): string => (Math.round(value * 1000) / 1000).toString();
  return `${round(rect.width)}x${round(rect.height)} at (${round(rect.x)}, ${round(rect.y)})`;
}

/**
 * Classify a document paint string. `url(#id)` becomes a paint-server
 * reference so the backend resolves it against the real `<defs>` instead of
 * the scene inventing gradient stops.
 */
export function classifyPaint(value: string | undefined, fallback: string): RenderPaint {
  const resolved = value ?? fallback;
  if (resolved === "none" || resolved === "") {
    return { kind: "none" };
  }
  const referenceMatch = /^url\(\s*#([^)\s]+)\s*\)$/.exec(resolved.trim());
  if (referenceMatch !== null) {
    return { kind: "paint-server", referenceId: referenceMatch[1], raw: resolved };
  }
  return { kind: "solid", color: resolved };
}

function normalizeOpacity(percent: number): number {
  if (!Number.isFinite(percent)) {
    return 1;
  }
  return Math.min(100, Math.max(0, percent)) / 100;
}

function normalizeBlendMode(
  nodeId: string,
  value: string | undefined,
  context: ExtractionContext,
): RenderBlendMode {
  if (value === undefined || value === "") {
    return "normal";
  }
  const normalized = value.trim().toLowerCase();
  if (RENDER_BLEND_MODES.has(normalized)) {
    return normalized as RenderBlendMode;
  }
  context.diagnostics.push({
    nodeId,
    code: "unknown-blend-mode",
    detail: `Blend mode "${value}" is not supported; painting with "normal".`,
  });
  return "normal";
}

/**
 * A group needs its own compositing layer whenever its alpha, blend mode, clip
 * or effects must apply to the composed result. Applying group alpha per child
 * would double-darken overlapping children.
 */
function requiresIsolation(
  opacity: number,
  blendMode: RenderBlendMode,
  clipPathId: string | undefined,
  effects: readonly EffectNode[],
): boolean {
  if (opacity < 1) return true;
  if (blendMode !== "normal") return true;
  if (clipPathId !== undefined) return true;
  return effects.some((effect) => effect.enabled);
}

const ACCURACY_RANK: Readonly<Record<BoundsAccuracy, number>> = {
  exact: 0,
  conservative: 1,
  "pending-measurement": 2,
};

function worstAccuracy(first: BoundsAccuracy, second: BoundsAccuracy): BoundsAccuracy {
  return ACCURACY_RANK[second] > ACCURACY_RANK[first] ? second : first;
}
