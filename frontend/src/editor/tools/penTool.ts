/**
 * penTool — pure path-construction logic for the pen tool (Req 8.1–8.5,
 * design.md "Tools State Machine" → Pen state).
 *
 * This module owns the click→anchor flow and the completion rules as pure,
 * immutable functions so they are unit-testable in isolation from React and the
 * canvas DOM. Render-time concerns (rendering the in-progress path within 100ms,
 * Req 8.1) are left to the wiring (task 14.1); this module exposes
 * `previewPathData` so the wiring can render a live preview.
 *
 * Completion rules:
 *  - Closing the path by clicking the initial anchor (`close`) or finalizing via
 *    Enter / Escape / tool-change (`finalize`) with >= 2 anchors produces a
 *    `<path>` `ShapeLayer` in the `shapes` group with a unique `data-layer-id`
 *    and a non-empty `data-field`, wrapped in one `createLayerCommand`
 *    (Req 8.2, 8.3, 8.4).
 *  - Closing or finalizing with < 2 anchors discards the path: no command and a
 *    "discarded" signal for the wiring to surface (Req 8.5).
 *
 * Uniqueness of the new `data-layer-id` is guaranteed against the set of
 * existing layer ids, which the caller passes in (the model owns no document
 * state). One responsibility per file: pen-session construction + completion.
 */

import { createLayerCommand } from "../commands/createLayerCommand";
import { mintId } from "../commands/helpers";
import type { Command, ShapeLayer } from "../types/documentModel";

/** A single anchor point in artboard (model-space) coordinates. */
export interface PenAnchor {
  readonly x: number;
  readonly y: number;
}

/**
 * Immutable in-progress pen path. Holds only the accumulated anchors; whether
 * the path is closed is decided at completion time (`close` vs `finalize`).
 */
export interface PenSession {
  readonly anchors: readonly PenAnchor[];
}

/** Options shared by `close` and `finalize` when building the path layer. */
export interface PenCompletionOptions {
  /**
   * All layer ids currently present in the document. The new path's
   * `data-layer-id` is made unique against this set (Req 8.2, 8.3).
   */
  readonly existingLayerIds: readonly string[];
  /** Base for the new layer id; defaults to a process-unique `path-…` id. */
  readonly idBase?: string;
  /** Non-empty `data-field` for the new path; defaults to `"path"` (Req 8.2). */
  readonly field?: string;
  /** Display name (`data-name`); defaults to `"Path"`. */
  readonly name?: string;
  /** Stroke color applied to the new path; defaults to `"#000000"`. */
  readonly stroke?: string;
  /** Stroke width applied to the new path; defaults to `1`. */
  readonly strokeWidth?: number;
  /** Fill color; defaults to `"none"` so open paths read as strokes. */
  readonly fill?: string;
  /** Insertion index among the active artboard's top-level layers. */
  readonly position?: number;
}

/** Result of completing a pen session (Req 8.2–8.5). */
export type PenCompletion =
  | { readonly status: "created"; readonly layer: ShapeLayer; readonly command: Command }
  | { readonly status: "discarded"; readonly reason: string };

/** Minimum anchors required to produce a `<path>` (Req 8.2, 8.3, 8.5). */
export const MIN_PATH_ANCHORS = 2;

/** Default radius (model-space units) for detecting a click on the first anchor. */
export const DEFAULT_CLOSE_THRESHOLD = 6;

const DISCARDED_REASON =
  "Path discarded: a path needs at least two anchor points.";

/** An empty pen session with no anchors. */
export function createPenSession(): PenSession {
  return { anchors: [] };
}

/**
 * Return a new session with `anchor` appended (Req 8.1). The input session is
 * never mutated.
 */
export function addAnchor(session: PenSession, anchor: PenAnchor): PenSession {
  return { anchors: [...session.anchors, anchor] };
}

/** Number of anchors accumulated so far. */
export function anchorCount(session: PenSession): number {
  return session.anchors.length;
}

