/**
 * exactPathBounds — the TIGHT bounding box of SVG path data.
 *
 * This exists because `conservativePathBounds` is a documented *superset*, and a
 * superset is the wrong answer for selection geometry. It is fine for culling and
 * coarse hit-testing, which is what it was written for. It is not fine as the box
 * drawn around an object, and using it there is why the selection rectangle sits
 * away from the shape it selects:
 *
 *   - a rounded rectangle's corner arcs are expanded by their full radius in every
 *     direction, so a 100x100 shape with r=20 gets a 140x140 box, offset by 20px up
 *     and left;
 *   - a donut's two half-arcs have radius w/2, so its box comes out 2w x 2h,
 *     centred on the shape and twice its size;
 *   - a cloud's five arcs each overshoot by their own radii;
 *   - a cubic's control points lie outside the curve by construction, so every
 *     heart, shield and chat bubble is loose on at least one edge.
 *
 * The maths is closed form, not approximation:
 *
 *   cubic     — the derivative is a quadratic per axis; include roots in (0,1)
 *   quadratic — the derivative is linear per axis; include the root in (0,1)
 *   arc       — convert the SVG endpoint parameterisation to centre form (spec
 *               F.6.5), then solve dx/dtheta = 0 and dy/dtheta = 0 for the rotated
 *               ellipse and include whichever stationary angles the sweep covers
 *
 * `S` and `T` are handled with real reflected control points. The conservative
 * implementation treats `S`'s first coordinate pair as a control point, which is
 * the SECOND control point — the reflected first one is missing entirely, so an
 * `S` chain could report bounds that are simultaneously too loose on one side and
 * too tight on the other.
 *
 * The C++ engine answers the same question with `SkPath::computeTightBounds()`.
 * `engine-parity.mts` compares the two on every generated shape, so this is not a
 * second source of truth: it is the fallback renderer's copy of one, pinned to the
 * authority.
 *
 * One responsibility per file: exact path data bounds.
 */

import type { RectF } from "./matrix2d";

interface Accumulator {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  any: boolean;
}

/** Parameters consumed by one repetition of each command. */
const ARITY: Readonly<Record<string, number>> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
};

/** Commands after which a reflected cubic control point is defined. */
const CUBIC_COMMANDS = new Set(["c", "s"]);
/** Commands after which a reflected quadratic control point is defined. */
const QUADRATIC_COMMANDS = new Set(["q", "t"]);

/**
 * The tight bounding box of `d`, or `null` when it contains no usable
 * coordinates.
 *
 * "Tight" means every returned edge is touched by the path. Degenerate input is
 * reported as `null` rather than as a zero rect at the origin, because a shape at
 * the origin and a shape that could not be measured are different facts.
 */
