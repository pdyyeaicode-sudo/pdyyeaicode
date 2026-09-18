/**
 * selectionChrome — the sizes of the selection box, handles and rotation control.
 *
 * These are in one place because two different things consume them and MUST agree:
 * `SelectionCanvas` draws the chrome at these sizes, and the handle hit test decides
 * what a pointer is on from the same numbers. When the chrome was DOM elements the
 * browser guaranteed that agreement — an element's hit area is where it is painted.
 * Drawing on a canvas removes that guarantee, so the agreement has to come from
 * sharing the constants instead. Two copies of "9px handle" is a target that is not
 * quite where the handle is.
 *
 * Everything here is in SCREEN pixels, so the chrome stays the same size at every
 * zoom. Converting to document units is a division by zoom, done at the point of
 * use, because it is a LENGTH — positions are never converted this way.
 *
 * One responsibility per file: the dimensions of selection chrome.
 */

/** Stroke width of the selection outline. */
export const OUTLINE_WIDTH_PX = 1.5;
/** Side of the eight square resize handles. */
export const HANDLE_SIZE_PX = 9;
/** Stroke width of a handle's border. */
export const HANDLE_BORDER_PX = 1.5;
/** Distance from the top edge's midpoint to the rotation control. */
export const ROTATION_OFFSET_PX = 26;
/** Drawn radius of the rotation control disc. */
export const ROTATION_RADIUS_PX = 5.5;

/**
 * Hit radius of the rotation control, deliberately larger than the drawn one.
 *
 * A 5.5px disc is a hard target for a mouse, and every editor makes its rotation
 * affordance bigger than it looks. Kept as a separate constant so the difference is
 * a decision rather than an accident, and so a change to the drawn size cannot
 * silently change the target.
 */
export const ROTATION_HIT_RADIUS_PX = 11;

/**
 * How far outside each corner the corner rotation zones sit, and how big they are.
 *
 * Offset OUTWARD rather than centred on the corner: a rotation zone on top of a
 * corner handle makes corner resize unreachable, which this editor shipped once.
 */
export const CORNER_ROTATION_OFFSET_PX = 20;
export const CORNER_ROTATION_SIZE_PX = 18;

/** Grabbable size of a handle, which is larger than the drawn square. */
export const HANDLE_HIT_SIZE_PX = 14;

/**
 * The chrome sizes in DOCUMENT units at a given zoom.
 *
 * A zoom of zero or a non-finite zoom would make every length infinite, so it is
 * clamped to 1 here rather than at each call site — the alternative is a hit test
 * that matches everywhere or nowhere.
 */
export function chromeSizesForZoom(zoom: number): {
  readonly handleSize: number;
  readonly rotationOffset: number;
  readonly rotationRadius: number;
  readonly cornerRotationOffset: number;
  readonly cornerRotationSize: number;
} {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return {
    handleSize: HANDLE_HIT_SIZE_PX / safeZoom,
    rotationOffset: ROTATION_OFFSET_PX / safeZoom,
    rotationRadius: ROTATION_HIT_RADIUS_PX / safeZoom,
    cornerRotationOffset: CORNER_ROTATION_OFFSET_PX / safeZoom,
    cornerRotationSize: CORNER_ROTATION_SIZE_PX / safeZoom,
  };
}
