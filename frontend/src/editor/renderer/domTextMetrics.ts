/**
 * domTextMetrics — real text metrics for the SVG rendering path.
 *
 * Text was the one node kind with no bounds outside the Skia overlay: the engine
 * has `skparagraph`, but the SVG path had no measurement source at all, so
 * `extractRenderScene` recorded `text-measurement-unavailable` and
 * `localBounds: null`. That is honest, and it is also why a text layer got no
 * selection box — `obbForNode` correctly refuses to invent one.
 *
 * This closes that gap with the browser's own text engine. Canvas 2D
 * `measureText` uses the same font stack, hinting and shaping the browser will use
 * to paint the `<text>` element, so the measurement and the render come from one
 * source — the same property the Skia path gets from `skparagraph`. Each backend
 * measures with the engine that draws it; neither approximates the other.
 *
 * `null` is still returned when there is no canvas (SSR, or a jsdom environment
 * without one) rather than guessing, so the diagnostic path stays intact.
 *
 * One responsibility per file: measuring text with the browser's text engine.
 */

import {
  createCachingTextMetricsProvider,
  type TextMeasureRequest,
  type TextMetrics,
  type TextMetricsProvider,
} from "./textMeasurement";

/**
 * Fallback line advance as a multiple of font size, used only when the font
 * exposes no ascent/descent.
 *
 * 1.2 is the CSS `normal` line-height convention and matches what browsers use
 * when no metrics are available.
 */
const DEFAULT_LINE_HEIGHT_RATIO = 1.2;

/** Reused across calls: creating a canvas per measurement is needlessly costly. */
let sharedContext: CanvasRenderingContext2D | null | undefined;

function context2d(): CanvasRenderingContext2D | null {
  if (sharedContext !== undefined) {
    return sharedContext;
  }
  if (typeof document === "undefined") {
    sharedContext = null;
    return sharedContext;
  }
  const canvas = document.createElement("canvas");
  // A 2d context is unavailable in some headless environments; that is reported
  // through a null measurement rather than crashing the editor.
  sharedContext = canvas.getContext("2d");
  return sharedContext;
}

/** Reset the cached context. Tests use this to simulate an absent canvas. */
export function resetDomTextMetricsForTests(): void {
  sharedContext = undefined;
}

/**
 * Build the CSS `font` shorthand.
 *
 * The order is mandated by the shorthand grammar: style, weight, size, family.
 * Getting it wrong makes the browser silently ignore the whole declaration and
 * measure with the default font, which is exactly the kind of quiet wrongness
 * this module exists to avoid.
 */
function fontShorthand(request: TextMeasureRequest): string {
  const family = request.fontFamily.trim() === "" ? "sans-serif" : request.fontFamily;
  return `${request.fontStyle} ${request.fontWeight} ${request.fontSize}px ${family}`;
}

function measureUncached(request: TextMeasureRequest): TextMetrics | null {
  const context = context2d();
  if (context === null) {
    return null;
  }
  if (!Number.isFinite(request.fontSize) || request.fontSize <= 0) {
    return null;
  }

  context.font = fontShorthand(request);

  // Explicit newlines are the only line breaks the SVG renderer honours; it does
  // no automatic wrapping, so measuring per explicit line matches what it draws.
  const lines = request.content.split("\n");
  let widest = 0;
  let ascent = 0;
  let descent = 0;

  for (const line of lines) {
    const measured = context.measureText(line);
    let width = measured.width;

    // Canvas has no letter/word spacing in every browser, so the tracking the SVG
    // renderer applies through CSS is added here explicitly. Applied per gap, not
    // per character, which is what CSS `letter-spacing` does.
    if (request.letterSpacing !== undefined && request.letterSpacing !== 0) {
      width += request.letterSpacing * Math.max(0, [...line].length - 1);
    }
    if (request.wordSpacing !== undefined && request.wordSpacing !== 0) {
      const gaps = line.split(/\s+/).filter((part) => part !== "").length - 1;
      width += request.wordSpacing * Math.max(0, gaps);
    }

    widest = Math.max(widest, width);
    // `fontBoundingBox*` describes the FONT rather than the glyphs present, which
    // is what a text box should use: a line of "xxx" and a line of "XXX" must
    // occupy the same height.
    ascent = Math.max(
      ascent,
      measured.fontBoundingBoxAscent ?? measured.actualBoundingBoxAscent ?? 0,
    );
    descent = Math.max(
      descent,
      measured.fontBoundingBoxDescent ?? measured.actualBoundingBoxDescent ?? 0,
    );
  }

  const naturalLine =
    ascent + descent > 0 ? ascent + descent : request.fontSize * DEFAULT_LINE_HEIGHT_RATIO;
  const lineAdvance =
    request.lineHeight !== undefined && request.lineHeight > 0
      ? request.lineHeight
      : naturalLine;

  const firstLineAscent = ascent > 0 ? ascent : request.fontSize * 0.8;

  if (![widest, lineAdvance, firstLineAscent].every(Number.isFinite)) {
    return null;
  }

  return {
    width: widest,
    // The block spans one ascent plus one advance per subsequent line, which is
    // how the renderer stacks them.
    height: firstLineAscent + descent + lineAdvance * (lines.length - 1),
    firstLineAscent,
    lineCount: lines.length,
  };
}

/**
 * A cached provider backed by the browser's text engine.
 *
 * Caching matters: the selection overlay re-derives geometry whenever the scene or
 * the view changes, and `measureText` forces font work each call.
 */
export function createDomTextMetricsProvider(): TextMetricsProvider {
  return createCachingTextMetricsProvider({ measure: measureUncached });
}

/** Shared instance, so every consumer benefits from one cache. */
export const domTextMetrics: TextMetricsProvider = createDomTextMetricsProvider();
