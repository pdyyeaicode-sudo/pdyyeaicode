// test_engine.cpp — engine unit tests.
//
// Uses a tiny assertion harness rather than pulling in a test framework, so the
// engine keeps zero third-party dependencies beyond Skia itself.
//
// Two categories:
//
//  1. Geometry parity. The same cases asserted in matrix2d.test.ts. If the C++
//     and TypeScript transform conventions ever diverge, a click would resolve
//     to a different object than the one painted; this fails the build instead.
//
//  2. Real rasterisation. Renders through SkiaRenderer into a raster surface and
//     reads back pixels, which proves the whole path works: scene -> traversal
//     -> Skia -> pixels. The group-isolation test in particular distinguishes
//     correct offscreen compositing from the per-child alpha bug.

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "include/core/SkColor.h"
#include "include/core/SkImageInfo.h"
#include "include/core/SkPixmap.h"
#include "include/core/SkSurface.h"
#include "pydee/font_registry.h"
#include "pydee/geometry.h"
#include "pydee/gesture.h"
#include "pydee/raster_target.h"
#include "pydee/renderer.h"
#include "pydee/scene.h"
#include "pydee/scene_codec.h"
#include "pydee/selection.h"
#include "pydee/shape_geometry.h"
#include "skia_renderer.h"

