"use client";

/**
 * AssetsPanel — full asset browser for the Pydree editor.
 *
 * Categories: Shapes, Lines, Icons, Flowchart, Uploads, Recently Used.
 * - Shapes/Lines/Flowchart render procedural SVG thumbnails from assetShapes.ts
 * - Icons use @iconify/react with CDN for 200K+ icons across all packs
 * - Recently Used tracks the last 20 insertions in localStorage
 * - Search filters across all visible assets in real-time
 *
 * One responsibility per file: asset browsing + insertion.
 */

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Search, FilePlus, Clock, Star } from "lucide-react";
import { Icon } from "@iconify/react";
import styles from "./PydreeStudio.module.css";
import type { UseCreativeStudioResult } from "../editor/useCreativeStudio";
import { createShapeCommand, type ShapeInput } from "../editor/tools/shapeTool";
import { getActiveArtboard } from "../editor/commands";
import {
  ALL_SHAPES,
  getShapesByCategory,
  findShapeById,
  addRecentAsset,
  getRecentAssets,
  type ShapeCategory,
  type ShapeDefinition,
  type RecentAsset,
} from "./assetShapes";
import { svgToPathData } from "./utils/svgUtils";

// ---------------------------------------------------------------------------
// Category definitions
// ---------------------------------------------------------------------------

type Category = "Shapes" | "Lines" | "Icons" | "Flowchart" | "Uploads" | "Recent";

const CATEGORY_TABS: readonly { id: Category; label: string }[] = [
  { id: "Shapes", label: "Shapes" },
  { id: "Lines", label: "Lines" },
  { id: "Icons", label: "Icons" },
  { id: "Flowchart", label: "Flow" },
  { id: "Uploads", label: "Uploads" },
  { id: "Recent", label: "Recent" },
];

// ---------------------------------------------------------------------------
// Popular icons — curated set for the default Icons view
// ---------------------------------------------------------------------------

interface IconPack {
  id: string;
  name: string;
  prefix: string;
  popular: { id: string; name: string }[];
}

