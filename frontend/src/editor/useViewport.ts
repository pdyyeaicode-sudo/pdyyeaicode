"use client";

/**
 * useViewport — Editor_Canvas pan/zoom interaction state (task 5.2).
 *
 * Owns the `Viewport` (`{ zoom, panX, panY }`) that drives the EditorCanvas
 * wrapper transform `translate(panX, panY) scale(zoom)`. All math is delegated
 * to the pure `viewportMath` helpers; this hook only adds the React state and
 * the DOM gesture plumbing:
 *
 *   - Wheel / ctrl-wheel  → cursor-anchored zoom, clamped to [0.10, 64.0]
 *                           (Req 1.4, 1.5).
 *   - Middle-drag or space-drag → 1:1 pan at the current zoom (Req 1.3).
 *   - Zoom controls (in/out/reset) → centered cursor-anchored zoom.
 *
 * Pan/zoom update ONLY the viewport and never the Document_Model (Req 1.3); no
 * Command is ever dispatched from here. The zoom indicator value is derived as
 * `Math.round(zoom * 100)` (Req 1.6).
 *
 * One responsibility per file: viewport interaction state + gesture handlers.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject, WheelEvent as ReactWheelEvent } from "react";

import { DEFAULT_VIEWPORT } from "./EditorCanvas";
import { clampZoom, panBy, zoomAtPoint, zoomByFactor, zoomPercent } from "./viewportMath";
import type { Viewport } from "./types/documentModel";

/** Per-notch zoom step for wheel gestures (multiplicative, cursor-anchored). */
const WHEEL_ZOOM_SENSITIVITY = 0.0015;
/** Fixed multiplicative step for the zoom in/out controls. */
const ZOOM_STEP_FACTOR = 1.2;

interface PanSession {
  pointerId: number;
  startX: number;
  startY: number;
  startPanX: number;
  startPanY: number;
}

export interface UseViewportResult {
  /** Current viewport transform; pass straight to `EditorCanvas`. */
  viewport: Viewport;
  /** Integer zoom percentage for the indicator: `Math.round(zoom * 100)` (Req 1.6). */
  zoomPercent: number;
  /** True while a pan gesture is active (drives the grab cursor). */
  isPanning: boolean;
  /** Attach to the scrollable stage element; used to resolve cursor-relative coords. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Wheel handler: cursor-anchored zoom, clamped to [0.10, 64.0]. */
  onWheel: (event: ReactWheelEvent<HTMLElement>) => void;
  /** Pointer-down handler: starts a pan on middle-drag or space-drag. */
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  /** Zoom in one step, anchored at the stage center. */
  zoomIn: () => void;
  /** Zoom out one step, anchored at the stage center. */
  zoomOut: () => void;
  /** Reset to the identity viewport (zoom 1, pan 0). */
  reset: () => void;
  /** Direct viewport setter hook. */
  setViewport: React.Dispatch<React.SetStateAction<Viewport>>;
}

