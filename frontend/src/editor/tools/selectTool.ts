/**
 * selectTool — pure, side-effect-free logic for the Select / Move / Transform
 * tool (task 7.1, design.md "Tools State Machine"; Req 4.1–4.6).
 *
 * This module turns a user intent (a pointer drag, a corner-handle drag, or an
 * arrow-key press) into at most one reversible `Command` to dispatch. Every
 * function is pure over plain values so it is trivially unit- and
 * property-testable (Property 10 translate-by-delta, Property 11 corner-handle
 * resize): it never touches the DOM, React state, or the History_Stack. The
 * eventual canvas wiring (task 14.1) measures on-screen geometry, converts it to
 * model space, and feeds plain `BBox` values into these helpers, then dispatches
 * the returned command.
 *
 * Command contract enforced here (design.md "Command / History System"):
 *   - Locked layers are inert — any move/resize on a locked layer returns `null`
 *     (no Command, Req 4.5).
 *   - A zero-effect operation (zero net delta after snapping, or a resize that
 *     does not change the layer's stored geometry/box) returns `null` so the
 *     dispatcher records nothing (Req 4.6, "no-op → no Command").
 *   - Any non-zero operation returns exactly one Command (Req 4.6).
 *
 * Commands themselves capture their inverse data at construction, so the
 * factories reused here (`translateLayerCommand`, `resizeLayerCommand`) keep
 * `apply`/`undo` pure and exactly invertible.
 *
 * One responsibility per file: pointer/keyboard intent → Command for the select
 * tool. Snap geometry lives in `snapping.ts`; geometry/box math lives here only
 * to shape the resize snapshots.
 */

import {
  resizeLayerCommand,
  translateLayerCommand,
  type ResizeSnapshot,
} from "../commands";
import type { Command, DocumentLayer, ShapeGeometry } from "../types/documentModel";
import type { BBox, LayerBox } from "../selectionMath";
import { computeDragSnap, SNAP_THRESHOLD_PX } from "../snapping";

/** Distance, in pixels, of a single arrow-key nudge (Req 4.4). */
export const NUDGE_STEP_PX = 1;

/** The four arrow-key directions for a 1px nudge (Req 4.4). */
export type NudgeDirection = "up" | "down" | "left" | "right";

/** The four corner selection handles, each resizing along its diagonal (Req 4.3). */
export type CornerHandle = "nw" | "ne" | "se" | "sw";

/**
 * Context required to apply center/edge snapping during a drag-translate
 * (Req 4.2 center-snap; Req 2.x alignment). When omitted, a drag translates by
 * the raw pointer delta with no snapping. `allLayerBoxes` should include every
 * candidate layer (the dragged layer is filtered out by id); `artboard`
 * contributes the canvas edges and center reference (canvas-center snap, Req 4.2).
 */
export interface SnapContext {
  allLayerBoxes: readonly LayerBox[];
  artboard: { width: number; height: number } | null;
  zoom: number;
  thresholdPx?: number;
}

/** Map an arrow-key direction to a unit (dx, dy) delta of `NUDGE_STEP_PX`. */
export function computeNudgeDelta(direction: NudgeDirection): { dx: number; dy: number } {
  switch (direction) {
    case "left":
      return { dx: -NUDGE_STEP_PX, dy: 0 };
    case "right":
      return { dx: NUDGE_STEP_PX, dy: 0 };
    case "up":
      return { dx: 0, dy: -NUDGE_STEP_PX };
    case "down":
    default:
      return { dx: 0, dy: NUDGE_STEP_PX };
  }
}

/**
 * Build the translate Command for a drag from pointer-down to pointer-release
 * (Req 4.1). The net delta is the raw pointer delta plus any per-axis snap
 * offset (Req 4.2). Returns `null` for a locked layer (inert, Req 4.5) or when
 * the net delta is zero on both axes (no-op → no Command, Req 4.6).
 *
 * `layerBox` is the dragged layer's current model-space bounding box; it is used
 * only to evaluate snapping and is never mutated.
 */
export function dragTranslateCommand(
  layer: DocumentLayer,
  layerBox: BBox,
  dx: number,
  dy: number,
  snap?: SnapContext,
): Command | null {
  if (layer.locked) {
    return null;
  }

  let netDx = dx;
  let netDy = dy;

  if (snap) {
    const proposed: BBox = {
      x: layerBox.x + dx,
      y: layerBox.y + dy,
      width: layerBox.width,
      height: layerBox.height,
    };
    const result = computeDragSnap(
      layer.id,
      proposed,
      snap.allLayerBoxes,
      snap.artboard,
      snap.zoom,
      snap.thresholdPx ?? SNAP_THRESHOLD_PX,
    );
    netDx = dx + result.offsetX;
    netDy = dy + result.offsetY;
  }

  if (netDx === 0 && netDy === 0) {
    return null;
  }
  return translateLayerCommand(layer.id, netDx, netDy);
}

