export interface BrandKit {
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  logoUrl: string;
  tone: "bold" | "minimal" | "festive" | "corporate";
}

export interface TargetSize {
  width: number;
  height: number;
  unit: "px" | "mm";
}

export interface DesignRequest {
  prompt: string;
  brandKit: BrandKit;
  targetSize: TargetSize;
  outputFormat: "svg" | "pdf" | "png";
  sessionHistory: string[];
}

export interface LayoutBox {
  id: string;
  role: "headline" | "subheading" | "body" | "cta" | "logo" | "image" | "background" | "shape";
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  content?: string;
  imageUrl?: string;
}

export interface LayoutTree {
  canvasWidth: number;
  canvasHeight: number;
  boxes: LayoutBox[];
}

export interface SVGLayer {
  id: string;
  role: LayoutBox["role"];
  svgElement: string;
  isEditable: boolean;
}

export interface PrintMeta {
  bleed: number;
  cmykSafe: boolean;
  trimMarks: boolean;
}

export interface DesignOutput {
  requestId: string;
  svgLayers: SVGLayer[];
  composedSVG: string;
  backgroundImageUrl?: string;
  printMeta: PrintMeta;
}

// --- Creative Studio Document_Model (additive, frontend-only) ---
// Re-exported from the single-responsibility module. The wire-contract types
// above (DesignOutput, SVGLayer, BrandKit, PrintMeta, TargetSize) are reused
// unchanged by the Document_Model and are intentionally NOT redefined there.
export type {
  DataRole,
  BaseLayer,
  ShapeLayer,
  TextLayer,
  ImageLayer,
  GroupLayer,
  DocumentLayer,
  ShapeGeometry,
  Artboard,
  Page,
  CreativeDocument,
  SelectionSet,
  Viewport,
  ToolId,
  Theme,
  SaveStatus,
  Command,
  HistoryStack,
} from "../editor/types/documentModel";

export { LOCKED_ROLES } from "../editor/types/documentModel";
