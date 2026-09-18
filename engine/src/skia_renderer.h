// skia_renderer.h — Skia implementation of the engine's Renderer2D.
//
// This is the ONLY place Skia types appear. Everything above it works in terms
// of the engine's own scene and geometry types, which is what allows the backend
// to be swapped (raster, GPU, export) and keeps Skia out of the WASM bindings.
//
// One responsibility per file: the Skia drawing backend.

#ifndef PYDEE_SKIA_RENDERER_H_
#define PYDEE_SKIA_RENDERER_H_

#include "include/core/SkCanvas.h"
#include "pydee/font_registry.h"
#include "pydee/renderer.h"

namespace pydee {

// Draws onto a caller-owned SkCanvas. The canvas outlives the renderer.
class SkiaRenderer final : public Renderer2D {
 public:
  /**
   * `fonts` may be null, in which case text is counted as unrenderable rather
   * than drawn with a substituted font.
   */
  SkiaRenderer(SkCanvas* canvas, const FontRegistry* fonts);

  void BeginFrame(const FrameInfo& frame) override;
  void EndFrame() override;

  void Save() override;
  void Restore() override;

  void SetTransform(const Matrix2D& matrix) override;
  void ConcatTransform(const Matrix2D& matrix) override;

  void Clear(Color color) override;

  void DrawRect(const RectNode& node) override;
  void DrawEllipse(const EllipseNode& node) override;
  void DrawPath(const PathNode& node) override;
  void DrawText(const TextNode& node) override;

  void BeginLayer(const GroupNode& node, double alpha, BlendMode blend_mode) override;
  void EndLayer() override;

  // Number of paths the backend could not parse. Surfaced so a malformed path
  // is reported rather than silently skipped.
  int unparsable_paths() const { return unparsable_paths_; }

  /**
   * Text nodes that could not be drawn because no font was resolvable. Reported
   * so the editor can tell the user a font is missing instead of showing a gap.
   */
  int unresolved_text() const { return unresolved_text_; }

  /**
   * Paints the backend could not honour at all — a gradient with no stops, or a
   * gradient in objectBoundingBox units on zero-area geometry. Nothing was
   * drawn for them, so they must be reported rather than looking like a
   * rendering bug.
   */
  int unresolved_paints() const { return unresolved_paints_; }

  /**
   * Paints drawn with a documented approximation: today only a text decoration
   * under a gradient fill, which skparagraph can only draw in a single colour.
   */
  int approximated_paints() const { return approximated_paints_; }

 private:
  SkCanvas* canvas_;
  const FontRegistry* fonts_;
  int unparsable_paths_ = 0;
  int unresolved_text_ = 0;
  int unresolved_paints_ = 0;
  int approximated_paints_ = 0;
};

}  // namespace pydee

#endif  // PYDEE_SKIA_RENDERER_H_
