/**
 * renderScene — the backend-neutral display list that every Pydee renderer
 * consumes (spec §64 "Rendering phases", §83 "Renderer architecture").
 *
 * A `RenderScene` is derived from the authoritative `CreativeDocument` and
 * contains only resolved numbers, matrices and paint descriptions. It holds no
 * Skia handles, no DOM nodes and no React state, so the same scene can be sent
 * to the SVG backend, a Skia/WASM backend, a thumbnail target or an export
 * target without reinterpreting the document (spec §63).
 *
 * The scene is a TREE, not a flat list. Group nodes are preserved because group
 * opacity, blend mode, clipping and effects must composite through an isolated
 * layer — pre-multiplying a group's alpha into each child renders overlapping
 * children incorrectly (spec §12 "correct nested opacity behavior").
 *
 * One responsibility per file: render scene data types.
 */

import type { DataRole, EffectNode } from "../types/documentModel";
import type { Matrix2D, RectF } from "./matrix2d";

/**
 * Compositing modes the scene may request. Names match the CSS
 * `mix-blend-mode` keywords used in the Canonical_SVG, which map 1:1 onto
 * Skia's `SkBlendMode` set (spec §11).
 */
export type RenderBlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity"
  | "plus-lighter";

export const RENDER_BLEND_MODES: ReadonlySet<string> = new Set<RenderBlendMode>([
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
]);

/** No paint at all — the SVG `none` keyword. */
export interface NoPaint {
  readonly kind: "none";
}

/** A literal colour. The string is preserved verbatim from the document. */
export interface SolidPaint {
  readonly kind: "solid";
  readonly color: string;
}

/**
 * A reference to a paint server defined in the artboard `<defs>` (for example
 * `url(#grad-1)`). The scene deliberately does NOT invent gradient stops: the
 * backend resolves the reference against the real `defs`, so an unresolvable
 * reference is reported as a diagnostic instead of being silently painted.
 */
export interface PaintServerReference {
  readonly kind: "paint-server";
  readonly referenceId: string;
  readonly raw: string;
}

export type RenderPaint = NoPaint | SolidPaint | PaintServerReference;

/** Stroke description; `paint.kind === "none"` means no stroke is drawn. */
export interface RenderStroke {
  readonly paint: RenderPaint;
  readonly width: number;
}

/** How much to trust a node's bounds. Never silently guess (AGENTS.md). */
export type BoundsAccuracy =
  /** Bounds are mathematically exact for this geometry. */
  | "exact"
  /**
   * A correct superset — used for `<path>`, whose true curve extents need a
   * path evaluator. Safe for culling and selection; the Skia backend replaces
   * these with `SkPath` bounds.
   */
  | "conservative"
  /**
   * Bounds require real font metrics that were not available. Consumers must
   * treat these as unknown rather than approximate (spec §80, §81).
   */
  | "pending-measurement";

/** Fields shared by every node in the scene. */
export interface RenderNodeBase {
  /** Stable `data-layer-id` from the document. Never a pointer identity. */
  readonly id: string;
  readonly parentId: string | null;
  readonly role: DataRole;
  readonly name: string;
  /** This node's own transform, relative to its parent. */
  readonly localTransform: Matrix2D;
  /** Full document-space transform, including every ancestor. */
  readonly worldTransform: Matrix2D;
  /** This node's own alpha in 0..1. NOT pre-multiplied with ancestors. */
  readonly opacity: number;
  readonly blendMode: RenderBlendMode;
  /** False for locked or invisible-to-input layers (spec §70). */
  readonly hitTestable: boolean;
  /** Untransformed geometry bounds, or null when unknown. */
  readonly localBounds: RectF | null;
  /** `localBounds` mapped through `worldTransform`, or null when unknown. */
  readonly worldBounds: RectF | null;
  readonly boundsAccuracy: BoundsAccuracy;
  /** Paint order within the parent; 0 is painted first (furthest back). */
  readonly zIndex: number;
  /** Id of a shape layer acting as a clip path, when present. */
  readonly clipPathId?: string;
  /** Non-destructive effect stack, passed through for the backend to apply. */
  readonly effects: readonly EffectNode[];
  /** Legacy CSS `filter` string preserved from the document. */
  readonly legacyFilter?: string;
}

export interface RenderRectNode extends RenderNodeBase {
  readonly kind: "rect";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Corner radius; 0 means a sharp rectangle. */
  readonly cornerRadius: number;
  readonly fill: RenderPaint;
  readonly stroke: RenderStroke;
}

export interface RenderEllipseNode extends RenderNodeBase {
  readonly kind: "ellipse";
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly fill: RenderPaint;
  readonly stroke: RenderStroke;
}

export interface RenderLineNode extends RenderNodeBase {
  readonly kind: "line";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly stroke: RenderStroke;
}

export interface RenderPolygonNode extends RenderNodeBase {
  readonly kind: "polygon";
  readonly points: readonly (readonly [number, number])[];
  readonly fill: RenderPaint;
  readonly stroke: RenderStroke;
}

