/**
 * shapeCreateSession — the creation gesture's state machine, with no React in it.
 *
 *   Idle
 *     -> pointerdown            Arming        (below the drag threshold)
 *     -> pointermove past it    Previewing    (the engine holds an outline)
 *     -> pointermove            Previewing    (outline rebuilt, once per frame)
 *     -> pointerup              Idle          + exactly one commit
 *     -> escape / cancel        Idle          + no commit, no document change
 *
 * Why a state machine rather than a few booleans in a component: the guarantees the
 * gesture has to make are statements about SEQUENCE, and a sequence is only checkable
 * if it is represented. Specifically —
 *
 *   * zero document changes while dragging, and exactly one on release, so the drag
 *     produces one undo entry rather than one per pointer sample;
 *   * a cancel leaves the document byte-identical, because there is nothing to revert;
 *   * a release below the drag threshold is a CLICK, not a zero-size shape.
 *
 * Pointer samples are not averaged, interpolated or eased. The newest sample for the
 * frame is the one the outline is built from — `newestPointerSample` is what picks it —
 * because a preview that lags the pointer is worse than one that jitters: the user is
 * pointing AT something.
 *
 * Coordinates stay floating point end to end. Nothing is rounded, quantised or snapped
 * here; the caller applies snapping to the document point BEFORE handing it over, so
 * the outline shown is the placement that will be committed.
 *
 * One responsibility per file: sequencing a shape-creation gesture.
 */

import type {
  ShapeCreateAppearance,
  ShapeCreateBridge,
  ShapeCreateModifiers,
  ShapeOutline,
} from "./shapeCreateBridge";

/**
 * Screen pixels of travel before a press becomes a creation drag.
 *
 * The same 1px used by the transform gestures. Below it, a press-and-release is a click
 * on the canvas — which is how a user cancels a shape tool by tapping — and a shape with
 * a sub-pixel box is not something anyone asked for.
 */
export const CREATE_DRAG_THRESHOLD_PX = 1;

export type ShapeCreatePhase = "idle" | "arming" | "previewing";

export interface ShapeCreateSnapshot {
  readonly phase: ShapeCreatePhase;
  readonly shapeType: string | null;
  /** The outline currently on screen, or null when there is none. */
  readonly outline: ShapeOutline | null;
}

/** A document point, already snapped if snapping is active. */
export interface DocumentPoint {
  readonly x: number;
  readonly y: number;
}

export interface ShapeCreateSessionOptions {
  readonly bridge: ShapeCreateBridge;
  /**
   * Converts a client point to a document point, applying snapping.
   *
   * Injected rather than called through the bridge so the session has no opinion about
   * where snapping comes from, and so a test can drive it in document coordinates with
   * no canvas at all.
   */
  readonly toDocument: (clientX: number, clientY: number) => DocumentPoint | null;
  /**
   * Called exactly once per successful gesture, with the outline to turn into a layer.
   *
   * The outline's `d` is the string the engine painted, so the committed object is the
   * previewed one rather than a second generation of it.
   */
  readonly onCommit: (outline: ShapeOutline, shapeType: string) => void;
  /** Called when a press and release produced no drag, so the caller can treat it as a click. */
  readonly onClick?: (point: DocumentPoint) => void;
  /** Called on every phase change, for cursor and toolbar state. Never per frame. */
  readonly onPhaseChange?: (snapshot: ShapeCreateSnapshot) => void;
}

export interface ShapeCreateSession {
  /** Begin arming a gesture. Returns false when the press is not ours to handle. */
  pointerDown(
    shapeType: string,
    clientX: number,
    clientY: number,
    appearance: ShapeCreateAppearance,
  ): boolean;
  /** One sample. Safe to call at any rate; it does nothing while idle. */
  pointerMove(clientX: number, clientY: number, modifiers: ShapeCreateModifiers): void;
  /** Finish. Commits at most once, then returns to idle. */
  pointerUp(clientX: number, clientY: number, modifiers: ShapeCreateModifiers): void;
  /** Abandon with no document change. Idempotent. */
  cancel(): void;
  snapshot(): ShapeCreateSnapshot;
}