/**
 * Build the translate Command for a single arrow-key nudge of exactly 1px in the
 * pressed direction (Req 4.4). Returns `null` for a locked layer (Req 4.5). A
 * nudge always has a non-zero delta, so an unlocked layer always yields exactly
 * one Command (Req 4.6).
 */
export function nudgeCommand(layer: DocumentLayer, direction: NudgeDirection): Command | null {
  if (layer.locked) {
    return null;
  }
  const { dx, dy } = computeNudgeDelta(direction);
  return translateLayerCommand(layer.id, dx, dy);
}

/**
 * Apply a corner-handle drag delta to a bounding box, resizing along the
 * handle's diagonal with the opposite corner held fixed (Req 4.3). The size
 * changes by exactly the drag delta along the diagonal; no clamping is applied
 * here so the pure delta relationship holds (callers constrain to avoid
 * degenerate sizes).
 */
export function applyCornerDelta(box: BBox, handle: CornerHandle, dx: number, dy: number): BBox {
  switch (handle) {
    case "se": // anchor = nw corner
      return { x: box.x, y: box.y, width: box.width + dx, height: box.height + dy };
    case "nw": // anchor = se corner
      return { x: box.x + dx, y: box.y + dy, width: box.width - dx, height: box.height - dy };
    case "ne": // anchor = sw corner
      return { x: box.x, y: box.y + dy, width: box.width + dx, height: box.height - dy };
    case "sw": // anchor = ne corner
    default:
      return { x: box.x + dx, y: box.y, width: box.width - dx, height: box.height + dy };
  }
}

/**
 * Build the resize Command for a corner-handle drag (Req 4.3). Captures the
 * layer's previous and next spatial snapshots so the operation is exactly
 * invertible. Returns `null` when the layer is locked (inert, Req 4.5), when the
 * layer family has no resizable box (group, or a text layer whose box origin is
 * unchanged), or when the resize produces no actual change (no-op → no Command,
 * Req 4.6).
 *
 * `prevBox` is the layer's current model-space bounding box (measured by the
 * caller). For shape layers the next geometry is fitted to the resized box; for
 * image and text layers a box snapshot is captured (text restores x/y only,
 * matching `resizeLayerCommand`).
 */
export function cornerResizeCommand(
  layer: DocumentLayer,
  prevBox: BBox,
  handle: CornerHandle,
  dx: number,
  dy: number,
): Command | null {
  if (layer.locked) {
    return null;
  }

  const nextBox = applyCornerDelta(prevBox, handle, dx, dy);
  const snapshots = resizeSnapshots(layer, prevBox, nextBox);
  if (!snapshots) {
    return null;
  }
  return resizeLayerCommand(layer.id, snapshots.prev, snapshots.next);
}

interface SnapshotPair {
  prev: ResizeSnapshot;
  next: ResizeSnapshot;
}

/**
 * Capture the previous and next resize snapshots for a layer, or `null` when the
 * layer cannot be resized into a box (group layers) or the resize would not
 * change the layer's stored fields (a no-op for the layer's family).
 */
function resizeSnapshots(layer: DocumentLayer, prevBox: BBox, nextBox: BBox): SnapshotPair | null {
  switch (layer.kind) {
    case "group":
      return null;

    case "image": {
      if (boxesEqual(prevBox, nextBox)) {
        return null;
      }
      return {
        prev: { kind: "box", x: prevBox.x, y: prevBox.y, width: prevBox.width, height: prevBox.height },
        next: { kind: "box", x: nextBox.x, y: nextBox.y, width: nextBox.width, height: nextBox.height },
      };
    }

    case "text": {
      // Text boxes are glyph-driven; resizeLayerCommand restores only x/y, so a
      // resize that leaves the box origin unchanged (e.g. an SE-handle drag) is
      // a no-op for text.
      if (prevBox.x === nextBox.x && prevBox.y === nextBox.y) {
        return null;
      }
      return {
        prev: { kind: "box", x: prevBox.x, y: prevBox.y, width: prevBox.width, height: prevBox.height },
        next: { kind: "box", x: nextBox.x, y: nextBox.y, width: nextBox.width, height: nextBox.height },
      };
    }

    default: {
      // rect | ellipse | line | polygon | path
      const nextGeometry = fitGeometryToBox(layer.geometry, prevBox, nextBox);
      if (geometriesEqual(layer.geometry, nextGeometry)) {
        return null;
      }
      return {
        prev: { kind: "geometry", geometry: layer.geometry },
        next: { kind: "geometry", geometry: nextGeometry },
      };
    }
  }
}