export interface RenderPathNode extends RenderNodeBase {
  readonly kind: "path";
  /** SVG path data, passed through verbatim. */
  readonly d: string;
  readonly fill: RenderPaint;
  readonly stroke: RenderStroke;
}

/** Text is always real text — never path-traced geometry (AGENTS.md, Req 6.8). */
export interface RenderTextNode extends RenderNodeBase {
  readonly kind: "text";
  readonly elementId: string;
  readonly content: string;
  readonly x: number;
  readonly y: number;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: "normal" | "bold";
  readonly fontStyle: "normal" | "italic";
  readonly textAlign: "left" | "center" | "right";
  readonly textDecoration: "none" | "underline" | "line-through";
  readonly direction: "ltr" | "rtl";
  readonly fill: RenderPaint;
  readonly lineHeight?: number;
  readonly letterSpacing?: number;
  readonly wordSpacing?: number;
  readonly baselineShift?: number;
  readonly textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  readonly writingMode?: "horizontal-tb" | "vertical-rl" | "vertical-lr";
}

export interface RenderImageNode extends RenderNodeBase {
  readonly kind: "image";
  /** Asset reference (data URI or URL). Decoding belongs to the asset manager. */
  readonly href: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RenderGroupNode extends RenderNodeBase {
  readonly kind: "group";
  readonly children: readonly RenderNode[];
  /**
   * True when the group must be composited through an offscreen layer because
   * its alpha, blend mode, clip or effects would otherwise be applied per
   * child and produce the wrong result where children overlap.
   */
  readonly isolate: boolean;
}

export type RenderLeafNode =
  | RenderRectNode
  | RenderEllipseNode
  | RenderLineNode
  | RenderPolygonNode
  | RenderPathNode
  | RenderTextNode
  | RenderImageNode;

export type RenderNode = RenderLeafNode | RenderGroupNode;

/** Machine-readable reason a node could not be fully represented. */
export type SceneDiagnosticCode =
  | "unsupported-transform"
  | "unknown-blend-mode"
  | "text-measurement-unavailable"
  | "unsupported-geometry"
  | "missing-image-href"
  | "preserved-raw-markup"
  /**
   * A shape's painted geometry does not fill the box the document declares for it.
   *
   * Not an error — an inscribed star is a legitimate design — but it means the
   * declared rect and the ink are different facts, and selection follows the ink.
   * Reported so that a handle not sitting on the drag box is explainable.
   */
  | "bounds-mismatch"
  /** The Skia engine build does not yet render this node kind. */
  | "engine-unsupported-node"
  /** The paint could not be resolved to a colour the engine understands. */
  | "engine-unsupported-paint";

export interface SceneDiagnostic {
  readonly nodeId: string;
  readonly code: SceneDiagnosticCode;
  readonly detail: string;
}

export interface RenderScene {
  readonly artboardId: string;
  readonly width: number;
  readonly height: number;
  /** Root nodes in paint order: index 0 is painted first. */
  readonly roots: readonly RenderNode[];
  /**
   * Monotonic revision of the document this scene was built from. The renderer
   * uses it as a cache key; it is not a timestamp.
   */
  readonly revision: number;
  /** Every fallback or unknown construct, with a reason. Never silent. */
  readonly diagnostics: readonly SceneDiagnostic[];
}

/** Type guard for group nodes. */
export function isGroupNode(node: RenderNode): node is RenderGroupNode {
  return node.kind === "group";
}

/**
 * Depth-first walk over every node in paint order (parents before children),
 * used by culling, hit-testing and diagnostics.
 */
export function* walkScene(scene: RenderScene): Generator<RenderNode> {
  yield* walkNodes(scene.roots);
}

function* walkNodes(nodes: readonly RenderNode[]): Generator<RenderNode> {
  for (const node of nodes) {
    yield node;
    if (isGroupNode(node)) {
      yield* walkNodes(node.children);
    }
  }
}

/** Every drawable leaf in paint order, back to front. */
export function flattenLeaves(scene: RenderScene): RenderLeafNode[] {
  const leaves: RenderLeafNode[] = [];
  for (const node of walkScene(scene)) {
    if (!isGroupNode(node)) {
      leaves.push(node);
    }
  }
  return leaves;
}

/** Every distinct font family the scene's text nodes request. */
export function collectTextFamilies(scene: RenderScene): string[] {
  const families = new Set<string>();
  for (const node of walkScene(scene)) {
    if (node.kind === "text" && node.fontFamily.trim() !== "") {
      families.add(node.fontFamily.trim());
    }
  }
  return [...families].sort();
}

/** Look up a node anywhere in the tree by its stable document id. */
export function findSceneNode(scene: RenderScene, nodeId: string): RenderNode | null {
  for (const node of walkScene(scene)) {
    if (node.id === nodeId) {
      return node;
    }
  }
  return null;
}
