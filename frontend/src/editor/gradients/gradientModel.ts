/**
 * gradientModel — the authoring model for gradient paint servers.
 *
 * Division of responsibility, which matters here because there are two parsers in
 * the system and that is deliberate:
 *
 *   - The RENDERER parses `<defs>` in C++ (`engine/src/paint_servers.cpp`). That
 *     is the single source of truth for how a gradient is *drawn*: geometry,
 *     percentage resolution, `gradientTransform` composition, `href` inheritance.
 *   - This file is the source of truth for how a gradient is *authored*. It emits
 *     markup and reads back only the structured form its own controls need.
 *
 * The one-way rule that keeps them from drifting: this module WRITES the markup
 * the engine reads. It never has to agree with the engine about defaults, because
 * it always emits every attribute explicitly. A gradient authored here is fully
 * specified, so there is nothing for the two implementations to disagree about.
 *
 * Angles rather than endpoints: the UI works in degrees because that is how
 * designers think, and SVG wants `x1,y1,x2,y2`. The conversion lives here so the
 * panel holds no geometry maths.
 *
 * One responsibility per file: the gradient authoring model.
 */

export type GradientKind = "linear" | "radial";

/** SVG `spreadMethod`. All three are rendered by the engine. */
export type GradientSpread = "pad" | "reflect" | "repeat";

/** SVG `gradientUnits`. `objectBoundingBox` is the SVG default. */
export type GradientUnits = "objectBoundingBox" | "userSpaceOnUse";

export interface GradientStop {
  /** 0..1. */
  readonly offset: number;
  /** `#rrggbb`. */
  readonly color: string;
  /** 0..1. */
  readonly opacity: number;
}

export interface GradientDefinition {
  readonly id: string;
  readonly kind: GradientKind;
  readonly stops: readonly GradientStop[];
  readonly spread: GradientSpread;
  readonly units: GradientUnits;
  /** Linear only: direction in degrees, 0 = left-to-right, clockwise. */
  readonly angle: number;
  /** Radial only, in objectBoundingBox fractions. */
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  /** Radial focal point offset from the centre, in the same fractions. */
  readonly fx: number;
  readonly fy: number;
}

export const DEFAULT_GRADIENT_STOPS: readonly GradientStop[] = [
  { offset: 0, color: "#4f46e5", opacity: 1 },
  { offset: 1, color: "#06b6d4", opacity: 1 },
];

/** Maximum stops the wire format's `u8 stop_count` can carry. */
export const MAX_GRADIENT_STOPS = 255;

export function createGradient(id: string, kind: GradientKind = "linear"): GradientDefinition {
  return {
    id,
    kind,
    stops: DEFAULT_GRADIENT_STOPS.map((stop) => ({ ...stop })),
    spread: "pad",
    units: "objectBoundingBox",
    angle: 90,
    cx: 0.5,
    cy: 0.5,
    r: 0.5,
    fx: 0.5,
    fy: 0.5,
  };
}

/** The `url(#id)` fill value that references a gradient. */
export function gradientFillReference(id: string): string {
  return `url(#${id})`;
}

/** Extract the id from a `url(#id)` fill, or null when it is not one. */
export function gradientIdFromFill(fill: string | undefined): string | null {
  if (fill === undefined) {
    return null;
  }
  const match = /^url\(\s*#([^)\s]+)\s*\)$/.exec(fill.trim());
  return match === null ? null : match[1];
}

/**
 * Endpoints for a linear gradient, in objectBoundingBox fractions.
 *
 * 0 degrees points right and the angle advances clockwise, matching CSS
 * `linear-gradient` intuition once rotated: the line is centred on the box and
 * long enough that both stops reach its edges.
 */
export function endpointsForAngle(degrees: number): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} {
  const radians = (degrees * Math.PI) / 180;
  const dx = Math.cos(radians) / 2;
  const dy = Math.sin(radians) / 2;
  return {
    x1: round(0.5 - dx),
    y1: round(0.5 - dy),
    x2: round(0.5 + dx),
    y2: round(0.5 + dy),
  };
}

/** Inverse of `endpointsForAngle`, for reading a gradient back into the UI. */
export function angleForEndpoints(x1: number, y1: number, x2: number, y2: number): number {
  const degrees = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  return round(degrees < 0 ? degrees + 360 : degrees);
}

