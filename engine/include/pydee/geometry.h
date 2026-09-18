// geometry.h — 2D affine transform math for the Pydee engine.
//
// This is the C++ mirror of frontend/src/editor/renderer/matrix2d.ts and MUST
// keep identical semantics, including the composition convention:
//
//   multiply(outer, inner) applies `inner` to the point first.
//
// If the two diverge, a click will resolve to a different object than the one
// that was painted. The engine's unit tests assert the same cases the
// TypeScript tests assert, so a divergence fails the build rather than
// producing a subtle interaction bug.
//
// Component order matches SVG/Skia:
//
//   x' = a*x + c*y + e
//   y' = b*x + d*y + f
//
// One responsibility per file: affine transform mathematics.

#ifndef PYDEE_GEOMETRY_H_
#define PYDEE_GEOMETRY_H_

#include <optional>

namespace pydee {

struct Matrix2D {
  double a = 1.0;
  double b = 0.0;
  double c = 0.0;
  double d = 1.0;
  double e = 0.0;
  double f = 0.0;
};

struct Point2D {
  double x = 0.0;
  double y = 0.0;
};

struct RectF {
  double x = 0.0;
  double y = 0.0;
  double width = 0.0;
  double height = 0.0;
};

// Identity transform.
Matrix2D Identity();

// Composition: `inner` is applied to the point first, then `outer`.
Matrix2D Multiply(const Matrix2D& outer, const Matrix2D& inner);

Matrix2D Translation(double tx, double ty);
Matrix2D Scaling(double sx, double sy);

// Rotation in degrees about (cx, cy), matching SVG rotate(a cx cy).
Matrix2D Rotation(double degrees, double cx = 0.0, double cy = 0.0);

Matrix2D SkewX(double degrees);
Matrix2D SkewY(double degrees);

// Returns nullopt for a singular or non-finite matrix so callers can skip
// degenerate nodes instead of propagating NaN.
std::optional<Matrix2D> Invert(const Matrix2D& m);

bool IsFinite(const Matrix2D& m);
bool IsIdentity(const Matrix2D& m, double epsilon = 1e-9);

Point2D TransformPoint(const Matrix2D& m, const Point2D& point);

// Axis-aligned bounding box of the transformed rectangle corners.
RectF TransformRect(const Matrix2D& m, const RectF& rect);

RectF UnionRect(const RectF& first, const RectF& second);
bool RectContainsPoint(const RectF& rect, const Point2D& point);
bool RectIntersects(const RectF& first, const RectF& second);
RectF InflateRect(const RectF& rect, double amount);

// Largest scale factor applied in any direction. Used to convert padding
// between world and local space conservatively.
double MaxAxisScale(const Matrix2D& m);

}  // namespace pydee

#endif  // PYDEE_GEOMETRY_H_
