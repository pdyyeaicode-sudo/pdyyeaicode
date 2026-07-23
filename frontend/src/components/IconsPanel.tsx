"use client";

/**
 * IconsPanel — Sidebar panel for adding shapes and icons.
 */

import styles from "../editor/CreativeStudio.module.css";
import { Icon } from "../editor/Icon";
import React from "react";

export interface IconsPanelProps {
  onAddShape: (shapeType: "rectangle" | "circle" | "triangle" | "line") => void;
}

export function IconsPanel({ onAddShape }: IconsPanelProps): JSX.Element {
  
  const handleDragStart = (e: React.DragEvent, shapeType: string) => {
    e.dataTransfer.setData("application/x-printrocket-shape", shapeType);
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className={styles.panelSection} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <p className={styles.placeholder} style={{ textAlign: "left" }}>Click or drag a shape to add it to the canvas.</p>
      
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
        <button
          type="button"
          className={styles.secondaryButton}
          style={{ flexDirection: "column", gap: "0.5rem", padding: "1rem" }}
          onClick={() => onAddShape("rectangle")}
          draggable
          onDragStart={(e) => handleDragStart(e, "rectangle")}
        >
          <Icon name="square" size={32} />
          <span>Rectangle</span>
        </button>

        <button
          type="button"
          className={styles.secondaryButton}
          style={{ flexDirection: "column", gap: "0.5rem", padding: "1rem" }}
          onClick={() => onAddShape("circle")}
          draggable
          onDragStart={(e) => handleDragStart(e, "circle")}
        >
          <Icon name="circle" size={32} />
          <span>Circle</span>
        </button>

        <button
          type="button"
          className={styles.secondaryButton}
          style={{ flexDirection: "column", gap: "0.5rem", padding: "1rem" }}
          onClick={() => onAddShape("triangle")}
          draggable
          onDragStart={(e) => handleDragStart(e, "triangle")}
        >
          <Icon name="triangle" size={32} />
          <span>Triangle</span>
        </button>

        <button
          type="button"
          className={styles.secondaryButton}
          style={{ flexDirection: "column", gap: "0.5rem", padding: "1rem" }}
          onClick={() => onAddShape("line")}
          draggable
          onDragStart={(e) => handleDragStart(e, "line")}
        >
          <Icon name="line" size={32} />
          <span>Line</span>
        </button>
      </div>
    </div>
  );
}