/**
 * True when `point` lands within `threshold` (model-space units) of the
 * session's first anchor, i.e. the gesture that closes the path. False when the
 * session has no anchors. The wiring uses this to choose between `addAnchor`
 * and `close` on each click.
 */
export function isOnFirstAnchor(
  session: PenSession,
  point: PenAnchor,
  threshold: number = DEFAULT_CLOSE_THRESHOLD,
): boolean {
  const first = session.anchors[0];
  if (!first) {
    return false;
  }
  return Math.hypot(point.x - first.x, point.y - first.y) <= threshold;
}

/**
 * Build an SVG path `d` string from anchors. The first anchor becomes a
 * `moveto`, the rest `lineto`; when `closed` is true a `Z` closepath is
 * appended. Coordinates are snapped to the 0.5px Canonical_SVG grid for print
 * sharpness (AGENTS.md SVG rules). Returns `""` for zero anchors.
 */
export function buildPathData(
  anchors: readonly PenAnchor[],
  options: { readonly closed?: boolean } = {},
): string {
  if (anchors.length === 0) {
    return "";
  }
  const segments = anchors.map((anchor, index) => {
    const command = index === 0 ? "M" : "L";
    return `${command} ${formatCoordinate(anchor.x)} ${formatCoordinate(anchor.y)}`;
  });
  if (options.closed) {
    segments.push("Z");
  }
  return segments.join(" ");
}

/**
 * The `d` string for the in-progress (open) path, for live preview rendering
 * by the wiring (Req 8.1). Returns `""` when there are no anchors yet.
 */
export function previewPathData(session: PenSession): string {
  return buildPathData(session.anchors, { closed: false });
}

/**
 * Complete the path by closing it on the initial anchor (Req 8.2). With >= 2
 * anchors this yields a closed `<path>` layer + one create command; with fewer
 * it is discarded (Req 8.5).
 */
export function close(session: PenSession, options: PenCompletionOptions): PenCompletion {
  return complete(session, true, options);
}

/**
 * Complete the path without closing it — Enter, Escape, or a tool change
 * (Req 8.3). With >= 2 anchors this yields an open `<path>` layer + one create
 * command; with fewer it is discarded (Req 8.5).
 */
export function finalize(session: PenSession, options: PenCompletionOptions): PenCompletion {
  return complete(session, false, options);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function complete(
  session: PenSession,
  closed: boolean,
  options: PenCompletionOptions,
): PenCompletion {
  if (session.anchors.length < MIN_PATH_ANCHORS) {
    return { status: "discarded", reason: DISCARDED_REASON };
  }

  const layer = buildPathLayer(session, closed, options);
  return { status: "created", layer, command: createLayerCommand(layer, options.position) };
}

function buildPathLayer(
  session: PenSession,
  closed: boolean,
  options: PenCompletionOptions,
): ShapeLayer {
  const id = uniqueLayerId(options.existingLayerIds, options.idBase ?? mintId("path"));
  const field = options.field && options.field.length > 0 ? options.field : "path";
  return {
    id,
    role: "shapes",
    name: options.name && options.name.length > 0 ? options.name : "Path",
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "path",
    field,
    geometry: { type: "path", d: buildPathData(session.anchors, { closed }) },
    fill: options.fill ?? "none",
    stroke: options.stroke ?? "#000000",
    strokeWidth: options.strokeWidth ?? 1,
  };
}

/**
 * Return an id derived from `base` that is unique among `existing`. When `base`
 * is free it is used as-is; otherwise a `-2`, `-3`, … suffix is appended until
 * an unused id is found (Req 8.2, 8.3).
 */
function uniqueLayerId(existing: readonly string[], base: string): string {
  const taken = new Set(existing);
  if (!taken.has(base)) {
    return base;
  }
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

/** Snap to the 0.5px grid and format without trailing-zero noise. */
function formatCoordinate(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const snapped = Math.round(value * 2) / 2;
  return Number.isInteger(snapped) ? String(snapped) : String(snapped);
}