export function exactPathBounds(d: string): RectF | null {
  const box: Accumulator = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    any: false,
  };

  let currentX = 0;
  let currentY = 0;
  let subpathStartX = 0;
  let subpathStartY = 0;
  // The reflection of the previous segment's last control point. Undefined means
  // the reflection is the current point, per the SVG spec.
  let previousControlX: number | null = null;
  let previousControlY: number | null = null;
  let previousCommand = "";

  const pattern = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let match = pattern.exec(d);

  while (match !== null) {
    const raw = match[1];
    const command = raw.toLowerCase();
    const relative = raw !== raw.toUpperCase();
    const args = parseNumbers(match[2]);
    const arity = ARITY[command];

    if (command === "z") {
      currentX = subpathStartX;
      currentY = subpathStartY;
      // Only when a subpath actually exists. A bare "Z" closes nothing, and
      // including (0, 0) for it would report a zero-size box at the origin for
      // path data that has no coordinates at all — a measurable shape where there
      // is none.
      if (box.any) {
        include(box, currentX, currentY);
      }
      previousControlX = null;
      previousControlY = null;
      previousCommand = command;
      match = pattern.exec(d);
      continue;
    }

    if (arity === undefined || arity === 0 || args.length < arity) {
      match = pattern.exec(d);
      continue;
    }

    for (let offset = 0; offset + arity <= args.length; offset += arity) {
      const group = args.slice(offset, offset + arity);
      const originX = relative ? currentX : 0;
      const originY = relative ? currentY : 0;
      const startX = currentX;
      const startY = currentY;

      switch (command) {
        case "m":
        case "l": {
          currentX = originX + group[0];
          currentY = originY + group[1];
          /*
            The DESTINATION only.

            A moveto contributes no segment, so including the point it moved FROM
            adds a coordinate the path never covers — and for the leading `M` of
            any path that point is (0, 0), which anchored every measurement to the
            origin. A lineto's start is already in the box as the previous
            command's destination, so omitting it here is not a loss either.
          */
          include(box, currentX, currentY);
          if (command === "m" && offset === 0) {
            subpathStartX = currentX;
            subpathStartY = currentY;
          }
          previousControlX = null;
          previousControlY = null;
          break;
        }
        case "h": {
          currentX = originX + group[0];
          include(box, currentX, currentY);
          previousControlX = null;
          previousControlY = null;
          break;
        }
        case "v": {
          currentY = originY + group[0];
          include(box, currentX, currentY);
          previousControlX = null;
          previousControlY = null;
          break;
        }
        case "c": {
          const c1x = originX + group[0];
          const c1y = originY + group[1];
          const c2x = originX + group[2];
          const c2y = originY + group[3];
          currentX = originX + group[4];
          currentY = originY + group[5];
          includeCubic(box, startX, startY, c1x, c1y, c2x, c2y, currentX, currentY);
          previousControlX = c2x;
          previousControlY = c2y;
          break;
        }
        case "s": {
          // The first control point is the REFLECTION of the previous segment's
          // second control point about the current point — not one of the
          // arguments. Omitting it is what makes a superset implementation wrong
          // in both directions on an `S` chain.
          const reflected = reflectControl(
            startX,
            startY,
            previousControlX,
            previousControlY,
            CUBIC_COMMANDS.has(previousCommand),
          );
          const c2x = originX + group[0];
          const c2y = originY + group[1];
          currentX = originX + group[2];
          currentY = originY + group[3];
          includeCubic(
            box,
            startX,
            startY,
            reflected.x,
            reflected.y,
            c2x,
            c2y,
            currentX,
            currentY,
          );
          previousControlX = c2x;
          previousControlY = c2y;
          break;
        }
        case "q": {
          const cx = originX + group[0];
          const cy = originY + group[1];
          currentX = originX + group[2];
          currentY = originY + group[3];
          includeQuadratic(box, startX, startY, cx, cy, currentX, currentY);
          previousControlX = cx;
          previousControlY = cy;
          break;
        }
        case "t": {
          const reflected = reflectControl(
            startX,
            startY,
            previousControlX,
            previousControlY,
            QUADRATIC_COMMANDS.has(previousCommand),
          );
          currentX = originX + group[0];
          currentY = originY + group[1];
          includeQuadratic(
            box,
            startX,
            startY,
            reflected.x,
            reflected.y,
            currentX,
            currentY,
          );
          previousControlX = reflected.x;
          previousControlY = reflected.y;
          break;
        }
        case "a": {
          const endX = originX + group[5];
          const endY = originY + group[6];
          includeArc(
            box,
            startX,
            startY,
            Math.abs(group[0]),
            Math.abs(group[1]),
            group[2],
            group[3] !== 0,
            group[4] !== 0,
            endX,
            endY,
          );
          currentX = endX;
          currentY = endY;
          previousControlX = null;
          previousControlY = null;
          break;
        }
        default:
          break;
      }
      previousCommand = command;
    }

    match = pattern.exec(d);
  }

  if (!box.any) {
    return null;
  }
  return {
    x: box.minX,
    y: box.minY,
    width: box.maxX - box.minX,
    height: box.maxY - box.minY,
  };
}

