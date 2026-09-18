// skia_renderer.cpp — Skia implementation of Renderer2D.

#include "skia_renderer.h"

#include "font_registry_internal.h"
#include "include/core/SkBlendMode.h"
#include "include/core/SkColor.h"
#include "include/core/SkMatrix.h"
#include "include/core/SkPaint.h"
#include "include/core/SkPath.h"
#include "include/core/SkPoint.h"
#include "include/core/SkRRect.h"
#include "include/core/SkRect.h"
#include "include/core/SkShader.h"
#include "include/core/SkTileMode.h"
#include "include/effects/SkGradient.h"
#include "include/utils/SkParsePath.h"
#include "modules/skparagraph/include/Paragraph.h"
#include "modules/skparagraph/include/ParagraphBuilder.h"
#include "modules/skparagraph/include/TextStyle.h"

#include <vector>

namespace pydee {
namespace {

using skia::textlayout::Paragraph;
using skia::textlayout::ParagraphBuilder;
using skia::textlayout::ParagraphStyle;
using skia::textlayout::TextStyle;

/** Must match the width used for measurement so layout cannot disagree. */
constexpr SkScalar kUnboundedLayoutWidth = 1.0e6f;

SkMatrix ToSkMatrix(const Matrix2D& m) {
  // SkMatrix::MakeAll takes rows: (scaleX skewX transX / skewY scaleY transY).
  // Mapping from the SVG component order a,b,c,d,e,f:
  //   scaleX = a, skewX = c, transX = e
  //   skewY  = b, scaleY = d, transY = f
  return SkMatrix::MakeAll(static_cast<SkScalar>(m.a), static_cast<SkScalar>(m.c),
                           static_cast<SkScalar>(m.e), static_cast<SkScalar>(m.b),
                           static_cast<SkScalar>(m.d), static_cast<SkScalar>(m.f),
                           0.0f, 0.0f, 1.0f);
}

SkBlendMode ToSkBlendMode(BlendMode mode) {
  switch (mode) {
    case BlendMode::kNormal:      return SkBlendMode::kSrcOver;
    case BlendMode::kMultiply:    return SkBlendMode::kMultiply;
    case BlendMode::kScreen:      return SkBlendMode::kScreen;
    case BlendMode::kOverlay:     return SkBlendMode::kOverlay;
    case BlendMode::kDarken:      return SkBlendMode::kDarken;
    case BlendMode::kLighten:     return SkBlendMode::kLighten;
    case BlendMode::kColorDodge:  return SkBlendMode::kColorDodge;
    case BlendMode::kColorBurn:   return SkBlendMode::kColorBurn;
    case BlendMode::kHardLight:   return SkBlendMode::kHardLight;
    case BlendMode::kSoftLight:   return SkBlendMode::kSoftLight;
    case BlendMode::kDifference:  return SkBlendMode::kDifference;
    case BlendMode::kExclusion:   return SkBlendMode::kExclusion;
    case BlendMode::kHue:         return SkBlendMode::kHue;
    case BlendMode::kSaturation:  return SkBlendMode::kSaturation;
    case BlendMode::kColor:       return SkBlendMode::kColor;
    case BlendMode::kLuminosity:  return SkBlendMode::kLuminosity;
    case BlendMode::kPlusLighter: return SkBlendMode::kPlus;
  }
  return SkBlendMode::kSrcOver;
}

// Multiply a colour's alpha by the node's own opacity. Leaf opacity is applied
// here; group opacity is applied by BeginLayer instead.
SkColor ApplyOpacity(Color color, double opacity) {
  const double clamped = opacity < 0.0 ? 0.0 : (opacity > 1.0 ? 1.0 : opacity);
  const unsigned original_alpha = (color >> 24) & 0xFF;
  const unsigned scaled_alpha =
      static_cast<unsigned>(static_cast<double>(original_alpha) * clamped + 0.5);
  return static_cast<SkColor>((scaled_alpha << 24) | (color & 0x00FFFFFF));
}

SkTileMode ToSkTileMode(GradientSpread spread) {
  switch (spread) {
    case GradientSpread::kPad:     return SkTileMode::kClamp;
    case GradientSpread::kReflect: return SkTileMode::kMirror;
    case GradientSpread::kRepeat:  return SkTileMode::kRepeat;
  }
  return SkTileMode::kClamp;
}

/**
 * The outcome of turning a scene paint into an SkPaint.
 *
 * Three states rather than a bool because "nothing to paint" and "the engine
 * could not honour this paint" must not be conflated: the first is a normal
 * `fill="none"`, the second has to be reported to the user.
 */
enum class PaintOutcome {
  kPainted,
  kNothing,
  kUnresolved,
};

/**
 * Map the gradient's coordinate system onto the painted geometry.
 *
 * `objectBoundingBox` — the SVG default — expresses gradient coordinates as
 * fractions of the object's bounding box, so the unit square is mapped onto that
 * box. `gradientTransform` acts inside the gradient's own space, which is why it
 * is pre-concatenated rather than post-concatenated.
 */
SkMatrix GradientLocalMatrix(const Gradient& gradient, const SkRect& object_bounds) {
  SkMatrix local = SkMatrix::I();
  if (gradient.units == GradientUnits::kObjectBoundingBox) {
    local = SkMatrix::Translate(object_bounds.x(), object_bounds.y());
    local.preScale(object_bounds.width(), object_bounds.height());
  }
  local.preConcat(ToSkMatrix(gradient.transform));
  return local;
}

/** True when the gradient's geometry collapses to a point or a zero radius. */
bool IsDegenerate(const Gradient& gradient) {
  if (gradient.type == Gradient::Type::kLinear) {
    return gradient.x1 == gradient.x2 && gradient.y1 == gradient.y2;
  }
  return !(gradient.r > 0.0);
}

/**
 * Build the shader for a gradient paint.
 *
 * Returns null for the cases SVG defines as a flat colour rather than a
 * gradient — a single stop, or degenerate geometry — and writes that colour to
 * `solid_color` so the caller can still paint. A null return with
 * `solid_color` left transparent means the paint could not be honoured at all.
 */
sk_sp<SkShader> MakeGradientShader(const Gradient& gradient, double opacity,
                                   const SkRect& object_bounds, SkColor* solid_color) {
  if (gradient.stops.empty()) {
    return nullptr;
  }

  if (gradient.stops.size() == 1 || IsDegenerate(gradient)) {
    const GradientStop& stop =
        gradient.stops.size() == 1 ? gradient.stops.front() : gradient.stops.back();
    *solid_color = ApplyOpacity(stop.color, opacity);
    return nullptr;
  }

  // A zero-area bounding box gives objectBoundingBox coordinates nothing to map
  // onto, so SVG does not render the element at all.
  if (gradient.units == GradientUnits::kObjectBoundingBox
      && (object_bounds.width() <= 0.0f || object_bounds.height() <= 0.0f)) {
    return nullptr;
  }

  std::vector<SkColor4f> colors;
  std::vector<float> positions;
  colors.reserve(gradient.stops.size());
  positions.reserve(gradient.stops.size());
  for (const GradientStop& stop : gradient.stops) {
    colors.push_back(SkColor4f::FromColor(ApplyOpacity(stop.color, opacity)));
    positions.push_back(static_cast<float>(stop.offset));
  }

  const SkMatrix local = GradientLocalMatrix(gradient, object_bounds);
  // `SkGradient::Colors` holds non-owning spans, so `colors` and `positions`
  // must outlive the shader construction below — they do, being locals here.
  const SkGradient description(SkGradient::Colors(SkSpan<const SkColor4f>(colors),
                                                  SkSpan<const float>(positions),
                                                  ToSkTileMode(gradient.spread)),
                               SkGradient::Interpolation{});

  if (gradient.type == Gradient::Type::kLinear) {
    const SkPoint points[2] = {
        SkPoint::Make(static_cast<SkScalar>(gradient.x1), static_cast<SkScalar>(gradient.y1)),
        SkPoint::Make(static_cast<SkScalar>(gradient.x2), static_cast<SkScalar>(gradient.y2)),
    };
    return SkShaders::LinearGradient(points, description, &local);
  }

  const SkPoint center =
      SkPoint::Make(static_cast<SkScalar>(gradient.cx), static_cast<SkScalar>(gradient.cy));
  const SkPoint focal =
      SkPoint::Make(static_cast<SkScalar>(gradient.fx), static_cast<SkScalar>(gradient.fy));
  if (focal == center) {
    return SkShaders::RadialGradient(center, static_cast<float>(gradient.r), description, &local);
  }
  // An SVG radial gradient with a displaced focal point is exactly a two-point
  // conical gradient whose start circle has zero radius.
  return SkShaders::TwoPointConicalGradient(focal, 0.0f, center, static_cast<float>(gradient.r),
                                            description, &local);
}

/**
 * Configure `out` from a scene paint. `object_bounds` is the painted geometry's
 * bounding box, needed only by `objectBoundingBox` gradients.
 */
PaintOutcome ConfigurePaint(const Paint& paint, double opacity, BlendMode blend_mode,
                            const SkRect& object_bounds, SkPaint* out) {
  if (paint.kind == Paint::Kind::kNone) {
    return PaintOutcome::kNothing;
  }

  out->setAntiAlias(true);
  out->setBlendMode(ToSkBlendMode(blend_mode));

  if (paint.kind == Paint::Kind::kSolid) {
    out->setColor(ApplyOpacity(paint.color, opacity));
    return PaintOutcome::kPainted;
  }

  if (paint.gradient == nullptr) {
    return PaintOutcome::kUnresolved;
  }

  SkColor solid_color = SK_ColorTRANSPARENT;
  sk_sp<SkShader> shader =
      MakeGradientShader(*paint.gradient, opacity, object_bounds, &solid_color);
  if (shader != nullptr) {
    // The shader supplies the stop colours, so the paint's own colour must stay
    // fully opaque or the gradient's alpha would be scaled twice.
    out->setColor(SK_ColorBLACK);
    out->setShader(std::move(shader));
    return PaintOutcome::kPainted;
  }
  if (solid_color != SK_ColorTRANSPARENT) {
    out->setColor(solid_color);
    return PaintOutcome::kPainted;
  }
  return PaintOutcome::kUnresolved;
}

PaintOutcome BuildFillPaint(const Paint& paint, double opacity, BlendMode blend_mode,
                            const SkRect& object_bounds, SkPaint* out) {
  const PaintOutcome outcome = ConfigurePaint(paint, opacity, blend_mode, object_bounds, out);
  if (outcome == PaintOutcome::kPainted) {
    out->setStyle(SkPaint::kFill_Style);
  }
  return outcome;
}

PaintOutcome BuildStrokePaint(const Stroke& stroke, double opacity, BlendMode blend_mode,
                              const SkRect& object_bounds, SkPaint* out) {
  if (stroke.width <= 0.0) {
    return PaintOutcome::kNothing;
  }
  const PaintOutcome outcome =
      ConfigurePaint(stroke.paint, opacity, blend_mode, object_bounds, out);
  if (outcome == PaintOutcome::kPainted) {
    out->setStyle(SkPaint::kStroke_Style);
    out->setStrokeWidth(static_cast<SkScalar>(stroke.width));
  }
  return outcome;
}

/**
 * Colour a text decoration line is drawn in.
 *
 * skparagraph draws decorations with a single colour and cannot apply a shader to
 * them, so a gradient-filled decoration is approximated with its first stop. The
 * caller counts that approximation rather than hiding it.
 */
SkColor DecorationColor(const Paint& paint, double opacity, bool* approximated) {
  *approximated = false;
  if (paint.kind == Paint::Kind::kSolid) {
    return ApplyOpacity(paint.color, opacity);
  }
  if (paint.kind == Paint::Kind::kGradient && paint.gradient != nullptr
      && !paint.gradient->stops.empty()) {
    *approximated = paint.gradient->stops.size() > 1;
    return ApplyOpacity(paint.gradient->stops.front().color, opacity);
  }
  return SK_ColorTRANSPARENT;
}

SkRect ToSkRect(double x, double y, double width, double height) {
  return SkRect::MakeXYWH(static_cast<SkScalar>(x), static_cast<SkScalar>(y),
                          static_cast<SkScalar>(width), static_cast<SkScalar>(height));
}

}  // namespace

SkiaRenderer::SkiaRenderer(SkCanvas* canvas, const FontRegistry* fonts)
    : canvas_(canvas), fonts_(fonts) {}

void SkiaRenderer::BeginFrame(const FrameInfo& frame) {
  // The device-pixel scale is a property of the surface, applied before the
  // document view transform so document units stay resolution independent.
  canvas_->save();
  if (frame.pixel_ratio != 1.0) {
    canvas_->scale(static_cast<SkScalar>(frame.pixel_ratio),
                   static_cast<SkScalar>(frame.pixel_ratio));
  }
  if (frame.dirty_rect.has_value()) {
    const RectF& dirty = *frame.dirty_rect;
    canvas_->clipRect(ToSkRect(dirty.x, dirty.y, dirty.width, dirty.height));
  }
}

void SkiaRenderer::EndFrame() { canvas_->restore(); }

void SkiaRenderer::Save() { canvas_->save(); }

void SkiaRenderer::Restore() { canvas_->restore(); }

void SkiaRenderer::SetTransform(const Matrix2D& matrix) {
  // Replace the document transform while preserving the surface-level scale and
  // clip established in BeginFrame.
  canvas_->concat(ToSkMatrix(matrix));
}

void SkiaRenderer::ConcatTransform(const Matrix2D& matrix) {
  canvas_->concat(ToSkMatrix(matrix));
}

void SkiaRenderer::Clear(Color color) { canvas_->clear(static_cast<SkColor>(color)); }

void SkiaRenderer::DrawRect(const RectNode& node) {
  const SkRect rect = ToSkRect(node.x, node.y, node.width, node.height);
  const bool rounded = node.corner_radius > 0.0;
  const SkRRect rrect = SkRRect::MakeRectXY(rect, static_cast<SkScalar>(node.corner_radius),
                                            static_cast<SkScalar>(node.corner_radius));

  SkPaint paint;
  switch (BuildFillPaint(node.fill, node.opacity, node.blend_mode, rect, &paint)) {
    case PaintOutcome::kPainted:
      if (rounded) {
        canvas_->drawRRect(rrect, paint);
      } else {
        canvas_->drawRect(rect, paint);
      }
      break;
    case PaintOutcome::kUnresolved:
      ++unresolved_paints_;
      break;
    case PaintOutcome::kNothing:
      break;
  }

  SkPaint stroke_paint;
  switch (BuildStrokePaint(node.stroke, node.opacity, node.blend_mode, rect, &stroke_paint)) {
    case PaintOutcome::kPainted:
      if (rounded) {
        canvas_->drawRRect(rrect, stroke_paint);
      } else {
        canvas_->drawRect(rect, stroke_paint);
      }
      break;
    case PaintOutcome::kUnresolved:
      ++unresolved_paints_;
      break;
    case PaintOutcome::kNothing:
      break;
  }
}

void SkiaRenderer::DrawEllipse(const EllipseNode& node) {
  const SkRect oval = SkRect::MakeLTRB(static_cast<SkScalar>(node.cx - node.rx),
                                       static_cast<SkScalar>(node.cy - node.ry),
                                       static_cast<SkScalar>(node.cx + node.rx),
                                       static_cast<SkScalar>(node.cy + node.ry));

  SkPaint paint;
  switch (BuildFillPaint(node.fill, node.opacity, node.blend_mode, oval, &paint)) {
    case PaintOutcome::kPainted:
      canvas_->drawOval(oval, paint);
      break;
    case PaintOutcome::kUnresolved:
      ++unresolved_paints_;
      break;
    case PaintOutcome::kNothing:
      break;
  }

  SkPaint stroke_paint;
  switch (BuildStrokePaint(node.stroke, node.opacity, node.blend_mode, oval, &stroke_paint)) {
    case PaintOutcome::kPainted:
      canvas_->drawOval(oval, stroke_paint);
      break;
    case PaintOutcome::kUnresolved:
      ++unresolved_paints_;
      break;
    case PaintOutcome::kNothing:
      break;
  }
}

void SkiaRenderer::DrawPath(const PathNode& node) {
  SkPath path;
  if (!SkParsePath::FromSVGString(node.d.c_str(), &path)) {
    // Report rather than silently drawing nothing.
    ++unparsable_paths_;
    return;
  }

  // A gradient in objectBoundingBox units needs the path's real extents, which
  // is exactly what Skia already computed while building the path.
  const SkRect bounds = path.computeTightBounds();

  SkPaint paint;
  switch (BuildFillPaint(node.fill, node.opacity, node.blend_mode, bounds, &paint)) {
    case PaintOutcome::kPainted:
      canvas_->drawPath(path, paint);
      break;
    case PaintOutcome::kUnresolved:
      ++unresolved_paints_;
      break;
    case PaintOutcome::kNothing:
      break;
  }

  SkPaint stroke_paint;
  switch (BuildStrokePaint(node.stroke, node.opacity, node.blend_mode, bounds, &stroke_paint)) {
    case PaintOutcome::kPainted:
      canvas_->drawPath(path, stroke_paint);
      break;
    case PaintOutcome::kUnresolved:
      ++unresolved_paints_;
      break;
    case PaintOutcome::kNothing:
      break;
  }
}

void SkiaRenderer::DrawText(const TextNode& node) {
  if (fonts_ == nullptr || node.content.empty()) {
    if (fonts_ == nullptr) {
      ++unresolved_text_;
    }
    return;
  }
  if (node.fill.kind == Paint::Kind::kNone) {
    // Nothing to paint with; not an error.
    return;
  }

  TextMetrics metrics;
  if (!fonts_->Measure(node, &metrics)) {
    // No resolvable font. Counted, never substituted: a different font would
    // produce metrics that disagree with the exported SVG.
    ++unresolved_text_;
    return;
  }

  // SVG anchors text around an explicit origin and positions it by BASELINE,
  // whereas a paragraph draws from its top-left corner. Convert here so text
  // lands exactly where the canonical SVG places it.
  const double anchor_offset = node.align == TextAlign::kCenter ? -metrics.width / 2.0
                             : node.align == TextAlign::kRight  ? -metrics.width
                                                                : 0.0;
  const SkScalar left = static_cast<SkScalar>(node.x + anchor_offset);
  const SkScalar top = static_cast<SkScalar>(node.y - metrics.first_line_ascent);
  // The shaped block is the object bounding box a gradient maps onto.
  const SkRect text_bounds = SkRect::MakeXYWH(left, top, static_cast<SkScalar>(metrics.width),
                                              static_cast<SkScalar>(metrics.height));

  ParagraphStyle paragraph_style = MakeParagraphStyle(*fonts_, node);
  TextStyle text_style = paragraph_style.getTextStyle();

  SkPaint fill_paint;
  if (ConfigurePaint(node.fill, node.opacity, node.blend_mode, text_bounds, &fill_paint)
      != PaintOutcome::kPainted) {
    ++unresolved_paints_;
    return;
  }
  fill_paint.setStyle(SkPaint::kFill_Style);
  text_style.setForegroundColor(fill_paint);

  if (node.decoration != TextDecoration::kNone) {
    bool approximated = false;
    const SkColor decoration_color = DecorationColor(node.fill, node.opacity, &approximated);
    // skparagraph resolves the decoration colour from `getColor()`, which is
    // independent of the foreground paint and defaults to white. Setting it
    // explicitly is what keeps an underline the same colour as its text.
    text_style.setDecorationColor(decoration_color);
    text_style.setColor(decoration_color);
    if (approximated) {
      ++approximated_paints_;
    }
  }

  paragraph_style.setTextStyle(text_style);

  std::unique_ptr<ParagraphBuilder> builder =
      ParagraphBuilder::make(paragraph_style, FontRegistryAccess::Collection(*fonts_),
                             FontRegistryAccess::Unicode(*fonts_));
  if (builder == nullptr) {
    ++unresolved_text_;
    return;
  }
  builder->addText(node.content.c_str(), node.content.size());
  std::unique_ptr<Paragraph> paragraph = builder->Build();
  if (paragraph == nullptr) {
    ++unresolved_text_;
    return;
  }
  paragraph->layout(kUnboundedLayoutWidth);

  paragraph->paint(canvas_, left, top);
}

void SkiaRenderer::BeginLayer(const GroupNode& node, double alpha, BlendMode blend_mode) {
  (void)node;
  const double clamped = alpha < 0.0 ? 0.0 : (alpha > 1.0 ? 1.0 : alpha);

  SkPaint layer_paint;
  layer_paint.setAlphaf(static_cast<float>(clamped));
  layer_paint.setBlendMode(ToSkBlendMode(blend_mode));
  // saveLayer composites the children offscreen first, so the alpha and blend
  // mode apply to the composed result instead of to each child separately.
  canvas_->saveLayer(nullptr, &layer_paint);
}

void SkiaRenderer::EndLayer() { canvas_->restore(); }

}  // namespace pydee
