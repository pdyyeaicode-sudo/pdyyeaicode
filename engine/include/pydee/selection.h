// selection.h — where an object IS, computed by the engine that draws it.
//
// This is the C++ half of frontend/src/editor/geometry/selectionGeometry.ts and
// the authority for the rule that whole file exists to enforce:
//
//     worldCorner = node.world_transform x localCorner
//
// An object's selection geometry is a mathematical consequence of its world
// transform, never an independent measurement. The editor used to measure the DOM
// (`getBoundingClientRect`, `getScreenCTM`) for the selection box while the
// renderers used the world transform. Two sources of truth for the same fact
// always diverge; the only question is when.
//
// Why the maths lives here as well as in TypeScript:
//
//  * The engine already owns the transform chain — it is what composes
//    `parent_world x local_transform` while rendering — so asking any other layer
//    to recompute it is asking for a second answer.
//  * The parity suite compares this implementation against the TypeScript one on
//    the same scenes. A divergence fails the build instead of shipping as a
//    selection box that sits away from its shape. That check is only possible if
//    both implementations exist and are exercised.
//  * Resize maths is a per-frame calculation on the drag hot path, which belongs
//    in compiled code.
//
// Everything here is in LOCAL or WORLD space. Viewport/client conversion stays in
// TypeScript on purpose: it needs the host element's live origin, which is a DOM
// fact about the frame rather than a fact about the object, and it is a uniform
// scale plus a translation that cannot rotate or skew anything.
//
// Nothing in this file falls back silently. A node with no bounds, a singular
// transform or a non-finite coordinate is REPORTED, because substituting a
// plausible box is precisely the class of bug this replaces.
//
// One responsibility per file: deriving selection geometry from world transforms.

#ifndef PYDEE_SELECTION_H_
#define PYDEE_SELECTION_H_

#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include "pydee/geometry.h"
#include "pydee/scene.h"

