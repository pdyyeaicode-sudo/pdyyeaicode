/**
 * shapeCreateBridge — the seam between a pointer handler and the engine's shape builder.
 *
 * A creation gesture is a stream of pointer samples in, and an outline out. Everything
 * between those two is geometry, and geometry lives in C++:
 *
 *   pointerdown  -> begin(shapeType, documentPoint)
 *   pointermove  -> update(documentPoint, modifiers) -> { d, bounds }
 *   pointerup    -> commit() -> { d, bounds }   the SAME d that was painted
 *   escape       -> cancel()                    no document change ever happened
 *
 * The engine holds the outline as an ephemeral node inside the scene it is about to
 * render, so a frame costs one short string plus a damage mark. Nothing is re-uploaded
 * and no scene is rebuilt. That is the whole reason this is a narrow command channel
 * rather than "TypeScript builds a path and hands it over": the only way to get new
 * geometry across the boundary is `loadScene`, which replaces the scene, drops the node
 * index, cancels any transform gesture and forces a full repaint. Sixty of those a
 * second is exactly what the damage-tracking work removed.
 *
 * Two things deliberately stay on this side.
 *
 *   Client -> document conversion, because it needs the canvas's live rect, which is a
 *   fact about the frame rather than about the shape. It needs no knowledge of zoom or
 *   pan: the canvas is drawn at the artboard's native size and CSS-scaled by the stage,
 *   so the ratio of its backing store to its displayed rect IS the effective scale.
 *
 *   Snapping, because the guides come from the other objects in the document. The
 *   SNAPPED point is what gets passed in, so the outline shown is the placement that
 *   will be committed rather than the raw pointer position.
 *
 * There is no TypeScript fallback. Unlike a transform gesture — where `gestureSolve.ts`
 * exists because the SVG renderer must keep working and `engine-parity.mts` pins the two
 * together — a live preview has nowhere to draw without the engine. When the engine is
 * absent the caller falls back to the existing SVG preview overlay, which is a different
 * feature rather than a second implementation of this one.
 *
 * One responsibility per file: routing a creation gesture to the engine.
 */

import type { EngineShapePreview, PydeeSurfaceHandle } from "../renderer/engineLoader";
import type { RectF } from "../renderer/matrix2d";

/** Keyboard state that changes what a creation drag means. */
export interface ShapeCreateModifiers {
  /** Square the box off its larger extent. Shift. */
  readonly preserveAspect: boolean;
  /** Grow symmetrically about the press point. Alt. */
  readonly fromCenter: boolean;
}

/** Ratios the builder shapes an outline with. Never absolute lengths. */
export interface ShapeCreateParameters {
  readonly pointCount: number;
  readonly innerRatio: number;
  readonly cornerRatio: number;
  readonly thicknessRatio: number;
  readonly holeRatio: number;
  readonly headRatio: number;
}

/** The editor's defaults, matching `ShapeParameters` in shape_geometry.h. */
export const DEFAULT_SHAPE_PARAMETERS: ShapeCreateParameters = {
  pointCount: 5,
  innerRatio: 0.382,
  cornerRatio: 0.2,
  thicknessRatio: 0.33,
  holeRatio: 0.5,
  headRatio: 0.3,
};

/** Paint for the outline while it is being dragged. */
export interface ShapeCreateAppearance {
  /** 0xAARRGGBB, matching SkColor's layout. */
  readonly fillArgb: number;
  readonly strokeArgb: number;
  readonly strokeWidth: number;
}

/** One built outline. Document coordinates, bounds measured from the outline. */
export interface ShapeOutline {
  readonly kind: string;
  readonly d: string;
  readonly bounds: RectF;
}

