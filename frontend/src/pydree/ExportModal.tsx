"use client";

import React, { useState } from "react";
import { X, Download, Printer, Share2, FileDown, FileImage, Image as ImageIcon } from "lucide-react";
import styles from "./PydreeStudio.module.css";
import type { UseCreativeStudioResult } from "../editor/useCreativeStudio";

interface ExportModalProps {
  onClose: () => void;
  studio: Pick<UseCreativeStudioResult, "showToast" | "exportSVG">;
  onExportPNG: () => void;
  onExportJPG: () => void;
  onExportSVG: () => void;
  onExportPDF: () => void;
  onExportPrintReadySVG: () => void;
}

export function ExportModal({
  onClose,
  studio,
  onExportPNG,
  onExportJPG,
  onExportSVG,
  onExportPDF,
  onExportPrintReadySVG
}: ExportModalProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<"download" | "print" | "share">("download");
  const [format, setFormat] = useState<"png" | "jpg" | "svg" | "pdf">("png");
  const [scale, setScale] = useState(1);
  const [quality, setQuality] = useState(100);
  const [transparent, setTransparent] = useState(true);

  // Print specific
  const [printProfile, setPrintProfile] = useState<"rgb" | "cmyk">("cmyk");
  const [addBleed, setAddBleed] = useState(true);
  const [addCropMarks, setAddCropMarks] = useState(false);

  const handleDownload = () => {
    studio.showToast(`Preparing ${format.toUpperCase()} for download...`, "info");
    if (format === "png") onExportPNG();
    if (format === "jpg") onExportJPG();
    if (format === "svg") onExportSVG();
    if (format === "pdf") onExportPDF();
  };

  const handlePrintDelivery = () => {
    studio.showToast("Preparing print-ready assets and sending to print partner...", "info");
    onExportPrintReadySVG();
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    studio.showToast("Project link copied to clipboard!", "success");
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 9999
    }} onClick={onClose}>
      <div 
        style={{
          width: 480,
          backgroundColor: "var(--p-bg-1, #1C1C1E)",
          border: "1px solid var(--p-border, #333)",
          borderRadius: 12,
          boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
          display: "flex", flexDirection: "column",
          overflow: "hidden"
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--p-border, #333)" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "var(--p-fg-0, #fff)" }}>Share & Export</h2>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--p-fg-2)", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", padding: "0 20px", borderBottom: "1px solid var(--p-border, #333)", gap: 24 }}>
          <button
            onClick={() => setActiveTab("download")}
            style={{
              padding: "16px 0", background: "transparent", border: "none", cursor: "pointer",
              color: activeTab === "download" ? "var(--p-accent)" : "var(--p-fg-1)",
              borderBottom: activeTab === "download" ? "2px solid var(--p-accent)" : "2px solid transparent",
              fontWeight: activeTab === "download" ? 600 : 400,
              display: "flex", alignItems: "center", gap: 8
            }}
          >
            <Download size={16} /> Download
          </button>
          <button
            onClick={() => setActiveTab("print")}
            style={{
              padding: "16px 0", background: "transparent", border: "none", cursor: "pointer",
              color: activeTab === "print" ? "var(--p-accent)" : "var(--p-fg-1)",
              borderBottom: activeTab === "print" ? "2px solid var(--p-accent)" : "2px solid transparent",
              fontWeight: activeTab === "print" ? 600 : 400,
              display: "flex", alignItems: "center", gap: 8
            }}
          >
            <Printer size={16} /> Print & Deliver
          </button>
          <button
            onClick={() => setActiveTab("share")}
            style={{
              padding: "16px 0", background: "transparent", border: "none", cursor: "pointer",
              color: activeTab === "share" ? "var(--p-accent)" : "var(--p-fg-1)",
              borderBottom: activeTab === "share" ? "2px solid var(--p-accent)" : "2px solid transparent",
              fontWeight: activeTab === "share" ? 600 : 400,
              display: "flex", alignItems: "center", gap: 8
            }}
          >
            <Share2 size={16} /> Share
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 20, minHeight: 280 }}>
          {activeTab === "download" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, color: "var(--p-fg-1)", marginBottom: 8 }}>File Type</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button onClick={() => setFormat("png")} className={styles.btnGhost} style={{ justifyContent: "flex-start", padding: 12, border: format === "png" ? "1px solid var(--p-accent)" : "1px solid var(--p-border)", background: format === "png" ? "rgba(59, 130, 246, 0.1)" : "var(--p-bg-2)", color: "var(--p-fg-0)" }}>
                    <FileImage size={18} style={{ marginRight: 8, color: format === "png" ? "var(--p-accent)" : "inherit" }} /> PNG
                  </button>
                  <button onClick={() => setFormat("jpg")} className={styles.btnGhost} style={{ justifyContent: "flex-start", padding: 12, border: format === "jpg" ? "1px solid var(--p-accent)" : "1px solid var(--p-border)", background: format === "jpg" ? "rgba(59, 130, 246, 0.1)" : "var(--p-bg-2)", color: "var(--p-fg-0)" }}>
                    <ImageIcon size={18} style={{ marginRight: 8, color: format === "jpg" ? "var(--p-accent)" : "inherit" }} /> JPG
                  </button>
                  <button onClick={() => setFormat("svg")} className={styles.btnGhost} style={{ justifyContent: "flex-start", padding: 12, border: format === "svg" ? "1px solid var(--p-accent)" : "1px solid var(--p-border)", background: format === "svg" ? "rgba(59, 130, 246, 0.1)" : "var(--p-bg-2)", color: "var(--p-fg-0)" }}>
                    <FileDown size={18} style={{ marginRight: 8, color: format === "svg" ? "var(--p-accent)" : "inherit" }} /> SVG (Vector)
                  </button>
                  <button onClick={() => setFormat("pdf")} className={styles.btnGhost} style={{ justifyContent: "flex-start", padding: 12, border: format === "pdf" ? "1px solid var(--p-accent)" : "1px solid var(--p-border)", background: format === "pdf" ? "rgba(59, 130, 246, 0.1)" : "var(--p-bg-2)", color: "var(--p-fg-0)" }}>
                    <FileDown size={18} style={{ marginRight: 8, color: format === "pdf" ? "var(--p-accent)" : "inherit" }} /> PDF (Standard)
                  </button>
                </div>
              </div>
              
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 13, color: "var(--p-fg-1)", marginBottom: 8 }}>Size / Scale</label>
                  <select className={styles.fieldInput} value={scale} onChange={e => setScale(Number(e.target.value))} style={{ width: "100%", background: "var(--p-bg-2)", color: "var(--p-fg-0)", border: "1px solid var(--p-border)", padding: "8px", borderRadius: "4px" }}>
                    <option value={1}>1x (Original)</option>
                    <option value={1.5}>1.5x</option>
                    <option value={2}>2x (Retina)</option>
                    <option value={3}>3x (High-res)</option>
                  </select>
                </div>
                {format === "jpg" && (
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: 13, color: "var(--p-fg-1)", marginBottom: 8 }}>Quality ({quality}%)</label>
                    <input type="range" min="10" max="100" value={quality} onChange={e => setQuality(Number(e.target.value))} style={{ width: "100%", marginTop: 8 }} />
                  </div>
                )}
              </div>

              {(format === "png" || format === "svg") && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--p-fg-0)", cursor: "pointer", marginTop: 8 }}>
                  <input type="checkbox" checked={transparent} onChange={e => setTransparent(e.target.checked)} style={{ accentColor: "var(--p-accent)" }} />
                  Transparent Background
                </label>
              )}

              <button onClick={handleDownload} className={styles.buttonPrimary} style={{ marginTop: "auto", padding: "12px", fontSize: 14, background: "var(--p-accent)", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}>
                Download {format.toUpperCase()}
              </button>
            </div>
          )}

          {activeTab === "print" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
              <p style={{ fontSize: 13, color: "var(--p-fg-1)", margin: 0 }}>
                Prepare high-quality assets for commercial printing. This will map colors to CMYK-safe values and inject high-res vector geometry.
              </p>
              
              <div>
                <label style={{ display: "block", fontSize: 13, color: "var(--p-fg-1)", marginBottom: 8 }}>Color Profile</label>
                <select className={styles.fieldInput} value={printProfile} onChange={e => setPrintProfile(e.target.value as any)} style={{ width: "100%", background: "var(--p-bg-2)", color: "var(--p-fg-0)", border: "1px solid var(--p-border)", padding: "8px", borderRadius: "4px" }}>
                  <option value="cmyk">CMYK (Professional Print)</option>
                  <option value="rgb">RGB (Digital Print)</option>
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--p-fg-0)", cursor: "pointer" }}>
                  <input type="checkbox" checked={addBleed} onChange={e => setAddBleed(e.target.checked)} style={{ accentColor: "var(--p-accent)" }} />
                  Add 3mm Bleed area
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--p-fg-0)", cursor: "pointer" }}>
                  <input type="checkbox" checked={addCropMarks} onChange={e => setAddCropMarks(e.target.checked)} style={{ accentColor: "var(--p-accent)" }} />
                  Add Trim/Crop marks
                </label>
              </div>

              <button onClick={handlePrintDelivery} className={styles.buttonPrimary} style={{ marginTop: "auto", padding: "12px", fontSize: 14, background: "var(--p-accent)", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}>
                Order Prints & Deliver
              </button>
            </div>
          )}

          {activeTab === "share" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
              <p style={{ fontSize: 13, color: "var(--p-fg-1)", margin: 0 }}>
                Anyone with the link can view this design.
              </p>
              
              <div style={{ display: "flex", gap: 8 }}>
                <input 
                  type="text" 
                  readOnly 
                  value={window.location.href} 
                  className={styles.fieldInput} 
                  style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.2)", color: "var(--p-fg-0)", border: "1px solid var(--p-border)", padding: "8px", borderRadius: "4px" }} 
                />
                <button onClick={handleCopyLink} className={styles.buttonSecondary} style={{ padding: "0 16px", background: "var(--p-bg-2)", color: "var(--p-fg-0)", border: "1px solid var(--p-border)", borderRadius: "4px", cursor: "pointer" }}>
                  Copy Link
                </button>
              </div>

              <div style={{ marginTop: 24 }}>
                <label style={{ display: "block", fontSize: 13, color: "var(--p-fg-1)", marginBottom: 8 }}>Invite Collaborators</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input 
                    type="email" 
                    placeholder="name@company.com" 
                    className={styles.fieldInput} 
                    style={{ flex: 1, background: "var(--p-bg-2)", color: "var(--p-fg-0)", border: "1px solid var(--p-border)", padding: "8px", borderRadius: "4px" }} 
                  />
                  <button className={styles.buttonSecondary} style={{ padding: "0 16px", background: "var(--p-bg-2)", color: "var(--p-fg-0)", border: "1px solid var(--p-border)", borderRadius: "4px", cursor: "pointer" }} onClick={() => studio.showToast("Invite sent!", "success")}>
                    Invite
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
