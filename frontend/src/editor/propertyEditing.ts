/**
 * propertyEditing — pure logic backing the Properties_Panel single-selection
 * editor (Req 9.1–9.6).
 *
 * This module holds every side-effect-free helper the panel needs so the React
 * component stays a thin view:
 *  - field validation/parse (hex color, numeric ranges, opacity, font size),
 *  - derivation of a Layer's editable position/size box from its geometry,
 *  - construction of the exact Command for a committed position/size change
 *    (translate / resize), and
 *  - parse/build of the shadow+blur effect filter string (Req 9.6).
 *
 * Validation is the gate that satisfies Req 9.3/9.5: an invalid commit returns
 * a typed failure so the caller can retain the previous value, show a
 * field-level error, and record no Command. Clamping (font size, Req 6.6) is
 * reported via an `adjusted` flag so the panel can surface the adjustment.
 *
 * One responsibility per file: pure property-editing logic. No React, no DOM,
 * no global mutable state.
 */

import { resizeLayerCommand, type ResizeSnapshot } from "./commands/resizeLayerCommand";
import { translateLayerCommand } from "./commands/translateLayerCommand";
import type { Command, DocumentLayer, ShapeGeometry, TextLayer } from "./types/documentModel";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Result of validating a single field commit. */
export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

/** Inclusive bounds for position and size values, in pixels (Req 9.2, 9.3). */
export const COORDINATE_MIN = 0;
export const COORDINATE_MAX = 100_000;

/** Inclusive bounds for layer opacity, in percent (Req 9.4, 9.5). */
export const OPACITY_MIN = 0;
export const OPACITY_MAX = 100;

/** Inclusive bounds for text font size, in pixels (Req 6.5, 6.6). */
export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 200;

interface RangeOptions {
  /** Human-readable field name used in error messages. */
  field: string;
  /** When true, the value must be a whole number. */
  integer?: boolean;
}

/**
 * Validate that `raw` parses to a finite number within `[min, max]`. Empty
 * input, non-numeric input, and out-of-range input are rejected with a
 * field-specific message (Req 9.3, 9.5).
 */
export function validateNumberInRange(
  raw: string,
  min: number,
  max: number,
  options: RangeOptions,
): Validation<number> {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, error: `${options.field} is required` };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { ok: false, error: `${options.field} must be a number` };
  }
  if (options.integer && !Number.isInteger(value)) {
    return { ok: false, error: `${options.field} must be a whole number` };
  }
  if (value < min || value > max) {
    return { ok: false, error: `${options.field} must be between ${min} and ${max}` };
  }
  return { ok: true, value };
}

/** Validate a position or size value within 0..100000 px (Req 9.2, 9.3). */
export function validateCoordinate(raw: string, field: string): Validation<number> {
  return validateNumberInRange(raw, COORDINATE_MIN, COORDINATE_MAX, { field });
}

/** Validate an integer opacity within 0..100 percent (Req 9.4, 9.5). */
export function validateOpacityPercent(raw: string): Validation<number> {
  return validateNumberInRange(raw, OPACITY_MIN, OPACITY_MAX, { field: "Opacity", integer: true });
}

export function validateBlendMode(raw: string): Validation<string> {
  const trimmed = raw.trim().toLowerCase();
  const validModes = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"];
  if (validModes.includes(trimmed)) {
    return { ok: true, value: trimmed };
  }
  return { ok: false, error: `Must be a valid blend mode.` };
}

/** Validate a non-negative stroke width within 0..100000 px (Req 9.4). */
export function validateStrokeWidth(raw: string): Validation<number> {
  return validateNumberInRange(raw, COORDINATE_MIN, COORDINATE_MAX, { field: "Stroke width" });
}

const HEX_COLOR = /^#?([0-9a-fA-F]{6})$/;

/**
 * Parse a 6-digit hex color, returning the normalized lowercase `#rrggbb` form
 * or `null` when the input is not a valid 6-digit hex (Req 9.5).
 */
export function parseHexColor(raw: string): string | null {
  const match = raw.trim().match(HEX_COLOR);
  return match ? `#${match[1].toLowerCase()}` : null;
}

/** Validate a 6-digit hex color for a named field (Req 9.5). */
export function validateHexColor(raw: string, field: string): Validation<string> {
  const parsed = parseHexColor(raw);
  return parsed
    ? { ok: true, value: parsed }
    : { ok: false, error: `${field} must be a 6-digit hex color` };
}

/** Clamp a font size into 12..200 px, reporting whether it was adjusted (Req 6.6). */
export function clampFontSize(value: number): { value: number; adjusted: boolean } {
  const clamped = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, value));
  return { value: clamped, adjusted: clamped !== value };
}

/**
 * Validate a font size, clamping to 12..200 px. A numeric value always succeeds
 * (it is clamped per Req 6.6); only empty/non-numeric input is rejected.
 */
