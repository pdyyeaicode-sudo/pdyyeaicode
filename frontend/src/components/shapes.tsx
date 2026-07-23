import React from "react";

export function Rectangle({ x = 0, y = 0, width = 100, height = 100, rx = 0, ry = 0, fill = "none", stroke = "var(--fg-1)", strokeWidth = 1 }) {
  return <rect x={x} y={y} width={width} height={height} rx={rx} ry={ry} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
}

export function Circle({ cx = 50, cy = 50, r = 50, fill = "none", stroke = "var(--fg-1)", strokeWidth = 1 }) {
  return <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
}

export function Ellipse({ cx = 50, cy = 50, rx = 50, ry = 30, fill = "none", stroke = "var(--fg-1)", strokeWidth = 1 }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
}

export function Triangle({ points = "0,100 50,0 100,100", fill = "none", stroke = "var(--fg-1)", strokeWidth = 1 }) {
  return <polygon points={points} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
}

export function Arrow({
  d = "M2 12 L18 12 M12 6 L18 12 L12 18",
  fill = "none",
  stroke = "var(--fg-1)",
  strokeWidth = 1,
  strokeLinecap = "round" as "round",
  strokeLinejoin = "round" as "round",
}) {
  return <path d={d} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap={strokeLinecap} strokeLinejoin={strokeLinejoin} />;
}

export default { Rectangle, Circle, Ellipse, Triangle, Arrow };
