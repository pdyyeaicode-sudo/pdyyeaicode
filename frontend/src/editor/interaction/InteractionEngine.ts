/**
 * InteractionEngine — the high-frequency path for pointer gestures.
 *
 * The problem it solves: routing every pointer sample through React state and a
 * full document → scene → encode → upload cycle produces visible stepping and
 * hundreds of undo entries for one drag. A design editor has to follow the
 * pointer continuously.
 *
 * The split:
 *
 *   committed state  — CreativeDocument, still the single source of truth
 *   transient state  — per-gesture transforms held here, rendered immediately
 *
 * During a gesture the document is NOT touched. Transforms go straight to the
 * engine through `setNodeTransform`, which takes six doubles and allocates
 * nothing, so a drag costs a handful of scalars per frame instead of
 * re-serialising the scene. On gesture end the accumulated change is handed back
 * as ONE transaction carrying before/after transforms, which is exactly what
 * undo/redo needs.
 *
 * Frame pacing: pointer events arrive at whatever rate the device produces, which
 * may be far above the display's refresh rate. Rendering per event would waste
 * work and can stall input. Instead the latest state is buffered and rendered
 * once per animation frame, so the loop naturally runs at 60, 120 or 144 Hz
 * according to the display rather than a hardcoded cap.
 *
 * Deliberately free of React and DOM APIs: the scheduler and clock are injected,
 * which keeps it unit-testable and keeps React out of the hot path entirely.
 *
 * One responsibility per file: transient gesture state and its render loop.
 */

import { IDENTITY, multiply, type Matrix2D } from "../renderer/matrix2d";

/** The narrow slice of the engine surface a gesture needs. */
export interface GestureSurface {
  /** Hot path: replace one node's transform. Allocates nothing. */
  setNodeTransform(
    id: string,
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ): boolean;
  /**
   * Move a node by a document-space offset, relative to where the scene loaded
   * it.
   *
   * Preferred over `setNodeTransform` for drags: the engine resolves the
   * ancestor transform chain, so a node inside a rotated or scaled group moves
   * by exactly the offset the pointer describes. Optional so a bare surface can
   * still be driven by matrices.
   */
  setNodeDocumentTranslation?(id: string, dx: number, dy: number): boolean;
  /** Paint the current engine state. */
  render(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    pixelRatio: number,
    backgroundColor: number,
    useBackground: boolean,
  ): number;
  /**
   * Paint ONLY what changed, and report the region.
   *
   * Optional so a bare surface can still be driven, but strongly preferred: both rendering
   * and reading a surface back are proportional to pixel COUNT, so repainting a whole
   * 1080x1080 artboard to move one small object costs about 92ms — under 12fps — while
   * repainting the damaged rectangle costs a fraction of a frame.
   */
  renderDamaged?(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    pixelRatio: number,
    backgroundColor: number,
    useBackground: boolean,
    padding: number,
  ): DamagedRenderResult;
  /** True when a partial repaint is possible. */
  hasPartialDamage?(): boolean;
  /** Force the next paint to be a full one. */
  invalidateAll?(): void;
}

/** What a partial repaint reports back. */
export type DamagedRenderResult =
  | {
      readonly ok: true;
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly nodesDrawn: number;
      readonly nodesCulled: number;
    }
  | { readonly ok: false; readonly reason: string };

/** A rectangle of the surface, in document pixels. */
export interface DamageRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** How the surface should be painted each frame. */
export interface ViewSettings {
  readonly viewTransform: Matrix2D;
  readonly pixelRatio: number;
  readonly backgroundColor: number;
  readonly useBackground: boolean;
}

export interface InteractionEngineOptions {
  readonly surface: GestureSurface;
  readonly view: ViewSettings;
  /** Defaults to `requestAnimationFrame`. Injected for tests. */
  readonly requestFrame?: (callback: () => void) => number;
  readonly cancelFrame?: (handle: number) => void;
  /** Defaults to `performance.now`. Injected for tests. */
  readonly now?: () => number;
  /** Called after the surface is painted, so an overlay can copy pixels out. */
  readonly onFramePainted?: (stats: FrameStats) => void;
}

/** One node's participation in a gesture. */
export interface GestureTarget {
  readonly layerId: string;
  /** The node's transform before the gesture began. */
  readonly baseTransform: Matrix2D;
}

