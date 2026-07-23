export interface GradientStop {
  color: string;
  offset: number;
}

export interface LinearGradientFill {
  kind: "linear";
  angle: number;
  stops: GradientStop[];
}

export interface SvgGradientVector {
  x1: string;
  y1: string;
  x2: string;
  y2: string;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function parseGradientFill(value: string): LinearGradientFill | null {
  const parts = value.split(",");
  if (parts.length < 4 || parts[0] !== "gradient:linear") {
    return null;
  }

  const angle = Number(parts[1]);
  if (!Number.isFinite(angle)) {
    return null;
  }

  const stops: GradientStop[] = [];
  for (const rawStop of parts.slice(2)) {
    const separatorIndex = rawStop.lastIndexOf(":");
    if (separatorIndex <= 0) {
      return null;
    }
    const color = rawStop.slice(0, separatorIndex);
    const offset = Number(rawStop.slice(separatorIndex + 1));
    if (!HEX_COLOR.test(color) || !Number.isFinite(offset)) {
      return null;
    }
    stops.push({
      color: color.toLowerCase(),
      offset: Math.max(0, Math.min(100, offset)),
    });
  }

  return stops.length >= 2
    ? { kind: "linear", angle, stops }
    : null;
}

export function serializeGradientFill(
  angle: number,
  stops: readonly GradientStop[],
): string {
  const normalizedAngle = Number.isFinite(angle) ? angle : 90;
  const normalizedStops = stops
    .filter((stop) => HEX_COLOR.test(stop.color) && Number.isFinite(stop.offset))
    .map((stop) => `${stop.color.toLowerCase()}:${Math.max(0, Math.min(100, stop.offset))}`);

  if (normalizedStops.length < 2) {
    throw new Error("A gradient requires at least two valid color stops.");
  }

  return `gradient:linear,${normalizedAngle},${normalizedStops.join(",")}`;
}

export function gradientFillToCss(value: string): string | null {
  const gradient = parseGradientFill(value);
  if (!gradient) {
    return null;
  }
  const stops = gradient.stops
    .map((stop) => `${stop.color} ${stop.offset}%`)
    .join(", ");
  return `linear-gradient(${gradient.angle}deg, ${stops})`;
}

export function gradientIdForFill(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index);
  }
  return `printrocket-gradient-${(hash >>> 0).toString(36)}`;
}

export function gradientVector(angle: number): SvgGradientVector {
  const radians = angle * Math.PI / 180;
  const deltaX = Math.sin(radians) * 50;
  const deltaY = -Math.cos(radians) * 50;
  return {
    x1: formatPercent(50 - deltaX),
    y1: formatPercent(50 - deltaY),
    x2: formatPercent(50 + deltaX),
    y2: formatPercent(50 + deltaY),
  };
}

function formatPercent(value: number): string {
  return `${Number(value.toFixed(3))}%`;
}
