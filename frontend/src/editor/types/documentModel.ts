/**
 * Document_Model types for Creative Studio (v1).
 *
 * This is an additive, frontend-only structured representation of the
 * Canonical_SVG (<g data-role> groups defined in AGENTS.md). It is parsed
 * from DesignOutput.composedSVG and serialized back without flattening the
 * layer structure. The existing wire-contract types (DesignOutput,
 * SVGLayer, BrandKit, PrintMeta, TargetSize) are reused unchanged.
 *
 * One responsibility per file: this module only declares types.
 */

import type { PrintMeta } from "../../types";

// data-role taxonomy from AGENTS.md Canonical_SVG ?" never changed.
export type DataRole =
  | "background"
  | "shapes"
  | "image-slots"
  | "body"
  | "cta"
  | "headline"
  | "logo"
  | "print-marks";

// logo and print-marks are always non-editable / locked (Req 3.8, AGENTS.md editor rules).
export const LOCKED_ROLES: ReadonlySet<DataRole> = new Set<DataRole>([
  "logo",
  "print-marks",
]);

export type EffectType = 
  // Blur
  | "blur"
  | "motion-blur"
  | "radial-blur"
  // Shadow / Light
  | "drop-shadow"
  | "inner-shadow"
  | "glow"
  // Color
  | "brightness"
  | "contrast"
  | "saturate"
  | "grayscale"
  | "sepia"
  | "hue-rotate"
  | "invert"
  | "temperature"
  | "tint"
  | "vibrance"
  | "color-overlay"
  // Texture
  | "noise"
  | "grain"
  | "halftone"
  | "dust"
  // Distort
  | "glitch"
  | "warp"
  // AI/Preset
  | "preset";

export interface EffectNode {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, number | string | boolean>;
}

// --- Layer model (discriminated union) ---

export interface BaseLayer {
  id: string; // data-layer-id, unique within the document
  role: DataRole; // data-role of the owning top-level group
  name: string; // data-name (display), 1..100 chars (Req 3.4, 3.10)
  editable: boolean; // data-editable === "true"
  locked: boolean; // pointer-events="none" OR role in LOCKED_ROLES (Req 3.6, 3.8)
  visible: boolean; // display !== "none" && visibility !== "hidden" (Req 3.5)
  opacity: number; // integer 0..100 percent (Req 3.7, 3.11)
  /** Optional transform applied to the layer (e.g. "rotate(12 100 200)"). */
  transform?: string;
  // Preserved verbatim outerHTML for layers that must round-trip byte-stable
  raw?: string;
  // Legacy CSS filter value (e.g. "drop-shadow(...)" / "blur(4px)") applied
  filter?: string;
  // The state-of-the-art non-destructive effect stack.
  effectStack?: EffectNode[];
  // Optional CSS mix-blend-mode applied to the layer.
  blendMode?: string;
  // Optional ID of a shape layer used as a clipping mask.
  clipPathId?: string;
}