export function useViewport(initial: Viewport = DEFAULT_VIEWPORT, isHandToolActive = false): UseViewportResult {
  const [viewport, setViewport] = useState<Viewport>(initial);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [hasInitialized, setHasInitialized] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const spaceHeldRef = useRef<boolean>(false);
  const panSessionRef = useRef<PanSession | null>(null);

  // ResizeObserver to fit the canvas inside the viewport container on mount
  useEffect(() => {
    if (hasInitialized || !containerRef.current) return undefined;
    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          const artboardSize = 1080;
          const padding = 60;
          const zoomX = (width - padding * 2) / artboardSize;
          const zoomY = (height - padding * 2) / artboardSize;
          const zoom = Math.max(0.1, Math.min(zoomX, zoomY, 0.8));
          const panX = (width - artboardSize * zoom) / 2;
          const panY = (height - artboardSize * zoom) / 2;
          
          setViewport({ zoom, panX, panY });
          setHasInitialized(true);
          observer.disconnect();
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [hasInitialized]);

  // Track the space key so a left-drag can pan (the "hand tool" gesture). The
  // handlers ignore space typed into form fields so text editing is unaffected.
  useEffect(() => {
    function isFormField(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.code === "Space" && !isFormField(event.target)) {
        spaceHeldRef.current = true;
      }
    }
    function handleKeyUp(event: KeyboardEvent): void {
      if (event.code === "Space") {
        spaceHeldRef.current = false;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  /** Cursor position relative to the stage element's top-left (transform origin). */
  const cursorInStage = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: clientX, y: clientY };
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  /** Stage center in element-local coordinates, used to anchor button zooms. */
  const stageCenter = useCallback((): { x: number; y: number } => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: 0, y: 0 };
    }
    return { x: rect.width / 2, y: rect.height / 2 };
  }, []);

  const onWheel = useCallback(
    (event: ReactWheelEvent<HTMLElement>): void => {
      // Zoom on wheel (and ctrl-wheel); prevent the page/stage from scrolling.
      if (event.cancelable) {
        event.preventDefault();
      }
      const { x, y } = cursorInStage(event.clientX, event.clientY);
      const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
      setViewport((current) => zoomByFactor(current, factor, x, y));
    },
    [cursorInStage],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      const isMiddleDrag = event.button === 1;
      const isSpaceDrag = event.button === 0 && (spaceHeldRef.current || isHandToolActive);
      const isBackgroundLeftDrag =
        event.button === 0 &&
        !event.shiftKey &&
        !(event.target as Element).closest("[data-layer-id], [data-element-id]");

      if (!isMiddleDrag && !isSpaceDrag && !isBackgroundLeftDrag) {
        return;
      }
      event.preventDefault();
      panSessionRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startPanX: viewport.panX,
        startPanY: viewport.panY,
      };
      setIsPanning(true);
    },
    [viewport.panX, viewport.panY, isHandToolActive],
  );

  // While a pan session is active, translate the view 1:1 with pointer motion
  // (Req 1.3). Listeners live on window so the drag continues outside the stage.
  useEffect(() => {
    if (!isPanning) {
      return undefined;
    }

    function handleMove(event: PointerEvent): void {
      const session = panSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }
      const dx = event.clientX - session.startX;
      const dy = event.clientY - session.startY;
      // 1:1 pan relative to the gesture's starting pan (Req 1.3).
      setViewport((current) =>
        panBy({ zoom: current.zoom, panX: session.startPanX, panY: session.startPanY }, dx, dy),
      );
    }

    function endPan(event: PointerEvent): void {
      const session = panSessionRef.current;
      if (session && event.pointerId !== session.pointerId) {
        return;
      }
      panSessionRef.current = null;
      setIsPanning(false);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", endPan);
    window.addEventListener("pointercancel", endPan);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", endPan);
      window.removeEventListener("pointercancel", endPan);
    };
  }, [isPanning]);

  const zoomIn = useCallback((): void => {
    const center = stageCenter();
    setViewport((current) => zoomByFactor(current, ZOOM_STEP_FACTOR, center.x, center.y));
  }, [stageCenter]);

  const zoomOut = useCallback((): void => {
    const center = stageCenter();
    setViewport((current) => zoomByFactor(current, 1 / ZOOM_STEP_FACTOR, center.x, center.y));
  }, [stageCenter]);

  const reset = useCallback((): void => {
    setViewport(DEFAULT_VIEWPORT);
  }, []);

  useEffect(() => {
    function handleGlobalZoom(e: Event) {
      const customEvent = e as CustomEvent<{ action: 'in' | 'out' | 'reset' | 'fit' }>;
      if (customEvent.detail) {
        if (customEvent.detail.action === 'in') zoomIn();
        else if (customEvent.detail.action === 'out') zoomOut();
        else if (customEvent.detail.action === 'reset') reset();
        // fit is not fully implemented in useViewport, fallback to reset for now
        else if (customEvent.detail.action === 'fit') reset();
      }
    }
    window.addEventListener('app:zoom', handleGlobalZoom);
    return () => window.removeEventListener('app:zoom', handleGlobalZoom);
  }, [zoomIn, zoomOut, reset]);

  return useMemo(
    () => ({
      viewport,
      zoomPercent: zoomPercent(viewport.zoom),
      isPanning,
      containerRef,
      onWheel,
      onPointerDown,
      zoomIn,
      zoomOut,
      reset,
      setViewport,
    }),
    [viewport, isPanning, onWheel, onPointerDown, zoomIn, zoomOut, reset, setViewport],
  );
}

/** Re-exported so callers can clamp/format without importing viewportMath directly. */
export { clampZoom, zoomAtPoint, zoomPercent };
