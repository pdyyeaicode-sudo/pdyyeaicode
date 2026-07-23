"use client";

/**
 * BackgroundPanel — Sidebar panel for changing the canvas background.
 */

import React from "react";
import styles from "../editor/CreativeStudio.module.css";
import { Icon } from "../editor/Icon";
import type { SceneGraphNode } from "../hooks/sceneGraphStore";

export interface BackgroundPanelProps {
  layers: SceneGraphNode[];
  onUpdateBackground: (color: string) => void;
}

const PRESET_COLORS = [
  "#FFFFFF", "#F3F4F6", "#D1D5DB", "#9CA3AF", "#4B5563", "#111827",
  "#EF4444", "#F97316", "#F59E0B", "#10B981", "#3B82F6", "#6366F1", "#8B5CF6", "#EC4899"
];

export function BackgroundPanel({ layers, onUpdateBackground }: BackgroundPanelProps): JSX.Element {
  
  // Find current background color
  const bgLayer = layers.find(l => l.role === "background");
  const currentBg = bgLayer?.color || "#ffffff";

  return (
    <div className={styles.panelSection} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <h3 style={{ fontSize: "0.8rem", marginBottom: "0.5rem", color: "var(--fg-1)" }}>Default Colors</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.5rem" }}>
          {PRESET_COLORS.map(color => (
            <button
              key={color}
              type="button"
              aria-label={`Set background to ${color}`}
              style={{
                width: "100%",
                aspectRatio: "1/1",
                backgroundColor: color,
                border: currentBg === color ? "2px solid var(--accent)" : "1px solid var(--line)",
                borderRadius: "4px",
                cursor: "pointer",
              }}
              onClick={() => onUpdateBackground(color)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
