// scene.h — the backend-neutral render scene for the Pydee engine.
//
// C++ mirror of frontend/src/editor/renderer/renderScene.ts. It contains only
// resolved numbers, matrices and paint descriptions: no Skia handles, no DOM,
// no document-model semantics. The same scene can be sent to the Skia raster
// backend, a GPU backend, a thumbnail target or an export target.
//
// The scene is a TREE. Group nodes are preserved because group opacity, blend
// mode and effects must composite through an isolated layer; pre-multiplying a
// group's alpha into each child renders overlapping children incorrectly.
//
// Node kinds present here are the ones the engine actually renders today:
// rect, ellipse, path, text and group. Image nodes arrive with the asset
// manager in their own milestone rather than as an unimplemented stub, and the
// encoder reports them instead of dropping them silently.
//
// One responsibility per file: render scene data types.

#ifndef PYDEE_SCENE_H_
#define PYDEE_SCENE_H_

#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "pydee/geometry.h"

namespace pydee {

// Compositing modes, matching the CSS mix-blend-mode keywords used in the
// Canonical_SVG. These map 1:1 onto SkBlendMode.
enum class BlendMode {
  kNormal,
  kMultiply,
  kScreen,
  kOverlay,
  kDarken,
  kLighten,
  kColorDodge,
  kColorBurn,
  kHardLight,
  kSoftLight,
  kDifference,
  kExclusion,
  kHue,
  kSaturation,
  kColor,
  kLuminosity,
  kPlusLighter,
};

// 32-bit colour in 0xAARRGGBB order, identical to SkColor's layout.
using Color = uint32_t;

constexpr Color MakeColor(uint8_t alpha, uint8_t red, uint8_t green, uint8_t blue) {
  return (static_cast<Color>(alpha) << 24) | (static_cast<Color>(red) << 16)
       | (static_cast<Color>(green) << 8) | static_cast<Color>(blue);
}

/** One colour stop of a gradient. `offset` is normalised to 0..1. */
struct GradientStop {
  double offset = 0.0;
  Color color = 0;
};

/** SVG `spreadMethod`: what happens outside the 0..1 range. */
enum class GradientSpread {
  kPad,
  kReflect,
  kRepeat,
};

/**
 * SVG `gradientUnits`.
 *
 * `kObjectBoundingBox` — the default in SVG — means the gradient's coordinates
 * are fractions of the painted object's bounding box, so the backend must map
 * the unit square onto that box at draw time. `kUserSpace` means the
 * coordinates are already in the node's own coordinate system.
 */
enum class GradientUnits {
  kUserSpace,
  kObjectBoundingBox,
};

/**
 * A resolved gradient paint server.
 *
 * The stops are real, resolved values: the scene never invents them. They are
 * parsed from the artboard's `<defs>` on the TypeScript side, so an
 * unresolvable reference stays unresolved and is reported rather than being
 * painted with a guessed colour.
 */
struct Gradient {
  enum class Type {
    kLinear,
    kRadial,
  };

  Type type = Type::kLinear;
  GradientSpread spread = GradientSpread::kPad;
  GradientUnits units = GradientUnits::kObjectBoundingBox;
  /** SVG `gradientTransform`, applied inside the gradient's coordinate system. */
  Matrix2D transform;

  // Linear geometry.
  double x1 = 0.0;
  double y1 = 0.0;
  double x2 = 1.0;
  double y2 = 0.0;

  // Radial geometry. (`fx`, `fy`) is the focal point, which equals the centre
  // unless the document moves it.
  double cx = 0.5;
  double cy = 0.5;
  double r = 0.5;
  double fx = 0.5;
  double fy = 0.5;

  /** In ascending offset order. Fewer than two stops cannot paint a gradient. */
  std::vector<GradientStop> stops;
};

struct Paint {
  enum class Kind {
    kNone,      // Nothing is painted.
    kSolid,     // `color` is used.
    kGradient,  // `gradient` is used; must be non-null.
  };
  Kind kind = Kind::kNone;
  Color color = 0;
  /**
   * Shared because several nodes commonly reference the same paint server, and
   * because copying a stop list per node on every scene load is wasted work.
   */
  std::shared_ptr<const Gradient> gradient;

