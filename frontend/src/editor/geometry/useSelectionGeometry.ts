/**
 * useSelectionGeometry — the single source of selection geometry for the overlay.
 *
 * This replaces `SelectionOverlay.computeSelectionBox`, which measured the DOM
 * (`getBoundingClientRect` / `getScreenCTM`) while the renderers used
 * `RenderScene.worldTransform`. Two independent sources for the same fact is why
 * the box drifted off rotated shapes: they were never computing the same thing.
 *
 * The chain here is entirely derivational:
 *
 * ```
 * CreativeDocument -> canonical SVG -> extractRenderScene -> node.worldTransform
 *                                                              |
 *                       obbForNode  <----------------------------
 *                            |
 *                       obbToViewport(view)  -> what the overlay draws
 * ```
 *
 * The only DOM reads are two rects — the host and the scaled artboard wrapper —
 * which establish where world (0, 0) currently sits on screen. That is a per-frame
 * *frame* measurement. It is not a per-object geometry measurement, and the
 * distinction is the entire point: measuring the frame once is unavoidable and
 * cheap; measuring each object's box is what diverged from the renderer.
 *
 * One responsibility per file: producing viewport selection geometry from the
 * authoritative scene.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type RefObject } from "react";

import { artboardFromDesignOutput } from "../designOutputMapping";
import { domTextMetrics } from "../renderer/domTextMetrics";
import { walkScene, type RenderNode, type RenderScene } from "../renderer/renderScene";
import { extractRenderScene } from "../renderer/sceneExtractor";
import { canvasViewFrom, type CanvasView } from "./coordinateSpaces";
import {
  aabbForNodes,
  obbForNode,
  obbToViewport,
  type OrientedBox,
  type SelectionGeometryError,
  type TransformedNode,
  type ViewportSelection,
  type WorldRectResult,
} from "./selectionGeometry";
import type { DesignOutput } from "../../types";
import type { Viewport } from "../types/documentModel";

/** The class the canvas wrapper carries. World (0, 0) is its top-left corner. */
const ARTBOARD_WRAPPER_SELECTOR = ".svg-canvas-wrapper";

export interface SelectionGeometryState {
  /** Oriented geometry for a single selection, in viewport space. */
  readonly single: ViewportSelection | null;
  /** The world-space OBB behind `single`, for resize and rotate maths. */
  readonly obb: OrientedBox | null;
  /** Axis-aligned viewport rect for a multi-selection. */
  readonly multi: { x: number; y: number; width: number; height: number } | null;
  /** The view used, so gesture code converts pointers with the same mapping. */
  readonly view: CanvasView | null;
  /** Nodes that could not provide geometry, with a reason. Never silent. */
  readonly errors: readonly SelectionGeometryError[];
  /** Recompute now — call after a transform changes mid-gesture. */
  readonly refresh: () => void;
}

/**
 * Build the render scene for an artboard, memoised on the markup.
 *
 * Parsing the canonical SVG is the expensive step, so it is keyed on the markup
 * string rather than redone whenever a selection changes.
 *
 * The cache is module-level and keyed on the `DesignOutput` identity so the
 * several components that need the scene — the selection overlay for its box, the
 * drag hook for its transform chain — share ONE extraction per document instead of
 * each parsing the document again. A `WeakMap` so a superseded document is
 * collectable.
 */
const sceneCache = new WeakMap<DesignOutput, RenderScene>();

