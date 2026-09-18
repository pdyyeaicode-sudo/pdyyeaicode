// geometry.cpp — implementation of the engine's affine transform math.
//
// Kept numerically identical to matrix2d.ts. See geometry.h for the rationale.

#include "pydee/geometry.h"

#include <algorithm>
#include <cmath>
#include <limits>

namespace pydee {
namespace {

constexpr double kDegToRad = 3.14159265358979323846 / 180.0;

bool AllFinite(double a, double b, double c, double d, double e, double f) {
  return std::isfinite(a) && std::isfinite(b) && std::isfinite(c)
      && std::isfinite(d) && std::isfinite(e) && std::isfinite(f);
}

}  // namespace

Matrix2D Identity() { return Matrix2D{}; }

Matrix2D Multiply(const Matrix2D& outer, const Matrix2D& inner) {
  Matrix2D result;
  result.a = outer.a * inner.a + outer.c * inner.b;
  result.b = outer.b * inner.a + outer.d * inner.b;
  result.c = outer.a * inner.c + outer.c * inner.d;
  result.d = outer.b * inner.c + outer.d * inner.d;
  result.e = outer.a * inner.e + outer.c * inner.f + outer.e;
  result.f = outer.b * inner.e + outer.d * inner.f + outer.f;
  return result;
}

Matrix2D Translation(double tx, double ty) {
  Matrix2D m;
  m.e = tx;
  m.f = ty;
  return m;
}

Matrix2D Scaling(double sx, double sy) {
  Matrix2D m;
  m.a = sx;
  m.d = sy;
  return m;
}

Matrix2D Rotation(double degrees, double cx, double cy) {
  const double radians = degrees * kDegToRad;
  const double cos_value = std::cos(radians);
  const double sin_value = std::sin(radians);

  Matrix2D core;
  core.a = cos_value;
  core.b = sin_value;
  core.c = -sin_value;
  core.d = cos_value;

  if (cx == 0.0 && cy == 0.0) {
    return core;
  }
  return Multiply(Multiply(Translation(cx, cy), core), Translation(-cx, -cy));
}

Matrix2D SkewX(double degrees) {
  Matrix2D m;
  m.c = std::tan(degrees * kDegToRad);
  return m;
}

Matrix2D SkewY(double degrees) {
  Matrix2D m;
  m.b = std::tan(degrees * kDegToRad);
  return m;
}

std::optional<Matrix2D> Invert(const Matrix2D& m) {
  if (!IsFinite(m)) {
    return std::nullopt;
  }
  const double determinant = m.a * m.d - m.b * m.c;
  if (determinant == 0.0 || !std::isfinite(determinant)) {
    return std::nullopt;
  }
  const double inv = 1.0 / determinant;

  Matrix2D result;
  result.a = m.d * inv;
  result.b = -m.b * inv;
  result.c = -m.c * inv;
  result.d = m.a * inv;
  result.e = (m.c * m.f - m.d * m.e) * inv;
  result.f = (m.b * m.e - m.a * m.f) * inv;
  return result;
}

bool IsFinite(const Matrix2D& m) { return AllFinite(m.a, m.b, m.c, m.d, m.e, m.f); }

bool IsIdentity(const Matrix2D& m, double epsilon) {
  return std::abs(m.a - 1.0) <= epsilon && std::abs(m.b) <= epsilon
      && std::abs(m.c) <= epsilon && std::abs(m.d - 1.0) <= epsilon
      && std::abs(m.e) <= epsilon && std::abs(m.f) <= epsilon;
}

Point2D TransformPoint(const Matrix2D& m, const Point2D& point) {
  return Point2D{m.a * point.x + m.c * point.y + m.e,
                 m.b * point.x + m.d * point.y + m.f};
}

RectF TransformRect(const Matrix2D& m, const RectF& rect) {
  const Point2D corners[4] = {
      TransformPoint(m, Point2D{rect.x, rect.y}),
      TransformPoint(m, Point2D{rect.x + rect.width, rect.y}),
      TransformPoint(m, Point2D{rect.x + rect.width, rect.y + rect.height}),
      TransformPoint(m, Point2D{rect.x, rect.y + rect.height}),
  };

  double min_x = std::numeric_limits<double>::infinity();
  double min_y = std::numeric_limits<double>::infinity();
  double max_x = -std::numeric_limits<double>::infinity();
  double max_y = -std::numeric_limits<double>::infinity();
  for (const Point2D& corner : corners) {
    min_x = std::min(min_x, corner.x);
    min_y = std::min(min_y, corner.y);
    max_x = std::max(max_x, corner.x);
    max_y = std::max(max_y, corner.y);
  }
  return RectF{min_x, min_y, max_x - min_x, max_y - min_y};
}

RectF UnionRect(const RectF& first, const RectF& second) {
  const double min_x = std::min(first.x, second.x);
  const double min_y = std::min(first.y, second.y);
  const double max_x = std::max(first.x + first.width, second.x + second.width);
  const double max_y = std::max(first.y + first.height, second.y + second.height);
  return RectF{min_x, min_y, max_x - min_x, max_y - min_y};
}

bool RectContainsPoint(const RectF& rect, const Point2D& point) {
  return point.x >= rect.x && point.x <= rect.x + rect.width
      && point.y >= rect.y && point.y <= rect.y + rect.height;
}

bool RectIntersects(const RectF& first, const RectF& second) {
  return first.x <= second.x + second.width && second.x <= first.x + first.width
      && first.y <= second.y + second.height && second.y <= first.y + first.height;
}

RectF InflateRect(const RectF& rect, double amount) {
  if (amount == 0.0) {
    return rect;
  }
  return RectF{rect.x - amount, rect.y - amount, rect.width + amount * 2.0,
               rect.height + amount * 2.0};
}

double MaxAxisScale(const Matrix2D& m) {
  const double scale = std::max(std::hypot(m.a, m.b), std::hypot(m.c, m.d));
  return (std::isfinite(scale) && scale > 0.0) ? scale : 1.0;
}

}  // namespace pydee
