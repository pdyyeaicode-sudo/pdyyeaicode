// paint_servers.h — resolving SVG `<defs>` paint servers into engine gradients.
//
// This lives in C++ rather than TypeScript on purpose. Parsing gradient
// geometry, resolving percentages against the viewport, composing
// `gradientTransform` lists and following `href` inheritance chains are all
// rendering calculations, and the renderer is the only component that can be
// held responsible for getting them right. Keeping them here also means the
// native tests, the browser and any future export target resolve a gradient
// identically — a second implementation in TypeScript would be a second set of
// rounding and default-value decisions that could drift.
//
// No Skia type appears here: the output is the engine's own `Gradient`, which
// the Skia backend then turns into a shader.
//
// One responsibility per file: parsing paint servers out of SVG defs markup.

#ifndef PYDEE_PAINT_SERVERS_H_
#define PYDEE_PAINT_SERVERS_H_

#include <cstdint>
#include <memory>
#include <string>
#include <unordered_map>

#include "pydee/geometry.h"
#include "pydee/scene.h"

namespace pydee {

/**
 * Paint servers parsed from one artboard's `<defs>`, keyed by element id.
 *
 * Failure policy: markup that cannot be scanned at all is rejected with a
 * reason. An individual paint server the engine does not implement — a pattern,
 * or a gradient with an unresolvable stop colour — is dropped and counted, so a
 * reference to it stays unresolved and is reported at draw time instead of being
 * painted with an invented colour.
 */
class PaintServerTable {
 public:
  /**
   * Parse `<defs>` markup. `viewport_width` and `viewport_height` resolve
   * percentage coordinates for `gradientUnits="userSpaceOnUse"`; they are unused
   * by the `objectBoundingBox` default.
   */
  bool Parse(const std::string& markup, double viewport_width, double viewport_height,
             std::string* error);

  /** Null when no gradient with that id was parsed. */
  std::shared_ptr<const Gradient> Find(const std::string& id) const;

  size_t size() const { return gradients_.size(); }

  /** Paint servers that were found but could not be represented. */
  int unsupported() const { return unsupported_; }

  void Clear();

 private:
  std::unordered_map<std::string, std::shared_ptr<const Gradient>> gradients_;
  int unsupported_ = 0;
};

/**
 * Parse a CSS/SVG colour into 0xAARRGGBB.
 *
 * Covers the forms the Canonical_SVG emits: hex in all four lengths,
 * `rgb()`/`rgba()` with numbers or percentages, and the basic keywords.
 * `none` and `transparent` return false, because they mean "no paint" rather
 * than a colour.
 */
bool ParseCssColor(const std::string& value, Color* out);

/**
 * Parse an SVG transform list: `matrix`, `translate`, `scale`, `rotate`,
 * `skewX`, `skewY`, in any order. Functions compose left to right, so the first
 * listed is the outermost.
 */
bool ParseSvgTransform(const std::string& value, Matrix2D* out);

}  // namespace pydee

#endif  // PYDEE_PAINT_SERVERS_H_
