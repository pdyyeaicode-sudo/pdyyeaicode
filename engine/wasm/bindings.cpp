// bindings.cpp — the WebAssembly surface of the Pydee engine.
//
// This is the ONLY file that knows JavaScript exists, and it exposes the engine's
// own vocabulary: load a scene buffer, move a node, render, hit-test. It includes
// NO Skia header — the surface lives behind pydee::RasterTarget — so no Skia type
// is reachable from JavaScript (spec §7, §45) and the backend can change without
// touching a line of TypeScript.
//
// This translation unit is compiled WITH RTTI, unlike the rest of the engine.
// embind's type identifiers must match those in the prebuilt libembind from the
// Emscripten sysroot, which is compiled with RTTI; building this file with
// -fno-rtti makes every argument type look unbound at runtime. Because the file
// touches no Skia type, the RTTI difference cannot reach Skia's vtables, which is
// exactly why surface ownership was moved behind RasterTarget.
//
// Boundary discipline (spec §46):
//
//  * The scene is uploaded ONCE per document change as a single binary buffer.
//  * Interactive updates go through setNodeTransform, which takes six doubles
//    and allocates nothing. A drag therefore costs a handful of scalars per
//    frame instead of re-serialising the document.
//  * Numbers cross as int/double only. JavaScript numbers are IEEE doubles and
//    represent every 32-bit value exactly, so colours pass as double rather than
//    relying on unsigned-integer marshalling.
//
// Threading: built single-threaded on purpose. Emscripten pthreads require
// SharedArrayBuffer, which forces COOP/COEP headers on the host page and breaks
// third-party embeds.
//
// One responsibility per file: the JavaScript binding layer.

#include <cstdint>
#include <algorithm>
#include <cmath>
#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include <emscripten/bind.h>
#include <emscripten/val.h>

#include "pydee/font_registry.h"
#include "pydee/geometry.h"
#include "pydee/gesture.h"
#include "pydee/raster_target.h"
#include "pydee/renderer.h"
#include "pydee/scene.h"
#include "pydee/scene_codec.h"
#include "pydee/selection.h"
#include "pydee/shape_geometry.h"

namespace {

/**
 * A node plus the transform context it was loaded with.
 *
 * `parent_world` and `base_local` are snapshots taken when the scene loaded.
 * They exist so a document-space drag can be resolved into the node's own
 * parent space without the caller doing matrix algebra, and so repeated drag
 * frames stay relative to the gesture's start instead of accumulating.
 */
struct NodeIndexEntry {
  pydee::Node* node = nullptr;
  pydee::Matrix2D parent_world;
  pydee::Matrix2D base_local;
};

/** Index every node by id, accumulating each one's parent world transform. */
void IndexNodes(const std::vector<std::unique_ptr<pydee::Node>>& nodes,
                const pydee::Matrix2D& parent_world,
                std::unordered_map<std::string, NodeIndexEntry>* out) {
  for (const std::unique_ptr<pydee::Node>& node : nodes) {
    if (!node) {
      continue;
    }
    NodeIndexEntry entry;
    entry.node = node.get();
    entry.parent_world = parent_world;
    entry.base_local = node->local_transform;
    // A duplicate id would make a drag ambiguous, so the first wins and the
    // caller sees the count difference rather than a silent surprise.
    out->emplace(node->id, entry);

    if (node->kind == pydee::NodeKind::kGroup) {
      auto* group = static_cast<pydee::GroupNode*>(node.get());
      IndexNodes(group->children, pydee::Multiply(parent_world, entry.base_local), out);
    }
  }
}

// Locate a node anywhere in the tree by its stable document id.
pydee::Node* FindNode(const std::vector<std::unique_ptr<pydee::Node>>& nodes,
                      const std::string& id) {
  for (const std::unique_ptr<pydee::Node>& node : nodes) {
    if (!node) {
      continue;
    }
    if (node->id == id) {
      return node.get();
    }
    if (node->kind == pydee::NodeKind::kGroup) {
      auto* group = static_cast<pydee::GroupNode*>(node.get());
      if (pydee::Node* found = FindNode(group->children, id)) {
        return found;
      }
    }
  }
  return nullptr;
}

// Topmost leaf containing the document-space point. Mirrors sceneHitTest.ts:
// cheap world-bounds rejection, then an exact test in the node's local space.
//
// `skip_id` is excluded from consideration entirely rather than being reported and
// filtered by the caller. The two are not the same: the creation preview sits on top
// of everything, so reporting-then-filtering turns a press on whatever is underneath
// into a miss, and the user would find that a click near the shape they are drawing
// deselects instead of selecting.
const pydee::Node* HitTestNodes(const std::vector<std::unique_ptr<pydee::Node>>& nodes,
                                const pydee::Matrix2D& parent_world,
                                const pydee::Point2D& point,
                                std::string_view skip_id = std::string_view{}) {
  // Walk in reverse paint order so the topmost node wins.
  for (size_t index = nodes.size(); index > 0; --index) {
    const pydee::Node* node = nodes[index - 1].get();
    if (node == nullptr || node->opacity <= 0.0) {
      continue;
    }
    if (!skip_id.empty() && node->id == skip_id) {
      continue;
    }
    const pydee::Matrix2D world = pydee::Multiply(parent_world, node->local_transform);

    if (node->kind == pydee::NodeKind::kGroup) {
      const auto* group = static_cast<const pydee::GroupNode*>(node);
      if (const pydee::Node* hit = HitTestNodes(group->children, world, point, skip_id)) {
        return hit;
      }
      continue;
    }

    if (!node->local_bounds.has_value()) {
      // Unknown bounds: refuse to guess rather than report a wrong hit.
      continue;
    }
    if (!pydee::RectContainsPoint(pydee::TransformRect(world, *node->local_bounds), point)) {
      continue;
    }

    const std::optional<pydee::Matrix2D> inverse = pydee::Invert(world);
    if (!inverse.has_value()) {
      continue;
    }
    const pydee::Point2D local = pydee::TransformPoint(*inverse, point);

    if (node->kind == pydee::NodeKind::kEllipse) {
      const auto* ellipse = static_cast<const pydee::EllipseNode*>(node);
      if (ellipse->rx <= 0.0 || ellipse->ry <= 0.0) {
        continue;
      }
      const double dx = (local.x - ellipse->cx) / ellipse->rx;
      const double dy = (local.y - ellipse->cy) / ellipse->ry;
      if (dx * dx + dy * dy <= 1.0) {
        return node;
      }
      continue;
    }

    if (pydee::RectContainsPoint(*node->local_bounds, local)) {
      return node;
    }
  }
  return nullptr;
}

/**
 * JavaScript views of the engine's geometry types.
 *
 * Plain objects with the same field names the TypeScript side already uses, so
 * the boundary needs no adapter layer that could reorder or rename anything.
 */
emscripten::val MatrixToVal(const pydee::Matrix2D& m) {
  emscripten::val out = emscripten::val::object();
  out.set("a", m.a);
  out.set("b", m.b);
  out.set("c", m.c);
  out.set("d", m.d);
  out.set("e", m.e);
  out.set("f", m.f);
  return out;
}

emscripten::val PointToVal(const pydee::Point2D& point) {
  emscripten::val out = emscripten::val::object();
  out.set("x", point.x);
  out.set("y", point.y);
  return out;
}

emscripten::val RectToVal(const pydee::RectF& rect) {
  emscripten::val out = emscripten::val::object();
  out.set("x", rect.x);
  out.set("y", rect.y);
  out.set("width", rect.width);
  out.set("height", rect.height);
  return out;
}

/** `{ ok: false, reason }`, so a caller can never mistake a failure for a box. */
emscripten::val GeometryFailureToVal(pydee::SelectionFailure failure) {
  emscripten::val out = emscripten::val::object();
  out.set("ok", false);
  out.set("reason", std::string(pydee::SelectionFailureName(failure)));
  return out;
}

/** The same shape for a gesture that could not be solved. */
emscripten::val GestureFailureToVal(pydee::GestureFailure failure) {
  emscripten::val out = emscripten::val::object();
  out.set("ok", false);
  out.set("reason", std::string(pydee::GestureFailureName(failure)));
  return out;
}

}  // namespace

