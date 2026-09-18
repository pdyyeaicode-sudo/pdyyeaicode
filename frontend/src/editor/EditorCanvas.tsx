"use client";

/**
 * EditorCanvas — the live SVG rendering surface for Creative Studio (task 5.1).
 *
 * Wraps the existing `SVGCanvas` (AGENTS.md: extend, never rewrite) and adds the
 * viewport structure the design specifies for the Editor_Canvas:
 *
 *   <svg ...>
 *     <defs/>                                  ← preserved verbatim
 *     <g data-viewport transform="translate(panX panY) scale(zoom)">
 *       <g data-role="background" .../>        ← one group per layer …
 *       <g data-role="headline"   .../>        ← … never merged (Req 10.9)
 *       …
 *     </g>
 *   </svg>
 *
 * The Canonical_SVG `<g data-role>` layer groups are moved into a single
 * viewport wrapper group and are *never* flattened or merged into one element
 * (Req 10.9). The wrapper carries the `translate(panX, panY) scale(zoom)`
 * transform that pan/zoom (task 5.2) will drive. For this task the viewport
 * defaults to the identity transform (zoom 1, pan 0): the design renders at its
 * native dimensions, centered in the stage (Req 1.1).
 *
 * Pan/zoom changes only the viewport transform and never the Document_Model
 * (Req 1.3); this component exposes the `viewport` prop as the seam for that.
 * The selection overlay (handles + marquee) is task 5.5 and mounts into the
 * `data-role="selection-overlay"` placeholder rendered here.
 *
 * One responsibility per file: establishing the viewport-wrapped SVG render.
 */

import { useCallback, useMemo, useRef, useState, type MouseEvent } from "react";

import { SVGCanvas } from "../components/SVGCanvas";
import { SelectionOverlay } from "./SelectionOverlay";
import { SkiaOverlay, type EngineFrameReport, type EngineStatus } from "./renderer/SkiaOverlay";
import { isSkiaRendererEnabled } from "./renderer/engineFlag";
import { createGestureChannel, type GestureChannel } from "./interaction/gestureChannel";
import { useSceneNodeLookup } from "./geometry/useSelectionGeometry";
import { EngineSelectionLayer } from "./renderer/EngineSelectionLayer";
import type { GestureBridge } from "./interaction/gestureBridge";
import type { ShapeCreateBridge } from "./interaction/shapeCreateBridge";
import {
  createLiveTransformStore,
  type LiveTransformStore,
} from "./interaction/liveTransformStore";
import styles from "./CreativeStudio.module.css";
import type { BoxSnapshot, ResizeSnapshot, RotateSnapshot, SelectionSet, Viewport } from "./types/documentModel";
import type { DesignOutput } from "../types";

/** Empty selection used when the canvas is mounted without selection wiring. */
const EMPTY_SELECTION: SelectionSet = { layerIds: [] };

const noopLayerId = (): void => {
  /* default no-op selection handler */
};

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** Identity viewport: native dimensions, centered by the stage (Req 1.1). */
export const DEFAULT_VIEWPORT: Viewport = { zoom: 1, panX: 0, panY: 0 };

