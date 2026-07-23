"use client";

import React, { useState, useRef } from "react";
import Cropper, { ReactCropperElement } from "react-cropper";
import "cropperjs/dist/cropper.css";
import styles from "../pydree/PydreeStudio.module.css";
import { X, Check } from "lucide-react";

interface CropModalProps {
  imageSrc: string;
  onCrop: (croppedBase64: string, newWidth: number, newHeight: number) => void;
  onCancel: () => void;
}

export function CropModal({ imageSrc, onCrop, onCancel }: CropModalProps) {
  const cropperRef = useRef<ReactCropperElement>(null);
  const [loading, setLoading] = useState(true);

  function handleSave() {
    const cropper = cropperRef.current?.cropper;
    if (!cropper) return;
    
    // Get the cropped canvas data
    const croppedCanvas = cropper.getCroppedCanvas({
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    });
    
    if (croppedCanvas) {
      // Export as base64 PNG
      const base64 = croppedCanvas.toDataURL("image/png");
      onCrop(base64, croppedCanvas.width, croppedCanvas.height);
    }
  }

  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center" }}>
      <div style={{ background: "#222", padding: "20px", borderRadius: "8px", width: "90%", maxWidth: "800px", height: "80%", display: "flex", flexDirection: "column" }}>
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 style={{ color: "#fff", margin: 0 }}>Crop Image</h2>
          <button onClick={onCancel} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer" }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ flex: 1, position: "relative", minHeight: 0, overflow: "hidden", background: "#111", borderRadius: "4px" }}>
          <Cropper
            src={imageSrc}
            style={{ height: "100%", width: "100%" }}
            initialAspectRatio={NaN}
            guides={true}
            ref={cropperRef}
            viewMode={1}
            dragMode="crop"
            background={false}
            autoCropArea={0.8}
            ready={() => setLoading(false)}
          />
          {loading && (
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "#fff" }}>
              Loading editor...
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px" }}>
          <button 
            onClick={onCancel}
            style={{ padding: "8px 16px", borderRadius: "4px", border: "1px solid #444", background: "transparent", color: "#fff", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            style={{ padding: "8px 16px", borderRadius: "4px", border: "none", background: "#2563eb", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}
          >
            <Check size={16} /> Apply Crop
          </button>
        </div>

      </div>
    </div>
  );
}
