/**
 * Renderer2D — the backend-neutral drawing interface for Pydee (spec §7).
 *
 * This is the contract that decouples the editor from its graphics backend.
 * Implementations planned:
 *
 *   SVG DOM backend      → current shipping renderer
 *   Skia / WASM backend  → C++ engine via our own bindings
 *   DisplayListRecorder  → deterministic recording for tests and parity
 *
 * Deliberate constraints:
 *  - No Skia type ever appears here. `SkPaint`, `SkPath` and friends must not
 *    leak across this boundary or into TypeScript (spec §7, §45).
 *  - No DOM type appears here either, so the same interface is valid for a
 *    native target, a thumbnail target and an export target (spec §63).
 *  - Calls describe *what* to paint, never *how* to cache it. Caching and
 *    invalidation belong to the implementation.
 *
 * One responsibility per file: the renderer interface.
 */

import type { Matrix2D, RectF } from "./matrix2d";
import type {
  RenderBlendMode,
  RenderEllipseNode,
  RenderGroupNode,
  RenderImageNode,
  RenderLineNode,
  RenderPathNode,
  RenderPolygonNode,
  RenderRectNode,
  RenderTextNode,
} from "./renderScene";

/** Per-frame context handed to the backend at `beginFrame`. */
export interface FrameInfo {
  /** Artboard size in document units. */
  readonly width: number;
  readonly height: number;
  /** Viewport transform: document space → surface space. */
  readonly viewTransform: Matrix2D;
  /**
   * Backing-store scale (`devicePixelRatio`) so the backend can allocate a
   * crisp surface on high-DPI displays (spec §91).
   */
  readonly pixelRatio: number;
  /**
   * Region of document space that must be repainted. When omitted the whole
   * frame is repainted (spec §30 "Render invalidation").
   */
  readonly dirtyRect?: RectF;
}

/** Clip shapes a scene may request. */
export type ClipSpec =
  | { readonly kind: "rect"; readonly rect: RectF; readonly cornerRadius?: number }
  | { readonly kind: "path"; readonly d: string };

/**
 * Immediate-mode drawing surface. Nodes are passed whole so a backend can use
 * every resolved field (paint, effects, blend mode) without the traversal layer
 * having to flatten them into positional arguments.
 */
export interface Renderer2D {
  beginFrame(frame: FrameInfo): void;
  endFrame(): void;

  /** Push transform + clip + alpha state. */
  save(): void;
  restore(): void;

  /** Replace the current transform (document space → surface space). */
  setTransform(matrix: Matrix2D): void;
  /** Multiply the current transform by `matrix`. */
  concatTransform(matrix: Matrix2D): void;

  setClip(clip: ClipSpec): void;
  clear(color: string): void;

  drawRect(node: RenderRectNode): void;
  drawEllipse(node: RenderEllipseNode): void;
  drawLine(node: RenderLineNode): void;
  drawPolygon(node: RenderPolygonNode): void;
  drawPath(node: RenderPathNode): void;
  drawText(node: RenderTextNode): void;
  drawImage(node: RenderImageNode): void;

  /**
   * Begin an isolated compositing layer for a group whose alpha, blend mode,
   * clip or effects must apply to the composed result rather than per child.
   * Must be paired with `endLayer`.
   */
  beginLayer(node: RenderGroupNode, alpha: number, blendMode: RenderBlendMode): void;
  endLayer(): void;
}
