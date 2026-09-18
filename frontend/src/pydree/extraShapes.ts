import type { ShapeDefinition, ShapeCategory } from "./assetShapes";

export const EXTRA_SHAPES: ShapeDefinition[] = [
  {
    id: "lucide-arrow-big-down",
    name: "Arrow Big Down",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M9 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6a1 1 0 0 0 1 1h3.293a.707.707 0 0 1 .5 1.207l-7.086 7.086a1 1 0 0 1-1.414 0l-7.086-7.086a.707.707 0 0 1 .5-1.207H8a1 1 0 0 0 1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M9 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6a1 1 0 0 0 1 1h3.293a.707.707 0 0 1 .5 1.207l-7.086 7.086a1 1 0 0 1-1.414 0l-7.086-7.086a.707.707 0 0 1 .5-1.207H8a1 1 0 0 0 1-1z",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-big-down-dash",
    name: "Arrow Big Down Dash",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M14 8a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h3.293a.707.707 0 0 1 .5 1.207l-6.939 6.939a1.207 1.207 0 0 1-1.708 0l-6.94-6.94a.707.707 0 0 1 .5-1.206H8a1 1 0 0 0 1-1V9a1 1 0 0 1 1-1zM9 4h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M14 8a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h3.293a.707.707 0 0 1 .5 1.207l-6.939 6.939a1.207 1.207 0 0 1-1.708 0l-6.94-6.94a.707.707 0 0 1 .5-1.206H8a1 1 0 0 0 1-1V9a1 1 0 0 1 1-1zM9 4h6",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-big-left",
    name: "Arrow Big Left",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10.793 19.793a.707.707 0 0 0 1.207-.5V16a1 1 0 0 1 1-1h6a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1h-6a1 1 0 0 1-1-1V4.707a.707.707 0 0 0-1.207-.5l-6.94 6.94a1.207 1.207 0 0 0 0 1.707z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10.793 19.793a.707.707 0 0 0 1.207-.5V16a1 1 0 0 1 1-1h6a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1h-6a1 1 0 0 1-1-1V4.707a.707.707 0 0 0-1.207-.5l-6.94 6.94a1.207 1.207 0 0 0 0 1.707z",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-big-left-dash",
    name: "Arrow Big Left Dash",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M13 9a1 1 0 0 1-1-1V4.707a.707.707 0 0 0-1.207-.5l-6.94 6.94a1.207 1.207 0 0 0 0 1.707l6.94 6.94a.707.707 0 0 0 1.207-.5V16a1 1 0 0 1 1-1h2a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1zm7 0v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M13 9a1 1 0 0 1-1-1V4.707a.707.707 0 0 0-1.207-.5l-6.94 6.94a1.207 1.207 0 0 0 0 1.707l6.94 6.94a.707.707 0 0 0 1.207-.5V16a1 1 0 0 1 1-1h2a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1zm7 0v6",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-big-right",
    name: "Arrow Big Right",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M13.207 19.793a.707.707 0 0 1-1.207-.5V16a1 1 0 0 0-1-1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h6a1 1 0 0 0 1-1V4.707a.707.707 0 0 1 1.207-.5l6.94 6.94a1.207 1.207 0 0 1 0 1.707z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M13.207 19.793a.707.707 0 0 1-1.207-.5V16a1 1 0 0 0-1-1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h6a1 1 0 0 0 1-1V4.707a.707.707 0 0 1 1.207-.5l6.94 6.94a1.207 1.207 0 0 1 0 1.707z",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-big-right-dash",
    name: "Arrow Big Right Dash",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M11 9a1 1 0 0 0 1-1V4.707a.707.707 0 0 1 1.207-.5l6.94 6.94a1.207 1.207 0 0 1 0 1.707l-6.94 6.94a.707.707 0 0 1-1.207-.5V16a1 1 0 0 0-1-1H9a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1zM4 9v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M11 9a1 1 0 0 0 1-1V4.707a.707.707 0 0 1 1.207-.5l6.94 6.94a1.207 1.207 0 0 1 0 1.707l-6.94 6.94a.707.707 0 0 1-1.207-.5V16a1 1 0 0 0-1-1H9a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1zM4 9v6",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-big-up",
    name: "Arrow Big Up",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M9 19a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-6a1 1 0 0 1 1-1h3.293a.707.707 0 0 0 .5-1.207l-7.086-7.086a1 1 0 0 0-1.414 0l-7.086 7.086a.707.707 0 0 0 .5 1.207H8a1 1 0 0 1 1 1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M9 19a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-6a1 1 0 0 1 1-1h3.293a.707.707 0 0 0 .5-1.207l-7.086-7.086a1 1 0 0 0-1.414 0l-7.086 7.086a.707.707 0 0 0 .5 1.207H8a1 1 0 0 1 1 1z",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-big-up-dash",
    name: "Arrow Big Up Dash",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M14 16a1 1 0 0 0 1-1v-2a1 1 0 0 1 1-1h3.293a.707.707 0 0 0 .5-1.207l-6.939-6.939a1.207 1.207 0 0 0-1.708 0l-6.94 6.94a.707.707 0 0 0 .5 1.206H8a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1zm-5 4h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M14 16a1 1 0 0 0 1-1v-2a1 1 0 0 1 1-1h3.293a.707.707 0 0 0 .5-1.207l-6.939-6.939a1.207 1.207 0 0 0-1.708 0l-6.94 6.94a.707.707 0 0 0 .5 1.206H8a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1zm-5 4h6",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-down",
    name: "Arrow Down",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 5v14m7-7l-7 7l-7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 5v14m7-7l-7 7l-7-7",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-down-0-1",
    name: "Arrow Down 0 1",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m3 16l4 4l4-4m-4 4V4 M17 20v-6h-2m0 6h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m3 16l4 4l4-4m-4 4V4 M17 20v-6h-2m0 6h4",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-down-1-0",
    name: "Arrow Down 1 0",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m3 16l4 4l4-4m-4 4V4m10 6V4h-2m0 6h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m3 16l4 4l4-4m-4 4V4m10 6V4h-2m0 6h4",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-down-a-z",
    name: "Arrow Down A Z",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m3 16l4 4l4-4m-4 4V4m13 4h-5m0 2V6.5a2.5 2.5 0 0 1 5 0V10m-5 4h5l-5 6h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m3 16l4 4l4-4m-4 4V4m13 4h-5m0 2V6.5a2.5 2.5 0 0 1 5 0V10m-5 4h5l-5 6h5",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-down-from-line",
    name: "Arrow Down From Line",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M19 3H5m7 18V7m-6 8l6 6l6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M19 3H5m7 18V7m-6 8l6 6l6-6",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-down-left",
    name: "Arrow Down Left",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M17 7L7 17m10 0H7V7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M17 7L7 17m10 0H7V7",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-down-narrow-wide",
    name: "Arrow Down Narrow Wide",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m3 16l4 4l4-4m-4 4V4m4 0h4m-4 4h7m-7 4h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m3 16l4 4l4-4m-4 4V4m4 0h4m-4 4h7m-7 4h10",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-down-right",
    name: "Arrow Down Right",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m7 7l10 10m0-10v10H7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m7 7l10 10m0-10v10H7",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-down-to-dot",
    name: "Arrow Down To Dot",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 2v14m7-7l-7 7l-7-7 M 11.0 21.0 a 1.0 1.0 0 1 0 2.0 0 a 1.0 1.0 0 1 0 -2.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 2v14m7-7l-7 7l-7-7 M 11.0 21.0 a 1.0 1.0 0 1 0 2.0 0 a 1.0 1.0 0 1 0 -2.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-down-to-line",
    name: "Arrow Down To Line",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 17V3m-6 8l6 6l6-6m1 10H5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 17V3m-6 8l6 6l6-6m1 10H5",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-down-up",
    name: "Arrow Down Up",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m3 16l4 4l4-4m-4 4V4m14 4l-4-4l-4 4m4-4v16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m3 16l4 4l4-4m-4 4V4m14 4l-4-4l-4 4m4-4v16",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-down-wide-narrow",
    name: "Arrow Down Wide Narrow",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m3 16l4 4l4-4m-4 4V4m4 0h10M11 8h7m-7 4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m3 16l4 4l4-4m-4 4V4m4 0h10M11 8h7m-7 4h4",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-down-z-a",
    name: "Arrow Down Z A",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m3 16l4 4l4-4M7 4v16m8-16h5l-5 6h5m-5 10v-3.5a2.5 2.5 0 0 1 5 0V20m0-2h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m3 16l4 4l4-4M7 4v16m8-16h5l-5 6h5m-5 10v-3.5a2.5 2.5 0 0 1 5 0V20m0-2h-5",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-left",
    name: "Arrow Left",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m12 19l-7-7l7-7m7 7H5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m12 19l-7-7l7-7m7 7H5",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-left-from-line",
    name: "Arrow Left From Line",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m9 6l-6 6l6 6m-6-6h14m4 7V5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m9 6l-6 6l6 6m-6-6h14m4 7V5",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-left-right",
    name: "Arrow Left Right",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M8 3L4 7l4 4M4 7h16m-4 14l4-4l-4-4m4 4H4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M8 3L4 7l4 4M4 7h16m-4 14l4-4l-4-4m4 4H4",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-left-to-line",
    name: "Arrow Left To Line",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M3 19V5m10 1l-6 6l6 6m-6-6h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M3 19V5m10 1l-6 6l6 6m-6-6h14",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-right",
    name: "Arrow Right",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M5 12h14m-7-7l7 7l-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M5 12h14m-7-7l7 7l-7 7",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-right-from-line",
    name: "Arrow Right From Line",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M3 5v14m18-7H7m8 6l6-6l-6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M3 5v14m18-7H7m8 6l6-6l-6-6",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-right-left",
    name: "Arrow Right Left",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m16 3l4 4l-4 4m4-4H4m4 14l-4-4l4-4m-4 4h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m16 3l4 4l-4 4m4-4H4m4 14l-4-4l4-4m-4 4h16",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-right-to-line",
    name: "Arrow Right To Line",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M17 12H3m8 6l6-6l-6-6m10-1v14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M17 12H3m8 6l6-6l-6-6m10-1v14",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-up",
    name: "Arrow Up",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m5 12l7-7l7 7m-7 7V5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m5 12l7-7l7 7m-7 7V5",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-up-0-1",
    name: "Arrow Up 0 1",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m3 8l4-4l4 4M7 4v16 M17 20v-6h-2m0 6h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m3 8l4-4l4 4M7 4v16 M17 20v-6h-2m0 6h4",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-up-1-0",
    name: "Arrow Up 1 0",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m3 8l4-4l4 4M7 4v16m10-10V4h-2m0 6h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m3 8l4-4l4 4M7 4v16m10-10V4h-2m0 6h4",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-up-a-z",
    name: "Arrow Up A Z",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m3 8l4-4l4 4M7 4v16M20 8h-5m0 2V6.5a2.5 2.5 0 0 1 5 0V10m-5 4h5l-5 6h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m3 8l4-4l4 4M7 4v16M20 8h-5m0 2V6.5a2.5 2.5 0 0 1 5 0V10m-5 4h5l-5 6h5",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-up-down",
    name: "Arrow Up Down",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m21 16l-4 4l-4-4m4 4V4M3 8l4-4l4 4M7 4v16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m21 16l-4 4l-4-4m4 4V4M3 8l4-4l4 4M7 4v16",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-up-from-dot",
    name: "Arrow Up From Dot",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m5 9l7-7l7 7m-7 7V2 M 11.0 21.0 a 1.0 1.0 0 1 0 2.0 0 a 1.0 1.0 0 1 0 -2.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m5 9l7-7l7 7m-7 7V2 M 11.0 21.0 a 1.0 1.0 0 1 0 2.0 0 a 1.0 1.0 0 1 0 -2.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-up-from-line",
    name: "Arrow Up From Line",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m18 9l-6-6l-6 6m6-6v14m-7 4h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m18 9l-6-6l-6 6m6-6v14m-7 4h14",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-up-left",
    name: "Arrow Up Left",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M7 17V7h10m0 10L7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M7 17V7h10m0 10L7 7",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-up-narrow-wide",
    name: "Arrow Up Narrow Wide",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m3 8l4-4l4 4M7 4v16m4-8h4m-4 4h7m-7 4h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m3 8l4-4l4 4M7 4v16m4-8h4m-4 4h7m-7 4h10",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-up-right",
    name: "Arrow Up Right",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M7 7h10v10M7 17L17 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M7 7h10v10M7 17L17 7",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-up-to-line",
    name: "Arrow Up To Line",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M5 3h14m-1 10l-6-6l-6 6m6-6v14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M5 3h14m-1 10l-6-6l-6 6m6-6v14",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-up-wide-narrow",
    name: "Arrow Up Wide Narrow",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m3 8l4-4l4 4M7 4v16m4-8h10m-10 4h7m-7 4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m3 8l4-4l4 4M7 4v16m4-8h10m-10 4h7m-7 4h4",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrow-up-z-a",
    name: "Arrow Up Z A",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m3 8l4-4l4 4M7 4v16m8-16h5l-5 6h5m-5 10v-3.5a2.5 2.5 0 0 1 5 0V20m0-2h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m3 8l4-4l4 4M7 4v16m8-16h5l-5 6h5m-5 10v-3.5a2.5 2.5 0 0 1 5 0V20m0-2h-5",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-bell",
    name: "Bell",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10.268 21a2 2 0 0 0 3.464 0m-10.47-5.674A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10.268 21a2 2 0 0 0 3.464 0m-10.47-5.674A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-bell-check",
    name: "Bell Check",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10.268 21a2 2 0 0 0 3.464 0M15 8l2 2l4-4m-4.14-1.518A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326m0 0A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673c-.531-.548-1.075-1.109-1.537-1.873" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10.268 21a2 2 0 0 0 3.464 0M15 8l2 2l4-4m-4.14-1.518A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326m0 0A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673c-.531-.548-1.075-1.109-1.537-1.873",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-bell-dot",
    name: "Bell Dot",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10.268 21a2 2 0 0 0 3.464 0M11.68 2.009A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673c-.824-.85-1.678-1.731-2.21-3.348 M 15.0 5.0 a 3.0 3.0 0 1 0 6.0 0 a 3.0 3.0 0 1 0 -6.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10.268 21a2 2 0 0 0 3.464 0M11.68 2.009A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673c-.824-.85-1.678-1.731-2.21-3.348 M 15.0 5.0 a 3.0 3.0 0 1 0 6.0 0 a 3.0 3.0 0 1 0 -6.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-bell-electric",
    name: "Bell Electric",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M18.518 17.347A7 7 0 0 1 14 19m4.8-15A11 11 0 0 1 20 9M9 9h.01 M 18.0 16.0 a 2.0 2.0 0 1 0 4.0 0 a 2.0 2.0 0 1 0 -4.0 0 M 2.0 9.0 a 7.0 7.0 0 1 0 14.0 0 a 7.0 7.0 0 1 0 -14.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M18.518 17.347A7 7 0 0 1 14 19m4.8-15A11 11 0 0 1 20 9M9 9h.01 M 18.0 16.0 a 2.0 2.0 0 1 0 4.0 0 a 2.0 2.0 0 1 0 -4.0 0 M 2.0 9.0 a 7.0 7.0 0 1 0 14.0 0 a 7.0 7.0 0 1 0 -14.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-bell-minus",
    name: "Bell Minus",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10.268 21a2 2 0 0 0 3.464 0M15 8h6m-4.757-4.243A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673A9.4 9.4 0 0 1 18.667 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10.268 21a2 2 0 0 0 3.464 0M15 8h6m-4.757-4.243A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673A9.4 9.4 0 0 1 18.667 12",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-bell-off",
    name: "Bell Off",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10.268 21a2 2 0 0 0 3.464 0M17 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 .258-1.742M2 2l20 20M8.668 3.01A6 6 0 0 1 18 8c0 2.687.77 4.653 1.707 6.05" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10.268 21a2 2 0 0 0 3.464 0M17 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 .258-1.742M2 2l20 20M8.668 3.01A6 6 0 0 1 18 8c0 2.687.77 4.653 1.707 6.05",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-bell-plus",
    name: "Bell Plus",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10.268 21a2 2 0 0 0 3.464 0M15 8h6m-3-3v6m2.002 3.464a9 9 0 0 0 .738.863A1 1 0 0 1 20 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 8.75-5.332" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10.268 21a2 2 0 0 0 3.464 0M15 8h6m-3-3v6m2.002 3.464a9 9 0 0 0 .738.863A1 1 0 0 1 20 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 8.75-5.332",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-bell-ring",
    name: "Bell Ring",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10.268 21a2 2 0 0 0 3.464 0M22 8c0-2.3-.8-4.3-2-6M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326M4 2C2.8 3.7 2 5.7 2 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10.268 21a2 2 0 0 0 3.464 0M22 8c0-2.3-.8-4.3-2-6M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326M4 2C2.8 3.7 2 5.7 2 8",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-calendar",
    name: "Calendar",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M8 2v3m8-3v3 M3 9h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M8 2v3m8-3v3 M3 9h18",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-cloud-alert",
    name: "Cloud Alert",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 12v4m0 4h.01m-3.882-3.051A7 7 0 1 1 15.71 8h1.79a1 1 0 0 1 0 9h-1.642" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 12v4m0 4h.01m-3.882-3.051A7 7 0 1 1 15.71 8h1.79a1 1 0 0 1 0 9h-1.642",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-cloud-backup",
    name: "Cloud Backup",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M21 15.251A4.5 4.5 0 0 0 17.5 8h-1.79A7 7 0 1 0 3 13.607 M7 11v4h4 M8 19a5 5 0 0 0 9-3a4.5 4.5 0 0 0-4.5-4.5a4.82 4.82 0 0 0-3.41 1.41L7 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M21 15.251A4.5 4.5 0 0 0 17.5 8h-1.79A7 7 0 1 0 3 13.607 M7 11v4h4 M8 19a5 5 0 0 0 9-3a4.5 4.5 0 0 0-4.5-4.5a4.82 4.82 0 0 0-3.41 1.41L7 15",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-cloud-check",
    name: "Cloud Check",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m17 15l-5.5 5.5L9 18 M5.516 16.07A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 3.501 7.327" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m17 15l-5.5 5.5L9 18 M5.516 16.07A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 3.501 7.327",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-cloud-cog",
    name: "Cloud Cog",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m10.852 19.772l-.383.924m2.679-6.468l.383-.923m-.383 6.467a3 3 0 1 0-2.296-5.544l-.383-.923 m13.53 20.696l-.382-.924a3 3 0 1 1-2.296-5.544m3.92 1.624l.923-.383m-.923 2.679l.923.383 M4.2 15.1a7 7 0 1 1 9.93-9.858A7 7 0 0 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.2m-10.772-.348l-.923-.383m.923 2.679l-.923.383" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m10.852 19.772l-.383.924m2.679-6.468l.383-.923m-.383 6.467a3 3 0 1 0-2.296-5.544l-.383-.923 m13.53 20.696l-.382-.924a3 3 0 1 1-2.296-5.544m3.92 1.624l.923-.383m-.923 2.679l.923.383 M4.2 15.1a7 7 0 1 1 9.93-9.858A7 7 0 0 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.2m-10.772-.348l-.923-.383m.923 2.679l-.923.383",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-cloud-download",
    name: "Cloud Download",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 13v8l-4-4m4 4l4-4 M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 13v8l-4-4m4 4l4-4 M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-cloud-drizzle",
    name: "Cloud Drizzle",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M8 19v1m0-6v1m8 4v1m0-6v1m-4 6v1m0-6v1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M8 19v1m0-6v1m8 4v1m0-6v1m-4 6v1m0-6v1",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-cloud-fog",
    name: "Cloud Fog",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M16 17H7m10 4H9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M16 17H7m10 4H9",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-cloud-hail",
    name: "Cloud Hail",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M16 14v2m-8-2v2m8 4h.01M8 20h.01M12 16v2m0 4h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M16 14v2m-8-2v2m8 4h.01M8 20h.01M12 16v2m0 4h.01",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-cloud-lightning",
    name: "Cloud Lightning",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973 m13 12l-3 5h4l-3 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973 m13 12l-3 5h4l-3 5",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-cloud-moon",
    name: "Cloud Moon",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M13 16a3 3 0 0 1 0 6H7a5 5 0 1 1 4.9-6zm5.376-1.488a6 6 0 0 0 3.461-4.127c.148-.625-.659-.97-1.248-.714a4 4 0 0 1-5.259-5.26c.255-.589-.09-1.395-.716-1.248a6 6 0 0 0-4.594 5.36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M13 16a3 3 0 0 1 0 6H7a5 5 0 1 1 4.9-6zm5.376-1.488a6 6 0 0 0 3.461-4.127c.148-.625-.659-.97-1.248-.714a4 4 0 0 1-5.259-5.26c.255-.589-.09-1.395-.716-1.248a6 6 0 0 0-4.594 5.36",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-cloud-moon-rain",
    name: "Cloud Moon Rain",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M11 20v2m7.376-7.488a6 6 0 0 0 3.461-4.127c.148-.625-.659-.97-1.248-.714a4 4 0 0 1-5.259-5.26c.255-.589-.09-1.395-.716-1.248a6 6 0 0 0-4.594 5.36M3 20a5 5 0 1 1 8.9-4H13a3 3 0 0 1 2 5.24M7 19v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M11 20v2m7.376-7.488a6 6 0 0 0 3.461-4.127c.148-.625-.659-.97-1.248-.714a4 4 0 0 1-5.259-5.26c.255-.589-.09-1.395-.716-1.248a6 6 0 0 0-4.594 5.36M3 20a5 5 0 1 1 8.9-4H13a3 3 0 0 1 2 5.24M7 19v2",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-cloud-off",
    name: "Cloud Off",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10.94 5.274A7 7 0 0 1 15.71 10h1.79a4.5 4.5 0 0 1 4.222 6.057m-2.926 2.753A4.5 4.5 0 0 1 17.5 19H9A7 7 0 0 1 5.79 5.78M2 2l20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10.94 5.274A7 7 0 0 1 15.71 10h1.79a4.5 4.5 0 0 1 4.222 6.057m-2.926 2.753A4.5 4.5 0 0 1 17.5 19H9A7 7 0 0 1 5.79 5.78M2 2l20 20",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-cloud-rain",
    name: "Cloud Rain",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M16 14v6m-8-6v6m4-4v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M16 14v6m-8-6v6m4-4v6",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-cloud-rain-wind",
    name: "Cloud Rain Wind",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M9.2 22l3-7M9 13l-3 7m11-7l-3 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M9.2 22l3-7M9 13l-3 7m11-7l-3 7",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-cloud-snow",
    name: "Cloud Snow",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-cloud-sun",
    name: "Cloud Sun",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 2v2m-7.07.93l1.41 1.41M20 12h2m-2.93-7.07l-1.41 1.41m-1.713 6.31a4 4 0 0 0-5.925-4.128M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 2v2m-7.07.93l1.41 1.41M20 12h2m-2.93-7.07l-1.41 1.41m-1.713 6.31a4 4 0 0 0-5.925-4.128M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-cloud-sun-rain",
    name: "Cloud Sun Rain",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 2v2m-7.07.93l1.41 1.41M20 12h2m-2.93-7.07l-1.41 1.41m-1.713 6.31a4 4 0 0 0-5.925-4.128M3 20a5 5 0 1 1 8.9-4H13a3 3 0 0 1 2 5.24M11 20v2m-4-3v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 2v2m-7.07.93l1.41 1.41M20 12h2m-2.93-7.07l-1.41 1.41m-1.713 6.31a4 4 0 0 0-5.925-4.128M3 20a5 5 0 1 1 8.9-4H13a3 3 0 0 1 2 5.24M11 20v2m-4-3v2",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-cloud-sync",
    name: "Cloud Sync",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m17 18l-1.535 1.605a5 5 0 0 1-8-1.5 M17 22v-4h-4m7.996-2.749A4.5 4.5 0 0 0 17.495 8h-1.79a7 7 0 1 0-12.709 5.607 M7 10v4h4 m7 14l1.535-1.605a5 5 0 0 1 8 1.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m17 18l-1.535 1.605a5 5 0 0 1-8-1.5 M17 22v-4h-4m7.996-2.749A4.5 4.5 0 0 0 17.495 8h-1.79a7 7 0 1 0-12.709 5.607 M7 10v4h4 m7 14l1.535-1.605a5 5 0 0 1 8 1.5",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-cloud-upload",
    name: "Cloud Upload",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 13v8m-8-6.101A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242 m8 17l4-4l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 13v8m-8-6.101A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242 m8 17l4-4l4 4",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-database",
    name: "Database",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M3 5v14a9 3 0 0 0 18 0V5 M3 12a9 3 0 0 0 18 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M3 5v14a9 3 0 0 0 18 0V5 M3 12a9 3 0 0 0 18 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-database-arrow-down",
    name: "Database Arrow Down",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m16 19l3 3l3-3m-3-3v6m2-9.464V5M3 12a9 3 0 0 0 12.182 2.806 M3 5v14a9 3 0 0 0 10.318 2.968" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m16 19l3 3l3-3m-3-3v6m2-9.464V5M3 12a9 3 0 0 0 12.182 2.806 M3 5v14a9 3 0 0 0 10.318 2.968",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-database-arrow-up",
    name: "Database Arrow Up",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M19 22v-6m2-3.464V5m1 14l-3-3l-3 3M3 12a9 3 0 0 0 11.457 2.886 M3 5v14a9 3 0 0 0 10.318 2.968" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M19 22v-6m2-3.464V5m1 14l-3-3l-3 3M3 12a9 3 0 0 0 11.457 2.886 M3 5v14a9 3 0 0 0 10.318 2.968",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-database-backup",
    name: "Database Backup",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M3 12a9 3 0 0 0 5 2.69M21 9.3V5 M3 5v14a9 3 0 0 0 6.47 2.88M12 12v4h4 M13 20a5 5 0 0 0 9-3a4.5 4.5 0 0 0-4.5-4.5c-1.33 0-2.54.54-3.41 1.41L12 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M3 12a9 3 0 0 0 5 2.69M21 9.3V5 M3 5v14a9 3 0 0 0 6.47 2.88M12 12v4h4 M13 20a5 5 0 0 0 9-3a4.5 4.5 0 0 0-4.5-4.5c-1.33 0-2.54.54-3.41 1.41L12 16",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-database-check",
    name: "Database Check",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m16 19l2 2l4-4m-1-3.873V5M3 12a9 3 0 0 0 18 0 M3 5v14a9 3 0 0 0 10.318 2.968" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m16 19l2 2l4-4m-1-3.873V5M3 12a9 3 0 0 0 18 0 M3 5v14a9 3 0 0 0 10.318 2.968",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-database-minus",
    name: "Database Minus",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M21 15V5m1 14h-6M3 12a9 3 0 0 0 18 0 M3 5v14a9 3 0 0 0 10.318 2.968" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M21 15V5m1 14h-6M3 12a9 3 0 0 0 18 0 M3 5v14a9 3 0 0 0 10.318 2.968",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-database-plus",
    name: "Database Plus",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M19 16v6m2-9.464V5m1 14h-6M3 12a9 3 0 0 0 12.182 2.806 M3 5v14a9 3 0 0 0 10.318 2.968" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M19 16v6m2-9.464V5m1 14h-6M3 12a9 3 0 0 0 12.182 2.806 M3 5v14a9 3 0 0 0 10.318 2.968",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-database-search",
    name: "Database Search",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M21 11.693V5m1 17l-1.875-1.875M3 12a9 3 0 0 0 8.697 2.998 M3 5v14a9 3 0 0 0 9.28 2.999 M 15.0 18.0 a 3.0 3.0 0 1 0 6.0 0 a 3.0 3.0 0 1 0 -6.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M21 11.693V5m1 17l-1.875-1.875M3 12a9 3 0 0 0 8.697 2.998 M3 5v14a9 3 0 0 0 9.28 2.999 M 15.0 18.0 a 3.0 3.0 0 1 0 6.0 0 a 3.0 3.0 0 1 0 -6.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-database-x",
    name: "Database X",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m17 17l5 5m-2.677-8.256A9 3 0 0 0 21 12m0 1.127V5m1 12l-5 5M3 12a9 3 0 0 0 10.563 2.954 M3 5v14a9 3 0 0 0 10 2.981" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m17 17l5 5m-2.677-8.256A9 3 0 0 0 21 12m0 1.127V5m1 12l-5 5M3 12a9 3 0 0 0 10.563 2.954 M3 5v14a9 3 0 0 0 10 2.981",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-database-zap",
    name: "Database Zap",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M3 5v14a9 3 0 0 0 12 2.84M21 5v3m0 4l-3 5h4l-3 5 M3 12a9 3 0 0 0 11.59 2.87" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M3 5v14a9 3 0 0 0 12 2.84M21 5v3m0 4l-3 5h4l-3 5 M3 12a9 3 0 0 0 11.59 2.87",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-download",
    name: "Download",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 15V3m9 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 m7 10l5 5l5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 15V3m9 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 m7 10l5 5l5-5",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-file-archive",
    name: "File Archive",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M13.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v11.5 M14 2v5a1 1 0 0 0 1 1h5M8 12v-1m0 7v-2m0-9V6 M 6.0 20.0 a 2.0 2.0 0 1 0 4.0 0 a 2.0 2.0 0 1 0 -4.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M13.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v11.5 M14 2v5a1 1 0 0 0 1 1h5M8 12v-1m0 7v-2m0-9V6 M 6.0 20.0 a 2.0 2.0 0 1 0 4.0 0 a 2.0 2.0 0 1 0 -4.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-file-audio",
    name: "File Audio",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M17.5 22h.5a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3 M14 2v4a2 2 0 0 0 2 2h4M2 19a2 2 0 1 1 4 0v1a2 2 0 1 1-4 0v-4a6 6 0 0 1 12 0v4a2 2 0 1 1-4 0v-1a2 2 0 1 1 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M17.5 22h.5a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3 M14 2v4a2 2 0 0 0 2 2h4M2 19a2 2 0 1 1 4 0v1a2 2 0 1 1-4 0v-4a6 6 0 0 1 12 0v4a2 2 0 1 1-4 0v-1a2 2 0 1 1 4 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-file-audio-2",
    name: "File Audio 2",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v2 M14 2v4a2 2 0 0 0 2 2h4 M2 17v-3a4 4 0 0 1 8 0v3 M 2.0 17.0 a 1.0 1.0 0 1 0 2.0 0 a 1.0 1.0 0 1 0 -2.0 0 M 8.0 17.0 a 1.0 1.0 0 1 0 2.0 0 a 1.0 1.0 0 1 0 -2.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v2 M14 2v4a2 2 0 0 0 2 2h4 M2 17v-3a4 4 0 0 1 8 0v3 M 2.0 17.0 a 1.0 1.0 0 1 0 2.0 0 a 1.0 1.0 0 1 0 -2.0 0 M 8.0 17.0 a 1.0 1.0 0 1 0 2.0 0 a 1.0 1.0 0 1 0 -2.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-file-axis-3d",
    name: "File Axis 3D",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5M8 18l4-4m-4-4v8h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5M8 18l4-4m-4-4v8h8",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-file-badge",
    name: "File Badge",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M13 22h5a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v3.3 M14 2v5a1 1 0 0 0 1 1h5M7.69 16.479l1.29 4.88a.5.5 0 0 1-.698.591l-1.843-.849a1 1 0 0 0-.879.001l-1.846.85a.5.5 0 0 1-.692-.593l1.29-4.88 M 3.0 14.0 a 3.0 3.0 0 1 0 6.0 0 a 3.0 3.0 0 1 0 -6.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M13 22h5a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v3.3 M14 2v5a1 1 0 0 0 1 1h5M7.69 16.479l1.29 4.88a.5.5 0 0 1-.698.591l-1.843-.849a1 1 0 0 0-.879.001l-1.846.85a.5.5 0 0 1-.692-.593l1.29-4.88 M 3.0 14.0 a 3.0 3.0 0 1 0 6.0 0 a 3.0 3.0 0 1 0 -6.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-file-badge-2",
    name: "File Badge 2",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m13.69 12.479l1.29 4.88a.5.5 0 0 1-.697.591l-1.844-.849a1 1 0 0 0-.88.001l-1.846.85a.5.5 0 0 1-.693-.593l1.29-4.88 M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z M 9.0 10.0 a 3.0 3.0 0 1 0 6.0 0 a 3.0 3.0 0 1 0 -6.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m13.69 12.479l1.29 4.88a.5.5 0 0 1-.697.591l-1.844-.849a1 1 0 0 0-.88.001l-1.846.85a.5.5 0 0 1-.693-.593l1.29-4.88 M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z M 9.0 10.0 a 3.0 3.0 0 1 0 6.0 0 a 3.0 3.0 0 1 0 -6.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-file-box",
    name: "File Box",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M14 2v5a1 1 0 0 0 1 1h5 M14.692 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v3.804 M2.264 13.752L7 16.5l4.737-2.748 M2.995 13.014A2 2 0 0 0 2 14.744v3.516a2 2 0 0 0 .996 1.73l3 1.74a2 2 0 0 0 2.008 0l3-1.74A2 2 0 0 0 12 18.26v-3.517a2 2 0 0 0-.995-1.73l-3-1.742a2 2 0 0 0-1.892-.064zM7 16.5V22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M14 2v5a1 1 0 0 0 1 1h5 M14.692 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v3.804 M2.264 13.752L7 16.5l4.737-2.748 M2.995 13.014A2 2 0 0 0 2 14.744v3.516a2 2 0 0 0 .996 1.73l3 1.74a2 2 0 0 0 2.008 0l3-1.74A2 2 0 0 0 12 18.26v-3.517a2 2 0 0 0-.995-1.73l-3-1.742a2 2 0 0 0-1.892-.064zM7 16.5V22",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-file-braces",
    name: "File Braces",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5m-10 4a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1a1 1 0 0 1 1 1v1a1 1 0 0 0 1 1m4 0a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1a1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5m-10 4a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1a1 1 0 0 1 1 1v1a1 1 0 0 0 1 1m4 0a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1a1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-file-braces-corner",
    name: "File Braces Corner",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M14 22h4a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v6 M14 2v5a1 1 0 0 0 1 1h5M5 14a1 1 0 0 0-1 1v2a1 1 0 0 1-1 1a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1m4 0a1 1 0 0 0 1-1v-2a1 1 0 0 1 1-1a1 1 0 0 1-1-1v-2a1 1 0 0 0-1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M14 22h4a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v6 M14 2v5a1 1 0 0 0 1 1h5M5 14a1 1 0 0 0-1 1v2a1 1 0 0 1-1 1a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1m4 0a1 1 0 0 0 1-1v-2a1 1 0 0 1 1-1a1 1 0 0 1-1-1v-2a1 1 0 0 0-1-1",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-file-chart-column",
    name: "File Chart Column",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5M8 18v-1m4 1v-6m4 6v-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5M8 18v-1m4 1v-6m4 6v-3",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-file-chart-column-increasing",
    name: "File Chart Column Increasing",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5M8 18v-2m4 2v-4m4 4v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5M8 18v-2m4 2v-4m4 4v-6",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-file-chart-line",
    name: "File Chart Line",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5m-4 5l-3.5 3.5l-2-2L8 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5m-4 5l-3.5 3.5l-2-2L8 17",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-file-chart-pie",
    name: "File Chart Pie",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M15.941 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.704l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v3.512 M14 2v5a1 1 0 0 0 1 1h5M4.017 11.512a6 6 0 1 0 8.466 8.475 M9 16a1 1 0 0 1-1-1v-4c0-.552.45-1.008.995-.917a6 6 0 0 1 4.922 4.922c.091.544-.365.995-.917.995z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M15.941 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.704l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v3.512 M14 2v5a1 1 0 0 0 1 1h5M4.017 11.512a6 6 0 1 0 8.466 8.475 M9 16a1 1 0 0 1-1-1v-4c0-.552.45-1.008.995-.917a6 6 0 0 1 4.922 4.922c.091.544-.365.995-.917.995z",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-file-check",
    name: "File Check",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5M9 15l2 2l4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5M9 15l2 2l4-4",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-file-check-2",
    name: "File Check 2",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4 M14 2v4a2 2 0 0 0 2 2h4M3 15l2 2l4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4 M14 2v4a2 2 0 0 0 2 2h4M3 15l2 2l4-4",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-file-check-corner",
    name: "File Check Corner",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10.5 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v6 M14 2v5a1 1 0 0 0 1 1h5m-6 12l2 2l4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10.5 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v6 M14 2v5a1 1 0 0 0 1 1h5m-6 12l2 2l4-4",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-file-clock",
    name: "File Clock",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M16 22h2a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v2.85 M14 2v5a1 1 0 0 0 1 1h5M8 14v2.2l1.6 1 M 2.0 16.0 a 6.0 6.0 0 1 0 12.0 0 a 6.0 6.0 0 1 0 -12.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M16 22h2a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v2.85 M14 2v5a1 1 0 0 0 1 1h5M8 14v2.2l1.6 1 M 2.0 16.0 a 6.0 6.0 0 1 0 12.0 0 a 6.0 6.0 0 1 0 -12.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-file-code",
    name: "File Code",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5m-10 4.5L8 15l2 2.5m4-5l2 2.5l-2 2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5m-10 4.5L8 15l2 2.5m4-5l2 2.5l-2 2.5",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-file-code-2",
    name: "File Code 2",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4 M14 2v4a2 2 0 0 0 2 2h4M5 12l-3 3l3 3m4 0l3-3l-3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4 M14 2v4a2 2 0 0 0 2 2h4M5 12l-3 3l3 3m4 0l3-3l-3-3",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-file-code-corner",
    name: "File Code Corner",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M4 12.15V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3.35 M14 2v5a1 1 0 0 0 1 1h5M5 16l-3 3l3 3m4 0l3-3l-3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M4 12.15V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3.35 M14 2v5a1 1 0 0 0 1 1h5M5 16l-3 3l3 3m4 0l3-3l-3-3",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-file-cog",
    name: "File Cog",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M15 8a1 1 0 0 1-1-1V2a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8zm5 0v12a2 2 0 0 1-2 2h-4.182M3.305 19.53l.923-.382M4 10.592V4a2 2 0 0 1 2-2h8M4.228 16.852l-.924-.383m2.548-1.241l-.383-.923m.383 6.467l-.383.924m2.679-6.468l.383-.923m-.001 7.391l-.382-.924m1.625-3.92l.922-.383m-.922 2.679l.922.383 M 4.0 18.0 a 3.0 3.0 0 1 0 6.0 0 a 3.0 3.0 0 1 0 -6.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M15 8a1 1 0 0 1-1-1V2a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8zm5 0v12a2 2 0 0 1-2 2h-4.182M3.305 19.53l.923-.382M4 10.592V4a2 2 0 0 1 2-2h8M4.228 16.852l-.924-.383m2.548-1.241l-.383-.923m.383 6.467l-.383.924m2.679-6.468l.383-.923m-.001 7.391l-.382-.924m1.625-3.92l.922-.383m-.922 2.679l.922.383 M 4.0 18.0 a 3.0 3.0 0 1 0 6.0 0 a 3.0 3.0 0 1 0 -6.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-hard-drive",
    name: "Hard Drive",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10 16h.01m-7.798-4.423a2 2 0 0 0-.212.896V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11zm19.734.436H2.054M6 16h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10 16h.01m-7.798-4.423a2 2 0 0 0-.212.896V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11zm19.734.436H2.054M6 16h.01",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-hard-drive-download",
    name: "Hard Drive Download",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 2v8m4-4l-4 4l-4-4 M6 18h.01M10 18h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 2v8m4-4l-4 4l-4-4 M6 18h.01M10 18h.01",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-hard-drive-upload",
    name: "Hard Drive Upload",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m16 6l-4-4l-4 4m4-4v8 M6 18h.01M10 18h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m16 6l-4-4l-4 4m4-4v8 M6 18h.01M10 18h.01",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-headphones",
    name: "Headphones",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-laptop",
    name: "Laptop",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2zm2.054 10.987H3.946" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2zm2.054 10.987H3.946",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-laptop-minimal",
    name: "Laptop Minimal",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M2 20h20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M2 20h20",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-laptop-minimal-check",
    name: "Laptop Minimal Check",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M2 20h20M9 10l2 2l4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M2 20h20M9 10l2 2l4-4",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-mic",
    name: "Mic",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 19v3m7-12v2a7 7 0 0 1-14 0v-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 19v3m7-12v2a7 7 0 0 1-14 0v-2",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-mic-audio-lines",
    name: "Mic Audio Lines",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10 3v2.341M12 17v4m2-16v.341M18 5v13M2 10v3m20-3v3M6 6v11m3 4h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10 3v2.341M12 17v4m2-16v.341M18 5v13M2 10v3m20-3v3M6 6v11m3 4h6",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-mic-off",
    name: "Mic Off",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 19v3m3-12.66V5a3 3 0 0 0-5.68-1.33m7.63 13.28A7 7 0 0 1 5 12v-2m13.89 3.23A7 7 0 0 0 19 12v-2M2 2l20 20 M9 9v3a3 3 0 0 0 5.12 2.12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 19v3m3-12.66V5a3 3 0 0 0-5.68-1.33m7.63 13.28A7 7 0 0 1 5 12v-2m13.89 3.23A7 7 0 0 0 19 12v-2M2 2l20 20 M9 9v3a3 3 0 0 0 5.12 2.12",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-mic-signal",
    name: "Mic Signal",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 17v4m6-10a6 6 0 0 0-3-5.197M2 11a10 10 0 0 1 5-8.662M22 11a10 10 0 0 0-5-8.662M6 11a6 6 0 0 1 3-5.197M9 21h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 17v4m6-10a6 6 0 0 0-3-5.197M2 11a10 10 0 0 1 5-8.662M22 11a10 10 0 0 0-5-8.662M6 11a6 6 0 0 1 3-5.197M9 21h6",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-mic-vocal",
    name: "Mic Vocal",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m11 7.601l-5.994 8.19a1 1 0 0 0 .1 1.298l.817.818a1 1 0 0 0 1.314.087L15.09 12 M16.5 21.174C15.5 20.5 14.372 20 13 20c-2.058 0-3.928 2.356-6 2s-2.775-3.369-1.5-4.5 M 11.0 7.0 a 5.0 5.0 0 1 0 10.0 0 a 5.0 5.0 0 1 0 -10.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m11 7.601l-5.994 8.19a1 1 0 0 0 .1 1.298l.817.818a1 1 0 0 0 1.314.087L15.09 12 M16.5 21.174C15.5 20.5 14.372 20 13 20c-2.058 0-3.928 2.356-6 2s-2.775-3.369-1.5-4.5 M 11.0 7.0 a 5.0 5.0 0 1 0 10.0 0 a 5.0 5.0 0 1 0 -10.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-microchip",
    name: "Microchip",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10 12h4m-4 5h4M10 7h4m4 5h2m-2 6h2M18 6h2M4 12h2m-2 6h2M4 6h2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10 12h4m-4 5h4M10 7h4m4 5h2m-2 6h2M18 6h2M4 12h2m-2 6h2M4 6h2",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-microscope",
    name: "Microscope",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M6 18h8M3 22h18m-7 0a7 7 0 1 0 0-14h-1m-4 6h2m-2-2a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Zm3-6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M6 18h8M3 22h18m-7 0a7 7 0 1 0 0-14h-1m-4 6h2m-2-2a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Zm3-6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-microwave",
    name: "Microwave",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M18 8v7M6 19v2m12-2v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M18 8v7M6 19v2m12-2v2",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-monitor",
    name: "Monitor",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M8 21h8m-4-4v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M8 21h8m-4-4v4",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-monitor-check",
    name: "Monitor Check",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m9 10l2 2l4-4 M12 17v4m-4 0h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m9 10l2 2l4-4 M12 17v4m-4 0h8",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-monitor-cloud",
    name: "Monitor Cloud",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M11 13a3 3 0 1 1 2.83-4H14a2 2 0 0 1 0 4zm1 4v4m-4 0h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M11 13a3 3 0 1 1 2.83-4H14a2 2 0 0 1 0 4zm1 4v4m-4 0h8",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-monitor-cog",
    name: "Monitor Cog",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 17v4m2.305-13.47l.923-.382m0-2.296l-.923-.383m2.547-1.241l-.383-.924m.383 6.468l-.383.923m2.679-6.467l.383-.924m-.001 7.392l-.382-.924m1.624-3.92l.924-.383m-.924 2.679l.924.383M22 13v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7M8 21h8 M 15.0 6.0 a 3.0 3.0 0 1 0 6.0 0 a 3.0 3.0 0 1 0 -6.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 17v4m2.305-13.47l.923-.382m0-2.296l-.923-.383m2.547-1.241l-.383-.924m.383 6.468l-.383.923m2.679-6.467l.383-.924m-.001 7.392l-.382-.924m1.624-3.92l.924-.383m-.924 2.679l.924.383M22 13v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7M8 21h8 M 15.0 6.0 a 3.0 3.0 0 1 0 6.0 0 a 3.0 3.0 0 1 0 -6.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-monitor-dot",
    name: "Monitor Dot",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 17v4m10-8.693V15a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8.693M8 21h8 M 16.0 6.0 a 3.0 3.0 0 1 0 6.0 0 a 3.0 3.0 0 1 0 -6.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 17v4m10-8.693V15a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8.693M8 21h8 M 16.0 6.0 a 3.0 3.0 0 1 0 6.0 0 a 3.0 3.0 0 1 0 -6.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-monitor-down",
    name: "Monitor Down",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 13V7m3 3l-3 3l-3-3 M12 17v4m-4 0h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 13V7m3 3l-3 3l-3-3 M12 17v4m-4 0h8",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-monitor-off",
    name: "Monitor Off",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 17v4m5-4H4a2 2 0 0 1-2-2V5a2 2 0 0 1 1.184-1.826M2 2l20 20M8 21h8M8.656 3H20a2 2 0 0 1 2 2v10a2 2 0 0 1-.293 1.042" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 17v4m5-4H4a2 2 0 0 1-2-2V5a2 2 0 0 1 1.184-1.826M2 2l20 20M8 21h8M8.656 3H20a2 2 0 0 1 2 2v10a2 2 0 0 1-.293 1.042",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-monitor-pause",
    name: "Monitor Pause",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10 13V7m4 6V7 M12 17v4m-4 0h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10 13V7m4 6V7 M12 17v4m-4 0h8",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-monitor-play",
    name: "Monitor Play",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M15.033 9.44a.647.647 0 0 1 0 1.12l-4.065 2.352a.645.645 0 0 1-.968-.56V7.648a.645.645 0 0 1 .967-.56zM12 17v4m-4 0h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M15.033 9.44a.647.647 0 0 1 0 1.12l-4.065 2.352a.645.645 0 0 1-.968-.56V7.648a.645.645 0 0 1 .967-.56zM12 17v4m-4 0h8",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-monitor-smartphone",
    name: "Monitor Smartphone",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8m-2 4v-3.96v3.15M7 19h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8m-2 4v-3.96v3.15M7 19h5",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-monitor-speaker",
    name: "Monitor Speaker",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M5.5 20H8m9-11h.01 M8 6H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h4 M 16.0 15.0 a 1.0 1.0 0 1 0 2.0 0 a 1.0 1.0 0 1 0 -2.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M5.5 20H8m9-11h.01 M8 6H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h4 M 16.0 15.0 a 1.0 1.0 0 1 0 2.0 0 a 1.0 1.0 0 1 0 -2.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-monitor-stop",
    name: "Monitor Stop",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 17v4m-4 0h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 17v4m-4 0h8",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-monitor-up",
    name: "Monitor Up",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m9 10l3-3l3 3m-3 3V7 M12 17v4m-4 0h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m9 10l3-3l3 3m-3 3V7 M12 17v4m-4 0h8",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-monitor-x",
    name: "Monitor X",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m14.5 12.5l-5-5m0 5l5-5 M12 17v4m-4 0h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m14.5 12.5l-5-5m0 5l5-5 M12 17v4m-4 0h8",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-printer",
    name: "Printer",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-printer-check",
    name: "Printer Check",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M13.5 22H7a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v.5M16 19l2 2l4-4 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M13.5 22H7a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v.5M16 19l2 2l4-4 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-printer-x",
    name: "Printer X",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12.531 22H7a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h6.377m3.123 2.5l5 5m-5 0l5-5 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1.5M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12.531 22H7a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h6.377m3.123 2.5l5 5m-5 0l5-5 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1.5M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-server",
    name: "Server",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M6 6h.01M6 18h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M6 6h.01M6 18h.01",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-server-cog",
    name: "Server Cog",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m10.852 14.772l-.383.923m2.679-.923a3 3 0 1 0-2.296-5.544l-.383-.923m2.679.923l.383-.923 m13.53 15.696l-.382-.924a3 3 0 1 1-2.296-5.544m3.92 1.624l.923-.383m-.923 2.679l.923.383 M4.5 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-.5m-15 4H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-.5M6 18h.01M6 6h.01m3.218 4.852l-.923-.383m.923 2.679l-.923.383" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m10.852 14.772l-.383.923m2.679-.923a3 3 0 1 0-2.296-5.544l-.383-.923m2.679.923l.383-.923 m13.53 15.696l-.382-.924a3 3 0 1 1-2.296-5.544m3.92 1.624l.923-.383m-.923 2.679l.923.383 M4.5 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-.5m-15 4H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-.5M6 18h.01M6 6h.01m3.218 4.852l-.923-.383m.923 2.679l-.923.383",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-server-crash",
    name: "Server Crash",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M6 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2M6 6h.01M6 18h.01 m13 6l-4 6h6l-4 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M6 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2M6 6h.01M6 18h.01 m13 6l-4 6h6l-4 6",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-server-off",
    name: "Server Off",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M7 2h13a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-5m-5 0L2.5 2.5C2 2 2 2.5 2 5v3a2 2 0 0 0 2 2zm12 7v-1a2 2 0 0 0-2-2h-1M4 14a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16.5l1-.5l.5.5l-8-8zm2 4h.01M2 2l20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M7 2h13a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-5m-5 0L2.5 2.5C2 2 2 2.5 2 5v3a2 2 0 0 0 2 2zm12 7v-1a2 2 0 0 0-2-2h-1M4 14a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16.5l1-.5l.5.5l-8-8zm2 4h.01M2 2l20 20",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-server-plus",
    name: "Server Plus",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12.5 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2m-6 6h6m-3-3v6m3 3v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h8.5M6 18h.01M6 6h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12.5 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2m-6 6h6m-3-3v6m3 3v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h8.5M6 18h.01M6 6h.01",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-smartphone",
    name: "Smartphone",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 18h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 18h.01",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-smartphone-charging",
    name: "Smartphone Charging",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12.667 8L10 12h4l-2.667 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12.667 8L10 12h4l-2.667 4",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-smartphone-nfc",
    name: "Smartphone Nfc",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M13 8.32a7.43 7.43 0 0 1 0 7.36m3.46-9.47a11.76 11.76 0 0 1 0 11.58M19.91 4.1a15.91 15.91 0 0 1 .01 15.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M13 8.32a7.43 7.43 0 0 1 0 7.36m3.46-9.47a11.76 11.76 0 0 1 0 11.58M19.91 4.1a15.91 15.91 0 0 1 .01 15.8",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-speaker",
    name: "Speaker",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 6h.01 M12 14h.01 M 8.0 14.0 a 4.0 4.0 0 1 0 8.0 0 a 4.0 4.0 0 1 0 -8.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 6h.01 M12 14h.01 M 8.0 14.0 a 4.0 4.0 0 1 0 8.0 0 a 4.0 4.0 0 1 0 -8.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-tablet",
    name: "Tablet",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 18h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 18h.01",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-tablet-smartphone",
    name: "Tablet Smartphone",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M5 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2.4M8 18h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M5 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2.4M8 18h.01",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-tablets",
    name: "Tablets",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 17h10M3.46 10.54l7.08-7.08 M 2.0 7.0 a 5.0 5.0 0 1 0 10.0 0 a 5.0 5.0 0 1 0 -10.0 0 M 12.0 17.0 a 5.0 5.0 0 1 0 10.0 0 a 5.0 5.0 0 1 0 -10.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 17h10M3.46 10.54l7.08-7.08 M 2.0 7.0 a 5.0 5.0 0 1 0 10.0 0 a 5.0 5.0 0 1 0 -10.0 0 M 12.0 17.0 a 5.0 5.0 0 1 0 10.0 0 a 5.0 5.0 0 1 0 -10.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-tv",
    name: "Tv",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m17 2l-5 5l-5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m17 2l-5 5l-5-5",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-tv-minimal",
    name: "Tv Minimal",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M7 21h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M7 21h10",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-tv-minimal-play",
    name: "Tv Minimal Play",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M15.033 9.44a.647.647 0 0 1 0 1.12l-4.065 2.352a.645.645 0 0 1-.968-.56V7.648a.645.645 0 0 1 .967-.56zM7 21h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M15.033 9.44a.647.647 0 0 1 0 1.12l-4.065 2.352a.645.645 0 0 1-.968-.56V7.648a.645.645 0 0 1 .967-.56zM7 21h10",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-briefcase",
    name: "Briefcase",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-briefcase-business",
    name: "Briefcase Business",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 12h.01M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2m14 7a18.15 18.15 0 0 1-20 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 12h.01M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2m14 7a18.15 18.15 0 0 1-20 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-briefcase-conveyor-belt",
    name: "Briefcase Conveyor Belt",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10 20v2m4-2v2m4-2v2m3-2H3m3 0v2m2-6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10 20v2m4-2v2m4-2v2m3-2H3m3 0v2m2-6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v12",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-briefcase-medical",
    name: "Briefcase Medical",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 11v4m2-2h-4m6-7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2m10 0v14M6 6v14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 11v4m2-2h-4m6-7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2m10 0v14M6 6v14",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-credit-card",
    name: "Credit Card",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M2 10h20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M2 10h20",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-dollar-sign",
    name: "Dollar Sign",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 2v20m5-17H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 2v20m5-17H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-gift",
    name: "Gift",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 7v14m8-10v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8m3.5-4a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5a1 1 0 0 1 0 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 7v14m8-10v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8m3.5-4a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5a1 1 0 0 1 0 5",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-shopping-bag",
    name: "Shopping Bag",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M16 10a4 4 0 0 1-8 0M3.103 6.034h17.794 M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M16 10a4 4 0 0 1-8 0M3.103 6.034h17.794 M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-shopping-basket",
    name: "Shopping Basket",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m15 11l-1 9m5-9l-4-7M2 11h20M3.5 11l1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4M4.5 15.5h15M5 11l4-7m0 7l1 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m15 11l-1 9m5-9l-4-7M2 11h20M3.5 11l1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4M4.5 15.5h15M5 11l4-7m0 7l1 9",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-shopping-cart",
    name: "Shopping Cart",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12 M 7.0 21.0 a 1.0 1.0 0 1 0 2.0 0 a 1.0 1.0 0 1 0 -2.0 0 M 18.0 21.0 a 1.0 1.0 0 1 0 2.0 0 a 1.0 1.0 0 1 0 -2.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12 M 7.0 21.0 a 1.0 1.0 0 1 0 2.0 0 a 1.0 1.0 0 1 0 -2.0 0 M 18.0 21.0 a 1.0 1.0 0 1 0 2.0 0 a 1.0 1.0 0 1 0 -2.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-tag",
    name: "Tag",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z M 7.0 7.5 a 0.5 0.5 0 1 0 1.0 0 a 0.5 0.5 0 1 0 -1.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z M 7.0 7.5 a 0.5 0.5 0 1 0 1.0 0 a 0.5 0.5 0 1 0 -1.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-tag-plus",
    name: "Tag Plus",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M16 13h6m-5.5-6.5l-3.914-3.914A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l1.79-1.79M19 10v6 M 7.0 7.5 a 0.5 0.5 0 1 0 1.0 0 a 0.5 0.5 0 1 0 -1.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M16 13h6m-5.5-6.5l-3.914-3.914A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l1.79-1.79M19 10v6 M 7.0 7.5 a 0.5 0.5 0 1 0 1.0 0 a 0.5 0.5 0 1 0 -1.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-tag-x",
    name: "Tag X",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m16.5 6.5l-3.914-3.914A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.43 2.43 0 0 0 3.42 0l1.79-1.79m0-9l5 5m0-5l-5 5 M 7.0 7.5 a 0.5 0.5 0 1 0 1.0 0 a 0.5 0.5 0 1 0 -1.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m16.5 6.5l-3.914-3.914A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.43 2.43 0 0 0 3.42 0l1.79-1.79m0-9l5 5m0-5l-5 5 M 7.0 7.5 a 0.5 0.5 0 1 0 1.0 0 a 0.5 0.5 0 1 0 -1.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-tags",
    name: "Tags",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M13.172 2a2 2 0 0 1 1.414.586l6.71 6.71a2.4 2.4 0 0 1 0 3.408l-4.592 4.592a2.4 2.4 0 0 1-3.408 0l-6.71-6.71A2 2 0 0 1 6 9.172V3a1 1 0 0 1 1-1zM2 7v6.172a2 2 0 0 0 .586 1.414l6.71 6.71a2.4 2.4 0 0 0 3.191.193 M 10.0 6.5 a 0.5 0.5 0 1 0 1.0 0 a 0.5 0.5 0 1 0 -1.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M13.172 2a2 2 0 0 1 1.414.586l6.71 6.71a2.4 2.4 0 0 1 0 3.408l-4.592 4.592a2.4 2.4 0 0 1-3.408 0l-6.71-6.71A2 2 0 0 1 6 9.172V3a1 1 0 0 1 1-1zM2 7v6.172a2 2 0 0 0 .586 1.414l6.71 6.71a2.4 2.4 0 0 0 3.191.193 M 10.0 6.5 a 0.5 0.5 0 1 0 1.0 0 a 0.5 0.5 0 1 0 -1.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-wallet",
    name: "Wallet",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1 M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1 M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-wallet-cards",
    name: "Wallet Cards",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M3 11h3.75a2 2 0 0 1 1.6.8l.45.6a4 4 0 0 0 6.4 0l.45-.6a2 2 0 0 1 1.6-.8H21M3 7h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M3 11h3.75a2 2 0 0 1 1.6.8l.45.6a4 4 0 0 0 6.4 0l.45-.6a2 2 0 0 1 1.6-.8H21M3 7h18",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-wallet-minimal",
    name: "Wallet Minimal",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M17 14h.01M7 7h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M17 14h.01M7 7h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-cloud",
    name: "Cloud",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-cloudy",
    name: "Cloudy",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M17.5 12a1 1 0 1 1 0 9H9.006a7 7 0 1 1 6.702-9z M21.832 9A3 3 0 0 0 19 7h-2.207a5.5 5.5 0 0 0-10.72.61" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M17.5 12a1 1 0 1 1 0 9H9.006a7 7 0 1 1 6.702-9z M21.832 9A3 3 0 0 0 19 7h-2.207a5.5 5.5 0 0 0-10.72.61",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-moon",
    name: "Moon",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-moon-star",
    name: "Moon Star",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M18 5h4m-2-2v4m.985 5.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M18 5h4m-2-2v4m.985 5.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-rainbow",
    name: "Rainbow",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M22 17a10 10 0 0 0-20 0 M6 17a6 6 0 0 1 12 0 M10 17a2 2 0 0 1 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M22 17a10 10 0 0 0-20 0 M6 17a6 6 0 0 1 12 0 M10 17a2 2 0 0 1 4 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-snowflake",
    name: "Snowflake",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m10 20l-1.25-2.5L6 18m4-14L8.75 6.5L6 6m8 14l1.25-2.5L18 18M14 4l1.25 2.5L18 6 m17 21l-3-6h-4m7-12l-3 6l1.5 3M2 12h6.5L10 9m10 1l-1.5 2l1.5 2 M22 12h-6.5L14 15M4 10l1.5 2L4 14m3 7l3-6l-1.5-3M7 3l3 6h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m10 20l-1.25-2.5L6 18m4-14L8.75 6.5L6 6m8 14l1.25-2.5L18 18M14 4l1.25 2.5L18 6 m17 21l-3-6h-4m7-12l-3 6l1.5 3M2 12h6.5L10 9m10 1l-1.5 2l1.5 2 M22 12h-6.5L14 15M4 10l1.5 2L4 14m3 7l3-6l-1.5-3M7 3l3 6h4",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-sun",
    name: "Sun",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41 M 8.0 12.0 a 4.0 4.0 0 1 0 8.0 0 a 4.0 4.0 0 1 0 -8.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41 M 8.0 12.0 a 4.0 4.0 0 1 0 8.0 0 a 4.0 4.0 0 1 0 -8.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-sun-dim",
    name: "Sun Dim",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 4h.01M20 12h.01M12 20h.01M4 12h.01m13.647-5.657h.01m-.01 11.314h.01m-11.324 0h.01m-.01-11.314h.01 M 8.0 12.0 a 4.0 4.0 0 1 0 8.0 0 a 4.0 4.0 0 1 0 -8.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 4h.01M20 12h.01M12 20h.01M4 12h.01m13.647-5.657h.01m-.01 11.314h.01m-11.324 0h.01m-.01-11.314h.01 M 8.0 12.0 a 4.0 4.0 0 1 0 8.0 0 a 4.0 4.0 0 1 0 -8.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-sun-medium",
    name: "Sun Medium",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 3v1m0 16v1m-9-9h1m16 0h1m-2.636-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707.707 M 8.0 12.0 a 4.0 4.0 0 1 0 8.0 0 a 4.0 4.0 0 1 0 -8.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 3v1m0 16v1m-9-9h1m16 0h1m-2.636-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707.707 M 8.0 12.0 a 4.0 4.0 0 1 0 8.0 0 a 4.0 4.0 0 1 0 -8.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-sun-moon",
    name: "Sun Moon",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 2v2m2.837 12.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715M16 12a4 4 0 0 0-4-4m7-3l-1.256 1.256M20 12h2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 2v2m2.837 12.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715M16 12a4 4 0 0 0-4-4m7-3l-1.256 1.256M20 12h2",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-sun-snow",
    name: "Sun Snow",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10 21v-1m0-16V3m0 6a3 3 0 0 0 0 6m4 5l1.25-2.5L18 18M14 4l1.25 2.5L18 6 m17 21l-3-6l1.5-3H22m-5-9l-3 6l1.5 3M2 12h1 m20 10l-1.5 2l1.5 2M3.64 18.36l.7-.7m0-11.32l-.7-.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10 21v-1m0-16V3m0 6a3 3 0 0 0 0 6m4 5l1.25-2.5L18 18M14 4l1.25 2.5L18 6 m17 21l-3-6l1.5-3H22m-5-9l-3 6l1.5 3M2 12h1 m20 10l-1.5 2l1.5 2M3.64 18.36l.7-.7m0-11.32l-.7-.7",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-sunrise",
    name: "Sunrise",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 2v8m-7.07.93l1.41 1.41M2 18h2m16 0h2m-2.93-7.07l-1.41 1.41M22 22H2M8 6l4-4l4 4m0 12a4 4 0 0 0-8 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 2v8m-7.07.93l1.41 1.41M2 18h2m16 0h2m-2.93-7.07l-1.41 1.41M22 22H2M8 6l4-4l4 4m0 12a4 4 0 0 0-8 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-sunset",
    name: "Sunset",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 10V2m-7.07 8.93l1.41 1.41M2 18h2m16 0h2m-2.93-7.07l-1.41 1.41M22 22H2M16 6l-4 4l-4-4m8 12a4 4 0 0 0-8 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 10V2m-7.07 8.93l1.41 1.41M2 18h2m16 0h2m-2.93-7.07l-1.41 1.41M22 22H2M16 6l-4 4l-4-4m8 12a4 4 0 0 0-8 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-umbrella",
    name: "Umbrella",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 13v7a2 2 0 0 0 4 0M12 2v2 M20.992 13a1 1 0 0 0 .97-1.274a10.284 10.284 0 0 0-19.923 0A1 1 0 0 0 3 13z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 13v7a2 2 0 0 0 4 0M12 2v2 M20.992 13a1 1 0 0 0 .97-1.274a10.284 10.284 0 0 0-19.923 0A1 1 0 0 0 3 13z",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-umbrella-off",
    name: "Umbrella Off",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 13v7a2 2 0 0 0 4 0M12 2v2m6.656 9h2.336a1 1 0 0 0 .97-1.274a10.284 10.284 0 0 0-12.07-7.51M2 2l20 20 M5.961 5.957a10.28 10.28 0 0 0-3.922 5.769A1 1 0 0 0 3 13h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 13v7a2 2 0 0 0 4 0M12 2v2m6.656 9h2.336a1 1 0 0 0 .97-1.274a10.284 10.284 0 0 0-12.07-7.51M2 2l20 20 M5.961 5.957a10.28 10.28 0 0 0-3.922 5.769A1 1 0 0 0 3 13h10",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-wind",
    name: "Wind",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12.8 19.6A2 2 0 1 0 14 16H2m15.5-8a2.5 2.5 0 1 1 2 4H2m7.8-7.6A2 2 0 1 1 11 8H2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12.8 19.6A2 2 0 1 0 14 16H2m15.5-8a2.5 2.5 0 1 1 2 4H2m7.8-7.6A2 2 0 1 1 11 8H2",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-wind-arrow-down",
    name: "Wind Arrow Down",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10 2v8m2.8 11.6A2 2 0 1 0 14 18H2m15.5-8a2.5 2.5 0 1 1 2 4H2m4-8l4 4l4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10 2v8m2.8 11.6A2 2 0 1 0 14 18H2m15.5-8a2.5 2.5 0 1 1 2 4H2m4-8l4 4l4-4",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-a-arrow-down",
    name: "A Arrow Down",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m14 12l4 4l4-4m-4 4V7M2 16l4.039-9.69a.5.5 0 0 1 .923 0L11 16m-7.696-3h6.392" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m14 12l4 4l4-4m-4 4V7M2 16l4.039-9.69a.5.5 0 0 1 .923 0L11 16m-7.696-3h6.392",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-a-arrow-up",
    name: "A Arrow Up",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m14 11l4-4l4 4m-4 5V7M2 16l4.039-9.69a.5.5 0 0 1 .923 0L11 16m-7.696-3h6.392" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m14 11l4-4l4 4m-4 5V7M2 16l4.039-9.69a.5.5 0 0 1 .923 0L11 16m-7.696-3h6.392",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-a-large-small",
    name: "A Large Small",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m15 16l2.536-7.328a1.02 1.02 1 0 1 1.928 0L22 16m-6.303-2h5.606M2 16l4.039-9.69a.5.5 0 0 1 .923 0L11 16m-7.696-3h6.392" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m15 16l2.536-7.328a1.02 1.02 1 0 1 1.928 0L22 16m-6.303-2h5.606M2 16l4.039-9.69a.5.5 0 0 1 .923 0L11 16m-7.696-3h6.392",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-accessibility",
    name: "Accessibility",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m18 19l1-7l-6 1M5 8l3-3l5.5 3l-2.36 3.5m-6.9 3a5 5 0 0 0 6.88 6 M13.76 17.5a5 5 0 0 0-6.88-6 M 15.0 4.0 a 1.0 1.0 0 1 0 2.0 0 a 1.0 1.0 0 1 0 -2.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m18 19l1-7l-6 1M5 8l3-3l5.5 3l-2.36 3.5m-6.9 3a5 5 0 0 0 6.88 6 M13.76 17.5a5 5 0 0 0-6.88-6 M 15.0 4.0 a 1.0 1.0 0 1 0 2.0 0 a 1.0 1.0 0 1 0 -2.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-activity",
    name: "Activity",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-ad",
    name: "Ad",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10 13H6m4 2v-4a2 2 0 0 0-4 0v4m8-.5a.5.5 0 0 0 .5.5h1a2.5 2.5 0 0 0 2.5-2.5v-1A2.5 2.5 0 0 0 15.5 9h-1a.5.5 0 0 0-.5.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10 13H6m4 2v-4a2 2 0 0 0-4 0v4m8-.5a.5.5 0 0 0 .5.5h1a2.5 2.5 0 0 0 2.5-2.5v-1A2.5 2.5 0 0 0 15.5 9h-1a.5.5 0 0 0-.5.5z",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-air-vent",
    name: "Air Vent",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M18 17.5a2.5 2.5 0 1 1-4 2.03V12m-8 0H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 8h12M6.6 15.572A2 2 0 1 0 10 17v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M18 17.5a2.5 2.5 0 1 1-4 2.03V12m-8 0H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 8h12M6.6 15.572A2 2 0 1 0 10 17v-5",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-airplay",
    name: "Airplay",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1 m12 15l5 6H7Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1 m12 15l5 6H7Z",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-alarm-clock",
    name: "Alarm Clock",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 9v4l2 2M5 3L2 6m20 0l-3-3M6.38 18.7L4 21m13.64-2.33L20 21 M 4.0 13.0 a 8.0 8.0 0 1 0 16.0 0 a 8.0 8.0 0 1 0 -16.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 9v4l2 2M5 3L2 6m20 0l-3-3M6.38 18.7L4 21m13.64-2.33L20 21 M 4.0 13.0 a 8.0 8.0 0 1 0 16.0 0 a 8.0 8.0 0 1 0 -16.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-alarm-clock-check",
    name: "Alarm Clock Check",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M5 3L2 6m20 0l-3-3M6.38 18.7L4 21m13.64-2.33L20 21M9 13l2 2l4-4 M 4.0 13.0 a 8.0 8.0 0 1 0 16.0 0 a 8.0 8.0 0 1 0 -16.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M5 3L2 6m20 0l-3-3M6.38 18.7L4 21m13.64-2.33L20 21M9 13l2 2l4-4 M 4.0 13.0 a 8.0 8.0 0 1 0 16.0 0 a 8.0 8.0 0 1 0 -16.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-alarm-clock-minus",
    name: "Alarm Clock Minus",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M5 3L2 6m20 0l-3-3M6.38 18.7L4 21m13.64-2.33L20 21M9 13h6 M 4.0 13.0 a 8.0 8.0 0 1 0 16.0 0 a 8.0 8.0 0 1 0 -16.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M5 3L2 6m20 0l-3-3M6.38 18.7L4 21m13.64-2.33L20 21M9 13h6 M 4.0 13.0 a 8.0 8.0 0 1 0 16.0 0 a 8.0 8.0 0 1 0 -16.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-alarm-clock-off",
    name: "Alarm Clock Off",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M6.87 6.87a8 8 0 1 0 11.26 11.26m1.77-3.88a8 8 0 0 0-9.15-9.15M22 6l-3-3M6.26 18.67L4 21M2 2l20 20M4 4L2 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M6.87 6.87a8 8 0 1 0 11.26 11.26m1.77-3.88a8 8 0 0 0-9.15-9.15M22 6l-3-3M6.26 18.67L4 21M2 2l20 20M4 4L2 6",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-alarm-clock-plus",
    name: "Alarm Clock Plus",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M5 3L2 6m20 0l-3-3M6.38 18.7L4 21m13.64-2.33L20 21m-8-11v6m-3-3h6 M 4.0 13.0 a 8.0 8.0 0 1 0 16.0 0 a 8.0 8.0 0 1 0 -16.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M5 3L2 6m20 0l-3-3M6.38 18.7L4 21m13.64-2.33L20 21m-8-11v6m-3-3h6 M 4.0 13.0 a 8.0 8.0 0 1 0 16.0 0 a 8.0 8.0 0 1 0 -16.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-alarm-smoke",
    name: "Alarm Smoke",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M11 21c0-2.5 2-2.5 2-5m3 5c0-2.5 2-2.5 2-5m1-8l-.8 3a1.25 1.25 0 0 1-1.2 1H7a1.25 1.25 0 0 1-1.2-1L5 8m16-5a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a1 1 0 0 1 1-1zM6 21c0-2.5 2-2.5 2-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M11 21c0-2.5 2-2.5 2-5m3 5c0-2.5 2-2.5 2-5m1-8l-.8 3a1.25 1.25 0 0 1-1.2 1H7a1.25 1.25 0 0 1-1.2-1L5 8m16-5a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a1 1 0 0 1 1-1zM6 21c0-2.5 2-2.5 2-5",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-album",
    name: "Album",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M11 3v8l3-3l3 3V3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M11 3v8l3-3l3 3V3",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-center",
    name: "Align Center",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M17 12H7m12 6H5M21 6H3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M17 12H7m12 6H5M21 6H3",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-center-horizontal",
    name: "Align Center Horizontal",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M2 12h20m-12 4v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4m6-8V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v4m16 8v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1m0-8V7c0-1.1.9-2 2-2h2a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M2 12h20m-12 4v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4m6-8V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v4m16 8v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1m0-8V7c0-1.1.9-2 2-2h2a2 2 0 0 1 2 2v1",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-center-vertical",
    name: "Align Center Vertical",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 2v20M8 10H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2h4m8 6h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4M8 20H7a2 2 0 0 1-2-2v-2c0-1.1.9-2 2-2h1m8 0h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 2v20M8 10H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2h4m8 6h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4M8 20H7a2 2 0 0 1-2-2v-2c0-1.1.9-2 2-2h1m8 0h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-end-horizontal",
    name: "Align End Horizontal",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M22 22H2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M22 22H2",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-end-vertical",
    name: "Align End Vertical",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M22 22V2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M22 22V2",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-horizontal-distribute-center",
    name: "Align Horizontal Distribute Center",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M17 22v-5m0-10V2M7 22v-3M7 5V2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M17 22v-5m0-10V2M7 22v-3M7 5V2",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-horizontal-distribute-end",
    name: "Align Horizontal Distribute End",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10 2v20M20 2v20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10 2v20M20 2v20",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-horizontal-distribute-start",
    name: "Align Horizontal Distribute Start",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M4 2v20M14 2v20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M4 2v20M14 2v20",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-horizontal-justify-center",
    name: "Align Horizontal Justify Center",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 2v20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 2v20",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-horizontal-justify-end",
    name: "Align Horizontal Justify End",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M22 2v20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M22 2v20",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-horizontal-justify-start",
    name: "Align Horizontal Justify Start",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M2 2v20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M2 2v20",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-horizontal-space-around",
    name: "Align Horizontal Space Around",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M4 22V2m16 20V2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M4 22V2m16 20V2",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-horizontal-space-between",
    name: "Align Horizontal Space Between",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M3 2v20M21 2v20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M3 2v20M21 2v20",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-justify",
    name: "Align Justify",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M3 12h18M3 18h18M3 6h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M3 12h18M3 18h18M3 6h18",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-left",
    name: "Align Left",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M15 12H3m14 6H3M21 6H3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M15 12H3m14 6H3M21 6H3",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-right",
    name: "Align Right",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M21 12H9m12 6H7M21 6H3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M21 12H9m12 6H7M21 6H3",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-start-horizontal",
    name: "Align Start Horizontal",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M22 2H2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M22 2H2",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-start-vertical",
    name: "Align Start Vertical",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M2 2v20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M2 2v20",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-vertical-distribute-center",
    name: "Align Vertical Distribute Center",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M22 17h-3m3-10h-5M5 17H2M7 7H2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M22 17h-3m3-10h-5M5 17H2M7 7H2",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-vertical-distribute-end",
    name: "Align Vertical Distribute End",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M2 20h20M2 10h20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M2 20h20M2 10h20",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-vertical-distribute-start",
    name: "Align Vertical Distribute Start",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M2 14h20M2 4h20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M2 14h20M2 4h20",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-vertical-justify-center",
    name: "Align Vertical Justify Center",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M2 12h20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M2 12h20",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-vertical-justify-end",
    name: "Align Vertical Justify End",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M2 22h20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M2 22h20",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-vertical-justify-start",
    name: "Align Vertical Justify Start",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M2 2h20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M2 2h20",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-vertical-space-around",
    name: "Align Vertical Space Around",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M22 20H2M22 4H2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M22 20H2M22 4H2",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-align-vertical-space-between",
    name: "Align Vertical Space Between",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M2 21h20M2 3h20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M2 21h20M2 3h20",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-ambulance",
    name: "Ambulance",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10 10H6m8 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2m14 0h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.578-.502l-1.539-3.076A1 1 0 0 0 16.382 8H14M8 8v4m1 6h6 M 15.0 18.0 a 2.0 2.0 0 1 0 4.0 0 a 2.0 2.0 0 1 0 -4.0 0 M 5.0 18.0 a 2.0 2.0 0 1 0 4.0 0 a 2.0 2.0 0 1 0 -4.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10 10H6m8 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2m14 0h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.578-.502l-1.539-3.076A1 1 0 0 0 16.382 8H14M8 8v4m1 6h6 M 15.0 18.0 a 2.0 2.0 0 1 0 4.0 0 a 2.0 2.0 0 1 0 -4.0 0 M 5.0 18.0 a 2.0 2.0 0 1 0 4.0 0 a 2.0 2.0 0 1 0 -4.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-ampersand",
    name: "Ampersand",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M16 12h3m-1.5 0a8 8 0 0 1-8 8A4.5 4.5 0 0 1 5 15.5c0-6 8-4 8-8.5a3 3 0 1 0-6 0c0 3 2.5 8.5 12 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M16 12h3m-1.5 0a8 8 0 0 1-8 8A4.5 4.5 0 0 1 5 15.5c0-6 8-4 8-8.5a3 3 0 1 0-6 0c0 3 2.5 8.5 12 13",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-ampersands",
    name: "Ampersands",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10 17c-5-3-7-7-7-9a2 2 0 0 1 4 0c0 2.5-5 2.5-5 6c0 1.7 1.3 3 3 3c2.8 0 5-2.2 5-5m12 5c-5-3-7-7-7-9a2 2 0 0 1 4 0c0 2.5-5 2.5-5 6c0 1.7 1.3 3 3 3c2.8 0 5-2.2 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10 17c-5-3-7-7-7-9a2 2 0 0 1 4 0c0 2.5-5 2.5-5 6c0 1.7 1.3 3 3 3c2.8 0 5-2.2 5-5m12 5c-5-3-7-7-7-9a2 2 0 0 1 4 0c0 2.5-5 2.5-5 6c0 1.7 1.3 3 3 3c2.8 0 5-2.2 5-5",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-amphora",
    name: "Amphora",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10 2v5.632c0 .424-.272.795-.653.982A6 6 0 0 0 6 14c.006 4 3 7 5 8 M10 5H8a2 2 0 0 0 0 4h.68M14 2v5.632c0 .424.272.795.652.982A6 6 0 0 1 18 14c0 4-3 7-5 8 M14 5h2a2 2 0 0 1 0 4h-.68M18 22H6M9 2h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10 2v5.632c0 .424-.272.795-.653.982A6 6 0 0 0 6 14c.006 4 3 7 5 8 M10 5H8a2 2 0 0 0 0 4h.68M14 2v5.632c0 .424.272.795.652.982A6 6 0 0 1 18 14c0 4-3 7-5 8 M14 5h2a2 2 0 0 1 0 4h-.68M18 22H6M9 2h6",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-anchor",
    name: "Anchor",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 6v16m7-9l2-1a9 9 0 0 1-18 0l2 1m4-2h6 M 10.0 4.0 a 2.0 2.0 0 1 0 4.0 0 a 2.0 2.0 0 1 0 -4.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 6v16m7-9l2-1a9 9 0 0 1-18 0l2 1m4-2h6 M 10.0 4.0 a 2.0 2.0 0 1 0 4.0 0 a 2.0 2.0 0 1 0 -4.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-angle",
    name: "Angle",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M3 3v16a2 2 0 0 0 2 2h16 M3 11a10 10 0 0 1 10 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M3 3v16a2 2 0 0 0 2 2h16 M3 11a10 10 0 0 1 10 10",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-angry",
    name: "Angry",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M16 16s-1.5-2-4-2s-4 2-4 2m-.5-8L10 9m4 0l2.5-1M9 10h.01M15 10h.01 M 2.0 12.0 a 10.0 10.0 0 1 0 20.0 0 a 10.0 10.0 0 1 0 -20.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M16 16s-1.5-2-4-2s-4 2-4 2m-.5-8L10 9m4 0l2.5-1M9 10h.01M15 10h.01 M 2.0 12.0 a 10.0 10.0 0 1 0 20.0 0 a 10.0 10.0 0 1 0 -20.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-annoyed",
    name: "Annoyed",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M8 15h8M8 9h2m4 0h2 M 2.0 12.0 a 10.0 10.0 0 1 0 20.0 0 a 10.0 10.0 0 1 0 -20.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M8 15h8M8 9h2m4 0h2 M 2.0 12.0 a 10.0 10.0 0 1 0 20.0 0 a 10.0 10.0 0 1 0 -20.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-antenna",
    name: "Antenna",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M2 12L7 2m0 10l5-10m0 10l5-10m0 10l5-10M4.5 7h15M12 16v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M2 12L7 2m0 10l5-10m0 10l5-10m0 10l5-10M4.5 7h15M12 16v6",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-anvil",
    name: "Anvil",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M7 10H6a4 4 0 0 1-4-4a1 1 0 0 1 1-1h4m0 0a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1a7 7 0 0 1-7 7H8a1 1 0 0 1-1-1zm2 7v5m6-5v5M5 20a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M7 10H6a4 4 0 0 1-4-4a1 1 0 0 1 1-1h4m0 0a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1a7 7 0 0 1-7 7H8a1 1 0 0 1-1-1zm2 7v5m6-5v5M5 20a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-aperture",
    name: "Aperture",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m14.31 8l5.74 9.94M9.69 8h11.48M7.38 12l5.74-9.94M9.69 16L3.95 6.06M14.31 16H2.83m13.79-4l-5.74 9.94 M 2.0 12.0 a 10.0 10.0 0 1 0 20.0 0 a 10.0 10.0 0 1 0 -20.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m14.31 8l5.74 9.94M9.69 8h11.48M7.38 12l5.74-9.94M9.69 16L3.95 6.06M14.31 16H2.83m13.79-4l-5.74 9.94 M 2.0 12.0 a 10.0 10.0 0 1 0 20.0 0 a 10.0 10.0 0 1 0 -20.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-app-window",
    name: "App Window",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10 4v4M2 8h20M6 4v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10 4v4M2 8h20M6 4v4",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-app-window-mac",
    name: "App Window Mac",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M6 8h.01M10 8h.01M14 8h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M6 8h.01M10 8h.01M14 8h.01",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-apple",
    name: "Apple",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 6.528V3a1 1 0 0 1 1-1h0 M18.237 21A15 15 0 0 0 22 11a6 6 0 0 0-10-4.472A6 6 0 0 0 2 11a15.1 15.1 0 0 0 3.763 10a3 3 0 0 0 3.648.648a5.5 5.5 0 0 1 5.178 0A3 3 0 0 0 18.237 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 6.528V3a1 1 0 0 1 1-1h0 M18.237 21A15 15 0 0 0 22 11a6 6 0 0 0-10-4.472A6 6 0 0 0 2 11a15.1 15.1 0 0 0 3.763 10a3 3 0 0 0 3.648.648a5.5 5.5 0 0 1 5.178 0A3 3 0 0 0 18.237 21",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-archive",
    name: "Archive",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8m-10 4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8m-10 4h4",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-archive-restore",
    name: "Archive Restore",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M4 8v11a2 2 0 0 0 2 2h2M20 8v11a2 2 0 0 1-2 2h-2m-7-6l3-3l3 3m-3-3v9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M4 8v11a2 2 0 0 0 2 2h2M20 8v11a2 2 0 0 1-2 2h-2m-7-6l3-3l3 3m-3-3v9",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-archive-x",
    name: "Archive X",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M9.5 17l5-5m-5 0l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M9.5 17l5-5m-5 0l5 5",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-area-chart",
    name: "Area Chart",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M3 3v18h18 M7 12v5h12V8l-5 5l-4-4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M3 3v18h18 M7 12v5h12V8l-5 5l-4-4Z",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-armchair",
    name: "Armchair",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3 M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0zm2 2v2m14-2v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3 M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0zm2 2v2m14-2v2",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-arrows-up-from-line",
    name: "Arrows Up From Line",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="m4 6l3-3l3 3M7 17V3m7 3l3-3l3 3m-3 11V3M4 21h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "m4 6l3-3l3 3M7 17V3m7 3l3-3l3 3m-3 11V3M4 21h16",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-asterisk",
    name: "Asterisk",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12 6v12m5.196-9L6.804 15m0-6l10.392 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12 6v12m5.196-9L6.804 15m0-6l10.392 6",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-astroid",
    name: "Astroid",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M12.983 21.186a1 1 0 0 1-1.966 0a10 10 0 0 0-8.203-8.203a1 1 0 0 1 0-1.966a10 10 0 0 0 8.203-8.203a1 1 0 0 1 1.966 0a10 10 0 0 0 8.203 8.203a1 1 0 0 1 0 1.966a10 10 0 0 0-8.203 8.203" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M12.983 21.186a1 1 0 0 1-1.966 0a10 10 0 0 0-8.203-8.203a1 1 0 0 1 0-1.966a10 10 0 0 0 8.203-8.203a1 1 0 0 1 1.966 0a10 10 0 0 0 8.203 8.203a1 1 0 0 1 0 1.966a10 10 0 0 0-8.203 8.203",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-at-sign",
    name: "At Sign",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8 M 8.0 12.0 a 4.0 4.0 0 1 0 8.0 0 a 4.0 4.0 0 1 0 -8.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8 M 8.0 12.0 a 4.0 4.0 0 1 0 8.0 0 a 4.0 4.0 0 1 0 -8.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-atom",
    name: "Atom",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9c-4.54-4.52-9.87-6.54-11.9-4.5c-2.04 2.03-.02 7.36 4.5 11.9c4.54 4.52 9.87 6.54 11.9 4.5 M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9c-2.03-2.04-7.36-.02-11.9 4.5c-4.52 4.54-6.54 9.87-4.5 11.9c2.03 2.04 7.36.02 11.9-4.5 M 11.0 12.0 a 1.0 1.0 0 1 0 2.0 0 a 1.0 1.0 0 1 0 -2.0 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9c-4.54-4.52-9.87-6.54-11.9-4.5c-2.04 2.03-.02 7.36 4.5 11.9c4.54 4.52 9.87 6.54 11.9 4.5 M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9c-2.03-2.04-7.36-.02-11.9 4.5c-4.52 4.54-6.54 9.87-4.5 11.9c2.03 2.04 7.36.02 11.9-4.5 M 11.0 12.0 a 1.0 1.0 0 1 0 2.0 0 a 1.0 1.0 0 1 0 -2.0 0",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-audio-lines",
    name: "Audio Lines",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M2 10v3m4-7v11m4-14v18m4-13v7m4-10v13m4-8v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M2 10v3m4-7v11m4-14v18m4-13v7m4-10v13m4-8v3",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
  {
    id: "lucide-audio-lines-off",
    name: "Audio Lines Off",
    category: "Symbols" as ShapeCategory,
    preview: `<path d="M10 10v11m0-18v1.35M14 14v1m0-7v.35M18 5v7.35M2 10v3M2 2l20 20m0-12v3M6 6v11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    insert: (cx, cy, w = 100, h = 100) => ({
      kind: "path",
      d: "M10 10v11m0-18v1.35M14 14v1m0-7v.35M18 5v7.35M2 10v3M2 2l20 20m0-12v3M6 6v11",
      transform: `translate(${cx} ${cy}) scale(${w / 24} ${h / 24}) translate(-12 -12)`
    }),
  },
];
