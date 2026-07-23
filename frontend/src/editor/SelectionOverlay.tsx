"use client";

/**
 * SelectionOverlay — selection hit-testing, handles, and marquee for the
 * Editor_Canvas (task 5.5).
 *
 * Mounted into the EditorCanvas overlay seam, HTML-positioned over the SVG. It
 * implements the Requirement 1 selection rules and renders the selection
 * affordances without ever mutating the Document_Model or recording a Command:
 *
 *   - Click an editable element → selection becomes exactly that layer (1.7).
 *   - Click empty canvas → clear the selection (1.8).
 *   - Shift-click toggles membership: add if absent, remove if present (1.9/1.10).
 *   - Click a `data-editable="false"` group (logo, print-marks) → unchanged (1.11).
 *   - Drag on empty canvas → rubber-band marquee; on release, every editable
 *     layer FULLY ENCLOSED by the rectangle becomes the selection (1.12). A
 *     rectangle enclosing zero layers yields an empty selection.
 *   - While one or more layers are selected, eight handles are drawn around the
 *     combined axis-aligned bounding box of all selected layers (1.12).
 *
 * Hit-testing reads `data-editable`/`data-layer-id` straight off the clicked
 * `<g data-role>` node (design: "hit-testing for free"). The overlay root and
 * its handles are `pointer-events: none`, so pointer events pass through to the
 * SVG; the component listens on the host element in the capture phase so it
 * observes the real target without preventing the existing SVGCanvas handlers
 * (single-select, double-click text edit, drag) from also running.
 *
 * Bounding boxes come from `getBoundingClientRect` (already in screen space, so
 * handle size stays constant regardless of zoom). All geometry/set algebra is
 * delegated to the pure `selectionMath` helpers; `getBoundingClientRect` is
 * guarded so jsdom (which may not implement layout) cannot crash the editor.
 *
 * One responsibility per file: the selection interaction + overlay rendering.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";

import styles from "./SelectionOverlay.module.css";
import {
  computeHandles,
  rectFromPoints,
  resizeBoxFromHandle,
  rotationDeltaDegrees,
  selectEnclosed,
  unionBBoxes,
  type BBox,
  type HandlePosition,
  type LayerBox,
} from "./selectionMath";
import { type BoxSnapshot, type RotateSnapshot } from "./commands";
import { type LayerRotation, unrotatePoint } from "./selectionMath";
import { MeasurementLabel } from "./MeasurementLabel";
import type { SelectionSet, Viewport } from "./types/documentModel";
import type { DesignOutput } from "../types";

/** Pointer travel (in host pixels) below which a gesture counts as a click. */
const DRAG_THRESHOLD = 4;

export interface SelectionOverlayProps {
  /** The EditorCanvas host element; used for hit-testing and coordinate origin. */
  hostRef: RefObject<HTMLDivElement | null>;
  /** Current design being rendered; its markup change retriggers box measurement. */
  designOutput: DesignOutput | null;
  /** Viewport transform; pan/zoom move the on-screen boxes, so handles recompute. */
  viewport: Viewport;
  /** Current selection set driving the handle box. */
  selection: SelectionSet;
  /** Replace the selection with exactly one layer (Req 1.7). */
  onSelectOnly: (layerId: string) => void;
  /** Toggle a layer's membership (Req 1.9, 1.10). */
  onToggle: (layerId: string) => void;
  /** Clear the selection (Req 1.8). */
  onClear: () => void;
  /** Replace the whole selection (marquee release, Req 1.12). */
  onSetSelection: (layerIds: string[]) => void;
  /**
   * Optional sync of the primary (last-picked) layer to the legacy single-select
   * seam so the Properties_Panel/outline track the selection. `null` signals the
   * selection was cleared.
   */
  onPrimaryChange?: (layerId: string | null) => void;
  onDoubleClick?: (layerId: string, textElementId?: string) => void;
  /** Called when a resize drag finishes. Provides layerId + host-local boxes (pixels). */
  onResize?: (layerId: string, prevBox: BoxSnapshot, nextBox: BoxSnapshot) => void;
  /** Called when a rotate gesture finishes. Provides layerId + transform snapshots. */
  onRotate?: (layerId: string, prev: RotateSnapshot, next: RotateSnapshot) => void;
}

