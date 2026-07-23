"use client";

/**
 * TopBar — the Creative Studio application header (Req 13.7).
 *
 * Renders, left to right: project name, undo, redo, save-status indicator, a
 * collaborators placeholder, search, an AI assistant entry, export, share, a
 * theme toggle, and a profile control. Every icon is rendered through {@link Icon}
 * so the line-icon style (Req 13.5/13.6) is enforced centrally; active and
 * disabled states use the accent / muted tokens only (Req 13.10).
 *
 * This is a controlled, presentational component: undo/redo wiring comes from
 * the command history (`useCreativeStudio`); export, share, AI, collaborators,
 * and profile are scaffold seams that later tasks (11.x, 12.x, 14.x) fill in.
 *
 * One responsibility per file: layout + control surface for the header only.
 */

import type { ChangeEvent } from "react";

import { Icon } from "./Icon";
import { ExportMenu } from "./ExportMenu";
import { Switch } from "@astryxdesign/core/Switch";
import styles from "./CreativeStudio.module.css";
import type { SaveStatus, Theme } from "./types/documentModel";

export interface TopBarProps {
  /** Current document name shown in the header. */
  projectName: string;
  /** Whether a command-history undo is available (Req 11.3 disabled indication). */
  canUndo: boolean;
  /** Whether a command-history redo is available (Req 11.5 disabled indication). */
  canRedo: boolean;
  /** Revert the most recent command. */
  onUndo: () => void;
  /** Reapply the most recently undone command. */
  onRedo: () => void;
  /** Current autosave status reflected in the header (Req 11.10). */
  saveStatus: SaveStatus;
  /** Active theme; the toggle flips between dark and light (Req 13.3). */
  theme: Theme;
  /** Toggle and persist the theme. */
  onToggleTheme: () => void;
  /** Current search query (scaffold seam). */
  searchQuery: string;
  /** Update the search query. */
  onSearchChange: (query: string) => void;
  /** Open the AI assistant entry (scaffold seam for later wiring). */
  onOpenAssistant: () => void;
  /** Trigger export SVG */
  onExportSVG: () => void;
  /** Trigger export PNG */
  onExportPNG: () => void;
  /** Trigger export PDF */
  onExportPDF: () => void;
  /** Open the profile control (scaffold placeholder). */
  onOpenProfile: () => void;
}

const SAVE_STATUS_LABEL: Record<SaveStatus, string> = {
  idle: "Saved",
  saving: "Saving…",
  saved: "Saved",
  "save-failed": "Save failed",
};

export function TopBar({
  projectName,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  saveStatus,
  theme,
  onToggleTheme,
  searchQuery,
  onSearchChange,
  onOpenAssistant,
  onExportSVG,
  onExportPNG,
  onExportPDF,
  onOpenProfile,
}: TopBarProps): JSX.Element {
  function handleSearch(event: ChangeEvent<HTMLInputElement>): void {
    onSearchChange(event.target.value);
  }

  return (
    <header className={styles.topBar}>
      <div className={styles.topGroup}>
        <span className={styles.projectName} title={projectName}>
          {projectName}
        </span>
      </div>

      <div className={styles.topGroup}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo"
          title="Undo"
        >
          <Icon name="undo" />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Redo"
          title="Redo"
        >
          <Icon name="redo" />
        </button>
      </div>

      <div
        className={styles.saveStatus}
        role="status"
        aria-label="Save status"
        aria-live="polite"
        data-status={saveStatus}
      >
        <Icon name="save" active={saveStatus === "saving"} size={14} />
        <span>{SAVE_STATUS_LABEL[saveStatus]}</span>
      </div>

      <div className={styles.topSpacer} />

      <div className={styles.collaborators} aria-label="Collaborators">
        <Icon name="user" size={16} />
        <span>Only you</span>
      </div>

      <label className={styles.search}>
        <Icon name="search" size={15} />
        <input
          className={styles.searchInput}
          type="search"
          value={searchQuery}
          onChange={handleSearch}
          placeholder="Search"
          aria-label="Search"
        />
      </label>

      <div className={styles.topGroup}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onOpenAssistant}
          aria-label="AI assistant"
          title="AI assistant"
        >
          <Icon name="ai" />
        </button>

        <ExportMenu 
          onExportSVG={onExportSVG} 
          onExportPNG={onExportPNG} 
          onExportPDF={onExportPDF}
          buttonClassName={styles.iconButton} 
        />

        <div style={{ display: 'flex', alignItems: 'center', marginLeft: '12px', marginRight: '12px' }} title="Toggle Theme">
          <Switch
            value={theme === "dark"}
            onChange={onToggleTheme}
            label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            isLabelHidden={true}
          />
        </div>

        <button
          type="button"
          className={styles.iconButton}
          onClick={onOpenProfile}
          aria-label="Profile"
          title="Profile"
        >
          <Icon name="user" />
        </button>
      </div>
    </header>
  );
}