  static Paint None() { return Paint{}; }
  static Paint Solid(Color color) { return Paint{Kind::kSolid, color, nullptr}; }
  static Paint FromGradient(std::shared_ptr<const Gradient> gradient) {
    return Paint{Kind::kGradient, 0, std::move(gradient)};
  }
};

struct Stroke {
  Paint paint;
  double width = 1.0;
};

enum class NodeKind {
  kRect,
  kEllipse,
  kPath,
  kText,
  kGroup,
};

// Fields shared by every node. `opacity` is this node's own alpha and is NOT
// pre-multiplied with its ancestors.
struct Node {
  virtual ~Node() = default;

  NodeKind kind;
  std::string id;
  Matrix2D local_transform;
  double opacity = 1.0;
  BlendMode blend_mode = BlendMode::kNormal;
  std::optional<RectF> local_bounds;

 protected:
  explicit Node(NodeKind node_kind) : kind(node_kind) {}
};

struct RectNode final : Node {
  RectNode() : Node(NodeKind::kRect) {}

  double x = 0.0;
  double y = 0.0;
  double width = 0.0;
  double height = 0.0;
  double corner_radius = 0.0;
  Paint fill;
  Stroke stroke;
};

struct EllipseNode final : Node {
  EllipseNode() : Node(NodeKind::kEllipse) {}

  double cx = 0.0;
  double cy = 0.0;
  double rx = 0.0;
  double ry = 0.0;
  Paint fill;
  Stroke stroke;
};

struct PathNode final : Node {
  PathNode() : Node(NodeKind::kPath) {}

  // SVG path data, parsed by the backend (Skia via SkParsePath).
  std::string d;
  Paint fill;
  Stroke stroke;
};

/** Horizontal anchoring, matching SVG `text-anchor`. */
enum class TextAlign {
  kLeft,    // text-anchor: start
  kCenter,  // text-anchor: middle
  kRight,   // text-anchor: end
};

/** Paragraph direction. */
enum class TextDirection {
  kLtr,
  kRtl,
};

/**
 * SVG `text-decoration`. Modelled as a small set rather than a bitmask because
 * the document model produces exactly one of these values.
 */
enum class TextDecoration {
  kNone,
  kUnderline,
  kLineThrough,
};

/**
 * Real text, never path-traced geometry (AGENTS.md, Req 6.8).
 *
 * Positioning follows SVG: (`x`, `y`) is the BASELINE origin of the first line,
 * and `align` anchors the line horizontally around `x`. The renderer converts
 * that to the paragraph's top-left using the shaped first-line ascent, so text
 * lands where the canonical SVG puts it.
 */
struct TextNode final : Node {
  TextNode() : Node(NodeKind::kText) {}

  std::string content;
  double x = 0.0;
  double y = 0.0;
  std::string font_family;
  double font_size = 16.0;
  bool bold = false;
  bool italic = false;
  TextAlign align = TextAlign::kLeft;
  TextDirection direction = TextDirection::kLtr;
  TextDecoration decoration = TextDecoration::kNone;
  /** Additional tracking in document pixels; 0 means the font default. */
  double letter_spacing = 0.0;
  /** Absolute line advance in document pixels; 0 means the font default. */
  double line_height = 0.0;
  Paint fill;
};

struct GroupNode final : Node {
  GroupNode() : Node(NodeKind::kGroup) {}

  std::vector<std::unique_ptr<Node>> children;

  // True when the group needs its own compositing layer because its alpha or
  // blend mode must apply to the composed result rather than per child.
  bool isolate = false;
};

struct Scene {
  std::string artboard_id;
  double width = 0.0;
  double height = 0.0;
  // Roots in paint order: index 0 is painted first (furthest back).
  std::vector<std::unique_ptr<Node>> roots;
  // Cache key for the document revision this scene was built from.
  uint64_t revision = 0;
  /**
   * Paint-server references in this scene that no `<defs>` entry resolved.
   * Counted at load time so a missing gradient is reported rather than looking
   * like a rendering bug.
   */
  uint32_t unresolved_paint_references = 0;
};

}  // namespace pydee

#endif  // PYDEE_SCENE_H_
