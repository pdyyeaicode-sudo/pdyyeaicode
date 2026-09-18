// font_registry.cpp — Skia-backed implementation of the font registry.
//
// Text is shaped through skparagraph, which integrates HarfBuzz and ICU. Skia
// itself does not implement shaping, and positioning glyphs by advance width
// would break every script that needs reordering, ligatures or combining marks.

#include "pydee/font_registry.h"

#include <algorithm>
#include <utility>

#include "font_registry_internal.h"
#include "include/core/SkData.h"
#include "include/core/SkFontMgr.h"
#include "include/core/SkFontStyle.h"
#include "include/core/SkString.h"
#include "include/core/SkTypeface.h"
#include "include/ports/SkFontMgr_empty.h"
#include "modules/skparagraph/include/Paragraph.h"
#include "modules/skparagraph/include/ParagraphBuilder.h"
#include "modules/skparagraph/include/TextStyle.h"
#include "modules/skparagraph/include/TypefaceFontProvider.h"
#include "modules/skunicode/include/SkUnicode_icu.h"
#include "pydee/scene.h"

namespace pydee {
namespace {

using skia::textlayout::FontCollection;
using skia::textlayout::ParagraphBuilder;
using skia::textlayout::ParagraphStyle;
using skia::textlayout::TextStyle;

/**
 * Layout width used for measurement and drawing.
 *
 * The canonical SVG positions each text layer explicitly and does not wrap, so
 * the paragraph is laid out effectively unbounded and the real extent is read
 * back from the shaped result. A finite but very large value is used because
 * infinity is not a valid layout width.
 */
constexpr SkScalar kUnboundedWidth = 1.0e6f;

SkFontStyle ToFontStyle(const TextNode& node) {
  return SkFontStyle(node.bold ? SkFontStyle::kBold_Weight : SkFontStyle::kNormal_Weight,
                     SkFontStyle::kNormal_Width,
                     node.italic ? SkFontStyle::kItalic_Slant : SkFontStyle::kUpright_Slant);
}

}  // namespace

struct FontRegistry::Impl {
  /** Decodes font bytes into typefaces. Owns no system fonts. */
  sk_sp<SkFontMgr> font_mgr;
  /** Maps explicit family aliases to registered typefaces for shaping. */
  sk_sp<skia::textlayout::TypefaceFontProvider> provider;
  sk_sp<FontCollection> collection;
  /**
   * ICU-backed Unicode support for the shaper: grapheme, word and line break
   * analysis plus bidi. Created once, because construction is expensive and it
   * is required for every paragraph build.
   */
  sk_sp<SkUnicode> unicode;
  std::vector<std::string> families;
  std::string fallback_family;
};

FontRegistry::FontRegistry(std::unique_ptr<Impl> impl) : impl_(std::move(impl)) {}

FontRegistry::~FontRegistry() = default;

std::unique_ptr<FontRegistry> FontRegistry::Create() {
  auto impl = std::make_unique<Impl>();

  // An "empty" custom font manager owns no system fonts and only decodes the
  // bytes we hand it, which is what makes native and WASM behave identically.
  impl->font_mgr = SkFontMgr_New_Custom_Empty();
  if (impl->font_mgr == nullptr) {
    return nullptr;
  }

  // A typeface created from data carries no family name the shaper can look up,
  // so registrations go through skparagraph's provider, which maps an explicit
  // alias to a typeface.
  impl->provider = sk_make_sp<skia::textlayout::TypefaceFontProvider>();

  impl->collection = sk_make_sp<FontCollection>();
  impl->collection->setAssetFontManager(impl->provider);
  // No system fallback: an unresolved family must be reported, not substituted.
  impl->collection->disableFontFallback();

  // Shaping needs Unicode analysis. Skia does not implement shaping itself, and
  // positioning glyphs by advance width would break every script that needs
  // reordering, ligatures or combining marks.
  impl->unicode = SkUnicodes::ICU::Make();
  if (impl->unicode == nullptr) {
    return nullptr;
  }

  return std::unique_ptr<FontRegistry>(new FontRegistry(std::move(impl)));
}

bool FontRegistry::Register(const std::string& family, const uint8_t* data, size_t size) {
  if (family.empty() || data == nullptr || size == 0) {
    return false;
  }

  sk_sp<SkData> font_data = SkData::MakeWithCopy(data, size);
  if (font_data == nullptr) {
    return false;
  }

  // Verify Skia can actually decode the bytes before recording the family, so a
  // corrupt upload fails loudly instead of producing invisible text later.
  sk_sp<SkTypeface> typeface = impl_->font_mgr->makeFromData(font_data);
  if (typeface == nullptr) {
    return false;
  }

  impl_->provider->registerTypeface(typeface, SkString(family.c_str()));

  if (std::find(impl_->families.begin(), impl_->families.end(), family)
      == impl_->families.end()) {
    impl_->families.push_back(family);
  }
  if (impl_->fallback_family.empty()) {
    impl_->fallback_family = family;
  }
  return true;
}

bool FontRegistry::HasFamily(const std::string& family) const {
  return std::find(impl_->families.begin(), impl_->families.end(), family)
      != impl_->families.end();
}

std::vector<std::string> FontRegistry::Families() const { return impl_->families; }

void FontRegistry::SetFallbackFamily(const std::string& family) {
  impl_->fallback_family = family;
}

const std::string& FontRegistry::FallbackFamily() const { return impl_->fallback_family; }

bool FontRegistry::Measure(const TextNode& node, TextMetrics* out) const {
  if (out == nullptr) {
    return false;
  }
  if (impl_->families.empty()) {
    // Nothing registered: refuse to invent metrics.
    return false;
  }

  ParagraphStyle paragraph_style = MakeParagraphStyle(*this, node);
  std::unique_ptr<ParagraphBuilder> builder =
      ParagraphBuilder::make(paragraph_style, impl_->collection, impl_->unicode);
  if (builder == nullptr) {
    return false;
  }
  builder->addText(node.content.c_str(), node.content.size());

  std::unique_ptr<skia::textlayout::Paragraph> paragraph = builder->Build();
  if (paragraph == nullptr) {
    return false;
  }
  paragraph->layout(kUnboundedWidth);

  std::vector<skia::textlayout::LineMetrics> lines;
  paragraph->getLineMetrics(lines);

  out->width = paragraph->getLongestLine();
  out->height = paragraph->getHeight();
  out->line_count = static_cast<int>(lines.size());
  out->first_line_ascent = lines.empty() ? paragraph->getAlphabeticBaseline() : lines[0].fAscent;
  return true;
}

// --- internal access -------------------------------------------------------

sk_sp<FontCollection> FontRegistryAccess::Collection(const FontRegistry& registry) {
  return registry.impl_->collection;
}

sk_sp<SkUnicode> FontRegistryAccess::Unicode(const FontRegistry& registry) {
  return registry.impl_->unicode;
}

std::vector<SkString> FontRegistryAccess::Families(const FontRegistry& registry,
                                                   const TextNode& node) {
  std::vector<SkString> families;
  if (!node.font_family.empty()) {
    families.emplace_back(node.font_family.c_str());
  }
  const std::string& fallback = registry.impl_->fallback_family;
  if (!fallback.empty() && fallback != node.font_family) {
    families.emplace_back(fallback.c_str());
  }
  return families;
}

ParagraphStyle MakeParagraphStyle(const FontRegistry& registry, const TextNode& node) {
  TextStyle text_style;
  text_style.setFontFamilies(FontRegistryAccess::Families(registry, node));
  text_style.setFontSize(static_cast<SkScalar>(node.font_size));
  text_style.setFontStyle(ToFontStyle(node));
  if (node.letter_spacing != 0.0) {
    text_style.setLetterSpacing(static_cast<SkScalar>(node.letter_spacing));
  }
  if (node.line_height > 0.0 && node.font_size > 0.0) {
    // skparagraph expresses line height as a multiple of font size, while the
    // document model stores an absolute advance in pixels.
    text_style.setHeightOverride(true);
    text_style.setHeight(static_cast<SkScalar>(node.line_height / node.font_size));
  }
  // Decoration is set here rather than in the renderer so measurement and
  // painting build the same style, and so a future decoration that does affect
  // metrics cannot make the two disagree.
  switch (node.decoration) {
    case TextDecoration::kUnderline:
      text_style.setDecoration(skia::textlayout::TextDecoration::kUnderline);
      break;
    case TextDecoration::kLineThrough:
      text_style.setDecoration(skia::textlayout::TextDecoration::kLineThrough);
      break;
    case TextDecoration::kNone:
      break;
  }
  if (node.decoration != TextDecoration::kNone) {
    text_style.setDecorationStyle(skia::textlayout::TextDecorationStyle::kSolid);
    // SVG draws the decoration in the text's own colour, and thickness scales
    // with the font rather than being a fixed pixel value.
    text_style.setDecorationThicknessMultiplier(1.0f);
  }
  // The colour is applied by the renderer, which owns paint construction.
  ParagraphStyle paragraph_style;
  paragraph_style.setTextStyle(text_style);
  paragraph_style.setTextDirection(node.direction == TextDirection::kRtl
                                       ? skia::textlayout::TextDirection::kRtl
                                       : skia::textlayout::TextDirection::kLtr);
  // Alignment is applied by translating the drawn paragraph, because SVG anchors
  // text around an explicit origin rather than inside a box.
  paragraph_style.setTextAlign(skia::textlayout::TextAlign::kLeft);
  return paragraph_style;
}

}  // namespace pydee
