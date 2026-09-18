/**
 * gestureBridge — the seam between a pointer handler and whoever solves the gesture.
 *
 * The interaction layer should not know whether the mathematics is running in C++ or
 * in TypeScript, and it certainly should not contain a copy of it. So a pointer
 * handler asks for three things — begin, update, end — and gets back the one value
 * every gesture reduces to: the dragged node's local transform for this frame.
 *
 * `createEngineGestureBridge` is the primary implementation: it forwards to
 * `beginTransformGesture`/`updateTransformGesture`/`endTransformGesture` in the WASM
 * engine, which holds the snapshot and writes the solved transform straight into the
 * scene it is about to render. Nothing crosses the boundary except a handful of
 * doubles, and no matrix algebra happens in JavaScript.
 *
 * When the engine is absent — an unbuilt checkout, or the canonical-SVG renderer,
 * which is also the export path — the caller falls back to
 * `geometry/gestureSolve.ts`. That is not a second design: `engine-parity.mts` runs
 * both over the same snapshots and fails the build if any number disagrees by more
 * than 1e-9.
 *
 * Client -> document conversion lives here too, because it needs the canvas's live
 * rect, which is a fact about the frame rather than about the object. It needs no
 * knowledge of zoom or pan: the canvas is drawn at the artboard's native size with
 * an identity view transform and CSS-scaled by the stage, so the ratio of its
 * backing store to its displayed rect IS the effective scale.
 *
 * One responsibility per file: routing a gesture to whoever solves it.
 */

import type { EngineGestureFrame, EngineGestureKind, PydeeSurfaceHandle } from "../renderer/engineLoader";
import { chromeSizesForZoom } from "../renderer/selectionChrome";
import type { Matrix2D, RectF } from "../renderer/matrix2d";

/** Keyboard state that changes what a drag means. */
export interface BridgeModifiers {
  readonly preserveAspect: boolean;
  readonly fromCenter: boolean;
  /** Rotation step in degrees. Zero means no snapping. */
  readonly angleSnapDegrees: number;
}

/**
 * One solved frame, in the vocabulary the interaction layer needs.
 *
 * `corners` are already in document space and in draw order, so selection chrome
 * draws from them directly. Null means the result was degenerate, which is the
 * signal to draw nothing — not to guess a box.
 */
export interface BridgeFrame {
  readonly localTransform: Matrix2D;
  readonly localBounds: RectF;
  readonly angleDegrees: number;
  readonly worldDelta: { readonly dx: number; readonly dy: number };
  readonly corners: readonly { readonly x: number; readonly y: number }[] | null;
}

/** What part of the selection chrome a point is on. */
export interface BridgeHandleHit {
  readonly region: "none" | "body" | "resize" | "rotate";
  readonly handle: string;
}

export interface GestureBridge {
  /** Document coordinates for a client point, or null when the surface is gone. */
  clientToDocument(clientX: number, clientY: number): { x: number; y: number } | null;
  /** Start a gesture. Null means the solver refused it; the caller must not proceed. */
  begin(
    layerId: string,
    kind: EngineGestureKind,
    handle: string,
    documentX: number,
    documentY: number,
  ): BridgeFrame | null;
  /** One frame. Null means this sample could not be solved; the last frame stands. */
  update(documentX: number, documentY: number, modifiers: BridgeModifiers): BridgeFrame | null;
  /** Final frame. The transform stays applied so nothing snaps back before the commit. */
  end(documentX: number, documentY: number, modifiers: BridgeModifiers): BridgeFrame | null;
  /** Abandon, restoring the transform the gesture started from. */
  cancel(): void;
  /** Which part of `layerId`'s chrome a client point is on, or null. */
  handleAt(layerId: string, clientX: number, clientY: number, zoom: number): BridgeHandleHit | null;
  /**
   * Where `layerId`'s chrome IS, in document coordinates.
   *
   * A thin passthrough of the engine's own oriented bounds plus the rotation
   * control's position — the same values `handleAt` compares against. Exposed because
   * asking "where is the nw handle" is a different question from "what is under this
   * point", and both have to be answered from one geometry: a cursor shape, a
   * keyboard-driven resize and a test that presses on a handle all need the position.
   */
  chromeGeometry(layerId: string, zoom: number): BridgeChromeGeometry | null;
  /** Client coordinates for a document point. The inverse of `clientToDocument`. */
  documentToClient(documentX: number, documentY: number): { x: number; y: number } | null;
}

