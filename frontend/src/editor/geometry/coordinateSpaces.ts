/**
 * coordinateSpaces — the ONE coordinate-space model for the editor.
 *
 * Every geometry bug this system has had came from the same thing: a rect or a
 * point whose coordinate space was carried in a comment instead of in its type.
 * "this rect is already in screen coordinates" was true until a caller changed,
 * and then it silently was not. So spaces are branded here. Mixing them is a
 * compile error rather than a visual defect.
 *
 * ## The spaces, innermost to outermost
 *
 * | Space | Unit | Origin | Set by |
 * |---|---|---|---|
 * | `local` | node units | the node's own origin | the node's geometry |
 * | `parent` | parent units | the parent group's origin | the parent's children |
 * | `world` | artboard units (SVG viewBox) | artboard top-left | `CreativeDocument` |
 * | `viewport` | CSS px | the canvas host's top-left | pan + zoom |
 * | `client` | CSS px | the browser viewport's top-left | page layout |
 * | `device` | physical px | same as client | `devicePixelRatio` |
 *
 * ## The conversions, and there is exactly one of each
 *
 * ```
 * local  --[ node.worldTransform ]-->  world      (includes the FULL parent chain)
 * world  --[ x zoom, + view origin ]-->  viewport
 * viewport --[ + host origin ]-->  client
 * client --[ x devicePixelRatio ]-->  device
 * ```
 *
 * Each has a documented inverse. Nothing else in the editor may invent another
 * screen-to-document conversion — that is what produced four incompatible ones.
 *
 * ## Why `world -> viewport` is an affine scale and not a matrix read from the DOM
 *
 * The canvas host holds `.svg-canvas-wrapper` with
 * `transform: translate(panX, panY) scale(zoom)` and `transformOrigin: 0 0`, and
 * the SVG inside it renders at natural size with a 1:1 `viewBox`. That last fact
 * is asserted in a browser test rather than assumed, because if a `viewBox` scale
 * were ever introduced this conversion would need that factor too. So the mapping
 * is exactly a uniform scale plus a translation, and the only DOM read needed is
 * the wrapper's own origin — a per-frame FRAME measurement, not a per-object
 * geometry measurement. That distinction is the whole point: measuring the frame
 * once is fine; measuring every object's box is what diverged from the renderer.
 *
 * One responsibility per file: coordinate spaces and the conversions between them.
 */

import {
  invert,
  transformPoint,
  type Matrix2D,
  type Point2D,
} from "../renderer/matrix2d";

/** A point tagged with the space it lives in. */
export interface LocalPoint {
  readonly x: number;
  readonly y: number;
  readonly space: "local";
}
export interface ParentPoint {
  readonly x: number;
  readonly y: number;
  readonly space: "parent";
}
export interface WorldPoint {
  readonly x: number;
  readonly y: number;
  readonly space: "world";
}
export interface ViewportPoint {
  readonly x: number;
  readonly y: number;
  readonly space: "viewport";
}
export interface ClientPoint {
  readonly x: number;
  readonly y: number;
  readonly space: "client";
}
export interface DevicePoint {
  readonly x: number;
  readonly y: number;
  readonly space: "device";
}

export type SpacedPoint =
  | LocalPoint
  | ParentPoint
  | WorldPoint
  | ViewportPoint
  | ClientPoint
  | DevicePoint;

export const localPoint = (x: number, y: number): LocalPoint => ({ x, y, space: "local" });
export const parentPoint = (x: number, y: number): ParentPoint => ({ x, y, space: "parent" });
export const worldPoint = (x: number, y: number): WorldPoint => ({ x, y, space: "world" });
export const viewportPoint = (x: number, y: number): ViewportPoint => ({
  x,
  y,
  space: "viewport",
});
export const clientPoint = (x: number, y: number): ClientPoint => ({ x, y, space: "client" });
export const devicePoint = (x: number, y: number): DevicePoint => ({ x, y, space: "device" });

/** Drop the brand for the untagged matrix primitives. */
export const untag = (point: SpacedPoint): Point2D => ({ x: point.x, y: point.y });

/**
 * How world space maps onto the screen for one rendered frame.
 *
 * `originClient` is the client position of world (0, 0) — i.e. the artboard's
 * top-left corner as it currently sits on screen, which already accounts for pan,
 * scroll and page layout. Keeping pan folded into the origin rather than as a
 * separate term removes an entire class of "was pan applied twice?" bug.
 */
export interface CanvasView {
  /** World units per CSS pixel. Must be finite and non-zero. */
  readonly zoom: number;
  /** Client-space position of world (0, 0). */
  readonly originClient: ClientPoint;
  /** Client-space position of the canvas host's top-left, for viewport space. */
  readonly hostClient: ClientPoint;
  readonly devicePixelRatio: number;
}

/** A rect that knows its space. Axis-aligned in THAT space. */
export interface SpacedRect<S extends SpacedPoint["space"]> {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly space: S;
}

export type WorldRect = SpacedRect<"world">;
export type ViewportRect = SpacedRect<"viewport">;
export type ClientRect_ = SpacedRect<"client">;

