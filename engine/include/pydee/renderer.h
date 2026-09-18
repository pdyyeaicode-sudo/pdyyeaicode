// renderer.h — the backend-neutral drawing interface for the Pydee engine.
//
// C++ mirror of frontend/src/editor/renderer/Renderer2D.ts. This is the seam
// that keeps the engine independent of its graphics backend: Skia raster today,
// a GPU backend or an export target later, all without touching scene
// construction or traversal.
//
// No Skia type appears in this header. `SkCanvas`, `SkPaint` and friends live
// behind the implementation so they never leak into the engine's public API and
// therefore never reach the TypeScript bindings.
//
// One responsibility per file: the renderer interface and scene traversal entry
// point.

#ifndef PYDEE_RENDERER_H_
#define PYDEE_RENDERER_H_

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "pydee/geometry.h"
#include "pydee/scene.h"

namespace pydee {

struct FrameInfo {
  double width = 0.0;
  double height = 0.0;
  // Document space -> surface space.
  Matrix2D view_transform;
  // Backing-store scale for high-DPI output.
  double pixel_ratio = 1.0;
  // Region that must be repainted, in document space.
  std::optional<RectF> dirty_rect;
};

class Renderer2D {
 public:
  virtual ~Renderer2D() = default;

  virtual void BeginFrame(const FrameInfo& frame) = 0;
  virtual void EndFrame() = 0;

  virtual void Save() = 0;
  virtual void Restore() = 0;

  virtual void SetTransform(const Matrix2D& matrix) = 0;
  virtual void ConcatTransform(const Matrix2D& matrix) = 0;

  virtual void Clear(Color color) = 0;

  virtual void DrawRect(const RectNode& node) = 0;
  virtual void DrawEllipse(const EllipseNode& node) = 0;
  virtual void DrawPath(const PathNode& node) = 0;
  virtual void DrawText(const TextNode& node) = 0;

  // Begin an isolated compositing layer for a group. Must be paired with
  // EndLayer().
  virtual void BeginLayer(const GroupNode& node, double alpha, BlendMode blend_mode) = 0;
  virtual void EndLayer() = 0;
};

struct RenderOptions {
  Matrix2D view_transform;
  double pixel_ratio = 1.0;
  std::optional<RectF> dirty_rect;
  // Visible region in document space. Nodes whose bounds are entirely outside
  // are skipped. Nodes with unknown bounds are never culled.
  std::optional<RectF> cull_rect;
  // When set, the surface is cleared to this colour before drawing.
  std::optional<Color> background_color;
};

// Instrumentation, so optimisation decisions come from measurements.
struct RenderStats {
  uint32_t nodes_visited = 0;
  uint32_t nodes_drawn = 0;
  uint32_t nodes_culled = 0;
  uint32_t layers_opened = 0;
};

// Draw `scene` into `renderer`. This traversal is shared by every backend so
// paint order, transform composition, isolation and culling can never diverge
// between them.
RenderStats RenderScene(const Scene& scene, Renderer2D& renderer, const RenderOptions& options);

}  // namespace pydee

#endif  // PYDEE_RENDERER_H_
