"use client";

import styles from "./PydreeStudio.module.css";
import type { BrandKit } from "../types";

const LOCAL_STORAGE_KEY = "printrocket_brandkit";

interface BrandKitPanelProps {
  brandKit: BrandKit;
  onBrandKitChange: (updates: Partial<BrandKit>) => void;
}

export function BrandKitPanel({ brandKit, onBrandKitChange }: BrandKitPanelProps): JSX.Element {

  const updateBrandKit = (updates: Partial<BrandKit>): void => {
    const next = { ...brandKit, ...updates };
    onBrandKitChange(updates);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The editor remains usable when browser storage is unavailable.
    }
  };

  return (
    <div className={styles.propertiesPanel}>
      <div className={styles.propSection}>
        <div className={styles.propTitle}>Brand Colors</div>
        <div className={styles.propRow}>
          <div className={styles.propLabel}>Primary</div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <div 
              style={{ width: "24px", height: "24px", borderRadius: "4px", backgroundColor: brandKit.primaryColor, border: "1px solid var(--p-line)" }} 
            />
            <input 
              type="text" 
              className={styles.fieldInput} 
              value={brandKit.primaryColor}
              onChange={(e) => updateBrandKit({ primaryColor: e.target.value })}
              style={{ width: "80px" }}
            />
          </div>
        </div>
        <div className={styles.propRow}>
          <div className={styles.propLabel}>Secondary</div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <div 
              style={{ width: "24px", height: "24px", borderRadius: "4px", backgroundColor: brandKit.secondaryColor, border: "1px solid var(--p-line)" }} 
            />
            <input 
              type="text" 
              className={styles.fieldInput} 
              value={brandKit.secondaryColor}
              onChange={(e) => updateBrandKit({ secondaryColor: e.target.value })}
              style={{ width: "80px" }}
            />
          </div>
        </div>
      </div>

      <div className={styles.propDivider} />

      <div className={styles.propSection}>
        <div className={styles.propTitle}>Typography</div>
        <div className={styles.propRow}>
          <div className={styles.propLabel}>Primary Font</div>
          <select 
            className={styles.fieldInput}
            value={brandKit.fontFamily}
            onChange={(e) => updateBrandKit({ fontFamily: e.target.value })}
            style={{ width: "120px" }}
          >
            <option value="General Sans">General Sans</option>
            <option value="Inter">Inter</option>
            <option value="Roboto">Roboto</option>
            <option value="Playfair Display">Playfair Display</option>
          </select>
        </div>
      </div>

      <div className={styles.propDivider} />

      <div className={styles.propSection}>
        <div className={styles.propTitle}>Brand Tone</div>
        <select 
          className={styles.fieldInput}
          value={brandKit.tone}
          onChange={(e) => updateBrandKit({ tone: e.target.value as BrandKit["tone"] })}
          style={{ width: "100%" }}
        >
          <option value="bold">Bold & Energetic</option>
          <option value="minimal">Minimal & Clean</option>
          <option value="festive">Festive & Colorful</option>
          <option value="corporate">Corporate & Professional</option>
        </select>
      </div>

      <div className={styles.propDivider} />

      <div className={styles.propSection}>
        <div className={styles.propTitle}>Logo</div>
        <div className={styles.propRow}>
          <input 
            type="text" 
            className={styles.fieldInput} 
            placeholder="Logo Image URL"
            value={brandKit.logoUrl}
            onChange={(e) => updateBrandKit({ logoUrl: e.target.value })}
            style={{ width: "100%", marginBottom: "8px" }}
          />
        </div>
        {brandKit.logoUrl && (
          <div style={{ padding: "12px", border: "1px solid var(--p-line)", borderRadius: "var(--p-r-xs)", textAlign: "center", background: "var(--p-check-2)" }}>
            <img src={brandKit.logoUrl} alt="Brand Logo" style={{ maxWidth: "100%", maxHeight: "64px", objectFit: "contain" }} />
          </div>
        )}
      </div>
    </div>
  );
}