interface LayerHit {
  layerId: string | null;
  textElementId?: string;
  editable: boolean;
}

interface PointerSession {
  startX: number;
  startY: number;
  shift: boolean;
  hit: LayerHit | null;
  dragging: boolean;
}

interface ResizeDragSession {
  originBox: BBox;
  previewBox: BBox;
  handle: HandlePosition;
  layerId: string;
}

interface RotateDragSession {
  layerId: string;
  center: { x: number; y: number };
  start: { x: number; y: number };
  delta: number;
}

export function SelectionOverlay({
  hostRef,
  designOutput,
  viewport,
  selection,
  onSelectOnly,
  onToggle,
  onClear,
  onSetSelection,
  onPrimaryChange,
  onDoubleClick,
  onResize,
  onRotate,
}: SelectionOverlayProps): JSX.Element {
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null);
  const [marqueeCurrent, setMarqueeCurrent] = useState<{ x: number; y: number } | null>(null);
  
  const [measurement, setMeasurement] = useState<{ text: string; x: number; y: number } | null>(null);

  const [handleBox, setHandleBox] = useState<{box: BBox, rotation: LayerRotation | null} | null>(null);
  const [primaryLayerKind, setPrimaryLayerKind] = useState<'text' | 'image' | 'shape' | null>(null);
  const [marquee, setMarquee] = useState<BBox | null>(null);

  const composedSvg = designOutput?.composedSVG;
  const selectedKey = selection.layerIds.join("|");

  // Recompute the combined selection bounding box whenever the selection, the
  // rendered markup, or the viewport transform changes. Uses layout effect so
  // measurement happens after the DOM is laid out.
  useLayoutEffect(() => {
    const host = hostRef.current;
    const svg = host?.querySelector("svg");
    if (!host || !(svg instanceof SVGSVGElement) || selection.layerIds.length === 0) {
      setHandleBox(null);
      return;
    }
    
    const primaryId = selection.layerIds.length > 0 ? selection.layerIds[selection.layerIds.length - 1] : null;
    if (primaryId) {
      const el = svg.querySelector(`[data-layer-id="${primaryId}"]`);
      if (el) {
        if (el.tagName.toLowerCase() === 'text' || el.querySelector('text')) setPrimaryLayerKind('text');
        else if (el.tagName.toLowerCase() === 'image' || el.querySelector('image')) setPrimaryLayerKind('image');
        else setPrimaryLayerKind('shape');
      }
    } else {
      setPrimaryLayerKind(null);
    }

    const newBox = computeSelectionBox(host, svg, selection.layerIds);
    setHandleBox(prev => {
      if (prev && newBox && prev.box.x === newBox.box.x && prev.box.y === newBox.box.y && prev.box.width === newBox.box.width && prev.box.height === newBox.box.height && prev.rotation?.angle === newBox.rotation?.angle) {
        return prev;
      }
      return newBox;
    });
    // composedSvg and viewport primitives are intentional dependencies: both move the boxes.
  }, [hostRef, selectedKey, composedSvg, viewport?.zoom, viewport?.panX, viewport?.panY]);

  const finishMarquee = useCallback(
    (host: HTMLDivElement, rect: BBox): void => {
      const svg = host.querySelector("svg");
      const ids =
        svg instanceof SVGSVGElement ? selectEnclosed(collectEditableBoxes(host, svg), rect) : [];
      onSetSelection(ids);
      onPrimaryChange?.(ids.length > 0 ? ids[ids.length - 1] : null);
    },
    [onSetSelection, onPrimaryChange],
  );

  const lastClickRef = useRef<{
    layerId: string;
    textElementId?: string;
    time: number;
  } | null>(null);

  const resolveClick = useCallback(
    (session: PointerSession): void => {
      const hit = session.hit;
      if (hit && hit.editable && hit.layerId) {
        const now = Date.now();
        const lastClick = lastClickRef.current;

        // Double-click detection (within 300ms)
        if (
          lastClick
          && lastClick.layerId === hit.layerId
          && lastClick.textElementId === hit.textElementId
          && now - lastClick.time < 300
        ) {
          lastClickRef.current = null;
          onDoubleClick?.(hit.layerId, hit.textElementId);
          return;
        }
        
        lastClickRef.current = {
          layerId: hit.layerId,
          textElementId: hit.textElementId,
          time: now,
        };

        if (session.shift) {
          onToggle(hit.layerId);
        } else {
          onSelectOnly(hit.layerId);
          onPrimaryChange?.(hit.layerId);
        }
        return;
      }
      if (hit && !hit.editable) {
        // Clicking the background or a locked layer clears the selection
        if (!session.shift) {
          onClear();
          onPrimaryChange?.(null);
        }
        return;
      }
      // Empty canvas: a plain click clears; shift-click on empty is a no-op.
      if (!session.shift) {
        onClear();
        onPrimaryChange?.(null);
      }
    },
    [onToggle, onSelectOnly, onClear, onPrimaryChange, onDoubleClick],
  );

  // Pointer interaction is attached to the host element in the capture phase so
  // it sees the genuine SVG target and coexists with SVGCanvas's own handlers.
  const sessionRef = useRef<PointerSession | null>(null);
  // Browsers emit a click after a pointer gesture. Keep that click from
  // applying the selection twice, while still supporting keyboard-driven and
  // programmatic click activation (which have no pointer sequence).
  const handledPointerClickRef = useRef(false);
  const resizeDragRef = useRef<ResizeDragSession | null>(null);
  const rotateDragRef = useRef<RotateDragSession | null>(null);

  function startHandleDrag(event: React.PointerEvent<HTMLDivElement>, handlePos: HandlePosition): void {
    // Capture pointer and begin tracking movement for a resize. We only support
    // single-selection resize for now — use the primary (last-picked) layer.
    const host = hostRef.current;
    if (!host) return;
    const svg = host.querySelector("svg");
    if (!(svg instanceof SVGSVGElement)) return;
    const primaryId = selection.layerIds.length > 0 ? selection.layerIds[selection.layerIds.length - 1] : null;
    if (!primaryId) return;
      const group = Array.from(svg.querySelectorAll('g[data-role]')).find(g => g.getAttribute('data-layer-id') === primaryId);
      if (group && group.getAttribute('pointer-events') === 'none') return;
    const origin = computeSelectionBox(host, svg, [primaryId]);
    if (!origin) return;
    event.preventDefault();
    event.stopPropagation();
    resizeDragRef.current = { originBox: origin.box, previewBox: origin.box, handle: handlePos, layerId: primaryId };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function startRotateDrag(event: React.PointerEvent<HTMLDivElement>): void {
    const host = hostRef.current;
    if (!host) return;
    const svg = host.querySelector("svg");
    if (!(svg instanceof SVGSVGElement)) return;
    const primaryId = selection.layerIds.length > 0 ? selection.layerIds[selection.layerIds.length - 1] : null;
    if (!primaryId) return;
      const group = Array.from(svg.querySelectorAll("g[data-role]")).find(g => g.getAttribute("data-layer-id") === primaryId);
      if (group && group.getAttribute("pointer-events") === "none") return;
    const origin = computeSelectionBox(host, svg, [primaryId]);
    if (!origin) return;
    const cx = origin.box.x + origin.box.width / 2;
    const cy = origin.box.y + origin.box.height / 2;
    const rect = host.getBoundingClientRect();
    event.preventDefault();
    event.stopPropagation();
    rotateDragRef.current = {
      layerId: primaryId,
      center: { x: cx, y: cy },
      start: { x: event.clientX - rect.left, y: event.clientY - rect.top },
      delta: 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleRotateMove(event: React.PointerEvent<HTMLDivElement>): void {
    const host = hostRef.current;
    const drag = rotateDragRef.current;
    if (!host || !drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const rect = host.getBoundingClientRect();
    drag.delta = rotationDeltaDegrees(
      drag.center,
      drag.start,
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      event.shiftKey ? 15 : undefined,
    );
    setMeasurement({ text: `${Math.round(drag.delta)}°`, x: event.clientX, y: event.clientY });

    const boxInfo = handleBox;
    const box = boxInfo?.box;
    const element = host.querySelector(`.${styles.selectionBox}`);
    if (box && element instanceof HTMLElement) {
      // Rotate the selection box visually
      const startAngle = boxInfo?.rotation?.angle || 0;
      const newAngle = startAngle + drag.delta;
      element.style.transform = `rotate(${newAngle}deg)`;
      element.style.transformOrigin = `${drag.center.x - box.x}px ${drag.center.y - box.y}px`;
      
      // Live rotate the SVG element
      const svg = host.querySelector("svg");
      const group = Array.from(svg?.querySelectorAll<SVGGElement>("g[data-layer-id]") || []).find(
        (candidate) => candidate.getAttribute("data-layer-id") === drag.layerId
      );
      if (group && svg) {
        const currentTransform = group.getAttribute("data-original-transform") ?? group.getAttribute("transform") ?? "";
        if (!group.hasAttribute("data-original-transform")) {
             group.setAttribute("data-original-transform", currentTransform);
        }
        
        const center = hostPointToSvgPoint(host, svg, drag.center, viewport);
        const rotationStr = `rotate(${Number(drag.delta.toFixed(3))} ${Number(center.x.toFixed(3))} ${Number(center.y.toFixed(3))})`;
        // Append the delta rotation to the ORIGINAL transform
        const nextTransform = [currentTransform, rotationStr].filter(Boolean).join(" ");
        group.setAttribute("transform", nextTransform);
      }
    }
    event.preventDefault();
  }

  function handleRotateUp(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = rotateDragRef.current;
    const host = hostRef.current;
    if (!drag || !host) return;
    const svg = host.querySelector("svg");
    if (!(svg instanceof SVGSVGElement)) return;
    event.preventDefault();
    event.stopPropagation();

    // read the original transform BEFORE cleanup
    const svgGroup = Array.from(svg.querySelectorAll<SVGGElement>("g[data-layer-id]")).find(
      (candidate) => candidate.getAttribute("data-layer-id") === drag.layerId
    );
    let originalTransform: string | undefined = undefined;
    if (svgGroup) {
      originalTransform = svgGroup.getAttribute("data-original-transform") ?? svgGroup.getAttribute("transform") ?? undefined;
    }

    // cleanup preview transform
    const box = handleBox;
    if (svgGroup && svgGroup.hasAttribute("data-original-transform")) {
        svgGroup.removeAttribute("data-original-transform");
    }
    if (box) {
      const el = host.querySelector(`.${styles.selectionBox}`);
      if (el instanceof HTMLElement) {
        el.style.transform = "";
        el.style.transformOrigin = "";
      }
    }

    rotateDragRef.current = null;
    setMeasurement(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (onRotate && Math.abs(drag.delta) >= 0.01) {
      const prev = { kind: "transform" as const, transform: originalTransform };
      const center = hostPointToSvgPoint(host, svg, drag.center, viewport);
      const rotation = `rotate(${Number(drag.delta.toFixed(3))} ${Number(center.x.toFixed(3))} ${Number(center.y.toFixed(3))})`;
      const nextTransform = [originalTransform, rotation].filter(Boolean).join(" ");
      const next = { kind: "transform" as const, transform: nextTransform };
      
      // We must re-apply the next transform to the DOM immediately so there's no flicker 
      // before React re-renders the SVG with the new command.
      if (svgGroup) {
         svgGroup.setAttribute("transform", nextTransform);
      }
      
      onRotate(drag.layerId, prev, next);
    }
  }

  function handlePointerMoveForHandle(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = resizeDragRef.current;
    const host = hostRef.current;
    if (!drag || !host || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const rect = host.getBoundingClientRect();
    let point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (handleBox?.rotation) {
      const cx = handleBox.box.x + handleBox.box.width / 2;
      const cy = handleBox.box.y + handleBox.box.height / 2;
      point = unrotatePoint(point, { x: cx, y: cy }, handleBox.rotation.angle);
    }
    const { x, y } = point;
    const next = resizeBoxFromHandle(drag.originBox, drag.handle, { x, y }, {
      minSize: 8,
      preserveAspectRatio: event.shiftKey,
      resizeFromCenter: event.altKey,
    });
    drag.previewBox = next;
    setHandleBox(prev => prev ? { box: next, rotation: prev.rotation } : null);
    setMeasurement({ 
      text: `W: ${Math.round(next.width)} H: ${Math.round(next.height)}`, 
      x: event.clientX, 
      y: event.clientY 
    });
    event.preventDefault();
  }

  function handlePointerUpForHandle(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = resizeDragRef.current;
    const host = hostRef.current;
    if (!drag || !host) return;
    const svg = host.querySelector("svg");
    if (!(svg instanceof SVGSVGElement)) return;
    event.preventDefault();
    event.stopPropagation();
    resizeDragRef.current = null;
    setMeasurement(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (onResize) {
      onResize(
        drag.layerId,
        { kind: "box", ...hostBoxToSvgBox(host, svg, drag.originBox, viewport) },
        { kind: "box", ...hostBoxToSvgBox(host, svg, drag.previewBox, viewport) },
      );
    }
  }

  function cancelHandleDrag(event: React.PointerEvent<HTMLDivElement>): void {
    resizeDragRef.current = null;
    rotateDragRef.current = null;
    setMeasurement(null);
    event.preventDefault();
    event.stopPropagation();
  }

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    const hostPoint = (event: PointerEvent): { x: number; y: number } => {
      const rect = host.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const handlePointerMove = (event: PointerEvent): void => {
      const session = sessionRef.current;
      if (!session) {
        return;
      }
      const { x, y } = hostPoint(event);
      const distance = Math.hypot(x - session.startX, y - session.startY);
      const startedOnEditable = session.hit?.editable === true && session.hit.layerId !== null;
      // A marquee only begins from empty canvas (or a non-editable region); a
      // drag that starts on an editable layer is reserved for move (task 7.x).
      if (!session.dragging && distance > DRAG_THRESHOLD && !startedOnEditable) {
        session.dragging = true;
      }
      if (session.dragging) {
        setMarquee(rectFromPoints(session.startX, session.startY, x, y));
      }
    };

    const endGesture = (event: PointerEvent): void => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endGesture);
      window.removeEventListener("pointercancel", endGesture);
      const session = sessionRef.current;
      sessionRef.current = null;
      if (!session) {
        return;
      }
      if (session.dragging) {
        const { x, y } = hostPoint(event);
        finishMarquee(host, rectFromPoints(session.startX, session.startY, x, y));
        setMarquee(null);
        handledPointerClickRef.current = true;
        return;
      }
      resolveClick(session);
      handledPointerClickRef.current = true;
    };

    const handlePointerDown = (event: PointerEvent): void => {
      // Only the primary button drives selection; middle/secondary are pan/etc.
      if (event.button !== 0) {
        return;
      }
      if (event.target instanceof Element && event.target.closest("[data-handle]")) {
        return;
      }
      // Background drag without shift is treated as viewport pan, not selection/marquee
      const isBackgroundDrag = !(event.target as Element).closest("[data-layer-id], [data-element-id]");
      if (isBackgroundDrag && !event.shiftKey) {
        return;
      }
      const { x, y } = hostPoint(event);
      sessionRef.current = {
        startX: x,
        startY: y,
        shift: event.shiftKey,
        hit: resolveLayerHit(event.target),
        dragging: false,
      };
      // Cancel any ongoing handle drag to avoid conflict
      if (resizeDragRef.current || rotateDragRef.current) {
        resizeDragRef.current = null;
        rotateDragRef.current = null;
      }
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", endGesture);
      window.addEventListener("pointercancel", endGesture);
    };

    const handleClick = (event: MouseEvent): void => {
      if (handledPointerClickRef.current) {
        handledPointerClickRef.current = false;
        return;
      }

      resolveClick({
        startX: 0,
        startY: 0,
        shift: event.shiftKey,
        hit: resolveLayerHit(event.target),
        dragging: false,
      });
    };

    host.addEventListener("pointerdown", handlePointerDown, true);
    host.addEventListener("click", handleClick, true);
    return () => {
      host.removeEventListener("pointerdown", handlePointerDown, true);
      host.removeEventListener("click", handleClick, true);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endGesture);
      window.removeEventListener("pointercancel", endGesture);
    };
  }, [hostRef, finishMarquee, resolveClick]);

  return (
    <div className={styles.canvasOverlay} data-role="selection-overlay" aria-hidden="true">
      {handleBox && handleBox.box ? (
        <>
        <div 
          className={styles.selectionBoxWrapper} 
          style={{
            position: 'absolute',
            left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none',
            transform: handleBox.rotation ? `rotate(${handleBox.rotation.angle}deg)` : 'none',
            transformOrigin: `${handleBox.box.x + handleBox.box.width / 2}px ${handleBox.box.y + handleBox.box.height / 2}px`
          }}
        >
          <div className={styles.selectionBox} style={boxStyle(handleBox.box)} />
          {['nw', 'ne', 'sw', 'se'].map((pos) => {
            const h = computeHandles(handleBox.box).find(x => x.position === pos);
            if (!h) return null;
            return (
              <div
                key={`rotate-${pos}`}
                className={styles.cornerRotationHandle}
                data-handle={`rotate-${pos}`}
                style={{ left: `${h.x}px`, top: `${h.y}px` }}
                onPointerDown={(e) => startRotateDrag(e)}
                onPointerMove={handleRotateMove}
                onPointerUp={handleRotateUp}
                onPointerCancel={cancelHandleDrag}
              />
            );
          })}
          {computeHandles(handleBox.box).map((handle) => {
            if (primaryLayerKind === 'text' && !['e', 'w'].includes(handle.position)) {
              return null; // Text objects only show horizontal resize handles
            }
            const cursor =
              handle.position === "nw" || handle.position === "se"
                ? "nwse-resize"
                : handle.position === "ne" || handle.position === "sw"
                  ? "nesw-resize"
                  : handle.position === "n" || handle.position === "s"
                    ? "ns-resize"
                    : "ew-resize";
            return (
              <div
                key={handle.position}
                className={styles.selectionHandle}
                data-handle={handle.position}
                style={{ left: `${handle.x}px`, top: `${handle.y}px`, cursor }}
                onPointerDown={(e) => startHandleDrag(e, handle.position)}
                onPointerMove={handlePointerMoveForHandle}
                onPointerUp={handlePointerUpForHandle}
                onPointerCancel={cancelHandleDrag}
              />
            );
          })}
          {(() => {
            const cx = handleBox.box.x + handleBox.box.width / 2;
            const top = handleBox.box.y - 28;
            return (
              <>
                <div
                  className={styles.rotateConnectLine}
                  style={{
                    left: `${cx}px`,
                    top: `${handleBox.box.y - 28}px`,
                    height: '28px'
                  }}
                />
                <div
                  key="rotate"
                  className={styles.rotationHandle}
                  data-handle="rotate"
                  style={{ left: `${cx}px`, top: `${top}px`, cursor: "grab" }}
                  onPointerDown={(e) => startRotateDrag(e)}
                  onPointerMove={handleRotateMove}
                  onPointerUp={handleRotateUp}
                  onPointerCancel={cancelHandleDrag}
                />
                <div
                  key="pivot"
                  className={styles.pivotHandle}
                  data-handle="pivot"
                  style={{ left: `${cx}px`, top: `${handleBox.box.y + handleBox.box.height / 2}px`, transform: "translate(-50%, -50%)" }}
                />
              </>
            );
          })()}
        </div>
        </>
      ) : null}
      {marquee ? <div className={styles.marquee} style={boxStyle(marquee)} /> : null}
      
      {measurement && (
        <MeasurementLabel
          text={measurement.text}
          position={{ x: measurement.x, y: measurement.y }}
          visible={true}
        />
      )}
    </div>
  );
}
/** Read the editable/layer-id of the closest selectable element. */
function resolveLayerHit(target: EventTarget | null): LayerHit | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const layerElement = target.closest("[data-layer-id]");
  const textElement = target.closest("text[data-element-id]");
  if (!layerElement && !textElement) {
    return null;
  }
  const selectableElement = layerElement ?? textElement;
  const group = selectableElement?.closest("g[data-role]");
  const groupEditable = group?.getAttribute("data-editable");
  const elementEditable = selectableElement?.getAttribute("data-editable");
  const editable =
    groupEditable === "false"
      ? false
      : groupEditable === "true"
        ? true
        : elementEditable !== "false";
  const layerId = layerElement?.getAttribute("data-layer-id")
    ?? textElement?.getAttribute("data-element-id")
    ?? null;
  return {
    layerId,
    textElementId: textElement?.getAttribute("data-element-id") ?? undefined,
    editable,
  };
}

/** Bounding box of an element relative to the host top-left, guarded for jsdom. */
function safeHostBox(element: Element, hostRect: DOMRect): BBox | null {
  try {
    const rect = element.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      return null;
    }
    return {
      x: rect.left - hostRect.left,
      y: rect.top - hostRect.top,
      width: rect.width,
      height: rect.height,
    };
  } catch {
    return null;
  }
}

