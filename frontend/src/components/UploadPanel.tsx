"use client";

/**
 * UploadPanel — Sidebar panel for uploading images and assets.
 */

import React, { ChangeEvent, useRef, useState } from "react";
import styles from "../editor/CreativeStudio.module.css";
import { Icon } from "../editor/Icon";

export interface UploadPanelProps {
  onUploadImage: (file: File) => Promise<void>;
}

export function UploadPanel({ onUploadImage }: UploadPanelProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    try {
      await onUploadImage(file);
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className={styles.panelSection} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <p className={styles.placeholder} style={{ textAlign: "left" }}>
        Upload images to use in your designs.
      </p>

      <button 
        type="button" 
        className={styles.primaryButton}
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        style={{ padding: "0.75rem" }}
      >
        <Icon name="upload" size={18} />
        <span style={{ marginLeft: "0.5rem" }}>
          {isUploading ? "Uploading..." : "Upload Media"}
        </span>
      </button>

      <input
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        ref={fileInputRef}
        onChange={handleFileChange}
      />
    </div>
  );
}
