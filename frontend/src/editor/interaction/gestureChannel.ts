/**
 * gestureChannel — the seam that lets a live pointer gesture reach a renderer
 * that is not in the gesture's component subtree.
 *
 * The move gesture is owned by `useCanvasDrag`, which is mounted inside
 * `SVGCanvas`. The Skia overlay is a sibling of `SVGCanvas`, one level up in
 * `EditorCanvas`. Rather than hoist the drag's per-frame state into React — which
 * would re-render the whole canvas on every `pointermove`, the exact cost the
 * engine exists to avoid — the drag emits events onto a channel that the overlay
 * subscribes to.
 *
 * Deliberately NOT a module-level singleton: the channel is created with
 * `useRef` by the component that owns both ends, so there is no hidden global
 * state and two editors on one page cannot cross-talk.
 *
 * Offsets are always in DOCUMENT pixels, never screen pixels. Screen offsets
 * would be wrong at any zoom other than 1, and a coordinate-space mistake here
 * produces a drag that visibly disagrees with the pointer.
 *
 * One responsibility per file: transporting drag gesture events.
 */

/** A phase of a single drag gesture. */
export type DragGesturePhase =
  /** The gesture has started; the layer has not moved yet. */
  | "begin"
  /** A new offset is available. Emitted at pointer rate, not frame rate. */
  | "move"
  /** The gesture committed. The document now owns the final offset. */
  | "end"
  /** The gesture was abandoned. The layer must return to where it started. */
  | "cancel";

export interface DragGestureEvent {
  readonly phase: DragGesturePhase;
  readonly layerId: string;
  /** Offset from the gesture's start, in document pixels. Zero unless moving. */
  readonly dx: number;
  readonly dy: number;
}

export type DragGestureListener = (event: DragGestureEvent) => void;

export interface GestureChannel {
  emit(event: DragGestureEvent): void;
  /** Returns an unsubscribe function. */
  subscribe(listener: DragGestureListener): () => void;
  /** Live listener count, so a test can assert the wiring exists. */
  listenerCount(): number;
}

/**
 * Create an independent channel.
 *
 * A listener that throws is isolated: the remaining listeners still receive the
 * event, because one failing renderer must not strand a drag half-applied in
 * another.
 */
export function createGestureChannel(
  onListenerError: (error: unknown) => void = () => {},
): GestureChannel {
  const listeners = new Set<DragGestureListener>();

  return {
    emit(event: DragGestureEvent): void {
      // Iterate a copy so a listener unsubscribing during dispatch cannot skip
      // another listener.
      for (const listener of [...listeners]) {
        try {
          listener(event);
        } catch (error) {
          onListenerError(error);
        }
      }
    },
    subscribe(listener: DragGestureListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    listenerCount(): number {
      return listeners.size;
    },
  };
}
