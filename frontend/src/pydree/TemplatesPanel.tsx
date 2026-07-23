"use client";

import type { ComponentType } from "react";
import type { UseCreativeStudioResult } from "../editor/useCreativeStudio";
import styles from "./PydreeStudio.module.css";
import { LayoutTemplate, Monitor, Smartphone, BookOpen } from "lucide-react";

interface TemplateDef {
  id: string;
  name: string;
  width: number;
  height: number;
  icon: ComponentType<{ size?: number }>;
  color: string;
  description: string;
}

const TEMPLATES: TemplateDef[] = [
  { id: "insta-post", name: "Instagram Post", width: 1080, height: 1080, icon: Smartphone, color: "#E88FA5", description: "1080 x 1080 px" },
  { id: "insta-story", name: "Instagram Story", width: 1080, height: 1920, icon: Smartphone, color: "#C96781", description: "1080 x 1920 px" },
  { id: "twitter-header", name: "Twitter Header", width: 1500, height: 500, icon: Monitor, color: "#1DA1F2", description: "1500 x 500 px" },
  { id: "a4-flyer", name: "A4 Flyer / Poster", width: 2480, height: 3508, icon: BookOpen, color: "#4A90E2", description: "210 x 297 mm (300 DPI)" },
  { id: "web-banner", name: "Website Hero", width: 1920, height: 1080, icon: Monitor, color: "#50E3C2", description: "1920 x 1080 px" },
];

interface TemplatesPanelProps {
  studio: Pick<UseCreativeStudioResult, "newDocument" | "showToast">;
}

export function TemplatesPanel({ studio }: TemplatesPanelProps): JSX.Element {

  const handleApplyTemplate = (t: TemplateDef): void => {
    if (window.confirm(`Replace the current document with the ${t.name} template?`)) {
      studio.newDocument(t.width, t.height);
      studio.showToast(`Applied ${t.name} template.`, "success");
    }
  };

  return (
    <div className={styles.propertiesPanel}>
      <div className={styles.propSection}>
        <div className={styles.propTitle}>Start from Template</div>
        <p style={{ fontSize: "11px", color: "var(--p-fg-1)", marginBottom: "16px" }}>
          Choose a pre-designed layout to jumpstart your project.
        </p>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {TEMPLATES.map(t => {
            const IconCmp = t.icon;
            return (
              <button 
                key={t.id}
                onClick={() => handleApplyTemplate(t)}
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "12px",
                  padding: "12px", 
                  background: "var(--p-bg-2)", 
                  border: "1px solid var(--p-line)", 
                  borderRadius: "var(--p-r-sm)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease"
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--p-accent)"}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--p-line)"}
              >
                <div style={{ 
                  width: "40px", height: "40px", borderRadius: "8px", 
                  background: t.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff"
                }}>
                  <IconCmp size={20} />
                </div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--p-fg-0)" }}>{t.name}</div>
                  <div style={{ fontSize: "11px", color: "var(--p-fg-1)", marginTop: "2px" }}>{t.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