// A rendering session: one surface plus the current scene.
class PydeeSurface {
 public:
  PydeeSurface(int width, int height)
      : target_(pydee::RasterTarget::Create(width, height)),
        fonts_(pydee::FontRegistry::Create()) {}

  bool isValid() const { return target_ != nullptr && fonts_ != nullptr; }
  int width() const { return target_ != nullptr ? target_->width() : 0; }
  int height() const { return target_ != nullptr ? target_->height() : 0; }

  /**
   * Register a font binary under a family name.
   *
   * Text does not render until a font is registered: the browser gives WASM no
   * system font enumeration, and substituting one would produce metrics that
   * disagree with the exported SVG. Returns false when the bytes are not a font
   * Skia can decode, so a bad upload is reported rather than silently ignored.
   */
  bool registerFont(const std::string& family, emscripten::val bytes) {
    if (fonts_ == nullptr) {
      return false;
    }
    const std::vector<uint8_t> data = emscripten::convertJSArrayToNumberVector<uint8_t>(bytes);
    return fonts_->Register(family, data.data(), data.size());
  }

  bool hasFont(const std::string& family) const {
    return fonts_ != nullptr && fonts_->HasFamily(family);
  }

  int fontCount() const {
    return fonts_ == nullptr ? 0 : static_cast<int>(fonts_->Families().size());
  }

  /**
   * Shaped text extents, so the editor can compute exact text bounds instead of
   * approximating them. Returns an empty value when no font resolves.
   */
  emscripten::val measureText(const std::string& family, const std::string& content,
                              double fontSize, bool bold, bool italic, double letterSpacing,
                              double lineHeight) {
    if (fonts_ == nullptr) {
      return emscripten::val::null();
    }
    pydee::TextNode node;
    node.font_family = family;
    node.content = content;
    node.font_size = fontSize;
    node.bold = bold;
    node.italic = italic;
    node.letter_spacing = letterSpacing;
    node.line_height = lineHeight;

    pydee::TextMetrics metrics;
    if (!fonts_->Measure(node, &metrics)) {
      return emscripten::val::null();
    }
    emscripten::val result = emscripten::val::object();
    result.set("width", metrics.width);
    result.set("height", metrics.height);
    result.set("firstLineAscent", metrics.first_line_ascent);
    result.set("lineCount", metrics.line_count);
    return result;
  }

  // Upload a scene as a single binary buffer. Returns an empty string on
  // success, or the decoder's reason on failure.
  //
  // Takes a Uint8Array, NOT a string: embind UTF-8 encodes JavaScript strings,
  // so every byte >= 0x80 would expand to two bytes and silently corrupt the
  // buffer. Binary data must cross as an array of numbers.
  /**
   * Parse the artboard's `<defs>` markup so `url(#id)` paints can resolve.
   *
   * Called before `loadScene`. Kept in C++ deliberately: gradient geometry,
   * percentage resolution against the viewport and `gradientTransform`
   * composition are rendering calculations, and a second implementation in
   * TypeScript would be a second set of rounding and default-value decisions
   * that could drift from this one.
   *
   * Returns "" on success, or a reason. Markup with no paint servers is not an
   * error.
   */
  std::string loadDefs(const std::string& markup, double viewportWidth, double viewportHeight) {
    std::string error;
    if (!paint_servers_.Parse(markup, viewportWidth, viewportHeight, &error)) {
      return error.empty() ? std::string("defs parse failed") : error;
    }
    return std::string();
  }

  /** Paint servers successfully parsed from the last `loadDefs` call. */
  int paintServerCount() const { return static_cast<int>(paint_servers_.size()); }

  /** Paint servers found in the defs that the engine could not represent. */
  int unsupportedPaintServers() const { return paint_servers_.unsupported(); }

  /**
   * `url(#id)` paints in the loaded scene that no defs entry resolved. Reported
   * so a missing gradient is visible as a diagnostic instead of a blank shape.
   */
  int unresolvedPaintReferences() const {
    return static_cast<int>(scene_.unresolved_paint_references);
  }

  std::string loadScene(emscripten::val bytes) {
    const std::vector<uint8_t> data = emscripten::convertJSArrayToNumberVector<uint8_t>(bytes);
    pydee::Scene scene;
    std::string error;
    const bool ok = pydee::DecodeScene(data.data(), data.size(), &scene, &error, &paint_servers_);
    if (!ok) {
      return error.empty() ? std::string("scene decode failed") : error;
    }
    scene_ = std::move(scene);
    node_index_.clear();
    IndexNodes(scene_.roots, pydee::Identity(), &node_index_);
    // A new scene invalidates any snapshot taken against the old one: the node it
    // referred to may not exist, and its base transform certainly does not apply.
    // Dropped rather than carried forward, so a gesture cannot resume against
    // geometry it was never measured on.
    gesture_.reset();
    gesture_id_.clear();
    /*
      A creation gesture cannot survive either.

      Its ephemeral node lived in `scene_.roots`, which has just been replaced, so the
      state flags would claim a drag was running against a node that no longer exists
      and the next frame would append a second one. Cleared here rather than in the
      caller, because `loadScene` is the thing that destroyed it.
    */
    shape_create_active_ = false;
    shape_preview_data_.clear();
    // A new scene invalidates every pixel: node ids, geometry and paint may all differ.
    invalidateAll();
    return std::string();
  }

  // Hot path for drags: six scalars, no allocation, no re-upload.
  bool setNodeTransform(const std::string& id, double a, double b, double c, double d, double e,
                        double f) {
    pydee::Node* node = FindNode(scene_.roots, id);
    if (node == nullptr) {
      return false;
    }
    // Where it WAS, then where it went. Both, or a partial repaint leaves the old
    // position painted on the canvas.
    noteNodeDamage(id);
    node->local_transform = pydee::Matrix2D{a, b, c, d, e, f};
    noteNodeDamage(id);
    return true;
  }

  /**
   * Move a node by a document-space offset, relative to where the scene loaded
   * it.
   *
   * This is the drag entry point, and it lives here rather than in TypeScript
   * because getting it right requires the ancestor transform chain, which only
   * the engine has. A node's local transform maps into its parent's space, so a
   * document-space translation `T` becomes `P⁻¹ · T · P` in that space, where
   * `P` is the parent's world transform. Applying `T` directly would drag a
   * node inside a rotated or scaled group in the wrong direction, and by the
   * wrong amount.
   *
   * Relative to the loaded transform, not the current one, so a stream of drag
   * frames cannot accumulate rounding error.
   */
  bool setNodeDocumentTranslation(const std::string& id, double dx, double dy) {
    const auto found = node_index_.find(id);
    if (found == node_index_.end()) {
      return false;
    }
    const NodeIndexEntry& entry = found->second;
    const std::optional<pydee::Matrix2D> inverse = pydee::Invert(entry.parent_world);
    if (!inverse.has_value()) {
      // A degenerate ancestor transform collapses the node; reported, not
      // silently approximated with an unmapped offset.
      return false;
    }
    const pydee::Matrix2D in_parent_space = pydee::Multiply(
        *inverse, pydee::Multiply(pydee::Translation(dx, dy), entry.parent_world));
    noteNodeDamage(id);
    entry.node->local_transform = pydee::Multiply(in_parent_space, entry.base_local);
    noteNodeDamage(id);
    return true;
  }