/** Collect host-local bounding boxes for every editable nested shape or standalone layer group. */
function collectEditableBoxes(host: HTMLDivElement, svg: SVGSVGElement): LayerBox[] {
  const hostRect = host.getBoundingClientRect();
  const result: LayerBox[] = [];
  const elements = Array.from(svg.querySelectorAll<Element>("[data-layer-id]"));
  for (const el of elements) {
    const id = el.getAttribute("data-layer-id");
    if (!id) {
      continue;
    }
    const group = el.closest("g[data-role]");
    const groupEditable = group?.getAttribute("data-editable");
    const elementEditable = el.getAttribute("data-editable");
    const editable =
      groupEditable === "false"
        ? false
        : groupEditable === "true"
          ? true
          : elementEditable !== "false";
    if (!editable) {
      continue;
    }
    // If it's a top-level role group that has children with data-layer-id, skip the group box itself
    if (el.tagName.toLowerCase() === "g" && el.hasAttribute("data-role")) {
      const hasEditableChildren = Array.from(el.children).some(child => child.hasAttribute("data-layer-id"));
      if (hasEditableChildren) {
        continue;
      }
    }
    const box = safeHostBox(el, hostRect);
    if (box) {
      result.push({ id, box });
    }
  }
  return result;
}


function parseRotation(transform: string | null): LayerRotation | null {
  if (!transform) return null;
  const match = transform.match(/rotate\(\s*(-?\d+\.?\d*)\s+([-\d\.]+)\s+([-\d\.]+)\s*\)/);
  if (match) {
    return { angle: parseFloat(match[1]), cx: parseFloat(match[2]), cy: parseFloat(match[3]) };
  }
  const matchSimple = transform.match(/rotate\(\s*(-?\d+\.?\d*)\s*\)/);
  if (matchSimple) {
    return { angle: parseFloat(matchSimple[1]), cx: 0, cy: 0 };
  }
  return null;
}

