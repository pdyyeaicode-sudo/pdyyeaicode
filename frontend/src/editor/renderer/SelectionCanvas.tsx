"use client";

/**
 * SelectionCanvas — the selection box, handles and rotation control, drawn on a
 * canvas that shares the design canvas's coordinate transform exactly.
 *
 * ## Why a canvas and not DOM elements
 *
 * Positioning DOM elements over a rendered object means two systems have to agree
 * about where that object is, every frame. They did not: the selection box measured
 * `getBoundingClientRect`, the renderer used `worldTransform`, and the two drifted the
 * moment anything rotated. Every geometry defect in this codebase came from that seam.
 *
 * Here, coincidence is STRUCTURAL rather than asserted. This canvas is
 *
 *   - the same pixel size as the design canvas (the artboard's native size), and
 *   - inside the same CSS transform the stage applies for pan and zoom,
 *
 * so a point drawn at document coordinate `p` lands on exactly the pixel where the
 * engine drew document coordinate `p`. Nothing converts between the two, so nothing
 * can disagree.
 *
 * ## One mathematical source of truth
 *
 * The corners come from `obbForNode`, which is `worldTransform × localCorner` — the
 * same matrix the engine rendered with. Handles are interpolated from those corners,
 * so rotation, scale, skew, flip and every ancestor group transform are already
 * included and this file contains no trigonometry at all.
 *
 * ## The one place zoom appears
 *
 * Handle size must stay constant on screen, but the canvas is CSS-scaled by zoom, so a
 * handle drawn in document units would scale with it. Sizes are therefore divided by
 * zoom. That is a LENGTH, never a position — positions are pure document coordinates.
 *
 * ## Live gestures
 *
 * The committed OBB comes from the document, so during a gesture it would lag a frame
 * behind the engine's preview. Subscribing to the live-transform store closes that:
 * the same retained state that moves the object moves the box, in the same frame, with
 * no React render and no DOM write. A resize or a rotate publishes the object's world
 * CORNERS for the frame — derived by whoever solved the gesture, from the same matrix
 * the pixels were drawn with — so this file still contains no transform mathematics.
 *
 * One responsibility per file: painting selection chrome in document space.
 */

import { useCallback, useEffect, useRef } from "react";

import { obbCorners, type OrientedBox } from "../geometry/selectionGeometry";
import type { LiveTransformStore } from "../interaction/liveTransformStore";
import type { Viewport } from "../types/documentModel";
import {
  HANDLE_BORDER_PX,
  HANDLE_SIZE_PX,
  OUTLINE_WIDTH_PX,
  ROTATION_OFFSET_PX,
  ROTATION_RADIUS_PX,
} from "./selectionChrome";
import { drawSelectionDebug, isSelectionDebugEnabled } from "./selectionDebug";
import type { RectF } from "./matrix2d";

const ACCENT = "#0d99ff";
const HANDLE_FILL = "#ffffff";

