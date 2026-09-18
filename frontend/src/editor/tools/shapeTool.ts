/**
 * shapeTool — pure builders that create shape Layers for the Editor_Canvas
 * shape tools (rect / ellipse / line / polygon), task 7.4.
 *
 * Everything here is a pure, side-effect-free function over plain inputs so it
 * is trivially unit- and property-testable. The builders never touch the DOM,
 * the Document_Model, or any shared editor state: the caller (the canvas shape
 * tool wired in task 14.1) supplies the set of `data-layer-id`s already present
 * in the document and the active Brand_Kit / Accent_Color, and dispatches the
 * returned Command through the history system.
 *
 * Design contract (design.md -> "Tools State Machine" -> Shapes; Req 5.1–5.7):
 *  - Add exactly one editable element to the `shapes` group with a
 *    `data-layer-id` unique within the document and a non-empty `data-field`
 *    (Req 5.1).
 *  - Closed shapes (rect/ellipse/polygon) default their fill to the Brand_Kit
 *    `primaryColor` when a Brand_Kit is active, otherwise the Accent_Color
 *    (Req 5.2). Lines default the same color source to their stroke (Req 5.3).
 *  - Exactly one layer + one Command per creation (Req 5.4, 5.5); the
 *    Layers_Panel entry is a natural consequence of adding the layer.
 *  - Every coordinate is snapped to the nearest 0.5px increment (Req 5.6).
 *  - Degenerate shapes (0px width or 0px height area; a zero-length line; a
 *    polygon with fewer than 3 vertices) are discarded: the builder returns
 *    `null` and no Command is produced, so the dispatcher records nothing
 *    (Req 5.7).
 *
 * One responsibility per file: build shape Layers + wrap them in a create
 * Command. It does not mutate documents (that is `createLayerCommand`'s job).
 */

import type { BrandKit } from "../../types";
import { createLayerCommand } from "../commands/createLayerCommand";
import { mintId } from "../commands/helpers";
import type { Command, ShapeGeometry, ShapeLayer } from "../types/documentModel";

/**
 * Accent_Color fallback used when no Brand_Kit is active and the caller does
 * not supply an explicit Accent_Color. Mirrors the dark-theme `--accent` token
 * in `theme.css` (Req 5.2, 5.3, 13.4) so a shape is never created with an empty
 * paint.
 */
export const DEFAULT_ACCENT_COLOR = "#5b8cff";

/** Default stroke width applied to a freshly created line (px). */
export const DEFAULT_LINE_STROKE_WIDTH = 1;

/** A polygon must have at least this many vertices to be a valid shape (Req 5.1). */
export const MIN_POLYGON_VERTICES = 3;

// ---------------------------------------------------------------------------
// Input shapes (model-space coordinates, before snapping)
// ---------------------------------------------------------------------------

export interface RectInput {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  rx?: number;
}