/** Union the host-local bounding boxes of the selected layers. */
function computeSelectionBox(
  host: HTMLDivElement,
  svg: SVGSVGElement,
  layerIds: readonly string[],
  viewport?: Viewport
): { box: BBox, rotation: LayerRotation | null } | null {
  const hostRect = host.getBoundingClientRect();
  const idSet = new Set(layerIds);
  const elements = Array.from(svg.querySelectorAll<SVGGraphicsElement>("[data-layer-id]"));
  
  if (layerIds.length === 1) {
    const el = elements.find(e => e.getAttribute("data-layer-id") === layerIds[0]);
    if (el) {
      try {
        const bbox = el.getBBox();
        const group = el.closest("g[data-role]");
        const transform = group ? group.getAttribute("transform") : null;
        const rotation = parseRotation(transform);
        
        // Transform bbox to screen coordinates (ignoring rotation)
        const start = hostPointToSvgPoint(host, svg, {x: 0, y: 0}, viewport || {zoom: 1, panX: 0, panY: 0});
        // We actually want the reverse: from local SVG to screen
        // Wait, the SVG has a viewbox? 
        // For simplicity, we can get the bounding rect of the element if its transform is temporarily removed.
        // Instead, let's just use the current getBoundingClientRect logic if there's no rotation, 
        // but if there IS a rotation, we could temporarily remove it.
        const originalTransform = group?.getAttribute("transform") || "";
        if (group && rotation) {
             group.removeAttribute("transform");
        }
        const screenRect = el.getBoundingClientRect();
        if (group && rotation) {
             group.setAttribute("transform", originalTransform);
        }
        
        return {
          box: {
            x: screenRect.left - hostRect.left,
            y: screenRect.top - hostRect.top,
            width: screenRect.width,
            height: screenRect.height
          },
          rotation
        };
      } catch (e) {
        // fallback
      }
    }
  }

  const boxes: BBox[] = [];
  for (const el of elements) {
    const id = el.getAttribute("data-layer-id");
    if (!id || !idSet.has(id)) {
      continue;
    }
    const box = safeHostBox(el, hostRect);
    if (box) {
      boxes.push(box);
    }
  }
  const u = unionBBoxes(boxes);
  return u ? { box: u, rotation: null } : null;
}