/** Result of a completed gesture: one undoable unit of work. */
export interface GestureTransaction {
  readonly layerIds: readonly string[];
  /** Transforms before the gesture, for undo. */
  readonly before: ReadonlyMap<string, Matrix2D>;
  /** Transforms after the gesture, for redo. */
  readonly after: ReadonlyMap<string, Matrix2D>;
  /**
   * Final document-space offset per layer, for gestures driven by
   * `setTransientTranslation`. The document commits these directly, so the
   * caller never has to decompose a matrix to recover a drag distance.
   */
  readonly translations: ReadonlyMap<string, DocumentOffset>;
  /** True when nothing actually moved, so no command should be recorded. */
  readonly unchanged: boolean;
  readonly durationMs: number;
  readonly pointerSamples: number;
  readonly framesRendered: number;
}

/** An offset in document pixels. Never screen pixels. */
export interface DocumentOffset {
  readonly dx: number;
  readonly dy: number;
}

/** Per-frame instrumentation, so optimisation is driven by measurement. */
export interface FrameStats {
  /** Milliseconds from the newest pointer sample to the painted frame. */
  readonly inputLatencyMs: number;
  readonly frameDurationMs: number;
  /**
   * When the newest pointer sample folded into this frame was recorded.
   *
   * Exposed so a caller can measure latency to ITS OWN milestone rather than only to
   * the end of `render`. The renderer still has to copy the pixels out and the
   * compositor still has to present them, and both happen after this engine is done —
   * so `inputLatencyMs` alone understates what a user feels. With the sample's
   * timestamp, the rest of the pipeline can be attributed instead of guessed at.
   */
  readonly sampleMs: number;
  /** Pointer samples folded into this single frame. */
  readonly coalescedSamples: number;
  /** `setNodeTransform` calls issued this frame. */
  readonly patchCalls: number;
  readonly nodesDrawn: number;
  /**
   * The region repainted, or null when the whole surface was.
   *
   * The consumer needs this to copy the right pixels out: a partial repaint is only worth
   * anything if the readback is partial too, and reading the whole surface after a clipped
   * render would keep the dominant cost while adding the bookkeeping.
   */
  readonly damage: DamageRect | null;
}

/** Cumulative counters for a session. */
export interface InteractionStats {
  readonly pointerSamples: number;
  readonly framesRendered: number;
  /** Samples that were superseded before a frame ran; higher is more efficient. */
  readonly coalescedSamples: number;
  readonly patchCalls: number;
  /** Frames whose duration exceeded the budget derived from observed cadence. */
  readonly slowFrames: number;
  readonly lastFrame: FrameStats | null;
  /**
   * Full scene rebuilds triggered while a gesture was active. MUST stay zero:
   * a nonzero value means the hot path regressed into re-serialising the scene.
   */
  readonly sceneRebuildsDuringGesture: number;
}

const SLOW_FRAME_BUDGET_MS = 16.7;

/**
 * Document-space padding added to a damage rectangle on every side.
 *
 * A stroke, a drop shadow and antialiasing all paint OUTSIDE a node's bounds, so a rect
 * that hugged the bounds exactly would leave a one-pixel ghost of the object's previous
 * outline — the artefact that makes partial repainting look broken. Four pixels covers
 * antialiasing and a typical 2px stroke centred on the edge; a scene with much heavier
 * strokes would need more, which is why this is a named constant rather than a literal.
 */
const DAMAGE_PADDING_PX = 4;

/**
 * Placeholder handle held while `requestFrame` is being called, so a scheduler
 * that runs its callback synchronously is distinguishable from one that has not
 * run yet.
 */
const PENDING_FRAME_HANDLE = -1;

export class InteractionEngine {
  private readonly surface: GestureSurface;
  private readonly requestFrame: (callback: () => void) => number;
  private readonly cancelFrame: (handle: number) => void;
  private readonly now: () => number;
  private onFramePainted: ((stats: FrameStats) => void) | undefined;

  private view: ViewSettings;

  /** Transforms the gesture started from, for undo and for cancellation. */
  private baseTransforms = new Map<string, Matrix2D>();
  /** Latest transform per node; only this is rendered. */
  private transientTransforms = new Map<string, Matrix2D>();
  /**
   * Latest document-space offset per node, for gestures that let the engine
   * resolve the transform hierarchy instead of composing matrices here.
   */
  private transientTranslations = new Map<string, DocumentOffset>();
  /** Nodes whose transform changed since the last painted frame. */
  private dirtyLayerIds = new Set<string>();

  private gestureActive = false;
  private gestureStartMs = 0;
  private frameHandle: number | null = null;
  private newestSampleMs = 0;
  private samplesSinceFrame = 0;