export const worldRect = (
  x: number,
  y: number,
  width: number,
  height: number,
): WorldRect => ({ x, y, width, height, space: "world" });

/**
 * Build a view from the two rects the DOM can tell us about.
 *
 * `wrapperRect` is the scaled artboard element, so its top-left IS world (0, 0)
 * on screen. `hostRect` is the positioning context the overlay renders into.
 * Returns null when the numbers are unusable, so callers report rather than
 * silently rendering a selection somewhere arbitrary.
 */
export function canvasViewFrom(
  hostRect: { left: number; top: number },
  wrapperRect: { left: number; top: number },
  zoom: number,
  devicePixelRatio = 1,
): CanvasView | null {
  if (!Number.isFinite(zoom) || zoom === 0) {
    return null;
  }
  if (
    ![hostRect.left, hostRect.top, wrapperRect.left, wrapperRect.top].every(Number.isFinite)
  ) {
    return null;
  }
  return {
    zoom,
    originClient: clientPoint(wrapperRect.left, wrapperRect.top),
    hostClient: clientPoint(hostRect.left, hostRect.top),
    devicePixelRatio: Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? devicePixelRatio
      : 1,
  };
}

// --------------------------------------------------------------------------- //
// local <-> world. The node's world transform already includes every ancestor.
// --------------------------------------------------------------------------- //

/**
 * `worldTransform` comes from `RenderScene`, which is the same matrix the SVG and
 * Skia backends render with. That shared source is what guarantees the selection
 * UI and the painted pixels cannot disagree.
 */
export function localToWorld(worldTransform: Matrix2D, point: LocalPoint): WorldPoint {
  const mapped = transformPoint(worldTransform, untag(point));
  return worldPoint(mapped.x, mapped.y);
}

/** Null when the transform is singular — a collapsed node, reported not guessed. */
export function worldToLocal(worldTransform: Matrix2D, point: WorldPoint): LocalPoint | null {
  const inverse = invert(worldTransform);
  if (inverse === null) {
    return null;
  }
  const mapped = transformPoint(inverse, untag(point));
  return localPoint(mapped.x, mapped.y);
}

/** Map a point from a parent's space into world, given the parent's world matrix. */
export function parentToWorld(parentWorldTransform: Matrix2D, point: ParentPoint): WorldPoint {
  const mapped = transformPoint(parentWorldTransform, untag(point));
  return worldPoint(mapped.x, mapped.y);
}

// --------------------------------------------------------------------------- //
// world <-> viewport <-> client <-> device
// --------------------------------------------------------------------------- //

export function worldToClient(view: CanvasView, point: WorldPoint): ClientPoint {
  return clientPoint(
    view.originClient.x + point.x * view.zoom,
    view.originClient.y + point.y * view.zoom,
  );
}

export function clientToWorld(view: CanvasView, point: ClientPoint): WorldPoint {
  return worldPoint(
    (point.x - view.originClient.x) / view.zoom,
    (point.y - view.originClient.y) / view.zoom,
  );
}

export function clientToViewport(view: CanvasView, point: ClientPoint): ViewportPoint {
  return viewportPoint(point.x - view.hostClient.x, point.y - view.hostClient.y);
}

export function viewportToClient(view: CanvasView, point: ViewportPoint): ClientPoint {
  return clientPoint(point.x + view.hostClient.x, point.y + view.hostClient.y);
}

/** The composition the selection overlay needs: world straight to overlay space. */
export function worldToViewport(view: CanvasView, point: WorldPoint): ViewportPoint {
  return clientToViewport(view, worldToClient(view, point));
}

/** Inverse of `worldToViewport`, for pointer input arriving in overlay space. */
export function viewportToWorld(view: CanvasView, point: ViewportPoint): WorldPoint {
  return clientToWorld(view, viewportToClient(view, point));
}

export function clientToDevice(view: CanvasView, point: ClientPoint): DevicePoint {
  return devicePoint(point.x * view.devicePixelRatio, point.y * view.devicePixelRatio);
}

export function deviceToClient(view: CanvasView, point: DevicePoint): ClientPoint {
  return clientPoint(point.x / view.devicePixelRatio, point.y / view.devicePixelRatio);
}

/**
 * A length, not a position: scaled but never translated.
 *
 * Separate from the point conversions because applying an origin offset to a
 * distance is one of the easiest mistakes to make and one of the hardest to see.
 */
export function worldLengthToViewport(view: CanvasView, length: number): number {
  return length * view.zoom;
}

export function viewportLengthToWorld(view: CanvasView, length: number): number {
  return length / view.zoom;
}

/** Map an axis-aligned world rect's corner into viewport space. */
export function worldRectToViewport(view: CanvasView, rect: WorldRect): ViewportRect {
  const topLeft = worldToViewport(view, worldPoint(rect.x, rect.y));
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: worldLengthToViewport(view, rect.width),
    height: worldLengthToViewport(view, rect.height),
    space: "viewport",
  };
}