export interface EllipseInput {
  kind: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface LineInput {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PolygonInput {
  kind: "polygon";
  points: ReadonlyArray<readonly [number, number]>;
}

export interface PathInput {
  kind: "path";
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  transform?: string;
}

export interface ParametricInput {
  kind: "parametric";
  shapeType: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parameters: Record<string, number | boolean | string>;
}

export type ShapeInput = RectInput | EllipseInput | LineInput | PolygonInput | PathInput | ParametricInput;

/**
 * Context the caller supplies for a creation. `existingIds` is the set of
 * `data-layer-id`s already present in the document (passed in so this stays a
 * pure function rather than reaching into shared state). `brandKit` is the
 * active Brand_Kit when one exists; `accentColor` overrides the built-in
 * Accent_Color fallback when no Brand_Kit is active.
 */
export interface ShapeToolContext {
  existingIds: Iterable<string>;
  brandKit?: BrandKit | null;
  accentColor?: string;
}

// ---------------------------------------------------------------------------
// Coordinate snapping (Req 5.6)
// ---------------------------------------------------------------------------

/** Snap a single coordinate to the nearest 0.5px increment (Req 5.6). */
export function snapHalf(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 2) / 2;
}

// ---------------------------------------------------------------------------
// Default paint resolution (Req 5.2, 5.3)
// ---------------------------------------------------------------------------

/**
 * Resolve the default paint color: the Brand_Kit `primaryColor` when a
 * Brand_Kit is active (Req 5.2/5.3 WHERE clause), otherwise the supplied
 * Accent_Color, otherwise the built-in Accent_Color fallback.
 */
export function resolveDefaultColor(ctx: ShapeToolContext): string {
  const primary = ctx.brandKit?.primaryColor;
  if (typeof primary === "string" && primary.trim() !== "") {
    return primary;
  }
  const accent = ctx.accentColor;
  if (typeof accent === "string" && accent.trim() !== "") {
    return accent;
  }
  return DEFAULT_ACCENT_COLOR;
}

// ---------------------------------------------------------------------------
// Unique id minting (Req 5.1)
// ---------------------------------------------------------------------------

/**
 * Mint a `data-layer-id` guaranteed to be absent from `existingIds`. Uses the
 * shared monotonic `mintId` and re-rolls on the (vanishingly unlikely)
 * collision so the result is unique within the current document.
 */
function mintUniqueId(existingIds: Iterable<string>): string {
  const taken = new Set(existingIds);
  let candidate = mintId("shape");
  while (taken.has(candidate)) {
    candidate = mintId("shape");
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// Geometry construction + degeneracy checks (Req 5.6, 5.7)
// ---------------------------------------------------------------------------

interface ShapeBlueprint {
  geometry: ShapeGeometry;
  name: string;
  /** Closed shapes paint via fill; lines paint via stroke (Req 5.2, 5.3). */
  closed: boolean;
}

/**
 * Snap an input's coordinates and build its geometry, or return `null` when the
 * result is degenerate (Req 5.6, 5.7). A closed shape is degenerate when its
 * snapped width or height is 0; a line is degenerate when its snapped endpoints
 * coincide (zero length); a polygon is degenerate when it has fewer than 3
 * vertices or its snapped bounding box has 0 width or 0 height.
 */
function buildBlueprint(input: ShapeInput): ShapeBlueprint | null {
  switch (input.kind) {
    case "rect": {
      const x = snapHalf(input.x);
      const y = snapHalf(input.y);
      const width = snapHalf(input.width);
      const height = snapHalf(input.height);
      if (width === 0 || height === 0) {
        return null;
      }
      const rx = input.rx === undefined ? undefined : snapHalf(input.rx);
      const geometry: ShapeGeometry =
        rx === undefined
          ? { type: "rect", x, y, width, height }
          : { type: "rect", x, y, width, height, rx };
      return { geometry, name: "Rectangle", closed: true };
    }
    case "ellipse": {
      const cx = snapHalf(input.cx);
      const cy = snapHalf(input.cy);
      const rx = snapHalf(input.rx);
      const ry = snapHalf(input.ry);
      if (rx === 0 || ry === 0) {
        return null;
      }
      return { geometry: { type: "ellipse", cx, cy, rx, ry }, name: "Ellipse", closed: true };
    }
    case "line": {
      const x1 = snapHalf(input.x1);
      const y1 = snapHalf(input.y1);
      const x2 = snapHalf(input.x2);
      const y2 = snapHalf(input.y2);
      if (x1 === x2 && y1 === y2) {
        return null;
      }
      return { geometry: { type: "line", x1, y1, x2, y2 }, name: "Line", closed: false };
    }
    case "polygon": {
      if (input.points.length < MIN_POLYGON_VERTICES) {
        return null;
      }
      const points: Array<[number, number]> = input.points.map(
        ([px, py]) => [snapHalf(px), snapHalf(py)] as [number, number],
      );
      const xs = points.map(([px]) => px);
      const ys = points.map(([, py]) => py);
      const width = Math.max(...xs) - Math.min(...xs);
      const height = Math.max(...ys) - Math.min(...ys);
      if (width === 0 || height === 0) {
        return null;
      }
      return { geometry: { type: "polygon", points }, name: "Polygon", closed: true };
    }
    case "path": {
      if (input.d.trim() === "") {
        return null;
      }
      // Asset paths that explicitly opt out of fill are open strokes (arrows,
      // connectors, and zigzags); other paths remain closed filled shapes.
      return { geometry: { type: "path", d: input.d }, name: "Path", closed: input.fill !== "none" };
    }
    case "parametric": {
      const x = snapHalf(input.x);
      const y = snapHalf(input.y);
      const width = snapHalf(input.width);
      const height = snapHalf(input.height);
      if (width === 0 || height === 0) {
        return null;
      }
      return {
        geometry: { type: "parametric", shapeType: input.shapeType, x, y, width, height, parameters: input.parameters },
        name: input.shapeType.charAt(0).toUpperCase() + input.shapeType.slice(1),
        closed: true, // we assume all parametric shapes are closed currently
      };
    }
    default: {
      // Exhaustiveness guard: every ShapeInput kind is handled above.
      const exhaustive: never = input;
      return exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// Public builders
// ---------------------------------------------------------------------------

/**
 * Build the {@link ShapeLayer} for `input`, or `null` when the shape is
 * degenerate (Req 5.7). The returned layer is added to the `shapes` group, has
 * a `data-layer-id` unique within the document and a non-empty `data-field`
 * (Req 5.1), and is painted with the default color from {@link
 * resolveDefaultColor}: as fill for closed shapes (Req 5.2) and as stroke for
 * lines (Req 5.3).
 */
export function buildShapeLayer(input: ShapeInput, ctx: ShapeToolContext): ShapeLayer | null {
  const blueprint = buildBlueprint(input);
  if (blueprint === null) {
    return null;
  }

  const color = resolveDefaultColor(ctx);
  const id = mintUniqueId(ctx.existingIds);

  const base: any = {
    id,
    role: "shapes" as const,
    name: blueprint.name,
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: input.kind,
    field: `shape-${input.kind}`,
    geometry: blueprint.geometry,
  };

  if (input.kind === "path") {
    if (input.transform) base.transform = input.transform;
    if (input.fill) base.fill = input.fill;
    if (input.stroke) base.stroke = input.stroke;
    if (input.strokeWidth) base.strokeWidth = input.strokeWidth;
    if (input.fill === "none" && base.stroke === undefined) {
      base.stroke = color;
      base.strokeWidth = input.strokeWidth ?? DEFAULT_LINE_STROKE_WIDTH;
    }
  }

  if (base.fill === undefined && base.stroke === undefined) {
    if (blueprint.closed) {
      base.fill = color;
    } else {
      base.stroke = color;
      base.strokeWidth = DEFAULT_LINE_STROKE_WIDTH;
    }
  }

  return base as ShapeLayer;
}

/**
 * Build a single create-layer Command for `input`, or `null` when the shape is
 * degenerate so the dispatcher records nothing (Req 5.4, 5.5, 5.7). On success
 * exactly one layer is inserted into the `shapes` group on top of the existing
 * layers, producing exactly one Layers_Panel entry as a natural consequence.
 */
export function createShapeCommand(input: ShapeInput, ctx: ShapeToolContext): Command | null {
  const layer = buildShapeLayer(input, ctx);
  if (layer === null) {
    return null;
  }
  return createLayerCommand(layer);
}