  private pointerSamples = 0;
  private framesRendered = 0;
  private coalescedSamples = 0;
  private patchCalls = 0;
  private slowFrames = 0;
  private sceneRebuildsDuringGesture = 0;
  private lastFrame: FrameStats | null = null;
  private gestureFramesRendered = 0;
  private gesturePointerSamples = 0;

  constructor(options: InteractionEngineOptions) {
    this.surface = options.surface;
    this.view = options.view;
    this.requestFrame =
      options.requestFrame
      ?? ((callback) =>
        typeof requestAnimationFrame === "function"
          ? requestAnimationFrame(() => callback())
          : 0);
    this.cancelFrame =
      options.cancelFrame
      ?? ((handle) => {
        if (typeof cancelAnimationFrame === "function") {
          cancelAnimationFrame(handle);
        }
      });
    this.now = options.now ?? (() => (typeof performance === "undefined" ? 0 : performance.now()));
    this.onFramePainted = options.onFramePainted;
  }

  isGestureActive(): boolean {
    return this.gestureActive;
  }

  /** Update how the surface is painted, for example after a zoom. */
  setView(view: ViewSettings): void {
    this.view = view;
    // A different view transform, pixel ratio or background makes every existing pixel
    // suspect, so the next paint must be a full one. Without this a partial repaint would
    // blend the new view into the old one.
    this.surface.invalidateAll?.();
  }

  /**
   * Replace the frame callback.
   *
   * The overlay rebinds this whenever the scene changes, because the callback
   * closes over that scene's diagnostics. Rebinding rather than constructing a
   * new engine keeps the cumulative counters — including
   * `sceneRebuildsDuringGesture` — meaningful across the session.
   */
  setFramePaintedHandler(handler: (stats: FrameStats) => void): void {
    this.onFramePainted = handler;
  }

  /**
   * Schedule a repaint outside a gesture — after a scene upload, a zoom, or a
   * resize.
   *
   * Coalesces with any pending frame, so several callers in the same tick still
   * produce exactly one paint. This is what makes the frame loop the single
   * paint path: nothing renders the surface directly.
   */
  requestPaint(): void {
    this.scheduleFrame();
  }

  /**
   * Record that the scene was rebuilt from the document. Called by the overlay so
   * a regression into per-frame re-serialisation shows up as a nonzero counter
   * rather than as vague slowness.
   */
  noteSceneRebuild(): void {
    if (this.gestureActive) {
      this.sceneRebuildsDuringGesture += 1;
    }
  }

  /** Begin a gesture over one or more nodes. */
  beginGesture(targets: readonly GestureTarget[]): void {
    this.baseTransforms = new Map(targets.map((t) => [t.layerId, t.baseTransform]));
    this.transientTransforms = new Map(this.baseTransforms);
    this.transientTranslations.clear();
    this.dirtyLayerIds.clear();
    this.gestureActive = true;
    this.gestureStartMs = this.now();
    this.gestureFramesRendered = 0;
    this.gesturePointerSamples = 0;
  }

  /**
   * Apply a delta to every node in the gesture, expressed in document space.
   *
   * Pure transforms compose onto the base matrix; the node's geometry is never
   * regenerated, which is what keeps a drag cheap regardless of path complexity.
   */
  applyDelta(delta: Matrix2D): void {
    if (!this.gestureActive) {
      return;
    }
    for (const [layerId, base] of this.baseTransforms) {
      this.transientTransforms.set(layerId, multiply(delta, base));
      this.dirtyLayerIds.add(layerId);
    }
    this.recordSample();
  }

  /** Set one node's transform directly, for resize and rotate handles. */
  setTransientTransform(layerId: string, transform: Matrix2D): void {
    if (!this.gestureActive) {
      return;
    }
    this.transientTransforms.set(layerId, transform);
    this.transientTranslations.delete(layerId);
    this.dirtyLayerIds.add(layerId);
    this.recordSample();
  }

  /**
   * Offset one node by a document-space delta, letting the engine resolve the
   * ancestor transform chain.
   *
   * This is the path a drag should use. It is not a convenience wrapper around
   * `setTransientTransform`: composing the offset here would need each node's
   * parent world transform, which is exactly the knowledge the engine already
   * has and this side does not.
   *
   * The offset is always relative to the gesture's start, so a stream of pointer
   * samples cannot accumulate drift.
   */
  setTransientTranslation(layerId: string, dx: number, dy: number): void {
    if (!this.gestureActive) {
      return;
    }
    this.transientTranslations.set(layerId, { dx, dy });
    this.dirtyLayerIds.add(layerId);
    this.recordSample();
  }

