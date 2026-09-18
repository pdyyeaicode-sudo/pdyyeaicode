/**
 * pathBounds — conservative bounding box for SVG path data.
 *
 * Exact extents of a cubic/quadratic curve require solving for the curve's
 * extrema, and exact arc extents require converting the endpoint
 * parameterisation to centre form. The Skia backend gets that for free from
 * `SkPath` bounds, so this module deliberately computes a *correct superset*
 * instead: the AABB of every on-curve point and control point, with arcs
 * expanded by their radii.
 *
 * A superset is safe for the two things the TypeScript layer needs it for —
 * viewport culling and coarse hit-testing — because it never excludes a point
 * the path actually covers. It is reported as `conservative` so no consumer
 * mistakes it for exact geometry (AGENTS.md: no silent fallbacks).
 *
 * Handles absolute and relative forms of M, L, H, V, C, S, Q, T, A and Z.
 *
 * One responsibility per file: path data bounds.
 */

import type { RectF } from "./matrix2d";

interface BoundsAccumulator {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  any: boolean;
}

/** Number of parameters consumed by one repetition of each command. */
const ARITY: Readonly<Record<string, number>> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
};

/**
 * Compute a conservative bounding box for `d`, or `null` when the data
 * contains no usable coordinates.
 */
export function conservativePathBounds(d: string): RectF | null {
  const accumulator: BoundsAccumulator = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    any: false,
  };

  let currentX = 0;
  let currentY = 0;
  let subpathStartX = 0;
  let subpathStartY = 0;

  const commandPattern = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let match = commandPattern.exec(d);

  while (match !== null) {
    const rawCommand = match[1];
    const command = rawCommand.toLowerCase();
    const relative = rawCommand !== rawCommand.toUpperCase();
    const args = parseNumbers(match[2]);
    const arity = ARITY[command];

    if (command === "z") {
      currentX = subpathStartX;
      currentY = subpathStartY;
      include(accumulator, currentX, currentY);
      match = commandPattern.exec(d);
      continue;
    }

    if (arity === undefined || arity === 0 || args.length < arity) {
      match = commandPattern.exec(d);
      continue;
    }

    // A command may repeat its parameter group (e.g. "L 1 2 3 4").
    for (let offset = 0; offset + arity <= args.length; offset += arity) {
      const group = args.slice(offset, offset + arity);
      const originX = relative ? currentX : 0;
      const originY = relative ? currentY : 0;

      switch (command) {
        case "m":
        case "l": {
          currentX = originX + group[0];
          currentY = originY + group[1];
          include(accumulator, currentX, currentY);
          // Only the first coordinate pair of an "m" starts a subpath;
          // subsequent pairs behave as implicit line-tos.
          if (command === "m" && offset === 0) {
            subpathStartX = currentX;
            subpathStartY = currentY;
          }
          break;
        }
        case "h": {
          currentX = originX + group[0];
          include(accumulator, currentX, currentY);
          break;
        }
        case "v": {
          currentY = originY + group[0];
          include(accumulator, currentX, currentY);
          break;
        }
        case "c": {
          include(accumulator, originX + group[0], originY + group[1]);
          include(accumulator, originX + group[2], originY + group[3]);
          currentX = originX + group[4];
          currentY = originY + group[5];
          include(accumulator, currentX, currentY);
          break;
        }
        case "s":
        case "q": {
          include(accumulator, originX + group[0], originY + group[1]);
          currentX = originX + group[2];
          currentY = originY + group[3];
          include(accumulator, currentX, currentY);
          break;
        }
        case "t": {
          currentX = originX + group[0];
          currentY = originY + group[1];
          include(accumulator, currentX, currentY);
          break;
        }
        case "a": {
          const radiusX = Math.abs(group[0]);
          const radiusY = Math.abs(group[1]);
          const endX = originX + group[5];
          const endY = originY + group[6];
          // Superset: the arc cannot leave the union of radius-expanded boxes
          // around its start and end points.
          include(accumulator, currentX - radiusX, currentY - radiusY);
          include(accumulator, currentX + radiusX, currentY + radiusY);
          include(accumulator, endX - radiusX, endY - radiusY);
          include(accumulator, endX + radiusX, endY + radiusY);
          currentX = endX;
          currentY = endY;
          break;
        }
        default:
          break;
      }
    }

    match = commandPattern.exec(d);
  }

  if (!accumulator.any) {
    return null;
  }
  return {
    x: accumulator.minX,
    y: accumulator.minY,
    width: accumulator.maxX - accumulator.minX,
    height: accumulator.maxY - accumulator.minY,
  };
}

function include(accumulator: BoundsAccumulator, x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }
  accumulator.minX = Math.min(accumulator.minX, x);
  accumulator.minY = Math.min(accumulator.minY, y);
  accumulator.maxX = Math.max(accumulator.maxX, x);
  accumulator.maxY = Math.max(accumulator.maxY, y);
  accumulator.any = true;
}

function parseNumbers(raw: string): number[] {
  const matches = raw.match(/-?\d*\.?\d+(?:[eE][+-]?\d+)?/g);
  if (matches === null) {
    return [];
  }
  const numbers: number[] = [];
  for (const token of matches) {
    const parsed = Number.parseFloat(token);
    if (Number.isFinite(parsed)) {
      numbers.push(parsed);
    }
  }
  return numbers;
}
