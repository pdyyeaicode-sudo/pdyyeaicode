"use client";

/**
 * SidebarNav — the primary vertical navigation strip for the editor.
 * Replaces the horizontal tabs and old ToolRail to match Polotno-style UI.
 */

import { Icon, type IconName } from "./Icon";
import styles from "./CreativeStudio.module.css";

export type SidebarSection =
  | "generate"
  | "templates"
  | "text"
  | "photos"
  | "icons"
  | "upload"
  | "background"
  | "layers"
  | "resize";

export interface SidebarNavProps {
  /** Currently active section. */
  activeSection: SidebarSection;
  /** Select a new section. */
  onSelectSection: (section: SidebarSection) => void;
}

interface NavDefinition {
  id: SidebarSection;
  icon: IconName;
  label: string;
}

const NAV_SECTIONS: readonly NavDefinition[] = [
  { id: "generate", icon: "ai", label: "Generate" },
  { id: "templates", icon: "layout", label: "Templates" },
  { id: "text", icon: "text", label: "Text" },
  { id: "photos", icon: "image", label: "Photos" },
  { id: "icons", icon: "shapes", label: "Elements" },
  { id: "upload", icon: "upload", label: "Uploads" },
  { id: "background", icon: "square", label: "Background" },
  { id: "layers", icon: "layers", label: "Layers" },
  { id: "resize", icon: "maximize", label: "Resize" },
];

export function SidebarNav({ activeSection, onSelectSection }: SidebarNavProps): JSX.Element {
  return (
    <nav className={styles.sidebarNav} aria-label="Sections">
      {NAV_SECTIONS.map((section) => {
        const isActive = section.id === activeSection;
        return (
          <button
            key={section.id}
            type="button"
            className={`${styles.navButton} ${isActive ? styles.navButtonActive : ""}`}
            aria-label={section.label}
            aria-pressed={isActive}
            title={section.label}
            onClick={() => onSelectSection(section.id)}
          >
            <Icon name={section.icon} active={isActive} size={22} />
            <span className={styles.navLabel}>{section.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
