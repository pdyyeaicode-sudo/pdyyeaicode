// font_registry.h — explicit font ownership for the engine.
//
// The browser gives WebAssembly no access to system font enumeration, so a
// WASM renderer can only draw with fonts it has been handed as bytes. Rather
// than have one code path use system fonts natively and another use supplied
// fonts in the browser — which would make native golden images disagree with
// what users see — BOTH targets resolve text exclusively through this registry.
//
// Consequence worth stating plainly: text does not render until a font is
// registered. That is deliberate. Silently substituting a system font would
// produce metrics that disagree with the exported SVG.
//
// No Skia type appears in this header. The font manager, typefaces and the
// paragraph font collection live behind a PIMPL, so the WASM bindings can be
// compiled with different flags and never include a Skia header.
//
// One responsibility per file: owning registered fonts and measuring text.

#ifndef PYDEE_FONT_REGISTRY_H_
#define PYDEE_FONT_REGISTRY_H_

#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace pydee {

struct TextNode;

/** Shaped extents of a laid-out text block, in document pixels. */
struct TextMetrics {
  /** Width of the widest line. */
  double width = 0.0;
  /** Total height across all lines. */
  double height = 0.0;
  /** Distance from the first line's baseline up to the block top. */
  double first_line_ascent = 0.0;
  int line_count = 0;
};

class FontRegistry {
 public:
  static std::unique_ptr<FontRegistry> Create();

  ~FontRegistry();

  FontRegistry(const FontRegistry&) = delete;
  FontRegistry& operator=(const FontRegistry&) = delete;

  /**
   * Register a font binary (TTF/OTF) under a family name. The same family may be
   * registered more than once to supply additional weights and styles.
   *
   * Returns false when the data is not a font Skia can decode, so a corrupt
   * upload is reported rather than silently ignored.
   */
  bool Register(const std::string& family, const uint8_t* data, size_t size);

  bool HasFamily(const std::string& family) const;
  std::vector<std::string> Families() const;

  /**
   * Family used when a requested one was never registered. Empty by default,
   * which means unresolvable text is not drawn at all.
   */
  void SetFallbackFamily(const std::string& family);
  const std::string& FallbackFamily() const;

  /**
   * Shape and measure a text node. Returns false when no usable font could be
   * resolved, which the caller must surface instead of guessing extents.
   */
  bool Measure(const TextNode& node, TextMetrics* out) const;

 private:
  struct Impl;
  explicit FontRegistry(std::unique_ptr<Impl> impl);

  std::unique_ptr<Impl> impl_;

  // The Skia backend reaches the paragraph font collection through an
  // implementation-only accessor declared in src/font_registry_internal.h.
  friend struct FontRegistryAccess;
};

}  // namespace pydee

#endif  // PYDEE_FONT_REGISTRY_H_
