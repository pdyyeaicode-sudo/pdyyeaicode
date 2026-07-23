/**
 * snapping — pure, side-effect-free snap/alignment math for the Editor_Canvas
 * Snap_Guide subsystem (task 6.1).
 *
 * Everything here is a pure function over plain numbers/strings so it is
 * trivially unit- and property-testable (supports Property 9: a guide is shown
 * for exactly those references within the 5px Editor_Canvas threshold, and
 * snapping adjusts position to the aligned coordinate independently on each
 * axis). The functions never touch the DOM or the Document_Model: the
 * `AlignmentGuides` component (and, later, the select/move tool in task 7.1)
 * feed plain `BBox` values and candidate `ReferenceLine`s into these helpers
 * and consume the resulting guides + per-axis offset.
 *
 * Coordinate model: all positions are in Editor_Canvas/model space (the same
 * space as the layer bounding boxes and the Artboard). The 5px threshold is
 * measured in *on-screen* Editor_Canvas pixels, so the caller divides it by the
 * current zoom (`effectiveModelThreshold`) before comparing in model space — a
 * true on-screen 5px regardless of zoom (Req 2.1, 2.4).
 *
 * One responsibility per file: snap geometry only.
 */

import type { BBox, LayerBox } from "./selectionMath";

/** Default on-screen snap threshold in Editor_Canvas pixels (Req 2.1, 2.4). */
export const SNAP_THRESHOLD_PX = 5;

/** The axis a reference line constrains: "x" = vertical line, "y" = horizontal line. */
export type SnapAxis = "x" | "y";

/**
 * Which feature of a box a reference line represents. On the x axis: "edge-start"
 * is the left edge, "edge-end" the right edge; on the y axis: "edge-start" the
 * top edge, "edge-end" the bottom edge. "center" is the box center on that axis
 * (horizontal center for x, vertical center for y).
 */
export type ReferenceKind = "edge-start" | "center" | "edge-end";

/**
 * A candidate alignment reference: a single straight line at `position` along
 * `axis`, contributed by another layer or by the Artboard. `source` identifies
 * the contributor ("artboard" or a layer id) for traceability/keys.
 */
export interface ReferenceLine {
  axis: SnapAxis;
  position: number; // coordinate in Editor_Canvas/model space
  source: string; // "artboard" or a layer id
  kind: ReferenceKind;
}

/** An active Snap_Guide to render (a reference within threshold of the drag). */
export interface SnapGuide {
  axis: SnapAxis;
  position: number;
  source: string;
  kind: ReferenceKind;
}

/**
 * Result of a snap computation for one dragged box: every reference within
 * threshold (each gets a guide, supporting multiple simultaneous guides —
 * Req 2.5), plus the per-axis snap offset to add to the box position. The two
 * offsets are computed independently per axis (Req 2.2, 4.2); `snappedX` /
 * `snappedY` indicate whether a snap applies on that axis.
 */
export interface SnapResult {
  guides: SnapGuide[];
  offsetX: number;
  offsetY: number;
  snappedX: boolean;
  snappedY: boolean;
}

/**
 * Convert the on-screen pixel threshold to a model-space threshold by dividing
 * by zoom, so the comparison is a true on-screen distance (Req 2.1, 2.4).
 * Non-finite or non-positive zoom falls back to the raw threshold so the math
 * can never produce a non-finite or negative tolerance.
 */
export function effectiveModelThreshold(screenThreshold: number, zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return screenThreshold;
  }
  return screenThreshold / zoom;
}

interface AxisCandidate {
  kind: ReferenceKind;
  pos: number;
}

/** The three alignment candidates along one axis: start edge, center, end edge. */
function axisCandidates(start: number, size: number): AxisCandidate[] {
  return [
    { kind: "edge-start", pos: start },
    { kind: "center", pos: start + size / 2 },
    { kind: "edge-end", pos: start + size },
  ];
}

/**
 * Build the six reference lines (left/center/right on x; top/center/bottom on y)
 * contributed by a single box.
 */
