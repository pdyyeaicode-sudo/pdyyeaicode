/**
 * useCanvasDrag — unified pointer state machine for the creative canvas.
 *
 * Implements the miniPaint `dragStart / dragMove / dragEnd` pattern:
 *   - All three phases are handled by a single intent discriminated union,
 *     eliminating stale-closure bugs from fragmented useEffect chains.
 *   - During `move`, the element's own `transform` attribute is rewritten
 *     directly, skipping React state (zero re-renders per frame).
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
 *    └─ pointermove                    →  transform attribute rewritten, no React state
 *    └─ pointerup                      →  onLayerTransform(local delta), idle
 *
 * Coordinate spaces (geometry/transformDelta.ts owns the conversions):
 *
 *   pointer screen delta
 *     ÷ zoom            →  world/document delta   → engine, snapping, badge
 *     P⁻¹ applied       →  parent-space delta     → the DOM preview
 *     W⁻¹ applied       →  local-space delta      → translateLayerCommand
 *
 * One responsibility per file: canvas pointer gesture logic only.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { collectReferenceLines, computeSnap, effectiveModelThreshold, SNAP_THRESHOLD_PX, type ReferenceLine, type SnapGuide } from "./snapping";
import {
  newestPointerSample as readNewestPointerSample,
  supportsRawPointerUpdates,
} from "./interaction/pointerSample";
import { dragDeltasFor, type DragDeltas, type TransformChainNode } from "./geometry/transformDelta";
import {
  createLiveTransformStore,
  type LiveTransform,
  type LiveTransformStore,
} from "./interaction/liveTransformStore";
import { multiply, parseSvgTransform, type Matrix2D, type RectF } from "./renderer/matrix2d";
import type { BBox, LayerBox } from "./selectionMath";
import type { DragGestureEvent } from "./interaction/gestureChannel";

/**
 * What this hook needs from a scene node: its place in the transform chain and
 * its bounds in a space that is comparable between layers.
 *
 * Structural, so a `RenderNode` satisfies it without an adapter.
 */
export interface DragSceneNode extends TransformChainNode {
  /** `localBounds` mapped through `worldTransform`; null when unknown. */
  readonly worldBounds: RectF | null;
}

/**
 * Escape a value for safe interpolation into an attribute selector.
 *
 * Layer ids come from `data-layer-id` attributes in an imported document, so an
 * id containing a quote would otherwise retarget the selector at a layer the
 * caller never named, or throw a `SyntaxError` from inside a pointer handler.
 */
function cssAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Class on the live measurement badge.
 *
 * A class scoped to the drag container rather than a document-wide id, so two
 * canvases on one page cannot contend for the same node and the container's
 * cleanup can remove exactly its own.
 */
const MEASUREMENT_CLASS = "pydee-canvas-move-measurement";

/**
 * Pixels of travel required before a pointer-down becomes a drag.
 *
 * Device dependent, because the tradeoff is different. A mouse or pen reports
 * position precisely and does not wobble, so 1px lets a deliberate nudge register
 * immediately — which is the whole point of a precision device. A finger does
 * wobble, and a 1px threshold would turn every tap into a drag, so touch keeps
 * real slop.
 *
 * The threshold only gates when a gesture *starts*. Once it has, the offset is
 * measured from the original pointer-down position, so no travel is discarded and
 * sub-pixel movement flows straight through.
 */
const DRAG_THRESHOLD_PRECISE = 1;
const DRAG_THRESHOLD_TOUCH = 4;

function dragThresholdFor(pointerType: string): number {
  return pointerType === "touch" ? DRAG_THRESHOLD_TOUCH : DRAG_THRESHOLD_PRECISE;
}

/**
 * Format a live coordinate for the measurement badge.
 *
 * Whole values stay whole so the common case reads cleanly; anything else shows
 * two decimals, because a readout that rounds to the nearest pixel makes fine
 * dragging look like it did nothing.
 */