  /** Nodes indexed from the loaded scene, so a caller can verify id coverage. */
  int nodeCount() const { return static_cast<int>(node_index_.size()); }

  /**
   * Root nodes actually in the scene, INCLUDING the ephemeral creation preview.
   *
   * A different question from `nodeCount`, which reports the document index and
   * deliberately excludes the preview. Exposed so a test can prove the preview does
   * not accumulate a node per pointer sample — the failure mode that would make a
   * long drag quietly grow the scene.
   */
  int sceneRootCount() const { return static_cast<int>(scene_.roots.size()); }

  // --- damage tracking ----------------------------------------------------
  //
  // Why this exists, in numbers: rendering and reading back the whole surface each
  // cost about 34-44ms per MEGAPIXEL in WebAssembly, so at the editor's default
  // 1080x1080 document a single drag frame costs ~92ms — under 12fps — for a gesture
  // that moved one small object. Both costs are proportional to AREA, so making them
  // proportional to what actually changed is the difference between 12fps and a frame
  // to spare.
  //
  // The engine tracks damage rather than the caller because only the engine knows a
  // node's world bounds before and after a transform change. Handing that job to
  // JavaScript would mean recomputing the transform chain there — the exact
  // duplication this architecture removes.

  /**
   * Union `id`'s current world bounds into the damage rect.
   *
   * Called before AND after a transform changes, so the damage covers where the object
   * was and where it went. Missing either one leaves a trail of stale pixels, which is
   * why this is not a single call taking the new bounds.
   */
  void noteNodeDamage(const std::string& id) {
    pydee::OrientedBounds bounds;
    pydee::SelectionFailure failure = pydee::SelectionFailure::kNodeNotFound;
    if (!pydee::OrientedBoundsForNode(scene_, id, &bounds, &failure)) {
      // No resolvable geometry means no bound on what changed, so the whole surface is
      // marked. Refusing to guess a smaller rect is the only safe answer.
      damage_is_everything_ = true;
      return;
    }
    pydee::Point2D corners[4];
    pydee::OrientedCorners(bounds, corners);
    for (const pydee::Point2D& corner : corners) {
      if (!std::isfinite(corner.x) || !std::isfinite(corner.y)) {
        damage_is_everything_ = true;
        return;
      }
      if (!has_damage_) {
        damage_min_x_ = damage_max_x_ = corner.x;
        damage_min_y_ = damage_max_y_ = corner.y;
        has_damage_ = true;
        continue;
      }
      damage_min_x_ = std::min(damage_min_x_, corner.x);
      damage_min_y_ = std::min(damage_min_y_, corner.y);
      damage_max_x_ = std::max(damage_max_x_, corner.x);
      damage_max_y_ = std::max(damage_max_y_, corner.y);
    }
  }

  /** Mark the entire surface as needing a repaint. */
  void invalidateAll() {
    damage_is_everything_ = true;
    has_damage_ = false;
  }

  /** True when a partial repaint is possible: some damage, and not the whole surface. */
  bool hasPartialDamage() const { return has_damage_ && !damage_is_everything_; }

  /**
   * Render only the damaged region and report it, or `{ ok: false }` when a full
   * repaint is required.
   *
   * `padding` is added on every side in document units, because a stroke, a shadow and
   * antialiasing all paint outside a node's bounds. The caller supplies it rather than
   * this file assuming one, since the right value depends on the largest stroke width in
   * the scene — and getting it wrong leaves a one-pixel ghost, which is exactly the kind
   * of artefact that makes partial repainting look broken.
   */
  emscripten::val renderDamaged(double a, double b, double c, double d, double e, double f,
                                double pixel_ratio, double background_color,
                                bool use_background, double padding) {
    emscripten::val out = emscripten::val::object();
    if (target_ == nullptr || !hasPartialDamage()) {
      out.set("ok", false);
      out.set("reason", std::string(damage_is_everything_ ? "full-repaint-required"
                                                        : "no-damage"));
      return out;
    }

    // Snapped OUTWARD to whole pixels. A fractional rect would leave the boundary pixel
    // partly redrawn, and the caller has to copy whole pixels anyway.
    const double left = std::floor(damage_min_x_ - padding);
    const double top = std::floor(damage_min_y_ - padding);
    const double right = std::ceil(damage_max_x_ + padding);
    const double bottom = std::ceil(damage_max_y_ + padding);

    pydee::RenderOptions options;
    options.view_transform = pydee::Matrix2D{a, b, c, d, e, f};
    options.pixel_ratio = pixel_ratio;
    const pydee::RectF region{left, top, right - left, bottom - top};
    // Both: `dirty_rect` clips the canvas so Skia rasterises only this area, and
    // `cull_rect` skips nodes that cannot touch it so their paints are never even set up.
    options.dirty_rect = region;
    options.cull_rect = region;
    if (use_background) {
      options.background_color =
          static_cast<pydee::Color>(static_cast<int64_t>(background_color));
    }

    const pydee::RenderStats stats = target_->Render(scene_, options, fonts_.get());
    last_nodes_drawn_ = static_cast<int>(stats.nodes_drawn);
    last_nodes_culled_ = static_cast<int>(stats.nodes_culled);
    last_layers_opened_ = static_cast<int>(stats.layers_opened);

    clearDamage();

    out.set("ok", true);
    out.set("x", left);
    out.set("y", top);
    out.set("width", right - left);
    out.set("height", bottom - top);
    out.set("nodesDrawn", last_nodes_drawn_);
    out.set("nodesCulled", last_nodes_culled_);
    return out;
  }

  /**
   * Read one rectangle of the surface, tightly packed.
   *
   * Returns a view onto engine memory, valid until the next call. The caller copies it
   * into an ImageData sized to the same rectangle; nothing outside it is touched, which
   * is what makes the canvas's retained content the rest of the frame.
   */
  emscripten::val readPixelsRegion(double x, double y, double width, double height) {
    if (target_ == nullptr) {
      return emscripten::val::null();
    }
    const int left = static_cast<int>(std::floor(x));
    const int top = static_cast<int>(std::floor(y));
    const int right = static_cast<int>(std::ceil(x + width));
    const int bottom = static_cast<int>(std::ceil(y + height));
    if (!target_->ReadPixelsRegionRGBA(left, top, right - left, bottom - top,
                                       &pixel_buffer_)) {
      return emscripten::val::null();
    }
    const int clamped_left = std::max(0, left);
    const int clamped_top = std::max(0, top);
    const int clamped_right = std::min(target_->width(), right);
    const int clamped_bottom = std::min(target_->height(), bottom);
    const size_t used = static_cast<size_t>(clamped_right - clamped_left)
                      * static_cast<size_t>(clamped_bottom - clamped_top) * 4u;

    emscripten::val out = emscripten::val::object();
    out.set("x", clamped_left);
    out.set("y", clamped_top);
    out.set("width", clamped_right - clamped_left);
    out.set("height", clamped_bottom - clamped_top);
    out.set("pixels",
            emscripten::val(emscripten::typed_memory_view(used, pixel_buffer_.data())));
    return out;
  }

  bool setNodeOpacity(const std::string& id, double opacity) {
    pydee::Node* node = FindNode(scene_.roots, id);
    if (node == nullptr) {
      return false;
    }
    node->opacity = opacity;
    return true;
  }

