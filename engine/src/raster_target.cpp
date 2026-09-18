// raster_target.cpp — Skia-backed implementation of RasterTarget.
//
// Compiled with the same flags as Skia. All Skia types stay inside Impl, so no
// caller ever needs a Skia header or matching RTTI/exception settings.

#include "pydee/raster_target.h"

#include <algorithm>

#include "include/core/SkAlphaType.h"
#include "include/core/SkCanvas.h"
#include "include/core/SkColorType.h"
#include "include/core/SkImageInfo.h"
#include "include/core/SkSurface.h"
#include "skia_renderer.h"

namespace pydee {
namespace {

// Guards against absurd allocations from untrusted sizes.
constexpr int kMaxDimension = 16384;

}  // namespace

struct RasterTarget::Impl {
  int width = 0;
  int height = 0;
  sk_sp<SkSurface> surface;
  int unresolved_text = 0;
  int unparsable_paths = 0;
  int unresolved_paints = 0;
  int approximated_paints = 0;
};

RasterTarget::RasterTarget(std::unique_ptr<Impl> impl) : impl_(std::move(impl)) {}

RasterTarget::~RasterTarget() = default;

std::unique_ptr<RasterTarget> RasterTarget::Create(int width, int height) {
  if (width <= 0 || height <= 0 || width > kMaxDimension || height > kMaxDimension) {
    return nullptr;
  }

  auto impl = std::make_unique<Impl>();
  impl->width = width;
  impl->height = height;
  impl->surface = SkSurfaces::Raster(SkImageInfo::MakeN32Premul(width, height));
  if (impl->surface == nullptr) {
    return nullptr;
  }

  // std::unique_ptr cannot use a private constructor through make_unique.
  return std::unique_ptr<RasterTarget>(new RasterTarget(std::move(impl)));
}

int RasterTarget::width() const { return impl_->width; }

int RasterTarget::height() const { return impl_->height; }

RenderStats RasterTarget::Render(const Scene& scene, const RenderOptions& options,
                                const FontRegistry* fonts) {
  SkiaRenderer renderer(impl_->surface->getCanvas(), fonts);
  const RenderStats stats = RenderScene(scene, renderer, options);
  impl_->unresolved_text = renderer.unresolved_text();
  impl_->unparsable_paths = renderer.unparsable_paths();
  impl_->unresolved_paints = renderer.unresolved_paints();
  impl_->approximated_paints = renderer.approximated_paints();
  return stats;
}

int RasterTarget::unresolved_text() const { return impl_->unresolved_text; }

int RasterTarget::unparsable_paths() const { return impl_->unparsable_paths; }

int RasterTarget::unresolved_paints() const { return impl_->unresolved_paints; }

int RasterTarget::approximated_paints() const { return impl_->approximated_paints; }

bool RasterTarget::ReadPixelsRGBA(std::vector<uint8_t>* out) const {
  if (out == nullptr) {
    return false;
  }
  const size_t row_bytes = static_cast<size_t>(impl_->width) * 4u;
  const size_t total = row_bytes * static_cast<size_t>(impl_->height);
  /*
    `resize`, not `assign(total, 0)`.

    `assign` zero-fills the entire buffer and Skia then overwrites every byte of it —
    640KB of pointless memset per frame on a 400x400 artboard, and 4.6MB on a 1080x1080
    one. `resize` to a size the buffer already has does nothing, so after the first
    frame this costs nothing at all. Measured through
    browser-tests/inputLatency.spec.ts, which attributes this call separately from the
    canvas upload precisely so waste like this is visible.
  */
  if (out->size() != total) {
    out->resize(total);
  }

  /*
    Read as UNPREMULTIPLIED, which is what ImageData requires and what makes this the
    expensive call it is: Skia converts every pixel out of the surface's premultiplied
    form. Reading premultiplied instead would be close to a memcpy but WRONG on every
    antialiased edge and every partially transparent layer, so it is not done.

    The structural fix is to stop reading back at all — render into a GPU surface the
    canvas already owns — which is a renderer change rather than a tuning one.
  */
  const SkImageInfo info = SkImageInfo::Make(impl_->width, impl_->height,
                                             kRGBA_8888_SkColorType, kUnpremul_SkAlphaType);
  return impl_->surface->readPixels(info, out->data(), row_bytes, 0, 0);
}

bool RasterTarget::ReadPixelsRegionRGBA(int x, int y, int width, int height,
                                        std::vector<uint8_t>* out) const {
  if (out == nullptr) {
    return false;
  }
  // Clamped rather than rejected: a damage rect derived from geometry can legitimately
  // extend past the artboard when an object is dragged towards an edge, and the useful
  // response is to read the part that exists.
  const int left = std::max(0, x);
  const int top = std::max(0, y);
  const int right = std::min(impl_->width, x + width);
  const int bottom = std::min(impl_->height, y + height);
  if (right <= left || bottom <= top) {
    // Empty after clamping. Reported so a caller cannot present nothing as a frame.
    return false;
  }

  const int region_width = right - left;
  const int region_height = bottom - top;
  const size_t row_bytes = static_cast<size_t>(region_width) * 4u;
  const size_t total = row_bytes * static_cast<size_t>(region_height);
  // Grown but never shrunk, so a sequence of differently sized damage rects does not
  // reallocate on every frame. The caller is told the region's dimensions and reads only
  // the leading `total` bytes.
  if (out->size() < total) {
    out->resize(total);
  }

  const SkImageInfo info = SkImageInfo::Make(region_width, region_height,
                                             kRGBA_8888_SkColorType, kUnpremul_SkAlphaType);
  return impl_->surface->readPixels(info, out->data(), row_bytes, left, top);
}

}  // namespace pydee
