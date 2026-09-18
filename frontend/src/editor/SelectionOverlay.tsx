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
 * The selection box and its handles come from `useSelectionGeometry`, which
 * derives them from `RenderScene.worldTransform` — the same matrix the SVG and
 * Skia backends paint with — so the outline cannot drift from the rendered shape.
 * The marquee still uses `getBoundingClientRect` to decide which layers a
 * rubber-band rectangle encloses, which is a screen-space question about laid-out
 * DOM and not a claim about where an object is; that call is guarded so jsdom
 * (which may not implement layout) cannot crash the editor. All geometry/set
 * algebra is delegated to the pure `selectionMath` / `selectionGeometry` helpers.
 *
 * One responsibility per file: the selection interaction + overlay rendering.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { useSceneNodeLookup, useSelectionGeometry } from "./geometry/useSelectionGeometry";
import { obbCorners, type ResizeHandleId } from "./geometry/selectionGeometry";
import {
  quadCentroid,
  quadCornerRotationZone,
  quadFromWorldCorners,
  quadHandlePosition,
  quadPolygonPoints,
  quadRotationHandle,
  type SelectionQuad,
} from "./geometry/selectionQuad";
import type { CanvasView } from "./geometry/coordinateSpaces";
import type { LiveTransformStore } from "./interaction/liveTransformStore";
import {
  newestPointerSample,
  supportsRawPointerUpdates,
} from "./interaction/pointerSample";
import { artboardForDesignOutput } from "./designOutputMapping";
import { clientPoint, clientToWorld, worldPoint, worldToViewport } from "./geometry/coordinateSpaces";
import { parentWorldTransform } from "./geometry/transformDelta";
import {
  beginGesture,
  solveGesture,
  type GestureKind,
  type GestureSnapshot,
} from "./geometry/gestureSolve";
import type {
  BridgeFrame,
  BridgeModifiers,
  GestureBridge,
} from "./interaction/gestureBridge";
import {
  boundsMapping,
  boundsMappingTransform,
  resizeShapeGeometry,
} from "./geometry/resizeGeometry";
import {
  obbCenter,
  obbToViewport,
  resizeLocalBounds,
  type OrientedBox,
} from "./geometry/selectionGeometry";
import { findLayer } from "./commands/helpers";
import { invert, transformPoint, type Matrix2D, type RectF } from "./renderer/matrix2d";
import { type BoxSnapshot, type ResizeSnapshot, type RotateSnapshot } from "./commands";
import { type LayerRotation } from "./selectionMath";
import { MeasurementLabel } from "./MeasurementLabel";
import type { SelectionSet, Viewport } from "./types/documentModel";
import type { DesignOutput } from "../types";

/** Pointer travel (in host pixels) below which a gesture counts as a click. */
const DRAG_THRESHOLD = 4;

/**
 * How far outside each corner the rotation zone sits, in viewport pixels.
 *
 * The zone is 24px across and the resize handle it must not cover is ~13px, so
 * their centres need to be at least 18.5px apart. 20px along the diagonal clears
 * that with a little room, and is close enough to the corner to still read as
 * "rotate from here".
 */
const CORNER_ROTATION_OFFSET_PX = 20;

/**
 * Distance from the top edge's midpoint to the rotation grip, in viewport pixels.
 *
 * Matches `ROTATION_OFFSET_PX` in renderer/selectionChrome.ts, which is what the
 * canvas chrome uses, so the DOM grip and the painted grip land on the same pixel.
 * Kept as its own named constant rather than imported so this file has no dependency
 * on the engine renderer's module, and asserted equal in selectionQuad.test.ts.
 */
const ROTATION_HANDLE_OFFSET_PX = 26;

/** Shift-rotate step, in degrees. The step every editor uses. */
const ROTATION_SNAP_DEGREES = 15;

/**
 * The compass names a handle may carry, for validating what crosses the boundary.
 *
 * The engine reports a handle as a string. Casting it would let an unexpected value
 * route a gesture as a resize from a handle that does not exist.
 */
const RESIZE_HANDLE_NAMES = new Set<string>(["nw", "n", "ne", "e", "se", "s", "sw", "w"]);

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
  /**
   * Called when a resize drag finishes, with boxes in the LAYER's OWN space.
   *
   * Not host pixels, and not the SVG root's space: the overlay solves the resize
   * against the authoritative world transform and reports the layer's new local
   * bounds. A consumer that maps those onto geometry per layer kind — which
   * `PydreeStudio` does inline — was previously handed a screen-derived box, which
   * is only the same thing for an untransformed layer.
   *
   * `onResizeSnapshot` is preferred when supplied, because a box cannot express a
   * path, text or group resize. This callback remains for consumers that cannot be
   * changed.
   */
  onResize?: (layerId: string, prevBox: BoxSnapshot, nextBox: BoxSnapshot) => void;
  /**
   * The exact document change, when the consumer can take it.
   *
   * `geometry` for shapes whose numbers can be rewritten, `box` for images, and
   * `transform` for text, groups and path data — the kinds whose size cannot be
   * expressed as four numbers. Takes precedence over `onResize`.
   */
  onResizeSnapshot?: (layerId: string, prev: ResizeSnapshot, next: ResizeSnapshot) => void;
  /**
   * Retained state for the gesture in flight, shared with the drag hook.
   *
   * Supplying it is what makes the selection box FOLLOW the shape during a drag.
   * Without it the box is derived purely from the committed document, so it stays
   * still until release.
   */
  liveTransforms?: LiveTransformStore;
  /**
   * Make the DOM selection chrome invisible because a canvas is drawing it.
   *
   * `opacity: 0` and `pointerEvents: none`, not `display: none`. The elements stay in
   * the DOM — the marquee and the text-editing affordances share the subtree, and
   * several tests read them — but they are no longer the AUTHORITY for where a handle
   * is: `resolveGestureBridge` answers that from the same geometry the canvas drew
   * with. Without `pointerEvents: none` one press would start two gestures.
   *
   * Two visible selections would be the hybrid made obvious, the same defect class as
   * two rendering surfaces.
   */
  chromeHidden?: boolean;
  /**
   * Write the gesture preview into the SVG DOM once per frame.
   *
   * True for the canonical-SVG renderer, which has nothing else to preview with.
   * False when the engine is the visual surface: it has already applied the solved
   * transform to the scene it paints, and writing the SVG as well would be the
   * second surface this migration exists to remove.
   */
  domPreview?: boolean;
  /**
   * The engine's gesture solver, resolved at gesture START rather than captured.
   *
   * A function and not the bridge itself, because the engine may arrive late, be
   * replaced when the artboard size changes, or go away — and a captured reference
   * would quietly point at a deleted WASM object. Null means this file solves the
   * gesture with `geometry/gestureSolve.ts` instead: the same mathematics, held to
   * the engine's answers to 1e-9 by engine-parity.mts.
   */
  resolveGestureBridge?: () => GestureBridge | null;
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

