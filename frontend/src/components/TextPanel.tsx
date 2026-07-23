"use client";

/**
 * TextPanel — Sidebar panel for adding text elements.
 */

import styles from "../editor/CreativeStudio.module.css";
import { Icon } from "../editor/Icon";

export interface TextPanelProps {
  onAddText: (text?: string, fontSize?: number, fontWeight?: string) => void;
}

export function TextPanel({ onAddText }: TextPanelProps): JSX.Element {
  return (
    <div className={styles.panelSection} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <button 
        type="button" 
        className={styles.primaryButton}
        onClick={() => onAddText("Add a heading", 48, "700")}
        style={{ padding: "1rem", fontSize: "1.2rem", fontWeight: 700 }}
      >
        Add a heading
      </button>

      <button 
        type="button" 
        className={styles.secondaryButton}
        onClick={() => onAddText("Add a subheading", 24, "600")}
        style={{ padding: "0.75rem", fontSize: "1rem", fontWeight: 600 }}
      >
        Add a subheading
      </button>

      <button 
        type="button" 
        className={styles.secondaryButton}
        onClick={() => onAddText("Add a little bit of body text", 16, "400")}
        style={{ padding: "0.5rem", fontSize: "0.85rem" }}
      >
        Add a little bit of body text
      </button>
    </div>
  );
}
