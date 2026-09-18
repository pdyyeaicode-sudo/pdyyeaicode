"use client";

import type { ComponentType } from "react";
import type { UseCreativeStudioResult } from "../editor/useCreativeStudio";
import type { DesignOutput } from "../types";
import styles from "./PydreeStudio.module.css";
import { LayoutTemplate, Monitor, Smartphone, BookOpen, Zap } from "lucide-react";

interface TemplateDef {
  id: string;
  name: string;
  icon: ComponentType<{ size?: number }>;
  color: string;
  description: string;
  design?: DesignOutput;
  width?: number;
  height?: number;
}

const MOCK_TEMPLATE_SVG = `
<svg width="1080" height="1080" viewBox="0 0 1080 1080" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <g data-layer-id="bg" data-role="background" data-editable="true">
    <rect x="0" y="0" width="1080" height="1080" fill="#050508"></rect>
  </g>
  <g data-layer-id="neon-circle" data-editable="true">
    <circle cx="540" cy="540" r="300" fill="none" stroke="#ff3d8b" stroke-width="20" stroke-dasharray="20 10" filter="brightness(1.5)"></circle>
  </g>
  <g data-layer-id="headline" data-role="headline" data-editable="true">
    <text x="540" y="520" font-size="120" font-family="Inter" font-weight="bold" fill="#ffffff" text-anchor="middle" data-element-id="headline-text">NEON</text>
  </g>
  <g data-layer-id="subheadline" data-role="headline" data-editable="true">
    <text x="540" y="620" font-size="48" font-family="Inter" font-weight="normal" fill="#00ffff" text-anchor="middle" data-element-id="sub-text">CYBERPUNK NIGHTS</text>
  </g>
</svg>
`;

const TEMPLATES: TemplateDef[] = [
  { 
    id: "cyberpunk-poster", 
    name: "Cyberpunk Poster", 
    icon: Zap, 
    color: "#ff3d8b", 
    description: "Neon themed 1080x1080",
    design: {
      requestId: "tpl-cyberpunk",
      composedSVG: MOCK_TEMPLATE_SVG,
      svgLayers: [
        { id: "bg", role: "background", svgElement: "", isEditable: true },
        { id: "neon-circle", role: "shape", svgElement: "", isEditable: true },
        { id: "headline", role: "headline", svgElement: "", isEditable: true },
        { id: "subheadline", role: "headline", svgElement: "", isEditable: true }
      ],
      printMeta: { bleed: 0, cmykSafe: false, trimMarks: false }
    }
  },
  { id: "insta-post", name: "Instagram Post", width: 1080, height: 1080, icon: Smartphone, color: "#E88FA5", description: "1080 x 1080 px" },
  { id: "insta-story", name: "Instagram Story", width: 1080, height: 1920, icon: Smartphone, color: "#C96781", description: "1080 x 1920 px" },
  { id: "twitter-header", name: "Twitter Header", width: 1500, height: 500, icon: Monitor, color: "#1DA1F2", description: "1500 x 500 px" },
  { id: "a4-flyer", name: "A4 Flyer / Poster", width: 2480, height: 3508, icon: BookOpen, color: "#4A90E2", description: "210 x 297 mm (300 DPI)" },
];

interface TemplatesPanelProps {
  studio: Pick<UseCreativeStudioResult, "newDocument" | "showToast" | "loadDesign">;
}

export function TemplatesPanel({ studio }: TemplatesPanelProps): JSX.Element {

  const handleApplyTemplate = (t: TemplateDef): void => {
    if (window.confirm(`Replace the current document with the ${t.name} template?`)) {
      if (t.design && studio.loadDesign) {
        studio.loadDesign(t.design);
      } else if (t.width && t.height) {
        studio.newDocument(t.width, t.height);
      }
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