export interface SelectionCanvasProps {
  /** Artboard size in document pixels; the canvas is exactly this size. */
  readonly width: number;
  readonly height: number;
  /** Same transform the design canvas uses, so the two scale together. */
  readonly viewport: Viewport;
  /**
   * The selected object's oriented box in WORLD (document) space, or null.
   *
   * World space and document space are the same thing here, which is precisely why
   * this component needs no conversion.
   */
  readonly obb: OrientedBox | null;
  /** Retained gesture state, so the box follows a drag in the same frame. */
  readonly liveTransforms?: LiveTransformStore;
  /**
   * The last pointer position in DOCUMENT space, for the debug overlay only.
   *
   * Optional and consumed only when geometry debugging is enabled, so the normal path
   * neither computes nor passes it.
   */
  readonly debugPointerWorld?: { readonly x: number; readonly y: number } | null;
  /** The live shape-creation preview's bounds, for the debug overlay only. */
  readonly debugPreviewBounds?: RectF | null;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

export function SelectionCanvas({
  width,
  height,
  viewport,
  obb,
  liveTransforms,
  debugPointerWorld = null,
  debugPreviewBounds = null,
}: SelectionCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /**
   * The area the chrome covered last frame, in canvas pixels.
   *
   * Clearing the WHOLE canvas each frame is proportional to the artboard, and the chrome
   * is not: measured on a 1080x1080 artboard, the engine spent about 1ms per gesture frame
   * while the delivered rate was still half of 60fps, because this canvas was clearing 1.17
   * megapixels to redraw a box a couple of hundred pixels across. Clearing the union of
   * where the chrome WAS and where it now is makes the cost proportional to the chrome.
   *
   * Null means "clear everything": the state after a resize, or after a frame that could
   * not compute its own bounds. Refusing to guess a region is what keeps a stale outline
   * from being left behind.
   */
  const paintedRef = useRef<{ x: number; y: number; width: number; height: number } | null>(
    null,
  );

  // Mirrored so the draw callback is stable and the frame subscription never has to
  // be torn down when the selection or the viewport changes.
  const obbRef = useRef(obb);
  obbRef.current = obb;
  const zoomRef = useRef(viewport.zoom || 1);
  zoomRef.current = viewport.zoom || 1;
  const debugPointerRef = useRef(debugPointerWorld);
  debugPointerRef.current = debugPointerWorld;
  const debugPreviewRef = useRef(debugPreviewBounds);
  debugPreviewRef.current = debugPreviewBounds;

  const draw = useCallback((): void => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const context = canvas.getContext("2d");
    if (context === null) {
      return;
    }

    /**
     * The debug overlay, drawn AFTER the chrome so its primitives sit on top.
     *
     * Reads the committed OBB (not the live one): the debug view is for diagnosing where
     * things ARE, and the committed box plus the separately-drawn preview bounds is the
     * clearer picture. A no-op unless the flag is set, and its own full clear already
     * ran above, so this only adds ink.
     */
    const drawDebugOverlay = (box: OrientedBox | null): void => {
      drawSelectionDebug(
        context,
        {
          obb: box,
          pointerWorld: debugPointerRef.current ?? null,
          previewBounds: debugPreviewRef.current ?? null,
        },
        zoomRef.current,
      );
    };

    /**
     * Clear only what the chrome touched, and remember what it will touch.
     *
     * `next` is null when nothing is about to be drawn, in which case the previous area is
     * cleared and the canvas is left empty.
     */
    const clearAndRecord = (
      next: { x: number; y: number; width: number; height: number } | null,
    ): void => {
      const previous = paintedRef.current;
      if (previous === null) {
        // No record of what was there, so everything goes. This is also the state right
        // after a resize, where the canvas is already blank and the clear costs nothing.
        context.clearRect(0, 0, canvas.width, canvas.height);
      } else if (next === null) {
        context.clearRect(previous.x, previous.y, previous.width, previous.height);
      } else {
        // The union, in one clear: two clears of a moving box overlap heavily, and a single
        // rect is cheaper than the bookkeeping to avoid the overlap.
        const left = Math.min(previous.x, next.x);
        const top = Math.min(previous.y, next.y);
        const right = Math.max(previous.x + previous.width, next.x + next.width);
        const bottom = Math.max(previous.y + previous.height, next.y + next.height);
        context.clearRect(left, top, right - left, bottom - top);
      }
      paintedRef.current = next;
    };

    const box = obbRef.current;
    /*
      Geometry debug forces a full clear.

      The partial-clear region is computed from the chrome's own extent, and the debug
      overlay deliberately draws OUTSIDE that — the pointer crosshair, the preview box,
      labels. Clearing only the chrome region would smear those. Debugging is a
      developer session, not the hot path, so the whole-canvas clear it costs does not
      matter, and it keeps the fast path's region maths untouched.
    */
    const debugging = isSelectionDebugEnabled();
    if (debugging) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      paintedRef.current = null;
    }

    if (box === null) {
      if (!debugging) {
        clearAndRecord(null);
      }
      drawDebugOverlay(null);
      return;
    }

    // Screen-constant sizes, expressed in document units. A zoom of 0 would make
    // these infinite, so it is guarded where the ref is written.
    const zoom = zoomRef.current;
    const outlineWidth = OUTLINE_WIDTH_PX / zoom;
    const handleSize = HANDLE_SIZE_PX / zoom;
    const handleBorder = HANDLE_BORDER_PX / zoom;
    const rotationOffset = ROTATION_OFFSET_PX / zoom;
    const rotationRadius = ROTATION_RADIUS_PX / zoom;

    // The live gesture's own answer for where the object is THIS frame.
    //
    // Two shapes, because the two gestures genuinely differ. A resize or a rotate
    // publishes `corners` — it changes the box's shape, so no displacement can
    // describe it — and those corners came from the same `worldTransform ×
    // localCorner` the engine painted with. A move publishes only `worldDelta`,
    // because a translation of the committed box IS the answer and re-deriving
    // corners for it would be a second implementation of the same fact.
    const live = liveTransforms?.peek() ?? null;
    const follows = live !== null;
    const offset = follows && live.corners === null ? live.worldDelta : { dx: 0, dy: 0 };

    const source = follows && live.corners !== null
      ? live.corners
      : obbCorners(box);

    const corners = source.map((corner) => ({
      x: corner.x + offset.dx,
      y: corner.y + offset.dy,
    }));
    if (corners.length !== 4
      || !corners.every((corner) => Number.isFinite(corner.x) && Number.isFinite(corner.y))) {
      // A degenerate transform produced a non-finite corner. Drawing nothing is
      // correct; drawing a guessed box is what the old DOM overlay did.
      if (!debugging) {
        clearAndRecord(null);
      }
      drawDebugOverlay(box);
      return;
    }

    /*
      The area the chrome will occupy, from the corners plus everything drawn outside them.

      The rotation control sits `rotationOffset` beyond the top edge, handles extend half
      their size past a corner, and the outline is stroked centred on the edge — so the
      painted area is the corners' bounding box grown by the largest of those. Computed
      rather than assumed: a rect that was even a pixel too small would leave a sliver of the
      previous frame behind, which is the artefact that makes partial clearing look broken.
    */
    const margin = rotationOffset + Math.max(handleSize, rotationRadius * 2, outlineWidth) + 2;
    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);
    const painted = {
      x: Math.floor(Math.min(...xs) - margin),
      y: Math.floor(Math.min(...ys) - margin),
      width: Math.ceil(Math.max(...xs) - Math.min(...xs) + margin * 2),
      height: Math.ceil(Math.max(...ys) - Math.min(...ys) + margin * 2),
    };
    if (!debugging) {
      clearAndRecord(painted);
    }

