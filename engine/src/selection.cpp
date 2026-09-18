// selection.cpp — implementation of the engine's selection geometry.
//
// Kept numerically identical to frontend/src/editor/geometry/selectionGeometry.ts.
// See selection.h for why both exist; the parity suite compares them on the same
// scenes, so any divergence fails the build.

#include "pydee/selection.h"

#include <algorithm>
#include <cmath>
#include <limits>

namespace pydee {
namespace {

bool FinitePoint(const Point2D& point) {
  return std::isfinite(point.x) && std::isfinite(point.y);
}

bool FiniteRect(const RectF& rect) {
  return std::isfinite(rect.x) && std::isfinite(rect.y) && std::isfinite(rect.width)
      && std::isfinite(rect.height);
}

/**
 * JavaScript's `Math.sign(value || 1)`.
 *
 * `value || 1` treats 0 and NaN as falsy, so both yield +1; anything else keeps
 * its own sign. Written out because the obvious `std::copysign(1.0, value)` maps
 * -0.0 to -1 and NaN to +/-1 depending on its sign bit, which would silently
 * disagree with the TypeScript implementation on those inputs.
 */
double SignOrOne(double value) { return value < 0.0 ? -1.0 : 1.0; }

Point2D Midpoint(const Point2D& first, const Point2D& second) {
  return Point2D{(first.x + second.x) / 2.0, (first.y + second.y) / 2.0};
}

/** Depth-first search that accumulates the parent world transform on the way in. */
const Node* FindWithWorld(const std::vector<std::unique_ptr<Node>>& nodes,
                          const Matrix2D& parent_world, std::string_view id,
                          Matrix2D* world_out) {
  for (const std::unique_ptr<Node>& node : nodes) {
    if (!node) {
      continue;
    }
    const Matrix2D world = Multiply(parent_world, node->local_transform);
    if (node->id == id) {
      *world_out = world;
      return node.get();
    }
    if (node->kind == NodeKind::kGroup) {
      const auto* group = static_cast<const GroupNode*>(node.get());
      if (const Node* found = FindWithWorld(group->children, world, id, world_out)) {
        return found;
      }
    }
  }
  return nullptr;
}

/** Depth-first search that also reports the parent world transform. */
const Node* FindWithParentWorld(const std::vector<std::unique_ptr<Node>>& nodes,
                                const Matrix2D& parent_world, std::string_view id,
                                Matrix2D* parent_out) {
  for (const std::unique_ptr<Node>& node : nodes) {
    if (!node) {
      continue;
    }
    if (node->id == id) {
      *parent_out = parent_world;
      return node.get();
    }
    if (node->kind == NodeKind::kGroup) {
      const auto* group = static_cast<const GroupNode*>(node.get());
      const Matrix2D world = Multiply(parent_world, node->local_transform);
      if (const Node* found = FindWithParentWorld(group->children, world, id, parent_out)) {
        return found;
      }
    }
  }
  return nullptr;
}

}  // namespace

std::optional<ResizeHandle> ParseResizeHandle(std::string_view name) {
  if (name == "nw") return ResizeHandle::kNorthWest;
  if (name == "n") return ResizeHandle::kNorth;
  if (name == "ne") return ResizeHandle::kNorthEast;
  if (name == "e") return ResizeHandle::kEast;
  if (name == "se") return ResizeHandle::kSouthEast;
  if (name == "s") return ResizeHandle::kSouth;
  if (name == "sw") return ResizeHandle::kSouthWest;
  if (name == "w") return ResizeHandle::kWest;
  return std::nullopt;
}

const char* ResizeHandleName(ResizeHandle handle) {
  switch (handle) {
    case ResizeHandle::kNorthWest: return "nw";
    case ResizeHandle::kNorth: return "n";
    case ResizeHandle::kNorthEast: return "ne";
    case ResizeHandle::kEast: return "e";
    case ResizeHandle::kSouthEast: return "se";
    case ResizeHandle::kSouth: return "s";
    case ResizeHandle::kSouthWest: return "sw";
    case ResizeHandle::kWest: return "w";
  }
  return "nw";
}

ResizeHandle OppositeHandle(ResizeHandle handle) {
  switch (handle) {
    case ResizeHandle::kNorthWest: return ResizeHandle::kSouthEast;
    case ResizeHandle::kNorth: return ResizeHandle::kSouth;
    case ResizeHandle::kNorthEast: return ResizeHandle::kSouthWest;
    case ResizeHandle::kEast: return ResizeHandle::kWest;
    case ResizeHandle::kSouthEast: return ResizeHandle::kNorthWest;
    case ResizeHandle::kSouth: return ResizeHandle::kNorth;
    case ResizeHandle::kSouthWest: return ResizeHandle::kNorthEast;
    case ResizeHandle::kWest: return ResizeHandle::kEast;
  }
  return ResizeHandle::kSouthEast;
}

const char* SelectionFailureName(SelectionFailure failure) {
  switch (failure) {
    case SelectionFailure::kNodeNotFound: return "node-not-found";
    case SelectionFailure::kBoundsUnavailable: return "bounds-unavailable";
    case SelectionFailure::kSingularTransform: return "singular-transform";
    case SelectionFailure::kNonFiniteGeometry: return "non-finite-geometry";
  }
  return "node-not-found";
}

std::optional<Matrix2D> WorldTransformForNode(const Scene& scene, std::string_view id) {
  Matrix2D world;
  if (FindWithWorld(scene.roots, Identity(), id, &world) == nullptr) {
    return std::nullopt;
  }
  return world;
}

std::optional<NodeTransformContext> TransformContextForNode(const Scene& scene,
                                                            std::string_view id) {
  Matrix2D parent_world = Identity();
  const Node* node = FindWithParentWorld(scene.roots, Identity(), id, &parent_world);
  if (node == nullptr) {
    return std::nullopt;
  }
  NodeTransformContext context;
  context.parent_world = parent_world;
  context.local_transform = node->local_transform;
  context.world_transform = Multiply(parent_world, node->local_transform);
  return context;
}

bool OrientedBoundsFrom(const Matrix2D& world_transform,
                        const std::optional<RectF>& local_bounds, OrientedBounds* out,
                        SelectionFailure* failure) {
  const auto fail = [failure](SelectionFailure reason) {
    if (failure != nullptr) {
      *failure = reason;
    }
    return false;
  };

  if (!local_bounds.has_value()) {
    return fail(SelectionFailure::kBoundsUnavailable);
  }
  const RectF& bounds = *local_bounds;
  if (!FiniteRect(bounds)) {
    return fail(SelectionFailure::kNonFiniteGeometry);
  }

  // A singular transform maps the box onto a line or a point. Reported rather
  // than drawn: a zero-area selection cannot be resized meaningfully, and
  // substituting a different box is the bug this file replaces.
  if (!Invert(world_transform).has_value()) {
    return fail(SelectionFailure::kSingularTransform);
  }

  const auto corner = [&world_transform](double x, double y) {
    return TransformPoint(world_transform, Point2D{x, y});
  };

  OrientedBounds result;
  result.top_left = corner(bounds.x, bounds.y);
  result.top_right = corner(bounds.x + bounds.width, bounds.y);
  result.bottom_right = corner(bounds.x + bounds.width, bounds.y + bounds.height);
  result.bottom_left = corner(bounds.x, bounds.y + bounds.height);

  if (!FinitePoint(result.top_left) || !FinitePoint(result.top_right)
      || !FinitePoint(result.bottom_right) || !FinitePoint(result.bottom_left)) {
    return fail(SelectionFailure::kNonFiniteGeometry);
  }

  result.local_bounds = bounds;
  result.world_transform = world_transform;
  *out = result;
  return true;
}

bool OrientedBoundsForNode(const Scene& scene, std::string_view id, OrientedBounds* out,
                           SelectionFailure* failure) {
  Matrix2D world;
  const Node* node = FindWithWorld(scene.roots, Identity(), id, &world);
  if (node == nullptr) {
    if (failure != nullptr) {
      *failure = SelectionFailure::kNodeNotFound;
    }
    return false;
  }
  return OrientedBoundsFrom(world, node->local_bounds, out, failure);
}

void OrientedCorners(const OrientedBounds& bounds, Point2D out[4]) {
  out[0] = bounds.top_left;
  out[1] = bounds.top_right;
  out[2] = bounds.bottom_right;
  out[3] = bounds.bottom_left;
}

Point2D OrientedCenter(const OrientedBounds& bounds) {
  return Midpoint(bounds.top_left, bounds.bottom_right);
}

double OrientedAngleDegrees(const OrientedBounds& bounds) {
  const double dx = bounds.top_right.x - bounds.top_left.x;
  const double dy = bounds.top_right.y - bounds.top_left.y;
  return std::atan2(dy, dx) * 180.0 / 3.14159265358979323846;
}

bool OrientedIsFlipped(const OrientedBounds& bounds) {
  const Matrix2D& m = bounds.world_transform;
  return m.a * m.d - m.b * m.c < 0.0;
}

Point2D HandleWorldPosition(const OrientedBounds& bounds, ResizeHandle handle) {
  switch (handle) {
    case ResizeHandle::kNorthWest: return bounds.top_left;
    case ResizeHandle::kNorthEast: return bounds.top_right;
    case ResizeHandle::kSouthEast: return bounds.bottom_right;
    case ResizeHandle::kSouthWest: return bounds.bottom_left;
    case ResizeHandle::kNorth: return Midpoint(bounds.top_left, bounds.top_right);
    case ResizeHandle::kEast: return Midpoint(bounds.top_right, bounds.bottom_right);
    case ResizeHandle::kSouth: return Midpoint(bounds.bottom_right, bounds.bottom_left);
    case ResizeHandle::kWest: return Midpoint(bounds.bottom_left, bounds.top_left);
  }
  return bounds.top_left;
}

Point2D AnchorWorldPosition(const OrientedBounds& bounds, ResizeHandle handle) {
  return HandleWorldPosition(bounds, OppositeHandle(handle));
}

Point2D HandleLocalPosition(const OrientedBounds& bounds, ResizeHandle handle) {
  const RectF& b = bounds.local_bounds;
  const double left = b.x;
  const double right = b.x + b.width;
  const double top = b.y;
  const double bottom = b.y + b.height;
  const double mid_x = b.x + b.width / 2.0;
  const double mid_y = b.y + b.height / 2.0;

  switch (handle) {
    case ResizeHandle::kNorthWest: return Point2D{left, top};
    case ResizeHandle::kNorth: return Point2D{mid_x, top};
    case ResizeHandle::kNorthEast: return Point2D{right, top};
    case ResizeHandle::kEast: return Point2D{right, mid_y};
    case ResizeHandle::kSouthEast: return Point2D{right, bottom};
    case ResizeHandle::kSouth: return Point2D{mid_x, bottom};
    case ResizeHandle::kSouthWest: return Point2D{left, bottom};
    case ResizeHandle::kWest: return Point2D{left, mid_y};
  }
  return Point2D{left, top};
}

bool AxisAlignedBoundsForNodes(const Scene& scene, const std::vector<std::string>& ids,
                               RectF* out, std::vector<std::string>* failed_ids) {
  double min_x = std::numeric_limits<double>::infinity();
  double min_y = std::numeric_limits<double>::infinity();
  double max_x = -std::numeric_limits<double>::infinity();
  double max_y = -std::numeric_limits<double>::infinity();
  bool any = false;

  for (const std::string& id : ids) {
    OrientedBounds bounds;
    SelectionFailure failure = SelectionFailure::kNodeNotFound;
    if (!OrientedBoundsForNode(scene, id, &bounds, &failure)) {
      if (failed_ids != nullptr) {
        failed_ids->push_back(id);
      }
      continue;
    }
    any = true;
    Point2D corners[4];
    OrientedCorners(bounds, corners);
    for (const Point2D& corner : corners) {
      min_x = std::min(min_x, corner.x);
      min_y = std::min(min_y, corner.y);
      max_x = std::max(max_x, corner.x);
      max_y = std::max(max_y, corner.y);
    }
  }

  if (!any) {
    return false;
  }
  *out = RectF{min_x, min_y, max_x - min_x, max_y - min_y};
  return true;
}

std::optional<RectF> ResizeLocalBounds(const OrientedBounds& bounds, ResizeHandle handle,
                                       const Point2D& pointer_world,
                                       const ResizeOptions& options) {
  const std::optional<Matrix2D> inverse = Invert(bounds.world_transform);
  if (!inverse.has_value()) {
    return std::nullopt;
  }
  const Point2D pointer_local = TransformPoint(*inverse, pointer_world);

  const RectF& box = bounds.local_bounds;
  double left = box.x;
  double top = box.y;
  double right = box.x + box.width;
  double bottom = box.y + box.height;

  const bool moves_left = handle == ResizeHandle::kNorthWest || handle == ResizeHandle::kWest
                       || handle == ResizeHandle::kSouthWest;
  const bool moves_right = handle == ResizeHandle::kNorthEast || handle == ResizeHandle::kEast
                        || handle == ResizeHandle::kSouthEast;
  const bool moves_top = handle == ResizeHandle::kNorthWest || handle == ResizeHandle::kNorth
                      || handle == ResizeHandle::kNorthEast;
  const bool moves_bottom = handle == ResizeHandle::kSouthWest || handle == ResizeHandle::kSouth
                         || handle == ResizeHandle::kSouthEast;

  if (options.from_center) {
    const double centre_x = box.x + box.width / 2.0;
    const double centre_y = box.y + box.height / 2.0;
    if (moves_left || moves_right) {
      const double half = std::abs(pointer_local.x - centre_x);
      left = centre_x - half;
      right = centre_x + half;
    }
    if (moves_top || moves_bottom) {
      const double half = std::abs(pointer_local.y - centre_y);
      top = centre_y - half;
      bottom = centre_y + half;
    }
  } else {
    if (moves_left) left = pointer_local.x;
    if (moves_right) right = pointer_local.x;
    if (moves_top) top = pointer_local.y;
    if (moves_bottom) bottom = pointer_local.y;
  }

  double width = right - left;
  double height = bottom - top;

  if (options.preserve_aspect && box.width != 0.0 && box.height != 0.0) {
    const bool is_corner = handle == ResizeHandle::kNorthWest
                        || handle == ResizeHandle::kNorthEast
                        || handle == ResizeHandle::kSouthEast
                        || handle == ResizeHandle::kSouthWest;
    if (is_corner) {
      const double ratio = std::abs(box.height / box.width);
      // Follow whichever axis the pointer moved further along, so the gesture
      // never feels like it is resisting the cursor.
      if (std::abs(width) * ratio > std::abs(height)) {
        const double signed_height = SignOrOne(height) * std::abs(width) * ratio;
        if (moves_top) {
          top = bottom - signed_height;
        } else {
          bottom = top + signed_height;
        }
        height = signed_height;
      } else {
        const double signed_width = SignOrOne(width) * (std::abs(height) / ratio);
        if (moves_left) {
          left = right - signed_width;
        } else {
          right = left + signed_width;
        }
        width = signed_width;
      }
    }
  }

  if (!std::isfinite(left) || !std::isfinite(top) || !std::isfinite(width)
      || !std::isfinite(height)) {
    return std::nullopt;
  }
  return RectF{left, top, width, height};
}

}  // namespace pydee