/** Where a selection's chrome sits, in DOCUMENT coordinates. */
export interface BridgeChromeGeometry {
  readonly corners: readonly { readonly x: number; readonly y: number }[];
  readonly center: { readonly x: number; readonly y: number };
  readonly angle: number;
  readonly handles: Readonly<Record<string, { readonly x: number; readonly y: number }>>;
  readonly rotationControl: { readonly x: number; readonly y: number } | null;
  /**
   * The node's LOCAL bounds, which is a different fact from its corners.
   *
   * Two nodes can occupy the same corners with different local bounds — one with a
   * 105-wide box and no transform, another with an 80-wide box and a 1.3x scale. That
   * distinction is invisible on screen and decides what a resize commits, so it is
   * reported rather than left to be inferred.
   */
  readonly localBounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

/** Everything the bridge needs, read at call time so nothing goes stale. */
export interface EngineBridgeSources {
  surface: () => PydeeSurfaceHandle | null;
  canvas: () => HTMLCanvasElement | null;
  /** Schedule a repaint. The engine has already mutated the scene by then. */
  requestPaint: () => void;
  /** Mark a gesture as running, for the interaction diagnostics. */
  noteGestureStart?: () => void;
  noteGestureEnd?: () => void;
}

const REGIONS = new Set(["none", "body", "resize", "rotate"]);

function toBridgeFrame(frame: EngineGestureFrame): BridgeFrame {
  return {
    localTransform: { ...frame.localTransform },
    localBounds: { ...frame.localBounds },
    angleDegrees: frame.angle,
    worldDelta: { ...frame.worldDelta },
    corners: frame.corners === null ? null : frame.corners.map((point) => ({ ...point })),
  };
}

export function createEngineGestureBridge(sources: EngineBridgeSources): GestureBridge {
  const documentPoint = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const canvas = sources.canvas();
    if (canvas === null) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    const x = ((clientX - rect.left) * canvas.width) / rect.width;
    const y = ((clientY - rect.top) * canvas.height) / rect.height;
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  };

  return {
    clientToDocument: documentPoint,

    begin(layerId, kind, handle, documentX, documentY) {
      const surface = sources.surface();
      if (surface === null) {
        return null;
      }
      const started = surface.beginTransformGesture(layerId, kind, handle, documentX, documentY);
      if (started.ok !== true) {
        // Reported, not retried with a guess: a gesture that began without geometry
        // would commit an arbitrary transform when the pointer came up.
        console.warn(
          `[editor] the engine refused to start a ${kind} gesture on "${layerId}": `
            + `${started.reason}. Falling back to the TypeScript solver.`,
        );
        return null;
      }
      sources.noteGestureStart?.();
      return toBridgeFrame(started);
    },

    update(documentX, documentY, modifiers) {
      const surface = sources.surface();
      if (surface === null) {
        return null;
      }
      const frame = surface.updateTransformGesture(
        documentX,
        documentY,
        modifiers.preserveAspect,
        modifiers.fromCenter,
        modifiers.angleSnapDegrees,
      );
      if (frame.ok !== true) {
        return null;
      }
      // The engine already wrote the transform into the scene, so all that is left
      // is asking for a frame. No transform crosses the boundary to be applied.
      sources.requestPaint();
      return toBridgeFrame(frame);
    },

    end(documentX, documentY, modifiers) {
      const surface = sources.surface();
      if (surface === null) {
        return null;
      }
      const frame = surface.endTransformGesture(
        documentX,
        documentY,
        modifiers.preserveAspect,
        modifiers.fromCenter,
        modifiers.angleSnapDegrees,
      );
      sources.noteGestureEnd?.();
      sources.requestPaint();
      return frame.ok === true ? toBridgeFrame(frame) : null;
    },

    cancel() {
      const surface = sources.surface();
      if (surface === null) {
        return;
      }
      surface.cancelTransformGesture();
      sources.noteGestureEnd?.();
      sources.requestPaint();
    },

    handleAt(layerId, clientX, clientY, zoom) {
      const surface = sources.surface();
      const point = documentPoint(clientX, clientY);
      if (surface === null || point === null) {
        return null;
      }
      const sizes = chromeSizesForZoom(zoom);
      const hit = surface.hitTestSelectionHandle(
        layerId,
        point.x,
        point.y,
        sizes.handleSize,
        sizes.rotationOffset,
        sizes.rotationRadius,
        sizes.cornerRotationOffset,
        sizes.cornerRotationSize,
      );
      if (hit.ok !== true) {
        return null;
      }
      // The region name comes across as a string, so it is validated rather than
      // cast: an unexpected value would otherwise route the gesture as a move.
      return REGIONS.has(hit.region)
        ? { region: hit.region as BridgeHandleHit["region"], handle: hit.handle }
        : null;
    },

    chromeGeometry(layerId, zoom) {
      const surface = sources.surface();
      if (surface === null) {
        return null;
      }
      const bounds = surface.getOrientedBounds(layerId);
      if (bounds.ok !== true) {
        return null;
      }
      // The control's offset is a screen length, so it is divided by the zoom here
      // for the same reason the hit test divides it: positions are document
      // coordinates, sizes are not.
      const sizes = chromeSizesForZoom(zoom);
      const probe = surface.hitTestSelectionHandle(
        layerId,
        bounds.center.x,
        bounds.center.y,
        sizes.handleSize,
        sizes.rotationOffset,
        sizes.rotationRadius,
        sizes.cornerRotationOffset,
        sizes.cornerRotationSize,
      );
      return {
        corners: bounds.corners.map((point) => ({ ...point })),
        center: { ...bounds.center },
        angle: bounds.angle,
        handles: bounds.handles,
        localBounds: { ...bounds.localBounds },
        rotationControl: probe.ok === true && probe.rotationControl !== null
          ? { ...probe.rotationControl }
          : null,
      };
    },

    documentToClient(documentX, documentY) {
      const canvas = sources.canvas();
      if (canvas === null) {
        return null;
      }
      const rect = canvas.getBoundingClientRect();
      if (canvas.width <= 0 || canvas.height <= 0) {
        return null;
      }
      const x = rect.left + (documentX * rect.width) / canvas.width;
      const y = rect.top + (documentY * rect.height) / canvas.height;
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    },
  };
}
