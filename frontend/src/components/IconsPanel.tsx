"use client";

/**
 * IconsPanel — Sidebar panel for adding shapes and icons.
 */

import styles from "../editor/CreativeStudio.module.css";
import { Icon } from "../editor/Icon";
import React from "react";

export interface IconsPanelProps {
  onAddShape: (shapeType: string) => void;
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
          onClick={() => onAddShape("ellipse")}
          draggable
          onDragStart={(e) => handleDragStart(e, "ellipse")}
        >
          <Icon name="circle" size={32} />
          <span>Ellipse</span>
        </button>

        <button
          type="button"
          className={styles.secondaryButton}
          style={{ flexDirection: "column", gap: "0.5rem", padding: "1rem" }}
          onClick={() => onAddShape("polygon")}
          draggable
          onDragStart={(e) => handleDragStart(e, "polygon")}
        >
          <Icon name="triangle" size={32} />
          <span>Polygon</span>
        </button>

        <button
          type="button"
          className={styles.secondaryButton}
          style={{ flexDirection: "column", gap: "0.5rem", padding: "1rem" }}
          onClick={() => onAddShape("star")}
          draggable
          onDragStart={(e) => handleDragStart(e, "star")}
        >
          <Icon name="star" size={32} />
          <span>Star</span>
        </button>

        <button
          type="button"
          className={styles.secondaryButton}
          style={{ flexDirection: "column", gap: "0.5rem", padding: "1rem" }}
          onClick={() => onAddShape("arrow")}
          draggable
          onDragStart={(e) => handleDragStart(e, "arrow")}
        >
          <Icon name="arrow-right" size={32} />
          <span>Arrow</span>
        </button>

        <button
          type="button"
          className={styles.secondaryButton}
          style={{ flexDirection: "column", gap: "0.5rem", padding: "1rem" }}
          onClick={() => onAddShape("speech_bubble")}
          draggable
          onDragStart={(e) => handleDragStart(e, "speech_bubble")}
        >
          <Icon name="message-square" size={32} />
          <span>Bubble</span>
        </button>

        <button
          type="button"
          className={styles.secondaryButton}
          style={{ flexDirection: "column", gap: "0.5rem", padding: "1rem" }}
          onClick={() => onAddShape("donut")}
          draggable
          onDragStart={(e) => handleDragStart(e, "donut")}
        >
          <Icon name="target" size={32} />
          <span>Donut</span>
        </button>

        <button
          type="button"
          className={styles.secondaryButton}
          style={{ flexDirection: "column", gap: "0.5rem", padding: "1rem" }}
          onClick={() => onAddShape("shield")}
          draggable
          onDragStart={(e) => handleDragStart(e, "shield")}
        >
          <Icon name="shield" size={32} />
          <span>Shield</span>
        </button>

        <button
          type="button"
          className={styles.secondaryButton}
          style={{ flexDirection: "column", gap: "0.5rem", padding: "1rem" }}
          onClick={() => onAddShape("banner")}
          draggable
          onDragStart={(e) => handleDragStart(e, "banner")}
        >
          <Icon name="bookmark" size={32} />
          <span>Banner</span>
        </button>

        <button
          type="button"
          className={styles.secondaryButton}
          style={{ flexDirection: "column", gap: "0.5rem", padding: "1rem" }}
          onClick={() => onAddShape("badge")}
          draggable
          onDragStart={(e) => handleDragStart(e, "badge")}
        >
          <Icon name="award" size={32} />
          <span>Badge</span>
        </button>

        <button
          type="button"
          className={styles.secondaryButton}
          style={{ flexDirection: "column", gap: "0.5rem", padding: "1rem" }}
          onClick={() => onAddShape("cloud")}
          draggable
          onDragStart={(e) => handleDragStart(e, "cloud")}
        >
          <Icon name="cloud" size={32} />
          <span>Cloud</span>
        </button>
      </div>
    </div>
  );
}
