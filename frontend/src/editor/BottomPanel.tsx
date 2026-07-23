"use client";

/**
 * BottomPanel — the lower panel of the shell (Req 13.8, 13.9).
 *
 * In v1 the timeline view is a labeled placeholder that provides no animation
 * functionality and performs no action when its controls are activated (Req
 * 13.9). The inert behaviour is finalized in task 14.2; this scaffold renders
 * the placeholder so the shell layout is complete.
 *
 * One responsibility per file: the bottom-panel placeholder surface.
 */

import { Icon } from "./Icon";
import styles from "./CreativeStudio.module.css";

export interface BottomPanelProps {
  gridEnabled?: boolean;
  onGridToggle?: () => void;
  rulersEnabled?: boolean;
  onRulersToggle?: () => void;
}

export function BottomPanel({
  gridEnabled = false,
  onGridToggle,
  rulersEnabled = false,
  onRulersToggle,
}: BottomPanelProps = {}): JSX.Element {
  return (
    <footer className={styles.bottomPanel} aria-label="Timeline">
      <span className={styles.bottomLabel}>Timeline</span>
      <button
        type="button"
        className={styles.iconButton}
        aria-label="Play (preview only)"
        title="Timeline is a preview placeholder in v1"
        onClick={() => {
          /* Inert in v1 (Req 13.9): the timeline performs no action. */
        }}
      >
        <Icon name="frame" />
      </button>
      <span>Animation and motion editing are not part of v1.</span>
      
      <div style={{ flex: 1 }} />

      <button
        type="button"
        className={`${styles.iconButton} ${gridEnabled ? styles.active : ''}`}
        aria-label={gridEnabled ? "Hide grid" : "Show grid"}
        title="Toggle grid (Cmd+')"
        onClick={onGridToggle}
        style={{
          background: gridEnabled ? 'var(--bg-tertiary)' : 'transparent',
        }}
      >
        <Icon name="grid" />
      </button>

      <button
        type="button"
        className={`${styles.iconButton} ${rulersEnabled ? styles.active : ''}`}
        aria-label={rulersEnabled ? "Hide rulers" : "Show rulers"}
        title="Toggle rulers (Cmd+R)"
        onClick={onRulersToggle}
        style={{
          background: rulersEnabled ? 'var(--bg-tertiary)' : 'transparent',
        }}
      >
        <Icon name="ruler" />
      </button>
    </footer>
  );
}
