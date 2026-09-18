"use client";

import type { ShapeInput } from "../editor/tools/shapeTool";
import { EXTRA_SHAPES } from "./extraShapes";

export type ShapeCategory = "Basic" | "Geometry" | "Lines" | "Arrows" | "Flowchart" | "Callouts" | "Banners & Badges" | "Symbols";

export interface ShapeDefinition {
  id: string;
  name: string;
  category: ShapeCategory;
  preview: string;
  insert: (cx: number, cy: number, w?: number, h?: number) => ShapeInput;
}

// ---------------------------------------------------------------------------
// Basic & Geometry
// ---------------------------------------------------------------------------
const GEOMETRY_SHAPES: ShapeDefinition[] = [
  {
    id: "rect",
    name: "Rectangle",
    category: "Geometry",
    preview: `<rect x="6" y="12" width="36" height="24" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy, w = 200, h = 120) => ({ kind: "rect", x: cx - w/2, y: cy - h/2, width: w, height: h }),
  },
  {
    id: "square",
    name: "Square",
    category: "Geometry",
    preview: `<rect x="12" y="12" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy, w = 160, h = 160) => ({ kind: "rect", x: cx - w/2, y: cy - h/2, width: w, height: h }),
  },
  {
    id: "rounded-rect",
    name: "Rounded Rect",
    category: "Geometry",
    preview: `<rect x="6" y="12" width="36" height="24" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy, w = 200, h = 120) => ({ kind: "rect", x: cx - w/2, y: cy - h/2, width: w, height: h, rx: 20 }),
  },
  {
    id: "pill",
    name: "Pill / Capsule",
    category: "Geometry",
    preview: `<rect x="6" y="16" width="36" height="16" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy, w = 200, h = 80) => ({ kind: "rect", x: cx - w/2, y: cy - h/2, width: w, height: h, rx: 40 }),
  },
  {
    id: "circle",
    name: "Circle",
    category: "Geometry",
    preview: `<circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy, w = 160, h = 160) => ({ kind: "ellipse", cx, cy, rx: w/2, ry: h/2 }),
  },
  {
    id: "ellipse",
    name: "Ellipse",
    category: "Geometry",
    preview: `<ellipse cx="24" cy="24" rx="18" ry="12" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy, w = 240, h = 140) => ({ kind: "ellipse", cx, cy, rx: w/2, ry: h/2 }),
  },
  {
    id: "triangle",
    name: "Triangle",
    category: "Geometry",
    preview: `<polygon points="24,6 42,42 6,42" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({ kind: "polygon", points: [[cx, cy - 90], [cx - 100, cy + 70], [cx + 100, cy + 70]] }),
  },
  {
    id: "right-triangle",
    name: "Right Triangle",
    category: "Geometry",
    preview: `<polygon points="12,6 12,42 42,42" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({ kind: "polygon", points: [[cx - 80, cy - 80], [cx - 80, cy + 80], [cx + 80, cy + 80]] }),
  },
  {
    id: "diamond",
    name: "Diamond",
    category: "Geometry",
    preview: `<polygon points="24,4 44,24 24,44 4,24" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({ kind: "polygon", points: [[cx, cy - 90], [cx + 90, cy], [cx, cy + 90], [cx - 90, cy]] }),
  },
  {
    id: "parallelogram",
    name: "Parallelogram",
    category: "Geometry",
    preview: `<polygon points="12,12 44,12 36,36 4,36" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({ kind: "polygon", points: [[cx - 60, cy - 60], [cx + 100, cy - 60], [cx + 60, cy + 60], [cx - 100, cy + 60]] }),
  },
  {
    id: "trapezoid",
    name: "Trapezoid",
    category: "Geometry",
    preview: `<polygon points="14,12 34,12 42,36 6,36" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({ kind: "polygon", points: [[cx - 60, cy - 60], [cx + 60, cy - 60], [cx + 100, cy + 60], [cx - 100, cy + 60]] }),
  },
  {
    id: "pentagon",
    name: "Pentagon",
    category: "Geometry",
    preview: `<polygon points="24,4 43,17 36,40 12,40 5,17" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy, w = 180, h = 180) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: [number, number][] = [];
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
      }
      return { kind: "polygon", points: pts };
    },
  },
  {
    id: "hexagon",
    name: "Hexagon",
    category: "Geometry",
    preview: `<polygon points="12,4 36,4 46,24 36,44 12,44 2,24" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy, w = 180, h = 180) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
        pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
      }
      return { kind: "polygon", points: pts };
    },
  },
  {
    id: "octagon",
    name: "Octagon",
    category: "Geometry",
    preview: `<polygon points="16,4 32,4 44,16 44,32 32,44 16,44 4,32 4,16" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy, w = 180, h = 180) => {
      const rx = w / 2;
      const ry = h / 2;
      const pts: [number, number][] = [];
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8 - Math.PI / 2;
        pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
      }
      return { kind: "polygon", points: pts };
    },
  },
  {
    id: "star",
    name: "Star",
    category: "Geometry",
    preview: `<polygon points="24,2 29,18 46,18 32,28 37,44 24,34 11,44 16,28 2,18 19,18" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy, w = 180, h = 180) => {
      const outerRx = w / 2;
      const outerRy = h / 2;
      const innerRx = outerRx * 0.45;
      const innerRy = outerRy * 0.45;
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI * 2 * i) / 10 - Math.PI / 2;
        const rx = i % 2 === 0 ? outerRx : innerRx;
        const ry = i % 2 === 0 ? outerRy : innerRy;
        pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
      }
      return { kind: "polygon", points: pts };
    },
  },
  {
    id: "heart",
    name: "Heart",
    category: "Basic",
    preview: `<path d="M24 42 C4 28 4 12 16 8 Q24 4 24 14 Q24 4 32 8 C44 12 44 28 24 42Z" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({
      kind: "path",
      d: `M${cx} ${cy + 60} C${cx - 100} ${cy} ${cx - 100} ${cy - 60} ${cx - 40} ${cy - 70} Q${cx} ${cy - 90} ${cx} ${cy - 40} Q${cx} ${cy - 90} ${cx + 40} ${cy - 70} C${cx + 100} ${cy - 60} ${cx + 100} ${cy} ${cx} ${cy + 60}Z`,
    }),
  },
  {
    id: "cross",
    name: "Cross",
    category: "Basic",
    preview: `<polygon points="18,4 30,4 30,18 44,18 44,30 30,30 30,44 18,44 18,30 4,30 4,18 18,18" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => {
      const w = 40, h = 90;
      return {
        kind: "polygon",
        points: [
          [cx - w, cy - h], [cx + w, cy - h], [cx + w, cy - w],
          [cx + h, cy - w], [cx + h, cy + w], [cx + w, cy + w],
          [cx + w, cy + h], [cx - w, cy + h], [cx - w, cy + w],
          [cx - h, cy + w], [cx - h, cy - w], [cx - w, cy - w],
        ],
      };
    },
  }
];

// ---------------------------------------------------------------------------
// Arrows
// ---------------------------------------------------------------------------
const ARROW_SHAPES: ShapeDefinition[] = [
  {
    id: "arrow-right",
    name: "Right Arrow",
    category: "Arrows",
    preview: `<polygon points="4,20 24,20 24,10 44,24 24,38 24,28 4,28" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => {
      const w = 120, h = 40, aw = 80, ah = 80;
      return { kind: "polygon", points: [[cx - w, cy - h/2], [cx + w - aw, cy - h/2], [cx + w - aw, cy - ah/2], [cx + w, cy], [cx + w - aw, cy + ah/2], [cx + w - aw, cy + h/2], [cx - w, cy + h/2]] };
    },
  },
  {
    id: "arrow-left",
    name: "Left Arrow",
    category: "Arrows",
    preview: `<polygon points="44,20 24,20 24,10 4,24 24,38 24,28 44,28" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => {
      const w = 120, h = 40, aw = 80, ah = 80;
      return { kind: "polygon", points: [[cx + w, cy - h/2], [cx - w + aw, cy - h/2], [cx - w + aw, cy - ah/2], [cx - w, cy], [cx - w + aw, cy + ah/2], [cx - w + aw, cy + h/2], [cx + w, cy + h/2]] };
    },
  },
  {
    id: "double-arrow",
    name: "Double Arrow",
    category: "Arrows",
    preview: `<polygon points="12,20 36,20 36,10 46,24 36,38 36,28 12,28 12,38 2,24 12,10" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => {
      const w = 120, h = 40, aw = 60, ah = 80;
      return { kind: "polygon", points: [[cx - w + aw, cy - h/2], [cx + w - aw, cy - h/2], [cx + w - aw, cy - ah/2], [cx + w, cy], [cx + w - aw, cy + ah/2], [cx + w - aw, cy + h/2], [cx - w + aw, cy + h/2], [cx - w + aw, cy + ah/2], [cx - w, cy], [cx - w + aw, cy - ah/2]] };
    },
  },
  {
    id: "chevron",
    name: "Chevron",
    category: "Arrows",
    preview: `<polygon points="12,4 32,24 12,44 20,44 40,24 20,4" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => {
      const w = 60, h = 100, t = 40;
      return { kind: "polygon", points: [[cx - w, cy - h], [cx + w - t, cy], [cx - w, cy + h], [cx - w + t, cy + h], [cx + w, cy], [cx - w + t, cy - h]] };
    },
  }
];

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------
const LINE_SHAPES: ShapeDefinition[] = [
  {
    id: "line",
    name: "Line",
    category: "Lines",
    preview: `<line x1="4" y1="24" x2="44" y2="24" stroke="currentColor" stroke-width="2"/>`,
    insert: (cx, cy) => ({ kind: "line", x1: cx - 100, y1: cy, x2: cx + 100, y2: cy }),
  }
];

// ---------------------------------------------------------------------------
// Callouts
// ---------------------------------------------------------------------------
const CALLOUT_SHAPES: ShapeDefinition[] = [
  {
    id: "speech-bubble",
    name: "Speech Bubble",
    category: "Callouts",
    preview: `<path d="M 4 10 Q 4 4 10 4 H 38 Q 44 4 44 10 V 28 Q 44 34 38 34 H 16 L 4 44 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({
      kind: "path",
      d: `M ${cx - 100} ${cy - 60} Q ${cx - 100} ${cy - 80} ${cx - 80} ${cy - 80} H ${cx + 80} Q ${cx + 100} ${cy - 80} ${cx + 100} ${cy - 60} V ${cy + 20} Q ${cx + 100} ${cy + 40} ${cx + 80} ${cy + 40} H ${cx - 40} L ${cx - 100} ${cy + 80} Z`,
    }),
  },
  {
    id: "cloud",
    name: "Cloud",
    category: "Callouts",
    preview: `<path d="M18 35 a 6 6 0 0 1 -2 -11.5 a 10 10 0 0 1 19 -3 a 8 8 0 0 1 7 9.5 a 6 6 0 0 1 -2 5 z" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({
      kind: "path",
      d: `M ${cx - 60} ${cy + 30} a 25 25 0 0 1 -5 -49 a 35 35 0 0 1 68 -15 a 30 30 0 0 1 27 34 a 25 25 0 0 1 -15 30 z`,
    }),
  }
];

// ---------------------------------------------------------------------------
// Banners & Badges
// ---------------------------------------------------------------------------
const BANNER_SHAPES: ShapeDefinition[] = [
  {
    id: "banner",
    name: "Banner",
    category: "Banners & Badges",
    preview: `<path d="M 4 12 L 12 24 L 4 36 L 44 36 L 36 24 L 44 12 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({
      kind: "path",
      d: `M ${cx - 120} ${cy - 40} L ${cx - 80} ${cy} L ${cx - 120} ${cy + 40} L ${cx + 120} ${cy + 40} L ${cx + 80} ${cy} L ${cx + 120} ${cy - 40} Z`,
    }),
  },
  {
    id: "badge",
    name: "Badge",
    category: "Banners & Badges",
    preview: `<path d="M 24 4 L 32 10 L 42 10 L 42 20 L 46 24 L 42 28 L 42 38 L 32 38 L 24 44 L 16 38 L 6 38 L 6 28 L 2 24 L 6 20 L 6 10 L 16 10 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({
      kind: "path",
      d: `M ${cx} ${cy - 100} L ${cx + 40} ${cy - 70} L ${cx + 90} ${cy - 70} L ${cx + 90} ${cy - 20} L ${cx + 110} ${cy} L ${cx + 90} ${cy + 20} L ${cx + 90} ${cy + 70} L ${cx + 40} ${cy + 70} L ${cx} ${cy + 100} L ${cx - 40} ${cy + 70} L ${cx - 90} ${cy + 70} L ${cx - 90} ${cy + 20} L ${cx - 110} ${cy} L ${cx - 90} ${cy - 20} L ${cx - 90} ${cy - 70} L ${cx - 40} ${cy - 70} Z`,
    }),
  },
  {
    id: "shield",
    name: "Shield",
    category: "Banners & Badges",
    preview: `<path d="M 24 4 L 40 10 V 22 C 40 34 24 44 24 44 C 24 44 8 34 8 22 V 10 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({
      kind: "path",
      d: `M ${cx} ${cy - 90} L ${cx + 80} ${cy - 60} V ${cy} C ${cx + 80} ${cy + 60} ${cx} ${cy + 110} ${cx} ${cy + 110} C ${cx} ${cy + 110} ${cx - 80} ${cy + 60} ${cx - 80} ${cy} V ${cy - 60} Z`,
    }),
  }
];