function reflectControl(
  currentX: number,
  currentY: number,
  previousControlX: number | null,
  previousControlY: number | null,
  previousWasCompatible: boolean,
): { x: number; y: number } {
  if (!previousWasCompatible || previousControlX === null || previousControlY === null) {
    // Spec: when the previous command was not a matching curve, the first control
    // point coincides with the current point.
    return { x: currentX, y: currentY };
  }
  return { x: 2 * currentX - previousControlX, y: 2 * currentY - previousControlY };
}

function includeCubic(
  box: Accumulator,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): void {
  include(box, x0, y0);
  include(box, x3, y3);
  for (const t of cubicStationaryPoints(x0, x1, x2, x3)) {
    include(box, cubicAt(x0, x1, x2, x3, t), cubicAt(y0, y1, y2, y3, t));
  }
  for (const t of cubicStationaryPoints(y0, y1, y2, y3)) {
    include(box, cubicAt(x0, x1, x2, x3, t), cubicAt(y0, y1, y2, y3, t));
  }
}

/**
 * Parameters in (0, 1) where one axis of a cubic is stationary.
 *
 * B'(t) = 3[(-p0 + 3p1 - 3p2 + p3)t^2 + 2(p0 - 2p1 + p2)t + (p1 - p0)], so the
 * roots come from a plain quadratic. The linear and constant degenerate cases are
 * handled explicitly rather than by dividing by a near-zero leading coefficient.
 */
function cubicStationaryPoints(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  return quadraticRootsInUnitInterval(a, b, c);
}

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function includeQuadratic(
  box: Accumulator,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  include(box, x0, y0);
  include(box, x2, y2);
  for (const t of [quadraticStationaryPoint(x0, x1, x2), quadraticStationaryPoint(y0, y1, y2)]) {
    if (t !== null) {
      include(box, quadraticAt(x0, x1, x2, t), quadraticAt(y0, y1, y2, t));
    }
  }
}

/** The single parameter in (0, 1) where one axis of a quadratic is stationary. */
function quadraticStationaryPoint(p0: number, p1: number, p2: number): number | null {
  const denominator = p0 - 2 * p1 + p2;
  if (Math.abs(denominator) < 1e-12) {
    return null;
  }
  const t = (p0 - p1) / denominator;
  return t > 0 && t < 1 ? t : null;
}

function quadraticAt(p0: number, p1: number, p2: number, t: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}

/**
 * Exact extents of an SVG elliptical arc.
 *
 * Endpoint parameterisation is converted to centre form following SVG 1.1
 * appendix F.6.5, including the radius correction for an arc whose endpoints are
 * further apart than the radii allow. Then, for the rotated ellipse
 *
 *   x(t) = cx + rx cos t cos phi - ry sin t sin phi
 *   y(t) = cy + rx cos t sin phi + ry sin t cos phi
 *
 * dx/dt = 0 gives tan t = -(ry/rx) tan phi and dy/dt = 0 gives
 * tan t = (ry/rx) cot phi. Each yields two angles a half turn apart; whichever of
 * the four the sweep actually covers are the extremes.
 */