export interface ShapeLayer extends BaseLayer {
  kind: "rect" | "ellipse" | "line" | "polygon" | "path";
  field: string; // data-field (Req 5.1, 8.2)
  elementId?: string; // data-element-id, preserved when present (re-attached on serialize)
  geometry: ShapeGeometry; // snapped to 0.5px grid (Req 5.6)
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface TextLayer extends BaseLayer {
  kind: "text";
  elementId: string; // data-element-id (Req 6.1)
  field: string; // data-field (Req 6.1)
  content: string; // 1..500 chars (Req 6.1, 6.3)
  x: number;
  y: number;
  fontFamily: string;
  fontSize: number; // clamped 12..200 (Req 6.5, 6.6)
  fontWeight: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline" | "line-through";
  textAlign: "left" | "center" | "right";
  /** Absolute line advance in document pixels; omitted uses the font default. */
  lineHeight?: number;
  /** Additional tracking in document pixels. */
  letterSpacing?: number;
  /** Additional spacing between words in document pixels. */
  wordSpacing?: number;
  /** Vertical glyph offset in document pixels. */
  baselineShift?: number;
  /** Semantic case treatment without mutating the stored text content. */
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  /** Paragraph direction for mixed and right-to-left text. */
  direction?: "ltr" | "rtl";
  /** Horizontal or vertical SVG writing mode. */
  writingMode?: "horizontal-tb" | "vertical-rl" | "vertical-lr";
  fill: string;
}

export interface ImageLayer extends BaseLayer {
  kind: "image";
  href: string; // inline data URI ?" no external request (Req 7.2)
  field?: string; // data-field, preserved when present (re-attached on serialize)
  elementId?: string; // data-element-id, preserved when present
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GroupLayer extends BaseLayer {
  kind: "group";
  children: DocumentLayer[]; // nested groups preserve member roles + z-order (Req 3.9)
}

export type DocumentLayer = ShapeLayer | TextLayer | ImageLayer | GroupLayer;

export type ShapeGeometry =
  | { type: "rect"; x: number; y: number; width: number; height: number; rx?: number }
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { type: "line"; x1: number; y1: number; x2: number; y2: number }
  | { type: "polygon"; points: Array<[number, number]> } // >= 3 vertices (Req 5.1)
  | { type: "path"; d: string } // >= 2 anchors (Req 8.2)
  | { type: "parametric"; shapeType: string; x: number; y: number; width: number; height: number; parameters: Record<string, number | boolean | string> };

// --- Document, pages, and artboards ---

export interface Artboard {
  id: string;
  width: number; // px (Req 9.7, 10.5, 12.2)
  height: number; // px
  printMeta: PrintMeta; // reused from types/index.ts (Req 12.3)
  layers: DocumentLayer[]; // ordered document order: index 0 = bottom z, last = top
  defs: string; // <defs> (embedded fonts) preserved verbatim
  rootAttributes: Record<string, string>; // data-printrocket, data-version, data-mode, viewBox
}

export interface Page {
  id: string;
  name: string;
  artboards: Artboard[]; // >= 1 (Req 11.1)
}

export interface CreativeDocument {
  schemaVersion: 1;
  name: string; // 1..255 chars (Req 11.1)
  pages: Page[]; // 1..100 (Req 11.1)
  activePageId: string;
  activeArtboardId: string;
}

// --- Selection and viewport ---

export interface SelectionSet {
  layerIds: string[]; // 0..n; replace/add/remove per Req 1.7?"1.11
  primaryLayerId?: string; // Last-clicked layer (drives PropertiesPanel in multi-selection)
}

export interface Viewport {
  zoom: number; // 0.10..64.0 +' 10%..6400% (Req 1.4, 1.5)
  panX: number;
  panY: number;
}

export interface BoxSnapshot {
  kind: "box";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GeometrySnapshot {
  kind: "geometry";
  geometry: ShapeGeometry;
}

export interface TransformSnapshot {
  kind: "transform";
  transform?: string;
}

/**
 * What a resize gesture can change.
 *
 * `box` for image/text layers, `geometry` for shapes whose numbers can be
 * rewritten exactly, and `transform` for the kinds that cannot — path data, whose
 * elliptical arcs need radius and axis-rotation mapping, plus text and groups,
 * which have no size field of their own. See `geometry/resizeGeometry.ts` for why
 * an approximation is refused rather than guessed.
 */
export type ResizeSnapshot = BoxSnapshot | GeometrySnapshot | TransformSnapshot;
export type RotateSnapshot = TransformSnapshot;

export type ToolId = string;

export type Theme = "dark" | "light";
export type SaveStatus = "idle" | "saving" | "saved" | "save-failed";

// --- Command and History interfaces ---

export interface Command {
  readonly type: string; // e.g. "translate", "text-edit", "create-shape"
  readonly label: string; // human-readable, for history/inspector display
  apply(doc: CreativeDocument): CreativeDocument; // pure: returns next immutable doc
  undo(doc: CreativeDocument): CreativeDocument; // pure: reverts apply exactly
}

export interface HistoryStack {
  past: Command[]; // applied commands, oldest first
  future: Command[]; // undone commands available for redo
  readonly cap: 50; // Req 4.7, 11.6
}

// Helper to retrieve the active artboard from the document hierarchy
export function getActiveArtboard(doc: CreativeDocument | null): Artboard | null {
  if (!doc) return null;
  const page = doc.pages.find((p) => p.id === doc.activePageId) || doc.pages[0];
  if (!page) return null;
  return page.artboards.find((a) => a.id === doc.activeArtboardId) || page.artboards[0] || null;
}