    const [topLeft, topRight, bottomRight, bottomLeft] = corners;

    // 1. The outline, as a polygon through the four world corners. Because they are
    //    the object's real corners, a rotated or skewed object gets a box that hugs
    //    it rather than an axis-aligned box that does not.
    context.save();
    context.strokeStyle = ACCENT;
    context.lineWidth = outlineWidth;
    context.beginPath();
    context.moveTo(topLeft.x, topLeft.y);
    context.lineTo(topRight.x, topRight.y);
    context.lineTo(bottomRight.x, bottomRight.y);
    context.lineTo(bottomLeft.x, bottomLeft.y);
    context.closePath();
    context.stroke();

    // 2. The rotation control, offset along the top edge's OUTWARD normal so it never
    //    sits on top of a corner handle — the defect that made corner resize
    //    unreachable when both were centred on the same point.
    const topMid = midpoint(topLeft, topRight);
    const bottomMid = midpoint(bottomLeft, bottomRight);
    const outwardX = topMid.x - bottomMid.x;
    const outwardY = topMid.y - bottomMid.y;
    const outwardLength = Math.hypot(outwardX, outwardY);
    if (outwardLength > 0) {
      const rotationPoint = {
        x: topMid.x + (outwardX / outwardLength) * rotationOffset,
        y: topMid.y + (outwardY / outwardLength) * rotationOffset,
      };
      context.beginPath();
      context.moveTo(topMid.x, topMid.y);
      context.lineTo(rotationPoint.x, rotationPoint.y);
      context.stroke();

      context.beginPath();
      context.arc(rotationPoint.x, rotationPoint.y, rotationRadius, 0, Math.PI * 2);
      context.fillStyle = HANDLE_FILL;
      context.fill();
      context.lineWidth = handleBorder;
      context.strokeStyle = ACCENT;
      context.stroke();
    }

    // 3. The eight handles, interpolated from the corners so every one of them
    //    rotates, scales and flips with the object for free.
    const handlePoints: Point[] = [
      topLeft,
      topRight,
      bottomRight,
      bottomLeft,
      midpoint(topLeft, topRight),
      midpoint(topRight, bottomRight),
      midpoint(bottomRight, bottomLeft),
      midpoint(bottomLeft, topLeft),
    ];

    context.lineWidth = handleBorder;
    for (const handle of handlePoints) {
      context.beginPath();
      context.rect(
        handle.x - handleSize / 2,
        handle.y - handleSize / 2,
        handleSize,
        handleSize,
      );
      context.fillStyle = HANDLE_FILL;
      context.fill();
      context.strokeStyle = ACCENT;
      context.stroke();
    }
    context.restore();

    drawDebugOverlay(box);
  }, [liveTransforms]);

  // Redraw when the committed selection or the viewport changes — and, in debug mode,
  // when the pointer or the preview bounds change, so the overlay tracks them.
  useEffect(() => {
    // A canvas resize blanks it, so the record of what was painted no longer applies.
    paintedRef.current = null;
    draw();
  }, [
    draw,
    obb,
    viewport.zoom,
    viewport.panX,
    viewport.panY,
    width,
    height,
    debugPointerWorld,
    debugPreviewBounds,
  ]);

  // And once per frame while a gesture is running, from the same retained state the
  // engine renders from.
  useEffect(() => {
    if (liveTransforms === undefined) {
      return undefined;
    }
    return liveTransforms.subscribe(() => {
      draw();
    });
  }, [liveTransforms, draw]);

  return (
    <canvas
      ref={canvasRef}
      data-role="selection-canvas"
      aria-hidden="true"
      width={Math.max(1, Math.round(width))}
      height={Math.max(1, Math.round(height))}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        display: "block",
        /*
          NO transform here on purpose.

          The shared `skia-stage` parent carries the single pan/zoom transform for both
          canvases. Giving this one its own would create a second transform to keep in
          sync, which is exactly the drift the component exists to eliminate.
        */
        pointerEvents: "none",
      }}
    />
  );
}

export default SelectionCanvas;