function includeArc(
  box: Accumulator,
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  rotationDegrees: number,
  largeArc: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
): void {
  include(box, x1, y1);
  include(box, x2, y2);

  // Spec: zero radii, or coincident endpoints, degenerate to a straight line.
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) {
    return;
  }

  const phi = (rotationDegrees * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  let radiusX = rx;
  let radiusY = ry;
  const lambda = (x1p * x1p) / (radiusX * radiusX) + (y1p * y1p) / (radiusY * radiusY);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    radiusX *= scale;
    radiusY *= scale;
  }

  const rxSq = radiusX * radiusX;
  const rySq = radiusY * radiusY;
  const numerator = rxSq * rySq - rxSq * y1p * y1p - rySq * x1p * x1p;
  const denominator = rxSq * y1p * y1p + rySq * x1p * x1p;
  if (denominator === 0) {
    return;
  }
  const factor = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (factor * radiusX * y1p) / radiusY;
  const cyp = (-factor * radiusY * x1p) / radiusX;

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const startAngle = Math.atan2((y1p - cyp) / radiusY, (x1p - cxp) / radiusX);
  const endAngle = Math.atan2((-y1p - cyp) / radiusY, (-x1p - cxp) / radiusX);
  let sweepAngle = endAngle - startAngle;
  if (!sweep && sweepAngle > 0) {
    sweepAngle -= 2 * Math.PI;
  } else if (sweep && sweepAngle < 0) {
    sweepAngle += 2 * Math.PI;
  }

  const pointAt = (angle: number): { x: number; y: number } => ({
    x: cx + radiusX * Math.cos(angle) * cosPhi - radiusY * Math.sin(angle) * sinPhi,
    y: cy + radiusX * Math.cos(angle) * sinPhi + radiusY * Math.sin(angle) * cosPhi,
  });

  const candidates: number[] = [];
  // dx/dt = 0
  if (Math.abs(radiusX * cosPhi) < 1e-12 && Math.abs(radiusY * sinPhi) < 1e-12) {
    // Degenerate: x is constant along the arc, so it has no interior extreme.
  } else {
    const base = Math.atan2(-radiusY * sinPhi, radiusX * cosPhi);
    candidates.push(base, base + Math.PI);
  }
  // dy/dt = 0
  if (Math.abs(radiusX * sinPhi) < 1e-12 && Math.abs(radiusY * cosPhi) < 1e-12) {
    // Degenerate: y is constant along the arc.
  } else {
    const base = Math.atan2(radiusY * cosPhi, radiusX * sinPhi);
    candidates.push(base, base + Math.PI);
  }

  for (const candidate of candidates) {
    if (!angleWithinSweep(candidate, startAngle, sweepAngle)) {
      continue;
    }
    const point = pointAt(candidate);
    include(box, point.x, point.y);
  }
}

/**
 * Whether `angle` lies on the arc that starts at `startAngle` and turns by
 * `sweepAngle`.
 *
 * Compared as a fraction of the sweep rather than by comparing angles directly,
 * so a sweep that crosses the -pi/+pi discontinuity needs no special case.
 */
function angleWithinSweep(angle: number, startAngle: number, sweepAngle: number): boolean {
  if (sweepAngle === 0) {
    return false;
  }
  const twoPi = 2 * Math.PI;
  let delta = angle - startAngle;
  if (sweepAngle > 0) {
    delta = ((delta % twoPi) + twoPi) % twoPi;
    return delta <= sweepAngle + 1e-12;
  }
  delta = ((delta % twoPi) - twoPi) % twoPi;
  return delta >= sweepAngle - 1e-12;
}

function include(box: Accumulator, x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }
  box.minX = Math.min(box.minX, x);
  box.minY = Math.min(box.minY, y);
  box.maxX = Math.max(box.maxX, x);
  box.maxY = Math.max(box.maxY, y);
  box.any = true;
}

/**
 * Real roots of `a t^2 + b t + c` strictly inside (0, 1).
 *
 * The near-zero leading coefficient is handled as a linear equation instead of
 * being divided through, because a cubic whose axis happens to be quadratic is
 * common (any curve with collinear control offsets) and the division would produce
 * an enormous spurious root.
 */
function quadraticRootsInUnitInterval(a: number, b: number, c: number): number[] {
  const roots: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) >= 1e-12) {
      const t = -c / b;
      if (t > 0 && t < 1) {
        roots.push(t);
      }
    }
    return roots;
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return roots;
  }
  const root = Math.sqrt(discriminant);
  for (const t of [(-b + root) / (2 * a), (-b - root) / (2 * a)]) {
    if (t > 0 && t < 1) {
      roots.push(t);
    }
  }
  return roots;
}

function parseNumbers(raw: string): number[] {
  // Exponents and implicit separators both occur in generated path data, and a
  // negative sign is a separator in its own right ("10-5" is two numbers).
  const matches = raw.match(/[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g);
  if (matches === null) {
    return [];
  }
  const numbers: number[] = [];
  for (const token of matches) {
    const parsed = Number.parseFloat(token);
    if (Number.isFinite(parsed)) {
      numbers.push(parsed);
    }
  }
  return numbers;
}