function hostPointToSvgPoint(
  host: HTMLDivElement,
  svg: SVGSVGElement,
  point: { x: number; y: number },
  viewport: Viewport,
): { x: number; y: number } {
  const hostRect = host.getBoundingClientRect();
  const clientX = hostRect.left + point.x;
  const clientY = hostRect.top + point.y;

  try {
    const matrix = svg.getScreenCTM();
    if (matrix && typeof svg.createSVGPoint === "function") {
      const svgPoint = svg.createSVGPoint();
      svgPoint.x = clientX;
      svgPoint.y = clientY;
      const transformed = svgPoint.matrixTransform(matrix.inverse());
      return { x: transformed.x, y: transformed.y };
    }
  } catch {
    // Fall through to a bounding-rect conversion for incomplete DOM engines.
  }

  const svgRect = svg.getBoundingClientRect();
  const viewBox = svg.getAttribute("viewBox")?.trim().split(/\s+/).map(Number);
  const viewBoxWidth = viewBox?.length === 4 && Number.isFinite(viewBox[2]) ? viewBox[2] : 0;
  const viewBoxHeight = viewBox?.length === 4 && Number.isFinite(viewBox[3]) ? viewBox[3] : 0;
  if (svgRect.width > 0 && svgRect.height > 0 && viewBoxWidth > 0 && viewBoxHeight > 0) {
    return {
      x: (viewBox?.[0] ?? 0) + (clientX - svgRect.left) * viewBoxWidth / svgRect.width,
      y: (viewBox?.[1] ?? 0) + (clientY - svgRect.top) * viewBoxHeight / svgRect.height,
    };
  }

  const zoom = viewport.zoom || 1;
  return {
    x: (point.x - viewport.panX) / zoom,
    y: (point.y - viewport.panY) / zoom,
  };
}

function hostBoxToSvgBox(
  host: HTMLDivElement,
  svg: SVGSVGElement,
  box: BBox,
  viewport: Viewport,
): BBox {
  const start = hostPointToSvgPoint(host, svg, { x: box.x, y: box.y }, viewport);
  const end = hostPointToSvgPoint(
    host,
    svg,
    { x: box.x + box.width, y: box.y + box.height },
    viewport,
  );
  return rectFromPoints(start.x, start.y, end.x, end.y);
}

/** Absolute positioning style for a host-local bounding box. */
function boxStyle(box: BBox): CSSProperties {
  return {
    left: `${box.x}px`,
    top: `${box.y}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  };
}

export default SelectionOverlay;