/**
 * Serialize a gradient to SVG markup.
 *
 * Every attribute is written explicitly, including the ones that happen to equal
 * the SVG default. That is what makes this safe to pair with an independent
 * parser in the renderer: there is no default for the two to disagree about.
 */
export function serializeGradient(gradient: GradientDefinition): string {
  const stops = normaliseStops(gradient.stops)
    .map(
      (stop) =>
        `<stop offset="${format(stop.offset)}" stop-color="${escapeAttribute(stop.color)}"`
        + ` stop-opacity="${format(clamp01(stop.opacity))}"/>`,
    )
    .join("");

  const shared =
    `id="${escapeAttribute(gradient.id)}"`
    + ` gradientUnits="${gradient.units}"`
    + ` spreadMethod="${gradient.spread}"`;

  if (gradient.kind === "linear") {
    const { x1, y1, x2, y2 } = endpointsForAngle(gradient.angle);
    return (
      `<linearGradient ${shared} x1="${format(x1)}" y1="${format(y1)}"`
      + ` x2="${format(x2)}" y2="${format(y2)}">${stops}</linearGradient>`
    );
  }

  return (
    `<radialGradient ${shared} cx="${format(gradient.cx)}" cy="${format(gradient.cy)}"`
    + ` r="${format(Math.max(0, gradient.r))}" fx="${format(gradient.fx)}"`
    + ` fy="${format(gradient.fy)}">${stops}</radialGradient>`
  );
}

/**
 * Replace — or insert — one gradient inside a `<defs>` markup string.
 *
 * Operates on the raw string because that is what `Artboard.defs` is. The element
 * is matched by id so unrelated defs content (embedded fonts, filters, other
 * gradients) is preserved untouched; a naive rewrite would discard it.
 */
export function upsertGradientInDefs(defs: string, gradient: GradientDefinition): string {
  const markup = serializeGradient(gradient);
  const existing = findGradientElement(defs, gradient.id);
  if (existing === null) {
    return defs + markup;
  }
  return defs.slice(0, existing.start) + markup + defs.slice(existing.end);
}

/** Remove a gradient from a `<defs>` string, leaving everything else intact. */
export function removeGradientFromDefs(defs: string, id: string): string {
  const existing = findGradientElement(defs, id);
  return existing === null ? defs : defs.slice(0, existing.start) + defs.slice(existing.end);
}

/**
 * Read a gradient back out of a `<defs>` string.
 *
 * Only the fields this panel authors are recovered; anything else in the element
 * is ignored rather than guessed at, and an element this module did not write
 * returns null so the UI offers to replace it instead of silently reinterpreting
 * someone else's gradient.
 */
export function parseGradientFromDefs(defs: string, id: string): GradientDefinition | null {
  const found = findGradientElement(defs, id);
  if (found === null) {
    return null;
  }
  const element = defs.slice(found.start, found.end);
  const kind: GradientKind = /^<linearGradient/i.test(element) ? "linear" : "radial";

  const attribute = (name: string): string | null => {
    const match = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i").exec(element);
    return match === null ? null : match[1];
  };
  const numeric = (name: string, fallback: number): number => {
    const raw = attribute(name);
    if (raw === null) {
      return fallback;
    }
    const isPercent = raw.trim().endsWith("%");
    const parsed = Number.parseFloat(isPercent ? raw.trim().slice(0, -1) : raw);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return isPercent ? parsed / 100 : parsed;
  };

  const stops: GradientStop[] = [];
  const stopPattern = /<stop\b([^>]*)\/?>/gi;
  let stopMatch: RegExpExecArray | null;
  while ((stopMatch = stopPattern.exec(element)) !== null) {
    const attributes = stopMatch[1];
    const read = (name: string): string | null => {
      const match = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i").exec(attributes);
      return match === null ? null : match[1];
    };
    const rawOffset = read("offset") ?? "0";
    const isPercent = rawOffset.trim().endsWith("%");
    const offsetValue = Number.parseFloat(isPercent ? rawOffset.trim().slice(0, -1) : rawOffset);
    const opacity = Number.parseFloat(read("stop-opacity") ?? "1");
    stops.push({
      offset: clamp01(
        Number.isFinite(offsetValue) ? (isPercent ? offsetValue / 100 : offsetValue) : 0,
      ),
      color: read("stop-color") ?? "#000000",
      opacity: Number.isFinite(opacity) ? clamp01(opacity) : 1,
    });
  }

  const spreadRaw = (attribute("spreadMethod") ?? "pad").toLowerCase();
  const spread: GradientSpread =
    spreadRaw === "reflect" || spreadRaw === "repeat" ? spreadRaw : "pad";
  const units: GradientUnits =
    (attribute("gradientUnits") ?? "").toLowerCase() === "userspaceonuse"
      ? "userSpaceOnUse"
      : "objectBoundingBox";

  const cx = numeric("cx", 0.5);
  const cy = numeric("cy", 0.5);

  return {
    id,
    kind,
    stops: stops.length >= 1 ? stops : DEFAULT_GRADIENT_STOPS.map((stop) => ({ ...stop })),
    spread,
    units,
    angle: angleForEndpoints(numeric("x1", 0), numeric("y1", 0), numeric("x2", 1), numeric("y2", 0)),
    cx,
    cy,
    r: numeric("r", 0.5),
    fx: numeric("fx", cx),
    fy: numeric("fy", cy),
  };
}