export interface ShapeCreateBridge {
  /** Document coordinates for a client point, or null when the surface is gone. */
  clientToDocument(clientX: number, clientY: number): { x: number; y: number } | null;
  /** Start a gesture. Null means the engine refused it; the caller must not proceed. */
  begin(
    shapeType: string,
    documentX: number,
    documentY: number,
    appearance: ShapeCreateAppearance,
  ): boolean;
  /**
   * One frame. Null means this sample produced no outline — which is the NORMAL state
   * at the start of every drag, before the box has any extent — not an error.
   */
  update(
    documentX: number,
    documentY: number,
    modifiers: ShapeCreateModifiers,
  ): ShapeOutline | null;
  /** The current outline without advancing the gesture. */
  preview(): ShapeOutline | null;
  /** Finish. Null means there was nothing to commit, so the caller creates nothing. */
  commit(): ShapeOutline | null;
  /** Abandon. Returns whether a gesture was running. */
  cancel(): boolean;
  isActive(): boolean;
  /** Change the outline's ratios. Applies immediately during a gesture. */
  setParameters(parameters: ShapeCreateParameters): boolean;
  /** Build an outline with no gesture, for a click-to-insert at a default size. */
  build(shapeType: string, bounds: RectF): ShapeOutline | null;
}

/** Everything the bridge needs, read at call time so nothing goes stale. */
export interface ShapeCreateSources {
  surface: () => PydeeSurfaceHandle | null;
  canvas: () => HTMLCanvasElement | null;
  /** Schedule a repaint. The engine has already mutated its scene by then. */
  requestPaint: () => void;
}

function toOutline(result: EngineShapePreview | { ok: false; reason: string }): ShapeOutline | null {
  if (result.ok !== true) {
    return null;
  }
  // `kind` is absent from `beginShapeCreate`'s success value, which reports only that
  // the gesture started. Guarded rather than asserted so a shape-less begin cannot be
  // mistaken for an outline.
  if (typeof (result as { d?: unknown }).d !== "string") {
    return null;
  }
  const preview = result as Extract<EngineShapePreview, { ok: true }>;
  return { kind: preview.kind, d: preview.d, bounds: { ...preview.bounds } };
}

export function createEngineShapeCreateBridge(sources: ShapeCreateSources): ShapeCreateBridge {
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

    begin(shapeType, documentX, documentY, appearance) {
      const surface = sources.surface();
      if (surface === null) {
        return false;
      }
      const started = surface.beginShapeCreate(
        shapeType,
        documentX,
        documentY,
        appearance.fillArgb,
        appearance.strokeArgb,
        appearance.strokeWidth,
      );
      if (started.ok !== true) {
        // Reported, not retried with a substitute kind: drawing a rectangle because a
        // star was unavailable would commit geometry the user did not ask for.
        console.warn(
          `[editor] the engine refused to start a "${shapeType}" creation gesture: `
            + `${(started as { reason: string }).reason}.`,
        );
        return false;
      }
      return true;
    },

    update(documentX, documentY, modifiers) {
      const surface = sources.surface();
      if (surface === null) {
        return null;
      }
      const frame = surface.updateShapeCreate(
        documentX,
        documentY,
        modifiers.preserveAspect,
        modifiers.fromCenter,
      );
      // Painted even when the outline is absent: a drag that shrinks back to nothing
      // has to erase the previous outline, and the engine has already removed the node.
      sources.requestPaint();
      return toOutline(frame);
    },

    preview() {
      const surface = sources.surface();
      return surface === null ? null : toOutline(surface.getShapePreview());
    },

    commit() {
      const surface = sources.surface();
      if (surface === null) {
        return null;
      }
      const committed = toOutline(surface.commitShapeCreate());
      // The ephemeral node is gone now, so the surface must be repainted whether or not
      // anything was committed — otherwise the preview's last frame stays on screen
      // until something else happens to damage that region.
      sources.requestPaint();
      return committed;
    },

    cancel() {
      const surface = sources.surface();
      if (surface === null) {
        return false;
      }
      const wasActive = surface.cancelShapeCreate();
      sources.requestPaint();
      return wasActive;
    },

    isActive() {
      return sources.surface()?.hasShapeCreateGesture() ?? false;
    },

    setParameters(parameters) {
      const surface = sources.surface();
      if (surface === null) {
        return false;
      }
      const applied = surface.setShapeCreateParameters(
        parameters.pointCount,
        parameters.innerRatio,
        parameters.cornerRatio,
        parameters.thicknessRatio,
        parameters.holeRatio,
        parameters.headRatio,
      );
      if (applied) {
        sources.requestPaint();
      }
      return applied;
    },

    build(shapeType, bounds) {
      const surface = sources.surface();
      if (surface === null) {
        return null;
      }
      return toOutline(
        surface.buildShapePath(shapeType, bounds.x, bounds.y, bounds.width, bounds.height),
      );
    },
  };
}
