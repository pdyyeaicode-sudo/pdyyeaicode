// font_registry_internal.h — backend-only access to the font registry's Skia state.
//
// Included exclusively by translation units that are already Skia-aware. It
// exists so `pydee/font_registry.h` can stay free of Skia types while the
// renderer still reaches the paragraph font collection it needs.
//
// One responsibility per file: the internal bridge to the font registry.

#ifndef PYDEE_FONT_REGISTRY_INTERNAL_H_
#define PYDEE_FONT_REGISTRY_INTERNAL_H_

#include "include/core/SkRefCnt.h"
#include "modules/skparagraph/include/FontCollection.h"
#include "modules/skparagraph/include/ParagraphStyle.h"
#include "modules/skunicode/include/SkUnicode.h"
#include "pydee/font_registry.h"
#include "pydee/scene.h"

namespace pydee {

struct FontRegistryAccess {
  /** Font collection backing every text layout. Never null for a live registry. */
  static sk_sp<skia::textlayout::FontCollection> Collection(const FontRegistry& registry);

  /** ICU-backed Unicode analysis required to build a paragraph. */
  static sk_sp<SkUnicode> Unicode(const FontRegistry& registry);

  /** Resolved family list for a node, honouring the fallback family. */
  static std::vector<SkString> Families(const FontRegistry& registry, const TextNode& node);
};

/**
 * Build the paragraph style for a text node. Shared by measurement and drawing
 * so the two can never disagree about layout.
 */
skia::textlayout::ParagraphStyle MakeParagraphStyle(const FontRegistry& registry,
                                                    const TextNode& node);

}  // namespace pydee

#endif  // PYDEE_FONT_REGISTRY_INTERNAL_H_
