/**
 * textMeasurement — the single seam through which the renderer obtains real
 * text metrics (spec §80 "Font metrics", §81 "Text measurement").
 *
 * Text bounds cannot be derived from font size and character count: correct
 * extents require the actual font's advances, ascent and descent. Rather than
 * approximating (which would silently disagree with exported SVG and with
 * Skia's shaped output), the scene marks text bounds as
 * `pending-measurement` whenever no provider is supplied.
 *
 * Implementations:
 *  - SVG backend: measures via the live SVG text node.
 *  - Skia/WASM backend: measures via shaped paragraph metrics.
 *  - Tests: inject a deterministic provider.
 *
 * One responsibility per file: the text measurement contract.
 */

import type { RectF } from "./matrix2d";

/** Everything that can change a text run's measured size. */
export interface TextMeasureRequest {
  readonly content: string;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: "normal" | "bold";
  readonly fontStyle: "normal" | "italic";
  readonly letterSpacing?: number;
  readonly wordSpacing?: number;
  /** Absolute line advance in document px; omitted means the font default. */
  readonly lineHeight?: number;
  readonly direction?: "ltr" | "rtl";
}

/** Measured extents of a laid-out text block, in document pixels. */
export interface TextMetrics {
  /** Width of the widest line. */
  readonly width: number;
  /** Total height of the block across all lines. */
  readonly height: number;
  /** Distance from the first line's baseline up to the block top. */
  readonly firstLineAscent: number;
  readonly lineCount: number;
}

/**
 * Provides real metrics, or `null` when the font is not yet loaded. Returning
 * `null` is a first-class outcome: the caller records
 * `text-measurement-unavailable` rather than guessing.
 */
export interface TextMetricsProvider {
  measure(request: TextMeasureRequest): TextMetrics | null;
}

/** A stable cache key covering every field that affects measurement. */
export function textMeasureCacheKey(request: TextMeasureRequest): string {
  return [
    request.fontFamily,
    request.fontSize,
    request.fontWeight,
    request.fontStyle,
    request.letterSpacing ?? "",
    request.wordSpacing ?? "",
    request.lineHeight ?? "",
    request.direction ?? "ltr",
    request.content,
  ].join("\u0001");
}

/**
 * Convert baseline-anchored text metrics into an untransformed bounding box.
 *
 * SVG positions text by its baseline, and `textAlign` maps to `text-anchor`,
 * so the box extends left/right of `x` according to the alignment.
 */
export function textBoundsFromMetrics(
  x: number,
  y: number,
  textAlign: "left" | "center" | "right",
  metrics: TextMetrics,
): RectF {
  const left = textAlign === "center"
    ? x - metrics.width / 2
    : textAlign === "right"
      ? x - metrics.width
      : x;
  return {
    x: left,
    y: y - metrics.firstLineAscent,
    width: metrics.width,
    height: metrics.height,
  };
}

/**
 * Memoizing decorator so repeated layout passes never re-measure identical
 * runs (spec §67 "Text caching"). The cache is owned by the caller, so an
 * editing session can drop it wholesale when fonts change.
 */
export function createCachingTextMetricsProvider(
  inner: TextMetricsProvider,
  cache: Map<string, TextMetrics | null> = new Map(),
): TextMetricsProvider {
  return {
    measure(request: TextMeasureRequest): TextMetrics | null {
      const key = textMeasureCacheKey(request);
      if (cache.has(key)) {
        return cache.get(key) ?? null;
      }
      const measured = inner.measure(request);
      cache.set(key, measured);
      return measured;
    },
  };
}
