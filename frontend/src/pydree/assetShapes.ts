"use client";

/**
 * assetShapes — procedural shape definitions for the Assets panel.
 *
 * Each shape carries a 48×48 SVG preview string and an insert factory
 * that returns the ShapeInput needed by `createShapeCommand`. No external
 * SVG files are loaded — every shape is pure SVG markup.
 *
 * One responsibility per file: shape definition data only.
 */

import type { ShapeInput } from "../editor/tools/shapeTool";

export type ShapeCategory = "basic" | "line" | "flowchart";

export interface ShapeDefinition {
  id: string;
  name: string;
  category: ShapeCategory;
  /** Raw SVG content for a 48×48 preview thumbnail. */
  preview: string;
  /** Build a ShapeInput for inserting this shape centered at (cx, cy). */
  insert: (cx: number, cy: number) => ShapeInput;
}

// ---------------------------------------------------------------------------
// Basic shapes
// ---------------------------------------------------------------------------

const BASIC_SHAPES: ShapeDefinition[] = [
  {
    id: "rect",
    name: "Rectangle",
    category: "basic",
    preview: `<rect x="6" y="12" width="36" height="24" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({ kind: "rect", x: cx - 100, y: cy - 60, width: 200, height: 120 }),
  },
  {
    id: "rounded-rect",
    name: "Rounded Rect",
    category: "basic",
    preview: `<rect x="6" y="12" width="36" height="24" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({ kind: "rect", x: cx - 100, y: cy - 60, width: 200, height: 120, rx: 24 }),
  },
  {
    id: "circle",
    name: "Circle",
    category: "basic",
    preview: `<circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({ kind: "ellipse", cx, cy, rx: 80, ry: 80 }),
  },
  {
    id: "ellipse",
    name: "Ellipse",
    category: "basic",
    preview: `<ellipse cx="24" cy="24" rx="18" ry="12" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({ kind: "ellipse", cx, cy, rx: 120, ry: 70 }),
  },
  {
    id: "triangle",
    name: "Triangle",
    category: "basic",
    preview: `<polygon points="24,6 42,42 6,42" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({ kind: "polygon", points: [[cx, cy - 90], [cx - 100, cy + 70], [cx + 100, cy + 70]] }),
  },
  {
    id: "diamond",
    name: "Diamond",
    category: "basic",
    preview: `<polygon points="24,4 44,24 24,44 4,24" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({ kind: "polygon", points: [[cx, cy - 90], [cx + 90, cy], [cx, cy + 90], [cx - 90, cy]] }),
  },
  {
    id: "pentagon",
    name: "Pentagon",
    category: "basic",
    preview: `<polygon points="24,4 43,17 36,40 12,40 5,17" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => {
      const r = 90;
      const pts: [number, number][] = [];
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      return { kind: "polygon", points: pts };
    },
  },
  {
    id: "hexagon",
    name: "Hexagon",
    category: "basic",
    preview: `<polygon points="12,4 36,4 46,24 36,44 12,44 2,24" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => {
      const r = 90;
      const pts: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      return { kind: "polygon", points: pts };
    },
  },
  {
    id: "octagon",
    name: "Octagon",
    category: "basic",
    preview: `<polygon points="16,4 32,4 44,16 44,32 32,44 16,44 4,32 4,16" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => {
      const r = 90;
      const pts: [number, number][] = [];
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8 - Math.PI / 2;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      return { kind: "polygon", points: pts };
    },
  },
  {
    id: "star",
    name: "Star",
    category: "basic",
    preview: `<polygon points="24,2 29,18 46,18 32,28 37,44 24,34 11,44 16,28 2,18 19,18" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => {
      const outerR = 90;
      const innerR = 40;
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI * 2 * i) / 10 - Math.PI / 2;
        const r = i % 2 === 0 ? outerR : innerR;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      return { kind: "polygon", points: pts };
    },
  },
  {
    id: "heart",
    name: "Heart",
    category: "basic",
    preview: `<path d="M24 42 C4 28 4 12 16 8 Q24 4 24 14 Q24 4 32 8 C44 12 44 28 24 42Z" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({
      kind: "path" as const,
      d: `M${cx} ${cy + 60} C${cx - 100} ${cy} ${cx - 100} ${cy - 60} ${cx - 40} ${cy - 70} Q${cx} ${cy - 90} ${cx} ${cy - 40} Q${cx} ${cy - 90} ${cx + 40} ${cy - 70} C${cx + 100} ${cy - 60} ${cx + 100} ${cy} ${cx} ${cy + 60}Z`,
    }),
  },
  {
    id: "cross",
    name: "Cross",
    category: "basic",
    preview: `<polygon points="18,4 30,4 30,18 44,18 44,30 30,30 30,44 18,44 18,30 4,30 4,18 18,18" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => {
      const w = 40;
      const h = 90;
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
  },
  {
    id: "donut",
    name: "Donut",
    category: "basic",
    preview: `<circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="24" cy="24" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({ kind: "ellipse", cx, cy, rx: 80, ry: 80 }),
  },
  {
    id: "chat-bubble",
    name: "Chat Bubble",
    category: "basic",
    preview: `<path d="M 6 10 h 36 v 20 h -24 l -6 6 v -6 h -6 z" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({
      kind: "path",
      d: `M ${cx - 80} ${cy - 50} h 160 v 100 h -100 l -25 25 v -25 h -35 z`,
    }),
  },
  {
    id: "cloud",
    name: "Cloud",
    category: "basic",
    preview: `<path d="M18 35 a 6 6 0 0 1 -2 -11.5 a 10 10 0 0 1 19 -3 a 8 8 0 0 1 7 9.5 a 6 6 0 0 1 -2 5 z" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({
      kind: "path",
      d: `M ${cx - 60} ${cy + 30} a 25 25 0 0 1 -5 -49 a 35 35 0 0 1 68 -15 a 30 30 0 0 1 27 34 a 25 25 0 0 1 -15 30 z`,
    }),
  },
  {
    id: "banner",
    name: "Banner",
    category: "basic",
    preview: `<path d="M 6 12 h 36 l -4 12 l 4 12 h -36 l 4 -12 z" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({
      kind: "path",
      d: `M ${cx - 100} ${cy - 40} h 200 l -20 40 l 20 40 h -200 l 20 -40 z`,
    }),
  },
  {
    id: "badge",
    name: "Badge",
    category: "basic",
    preview: `<polygon points="24,4 29,12 37,9 35,18 43,20 37,26 41,34 33,33 30,41 24,36 18,41 15,33 7,34 11,26 5,20 13,18 11,9 19,12" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({
      kind: "polygon",
      points: [
        [cx, cy - 90], [cx + 25, cy - 65], [cx + 65, cy - 75], [cx + 50, cy - 30],
        [cx + 90, cy - 20], [cx + 60, cy + 10], [cx + 80, cy + 50], [cx + 40, cy + 45],
        [cx + 25, cy + 85], [cx, cy + 60], [cx - 25, cy + 85], [cx - 40, cy + 45],
        [cx - 80, cy + 50], [cx - 60, cy + 10], [cx - 90, cy - 20], [cx - 50, cy - 30],
        [cx - 65, cy - 75], [cx - 25, cy - 65],
      ],
    }),
  },
  {
    id: "shield",
    name: "Shield",
    category: "basic",
    preview: `<path d="M 12 6 h 24 v 18 c 0 8 -12 16 -12 16 c 0 0 -12 -8 -12 -16 z" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({
      kind: "path",
      d: `M ${cx - 80} ${cy - 80} h 160 v 60 c 0 40 -80 90 -80 90 c 0 0 -80 -50 -80 -90 z`,
    }),
  },
];