  // Render with the view transform supplied as scalars. Returns the number of
  // nodes drawn, or -1 when the surface is invalid.
  int render(double a, double b, double c, double d, double e, double f, double pixel_ratio,
             double background_color, bool use_background) {
    if (target_ == nullptr) {
      return -1;
    }
    pydee::RenderOptions options;
    options.view_transform = pydee::Matrix2D{a, b, c, d, e, f};
    options.pixel_ratio = pixel_ratio;
    if (use_background) {
      options.background_color =
          static_cast<pydee::Color>(static_cast<int64_t>(background_color));
    }
    const pydee::RenderStats stats = target_->Render(scene_, options, fonts_.get());
    last_nodes_drawn_ = static_cast<int>(stats.nodes_drawn);
    last_nodes_culled_ = static_cast<int>(stats.nodes_culled);
    last_layers_opened_ = static_cast<int>(stats.layers_opened);
    // A full render satisfies every outstanding damage claim.
    clearDamage();
    return last_nodes_drawn_;
  }

  int lastNodesDrawn() const { return last_nodes_drawn_; }
  int lastNodesCulled() const { return last_nodes_culled_; }
  int lastLayersOpened() const { return last_layers_opened_; }

  /** Text nodes in the last render with no resolvable font. */
  int lastUnresolvedText() const {
    return target_ == nullptr ? 0 : target_->unresolved_text();
  }

  /** Path nodes in the last render whose SVG path data could not be parsed. */
  int lastUnparsablePaths() const {
    return target_ == nullptr ? 0 : target_->unparsable_paths();
  }

  /** Paints in the last render the engine could not honour at all. */
  int lastUnresolvedPaints() const {
    return target_ == nullptr ? 0 : target_->unresolved_paints();
  }

  /** Paints in the last render drawn with a documented approximation. */
  int lastApproximatedPaints() const {
    return target_ == nullptr ? 0 : target_->approximated_paints();
  }

  // Topmost node id at a document-space point, or "" when nothing is hit.
  std::string hitTest(double x, double y) {
    /*
      The creation preview is EXCLUDED from the walk, not filtered from its result.

      It is painted into the same scene so it composites, culls and damages like
      everything else, but it is not an object yet: an id the document has never
      contained would be handed straight to commands that cannot find it. Skipping it
      inside the walk means a press lands on whatever is UNDERNEATH, whereas
      discarding the result afterwards would turn that press into a miss — so a click
      near the shape being drawn would deselect instead of selecting.
    */
    const pydee::Node* hit = HitTestNodes(scene_.roots, pydee::Identity(),
                                          pydee::Point2D{x, y}, shapePreviewId());
    return hit != nullptr ? hit->id : std::string();
  }

  /**
   * The node's full local -> world matrix, ancestors included, or null.
   *
   * This is the matrix the renderer paints with, returned unchanged. Selection UI
   * asks for it rather than reconstructing it, which is what makes the outline and
   * the pixels incapable of disagreeing.
   */
  emscripten::val getWorldTransform(const std::string& id) {
    const std::optional<pydee::Matrix2D> world = pydee::WorldTransformForNode(scene_, id);
    if (!world.has_value()) {
      return emscripten::val::null();
    }
    return MatrixToVal(*world);
  }

  /**
   * The node's four world-space corners in draw order, or `{ ok: false, reason }`.
   *
   *     worldCorner = worldTransform x localCorner
   *
   * Rotation, scale, skew, flip and every ancestor group transform are already
   * inside the matrix, so nothing here needs to know what a rotation is.
   */
  emscripten::val getWorldCorners(const std::string& id) {
    pydee::OrientedBounds bounds;
    pydee::SelectionFailure failure = pydee::SelectionFailure::kNodeNotFound;
    if (!pydee::OrientedBoundsForNode(scene_, id, &bounds, &failure)) {
      return GeometryFailureToVal(failure);
    }
    pydee::Point2D corners[4];
    pydee::OrientedCorners(bounds, corners);

    emscripten::val list = emscripten::val::array();
    for (int index = 0; index < 4; ++index) {
      list.set(index, PointToVal(corners[index]));
    }
    emscripten::val out = emscripten::val::object();
    out.set("ok", true);
    out.set("corners", list);
    return out;
  }

  /**
   * Everything the selection UI needs for one node, in world and local space.
   *
   * The angle and the flip flag are DERIVED from the corners and the matrix
   * determinant rather than stored, so they cannot drift from the box that is
   * drawn. Viewport conversion is deliberately not done here: it needs the host
   * element's live origin, which is a fact about the frame, not the object.
   */
  emscripten::val getOrientedBounds(const std::string& id) {
    pydee::OrientedBounds bounds;
    pydee::SelectionFailure failure = pydee::SelectionFailure::kNodeNotFound;
    if (!pydee::OrientedBoundsForNode(scene_, id, &bounds, &failure)) {
      return GeometryFailureToVal(failure);
    }

    pydee::Point2D corners[4];
    pydee::OrientedCorners(bounds, corners);
    emscripten::val corner_list = emscripten::val::array();
    for (int index = 0; index < 4; ++index) {
      corner_list.set(index, PointToVal(corners[index]));
    }

    emscripten::val handles = emscripten::val::object();
    for (const pydee::ResizeHandle handle : pydee::kResizeHandles) {
      handles.set(std::string(pydee::ResizeHandleName(handle)),
                  PointToVal(pydee::HandleWorldPosition(bounds, handle)));
    }

    emscripten::val out = emscripten::val::object();
    out.set("ok", true);
    out.set("corners", corner_list);
    out.set("topLeft", PointToVal(bounds.top_left));
    out.set("topRight", PointToVal(bounds.top_right));
    out.set("bottomRight", PointToVal(bounds.bottom_right));
    out.set("bottomLeft", PointToVal(bounds.bottom_left));
    out.set("center", PointToVal(pydee::OrientedCenter(bounds)));
    out.set("angle", pydee::OrientedAngleDegrees(bounds));
    out.set("flipped", pydee::OrientedIsFlipped(bounds));
    out.set("localBounds", RectToVal(bounds.local_bounds));
    out.set("worldTransform", MatrixToVal(bounds.world_transform));
    out.set("handles", handles);
    return out;
  }

  /**
   * Axis-aligned world bounds covering several ids.
   *
   * A multi-selection has no single orientation, so this returns a plain rect and
   * says so by shape. Ids that resolved to no geometry come back in `failed`
   * instead of being dropped quietly.
   */
  emscripten::val getAxisAlignedBounds(emscripten::val ids) {
    const std::vector<std::string> id_list = emscripten::vecFromJSArray<std::string>(ids);
    pydee::RectF rect;
    std::vector<std::string> failed;
    if (!pydee::AxisAlignedBoundsForNodes(scene_, id_list, &rect, &failed)) {
      emscripten::val out = emscripten::val::object();
      out.set("ok", false);
      out.set("reason", std::string("no-geometry"));
      emscripten::val failed_list = emscripten::val::array();
      for (size_t index = 0; index < failed.size(); ++index) {
        failed_list.set(static_cast<int>(index), failed[index]);
      }
      out.set("failed", failed_list);
      return out;
    }
    emscripten::val failed_list = emscripten::val::array();
    for (size_t index = 0; index < failed.size(); ++index) {
      failed_list.set(static_cast<int>(index), failed[index]);
    }
    emscripten::val out = emscripten::val::object();
    out.set("ok", true);
    out.set("rect", RectToVal(rect));
    out.set("failed", failed_list);
    return out;
  }

