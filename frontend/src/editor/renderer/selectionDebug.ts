/**
 * selectionDebug — optional geometry visualisation, off by default and out of production.
 *
 * When something looks misaligned, the temptation is to nudge a pixel offset until the
 * screenshot looks right. That is how the defects this work removed got there in the
 * first place. This module exists so the next alignment question is answered by LOOKING
 * at the geometry the systems actually computed, not by guessing:
 *
 *   local bounds        the node's own box, mapped to world and drawn — what the shape
 *                       thinks its extent is
 *   world corners       the four `worldTransform x localCorner` points, numbered, so a
 *                       swapped or mirrored corner is visible
 *   world AABB          the axis-aligned hull of those corners — what a box-and-angle
 *                       overlay would have drawn
 *   oriented box        the real quad — what the chrome now draws
 *   pivot               the centroid
 *   rotation anchor     the top-edge midpoint the rotation control extends from
 *   pointer world       the last pointer position, converted to document space
 *   preview geometry    the ephemeral shape-creation outline's bounds, when one exists
 *
 * Each in a distinct colour, so two that should coincide and do not are obvious at a
 * glance.
 *
 * Enabling it is deliberate and per-session, never a build default:
 *
 *   localStorage.setItem("pydee:debug-geometry", "1")   // then reload
 *   or /editor?debug=geometry
 *
 * `isSelectionDebugEnabled()` also short-circuits to false when `import.meta.env.PROD`
 * is set, so a stray flag in a shipped build draws nothing. The draw code is still
 * bundled — it is a few hundred bytes and gating the import behind an env check would
 * cost more in complexity than it saves — but it cannot run in production.
 *
 * One responsibility per file: drawing geometry debug primitives.
 */

import { obbCorners, type OrientedBox } from "../geometry/selectionGeometry";
import { transformRect, type RectF } from "./matrix2d";

/** Query key and localStorage key that turn the overlay on. */
const DEBUG_QUERY_VALUE = "geometry";
const DEBUG_STORAGE_KEY = "pydee:debug-geometry";

/**
 * Whether the geometry debug overlay should draw.
 *
 * False in production unconditionally, whatever the flag says, so a link with
 * `?debug=geometry` handed around cannot turn it on for an end user. Evaluated per call
 * so a test can flip it without reloading the module.
 */
export function isSelectionDebugEnabled(): boolean {
  // `import.meta.env.PROD` is replaced with a literal at build time, so this whole
  // function folds to `return false` in a production bundle.
  if (typeof import.meta !== "undefined" && import.meta.env?.PROD === true) {
    return false;
  }
  if (typeof window === "undefined") {
    return false;
  }
  try {
    if (window.localStorage?.getItem(DEBUG_STORAGE_KEY) === "1") {
      return true;
    }
    const params = new URLSearchParams(window.location.search);
    return params.get("debug") === DEBUG_QUERY_VALUE;
  } catch {
    // A locked-down localStorage or a malformed query string must never break the
    // editor — the overlay simply stays off.
    return false;
  }
}

/** Everything the overlay can draw, all in DOCUMENT coordinates. */
export interface SelectionDebugInput {
  readonly obb: OrientedBox | null;
  /** The last pointer position in document space, or null. */
  readonly pointerWorld: { readonly x: number; readonly y: number } | null;
  /** The live shape-creation preview's bounds, or null when none is active. */
  readonly previewBounds: RectF | null;
}

const COLORS = {
  localBounds: "#22c55e", // green
  worldAabb: "#f97316", // orange
  orientedBox: "#a855f7", // violet
  corners: "#ef4444", // red
  pivot: "#eab308", // amber
  rotationAnchor: "#06b6d4", // cyan
  pointer: "#ec4899", // pink
  preview: "#3b82f6", // blue
} as const;

/**
 * Draw the debug primitives onto a context already in document space.
 *
 * `zoom` divides every LENGTH (line widths, dot radii, label sizes) so they stay
 * constant on screen, exactly as the real chrome does. Positions are pure document
 * coordinates and are never scaled.
 *
 * Does nothing when the overlay is disabled, so the caller can invoke it
 * unconditionally.
 */
