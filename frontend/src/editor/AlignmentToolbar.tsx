/**
 * AlignmentToolbar.tsx — Alignment and distribution controls for multi-selection
 * 
 * Shows 6 alignment buttons and 2 distribution buttons when 2+ layers are selected.
 */

import { useState } from "react";
import { alignLayers, distributeLayers, type AlignMode, type DistributeMode, type AlignmentTarget } from "./utils/alignment";
import { batchTranslateCommand } from "./commands/batchTranslateCommand";
import type { CreativeDocument, Command } from "./types/documentModel";

export interface AlignmentToolbarProps {
  selectedLayerIds: string[];
  document: CreativeDocument;
  dispatchCommand: (command: Command) => void;
}

export function AlignmentToolbar({ selectedLayerIds, document, dispatchCommand }: AlignmentToolbarProps): JSX.Element | null {
  const [alignmentTarget, setAlignmentTarget] = useState<AlignmentTarget>("selection");
  
  // Only show when 2+ layers selected
  if (selectedLayerIds.length < 2) {
    return null;
  }
  
  function handleAlign(mode: AlignMode): void {
    const offsets = alignLayers(selectedLayerIds, mode, alignmentTarget, document);
    if (offsets.length > 0) {
      dispatchCommand(batchTranslateCommand({ offsets }));
    }
  }
  
  function handleDistribute(mode: DistributeMode): void {
    const offsets = distributeLayers(selectedLayerIds, mode, document);
    if (offsets.length > 0) {
      dispatchCommand(batchTranslateCommand({ offsets }));
    }
  }
  
  return (
    <div style={{ padding: "8px 0", borderBottom: "1px solid var(--border-color)" }}>
      <div style={{ fontSize: "11px", fontWeight: 600, marginBottom: "6px", color: "var(--text-secondary)" }}>
        ALIGNMENT
      </div>
      
      {/* Alignment target toggle */}
      <div style={{ marginBottom: "8px", display: "flex", gap: "4px" }}>
        <button
          onClick={() => setAlignmentTarget("selection")}
          style={{
            flex: 1,
            padding: "4px 8px",
            fontSize: "11px",
            border: "1px solid var(--border-color)",
            borderRadius: "4px",
            background: alignmentTarget === "selection" ? "var(--accent-color)" : "transparent",
            color: alignmentTarget === "selection" ? "white" : "var(--text-primary)",
            cursor: "pointer",
          }}
        >
          To Selection
        </button>
        <button
          onClick={() => setAlignmentTarget("artboard")}
          style={{
            flex: 1,
            padding: "4px 8px",
            fontSize: "11px",
            border: "1px solid var(--border-color)",
            borderRadius: "4px",
            background: alignmentTarget === "artboard" ? "var(--accent-color)" : "transparent",
            color: alignmentTarget === "artboard" ? "white" : "var(--text-primary)",
            cursor: "pointer",
          }}
        >
          To Artboard
        </button>
      </div>
      
      {/* Alignment buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4px", marginBottom: "8px" }}>
        <AlignButton title="Align Left" onClick={() => handleAlign("left")}>
          <svg width="16" height="16" viewBox="0 0 16 16">
            <line x1="2" y1="0" x2="2" y2="16" stroke="currentColor" strokeWidth="2" />
            <rect x="4" y="2" width="8" height="3" fill="currentColor" opacity="0.6" />
            <rect x="4" y="6" width="6" height="3" fill="currentColor" opacity="0.6" />
            <rect x="4" y="10" width="10" height="3" fill="currentColor" opacity="0.6" />
          </svg>
        </AlignButton>
        
        <AlignButton title="Align Center Horizontal" onClick={() => handleAlign("center-horizontal")}>
          <svg width="16" height="16" viewBox="0 0 16 16">
            <line x1="8" y1="0" x2="8" y2="16" stroke="currentColor" strokeWidth="2" />
            <rect x="4" y="2" width="8" height="3" fill="currentColor" opacity="0.6" />
            <rect x="5" y="6" width="6" height="3" fill="currentColor" opacity="0.6" />
            <rect x="3" y="10" width="10" height="3" fill="currentColor" opacity="0.6" />
          </svg>
        </AlignButton>
        
        <AlignButton title="Align Right" onClick={() => handleAlign("right")}>
          <svg width="16" height="16" viewBox="0 0 16 16">
            <line x1="14" y1="0" x2="14" y2="16" stroke="currentColor" strokeWidth="2" />
            <rect x="4" y="2" width="8" height="3" fill="currentColor" opacity="0.6" />
            <rect x="6" y="6" width="6" height="3" fill="currentColor" opacity="0.6" />
            <rect x="2" y="10" width="10" height="3" fill="currentColor" opacity="0.6" />
          </svg>
        </AlignButton>
        
        <AlignButton title="Align Top" onClick={() => handleAlign("top")}>
          <svg width="16" height="16" viewBox="0 0 16 16">
            <line x1="0" y1="2" x2="16" y2="2" stroke="currentColor" strokeWidth="2" />
            <rect x="2" y="4" width="3" height="8" fill="currentColor" opacity="0.6" />
            <rect x="6" y="4" width="3" height="6" fill="currentColor" opacity="0.6" />
            <rect x="10" y="4" width="3" height="10" fill="currentColor" opacity="0.6" />
          </svg>
        </AlignButton>
        
        <AlignButton title="Align Center Vertical" onClick={() => handleAlign("center-vertical")}>
          <svg width="16" height="16" viewBox="0 0 16 16">
            <line x1="0" y1="8" x2="16" y2="8" stroke="currentColor" strokeWidth="2" />
            <rect x="2" y="4" width="3" height="8" fill="currentColor" opacity="0.6" />
            <rect x="6" y="5" width="3" height="6" fill="currentColor" opacity="0.6" />
            <rect x="10" y="3" width="3" height="10" fill="currentColor" opacity="0.6" />
          </svg>
        </AlignButton>
        
        <AlignButton title="Align Bottom" onClick={() => handleAlign("bottom")}>
          <svg width="16" height="16" viewBox="0 0 16 16">
            <line x1="0" y1="14" x2="16" y2="14" stroke="currentColor" strokeWidth="2" />
            <rect x="2" y="2" width="3" height="10" fill="currentColor" opacity="0.6" />
            <rect x="6" y="6" width="3" height="6" fill="currentColor" opacity="0.6" />
            <rect x="10" y="4" width="3" height="8" fill="currentColor" opacity="0.6" />
          </svg>
        </AlignButton>
      </div>
      
      {/* Distribution buttons */}
      <div style={{ fontSize: "11px", fontWeight: 600, marginBottom: "6px", marginTop: "8px", color: "var(--text-secondary)" }}>
        DISTRIBUTE
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "4px" }}>
        <AlignButton 
          title="Distribute Horizontal" 
          onClick={() => handleDistribute("horizontal")}
          disabled={selectedLayerIds.length < 3}
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            <rect x="1" y="5" width="3" height="6" fill="currentColor" opacity="0.6" />
            <rect x="6" y="5" width="3" height="6" fill="currentColor" opacity="0.6" />
            <rect x="12" y="5" width="3" height="6" fill="currentColor" opacity="0.6" />
            <line x1="4.5" y1="8" x2="5.5" y2="8" stroke="currentColor" strokeWidth="1" />
            <line x1="9.5" y1="8" x2="11.5" y2="8" stroke="currentColor" strokeWidth="1" />
          </svg>
        </AlignButton>
        
        <AlignButton 
          title="Distribute Vertical" 
          onClick={() => handleDistribute("vertical")}
          disabled={selectedLayerIds.length < 3}
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            <rect x="5" y="1" width="6" height="3" fill="currentColor" opacity="0.6" />
            <rect x="5" y="6" width="6" height="3" fill="currentColor" opacity="0.6" />
            <rect x="5" y="12" width="6" height="3" fill="currentColor" opacity="0.6" />
            <line x1="8" y1="4.5" x2="8" y2="5.5" stroke="currentColor" strokeWidth="1" />
            <line x1="8" y1="9.5" x2="8" y2="11.5" stroke="currentColor" strokeWidth="1" />
          </svg>
        </AlignButton>
      </div>
    </div>
  );
}

interface AlignButtonProps {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

function AlignButton({ title, onClick, disabled, children }: AlignButtonProps): JSX.Element {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "8px",
        border: "1px solid var(--border-color)",
        borderRadius: "4px",
        background: "transparent",
        color: "var(--text-primary)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}
