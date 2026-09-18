"use client";

/**
 * FloatingToolbar — A compact floating action bar for primary canvas tools.
 * Replacing the old ToolRail for drawing-specific modes (Select, Hand, Pen).
 */

import { Icon } from "./Icon";
import styles from "./CreativeStudio.module.css";
import type { ToolId } from "./types/documentModel";
import { motion } from "framer-motion";

export interface FloatingToolbarProps {
  activeTool: ToolId;
  onSelectTool: (tool: ToolId) => void;
}

export function FloatingToolbar({ activeTool, onSelectTool }: FloatingToolbarProps): JSX.Element {
  return (
    <motion.div 
      className={styles.floatingToolbar} 
      role="toolbar" 
      aria-label="Canvas tools"
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", damping: 20, stiffness: 300 }}
    >
      <button
        type="button"
        className={`${styles.iconButton} ${activeTool === "select" ? styles.iconButtonActive : ""}`}
        aria-label="Select tool"
        aria-pressed={activeTool === "select"}
        title="Select (V)"
        onClick={() => onSelectTool("select")}
      >
        <Icon name="select" active={activeTool === "select"} />
      </button>

      <button
        type="button"
        className={`${styles.iconButton} ${activeTool === "pan" ? styles.iconButtonActive : ""}`}
        aria-label="Hand tool"
        aria-pressed={activeTool === "pan"}
        title="Hand Tool (H)"
        onClick={() => onSelectTool("pan")}
      >
        <Icon name="hand" active={activeTool === "pan"} />
      </button>

      <div className={styles.toolbarSeparator} aria-hidden />

      <button
        type="button"
        className={`${styles.iconButton} ${activeTool === "pen" ? styles.iconButtonActive : ""}`}
        aria-label="Pen tool"
        aria-pressed={activeTool === "pen"}
        title="Pen"
        onClick={() => onSelectTool("pen")}
      >
        <Icon name="pen" active={activeTool === "pen"} />
      </button>
    </motion.div>
  );
}