/**
 * A CSS `linear-gradient()` / `radial-gradient()` equivalent, for the preview
 * swatch.
 *
 * Only used for the swatch: the canvas is painted by the real renderers. Kept
 * here so the panel does not build colour strings itself.
 */
export function gradientPreviewCss(gradient: GradientDefinition): string {
  const stops = normaliseStops(gradient.stops)
    .map((stop) => `${rgbaFor(stop)} ${format(stop.offset * 100)}%`)
    .join(", ");
  if (gradient.kind === "linear") {
    // CSS measures from the top going clockwise; SVG from the positive x axis.
    return `linear-gradient(${format(gradient.angle + 90)}deg, ${stops})`;
  }
  return `radial-gradient(circle at ${format(gradient.cx * 100)}% ${format(gradient.cy * 100)}%, ${stops})`;
}

function rgbaFor(stop: GradientStop): string {
  const hex = stop.color.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const value = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(value)) {
    return `rgba(0,0,0,${clamp01(stop.opacity)})`;
  }
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r},${g},${b},${clamp01(stop.opacity)})`;
}

/**
 * Sort stops and force offsets to be non-decreasing.
 *
 * The engine's decoder REJECTS a descending offset outright, so an unsorted list
 * would fail the whole scene rather than render oddly. Clamping here means the
 * panel cannot produce a buffer the engine refuses.
 */
export function normaliseStops(stops: readonly GradientStop[]): GradientStop[] {
  const sorted = [...stops]
    .slice(0, MAX_GRADIENT_STOPS)
    .map((stop) => ({ ...stop, offset: clamp01(stop.offset) }))
    .sort((a, b) => a.offset - b.offset);

  let previous = 0;
  return sorted.map((stop) => {
    const offset = Math.max(previous, stop.offset);
    previous = offset;
    return { ...stop, offset: round(offset) };
  });
}

/** Locate a gradient element by id inside a defs string. */
function findGradientElement(defs: string, id: string): { start: number; end: number } | null {
  for (const tag of ["linearGradient", "radialGradient"]) {
    const open = new RegExp(`<${tag}\\b[^>]*\\sid\\s*=\\s*"${escapeRegExp(id)}"`, "i");
    const match = open.exec(defs);
    if (match === null) {
      continue;
    }
    const start = match.index;

    // The end of the OPENING tag, not the first `/>` in the element. A gradient's
    // `<stop .../>` children are self-closing, so searching for `/>` from the
    // start truncated the element at its first stop and lost the rest.
    const openTagEnd = defs.indexOf(">", start);
    if (openTagEnd === -1) {
      return null;
    }
    if (defs[openTagEnd - 1] === "/") {
      return { start, end: openTagEnd + 1 };
    }

    const closeTag = `</${tag.toLowerCase()}>`;
    const closeIndex = defs.toLowerCase().indexOf(closeTag, openTagEnd);
    if (closeIndex === -1) {
      return null;
    }
    return { start, end: closeIndex + closeTag.length };
  }
  return null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : 0;
}

function format(value: number): string {
  const rounded = round(value);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