  /** Document-space offset currently being rendered for a node, if any. */
  getTransientTranslation(layerId: string): DocumentOffset | null {
    return this.transientTranslations.get(layerId) ?? null;
  }

  /** Transform currently being rendered for a node, if any. */
  getTransientTransform(layerId: string): Matrix2D | null {
    return this.transientTransforms.get(layerId) ?? null;
  }

  /**
   * Finish the gesture and return one undoable transaction. The document is
   * updated by the caller; this engine never mutates it.
   */
  endGesture(): GestureTransaction {
    // Paint the position the pointer was released at before tearing the gesture
    // down. Without this the last sample would be dropped with the pending
    // frame, leaving the previous frame on screen until the document commit
    // arrives — a visible stutter at the end of every drag.
    if (this.dirtyLayerIds.size > 0) {
      const coalesced = this.samplesSinceFrame;
      this.samplesSinceFrame = 0;
      this.paint(coalesced);
    }

    const before = new Map(this.baseTransforms);
    const after = new Map(this.transientTransforms);
    const translations = new Map(this.transientTranslations);
    const durationMs = this.now() - this.gestureStartMs;

    let unchanged = true;
    for (const [layerId, next] of after) {
      const previous = before.get(layerId) ?? IDENTITY;
      if (!sameMatrix(previous, next)) {
        unchanged = false;
        break;
      }
    }
    // A translation-driven gesture leaves the matrices untouched, so it has to
    // be checked separately or every drag would report as a no-op.
    if (unchanged) {
      for (const offset of translations.values()) {
        if (offset.dx !== 0 || offset.dy !== 0) {
          unchanged = false;
          break;
        }
      }
    }

    const transaction: GestureTransaction = {
      layerIds: [...new Set([...after.keys(), ...translations.keys()])],
      before,
      after,
      translations,
      unchanged,
      durationMs,
      pointerSamples: this.gesturePointerSamples,
      framesRendered: this.gestureFramesRendered,
    };

    this.finishGesture();
    return transaction;
  }

  /** Abandon the gesture, restoring the transforms it started from. */
  cancelGesture(): void {
    if (!this.gestureActive) {
      return;
    }
    for (const layerId of this.transientTranslations.keys()) {
      // A zero offset is what returns the node to its loaded transform; the
      // engine owns that transform, so it is not restorable from here.
      this.pushTranslation(layerId, 0, 0);
    }
    for (const [layerId, base] of this.baseTransforms) {
      if (!this.transientTranslations.has(layerId)) {
        this.pushTransform(layerId, base);
      }
    }
    this.finishGesture();
    this.paint(0);
  }

  getStats(): InteractionStats {
    return {
      pointerSamples: this.pointerSamples,
      framesRendered: this.framesRendered,
      coalescedSamples: this.coalescedSamples,
      patchCalls: this.patchCalls,
      slowFrames: this.slowFrames,
      lastFrame: this.lastFrame,
      sceneRebuildsDuringGesture: this.sceneRebuildsDuringGesture,
    };
  }