/**
 * A resize or a rotate in flight.
 *
 * One type for both, because both reduce to the same thing: a local transform per
 * frame. The previous two session types carried per-gesture DOM bookkeeping — a
 * cached element, its original transform string, an accumulated angle — which is
 * exactly the state that let a rotate and a resize disagree about where the object
 * was.
 *
 * `snapshot` and `bridge` are mutually exclusive and say WHO is solving: the engine
 * holds its own snapshot, so this side has none; without the engine the snapshot
 * lives here. Either way the gesture is solved from state captured at pointer-down,
 * never from the object's current transform, so a long drag cannot accumulate
 * rounding error.
 */
interface HandleGestureSession {
  readonly layerId: string;
  readonly kind: GestureKind;
  readonly handle: HandlePosition;
  readonly pointerId: number;
  /**
   * The client -> world conversion for this gesture.
   *
   * Snapshotted rather than read per frame: zoom and pan cannot change mid-gesture,
   * and re-reading it from a later render would make the conversion depend on when
   * React happened to re-render.
   */
  readonly view: CanvasView;
  /** The layer's local bounds at pointer-down, which the commit diffs against. */
  readonly originLocalBounds: RectF;
  /** The layer's committed `transform`, for a rotate commit's `prev` snapshot. */
  readonly baseTransform: string | undefined;
  /** Set when the TypeScript solver owns this gesture. */
  readonly snapshot: GestureSnapshot | null;
  /** Set when the ENGINE owns this gesture. */
  readonly bridge: GestureBridge | null;
  /** The most recent solved frame. Null until the pointer moves. */
  frame: BridgeFrame | null;
}


/**
 * Sub-pixel-friendly number for a measurement badge.
 *
 * The point of a precision resize is seeing that a fine change landed, so the
 * value is not rounded to whole pixels — the previous `Math.round` hid every
 * adjustment smaller than half a pixel.
 */
function formatMeasurement(value: number): string {
  return Number.parseFloat(value.toFixed(2)).toString();
}

/** A rect with positive extents at the mirrored position. */
function normaliseRect(rect: RectF): RectF {
  return {
    x: rect.width < 0 ? rect.x + rect.width : rect.x,
    y: rect.height < 0 ? rect.y + rect.height : rect.y,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

/**
 * The document change a resize represents, as before/after snapshots.
 *
 * Three mechanisms, chosen by what can be expressed EXACTLY:
 *
 *  - `geometry` for rect/ellipse/line/polygon/parametric — the stored numbers are
 *    rewritten, so the properties panel keeps meaningful width/height and the
 *    stroke width is untouched.
 *  - `box` for images, whose x/y/width/height IS their geometry.
 *  - `transform` for text, groups and path data. Path arcs cannot be rescaled
 *    without mapping radii and axis rotation; text has no size field to write; a
 *    group's size lives in its children. Composing an affine into the layer's own
 *    transform is exact for all three, at the cost of scaling stroke width with the
 *    shape.
 *
 * Returns null only when the layer cannot be found or the source box has zero
 * extent, both of which are reported rather than half-applied.
 */
function resizeSnapshotsFor(
  designOutput: DesignOutput | null,
  layerId: string,
  from: RectF,
  to: RectF,
): { prev: ResizeSnapshot; next: ResizeSnapshot } | null {
  const artboard = artboardForDesignOutput(designOutput);
  if (artboard === null) {
    return null;
  }
  const layer = findLayer(artboard.layers, layerId);
  if (layer === null) {
    return null;
  }

  if (layer.kind === "image") {
    const box = normaliseRect(to);
    return {
      prev: {
        kind: "box",
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
      } satisfies BoxSnapshot,
      next: { kind: "box", x: box.x, y: box.y, width: box.width, height: box.height },
    };
  }

  if (layer.kind !== "text" && layer.kind !== "group") {
    const geometry = resizeShapeGeometry(layer.geometry, from, to);
    if (geometry !== null) {
      return {
        prev: { kind: "geometry", geometry: layer.geometry },
        next: { kind: "geometry", geometry },
      };
    }
    // Falls through for path data on purpose; see the doc comment.
  }

  const mapping = boundsMapping(from, to);
  if (mapping === null) {
    return null;
  }
  const base = layer.transform ?? "";
  return {
    prev: { kind: "transform", transform: layer.transform },
    // Appended, not prepended: the mapping was solved in the layer's OWN space,
    // and a node's transform maps that space into its parent's. Prepending would
    // apply it in the parent's space and move the layer instead of resizing it.
    next: { kind: "transform", transform: `${base} ${boundsMappingTransform(mapping)}`.trim() },
  };
}

/**
 * The DOM selection box for a set of world-space corners.
 *
 * `origin` + `angle` + `width`/`height` describe an element positioned at the box's
 * top-left corner and rotated about that same corner, which is the shape the handle
 * rendering below already consumes. Derived from the corners rather than from a
 * matrix decomposition, so it needs no trigonometry beyond one `atan2` and follows
 * rotation, scale, flip and every ancestor transform for free.
 *
 * Returns null for a non-finite corner. The box is then left as it was rather than
 * moved somewhere arbitrary — the DOM chrome's equivalent of SelectionCanvas drawing
 * nothing.
 */
function viewportBoxFromCorners(
  view: CanvasView,
  corners: readonly { readonly x: number; readonly y: number }[],
): { box: BBox; rotation: LayerRotation | null; quad: SelectionQuad | null } | null {
  const quad = quadFromWorldCorners(view, corners);
  if (quad === null) {
    return null;
  }
  const [topLeft, topRight, , bottomLeft] = quad;
  const width = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y);
  const height = Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y);
  const angle = (Math.atan2(topRight.y - topLeft.y, topRight.x - topLeft.x) * 180) / Math.PI;
  /*
    `quad` is the authority; `box` and `rotation` are retained for the few consumers
    that need an axis-aligned rect (the measurement label, the marquee comparison).

    Handle positions are NOT taken from them any more. `(origin, width, height, angle)`
    has four degrees of freedom and an affine has six, and the two that go missing are
    the two that matter: a flip has no representation in it — two positive edge lengths
    and one angle describe a mirrored object as a 180-degree rotation, which puts every
    handle on the wrong corner — and a skew has none at all.
  */
  return {
    box: { x: topLeft.x, y: topLeft.y, width, height },
    rotation: Math.abs(angle) < 0.001 ? null : { angle, cx: topLeft.x, cy: topLeft.y },
    quad,
  };
}

