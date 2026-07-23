/**
 * useCanvasDrag — unified pointer state machine for the creative canvas.
 *
 * Implements the miniPaint `dragStart / dragMove / dragEnd` pattern:
 *   - All three phases are handled by a single intent discriminated union,
 *     eliminating stale-closure bugs from fragmented useEffect chains.
 *   - During `move`, transforms are applied directly to the DOM element with
 *     `el.style.transform`, skipping React state (zero re-renders per frame).
 *   - The Document_Model callback (`onLayerTransform`) is invoked only once
 *     on `pointerup`, avoiding mid-drag mutations.
 *   - Touch and mouse are unified: `changedTouches[0]` is normalised before
 *     entering the same `dragStart` entry point.
 *
 * DragIntent state machine:
 *
 *   idle
 *    └─ pointerdown on editable layer  →  pending
 *    └─ pointerdown on background      →  pan  (viewport)
 *
 *   pending (≥ DRAG_THRESHOLD px travel)
 *    └─ move sufficient distance       →  move
 *    └─ pointerup without travel       →  click (selection resolved externally)
 *
 *   move
 *    └─ pointermove                    →  DOM transform applied, no React state
 *    └─ pointerup                      →  onLayerTransform(dx/zoom, dy/zoom), idle
 *
 * One responsibility per file: canvas pointer gesture logic only.
 */

import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import { collectReferenceLines, computeSnap, effectiveModelThreshold, SNAP_THRESHOLD_PX, type ReferenceLine, type SnapGuide } from "./snapping";
import type { BBox, LayerBox } from "./selectionMath";

/** Pixels of travel required before a pointer-down becomes a drag. */
const DRAG_THRESHOLD = 4;

/** CSS cursor value while dragging an element. */
const MOVING_CURSOR = "grabbing";

// ---------------------------------------------------------------------------
// Intent discriminated union
// ---------------------------------------------------------------------------

type DragIntent =
  | { kind: "idle" }
  | {
      kind: "pending";
      pointerId: number;
      startX: number;
      startY: number;
      layerId: string;
      el: SVGElement;
      startBox: BBox;
      refs: ReferenceLine[];
    }
  | {
      kind: "move";
      pointerId: number;
      startX: number;
      startY: number;
      layerId: string;
      el: SVGElement;
      startBox: BBox;
      refs: ReferenceLine[];
      /** Accumulated delta in screen pixels at the moment of the last move event. */
      lastDx: number;
      lastDy: number;
      lastSnapX: number;
      lastSnapY: number;
    };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface UseCanvasDragOptions {
  /** The canvas host div to attach pointer listeners to. */
  containerRef: RefObject<HTMLDivElement>;
  /** Current viewport zoom — used to convert screen-px deltas to model-space. */
  zoom: number;
  /** Committed-on-pointerup callback; receives model-space delta. */
  onLayerTransform: (layerId: string, dx: number, dy: number, options?: { disableSnap?: boolean }) => void;
  /** Optional callback when a layer is clicked (pointer-down → up < threshold). */
  onLayerClick?: (layerId: string) => void;
  /** Optional callback to emit active snap guides */
  onSnapGuidesChange?: (guides: SnapGuide[]) => void;
  /** Artboard dimensions (model space) to determine snap candidates */
  artboardBounds?: { width: number; height: number };
  /** Whether drag alignment snapping and smart guides are active. Defaults to true. */
  snappingEnabled?: boolean;
  /** Currently selected layers. Used for fuzzy hit-testing (clicking inside bounding box). */
  selectedLayerIds?: string[];
}

export interface UseCanvasDragResult {
  /** True while a layer move drag is in progress. */
  isDragging: boolean;
}

/**
 * Find the innermost SVG element that carries a `data-layer-id` in the given
 * SVG, walking up from `target`. Returns null when `target` is outside the
 * SVG or has no layer ancestor.
 */
function resolveLayerTarget(target: EventTarget | null, svgRoot: SVGSVGElement): { el: SVGElement; layerId: string } | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest("[data-layer-id]");
  if (!el || !(el instanceof SVGElement)) return null;
  if (!svgRoot.contains(el)) return null;

  // Respect `data-editable="false"` on the owning role group.
  const roleGroup = el.closest("g[data-role]");
  if (roleGroup && roleGroup.getAttribute("data-editable") === "false") return null;

  const layerId = el.getAttribute("data-layer-id");
  if (!layerId) return null;

  return { el, layerId };
}

/** Normalise mouse/touch event to a { clientX, clientY } pair. */
function normalisePointer(event: PointerEvent | TouchEvent | MouseEvent): { clientX: number; clientY: number } {
  if ("changedTouches" in event && event.changedTouches.length > 0) {
    const t = event.changedTouches[0];
    return { clientX: t.clientX, clientY: t.clientY };
  }
  const e = event as PointerEvent;
  return { clientX: e.clientX, clientY: e.clientY };
}

/**
 * Apply an intermediate translate transform to an SVG element during a drag.
 * Uses `style.transform` (CSS override) rather than the SVG `transform`
 * attribute so the element snaps back cleanly if the commit is rejected.
 */