namespace pydee {

/**
 * The eight resize handles, named by compass direction on the UNROTATED box.
 *
 * The names stay attached to the local-space edges rather than to screen
 * directions, so "nw" means the same corner of the object whatever rotation or
 * flip is applied to it. That is what lets a drag resize along the object's own
 * axes.
 */
enum class ResizeHandle {
  kNorthWest,
  kNorth,
  kNorthEast,
  kEast,
  kSouthEast,
  kSouth,
  kSouthWest,
  kWest,
};

/** Handle order matching RESIZE_HANDLES in selectionGeometry.ts. */
constexpr ResizeHandle kResizeHandles[8] = {
    ResizeHandle::kNorthWest, ResizeHandle::kNorth, ResizeHandle::kNorthEast,
    ResizeHandle::kEast,      ResizeHandle::kSouthEast, ResizeHandle::kSouth,
    ResizeHandle::kSouthWest, ResizeHandle::kWest,
};

/** "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w", or nullopt. */
std::optional<ResizeHandle> ParseResizeHandle(std::string_view name);

/** The wire name of a handle, so both sides speak the same vocabulary. */
const char* ResizeHandleName(ResizeHandle handle);

/** The handle whose position stays fixed while `handle` is dragged. */
ResizeHandle OppositeHandle(ResizeHandle handle);

/** Why geometry could not be produced. Never a silent fallback. */
enum class SelectionFailure {
  /** No node in the scene carries that id. */
  kNodeNotFound,
  /** The node has no resolved local bounds — for example text with no font yet. */
  kBoundsUnavailable,
  /** The world transform is singular; the node is collapsed to a line or point. */
  kSingularTransform,
  /** A coordinate was NaN or infinite somewhere in the chain. */
  kNonFiniteGeometry,
};

/** Stable strings matching SelectionGeometryFailure in selectionGeometry.ts. */
const char* SelectionFailureName(SelectionFailure failure);

/**
 * An oriented box in world space.
 *
 * Corners are stored explicitly and in a fixed order rather than as
 * position + size + angle: a stored angle is a second representation that can
 * disagree with the corners, and disagreeing representations are the bug. With
 * corners the angle is derived and cannot drift.
 *
 * `local_bounds` and `world_transform` are kept so resize maths can go back into
 * local space, where the box is axis-aligned by definition.
 */
struct OrientedBounds {
  Point2D top_left;
  Point2D top_right;
  Point2D bottom_right;
  Point2D bottom_left;
  RectF local_bounds;
  Matrix2D world_transform;
};

/**
 * The full local -> world transform of one node, ancestors included.
 *
 * Accumulated exactly as the renderer accumulates it, so this cannot be a
 * different matrix from the one the pixels were drawn with. Returns nullopt when
 * no node has that id.
 */
std::optional<Matrix2D> WorldTransformForNode(const Scene& scene, std::string_view id);

/**
 * A node's place in the transform chain, split into its two factors.
 *
 * `world == parent_world · local_transform`, but all three are returned because a
 * gesture needs the factors and recovering one by inverting the other is not
 * always possible: a node scaled to zero on one axis has a singular local
 * transform and is still draggable. Returned together so the traversal happens
 * once.
 */
struct NodeTransformContext {
  /** Ancestors only. Identity for a root. */
  Matrix2D parent_world;
  /** The node's own transform, as loaded. */
  Matrix2D local_transform;
  /** The matrix the renderer paints with. */
  Matrix2D world_transform;
};

/** The chain context of the node with `id`, or nullopt when no node has it. */
std::optional<NodeTransformContext> TransformContextForNode(const Scene& scene,
                                                            std::string_view id);

/** Oriented bounds from an already-resolved transform and local rect. */
bool OrientedBoundsFrom(const Matrix2D& world_transform,
                        const std::optional<RectF>& local_bounds,
                        OrientedBounds* out,
                        SelectionFailure* failure);

/**
 * Oriented world bounds of the node with `id`.
 *
 * The single entry point for "where is this object". Returns false and sets
 * `failure` rather than producing an approximate box.
 */
bool OrientedBoundsForNode(const Scene& scene, std::string_view id, OrientedBounds* out,
                           SelectionFailure* failure);

/** The four corners in draw order: top-left, top-right, bottom-right, bottom-left. */
void OrientedCorners(const OrientedBounds& bounds, Point2D out[4]);

/** Centre of the oriented box, in world space. */
Point2D OrientedCenter(const OrientedBounds& bounds);

/**
 * Rotation of the box's top edge, degrees clockwise from +x.
 *
 * Derived from the corners, never stored, so the drawn box and the reported angle
 * cannot disagree.
 */
double OrientedAngleDegrees(const OrientedBounds& bounds);

/** True when the transform mirrors the object (odd number of reflections). */
bool OrientedIsFlipped(const OrientedBounds& bounds);

/** World position of a handle, interpolated from the corners. */
Point2D HandleWorldPosition(const OrientedBounds& bounds, ResizeHandle handle);

/** World position of the point that stays fixed while `handle` is dragged. */
Point2D AnchorWorldPosition(const OrientedBounds& bounds, ResizeHandle handle);

/** Local-space position of a handle, for anchor maths. */
Point2D HandleLocalPosition(const OrientedBounds& bounds, ResizeHandle handle);

/**
 * Axis-aligned world bounds covering several nodes.
 *
 * Deliberately a different result type from OrientedBounds: several objects with
 * different rotations have no single orientation, so reporting one would be a
 * lie. Ids that produced no geometry are appended to `failed_ids` instead of being
 * skipped quietly. Returns false when NOTHING resolved.
 */
bool AxisAlignedBoundsForNodes(const Scene& scene, const std::vector<std::string>& ids,
                               RectF* out, std::vector<std::string>* failed_ids);

struct ResizeOptions {
  /** Keep the local aspect ratio; corner handles only, as in the editor. */
  bool preserve_aspect = false;
  /** Resize symmetrically about the box centre instead of the opposite anchor. */
  bool from_center = false;
};

/**
 * New LOCAL bounds after dragging `handle` to `pointer_world`.
 *
 * Done entirely in the node's local space, which is what makes a diagonal drag
 * resize along the object's own rotated axes: local space IS the rotated frame,
 * the bounds are axis-aligned there, and the opposite anchor is fixed by
 * construction. A screen-space equivalent needs an explicit un-rotate step that
 * is easy to get wrong and impossible to extend to skew.
 *
 * Negative extents are preserved rather than clamped, because a flip is a valid
 * transform; callers that cannot represent one must normalise and say so.
 *
 * Returns nullopt when the transform is singular or the result is non-finite.
 */
std::optional<RectF> ResizeLocalBounds(const OrientedBounds& bounds, ResizeHandle handle,
                                       const Point2D& pointer_world,
                                       const ResizeOptions& options = ResizeOptions{});

}  // namespace pydee

#endif  // PYDEE_SELECTION_H_