export function drawSelectionDebug(
  context: CanvasRenderingContext2D,
  input: SelectionDebugInput,
  zoom: number,
): void {
  if (!isSelectionDebugEnabled()) {
    return;
  }
  const safeZoom = zoom > 0 ? zoom : 1;
  const line = 1 / safeZoom;
  const dot = 3 / safeZoom;
  const font = 11 / safeZoom;

  context.save();

  if (input.obb !== null) {
    const corners = obbCorners(input.obb);
    if (corners.length === 4 && corners.every((c) => Number.isFinite(c.x) && Number.isFinite(c.y))) {
      // Local bounds mapped to world: what the shape believes its extent is, before the
      // chrome touches it. If this and the oriented box disagree, the bug is in the
      // bounds; if they agree but neither sits on the ink, it is in the transform.
      const worldLocal = transformRect(input.obb.worldTransform, input.obb.localBounds);
      strokeRect(context, worldLocal, COLORS.localBounds, line, [4 / safeZoom, 3 / safeZoom]);
      label(context, "local", worldLocal.x, worldLocal.y, COLORS.localBounds, font, safeZoom);

      // The axis-aligned hull: what a box-and-angle overlay would have drawn, kept as a
      // visible reminder of what the quad replaced.
      const xs = corners.map((c) => c.x);
      const ys = corners.map((c) => c.y);
      const aabb: RectF = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
      strokeRect(context, aabb, COLORS.worldAabb, line, [2 / safeZoom, 4 / safeZoom]);

      // The oriented box — the real quad — drawn solid, and its corners numbered so a
      // swapped tl/tr or a mirror is legible.
      context.strokeStyle = COLORS.orientedBox;
      context.lineWidth = line;
      context.setLineDash([]);
      context.beginPath();
      context.moveTo(corners[0].x, corners[0].y);
      for (let index = 1; index < corners.length; index += 1) {
        context.lineTo(corners[index].x, corners[index].y);
      }
      context.closePath();
      context.stroke();
      corners.forEach((corner, index) => {
        fillDot(context, corner.x, corner.y, dot, COLORS.corners);
        label(context, String(index), corner.x, corner.y, COLORS.corners, font, safeZoom);
      });

      // Pivot (centroid) and rotation anchor (top-edge midpoint).
      const centroid = {
        x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
        y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4,
      };
      fillDot(context, centroid.x, centroid.y, dot * 1.5, COLORS.pivot);
      label(context, "pivot", centroid.x, centroid.y, COLORS.pivot, font, safeZoom);

      const anchor = {
        x: (corners[0].x + corners[1].x) / 2,
        y: (corners[0].y + corners[1].y) / 2,
      };
      fillDot(context, anchor.x, anchor.y, dot, COLORS.rotationAnchor);
    }
  }

  if (input.pointerWorld !== null) {
    crosshair(context, input.pointerWorld.x, input.pointerWorld.y, 8 / safeZoom, COLORS.pointer, line);
    label(
      context,
      `${input.pointerWorld.x.toFixed(1)}, ${input.pointerWorld.y.toFixed(1)}`,
      input.pointerWorld.x,
      input.pointerWorld.y,
      COLORS.pointer,
      font,
      safeZoom,
    );
  }

  if (input.previewBounds !== null) {
    strokeRect(context, input.previewBounds, COLORS.preview, line * 2, []);
    label(
      context,
      "preview",
      input.previewBounds.x,
      input.previewBounds.y,
      COLORS.preview,
      font,
      safeZoom,
    );
  }

  context.restore();
}

function strokeRect(
  context: CanvasRenderingContext2D,
  rect: RectF,
  color: string,
  width: number,
  dash: number[],
): void {
  context.strokeStyle = color;
  context.lineWidth = width;
  context.setLineDash(dash);
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  context.setLineDash([]);
}

function fillDot(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
): void {
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function crosshair(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  width: number,
): void {
  context.strokeStyle = color;
  context.lineWidth = width;
  context.setLineDash([]);
  context.beginPath();
  context.moveTo(x - size, y);
  context.lineTo(x + size, y);
  context.moveTo(x, y - size);
  context.lineTo(x, y + size);
  context.stroke();
}

function label(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  fontSize: number,
  zoom: number,
): void {
  context.fillStyle = color;
  context.font = `${fontSize}px ui-monospace, monospace`;
  // Nudged up-left of the point by a screen-constant amount so the label does not sit
  // on top of the dot it names.
  context.fillText(text, x + 4 / zoom, y - 4 / zoom);
}
