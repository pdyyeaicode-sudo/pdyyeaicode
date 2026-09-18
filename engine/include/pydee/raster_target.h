// raster_target.h — an offscreen surface the engine can render into.
//
// This header deliberately exposes NO Skia types. The surface, its canvas and
// its pixel format live behind a PIMPL, which is what allows callers — including
// the WebAssembly bindings — to be compiled with different flags from Skia
// itself and keeps Skia out of the public API entirely.
//
// It also means the binding layer never includes a Skia header, so the rule that
// Skia appears only inside the backend holds without exception.
//
// One responsibility per file: owning a render surface and its readback.

#ifndef PYDEE_RASTER_TARGET_H_
#define PYDEE_RASTER_TARGET_H_

#include <cstdint>
#include <memory>
#include <vector>

#include "pydee/font_registry.h"
#include "pydee/renderer.h"
#include "pydee/scene.h"

namespace pydee {

class RasterTarget {
 public:
  // Returns nullptr when the surface could not be allocated (for example a
  // non-positive or absurd size), so callers can report a real failure instead
  // of drawing into nothing.
  static std::unique_ptr<RasterTarget> Create(int width, int height);

  ~RasterTarget();

  RasterTarget(const RasterTarget&) = delete;
  RasterTarget& operator=(const RasterTarget&) = delete;

  int width() const;
  int height() const;

  /**
   * Draw a scene into the surface. `fonts` may be null, in which case text is
   * reported as unresolved rather than drawn with a substituted font.
   */
  RenderStats Render(const Scene& scene, const RenderOptions& options,
                     const FontRegistry* fonts = nullptr);

  // Copy the surface out as unpremultiplied RGBA bytes, four per pixel in row
  // order. Returns false if the read fails.
  bool ReadPixelsRGBA(std::vector<uint8_t>* out) const;

  /**
   * Copy ONE RECTANGLE of the surface out, tightly packed, `width * 4` per row.
   *
   * The reason this exists: reading the whole surface costs about 34ms per megapixel
   * in WebAssembly, because Skia converts every pixel out of the surface's
   * premultiplied form. Measured at the editor's default 1080x1080 document that is
   * 40ms — two and a half frames — for a gesture that moved one small object. Reading
   * only what changed makes the cost proportional to the CHANGE rather than to the
   * document.
   *
   * The rectangle is clamped to the surface and returns false when it ends up empty,
   * so a caller cannot silently read nothing and present it as a frame.
   */
  bool ReadPixelsRegionRGBA(int x, int y, int width, int height,
                            std::vector<uint8_t>* out) const;

  /** Text nodes from the last render that had no resolvable font. */
  int unresolved_text() const;
  /** Path nodes from the last render whose data could not be parsed. */
  int unparsable_paths() const;
  /**
   * Paints from the last render the backend could not honour at all — for
   * example a gradient with no stops. Nothing was drawn for them.
   */
  int unresolved_paints() const;
  /**
   * Paints from the last render drawn with a documented approximation, so the
   * editor can say so rather than letting it look like a rendering bug.
   */
  int approximated_paints() const;

 private:
  struct Impl;
  explicit RasterTarget(std::unique_ptr<Impl> impl);

  std::unique_ptr<Impl> impl_;
};

}  // namespace pydee

#endif  // PYDEE_RASTER_TARGET_H_
