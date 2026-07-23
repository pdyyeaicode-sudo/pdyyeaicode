/**
 * Icon — the single sanctioned wrapper for all Creative Studio chrome icons.
 *
 * Requirements 13.5 / 13.6:
 *  - Every chrome icon is a thin, stroke-based, single-color Line_Icon.
 *  - strokeWidth is hard-set to a value in [1.0, 1.5] (nominal 1px).
 *  - fill is forced to "none" (no filled / multicolor / raster icons).
 *  - color is a single CSS token: var(--fg-1) by default, var(--accent) when active.
 *  - Callers select an icon by a typed `name` only and may NOT pass arbitrary
 *    `fill`, `strokeWidth`, or `color`; those are controlled here.
 *
 * Per AGENTS.md, `lucide-react` is imported ONLY in this file. All other modules
 * must render icons via <Icon name="..." />. The ESLint guard (.eslintrc.cjs)
 * enforces this and bans raster icon imports for interface chrome.
 */
import {
  MousePointer2,
  Move,
  Frame,
  Square,
  Circle,
  Minus,
  Hexagon,
  Triangle,
  PenTool,
  Pencil,
  Type,
  Image as ImageIcon,
  Crop,
  Hand,
  ZoomIn,
  MessageSquare,
  Sparkles,
  Undo2,
  Redo2,
  Check,
  Download,
  Share2,
  Search,
  User,
  Layers,
  Eye,
  EyeOff,
  Lock,
  Plus,
  Settings,
  ChevronDown,
  SunMoon,
  Trash2,
  GripVertical,
  Unlock,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical as AlignTop,
  AlignCenterVertical as AlignVerticalCenter,
  AlignEndVertical as AlignBottom,
  AlignHorizontalSpaceAround as DistributeHorizontalSpacing,
  AlignVerticalSpaceAround as DistributeVerticalSpacing,
  X,
  Grid3X3,
  Ruler,
  Diamond,
  Pentagon,
  Octagon,
  Star,
  Heart,
  CircleDot,
  MessageCircle,
  Cloud,
  Flag,
  Award,
  Shield,
  RectangleHorizontal,
  LayoutTemplate,
  Shapes,
  UploadCloud,
  Maximize,
  type LucideIcon,
} from "lucide-react";

/**
 * Hard-set stroke width for every chrome icon. MUST stay within [1.0, 1.5]
 * (Requirement 13.5). Exported so the property test can assert the invariant.
 */
export const ICON_STROKE_WIDTH = 1.25;

/**
 * Typed mapping of editor chrome icon names to their Lucide line-icon component.
 * Extend this map (one entry per name) when the chrome needs a new icon; the
 * `IconName` union and all call sites update automatically.
 */
const ICONS = {
  // Selection / navigation
  select: MousePointer2,
  move: Move,
  hand: Hand,
  zoom: ZoomIn,
  // Frame / artboard
  frame: Frame,
  // Shapes
  square: Square,
  "rounded-rect": RectangleHorizontal,
  circle: Circle,
  ellipse: Circle, // we can reuse circle or use another
  line: Minus,
  polygon: Hexagon,
  triangle: Triangle,
  diamond: Diamond,
  pentagon: Pentagon,
  hexagon: Hexagon,
  octagon: Octagon,
  star: Star,
  heart: Heart,
  cross: Plus,
  donut: CircleDot,
  "chat-bubble": MessageCircle,
  cloud: Cloud,
  banner: Flag,
  badge: Award,
  shield: Shield,
  // Drawing / text
  pen: PenTool,
  pencil: Pencil,
  text: Type,
  image: ImageIcon,
  crop: Crop,
  // Chrome actions
  comments: MessageSquare,
  ai: Sparkles,
  undo: Undo2,
  redo: Redo2,
  save: Check,
  export: Download,
  share: Share2,
  search: Search,
  user: User,
  layers: Layers,
  eye: Eye,
  "eye-off": EyeOff,
  lock: Lock,
  plus: Plus,
  minus: Minus,
  settings: Settings,
  chevron: ChevronDown,
  theme: SunMoon,
  delete: Trash2,
  drag: GripVertical,
  unlock: Unlock,
  "align-left": AlignLeft,
  "align-center": AlignCenter,
  "align-right": AlignRight,
  "align-top": AlignTop,
  "align-v-center": AlignVerticalCenter,
  "align-bottom": AlignBottom,
  "distribute-h": DistributeHorizontalSpacing,
  "distribute-v": DistributeVerticalSpacing,
  x: X,
  grid: Grid3X3,
  ruler: Ruler,
  layout: LayoutTemplate,
  shapes: Shapes,
  upload: UploadCloud,
  maximize: Maximize,
} as const satisfies Record<string, LucideIcon>;

/** Union of every icon name the editor chrome can render. */
export type IconName = keyof typeof ICONS;

/** All available icon names (useful for tests and tooling). */
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export interface IconProps {
  /** Which line icon to render. */
  name: IconName;
  /** When true, render in the single Accent_Color instead of the default foreground. */
  active?: boolean;
  /** Square pixel size of the icon box (default 18). */
  size?: number;
  /** Optional className for layout (never used to override stroke/fill/color). */
  className?: string;
  /**
   * Optional accessible label. When provided the icon is exposed as an image
   * with this label; otherwise it is decorative and aria-hidden.
   */
  label?: string;
}

/**
 * Renders a chrome icon with the enforced line-icon style. The stroke width,
 * fill, and color are controlled here and cannot be overridden by callers.
 */
export function Icon({ name, active = false, size = 18, className, label }: IconProps) {
  const Glyph = ICONS[name];
  const enforced = {
    strokeWidth: ICON_STROKE_WIDTH,
    fill: "none" as const,
    color: active ? "var(--accent)" : "var(--fg-1)",
    width: size,
    height: size,
    className,
  };

  return label !== undefined ? (
    <Glyph {...enforced} role="img" aria-label={label} />
  ) : (
    <Glyph {...enforced} aria-hidden />
  );
}
