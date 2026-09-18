/**
 * TextFormattingToolbar.tsx — Floating text formatting toolbar
 * 
 * Shows when text layer is in edit mode, provides font, style, and color controls.
 */

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { setPropertyCommand, type LayerPropName } from "./commands/setPropertyCommand";
import type { Command, DocumentLayer } from "./types/documentModel";
import { Bold, Italic, Underline } from "lucide-react";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { motion } from "framer-motion";

export interface TextFormattingToolbarProps {
  layer: DocumentLayer;
  dispatchCommand: (command: Command) => void;
  onClose: () => void;
}

// Predefined font options
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
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Comic Sans MS",
] as const;

const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 56, 64, 72, 96, 128];

export function TextFormattingToolbar({
  layer,
  dispatchCommand,
  onClose,
}: TextFormattingToolbarProps): JSX.Element | null {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [customFont, setCustomFont] = useState<string>("");
  const [showCustomFontInput, setShowCustomFontInput] = useState<boolean>(false);
  const [bounds, setBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    let raf: number;
    const updateBounds = () => {
      const el = document.querySelector(`[data-layer-id="${layer.id}"]`);
      if (el) {
        const rect = el.getBoundingClientRect();
        // Only update state if position actually changed to avoid render thrashing
        setBounds(prev => {
          if (!prev || Math.abs(prev.x - rect.x) > 1 || Math.abs(prev.y - rect.y) > 1) {
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          }
          return prev;
        });
      }
      raf = requestAnimationFrame(updateBounds);
    };
    updateBounds();
    return () => cancelAnimationFrame(raf);
  }, [layer.id]);
  
  // Get current text properties with type guards
  const currentFontFamily = layer.kind === "text" ? (layer.fontFamily || "Inter") : "Inter";
  const currentFontSize = layer.kind === "text" ? (layer.fontSize || 16) : 16;
  const currentFontWeight = layer.kind === "text" ? (layer.fontWeight || "normal") : "normal";
  const currentFontStyle = 
    layer.kind === "text" && 'fontStyle' in layer
      ? (layer.fontStyle || "normal")
      : "normal";
  const currentTextDecoration = 
    layer.kind === "text" && 'textDecoration' in layer
      ? (layer.textDecoration || "none")
      : "none";
  const currentFill = 
    'fill' in layer ? (layer.fill || "#000000") : "#000000";
  
  // Position toolbar above text, or below if near top edge
  const top = bounds ? (bounds.y < 100 ? bounds.y + bounds.height + 10 : bounds.y - 60) : 0;
  const left = bounds ? Math.max(10, Math.min(bounds.x, window.innerWidth - 500)) : 0;
  
  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        onClose();
      }
    }
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  
  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);
  
  function updateProperty(property: LayerPropName, value: string | number): void {
    if (layer.kind !== "text") {
      return;
    }
    const previousValues: Record<string, string | number> = {
      fontFamily: layer.fontFamily,
      fontSize: layer.fontSize,
      fontWeight: layer.fontWeight,
      fontStyle: layer.fontStyle ?? "normal",
      textDecoration: layer.textDecoration ?? "none",
      fill: layer.fill,
    };
    const previousValue = previousValues[property];
    if (previousValue === undefined || previousValue === value) {
      return;
    }
    dispatchCommand(setPropertyCommand(layer.id, property, previousValue, value));
  }
  
  function toggleBold(): void {
    const newWeight = currentFontWeight === "bold" ? "normal" : "bold";
    updateProperty("fontWeight", newWeight);
  }
  
  function toggleItalic(): void {
    const newStyle = currentFontStyle === "italic" ? "normal" : "italic";
    updateProperty("fontStyle", newStyle);
  }
  
  function toggleUnderline(): void {
    const newDecoration = currentTextDecoration === "underline" ? "none" : "underline";
    updateProperty("textDecoration", newDecoration);
  }
  
  function handleCustomFontSubmit(): void {
    if (customFont.trim()) {
      updateProperty("fontFamily", customFont.trim());
      setCustomFont("");
      setShowCustomFontInput(false);
    }
  }

  if (!bounds || layer.kind !== "text") {
    return null;
  }
  
  return (
    <motion.div
      ref={toolbarRef}
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", damping: 25, stiffness: 350 }}
      style={{
        position: "fixed",
        top: `${top}px`,
        left: `${left}px`,
        background: "var(--panel-bg)",
        border: "1px solid var(--border-color)",
        borderRadius: "8px",
        padding: "8px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        zIndex: 10000,
        display: "flex",
        gap: "8px",
        alignItems: "center",
        fontSize: "13px",
      }}
    >
      {/* Font Family Dropdown */}
      <select
        value={currentFontFamily}
        onChange={(e) => updateProperty("fontFamily", e.target.value)}
        style={{
          padding: "4px 8px",
          border: "1px solid var(--border-color)",
          borderRadius: "4px",
          background: "var(--input-bg)",
          color: "var(--text-primary)",
          fontSize: "13px",
          minWidth: "140px",
        }}
      >
        {FONT_OPTIONS.map((font) => (
          <option key={font} value={font} style={{ fontFamily: font }}>
            {font}
          </option>
        ))}
        {!FONT_OPTIONS.includes(currentFontFamily as any) && (
          <option value={currentFontFamily}>{currentFontFamily}</option>
        )}
      </select>
      
      {/* Custom Font Button */}
      <button
        onClick={() => setShowCustomFontInput(!showCustomFontInput)}
        title="Add custom font"
        style={{
          padding: "6px 10px",
          border: "1px solid var(--border-color)",
          borderRadius: "4px",
          background: showCustomFontInput ? "var(--accent-color)" : "transparent",
          color: showCustomFontInput ? "white" : "var(--text-primary)",
          cursor: "pointer",
          fontSize: "13px",
        }}
      >
        +Font
      </button>
      
      {/* Custom Font Input */}
      {showCustomFontInput && (
        <div style={{ display: "flex", gap: "4px" }}>
          <input
            type="text"
            value={customFont}
            onChange={(e) => setCustomFont(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCustomFontSubmit();
            }}
            placeholder="Font name"
            style={{
              padding: "4px 8px",
              border: "1px solid var(--border-color)",
              borderRadius: "4px",
              background: "var(--input-bg)",
              color: "var(--text-primary)",
              fontSize: "13px",
              width: "120px",
            }}
          />
          <button
            onClick={handleCustomFontSubmit}
            style={{
              padding: "4px 8px",
              border: "1px solid var(--border-color)",
              borderRadius: "4px",
              background: "var(--accent-color)",
              color: "white",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            ✓
          </button>
        </div>
      )}
      
      <div style={{ width: "1px", height: "24px", background: "var(--border-color)" }} />
      
      {/* Font Size Dropdown */}
      <select
        value={currentFontSize}
        onChange={(e) => updateProperty("fontSize", Number(e.target.value))}
        style={{
          padding: "4px 8px",
          border: "1px solid var(--border-color)",
          borderRadius: "4px",
          background: "var(--input-bg)",
          color: "var(--text-primary)",
          fontSize: "13px",
          width: "70px",
        }}
      >
        {FONT_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}px
          </option>
        ))}
        {!FONT_SIZES.includes(currentFontSize as any) && (
          <option value={currentFontSize}>{currentFontSize}px</option>
        )}
      </select>
      
      <div style={{ width: "1px", height: "24px", background: "var(--border-color)" }} />
      
      {/* Bold Button */}
      <ToggleButton
        label="Bold (Cmd+B)"
        icon={<Bold size={14} />}
        isPressed={currentFontWeight === "bold"}
        onPressedChange={toggleBold}
      />
      
      {/* Italic Button */}
      <ToggleButton
        label="Italic (Cmd+I)"
        icon={<Italic size={14} />}
        isPressed={currentFontStyle === "italic"}
        onPressedChange={toggleItalic}
      />
      
      {/* Underline Button */}
      <ToggleButton
        label="Underline (Cmd+U)"
        icon={<Underline size={14} />}
        isPressed={currentTextDecoration === "underline"}
        onPressedChange={toggleUnderline}
      />
      
      <div style={{ width: "1px", height: "24px", background: "var(--border-color)" }} />
      
      {/* Color Picker */}
      <input
        type="color"
        value={currentFill}
        onChange={(e) => updateProperty("fill", e.target.value)}
        title="Text color"
        style={{
          width: "32px",
          height: "32px",
          border: "1px solid var(--border-color)",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      />
      
      {/* Close Button */}
      <button
        onClick={onClose}
        title="Close (Esc)"
        style={{
          padding: "6px 10px",
          border: "1px solid var(--border-color)",
          borderRadius: "4px",
          background: "transparent",
          color: "var(--text-primary)",
          cursor: "pointer",
          fontSize: "13px",
          marginLeft: "4px",
        }}
      >
        ✕
      </button>
    </motion.div>
  );
}