interface ArmedState {
  readonly shapeType: string;
  readonly appearance: ShapeCreateAppearance;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startDocument: DocumentPoint;
}

export function createShapeCreateSession(
  options: ShapeCreateSessionOptions,
): ShapeCreateSession {
  let phase: ShapeCreatePhase = "idle";
  let armed: ArmedState | null = null;
  let outline: ShapeOutline | null = null;

  const publish = (): void => {
    options.onPhaseChange?.({
      phase,
      shapeType: armed?.shapeType ?? null,
      outline,
    });
  };

  const reset = (): void => {
    phase = "idle";
    armed = null;
    outline = null;
  };

  return {
    pointerDown(shapeType, clientX, clientY, appearance) {
      // A second press while one gesture is running abandons the first rather than
      // leaving an orphan outline in the engine's scene.
      if (phase !== "idle") {
        options.bridge.cancel();
        reset();
      }
      const startDocument = options.toDocument(clientX, clientY);
      if (startDocument === null) {
        return false;
      }
      armed = {
        shapeType,
        appearance,
        startClientX: clientX,
        startClientY: clientY,
        startDocument,
      };
      phase = "arming";
      outline = null;
      publish();
      return true;
    },

    pointerMove(clientX, clientY, modifiers) {
      if (armed === null || phase === "idle") {
        return;
      }
      if (phase === "arming") {
        const travelled = Math.hypot(
          clientX - armed.startClientX,
          clientY - armed.startClientY,
        );
        if (travelled < CREATE_DRAG_THRESHOLD_PX) {
          return;
        }
        /*
          The engine gesture starts HERE, not at pointerdown.

          Starting it on the press would put an ephemeral node in the scene for every
          click on the canvas, including the ones that turn out to be selections. The
          threshold decides which a press was, so it also decides when the gesture
          exists. The START point is the press position, not this sample's, so no travel
          is lost to the threshold.
        */
        if (
          !options.bridge.begin(
            armed.shapeType,
            armed.startDocument.x,
            armed.startDocument.y,
            armed.appearance,
          )
        ) {
          reset();
          publish();
          return;
        }
        phase = "previewing";
        publish();
      }

      const point = options.toDocument(clientX, clientY);
      if (point === null) {
        return;
      }
      // Null is the normal answer for a box with no extent yet; it means "no outline",
      // not "error". Recorded either way so the snapshot reflects what is on screen.
      outline = options.bridge.update(point.x, point.y, modifiers);
    },

    pointerUp(clientX, clientY, modifiers) {
      if (armed === null || phase === "idle") {
        return;
      }
      const startDocument = armed.startDocument;
      const shapeType = armed.shapeType;

      if (phase === "arming") {
        // Never travelled: a click, not a shape. No gesture was ever begun, so there is
        // nothing to cancel and nothing to commit.
        reset();
        publish();
        options.onClick?.(startDocument);
        return;
      }

      // Apply the final sample before committing, so the shape lands where the pointer
      // was released rather than where the last animation frame happened to sample.
      const point = options.toDocument(clientX, clientY);
      if (point !== null) {
        outline = options.bridge.update(point.x, point.y, modifiers);
      }

      const committed = options.bridge.commit();
      reset();
      publish();
      if (committed !== null) {
        // Exactly one call, after the state machine is already idle, so a handler that
        // triggers a re-render cannot observe a half-finished gesture.
        options.onCommit(committed, shapeType);
      }
    },

    cancel() {
      if (phase === "idle" && armed === null) {
        return;
      }
      options.bridge.cancel();
      reset();
      publish();
    },

    snapshot() {
      return { phase, shapeType: armed?.shapeType ?? null, outline };
    },
  };
}