export function referenceLinesFromBox(source: string, box: BBox): ReferenceLine[] {
  return [
    { axis: "x", position: box.x, source, kind: "edge-start" },
    { axis: "x", position: box.x + box.width / 2, source, kind: "center" },
    { axis: "x", position: box.x + box.width, source, kind: "edge-end" },
    { axis: "y", position: box.y, source, kind: "edge-start" },
    { axis: "y", position: box.y + box.height / 2, source, kind: "center" },
    { axis: "y", position: box.y + box.height, source, kind: "edge-end" },
  ];
}

/**
 * Collect every candidate reference line for a drag: the edges and centers of
 * every other layer (Req 2.1) plus, when provided, the Artboard's edges and
 * center (Req 2.4). The dragged layer must be excluded from `others` by the
 * caller so a layer never snaps to itself.
 */
export function collectReferenceLines(
  others: readonly LayerBox[],
  artboard: { width: number; height: number } | null,
): ReferenceLine[] {
  const refs: ReferenceLine[] = [];
  for (const item of others) {
    refs.push(...referenceLinesFromBox(item.id, item.box));
  }
  if (artboard) {
    refs.push(
      ...referenceLinesFromBox("artboard", {
        x: 0,
        y: 0,
        width: artboard.width,
        height: artboard.height,
      }),
    );
  }
  return refs;
}

/**
 * Core snap computation. Given a dragged box, candidate reference lines, and a
 * model-space `threshold`, return:
 *
 *   - `guides`: every reference whose closest dragged candidate (start edge,
 *     center, or end edge on the matching axis) is within `threshold`. Each such
 *     reference yields a guide, so multiple references render simultaneously
 *     (Req 2.5). When no reference is within threshold the list is empty, so the
 *     caller hides all guides (Req 2.6).
 *   - `offsetX` / `offsetY`: the position adjustment to align the box to the
 *     nearest in-threshold reference on each axis, computed independently per
 *     axis (Req 2.2, 4.2). Zero when that axis has no in-threshold reference.
 *
 * Pure: never mutates its inputs.
 */
export function computeSnap(
  dragged: BBox,
  references: readonly ReferenceLine[],
  threshold: number,
): SnapResult {
  const xCandidates = axisCandidates(dragged.x, dragged.width);
  const yCandidates = axisCandidates(dragged.y, dragged.height);

  const guides: SnapGuide[] = [];
  let bestX: { dist: number; offset: number } | null = null;
  let bestY: { dist: number; offset: number } | null = null;

  for (const ref of references) {
    const candidates = ref.axis === "x" ? xCandidates : yCandidates;

    // Closest dragged candidate to this reference along its axis.
    let minDist = Number.POSITIVE_INFINITY;
    let offset = 0;
    for (const candidate of candidates) {
      const delta = ref.position - candidate.pos;
      const dist = Math.abs(delta);
      if (dist < minDist) {
        minDist = dist;
        offset = delta;
      }
    }

    if (minDist <= threshold) {
      guides.push({
        axis: ref.axis,
        position: ref.position,
        source: ref.source,
        kind: ref.kind,
      });
      if (ref.axis === "x") {
        if (bestX === null || minDist < bestX.dist) {
          bestX = { dist: minDist, offset };
        }
      } else if (bestY === null || minDist < bestY.dist) {
        bestY = { dist: minDist, offset };
      }
    }
  }

  return {
    guides,
    offsetX: bestX ? bestX.offset : 0,
    offsetY: bestY ? bestY.offset : 0,
    snappedX: bestX !== null,
    snappedY: bestY !== null,
  };
}

/**
 * Convenience wrapper that builds the reference lines for a drag and computes
 * the snap in one call, converting the on-screen pixel threshold to model space
 * for the current zoom. The dragged layer is identified by `draggedId` and
 * excluded from `allLayers` so it never snaps to itself.
 */
export function computeDragSnap(
  draggedId: string,
  dragged: BBox,
  allLayers: readonly LayerBox[],
  artboard: { width: number; height: number } | null,
  zoom: number,
  screenThreshold: number = SNAP_THRESHOLD_PX,
): SnapResult {
  const others = allLayers.filter((layer) => layer.id !== draggedId);
  const references = collectReferenceLines(others, artboard);
  const threshold = effectiveModelThreshold(screenThreshold, zoom);
  return computeSnap(dragged, references, threshold);
}