  /**
   * New LOCAL bounds after dragging `handle` to a world-space pointer position.
   *
   * The resize is solved in the node's own local space, which is why a diagonal
   * drag on a rotated object resizes along the object's axes instead of the
   * screen's. Returns null for a singular transform or a non-finite result rather
   * than a clamped guess.
   */
  emscripten::val resizeLocalBounds(const std::string& id, const std::string& handle,
                                    double pointerX, double pointerY, bool preserveAspect,
                                    bool fromCenter) {
    const std::optional<pydee::ResizeHandle> parsed = pydee::ParseResizeHandle(handle);
    if (!parsed.has_value()) {
      return emscripten::val::null();
    }
    pydee::OrientedBounds bounds;
    pydee::SelectionFailure failure = pydee::SelectionFailure::kNodeNotFound;
    if (!pydee::OrientedBoundsForNode(scene_, id, &bounds, &failure)) {
      return emscripten::val::null();
    }
    pydee::ResizeOptions options;
    options.preserve_aspect = preserveAspect;
    options.from_center = fromCenter;

    const std::optional<pydee::RectF> resized =
        pydee::ResizeLocalBounds(bounds, *parsed, pydee::Point2D{pointerX, pointerY}, options);
    if (!resized.has_value()) {
      return emscripten::val::null();
    }
    return RectToVal(*resized);
  }

  // --- gesture lifecycle --------------------------------------------------
  //
  // A drag, a resize and a rotate are the same three calls: begin, update,
  // end/cancel. The MATHEMATICS is in gesture.cpp and is pure; the only state here
  // is which snapshot is active, which is a fact about this session rather than
  // hidden global state.
  //
  // Solving from a snapshot taken at pointer-down is what keeps a 200-sample drag
  // free of accumulated drift: frame 200 is computed from the same base as frame 1.
  // It is also why `update` never reads the node's current transform.

  /**
   * Capture the gesture snapshot for `id`.
   *
   * `kind` is "move" | "resize" | "rotate"; `handle` is a compass name and is
   * ignored for anything but a resize. Returns `{ ok: true, ... }` with the frame
   * the gesture starts from, or `{ ok: false, reason }` — never a partial start,
   * because a gesture that began without geometry would commit an arbitrary
   * transform on release.
   */
  emscripten::val beginTransformGesture(const std::string& id, const std::string& kind,
                                        const std::string& handle, double pointerX,
                                        double pointerY) {
    const std::optional<pydee::GestureKind> parsed_kind = pydee::ParseGestureKind(kind);
    if (!parsed_kind.has_value()) {
      emscripten::val out = emscripten::val::object();
      out.set("ok", false);
      out.set("reason", std::string("unknown-gesture-kind"));
      return out;
    }
    // A resize needs a real handle; the other kinds do not use one, so an empty
    // string is accepted rather than forcing callers to invent a value.
    const std::optional<pydee::ResizeHandle> parsed_handle = pydee::ParseResizeHandle(handle);
    if (*parsed_kind == pydee::GestureKind::kResize && !parsed_handle.has_value()) {
      emscripten::val out = emscripten::val::object();
      out.set("ok", false);
      out.set("reason", std::string("unknown-resize-handle"));
      return out;
    }

    pydee::GestureSnapshot snapshot;
    pydee::SelectionFailure failure = pydee::SelectionFailure::kNodeNotFound;
    if (!pydee::BeginGesture(scene_, id, *parsed_kind,
                             parsed_handle.value_or(pydee::ResizeHandle::kSouthEast),
                             pydee::Point2D{pointerX, pointerY}, &snapshot, &failure)) {
      gesture_.reset();
      return GeometryFailureToVal(failure);
    }
    gesture_ = snapshot;
    gesture_id_ = id;

    // The starting frame: the pointer has not moved, so the transform is the one the
    // node already has. Returned so the caller can draw from the engine's answer
    // from the very first frame instead of from its own copy of the geometry.
    pydee::GestureFrame frame;
    frame.local_transform = snapshot.base_local;
    frame.local_bounds = snapshot.bounds.local_bounds;
    return GestureFrameToVal(snapshot, frame);
  }

  /**
   * One frame of the active gesture, applied to the scene.
   *
   * The node's transform is written here rather than returned for the caller to
   * apply, because the next `render` must already include it — routing the value
   * back through JavaScript would put a round trip on the hot path for no gain.
   * The value is returned as well, for the selection chrome.
   */
  emscripten::val updateTransformGesture(double pointerX, double pointerY,
                                         bool preserveAspect, bool fromCenter,
                                         double angleSnapDegrees) {
    if (!gesture_.has_value()) {
      emscripten::val out = emscripten::val::object();
      out.set("ok", false);
      out.set("reason", std::string("no-active-gesture"));
      return out;
    }
    pydee::GestureModifiers modifiers;
    modifiers.preserve_aspect = preserveAspect;
    modifiers.from_center = fromCenter;
    modifiers.angle_snap_degrees = angleSnapDegrees;

    pydee::GestureFailure failure = pydee::GestureFailure::kNonFiniteResult;
    const std::optional<pydee::GestureFrame> frame = pydee::SolveGesture(
        *gesture_, pydee::Point2D{pointerX, pointerY}, modifiers, &failure);
    if (!frame.has_value()) {
      // The previous frame stays on screen. Applying a partly-solved transform
      // would move the object somewhere the pointer never was.
      return GestureFailureToVal(failure);
    }
    if (!applyGestureTransform(frame->local_transform)) {
      emscripten::val out = emscripten::val::object();
      out.set("ok", false);
      out.set("reason", std::string("node-not-found"));
      return out;
    }
    return GestureFrameToVal(*gesture_, *frame);
  }

  /**
   * Finish the gesture, leaving the scene at its final state.
   *
   * The transform stays applied on purpose: the document commit that follows
   * triggers a re-upload, and reverting here first would show one frame of the
   * object back at its old position — the snap-back this architecture exists to
   * remove.
   */
  emscripten::val endTransformGesture(double pointerX, double pointerY, bool preserveAspect,
                                      bool fromCenter, double angleSnapDegrees) {
    if (!gesture_.has_value()) {
      emscripten::val out = emscripten::val::object();
      out.set("ok", false);
      out.set("reason", std::string("no-active-gesture"));
      return out;
    }
    const emscripten::val result =
        updateTransformGesture(pointerX, pointerY, preserveAspect, fromCenter,
                               angleSnapDegrees);
    gesture_.reset();
    gesture_id_.clear();
    return result;
  }

  /**
   * Abandon the gesture and put the node back exactly where it started.
   *
   * Restored from the snapshot, not by inverting the applied transform: an inverse
   * accumulates error and does not exist at all for a degenerate frame.
   */
  bool cancelTransformGesture() {
    if (!gesture_.has_value()) {
      return false;
    }
    const bool restored = applyGestureTransform(gesture_->base_local);
    gesture_.reset();
    gesture_id_.clear();
    return restored;
  }

  /** True while a gesture snapshot is held. For asserting the wiring in tests. */
  bool hasActiveGesture() const { return gesture_.has_value(); }

  /**
   * Which part of `id`'s selection chrome a document-space point is on.
   *
   * This is what replaces invisible DOM handle elements. The same geometry that
   * decides where a handle is DRAWN decides what a point hits, so a target can never
   * be somewhere other than the handle it belongs to.
   *
   * Sizes arrive in world units: the caller divides its screen-pixel constants by
   * the zoom, because that conversion is a length and belongs to whoever knows the
   * zoom.
   */
  emscripten::val hitTestSelectionHandle(const std::string& id, double x, double y,
                                         double handleSize, double rotationOffset,
                                         double rotationRadius, double cornerRotationOffset,
                                         double cornerRotationSize) {
    pydee::OrientedBounds bounds;
    pydee::SelectionFailure failure = pydee::SelectionFailure::kNodeNotFound;
    if (!pydee::OrientedBoundsForNode(scene_, id, &bounds, &failure)) {
      return GeometryFailureToVal(failure);
    }
    pydee::HandleHitOptions options;
    options.handle_size = handleSize;
    options.rotation_offset = rotationOffset;
    options.rotation_radius = rotationRadius;
    options.corner_rotation_offset = cornerRotationOffset;
    options.corner_rotation_size = cornerRotationSize;

    const pydee::HandleHit hit =
        pydee::HitTestSelection(bounds, pydee::Point2D{x, y}, options);
    emscripten::val out = emscripten::val::object();
    out.set("ok", true);
    out.set("region", std::string(pydee::HandleRegionName(hit.region)));
    out.set("handle", std::string(pydee::ResizeHandleName(hit.handle)));
    const std::optional<pydee::Point2D> control =
        pydee::RotationControlPosition(bounds, rotationOffset);
    out.set("rotationControl",
            control.has_value() ? PointToVal(*control) : emscripten::val::null());
    return out;
  }