// ---------------------------------------------------------------------------
// Line shapes
// ---------------------------------------------------------------------------

const LINE_SHAPES: ShapeDefinition[] = [
  {
    id: "line",
    name: "Line",
    category: "line",
    preview: `<line x1="6" y1="42" x2="42" y2="6" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({ kind: "line", x1: cx - 120, y1: cy, x2: cx + 120, y2: cy }),
  },
  {
    id: "arrow",
    name: "Arrow",
    category: "line",
    preview: `<line x1="6" y1="24" x2="38" y2="24" stroke="currentColor" stroke-width="1.5"/><polyline points="32,18 38,24 32,30" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({
      kind: "path" as const,
      d: `M${cx - 120} ${cy} L${cx + 100} ${cy} L${cx + 80} ${cy - 20} M${cx + 100} ${cy} L${cx + 80} ${cy + 20}`,
    }),
  },
  {
    id: "double-arrow",
    name: "Double Arrow",
    category: "line",
    preview: `<line x1="12" y1="24" x2="36" y2="24" stroke="currentColor" stroke-width="1.5"/><polyline points="30,18 36,24 30,30" fill="none" stroke="currentColor" stroke-width="1.5"/><polyline points="18,18 12,24 18,30" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({
      kind: "path" as const,
      d: `M${cx - 100} ${cy} L${cx + 100} ${cy} M${cx + 80} ${cy - 20} L${cx + 100} ${cy} L${cx + 80} ${cy + 20} M${cx - 80} ${cy - 20} L${cx - 100} ${cy} L${cx - 80} ${cy + 20}`,
    }),
  },
  {
    id: "curved-arrow",
    name: "Curved Arrow",
    category: "line",
    preview: `<path d="M8 36 Q24 4 40 24" fill="none" stroke="currentColor" stroke-width="1.5"/><polyline points="36,18 40,24 34,26" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({
      kind: "path" as const,
      d: `M${cx - 100} ${cy + 40} Q${cx} ${cy - 100} ${cx + 100} ${cy} L${cx + 80} ${cy - 20} M${cx + 100} ${cy} L${cx + 80} ${cy + 20}`,
    }),
  },
  {
    id: "zigzag",
    name: "Zigzag",
    category: "line",
    preview: `<polyline points="6,36 14,12 22,36 30,12 38,36" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({
      kind: "path" as const,
      d: `M${cx - 100} ${cy + 40} L${cx - 50} ${cy - 40} L${cx} ${cy + 40} L${cx + 50} ${cy - 40} L${cx + 100} ${cy + 40}`,
    }),
  },
];

// ---------------------------------------------------------------------------
// Flowchart shapes
// ---------------------------------------------------------------------------

const FLOWCHART_SHAPES: ShapeDefinition[] = [
  {
    id: "fc-process",
    name: "Process",
    category: "flowchart",
    preview: `<rect x="4" y="10" width="40" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({ kind: "rect", x: cx - 100, y: cy - 40, width: 200, height: 80 }),
  },
  {
    id: "fc-decision",
    name: "Decision",
    category: "flowchart",
    preview: `<polygon points="24,4 44,24 24,44 4,24" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({ kind: "polygon", points: [[cx, cy - 70], [cx + 100, cy], [cx, cy + 70], [cx - 100, cy]] }),
  },
  {
    id: "fc-data",
    name: "Data",
    category: "flowchart",
    preview: `<polygon points="10,8 44,8 38,40 4,40" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({
      kind: "polygon",
      points: [[cx - 80, cy - 40], [cx + 100, cy - 40], [cx + 80, cy + 40], [cx - 100, cy + 40]],
    }),
  },
  {
    id: "fc-terminator",
    name: "Terminator",
    category: "flowchart",
    preview: `<rect x="4" y="14" width="40" height="20" rx="10" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({ kind: "rect", x: cx - 100, y: cy - 30, width: 200, height: 60, rx: 30 }),
  },
  {
    id: "fc-database",
    name: "Database",
    category: "flowchart",
    preview: `<ellipse cx="24" cy="12" rx="18" ry="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 12 L6 36 Q6 42 24 42 Q42 42 42 36 L42 12" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({ kind: "rect", x: cx - 60, y: cy - 60, width: 120, height: 120, rx: 8 }),
  },
  {
    id: "fc-document",
    name: "Document",
    category: "flowchart",
    preview: `<path d="M4 8 L44 8 L44 34 Q34 28 24 34 Q14 40 4 34 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({ kind: "rect", x: cx - 100, y: cy - 50, width: 200, height: 100 }),
  },
  {
    id: "fc-delay",
    name: "Delay",
    category: "flowchart",
    preview: `<path d="M4 8 L30 8 Q44 8 44 24 Q44 40 30 40 L4 40 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    insert: (cx, cy) => ({ kind: "rect", x: cx - 100, y: cy - 40, width: 200, height: 80, rx: 40 }),
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const ALL_SHAPES: readonly ShapeDefinition[] = [
  ...BASIC_SHAPES,
  ...LINE_SHAPES,
  ...FLOWCHART_SHAPES,
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
