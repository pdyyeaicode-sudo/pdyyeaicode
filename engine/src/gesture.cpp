// gesture.cpp — implementation of the gesture solver.
//
// See gesture.h for why the whole solve lives in the engine and why move/rotate
// compose on the left while resize composes on the right.
//
// Kept numerically identical to frontend/src/editor/geometry/gestureSolve.ts, which
// is the fallback used when the engine artifact is absent. engine-parity.mts runs
// both over the same snapshots and requires the resulting transforms to agree, so
// the two cannot drift into disagreeing about where a dragged object goes.

#include "pydee/gesture.h"

#include <cmath>

namespace pydee {
namespace {

constexpr double kPi = 3.14159265358979323846;

bool FinitePoint(const Point2D& point) {
  return std::isfinite(point.x) && std::isfinite(point.y);
}

bool FiniteRect(const RectF& rect) {
  return std::isfinite(rect.x) && std::isfinite(rect.y) && std::isfinite(rect.width)
      && std::isfinite(rect.height);
}

/**
 * JavaScript's `Math.round`: ties go UP, toward positive infinity.
 *
 * `std::round` rounds ties away from zero, so it maps -2.5 to -3 where JavaScript
 * maps it to -2. Angle snapping lands on a tie at every half-step, so the
 * difference is reachable in normal use rather than theoretical.
 */
double RoundHalfUp(double value) { return std::floor(value + 0.5); }

Point2D Midpoint(const Point2D& first, const Point2D& second) {
  return Point2D{(first.x + second.x) / 2.0, (first.y + second.y) / 2.0};
}

/** An axis-aligned square of side `size` centred on `centre`, in world units. */
bool WithinSquare(const Point2D& point, const Point2D& centre, double size) {
  const double half = size / 2.0;
  return std::abs(point.x - centre.x) <= half && std::abs(point.y - centre.y) <= half;
}

/** The corner a rotation zone belongs to, pushed outward from the box centre. */
Point2D CornerRotationZone(const OrientedBounds& bounds, ResizeHandle corner, double offset) {
  const Point2D centre = OrientedCenter(bounds);
  const Point2D at = HandleWorldPosition(bounds, corner);
  const double dx = at.x - centre.x;
  const double dy = at.y - centre.y;
  const double length = std::hypot(dx, dy);
  if (!(length > 0.0)) {
    return at;
  }
  return Point2D{at.x + (dx / length) * offset, at.y + (dy / length) * offset};
}

constexpr ResizeHandle kCornerHandles[4] = {
    ResizeHandle::kNorthWest,
    ResizeHandle::kNorthEast,
    ResizeHandle::kSouthEast,
    ResizeHandle::kSouthWest,
};

}  // namespace

std::optional<GestureKind> ParseGestureKind(std::string_view name) {
  if (name == "move") return GestureKind::kMove;
  if (name == "resize") return GestureKind::kResize;
  if (name == "rotate") return GestureKind::kRotate;
  return std::nullopt;
}

const char* GestureKindName(GestureKind kind) {
  switch (kind) {
    case GestureKind::kMove: return "move";
    case GestureKind::kResize: return "resize";
    case GestureKind::kRotate: return "rotate";
  }
  return "move";
}

const char* GestureFailureName(GestureFailure failure) {
  switch (failure) {
    case GestureFailure::kSingularParent: return "singular-parent";
    case GestureFailure::kSingularTransform: return "singular-transform";
    case GestureFailure::kDegenerateBounds: return "degenerate-bounds";
    case GestureFailure::kNonFiniteResult: return "non-finite-result";
    case GestureFailure::kPointerOnPivot: return "pointer-on-pivot";
  }
  return "non-finite-result";
}

std::optional<Matrix2D> BoundsMappingTransform(const RectF& from, const RectF& to) {
  if (from.width == 0.0 || from.height == 0.0) {
    return std::nullopt;
  }
  if (!FiniteRect(from) || !FiniteRect(to)) {
    return std::nullopt;
  }
  const double scale_x = to.width / from.width;
  const double scale_y = to.height / from.height;
  const Matrix2D mapping{scale_x,
                         0.0,
                         0.0,
                         scale_y,
                         to.x - from.x * scale_x,
                         to.y - from.y * scale_y};
  if (!IsFinite(mapping)) {
    return std::nullopt;
  }
  return mapping;
}

std::optional<Matrix2D> LocalTransformAfterWorldTransform(const Matrix2D& parent_world,
                                                          const Matrix2D& base_local,
                                                          const Matrix2D& world) {
  const std::optional<Matrix2D> inverse = Invert(parent_world);
  if (!inverse.has_value()) {
    return std::nullopt;
  }
  const Matrix2D in_parent_space = Multiply(*inverse, Multiply(world, parent_world));
  const Matrix2D result = Multiply(in_parent_space, base_local);
  if (!IsFinite(result)) {
    return std::nullopt;
  }
  return result;
}

std::optional<double> RotationDeltaDegrees(const Point2D& pivot, const Point2D& start,
                                           const Point2D& current, double snap_degrees) {
  const double start_dx = start.x - pivot.x;
  const double start_dy = start.y - pivot.y;
  const double current_dx = current.x - pivot.x;
  const double current_dy = current.y - pivot.y;
  if ((start_dx == 0.0 && start_dy == 0.0) || (current_dx == 0.0 && current_dy == 0.0)) {
    return std::nullopt;
  }

  const double start_angle = std::atan2(start_dy, start_dx) * 180.0 / kPi;
  const double current_angle = std::atan2(current_dy, current_dx) * 180.0 / kPi;
  double delta = current_angle - start_angle;
  while (delta > 180.0) delta -= 360.0;
  while (delta < -180.0) delta += 360.0;

  if (snap_degrees > 0.0) {
    delta = RoundHalfUp(delta / snap_degrees) * snap_degrees;
  }
  if (!std::isfinite(delta)) {
    return std::nullopt;
  }
  return delta;
}

bool BeginGesture(const Scene& scene, std::string_view id, GestureKind kind,
                  ResizeHandle handle, const Point2D& pointer_world, GestureSnapshot* out,
                  SelectionFailure* failure) {
  const std::optional<NodeTransformContext> context = TransformContextForNode(scene, id);
  if (!context.has_value()) {
    if (failure != nullptr) {
      *failure = SelectionFailure::kNodeNotFound;
    }
    return false;
  }

  OrientedBounds bounds;
  if (!OrientedBoundsForNode(scene, id, &bounds, failure)) {
    return false;
  }
  if (!FinitePoint(pointer_world)) {
    if (failure != nullptr) {
      *failure = SelectionFailure::kNonFiniteGeometry;
    }
    return false;
  }

  GestureSnapshot snapshot;
  snapshot.kind = kind;
  snapshot.handle = handle;
  snapshot.bounds = bounds;
  snapshot.parent_world = context->parent_world;
  snapshot.base_local = context->local_transform;
  snapshot.pointer_start = pointer_world;
  // The rotation pivot is the box's own centre, derived from the four world
  // corners. Reconstructing it as `x + width/2` of the UNROTATED box is off by the
  // rotation for any rotated layer, which is the defect that used to send a
  // rotating shape away from itself.
  snapshot.pivot = OrientedCenter(bounds);
  *out = snapshot;
  return true;
}

std::optional<GestureFrame> SolveGesture(const GestureSnapshot& snapshot,
                                         const Point2D& pointer_world,
                                         const GestureModifiers& modifiers,
                                         GestureFailure* failure) {
  const auto fail = [failure](GestureFailure reason) -> std::optional<GestureFrame> {
    if (failure != nullptr) {
      *failure = reason;
    }
    return std::nullopt;
  };

  if (!FinitePoint(pointer_world)) {
    return fail(GestureFailure::kNonFiniteResult);
  }

  GestureFrame frame;
  frame.local_bounds = snapshot.bounds.local_bounds;

  switch (snapshot.kind) {
    case GestureKind::kMove: {
      const Point2D delta{pointer_world.x - snapshot.pointer_start.x,
                          pointer_world.y - snapshot.pointer_start.y};
      const std::optional<Matrix2D> local = LocalTransformAfterWorldTransform(
          snapshot.parent_world, snapshot.base_local, Translation(delta.x, delta.y));
      if (!local.has_value()) {
        return fail(GestureFailure::kSingularParent);
      }
      frame.local_transform = *local;
      frame.world_delta = delta;
      return frame;
    }

    case GestureKind::kRotate: {
      const std::optional<double> delta = RotationDeltaDegrees(
          snapshot.pivot, snapshot.pointer_start, pointer_world, modifiers.angle_snap_degrees);
      if (!delta.has_value()) {
        return fail(GestureFailure::kPointerOnPivot);
      }
      // Composed on the LEFT, in the parent's space, about a WORLD pivot. This is
      // what makes the object's own centre a fixed point regardless of what its
      // existing transform is or what its ancestors do.
      const std::optional<Matrix2D> local = LocalTransformAfterWorldTransform(
          snapshot.parent_world, snapshot.base_local,
          Rotation(*delta, snapshot.pivot.x, snapshot.pivot.y));
      if (!local.has_value()) {
        return fail(GestureFailure::kSingularParent);
      }
      frame.local_transform = *local;
      frame.angle_degrees = *delta;
      return frame;
    }

    case GestureKind::kResize: {
      const std::optional<RectF> next = ResizeLocalBounds(
          snapshot.bounds, snapshot.handle, pointer_world,
          ResizeOptions{modifiers.preserve_aspect, modifiers.from_center});
      if (!next.has_value()) {
        return fail(GestureFailure::kSingularTransform);
      }
      const std::optional<Matrix2D> mapping =
          BoundsMappingTransform(snapshot.bounds.local_bounds, *next);
      if (!mapping.has_value()) {
        return fail(GestureFailure::kDegenerateBounds);
      }
      // Composed on the RIGHT, in the node's own space: "make this box that box" is
      // a statement about local geometry. Prepending would move the node instead of
      // resizing it.
      const Matrix2D local = Multiply(snapshot.base_local, *mapping);
      if (!IsFinite(local)) {
        return fail(GestureFailure::kNonFiniteResult);
      }
      frame.local_transform = local;
      frame.local_bounds = *next;
      return frame;
    }
  }

  return fail(GestureFailure::kNonFiniteResult);
}

const char* HandleRegionName(HandleRegion region) {
  switch (region) {
    case HandleRegion::kNone: return "none";
    case HandleRegion::kBody: return "body";
    case HandleRegion::kResize: return "resize";
    case HandleRegion::kRotate: return "rotate";
  }
  return "none";
}

std::optional<Point2D> RotationControlPosition(const OrientedBounds& bounds, double offset) {
  const Point2D top = Midpoint(bounds.top_left, bounds.top_right);
  const Point2D bottom = Midpoint(bounds.bottom_left, bounds.bottom_right);
  const double dx = top.x - bottom.x;
  const double dy = top.y - bottom.y;
  const double length = std::hypot(dx, dy);
  if (!(length > 0.0) || !std::isfinite(length)) {
    // A zero-height box has no outward direction, so there is nowhere to put the
    // control. SelectionCanvas draws nothing in that case for the same reason.
    return std::nullopt;
  }
  const Point2D at{top.x + (dx / length) * offset, top.y + (dy / length) * offset};
  if (!FinitePoint(at)) {
    return std::nullopt;
  }
  return at;
}

HandleHit HitTestSelection(const OrientedBounds& bounds, const Point2D& world,
                           const HandleHitOptions& options) {
  HandleHit miss;
  if (!FinitePoint(world)) {
    return miss;
  }

  // 1. Resize handles first. They and the rotation zones do not overlap, but
  //    ordering the test makes that a guarantee instead of a consequence of the
  //    offsets happening to be big enough.
  for (const ResizeHandle handle : kResizeHandles) {
    if (WithinSquare(world, HandleWorldPosition(bounds, handle), options.handle_size)) {
      return HandleHit{HandleRegion::kResize, handle};
    }
  }

  // 2. The rotation control drawn above the top edge.
  const std::optional<Point2D> control =
      RotationControlPosition(bounds, options.rotation_offset);
  if (control.has_value()) {
    const double dx = world.x - control->x;
    const double dy = world.y - control->y;
    if (std::hypot(dx, dy) <= options.rotation_radius) {
      return HandleHit{HandleRegion::kRotate, ResizeHandle::kNorth};
    }
  }

  // 3. The four corner rotation zones, just outside each corner.
  for (const ResizeHandle corner : kCornerHandles) {
    const Point2D zone = CornerRotationZone(bounds, corner, options.corner_rotation_offset);
    if (WithinSquare(world, zone, options.corner_rotation_size)) {
      return HandleHit{HandleRegion::kRotate, corner};
    }
  }

  // 4. Inside the object itself. Tested by mapping the point into local space,
  //    where the box is axis-aligned by definition — exact for any rotation, skew
  //    or flip, unlike a comparison against an axis-aligned world box.
  const std::optional<Matrix2D> inverse = Invert(bounds.world_transform);
  if (inverse.has_value()) {
    const Point2D local = TransformPoint(*inverse, world);
    if (FinitePoint(local) && RectContainsPoint(bounds.local_bounds, local)) {
      return HandleHit{HandleRegion::kBody, ResizeHandle::kNorthWest};
    }
  }

  return miss;
}

}  // namespace pydee