export function useRenderScene(designOutput: DesignOutput | null): RenderScene | null {
  return useMemo(() => {
    if (designOutput === null) {
      return null;
    }
    const cached = sceneCache.get(designOutput);
    if (cached !== undefined) {
      return cached;
    }
    try {
      const scene = extractRenderScene(artboardFromDesignOutput(designOutput), {
        // Measured with the browser's own text engine, which is what paints the
        // `<text>` element on this path. Without a provider, text nodes have no
        // bounds and correctly get no selection box — so the box was missing
        // entirely for every text layer.
        textMetrics: domTextMetrics,
      });
      sceneCache.set(designOutput, scene);
      return scene;
    } catch (error) {
      // A document we cannot parse must not silently produce a selection at some
      // arbitrary place; report and render nothing.
      console.warn(
        "[selection] could not build a render scene, so selection geometry is unavailable:",
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }, [designOutput]);
}

/**
 * Look up nodes by layer id, sharing the index across every consumer.
 *
 * Returned as a function rather than the Map so callers cannot mutate it, and so
 * the drag hook's dependency is a stable callback.
 */
export function useSceneNodeLookup(
  designOutput: DesignOutput | null,
): (layerId: string) => RenderNode | undefined {
  const scene = useRenderScene(designOutput);
  const index = useMemo(() => indexScene(scene), [scene]);
  return useCallback((layerId: string) => index.get(layerId), [index]);
}

/** Index the scene by layer id once, so lookups during a gesture are O(1). */
function indexScene(scene: RenderScene | null): Map<string, RenderNode> {
  const index = new Map<string, RenderNode>();
  if (scene === null) {
    return index;
  }
  for (const node of walkScene(scene)) {
    index.set(node.id, node);
  }
  return index;
}

export interface UseSelectionGeometryOptions {
  readonly hostRef: RefObject<HTMLElement | null>;
  readonly designOutput: DesignOutput | null;
  readonly layerIds: readonly string[];
  readonly viewport: Viewport | undefined;
}

export function useSelectionGeometry({
  hostRef,
  designOutput,
  layerIds,
  viewport,
}: UseSelectionGeometryOptions): SelectionGeometryState {
  const scene = useRenderScene(designOutput);
  const nodesById = useMemo(() => indexScene(scene), [scene]);

  const zoom = viewport?.zoom ?? 1;
  const selectionKey = layerIds.join("|");

  /**
   * A monotonic tick that forces a recompute.
   *
   * Also incremented by the readiness effect below once the artboard wrapper is
   * actually in the DOM. Without that signal the layout effect could run before
   * the markup mounted, bail out, and — because its other dependencies are stable
   * — never run again. That exact defect has now been found three times in this
   * codebase; a ref is not a readiness signal.
   */
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((value) => value + 1), []);

  const [wrapperPresent, setWrapperPresent] = useState(false);
  useEffect(() => {
    const present =
      hostRef.current?.querySelector(ARTBOARD_WRAPPER_SELECTOR) instanceof HTMLElement;
    setWrapperPresent((previous) => (previous === present ? previous : present));
  });

  const [state, setState] = useState<Omit<SelectionGeometryState, "refresh">>({
    single: null,
    obb: null,
    multi: null,
    view: null,
    errors: [],
  });

  useLayoutEffect(() => {
    const host = hostRef.current;
    const wrapper = host?.querySelector(ARTBOARD_WRAPPER_SELECTOR);

    if (host === null || !(wrapper instanceof HTMLElement) || layerIds.length === 0) {
      setState({ single: null, obb: null, multi: null, view: null, errors: [] });
      return;
    }

    const view = canvasViewFrom(
      host.getBoundingClientRect(),
      wrapper.getBoundingClientRect(),
      zoom,
      typeof window === "undefined" ? 1 : window.devicePixelRatio,
    );
    if (view === null) {
      setState({ single: null, obb: null, multi: null, view: null, errors: [] });
      return;
    }

    const nodes: TransformedNode[] = [];
    const missing: SelectionGeometryError[] = [];
    for (const id of layerIds) {
      const node = nodesById.get(id);
      if (node === undefined) {
        // Selected but absent from the scene: a real inconsistency, not a
        // rendering nicety. Reported so it is debuggable.
        missing.push({ ok: false, reason: "bounds-unavailable", nodeId: id });
        continue;
      }
      nodes.push(node);
    }

    // A single selection gets its true orientation; several selections have no
    // single orientation, so they get an axis-aligned union instead.
    if (nodes.length === 1) {
      const result = obbForNode(nodes[0]);
      if (!result.ok) {
        setState({ single: null, obb: null, multi: null, view, errors: [...missing, result] });
        return;
      }
      setState({
        single: obbToViewport(view, result.obb),
        obb: result.obb,
        multi: null,
        view,
        errors: missing,
      });
      return;
    }

    const union: WorldRectResult | null = aabbForNodes(nodes);
    if (union === null) {
      setState({ single: null, obb: null, multi: null, view, errors: missing });
      return;
    }
    const topLeft = {
      x: view.originClient.x + union.rect.x * view.zoom - view.hostClient.x,
      y: view.originClient.y + union.rect.y * view.zoom - view.hostClient.y,
    };
    setState({
      single: null,
      obb: null,
      multi: {
        x: topLeft.x,
        y: topLeft.y,
        width: union.rect.width * view.zoom,
        height: union.rect.height * view.zoom,
      },
      view,
      errors: [...missing, ...union.errors],
    });
  }, [
    hostRef,
    nodesById,
    selectionKey,
    layerIds,
    zoom,
    viewport?.panX,
    viewport?.panY,
    wrapperPresent,
    tick,
  ]);

  return useMemo(() => ({ ...state, refresh }), [state, refresh]);
}