function applyDomTranslate(el: SVGElement, dx: number, dy: number): void {
  // Preserve any existing SVG transform by composing it with a CSS translate.
  // CSS `translate()` is applied in screen space, which is what we want.
  el.style.transform = `translate(${dx}px, ${dy}px)`;
}

/** Remove the intermediate CSS transform applied during a drag. */
function clearDomTranslate(el: SVGElement): void {
  el.style.transform = "";
}

function collectEditableBoxesInModelSpace(svgRoot: SVGSVGElement, excludeLayerId: string): LayerBox[] {
  const others: LayerBox[] = [];
  const layers = svgRoot.querySelectorAll("[data-layer-id]");
  for (let i = 0; i < layers.length; i++) {
    const el = layers[i] as SVGGraphicsElement;
    const id = el.getAttribute("data-layer-id");
    if (!id || id === excludeLayerId) continue;
    
    // Respect `data-editable="false"` on the owning role group.
    const roleGroup = el.closest("g[data-role]");
    if (roleGroup && roleGroup.getAttribute("data-editable") === "false") continue;

    const bbox = el.getBBox();
    others.push({
      id,
      box: { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height }
    });
  }
  return others;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCanvasDrag({
  containerRef,
  zoom,
  onLayerTransform,
  onLayerClick,
  onSnapGuidesChange,
  artboardBounds,
  snappingEnabled = true,
  selectedLayerIds = [],
}: UseCanvasDragOptions): UseCanvasDragResult {
  const intentRef = useRef<DragIntent>({ kind: "idle" });
  // Track the current zoom in a ref so the pointerup handler always sees the
  // latest value without re-creating event listeners.
  const zoomRef = useRef<number>(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Keep the preference in a ref so toggling snap does not tear down the
  // pointer listeners while a gesture is active.
  const snappingEnabledRef = useRef<boolean>(snappingEnabled);
  const onSnapGuidesChangeRef = useRef(onSnapGuidesChange);
  useEffect(() => {
    onSnapGuidesChangeRef.current = onSnapGuidesChange;
  }, [onSnapGuidesChange]);
  useEffect(() => {
    const wasEnabled = snappingEnabledRef.current;
    snappingEnabledRef.current = snappingEnabled;
    if (wasEnabled && !snappingEnabled) {
      onSnapGuidesChangeRef.current?.([]);
    }
  }, [snappingEnabled]);

  // Keep stable callback refs so listener identity is not recreated on every
  // render when the parent passes new inline arrow functions.
  const onLayerTransformRef = useRef(onLayerTransform);
  const onLayerClickRef = useRef(onLayerClick);
  useEffect(() => {
    onLayerTransformRef.current = onLayerTransform;
  }, [onLayerTransform]);
  useEffect(() => {
    onLayerClickRef.current = onLayerClick;
  }, [onLayerClick]);

  // Register pointer listeners on the canvas container.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    // -----------------------------------------------------------------------
    // dragStart — called on pointerdown
    // -----------------------------------------------------------------------
    function dragStart(event: PointerEvent): void {
      // Only primary button (left-click / touch) drives element move.
      if (event.button !== 0 && event.pointerType !== "touch") return;

      const svgRoot = container!.querySelector("svg");
      if (!(svgRoot instanceof SVGSVGElement)) return;

      const { clientX, clientY } = normalisePointer(event);

      let hit = resolveLayerTarget(event.target, svgRoot);
      if (!hit && selectedLayerIds && selectedLayerIds.length > 0) {
        // Fallback: if the direct click missed (e.g. clicking a thin stroke or inside a transparent path),
        // check if we clicked inside the screen-space bounding box of any currently selected layer.
        for (const id of selectedLayerIds) {
          const el = svgRoot.querySelector(`[data-layer-id="${id}"]`);
          if (el instanceof SVGGraphicsElement) {
            const bbox = el.getBoundingClientRect();
            if (clientX >= bbox.left && clientX <= bbox.right && clientY >= bbox.top && clientY <= bbox.bottom) {
              hit = { el, layerId: id };
              break;
            }
          }
        }
      }

      if (!hit) {
        // Background click — let the viewport pan handler take over.
        return;
      }

      const startBoxRect = (hit.el as SVGGraphicsElement).getBBox();
      const startBox = { x: startBoxRect.x, y: startBoxRect.y, width: startBoxRect.width, height: startBoxRect.height };
      const refs = snappingEnabledRef.current
        ? collectReferenceLines(
            collectEditableBoxesInModelSpace(svgRoot, hit.layerId),
            artboardBounds ?? null,
          )
        : [];

      intentRef.current = {
        kind: "pending",
        pointerId: event.pointerId,
        startX: clientX,
        startY: clientY,
        layerId: hit.layerId,
        el: hit.el,
        startBox,
        refs,
      };

      // Capture so we receive move/up even when pointer leaves the window.
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }

    // -----------------------------------------------------------------------
    // dragMove — called on pointermove
    // -----------------------------------------------------------------------
    function dragMove(event: PointerEvent): void {
      const intent = intentRef.current;
      if (intent.kind === "idle") return;
      if (event.pointerId !== intent.pointerId) return;

      const { clientX, clientY } = normalisePointer(event);
      const dx = clientX - intent.startX;
      const dy = clientY - intent.startY;

      if (intent.kind === "pending") {
        // Upgrade pending → move once travel threshold is reached.
        const distance = Math.hypot(dx, dy);
        if (distance < DRAG_THRESHOLD) return;

        intentRef.current = {
          kind: "move",
          pointerId: intent.pointerId,
          startX: intent.startX,
          startY: intent.startY,
          layerId: intent.layerId,
          el: intent.el,
          startBox: intent.startBox,
          refs: intent.refs,
          lastDx: 0,
          lastDy: 0,
          lastSnapX: 0,
          lastSnapY: 0,
        };

        intent.el.style.cursor = MOVING_CURSOR;
        return;
      }

      if (intent.kind === "move") {
        const rawDx = dx / zoomRef.current;
        const rawDy = dy / zoomRef.current;
        
        let snapX = rawDx;
        let snapY = rawDy;
        let guides: SnapGuide[] = [];

        // Meta/ctrl temporarily bypasses an enabled snap setting. When snapping
        // is disabled, avoid both snap computation and guide updates entirely.
        if (snappingEnabledRef.current && !event.metaKey && !event.ctrlKey) {
          const candidateBox = {
            ...intent.startBox,
            x: intent.startBox.x + rawDx,
            y: intent.startBox.y + rawDy,
          };
          
          const threshold = effectiveModelThreshold(SNAP_THRESHOLD_PX, zoomRef.current);
          const snapResult = computeSnap(candidateBox, intent.refs, threshold);
          
          snapX = rawDx + snapResult.offsetX;
          snapY = rawDy + snapResult.offsetY;
          guides = snapResult.guides;
        }

        // Apply DOM transform directly — no React state, no re-render.
        applyDomTranslate(intent.el, snapX * zoomRef.current, snapY * zoomRef.current);
        
        let moveLabel = document.getElementById("canvas-move-measurement");
        if (!moveLabel) {
          moveLabel = document.createElement("div");
          moveLabel.id = "canvas-move-measurement";
          moveLabel.style.position = "absolute";
          moveLabel.style.background = "var(--accent-color, #0d99ff)";
          moveLabel.style.color = "#ffffff";
          moveLabel.style.padding = "4px 10px";
          moveLabel.style.borderRadius = "50px";
          moveLabel.style.fontSize = "12px";
          moveLabel.style.fontWeight = "600";
          moveLabel.style.fontFamily = "var(--font-mono, monospace)";
          moveLabel.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
          moveLabel.style.pointerEvents = "none";
          moveLabel.style.zIndex = "1000";
          moveLabel.style.whiteSpace = "nowrap";
          container.appendChild(moveLabel);
        }
        moveLabel.style.left = `${clientX + 20}px`;
        moveLabel.style.top = `${clientY - 40}px`;
        moveLabel.textContent = `X: ${Math.round(intent.startBox.x + snapX)} Y: ${Math.round(intent.startBox.y + snapY)}`;
        
        intent.lastDx = dx;
        intent.lastDy = dy;
        intent.lastSnapX = snapX * zoomRef.current;
        intent.lastSnapY = snapY * zoomRef.current;
        
        if (snappingEnabledRef.current) {
          onSnapGuidesChangeRef.current?.(guides);
        }
      }
    }

    // -----------------------------------------------------------------------
    // dragEnd — called on pointerup / pointercancel
    // -----------------------------------------------------------------------
    function dragEnd(event: PointerEvent): void {
      const intent = intentRef.current;
      if (intent.kind === "idle") return;
      if (event.pointerId !== intent.pointerId) return;

      if (intent.kind === "pending") {
        // Pointer released without travel — this is a click.
        intentRef.current = { kind: "idle" };
        onLayerClickRef.current?.(intent.layerId);
      } else if (intent.kind === "move") {
        // Pointer released after travel — this is a move commit.
        const moveIntent = intent;
        intentRef.current = { kind: "idle" };
        moveIntent.el.style.cursor = "";
        clearDomTranslate(moveIntent.el);
        if (snappingEnabledRef.current) {
          onSnapGuidesChangeRef.current?.([]);
        }
        const moveLabel = document.getElementById("canvas-move-measurement");
        if (moveLabel) moveLabel.remove();
        
        onLayerTransformRef.current(moveIntent.layerId, moveIntent.lastSnapX / zoomRef.current, moveIntent.lastSnapY / zoomRef.current, { disableSnap: true });
      }
    }

    container.addEventListener("pointerdown", dragStart);
    container.addEventListener("pointermove", dragMove);
    container.addEventListener("pointerup", dragEnd);
    container.addEventListener("pointercancel", dragEnd);

    return () => {
      container.removeEventListener("pointerdown", dragStart);
      container.removeEventListener("pointermove", dragMove);
      container.removeEventListener("pointerup", dragEnd);
      container.removeEventListener("pointercancel", dragEnd);
    };
  }, [containerRef]);

  // isDragging derived from the ref cannot be reactive without a state tick;
  // return false as a placeholder — callers use it only for cursor hints.
  return { isDragging: false };
}