// ---------------------------------------------------------------------------
// Flowchart
// ---------------------------------------------------------------------------
const FLOWCHART_SHAPES: ShapeDefinition[] = [
  {
    id: "document",
    name: "Document",
    category: "Flowchart",
    preview: `<path d="M 12 4 L 28 4 L 36 12 L 36 44 L 12 44 Z M 28 4 L 28 12 L 36 12" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({
      kind: "path",
      d: `M ${cx - 60} ${cy - 100} L ${cx + 20} ${cy - 100} L ${cx + 60} ${cy - 60} L ${cx + 60} ${cy + 100} L ${cx - 60} ${cy + 100} Z M ${cx + 20} ${cy - 100} L ${cx + 20} ${cy - 60} L ${cx + 60} ${cy - 60}`,
    }),
  },
  {
    id: "cylinder",
    name: "Database (Cylinder)",
    category: "Flowchart",
    preview: `<path d="M 8 12 Q 24 4 40 12 L 40 36 Q 24 44 8 36 Z M 8 12 Q 24 20 40 12" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({
      kind: "path",
      d: `M ${cx - 60} ${cy - 80} Q ${cx} ${cy - 120} ${cx + 60} ${cy - 80} L ${cx + 60} ${cy + 80} Q ${cx} ${cy + 120} ${cx - 60} ${cy + 80} Z M ${cx - 60} ${cy - 80} Q ${cx} ${cy - 40} ${cx + 60} ${cy - 80}`
    }),
  },
  {
    id: "decision",
    name: "Decision",
    category: "Flowchart",
    preview: `<polygon points="24,4 44,24 24,44 4,24" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({ kind: "polygon", points: [[cx, cy - 90], [cx + 120, cy], [cx, cy + 90], [cx - 120, cy]] }),
  }
];

export const BASIC_SHAPES = [
  ...GEOMETRY_SHAPES,
  ...LINE_SHAPES,
  ...ARROW_SHAPES,
  ...CALLOUT_SHAPES,
  ...BANNER_SHAPES,
  ...FLOWCHART_SHAPES
];

export const ALL_SHAPES: readonly ShapeDefinition[] = [
  ...BASIC_SHAPES,
  ...EXTRA_SHAPES,
];

export function getShapesByCategory(category: ShapeCategory): ShapeDefinition[] {
  return ALL_SHAPES.filter((s) => s.category === category);
}

export function findShapeById(id: string): ShapeDefinition | undefined {
  return ALL_SHAPES.find((s) => s.id === id);
}

// ---------------------------------------------------------------------------
// Recently used tracking (localStorage)
// ---------------------------------------------------------------------------

const RECENT_STORAGE_KEY = "printrocket:recent-assets";
const RECENT_MAX = 20;

export interface RecentAsset {
  type: "shape" | "icon";
  id: string;
  name: string;
  /** ISO timestamp of last use */
  usedAt: string;
}

export function getRecentAssets(): RecentAsset[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function addRecentAsset(asset: Omit<RecentAsset, "usedAt">): void {
  try {
    const current = getRecentAssets().filter((a) => !(a.type === asset.type && a.id === asset.id));
    const next: RecentAsset[] = [{ ...asset, usedAt: new Date().toISOString() }, ...current].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable — silently ignore.
  }
}
