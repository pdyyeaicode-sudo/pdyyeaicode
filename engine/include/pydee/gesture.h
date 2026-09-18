// gesture.h — turning pointer motion into a node transform.
//
// `selection.h` answers "where is this object". This file answers the next
// question: "given that the pointer started there and is now here, what should
// this node's transform be". They are separate responsibilities and separate
// files, because the first is a pure function of the scene while the second also
// depends on a gesture that is in flight.
//
// ## Why the whole gesture lives here rather than in TypeScript
//
// Every gesture reduces to ONE value — the node's local transform for this frame:
//
//     move    local' = P⁻¹ · T(Δ)          · P · L₀
//     rotate  local' = P⁻¹ · R(δ, pivot)   · P · L₀
//     resize  local' =        L₀ · B(from → to)
//
// where `P` is the parent's world transform and `L₀` the node's own transform when
// the gesture began. The first two need the ancestor chain, which only the engine
// has; the third needs the node's local bounds, which only the engine resolves
// (text bounds come from shaping). Computing any of it on the JavaScript side means
// reconstructing engine state, which is how the editor ended up with a selection
// box that disagreed with the pixels.
//
// Note the asymmetry, which is not a style choice: move and rotate compose on the
// LEFT, in the parent's space, because "turn the object as it appears on screen" is
// a statement about world space. Resize composes on the RIGHT, in the node's own
// space, because "make this box that box" is a statement about local geometry. The
// editor's previous rotation appended `rotate(δ cx cy)` with `cx,cy` measured in
// the PARENT's space — a right-composition with a left-composition's pivot. The two
// agree only when the node's existing transform is a rotation about that same
// point, which is exactly what the test fixture happened to be, so the defect was
// invisible. `TestRotationPivotIsNotAffectedByAnExistingTransform` is the case that
// separates them.
//
// ## Snapshot, then solve
//
// A gesture is stateful, but the mathematics is not. `GestureSnapshot` is captured
// once at pointer-down and never mutated; `SolveGesture` is a pure function of
// (snapshot, pointer, modifiers). The only mutable thing is which snapshot is
// active, and that is owned explicitly by the caller rather than by this module, so
// there is no hidden state here and no way for two gestures to interfere.
//
// Solving from a SNAPSHOT rather than from the node's current transform is what
// makes a stream of pointer samples free of accumulated drift: frame 200 of a drag
// is computed from the same base as frame 1.
//
// Nothing here falls back silently. A singular ancestor transform, a zero-extent
// box or a non-finite result is REPORTED, because the alternative — a plausible
// looking transform — is the class of bug this replaces.
//
// One responsibility per file: solving an in-flight gesture into a transform.

#ifndef PYDEE_GESTURE_H_
#define PYDEE_GESTURE_H_

#include <optional>
#include <string_view>

#include "pydee/geometry.h"
#include "pydee/scene.h"
#include "pydee/selection.h"