export function validateFontSize(raw: string): Validation<{ value: number; adjusted: boolean }> {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, error: "Font size is required" };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { ok: false, error: "Font size must be a number" };
  }
  return { ok: true, value: clampFontSize(value) };
}

// ---------------------------------------------------------------------------
// Layer position / size derivation
// ---------------------------------------------------------------------------

/** Axis-aligned editable box (top-left origin) derived from a Layer. */
export interface LayerBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Derive an editable position/size box for a Layer, or `null` when the layer
 * has no directly editable box (groups and free-form paths). Text reports its
 * baseline position with a glyph-driven height and no editable width.
 */
export function getLayerBox(layer: DocumentLayer): LayerBox | null {
  switch (layer.kind) {
    case "image":
      return { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
    case "text":
      return { x: layer.x, y: layer.y, width: 0, height: layer.fontSize };
    case "group":
      return null;
    default:
      return boxFromGeometry(layer.geometry);
  }
}

function getPathBoundingBox(d: string): LayerBox | null {
  const matches = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!matches || matches.length < 2) return null;
  const numbers = matches.map(Number);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < numbers.length; i += 2) {
    const x = numbers[i];
    const y = numbers[i + 1];
    if (x !== undefined && !isNaN(x)) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    if (y !== undefined && !isNaN(y)) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (minX === Infinity || minY === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function boxFromGeometry(geometry: ShapeGeometry): LayerBox | null {
  switch (geometry.type) {
    case "rect":
      return { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height };
    case "ellipse":
      return {
        x: geometry.cx - geometry.rx,
        y: geometry.cy - geometry.ry,
        width: geometry.rx * 2,
        height: geometry.ry * 2,
      };
    case "line":
      return {
        x: Math.min(geometry.x1, geometry.x2),
        y: Math.min(geometry.y1, geometry.y2),
        width: Math.abs(geometry.x2 - geometry.x1),
        height: Math.abs(geometry.y2 - geometry.y1),
      };
    case "polygon": {
      if (geometry.points.length === 0) {
        return null;
      }
      const xs = geometry.points.map(([x]) => x);
      const ys = geometry.points.map(([, y]) => y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
    }
    case "path":
      return getPathBoundingBox(geometry.d);
    default:
      return null;
  }
}

/** Whether the Layer exposes an editable position (has a derivable box). */
export function supportsPositionEditing(layer: DocumentLayer): boolean {
  return getLayerBox(layer) !== null;
}

/** Whether the Layer exposes editable width/height (rect, ellipse, image). */
export function supportsSizeEditing(layer: DocumentLayer): boolean {
  return layer.kind === "rect" || layer.kind === "ellipse" || layer.kind === "image";
}

/** Whether the Layer is a text Layer (drives typography controls, Req 9.1). */
export function isTextLayer(layer: DocumentLayer): layer is TextLayer {
  return layer.kind === "text";
}

// ---------------------------------------------------------------------------
// Position / size command construction
// ---------------------------------------------------------------------------

/**
 * Build the Command that moves a Layer so its box origin's `axis` coordinate
 * becomes `nextValue`. Returns `null` when there is no editable box or the
 * change is a no-op (so the dispatcher records nothing, Req 9.2).
 */
export function buildPositionCommand(
  layer: DocumentLayer,
  axis: "x" | "y",
  nextValue: number,
): Command | null {
  const box = getLayerBox(layer);
  if (!box) {
    return null;
  }
  const dx = axis === "x" ? nextValue - box.x : 0;
  const dy = axis === "y" ? nextValue - box.y : 0;
  if (dx === 0 && dy === 0) {
    return null;
  }
  return translateLayerCommand(layer.id, dx, dy);
}

/**
 * Build the Command that resizes a Layer's `axis` dimension to `nextValue`,
 * keeping the box origin fixed. Supports rect, ellipse, and image layers;
 * returns `null` for unsupported layers or a no-op change (Req 9.2).
 */
export function buildSizeCommand(
  layer: DocumentLayer,
  axis: "width" | "height",
  nextValue: number,
): Command | null {
  if (layer.kind === "image") {
    const width = axis === "width" ? nextValue : layer.width;
    const height = axis === "height" ? nextValue : layer.height;
    if (width === layer.width && height === layer.height) {
      return null;
    }
    const prev: ResizeSnapshot = { kind: "box", x: layer.x, y: layer.y, width: layer.width, height: layer.height };
    const next: ResizeSnapshot = { kind: "box", x: layer.x, y: layer.y, width, height };
    return resizeLayerCommand(layer.id, prev, next);
  }

  if (layer.kind === "rect" && layer.geometry.type === "rect") {
    const geometry = layer.geometry;
    const width = axis === "width" ? nextValue : geometry.width;
    const height = axis === "height" ? nextValue : geometry.height;
    if (width === geometry.width && height === geometry.height) {
      return null;
    }
    const prev: ResizeSnapshot = { kind: "geometry", geometry };
    const next: ResizeSnapshot = { kind: "geometry", geometry: { ...geometry, width, height } };
    return resizeLayerCommand(layer.id, prev, next);
  }

  if (layer.kind === "ellipse" && layer.geometry.type === "ellipse") {
    const geometry = layer.geometry;
    const left = geometry.cx - geometry.rx;
    const top = geometry.cy - geometry.ry;
    const rx = axis === "width" ? nextValue / 2 : geometry.rx;
    const ry = axis === "height" ? nextValue / 2 : geometry.ry;
    if (rx === geometry.rx && ry === geometry.ry) {
      return null;
    }
    const prev: ResizeSnapshot = { kind: "geometry", geometry };
    const next: ResizeSnapshot = {
      kind: "geometry",
      geometry: { type: "ellipse", cx: left + rx, cy: top + ry, rx, ry },
    };
    return resizeLayerCommand(layer.id, prev, next);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Fill / stroke readers
// ---------------------------------------------------------------------------

/** Current fill for shape/text layers, or `null` when not applicable. */
export function getLayerFill(layer: DocumentLayer): string | null {
  if (layer.kind === "text") {
    return layer.fill;
  }
  if (layer.kind === "group") {
    return null;
  }
  return (layer as any).fill ?? null;
}

/** Current stroke for shape layers, or `null` when not applicable. */
export function getLayerStroke(layer: DocumentLayer): string | null {
  if (layer.kind === "text" || layer.kind === "image" || layer.kind === "group") {
    return null;
  }
  return layer.stroke ?? null;
}

/** Current stroke width for shape layers, or `null` when not applicable. */
export function getLayerStrokeWidth(layer: DocumentLayer): number | null {
  if (layer.kind === "text" || layer.kind === "image" || layer.kind === "group") {
    return null;
  }
  return layer.strokeWidth ?? null;
}

// ---------------------------------------------------------------------------
// Effects (shadow / blur) — Req 9.6
// ---------------------------------------------------------------------------

/** Decoded shadow + blur effect state for a Layer. */
export interface LayerEffects {
  shadow: boolean;
  /** Gaussian blur radius in pixels (0 = none). */
  blur: number;
  brightness?: number;
  contrast?: number;
  saturate?: number;
  grayscale?: number;
}

/** The drop-shadow filter applied when the shadow effect is enabled. */
export const DEFAULT_SHADOW_FILTER = "drop-shadow(0px 4px 8px rgba(0,0,0,0.35))";

/** Decode the shadow + blur state from a Layer's stored CSS filter value. */
export function parseEffects(filter: string | undefined): LayerEffects {
  if (!filter) {
    return { shadow: false, blur: 0, brightness: 100, contrast: 100, saturate: 100, grayscale: 0 };
  }
  const shadow = /drop-shadow\(/i.test(filter);
  const blurMatch = filter.match(/blur\(\s*([\d.]+)px\s*\)/i);
  const blur = blurMatch ? Number(blurMatch[1]) : 0;
  
  const bMatch = filter.match(/brightness\(\s*([\d.]+)%\s*\)/i);
  const brightness = bMatch ? Number(bMatch[1]) : 100;
  
  const cMatch = filter.match(/contrast\(\s*([\d.]+)%\s*\)/i);
  const contrast = cMatch ? Number(cMatch[1]) : 100;
  
  const sMatch = filter.match(/saturate\(\s*([\d.]+)%\s*\)/i);
  const saturate = sMatch ? Number(sMatch[1]) : 100;
  
  const gMatch = filter.match(/grayscale\(\s*([\d.]+)%\s*\)/i);
  const grayscale = gMatch ? Number(gMatch[1]) : 0;

  return { 
    shadow, 
    blur: Number.isFinite(blur) ? blur : 0,
    brightness: Number.isFinite(brightness) ? brightness : 100,
    contrast: Number.isFinite(contrast) ? contrast : 100,
    saturate: Number.isFinite(saturate) ? saturate : 100,
    grayscale: Number.isFinite(grayscale) ? grayscale : 0,
  };
}

/**
 * Build the CSS filter value for the given effect state. Returns an empty
 * string when no effect is active (the caller clears the property).
 */
export function buildFilterValue(effects: LayerEffects): string {
  const parts: string[] = [];
  if (effects.shadow) {
    parts.push(DEFAULT_SHADOW_FILTER);
  }
  if (effects.blur > 0) {
    parts.push(`blur(${effects.blur}px)`);
  }
  if (effects.brightness !== undefined && effects.brightness !== 100) {
    parts.push(`brightness(${effects.brightness}%)`);
  }
  if (effects.contrast !== undefined && effects.contrast !== 100) {
    parts.push(`contrast(${effects.contrast}%)`);
  }
  if (effects.saturate !== undefined && effects.saturate !== 100) {
    parts.push(`saturate(${effects.saturate}%)`);
  }
  if (effects.grayscale !== undefined && effects.grayscale !== 0) {
    parts.push(`grayscale(${effects.grayscale}%)`);
  }
  return parts.join(" ");
}
