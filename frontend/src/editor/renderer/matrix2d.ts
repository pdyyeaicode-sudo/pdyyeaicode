/**
 * matrix2d — 2D affine transform math shared by every Pydee renderer backend.
 *
 * This is the single source of transform truth for the editor. Rendering,
 * bounds calculation, snapping and pointer hit-testing MUST all use these
 * helpers so a click resolves to exactly the object that was painted
 * (spec §5 "Transform system", §79 "Hit testing").
 *
 * Representation matches the SVG/Canvas 2D convention:
 *
 *   x' = a·x + c·y + e
 *   y' = b·x + d·y + f
 *
 * Composition convention: `multiply(outer, inner)` applies `inner` first, so a
 * child's world transform is `multiply(parentWorld, childLocal)`.
 *
 * Every function is pure and total: no globals, no DOM, no exceptions thrown
 * for malformed input. `parseSvgTransform` reports what it could not handle
 * instead of silently dropping it (AGENTS.md: no silent fallbacks).
 *
 * One responsibility per file: affine transform mathematics.
 */

/** A 2D affine matrix in SVG/Canvas component order. */
export interface Matrix2D {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

/** A point in some coordinate space (document, world, or screen). */
export interface Point2D {
  readonly x: number;
  readonly y: number;
}

/** An axis-aligned rectangle. Width/height are never negative. */
export interface RectF {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Result of decomposing a matrix back into editable transform channels. */
export interface DecomposedTransform {
  readonly translateX: number;
  readonly translateY: number;
  /** Rotation in degrees, clockwise-positive to match SVG `rotate()`. */
  readonly rotationDeg: number;
  readonly scaleX: number;
  readonly scaleY: number;
  /** Horizontal shear in degrees, matching SVG `skewX()`. */
  readonly skewXDeg: number;
}

/** Outcome of parsing an SVG `transform` attribute. */
export interface ParsedSvgTransform {
  readonly matrix: Matrix2D;
  /**
   * Transform functions that were recognised syntactically but could not be
   * applied (unknown name or wrong argument count). Callers should surface
   * these as diagnostics rather than pretending the transform was complete.
   */
  readonly unsupported: readonly string[];
}

export const IDENTITY: Matrix2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/** True when every component is finite (guards against NaN propagation). */
export function isFinite2D(m: Matrix2D): boolean {
  return (
    Number.isFinite(m.a)
    && Number.isFinite(m.b)
    && Number.isFinite(m.c)
    && Number.isFinite(m.d)
    && Number.isFinite(m.e)
    && Number.isFinite(m.f)
  );
}

/** True when `m` is (numerically) the identity matrix. */
export function isIdentity(m: Matrix2D, epsilon = 1e-9): boolean {
  return (
    Math.abs(m.a - 1) <= epsilon
    && Math.abs(m.b) <= epsilon
    && Math.abs(m.c) <= epsilon
    && Math.abs(m.d - 1) <= epsilon
    && Math.abs(m.e) <= epsilon
    && Math.abs(m.f) <= epsilon
  );
}

/**
 * Compose two matrices. `inner` is applied to the point first, then `outer`:
 * `transformPoint(multiply(o, i), p)` equals
 * `transformPoint(o, transformPoint(i, p))`.
 */
export function multiply(outer: Matrix2D, inner: Matrix2D): Matrix2D {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    e: outer.a * inner.e + outer.c * inner.f + outer.e,
    f: outer.b * inner.e + outer.d * inner.f + outer.f,
  };
}

/** Compose left-to-right in SVG order: the first entry is applied last. */
export function multiplyAll(matrices: readonly Matrix2D[]): Matrix2D {
  return matrices.reduce<Matrix2D>((acc, next) => multiply(acc, next), IDENTITY);
}

export function translation(tx: number, ty: number): Matrix2D {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

export function scaling(sx: number, sy: number): Matrix2D {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

/** Rotation in degrees about (`cx`, `cy`), matching SVG `rotate(a cx cy)`. */
export function rotation(degrees: number, cx = 0, cy = 0): Matrix2D {
  const radians = degrees * DEG_TO_RAD;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const core: Matrix2D = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
  if (cx === 0 && cy === 0) {
    return core;
  }
  return multiplyAll([translation(cx, cy), core, translation(-cx, -cy)]);
}

export function skewX(degrees: number): Matrix2D {
  return { a: 1, b: 0, c: Math.tan(degrees * DEG_TO_RAD), d: 1, e: 0, f: 0 };
}

export function skewY(degrees: number): Matrix2D {
  return { a: 1, b: Math.tan(degrees * DEG_TO_RAD), c: 0, d: 1, e: 0, f: 0 };
}

/**
 * Invert `m`, or return `null` when it is singular (zero-area) or non-finite.
 * Returning null rather than throwing lets hit-testing skip degenerate nodes.
 */
export function invert(m: Matrix2D): Matrix2D | null {
  if (!isFinite2D(m)) {
    return null;
  }
  const determinant = m.a * m.d - m.b * m.c;
  if (determinant === 0 || !Number.isFinite(determinant)) {
    return null;
  }
  const inverseDeterminant = 1 / determinant;
  return {
    a: m.d * inverseDeterminant,
    b: -m.b * inverseDeterminant,
    c: -m.c * inverseDeterminant,
    d: m.a * inverseDeterminant,
    e: (m.c * m.f - m.d * m.e) * inverseDeterminant,
    f: (m.b * m.e - m.a * m.f) * inverseDeterminant,
  };
}

export function transformPoint(m: Matrix2D, point: Point2D): Point2D {
  return {
    x: m.a * point.x + m.c * point.y + m.e,
    y: m.b * point.x + m.d * point.y + m.f,
  };
}

/**
 * Axis-aligned bounding box of `rect` after transformation. For rotated or
 * skewed matrices this is the AABB of the four transformed corners, which is
 * the correct conservative bound for culling and selection boxes.
 */
export function transformRect(m: Matrix2D, rect: RectF): RectF {
  const corners: readonly Point2D[] = [
    transformPoint(m, { x: rect.x, y: rect.y }),
    transformPoint(m, { x: rect.x + rect.width, y: rect.y }),
    transformPoint(m, { x: rect.x + rect.width, y: rect.y + rect.height }),
    transformPoint(m, { x: rect.x, y: rect.y + rect.height }),
  ];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const corner of corners) {
    minX = Math.min(minX, corner.x);
    minY = Math.min(minY, corner.y);
    maxX = Math.max(maxX, corner.x);
    maxY = Math.max(maxY, corner.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Union of two rectangles. */
export function unionRect(first: RectF, second: RectF): RectF {
  const minX = Math.min(first.x, second.x);
  const minY = Math.min(first.y, second.y);
  const maxX = Math.max(first.x + first.width, second.x + second.width);
  const maxY = Math.max(first.y + first.height, second.y + second.height);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** True when `point` lies inside (or on) the rectangle. */
export function rectContainsPoint(rect: RectF, point: Point2D): boolean {
  return (
    point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height
  );
}

/** True when the two rectangles overlap or touch — used for viewport culling. */
export function rectIntersects(first: RectF, second: RectF): boolean {
  return (
    first.x <= second.x + second.width
    && second.x <= first.x + first.width
    && first.y <= second.y + second.height
    && second.y <= first.y + first.height
  );
}

/**
 * Parse an SVG `transform` attribute into a single matrix.
 *
 * Supports the full SVG transform list: `matrix`, `translate`, `scale`,
 * `rotate` (with and without a centre), `skewX` and `skewY`, applied in SVG
 * order where the leftmost function is outermost. Anything else is reported in
 * `unsupported` and skipped, so callers can log a real reason.
 */
export function parseSvgTransform(value: string | null | undefined): ParsedSvgTransform {
  if (value === null || value === undefined || value.trim() === "") {
    return { matrix: IDENTITY, unsupported: [] };
  }

  const unsupported: string[] = [];
  const pattern = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let matrix = IDENTITY;
  let match = pattern.exec(value);

  while (match !== null) {
    const name = match[1];
    const args = parseNumberList(match[2]);
    const step = svgTransformStep(name, args);
    if (step === null) {
      unsupported.push(`${name}(${match[2].trim()})`);
    } else {
      matrix = multiply(matrix, step);
    }
    match = pattern.exec(value);
  }

  return { matrix, unsupported };
}

function parseNumberList(raw: string): number[] {
  const parts = raw.split(/[\s,]+/).filter((part) => part !== "");
  const numbers: number[] = [];
  for (const part of parts) {
    const parsed = Number.parseFloat(part);
    if (!Number.isFinite(parsed)) {
      return [];
    }
    numbers.push(parsed);
  }
  return numbers;
}

function svgTransformStep(name: string, args: readonly number[]): Matrix2D | null {
  switch (name) {
    case "matrix":
      return args.length === 6
        ? { a: args[0], b: args[1], c: args[2], d: args[3], e: args[4], f: args[5] }
        : null;
    case "translate":
      if (args.length === 1) return translation(args[0], 0);
      return args.length === 2 ? translation(args[0], args[1]) : null;
    case "scale":
      if (args.length === 1) return scaling(args[0], args[0]);
      return args.length === 2 ? scaling(args[0], args[1]) : null;
    case "rotate":
      if (args.length === 1) return rotation(args[0]);
      return args.length === 3 ? rotation(args[0], args[1], args[2]) : null;
    case "skewX":
      return args.length === 1 ? skewX(args[0]) : null;
    case "skewY":
      return args.length === 1 ? skewY(args[0]) : null;
    default:
      return null;
  }
}

/** Serialize as a compact SVG `matrix(...)` string. */
export function toSvgTransform(m: Matrix2D): string {
  const parts = [m.a, m.b, m.c, m.d, m.e, m.f].map(formatComponent);
  return `matrix(${parts.join(" ")})`;
}

function formatComponent(value: number): string {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/**
 * Decompose into translate / rotate / scale / skewX channels so numeric
 * inspectors can display editable values for an arbitrary matrix.
 *
 * Uses the standard "unmatrix" QR decomposition. Non-invertible matrices
 * return zeroed scale rather than NaN.
 */
export function decompose(m: Matrix2D): DecomposedTransform {
  const translateX = m.e;
  const translateY = m.f;

  let a = m.a;
  let b = m.b;
  let c = m.c;
  let d = m.d;

  let scaleX = Math.hypot(a, b);
  if (scaleX === 0) {
    return {
      translateX,
      translateY,
      rotationDeg: 0,
      scaleX: 0,
      scaleY: Math.hypot(c, d),
      skewXDeg: 0,
    };
  }

  a /= scaleX;
  b /= scaleX;

  let shear = a * c + b * d;
  c -= a * shear;
  d -= b * shear;

  let scaleY = Math.hypot(c, d);
  if (scaleY !== 0) {
    c /= scaleY;
    d /= scaleY;
    shear /= scaleY;
  }

  // A negative determinant means the matrix flips handedness; fold the flip
  // into scaleX so the reported rotation stays in a predictable range.
  if (a * d - b * c < 0) {
    a = -a;
    b = -b;
    scaleX = -scaleX;
  }

  return {
    translateX,
    translateY,
    rotationDeg: Math.atan2(b, a) * RAD_TO_DEG,
    scaleX,
    scaleY,
    skewXDeg: Math.atan(shear) * RAD_TO_DEG,
  };
}
