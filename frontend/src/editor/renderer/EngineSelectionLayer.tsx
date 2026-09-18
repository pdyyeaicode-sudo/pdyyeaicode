"use client";

/**
 * EngineSelectionLayer — the selection box, driven by the ENGINE's own geometry.
 *
 * ## Why this exists
 *
 * The box was invisible. `EditorCanvas` passed `selectionLayer={null}` to the Skia
 * overlay, so nothing drew it on the canvas path — and the DOM overlay, the only other
 * chrome, gets its geometry from `useSelectionGeometry`, which measures the
 * `.svg-canvas-wrapper` element. On the engine path that element is hidden and its
 * measurement came back unusable, so the DOM overlay resolved a null box and drew
 * nothing either. Two chrome renderers, neither drawing.
 *
 * A browser probe settled which source is trustworthy: the engine's
 * `chromeGeometry(layerId, zoom)` returns the object's four world corners, its local
 * bounds and its world transform — correct, at every zoom — because it is the same
 * matrix the engine painted the object with. The DOM measurement is the one that fails.
 * So this layer reads the engine and never measures the DOM.
 *
 * ## What it draws, and how the handles work
 *
 * It hands an `OrientedBox` to `SelectionCanvas`, which paints, in document space,
 * inside the shared pan/zoom transform:
 *
 *   - the outline, as a polygon through the four corners;
 *   - eight square handles — four DIAGONAL CORNERS that scale width and height together,
 *     and four EDGE MIDPOINTS that scale one axis;
 *   - a round rotation control on a stalk off the top edge.
 *
 * The handles are interpolations of the corners, so they rotate, scale and flip with the
 * object for free. Dragging one is solved by the existing gesture bridge; this component
 * only draws.
 *
 * ## Following a move
 *
 * The committed corners come from the document, so during a drag they would lag a frame.
 * `SelectionCanvas` closes that by subscribing to `liveTransforms`: the same retained
 * state that moves the object moves the box, in the same frame, with no React render.
 * That is what makes the box stay stuck to the shape while it is dragged around.
 *
 * ## Following everything else
 *
 * The box is recomputed whenever the selection, the committed document or the viewport
 * changes, because all three move the object. The document revision is the signal that a
 * commit landed — a move, resize or rotate — so the box re-reads the engine after every
 * gesture rather than only after a selection change.
 *
 * One responsibility per file: turning the engine's geometry into a drawn selection box.
 */

import { useEffect, useState } from "react";

import { SelectionCanvas } from "./SelectionCanvas";
import type { GestureBridge } from "../interaction/gestureBridge";
import type { LiveTransformStore } from "../interaction/liveTransformStore";
import type { OrientedBox } from "../geometry/selectionGeometry";
import { worldPoint } from "../geometry/coordinateSpaces";
import type { Matrix2D } from "./matrix2d";
import type { Viewport } from "../types/documentModel";

export interface EngineSelectionLayerProps {
  /** Artboard size in document pixels; the canvas is exactly this size. */
  readonly width: number;
  readonly height: number;
  readonly viewport: Viewport;
  /** The selected layer ids. Only a single selection gets an oriented box today. */
  readonly selectedIds: readonly string[];
  /** Reads the engine's world-space geometry for a layer. Null before the engine loads. */
  readonly resolveGestureBridge: () => GestureBridge | null;
  /** Retained gesture state, so the box follows a drag in the same frame. */
  readonly liveTransforms?: LiveTransformStore;
  /**
   * The committed document's revision.
   *
   * A monotonically changing value that a commit alters, so the box re-reads the engine
   * after every gesture. Without it the box would recompute only on selection change and
   * so would lag one commit behind after every resize and rotate.
   */
  readonly documentRevision: unknown;
}

/**
 * Build an `OrientedBox` from the engine's chrome geometry.
 *
 * `chromeGeometry` already returns the four corners, the local bounds and the world
 * transform — the exact fields `OrientedBox` needs — so this is a re-wrap, not a second
 * computation. The corners are the authority; `localBounds` and `worldTransform` ride
 * along only so a resize can map back into local space.
 */
