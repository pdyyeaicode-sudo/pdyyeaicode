"use client";

import styles from "./PydreeStudio.module.css";
import type { BrandKit } from "../types";

const LOCAL_STORAGE_KEY = "printrocket_brandkit";

function colorInputValue(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
}

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
        <p className={styles.propHint}>Used for new text, shapes, and AI generations.</p>
        <div className={styles.propRow}>
          <div className={styles.propLabel}>Primary</div>
          <div className={styles.brandColorControl}>
            <input
              type="color"
              className={styles.brandColorSwatch}
              value={colorInputValue(brandKit.primaryColor)}
              aria-label="Primary brand color picker"
              onChange={(e) => updateBrandKit({ primaryColor: e.target.value })}
            />
            <input
              type="text" 
              className={styles.fieldInput}
              aria-label="Primary brand color"
              value={brandKit.primaryColor}
              onChange={(e) => updateBrandKit({ primaryColor: e.target.value })}
            />
          </div>
        </div>
        <div className={styles.propRow}>
          <div className={styles.propLabel}>Secondary</div>
          <div className={styles.brandColorControl}>
            <input
              type="color"
              className={styles.brandColorSwatch}
              value={colorInputValue(brandKit.secondaryColor)}
              aria-label="Secondary brand color picker"
              onChange={(e) => updateBrandKit({ secondaryColor: e.target.value })}
            />
            <input
              type="text" 
              className={styles.fieldInput}
              aria-label="Secondary brand color"
              value={brandKit.secondaryColor}
              onChange={(e) => updateBrandKit({ secondaryColor: e.target.value })}
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
            aria-label="Primary brand font"
            value={brandKit.fontFamily}
            onChange={(e) => updateBrandKit({ fontFamily: e.target.value })}
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
          aria-label="Brand tone"
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
            aria-label="Logo image URL"
            placeholder="Logo Image URL"
            value={brandKit.logoUrl}
            onChange={(e) => updateBrandKit({ logoUrl: e.target.value })}
            style={{ marginBottom: "8px" }}
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