  // Rendered surface as unpremultiplied RGBA bytes. Used by the headless smoke
  // test and by thumbnail/export paths.
  emscripten::val readPixels() {    if (target_ == nullptr) {
      return emscripten::val::null();
    }
    if (!target_->ReadPixelsRGBA(&pixel_buffer_)) {
      return emscripten::val::null();
    }
    return emscripten::val(
        emscripten::typed_memory_view(pixel_buffer_.size(), pixel_buffer_.data()));
  }

  // ------------------------------------------------------------------------- //
  // Shape creation: an ephemeral outline the engine owns for the gesture's life
  // ------------------------------------------------------------------------- //

  /**
   * Change the parameters the outline is built with. Valid before or during a drag.
   *
   * Separate from `beginShapeCreate` so a star's point count can change mid-gesture
   * without restarting it, and so the common case is a six-argument call instead of
   * a twelve-argument one. All ratios, never lengths: a ratio survives a resize
   * without being rescaled, which is what stops repeated resizes from compounding.
   */
  bool setShapeCreateParameters(double point_count, double inner_ratio, double corner_ratio,
                                double thickness_ratio, double hole_ratio, double head_ratio) {
    pydee::ShapeParameters next;
    next.point_count = static_cast<int>(point_count);
    next.inner_ratio = inner_ratio;
    next.corner_ratio = corner_ratio;
    next.thickness_ratio = thickness_ratio;
    next.hole_ratio = hole_ratio;
    next.head_ratio = head_ratio;
    shape_parameters_ = next;
    // Rebuilt immediately when a drag is already running, so a parameter change is
    // visible on the next frame rather than on the next pointer move.
    if (shape_create_active_) {
      return rebuildShapePreview();
    }
    return true;
  }

  /**
   * Start a creation gesture at a document point.
   *
   * The ephemeral node is appended to the scene roots so it paints last, on top of
   * everything, and so the existing damage machinery can find it by id. It is NOT a
   * document node: nothing serialises it, nothing selects it, and it is removed on
   * commit or cancel. That is what lets the preview update sixty times a second —
   * the alternative was re-encoding the whole scene and calling `loadScene`, which
   * replaces the scene, drops the node index, cancels any gesture and forces a full
   * repaint every frame.
   */
  emscripten::val beginShapeCreate(std::string shape_type, double start_x, double start_y,
                                   double fill_argb, double stroke_argb, double stroke_width) {
    emscripten::val out = emscripten::val::object();
    const auto kind = pydee::ParseShapeKind(shape_type);
    if (!kind.has_value()) {
      out.set("ok", false);
      out.set("reason", std::string("unknown-shape-kind"));
      return out;
    }
    if (!std::isfinite(start_x) || !std::isfinite(start_y)) {
      out.set("ok", false);
      out.set("reason", std::string("non-finite-point"));
      return out;
    }
    // A second begin without an end would leak the previous node, so the previous
    // gesture is abandoned explicitly rather than left dangling.
    cancelShapeCreate();

    shape_kind_ = *kind;
    shape_start_ = pydee::Point2D{start_x, start_y};
    shape_current_ = shape_start_;
    shape_fill_ = static_cast<pydee::Color>(static_cast<int64_t>(fill_argb));
    shape_stroke_ = static_cast<pydee::Color>(static_cast<int64_t>(stroke_argb));
    shape_stroke_width_ = stroke_width;
    shape_preview_data_.clear();
    shape_create_active_ = true;

    // No outline yet: a zero-extent box is not a shape, and inventing a minimum size
    // would show the user geometry they did not ask for. The node appears on the
    // first update that produces real extents.
    out.set("ok", true);
    out.set("kind", std::string(pydee::ShapeKindName(shape_kind_)));
    return out;
  }

  /**
   * One frame of the gesture.
   *
   * `current_x`/`current_y` are the pointer in DOCUMENT coordinates, already snapped
   * by the caller if snapping is active. Snapping stays in TypeScript deliberately:
   * it needs the other objects' guides, which is a document-wide question, and
   * passing the snapped point means the outline shown is the placement that will be
   * committed.
   *
   * `preserve_aspect` squares the box off the larger extent; `from_center` grows it
   * symmetrically about the press point. Both are geometry, so both are decided
   * here rather than by the caller.
   */
  emscripten::val updateShapeCreate(double current_x, double current_y, bool preserve_aspect,
                                    bool from_center) {
    emscripten::val out = emscripten::val::object();
    if (!shape_create_active_) {
      out.set("ok", false);
      out.set("reason", std::string("no-active-gesture"));
      return out;
    }
    if (!std::isfinite(current_x) || !std::isfinite(current_y)) {
      out.set("ok", false);
      out.set("reason", std::string("non-finite-point"));
      return out;
    }
    shape_current_ = pydee::Point2D{current_x, current_y};
    shape_preserve_aspect_ = preserve_aspect;
    shape_from_center_ = from_center;
    if (!rebuildShapePreview()) {
      out.set("ok", false);
      out.set("reason", std::string(pydee::ShapeBuildFailureName(shape_failure_)));
      return out;
    }
    return shapePreviewToVal(true);
  }

  /** The current preview without advancing the gesture. */
  emscripten::val getShapePreview() { return shapePreviewToVal(shape_create_active_); }

  /**
   * Finish the gesture and hand back the outline to commit.
   *
   * The returned `d` is the SAME string the preview was painted from — it is not
   * rebuilt, it is the value that has been in the ephemeral node. `preview == final`
   * is therefore a property of the data flow rather than an agreement between two
   * generators.
   *
   * The ephemeral node is removed here. The caller creates a real layer from the
   * returned geometry and the next `loadScene` brings it back as a document node.
   */
  emscripten::val commitShapeCreate() {
    emscripten::val out = shapePreviewToVal(shape_create_active_ && !shape_preview_data_.empty());
    removeShapePreviewNode();
    shape_create_active_ = false;
    shape_preview_data_.clear();
    return out;
  }

  /** Abandon the gesture. No document change, because there never was one. */
  bool cancelShapeCreate() {
    const bool was_active = shape_create_active_;
    removeShapePreviewNode();
    shape_create_active_ = false;
    shape_preview_data_.clear();
    return was_active;
  }

  bool hasShapeCreateGesture() const { return shape_create_active_; }

  /**
   * Tight bounds of arbitrary path data, via Skia.
   *
   * Exposed so `engine-parity.mts` can hold the TypeScript `exactPathBounds` to
   * Skia's answer. The selection box is drawn from a node's local bounds, and those
   * were a control-point superset — a donut's box came out twice the shape's width —
   * so the TypeScript measurement that replaced it needs a reference implementation
   * to be checked against rather than being believed.
   */
  emscripten::val measurePathBounds(std::string path_data) {
    emscripten::val out = emscripten::val::object();
    pydee::RectF bounds{};
    if (!pydee::MeasurePathData(path_data, &bounds)) {
      out.set("ok", false);
      out.set("reason", std::string("unmeasurable-path"));
      return out;
    }
    out.set("ok", true);
    out.set("bounds", RectToVal(bounds));
    return out;
  }