function orientedBoxFromEngine(
  bridge: GestureBridge,
  layerId: string,
  zoom: number,
): OrientedBox | null {
  const geometry = bridge.chromeGeometry(layerId, zoom);
  if (geometry === null) {
    return null;
  }
  const corners = geometry.corners;
  if (corners.length !== 4) {
    return null;
  }
  if (!corners.every((corner) => Number.isFinite(corner.x) && Number.isFinite(corner.y))) {
    // A degenerate transform. Drawing nothing is correct; a guessed box is the defect
    // this whole approach removes.
    return null;
  }
  return {
    topLeft: worldPoint(corners[0].x, corners[0].y),
    topRight: worldPoint(corners[1].x, corners[1].y),
    bottomRight: worldPoint(corners[2].x, corners[2].y),
    bottomLeft: worldPoint(corners[3].x, corners[3].y),
    localBounds: { ...geometry.localBounds },
    // Reconstructed from the corners and the local bounds rather than taken as a field,
    // because the engine reports the two OBSERVABLES — where the box is and what its
    // untransformed extent was — not the matrix between them. The reconstruction is
    // exact for any affine (see `worldTransformFromCorners`), and it is only consulted
    // by resize maths, which re-solves from a fresh gesture anyway.
    worldTransform: worldTransformFromCorners(geometry.localBounds, corners),
  };
}

/**
 * The affine that maps the local-bounds rect onto the four world corners.
 *
 * The engine gives the corners and the local box; this recovers the transform between
 * them. A rect maps to a parallelogram under an affine, and the top edge plus the left
 * edge of that parallelogram are exactly the transform's basis vectors scaled by the
 * box's width and height:
 *
 *   worldTopLeft   = M · (bx, by)
 *   worldTopRight  = M · (bx + bw, by)      -> (topRight - topLeft) / bw is M's x basis
 *   worldBottomLeft= M · (bx, by + bh)      -> (bottomLeft - topLeft) / bh is M's y basis
 *
 * and the translation follows from the top-left corner. A zero-extent box has no basis
 * on that axis, so identity on it is returned — the corners still drive the drawing.
 */
function worldTransformFromCorners(
  localBounds: { x: number; y: number; width: number; height: number },
  corners: readonly { readonly x: number; readonly y: number }[],
): Matrix2D {
  const [topLeft, topRight, , bottomLeft] = corners;
  const width = localBounds.width;
  const height = localBounds.height;
  const a = width !== 0 ? (topRight.x - topLeft.x) / width : 1;
  const b = width !== 0 ? (topRight.y - topLeft.y) / width : 0;
  const c = height !== 0 ? (bottomLeft.x - topLeft.x) / height : 0;
  const d = height !== 0 ? (bottomLeft.y - topLeft.y) / height : 1;
  // Translation solves worldTopLeft = M · localTopLeft.
  const e = topLeft.x - (a * localBounds.x + c * localBounds.y);
  const f = topLeft.y - (b * localBounds.x + d * localBounds.y);
  return { a, b, c, d, e, f };
}

export function EngineSelectionLayer({
  width,
  height,
  viewport,
  selectedIds,
  resolveGestureBridge,
  liveTransforms,
  documentRevision,
}: EngineSelectionLayerProps): JSX.Element | null {
  const [obb, setObb] = useState<OrientedBox | null>(null);

  /*
    Re-read the engine whenever anything that moves the object changes.

    A single selection is what gets an oriented box; a multi-selection has no single
    orientation and is left to the axis-aligned path elsewhere. `resolveGestureBridge`
    is intentionally NOT a dependency: it is a stable ref-reader, and depending on it
    would not help — the engine's arrival is observed through `documentRevision` and the
    selection instead.

    A short poll covers the gap between the engine loading and the first document
    revision that reflects it: `chromeGeometry` starts answering only once the scene is
    uploaded, which can be a frame or two after this effect first runs. The poll stops
    the moment it gets a box.
  */
  useEffect(() => {
    if (selectedIds.length !== 1) {
      setObb(null);
      return undefined;
    }
    const layerId = selectedIds[0];
    const zoom = viewport.zoom || 1;

    let cancelled = false;
    let attempts = 0;

    const read = (): boolean => {
      const bridge = resolveGestureBridge();
      if (bridge === null) {
        return false;
      }
      const next = orientedBoxFromEngine(bridge, layerId, zoom);
      if (next === null) {
        return false;
      }
      if (!cancelled) {
        setObb(next);
      }
      return true;
    };

    if (read()) {
      return undefined;
    }
    // Not yet resolvable. Poll briefly rather than giving up, because the engine may
    // still be uploading the scene. Bounded so a genuinely absent layer cannot spin.
    const timer = window.setInterval(() => {
      attempts += 1;
      if (cancelled || read() || attempts > 60) {
        window.clearInterval(timer);
      }
    }, 16);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedIds, viewport.zoom, viewport.panX, viewport.panY, documentRevision, resolveGestureBridge]);

  if (obb === null) {
    return null;
  }
  return (
    <SelectionCanvas
      width={width}
      height={height}
      viewport={viewport}
      obb={obb}
      liveTransforms={liveTransforms}
    />
  );
}

export default EngineSelectionLayer;
