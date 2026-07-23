"use client";

import React, { useRef } from "react";
import styles from "../editor/CreativeStudio.module.css";
import { Icon } from "../editor/Icon";
import { useCreativeStudio } from "../editor/useCreativeStudio";
import { placeImageFile } from "../editor/tools/imageTool";
import { getActiveArtboard } from "../editor/types/documentModel";

export function PhotosPanel(): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const studio = useCreativeStudio();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!studio.document || !studio.dispatchCommand) {
      if (studio.newDocument) {
        studio.newDocument(1080, 1080);
        window.setTimeout(async () => {
          // In a real app we'd wait for document creation cleanly
          // Here we are doing best effort if the document was missing
          if (fileInputRef.current) fileInputRef.current.value = "";
        }, 100);
      }
      return;
    }

    const doc = studio.document;
    const ab = getActiveArtboard(doc);
    if (!ab) return;
    
    const cx = ab.width / 2 - 150;
    const cy = ab.height / 2 - 150;
    
    const result = await placeImageFile(file, { existingLayerIds: ab.layers.map(l => l.id), position: { x: cx, y: cy } });
    if (result.ok) {
      studio.dispatchCommand(result.command);
      if (studio.setActiveLayer) {
        studio.setActiveLayer(result.layer.id);
      }
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className={styles.panelSection} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <p className={styles.placeholder} style={{ textAlign: "left" }}>
        Upload your own photos or graphics.
      </p>
      
      <div style={{ display: "flex", justifyContent: "center", padding: "1rem" }}>
        <button 
          className="layer-visibility-toggle"
          style={{ width: "100%", padding: "0.75rem", background: "var(--accent-primary)", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
          onClick={() => fileInputRef.current?.click()}
        >
          <Icon name="image" size={16} />
          Upload Image
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: "none" }} 
          accept="image/png, image/jpeg, image/webp, image/svg+xml"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