  /**
   * Build an outline without starting a gesture.
   *
   * The seam that lets TypeScript commit a shape whose geometry the ENGINE produced,
   * so a shape inserted by a click (rather than dragged) is byte-identical to a
   * dragged one.
   */
  emscripten::val buildShapePath(std::string shape_type, double x, double y, double width,
                                 double height) {
    emscripten::val out = emscripten::val::object();
    const auto kind = pydee::ParseShapeKind(shape_type);
    if (!kind.has_value()) {
      out.set("ok", false);
      out.set("reason", std::string("unknown-shape-kind"));
      return out;
    }
    std::string data;
    pydee::ShapeBuildFailure failure = pydee::ShapeBuildFailure::kUnknownKind;
    if (!pydee::BuildShapePath(*kind, pydee::RectF{x, y, width, height}, shape_parameters_,
                               &data, &failure)) {
      out.set("ok", false);
      out.set("reason", std::string(pydee::ShapeBuildFailureName(failure)));
      return out;
    }
    pydee::RectF measured{};
    if (!pydee::MeasurePathData(data, &measured)) {
      out.set("ok", false);
      out.set("reason", std::string("unmeasurable-path"));
      return out;
    }
    out.set("ok", true);
    out.set("d", data);
    out.set("bounds", RectToVal(measured));
    return out;
  }

 private:
  /** Reserved id for the ephemeral preview. Not a document layer id. */
  static const char* shapePreviewId() { return "__pydee_shape_preview__"; }

  /** The box the drag currently describes, after the aspect/centre modifiers. */
  pydee::RectF shapeDragBounds() const {
    double dx = shape_current_.x - shape_start_.x;
    double dy = shape_current_.y - shape_start_.y;

    if (shape_preserve_aspect_) {
      // Squared off the LARGER extent, and the sign of each axis is preserved, so a
      // constrained drag up-and-left stays up-and-left instead of flipping.
      const double size = std::max(std::abs(dx), std::abs(dy));
      dx = dx < 0 ? -size : size;
      dy = dy < 0 ? -size : size;
    }

    if (shape_from_center_) {
      // The press point becomes the CENTRE: the box extends the same distance on the
      // opposite side, so it is twice the drag on each axis.
      return pydee::RectF{shape_start_.x - dx, shape_start_.y - dy, dx * 2.0, dy * 2.0};
    }
    return pydee::RectF{shape_start_.x, shape_start_.y, dx, dy};
  }

  /**
   * Rebuild the outline and update the ephemeral node IN PLACE.
   *
   * In place, not by reloading the scene: `loadScene` replaces the scene wholesale
   * and invalidates everything, and doing that per pointer sample is the cost the
   * damage-tracking work removed. Here the only per-frame work is building a short
   * string, measuring it, and marking the union of the old and new bounds as damaged.
   */
  bool rebuildShapePreview() {
    if (!shape_create_active_) {
      return false;
    }
    const pydee::RectF box = shapeDragBounds();
    std::string data;
    if (!pydee::BuildShapePath(shape_kind_, box, shape_parameters_, &data, &shape_failure_)) {
      // A degenerate box is the normal state at the start of every drag, so the node
      // is removed rather than left showing the last non-degenerate outline.
      removeShapePreviewNode();
      shape_preview_data_.clear();
      return false;
    }
    pydee::RectF measured{};
    if (!pydee::MeasurePathData(data, &measured)) {
      shape_failure_ = pydee::ShapeBuildFailure::kNonFiniteGeometry;
      removeShapePreviewNode();
      shape_preview_data_.clear();
      return false;
    }

    pydee::PathNode* node = findShapePreviewNode();
    if (node == nullptr) {
      auto created = std::make_unique<pydee::PathNode>();
      created->id = shapePreviewId();
      created->local_transform = pydee::Matrix2D{};
      created->fill = pydee::Paint::Solid(shape_fill_);
      created->stroke.paint = pydee::Paint::Solid(shape_stroke_);
      created->stroke.width = shape_stroke_width_;
      node = created.get();
      // Appended last, so it paints on top of every document node without needing a
      // separate pass or a z-index concept.
      scene_.roots.push_back(std::move(created));
    } else {
      // Where it WAS, before the geometry changes.
      noteNodeDamage(shapePreviewId());
    }

    node->d = data;
    node->local_bounds = measured;
    shape_preview_data_ = std::move(data);
    shape_preview_bounds_ = measured;
    // Where it IS now.
    noteNodeDamage(shapePreviewId());
    return true;
  }

  pydee::PathNode* findShapePreviewNode() {
    for (const std::unique_ptr<pydee::Node>& node : scene_.roots) {
      if (node && node->kind == pydee::NodeKind::kPath && node->id == shapePreviewId()) {
        return static_cast<pydee::PathNode*>(node.get());
      }
    }
    return nullptr;
  }

  void removeShapePreviewNode() {
    for (size_t index = 0; index < scene_.roots.size(); ++index) {
      const std::unique_ptr<pydee::Node>& node = scene_.roots[index];
      if (node && node->id == shapePreviewId()) {
        // Damage FIRST, while the node still exists to be measured. Erasing it and
        // then asking for its bounds would mark the whole surface.
        noteNodeDamage(shapePreviewId());
        scene_.roots.erase(scene_.roots.begin() + static_cast<long>(index));
        return;
      }
    }
  }

  emscripten::val shapePreviewToVal(bool ok) {
    emscripten::val out = emscripten::val::object();
    if (!ok || shape_preview_data_.empty()) {
      out.set("ok", false);
      out.set("reason", std::string(shape_create_active_ ? "degenerate-bounds"
                                                        : "no-active-gesture"));
      return out;
    }
    out.set("ok", true);
    out.set("kind", std::string(pydee::ShapeKindName(shape_kind_)));
    out.set("d", shape_preview_data_);
    out.set("bounds", RectToVal(shape_preview_bounds_));
    return out;
  }

  /**
   * Write the solved transform onto the node the gesture belongs to.
   *
   * Looked up through the index rather than by walking the tree, because this runs
   * on every pointer frame.
   */
  bool applyGestureTransform(const pydee::Matrix2D& local) {
    const auto found = node_index_.find(gesture_id_);
    if (found == node_index_.end() || found->second.node == nullptr) {
      return false;
    }
    // Where it was and where it went, so a partial repaint covers both.
    noteNodeDamage(gesture_id_);
    found->second.node->local_transform = local;
    noteNodeDamage(gesture_id_);
    return true;
  }

  void clearDamage() {
    has_damage_ = false;
    damage_is_everything_ = false;
    damage_min_x_ = damage_min_y_ = 0.0;
    damage_max_x_ = damage_max_y_ = 0.0;
  }