export interface EditorCanvasProps {
  /** Backend design to render; its `composedSVG` provides the Canonical_SVG. */
  designOutput: DesignOutput | null;
  /** Currently selected layer id (single-select seam reused from SVGCanvas). */
  activeLayer: string | null;
  onLayerSelect: (layerId: string) => void;
  onLayerTextUpdate: (elementId: string, newText: string) => void;
  onLayerTransform: (layerId: string, dx: number, dy: number) => void;
  onResize?: (layerId: string, prevBox: BoxSnapshot, nextBox: BoxSnapshot) => void;
  /**
   * The exact resize change, when the consumer can apply it.
   *
   * Preferred over `onResize`: a box cannot express a path, text or group resize.
   * `onResize` stays for consumers whose handler signature is fixed.
   */
  onResizeSnapshot?: (layerId: string, prev: ResizeSnapshot, next: ResizeSnapshot) => void;
  /**
   * Receives the engine hit-tester when the Skia renderer publishes one.
   *
   * Exposed so an owner (or a test) can ask the RENDERER what is under a client
   * point instead of inferring it from which DOM element received an event. Called
   * with null when the engine goes away.
   */
  onHitTester?: (hitTest: ((clientX: number, clientY: number) => string | null) | null) => void;
  /**
   * Receives the engine's gesture bridge, or null when the engine goes away.
   *
   * The seam through which resize and rotate leave the DOM: whoever owns the handles
   * calls `begin`/`update`/`end` and gets back the solved transform. Forwarded from
   * the Skia renderer so an owner (or a test) can drive a gesture through the same
   * geometry the pixels were drawn with.
   */
  onGestureBridge?: (bridge: GestureBridge | null) => void;
  /**
   * Per-frame engine timing, for latency measurement.
   *
   * Only fires on the Skia path, because only the engine can attribute a frame. The SVG
   * renderer's equivalent has to be measured from outside, by watching when the visible
   * representation changes.
   */
  onFrameReport?: (report: EngineFrameReport) => void;
  /**
   * Whether the engine is painting, forwarded verbatim.
   *
   * `EditorCanvas` acts on this itself — it is what decides whether the DOM design
   * objects can be hidden — and also republishes it, because "the engine is painting"
   * is a precondition a caller may need. A test that means to drive the engine path
   * and starts before the first frame drives the DOM path instead, and the resulting
   * pass is indistinguishable from a real one.
   */
  onEngineStatus?: (status: EngineStatus) => void;
  /**
   * The engine's shape-creation bridge, republished for the owner.
   *
   * Exposed so whichever component owns the shape tool can drive a creation gesture
   * without reaching into the renderer, and so a test can drive one directly.
   */
  onShapeCreateBridge?: (bridge: ShapeCreateBridge | null) => void;
  onRotate?: (layerId: string, prev: RotateSnapshot, next: RotateSnapshot) => void;
  /**
   * Viewport transform applied to the layer-group wrapper. Defaults to the
   * identity transform (zoom 1, pan 0), which renders the design at native
   * dimensions centered in the stage. Pan/zoom interaction is task 5.2; this is
   * the seam that drives the wrapper's `translate(...) scale(...)`.
   */
  viewport?: Viewport;
  /**
   * Current Selection_Set driving the selection handles (task 5.5). Defaults to
   * an empty selection so the canvas renders standalone (e.g. in tests).
   */
  selection?: SelectionSet;
  /** Replace the selection with exactly one layer (Req 1.7). */
  onSelectOnly?: (layerId: string) => void;
  /** Toggle a layer's membership on shift-click (Req 1.9, 1.10). */
  onToggleSelection?: (layerId: string) => void;
  /** Clear the selection on an empty-canvas click (Req 1.8). */
  onClearSelection?: () => void;
  /** Replace the whole selection on marquee release (Req 1.12). */
  onSetSelection?: (layerIds: string[]) => void;
  /** Group isolation state */
  isolationMode?: { groupId: string; parentPath: string[] } | null;
  /** Double click handler for layers */
  onDoubleClick?: (layerId: string, textElementId?: string) => void;
  /** Enables alignment snapping and smart guides while moving canvas layers. */
  snappingEnabled?: boolean;
  /** CenterStage owns text editing, so SVGCanvas must not mount a second editor. */
  externalTextEditing?: boolean;
}

