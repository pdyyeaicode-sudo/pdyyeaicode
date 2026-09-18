/**
 * engineTextMetrics — a `TextMetricsProvider` backed by the Skia engine.
 *
 * This closes the gap the scene extractor deliberately left open. Without a
 * provider, text nodes carry `boundsAccuracy: "pending-measurement"` and no
 * bounds at all, because approximating from font size and character count would
 * disagree with both the shaped output and the exported SVG.
 *
 * With this provider, bounds come from the same shaping engine that paints the
 * text — HarfBuzz and ICU via skparagraph — so selection boxes, culling and
 * hit-testing line up with the pixels.
 *
 * Fonts must be registered on the surface first. Measurement returns null for an
 * unregistered family, which the extractor records as a diagnostic rather than
 * guessing.
 *
 * One responsibility per file: adapting the engine's measurement API to the
 * renderer's provider contract.
 */

import type { PydeeSurfaceHandle } from "./engineLoader";
import {
  createCachingTextMetricsProvider,
  type TextMeasureRequest,
  type TextMetrics,
  type TextMetricsProvider,
} from "./textMeasurement";

/** Shape of the object the engine returns from `measureText`. */
interface EngineTextMetrics {
  readonly width: number;
  readonly height: number;
  readonly firstLineAscent: number;
  readonly lineCount: number;
}

/**
 * Wrap a live engine surface as a metrics provider.
 *
 * Results are memoized, because layout re-measures the same runs on every pan,
 * zoom and unrelated document change.
 */
export function createEngineTextMetricsProvider(
  surface: PydeeSurfaceHandle,
  cache: Map<string, TextMetrics | null> = new Map(),
): TextMetricsProvider {
  const direct: TextMetricsProvider = {
    measure(request: TextMeasureRequest): TextMetrics | null {
      const measured = surface.measureText(
        request.fontFamily,
        request.content,
        request.fontSize,
        request.fontWeight === "bold",
        request.fontStyle === "italic",
        request.letterSpacing ?? 0,
        request.lineHeight ?? 0,
      ) as EngineTextMetrics | null;

      if (measured === null || !Number.isFinite(measured.width)) {
        // Font not registered, or shaping failed. Reported as unknown.
        return null;
      }
      return {
        width: measured.width,
        height: measured.height,
        firstLineAscent: measured.firstLineAscent,
        lineCount: measured.lineCount,
      };
    },
  };

  return createCachingTextMetricsProvider(direct, cache);
}