  /**
   * A frame as a plain object, including the resulting world corners.
   *
   * The corners are computed from the SNAPSHOT's local bounds, because the preview
   * leaves the node's geometry alone and carries the change in the transform. That
   * is the same relationship the native tests assert, so the selection chrome can
   * draw straight from this without repeating any of the mathematics.
   */
  emscripten::val GestureFrameToVal(const pydee::GestureSnapshot& snapshot,
                                    const pydee::GestureFrame& frame) {
    emscripten::val out = emscripten::val::object();
    out.set("ok", true);
    out.set("kind", std::string(pydee::GestureKindName(snapshot.kind)));
    out.set("localTransform", MatrixToVal(frame.local_transform));
    out.set("localBounds", RectToVal(frame.local_bounds));
    out.set("angle", frame.angle_degrees);
    emscripten::val delta = emscripten::val::object();
    delta.set("dx", frame.world_delta.x);
    delta.set("dy", frame.world_delta.y);
    out.set("worldDelta", delta);
    out.set("pivot", PointToVal(snapshot.pivot));

    pydee::OrientedBounds preview;
    pydee::SelectionFailure failure = pydee::SelectionFailure::kNodeNotFound;
    if (pydee::OrientedBoundsFrom(
            pydee::Multiply(snapshot.parent_world, frame.local_transform),
            std::optional<pydee::RectF>(snapshot.bounds.local_bounds), &preview, &failure)) {
      pydee::Point2D corners[4];
      pydee::OrientedCorners(preview, corners);
      emscripten::val list = emscripten::val::array();
      for (int index = 0; index < 4; ++index) {
        list.set(index, PointToVal(corners[index]));
      }
      out.set("corners", list);
    } else {
      // Reported as absent rather than as a guessed box: SelectionCanvas draws
      // nothing for a non-finite corner, which is the correct response.
      out.set("corners", emscripten::val::null());
    }
    return out;
  }

  std::unique_ptr<pydee::RasterTarget> target_;
  std::unique_ptr<pydee::FontRegistry> fonts_;
  pydee::PaintServerTable paint_servers_;
  pydee::Scene scene_;
  std::unordered_map<std::string, NodeIndexEntry> node_index_;
  std::vector<uint8_t> pixel_buffer_;
  /** The in-flight gesture, if any. Immutable for its whole lifetime. */
  std::optional<pydee::GestureSnapshot> gesture_;
  std::string gesture_id_;
  /**
   * The region changed since the last render, in document space.
   *
   * A bounding box rather than a list of rects: one union is what a clip and a single
   * pixel read can both consume, and a gesture damages one object's before-and-after
   * anyway. `damage_is_everything_` is a separate flag, not a full-surface rect, because
   * "I do not know what changed" and "everything in this rect changed" call for different
   * responses and conflating them would let an unknown quietly become a guess.
   */
  bool has_damage_ = false;
  bool damage_is_everything_ = true;
  double damage_min_x_ = 0.0;
  double damage_min_y_ = 0.0;
  double damage_max_x_ = 0.0;
  double damage_max_y_ = 0.0;
  int last_nodes_drawn_ = 0;
  int last_nodes_culled_ = 0;
  int last_layers_opened_ = 0;

  /**
   * Shape-creation state.
   *
   * Deliberately NOT a `GestureSnapshot`: a transform gesture is anchored to an
   * existing node and carries an immutable snapshot of it, while a creation gesture
   * has no node until it produces one and its geometry changes on every frame. Reusing
   * the snapshot type would have meant one of the two lying about what it holds.
   */
  bool shape_create_active_ = false;
  pydee::ShapeKind shape_kind_ = pydee::ShapeKind::kRectangle;
  pydee::ShapeParameters shape_parameters_;
  pydee::Point2D shape_start_{0.0, 0.0};
  pydee::Point2D shape_current_{0.0, 0.0};
  bool shape_preserve_aspect_ = false;
  bool shape_from_center_ = false;
  pydee::Color shape_fill_ = 0xFF3B82F6;
  pydee::Color shape_stroke_ = 0x00000000;
  double shape_stroke_width_ = 0.0;
  /** The outline currently painted. Handed back verbatim on commit. */
  std::string shape_preview_data_;
  pydee::RectF shape_preview_bounds_{};
  pydee::ShapeBuildFailure shape_failure_ = pydee::ShapeBuildFailure::kDegenerateBounds;
};

int SceneFormatVersion() { return static_cast<int>(pydee::kSceneVersion); }

EMSCRIPTEN_BINDINGS(pydee_engine) {
  emscripten::class_<PydeeSurface>("PydeeSurface")
      .constructor<int, int>()
      .function("isValid", &PydeeSurface::isValid)
      .function("width", &PydeeSurface::width)
      .function("height", &PydeeSurface::height)
      .function("loadScene", &PydeeSurface::loadScene)
      .function("loadDefs", &PydeeSurface::loadDefs)
      .function("paintServerCount", &PydeeSurface::paintServerCount)
      .function("unsupportedPaintServers", &PydeeSurface::unsupportedPaintServers)
      .function("unresolvedPaintReferences", &PydeeSurface::unresolvedPaintReferences)
      .function("registerFont", &PydeeSurface::registerFont)
      .function("hasFont", &PydeeSurface::hasFont)
      .function("fontCount", &PydeeSurface::fontCount)
      .function("measureText", &PydeeSurface::measureText)
      .function("setNodeTransform", &PydeeSurface::setNodeTransform)
      .function("setNodeDocumentTranslation", &PydeeSurface::setNodeDocumentTranslation)
      .function("nodeCount", &PydeeSurface::nodeCount)
      .function("sceneRootCount", &PydeeSurface::sceneRootCount)
      .function("setNodeOpacity", &PydeeSurface::setNodeOpacity)
      .function("render", &PydeeSurface::render)
      .function("renderDamaged", &PydeeSurface::renderDamaged)
      .function("readPixelsRegion", &PydeeSurface::readPixelsRegion)
      .function("hasPartialDamage", &PydeeSurface::hasPartialDamage)
      .function("invalidateAll", &PydeeSurface::invalidateAll)
      .function("hitTest", &PydeeSurface::hitTest)
      .function("getWorldTransform", &PydeeSurface::getWorldTransform)
      .function("getWorldCorners", &PydeeSurface::getWorldCorners)
      .function("getOrientedBounds", &PydeeSurface::getOrientedBounds)
      .function("getAxisAlignedBounds", &PydeeSurface::getAxisAlignedBounds)
      .function("resizeLocalBounds", &PydeeSurface::resizeLocalBounds)
      .function("beginTransformGesture", &PydeeSurface::beginTransformGesture)
      .function("updateTransformGesture", &PydeeSurface::updateTransformGesture)
      .function("endTransformGesture", &PydeeSurface::endTransformGesture)
      .function("cancelTransformGesture", &PydeeSurface::cancelTransformGesture)
      .function("hasActiveGesture", &PydeeSurface::hasActiveGesture)
      .function("hitTestSelectionHandle", &PydeeSurface::hitTestSelectionHandle)
      .function("setShapeCreateParameters", &PydeeSurface::setShapeCreateParameters)
      .function("beginShapeCreate", &PydeeSurface::beginShapeCreate)
      .function("updateShapeCreate", &PydeeSurface::updateShapeCreate)
      .function("getShapePreview", &PydeeSurface::getShapePreview)
      .function("commitShapeCreate", &PydeeSurface::commitShapeCreate)
      .function("cancelShapeCreate", &PydeeSurface::cancelShapeCreate)
      .function("hasShapeCreateGesture", &PydeeSurface::hasShapeCreateGesture)
      .function("measurePathBounds", &PydeeSurface::measurePathBounds)
      .function("buildShapePath", &PydeeSurface::buildShapePath)
      .function("readPixels", &PydeeSurface::readPixels)
      .function("lastNodesDrawn", &PydeeSurface::lastNodesDrawn)
      .function("lastNodesCulled", &PydeeSurface::lastNodesCulled)
      .function("lastLayersOpened", &PydeeSurface::lastLayersOpened)
      .function("lastUnresolvedText", &PydeeSurface::lastUnresolvedText)
      .function("lastUnparsablePaths", &PydeeSurface::lastUnparsablePaths)
      .function("lastUnresolvedPaints", &PydeeSurface::lastUnresolvedPaints)
      .function("lastApproximatedPaints", &PydeeSurface::lastApproximatedPaints);

  emscripten::function("sceneFormatVersion", &SceneFormatVersion);
}
