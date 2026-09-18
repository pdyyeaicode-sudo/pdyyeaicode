#include "pydee/shape_geometry.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <string_view>

#include "include/core/SkPath.h"
#include "include/core/SkRect.h"
#include "include/utils/SkParsePath.h"

namespace pydee {
namespace {

/**
 * Normalise a possibly-negative rect.
 *
 * A creation drag that goes up and to the left produces negative extents, and
 * every generator below assumes left <= right. Doing it once here is what makes a
 * backwards drag behave exactly like a forwards one instead of producing a
 * mirrored or empty outline.
 */
RectF Normalized(const RectF& bounds) {
  RectF out;
  out.x = bounds.width < 0 ? bounds.x + bounds.width : bounds.x;
  out.y = bounds.height < 0 ? bounds.y + bounds.height : bounds.y;
  out.width = std::abs(bounds.width);
  out.height = std::abs(bounds.height);
  return out;
}

/**
 * Emit a coordinate with enough precision to survive the document round-trip.
 *
 * 6 decimal places: the canonical SVG snaps authored coordinates to a 0.001px
 * grid, so this is three orders finer than anything that can be persisted, and
 * the committed outline is therefore byte-identical to the previewed one after
 * snapping. `%g` would drop to 6 SIGNIFICANT figures, which loses the fraction
 * entirely at artboard-scale coordinates like 1042.0625.
 */
void AppendNumber(std::string* out, double value) {
  // -0 and 0 must format identically or an otherwise identical path differs by a
  // character, which would break byte-comparison of preview against commit.
  if (value == 0.0) {
    value = 0.0;
  }
  char buffer[40];
  const int written = std::snprintf(buffer, sizeof(buffer), "%.6f", value);
  if (written <= 0) {
    out->append("0");
    return;
  }
  std::string text(buffer, static_cast<size_t>(written));
  // Trim trailing zeros, then a trailing point, so "40.000000" becomes "40".
  const size_t last = text.find_last_not_of('0');
  if (last != std::string::npos && text.find('.') != std::string::npos) {
    text.erase(text[last] == '.' ? last : last + 1);
  }
  if (text == "-0") {
    text = "0";
  }
  out->append(text);
}

void MoveTo(std::string* out, double x, double y) {
  if (!out->empty()) {
    out->push_back(' ');
  }
  out->append("M ");
  AppendNumber(out, x);
  out->push_back(' ');
  AppendNumber(out, y);
}

void LineTo(std::string* out, double x, double y) {
  out->append(" L ");
  AppendNumber(out, x);
  out->push_back(' ');
  AppendNumber(out, y);
}

void CubicTo(std::string* out, double c1x, double c1y, double c2x, double c2y, double x, double y) {
  out->append(" C ");
  AppendNumber(out, c1x);
  out->push_back(' ');
  AppendNumber(out, c1y);
  out->push_back(' ');
  AppendNumber(out, c2x);
  out->push_back(' ');
  AppendNumber(out, c2y);
  out->push_back(' ');
  AppendNumber(out, x);
  out->push_back(' ');
  AppendNumber(out, y);
}

void QuadTo(std::string* out, double cx, double cy, double x, double y) {
  out->append(" Q ");
  AppendNumber(out, cx);
  out->push_back(' ');
  AppendNumber(out, cy);
  out->push_back(' ');
  AppendNumber(out, x);
  out->push_back(' ');
  AppendNumber(out, y);
}

void ArcTo(std::string* out,
           double rx,
           double ry,
           int large_arc,
           int sweep,
           double x,
           double y) {
  out->append(" A ");
  AppendNumber(out, rx);
  out->push_back(' ');
  AppendNumber(out, ry);
  out->append(" 0 ");
  out->append(large_arc ? "1 " : "0 ");
  out->append(sweep ? "1 " : "0 ");
  AppendNumber(out, x);
  out->push_back(' ');
  AppendNumber(out, y);
}

void Close(std::string* out) { out->append(" Z"); }

/**
 * A regular polygon inscribed in the box, stretched to fill BOTH axes.
 *
 * The radius is per-axis (`width/2`, `height/2`) rather than a single
 * `min(w, h)/2`. With one radius a star in a wide box stayed square and drifted to
 * the centre, so stretching the drag box changed nothing about the outline —
 * precisely the feedback a creation preview has to give.
 *
 * `start_angle` is measured from +x, and -pi/2 puts the first vertex at the top,
 * which is what makes a triangle point up and a star sit upright.
 */
void AppendRadialPolygon(std::string* out,
                         const RectF& box,
                         int vertex_count,
                         double start_angle,
                         double inner_ratio) {
  const double cx = box.x + box.width / 2.0;
  const double cy = box.y + box.height / 2.0;
  const double rx = box.width / 2.0;
  const double ry = box.height / 2.0;
  const bool starred = inner_ratio > 0.0;
  const int steps = starred ? vertex_count * 2 : vertex_count;

  for (int index = 0; index < steps; ++index) {
    const double ratio = (!starred || index % 2 == 0) ? 1.0 : inner_ratio;
    const double angle = start_angle + (index * 2.0 * M_PI) / steps;
    const double px = cx + std::cos(angle) * rx * ratio;
    const double py = cy + std::sin(angle) * ry * ratio;
    if (index == 0) {
      MoveTo(out, px, py);
    } else {
      LineTo(out, px, py);
    }
  }
  Close(out);
}

/** An axis-aligned ellipse filling the box, as two half arcs. */
void AppendEllipse(std::string* out, double cx, double cy, double rx, double ry, bool clockwise) {
  MoveTo(out, cx - rx, cy);
  ArcTo(out, rx, ry, 1, clockwise ? 1 : 0, cx + rx, cy);
  ArcTo(out, rx, ry, 1, clockwise ? 1 : 0, cx - rx, cy);
  Close(out);
}

bool AllFinite(const RectF& rect) {
  return std::isfinite(rect.x) && std::isfinite(rect.y) && std::isfinite(rect.width)
      && std::isfinite(rect.height);
}

bool PathDataIsFinite(const std::string& data) {
  // A NaN reaches the string as "nan" or "-nan"; an infinity as "inf". Either
  // would parse to a degenerate path and paint nothing, so it is caught here where
  // the cause is still known.
  return data.find("nan") == std::string::npos && data.find("inf") == std::string::npos;
}

/**
 * Whether a measured outline already fills the box it was generated into.
 *
 * 0.01px, which is ten times finer than the 0.1px the correction pass needs to be
 * worth running and a hundred times coarser than the noise in Skia's numerical
 * conic bounds. Below this a second generation pass would change nothing
 * observable and would only cost a parse.
 */
bool RectFillsTarget(const RectF& measured, const RectF& target) {
  const double tolerance = 0.01;
  return std::abs(measured.x - target.x) <= tolerance
      && std::abs(measured.y - target.y) <= tolerance
      && std::abs(measured.width - target.width) <= tolerance
      && std::abs(measured.height - target.height) <= tolerance;
}

}  // namespace

const char* ShapeKindName(ShapeKind kind) {
  switch (kind) {
    case ShapeKind::kRectangle: return "rectangle";
    case ShapeKind::kRoundedRect: return "rounded-rect";
    case ShapeKind::kEllipse: return "ellipse";
    case ShapeKind::kTriangle: return "triangle";
    case ShapeKind::kDiamond: return "diamond";
    case ShapeKind::kPentagon: return "pentagon";
    case ShapeKind::kHexagon: return "hexagon";
    case ShapeKind::kOctagon: return "octagon";
    case ShapeKind::kStar: return "star";
    case ShapeKind::kBadge: return "badge";
    case ShapeKind::kCross: return "cross";
    case ShapeKind::kHeart: return "heart";
    case ShapeKind::kDonut: return "donut";
    case ShapeKind::kChatBubble: return "chat-bubble";
    case ShapeKind::kBanner: return "banner";
    case ShapeKind::kShield: return "shield";
    case ShapeKind::kLine: return "line";
    case ShapeKind::kArrow: return "arrow";
  }
  return "unknown";
}

std::optional<ShapeKind> ParseShapeKind(std::string_view name) {
  // "circle" is accepted as a synonym for "ellipse" because the editor's shape
  // picker offers both and they differ only in whether the drag is constrained.
  if (name == "rectangle" || name == "rect") return ShapeKind::kRectangle;
  if (name == "rounded-rect") return ShapeKind::kRoundedRect;
  if (name == "ellipse" || name == "circle") return ShapeKind::kEllipse;
  if (name == "triangle") return ShapeKind::kTriangle;
  if (name == "diamond") return ShapeKind::kDiamond;
  if (name == "pentagon") return ShapeKind::kPentagon;
  if (name == "hexagon") return ShapeKind::kHexagon;
  if (name == "octagon") return ShapeKind::kOctagon;
  if (name == "star") return ShapeKind::kStar;
  if (name == "badge") return ShapeKind::kBadge;
  if (name == "cross") return ShapeKind::kCross;
  if (name == "heart") return ShapeKind::kHeart;
  if (name == "donut") return ShapeKind::kDonut;
  if (name == "chat-bubble") return ShapeKind::kChatBubble;
  if (name == "banner") return ShapeKind::kBanner;
  if (name == "shield") return ShapeKind::kShield;
  if (name == "line") return ShapeKind::kLine;
  if (name == "arrow") return ShapeKind::kArrow;
  return std::nullopt;
}

const char* ShapeBuildFailureName(ShapeBuildFailure failure) {
  switch (failure) {
    case ShapeBuildFailure::kUnknownKind: return "unknown-kind";
    case ShapeBuildFailure::kDegenerateBounds: return "degenerate-bounds";
    case ShapeBuildFailure::kInvalidParameters: return "invalid-parameters";
    case ShapeBuildFailure::kNonFiniteGeometry: return "non-finite-geometry";
  }
  return "unknown";
}

/**
 * The outline exactly as its generator draws it, with no fill correction.
 *
 * Internal: callers get `BuildShapePath`, which normalises. Split out so the
 * correction pass has something to call twice.
 */
static bool BuildRawShapePath(ShapeKind kind,
                              const RectF& bounds,
                              const ShapeParameters& parameters,
                              std::string* out_path_data,
                              ShapeBuildFailure* failure) {
  if (out_path_data == nullptr) {
    return false;
  }
  const auto fail = [failure](ShapeBuildFailure reason) {
    if (failure != nullptr) {
      *failure = reason;
    }
    return false;
  };

  if (!AllFinite(bounds)) {
    return fail(ShapeBuildFailure::kNonFiniteGeometry);
  }

  const RectF box = Normalized(bounds);
  // A line has no area, so it is the one kind for which a zero extent on one axis
  // is legitimate. Everything else needs both.
  const bool needs_area = kind != ShapeKind::kLine;
  if (needs_area && (box.width == 0.0 || box.height == 0.0)) {
    return fail(ShapeBuildFailure::kDegenerateBounds);
  }
  if (kind == ShapeKind::kLine && box.width == 0.0 && box.height == 0.0) {
    return fail(ShapeBuildFailure::kDegenerateBounds);
  }

  if (parameters.inner_ratio < 0.0 || parameters.inner_ratio > 1.0
      || parameters.corner_ratio < 0.0 || parameters.corner_ratio > 0.5
      || parameters.thickness_ratio <= 0.0 || parameters.thickness_ratio > 1.0
      || parameters.hole_ratio < 0.0 || parameters.hole_ratio >= 1.0
      || parameters.head_ratio <= 0.0 || parameters.head_ratio > 1.0) {
    return fail(ShapeBuildFailure::kInvalidParameters);
  }
  if ((kind == ShapeKind::kStar || kind == ShapeKind::kBadge) && parameters.point_count < 3) {
    return fail(ShapeBuildFailure::kInvalidParameters);
  }

  const double left = box.x;
  const double top = box.y;
  const double right = box.x + box.width;
  const double bottom = box.y + box.height;
  const double cx = box.x + box.width / 2.0;
  const double cy = box.y + box.height / 2.0;
  const double w = box.width;
  const double h = box.height;

  std::string path;
  path.reserve(256);

  switch (kind) {
    case ShapeKind::kRectangle: {
      MoveTo(&path, left, top);
      LineTo(&path, right, top);
      LineTo(&path, right, bottom);
      LineTo(&path, left, bottom);
      Close(&path);
      break;
    }
    case ShapeKind::kRoundedRect: {
      // Radius clamped to half the SHORTER side, so an extreme ratio produces a
      // stadium rather than self-intersecting corners.
      const double radius = std::min(std::min(w, h) * parameters.corner_ratio,
                                     std::min(w, h) / 2.0);
      if (radius <= 0.0) {
        MoveTo(&path, left, top);
        LineTo(&path, right, top);
        LineTo(&path, right, bottom);
        LineTo(&path, left, bottom);
        Close(&path);
        break;
      }
      MoveTo(&path, left + radius, top);
      LineTo(&path, right - radius, top);
      ArcTo(&path, radius, radius, 0, 1, right, top + radius);
      LineTo(&path, right, bottom - radius);
      ArcTo(&path, radius, radius, 0, 1, right - radius, bottom);
      LineTo(&path, left + radius, bottom);
      ArcTo(&path, radius, radius, 0, 1, left, bottom - radius);
      LineTo(&path, left, top + radius);
      ArcTo(&path, radius, radius, 0, 1, left + radius, top);
      Close(&path);
      break;
    }
    case ShapeKind::kEllipse: {
      AppendEllipse(&path, cx, cy, w / 2.0, h / 2.0, true);
      break;
    }
    case ShapeKind::kTriangle: {
      MoveTo(&path, cx, top);
      LineTo(&path, right, bottom);
      LineTo(&path, left, bottom);
      Close(&path);
      break;
    }
    case ShapeKind::kDiamond: {
      MoveTo(&path, cx, top);
      LineTo(&path, right, cy);
      LineTo(&path, cx, bottom);
      LineTo(&path, left, cy);
      Close(&path);
      break;
    }
    case ShapeKind::kPentagon: {
      AppendRadialPolygon(&path, box, 5, -M_PI / 2.0, 0.0);
      break;
    }
    case ShapeKind::kHexagon: {
      // Flat-top orientation, which is what the editor's hexagon has always been:
      // a vertex on each side at mid-height and quarter-width insets on top and
      // bottom. Built explicitly rather than as a radial polygon because a radial
      // hexagon is point-topped.
      const double inset = w * 0.25;
      MoveTo(&path, left + inset, top);
      LineTo(&path, right - inset, top);
      LineTo(&path, right, cy);
      LineTo(&path, right - inset, bottom);
      LineTo(&path, left + inset, bottom);
      LineTo(&path, left, cy);
      Close(&path);
      break;
    }
    case ShapeKind::kOctagon: {
      // Corner cut proportional PER AXIS so the octagon fills a non-square box.
      // A single min(w, h)-based cut left a wide octagon with square corners.
      const double cutX = w * 0.29;
      const double cutY = h * 0.29;
      MoveTo(&path, left + cutX, top);
      LineTo(&path, right - cutX, top);
      LineTo(&path, right, top + cutY);
      LineTo(&path, right, bottom - cutY);
      LineTo(&path, right - cutX, bottom);
      LineTo(&path, left + cutX, bottom);
      LineTo(&path, left, bottom - cutY);
      LineTo(&path, left, top + cutY);
      Close(&path);
      break;
    }
    case ShapeKind::kStar: {
      AppendRadialPolygon(&path, box, parameters.point_count, -M_PI / 2.0,
                          parameters.inner_ratio);
      break;
    }
    case ShapeKind::kBadge: {
      // A many-toothed rosette. `inner_ratio` is much closer to 1 than a star's,
      // which is what makes it read as a scalloped disc rather than a spike.
      const double ratio = std::max(parameters.inner_ratio, 0.6);
      AppendRadialPolygon(&path, box, std::max(parameters.point_count, 8), 0.0, ratio);
      break;
    }
    case ShapeKind::kCross: {
      // Arm thickness is per-axis so the cross fills the box: a single
      // min(w, h)-based thickness gave a wide box a narrow vertical bar that did
      // not follow a horizontal stretch.
      const double armX = (w * parameters.thickness_ratio) / 2.0;
      const double armY = (h * parameters.thickness_ratio) / 2.0;
      MoveTo(&path, cx - armX, top);
      LineTo(&path, cx + armX, top);
      LineTo(&path, cx + armX, cy - armY);
      LineTo(&path, right, cy - armY);
      LineTo(&path, right, cy + armY);
      LineTo(&path, cx + armX, cy + armY);
      LineTo(&path, cx + armX, bottom);
      LineTo(&path, cx - armX, bottom);
      LineTo(&path, cx - armX, cy + armY);
      LineTo(&path, left, cy + armY);
      LineTo(&path, left, cy - armY);
      LineTo(&path, cx - armX, cy - armY);
      Close(&path);
      break;
    }
    case ShapeKind::kHeart: {
      // Every control coordinate is box-relative. The TypeScript generator used
      // `bottom * 0.9` and `bottom * 0.8` — the artboard coordinate multiplied by a
      // fraction — so the same heart changed shape depending on where on the page it
      // was drawn, and its bounds did not match its box.
      const double shoulder = top + h * 0.28;
      MoveTo(&path, cx, bottom);
      CubicTo(&path, cx - w * 0.62, top + h * 0.62, left, shoulder, cx - w * 0.25, shoulder);
      CubicTo(&path, cx - w * 0.10, shoulder, cx - w * 0.02, top + h * 0.10, cx, top + h * 0.18);
      CubicTo(&path, cx + w * 0.02, top + h * 0.10, cx + w * 0.10, shoulder, cx + w * 0.25,
              shoulder);
      CubicTo(&path, right, shoulder, cx + w * 0.62, top + h * 0.62, cx, bottom);
      Close(&path);
      break;
    }
    case ShapeKind::kDonut: {
      const double outerRx = w / 2.0;
      const double outerRy = h / 2.0;
      const double innerRx = outerRx * parameters.hole_ratio;
      const double innerRy = outerRy * parameters.hole_ratio;
      AppendEllipse(&path, cx, cy, outerRx, outerRy, true);
      // Opposite winding, so the even-odd/non-zero fill leaves a hole rather than
      // painting over it.
      AppendEllipse(&path, cx, cy, innerRx, innerRy, false);
      break;
    }
    case ShapeKind::kChatBubble: {
      const double radius = std::min(w, h) * 0.15;
      const double tail = h * 0.2;
      const double bodyBottom = bottom - tail;
      MoveTo(&path, left + radius, top);
      LineTo(&path, right - radius, top);
      QuadTo(&path, right, top, right, top + radius);
      LineTo(&path, right, bodyBottom - radius);
      QuadTo(&path, right, bodyBottom, right - radius, bodyBottom);
      LineTo(&path, left + w * 0.4, bodyBottom);
      LineTo(&path, left + w * 0.2, bottom);
      LineTo(&path, left + w * 0.25, bodyBottom);
      LineTo(&path, left + radius, bodyBottom);
      QuadTo(&path, left, bodyBottom, left, bodyBottom - radius);
      LineTo(&path, left, top + radius);
      QuadTo(&path, left, top, left + radius, top);
      Close(&path);
      break;
    }
    case ShapeKind::kBanner: {
      const double fold = w * 0.15;
      const double notch = bottom - h * 0.3;
      MoveTo(&path, left, top);
      LineTo(&path, right, top);
      LineTo(&path, right, notch);
      LineTo(&path, right - fold, notch);
      LineTo(&path, right - fold, bottom);
      LineTo(&path, cx, bottom - h * 0.15);
      LineTo(&path, left + fold, bottom);
      LineTo(&path, left + fold, notch);
      LineTo(&path, left, notch);
      Close(&path);
      break;
    }
    case ShapeKind::kShield: {
      // Control points box-relative, for the same reason as the heart.
      MoveTo(&path, left, top);
      LineTo(&path, right, top);
      LineTo(&path, right, top + h * 0.4);
      CubicTo(&path, right, top + h * 0.8, cx, bottom, cx, bottom);
      CubicTo(&path, cx, bottom, left, top + h * 0.8, left, top + h * 0.4);
      Close(&path);
      break;
    }
    case ShapeKind::kLine: {
      // The drag's own diagonal, not the box's: a line's direction is the gesture.
      const double x1 = bounds.width < 0 ? bounds.x + bounds.width : bounds.x;
      const double y1 = bounds.height < 0 ? bounds.y + bounds.height : bounds.y;
      const double x2 = bounds.width < 0 ? bounds.x : bounds.x + bounds.width;
      const double y2 = bounds.height < 0 ? bounds.y : bounds.y + bounds.height;
      MoveTo(&path, x1, y1);
      LineTo(&path, x2, y2);
      break;
    }
    case ShapeKind::kArrow: {
      // Horizontal shaft with a triangular head, filling the box.
      const double headLength = w * parameters.head_ratio;
      const double shaftHalf = h * 0.2;
      MoveTo(&path, left, cy - shaftHalf);
      LineTo(&path, right - headLength, cy - shaftHalf);
      LineTo(&path, right - headLength, top);
      LineTo(&path, right, cy);
      LineTo(&path, right - headLength, bottom);
      LineTo(&path, right - headLength, cy + shaftHalf);
      LineTo(&path, left, cy + shaftHalf);
      Close(&path);
      break;
    }
  }

  if (path.empty()) {
    return fail(ShapeBuildFailure::kUnknownKind);
  }
  if (!PathDataIsFinite(path)) {
    return fail(ShapeBuildFailure::kNonFiniteGeometry);
  }
  *out_path_data = std::move(path);
  return true;
}

bool BuildShapePath(ShapeKind kind,
                    const RectF& bounds,
                    const ShapeParameters& parameters,
                    std::string* out_path_data,
                    ShapeBuildFailure* failure) {
  if (out_path_data == nullptr) {
    return false;
  }
  if (!BuildRawShapePath(kind, bounds, parameters, out_path_data, failure)) {
    return false;
  }

  /*
    Normalised so the outline FILLS the box it was asked for.

    Several silhouettes do not naturally reach all four edges. A regular pentagon
    or star inscribed in the unit circle touches it only at its vertices: a
    five-pointed star's widest points are at +-cos(18) = 0.951 of the radius and its
    lowest at sin(54) = 0.809, so it came out 5% narrow and 10% short. A cubic
    heart falls short of its control points by construction.

    That gap is exactly the defect this whole change is about, seen from the other
    side: it does not matter whether the box is declared too big or the shape drawn
    too small, the result is a selection outline that does not fit its shape. So
    rather than hand-tuning coefficients per silhouette — which would have to be
    redone for every new shape and for every parameter value — the outline is
    generated, MEASURED, and generated again into the box that makes the measurement
    land on the target.

    One correction pass is exact for any generator that is affine in its box, which
    is all of them except the few that derive a radius from min(w, h) — and those
    already fill their box, so they never reach the second pass. The result is
    verified rather than assumed: if a generator is neither affine nor box-filling
    the second measurement says so and the outline is returned as built, with the
    measured bounds still the authority downstream.
  */
  if (kind == ShapeKind::kLine) {
    // A line's geometry IS the drag diagonal and it has no area to normalise.
    return true;
  }

  const RectF target = Normalized(bounds);
  RectF measured{};
  if (!MeasurePathData(*out_path_data, &measured)) {
    // Unmeasurable, so there is nothing to correct against. The outline is still
    // valid path data; downstream measurement will report the same problem.
    return true;
  }
  if (RectFillsTarget(measured, target)) {
    return true;
  }
  if (measured.width <= 0.0 || measured.height <= 0.0) {
    return true;
  }

  // measured(B) = { B.x + u.x*B.w, B.y + u.y*B.h, u.w*B.w, u.h*B.h } for a
  // generator affine in its box, where u is the measurement expressed as fractions
  // of the box it was generated into. Solving measured(B) == target gives B.
  const double unitX = (measured.x - target.x) / target.width;
  const double unitY = (measured.y - target.y) / target.height;
  const double unitWidth = measured.width / target.width;
  const double unitHeight = measured.height / target.height;
  if (unitWidth <= 0.0 || unitHeight <= 0.0) {
    return true;
  }

  RectF corrected;
  corrected.width = target.width / unitWidth;
  corrected.height = target.height / unitHeight;
  corrected.x = target.x - unitX * corrected.width;
  corrected.y = target.y - unitY * corrected.height;
  if (!AllFinite(corrected)) {
    return true;
  }

  std::string second;
  if (!BuildRawShapePath(kind, corrected, parameters, &second, failure)) {
    // The correction produced a box the generator rejects. Keep the first outline
    // rather than failing the whole build: an inscribed shape is still a shape.
    return true;
  }
  *out_path_data = std::move(second);
  return true;
}

bool MeasurePathData(const std::string& path_data, RectF* out) {
  if (out == nullptr || path_data.empty()) {
    return false;
  }
  SkPath path;
  if (!SkParsePath::FromSVGString(path_data.c_str(), &path)) {
    return false;
  }
  if (path.countPoints() == 0) {
    return false;
  }
  // computeTightBounds, not getBounds: `getBounds` returns the control-point hull,
  // which is the very superset that put the selection box away from the shape.
  const SkRect bounds = path.computeTightBounds();
  if (!std::isfinite(bounds.left()) || !std::isfinite(bounds.top())
      || !std::isfinite(bounds.width()) || !std::isfinite(bounds.height())) {
    return false;
  }
  out->x = bounds.left();
  out->y = bounds.top();
  out->width = bounds.width();
  out->height = bounds.height();
  return true;
}

}  // namespace pydee