const ICON_PACKS: readonly IconPack[] = [
  {
    id: "all",
    name: "All Packs",
    prefix: "",
    popular: [
      { id: "lucide:home", name: "Home" },
      { id: "tabler:brand-instagram", name: "Instagram" },
      { id: "ph:sparkle-fill", name: "Sparkle" },
      { id: "heroicons:chart-bar-20-solid", name: "Chart" },
      { id: "ri:emotion-happy-fill", name: "Happy" },
      { id: "material-symbols:check-circle", name: "Check" },
      { id: "iconoir:home", name: "Home" },
      { id: "feather:award", name: "Award" },
      { id: "eva:bell-outline", name: "Bell" },
      { id: "bi:star", name: "Star" },
      { id: "radix-icons:bookmark", name: "Bookmark" },
      { id: "fa6-solid:house", name: "House" },
    ],
  },
  {
    id: "lucide",
    name: "Lucide",
    prefix: "lucide",
    popular: [
      { id: "lucide:home", name: "Home" },
      { id: "lucide:search", name: "Search" },
      { id: "lucide:settings", name: "Settings" },
      { id: "lucide:user", name: "User" },
      { id: "lucide:heart", name: "Heart" },
      { id: "lucide:star", name: "Star" },
      { id: "lucide:mail", name: "Mail" },
      { id: "lucide:phone", name: "Phone" },
      { id: "lucide:camera", name: "Camera" },
      { id: "lucide:image", name: "Image" },
      { id: "lucide:video", name: "Video" },
      { id: "lucide:music", name: "Music" },
    ],
  },
  {
    id: "tabler",
    name: "Tabler",
    prefix: "tabler",
    popular: [
      { id: "tabler:brand-instagram", name: "Instagram" },
      { id: "tabler:brand-twitter", name: "Twitter" },
      { id: "tabler:brand-youtube", name: "YouTube" },
      { id: "tabler:brand-facebook", name: "Facebook" },
      { id: "tabler:brand-linkedin", name: "LinkedIn" },
      { id: "tabler:brand-github", name: "GitHub" },
      { id: "tabler:brand-spotify", name: "Spotify" },
      { id: "tabler:brand-tiktok", name: "TikTok" },
    ],
  },
  {
    id: "phosphor",
    name: "Phosphor",
    prefix: "ph",
    popular: [
      { id: "ph:sparkle-fill", name: "Sparkle" },
      { id: "ph:lightning-fill", name: "Bolt" },
      { id: "ph:trophy-fill", name: "Trophy" },
      { id: "ph:puzzle-piece-fill", name: "Puzzle" },
      { id: "ph:smiley-fill", name: "Smiley" },
      { id: "ph:gear-fill", name: "Gear" },
      { id: "ph:bell-fill", name: "Bell" },
      { id: "ph:star-fill", name: "Star" },
    ],
  },
  {
    id: "heroicons",
    name: "Heroicons",
    prefix: "heroicons",
    popular: [
      { id: "heroicons:chart-bar-20-solid", name: "Chart" },
      { id: "heroicons:cube-20-solid", name: "Cube" },
      { id: "heroicons:beaker-20-solid", name: "Beaker" },
      { id: "heroicons:command-line-20-solid", name: "Terminal" },
      { id: "heroicons:fire-20-solid", name: "Fire" },
      { id: "heroicons:globe-alt-20-solid", name: "Globe" },
    ],
  },
  {
    id: "remix",
    name: "Remix",
    prefix: "ri",
    popular: [
      { id: "ri:emotion-happy-fill", name: "Happy" },
      { id: "ri:emotion-sad-fill", name: "Sad" },
      { id: "ri:thumb-up-fill", name: "Like" },
      { id: "ri:chat-3-fill", name: "Chat" },
      { id: "ri:customer-service-fill", name: "Support" },
      { id: "ri:discuss-fill", name: "Discuss" },
    ],
  },
  {
    id: "material",
    name: "Material Symbols",
    prefix: "material-symbols",
    popular: [
      { id: "material-symbols:check-circle", name: "Check" },
      { id: "material-symbols:cancel", name: "Cancel" },
      { id: "material-symbols:info", name: "Info" },
      { id: "material-symbols:warning", name: "Warning" },
      { id: "material-symbols:error", name: "Error" },
      { id: "material-symbols:help", name: "Help" },
    ],
  },
  {
    id: "iconoir",
    name: "Iconoir",
    prefix: "iconoir",
    popular: [
      { id: "iconoir:home", name: "Home" },
      { id: "iconoir:search", name: "Search" },
      { id: "iconoir:settings", name: "Settings" },
      { id: "iconoir:user", name: "User" },
      { id: "iconoir:profile-circle", name: "Profile" },
      { id: "iconoir:mail", name: "Mail" },
      { id: "iconoir:chat-bubble", name: "Chat" },
    ],
  },
  {
    id: "feather",
    name: "Feather",
    prefix: "feather",
    popular: [
      { id: "feather:activity", name: "Activity" },
      { id: "feather:anchor", name: "Anchor" },
      { id: "feather:award", name: "Award" },
      { id: "feather:briefcase", name: "Briefcase" },
      { id: "feather:compass", name: "Compass" },
      { id: "feather:database", name: "Database" },
      { id: "feather:feather", name: "Feather" },
    ],
  },
  {
    id: "eva",
    name: "Eva Icons",
    prefix: "eva",
    popular: [
      { id: "eva:home-outline", name: "Home" },
      { id: "eva:search-outline", name: "Search" },
      { id: "eva:settings-outline", name: "Settings" },
      { id: "eva:person-outline", name: "Person" },
      { id: "eva:email-outline", name: "Email" },
      { id: "eva:bell-outline", name: "Bell" },
    ],
  },
  {
    id: "bootstrap",
    name: "Bootstrap",
    prefix: "bi",
    popular: [
      { id: "bi:house", name: "Home" },
      { id: "bi:search", name: "Search" },
      { id: "bi:gear", name: "Gear" },
      { id: "bi:person", name: "Person" },
      { id: "bi:heart", name: "Heart" },
      { id: "bi:star", name: "Star" },
      { id: "bi:envelope", name: "Email" },
      { id: "bi:telephone", name: "Phone" },
    ],
  },
  {
    id: "radix",
    name: "Radix",
    prefix: "radix-icons",
    popular: [
      { id: "radix-icons:archive", name: "Archive" },
      { id: "radix-icons:arrow-up", name: "Up" },
      { id: "radix-icons:avatar", name: "Avatar" },
      { id: "radix-icons:bookmark", name: "Bookmark" },
      { id: "radix-icons:camera", name: "Camera" },
      { id: "radix-icons:card-stack", name: "Stack" },
    ],
  },
  {
    id: "fa",
    name: "Font Awesome",
    prefix: "fa6-regular,fa6-solid",
    popular: [
      { id: "fa6-solid:house", name: "House" },
      { id: "fa6-solid:user", name: "User" },
      { id: "fa6-solid:magnifying-glass", name: "Search" },
      { id: "fa6-solid:envelope", name: "Email" },
      { id: "fa6-solid:phone", name: "Phone" },
      { id: "fa6-solid:gear", name: "Gear" },
      { id: "fa6-solid:heart", name: "Heart" },
      { id: "fa6-solid:star", name: "Star" },
    ],
  },
  {
    id: "carbon",
    name: "Carbon",
    prefix: "carbon",
    popular: [
      { id: "carbon:analytics", name: "Analytics" },
      { id: "carbon:data-vis-1", name: "Data" },
      { id: "carbon:api", name: "API" },
      { id: "carbon:cloud-upload", name: "Cloud Up" },
      { id: "carbon:settings", name: "Settings" },
      { id: "carbon:user", name: "User" },
    ],
  },
  {
    id: "fluent",
    name: "Fluent UI",
    prefix: "fluent",
    popular: [
      { id: "fluent:people-20-filled", name: "People" },
      { id: "fluent:document-20-filled", name: "Document" },
      { id: "fluent:calendar-20-filled", name: "Date" },
      { id: "fluent:alert-20-filled", name: "Alert" },
      { id: "fluent:settings-20-filled", name: "Settings" },
      { id: "fluent:home-20-filled", name: "Home" },
    ],
  },
  {
    id: "simple",
    name: "Simple Icons (Brands)",
    prefix: "simple-icons",
    popular: [
      { id: "simple-icons:google", name: "Google" },
      { id: "simple-icons:facebook", name: "Facebook" },
      { id: "simple-icons:apple", name: "Apple" },
      { id: "simple-icons:microsoft", name: "Microsoft" },
      { id: "simple-icons:amazon", name: "Amazon" },
      { id: "simple-icons:youtube", name: "YouTube" },
    ],
  },
  {
    id: "openmoji",
    name: "OpenMoji",
    prefix: "openmoji",
    popular: [
      { id: "openmoji:grinning-face", name: "Smile" },
      { id: "openmoji:winking-face", name: "Wink" },
      { id: "openmoji:red-heart", name: "Heart" },
      { id: "openmoji:sparkles", name: "Sparkles" },
      { id: "openmoji:rocket", name: "Rocket" },
      { id: "openmoji:fire", name: "Fire" },
    ],
  },
  {
    id: "twemoji",
    name: "Twemoji",
    prefix: "twemoji",
    popular: [
      { id: "twemoji:grinning-face", name: "Smile" },
      { id: "twemoji:winking-face", name: "Wink" },
      { id: "twemoji:red-heart", name: "Heart" },
      { id: "twemoji:sparkles", name: "Sparkles" },
      { id: "twemoji:rocket", name: "Rocket" },
      { id: "twemoji:fire", name: "Fire" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface AssetsPanelProps {
  /** The editor's single live document store. */
  studio: UseCreativeStudioResult;
  onEnableDrawingMode?: (shapeType: string) => void;
}

export default function AssetsPanel({ studio, onEnableDrawingMode }: AssetsPanelProps): JSX.Element {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("Shapes");
  const [recentAssets, setRecentAssets] = useState<RecentAsset[]>([]);
  const [iconSearchResults, setIconSearchResults] = useState<string[]>([]);
  const [iconSearchLoading, setIconSearchLoading] = useState(false);
  const [selectedPackId, setSelectedPackId] = useState("all");

  const selectedPack = useMemo(() => {
    return ICON_PACKS.find((p) => p.id === selectedPackId) || ICON_PACKS[0];
  }, [selectedPackId]);

  // Load recent assets on mount and when category switches to Recent.
  useEffect(() => {
    if (category === "Recent") {
      setRecentAssets(getRecentAssets());
    }
  }, [category]);

  const studioRef = useRef(studio);
  useEffect(() => { studioRef.current = studio; }, [studio]);

  // ---------------------------------------------------------------------------
  // Shape insertion
  // ---------------------------------------------------------------------------

  const insertShape = useCallback(
    (shape: ShapeDefinition): void => {
      // ENABLE DRAWING MODE ONLY FOR SIMPLE DRAWABLE SHAPES
      // Complex shapes (pentagon, heart, etc.) are created instantly at canvas center
      const drawableShapes: Record<string, "rect" | "ellipse" | "line" | "polygon"> = {
        // Basic drawable shapes that user can draw by clicking and dragging
        "rect": "rect",
        "rounded-rect": "rect",
        "circle": "ellipse",
        "ellipse": "ellipse",
        "triangle": "polygon",
        // Lines - all are drawable
        "line-horizontal": "line",
        "line-vertical": "line",
        "line-diagonal": "line",
        "arrow-right": "line",
        "arrow-left": "line",
        "arrow-up": "line",
        "arrow-down": "line",
        "double-arrow-horizontal": "line",
        "double-arrow-vertical": "line",
        // Flowchart shapes that are simple rectangles/diamonds
        "flowchart-process": "rect",
        "flowchart-decision": "polygon", // diamond shape
        "flowchart-terminator": "rect",
      };
      
      if (onEnableDrawingMode) {
        const shapeType = shape.id in drawableShapes ? drawableShapes[shape.id] : shape.id;
        console.log(`[AssetsPanel] Enabling drawing mode for: ${shapeType}`);
        onEnableDrawingMode(shapeType as any);
        return;
      }
      
      // For other shapes, create them instantly at canvas center
      const doc = studio.document;
      if (!doc) {
        studio.newDocument?.(1080, 1080);
        window.setTimeout(() => {
          const latestStudio = studioRef.current;
          if (!latestStudio.document) return;
          const ab = getActiveArtboard(latestStudio.document);
          const cx = (ab?.width ?? 1080) / 2;
          const cy = (ab?.height ?? 1080) / 2;
          const input = shape.insert(cx, cy);
          const existingIds = new Set<string>();
          ab?.layers.forEach((l: any) => existingIds.add(l.id));
          const cmd = createShapeCommand(input, { existingIds, brandKit: latestStudio.brandKit });
          if (cmd) {
            // cmd.layer.name = shape.name;
            latestStudio.dispatchCommand?.(cmd);
            addRecentAsset({ type: "shape", id: shape.id, name: shape.name });
          }
        }, 200);
        return;
      }

      const page = doc.pages.find((p) => p.id === doc.activePageId) ?? doc.pages[0];
      const artboard = page?.artboards.find((a) => a.id === doc.activeArtboardId) ?? page?.artboards[0];
      const cx = (artboard?.width ?? 1080) / 2;
      const cy = (artboard?.height ?? 1080) / 2;
      const input = shape.insert(cx, cy);

      const existingIds = new Set<string>();
      artboard?.layers.forEach((l) => existingIds.add(l.id));
      const cmd = createShapeCommand(input, { existingIds, brandKit: studio.brandKit });
      if (cmd) {
        // cmd.layer.name = shape.name;
        studio.dispatchCommand?.(cmd);
        addRecentAsset({ type: "shape", id: shape.id, name: shape.name });
      }
    },
    [studio],
  );

  // ---------------------------------------------------------------------------
  // Icon insertion (as SVG shape on canvas)
  // ---------------------------------------------------------------------------

  const insertIcon = useCallback(
    (iconId: string, iconName: string): void => {
      const [prefix, name] = iconId.split(":");
      fetch(`https://api.iconify.design/${prefix}/${name}.svg`)
        .then((res) => res.text())
        .then((svgText) => {
          const parser = new DOMParser();
          const docSvg = parser.parseFromString(svgText, "image/svg+xml");
          const svgElement = docSvg.documentElement as unknown as SVGSVGElement;
          if (!svgElement || svgElement.tagName.toLowerCase() !== "svg") {
            return;
          }
          
          let d = svgToPathData(svgElement);
          if (!d) {
            d = "M 0 0 L 24 24"; // fallback path
          }
          
          const viewBox = svgElement.getAttribute("viewBox") || "0 0 24 24";
          const [vx, vy, vw, vh] = viewBox.split(/[\s,]+/).map(Number);
          const viewBoxW = Number.isFinite(vw) && vw > 0 ? vw : 24;
          const viewBoxH = Number.isFinite(vh) && vh > 0 ? vh : 24;
          
          // We want the icon to fit in a 48x48 box, centered at (cx, cy)
          const targetSize = 48;
          const scale = targetSize / Math.max(viewBoxW, viewBoxH);
          
          const doc = studio.document;
          if (!doc) {
            studio.newDocument?.(1080, 1080);
            window.setTimeout(() => {
              const latestStudio = studioRef.current;
              if (!latestStudio.document) return;
              const ab = getActiveArtboard(latestStudio.document);
              const cx = (ab?.width ?? 1080) / 2;
              const cy = (ab?.height ?? 1080) / 2;
              
              const tx = cx - (viewBoxW * scale) / 2 - (vx || 0) * scale;
              const ty = cy - (viewBoxH * scale) / 2 - (vy || 0) * scale;
              const transformStr = `translate(${tx} ${ty}) scale(${scale})`;
              
              const input: ShapeInput = {
                kind: "path",
                d,
                fill: "#7A2E3D",
                stroke: "none",
                transform: transformStr,
              };
              
              const existingIds = new Set<string>();
              ab?.layers.forEach((l: any) => existingIds.add(l.id));
              const cmd = createShapeCommand(input, { existingIds, brandKit: latestStudio.brandKit });
              if (cmd) {
                // cmd.layer.name = iconName;
                latestStudio.dispatchCommand?.(cmd);
                addRecentAsset({ type: "icon", id: iconId, name: iconName });
              }
            }, 200);
            return;
          }
          
          const page = doc.pages.find((p) => p.id === doc.activePageId) ?? doc.pages[0];
          const artboard = page?.artboards.find((a) => a.id === doc.activeArtboardId) ?? page?.artboards[0];
          const cx = (artboard?.width ?? 1080) / 2;
          const cy = (artboard?.height ?? 1080) / 2;
          
          const tx = cx - (viewBoxW * scale) / 2 - (vx || 0) * scale;
          const ty = cy - (viewBoxH * scale) / 2 - (vy || 0) * scale;
          const transformStr = `translate(${tx} ${ty}) scale(${scale})`;
          
          const input: ShapeInput = {
            kind: "path",
            d,
            fill: "#7A2E3D",
            stroke: "none",
            transform: transformStr,
          };
          
          const existingIds = new Set<string>();
          artboard?.layers.forEach((l) => existingIds.add(l.id));
          const cmd = createShapeCommand(input, { existingIds, brandKit: studio.brandKit });
          if (cmd) {
            // cmd.layer.name = iconName;
            studio.dispatchCommand?.(cmd);
            addRecentAsset({ type: "icon", id: iconId, name: iconName });
          }
        })
        .catch((err) => {
          console.error("Failed to load icon SVG", err);
        });
    },
    [studio],
  );

  // ---------------------------------------------------------------------------
  // Icon search via Iconify API
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (category !== "Icons" || !query.trim()) {
      setIconSearchResults([]);
      return;
    }

    const abortController = new AbortController();
    const trimmed = query.trim();

    const debounceTimer = setTimeout(() => {
      setIconSearchLoading(true);
      const prefixParam = selectedPack.prefix ? `&prefixes=${selectedPack.prefix}` : "";
      fetch(`https://api.iconify.design/search?query=${encodeURIComponent(trimmed)}${prefixParam}&limit=60`, {
        signal: abortController.signal,
      })
        .then((res) => res.json())
        .then((data: { icons?: string[] }) => {
          setIconSearchResults(data.icons ?? []);
          setIconSearchLoading(false);
        })
        .catch(() => {
          if (!abortController.signal.aborted) {
            setIconSearchLoading(false);
          }
        });
    }, 350);

    return () => {
      clearTimeout(debounceTimer);
      abortController.abort();
    };
  }, [category, query, selectedPack]);

  // ---------------------------------------------------------------------------
  // Filtered shapes for shape categories
  // ---------------------------------------------------------------------------

  const filteredShapes = useMemo(() => {
    const categoryMap: Record<string, ShapeCategory> = {
      Shapes: "basic",
      Lines: "line",
      Flowchart: "flowchart",
    };
    const shapeCategory = categoryMap[category];
    if (!shapeCategory) return [];

    const shapes = getShapesByCategory(shapeCategory);
    const q = query.trim().toLowerCase();
    if (!q) return shapes;
    return shapes.filter((s) => s.name.toLowerCase().includes(q));
  }, [category, query]);

  // ---------------------------------------------------------------------------
  // Filtered icons for the Icons tab
  // ---------------------------------------------------------------------------

  const filteredIcons = useMemo(() => {
    if (category !== "Icons") return [];
    const q = query.trim().toLowerCase();
    const list = selectedPack.popular;
    if (q && iconSearchResults.length > 0) return []; // search results shown instead
    if (!q) return [...list];
    return list.filter((ic) => ic.name.toLowerCase().includes(q));
  }, [category, query, iconSearchResults, selectedPack]);

  // ---------------------------------------------------------------------------
  // Upload handler
  // ---------------------------------------------------------------------------

  function handleUploadClick(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,image/svg+xml";
    input.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) studio.addUploadedImageLayer?.(f);
    };
    input.click();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={styles.assetsPanel} aria-label="Assets">
      <div className={styles.assetsTop}>
        <div className={styles.lpSearch}>
          <Search size={14} className="lucide" />
          <input
            aria-label="Search assets"
            placeholder={category === "Icons" ? "Search 200K+ icons…" : "Search assets…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className={styles.assetsCats}>
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`${styles.assetCatBtn} ${category === tab.id ? styles.assetCatActive : ""}`}
              onClick={() => { setCategory(tab.id); setQuery(""); }}
            >
              {tab.id === "Recent" ? <Clock size={12} style={{ marginRight: 2 }} /> : null}
              {tab.label}
            </button>
          ))}
        </div>
        {category === "Icons" ? (
          <div className={styles.packSelectRow} style={{ padding: "4px 8px 8px", display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--p-fg-2)" }}>Pack:</span>
            <select
              aria-label="Select Icon Pack"
              value={selectedPackId}
              onChange={(e) => setSelectedPackId(e.target.value)}
              style={{
                background: "var(--p-bg-3)",
                border: "1px solid var(--p-border)",
                borderRadius: 4,
                color: "var(--p-fg-1)",
                fontSize: 11,
                padding: "2px 4px",
                cursor: "pointer",
                outline: "none",
                flex: 1
              }}
            >
              {ICON_PACKS.map((pack) => (
                <option key={pack.id} value={pack.id}>{pack.name}</option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className={styles.assetsBody}>
        {/* ---- Shapes / Lines / Flowchart ---- */}
        {(category === "Shapes" || category === "Lines" || category === "Flowchart") ? (
          filteredShapes.length === 0 ? (
            <EmptyState message="No shapes match your search." onUpload={handleUploadClick} onBrowse={() => { setQuery(""); }} />
          ) : (
            <div className={styles.assetGrid} role="list">
              {filteredShapes.map((shape) => (
                <button
                  key={shape.id}
                  type="button"
                  role="listitem"
                  className={styles.assetCard}
                  title={shape.name}
                  onClick={() => insertShape(shape)}
                >
                  <div className={styles.assetPreview}>
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 48 48"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      dangerouslySetInnerHTML={{ __html: shape.preview }}
                    />
                  </div>
                  <div className={styles.assetName}>{shape.name}</div>
                </button>
              ))}
            </div>
          )
        ) : null}

        {/* ---- Icons ---- */}
        {category === "Icons" ? (
          <>
            {iconSearchLoading ? (
              <div className={styles.assetsEmpty}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--p-fg-1)" }}>Searching icons…</div>
              </div>
            ) : query.trim() && iconSearchResults.length > 0 ? (
              <div className={styles.assetGrid} role="list">
                {iconSearchResults.map((iconId) => (
                  <button
                    key={iconId}
                    type="button"
                    role="listitem"
                    className={styles.assetCard}
                    title={iconId}
                    onClick={() => {
                      if (onEnableDrawingMode) {
                        onEnableDrawingMode(`icon:${iconId}`);
                      } else {
                        insertIcon(iconId, iconId.split(":")[1] ?? iconId);
                      }
                    }}
                  >
                    <div className={styles.assetPreview}>
                      <Icon icon={iconId} width={28} height={28} />
                    </div>
                    <div className={styles.assetName}>{iconId.split(":")[1] ?? iconId}</div>
                  </button>
                ))}
              </div>
            ) : query.trim() && iconSearchResults.length === 0 && !iconSearchLoading ? (
              <EmptyState message="No icons found. Try a different keyword." onUpload={handleUploadClick} onBrowse={() => setQuery("")} />
            ) : (
              <>
                <div style={{ padding: "4px 0 8px", fontSize: 11, color: "var(--p-fg-2)", fontWeight: 500 }}>
                  Popular icons • Search for 200K+ more
                </div>
                <div className={styles.assetGrid} role="list">
                  {filteredIcons.map((ic) => (
                    <button
                      key={ic.id}
                      type="button"
                      role="listitem"
                      className={styles.assetCard}
                      title={`${ic.name} (${ic.id})`}
                      onClick={() => {
                        if (onEnableDrawingMode) {
                          onEnableDrawingMode(`icon:${ic.id}`);
                        } else {
                          insertIcon(ic.id, ic.name);
                        }
                      }}
                    >
                      <div className={styles.assetPreview}>
                        <Icon icon={ic.id} width={28} height={28} />
                      </div>
                      <div className={styles.assetName}>{ic.name}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        ) : null}

        {/* ---- Uploads ---- */}
        {category === "Uploads" ? (
          <div className={styles.assetsEmpty}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--p-fg-1)" }}>Your uploads</div>
            <div style={{ marginTop: 8, color: "var(--p-fg-2)" }}>Upload images, SVGs, or assets to use in your designs.</div>
            <div style={{ marginTop: 10 }}>
              <button type="button" className={styles.share} onClick={handleUploadClick}>
                <FilePlus size={14} /> Upload
              </button>
            </div>
          </div>
        ) : null}

        {/* ---- Recently Used ---- */}
        {category === "Recent" ? (
          recentAssets.length === 0 ? (
            <EmptyState
              message="No recently used assets yet. Insert shapes or icons to see them here."
              onUpload={handleUploadClick}
              onBrowse={() => setCategory("Shapes")}
            />
          ) : (
            <div className={styles.assetGrid} role="list">
              {recentAssets.map((asset, idx) => (
                <button
                  key={`${asset.type}-${asset.id}-${idx}`}
                  type="button"
                  role="listitem"
                  className={styles.assetCard}
                  title={asset.name}
                  onClick={() => {
                    if (asset.type === "shape") {
                      const shape = findShapeById(asset.id);
                      if (shape) insertShape(shape);
                    } else {
                      insertIcon(asset.id, asset.name);
                    }
                  }}
                >
                  <div className={styles.assetPreview}>
                    {asset.type === "icon" ? (
                      <Icon icon={asset.id} width={28} height={28} />
                    ) : (
                      <RecentShapePreview shapeId={asset.id} />
                    )}
                  </div>
                  <div className={styles.assetName}>{asset.name}</div>
                </button>
              ))}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState(props: { message: string; onUpload: () => void; onBrowse: () => void }): JSX.Element {
  return (
    <div className={styles.assetsEmpty}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--p-fg-1)" }}>No assets found</div>
      <div style={{ marginTop: 8, color: "var(--p-fg-2)" }}>{props.message}</div>
      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <button type="button" className={styles.share} onClick={props.onUpload}>
          <FilePlus size={14} /> Upload
        </button>
        <button type="button" className={styles.btnGhost} onClick={props.onBrowse}>
          Browse all
        </button>
      </div>
    </div>
  );
}

function RecentShapePreview(props: { shapeId: string }): JSX.Element {
  const shape = findShapeById(props.shapeId);
  if (!shape) {
    return <Star size={28} className="lucide" />;
  }
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      dangerouslySetInnerHTML={{ __html: shape.preview }}
    />
  );
}