  /** Cancel any pending frame. Call on unmount. */
  dispose(): void {
    if (this.frameHandle !== null) {
      this.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
    this.gestureActive = false;
  }

  // --- internals ----------------------------------------------------------

  private recordSample(): void {
    this.pointerSamples += 1;
    this.gesturePointerSamples += 1;
    this.newestSampleMs = this.now();
    if (this.samplesSinceFrame > 0) {
      // A previous sample is being superseded before it was ever drawn. That is
      // the coalescing that keeps input from outpacing the display.
      this.coalescedSamples += 1;
    }
    this.samplesSinceFrame += 1;
    this.scheduleFrame();
  }

  private scheduleFrame(): void {
    if (this.frameHandle !== null) {
      return;
    }
    // Marked pending BEFORE requesting the frame. A scheduler that invokes its
    // callback synchronously — which headless harnesses do — would otherwise
    // have the callback set the handle to null and then be overwritten by the
    // real handle on return, leaving a frame permanently "pending" and silently
    // dropping every later paint.
    this.frameHandle = PENDING_FRAME_HANDLE;
    const handle = this.requestFrame(() => {
      this.frameHandle = null;
      const coalesced = this.samplesSinceFrame;
      this.samplesSinceFrame = 0;
      this.paint(coalesced);
    });
    if (this.frameHandle === PENDING_FRAME_HANDLE) {
      this.frameHandle = handle;
    }
  }

  private paint(coalescedSamples: number): void {
    const startedMs = this.now();

    let patchCalls = 0;
    for (const layerId of this.dirtyLayerIds) {
      const offset = this.transientTranslations.get(layerId);
      if (offset !== undefined) {
        if (this.pushTranslation(layerId, offset.dx, offset.dy)) {
          patchCalls += 1;
        }
        continue;
      }
      const transform = this.transientTransforms.get(layerId);
      if (transform !== undefined && this.pushTransform(layerId, transform)) {
        patchCalls += 1;
      }
    }
    this.dirtyLayerIds.clear();

    /*
      Try the partial repaint first.

      Both rendering and reading the surface back cost 34-44ms per megapixel in
      WebAssembly, and both scale with AREA — measured at 92ms per frame on a 1080x1080
      artboard for a gesture that moved one small object. The engine tracks which region
      changed (it is the only side that knows the transform chain), so asking it to repaint
      just that region makes the cost proportional to the change.

      It refuses, with a reason, after a scene upload or when a node's geometry cannot bound
      what changed. Then a full render happens — degrading to the previous behaviour rather
      than to a wrong frame.
    */
    let damage: DamageRect | null = null;
    let nodesDrawn = -1;
    const partial = this.surface.hasPartialDamage?.() === true
      ? this.surface.renderDamaged?.(
          this.view.viewTransform.a,
          this.view.viewTransform.b,
          this.view.viewTransform.c,
          this.view.viewTransform.d,
          this.view.viewTransform.e,
          this.view.viewTransform.f,
          this.view.pixelRatio,
          this.view.backgroundColor,
          this.view.useBackground,
          DAMAGE_PADDING_PX,
        )
      : undefined;

    if (partial !== undefined && partial.ok) {
      damage = { x: partial.x, y: partial.y, width: partial.width, height: partial.height };
      nodesDrawn = partial.nodesDrawn;
    } else {
      nodesDrawn = this.surface.render(
        this.view.viewTransform.a,
        this.view.viewTransform.b,
        this.view.viewTransform.c,
        this.view.viewTransform.d,
        this.view.viewTransform.e,
        this.view.viewTransform.f,
        this.view.pixelRatio,
        this.view.backgroundColor,
        this.view.useBackground,
      );
    }

    const finishedMs = this.now();
    const stats: FrameStats = {
      inputLatencyMs: this.newestSampleMs === 0 ? 0 : finishedMs - this.newestSampleMs,
      frameDurationMs: finishedMs - startedMs,
      sampleMs: this.newestSampleMs,
      coalescedSamples,
      patchCalls,
      nodesDrawn,
      damage,
    };

    this.framesRendered += 1;
    this.gestureFramesRendered += 1;
    if (stats.frameDurationMs > SLOW_FRAME_BUDGET_MS) {
      this.slowFrames += 1;
    }
    this.lastFrame = stats;
    this.onFramePainted?.(stats);
  }

  private pushTransform(layerId: string, transform: Matrix2D): boolean {
    this.patchCalls += 1;
    return this.surface.setNodeTransform(
      layerId,
      transform.a,
      transform.b,
      transform.c,
      transform.d,
      transform.e,
      transform.f,
    );
  }

  /**
   * Hand a document-space offset to the engine.
   *
   * Falls back to nothing rather than to a matrix guess when the surface does
   * not implement it: an offset applied without the ancestor chain would drag a
   * grouped node the wrong distance, which is worse than not drawing the preview.
   */
  private pushTranslation(layerId: string, dx: number, dy: number): boolean {
    this.patchCalls += 1;
    return this.surface.setNodeDocumentTranslation?.(layerId, dx, dy) ?? false;
  }

  private finishGesture(): void {
    this.gestureActive = false;
    this.baseTransforms = new Map();
    this.transientTranslations.clear();
    this.dirtyLayerIds.clear();
    this.samplesSinceFrame = 0;
    if (this.frameHandle !== null) {
      this.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
  }
}

function sameMatrix(first: Matrix2D, second: Matrix2D, epsilon = 1e-9): boolean {
  return (
    Math.abs(first.a - second.a) <= epsilon
    && Math.abs(first.b - second.b) <= epsilon
    && Math.abs(first.c - second.c) <= epsilon
    && Math.abs(first.d - second.d) <= epsilon
    && Math.abs(first.e - second.e) <= epsilon
    && Math.abs(first.f - second.f) <= epsilon
  );
}