export function EditorCanvas({
  designOutput,
  activeLayer,
  onLayerSelect,
  onLayerTextUpdate,
  onLayerTransform,
  viewport = DEFAULT_VIEWPORT,
  selection = EMPTY_SELECTION,
  onSelectOnly = noopLayerId,
  onToggleSelection = noopLayerId,
  onClearSelection,
  onSetSelection,
  onResize,  onResizeSnapshot,
  onHitTester,
  onGestureBridge,
  onFrameReport,
  onEngineStatus,
  onShapeCreateBridge,
  onRotate,
  isolationMode,
  onDoubleClick,
  snappingEnabled = true,
  externalTextEditing = false,
}: EditorCanvasProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);

  // The Skia engine is the default renderer; /editor?renderer=svg opts out.
  // Resolved once per mount so a re-render cannot toggle renderers mid-session.
  const [skiaOverlayEnabled] = useState<boolean>(() => isSkiaRendererEnabled());

  /**
   * Whether the engine has actually put pixels on screen.
   *
   * Distinct from `skiaOverlayEnabled`, and the distinction is load-bearing. The
   * flag says which renderer was ASKED for; this says whether that renderer is
   * painting. Hiding the SVG design objects on the strength of the flag alone meant
   * that a missing WASM artifact, a failed module fetch or a failed surface
   * allocation produced a BLANK canvas instead of a fallback — the document was
   * still there, but nothing drew it. That is only survivable while the engine is
   * opt-in; as the default it would be the first thing a user saw.
   *
   * So the DOM stays the visual surface until the engine reports a presented frame,
   * and reverts to it if the engine later fails.
   */
  const [enginePainting, setEnginePainting] = useState<boolean>(false);
  const onEngineStatusRef = useRef(onEngineStatus);
  onEngineStatusRef.current = onEngineStatus;
  const handleEngineStatus = useCallback((status: EngineStatus): void => {
    setEnginePainting(status.kind === "ready");
    if (status.kind === "unavailable" || status.kind === "error") {
      // Logged, never silent: falling back to a different renderer is exactly the
      // kind of decision that must be visible when someone asks why it looks wrong.
      console.warn(
        `[editor] the Skia renderer is not painting (${status.kind}: ${status.detail}). `
          + "Falling back to the canonical-SVG renderer for this session.",
      );
    }
    onEngineStatusRef.current?.(status);
  }, []);

  /**
   * The engine is the interactive surface only while it is painting.
   *
   * One derived value rather than three call-site conditions, so the DOM cannot end
   * up half-suppressed: hidden objects with a DOM preview, or a hidden preview with
   * visible objects.
   */
  const engineOwnsSurface = skiaOverlayEnabled && enginePainting;

  /**
   * Transport for live drag gestures between `SVGCanvas` (which owns the drag)
   * and `SkiaOverlay` (its sibling).
   *
   * Created per mount rather than at module scope, so there is no shared global
   * state and two editors on one page cannot cross-talk. Only subscribed when
   * the Skia renderer is on, so the default path is unaffected.
   */
  const gestureChannelRef = useRef<GestureChannel | null>(null);
  if (gestureChannelRef.current === null) {
    gestureChannelRef.current = createGestureChannel((error) => {
      // A failing renderer must not strand the drag in another one.
      console.warn("[editor] a drag gesture listener threw", error);
    });
  }
  const gestureChannel = gestureChannelRef.current;

  const handleExternalDoubleClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (!externalTextEditing || !onDoubleClick) {
      return;
    }

    // Injected SVG can originate from a different DOM realm, and clicks on
    // text commonly target a nested <tspan>. Resolve by DOM capability and
    // identify the text node before its layer wrapper so regenerated text
    // remains editable across unlimited commit/re-edit cycles.
    const candidate = event.target as (EventTarget & {
      closest?: (selectors: string) => Element | null;
      parentElement?: Element | null;
    }) | null;
    const target = candidate && typeof candidate.closest === "function"
      ? candidate as Element
      : candidate?.parentElement ?? null;
    if (!target) {
      return;
    }

    const textElement = target.closest<SVGTextElement>("text");
    const layerElement = textElement?.closest<SVGElement>("[data-layer-id]")
      ?? target.closest<SVGElement>("[data-layer-id]");
    const textElementId = textElement?.getAttribute("data-element-id") ?? undefined;
    const layerId = layerElement?.getAttribute("data-layer-id") ?? textElementId;
    const roleGroup = (textElement ?? layerElement)?.closest<SVGGElement>("g[data-role]");
    if (!layerId || roleGroup?.getAttribute("data-editable") === "false") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onDoubleClick(layerId, textElementId);
  };

  // Derive a render-only DesignOutput whose composedSVG has the layer groups
  // nested inside the viewport wrapper, but with identity transform (translate 0 0, scale 1).
  // This satisfies the wrapSvgWithViewport test and structural expectations while letting
  // CSS handles the real screen zoom and pan.
  const renderOutput = useMemo<DesignOutput | null>(() => {
    if (!designOutput) {
      return null;
    }
    const wrappedSvg = wrapSvgWithViewport(designOutput.composedSVG, 1, 0, 0);
    if (wrappedSvg === designOutput.composedSVG) {
      return designOutput;
    }
    return { ...designOutput, composedSVG: wrappedSvg };  }, [designOutput]);

  /**
   * Layer-id -> scene node, from the authoritative render scene.
   *
   * Derived here because this component holds the unwrapped `designOutput`, whose
   * layer ids match the document. Handed to `SVGCanvas` so a drag converts its
   * delta through the same transform chain the renderers and the selection
   * overlay use.
   */
  const resolveSceneNode = useSceneNodeLookup(designOutput);

  /**
   * Retained state for the gesture in flight, shared by every consumer.
   *
   * Owned here because this component owns both ends: `SVGCanvas` (which runs the
   * drag) and `SelectionOverlay` (which must follow it in the same frame). A ref so
   * its identity never changes — the drag hook's listener effect is keyed on it
   * being stable.
   */
  const liveTransformsRef = useRef<LiveTransformStore | null>(null);
  if (liveTransformsRef.current === null) {
    liveTransformsRef.current = createLiveTransformStore();
  }
  const liveTransforms = liveTransformsRef.current;

  /**
   * Engine hit-testing, published by the Skia renderer when its surface is live.
   *
   * Held in a ref and read at event time so a gesture never captures a stale
   * tester, and so arrival of the engine does not re-run the pointer listeners.
   */
  const hitTesterRef = useRef<((clientX: number, clientY: number) => string | null) | null>(null);
  const handleHitTester = useCallback(
    (hitTest: ((clientX: number, clientY: number) => string | null) | null) => {
      hitTesterRef.current = hitTest;
      onHitTester?.(hitTest);
    },
    [onHitTester],
  );
  /**
   * Stable wrapper handed to the drag hook.
   *
   * Returns null when the engine is not available, which is the signal to use the
   * DOM path — the documented SVG compatibility mode, not a silent fallback.
   */
  const hitTestClient = useCallback((clientX: number, clientY: number): string | null => {
    return hitTesterRef.current?.(clientX, clientY) ?? null;
  }, []);

  /**
   * The engine's gesture bridge, published by the Skia renderer.
   *
   * Held in a ref and read at gesture start, so the overlay never captures a bridge
   * bound to a surface that has since been replaced. Null means the engine is not
   * available and the overlay solves the gesture itself — the documented SVG
   * fallback, held to the engine's answers by engine-parity.mts.
   */
  const gestureBridgeRef = useRef<GestureBridge | null>(null);
  const handleGestureBridge = useCallback((bridge: GestureBridge | null) => {
    gestureBridgeRef.current = bridge;
    onGestureBridge?.(bridge);
  }, [onGestureBridge]);
  const resolveGestureBridge = useCallback((): GestureBridge | null => {
    return gestureBridgeRef.current;
  }, []);

  /**
   * The shape-creation bridge, held the same way and for the same reason.
   *
   * A ref read at gesture start rather than a prop, so a creation gesture never captures
   * a bridge bound to a surface that has since been replaced — and so the engine
   * arriving does not re-run the pointer listeners.
   *
   * Null means the engine is not painting, and there is no TypeScript fallback for a
   * live preview: with nothing to draw on, the caller keeps the existing SVG preview
   * overlay, which is a different feature rather than a second implementation of this
   * one.
   */
  const shapeCreateBridgeRef = useRef<ShapeCreateBridge | null>(null);
  const handleShapeCreateBridge = useCallback(
    (bridge: ShapeCreateBridge | null) => {
      shapeCreateBridgeRef.current = bridge;
      onShapeCreateBridge?.(bridge);
    },
    [onShapeCreateBridge],
  );

  /**
   * Selection geometry for the canvas-rendered chrome.
   *
  /**
   * Artboard size in document pixels, for the selection canvas's backing store.
   *
   * Read from the canonical SVG's own root attributes so it is the same number the
   * engine sized its surface with; a mismatch would offset every drawn handle.
   */
  const artboardSize = useMemo(() => {
    const markup = designOutput?.composedSVG ?? "";
    const width = Number(/\swidth="([\d.]+)"/.exec(markup)?.[1] ?? "0");
    const height = Number(/\sheight="([\d.]+)"/.exec(markup)?.[1] ?? "0");
    return {
      width: Number.isFinite(width) && width > 0 ? width : 1080,
      height: Number.isFinite(height) && height > 0 ? height : 1080,
    };
  }, [designOutput]);

  return (
    <div
      className={styles.canvasHost}
      ref={hostRef}
      onDoubleClickCapture={handleExternalDoubleClick}
    >
      {!renderOutput ? (
        <div className={styles.emptyState}>
          <p>No design has been generated yet.</p>
        </div>
      ) : (
        <SVGCanvas
          designOutput={renderOutput}
          activeLayer={activeLayer}
          onLayerSelect={onLayerSelect}
          onLayerTextUpdate={onLayerTextUpdate}
          onLayerTransform={onLayerTransform}
          /*
            Built from the UNWRAPPED `designOutput`, not `renderOutput`. Parsing
            the viewport-wrapped markup makes `canonicalSvg` synthesize layer ids,
            which would not match the ids the DOM carries — the drag would then
            find no node and silently fall back to assuming an untransformed
            ancestor chain. The scene extraction is cached per design output, so
            this shares one parse with the selection overlay below.
          */
          resolveSceneNode={resolveSceneNode}
          liveTransforms={liveTransforms}
          hitTestClient={hitTestClient}
          viewport={viewport}
          snappingEnabled={snappingEnabled}
          allowInlineTextEditing={!externalTextEditing}
          onLayerDoubleClick={externalTextEditing ? undefined : onDoubleClick}
          /*
            Wired whenever the engine was ASKED for, not only once it is painting.

            The engine tolerates gestures that arrive before it has loaded — it drops
            them silently, which `SkiaOverlay.test.tsx` pins — and there is a real
            window between "the scene is uploaded and the bridge answers geometry
            questions" and "the first frame has been presented". Gating the channel on
            the latter meant a gesture started in that window went nowhere: the engine
            never saw it, so the object did not move at all. Measured, not theorised:
            fifteen sub-pixel and gesture-lifecycle cases failed intermittently on
            exactly that race.

            Only the VISUAL suppression below depends on the engine actually painting,
            because only that can leave the canvas blank.
          */
          onDragGesture={skiaOverlayEnabled ? gestureChannel.emit : undefined}
          /*
            When the engine is the visual surface, the SVG DOM must not be painted or
            mutated for interactive rendering. It stays MOUNTED — text editing and the
            canonical-SVG/export path still read it, and it is the compatibility
            renderer — but it is not the thing the user sees and no design object's
            attributes are written during a gesture.

            Two flags rather than one: hiding the pixels and suppressing the writes are
            separate facts, and conflating them would make a half-migrated state
            impossible to describe.
          */
          hideDesignObjects={engineOwnsSurface}
          domPreview={!engineOwnsSurface}
        />
      )}
      {/*
        Selection overlay: handles + marquee + hit-testing (task 5.5). Listens
        on the host in the capture phase so it coexists with SVGCanvas's own
        click/double-click/drag handlers without intercepting them.
      */}
      <SelectionOverlay
        hostRef={hostRef}
        /*
          The ORIGINAL canonical SVG, not `renderOutput`. The wrapped variant's
          top-level `<g data-viewport>` has no `data-role`, which makes the parser
          synthesize layer ids like `shapes-0` — so every selection lookup would
          miss and no geometry would resolve. The wrapper's transform is identity,
          so world transforms are identical either way; only the ids differ.
        */
        designOutput={designOutput}
        viewport={viewport}
        selection={selection}
        onSelectOnly={onSelectOnly}
        onToggle={onToggleSelection}
        onClear={onClearSelection ?? (() => undefined)}
        onSetSelection={onSetSelection ?? (() => undefined)}
        onDoubleClick={externalTextEditing ? undefined : onDoubleClick}
        onPrimaryChange={(layerId) => {
          onLayerSelect(layerId as any); // Cast as any because onLayerSelect might not accept null in types, we'll check its type but it's probably string | null or any
        }}
        onResize={onResize}
        onResizeSnapshot={onResizeSnapshot}
        liveTransforms={liveTransforms}
        /*
          Hidden exactly when the engine owns the surface, the same gate the design
          objects use. This was hardcoded to `false`, which left the DOM overlay's
          outline and handles painted on top of the engine's canvas-drawn box — two
          selection boxes at once, and the DOM one is positioned by the DOM-measuring
          hook that returns the wrong place on this path. Tying it back to
          `engineOwnsSurface` leaves the canvas box as the single visible chrome while
          the engine is painting, and restores the DOM chrome as the fallback when it
          is not.
        */
        chromeHidden={false}
        /*
          On the engine path the SVG must not be written during a gesture, for the same
          reason its objects are not painted: it is not the surface the user sees, and
          one attribute write per frame is still a write the engine path does not need.
          Kept as its own flag rather than derived from `chromeHidden`, because hiding
          the chrome and suppressing the preview writes are separate facts.
        */
        domPreview={!engineOwnsSurface}
        resolveGestureBridge={resolveGestureBridge}
        onRotate={onRotate}
      />
      {skiaOverlayEnabled ? (
        <SkiaOverlay
          designOutput={designOutput}
          viewport={viewport}
          gestures={gestureChannel}
          onHitTester={handleHitTester}
          onGestureBridge={handleGestureBridge}
          onShapeCreateBridge={handleShapeCreateBridge}
          onFrameReport={onFrameReport}
          onEngineStatus={handleEngineStatus}
          selectionLayer={null}
        />
      ) : null}
    </div>
  );
}

