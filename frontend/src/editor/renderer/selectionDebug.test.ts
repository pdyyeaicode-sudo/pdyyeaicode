import { afterEach, describe, expect, it, vi } from "vitest";

import { drawSelectionDebug, isSelectionDebugEnabled } from "./selectionDebug";
import type { OrientedBox } from "../geometry/selectionGeometry";
/**
 * The overlay is a developer tool, so the property that matters most is that it is OFF
 * by default and CANNOT be turned on in production. The drawing itself is checked only
 * for "does it touch the primitives it claims to", via a recording context — pixel
 * fidelity of a debug aid is not worth a screenshot test.
 */

function setSearch(search: string): void {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, search },
  });
}

afterEach(() => {
  setSearch("");
  try {
    window.localStorage.removeItem("pydee:debug-geometry");
  } catch {
    // ignore
  }
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("isSelectionDebugEnabled", () => {
  it("is off with no flag", () => {
    setSearch("");
    expect(isSelectionDebugEnabled()).toBe(false);
  });

  it("turns on via the query parameter", () => {
    setSearch("?debug=geometry");
    expect(isSelectionDebugEnabled()).toBe(true);
  });

  it("turns on via localStorage", () => {
    setSearch("");
    window.localStorage.setItem("pydee:debug-geometry", "1");
    expect(isSelectionDebugEnabled()).toBe(true);
  });

  it("ignores an unrelated debug value", () => {
    setSearch("?debug=something-else");
    expect(isSelectionDebugEnabled()).toBe(false);
  });

  it("is forced off in production regardless of the flag", () => {
    vi.stubEnv("PROD", true);
    setSearch("?debug=geometry");
    window.localStorage.setItem("pydee:debug-geometry", "1");
    // Neither route can enable it once PROD is set: a link handed to an end user
    // cannot turn on developer chrome.
    expect(isSelectionDebugEnabled()).toBe(false);
  });

  it("never throws on a malformed query string", () => {
    setSearch("?%");
    expect(() => isSelectionDebugEnabled()).not.toThrow();
  });
});

/** A CanvasRenderingContext2D that records which drawing verbs were called. */
function recordingContext(): { context: CanvasRenderingContext2D; verbs: string[] } {
  const verbs: string[] = [];
  const record = (name: string) => (...args: unknown[]) => {
    verbs.push(`${name}(${args.map(String).join(",")})`);
  };
  const context = {
    save: record("save"),
    restore: record("restore"),
    beginPath: record("beginPath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    closePath: record("closePath"),
    stroke: record("stroke"),
    fill: record("fill"),
    arc: record("arc"),
    rect: record("rect"),
    strokeRect: record("strokeRect"),
    fillText: record("fillText"),
    setLineDash: record("setLineDash"),
    set strokeStyle(_v: string) {},
    set fillStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set font(_v: string) {},
  } as unknown as CanvasRenderingContext2D;
  return { context, verbs };
}

/** A full oriented box at the given translation, so tests supply valid corners. */
function obbAt(x: number, y: number, width: number, height: number): OrientedBox {
  return {
    topLeft: { x, y } as never,
    topRight: { x: x + width, y } as never,
    bottomRight: { x: x + width, y: y + height } as never,
    bottomLeft: { x, y: y + height } as never,
    localBounds: { x: 0, y: 0, width, height },
    worldTransform: { a: 1, b: 0, c: 0, d: 1, e: x, f: y },
  };
}

describe("drawSelectionDebug", () => {
  it("draws nothing when disabled", () => {
    setSearch("");
    const { context, verbs } = recordingContext();
    drawSelectionDebug(
      context,
      { obb: obbAt(0, 0, 100, 60), pointerWorld: { x: 1, y: 2 }, previewBounds: { x: 0, y: 0, width: 5, height: 5 } },
      1,
    );
    expect(verbs).toEqual([]);
  });

  it("draws the oriented box, corners, pivot, pointer and preview when enabled", () => {
    setSearch("?debug=geometry");
    const { context, verbs } = recordingContext();
    drawSelectionDebug(
      context,
      {
        obb: obbAt(0, 0, 100, 60),
        pointerWorld: { x: 40, y: 30 },
        previewBounds: { x: 200, y: 200, width: 50, height: 50 },
      },
      2,
    );
    const joined = verbs.join(" ");
    // The oriented box is stroked as a closed polygon.
    expect(joined).toContain("closePath");
    // Corners, pivot and the pointer crosshair all use arc/line/fill primitives.
    expect(verbs.some((v) => v.startsWith("arc"))).toBe(true);
    expect(verbs.some((v) => v.startsWith("strokeRect"))).toBe(true);
    // Labels are drawn.
    expect(verbs.some((v) => v.startsWith("fillText"))).toBe(true);
  });

  it("does not throw with no obb, no pointer and no preview", () => {
    setSearch("?debug=geometry");
    const { context } = recordingContext();
    expect(() =>
      drawSelectionDebug(context, { obb: null, pointerWorld: null, previewBounds: null }, 1),
    ).not.toThrow();
  });
});
