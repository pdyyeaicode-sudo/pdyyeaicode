import { Bold, Italic, AlignLeft, AlignCenter, AlignRight, Trash2, CopyPlus, ArrowUp, ArrowDown } from 'lucide-react';
"use client";

import { LayerUpdate } from "../hooks/useDesignStudio";
import { SVGLayer } from "../types";
import type { DocumentLayer } from "../editor/types/documentModel";

export interface EditorToolbarProps {
  selectedLayer: SVGLayer | null;
  documentLayer?: DocumentLayer | null;
  selectedElement: SVGElement | null;
  onUpdate: (changes: LayerUpdate) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const FONT_OPTIONS = [
  "General Sans",
  "Inter",
  "Arial",
  "Roboto",
  "Poppins",
  "Montserrat",
  "Playfair Display",
  "Oswald",
  "Lato",
  "Open Sans",
  "Raleway",
];

const BLEND_MODE_OPTIONS = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "hue",
  "saturation",
  "color",
  "luminosity",
];

export function EditorToolbar({
  selectedLayer,
  documentLayer = null,
  selectedElement,
  onUpdate,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
}: EditorToolbarProps): JSX.Element | null {
  if (!selectedLayer && !documentLayer) {
    return null;
  }

  const svgMarkup = selectedLayer?.svgElement ?? "";
  const textLayer = documentLayer?.kind === "text" ? documentLayer : null;
  const isTextLayer = textLayer !== null
    || selectedLayer?.role === "headline"
    || selectedLayer?.role === "body"
    || /<text[\s>]/.test(svgMarkup);
  const isShapeOrImageLayer = documentLayer
    ? documentLayer.kind !== "text" && documentLayer.kind !== "group"
    : selectedLayer?.role === "shape"
      || selectedLayer?.role === "image"
      || /<(path|rect|circle|polygon|line|image)[\s>]/.test(svgMarkup);
  const currentFill = readDocumentFill(documentLayer) ?? readAttribute(svgMarkup, "fill") ?? readDataColor(svgMarkup) ?? "#1A1A1A";
  const currentFontSize = textLayer?.fontSize ?? readNumericAttribute(svgMarkup, "font-size") ?? 48;
  const currentFontFamily = textLayer?.fontFamily ?? readFontFamily(svgMarkup) ?? "General Sans";
  const currentOpacity = documentLayer?.opacity ?? Math.round((readNumericAttribute(svgMarkup, "opacity") ?? 1) * 100);
  const currentBlendMode = documentLayer?.blendMode ?? readBlendMode(svgMarkup) ?? "normal";
  const currentFontWeight = textLayer?.fontWeight ?? readAttribute(svgMarkup, "font-weight") ?? "normal";
  const currentFontStyle = textLayer?.fontStyle ?? readAttribute(svgMarkup, "font-style") ?? "normal";
  const currentTextAlign = textLayer?.textAlign ?? readTextAlign(svgMarkup);
  const currentBackgroundFill = readTextBackgroundFill(svgMarkup) ?? "#FFF4D8";

  return (
    <div 
      className="editor-toolbar" 
      data-selected-layer={documentLayer?.id ?? selectedLayer?.id}
      style={{
        position: "absolute",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: "var(--p-bg-1, #1C1C1E)",
        border: "1px solid var(--p-border, #333333)",
        borderRadius: 8,
        padding: "6px 12px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        zIndex: 100,
        color: "var(--p-fg-1, #FFF)"
      }}
    >


// inside the component return
      {isTextLayer ? (
        <div style={{ display: "flex", alignItems: "center", gap: 4, paddingRight: 8, borderRight: "1px solid var(--p-border, #333)" }}>
          <select
            className="toolbar-font-family"
            value={currentFontFamily}
            onChange={(event) => onUpdate({ fontFamily: event.target.value })}
            style={{ padding: "6px 8px", borderRadius: 4, backgroundColor: "var(--p-bg-2, #2C2C2E)", color: "inherit", border: "none" }}
          >
            {FONT_OPTIONS.map((fontOption) => (
              <option key={fontOption} value={fontOption}>
                {fontOption}
              </option>
            ))}
          </select>
          <input
            className="toolbar-font-size"
            type="number"
            min="8"
            max="200"
            value={currentFontSize}
            onChange={(event) => onUpdate({ fontSize: Number.parseInt(event.target.value, 10) || 48 })}
            style={{ width: 50, padding: "6px 4px", borderRadius: 4, backgroundColor: "var(--p-bg-2, #2C2C2E)", color: "inherit", border: "none", textAlign: "center" }}
          />
          <button
            type="button"
            className="toolbar-bold"
            aria-pressed={currentFontWeight === "bold"}
            onClick={() => onUpdate({ fontWeight: currentFontWeight === "bold" ? "normal" : "bold" })}
            style={{ padding: 6, borderRadius: 4, backgroundColor: currentFontWeight === "bold" ? "var(--p-bg-hover, #444)" : "transparent", color: "inherit", border: "none", cursor: "pointer" }}
            title="Bold"
          >
            <Bold size={16} />
          </button>
          <button
            type="button"
            className="toolbar-italic"
            aria-pressed={currentFontStyle === "italic"}
            onClick={() => onUpdate({ fontStyle: currentFontStyle === "italic" ? "normal" : "italic" })}
            style={{ padding: 6, borderRadius: 4, backgroundColor: currentFontStyle === "italic" ? "var(--p-bg-hover, #444)" : "transparent", color: "inherit", border: "none", cursor: "pointer" }}
            title="Italic"
          >
            <Italic size={16} />
          </button>
          
          <div style={{ display: "flex", gap: 2, marginLeft: 4, paddingLeft: 4, borderLeft: "1px solid var(--p-border, #333)" }}>
            <button type="button" aria-pressed={currentTextAlign === "left"} onClick={() => onUpdate({ textAlign: "left" })} style={{ padding: 6, borderRadius: 4, backgroundColor: currentTextAlign === "left" ? "var(--p-bg-hover, #444)" : "transparent", color: "inherit", border: "none", cursor: "pointer" }} title="Align Left">
              <AlignLeft size={16} />
            </button>
            <button type="button" aria-pressed={currentTextAlign === "center"} onClick={() => onUpdate({ textAlign: "center" })} style={{ padding: 6, borderRadius: 4, backgroundColor: currentTextAlign === "center" ? "var(--p-bg-hover, #444)" : "transparent", color: "inherit", border: "none", cursor: "pointer" }} title="Align Center">
              <AlignCenter size={16} />
            </button>
            <button type="button" aria-pressed={currentTextAlign === "right"} onClick={() => onUpdate({ textAlign: "right" })} style={{ padding: 6, borderRadius: 4, backgroundColor: currentTextAlign === "right" ? "var(--p-bg-hover, #444)" : "transparent", color: "inherit", border: "none", cursor: "pointer" }} title="Align Right">
              <AlignRight size={16} />
            </button>
          </div>
          
          <div style={{ display: "flex", gap: 4, marginLeft: 4, paddingLeft: 4, borderLeft: "1px solid var(--p-border, #333)", alignItems: "center" }}>
            <input
              className="toolbar-text-color"
              type="color"
              value={currentFill}
              onChange={(event) => onUpdate({ fill: event.target.value })}
              style={{ width: 24, height: 24, padding: 0, border: "none", borderRadius: 4, cursor: "pointer" }}
              title="Text Color"
            />
            {!documentLayer ? (
              <input
                className="toolbar-text-background"
                type="color"
                value={currentBackgroundFill}
                onChange={(event) => onUpdate({ textBackgroundFill: event.target.value })}
                style={{ width: 24, height: 24, padding: 0, border: "none", borderRadius: 4, cursor: "pointer" }}
                title="Background Color"
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {isShapeOrImageLayer ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 8, borderRight: "1px solid var(--p-border, #333)" }}>
          <input
            className="toolbar-fill-color"
            type="color"
            value={currentFill}
            onChange={(event) => onUpdate({ fill: event.target.value })}
            style={{ width: 24, height: 24, padding: 0, border: "none", borderRadius: 4, cursor: "pointer" }}
            title="Fill Color"
          />
          <input
            className="toolbar-opacity"
            type="range"
            min="0"
            max="100"
            step="1"
            value={currentOpacity}
            onChange={(event) => onUpdate({ opacity: Number.parseInt(event.target.value, 10) })}
            style={{ width: 60 }}
            title="Opacity"
          />
          <select
            className="toolbar-blend-mode"
            value={currentBlendMode}
            onChange={(event) => onUpdate({ blendMode: event.target.value })}
            style={{ padding: "6px 8px", borderRadius: 4, backgroundColor: "var(--p-bg-2, #2C2C2E)", color: "inherit", border: "none" }}
          >
            {BLEND_MODE_OPTIONS.map((blendMode) => (
              <option key={blendMode} value={blendMode}>
                {blendMode}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 4 }}>
        <button type="button" onClick={onDuplicate} style={{ padding: 6, borderRadius: 4, backgroundColor: "transparent", color: "inherit", border: "none", cursor: "pointer" }} title="Duplicate">
          <CopyPlus size={16} />
        </button>
        <button type="button" onClick={onMoveUp} style={{ padding: 6, borderRadius: 4, backgroundColor: "transparent", color: "inherit", border: "none", cursor: "pointer" }} title="Move Up">
          <ArrowUp size={16} />
        </button>
        <button type="button" onClick={onMoveDown} style={{ padding: 6, borderRadius: 4, backgroundColor: "transparent", color: "inherit", border: "none", cursor: "pointer" }} title="Move Down">
          <ArrowDown size={16} />
        </button>
        <button type="button" onClick={onDelete} style={{ padding: 6, borderRadius: 4, backgroundColor: "transparent", color: "#ff4d4f", border: "none", cursor: "pointer" }} title="Delete">
          <Trash2 size={16} />
        </button>
      </div>
      {selectedElement ? <span className="toolbar-selected-element" data-element={selectedElement.tagName.toLowerCase()} /> : null}
    </div>
  );
}

function readDocumentFill(layer: DocumentLayer | null): string | null {
  if (!layer || layer.kind === "group") {
    return null;
  }
  if ("fill" in layer && typeof layer.fill === "string") {
    return layer.fill;
  }
  return null;
}

function readAttribute(svgMarkup: string, attributeName: string): string | null {
  const match = svgMarkup.match(new RegExp(`${attributeName}="([^"]+)"`));
  return match?.[1] ?? null;
}

function readNumericAttribute(svgMarkup: string, attributeName: string): number | null {
  const value = readAttribute(svgMarkup, attributeName);
  if (!value) {
    return null;
  }
  const parsedValue = Number.parseFloat(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function readDataColor(svgMarkup: string): string | null {
  const match = svgMarkup.match(/data-color="(#[0-9a-fA-F]{6})"/);
  return match?.[1] ?? null;
}

function readFontFamily(svgMarkup: string): string | null {
  return readAttribute(svgMarkup, "font-family") ?? readAttribute(svgMarkup, "style")?.match(/font-family:\s*([^;]+)/)?.[1]?.trim() ?? null;
}

function readBlendMode(svgMarkup: string): string | null {
  return readAttribute(svgMarkup, "style")?.match(/mix-blend-mode:\s*([^;]+)/)?.[1]?.trim() ?? null;
}

function readTextAlign(svgMarkup: string): "left" | "center" | "right" {
  const textAnchor = readAttribute(svgMarkup, "text-anchor");
  if (textAnchor === "start") {
    return "left";
  }
  if (textAnchor === "end") {
    return "right";
  }
  return "center";
}

function readTextBackgroundFill(svgMarkup: string): string | null {
  const match = svgMarkup.match(/rect[^>]*data-text-background='true'[^>]*fill="(#[0-9a-fA-F]{6})"/);
  return match?.[1] ?? null;
}
