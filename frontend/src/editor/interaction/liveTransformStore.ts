/**
 * liveTransformStore — the retained state of the gesture currently in flight.
 *
 * This is the piece that makes a canvas feel attached to the cursor, and it is a
 * behavioural property rather than a library: an immediate-mode editor holds the
 * dragged object's current transform in memory, mutates it on each pointer sample,
 * and repaints once per animation frame. Nothing touches the document, and nothing
 * touches the DOM at pointer rate.
 *
 * Our previous drag did the opposite: each `pointermove` wrote an SVG `transform`
 * attribute synchronously, so a 1000Hz mouse could force sixteen style/layout
 * passes inside a single 60fps frame, and every consumer that wanted to follow the
 * gesture had to measure the DOM to find out where the object now was.
 *
 * The three properties this file provides:
 *
 *  1. **Retained state.** One `LiveTransform` describes the whole gesture. Pointer
 *     handlers overwrite it; they compute nothing else and render nothing.
 *  2. **rAF-coalesced delivery.** Subscribers are notified at most once per frame,
 *     whatever the pointer rate. Sixty samples in a frame cost one notification.
 *  3. **A DOM-free hot path.** Subscribers decide how to paint. The Skia renderer
 *     pushes six doubles into the engine; the SVG renderer writes one attribute per
 *     FRAME instead of one per sample. Neither reads layout back.
 *
 * `end()` notifies SYNCHRONOUSLY, on purpose. The commit that follows hands the
 * offset to the document, so a preview still applied on the next frame would be
 * added to the committed position and the object would visibly jump by twice the
 * drag before settling.
 *
 * Not a module-level singleton: created by the component that owns both ends, so
 * two editors on one page cannot cross-talk and there is no hidden global state.
 *
 * One responsibility per file: holding and publishing the in-flight gesture.
 */

import type { Matrix2D, RectF } from "../renderer/matrix2d";

/** Which gesture is running. All three preview through one local transform. */
export type LiveGestureKind = "move" | "resize" | "rotate";

/**
 * Everything a renderer needs to draw the gesture's current state.
 *
 * `localTransform` is the node's own transform for THIS frame — the single value
 * every gesture reduces to. A move contributes `P⁻¹·T·P`, a rotate contributes
 * `rotate(a cx cy)` about a parent-space pivot, and a resize contributes the affine
 * that maps its old local bounds onto its new ones. Because all three are the same
 * kind of value, the engine needs exactly one entry point (`setNodeTransform`) and
 * the renderer needs no per-gesture branching.
 */
export interface LiveTransform {
  readonly layerId: string;
  readonly kind: LiveGestureKind;
  /** The node's local transform this frame, ancestors NOT included. */
  readonly localTransform: Matrix2D;
  /**
   * World-space displacement so far. Zero for a pure resize or rotate.
   *
   * Kept alongside the matrix because the measurement badge and the snapping
   * guides are expressed as a displacement, and re-deriving it from the matrix
   * would be a second representation that could disagree.
   */
  readonly worldDelta: { readonly dx: number; readonly dy: number };
  /** New local bounds while resizing, so the selection box can size itself. */
  readonly localBounds: RectF | null;
  /**
   * The object's world corners this frame, in draw order, or null.
   *
   * Present so selection chrome can draw the gesture WITHOUT re-deriving geometry
   * from the matrix. That matters beyond convenience: a resize or a rotate cannot be
   * drawn from `worldDelta` at all, so the alternative was a second implementation of
   * `worldTransform × localCorner` in the chrome — the exact duplication that made
   * the old selection box drift from its shape.
   *
   * Null when the frame is degenerate. Chrome then draws nothing, which is correct;
   * drawing a guessed box is what the DOM overlay used to do.
   */
  readonly corners: readonly { readonly x: number; readonly y: number }[] | null;
}

export type LiveTransformListener = (state: LiveTransform | null) => void;

export interface LiveTransformStore {
  /** Start or replace the in-flight gesture. Schedules a frame. */
  set(state: LiveTransform): void;
  /** Finish the gesture and notify immediately. Safe to call when idle. */
  end(): void;
  /** The current state without waiting for a frame. Null when idle. */
  peek(): LiveTransform | null;
  /** Returns an unsubscribe function. */
  subscribe(listener: LiveTransformListener): () => void;
  /** Deliver a pending frame now. For tests and for synchronous readers. */
  flush(): void;
  /** Live listener count, so a test can assert the wiring exists. */
  listenerCount(): number;
}

/** Injectable so tests can step frames deterministically. */
export interface FrameScheduler {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

const defaultScheduler: FrameScheduler = {
  request: (callback) =>
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(() => callback())
      : (setTimeout(callback, 16) as unknown as number),
  cancel: (handle) => {
    if (typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(handle);
    } else {
      clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
    }
  },
};

export function createLiveTransformStore(
  scheduler: FrameScheduler = defaultScheduler,
  onListenerError: (error: unknown) => void = () => {},
): LiveTransformStore {
  const listeners = new Set<LiveTransformListener>();
  let current: LiveTransform | null = null;
  /**
   * Whether a frame is outstanding, tracked SEPARATELY from its handle.
   *
   * A scheduler may invoke its callback synchronously — a test's inline scheduler
   * does, and so does the `setTimeout` fallback under fake timers. Using the handle
   * alone as the "pending" flag broke that case: the callback ran and cleared the
   * handle, then `request` returned and re-assigned it, so the store believed a
   * frame was still outstanding and silently dropped every later sample. Only the
   * first pointer move of a gesture was ever delivered.
   */
  let frameRequested = false;
  let frameHandle: number | null = null;

  const notify = (state: LiveTransform | null): void => {
    // Iterate a copy so a listener unsubscribing during dispatch cannot skip
    // another, and isolate throwers: one failing renderer must not strand the
    // gesture half-applied in another.
    for (const listener of [...listeners]) {
      try {
        listener(state);
      } catch (error) {
        onListenerError(error);
      }
    }
  };

  const cancelPending = (): void => {
    if (frameHandle !== null) {
      scheduler.cancel(frameHandle);
    }
    frameHandle = null;
    frameRequested = false;
  };

  const scheduleFrame = (): void => {
    if (frameRequested) {
      // Already scheduled: this is the coalescing. Extra samples in the same frame
      // cost a field assignment and nothing else.
      return;
    }
    frameRequested = true;
    frameHandle = scheduler.request(() => {
      frameRequested = false;
      frameHandle = null;
      notify(current);
    });
  };

  return {
    set(state: LiveTransform): void {
      current = state;
      scheduleFrame();
    },
    end(): void {
      cancelPending();
      if (current === null) {
        return;
      }
      current = null;
      // Synchronous: see the file header. A deferred clear would leave one frame
      // where the preview and the committed document are both applied.
      notify(null);
    },
    peek(): LiveTransform | null {
      return current;
    },
    subscribe(listener: LiveTransformListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    flush(): void {
      if (!frameRequested) {
        return;
      }
      cancelPending();
      notify(current);
    },
    listenerCount(): number {
      return listeners.size;
    },
  };
}