namespace {

int g_checks = 0;
int g_failures = 0;

void ReportFailure(const char* file, int line, const std::string& message) {
  ++g_failures;
  std::printf("  FAIL %s:%d  %s\n", file, line, message.c_str());
}

void CheckTrue(bool condition, const char* expression, const char* file, int line) {
  ++g_checks;
  if (!condition) {
    ReportFailure(file, line, std::string("expected true: ") + expression);
  }
}

void CheckNear(double actual, double expected, double tolerance, const char* expression,
               const char* file, int line) {
  ++g_checks;
  if (!(std::abs(actual - expected) <= tolerance)) {
    char buffer[256];
    std::snprintf(buffer, sizeof(buffer), "%s: expected %.6f, got %.6f (tol %.6g)", expression,
                  expected, actual, tolerance);
    ReportFailure(file, line, buffer);
  }
}

void CheckEqualInt(long long actual, long long expected, const char* expression, const char* file,
                   int line) {
  ++g_checks;
  if (actual != expected) {
    char buffer[256];
    std::snprintf(buffer, sizeof(buffer), "%s: expected %lld, got %lld", expression, expected,
                  actual);
    ReportFailure(file, line, buffer);
  }
}

#define CHECK_TRUE(cond) CheckTrue((cond), #cond, __FILE__, __LINE__)
#define CHECK_NEAR(actual, expected, tol) \
  CheckNear((actual), (expected), (tol), #actual, __FILE__, __LINE__)
#define CHECK_EQ_INT(actual, expected) \
  CheckEqualInt((actual), (expected), #actual, __FILE__, __LINE__)

// --------------------------------------------------------------------------- //
// Geometry parity with matrix2d.test.ts
// --------------------------------------------------------------------------- //

void TestCompositionOrder() {
  std::printf("geometry: composition applies the inner matrix first\n");
  const pydee::Matrix2D composed =
      pydee::Multiply(pydee::Translation(10.0, 20.0), pydee::Rotation(90.0));
  const pydee::Point2D result = pydee::TransformPoint(composed, pydee::Point2D{1.0, 0.0});
  CHECK_NEAR(result.x, 10.0, 1e-9);
  CHECK_NEAR(result.y, 21.0, 1e-9);
}

void TestRotationAboutCentre() {
  std::printf("geometry: rotation about an explicit centre keeps that centre fixed\n");
  const pydee::Matrix2D m = pydee::Rotation(90.0, 5.0, 5.0);

  const pydee::Point2D centre = pydee::TransformPoint(m, pydee::Point2D{5.0, 5.0});
  CHECK_NEAR(centre.x, 5.0, 1e-9);
  CHECK_NEAR(centre.y, 5.0, 1e-9);

  const pydee::Point2D moved = pydee::TransformPoint(m, pydee::Point2D{6.0, 5.0});
  CHECK_NEAR(moved.x, 5.0, 1e-9);
  CHECK_NEAR(moved.y, 6.0, 1e-9);
}

void TestInversion() {
  std::printf("geometry: inversion round-trips a point and rejects singular matrices\n");
  const pydee::Matrix2D m = pydee::Multiply(
      pydee::Multiply(pydee::Translation(30.0, -12.0), pydee::Rotation(37.0)),
      pydee::Scaling(2.0, 3.0));

  const std::optional<pydee::Matrix2D> inverse = pydee::Invert(m);
  CHECK_TRUE(inverse.has_value());
  if (inverse.has_value()) {
    const pydee::Point2D round_tripped = pydee::TransformPoint(
        *inverse, pydee::TransformPoint(m, pydee::Point2D{7.0, -4.0}));
    CHECK_NEAR(round_tripped.x, 7.0, 1e-9);
    CHECK_NEAR(round_tripped.y, -4.0, 1e-9);
  }

  CHECK_TRUE(!pydee::Invert(pydee::Scaling(0.0, 1.0)).has_value());
}

void TestTransformRect() {
  std::printf("geometry: axis-aligned box of a rotated rectangle\n");
  const pydee::RectF box =
      pydee::TransformRect(pydee::Rotation(90.0), pydee::RectF{0.0, 0.0, 10.0, 20.0});
  CHECK_NEAR(box.x, -20.0, 1e-9);
  CHECK_NEAR(box.y, 0.0, 1e-9);
  CHECK_NEAR(box.width, 20.0, 1e-9);
  CHECK_NEAR(box.height, 10.0, 1e-9);
}

// --------------------------------------------------------------------------- //
// Rasterisation through Skia
// --------------------------------------------------------------------------- //

constexpr int kSurfaceSize = 100;
constexpr pydee::Color kWhite = pydee::MakeColor(255, 255, 255, 255);
constexpr pydee::Color kRed = pydee::MakeColor(255, 255, 0, 0);
constexpr pydee::Color kBlack = pydee::MakeColor(255, 0, 0, 0);

struct RasterTarget {
  sk_sp<SkSurface> surface;

  bool Valid() const { return surface != nullptr; }

  SkColor ColorAt(int x, int y) const {
    SkPixmap pixmap;
    if (!surface->peekPixels(&pixmap)) {
      return 0;
    }
    return pixmap.getColor(x, y);
  }
};

RasterTarget MakeRasterTarget() {
  RasterTarget target;
  target.surface = SkSurfaces::Raster(SkImageInfo::MakeN32Premul(kSurfaceSize, kSurfaceSize));
  return target;
}

std::unique_ptr<pydee::RectNode> MakeRect(const std::string& id, double x, double y, double width,
                                         double height, pydee::Color fill) {
  auto node = std::make_unique<pydee::RectNode>();
  node->id = id;
  node->x = x;
  node->y = y;
  node->width = width;
  node->height = height;
  node->fill = pydee::Paint::Solid(fill);
  return node;
}

void TestRendersSolidRect() {
  std::printf("raster: a solid rect reaches the surface as real pixels\n");
  RasterTarget target = MakeRasterTarget();
  CHECK_TRUE(target.Valid());
  if (!target.Valid()) {
    return;
  }

  pydee::Scene scene;
  scene.artboard_id = "artboard-1";
  scene.width = kSurfaceSize;
  scene.height = kSurfaceSize;
  scene.roots.push_back(MakeRect("r1", 20.0, 20.0, 60.0, 60.0, kRed));

  pydee::SkiaRenderer renderer(target.surface->getCanvas(), nullptr);
  pydee::RenderOptions options;
  options.background_color = kWhite;

  const pydee::RenderStats stats = pydee::RenderScene(scene, renderer, options);
  CHECK_EQ_INT(stats.nodes_drawn, 1);

  const SkColor inside = target.ColorAt(50, 50);
  CHECK_EQ_INT(SkColorGetR(inside), 255);
  CHECK_EQ_INT(SkColorGetG(inside), 0);
  CHECK_EQ_INT(SkColorGetB(inside), 0);

  const SkColor outside = target.ColorAt(5, 5);
  CHECK_EQ_INT(SkColorGetR(outside), 255);
  CHECK_EQ_INT(SkColorGetG(outside), 255);
  CHECK_EQ_INT(SkColorGetB(outside), 255);
}

void TestTransformIsApplied() {
  std::printf("raster: a node's local transform moves its pixels\n");
  RasterTarget target = MakeRasterTarget();
  if (!target.Valid()) {
    return;
  }

  pydee::Scene scene;
  scene.width = kSurfaceSize;
  scene.height = kSurfaceSize;
  auto rect = MakeRect("r1", 0.0, 0.0, 20.0, 20.0, kRed);
  rect->local_transform = pydee::Translation(60.0, 60.0);
  scene.roots.push_back(std::move(rect));

  pydee::SkiaRenderer renderer(target.surface->getCanvas(), nullptr);
  pydee::RenderOptions options;
  options.background_color = kWhite;
  pydee::RenderScene(scene, renderer, options);

  // Translated destination is painted.
  CHECK_EQ_INT(SkColorGetR(target.ColorAt(70, 70)), 255);
  CHECK_EQ_INT(SkColorGetG(target.ColorAt(70, 70)), 0);
  // Original untranslated position is not.
  CHECK_EQ_INT(SkColorGetG(target.ColorAt(10, 10)), 255);
}

void TestGroupIsolationCompositesOnce() {
  std::printf("raster: group alpha composites the group, not each child\n");
  RasterTarget target = MakeRasterTarget();
  if (!target.Valid()) {
    return;
  }

  // Two opaque black rects overlapping in the middle, inside a 50% group.
  //
  // Correct (isolated): children compose to opaque black, then the whole group
  // is drawn at 50% over white -> ~128 everywhere the group covers.
  //
  // Wrong (alpha applied per child): the first rect yields ~128, then the second
  // rect at 50% over that yields ~64 in the overlap. Asserting ~128 in the
  // overlap is what distinguishes the two.
  auto group = std::make_unique<pydee::GroupNode>();
  group->id = "g";
  group->opacity = 0.5;
  group->isolate = true;
  group->children.push_back(MakeRect("a", 10.0, 40.0, 50.0, 20.0, kBlack));
  group->children.push_back(MakeRect("b", 40.0, 40.0, 50.0, 20.0, kBlack));

  pydee::Scene scene;
  scene.width = kSurfaceSize;
  scene.height = kSurfaceSize;
  scene.roots.push_back(std::move(group));

  pydee::SkiaRenderer renderer(target.surface->getCanvas(), nullptr);
  pydee::RenderOptions options;
  options.background_color = kWhite;
  const pydee::RenderStats stats = pydee::RenderScene(scene, renderer, options);

  CHECK_EQ_INT(stats.layers_opened, 1);
  CHECK_EQ_INT(stats.nodes_drawn, 2);

  const SkColor first_only = target.ColorAt(20, 50);
  const SkColor overlap = target.ColorAt(50, 50);
  const SkColor second_only = target.ColorAt(80, 50);

  CHECK_NEAR(SkColorGetR(first_only), 128.0, 2.0);
  CHECK_NEAR(SkColorGetR(second_only), 128.0, 2.0);
  // The decisive assertion: the overlap must match the single-coverage value.
  CHECK_NEAR(SkColorGetR(overlap), 128.0, 2.0);
}

void TestCulling() {
  std::printf("raster: nodes outside the cull rect are skipped\n");
  RasterTarget target = MakeRasterTarget();
  if (!target.Valid()) {
    return;
  }

  pydee::Scene scene;
  scene.width = kSurfaceSize;
  scene.height = kSurfaceSize;

  auto visible = MakeRect("visible", 10.0, 10.0, 20.0, 20.0, kRed);
  visible->local_bounds = pydee::RectF{10.0, 10.0, 20.0, 20.0};
  scene.roots.push_back(std::move(visible));

  auto offscreen = MakeRect("offscreen", 5000.0, 5000.0, 20.0, 20.0, kRed);
  offscreen->local_bounds = pydee::RectF{5000.0, 5000.0, 20.0, 20.0};
  scene.roots.push_back(std::move(offscreen));

  // A node with unknown bounds must never be culled.
  scene.roots.push_back(MakeRect("unknown-bounds", 40.0, 40.0, 20.0, 20.0, kRed));

  pydee::SkiaRenderer renderer(target.surface->getCanvas(), nullptr);
  pydee::RenderOptions options;
  options.background_color = kWhite;
  options.cull_rect = pydee::RectF{0.0, 0.0, 100.0, 100.0};

  const pydee::RenderStats stats = pydee::RenderScene(scene, renderer, options);
  CHECK_EQ_INT(stats.nodes_culled, 1);
  CHECK_EQ_INT(stats.nodes_drawn, 2);
  CHECK_EQ_INT(SkColorGetG(target.ColorAt(50, 50)), 0);
}

void TestPathParsing() {
  std::printf("raster: SVG path data is parsed, and bad data is reported\n");
  RasterTarget target = MakeRasterTarget();
  if (!target.Valid()) {
    return;
  }

  pydee::Scene scene;
  scene.width = kSurfaceSize;
  scene.height = kSurfaceSize;

  auto triangle = std::make_unique<pydee::PathNode>();
  triangle->id = "tri";
  triangle->d = "M 10 90 L 90 90 L 50 20 Z";
  triangle->fill = pydee::Paint::Solid(kRed);
  scene.roots.push_back(std::move(triangle));

  auto broken = std::make_unique<pydee::PathNode>();
  broken->id = "broken";
  broken->d = "this is not path data";
  broken->fill = pydee::Paint::Solid(kBlack);
  scene.roots.push_back(std::move(broken));

  pydee::SkiaRenderer renderer(target.surface->getCanvas(), nullptr);
  pydee::RenderOptions options;
  options.background_color = kWhite;
  pydee::RenderScene(scene, renderer, options);

  // Interior of the triangle is filled.
  CHECK_EQ_INT(SkColorGetR(target.ColorAt(50, 80)), 255);
  CHECK_EQ_INT(SkColorGetG(target.ColorAt(50, 80)), 0);
  // Outside it is untouched.
  CHECK_EQ_INT(SkColorGetG(target.ColorAt(15, 30)), 255);
  // The malformed path was counted, not silently ignored.
  CHECK_EQ_INT(renderer.unparsable_paths(), 1);
}

void TestEllipseAndStroke() {
  std::printf("raster: ellipse fill and stroke both paint\n");
  RasterTarget target = MakeRasterTarget();
  if (!target.Valid()) {
    return;
  }

  auto ellipse = std::make_unique<pydee::EllipseNode>();
  ellipse->id = "e1";
  ellipse->cx = 50.0;
  ellipse->cy = 50.0;
  ellipse->rx = 40.0;
  ellipse->ry = 25.0;
  ellipse->fill = pydee::Paint::Solid(kRed);
  ellipse->stroke.paint = pydee::Paint::Solid(kBlack);
  ellipse->stroke.width = 4.0;

  pydee::Scene scene;
  scene.width = kSurfaceSize;
  scene.height = kSurfaceSize;
  scene.roots.push_back(std::move(ellipse));

  pydee::SkiaRenderer renderer(target.surface->getCanvas(), nullptr);
  pydee::RenderOptions options;
  options.background_color = kWhite;
  pydee::RenderScene(scene, renderer, options);

  // Centre is filled red.
  CHECK_EQ_INT(SkColorGetR(target.ColorAt(50, 50)), 255);
  CHECK_EQ_INT(SkColorGetG(target.ColorAt(50, 50)), 0);
  // The stroke darkens the left edge of the ellipse.
  CHECK_TRUE(SkColorGetR(target.ColorAt(11, 50)) < 200);
  // A corner well outside the ellipse stays white.
  CHECK_EQ_INT(SkColorGetG(target.ColorAt(3, 3)), 255);
}

void TestLeafOpacity() {
  std::printf("raster: a leaf's own opacity modulates its colour\n");
  RasterTarget target = MakeRasterTarget();
  if (!target.Valid()) {
    return;
  }

  auto rect = MakeRect("r1", 20.0, 20.0, 60.0, 60.0, kBlack);
  rect->opacity = 0.5;

  pydee::Scene scene;
  scene.width = kSurfaceSize;
  scene.height = kSurfaceSize;
  scene.roots.push_back(std::move(rect));

  pydee::SkiaRenderer renderer(target.surface->getCanvas(), nullptr);
  pydee::RenderOptions options;
  options.background_color = kWhite;
  pydee::RenderScene(scene, renderer, options);

  CHECK_NEAR(SkColorGetR(target.ColorAt(50, 50)), 128.0, 2.0);
}

// --------------------------------------------------------------------------- //
// Binary scene codec
// --------------------------------------------------------------------------- //

// Little-endian writer mirroring the TypeScript encoder, used to build test
// buffers so the decoder is exercised against the real wire layout.
class WireWriter {
 public:
  void U8(uint8_t value) { bytes_.push_back(value); }

  void U16(uint16_t value) {
    bytes_.push_back(static_cast<uint8_t>(value & 0xFF));
    bytes_.push_back(static_cast<uint8_t>((value >> 8) & 0xFF));
  }

  void U32(uint32_t value) {
    for (int shift = 0; shift < 32; shift += 8) {
      bytes_.push_back(static_cast<uint8_t>((value >> shift) & 0xFF));
    }
  }

  void F64(double value) {
    uint8_t buffer[sizeof(double)];
    std::memcpy(buffer, &value, sizeof(double));
    for (unsigned char byte : buffer) {
      bytes_.push_back(byte);
    }
  }

  void Str(const std::string& value) {
    for (char character : value) {
      bytes_.push_back(static_cast<uint8_t>(character));
    }
  }

  void Header(double width, double height, uint32_t node_count) {
    U32(pydee::kSceneMagic);
    U32(pydee::kSceneVersion);
    F64(width);
    F64(height);
    U32(node_count);
  }

  void NodeHeader(uint32_t parent, pydee::WireNodeKind kind, uint8_t flags, double opacity,
                  const pydee::Matrix2D& matrix, const std::string& id) {
    U32(parent);
    U8(static_cast<uint8_t>(kind));
    U8(0);  // blend mode: normal
    U8(flags);
    U8(0);  // reserved
    F64(opacity);
    F64(matrix.a);
    F64(matrix.b);
    F64(matrix.c);
    F64(matrix.d);
    F64(matrix.e);
    F64(matrix.f);
    U16(static_cast<uint16_t>(id.size()));
    Str(id);
  }

  void SolidPaint(pydee::Color color) {
    U8(1);
    U32(color);
  }

  void NoPaint() {
    U8(0);
    U32(0);
  }

  void NoStroke() {
    NoPaint();
    F64(0.0);
  }

  /**
   * Gradient payload shared by both gradient kinds, written exactly as the
   * TypeScript encoder does so the decoder is exercised against the real layout.
   */
  void GradientCommon(uint8_t spread, uint8_t units,
                      const std::vector<std::pair<double, pydee::Color>>& stops) {
    U8(spread);
    U8(units);
    U8(static_cast<uint8_t>(stops.size()));
    U8(0);  // reserved
    const pydee::Matrix2D identity = pydee::Identity();
    F64(identity.a);
    F64(identity.b);
    F64(identity.c);
    F64(identity.d);
    F64(identity.e);
    F64(identity.f);
  }

  void GradientStops(const std::vector<std::pair<double, pydee::Color>>& stops) {
    for (const auto& stop : stops) {
      F64(stop.first);
      U32(stop.second);
    }
  }

  void LinearGradientPaint(double x1, double y1, double x2, double y2, uint8_t spread,
                           uint8_t units,
                           const std::vector<std::pair<double, pydee::Color>>& stops) {
    U8(static_cast<uint8_t>(pydee::WirePaintKind::kLinearGradient));
    U32(0);
    GradientCommon(spread, units, stops);
    F64(x1);
    F64(y1);
    F64(x2);
    F64(y2);
    GradientStops(stops);
  }

  void RadialGradientPaint(double cx, double cy, double r, double fx, double fy, uint8_t spread,
                           uint8_t units,
                           const std::vector<std::pair<double, pydee::Color>>& stops) {
    U8(static_cast<uint8_t>(pydee::WirePaintKind::kRadialGradient));
    U32(0);
    GradientCommon(spread, units, stops);
    F64(cx);
    F64(cy);
    F64(r);
    F64(fx);
    F64(fy);
    GradientStops(stops);
  }

  void ReferencePaint(const std::string& id) {
    U8(static_cast<uint8_t>(pydee::WirePaintKind::kReference));
    U32(0);
    U16(static_cast<uint16_t>(id.size()));
    Str(id);
  }

  const std::vector<uint8_t>& bytes() const { return bytes_; }

 private:
  std::vector<uint8_t> bytes_;
};

void TestCodecRoundTrip() {
  std::printf("codec: decodes a nested scene and rebuilds the tree\n");

  // 0: isolated group, 1: rect child of the group, 2: root-level ellipse.
  WireWriter correct;
  correct.Header(800.0, 600.0, 3);

  correct.NodeHeader(pydee::kNoParent, pydee::WireNodeKind::kGroup, pydee::kFlagIsolate, 0.5,
                     pydee::Translation(10.0, 20.0), "g");

  // Rect child. Bounds are written between the transform and the id, so this
  // node is emitted field by field rather than through NodeHeader.
  correct.U32(0);
  correct.U8(static_cast<uint8_t>(pydee::WireNodeKind::kRect));
  correct.U8(0);
  correct.U8(pydee::kFlagHasLocalBounds);
  correct.U8(0);
  correct.F64(1.0);
  const pydee::Matrix2D identity = pydee::Identity();
  correct.F64(identity.a);
  correct.F64(identity.b);
  correct.F64(identity.c);
  correct.F64(identity.d);
  correct.F64(identity.e);
  correct.F64(identity.f);
  correct.F64(1.0);   // bounds x
  correct.F64(2.0);   // bounds y
  correct.F64(30.0);  // bounds width
  correct.F64(40.0);  // bounds height
  correct.U16(1);
  correct.Str("r");
  correct.F64(1.0);   // x
  correct.F64(2.0);   // y
  correct.F64(30.0);  // width
  correct.F64(40.0);  // height
  correct.F64(4.0);   // corner radius
  correct.SolidPaint(kRed);
  correct.NoStroke();

  // Root-level ellipse.
  correct.NodeHeader(pydee::kNoParent, pydee::WireNodeKind::kEllipse, 0, 1.0, pydee::Identity(),
                     "e");
  correct.F64(50.0);
  correct.F64(60.0);
  correct.F64(10.0);
  correct.F64(20.0);
  correct.SolidPaint(kBlack);
  correct.NoStroke();

  pydee::Scene scene;
  std::string error;
  const bool decoded =
      pydee::DecodeScene(correct.bytes().data(), correct.bytes().size(), &scene, &error);
  CHECK_TRUE(decoded);
  if (!decoded) {
    std::printf("    decode error: %s\n", error.c_str());
    return;
  }

  CHECK_NEAR(scene.width, 800.0, 1e-9);
  CHECK_NEAR(scene.height, 600.0, 1e-9);
  CHECK_EQ_INT(static_cast<long long>(scene.roots.size()), 2);

  const pydee::Node* group_node = scene.roots[0].get();
  CHECK_TRUE(group_node->kind == pydee::NodeKind::kGroup);
  CHECK_TRUE(group_node->id == "g");
  CHECK_NEAR(group_node->opacity, 0.5, 1e-9);
  CHECK_NEAR(group_node->local_transform.e, 10.0, 1e-9);

  if (group_node->kind == pydee::NodeKind::kGroup) {
    const auto* group = static_cast<const pydee::GroupNode*>(group_node);
    CHECK_TRUE(group->isolate);
    CHECK_EQ_INT(static_cast<long long>(group->children.size()), 1);
    if (!group->children.empty()) {
      const pydee::Node* child = group->children[0].get();
      CHECK_TRUE(child->kind == pydee::NodeKind::kRect);
      CHECK_TRUE(child->id == "r");
      CHECK_TRUE(child->local_bounds.has_value());
      if (child->local_bounds.has_value()) {
        CHECK_NEAR(child->local_bounds->width, 30.0, 1e-9);
      }
      const auto* rect = static_cast<const pydee::RectNode*>(child);
      CHECK_NEAR(rect->corner_radius, 4.0, 1e-9);
      CHECK_TRUE(rect->fill.kind == pydee::Paint::Kind::kSolid);
      CHECK_EQ_INT(rect->fill.color, static_cast<long long>(kRed));
      CHECK_TRUE(rect->stroke.paint.kind == pydee::Paint::Kind::kNone);
    }
  }

  CHECK_TRUE(scene.roots[1]->kind == pydee::NodeKind::kEllipse);
}

void TestCodecRejectsBadInput() {
  std::printf("codec: rejects malformed buffers with a reason\n");

  pydee::Scene scene;
  std::string error;

  // Empty buffer.
  const uint8_t empty[1] = {0};
  CHECK_TRUE(!pydee::DecodeScene(empty, 0, &scene, &error));
  CHECK_TRUE(!error.empty());

  // Bad magic.
  WireWriter bad_magic;
  bad_magic.U32(0xDEADBEEF);
  bad_magic.U32(pydee::kSceneVersion);
  bad_magic.F64(1.0);
  bad_magic.F64(1.0);
  bad_magic.U32(0);
  CHECK_TRUE(
      !pydee::DecodeScene(bad_magic.bytes().data(), bad_magic.bytes().size(), &scene, &error));

  // Unsupported version.
  WireWriter bad_version;
  bad_version.U32(pydee::kSceneMagic);
  bad_version.U32(999);
  bad_version.F64(1.0);
  bad_version.F64(1.0);
  bad_version.U32(0);
  CHECK_TRUE(
      !pydee::DecodeScene(bad_version.bytes().data(), bad_version.bytes().size(), &scene, &error));

  // Claims one node but provides no node data.
  WireWriter truncated;
  truncated.Header(10.0, 10.0, 1);
  CHECK_TRUE(
      !pydee::DecodeScene(truncated.bytes().data(), truncated.bytes().size(), &scene, &error));

  // Forward parent reference would allow a cycle.
  WireWriter forward_parent;
  forward_parent.Header(10.0, 10.0, 1);
  forward_parent.NodeHeader(5, pydee::WireNodeKind::kGroup, 0, 1.0, pydee::Identity(), "g");
  CHECK_TRUE(!pydee::DecodeScene(forward_parent.bytes().data(), forward_parent.bytes().size(),
                                 &scene, &error));
}

void TestCodecRendersThroughSkia() {
  std::printf("codec: a decoded scene renders to the expected pixels\n");

  WireWriter writer;
  writer.Header(kSurfaceSize, kSurfaceSize, 1);
  writer.NodeHeader(pydee::kNoParent, pydee::WireNodeKind::kRect, 0, 1.0, pydee::Identity(), "r1");
  writer.F64(20.0);
  writer.F64(20.0);
  writer.F64(60.0);
  writer.F64(60.0);
  writer.F64(0.0);
  writer.SolidPaint(kRed);
  writer.NoStroke();

  pydee::Scene scene;
  std::string error;
  CHECK_TRUE(pydee::DecodeScene(writer.bytes().data(), writer.bytes().size(), &scene, &error));

  RasterTarget target = MakeRasterTarget();
  if (!target.Valid()) {
    return;
  }
  pydee::SkiaRenderer renderer(target.surface->getCanvas(), nullptr);
  pydee::RenderOptions options;
  options.background_color = kWhite;
  pydee::RenderScene(scene, renderer, options);

  CHECK_EQ_INT(SkColorGetR(target.ColorAt(50, 50)), 255);
  CHECK_EQ_INT(SkColorGetG(target.ColorAt(50, 50)), 0);
  CHECK_EQ_INT(SkColorGetG(target.ColorAt(5, 5)), 255);
}

void TestRasterTargetRoundTrip() {
  std::printf("raster target: PIMPL surface renders and reads back RGBA\n");

  std::unique_ptr<pydee::RasterTarget> target =
      pydee::RasterTarget::Create(kSurfaceSize, kSurfaceSize);
  CHECK_TRUE(target != nullptr);
  if (target == nullptr) {
    return;
  }
  CHECK_EQ_INT(target->width(), kSurfaceSize);
  CHECK_EQ_INT(target->height(), kSurfaceSize);

  pydee::Scene scene;
  scene.width = kSurfaceSize;
  scene.height = kSurfaceSize;
  scene.roots.push_back(MakeRect("r1", 20.0, 20.0, 60.0, 60.0, kRed));

  pydee::RenderOptions options;
  options.background_color = kWhite;
  const pydee::RenderStats stats = target->Render(scene, options);
  CHECK_EQ_INT(stats.nodes_drawn, 1);

  std::vector<uint8_t> pixels;
  CHECK_TRUE(target->ReadPixelsRGBA(&pixels));
  CHECK_EQ_INT(static_cast<long long>(pixels.size()),
               static_cast<long long>(kSurfaceSize) * kSurfaceSize * 4);

  // RGBA byte order, unpremultiplied.
  const size_t centre = (static_cast<size_t>(50) * kSurfaceSize + 50) * 4u;
  CHECK_EQ_INT(pixels[centre + 0], 255);
  CHECK_EQ_INT(pixels[centre + 1], 0);
  CHECK_EQ_INT(pixels[centre + 2], 0);
  CHECK_EQ_INT(pixels[centre + 3], 255);

  const size_t corner = (static_cast<size_t>(5) * kSurfaceSize + 5) * 4u;
  CHECK_EQ_INT(pixels[corner + 0], 255);
  CHECK_EQ_INT(pixels[corner + 1], 255);
}

/**
 * Partial repaint: only the damaged rectangle is redrawn and only it is read back.
 *
 * The property that makes this safe is that everything OUTSIDE the clip keeps whatever was
 * already on the surface. If the clip leaked, the second render's background clear would
 * wipe the first shape — so the test draws two shapes in two passes and requires the first
 * to survive.
 */
void TestClippedRenderAndRegionReadback() {
  std::printf("raster target: a clipped render touches only its rect, and reads back only it\n");

  auto target = pydee::RasterTarget::Create(80, 60);
  CHECK_TRUE(target != nullptr);
  if (target == nullptr) {
    return;
  }

  std::vector<uint8_t> pixels;
  // Unpremultiplied RGBA, four bytes per pixel, `width` pixels per row.
  const auto redAt = [&pixels](int x, int y) -> int {
    const size_t offset = (static_cast<size_t>(y) * 80u + static_cast<size_t>(x)) * 4u;
    return offset + 3u < pixels.size() ? pixels[offset] : -1;
  };
  const auto greenAt = [&pixels](int x, int y) -> int {
    const size_t offset = (static_cast<size_t>(y) * 80u + static_cast<size_t>(x)) * 4u;
    return offset + 3u < pixels.size() ? pixels[offset + 1u] : -1;
  };

  // Pass 1: the whole surface, white background, a red rect on the left.
  pydee::Scene left;
  left.roots.push_back(MakeRect("left", 5.0, 5.0, 20.0, 20.0, kRed));
  pydee::RenderOptions full;
  full.background_color = kWhite;
  target->Render(left, full);

  CHECK_TRUE(target->ReadPixelsRGBA(&pixels));
  CHECK_EQ_INT(redAt(10, 10), 255);
  CHECK_EQ_INT(greenAt(10, 10), 0);

  // Pass 2: a clipped render on the RIGHT half only, with a background clear. The clear is
  // clipped too, so the left shape must be untouched.
  pydee::Scene right;
  right.roots.push_back(MakeRect("right", 50.0, 5.0, 20.0, 20.0, kBlack));
  pydee::RenderOptions clipped;
  clipped.background_color = kWhite;
  clipped.dirty_rect = pydee::RectF{40.0, 0.0, 40.0, 60.0};
  clipped.cull_rect = clipped.dirty_rect;
  const pydee::RenderStats stats = target->Render(right, clipped);

  CHECK_TRUE(target->ReadPixelsRGBA(&pixels));
  // The new shape is there.
  CHECK_EQ_INT(redAt(55, 10), 0);
  // And the old one SURVIVED, which is what a leaking clip would destroy.
  CHECK_EQ_INT(redAt(10, 10), 255);
  CHECK_EQ_INT(greenAt(10, 10), 0);
  CHECK_EQ_INT(static_cast<long long>(stats.nodes_drawn), 1);

  // Region readback returns exactly the rectangle asked for, tightly packed.
  std::vector<uint8_t> region;
  CHECK_TRUE(target->ReadPixelsRegionRGBA(50, 5, 4, 3, &region));
  CHECK_TRUE(region.size() >= 4u * 3u * 4u);
  // Every pixel of that 4x3 window is inside the black rect.
  for (int index = 0; index < 4 * 3; ++index) {
    CHECK_EQ_INT(region[static_cast<size_t>(index) * 4u], 0);
    CHECK_EQ_INT(region[static_cast<size_t>(index) * 4u + 3u], 255);
  }

  // Clamped to the surface rather than refused, because a damage rect derived from
  // geometry legitimately runs past the edge when an object is dragged towards it.
  CHECK_TRUE(target->ReadPixelsRegionRGBA(70, 50, 40, 40, &region));
  // Entirely outside is reported, never silently empty.
  CHECK_TRUE(!target->ReadPixelsRegionRGBA(200, 200, 10, 10, &region));
  CHECK_TRUE(!target->ReadPixelsRegionRGBA(-50, 0, 10, 10, &region));
}

void TestRasterTargetRejectsBadSizes() {  std::printf("raster target: refuses non-positive and absurd dimensions\n");
  CHECK_TRUE(pydee::RasterTarget::Create(0, 100) == nullptr);
  CHECK_TRUE(pydee::RasterTarget::Create(100, -1) == nullptr);
  CHECK_TRUE(pydee::RasterTarget::Create(100000, 100000) == nullptr);
}

// --------------------------------------------------------------------------- //
// Text: font registry and shaped rendering
// --------------------------------------------------------------------------- //

/** A real font from the pinned Skia checkout, so tests are deterministic. */
std::vector<uint8_t> LoadTestFont() {
  const char* home = std::getenv("HOME");
  const std::string path =
      std::string(home == nullptr ? "" : home) + "/dev/skia/resources/fonts/Roboto-Regular.ttf";
  std::vector<uint8_t> bytes;
  std::FILE* file = std::fopen(path.c_str(), "rb");
  if (file == nullptr) {
    return bytes;
  }
  std::fseek(file, 0, SEEK_END);
  const long size = std::ftell(file);
  std::fseek(file, 0, SEEK_SET);
  if (size > 0) {
    bytes.resize(static_cast<size_t>(size));
    if (std::fread(bytes.data(), 1, bytes.size(), file) != bytes.size()) {
      bytes.clear();
    }
  }
  std::fclose(file);
  return bytes;
}

std::unique_ptr<pydee::TextNode> MakeText(const std::string& id, const std::string& content,
                                         double x, double y, double font_size,
                                         pydee::Color fill) {
  auto node = std::make_unique<pydee::TextNode>();
  node->id = id;
  node->content = content;
  node->x = x;
  node->y = y;
  node->font_size = font_size;
  node->font_family = "TestSans";
  node->fill = pydee::Paint::Solid(fill);
  return node;
}

void TestFontRegistry() {
  std::printf("fonts: registers real font data and rejects junk\n");

  std::unique_ptr<pydee::FontRegistry> fonts = pydee::FontRegistry::Create();
  CHECK_TRUE(fonts != nullptr);
  if (fonts == nullptr) {
    return;
  }

  CHECK_EQ_INT(static_cast<long long>(fonts->Families().size()), 0);
  CHECK_TRUE(!fonts->HasFamily("TestSans"));

  const std::vector<uint8_t> font = LoadTestFont();
  CHECK_TRUE(!font.empty());
  if (font.empty()) {
    std::printf("    (test font missing; skipping the rest of this case)\n");
    return;
  }

  CHECK_TRUE(fonts->Register("TestSans", font.data(), font.size()));
  CHECK_TRUE(fonts->HasFamily("TestSans"));
  CHECK_EQ_INT(static_cast<long long>(fonts->Families().size()), 1);
  // The first registration becomes the fallback family.
  CHECK_TRUE(fonts->FallbackFamily() == "TestSans");

  // Junk data must be refused, not accepted and silently unusable later.
  const std::vector<uint8_t> junk(64, 0x41);
  CHECK_TRUE(!fonts->Register("Junk", junk.data(), junk.size()));
  CHECK_TRUE(!fonts->Register("Empty", nullptr, 0));
  CHECK_TRUE(!fonts->HasFamily("Junk"));
}

void TestTextMeasurement() {
  std::printf("fonts: shaped metrics scale with content and size\n");

  std::unique_ptr<pydee::FontRegistry> fonts = pydee::FontRegistry::Create();
  const std::vector<uint8_t> font = LoadTestFont();
  if (fonts == nullptr || font.empty()) {
    return;
  }

  pydee::TextMetrics unmeasured;
  auto probe = MakeText("t", "Hello", 0.0, 0.0, 24.0, kBlack);
  // Measuring before any font is registered must fail rather than guess.
  CHECK_TRUE(!fonts->Measure(*probe, &unmeasured));

  fonts->Register("TestSans", font.data(), font.size());

  pydee::TextMetrics small;
  pydee::TextMetrics large;
  auto short_text = MakeText("a", "Hi", 0.0, 0.0, 24.0, kBlack);
  auto long_text = MakeText("b", "Hello world", 0.0, 0.0, 24.0, kBlack);
  auto big_text = MakeText("c", "Hi", 0.0, 0.0, 48.0, kBlack);

  CHECK_TRUE(fonts->Measure(*short_text, &small));
  CHECK_TRUE(small.width > 0.0);
  CHECK_TRUE(small.height > 0.0);
  CHECK_TRUE(small.first_line_ascent > 0.0);
  CHECK_EQ_INT(small.line_count, 1);

  pydee::TextMetrics longer;
  CHECK_TRUE(fonts->Measure(*long_text, &longer));
  CHECK_TRUE(longer.width > small.width);

  CHECK_TRUE(fonts->Measure(*big_text, &large));
  CHECK_TRUE(large.width > small.width);
  CHECK_TRUE(large.height > small.height);

  // Multi-line content reports more than one line.
  pydee::TextMetrics multiline;
  auto two_lines = MakeText("d", "one\ntwo", 0.0, 0.0, 24.0, kBlack);
  CHECK_TRUE(fonts->Measure(*two_lines, &multiline));
  CHECK_EQ_INT(multiline.line_count, 2);
  CHECK_TRUE(multiline.height > small.height);
}

void TestTextRenders() {
  std::printf("raster: text paints real glyphs at the SVG baseline\n");

  std::unique_ptr<pydee::FontRegistry> fonts = pydee::FontRegistry::Create();
  const std::vector<uint8_t> font = LoadTestFont();
  if (fonts == nullptr || font.empty()) {
    return;
  }
  fonts->Register("TestSans", font.data(), font.size());

  std::unique_ptr<pydee::RasterTarget> target =
      pydee::RasterTarget::Create(kSurfaceSize, kSurfaceSize);
  if (target == nullptr) {
    return;
  }

  pydee::Scene scene;
  scene.width = kSurfaceSize;
  scene.height = kSurfaceSize;
  // Baseline at y = 60, so glyphs occupy the band above it.
  scene.roots.push_back(MakeText("t1", "HHHH", 5.0, 60.0, 40.0, kBlack));

  pydee::RenderOptions options;
  options.background_color = kWhite;
  const pydee::RenderStats stats = target->Render(scene, options, fonts.get());
  CHECK_EQ_INT(stats.nodes_drawn, 1);
  CHECK_EQ_INT(target->unresolved_text(), 0);

  std::vector<uint8_t> pixels;
  CHECK_TRUE(target->ReadPixelsRGBA(&pixels));

  auto darkest_in_row = [&](int row) {
    int darkest = 255;
    for (int x = 0; x < kSurfaceSize; ++x) {
      const size_t offset = (static_cast<size_t>(row) * kSurfaceSize + x) * 4u;
      darkest = std::min(darkest, static_cast<int>(pixels[offset]));
    }
    return darkest;
  };

  // Glyphs sit above the baseline.
  CHECK_TRUE(darkest_in_row(45) < 128);
  // Well below the baseline there is nothing.
  CHECK_EQ_INT(darkest_in_row(90), 255);
  // Well above the cap height there is nothing either.
  CHECK_EQ_INT(darkest_in_row(2), 255);
}

void TestTextAlignmentAnchors() {
  std::printf("raster: text-anchor positions glyphs around the origin\n");

  std::unique_ptr<pydee::FontRegistry> fonts = pydee::FontRegistry::Create();
  const std::vector<uint8_t> font = LoadTestFont();
  if (fonts == nullptr || font.empty()) {
    return;
  }
  fonts->Register("TestSans", font.data(), font.size());

  auto first_dark_column = [&](pydee::TextAlign align) {
    std::unique_ptr<pydee::RasterTarget> target =
        pydee::RasterTarget::Create(kSurfaceSize, kSurfaceSize);
    pydee::Scene scene;
    scene.width = kSurfaceSize;
    scene.height = kSurfaceSize;
    auto text = MakeText("t", "HH", 50.0, 60.0, 30.0, kBlack);
    text->align = align;
    scene.roots.push_back(std::move(text));

    pydee::RenderOptions options;
    options.background_color = kWhite;
    target->Render(scene, options, fonts.get());

    std::vector<uint8_t> pixels;
    target->ReadPixelsRGBA(&pixels);
    for (int x = 0; x < kSurfaceSize; ++x) {
      for (int y = 0; y < kSurfaceSize; ++y) {
        const size_t offset = (static_cast<size_t>(y) * kSurfaceSize + x) * 4u;
        if (pixels[offset] < 128) {
          return x;
        }
      }
    }
    return -1;
  };

  const int left = first_dark_column(pydee::TextAlign::kLeft);
  const int centre = first_dark_column(pydee::TextAlign::kCenter);
  const int right = first_dark_column(pydee::TextAlign::kRight);

  CHECK_TRUE(left >= 0 && centre >= 0 && right >= 0);
  // start anchors at the origin, middle straddles it, end finishes at it.
  CHECK_TRUE(right < centre);
  CHECK_TRUE(centre < left);
  CHECK_TRUE(left >= 50);
}

void TestTextWithoutFontIsReported() {
  std::printf("raster: text with no registered font is counted, never substituted\n");

  std::unique_ptr<pydee::FontRegistry> fonts = pydee::FontRegistry::Create();
  std::unique_ptr<pydee::RasterTarget> target =
      pydee::RasterTarget::Create(kSurfaceSize, kSurfaceSize);
  if (fonts == nullptr || target == nullptr) {
    return;
  }

  pydee::Scene scene;
  scene.width = kSurfaceSize;
  scene.height = kSurfaceSize;
  scene.roots.push_back(MakeText("t1", "Invisible", 10.0, 50.0, 30.0, kBlack));

  pydee::RenderOptions options;
  options.background_color = kWhite;
  target->Render(scene, options, fonts.get());

  CHECK_EQ_INT(target->unresolved_text(), 1);

  std::vector<uint8_t> pixels;
  target->ReadPixelsRGBA(&pixels);
  // The surface stays clean: nothing was drawn with a substituted font.
  bool any_dark = false;
  for (size_t offset = 0; offset < pixels.size(); offset += 4) {
    if (pixels[offset] < 200) {
      any_dark = true;
      break;
    }
  }
  CHECK_TRUE(!any_dark);
}

void TestTextCodecRoundTrip() {
  std::printf("codec: a text node survives the wire format\n");

  WireWriter writer;
  writer.Header(kSurfaceSize, kSurfaceSize, 1);
  writer.NodeHeader(pydee::kNoParent, pydee::WireNodeKind::kText, 0, 1.0, pydee::Identity(), "t1");
  writer.F64(12.0);   // x
  writer.F64(64.0);   // y
  writer.F64(30.0);   // font size
  writer.F64(1.5);    // letter spacing
  writer.F64(36.0);   // line height
  writer.U8(pydee::kTextStyleBold | pydee::kTextStyleItalic);
  writer.U8(1);       // centre
  writer.U16(8);
  writer.Str("TestSans");
  writer.U32(5);
  writer.Str("Hello");
  writer.SolidPaint(kBlack);

  pydee::Scene scene;
  std::string error;
  const bool decoded =
      pydee::DecodeScene(writer.bytes().data(), writer.bytes().size(), &scene, &error);
  CHECK_TRUE(decoded);
  if (!decoded) {
    std::printf("    decode error: %s\n", error.c_str());
    return;
  }

  CHECK_EQ_INT(static_cast<long long>(scene.roots.size()), 1);
  const pydee::Node* node = scene.roots[0].get();
  CHECK_TRUE(node->kind == pydee::NodeKind::kText);
  if (node->kind != pydee::NodeKind::kText) {
    return;
  }
  const auto* text = static_cast<const pydee::TextNode*>(node);
  CHECK_TRUE(text->content == "Hello");
  CHECK_TRUE(text->font_family == "TestSans");
  CHECK_NEAR(text->x, 12.0, 1e-9);
  CHECK_NEAR(text->y, 64.0, 1e-9);
  CHECK_NEAR(text->font_size, 30.0, 1e-9);
  CHECK_NEAR(text->letter_spacing, 1.5, 1e-9);
  CHECK_NEAR(text->line_height, 36.0, 1e-9);
  CHECK_TRUE(text->bold);
  CHECK_TRUE(text->italic);
  CHECK_TRUE(text->direction == pydee::TextDirection::kLtr);
  CHECK_TRUE(text->align == pydee::TextAlign::kCenter);
  CHECK_EQ_INT(text->fill.color, static_cast<long long>(kBlack));
}

// --------------------------------------------------------------------------- //
// Gradients
// --------------------------------------------------------------------------- //

constexpr pydee::Color kBlue = pydee::MakeColor(255, 0, 0, 255);

/** Header plus a full-surface rect, up to but excluding the fill paint. */
void WriteFullSurfaceRectPrefix(WireWriter& writer) {
  writer.Header(kSurfaceSize, kSurfaceSize, 1);
  writer.NodeHeader(pydee::kNoParent, pydee::WireNodeKind::kRect, 0, 1.0, pydee::Identity(), "g1");
  writer.F64(0.0);                                 // x
  writer.F64(0.0);                                 // y
  writer.F64(static_cast<double>(kSurfaceSize));   // width
  writer.F64(static_cast<double>(kSurfaceSize));   // height
  writer.F64(0.0);                                 // corner radius
}

/**
 * Decode a wire buffer and render it, so gradients are proven through the real
 * decoder rather than by constructing a Gradient in C++ that the encoder could
 * never actually produce.
 */
bool RenderWireScene(const WireWriter& writer, RasterTarget* target, int* unresolved_paints) {
  pydee::Scene scene;
  std::string error;
  if (!pydee::DecodeScene(writer.bytes().data(), writer.bytes().size(), &scene, &error)) {
    std::printf("    decode error: %s\n", error.c_str());
    return false;
  }
  *target = MakeRasterTarget();
  if (!target->Valid()) {
    return false;
  }
  pydee::SkiaRenderer renderer(target->surface->getCanvas(), nullptr);
  pydee::RenderOptions options;
  options.background_color = kWhite;
  pydee::RenderScene(scene, renderer, options);
  *unresolved_paints = renderer.unresolved_paints();
  return true;
}

void TestLinearGradientObjectBoundingBox() {
  std::printf("raster: a linear gradient in objectBoundingBox units spans the shape\n");

  WireWriter writer;
  WriteFullSurfaceRectPrefix(writer);
  writer.LinearGradientPaint(0.0, 0.0, 1.0, 0.0, /*spread=*/0, /*units=*/1,
                             {{0.0, kRed}, {1.0, kBlue}});
  writer.NoStroke();

  RasterTarget target;
  int unresolved = -1;
  if (!RenderWireScene(writer, &target, &unresolved)) {
    CHECK_TRUE(false);
    return;
  }
  CHECK_EQ_INT(unresolved, 0);

  const SkColor left = target.ColorAt(2, 50);
  const SkColor right = target.ColorAt(97, 50);
  const SkColor middle = target.ColorAt(50, 50);

  // Asserted as an ordering rather than exact values, so the test does not
  // depend on which colour space Skia interpolates in.
  CHECK_TRUE(SkColorGetR(left) > 200 && SkColorGetB(left) < 60);
  CHECK_TRUE(SkColorGetB(right) > 200 && SkColorGetR(right) < 60);
  CHECK_TRUE(SkColorGetR(middle) > 40 && SkColorGetR(middle) < 220);
  CHECK_TRUE(SkColorGetB(middle) > 40 && SkColorGetB(middle) < 220);
}

void TestLinearGradientUserSpaceUnits() {
  std::printf("raster: gradientUnits is honoured, not assumed\n");

  WireWriter writer;
  WriteFullSurfaceRectPrefix(writer);
  // The same visual result as the objectBoundingBox case above, but expressed in
  // user space. If units were ignored, x2 = 100 would be read as 100x the
  // bounding box and the whole shape would clamp to the first stop.
  writer.LinearGradientPaint(0.0, 0.0, static_cast<double>(kSurfaceSize), 0.0, /*spread=*/0,
                             /*units=*/0, {{0.0, kRed}, {1.0, kBlue}});
  writer.NoStroke();

  RasterTarget target;
  int unresolved = -1;
  if (!RenderWireScene(writer, &target, &unresolved)) {
    CHECK_TRUE(false);
    return;
  }
  CHECK_EQ_INT(unresolved, 0);
  CHECK_TRUE(SkColorGetR(target.ColorAt(2, 50)) > 200);
  CHECK_TRUE(SkColorGetB(target.ColorAt(97, 50)) > 200);
}

void TestRadialGradientRenders() {
  std::printf("raster: a radial gradient runs from its centre outwards\n");

  WireWriter writer;
  WriteFullSurfaceRectPrefix(writer);
  writer.RadialGradientPaint(0.5, 0.5, 0.5, 0.5, 0.5, /*spread=*/0, /*units=*/1,
                             {{0.0, kRed}, {1.0, kBlue}});
  writer.NoStroke();

  RasterTarget target;
  int unresolved = -1;
  if (!RenderWireScene(writer, &target, &unresolved)) {
    CHECK_TRUE(false);
    return;
  }
  CHECK_EQ_INT(unresolved, 0);

  const SkColor centre = target.ColorAt(50, 50);
  const SkColor edge = target.ColorAt(50, 2);
  CHECK_TRUE(SkColorGetR(centre) > 200 && SkColorGetB(centre) < 60);
  CHECK_TRUE(SkColorGetB(edge) > 150);
}

void TestGradientSpreadRepeat() {
  std::printf("raster: spreadMethod repeat tiles the ramp\n");

  WireWriter writer;
  WriteFullSurfaceRectPrefix(writer);
  // A 25px ramp across a 100px shape, so the ramp restarts three times.
  writer.LinearGradientPaint(0.0, 0.0, 25.0, 0.0, /*spread=*/2, /*units=*/0,
                             {{0.0, kRed}, {1.0, kBlue}});
  writer.NoStroke();

  RasterTarget target;
  int unresolved = -1;
  if (!RenderWireScene(writer, &target, &unresolved)) {
    CHECK_TRUE(false);
    return;
  }
  CHECK_EQ_INT(unresolved, 0);

  CHECK_TRUE(SkColorGetR(target.ColorAt(1, 50)) > 200);
  CHECK_TRUE(SkColorGetB(target.ColorAt(23, 50)) > 150);
  // Without repeat this would still be blue; with it the ramp has restarted.
  CHECK_TRUE(SkColorGetR(target.ColorAt(26, 50)) > 200);
}

void TestGradientSingleStopIsSolid() {
  std::printf("raster: a one-stop gradient paints that colour flat, as SVG defines\n");

  WireWriter writer;
  WriteFullSurfaceRectPrefix(writer);
  writer.LinearGradientPaint(0.0, 0.0, 1.0, 0.0, /*spread=*/0, /*units=*/1, {{0.0, kRed}});
  writer.NoStroke();

  RasterTarget target;
  int unresolved = -1;
  if (!RenderWireScene(writer, &target, &unresolved)) {
    CHECK_TRUE(false);
    return;
  }
  CHECK_EQ_INT(unresolved, 0);
  CHECK_TRUE(SkColorGetR(target.ColorAt(2, 50)) > 250);
  CHECK_TRUE(SkColorGetR(target.ColorAt(97, 50)) > 250);
}

void TestGradientWithoutStopsIsReported() {
  std::printf("raster: a gradient with no stops is reported, never guessed at\n");

  WireWriter writer;
  WriteFullSurfaceRectPrefix(writer);
  writer.LinearGradientPaint(0.0, 0.0, 1.0, 0.0, /*spread=*/0, /*units=*/1, {});
  writer.NoStroke();

  RasterTarget target;
  int unresolved = -1;
  if (!RenderWireScene(writer, &target, &unresolved)) {
    CHECK_TRUE(false);
    return;
  }
  // Counted, and the surface is left as the background rather than filled with
  // an invented colour.
  CHECK_EQ_INT(unresolved, 1);
  CHECK_EQ_INT(SkColorGetR(target.ColorAt(50, 50)), 255);
  CHECK_EQ_INT(SkColorGetG(target.ColorAt(50, 50)), 255);
  CHECK_EQ_INT(SkColorGetB(target.ColorAt(50, 50)), 255);
}

void TestGradientStrokeIsPainted() {
  std::printf("raster: a gradient stroke paints through the same path as a fill\n");

  WireWriter writer;
  writer.Header(kSurfaceSize, kSurfaceSize, 1);
  writer.NodeHeader(pydee::kNoParent, pydee::WireNodeKind::kRect, 0, 1.0, pydee::Identity(), "s1");
  writer.F64(20.0);
  writer.F64(20.0);
  writer.F64(60.0);
  writer.F64(60.0);
  writer.F64(0.0);
  writer.NoPaint();  // no fill
  writer.LinearGradientPaint(0.0, 0.0, 1.0, 0.0, /*spread=*/0, /*units=*/1,
                             {{0.0, kRed}, {1.0, kBlue}});
  writer.F64(8.0);  // stroke width

  RasterTarget target;
  int unresolved = -1;
  if (!RenderWireScene(writer, &target, &unresolved)) {
    CHECK_TRUE(false);
    return;
  }
  CHECK_EQ_INT(unresolved, 0);
  // Left edge of the stroke is near the ramp's start, the right edge near its end.
  CHECK_TRUE(SkColorGetR(target.ColorAt(20, 50)) > 180);
  CHECK_TRUE(SkColorGetB(target.ColorAt(79, 50)) > 180);
  // The interior is unfilled, so it stays background.
  CHECK_EQ_INT(SkColorGetR(target.ColorAt(50, 50)), 255);
  CHECK_EQ_INT(SkColorGetB(target.ColorAt(50, 50)), 255);
}

void TestCodecRejectsBadGradients() {
  std::printf("codec: malformed gradients and contradictory text styles are rejected\n");

  auto decodes = [](const WireWriter& writer) {
    pydee::Scene scene;
    std::string error;
    return pydee::DecodeScene(writer.bytes().data(), writer.bytes().size(), &scene, &error);
  };

  {
    // Descending stop offsets would ramp differently in Skia than in SVG.
    WireWriter writer;
    WriteFullSurfaceRectPrefix(writer);
    writer.LinearGradientPaint(0.0, 0.0, 1.0, 0.0, 0, 1, {{0.8, kRed}, {0.2, kBlue}});
    writer.NoStroke();
    CHECK_TRUE(!decodes(writer));
  }
  {
    // An offset outside 0..1 is not representable in SVG.
    WireWriter writer;
    WriteFullSurfaceRectPrefix(writer);
    writer.LinearGradientPaint(0.0, 0.0, 1.0, 0.0, 0, 1, {{0.0, kRed}, {1.5, kBlue}});
    writer.NoStroke();
    CHECK_TRUE(!decodes(writer));
  }
  {
    // Unknown spread method.
    WireWriter writer;
    WriteFullSurfaceRectPrefix(writer);
    writer.LinearGradientPaint(0.0, 0.0, 1.0, 0.0, 7, 1, {{0.0, kRed}, {1.0, kBlue}});
    writer.NoStroke();
    CHECK_TRUE(!decodes(writer));
  }
  {
    // Unknown gradient units.
    WireWriter writer;
    WriteFullSurfaceRectPrefix(writer);
    writer.LinearGradientPaint(0.0, 0.0, 1.0, 0.0, 0, 5, {{0.0, kRed}, {1.0, kBlue}});
    writer.NoStroke();
    CHECK_TRUE(!decodes(writer));
  }
  {
    // Both decoration bits set means the two halves of the codec disagree.
    WireWriter writer;
    writer.Header(kSurfaceSize, kSurfaceSize, 1);
    writer.NodeHeader(pydee::kNoParent, pydee::WireNodeKind::kText, 0, 1.0, pydee::Identity(),
                      "t1");
    writer.F64(0.0);
    writer.F64(0.0);
    writer.F64(20.0);
    writer.F64(0.0);
    writer.F64(0.0);
    writer.U8(pydee::kTextStyleUnderline | pydee::kTextStyleLineThrough);
    writer.U8(0);
    writer.U16(8);
    writer.Str("TestSans");
    writer.U32(2);
    writer.Str("hi");
    writer.SolidPaint(kBlack);
    CHECK_TRUE(!decodes(writer));
  }
}

// --------------------------------------------------------------------------- //
// Text decoration
// --------------------------------------------------------------------------- //

/** Darkest red channel found in a horizontal band of the surface. */
int DarkestInBand(const std::vector<uint8_t>& pixels, int first_row, int last_row) {
  int darkest = 255;
  for (int row = first_row; row <= last_row; ++row) {
    for (int x = 0; x < kSurfaceSize; ++x) {
      const size_t offset = (static_cast<size_t>(row) * kSurfaceSize + x) * 4u;
      darkest = std::min(darkest, static_cast<int>(pixels[offset]));
    }
  }
  return darkest;
}

void TestTextDecorationRenders() {
  std::printf("raster: an underline is drawn below the baseline in the text colour\n");

  std::unique_ptr<pydee::FontRegistry> fonts = pydee::FontRegistry::Create();
  const std::vector<uint8_t> font = LoadTestFont();
  if (fonts == nullptr || font.empty()) {
    return;
  }
  fonts->Register("TestSans", font.data(), font.size());

  auto render = [&](pydee::TextDecoration decoration, std::vector<uint8_t>* pixels) {
    std::unique_ptr<pydee::RasterTarget> target =
        pydee::RasterTarget::Create(kSurfaceSize, kSurfaceSize);
    if (target == nullptr) {
      return false;
    }
    pydee::Scene scene;
    scene.width = kSurfaceSize;
    scene.height = kSurfaceSize;
    auto text = MakeText("t1", "nnnn", 5.0, 50.0, 28.0, kBlack);
    text->decoration = decoration;
    scene.roots.push_back(std::move(text));

    pydee::RenderOptions options;
    options.background_color = kWhite;
    target->Render(scene, options, fonts.get());
    return target->ReadPixelsRGBA(pixels);
  };

  std::vector<uint8_t> plain;
  std::vector<uint8_t> underlined;
  CHECK_TRUE(render(pydee::TextDecoration::kNone, &plain));
  CHECK_TRUE(render(pydee::TextDecoration::kUnderline, &underlined));
  if (plain.empty() || underlined.empty()) {
    return;
  }

  // 'n' has no descender, so the band just below the baseline is empty without a
  // decoration and must contain dark pixels with one.
  CHECK_EQ_INT(DarkestInBand(plain, 52, 60), 255);
  // Dark, not white: this is what proves the decoration takes the text's colour
  // rather than skparagraph's default.
  CHECK_TRUE(DarkestInBand(underlined, 52, 60) < 128);

  std::vector<uint8_t> struck;
  CHECK_TRUE(render(pydee::TextDecoration::kLineThrough, &struck));
  if (struck.empty()) {
    return;
  }
  // A strike sits within the glyphs, so it must NOT appear below the baseline.
  CHECK_EQ_INT(DarkestInBand(struck, 52, 60), 255);
}

void TestGradientTextDecorationIsReportedAsApproximate() {
  std::printf("raster: a gradient-filled decoration is counted as an approximation\n");

  std::unique_ptr<pydee::FontRegistry> fonts = pydee::FontRegistry::Create();
  const std::vector<uint8_t> font = LoadTestFont();
  if (fonts == nullptr || font.empty()) {
    return;
  }
  fonts->Register("TestSans", font.data(), font.size());

  std::unique_ptr<pydee::RasterTarget> target =
      pydee::RasterTarget::Create(kSurfaceSize, kSurfaceSize);
  if (target == nullptr) {
    return;
  }

  auto gradient = std::make_shared<pydee::Gradient>();
  gradient->type = pydee::Gradient::Type::kLinear;
  gradient->units = pydee::GradientUnits::kObjectBoundingBox;
  gradient->x1 = 0.0;
  gradient->y1 = 0.0;
  gradient->x2 = 1.0;
  gradient->y2 = 0.0;
  gradient->stops = {{0.0, kRed}, {1.0, kBlue}};

  pydee::Scene scene;
  scene.width = kSurfaceSize;
  scene.height = kSurfaceSize;
  auto text = MakeText("t1", "nnnn", 5.0, 50.0, 28.0, kBlack);
  text->fill = pydee::Paint::FromGradient(gradient);
  text->decoration = pydee::TextDecoration::kUnderline;
  scene.roots.push_back(std::move(text));

  pydee::RenderOptions options;
  options.background_color = kWhite;
  target->Render(scene, options, fonts.get());

  // skparagraph cannot apply a shader to a decoration line, so the engine says
  // so instead of letting a wrong-coloured underline look like a bug.
  CHECK_EQ_INT(target->approximated_paints(), 1);
  CHECK_EQ_INT(target->unresolved_paints(), 0);

  std::vector<uint8_t> pixels;
  CHECK_TRUE(target->ReadPixelsRGBA(&pixels));
  if (!pixels.empty()) {
    // The glyphs themselves still come from the gradient, so the left of the
    // text is red-dominant.
    const size_t offset = (static_cast<size_t>(40) * kSurfaceSize + 8) * 4u;
    CHECK_TRUE(pixels[offset] > pixels[offset + 2]);
  }
}

// --------------------------------------------------------------------------- //
// Paint servers: SVG defs parsed in C++, not TypeScript
// --------------------------------------------------------------------------- //

void TestParseCssColor() {
  std::printf("paint servers: CSS colour forms parse the same as the TypeScript encoder\n");

  pydee::Color color = 0;
  CHECK_TRUE(pydee::ParseCssColor("#f00", &color));
  CHECK_EQ_INT(color, static_cast<long long>(pydee::MakeColor(255, 255, 0, 0)));

  CHECK_TRUE(pydee::ParseCssColor("#FF0000", &color));
  CHECK_EQ_INT(color, static_cast<long long>(pydee::MakeColor(255, 255, 0, 0)));

  // CSS hex is #RRGGBBAA while the engine's Color is AARRGGBB.
  CHECK_TRUE(pydee::ParseCssColor("#0000ff80", &color));
  CHECK_EQ_INT(color, static_cast<long long>(pydee::MakeColor(0x80, 0, 0, 255)));

  CHECK_TRUE(pydee::ParseCssColor("rgb(0, 128, 255)", &color));
  CHECK_EQ_INT(color, static_cast<long long>(pydee::MakeColor(255, 0, 128, 255)));

  CHECK_TRUE(pydee::ParseCssColor("rgba(255, 0, 0, 0.5)", &color));
  CHECK_EQ_INT((color >> 24) & 0xFF, 128);

  CHECK_TRUE(pydee::ParseCssColor("rgb(100%, 0%, 0%)", &color));
  CHECK_EQ_INT(color, static_cast<long long>(pydee::MakeColor(255, 255, 0, 0)));

  CHECK_TRUE(pydee::ParseCssColor("  Navy ", &color));
  CHECK_EQ_INT(color, static_cast<long long>(pydee::MakeColor(255, 0, 0, 128)));

  // "no paint" keywords and anything unrecognised must fail rather than guess.
  CHECK_TRUE(!pydee::ParseCssColor("none", &color));
  CHECK_TRUE(!pydee::ParseCssColor("transparent", &color));
  CHECK_TRUE(!pydee::ParseCssColor("currentColor", &color));
  CHECK_TRUE(!pydee::ParseCssColor("#12345", &color));
  CHECK_TRUE(!pydee::ParseCssColor("", &color));
}

void TestParseSvgTransform() {
  std::printf("paint servers: an SVG transform list composes left to right\n");

  pydee::Matrix2D m;
  CHECK_TRUE(pydee::ParseSvgTransform("translate(10, 20)", &m));
  CHECK_NEAR(m.e, 10.0, 1e-9);
  CHECK_NEAR(m.f, 20.0, 1e-9);

  CHECK_TRUE(pydee::ParseSvgTransform("matrix(2 0 0 3 4 5)", &m));
  CHECK_NEAR(m.a, 2.0, 1e-9);
  CHECK_NEAR(m.d, 3.0, 1e-9);
  CHECK_NEAR(m.e, 4.0, 1e-9);
  CHECK_NEAR(m.f, 5.0, 1e-9);

  // translate then scale: the point (1,0) scales first, then translates.
  CHECK_TRUE(pydee::ParseSvgTransform("translate(10 0) scale(2)", &m));
  const pydee::Point2D scaled = pydee::TransformPoint(m, pydee::Point2D{1.0, 0.0});
  CHECK_NEAR(scaled.x, 12.0, 1e-9);
  CHECK_NEAR(scaled.y, 0.0, 1e-9);

  CHECK_TRUE(pydee::ParseSvgTransform("rotate(90)", &m));
  const pydee::Point2D rotated = pydee::TransformPoint(m, pydee::Point2D{1.0, 0.0});
  CHECK_NEAR(rotated.x, 0.0, 1e-9);
  CHECK_NEAR(rotated.y, 1.0, 1e-9);

  CHECK_TRUE(pydee::ParseSvgTransform("skewX(45)", &m));
  CHECK_NEAR(m.c, 1.0, 1e-9);

  // Malformed input is rejected instead of partially applied.
  CHECK_TRUE(!pydee::ParseSvgTransform("translate(", &m));
  CHECK_TRUE(!pydee::ParseSvgTransform("frobnicate(1)", &m));
  CHECK_TRUE(!pydee::ParseSvgTransform("matrix(1 2 3)", &m));
  CHECK_TRUE(!pydee::ParseSvgTransform("", &m));
}

void TestPaintServerTableParsesGradients() {
  std::printf("paint servers: linear and radial gradients are read out of real defs markup\n");

  const std::string defs =
      "<defs>"
      "  <!-- a comment that must not confuse the scanner -->"
      "  <style>.x { fill: url(#nope) }</style>"
      "  <linearGradient id='g1' x1='0%' y1='0%' x2='100%' y2='0%' spreadMethod='reflect'>"
      "    <stop offset='0%' stop-color='#ff0000'/>"
      "    <stop offset='100%' stop-color='blue' stop-opacity='0.5'/>"
      "  </linearGradient>"
      "  <radialGradient id=\"g2\" cx=\"40%\" cy=\"60%\" r=\"25%\" fx=\"45%\">"
      "    <stop offset=\"0\" style=\"stop-color:#00ff00\"/>"
      "    <stop offset=\"1\" style=\"stop-color:#000000;stop-opacity:0\"/>"
      "  </radialGradient>"
      "</defs>";

  pydee::PaintServerTable table;
  std::string error;
  CHECK_TRUE(table.Parse(defs, 200.0, 100.0, &error));
  CHECK_EQ_INT(static_cast<long long>(table.size()), 2);

  std::shared_ptr<const pydee::Gradient> linear = table.Find("g1");
  CHECK_TRUE(linear != nullptr);
  if (linear != nullptr) {
    CHECK_TRUE(linear->type == pydee::Gradient::Type::kLinear);
    // No gradientUnits attribute means objectBoundingBox, so 100% is 1.0 and the
    // viewport passed above must not leak in.
    CHECK_TRUE(linear->units == pydee::GradientUnits::kObjectBoundingBox);
    CHECK_NEAR(linear->x1, 0.0, 1e-9);
    CHECK_NEAR(linear->x2, 1.0, 1e-9);
    CHECK_NEAR(linear->y2, 0.0, 1e-9);
    CHECK_TRUE(linear->spread == pydee::GradientSpread::kReflect);
    CHECK_EQ_INT(static_cast<long long>(linear->stops.size()), 2);
    if (linear->stops.size() == 2) {
      CHECK_EQ_INT(linear->stops[0].color, static_cast<long long>(kRed));
      CHECK_NEAR(linear->stops[1].offset, 1.0, 1e-9);
      // stop-opacity multiplies the stop colour's alpha.
      CHECK_EQ_INT((linear->stops[1].color >> 24) & 0xFF, 128);
      CHECK_EQ_INT(linear->stops[1].color & 0x00FFFFFF, 0x0000FF);
    }
  }

  std::shared_ptr<const pydee::Gradient> radial = table.Find("g2");
  CHECK_TRUE(radial != nullptr);
  if (radial != nullptr) {
    CHECK_TRUE(radial->type == pydee::Gradient::Type::kRadial);
    CHECK_NEAR(radial->cx, 0.4, 1e-9);
    CHECK_NEAR(radial->cy, 0.6, 1e-9);
    CHECK_NEAR(radial->r, 0.25, 1e-9);
    // fx was given, fy was not, so fy falls back to cy rather than to a default.
    CHECK_NEAR(radial->fx, 0.45, 1e-9);
    CHECK_NEAR(radial->fy, 0.6, 1e-9);
    CHECK_EQ_INT(static_cast<long long>(radial->stops.size()), 2);
    if (radial->stops.size() == 2) {
      // Colours may come from the `style` attribute as well as presentation
      // attributes, which is what the Canonical_SVG can emit.
      CHECK_EQ_INT(radial->stops[0].color & 0x00FFFFFF, 0x00FF00);
      CHECK_EQ_INT((radial->stops[1].color >> 24) & 0xFF, 0);
    }
  }
}

void TestPaintServerDefaultsAndUnits() {
  std::printf("paint servers: SVG defaults and userSpaceOnUse percentages are resolved\n");

  const std::string defs =
      "<linearGradient id='bare'><stop offset='0' stop-color='#000'/>"
      "<stop offset='1' stop-color='#fff'/></linearGradient>"
      "<radialGradient id='user' gradientUnits='userSpaceOnUse'>"
      "<stop offset='0' stop-color='#000'/><stop offset='1' stop-color='#fff'/>"
      "</radialGradient>";

  pydee::PaintServerTable table;
  std::string error;
  CHECK_TRUE(table.Parse(defs, 200.0, 100.0, &error));

  std::shared_ptr<const pydee::Gradient> bare = table.Find("bare");
  CHECK_TRUE(bare != nullptr);
  if (bare != nullptr) {
    // SVG defaults for a linear gradient: x1=0%, y1=0%, x2=100%, y2=0%.
    CHECK_NEAR(bare->x1, 0.0, 1e-9);
    CHECK_NEAR(bare->y1, 0.0, 1e-9);
    CHECK_NEAR(bare->x2, 1.0, 1e-9);
    CHECK_NEAR(bare->y2, 0.0, 1e-9);
  }

  std::shared_ptr<const pydee::Gradient> user = table.Find("user");
  CHECK_TRUE(user != nullptr);
  if (user != nullptr) {
    CHECK_TRUE(user->units == pydee::GradientUnits::kUserSpace);
    // Defaults are 50%, which in user space means half the viewport extent, and
    // the radius resolves against the normalised diagonal.
    CHECK_NEAR(user->cx, 100.0, 1e-9);
    CHECK_NEAR(user->cy, 50.0, 1e-9);
    CHECK_NEAR(user->r, 0.5 * std::sqrt((200.0 * 200.0 + 100.0 * 100.0) / 2.0), 1e-6);
  }
}

void TestPaintServerInheritanceAndCycles() {
  std::printf("paint servers: href inheritance is followed, and cycles cannot hang it\n");

  const std::string defs =
      "<linearGradient id='base' x1='0' y1='0' x2='1' y2='0' spreadMethod='repeat'>"
      "<stop offset='0' stop-color='red'/><stop offset='1' stop-color='blue'/>"
      "</linearGradient>"
      "<linearGradient id='child' xlink:href='#base' x1='0.25'/>"
      "<linearGradient id='loopA' xlink:href='#loopB'>"
      "<stop offset='0' stop-color='black'/><stop offset='1' stop-color='white'/>"
      "</linearGradient>"
      "<linearGradient id='loopB' xlink:href='#loopA'/>";

  pydee::PaintServerTable table;
  std::string error;
  CHECK_TRUE(table.Parse(defs, 100.0, 100.0, &error));

  std::shared_ptr<const pydee::Gradient> child = table.Find("child");
  CHECK_TRUE(child != nullptr);
  if (child != nullptr) {
    // Its own x1 wins; everything else, including the stop list, is inherited.
    CHECK_NEAR(child->x1, 0.25, 1e-9);
    CHECK_NEAR(child->x2, 1.0, 1e-9);
    CHECK_TRUE(child->spread == pydee::GradientSpread::kRepeat);
    CHECK_EQ_INT(static_cast<long long>(child->stops.size()), 2);
  }

  // The cycle resolves to whatever is reachable without looping forever.
  std::shared_ptr<const pydee::Gradient> loop_b = table.Find("loopB");
  CHECK_TRUE(loop_b != nullptr);
  if (loop_b != nullptr) {
    CHECK_EQ_INT(static_cast<long long>(loop_b->stops.size()), 2);
  }
}

void TestPaintServerReportsWhatItCannotRepresent() {
  std::printf("paint servers: unrepresentable servers are counted, never half-applied\n");

  const std::string defs =
      "<linearGradient id='bad'><stop offset='0' stop-color='currentColor'/>"
      "<stop offset='1' stop-color='#fff'/></linearGradient>"
      "<linearGradient id='empty'></linearGradient>"
      "<pattern id='p1'><rect width='4' height='4'/></pattern>"
      "<linearGradient id='badtransform' gradientTransform='wobble(3)'>"
      "<stop offset='0' stop-color='#000'/><stop offset='1' stop-color='#fff'/>"
      "</linearGradient>";

  pydee::PaintServerTable table;
  std::string error;
  CHECK_TRUE(table.Parse(defs, 100.0, 100.0, &error));

  // A stop colour that cannot be resolved would change the whole ramp, so the
  // gradient is dropped rather than partially honoured.
  CHECK_TRUE(table.Find("bad") == nullptr);
  CHECK_TRUE(table.Find("empty") == nullptr);
  CHECK_TRUE(table.Find("p1") == nullptr);
  CHECK_TRUE(table.Find("badtransform") == nullptr);
  CHECK_EQ_INT(table.size(), 0);
  // One per dropped server: two gradients, the pattern, and the bad transform.
  CHECK_EQ_INT(table.unsupported(), 4);

  // Empty markup is valid and simply yields nothing.
  pydee::PaintServerTable empty;
  CHECK_TRUE(empty.Parse("", 100.0, 100.0, &error));
  CHECK_EQ_INT(empty.size(), 0);
}

void TestReferencePaintResolvesThroughWire() {
  std::printf("codec: a url(#id) paint resolves against the parsed defs table\n");

  pydee::PaintServerTable table;
  std::string error;
  CHECK_TRUE(table.Parse("<linearGradient id='ramp' x1='0' y1='0' x2='1' y2='0'>"
                         "<stop offset='0' stop-color='red'/>"
                         "<stop offset='1' stop-color='blue'/></linearGradient>",
                         kSurfaceSize, kSurfaceSize, &error));
  CHECK_EQ_INT(static_cast<long long>(table.size()), 1);

  WireWriter writer;
  WriteFullSurfaceRectPrefix(writer);
  writer.ReferencePaint("ramp");
  writer.NoStroke();

  pydee::Scene scene;
  const bool decoded = pydee::DecodeScene(writer.bytes().data(), writer.bytes().size(), &scene,
                                          &error, &table);
  CHECK_TRUE(decoded);
  if (!decoded) {
    std::printf("    decode error: %s\n", error.c_str());
    return;
  }
  CHECK_EQ_INT(scene.unresolved_paint_references, 0);

  RasterTarget target = MakeRasterTarget();
  if (!target.Valid()) {
    return;
  }
  pydee::SkiaRenderer renderer(target.surface->getCanvas(), nullptr);
  pydee::RenderOptions options;
  options.background_color = kWhite;
  pydee::RenderScene(scene, renderer, options);
  CHECK_EQ_INT(renderer.unresolved_paints(), 0);
  CHECK_TRUE(SkColorGetR(target.ColorAt(2, 50)) > 200);
  CHECK_TRUE(SkColorGetB(target.ColorAt(97, 50)) > 200);

  // Same buffer, no table: the reference is counted and nothing is painted.
  pydee::Scene without;
  CHECK_TRUE(
      pydee::DecodeScene(writer.bytes().data(), writer.bytes().size(), &without, &error, nullptr));
  CHECK_EQ_INT(without.unresolved_paint_references, 1);

  RasterTarget blank = MakeRasterTarget();
  if (!blank.Valid()) {
    return;
  }
  pydee::SkiaRenderer blank_renderer(blank.surface->getCanvas(), nullptr);
  pydee::RenderScene(without, blank_renderer, options);
  CHECK_EQ_INT(SkColorGetR(blank.ColorAt(50, 50)), 255);
  CHECK_EQ_INT(SkColorGetG(blank.ColorAt(50, 50)), 255);
  CHECK_EQ_INT(SkColorGetB(blank.ColorAt(50, 50)), 255);
}

// --------------------------------------------------------------------------- //
// Selection geometry.
//
// These mirror frontend/src/editor/geometry/selectionGeometry.test.ts. The point
// is not that the C++ is correct in isolation — it is that both implementations
// answer "where is this object" identically, so the selection outline cannot sit
// away from the shape it selects. engine-parity.mts then compares the two on real
// extracted scenes.
// --------------------------------------------------------------------------- //

std::unique_ptr<pydee::RectNode> MakeBoundedRect(const std::string& id, double width,
                                                double height) {
  auto node = MakeRect(id, 0.0, 0.0, width, height, kRed);
  node->local_bounds = pydee::RectF{0.0, 0.0, width, height};
  return node;
}

void TestWorldTransformIncludesAncestors() {
  std::printf("selection: the world transform carries the whole ancestor chain\n");

  auto group = std::make_unique<pydee::GroupNode>();
  group->id = "g";
  // translate(100, 50) scale(2) — the composition the encoder produces for a
  // scaled group.
  group->local_transform = pydee::Multiply(pydee::Translation(100.0, 50.0),
                                           pydee::Scaling(2.0, 2.0));

  auto rect = MakeBoundedRect("r", 20.0, 10.0);
  rect->local_transform = pydee::Translation(10.0, 5.0);
  group->children.push_back(std::move(rect));

  pydee::Scene scene;
  scene.roots.push_back(std::move(group));

  const std::optional<pydee::Matrix2D> world = pydee::WorldTransformForNode(scene, "r");
  CHECK_TRUE(world.has_value());
  if (world.has_value()) {
    CHECK_NEAR(world->a, 2.0, 1e-12);
    CHECK_NEAR(world->b, 0.0, 1e-12);
    CHECK_NEAR(world->c, 0.0, 1e-12);
    CHECK_NEAR(world->d, 2.0, 1e-12);
    // The group's scale applies to the child's own translation as well, which is
    // exactly what a TypeScript-side "divide by zoom" conversion gets wrong.
    CHECK_NEAR(world->e, 120.0, 1e-12);
    CHECK_NEAR(world->f, 60.0, 1e-12);
  }

  CHECK_TRUE(!pydee::WorldTransformForNode(scene, "does-not-exist").has_value());

  pydee::OrientedBounds bounds;
  pydee::SelectionFailure failure = pydee::SelectionFailure::kNodeNotFound;
  CHECK_TRUE(pydee::OrientedBoundsForNode(scene, "r", &bounds, &failure));
  CHECK_NEAR(bounds.top_left.x, 120.0, 1e-12);
  CHECK_NEAR(bounds.top_left.y, 60.0, 1e-12);
  CHECK_NEAR(bounds.top_right.x, 160.0, 1e-12);
  CHECK_NEAR(bounds.top_right.y, 60.0, 1e-12);
  CHECK_NEAR(bounds.bottom_right.x, 160.0, 1e-12);
  CHECK_NEAR(bounds.bottom_right.y, 80.0, 1e-12);
  CHECK_NEAR(bounds.bottom_left.x, 120.0, 1e-12);
  CHECK_NEAR(bounds.bottom_left.y, 80.0, 1e-12);
  CHECK_NEAR(pydee::OrientedAngleDegrees(bounds), 0.0, 1e-12);
  CHECK_TRUE(!pydee::OrientedIsFlipped(bounds));
  CHECK_NEAR(pydee::OrientedCenter(bounds).x, 140.0, 1e-12);
  CHECK_NEAR(pydee::OrientedCenter(bounds).y, 70.0, 1e-12);
}

void TestOrientedBoundsRotatesWithTheNode() {
  std::printf("selection: a rotated node's corners are the object's own corners\n");

  auto rect = MakeBoundedRect("r", 20.0, 10.0);
  rect->local_transform = pydee::Rotation(90.0);
  pydee::Scene scene;
  scene.roots.push_back(std::move(rect));

  pydee::OrientedBounds bounds;
  pydee::SelectionFailure failure = pydee::SelectionFailure::kNodeNotFound;
  CHECK_TRUE(pydee::OrientedBoundsForNode(scene, "r", &bounds, &failure));

  // Quarter turn clockwise in SVG's y-down space: the top edge now runs down.
  CHECK_NEAR(bounds.top_left.x, 0.0, 1e-9);
  CHECK_NEAR(bounds.top_left.y, 0.0, 1e-9);
  CHECK_NEAR(bounds.top_right.x, 0.0, 1e-9);
  CHECK_NEAR(bounds.top_right.y, 20.0, 1e-9);
  CHECK_NEAR(bounds.bottom_right.x, -10.0, 1e-9);
  CHECK_NEAR(bounds.bottom_right.y, 20.0, 1e-9);
  CHECK_NEAR(bounds.bottom_left.x, -10.0, 1e-9);
  CHECK_NEAR(bounds.bottom_left.y, 0.0, 1e-9);

  CHECK_NEAR(pydee::OrientedAngleDegrees(bounds), 90.0, 1e-9);
  CHECK_TRUE(!pydee::OrientedIsFlipped(bounds));

  // Every handle is an interpolation of the corners, so all eight rotate too.
  const pydee::Point2D north = pydee::HandleWorldPosition(bounds, pydee::ResizeHandle::kNorth);
  CHECK_NEAR(north.x, 0.0, 1e-9);
  CHECK_NEAR(north.y, 10.0, 1e-9);
  const pydee::Point2D anchor =
      pydee::AnchorWorldPosition(bounds, pydee::ResizeHandle::kNorthWest);
  CHECK_NEAR(anchor.x, bounds.bottom_right.x, 1e-12);
  CHECK_NEAR(anchor.y, bounds.bottom_right.y, 1e-12);

  const pydee::Point2D local_se =
      pydee::HandleLocalPosition(bounds, pydee::ResizeHandle::kSouthEast);
  CHECK_NEAR(local_se.x, 20.0, 1e-12);
  CHECK_NEAR(local_se.y, 10.0, 1e-12);
}

void TestOrientedBoundsDetectsFlip() {
  std::printf("selection: a mirrored transform is reported as flipped\n");

  auto rect = MakeBoundedRect("r", 20.0, 10.0);
  rect->local_transform = pydee::Scaling(-1.0, 1.0);
  pydee::Scene scene;
  scene.roots.push_back(std::move(rect));

  pydee::OrientedBounds bounds;
  pydee::SelectionFailure failure = pydee::SelectionFailure::kNodeNotFound;
  CHECK_TRUE(pydee::OrientedBoundsForNode(scene, "r", &bounds, &failure));
  CHECK_TRUE(pydee::OrientedIsFlipped(bounds));
  CHECK_NEAR(bounds.top_right.x, -20.0, 1e-12);
  CHECK_NEAR(std::abs(pydee::OrientedAngleDegrees(bounds)), 180.0, 1e-9);
}

void TestSelectionFailuresAreReported() {
  std::printf("selection: missing bounds, singular transforms and bad ids are reported\n");

  auto missing_bounds = MakeRect("no-bounds", 0.0, 0.0, 10.0, 10.0, kRed);
  missing_bounds->local_bounds.reset();

  auto collapsed = MakeBoundedRect("collapsed", 20.0, 10.0);
  collapsed->local_transform = pydee::Scaling(0.0, 1.0);

  pydee::Scene scene;
  scene.roots.push_back(std::move(missing_bounds));
  scene.roots.push_back(std::move(collapsed));

  pydee::OrientedBounds bounds;
  pydee::SelectionFailure failure = pydee::SelectionFailure::kNonFiniteGeometry;

  CHECK_TRUE(!pydee::OrientedBoundsForNode(scene, "nope", &bounds, &failure));
  CHECK_TRUE(failure == pydee::SelectionFailure::kNodeNotFound);
  CHECK_TRUE(std::strcmp(pydee::SelectionFailureName(failure), "node-not-found") == 0);

  CHECK_TRUE(!pydee::OrientedBoundsForNode(scene, "no-bounds", &bounds, &failure));
  CHECK_TRUE(failure == pydee::SelectionFailure::kBoundsUnavailable);
  CHECK_TRUE(std::strcmp(pydee::SelectionFailureName(failure), "bounds-unavailable") == 0);

  CHECK_TRUE(!pydee::OrientedBoundsForNode(scene, "collapsed", &bounds, &failure));
  CHECK_TRUE(failure == pydee::SelectionFailure::kSingularTransform);
  CHECK_TRUE(std::strcmp(pydee::SelectionFailureName(failure), "singular-transform") == 0);
}

void TestAxisAlignedBoundsForMultiSelection() {
  std::printf("selection: a multi-selection unions into an axis-aligned world rect\n");

  auto first = MakeBoundedRect("a", 10.0, 10.0);
  auto second = MakeBoundedRect("b", 10.0, 10.0);
  second->local_transform = pydee::Translation(20.0, 30.0);

  pydee::Scene scene;
  scene.roots.push_back(std::move(first));
  scene.roots.push_back(std::move(second));

  pydee::RectF rect;
  std::vector<std::string> failed;
  CHECK_TRUE(pydee::AxisAlignedBoundsForNodes(scene, {"a", "b", "ghost"}, &rect, &failed));
  CHECK_NEAR(rect.x, 0.0, 1e-12);
  CHECK_NEAR(rect.y, 0.0, 1e-12);
  CHECK_NEAR(rect.width, 30.0, 1e-12);
  CHECK_NEAR(rect.height, 40.0, 1e-12);
  // Nothing is dropped quietly: the id that resolved to no geometry comes back.
  CHECK_EQ_INT(static_cast<long long>(failed.size()), 1);
  CHECK_TRUE(!failed.empty() && failed[0] == "ghost");

  std::vector<std::string> all_failed;
  CHECK_TRUE(!pydee::AxisAlignedBoundsForNodes(scene, {"ghost"}, &rect, &all_failed));
  CHECK_EQ_INT(static_cast<long long>(all_failed.size()), 1);
}

void TestResizeHappensInLocalSpace() {
  std::printf("selection: resizing a rotated node follows its own axes\n");

  auto rect = MakeBoundedRect("r", 20.0, 10.0);
  rect->local_transform = pydee::Rotation(90.0);
  pydee::Scene scene;
  scene.roots.push_back(std::move(rect));

  pydee::OrientedBounds bounds;
  pydee::SelectionFailure failure = pydee::SelectionFailure::kNodeNotFound;
  CHECK_TRUE(pydee::OrientedBoundsForNode(scene, "r", &bounds, &failure));

  // World (-20, 30) is local (30, 20) under a 90 degree rotation, so dragging the
  // south-east handle there must produce a 30x20 local box with the north-west
  // corner untouched. A screen-space resize would move the wrong edges here.
  const std::optional<pydee::RectF> se = pydee::ResizeLocalBounds(
      bounds, pydee::ResizeHandle::kSouthEast, pydee::Point2D{-20.0, 30.0});
  CHECK_TRUE(se.has_value());
  if (se.has_value()) {
    CHECK_NEAR(se->x, 0.0, 1e-9);
    CHECK_NEAR(se->y, 0.0, 1e-9);
    CHECK_NEAR(se->width, 30.0, 1e-9);
    CHECK_NEAR(se->height, 20.0, 1e-9);
  }

  // World (2, -5) is local (-5, -2): the north-west handle moves the top-left and
  // leaves the south-east corner fixed.
  const std::optional<pydee::RectF> nw = pydee::ResizeLocalBounds(
      bounds, pydee::ResizeHandle::kNorthWest, pydee::Point2D{2.0, -5.0});
  CHECK_TRUE(nw.has_value());
  if (nw.has_value()) {
    CHECK_NEAR(nw->x, -5.0, 1e-9);
    CHECK_NEAR(nw->y, -2.0, 1e-9);
    CHECK_NEAR(nw->width, 25.0, 1e-9);
    CHECK_NEAR(nw->height, 12.0, 1e-9);
  }

  // A side handle moves one edge only.
  const std::optional<pydee::RectF> east = pydee::ResizeLocalBounds(
      bounds, pydee::ResizeHandle::kEast, pydee::Point2D{0.0, 50.0});
  CHECK_TRUE(east.has_value());
  if (east.has_value()) {
    CHECK_NEAR(east->x, 0.0, 1e-9);
    CHECK_NEAR(east->y, 0.0, 1e-9);
    CHECK_NEAR(east->width, 50.0, 1e-9);
    CHECK_NEAR(east->height, 10.0, 1e-9);
  }
}

void TestResizeAspectAndCentreOptions() {
  std::printf("selection: aspect lock and centre resize keep the anchor they promise\n");

  auto rect = MakeBoundedRect("r", 20.0, 10.0);
  rect->local_transform = pydee::Rotation(90.0);
  pydee::Scene scene;
  scene.roots.push_back(std::move(rect));

  pydee::OrientedBounds bounds;
  pydee::SelectionFailure failure = pydee::SelectionFailure::kNodeNotFound;
  CHECK_TRUE(pydee::OrientedBoundsForNode(scene, "r", &bounds, &failure));

  pydee::ResizeOptions aspect;
  aspect.preserve_aspect = true;
  // Local (40, 12): width dominates, so height is derived as 40 * (10/20) = 20.
  const std::optional<pydee::RectF> locked = pydee::ResizeLocalBounds(
      bounds, pydee::ResizeHandle::kSouthEast, pydee::Point2D{-12.0, 40.0}, aspect);
  CHECK_TRUE(locked.has_value());
  if (locked.has_value()) {
    CHECK_NEAR(locked->width, 40.0, 1e-9);
    CHECK_NEAR(locked->height, 20.0, 1e-9);
    CHECK_NEAR(locked->width / locked->height, 2.0, 1e-9);
  }

  pydee::ResizeOptions centred;
  centred.from_center = true;
  // Local (25, 5) is 15 from the centre in x, so the box spans -5..25.
  const std::optional<pydee::RectF> symmetric = pydee::ResizeLocalBounds(
      bounds, pydee::ResizeHandle::kEast, pydee::Point2D{-5.0, 25.0}, centred);
  CHECK_TRUE(symmetric.has_value());
  if (symmetric.has_value()) {
    CHECK_NEAR(symmetric->x, -5.0, 1e-9);
    CHECK_NEAR(symmetric->width, 30.0, 1e-9);
    CHECK_NEAR(symmetric->y, 0.0, 1e-9);
    CHECK_NEAR(symmetric->height, 10.0, 1e-9);
  }

  // A flip is a valid transform, so a negative extent is preserved rather than
  // clamped: the caller decides whether it can represent one.
  const std::optional<pydee::RectF> flipped = pydee::ResizeLocalBounds(
      bounds, pydee::ResizeHandle::kEast, pydee::Point2D{0.0, -10.0});
  CHECK_TRUE(flipped.has_value());
  if (flipped.has_value()) {
    CHECK_NEAR(flipped->width, -10.0, 1e-9);
  }
}

void TestResizeHandleNamesRoundTrip() {
  std::printf("selection: handle names cross the boundary unchanged\n");

  for (const pydee::ResizeHandle handle : pydee::kResizeHandles) {
    const char* name = pydee::ResizeHandleName(handle);
    const std::optional<pydee::ResizeHandle> parsed = pydee::ParseResizeHandle(name);
    CHECK_TRUE(parsed.has_value() && *parsed == handle);
    CHECK_TRUE(pydee::OppositeHandle(pydee::OppositeHandle(handle)) == handle);
  }
  CHECK_TRUE(!pydee::ParseResizeHandle("north").has_value());
  CHECK_TRUE(!pydee::ParseResizeHandle("").has_value());
}

// --------------------------------------------------------------------------- //
// Gesture lifecycle.
//
// The invariants asserted here are the DEFINITIONS of the operations, not
// restatements of the implementation:
//
//   move    a point on the object lands exactly one world delta further on
//   resize  the dragged handle reaches the pointer and the opposite anchor is fixed
//   rotate  the object's own centre does not move
//
// Each holds for every rotation, scale and nesting, so one assertion covers the
// whole matrix instead of needing per-case expected numbers.
// --------------------------------------------------------------------------- //

/**
 * A rect inside `translate(40 30) scale(2)`, carrying its own rotation about a
 * pivot that is NOT its centre.
 *
 * The last detail is the whole point. The editor's previous rotation appended
 * `rotate(δ cx cy)` to the node's transform with the pivot measured in the PARENT's
 * space — a right-composition using a left-composition's pivot. Those agree only
 * when the node's existing transform is a rotation about that same point, and the
 * browser fixture happened to satisfy that (its rotation pivot was its own centre),
 * so the defect was invisible for years of tests. Here the existing rotation is
 * about the local ORIGIN while the box centre is (20, 10), which separates them.
 */
pydee::Scene MakeNestedRotatedScene(double existing_rotation_degrees) {
  auto group = std::make_unique<pydee::GroupNode>();
  group->id = "g";
  group->local_transform =
      pydee::Multiply(pydee::Translation(40.0, 30.0), pydee::Scaling(2.0, 2.0));

  auto rect = MakeBoundedRect("n", 40.0, 20.0);
  rect->local_transform = pydee::Rotation(existing_rotation_degrees, 0.0, 0.0);
  group->children.push_back(std::move(rect));

  pydee::Scene scene;
  scene.roots.push_back(std::move(group));
  return scene;
}

/** Where the node's local point `local` ends up after the gesture frame. */
pydee::Point2D WorldAfter(const pydee::GestureSnapshot& snapshot,
                          const pydee::GestureFrame& frame, const pydee::Point2D& local) {
  return pydee::TransformPoint(pydee::Multiply(snapshot.parent_world, frame.local_transform),
                               local);
}

void TestGestureMoveMatchesTheDocumentTranslation() {
  std::printf("gesture: a move lands the object exactly one world delta further on\n");

  const pydee::Scene scene = MakeNestedRotatedScene(25.0);
  pydee::GestureSnapshot snapshot;
  pydee::SelectionFailure failure = pydee::SelectionFailure::kNodeNotFound;
  CHECK_TRUE(pydee::BeginGesture(scene, "n", pydee::GestureKind::kMove,
                                 pydee::ResizeHandle::kNorthWest, pydee::Point2D{0.0, 0.0},
                                 &snapshot, &failure));

  const pydee::Point2D local_probe{20.0, 10.0};
  const pydee::Point2D before =
      pydee::TransformPoint(snapshot.bounds.world_transform, local_probe);

  pydee::GestureFailure gesture_failure = pydee::GestureFailure::kNonFiniteResult;
  const std::optional<pydee::GestureFrame> frame =
      pydee::SolveGesture(snapshot, pydee::Point2D{37.0, -11.0}, pydee::GestureModifiers{},
                          &gesture_failure);
  CHECK_TRUE(frame.has_value());
  if (!frame.has_value()) {
    return;
  }

  // The whole delta, in world units, regardless of the 2x ancestor scale and the
  // node's own 25-degree rotation. A `dx / zoom` conversion gets both wrong.
  const pydee::Point2D after = WorldAfter(snapshot, *frame, local_probe);
  CHECK_NEAR(after.x - before.x, 37.0, 1e-9);
  CHECK_NEAR(after.y - before.y, -11.0, 1e-9);
  CHECK_NEAR(frame->world_delta.x, 37.0, 1e-12);
  CHECK_NEAR(frame->world_delta.y, -11.0, 1e-12);

  // And it is the SAME expression the drag entry point evaluates, so the two
  // cannot drift: P⁻¹ · T · P · L.
  const std::optional<pydee::Matrix2D> inverse = pydee::Invert(snapshot.parent_world);
  CHECK_TRUE(inverse.has_value());
  if (inverse.has_value()) {
    const pydee::Matrix2D expected = pydee::Multiply(
        pydee::Multiply(*inverse, pydee::Multiply(pydee::Translation(37.0, -11.0),
                                                  snapshot.parent_world)),
        snapshot.base_local);
    CHECK_NEAR(frame->local_transform.a, expected.a, 1e-12);
    CHECK_NEAR(frame->local_transform.b, expected.b, 1e-12);
    CHECK_NEAR(frame->local_transform.c, expected.c, 1e-12);
    CHECK_NEAR(frame->local_transform.d, expected.d, 1e-12);
    CHECK_NEAR(frame->local_transform.e, expected.e, 1e-12);
    CHECK_NEAR(frame->local_transform.f, expected.f, 1e-12);
  }
  // A move changes no geometry, so the local bounds come back untouched.
  CHECK_NEAR(frame->local_bounds.width, 40.0, 1e-12);
  CHECK_NEAR(frame->local_bounds.height, 20.0, 1e-12);
  CHECK_NEAR(frame->angle_degrees, 0.0, 1e-12);
}

void TestRotationPivotIsNotAffectedByAnExistingTransform() {
  std::printf("gesture: rotation keeps the object's own centre, whatever its transform\n");

  const pydee::Scene scene = MakeNestedRotatedScene(25.0);

  pydee::OrientedBounds bounds;
  pydee::SelectionFailure failure = pydee::SelectionFailure::kNodeNotFound;
  CHECK_TRUE(pydee::OrientedBoundsForNode(scene, "n", &bounds, &failure));
  const pydee::Point2D centre = pydee::OrientedCenter(bounds);

  // Drag a point 100 units from the centre through exactly 30 degrees.
  const double radians = 30.0 * 3.14159265358979323846 / 180.0;
  const pydee::Point2D start{centre.x + 100.0, centre.y};
  const pydee::Point2D current{centre.x + 100.0 * std::cos(radians),
                               centre.y + 100.0 * std::sin(radians)};

  pydee::GestureSnapshot snapshot;
  CHECK_TRUE(pydee::BeginGesture(scene, "n", pydee::GestureKind::kRotate,
                                 pydee::ResizeHandle::kNorthWest, start, &snapshot, &failure));
  CHECK_NEAR(snapshot.pivot.x, centre.x, 1e-12);
  CHECK_NEAR(snapshot.pivot.y, centre.y, 1e-12);

  pydee::GestureFailure gesture_failure = pydee::GestureFailure::kNonFiniteResult;
  const std::optional<pydee::GestureFrame> frame = pydee::SolveGesture(
      snapshot, current, pydee::GestureModifiers{}, &gesture_failure);
  CHECK_TRUE(frame.has_value());
  if (!frame.has_value()) {
    return;
  }
  CHECK_NEAR(frame->angle_degrees, 30.0, 1e-9);

  // The invariant: a rotation about the object's own centre cannot move it.
  const pydee::Point2D moved = WorldAfter(snapshot, *frame, pydee::Point2D{20.0, 10.0});
  CHECK_NEAR(moved.x, centre.x, 1e-9);
  CHECK_NEAR(moved.y, centre.y, 1e-9);

  // It really turned: the top edge's direction changed by the dragged angle.
  pydee::OrientedBounds after;
  CHECK_TRUE(pydee::OrientedBoundsFrom(
      pydee::Multiply(snapshot.parent_world, frame->local_transform),
      std::optional<pydee::RectF>(bounds.local_bounds), &after, &failure));
  CHECK_NEAR(pydee::OrientedAngleDegrees(after) - pydee::OrientedAngleDegrees(bounds), 30.0,
             1e-9);

  // NON-VACUITY. The formulation this replaces — appending rotate(δ, pivot) to the
  // node's own transform with the pivot taken in the PARENT's space — moves the
  // centre by about ten world units on this scene. If both produced the same answer
  // the assertions above would prove nothing.
  const std::optional<pydee::Matrix2D> inverse = pydee::Invert(snapshot.parent_world);
  CHECK_TRUE(inverse.has_value());
  if (inverse.has_value()) {
    const pydee::Point2D pivot_in_parent = pydee::TransformPoint(*inverse, centre);
    const pydee::Matrix2D appended = pydee::Multiply(
        snapshot.base_local, pydee::Rotation(30.0, pivot_in_parent.x, pivot_in_parent.y));
    const pydee::Point2D wrong = pydee::TransformPoint(
        pydee::Multiply(snapshot.parent_world, appended), pydee::Point2D{20.0, 10.0});
    CHECK_TRUE(std::hypot(wrong.x - centre.x, wrong.y - centre.y) > 5.0);
  }
}

void TestRotationSnapsAndRefusesAZeroLengthVector() {
  std::printf("gesture: rotation snapping steps, and a pointer on the pivot is refused\n");

  const pydee::Point2D pivot{10.0, 20.0};
  const auto at = [&pivot](double degrees) {
    const double radians = degrees * 3.14159265358979323846 / 180.0;
    return pydee::Point2D{pivot.x + 50.0 * std::cos(radians),
                          pivot.y + 50.0 * std::sin(radians)};
  };

  const std::optional<double> free =
      pydee::RotationDeltaDegrees(pivot, at(0.0), at(37.0), 0.0);
  CHECK_TRUE(free.has_value());
  if (free.has_value()) {
    CHECK_NEAR(*free, 37.0, 1e-9);
  }

  const std::optional<double> snapped =
      pydee::RotationDeltaDegrees(pivot, at(0.0), at(37.0), 15.0);
  CHECK_TRUE(snapped.has_value());
  if (snapped.has_value()) {
    CHECK_NEAR(*snapped, 30.0, 1e-9);
  }

  const std::optional<double> negative =
      pydee::RotationDeltaDegrees(pivot, at(0.0), at(-37.0), 15.0);
  CHECK_TRUE(negative.has_value());
  if (negative.has_value()) {
    CHECK_NEAR(*negative, -30.0, 1e-9);
  }

  // Wrapped into (-180, 180], so a drag across the boundary turns the short way
  // instead of jumping a full revolution.
  const std::optional<double> wrapped =
      pydee::RotationDeltaDegrees(pivot, at(170.0), at(-170.0), 0.0);
  CHECK_TRUE(wrapped.has_value());
  if (wrapped.has_value()) {
    CHECK_NEAR(*wrapped, 20.0, 1e-9);
  }

  // No angle exists from a point to itself. Reported, not silently zero.
  CHECK_TRUE(!pydee::RotationDeltaDegrees(pivot, pivot, at(10.0), 0.0).has_value());
  CHECK_TRUE(!pydee::RotationDeltaDegrees(pivot, at(10.0), pivot, 0.0).has_value());
}

void TestResizeReachesThePointerAndPinsTheAnchor() {
  std::printf("gesture: resize moves the dragged handle to the pointer, anchor fixed\n");

  const pydee::Scene scene = MakeNestedRotatedScene(25.0);
  pydee::SelectionFailure failure = pydee::SelectionFailure::kNodeNotFound;

  for (const pydee::ResizeHandle handle : pydee::kResizeHandles) {
    pydee::GestureSnapshot snapshot;
    const pydee::Point2D grab =
        [&scene, handle, &failure]() {
          pydee::OrientedBounds bounds;
          pydee::OrientedBoundsForNode(scene, "n", &bounds, &failure);
          return pydee::HandleWorldPosition(bounds, handle);
        }();
    CHECK_TRUE(pydee::BeginGesture(scene, "n", pydee::GestureKind::kResize, handle, grab,
                                   &snapshot, &failure));

    // A displacement that is not axis-aligned, so an error in either axis shows up
    // rather than cancelling.
    const pydee::Point2D pointer{grab.x + 26.0, grab.y + 18.0};
    const pydee::Point2D anchor_before =
        pydee::AnchorWorldPosition(snapshot.bounds, handle);

    pydee::GestureFailure gesture_failure = pydee::GestureFailure::kNonFiniteResult;
    const std::optional<pydee::GestureFrame> frame = pydee::SolveGesture(
        snapshot, pointer, pydee::GestureModifiers{}, &gesture_failure);
    CHECK_TRUE(frame.has_value());
    if (!frame.has_value()) {
      continue;
    }

    // The preview keeps the node's geometry and carries the change in the
    // transform, so the new box is the old bounds through the new world matrix.
    pydee::OrientedBounds after;
    CHECK_TRUE(pydee::OrientedBoundsFrom(
        pydee::Multiply(snapshot.parent_world, frame->local_transform),
        std::optional<pydee::RectF>(snapshot.bounds.local_bounds), &after, &failure));

    const pydee::Point2D anchor_after = pydee::AnchorWorldPosition(after, handle);
    CHECK_NEAR(anchor_after.x, anchor_before.x, 1e-9);
    CHECK_NEAR(anchor_after.y, anchor_before.y, 1e-9);

    // A side handle only tracks the pointer along its own axis, so the corner case
    // is the one that must land exactly on it.
    const pydee::Point2D handle_after = pydee::HandleWorldPosition(after, handle);
    const bool is_corner = handle == pydee::ResizeHandle::kNorthWest
                        || handle == pydee::ResizeHandle::kNorthEast
                        || handle == pydee::ResizeHandle::kSouthEast
                        || handle == pydee::ResizeHandle::kSouthWest;
    if (is_corner) {
      CHECK_NEAR(handle_after.x, pointer.x, 1e-9);
      CHECK_NEAR(handle_after.y, pointer.y, 1e-9);
    } else {
      CHECK_TRUE(std::hypot(handle_after.x - grab.x, handle_after.y - grab.y) > 1.0);
    }

    // And the reported bounds are what the document commit needs.
    CHECK_TRUE(std::isfinite(frame->local_bounds.width));
    CHECK_TRUE(std::isfinite(frame->local_bounds.height));
  }
}

void TestGestureFailuresAreReported() {
  std::printf("gesture: singular parents, zero-extent boxes and bad ids are reported\n");

  // A collapsed ancestor makes world space unmappable.
  auto flat_group = std::make_unique<pydee::GroupNode>();
  flat_group->id = "flat";
  flat_group->local_transform = pydee::Scaling(0.0, 1.0);
  auto child = MakeBoundedRect("in-flat", 10.0, 10.0);
  flat_group->children.push_back(std::move(child));

  auto thin = MakeBoundedRect("thin", 0.0, 10.0);

  pydee::Scene scene;
  scene.roots.push_back(std::move(flat_group));
  scene.roots.push_back(std::move(thin));

  pydee::GestureSnapshot snapshot;
  pydee::SelectionFailure failure = pydee::SelectionFailure::kNonFiniteGeometry;
  CHECK_TRUE(!pydee::BeginGesture(scene, "missing", pydee::GestureKind::kMove,
                                  pydee::ResizeHandle::kNorthWest, pydee::Point2D{0.0, 0.0},
                                  &snapshot, &failure));
  CHECK_TRUE(failure == pydee::SelectionFailure::kNodeNotFound);

  // The node exists but its world transform is singular, so there is no box.
  CHECK_TRUE(!pydee::BeginGesture(scene, "in-flat", pydee::GestureKind::kMove,
                                  pydee::ResizeHandle::kNorthWest, pydee::Point2D{0.0, 0.0},
                                  &snapshot, &failure));
  CHECK_TRUE(failure == pydee::SelectionFailure::kSingularTransform);

  // A zero-width box cannot be scaled onto a non-zero one by multiplication.
  CHECK_TRUE(pydee::BeginGesture(scene, "thin", pydee::GestureKind::kResize,
                                 pydee::ResizeHandle::kEast, pydee::Point2D{0.0, 5.0},
                                 &snapshot, &failure));
  pydee::GestureFailure gesture_failure = pydee::GestureFailure::kNonFiniteResult;
  CHECK_TRUE(!pydee::SolveGesture(snapshot, pydee::Point2D{30.0, 5.0},
                                  pydee::GestureModifiers{}, &gesture_failure)
                  .has_value());
  CHECK_TRUE(gesture_failure == pydee::GestureFailure::kDegenerateBounds);

  // A pointer exactly on the pivot has no angle.
  const pydee::Scene nested = MakeNestedRotatedScene(0.0);
  pydee::OrientedBounds bounds;
  CHECK_TRUE(pydee::OrientedBoundsForNode(nested, "n", &bounds, &failure));
  const pydee::Point2D centre = pydee::OrientedCenter(bounds);
  CHECK_TRUE(pydee::BeginGesture(nested, "n", pydee::GestureKind::kRotate,
                                 pydee::ResizeHandle::kNorthWest, centre, &snapshot,
                                 &failure));
  CHECK_TRUE(!pydee::SolveGesture(snapshot, pydee::Point2D{centre.x + 10.0, centre.y},
                                  pydee::GestureModifiers{}, &gesture_failure)
                  .has_value());
  CHECK_TRUE(gesture_failure == pydee::GestureFailure::kPointerOnPivot);

  // Every failure has a stable name, so it can cross the wire as a reason.
  CHECK_TRUE(std::strcmp(pydee::GestureFailureName(pydee::GestureFailure::kSingularParent),
                         "singular-parent")
             == 0);
  CHECK_TRUE(std::strcmp(pydee::GestureFailureName(pydee::GestureFailure::kDegenerateBounds),
                         "degenerate-bounds")
             == 0);
  for (const char* name : {"move", "resize", "rotate"}) {
    const std::optional<pydee::GestureKind> parsed = pydee::ParseGestureKind(name);
    CHECK_TRUE(parsed.has_value());
    if (parsed.has_value()) {
      CHECK_TRUE(std::strcmp(pydee::GestureKindName(*parsed), name) == 0);
    }
  }
  CHECK_TRUE(!pydee::ParseGestureKind("scale").has_value());
}

void TestHandleHitRegionsFollowTheObjectsAxes() {
  std::printf("gesture: handle hit regions sit where the handles are drawn\n");

  auto rect = MakeBoundedRect("r", 20.0, 10.0);
  pydee::Scene plain;
  plain.roots.push_back(std::move(rect));

  pydee::OrientedBounds bounds;
  pydee::SelectionFailure failure = pydee::SelectionFailure::kNodeNotFound;
  CHECK_TRUE(pydee::OrientedBoundsForNode(plain, "r", &bounds, &failure));

  pydee::HandleHitOptions options;
  // All eight handles are hit at exactly the position they are drawn at.
  for (const pydee::ResizeHandle handle : pydee::kResizeHandles) {
    const pydee::HandleHit hit =
        pydee::HitTestSelection(bounds, pydee::HandleWorldPosition(bounds, handle), options);
    CHECK_TRUE(hit.region == pydee::HandleRegion::kResize);
    CHECK_TRUE(hit.handle == handle);
  }

  // The rotation control above the top edge.
  const std::optional<pydee::Point2D> control =
      pydee::RotationControlPosition(bounds, options.rotation_offset);
  CHECK_TRUE(control.has_value());
  if (control.has_value()) {
    // Above the box in SVG's y-down space, by the offset, on the top edge's midpoint.
    CHECK_NEAR(control->x, 10.0, 1e-9);
    CHECK_NEAR(control->y, -options.rotation_offset, 1e-9);
    const pydee::HandleHit hit = pydee::HitTestSelection(bounds, *control, options);
    CHECK_TRUE(hit.region == pydee::HandleRegion::kRotate);
  }

  // Inside the object, and far outside it.
  CHECK_TRUE(pydee::HitTestSelection(bounds, pydee::Point2D{10.0, 5.0}, options).region
             == pydee::HandleRegion::kBody);
  CHECK_TRUE(pydee::HitTestSelection(bounds, pydee::Point2D{500.0, 500.0}, options).region
             == pydee::HandleRegion::kNone);

  // THE DISCRIMINATING CASE. Rotate the box a quarter turn: its corners move, so the
  // handle at the world AABB's top-left is no longer "nw". A hit test against an
  // axis-aligned box would answer nw; the object's own axes say sw.
  auto spun = MakeBoundedRect("s", 20.0, 10.0);
  spun->local_transform = pydee::Rotation(90.0);
  pydee::Scene rotated;
  rotated.roots.push_back(std::move(spun));

  pydee::OrientedBounds spun_bounds;
  CHECK_TRUE(pydee::OrientedBoundsForNode(rotated, "s", &spun_bounds, &failure));
  const pydee::HandleHit corner =
      pydee::HitTestSelection(spun_bounds, pydee::Point2D{-10.0, 0.0}, options);
  CHECK_TRUE(corner.region == pydee::HandleRegion::kResize);
  CHECK_TRUE(corner.handle == pydee::ResizeHandle::kSouthWest);

  // And the rotation control followed the rotated top edge instead of staying up.
  const std::optional<pydee::Point2D> spun_control =
      pydee::RotationControlPosition(spun_bounds, options.rotation_offset);
  CHECK_TRUE(spun_control.has_value());
  if (spun_control.has_value()) {
    CHECK_NEAR(spun_control->x, options.rotation_offset, 1e-9);
    CHECK_NEAR(spun_control->y, 10.0, 1e-9);
  }

  // A corner rotation zone sits OUTSIDE its corner, so it cannot make corner resize
  // unreachable — a defect this editor shipped once.
  const pydee::Point2D nw = pydee::HandleWorldPosition(bounds, pydee::ResizeHandle::kNorthWest);
  const pydee::Point2D centre = pydee::OrientedCenter(bounds);
  const double dx = nw.x - centre.x;
  const double dy = nw.y - centre.y;
  const double length = std::hypot(dx, dy);
  const pydee::Point2D zone{nw.x + (dx / length) * options.corner_rotation_offset,
                            nw.y + (dy / length) * options.corner_rotation_offset};
  const pydee::HandleHit zone_hit = pydee::HitTestSelection(bounds, zone, options);
  CHECK_TRUE(zone_hit.region == pydee::HandleRegion::kRotate);
  CHECK_TRUE(zone_hit.handle == pydee::ResizeHandle::kNorthWest);
  // The corner itself still resizes.
  CHECK_TRUE(pydee::HitTestSelection(bounds, nw, options).region
             == pydee::HandleRegion::kResize);

  for (const pydee::HandleRegion region :
       {pydee::HandleRegion::kNone, pydee::HandleRegion::kBody, pydee::HandleRegion::kResize,
        pydee::HandleRegion::kRotate}) {
    CHECK_TRUE(std::strlen(pydee::HandleRegionName(region)) > 0);
  }
}

// --------------------------------------------------------------------------- //
// Shape geometry: the builder and the measurement
// --------------------------------------------------------------------------- //

/** Build `kind` into `bounds` and return its measured box, or fail the check. */
pydee::RectF BuildAndMeasure(pydee::ShapeKind kind,
                             const pydee::RectF& bounds,
                             const pydee::ShapeParameters& parameters = pydee::ShapeParameters{}) {
  std::string data;
  pydee::ShapeBuildFailure failure = pydee::ShapeBuildFailure::kUnknownKind;
  const bool built = pydee::BuildShapePath(kind, bounds, parameters, &data, &failure);
  CHECK_TRUE(built);
  if (!built) {
    std::printf("    (%s failed: %s)\n", pydee::ShapeKindName(kind),
                pydee::ShapeBuildFailureName(failure));
    return pydee::RectF{};
  }
  pydee::RectF measured{};
  CHECK_TRUE(pydee::MeasurePathData(data, &measured));
  return measured;
}

void TestEveryShapeFillsItsBox() {
  std::printf("shape geometry: every built shape exactly fills the box it was given\n");

  // Deliberately NON-square, because that is the case a single min(w, h) radius
  // gets wrong: an inscribed star in a wide box stays square and stops following
  // the drag, and its selection box then cannot fit it.
  const pydee::RectF box{40.0, 60.0, 120.0, 90.0};

  const pydee::ShapeKind kinds[] = {
      pydee::ShapeKind::kRectangle,  pydee::ShapeKind::kRoundedRect,
      pydee::ShapeKind::kEllipse,    pydee::ShapeKind::kTriangle,
      pydee::ShapeKind::kDiamond,    pydee::ShapeKind::kPentagon,
      pydee::ShapeKind::kHexagon,    pydee::ShapeKind::kOctagon,
      pydee::ShapeKind::kStar,       pydee::ShapeKind::kBadge,
      pydee::ShapeKind::kCross,      pydee::ShapeKind::kHeart,
      pydee::ShapeKind::kDonut,      pydee::ShapeKind::kChatBubble,
      pydee::ShapeKind::kBanner,     pydee::ShapeKind::kShield,
      pydee::ShapeKind::kArrow,
  };

  for (const pydee::ShapeKind kind : kinds) {
    const pydee::RectF measured = BuildAndMeasure(kind, box);
    // 0.02px: Skia's tight bounds on a conic are computed numerically, so a
    // rounded corner or an ellipse lands a small fraction of a pixel inside the
    // true tangent. A real mismatch is whole pixels — a star used to be 10px short
    // of its box's bottom edge.
    CheckNear(measured.x, box.x, 0.02, pydee::ShapeKindName(kind), __FILE__, __LINE__);
    CheckNear(measured.y, box.y, 0.02, pydee::ShapeKindName(kind), __FILE__, __LINE__);
    CheckNear(measured.width, box.width, 0.02, pydee::ShapeKindName(kind), __FILE__, __LINE__);
    CheckNear(measured.height, box.height, 0.02, pydee::ShapeKindName(kind), __FILE__, __LINE__);
  }
}

void TestShapeFollowsAStretch() {
  std::printf("shape geometry: stretching the box stretches the outline\n");

  // The behaviour a creation preview has to show: a wider drag makes a wider
  // shape, not the same shape moved. Asserted on the star, which is the kind the
  // old inscribed-circle generator got wrong.
  const pydee::RectF narrow{0.0, 0.0, 50.0, 100.0};
  const pydee::RectF wide{0.0, 0.0, 200.0, 100.0};

  const pydee::RectF narrowBox = BuildAndMeasure(pydee::ShapeKind::kStar, narrow);
  const pydee::RectF wideBox = BuildAndMeasure(pydee::ShapeKind::kStar, wide);

  CHECK_NEAR(narrowBox.width, 50.0, 0.02);
  CHECK_NEAR(wideBox.width, 200.0, 0.02);
  // And the height is unaffected by a horizontal stretch.
  CHECK_NEAR(narrowBox.height, 100.0, 0.02);
  CHECK_NEAR(wideBox.height, 100.0, 0.02);
}

void TestBackwardsDragBuildsTheSameShape() {
  std::printf("shape geometry: a backwards drag builds the same outline\n");

  // A drag up and to the left arrives as negative extents. It must produce the
  // shape in the swept box, not a mirrored or empty one.
  const pydee::RectF forwards{10.0, 20.0, 80.0, 60.0};
  const pydee::RectF backwards{90.0, 80.0, -80.0, -60.0};

  std::string forwardData;
  std::string backwardData;
  pydee::ShapeBuildFailure failure;
  CHECK_TRUE(pydee::BuildShapePath(pydee::ShapeKind::kTriangle, forwards,
                                   pydee::ShapeParameters{}, &forwardData, &failure));
  CHECK_TRUE(pydee::BuildShapePath(pydee::ShapeKind::kTriangle, backwards,
                                   pydee::ShapeParameters{}, &backwardData, &failure));
  // Byte-identical, not merely equivalent: the preview and the commit compare as
  // strings, so a backwards drag must not produce a different spelling of the same
  // shape.
  CHECK_TRUE(forwardData == backwardData);
}

void TestDegenerateAndUnknownAreReported() {
  std::printf("shape geometry: degenerate boxes and unknown kinds are reported\n");

  std::string data;
  pydee::ShapeBuildFailure failure = pydee::ShapeBuildFailure::kUnknownKind;

  CHECK_TRUE(!pydee::BuildShapePath(pydee::ShapeKind::kRectangle, pydee::RectF{0, 0, 0, 50},
                                    pydee::ShapeParameters{}, &data, &failure));
  CHECK_TRUE(failure == pydee::ShapeBuildFailure::kDegenerateBounds);

  CHECK_TRUE(!pydee::BuildShapePath(pydee::ShapeKind::kRectangle, pydee::RectF{0, 0, 50, 0},
                                    pydee::ShapeParameters{}, &data, &failure));
  CHECK_TRUE(failure == pydee::ShapeBuildFailure::kDegenerateBounds);

  // A line is the one kind allowed a zero extent on one axis.
  CHECK_TRUE(pydee::BuildShapePath(pydee::ShapeKind::kLine, pydee::RectF{0, 0, 50, 0},
                                   pydee::ShapeParameters{}, &data, &failure));
  CHECK_TRUE(!pydee::BuildShapePath(pydee::ShapeKind::kLine, pydee::RectF{0, 0, 0, 0},
                                    pydee::ShapeParameters{}, &data, &failure));

  pydee::ShapeParameters bad;
  bad.point_count = 2;
  CHECK_TRUE(!pydee::BuildShapePath(pydee::ShapeKind::kStar, pydee::RectF{0, 0, 50, 50}, bad,
                                    &data, &failure));
  CHECK_TRUE(failure == pydee::ShapeBuildFailure::kInvalidParameters);

  CHECK_TRUE(!pydee::ParseShapeKind("no-such-shape").has_value());
  CHECK_TRUE(pydee::ParseShapeKind("triangle").has_value());
  // Every name in the vocabulary round-trips, so the wire cannot drift from the enum.
  for (int index = 0; index <= static_cast<int>(pydee::ShapeKind::kArrow); ++index) {
    const pydee::ShapeKind kind = static_cast<pydee::ShapeKind>(index);
    const auto parsed = pydee::ParseShapeKind(pydee::ShapeKindName(kind));
    CHECK_TRUE(parsed.has_value() && *parsed == kind);
  }
}

void TestMeasurementIsTightNotAControlPointHull() {
  std::printf("shape geometry: measurement is tight, not the control-point hull\n");

  pydee::RectF measured{};
  // A symmetric cubic with both controls at y=100 reaches only y=75.
  CHECK_TRUE(pydee::MeasurePathData("M 0 0 C 0 100 100 100 100 0", &measured));
  CHECK_NEAR(measured.height, 75.0, 1e-4);
  CHECK_NEAR(measured.width, 100.0, 1e-4);

  // A semicircle is half its radius tall, not a full diameter.
  CHECK_TRUE(pydee::MeasurePathData("M 0 0 A 50 50 0 0 1 100 0", &measured));
  CHECK_NEAR(measured.width, 100.0, 0.02);
  CHECK_NEAR(measured.height, 50.0, 0.02);
  CHECK_NEAR(measured.y, -50.0, 0.02);

  // Nothing measurable is reported as such, not as a zero box at the origin.
  CHECK_TRUE(!pydee::MeasurePathData("", &measured));
  CHECK_TRUE(!pydee::MeasurePathData("not path data", &measured));
}

}  // namespace

int main() {
  std::printf("\n=== Pydee engine tests ===\n\n");

  TestCompositionOrder();
  TestRotationAboutCentre();
  TestInversion();
  TestTransformRect();

  TestRendersSolidRect();
  TestTransformIsApplied();
  TestGroupIsolationCompositesOnce();
  TestCulling();
  TestPathParsing();
  TestEllipseAndStroke();
  TestLeafOpacity();

  TestCodecRoundTrip();
  TestCodecRejectsBadInput();
  TestCodecRendersThroughSkia();

  TestRasterTargetRoundTrip();
  TestClippedRenderAndRegionReadback();
  TestRasterTargetRejectsBadSizes();

  TestFontRegistry();
  TestTextMeasurement();
  TestTextRenders();
  TestTextAlignmentAnchors();
  TestTextWithoutFontIsReported();
  TestTextCodecRoundTrip();

  TestLinearGradientObjectBoundingBox();
  TestLinearGradientUserSpaceUnits();
  TestRadialGradientRenders();
  TestGradientSpreadRepeat();
  TestGradientSingleStopIsSolid();
  TestGradientWithoutStopsIsReported();
  TestGradientStrokeIsPainted();
  TestCodecRejectsBadGradients();

  TestTextDecorationRenders();
  TestGradientTextDecorationIsReportedAsApproximate();

  TestParseCssColor();
  TestParseSvgTransform();
  TestPaintServerTableParsesGradients();
  TestPaintServerDefaultsAndUnits();
  TestPaintServerInheritanceAndCycles();
  TestPaintServerReportsWhatItCannotRepresent();
  TestReferencePaintResolvesThroughWire();

  TestWorldTransformIncludesAncestors();
  TestOrientedBoundsRotatesWithTheNode();
  TestOrientedBoundsDetectsFlip();
  TestSelectionFailuresAreReported();
  TestAxisAlignedBoundsForMultiSelection();
  TestResizeHappensInLocalSpace();
  TestResizeAspectAndCentreOptions();
  TestResizeHandleNamesRoundTrip();

  TestGestureMoveMatchesTheDocumentTranslation();
  TestRotationPivotIsNotAffectedByAnExistingTransform();
  TestRotationSnapsAndRefusesAZeroLengthVector();
  TestResizeReachesThePointerAndPinsTheAnchor();
  TestGestureFailuresAreReported();
  TestHandleHitRegionsFollowTheObjectsAxes();

  TestEveryShapeFillsItsBox();
  TestShapeFollowsAStretch();
  TestBackwardsDragBuildsTheSameShape();
  TestDegenerateAndUnknownAreReported();
  TestMeasurementIsTightNotAControlPointHull();

  std::printf("\n%d checks, %d failure(s)\n\n", g_checks, g_failures);
  return g_failures == 0 ? 0 : 1;
}