function formatCoordinate(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

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
      /**
       * The element's own `transform` attribute as the document renders it.
       *
       * The preview PREPENDS a translate to this rather than writing
       * `style.transform`. Measured in Chromium
       * (browser-tests/nestedTransformDrag.spec.ts): an inline style transform
       * REPLACES the SVG `transform` attribute, so the old approach silently
       * dropped a rotated layer's rotation for the duration of every drag.
       */
      baseTransform: string;
      baseLocalTransform: Matrix2D;
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
      baseTransform: string;
      /**
       * The element's document transform as a MATRIX, so the published local
       * transform can be composed without re-parsing the string every sample.
       */
      baseLocalTransform: Matrix2D;
      /** Accumulated delta in screen pixels at the moment of the last move event. */
      lastDx: number;
      lastDy: number;
      /** Last pointer position, so the frame callback can place the badge. */
      lastPointerX: number;
      lastPointerY: number;
      /**
       * The same displacement in the three spaces the editor writes to.
       *
       * `world` goes to the engine and to snapping, `parent` to the DOM preview,
       * `local` to the commit. They differ as soon as anything in the transform
       * chain is not the identity, which is why they are stored separately
       * instead of one "document delta" that each consumer reinterpreted.
       */
      lastWorldDx: number;
      lastWorldDy: number;
      lastParentDx: number;
      lastParentDy: number;
      lastLocalDx: number;
      lastLocalDy: number;
      /**
       * The measurement badge for this gesture, cached so the per-move update is
       * a field read rather than a document-wide `getElementById`.
       */
      label?: HTMLDivElement;
      /**
       * Watches for React replacing the SVG subtree so the preview can be
       * re-applied to the new node within the same frame.
       */
      observer?: MutationObserver;
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
  /**
   * The authoritative transform chain and world bounds for a layer.
   *
   * Supplied from the render scene — the SAME `worldTransform` the SVG and Skia
   * backends paint with, and the same one the selection overlay derives its box
   * from. Without it this hook has to assume every ancestor transform is the
   * identity, which is only true for a flat document; that assumption is what
   * made a drag inside a scaled group over-travel by the group's scale and a drag
   * inside a rotated group travel in the wrong direction.
   *
   * Optional so a caller with no scene still drags, but the assumption is logged
   * rather than made quietly.
   */
  resolveSceneNode?: (layerId: string) => DragSceneNode | undefined;
  /**
   * Retained state for the gesture in flight, shared with the renderers.
   *
   * Supplying it is what lets the selection overlay and the Skia canvas follow the
   * drag without either of them measuring the DOM. When omitted, the hook creates
   * its own so the preview still works — the drag is simply not observable from
   * outside this component.
   *
   * Its presence also changes WHEN the DOM is written: pointer handlers only
   * update this store, and the single attribute write happens in the store's
   * animation frame. A 1000Hz mouse therefore costs one write per frame instead of
   * sixteen.
   */
  liveTransforms?: LiveTransformStore;
  /**
   * Engine hit testing: what is under a CLIENT point, by layer id.
   *
   * Returns null when the engine is not the active renderer, which selects the DOM
   * path below — the documented SVG compatibility mode, not a silent fallback.
   *
   * Preferred over `event.target` because the engine walks the same scene, in
   * reverse paint order, with the same world transforms it drew with. DOM targeting
   * answers a different question: which ELEMENT received the event, which depends on
   * stroke widths, `pointer-events`, fill rules and whatever the serializer happened
   * to nest. The two disagree exactly where it matters — a transparent fill, a thin
   * stroke, a rotated group.
   */
  hitTestClient?: (clientX: number, clientY: number) => string | null;
  /**
   * Whether the preview writes the element's SVG `transform` attribute.
   *
   * False when another surface previews the gesture — the engine, via
   * `onDragGesture`. Then a drag mutates NO design object in the DOM: the retained
   * state is still updated and still published every frame, but nothing is written to
   * the document object model, which is the point of the single-canvas architecture.
   *
   * Defaults true so the SVG compatibility renderer keeps working unchanged.
   */
  domPreview?: boolean;
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
  /**
   * Live gesture reporting, in DOCUMENT pixels, at pointer rate.
   *
   * Separate from `onLayerTransform`, which fires once on commit. This exists so
   * a renderer outside this component's subtree can follow the drag without the
   * per-frame offset being lifted into React state — which would re-render the
   * whole canvas on every `pointermove`.
   *
   * Contract: exactly one `begin`, zero or more `move`, then exactly one `end`
   * or `cancel`. A gesture that never crosses the drag threshold emits nothing.
   */
  onDragGesture?: (event: DragGestureEvent) => void;
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
 * The NEWEST position this event carries.
 *
 * Delegated to `interaction/pointerSample.ts`, which is shared with the resize and
 * rotate gestures in `SelectionOverlay` so both read input the same way. See that file
 * for why the last coalesced sample is used rather than an average or a replay.
 */
function newestPointerSample(
  event: PointerEvent | TouchEvent | MouseEvent,
): { clientX: number; clientY: number } {
  return readNewestPointerSample(event);
}

/**
 * Preview a drag by PREPENDING a translate to the element's own transform.
 *
 * Prepending — `translate(dx dy) <original>` — puts the translate in the
 * element's PARENT space, which is where a drag delta belongs and is the same
 * place `P⁻¹·T·P` lands it. Appending would apply the translate inside the
 * element's own rotation and send it off at an angle.
 *
 * The `transform` ATTRIBUTE is used, not `style.transform`. Measured in Chromium
 * (browser-tests/nestedTransformDrag.spec.ts): the SVG `transform` attribute is a
 * presentation attribute for the same CSS property, so an inline style overrides
 * it entirely — a 90-degree-rotated layer visibly un-rotated for the duration of
 * every drag, then snapped back on commit. Writing the attribute composes for
 * real.
 *
 * Idempotent: it computes the whole value from `base` and writes only when the
 * result differs, so a MutationObserver watching this attribute cannot loop.
 */
function applyPreviewTranslate(el: SVGElement, base: string, dx: number, dy: number): void {
  const next =
    dx === 0 && dy === 0 ? base : `translate(${formatTransformValue(dx)} ${formatTransformValue(dy)}) ${base}`.trimEnd();
  const current = el.getAttribute("transform");
  if (next === "") {
    if (current !== null) {
      el.removeAttribute("transform");
    }
    return;
  }
  if (current !== next) {
    el.setAttribute("transform", next);
  }
}

/**
 * Restore the element's document transform, discarding the preview.
 *
 * Called on commit (the document is about to supply the real value) and on
 * cancel/unmount (the gesture is abandoned), so a stale preview can never
 * survive a gesture.
 */
function restorePreviewTransform(el: SVGElement, base: string): void {
  if (base === "") {
    el.removeAttribute("transform");
  } else if (el.getAttribute("transform") !== base) {
    el.setAttribute("transform", base);
  }
  // Clear any inline transform a previous build may have left behind, so an old
  // cached bundle cannot keep overriding the attribute we now rely on.
  if (el.style.transform !== "") {
    el.style.transform = "";
  }
}

/**
 * Numbers for an SVG transform attribute.
 *
 * Enough precision for sub-pixel dragging (the whole reason the 0.5px quantiser
 * was removed from the authoring path), with trailing zeros trimmed so the
 * attribute stays readable.
 */
function formatTransformValue(value: number): string {
  return Number.parseFloat(value.toFixed(4)).toString();
}

/**
 * Reference boxes for snapping, in WORLD space, from the authoritative scene.
 *
 * The DOM is still used to decide WHICH layers participate — `data-editable` and
 * the rendered layer set are DOM facts — but never to decide where they are. The
 * previous version called `getBBox()` on every layer, which returns each layer's
 * bounds in its OWN local space, ignoring its transform. Boxes from different
 * local spaces are not comparable, so snapping silently compared unrelated
 * numbers as soon as any layer carried a transform.
 */
function collectWorldBoxesFromScene(
  svgRoot: SVGSVGElement,
  excludeLayerId: string,
  resolve: (layerId: string) => DragSceneNode | undefined,
): LayerBox[] {
  const others: LayerBox[] = [];
  const layers = svgRoot.querySelectorAll("[data-layer-id]");
  for (let i = 0; i < layers.length; i++) {
    const el = layers[i] as SVGGraphicsElement;
    const id = el.getAttribute("data-layer-id");
    if (!id || id === excludeLayerId) continue;

    const roleGroup = el.closest("g[data-role]");
    if (roleGroup && roleGroup.getAttribute("data-editable") === "false") continue;

    const bounds = resolve(id)?.worldBounds;
    // A layer with no resolved bounds contributes no snap line. It is skipped
    // rather than approximated, because a guessed edge would pull the drag to a
    // place nothing is actually aligned with.
    if (bounds === undefined || bounds === null) continue;

    others.push({ id, box: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } });
  }
  return others;
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
  resolveSceneNode,
  liveTransforms,
  hitTestClient,
  domPreview = true,
  onLayerClick,
  onSnapGuidesChange,
  artboardBounds,
  snappingEnabled = true,
  selectedLayerIds = [],
  onDragGesture,
}: UseCanvasDragOptions): UseCanvasDragResult {
  const intentRef = useRef<DragIntent>({ kind: "idle" });
  // Track the current zoom in a ref so the pointerup handler always sees the
  // latest value without re-creating event listeners.
  const zoomRef = useRef<number>(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Mirrored in a ref for the same reason as `zoom`: the scene changes on every
  // document edit, and re-attaching pointer listeners mid-gesture would drop it.
  const resolveSceneNodeRef = useRef(resolveSceneNode);
  useEffect(() => {
    resolveSceneNodeRef.current = resolveSceneNode;
  }, [resolveSceneNode]);
  // Warn once per hook instance, not once per pointer sample.
  const warnedNoSceneRef = useRef(false);
  const warnedPointerCancelRef = useRef(false);
  const hitTestClientRef = useRef(hitTestClient);
  hitTestClientRef.current = hitTestClient;
  const domPreviewRef = useRef(domPreview);
  domPreviewRef.current = domPreview;

  /**
   * True only once the component is really going away.
   *
   * Declared before the listener effect so its cleanup runs FIRST on unmount
   * (React runs cleanups in declaration order), which lets that effect tell an
   * unmount apart from an ordinary re-attach.
   *
   * This matters because the listener effect is keyed on the container element,
   * and a mid-gesture re-render that swaps the container used to run the cleanup —
   * which reset the intent to idle and silently abandoned the drag. With the DOM
   * write deferred to an animation frame the re-render lands at a different moment
   * and the abort became reproducible: the second pointer sample of every gesture
   * after a commit was lost.
   */
  const unmountedRef = useRef(false);
  useEffect(
    () => () => {
      unmountedRef.current = true;
    },
    [],
  );

  /**
   * The store the preview is driven from.
   *
   * A private one when the owner supplies none, so behaviour does not depend on
   * whether anyone else is watching the gesture.
   */
  const ownStoreRef = useRef<LiveTransformStore | null>(null);
  if (ownStoreRef.current === null) {
    ownStoreRef.current = createLiveTransformStore();
  }
  const liveStore = liveTransforms ?? ownStoreRef.current;
  const liveStoreRef = useRef(liveStore);
  liveStoreRef.current = liveStore;

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
  const onDragGestureRef = useRef(onDragGesture);
  useEffect(() => {
    onLayerTransformRef.current = onLayerTransform;
  }, [onLayerTransform]);
  useEffect(() => {
    onLayerClickRef.current = onLayerClick;
  }, [onLayerClick]);
  useEffect(() => {
    onDragGestureRef.current = onDragGesture;
  }, [onDragGesture]);

  /**
   * Configuration that is read at gesture time but is NOT a callback.
   *
   * These were previously read straight from the closure while the listener
   * effect had `[containerRef]` as its only dependency, so both were frozen at
   * their first-mount values for the life of the component: `selectedLayerIds`
   * stayed empty — making the bounding-box fallback hit-test dead code, which is
   * what lets a user grab a thin stroke or a transparent path — and
   * `artboardBounds` kept a stale canvas size, so snap targets were computed
   * against the wrong artboard after any resize.
   */
  const selectedLayerIdsRef = useRef(selectedLayerIds);
  const artboardBoundsRef = useRef(artboardBounds);
  useEffect(() => {
    selectedLayerIdsRef.current = selectedLayerIds;
  }, [selectedLayerIds]);
  useEffect(() => {
    artboardBoundsRef.current = artboardBounds;
  }, [artboardBounds]);

  /**
   * Re-run the listener effect once the container element actually exists.
   *
   * `SVGCanvas` calls this hook before its own early return for a null
   * `designOutput`, so on first mount `containerRef.current` is null and nothing
   * gets attached. `containerRef` is a stable object, so without this signal the
   * effect never runs again and dragging is dead for the life of the mount —
   * which is the ordinary "generate a design, then drag an element" sequence.
   */
  const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    setContainerElement((previous) =>
      previous === containerRef.current ? previous : containerRef.current,
    );
  });

  // Register pointer listeners on the canvas container.
  // `containerElement` is in the deps so the effect re-runs once the container
  // actually mounts; `containerRef` alone is a stable object and would never
  // trigger it.
  useEffect(() => {
    const container = containerElement ?? containerRef.current;
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

      // Ask the RENDERER what is under the pointer, in preference to asking the DOM
      // which element received the event. When the engine answers, its answer wins:
      // it is the same scene, the same paint order and the same world transforms
      // that produced the pixels. The DOM result is kept only for the compatibility
      // path, and only the ELEMENT is taken from it — never the identity.
      const engineHitId = hitTestClientRef.current?.(clientX, clientY) ?? null;
      if (engineHitId !== null && engineHitId !== hit?.layerId) {
        const element = svgRoot.querySelector<SVGElement>(
          `[data-layer-id="${cssAttributeValue(engineHitId)}"]`,
        );
        if (element !== null) {
          hit = { el: element, layerId: engineHitId };
        }
      }
      const currentSelectedIds = selectedLayerIdsRef.current;
      if (!hit && currentSelectedIds && currentSelectedIds.length > 0) {
        // Fallback: if the direct click missed (e.g. clicking a thin stroke or inside a transparent path),
        // check if we clicked inside the screen-space bounding box of any currently selected layer.
        for (const id of currentSelectedIds) {
          const el = svgRoot.querySelector(`[data-layer-id="${cssAttributeValue(id)}"]`);
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

      const resolve = resolveSceneNodeRef.current;
      const sceneNode = resolve?.(hit.layerId);

      if (resolve === undefined && !warnedNoSceneRef.current) {
        warnedNoSceneRef.current = true;
        console.warn(
          "[drag] no render scene supplied, so the layer's ancestor transforms are "
            + "assumed to be the identity. A drag inside a scaled or rotated group will "
            + "not track the pointer. Pass resolveSceneNode to fix this.",
        );
      }

      // The start box is what snapping and the measurement badge are expressed
      // in. World bounds when the scene has them, because that is the only space
      // in which two different layers' boxes are comparable; `getBBox()` is each
      // layer's own local space.
      let startBox: BBox;
      if (sceneNode?.worldBounds != null) {
        const bounds = sceneNode.worldBounds;
        startBox = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      } else {
        const startBoxRect = (hit.el as SVGGraphicsElement).getBBox();
        startBox = {
          x: startBoxRect.x,
          y: startBoxRect.y,
          width: startBoxRect.width,
          height: startBoxRect.height,
        };
      }

      const refs = snappingEnabledRef.current
        ? collectReferenceLines(
            resolve !== undefined
              ? collectWorldBoxesFromScene(svgRoot, hit.layerId, resolve)
              : collectEditableBoxesInModelSpace(svgRoot, hit.layerId),
            artboardBoundsRef.current ?? null,
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
        baseTransform: hit.el.getAttribute("transform") ?? "",
        baseLocalTransform: parseSvgTransform(hit.el.getAttribute("transform")).matrix,
      };

      // A layer was hit: stop the event from bubbling to the viewport pan handler on
      // the ancestor stage div. Without this, clicking a shape both starts a drag
      // (here) AND a viewport pan (there), so the canvas moves along with the shape.
      //
      // The SelectionOverlay's capture-phase listener fires BEFORE this bubble-phase
      // handler, so it is unaffected: the selection is resolved before propagation
      // is stopped.
      event.stopPropagation();

      // No setPointerCapture. Move and up are on the WINDOW, so they arrive even when
      // the pointer leaves it, and capture bound the gesture to a node React can
      // replace -- which made Chromium fire pointercancel mid-drag and killed every
      // gesture after the first commit.
    }

    // -----------------------------------------------------------------------
    // dragMove — called on pointermove
    // -----------------------------------------------------------------------
    function dragMove(event: PointerEvent): void {
      const intent = intentRef.current;
      if (intent.kind === "idle") return;
      if (event.pointerId !== intent.pointerId) return;

      const { clientX, clientY } = newestPointerSample(event);
      const dx = clientX - intent.startX;
      const dy = clientY - intent.startY;

      if (intent.kind === "pending") {
        // Upgrade pending → move once travel threshold is reached.
        const distance = Math.hypot(dx, dy);
        if (distance < dragThresholdFor(event.pointerType)) return;

        intentRef.current = {
          kind: "move",
          pointerId: intent.pointerId,
          startX: intent.startX,
          startY: intent.startY,
          layerId: intent.layerId,
          el: intent.el,
          startBox: intent.startBox,
          refs: intent.refs,
          baseTransform: intent.baseTransform,
          baseLocalTransform: intent.baseLocalTransform,
          lastDx: 0,
          lastDy: 0,
          lastPointerX: intent.startX,
          lastPointerY: intent.startY,
          lastWorldDx: 0,
          lastWorldDy: 0,
          lastParentDx: 0,
          lastParentDy: 0,
          lastLocalDx: 0,
          lastLocalDy: 0,
        };

        intent.el.style.cursor = MOVING_CURSOR;
        // A renderer outside this subtree can now follow the gesture. Emitted
        // after the promotion so a listener never sees a move before a begin.
        onDragGestureRef.current?.({
          phase: "begin",
          layerId: intent.layerId,
          dx: 0,
          dy: 0,
        });
        // Process the threshold-crossing movement immediately. Previously this
        // first real drag frame was discarded, which made a quick text drag
        // look like it had not moved at all.
        dragMove(event);
        return;
      }

      if (intent.kind === "move") {
        // The element is re-resolved and the preview re-applied in the store's
        // FRAME callback, not here. Doing it per pointer sample was one scoped
        // query and one attribute write per sample; at frame rate it is one of
        // each per frame, and the arithmetic below is all this handler does.
        //
        // The MutationObserver below still exists for the case a frame does not
        // follow: React can replace the subtree as a consequence of the render
        // this very sample triggered, which lands after the last pointermove, so
        // a paused drag would otherwise lose its preview.
        if (intent.observer === undefined) {
          const observer = new MutationObserver(() => {
            const current = intentRef.current;
            if (current.kind !== "move") {
              return;
            }
            const replacement = container.querySelector<SVGElement>(
              `[data-layer-id="${cssAttributeValue(current.layerId)}"]`,
            );
            if (replacement === null) {
              return;
            }
            if (replacement !== current.el) {
              current.el = replacement;
              current.baseTransform = replacement.getAttribute("transform") ?? "";
              current.baseLocalTransform = parseSvgTransform(current.baseTransform).matrix;
              replacement.style.cursor = MOVING_CURSOR;
            }
            // Re-applied unconditionally, because React can also rewrite the
            // `transform` attribute in place on the SAME node. The write is
            // idempotent, so re-applying cannot feed this observer in a loop.
            if (domPreviewRef.current) {
              applyPreviewTranslate(
                current.el,
                current.baseTransform,
                current.lastParentDx,
                current.lastParentDy,
              );
            }
          });
          observer.observe(container, {
            childList: true,
            subtree: true,
            // React replacing the subtree is one way the preview is lost; React
            // rewriting this attribute on the surviving node is the other.
            attributes: true,
            attributeFilter: ["transform"],
          });
          intent.observer = observer;
        }

        const worldDx = dx / zoomRef.current;
        const worldDy = dy / zoomRef.current;

        let snapWorldX = worldDx;
        let snapWorldY = worldDy;
        let guides: SnapGuide[] = [];

        // Meta/ctrl temporarily bypasses an enabled snap setting. When snapping
        // is disabled, avoid both snap computation and guide updates entirely.
        if (snappingEnabledRef.current && !event.metaKey && !event.ctrlKey) {
          const candidateBox = {
            ...intent.startBox,
            x: intent.startBox.x + worldDx,
            y: intent.startBox.y + worldDy,
          };

          const threshold = effectiveModelThreshold(SNAP_THRESHOLD_PX, zoomRef.current);
          const snapResult = computeSnap(candidateBox, intent.refs, threshold);

          snapWorldX = worldDx + snapResult.offsetX;
          snapWorldY = worldDy + snapResult.offsetY;
          guides = snapResult.guides;
        }

        // One world displacement, three spaces.
        //
        // The engine takes the world delta and resolves `P⁻¹·T·P` itself; the DOM
        // preview needs the delta in the element's parent space; the commit writes
        // geometry, which lives inside the element's own transform. Handing the
        // same number to all three is only correct for a flat document — see
        // geometry/transformDelta.ts.
        const sceneNode = resolveSceneNodeRef.current?.(intent.layerId);
        const resolveNode = resolveSceneNodeRef.current;
        let deltas: DragDeltas | null;
        if (sceneNode !== undefined && resolveNode !== undefined) {
          deltas = dragDeltasFor(sceneNode, resolveNode, { dx: snapWorldX, dy: snapWorldY });
        } else {
          if (resolveNode !== undefined && !warnedNoSceneRef.current) {
            // A resolver exists but this layer is not in the scene. That is an id
            // mismatch between the DOM and the document, not a missing feature, so
            // it is reported instead of being absorbed by the identity assumption
            // below.
            warnedNoSceneRef.current = true;
            console.warn(
              `[drag] layer "${intent.layerId}" is not in the render scene, so its `
                + "ancestor transforms are assumed to be the identity for this gesture.",
            );
          }
          deltas = {
            world: { dx: snapWorldX, dy: snapWorldY },
            parent: { dx: snapWorldX, dy: snapWorldY },
            local: { dx: snapWorldX, dy: snapWorldY },
          };
        }

        if (deltas === null) {
          // A collapsed ancestor makes the gesture unresolvable. Reported rather
          // than moving the layer by an unconverted delta, which would send it
          // somewhere unrelated to the pointer.
          console.warn(
            `[drag] layer "${intent.layerId}" has a singular transform chain, so this `
              + "pointer sample cannot be converted and is ignored.",
          );
          return;
        }

        // NO DOM WORK HERE. This is the interaction hot path.
        //
        // The handler's whole job is arithmetic plus one assignment into the
        // retained gesture state. Every write to the document object model — the
        // element's transform, the measurement badge's position and text — happens
        // in the store's animation frame instead, so a 1000Hz pointer costs one
        // write per frame rather than sixteen. That is the property that makes an
        // immediate-mode canvas feel attached to the cursor, implemented here
        // without giving up the SVG renderer.
        //
        // The world delta and the local transform are BOTH published: the engine
        // and the selection overlay want the matrix, while the badge and the
        // snapping guides are expressed as a displacement.
        intent.lastDx = dx;
        intent.lastDy = dy;
        intent.lastPointerX = clientX;
        intent.lastPointerY = clientY;
        // Each space stored under its own name. The previous single
        // `lastDocumentDx` was read by the preview, the gesture channel and the
        // commit, which is how one number came to mean three different things.
        intent.lastWorldDx = deltas.world.dx;
        intent.lastWorldDy = deltas.world.dy;
        intent.lastParentDx = deltas.parent.dx;
        intent.lastParentDy = deltas.parent.dy;
        intent.lastLocalDx = deltas.local.dx;
        intent.lastLocalDy = deltas.local.dy;

        liveStoreRef.current.set({
          layerId: intent.layerId,
          kind: "move",
          localTransform: multiply(
            { a: 1, b: 0, c: 0, d: 1, e: deltas.parent.dx, f: deltas.parent.dy },
            intent.baseLocalTransform,
          ),
          worldDelta: { dx: deltas.world.dx, dy: deltas.world.dy },
          localBounds: null,
          // A move has no new corners to publish: the box is the committed one
          // displaced by `worldDelta`, which chrome already applies. Publishing
          // corners here would mean re-deriving them from the matrix in a second
          // place, and a move is the one gesture where that is unnecessary.
          corners: null,
        });

        // Report the offset in WORLD (document) pixels: the engine converts it
        // into the node's own space itself, and every subscriber that compares a
        // drag against another layer needs a shared space.
        onDragGestureRef.current?.({
          phase: "move",
          layerId: intent.layerId,
          dx: deltas.world.dx,
          dy: deltas.world.dy,
        });


        if (snappingEnabledRef.current) {
          onSnapGuidesChangeRef.current?.(guides);
        }
      }
    }

    // -----------------------------------------------------------------------
    // dragEnd — called on pointerup / pointercancel
    // -----------------------------------------------------------------------
    /**
     * A cancelled pointer is NOT a completed gesture.
     *
     * Chromium cancels the pointer when the element holding the capture is removed
     * from the document, which React does routinely while re-rendering the markup.
     * Committing there recorded a partial drag; reverting there would throw away
     * movement the user made. So the gesture is kept alive instead: move and up are
     * on the window, so they keep arriving without the capture.
     */
    function dragCancelled(event: PointerEvent): void {
      const intent = intentRef.current;
      if (intent.kind === "idle" || event.pointerId !== intent.pointerId) {
        return;
      }
      if (!warnedPointerCancelRef.current) {
        warnedPointerCancelRef.current = true;
        console.warn(
          "[drag] the pointer capture was cancelled mid-gesture, most likely because the "
            + "rendered markup was replaced. The gesture continues on window listeners.",
        );
      }
    }

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
        moveIntent.observer?.disconnect();
        // Synchronously, BEFORE the commit: the frame callback must not paint the
        // preview on top of the position the document is about to own, or the
        // object would jump by twice the drag and settle back.
        liveStoreRef.current.end();
        moveIntent.el.style.cursor = "";
        restorePreviewTransform(moveIntent.el, moveIntent.baseTransform);
        if (snappingEnabledRef.current) {
          onSnapGuidesChangeRef.current?.([]);
        }
        moveIntent.label?.remove();

        // `end` for both pointerup and pointercancel, because both commit the
        // move to the document below. Subscribers hand the offset over to the
        // document rather than reverting it.
        //
        // The gesture channel speaks WORLD pixels; the command writes geometry, so
        // it takes the LOCAL delta. They are the same number only when the layer
        // and every ancestor are untransformed.
        onDragGestureRef.current?.({
          phase: "end",
          layerId: moveIntent.layerId,
          dx: moveIntent.lastWorldDx,
          dy: moveIntent.lastWorldDy,
        });

        onLayerTransformRef.current(
          moveIntent.layerId,
          moveIntent.lastLocalDx,
          moveIntent.lastLocalDy,
          { disableSnap: true },
        );
      }
    }

    // pointerdown on the container (it decides WHAT was grabbed); move and up on
    // the WINDOW.
    //
    // Measured in Chromium: `setPointerCapture` binds the gesture to a node React
    // owns, and rewriting the markup through `dangerouslySetInnerHTML` removes that
    // node, which makes the browser fire `pointercancel` mid-drag. With move/up on
    // the container the gesture then received nothing further, and because
    // `pointercancel` was wired to `dragEnd` the drag silently committed a partial
    // offset. Listening on the window makes the gesture independent of the subtree
    // React owns, which is the same reason the preview no longer measures the DOM.
    container.addEventListener("pointerdown", dragStart);
    window.addEventListener("pointermove", dragMove);
    /*
      `pointerrawupdate` as well, which is the highest-rate position stream the platform
      offers: it fires per physical sample rather than once per frame.

      This does not make the object move more often — the retained-state store still
      publishes once per animation frame — it makes the sample the frame uses NEWER. The
      handler is the same function and is idempotent: it recomputes the offset from the
      gesture's start position and overwrites retained state, so being driven from two
      streams cannot double-apply anything.

      Feature-detected, because the event is Chromium-only. Its absence costs latency,
      not correctness.
    */
    const supportsRawUpdate = supportsRawPointerUpdates();
    if (supportsRawUpdate) {
      window.addEventListener("pointerrawupdate", dragMove as EventListener);
    }
    window.addEventListener("pointerup", dragEnd);
    window.addEventListener("pointercancel", dragCancelled);

    /**
     * The ONLY place this hook writes to the DOM during a gesture.
     *
     * Driven by the store's animation frame, so it runs at most once per frame
     * however fast the pointer reports. It re-resolves the element here too, which
     * moves that query from pointer rate to frame rate — React can replace the
     * `<svg>` subtree mid-gesture, so the node captured at pointerdown may be
     * detached.
     */
    const unsubscribeFrames = liveStoreRef.current.subscribe((state) => {
      const intent = intentRef.current;
      if (state === null || intent.kind !== "move") {
        return;
      }

      const live = container.querySelector<SVGElement>(
        `[data-layer-id="${cssAttributeValue(intent.layerId)}"]`,
      );
      if (live !== null && live !== intent.el) {
        restorePreviewTransform(intent.el, intent.baseTransform);
        intent.el = live;
        intent.baseTransform = live.getAttribute("transform") ?? "";
        intent.baseLocalTransform = parseSvgTransform(intent.baseTransform).matrix;
        intent.el.style.cursor = MOVING_CURSOR;
      }

      // The single DOM write, and only when this renderer owns the preview. With the
      // engine painting, a whole gesture mutates no design object at all.
      if (domPreviewRef.current) {
        applyPreviewTranslate(
          intent.el,
          intent.baseTransform,
          intent.lastParentDx,
          intent.lastParentDy,
        );
      }

      let moveLabel = intent.label;
      if (!moveLabel) {
        moveLabel = document.createElement("div");
        // A class scoped to this container, not a document-wide id: two canvases
        // on one page would otherwise fight over the same node.
        moveLabel.className = MEASUREMENT_CLASS;
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
        intent.label = moveLabel;
      }
      moveLabel.style.left = `${intent.lastPointerX + 20}px`;
      moveLabel.style.top = `${intent.lastPointerY - 40}px`;
      // Sub-pixel positions are shown, not rounded away: the point of a precision
      // drag is seeing that the fine movement landed.
      moveLabel.textContent = `X: ${formatCoordinate(intent.startBox.x + state.worldDelta.dx)} Y: ${formatCoordinate(intent.startBox.y + state.worldDelta.dy)}`;
    });

    return () => {
      unsubscribeFrames();
      if (unmountedRef.current) {
        liveStoreRef.current.end();
      }
      container.removeEventListener("pointerdown", dragStart);
      window.removeEventListener("pointermove", dragMove);
      if (supportsRawUpdate) {
        window.removeEventListener("pointerrawupdate", dragMove as EventListener);
      }
      window.removeEventListener("pointerup", dragEnd);
      window.removeEventListener("pointercancel", dragCancelled);

      // The measurement badge is created lazily during a drag and normally
      // removed on release. Unmounting mid-drag — a route change, a design
      // regeneration, an error boundary — would otherwise orphan it in the DOM.
      container.querySelector(`.${MEASUREMENT_CLASS}`)?.remove();

      // A gesture in flight is abandoned ONLY on a real unmount.
      //
      // This cleanup also runs when the effect merely re-attaches — the container
      // element changed identity because React re-rendered — and abandoning the
      // drag there threw away the user's gesture mid-stroke. The intent lives in a
      // ref, so it survives the re-attach and the new listeners pick it straight
      // back up.
      const pending = intentRef.current;
      if (unmountedRef.current && pending.kind === "move") {
        pending.observer?.disconnect();
        pending.el.style.cursor = "";
        restorePreviewTransform(pending.el, pending.baseTransform);
        onDragGestureRef.current?.({
          phase: "cancel",
          layerId: pending.layerId,
          dx: 0,
          dy: 0,
        });
      }
      if (unmountedRef.current) {
        intentRef.current = { kind: "idle" };
      }
    };
    // `liveStore` is deliberately NOT a dependency: it is stable for the lifetime
    // of the editor (a ref in the owner, or this hook's own), and listing it made
    // this effect tear down and re-attach the pointer listeners on renders it has
    // no business reacting to — which silently killed every gesture after the
    // first commit. The subscription reads through `liveStoreRef`, so a genuinely
    // changed store is still honoured on the next mount.
  }, [containerElement, containerRef]);

  // isDragging derived from the ref cannot be reactive without a state tick;
  // return false as a placeholder — callers use it only for cursor hints.
  return { isDragging: false };
}
