/**
 * viewportMath — pure, side-effect-free viewport math for the Editor_Canvas
 * pan/zoom interaction (task 5.2).
 *
 * These functions are intentionally pure so they are trivially unit- and
 * property-testable (supports Property 12 numeric clamping and Property 27 zoom
 * percentage formatting). They operate exclusively on the `Viewport`
 * (`{ zoom, panX, panY }`) and never touch the Document_Model — pan/zoom mutate
 * only the viewport transform and emit no Command (Req 1.3).
 *
 * Coordinate model: the viewport transform applied to the canvas content is
 *   translate(panX, panY) scale(zoom)
 * so a content point `m` maps to a stage point `s` by `s = m * zoom + pan`, and
 * the inverse is `m = (s - pan) / zoom`. Cursor-anchored zoom keeps the content
 * point currently under the cursor fixed across the scale change (Req 1.4).
 *
 * One responsibility per file: viewport arithmetic only.
 */

import type { Viewport } from "./types/documentModel";

/** Inclusive zoom bounds: 10%..6400% (Req 1.4, 1.5). */
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 64.0;

/**
 * Clamp a zoom ratio to the inclusive `[ZOOM_MIN, ZOOM_MAX]` range. Out-of-range
 * gestures clamp to the nearest bound (Req 1.4, 1.5). Non-finite input falls
 * back to `ZOOM_MIN` so the viewport can never enter an invalid state.
 */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return ZOOM_MIN;
  }
  if (zoom < ZOOM_MIN) {
    return ZOOM_MIN;
  }
  if (zoom > ZOOM_MAX) {
    return ZOOM_MAX;
  }
  return zoom;
}

/**
 * Whether a requested zoom ratio falls outside the inclusive zoom range, i.e.
 * whether {@link clampZoom} would adjust it. Callers use this to surface an
 * "adjusted to bound" indication (Req 1.5, Property 12).
 */
export function isZoomOutOfRange(zoom: number): boolean {
  return !Number.isFinite(zoom) || zoom < ZOOM_MIN || zoom > ZOOM_MAX;
}

/**
 * Format a zoom ratio as the integer percentage shown in the zoom indicator:
 * `Math.round(zoom * 100)` (Req 1.6, Property 27).
 */
export function zoomPercent(zoom: number): number {
  return Math.round(zoom * 100);
}

/**
 * Cursor-anchored zoom (Req 1.4). Returns a new `Viewport` whose zoom is
 * `clampZoom(nextZoom)` and whose pan is adjusted so the content point under
 * `(cursorX, cursorY)` — both measured in stage pixels relative to the viewport
 * transform origin — stays fixed on screen.
 *
 * Pure: never mutates its input. When the current zoom is non-finite or zero
 * (which the clamped state never produces) the cursor is treated as the anchor
 * directly so the result is still well-defined.
 */
export function zoomAtPoint(
  viewport: Viewport,
  nextZoom: number,
  cursorX: number,
  cursorY: number,
): Viewport {
  const zoom = clampZoom(nextZoom);
  const currentZoom = viewport.zoom;
  if (!Number.isFinite(currentZoom) || currentZoom === 0) {
    return { zoom, panX: cursorX, panY: cursorY };
  }

  // Content-space point currently under the cursor.
  const modelX = (cursorX - viewport.panX) / currentZoom;
  const modelY = (cursorY - viewport.panY) / currentZoom;

  // Re-anchor pan so that same content point remains under the cursor.
  return {
    zoom,
    panX: cursorX - modelX * zoom,
    panY: cursorY - modelY * zoom,
  };
}

/**
 * Multiply the current zoom by `factor`, keeping the content point under
 * `(cursorX, cursorY)` fixed (cursor-anchored). The factor is applied before
 * clamping so the result still clamps to the nearest bound (Req 1.4, 1.5).
 */
export function zoomByFactor(
  viewport: Viewport,
  factor: number,
  cursorX: number,
  cursorY: number,
): Viewport {
  return zoomAtPoint(viewport, viewport.zoom * factor, cursorX, cursorY);
}

/**
 * Translate the view by a stage-pixel delta, 1:1 at the current zoom (Req 1.3
 * pan gesture). Pure: returns a new `Viewport` with the same zoom.
 */
export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { zoom: viewport.zoom, panX: viewport.panX + dx, panY: viewport.panY + dy };
}
