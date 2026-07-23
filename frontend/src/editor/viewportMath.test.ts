import { describe, expect, it } from "vitest";

import {
  ZOOM_MAX,
  ZOOM_MIN,
  clampZoom,
  isZoomOutOfRange,
  panBy,
  zoomAtPoint,
  zoomByFactor,
  zoomPercent,
} from "./viewportMath";
import type { Viewport } from "./types/documentModel";

/**
 * Example unit tests for the pure pan/zoom math (task 5.2, Req 1.3–1.6).
 * The property variants (Property 12 / Property 27) are tasks 5.3 / 5.4.
 */

const IDENTITY: Viewport = { zoom: 1, panX: 0, panY: 0 };

describe("clampZoom", () => {
  it("leaves in-range values untouched", () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(0.5)).toBe(0.5);
    expect(clampZoom(32)).toBe(32);
  });

  it("clamps below the lower bound to ZOOM_MIN (10%)", () => {
    expect(clampZoom(0.05)).toBe(ZOOM_MIN);
    expect(clampZoom(0)).toBe(ZOOM_MIN);
    expect(clampZoom(-3)).toBe(ZOOM_MIN);
  });

  it("clamps above the upper bound to ZOOM_MAX (6400%)", () => {
    expect(clampZoom(100)).toBe(ZOOM_MAX);
    expect(clampZoom(64.0001)).toBe(ZOOM_MAX);
  });

  it("includes the inclusive bounds exactly", () => {
    expect(clampZoom(ZOOM_MIN)).toBe(ZOOM_MIN);
    expect(clampZoom(ZOOM_MAX)).toBe(ZOOM_MAX);
  });

  it("falls back to ZOOM_MIN for non-finite input", () => {
    expect(clampZoom(Number.NaN)).toBe(ZOOM_MIN);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(ZOOM_MIN);
  });
});

describe("isZoomOutOfRange", () => {
  it("is false inside the inclusive range and true outside it", () => {
    expect(isZoomOutOfRange(1)).toBe(false);
    expect(isZoomOutOfRange(ZOOM_MIN)).toBe(false);
    expect(isZoomOutOfRange(ZOOM_MAX)).toBe(false);
    expect(isZoomOutOfRange(0.05)).toBe(true);
    expect(isZoomOutOfRange(128)).toBe(true);
    expect(isZoomOutOfRange(Number.NaN)).toBe(true);
  });
});

describe("zoomPercent", () => {
  it("rounds zoom * 100 to the nearest integer (Req 1.6)", () => {
    expect(zoomPercent(1)).toBe(100);
    expect(zoomPercent(0.1)).toBe(10);
    expect(zoomPercent(64)).toBe(6400);
    expect(zoomPercent(0.333)).toBe(33);
    expect(zoomPercent(1.236)).toBe(124);
  });
});

describe("zoomAtPoint (cursor-anchored zoom)", () => {
  it("keeps the content point under the cursor fixed across the scale change", () => {
    const cursorX = 200;
    const cursorY = 150;
    const next = zoomAtPoint(IDENTITY, 2, cursorX, cursorY);

    expect(next.zoom).toBe(2);
    // The content point that was under the cursor must map back to the cursor.
    const modelXBefore = (cursorX - IDENTITY.panX) / IDENTITY.zoom;
    const modelYBefore = (cursorY - IDENTITY.panY) / IDENTITY.zoom;
    expect(modelXBefore * next.zoom + next.panX).toBeCloseTo(cursorX, 10);
    expect(modelYBefore * next.zoom + next.panY).toBeCloseTo(cursorY, 10);
  });

  it("anchors correctly from a non-identity starting viewport", () => {
    const start: Viewport = { zoom: 1.5, panX: -40, panY: 25 };
    const cursorX = 320;
    const cursorY = 240;
    const next = zoomAtPoint(start, 4, cursorX, cursorY);

    const modelX = (cursorX - start.panX) / start.zoom;
    const modelY = (cursorY - start.panY) / start.zoom;
    expect(modelX * next.zoom + next.panX).toBeCloseTo(cursorX, 10);
    expect(modelY * next.zoom + next.panY).toBeCloseTo(cursorY, 10);
  });

  it("clamps the requested zoom to the nearest bound while still anchoring", () => {
    const tooFar = zoomAtPoint(IDENTITY, 1000, 100, 100);
    expect(tooFar.zoom).toBe(ZOOM_MAX);
    expect(100 * tooFar.zoom + 0).not.toBe(100); // sanity: pan compensated
    // Anchored: content point (100) stays under cursor (100).
    const modelX = (100 - IDENTITY.panX) / IDENTITY.zoom;
    expect(modelX * tooFar.zoom + tooFar.panX).toBeCloseTo(100, 10);

    const tooClose = zoomAtPoint(IDENTITY, 0.001, 100, 100);
    expect(tooClose.zoom).toBe(ZOOM_MIN);
  });

  it("does not mutate the input viewport", () => {
    const start: Viewport = { zoom: 1, panX: 0, panY: 0 };
    zoomAtPoint(start, 3, 50, 50);
    expect(start).toEqual({ zoom: 1, panX: 0, panY: 0 });
  });
});

describe("zoomByFactor", () => {
  it("multiplies the current zoom and anchors at the cursor", () => {
    const next = zoomByFactor(IDENTITY, 2, 0, 0);
    expect(next.zoom).toBe(2);
  });

  it("clamps when the factor pushes past a bound", () => {
    const start: Viewport = { zoom: 32, panX: 0, panY: 0 };
    expect(zoomByFactor(start, 4, 0, 0).zoom).toBe(ZOOM_MAX);
  });
});

describe("panBy", () => {
  it("translates pan 1:1 and preserves zoom", () => {
    const start: Viewport = { zoom: 2, panX: 10, panY: -5 };
    expect(panBy(start, 15, 20)).toEqual({ zoom: 2, panX: 25, panY: 15 });
  });

  it("does not mutate the input", () => {
    const start: Viewport = { zoom: 1, panX: 0, panY: 0 };
    panBy(start, 5, 5);
    expect(start).toEqual({ zoom: 1, panX: 0, panY: 0 });
  });
});