/** Find the rendered primitive for a document layer, including text layers. */
function findRenderedLayer(svg: SVGSVGElement, layerId: string): SVGGraphicsElement | null {
  return Array.from(svg.querySelectorAll<SVGGraphicsElement>("[data-layer-id]")).find(
    (element) => element.getAttribute("data-layer-id") === layerId,
  ) ?? null;
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
  onResizeSnapshot,
  liveTransforms,
  chromeHidden = false,
  domPreview = true,
  resolveGestureBridge,
  onRotate,
}: SelectionOverlayProps): JSX.Element {
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null);
  const [marqueeCurrent, setMarqueeCurrent] = useState<{ x: number; y: number } | null>(null);
  
  const [measurement, setMeasurement] = useState<{ text: string; x: number; y: number } | null>(null);

  const [handleBox, setHandleBox] = useState<
    { box: BBox; rotation: LayerRotation | null; quad: SelectionQuad | null } | null
  >(null);
  const [primaryLayerKind, setPrimaryLayerKind] = useState<'text' | 'image' | 'shape' | null>(null);
  const [marquee, setMarquee] = useState<BBox | null>(null);

  const composedSvg = designOutput?.composedSVG;

  /**
   * A signal that the rendered `<svg>` actually exists in the host.
   *
   * The measuring effect below reads `hostRef.current.querySelector("svg")`, but
   * its dependencies were `[hostRef, selectedKey, composedSvg, viewport…]` — none
   * of which changes when that markup mounts. `hostRef` is a stable object, so if
   * the effect ran before `SVGCanvas` had injected the SVG it bailed out with
   * `setHandleBox(null)` and never ran again: no selection outline and no handles
   * for the life of that mount.
   *
   * This is the same defect class already fixed in `useCanvasDrag` — a ref in a
   * dependency array is not a readiness signal. Tracking the element in state
   * gives the effect something real to depend on.
   */
  const [renderedSvg, setRenderedSvg] = useState<SVGSVGElement | null>(null);
  useEffect(() => {
    const found = hostRef.current?.querySelector("svg");
    const next = found instanceof SVGSVGElement ? found : null;
    setRenderedSvg((previous) => (previous === next ? previous : next));
  });
  const selectedKey = selection.layerIds.join("|");

  /**
   * Authoritative selection geometry.
   *
   * Derived from `RenderScene.worldTransform`, the SAME matrix the SVG and Skia
   * backends render with, instead of measured from the DOM. The previous
   * `computeSelectionBox` read `getScreenCTM` / `getBoundingClientRect` and parsed
   * `rotate()` out of transform attributes, which made it a second independent
   * source of truth for where an object is. It diverged from the renderer as soon
   * as a pivot was not the box centre or a rotation had been applied twice.
   */
  const geometry = useSelectionGeometry({
    hostRef,
    designOutput,
    layerIds: selection.layerIds,
    viewport,
  });

  /**
   * Scene nodes by layer id, for the parent transform a rotation pivot needs.
   *
   * Shares the cached extraction with `useSelectionGeometry` above and with the
   * drag hook, so all three read the same transform chain.
   */
  const resolveSceneNode = useSceneNodeLookup(designOutput);

  /**
   * The node whose transform carries the in-flight gesture's offset.
   *
   * Written imperatively from the store's animation frame, never through React
   * state: lifting a per-frame offset into state would re-render the whole overlay
   * at pointer rate, which is the cost the retained-state design exists to avoid.
   */
  const liveOffsetRef = useRef<HTMLDivElement | null>(null);
  /**
   * The client -> world conversion, mirrored for the frame subscriber.
   *
   * The subscriber is registered once and must not be torn down when the viewport
   * changes, so it reads the view from a ref instead of closing over it.
   */
  const geometryRef = useRef<CanvasView | null>(null);

  // Mirrored so the subscription below never has to re-attach when the viewport
  // changes, and never captures a stale zoom.
  const zoomRef = useRef(viewport?.zoom ?? 1);
  zoomRef.current = viewport?.zoom ?? 1;
  const selectedIdsRef = useRef(selection.layerIds);
  selectedIdsRef.current = selection.layerIds;
  // Mirrored every render so the frame subscriber, which is registered once, always
  // converts with the CURRENT view rather than the one it was created with.
  geometryRef.current = geometry.view;

  /**
   * The measurement badge's pending text, written once per frame.
   *
   * A ref and not state: the badge is updated on every pointer sample, and a
   * setState per sample is the per-sample React render this migration removes. The
   * frame subscriber below promotes it to state at most once per animation frame.
   */
  const measurementRef = useRef<{ text: string; x: number; y: number } | null>(null);

  /**
   * Everything that has to happen once per animation frame, in one place.
   *
   * This is the whole point of the retained-state store: pointer handlers do
   * arithmetic and assign, and every write to the DOM happens here — once per frame,
   * whatever the pointer rate. A 1000Hz mouse used to force sixteen style/layout
   * passes inside a single 60fps frame.
   *
   * Three writes, and each is guarded by whether it is actually needed:
   *
   *  1. The DOM chrome's offset, for a MOVE only. A move displaces the whole handle
   *     set, so one transform on the container covers it.
   *  2. The previewed shape, for the canonical-SVG renderer only (`domPreview`). On
   *     the engine path the transform is already in the scene being painted, and
   *     writing the SVG as well would be the second surface again.
   *  3. The selection box and the measurement badge as React state — at most once
   *     per frame, and skipped entirely for the box when a canvas is drawing it.
   */
  useEffect(() => {
    if (liveTransforms === undefined) {
      return undefined;
    }
    return liveTransforms.subscribe((state) => {
      const node = liveOffsetRef.current;
      const follows =
        state !== null && selectedIdsRef.current.includes(state.layerId);

      // 1. The handle set's offset. Only a MOVE is expressible as one: a resize
      //    changes the box's size and a rotate spins it, and both publish corners.
      if (node !== null) {
        if (follows && state.kind === "move") {
          // World -> viewport is a uniform scale by zoom, so a displacement needs the
          // scale and nothing else. Adding the view origin would move the box by the
          // artboard's position as well.
          const dx = state.worldDelta.dx * zoomRef.current;
          const dy = state.worldDelta.dy * zoomRef.current;
          node.style.transform = `translate(${dx}px, ${dy}px)`;
        } else if (node.style.transform !== "") {
          node.style.transform = "";
        }
      }

      if (!follows || state.kind === "move") {
        // A move's preview and chrome are owned by the drag hook and the branch
        // above; the rest of this subscriber is for resize and rotate.
        if (state === null) {
          setMeasurement(null);
        }
        return;
      }

      // 2. The previewed shape, for the SVG renderer.
      if (domPreview) {
        const svg = hostRef.current?.querySelector("svg");
        if (svg instanceof SVGSVGElement) {
          // Looked up each frame rather than cached: React replaces this element when
          // the document re-renders, and a cached reference would silently stop
          // previewing halfway through a gesture.
          const element = findRenderedLayer(svg, state.layerId);
          const m = state.localTransform;
          if (element !== null) {
            // The full matrix REPLACES the attribute for the duration of the gesture.
            // Composing a string onto the existing transform is what let a rotate and
            // a resize stack, and an inline style would override the attribute
            // entirely and drop the layer's own rotation.
            element.setAttribute(
              "transform",
              `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`,
            );
          }
        }
      }

      // 3. The DOM selection box, unless a canvas is drawing the chrome.
      if (!chromeHidden && state.corners !== null) {
        const view = geometryRef.current;
        if (view !== null) {
          const box = viewportBoxFromCorners(view, state.corners);
          if (box !== null) {
            setHandleBox(box);
          }
        }
      }

      const pending = measurementRef.current;
      if (pending !== null) {
        setMeasurement(pending);
      }
    });
  }, [liveTransforms, domPreview, chromeHidden]);

  /**
   * Adapter to the shape the handle rendering below already consumes.
   *
   * `rotation.cx`/`cy` are the box's own top-left in VIEWPORT pixels, the same
   * space as `box`, so rotating the handle set about that point lands it exactly on
   * the object's corners. The old code mixed an SVG-space pivot with a pixel-space
   * box, which is exactly why the outline sat away from a rotated shape.
   */
  const authoritativeBox = useMemo<
    { box: BBox; rotation: LayerRotation | null; quad: SelectionQuad | null } | null
  >(() => {
    if (geometry.obb !== null && geometry.view !== null) {
      // The CORNERS, mapped one at a time. `geometry.single` is the same OBB already
      // reduced to (origin, width, height, angle), and that reduction cannot carry a
      // flip or a skew — so the corners are re-read here instead.
      const fromCorners = viewportBoxFromCorners(geometry.view, obbCorners(geometry.obb));
      if (fromCorners !== null) {
        return fromCorners;
      }
    }
    if (geometry.single !== null) {
      // Fallback for the case where the OBB resolved but its corners did not convert:
      // reported rather than silently skipped, because it means one of the two paths
      // produced a non-finite coordinate.
      const { origin, width, height, angle } = geometry.single;
      return {
        box: { x: origin.x, y: origin.y, width, height },
        rotation: Math.abs(angle) < 0.001 ? null : { angle, cx: origin.x, cy: origin.y },
        quad: null,
      };
    }
    if (geometry.multi !== null) {
      // A multi-selection has no single orientation, so its quad IS axis-aligned —
      // which is a fact about the selection, not a reduction of one.
      const { x, y, width, height } = geometry.multi;
      return {
        box: geometry.multi,
        rotation: null,
        quad: [
          { x, y },
          { x: x + width, y },
          { x: x + width, y: y + height },
          { x, y: y + height },
        ] as const,
      };
    }
    return null;
  }, [geometry.obb, geometry.view, geometry.single, geometry.multi]);

  /** Nothing is dropped silently: a node with no usable geometry is reported. */
  useEffect(() => {
    for (const error of geometry.errors) {
      console.warn(
        `[selection] no geometry for layer "${error.nodeId}": ${error.reason}. No selection box is drawn for it.`,
      );
    }
  }, [geometry]);

  // Recompute the combined selection bounding box whenever the selection, the
  // rendered markup, or the viewport transform changes. Uses layout effect so
  // measurement happens after the DOM is laid out.
  useLayoutEffect(() => {
    const host = hostRef.current;
    const svg = renderedSvg ?? host?.querySelector("svg");
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

    const newBox = authoritativeBox;
    setHandleBox(prev => {
      if (prev && newBox && prev.box.x === newBox.box.x && prev.box.y === newBox.box.y && prev.box.width === newBox.box.width && prev.box.height === newBox.box.height && prev.rotation?.angle === newBox.rotation?.angle) {
        return prev;
      }
      return newBox;
    });

    // composedSvg and viewport primitives are intentional dependencies: both move the boxes.
  }, [hostRef, renderedSvg, authoritativeBox, selectedKey, composedSvg, viewport?.zoom, viewport?.panX, viewport?.panY]);

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
  /**
   * The resize or rotate in flight.
   *
   * ONE ref for both, replacing the two session refs, because both gestures now go
   * through the same three calls and produce the same kind of value.
   */
  const gestureRef = useRef<HandleGestureSession | null>(null);

  /**
   * What the modifier keys mean for this gesture kind.
   *
   * Scoped by kind rather than passed through blindly: shift means "keep the aspect
   * ratio" to a resize and "snap the angle" to a rotate, and a solver handed both at
   * once would apply whichever it happened to check first.
   */
  function modifiersFor(
    event: { readonly shiftKey: boolean; readonly altKey: boolean },
    kind: GestureKind,
  ): BridgeModifiers {
    return {
      preserveAspect: kind === "resize" && event.shiftKey,
      fromCenter: kind === "resize" && event.altKey,
      angleSnapDegrees: kind === "rotate" && event.shiftKey ? ROTATION_SNAP_DEGREES : 0,
    };
  }

  /**
   * Solve one frame through whichever solver owns the gesture.
   *
   * The two branches are a deployment choice, not two behaviours: the engine path
   * does the algebra in C++ and has already written the result into the scene it is
   * about to paint, while the fallback path evaluates the identical expressions in
   * TypeScript for the canonical-SVG renderer. `engine-parity.mts` compares them on
   * 480 frames of a deliberately hostile scene and fails the build on any
   * disagreement beyond 1e-9.
   */
  function solveHandleFrame(
    session: HandleGestureSession,
    clientX: number,
    clientY: number,
    modifiers: BridgeModifiers,
  ): BridgeFrame | null {
    if (session.bridge !== null) {
      const point = session.bridge.clientToDocument(clientX, clientY);
      if (point === null) {
        return null;
      }
      return session.bridge.update(point.x, point.y, modifiers);
    }
    if (session.snapshot === null) {
      return null;
    }
    const pointerWorld = clientToWorld(session.view, clientPoint(clientX, clientY));
    const result = solveGesture(session.snapshot, pointerWorld, modifiers);
    return result.ok ? result.frame : null;
  }

  /**
   * Begin a resize or a rotate on the primary selected layer.
   *
   * Returns false when the gesture cannot be started, and the caller must then do
   * nothing: a gesture begun without geometry would commit an arbitrary transform
   * when the pointer came up. Every refusal is logged with its reason.
   */
  function beginHandleGesture(
    clientX: number,
    clientY: number,
    pointerId: number,
    kind: GestureKind,
    handle: HandlePosition,
  ): boolean {
    const host = hostRef.current;
    if (host === null || gestureRef.current !== null) {
      return false;
    }
    const primaryId = selection.layerIds.length > 0
      ? selection.layerIds[selection.layerIds.length - 1]
      : null;
    if (primaryId === null) {
      return false;
    }

    // A locked layer refuses the gesture. `pointer-events="none"` is where the
    // serializer records that, on the primitive or on its role group.
    const svg = host.querySelector("svg");
    if (svg instanceof SVGSVGElement) {
      const element = findRenderedLayer(svg, primaryId);
      if (
        element?.getAttribute("pointer-events") === "none"
        || element?.closest("g[data-role]")?.getAttribute("pointer-events") === "none"
      ) {
        return false;
      }
    }

    const view = geometry.view;
    const obb = geometry.obb;
    if (view === null || obb === null) {
      // Host-pixel arithmetic on a rotated box is exactly what made corner resize
      // wrong, so there is no fallback path here.
      console.warn(
        `[editor] no oriented bounds for layer "${primaryId}", so ${kind} is unavailable `
          + "for this gesture.",
      );
      return false;
    }

    // The engine first. It owns the transform chain and the scene it paints, so a
    // gesture solved there needs no matrix algebra on this side at all.
    const bridge = resolveGestureBridge?.() ?? null;
    const documentPoint = bridge?.clientToDocument(clientX, clientY) ?? null;
    const engineStart = bridge !== null && documentPoint !== null
      ? bridge.begin(primaryId, kind, kind === "resize" ? handle : "", documentPoint.x, documentPoint.y)
      : null;

    let snapshot: GestureSnapshot | null = null;
    if (engineStart === null) {
      const node = resolveSceneNode?.(primaryId);
      const parentWorld = node === undefined
        ? null
        : parentWorldTransform(node, (id) => resolveSceneNode?.(id));
      if (node === undefined || parentWorld === null) {
        console.warn(
          `[editor] no scene node or parent transform for layer "${primaryId}", so ${kind} `
            + "is unavailable for this gesture.",
        );
        return false;
      }
      const started = beginGesture(node, parentWorld, kind, handle, clientToWorld(view, clientPoint(clientX, clientY)));
      if (!started.ok) {
        console.warn(
          `[editor] the ${kind} gesture on "${primaryId}" could not start: ${started.reason}.`,
        );
        return false;
      }
      snapshot = started.snapshot;
    }

    const artboard = artboardForDesignOutput(designOutput);
    const layer = artboard === null ? null : findLayer(artboard.layers, primaryId);

    gestureRef.current = {
      layerId: primaryId,
      kind,
      handle,
      pointerId,
      view,
      /*
        From the SOLVER's own snapshot, never re-derived from `obb.localBounds`.

        `from` and `to` are diffed into a ratio that the commit applies to the
        document's geometry, so both must be measured in the same space. Taking `from`
        from this file's geometry while `to` comes from the engine's snapshot works only
        as long as the two never disagree — and the engine's scene is uploaded from an
        effect, one render behind the document. Reading both from whoever solved the
        gesture removes the assumption instead of relying on it.
      */
      originLocalBounds: engineStart !== null
        ? engineStart.localBounds
        : (snapshot?.obb.localBounds ?? obb.localBounds),
      // From the DOCUMENT, not from the DOM. The rendered element's attribute is a
      // presentation of the document, and on the engine path it is not even painted.
      baseTransform: layer?.transform,
      snapshot,
      bridge: engineStart === null ? null : bridge,
      frame: null,
    };
    setMeasurement({
      text: kind === "rotate"
        ? "0°"
        : `W: ${formatMeasurement(Math.abs(gestureRef.current.originLocalBounds.width))} H: ${formatMeasurement(Math.abs(gestureRef.current.originLocalBounds.height))}`,
      x: clientX,
      y: clientY,
    });
    return true;
  }

  /**
   * One pointer sample.
   *
   * NO DOM WORK HERE. The handler solves the frame and assigns it into retained
   * state; every write — the previewed transform, the selection box, the measurement
   * badge — happens once per animation frame in the store's subscriber instead. That
   * is what keeps a 1000Hz pointer from forcing sixteen style passes inside one
   * 60fps frame, and it is the property that makes the canvas feel attached to the
   * cursor.
   */
  function updateHandleGesture(
    clientX: number,
    clientY: number,
    modifierState: { readonly shiftKey: boolean; readonly altKey: boolean },
  ): void {
    const session = gestureRef.current;
    if (session === null) {
      return;
    }
    const frame = solveHandleFrame(session, clientX, clientY, modifiersFor(modifierState, session.kind));
    if (frame === null) {
      // The previous frame stands. Applying a partly-solved transform would move the
      // object somewhere the pointer never was.
      return;
    }
    session.frame = frame;
    liveTransforms?.set({
      layerId: session.layerId,
      kind: session.kind,
      localTransform: frame.localTransform,
      worldDelta: frame.worldDelta,
      localBounds: frame.localBounds,
      corners: frame.corners,
    });
    measurementRef.current = {
      text: session.kind === "rotate"
        ? `${Math.round(frame.angleDegrees)}°`
        : `W: ${formatMeasurement(Math.abs(frame.localBounds.width))} H: ${formatMeasurement(Math.abs(frame.localBounds.height))}`,
      x: clientX,
      y: clientY,
    };
  }

  /** Release the gesture's state and its preview, without committing anything. */
  function releaseHandleGesture(): void {
    gestureRef.current = null;
    measurementRef.current = null;
    setMeasurement(null);
    // Synchronous, so there is no frame where the preview and the committed document
    // are both applied.
    liveTransforms?.end();
  }

  /** Abandon the gesture and put the object back exactly where it started. */
  function abortHandleGesture(): void {
    const session = gestureRef.current;
    if (session === null) {
      return;
    }
    session.bridge?.cancel();
    releaseHandleGesture();
  }

  /**
   * Finish the gesture and hand the change to the document.
   *
   * The final frame comes from the solver rather than from the last preview, so a
   * pointer-up that moved since the last animation frame still commits where the
   * pointer actually is.
   */
  function finishHandleGesture(
    clientX: number,
    clientY: number,
    modifierState: { readonly shiftKey: boolean; readonly altKey: boolean },
  ): void {
    const session = gestureRef.current;
    if (session === null) {
      return;
    }
    const modifiers = modifiersFor(modifierState, session.kind);
    const final = session.bridge !== null
      ? (() => {
          const point = session.bridge.clientToDocument(clientX, clientY);
          return point === null ? session.frame : session.bridge.end(point.x, point.y, modifiers);
        })()
      : solveHandleFrame(session, clientX, clientY, modifiers);
    const frame = final ?? session.frame;

    releaseHandleGesture();
    if (frame === null) {
      // The pointer never moved far enough to solve a frame, so there is nothing to
      // commit. Not an error.
      return;
    }
    if (session.kind === "rotate") {
      commitRotate(session, frame);
    } else {
      commitResize(session, frame);
    }
  }

  /**
   * Commit a rotation as the layer's new transform MATRIX.
   *
   * A matrix and not `rotate(δ cx cy)` appended to what was there, which is what this
   * used to write. That string form carried a pivot measured in the PARENT's space
   * into a right-composition, so it only agreed with the preview when the layer's
   * existing transform was itself a rotation about that same point. The solver
   * already produced the exact transform, and writing it verbatim means the committed
   * document and the previewed pixels are the same matrix by construction rather than
   * by two derivations agreeing.
   *
   * It also removes the string surgery that used to fold repeated `rotate()` calls,
   * because a matrix cannot accumulate.
   */
  function commitRotate(session: HandleGestureSession, frame: BridgeFrame): void {
    if (onRotate === undefined || Math.abs(frame.angleDegrees) < 0.01) {
      return;
    }
    const m = frame.localTransform;
    if (![m.a, m.b, m.c, m.d, m.e, m.f].every(Number.isFinite)) {
      // A non-finite transform would make the layer non-rendering and survive every
      // save, so it is discarded rather than written.
      console.warn("[editor] discarded a rotation with non-finite geometry");
      return;
    }
    const round = (value: number): number => Number(value.toFixed(6));
    onRotate(
      session.layerId,
      { kind: "transform", transform: session.baseTransform },
      {
        kind: "transform",
        transform: `matrix(${round(m.a)} ${round(m.b)} ${round(m.c)} ${round(m.d)} ${round(m.e)} ${round(m.f)})`,
      },
    );
  }

  /** Commit a resize as geometry, a box or a transform, whichever is exact. */
  function commitResize(session: HandleGestureSession, frame: BridgeFrame): void {
    if (onResize === undefined && onResizeSnapshot === undefined) {
      return;
    }
    const from = session.originLocalBounds;
    const to = frame.localBounds;
    if (from.width === to.width && from.height === to.height && from.x === to.x && from.y === to.y) {
      return;
    }

    if (onResizeSnapshot !== undefined) {
      const snapshots = resizeSnapshotsFor(designOutput, session.layerId, from, to);
      if (snapshots === null) {
        console.warn(
          `[editor] could not express the resize of layer "${session.layerId}" as a document `
            + "change, so it was discarded rather than partially applied.",
        );
        return;
      }
      onResizeSnapshot(session.layerId, snapshots.prev, snapshots.next);
      return;
    }

    // Box-only consumer. The boxes are the layer's own local bounds, which is what a
    // per-kind mapping needs; a layer whose size cannot be expressed as a box is
    // reported rather than silently mis-resized.
    const artboard = artboardForDesignOutput(designOutput);
    const layer = artboard === null ? null : findLayer(artboard.layers, session.layerId);
    if (layer !== null && (layer.kind === "group" || layer.kind === "text")) {
      console.warn(
        `[editor] layer "${session.layerId}" is a ${layer.kind}, whose resize cannot be `
          + "expressed as a box. Supply onResizeSnapshot to support it.",
      );
    }
    const box = normaliseRect(to);
    const originBox = normaliseRect(from);
    onResize?.(
      session.layerId,
      { kind: "box", x: originBox.x, y: originBox.y, width: originBox.width, height: originBox.height },
      { kind: "box", x: box.x, y: box.y, width: box.width, height: box.height },
    );
  }

  /**
   * Window-level listeners for the duration of a gesture.
   *
   * On `window` and not on the handle element, and with NO `setPointerCapture`.
   * Capture bound the gesture to a DOM node that React replaces when the document
   * re-renders, which fired `pointercancel` in the middle of a drag. Window listeners
   * do not care what happens to the element the gesture started on — which is also
   * what lets the gesture start from a canvas-drawn handle that has no element at all.
   *
   * The handlers are reached through a ref, NOT captured. This callback is memoized
   * with no dependencies, so a captured `finishHandleGesture` would be the one from
   * the first render, closing over that render's `designOutput` — and the commit reads
   * the document through it. Measured: after one resize committed, a second gesture
   * computed its bounds mapping against the ORIGINAL geometry and turned a 25px drag
   * into a 6px shrink (105 -> 130 applied to an 80-wide rect gives 99.05). Same defect
   * class as the readiness-signal refs elsewhere in this file: a stale closure is
   * invisible until the value it closed over changes.
   */
  const attachGestureListeners = useCallback((): void => {
    /*
      Declared first because `detach` closes over it. It is only READ when a listener
      runs, which is always after this function has finished, but reading a `const`
      before its initialiser is a real hazard and ordering it away is free.
    */
    const rawUpdates = supportsRawPointerUpdates();

    const onMove = (event: PointerEvent): void => {
      const session = gestureRef.current;
      if (session === null || event.pointerId !== session.pointerId) {
        return;
      }
      // The NEWEST sample the event carries, so a coalesced burst is applied at the
      // position the pointer has reached rather than one it passed through.
      const sample = newestPointerSample(event);
      gestureHandlersRef.current?.update(sample.clientX, sample.clientY, event);
      event.preventDefault();
    };
    const detach = (): void => {
      window.removeEventListener("pointermove", onMove);
      if (rawUpdates) {
        window.removeEventListener("pointerrawupdate", onMove as EventListener);
      }
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
    const onUp = (event: PointerEvent): void => {
      const session = gestureRef.current;
      if (session !== null && event.pointerId !== session.pointerId) {
        return;
      }
      detach();
      const sample = newestPointerSample(event);
      gestureHandlersRef.current?.finish(sample.clientX, sample.clientY, event);
    };
    const onCancel = (event: PointerEvent): void => {
      const session = gestureRef.current;
      if (session !== null && event.pointerId !== session.pointerId) {
        return;
      }
      detach();
      // A cancelled gesture must NOT commit. The browser cancels for reasons that
      // have nothing to do with intent — a touch turning into a scroll, the window
      // losing focus — and committing there would edit the document by accident.
      gestureHandlersRef.current?.abort();
    };
    window.addEventListener("pointermove", onMove);
    /*
      And the higher-rate raw stream where it exists.

      It does not make the shape resize more often — the retained-state store still
      publishes once per animation frame — it makes the sample that frame uses newer.
      The handler recomputes everything from the gesture's snapshot, so being driven
      from two streams cannot double-apply anything.
    */
    if (rawUpdates) {
      window.addEventListener("pointerrawupdate", onMove as EventListener);
    }
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Pointer-down on a DOM handle element, for the canonical-SVG chrome. */
  function startHandleDrag(event: React.PointerEvent<HTMLDivElement>, handlePos: HandlePosition): void {
    if (!beginHandleGesture(event.clientX, event.clientY, event.pointerId, "resize", handlePos)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    attachGestureListeners();
  }

  /** Pointer-down on a DOM rotation zone, for the canonical-SVG chrome. */
  function startRotateDrag(event: React.PointerEvent<HTMLDivElement>): void {
    if (!beginHandleGesture(event.clientX, event.clientY, event.pointerId, "rotate", "nw")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    attachGestureListeners();
  }

  /**
   * Pointer-down anywhere on the host, resolved against the PAINTED chrome.
   *
   * This is what replaces invisible DOM handle elements. With the chrome drawn on a
   * canvas there is nothing under the cursor to receive the event, so the handle has
   * to be found by asking where the handles ARE — and the answer comes from the same
   * geometry and the same size constants that drew them, so a target cannot be
   * somewhere other than the handle it belongs to.
   *
   * Returns true when it consumed the event, so the caller skips selection and
   * marquee handling.
   */
  function startChromeGesture(event: PointerEvent): boolean {
    if (!chromeHidden) {
      // The DOM chrome is the pointer target on the SVG path; routing here as well
      // would start two gestures from one press.
      return false;
    }
    const primaryId = selection.layerIds.length > 0
      ? selection.layerIds[selection.layerIds.length - 1]
      : null;
    const bridge = resolveGestureBridge?.() ?? null;
    if (primaryId === null || bridge === null) {
      return false;
    }
    const hit = bridge.handleAt(primaryId, event.clientX, event.clientY, viewport?.zoom ?? 1);
    if (hit === null || (hit.region !== "resize" && hit.region !== "rotate")) {
      return false;
    }
    const kind: GestureKind = hit.region === "rotate" ? "rotate" : "resize";
    const handle = (RESIZE_HANDLE_NAMES.has(hit.handle) ? hit.handle : "nw") as HandlePosition;
    if (!beginHandleGesture(event.clientX, event.clientY, event.pointerId, kind, handle)) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    attachGestureListeners();
    return true;
  }

  /**
   * `startChromeGesture`, reachable from the host's pointer-down listener.
   *
   * A ref because that listener is registered in an effect that must not be torn down
   * and re-attached on every render — and because the function closes over the current
   * selection and viewport, which change.
   */
  const startChromeGestureRef = useRef<((event: PointerEvent) => boolean) | null>(null);
  startChromeGestureRef.current = startChromeGesture;

  /**
   * The gesture handlers, re-pointed on every render.
   *
   * Everything the window listeners need, in one ref, so they always run THIS render's
   * closures — with this render's `designOutput` and callbacks. See
   * `attachGestureListeners` for what a captured version cost.
   */
  const gestureHandlersRef = useRef<{
    update: (clientX: number, clientY: number, modifiers: { shiftKey: boolean; altKey: boolean }) => void;
    finish: (clientX: number, clientY: number, modifiers: { shiftKey: boolean; altKey: boolean }) => void;
    abort: () => void;
  } | null>(null);
  gestureHandlersRef.current = {
    update: updateHandleGesture,
    finish: finishHandleGesture,
    abort: abortHandleGesture,
  };

  /** Pointer-cancel on a DOM handle. Must not commit; see the window listener. */
  function cancelHandleDrag(event: React.PointerEvent<HTMLDivElement>): void {
    abortHandleGesture();
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
      // The PAINTED chrome is asked first. With the handles drawn on a canvas there
      // is no element under the cursor to receive this event, so the handle has to be
      // found from the geometry that drew it. Returns false on the SVG path, where the
      // DOM handles are still the pointer target.
      if (startChromeGestureRef.current?.(event) === true) {
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
      // Any handle gesture still in flight is abandoned rather than left to receive
      // stray samples. Abandoned, not committed: this press was not its pointer-up.
      if (gestureRef.current !== null) {
        abortHandleGesture();
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
    <div
      className={styles.canvasOverlay}
      data-role="selection-overlay"
      data-chrome-hidden={chromeHidden ? "true" : "false"}
      aria-hidden="true"
      /*
        On the engine path the chrome is neither seen nor touched.

        `opacity: 0` keeps the elements in the DOM — the marquee, the text-editing
        affordances and several tests still read them — while `pointerEvents: none`
        makes the CANVAS geometry the single authority for where a handle is. Without
        that, one press would start two gestures: one from the invisible element and
        one from `startChromeGesture`. This is what "the DOM handles can be deleted"
        means in practice; deleting the markup itself waits for the SVG renderer to
        stop being an interactive surface at all.
      */
      style={chromeHidden ? { opacity: 0, pointerEvents: "none" } : undefined}
    >
      {/*
        Live-gesture layer.

        Its ONLY job is to carry the in-flight drag's offset, written imperatively
        from the live-transform store's animation frame. React never sets a
        `transform` on this node, so the two cannot fight over it — which is why it
        is a separate element rather than composed into the rotation wrapper below.

        Without this the box was derived purely from the committed document, so it
        stayed put while the shape moved and only caught up on release. That is the
        gap between our canvas and an immediate-mode one, where the selection frame
        is part of the same object being dragged.
      */}
      <div
        ref={liveOffsetRef}
        data-role="selection-live-offset"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
      {handleBox && handleBox.quad ? (
        (() => {
          /*
            One quad, and every piece of chrome derived from it.

            The wrapper used to carry a CSS `rotate(...)` about the box's top-left and
            the handles were laid out inside it as though the box were axis-aligned.
            That works for a rotation and fails for the two transforms it cannot
            express: a mirrored object was described as rotated by 180 degrees, which
            put every handle on the opposite corner, and a sheared object has no
            rectangle to rotate at all.

            There is no `transform` on this element now. Each handle is placed at a
            point interpolated from the four corners, which already have the whole
            transform baked into them.
          */
          const quad = handleBox.quad;
          const cornerOffset = CORNER_ROTATION_OFFSET_PX;
          const rotationGrip = quadRotationHandle(quad, ROTATION_HANDLE_OFFSET_PX);
          const pivot = quadCentroid(quad);
          const cursorFor = (position: ResizeHandleId): string =>
            position === "nw" || position === "se"
              ? "nwse-resize"
              : position === "ne" || position === "sw"
                ? "nesw-resize"
                : position === "n" || position === "s"
                  ? "ns-resize"
                  : "ew-resize";

          return (
            <>
              <div
                className={styles.selectionBoxWrapper}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                }}
              >
                {/*
                  The outline as a POLYGON through the four corners.

                  A rotated `<div>` can only ever be a parallelogram with equal opposite
                  sides drawn about one pivot; a polygon is whatever the corners say. It
                  is an inline SVG rather than four positioned edge divs because a single
                  element cannot drift from itself.
                */}
                <svg
                  className={styles.selectionBox}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: "100%",
                    height: "100%",
                    overflow: "visible",
                    pointerEvents: "none",
                    background: "none",
                    border: "none",
                  }}
                  aria-hidden="true"
                >
                  <polygon
                    data-role="selection-outline"
                    points={quadPolygonPoints(quad)}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>

                {(["nw", "ne", "se", "sw"] as const).map((position) => {
                  const zone = quadCornerRotationZone(quad, position, cornerOffset);
                  if (zone === null) {
                    return null;
                  }
                  /*
                    Pushed outward along the direction from the CENTROID through the
                    corner, so it stays diagonally outside the object at any
                    orientation. The old code used a fixed screen diagonal chosen by
                    the corner's NAME, which pointed into the shape once it had
                    rotated past a right angle.
                  */
                  return (
                    <div
                      key={`rotate-${position}`}
                      className={styles.cornerRotationHandle}
                      data-handle={`rotate-${position}`}
                      style={{ left: `${zone.x}px`, top: `${zone.y}px` }}
                      onPointerDown={(e) => startRotateDrag(e)}
                      onPointerCancel={cancelHandleDrag}
                    />
                  );
                })}

                {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((position) => {
                  if (primaryLayerKind === "text" && position !== "e" && position !== "w") {
                    return null; // Text objects only show horizontal resize handles.
                  }
                  const at = quadHandlePosition(quad, position);
                  return (
                    <div
                      key={position}
                      className={styles.selectionHandle}
                      data-handle={position}
                      style={{ left: `${at.x}px`, top: `${at.y}px`, cursor: cursorFor(position) }}
                      onPointerDown={(e) => startHandleDrag(e, position)}
                      onPointerCancel={cancelHandleDrag}
                    />
                  );
                })}

                {rotationGrip === null ? null : (
                  <>
                    {/*
                      The connector runs from the top edge's midpoint to the grip, so it
                      follows the object's own top edge instead of always pointing up.
                      Drawn in the same SVG for the same reason as the outline.
                    */}
                    <svg
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: "100%",
                        height: "100%",
                        overflow: "visible",
                        pointerEvents: "none",
                      }}
                      aria-hidden="true"
                    >
                      <line
                        data-role="rotation-connector"
                        x1={(quad[0].x + quad[1].x) / 2}
                        y1={(quad[0].y + quad[1].y) / 2}
                        x2={rotationGrip.x}
                        y2={rotationGrip.y}
                        stroke="#3b82f6"
                        strokeWidth={1}
                      />
                    </svg>
                    <div
                      key="rotate"
                      className={styles.rotationHandle}
                      data-handle="rotate"
                      style={{
                        left: `${rotationGrip.x}px`,
                        top: `${rotationGrip.y}px`,
                        cursor: "grab",
                      }}
                      onPointerDown={(e) => startRotateDrag(e)}
                      onPointerCancel={cancelHandleDrag}
                    />
                  </>
                )}

                <div
                  key="pivot"
                  className={styles.pivotHandle}
                  data-handle="pivot"
                  style={{
                    left: `${pivot.x}px`,
                    top: `${pivot.y}px`,
                    transform: "translate(-50%, -50%)",
                  }}
                />
              </div>
            </>
          );
        })()
      ) : null}
      </div>
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


/**
 * The DOM-measurement geometry that used to live here is GONE, not disabled.
 *
 * `parseRotation` and `computeSelectionBox` read `getScreenCTM` and
 * `getBoundingClientRect` and reconstructed rotation from transform attributes.
 * They were a second, independent source of truth for where an object is, and they
 * disagreed with the renderer. Selection geometry now comes from
 * `useSelectionGeometry`, which derives it from `RenderScene.worldTransform` - the
 * same matrix the SVG and Skia backends paint with. Keeping the old functions
 * around "just in case" would recreate the two-systems problem, so they are
 * deleted rather than left as dead parallel logic.
 */

/**
 * The rotation STRING surgery that used to live here is GONE, not disabled.
 *
 * `composeRotation` folded a new `rotate(δ cx cy)` into whatever the layer's
 * transform already said, and `safeRotation` formatted it. Both existed because a
 * rotation was committed as text, appended to the existing transform, with a pivot
 * measured in the PARENT's space — a right-composition carrying a left-composition's
 * pivot. That is only correct when the layer's existing transform is itself a
 * rotation about that same point, and the browser fixture happened to satisfy it, so
 * the defect never failed a test.
 *
 * A rotation now commits as the matrix `gestureSolve`/`gesture.cpp` produced for the
 * final frame, so the committed document and the previewed pixels are the same
 * matrix by construction. That also removes the reason the folding existed: a matrix
 * cannot accumulate `rotate()` calls.
 */

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