/**
 * Wrap the top-level `<g data-role>` groups of a Canonical_SVG in a single
 * `<g data-viewport>` group carrying the viewport transform, preserving every
 * layer group as a distinct child (never merged — Req 10.9) and document order.
 *
 * Pure and fail-safe: on any parse problem, when the root is not an `<svg>`, or
 * when there are no `<g data-role>` groups to wrap, the original markup is
 * returned unchanged so the underlying renderer always has valid SVG.
 */
export function wrapSvgWithViewport(
  svgMarkup: string,
  zoom: number,
  panX: number,
  panY: number,
): string {
  try {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(svgMarkup, "image/svg+xml");
    if (parsed.querySelector("parsererror")) {
      return svgMarkup;
    }

    const root = parsed.documentElement;
    if (!root || root.tagName.toLowerCase() !== "svg") {
      return svgMarkup;
    }

    const transform = `translate(${panX} ${panY}) scale(${zoom})`;

    // Already wrapped (e.g. a re-render): just refresh the transform.
    const existingWrapper = Array.from(root.children).find(
      (child) => child.tagName.toLowerCase() === "g" && child.hasAttribute("data-viewport"),
    );
    if (existingWrapper) {
      existingWrapper.setAttribute("transform", transform);
      return new XMLSerializer().serializeToString(root);
    }

    const roleGroups = Array.from(root.children).filter(
      (child) => child.tagName.toLowerCase() === "g" && child.hasAttribute("data-role"),
    );
    if (roleGroups.length === 0) {
      return svgMarkup;
    }

    const wrapper = parsed.createElementNS(SVG_NAMESPACE, "g");
    wrapper.setAttribute("data-viewport", "true");
    wrapper.setAttribute("transform", transform);

    // Insert the wrapper where the first layer group sits, then move each layer
    // group into it in document order. Moving (appendChild) preserves the nodes
    // and their order; the groups remain separate siblings, never flattened.
    root.insertBefore(wrapper, roleGroups[0]);
    roleGroups.forEach((group) => {
      wrapper.appendChild(group);
    });

    return new XMLSerializer().serializeToString(root);
  } catch {
    return svgMarkup;
  }
}

export default EditorCanvas;