namespace pydee {

/** Which gesture is in flight. All three reduce to one local transform. */
enum class GestureKind {
  kMove,
  kResize,
  kRotate,
};

/** "move" | "resize" | "rotate", or nullopt. */
std::optional<GestureKind> ParseGestureKind(std::string_view name);

/** The wire name, so both sides speak the same vocabulary. */
const char* GestureKindName(GestureKind kind);

/**
 * Keyboard state that changes what a drag means.
 *
 * `angle_snap_degrees` is a step, not a flag, so the caller decides the increment
 * instead of this file hardcoding one. Zero means no snapping.
 */
struct GestureModifiers {
  bool preserve_aspect = false;
  bool from_center = false;
  double angle_snap_degrees = 0.0;
};

/**
 * Everything a gesture needs, captured at pointer-down and then immutable.
 *
 * `parent_world` and `base_local` are stored separately even though
 * `bounds.world_transform == parent_world · base_local`, because the solve needs
 * both factors and recovering one by inverting the other would fail for a
 * singular node transform — a node scaled to zero on one axis can still be
 * dragged.
 */
struct GestureSnapshot {
  GestureKind kind = GestureKind::kMove;
  /** Which handle is being dragged. Meaningful for kResize only. */
  ResizeHandle handle = ResizeHandle::kSouthEast;
  /** The node's oriented world bounds when the gesture began. */
  OrientedBounds bounds;
  /** Ancestors only, excluding the node's own transform. */
  Matrix2D parent_world;
  /** The node's own transform when the gesture began. */
  Matrix2D base_local;
  /** Where the pointer went down, in world space. */
  Point2D pointer_start;
  /** The fixed point of a rotation, in world space. The box's own centre. */
  Point2D pivot;
};

/** One frame's answer. `local_transform` is the only value that must be applied. */
struct GestureFrame {
  /** Assign to the node's `local_transform`. */
  Matrix2D local_transform;
  /**
   * The node's local bounds for this frame.
   *
   * Changed by a resize and unchanged by a move or a rotate. This is what the
   * document commit needs: a resize is stored as geometry, not as a matrix, so the
   * caller has to know the new box and not merely the transform that produces it.
   */
  RectF local_bounds;
  /** Degrees applied by a rotate. Zero for the other kinds. */
  double angle_degrees = 0.0;
  /** World-space displacement applied by a move. Zero for the other kinds. */
  Point2D world_delta{0.0, 0.0};
};

/** Why a frame could not be solved. Never a silent fallback. */
enum class GestureFailure {
  /** The ancestor chain is collapsed, so world space cannot be mapped in. */
  kSingularParent,
  /** The node's own world transform is singular. */
  kSingularTransform,
  /** A zero-extent box cannot be scaled onto a non-zero one by multiplication. */
  kDegenerateBounds,
  /** A coordinate came out NaN or infinite. */
  kNonFiniteResult,
  /** The pointer is exactly on the pivot, so no rotation angle exists. */
  kPointerOnPivot,
};

/** Stable strings, so a failure crosses the wire as a reason rather than a null. */
const char* GestureFailureName(GestureFailure failure);

/**
 * The affine that maps local bounds `from` onto `to`, in the geometry's own space.
 *
 * `to = scale · (point - from.origin) + to.origin`, which is a scale about the old
 * origin followed by a translation onto the new one. Returns nullopt when `from`
 * has zero extent on an axis: the scale factor is then undefined, and dividing by
 * zero to produce an infinite matrix is worse than refusing.
 *
 * The C++ half of `resizeGeometry.boundsMappingTransform`.
 */
std::optional<Matrix2D> BoundsMappingTransform(const RectF& from, const RectF& to);

/**
 * `local' = parent_world⁻¹ · world · parent_world · base_local`.
 *
 * The general form of `setNodeDocumentTranslation`'s expression: apply `world` as
 * seen in world space to a node that is written in its parent's space. For a pure
 * translation this reduces to `[I | M⁻¹t]`, which is why a `dx / zoom` conversion
 * looks right until an ancestor rotates.
 *
 * Returns nullopt for a singular parent or a non-finite product.
 */
std::optional<Matrix2D> LocalTransformAfterWorldTransform(const Matrix2D& parent_world,
                                                          const Matrix2D& base_local,
                                                          const Matrix2D& world);

/**
 * Clockwise-positive degrees from `start` to `current`, measured about `pivot`.
 *
 * Wrapped into (-180, 180] so a drag across the ±180 boundary does not jump by a
 * full turn. Snapping rounds HALF UP, including for negative values, to match
 * JavaScript's `Math.round` exactly — `std::round` rounds half away from zero and
 * would disagree at every .5 boundary.
 *
 * Returns nullopt when either vector has zero length: there is no angle from a
 * point to itself, and reporting 0 would silently freeze the gesture.
 */
std::optional<double> RotationDeltaDegrees(const Point2D& pivot, const Point2D& start,
                                           const Point2D& current, double snap_degrees);

/**
 * Capture the snapshot for a gesture on `id`.
 *
 * Fails, with a reason, when the node is absent or has no usable geometry — the
 * same vocabulary `OrientedBoundsForNode` uses, because it is the same question.
 */
bool BeginGesture(const Scene& scene, std::string_view id, GestureKind kind,
                  ResizeHandle handle, const Point2D& pointer_world, GestureSnapshot* out,
                  SelectionFailure* failure);

/**
 * One frame of the gesture.
 *
 * A pure function: same snapshot and same pointer always give the same transform,
 * whatever happened in between. Returns nullopt and sets `failure` rather than an
 * approximate transform.
 */
std::optional<GestureFrame> SolveGesture(const GestureSnapshot& snapshot,
                                         const Point2D& pointer_world,
                                         const GestureModifiers& modifiers,
                                         GestureFailure* failure);

// --------------------------------------------------------------------------- //
// Handle hit regions.
//
// The selection chrome is PAINTED on a canvas, so there are no DOM elements under
// the cursor to receive a pointer event. What replaces them is this: the same
// geometry that positions each handle also decides which one a point is on. One
// source of truth for a handle's position means the target can never be somewhere
// other than where the handle was drawn — the failure mode of every overlay that
// positions elements next to a rendered object.
// --------------------------------------------------------------------------- //

/** What a point in the selection's neighbourhood is on. */
enum class HandleRegion {
  kNone,
  /** Inside the object's oriented box: a drag from here moves it. */
  kBody,
  kResize,
  kRotate,
};

const char* HandleRegionName(HandleRegion region);

/**
 * Sizes in WORLD units.
 *
 * The chrome is drawn at a constant screen size, so the caller divides its
 * screen-pixel constants by the zoom before passing them here. That conversion is
 * a length, and it belongs to whoever knows the zoom; this file only compares
 * distances.
 */
struct HandleHitOptions {
  /** Side of the square handle, matching what SelectionCanvas draws. */
  double handle_size = 9.0;
  /** Distance from the top edge's midpoint to the rotation control. */
  double rotation_offset = 26.0;
  /**
   * Hit radius of the rotation control.
   *
   * Deliberately allowed to exceed the drawn radius: a 5.5px disc is a hard target
   * for a mouse, and every editor makes its rotation affordance larger than it
   * looks. Kept explicit so the difference is a decision rather than an accident.
   */
  double rotation_radius = 11.0;
  /**
   * How far outside each corner the corner rotation zones sit.
   *
   * They are offset rather than centred on the corner because a rotation zone on
   * top of a corner handle makes corner RESIZE unreachable — a defect this editor
   * shipped once already.
   */
  double corner_rotation_offset = 20.0;
  /** Side of the square corner rotation zones. */
  double corner_rotation_size = 18.0;
};

struct HandleHit {
  HandleRegion region = HandleRegion::kNone;
  /**
   * Which handle was hit. For kRotate this is the corner the zone belongs to, or
   * kNorth for the control above the top edge, so a caller can report the cursor.
   */
  ResizeHandle handle = ResizeHandle::kNorthWest;
};

/**
 * World position of the rotation control above the top edge.
 *
 * Offset along the top edge's OUTWARD normal, derived from the corners, so it
 * follows rotation, scale, flip and every ancestor transform without any
 * trigonometry. Returns nullopt for a degenerate box with no distinguishable
 * outward direction.
 */
std::optional<Point2D> RotationControlPosition(const OrientedBounds& bounds, double offset);

/**
 * Which part of the selection chrome `world` is on.
 *
 * Resize handles win over rotation zones. They do not overlap by construction, but
 * ordering the test makes that a guarantee rather than a consequence of the
 * offsets happening to be large enough.
 */
HandleHit HitTestSelection(const OrientedBounds& bounds, const Point2D& world,
                           const HandleHitOptions& options);

}  // namespace pydee

#endif  // PYDEE_GESTURE_H_