/**
 * Re-fit a shape geometry from its previous bounding box to a new bounding box,
 * scaling coordinates proportionally per axis. Rectangles and ellipses map
 * directly; lines, polygons, and paths scale their points relative to the box.
 */
export function fitGeometryToBox(geometry: ShapeGeometry, prevBox: BBox, nextBox: BBox): ShapeGeometry {
  const sx = prevBox.width === 0 ? 1 : nextBox.width / prevBox.width;
  const sy = prevBox.height === 0 ? 1 : nextBox.height / prevBox.height;
  const mapX = (x: number): number => nextBox.x + (x - prevBox.x) * sx;
  const mapY = (y: number): number => nextBox.y + (y - prevBox.y) * sy;

  switch (geometry.type) {
    case "rect":
      return { ...geometry, x: nextBox.x, y: nextBox.y, width: nextBox.width, height: nextBox.height };
    case "ellipse":
      return {
        ...geometry,
        cx: nextBox.x + nextBox.width / 2,
        cy: nextBox.y + nextBox.height / 2,
        rx: nextBox.width / 2,
        ry: nextBox.height / 2,
      };
    case "line":
      return {
        ...geometry,
        x1: mapX(geometry.x1),
        y1: mapY(geometry.y1),
        x2: mapX(geometry.x2),
        y2: mapY(geometry.y2),
      };
    case "polygon":
      return {
        ...geometry,
        points: geometry.points.map(([px, py]) => [mapX(px), mapY(py)] as [number, number]),
      };
    case "parametric":
      return {
        ...geometry,
        x: nextBox.x,
        y: nextBox.y,
        width: nextBox.width,
        height: nextBox.height,
      };
    case "path":
    default:
      return { ...geometry, d: scalePathData(geometry.d, prevBox, nextBox) };
  }
}

/**
 * Scale the coordinates of an SVG path `d` string from `prevBox` to `nextBox`.
 * Absolute command coordinates are mapped through `prevBox -> nextBox`; relative
 * command deltas are scaled by the per-axis factor (no origin offset). Arc
 * radii/rotation/flags are left untouched.
 */
export function scalePathData(d: string, prevBox: BBox, nextBox: BBox): string {
  if (!d) {
    return d;
  }
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!tokens) {
    return d;
  }

  const sx = prevBox.width === 0 ? 1 : nextBox.width / prevBox.width;
  const sy = prevBox.height === 0 ? 1 : nextBox.height / prevBox.height;
  const mapX = (x: number): number => nextBox.x + (x - prevBox.x) * sx;
  const mapY = (y: number): number => nextBox.y + (y - prevBox.y) * sy;

  const out: string[] = [];
  let command = "";
  let operandIndex = 0;

  for (const token of tokens) {
    if (/^[a-zA-Z]$/.test(token)) {
      command = token;
      operandIndex = 0;
      out.push(token);
      continue;
    }

    const value = Number.parseFloat(token);
    const isAbsolute = command === command.toUpperCase();
    const axis = pathAxisFor(command.toUpperCase(), operandIndex);
    if (axis === "x") {
      out.push(formatCoordinate(isAbsolute ? mapX(value) : value * sx));
    } else if (axis === "y") {
      out.push(formatCoordinate(isAbsolute ? mapY(value) : value * sy));
    } else {
      out.push(token);
    }
    operandIndex += 1;
  }

  return out.join(" ");
}

/**
 * For an (uppercased) path command and the zero-based operand position, return
 * whether the operand is an `x`/`y` coordinate or neither (radii, rotation,
 * flags). Mirrors the absolute/relative-agnostic operand layout of SVG path
 * commands.
 */
function pathAxisFor(command: string, operandIndex: number): "x" | "y" | null {
  switch (command) {
    case "M":
    case "L":
    case "T":
      return operandIndex % 2 === 0 ? "x" : "y";
    case "H":
      return "x";
    case "V":
      return "y";
    case "C": {
      const slot = operandIndex % 6;
      return slot % 2 === 0 ? "x" : "y";
    }
    case "S":
    case "Q": {
      const slot = operandIndex % 4;
      return slot % 2 === 0 ? "x" : "y";
    }
    case "A": {
      const slot = operandIndex % 7;
      if (slot === 5) {
        return "x";
      }
      if (slot === 6) {
        return "y";
      }
      return null;
    }
    default:
      return null;
  }
}

function formatCoordinate(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Number(value.toFixed(4)));
}

function boxesEqual(a: BBox, b: BBox): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function geometriesEqual(a: ShapeGeometry, b: ShapeGeometry): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
