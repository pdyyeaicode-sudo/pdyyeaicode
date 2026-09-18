"use client";

/**
 * PropertiesPanel — the right sidebar for editing the current selection (Req
 * 13.8, 13.11).
 *
 * Primary controls reuse the existing `EditorToolbar` (its controls migrate
 * here per the design). Advanced controls live in collapsible sections that are
 * collapsed by default and visually separated from the primary controls,
 * satisfying the progressive-disclosure requirement (Req 13.11). The full
 * per-field property editing and validation land in task 10.x; this scaffold
 * establishes the panel structure, the no-selection document view, and the
 * collapsible advanced seams.
 *
 * One responsibility per file: the properties sidebar shell + disclosure.
 */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Icon } from "./Icon";
import { removeImageBackground } from "./tools/aiTool";
import { calculateAestheticScore } from "./tools/aiScoring";
import { setPropertyCommand } from "./commands/setPropertyCommand";
import { deleteLayerCommand } from "./commands/deleteLayerCommand";
import {
  createLayerCommand,
  fitImageToMask,
  imageMaskSnapshot,
  isMaskShape,
  mintId,
  findLayer,
  findLayerPosition,
  separateLayerCommand,
  getActiveArtboard,
  reorderLayerCommand,
  groupCommand,
  setImageMaskCommand,
  type ImageMaskSnapshot,
} from "./commands";
import { Trash2, Split, ArrowUpToLine, ArrowDownToLine, ArrowUp, ArrowDown, Group, Scan, X } from "lucide-react";
import { AlignmentToolbar } from "./AlignmentToolbar";
import { ActionButtons } from "./ActionButtons";
import { EffectStackPanel } from "./components/effects/EffectStackPanel";


import styles from "./CreativeStudio.module.css";
import { GradientPanel } from "./gradients/GradientPanel";
import {
  buildFilterValue,
  buildPositionCommand,
  buildSizeCommand,
  getLayerBox,
  getLayerFill,
  getLayerStroke,
  getLayerStrokeWidth,
  isTextLayer,
  parseEffects,
  supportsSizeEditing,
  validateCoordinate,
  validateFontSize,
  validateHexColor,
  validateNumberInRange,
  validateOpacityPercent,
  validateBlendMode,
  validateStrokeWidth,
  validateLetterSpacing,
  validateLineHeight,
  validateWordSpacing,
  BLEND_MODES,
  TEXT_DECORATIONS,
  TEXT_DIRECTIONS,
  TEXT_TRANSFORMS,
  type LayerEffects,
  type Validation,
} from "./propertyEditing";
import type { Command, DocumentLayer, ShapeLayer } from "./types/documentModel";
import type { CreativeDocument } from "./types/documentModel";
import type { LayerUpdate } from "../hooks/useDesignStudio";
import type { SVGLayer } from "../types";
import { buildParametricPath } from "./geometry/GeometryEngine";

export interface PropertiesPanelProps {
  /** The single selected layer, or null when nothing (or many) is selected. */
  selectedLayer: SVGLayer | null;
  /** Number of layers currently selected (drives the multi-select seam). */
  selectionCount: number;
  onUpdate: (changes: LayerUpdate) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  /**
   * The single selected Document_Model layer (task 10.1). When provided
   * together with `dispatchCommand`, the panel renders the command-driven
   * single-selection editor; otherwise it falls back to the legacy
   * `EditorToolbar` view.
   */
  documentLayer?: DocumentLayer | null;
  /** Dispatch a Command into the Document_Model history (task 10.1). */
  dispatchCommand?: (command: Command) => void;
  /** Top-level layers array for the active artboard (used to compute indices for delete/duplicate). */
  activeLayers?: DocumentLayer[] | null;
  /** Array of selected layer IDs for multi-selection alignment (Task 4). */
  selectedLayerIds?: string[];
  /** The full creative document for alignment computations (Task 4). */
  document?: CreativeDocument;
  /** Action button props */
  hasClipboard?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onDeleteMultiple?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export function PropertiesPanel({
  selectedLayer,
  selectionCount,
  onUpdate,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  documentLayer,
  dispatchCommand,
  activeLayers,
  selectedLayerIds = [],
  document,
  hasClipboard = false,
  canUndo = false,
  canRedo = false,
  onCopy,
  onCut,
  onPaste,
  onDeleteMultiple,
  onUndo,
  onRedo,
}: PropertiesPanelProps): JSX.Element {
  const hasDocumentEditor = selectionCount <= 1 && documentLayer != null && dispatchCommand != null;

  return (
    <aside className={styles.rightPanel} aria-label="Properties">
      {selectionCount > 1 && document && dispatchCommand ? (
        <MultiSelectionView 
          count={selectionCount}
          selectedLayerIds={selectedLayerIds}
          document={document}
          dispatchCommand={dispatchCommand}
        />
        ) : hasDocumentEditor ? (
          <SingleLayerProperties layer={documentLayer} dispatchCommand={dispatchCommand} activeLayers={activeLayers} defs={document ? getActiveArtboard(document)?.defs : undefined} />
      ) : selectedLayer ? (
        <SingleSelectionView
          selectedLayer={selectedLayer}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
        />
        ) : (
          <DocumentView document={document} activeLayers={activeLayers} dispatchCommand={dispatchCommand} />
        )}
    </aside>
  );
}

interface SingleSelectionViewProps {
  selectedLayer: SVGLayer;
  onUpdate: (changes: LayerUpdate) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function SingleSelectionView({
  selectedLayer,
  onUpdate,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
}: SingleSelectionViewProps): JSX.Element {
  return (
    <>
      <div className={styles.panelSection}>
        <h2 className={styles.sectionTitle}>Properties</h2>
        <p className={styles.placeholder}>
          Primary controls are now located in the floating toolbar above the canvas.
        </p>
      </div>

      <CollapsibleSection title="Effects">
        <p className={styles.placeholder}>
          Shadow and blur effects are added with the properties editor (task 10.x).
        </p>
      </CollapsibleSection>

      <CollapsibleSection title="Export">
        <p className={styles.placeholder}>Per-selection export options arrive with export wiring (task 13.x).</p>
      </CollapsibleSection>
    </>
  );
}

function DocumentView({ document, activeLayers, dispatchCommand }: { document?: CreativeDocument, activeLayers?: DocumentLayer[] | null, dispatchCommand?: (c: Command) => void }): JSX.Element {
  const bgLayer = activeLayers?.find(l => l.role === 'background' || l.name === 'Background');
  const bgFill = (bgLayer as any)?.style?.fill ?? '#ffffff';

  return (
    <>
      <div className={styles.panelSection}>
        <h2 className={styles.sectionTitle}>Document</h2>
        <p className={styles.placeholder}>
          Select a layer to edit its properties. Artboard size and export options appear here when nothing is selected.
        </p>
      </div>

      <CollapsibleSection title="Background">
        {bgLayer && dispatchCommand ? (
          <ColorCommitField
            label="Color"
            value={bgFill}
            validate={(raw) => validateHexColor(raw, "Color")}
            onCommit={(value) => dispatchCommand(setPropertyCommand(bgLayer.id, "fill", bgFill, value))}
          />
        ) : (
          <p className={styles.placeholder}>No background layer found.</p>
        )}
      </CollapsibleSection>
      <CollapsibleSection title="Artboard">
        <p className={styles.placeholder}>Artboard width and height controls arrive with task 10.x.</p>
      </CollapsibleSection>

        <CollapsibleSection title="Export options">
          <p className={styles.placeholder}>Output format and size selection arrive with task 13.x.</p>
        </CollapsibleSection>

        <CollapsibleSection title="AI Aesthetic Scoring">
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "8px 0" }}>
            {(() => {
              if (!document) return null;
              const score = calculateAestheticScore(document);
              const color = score.overall > 80 ? 'var(--color-success)' : score.overall > 50 ? 'var(--color-warning)' : 'var(--color-danger)';
              return (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600 }}>Overall Score</span>
                    <span style={{ fontWeight: 800, fontSize: 18, color }}>{score.overall}/100</span>
                  </div>
                  <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Contrast:</span><span>{score.contrastScore}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Alignment:</span><span>{score.alignmentScore}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Hierarchy:</span><span>{score.hierarchyScore}</span>
                    </div>
                  </div>
                  {score.suggestions.length > 0 && (
                    <div style={{ marginTop: 8, padding: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, fontSize: 12 }}>
                      <strong>AI Suggestions:</strong>
                      <ul style={{ paddingLeft: 16, margin: "4px 0 0 0" }}>
                        {score.suggestions.map((s, i) => <li key={i} style={{marginBottom: 4}}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </CollapsibleSection>
      </>
  );
}

import { batchPropertyCommand } from "./commands";

function getCommonProperties(layers: DocumentLayer[]) {
  if (layers.length === 0) return {} as any;
  if (layers.length === 1) {
    const layer = layers[0] as any;
    return {
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      opacity: layer.opacity ?? 100,
      fill: layer.fill || '#000000',
      blendMode: layer.blendMode ?? 'normal',
    };
  }

  const first = layers[0] as any;
  const allMatch = {
    x: layers.every(l => (l as any).x === first.x),
    y: layers.every(l => (l as any).y === first.y),
    width: layers.every(l => (l as any).width === first.width),
    height: layers.every(l => (l as any).height === first.height),
    opacity: layers.every(l => ((l as any).opacity ?? 100) === (first.opacity ?? 100)),
    fill: layers.every(l => (l as any).fill === first.fill),
    blendMode: layers.every(l => ((l as any).blendMode ?? 'normal') === (first.blendMode ?? 'normal')),
  };

  return {
    x: allMatch.x ? first.x : 'mixed',
    y: allMatch.y ? first.y : 'mixed',
    width: allMatch.width ? first.width : 'mixed',
    height: allMatch.height ? first.height : 'mixed',
    opacity: allMatch.opacity ? (first.opacity ?? 100) : 'mixed',
    blendMode: allMatch.blendMode ? (first.blendMode ?? 'normal') : 'mixed',
  };
}

function MultiSelectionView({ 
  count,
  selectedLayerIds,
  document,
  dispatchCommand,
}: { 
  count: number;
  selectedLayerIds: string[];
  document: CreativeDocument;
  dispatchCommand: (command: Command) => void;
}): JSX.Element {
  const activeArtboard = getActiveArtboard(document);
  const selectedLayers = selectedLayerIds
    .map(id => findLayer(activeArtboard?.layers || [], id))
    .filter(Boolean) as DocumentLayer[];
    
  const commonProps = getCommonProperties(selectedLayers);

  return (
    <>
      <div className={styles.panelSection}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 className={styles.sectionTitle} style={{ margin: 0 }}>{count} layers selected</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                type="button"
                className={styles.iconMini || "icon-mini"}
                title="Group Layers"
                style={{ 
                  color: "var(--p-fg-1, #ffffff)", background: "transparent", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", width: "24px", height: "24px", borderRadius: "4px"
                }}
                onClick={() => {
                  if (activeArtboard) {
                    dispatchCommand(groupCommand(selectedLayerIds, activeArtboard.layers));
                  }
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--p-bg-3, rgba(255,255,255,0.08))"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <Group size={14} />
              </button>
            </div>
          </div>
        
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>X</label>
            <input
              type="text"
              className={styles.fieldInput}
              value={commonProps.x === 'mixed' ? '' : commonProps.x}
              placeholder={commonProps.x === 'mixed' ? 'Mixed' : undefined}
              onChange={(e) => {
                const newX = parseFloat(e.target.value);
                if (!isNaN(newX)) {
                  dispatchCommand(batchPropertyCommand(selectedLayerIds, 'x' as keyof DocumentLayer, selectedLayers.map(l => (l as any).x), newX));
                }
              }}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Y</label>
            <input
              type="text"
              className={styles.fieldInput}
              value={commonProps.y === 'mixed' ? '' : commonProps.y}
              placeholder={commonProps.y === 'mixed' ? 'Mixed' : undefined}
              onChange={(e) => {
                const newY = parseFloat(e.target.value);
                if (!isNaN(newY)) {
                  dispatchCommand(batchPropertyCommand(selectedLayerIds, 'y' as keyof DocumentLayer, selectedLayers.map(l => (l as any).y), newY));
                }
              }}
            />
          </div>
        </div>

        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Opacity</label>
            <input
              type="text"
              className={styles.fieldInput}
              value={commonProps.opacity === 'mixed' ? '' : commonProps.opacity}
              placeholder={commonProps.opacity === 'mixed' ? 'Mixed' : undefined}
              onChange={(e) => {
                const newOpacity = parseFloat(e.target.value);
                if (!isNaN(newOpacity) && newOpacity >= 0 && newOpacity <= 100) {
                  dispatchCommand(batchPropertyCommand(selectedLayerIds, 'opacity' as keyof DocumentLayer, selectedLayers.map(l => l.opacity ?? 100), newOpacity));
                }
              }}
            />
          </div>
        </div>
      </div>

      <AlignmentToolbar
        selectedLayerIds={selectedLayerIds}
        document={document}
        dispatchCommand={dispatchCommand}
      />
    </>
  );
}

/** Typography options surfaced for text layers (Req 9.1). */
const FONT_OPTIONS = [
  "General Sans",
  "Inter",
  "Arial",
  "Roboto",
  "Poppins",
  "Montserrat",
  "Playfair Display",
  "Oswald",
  "Lato",
  "Open Sans",
  "Raleway",
] as const;

const FONT_WEIGHT_OPTIONS = ["normal", "bold"] as const;
const TEXT_ALIGN_OPTIONS = ["left", "center", "right"] as const;

function collectMaskShapes(layers: readonly DocumentLayer[]): ShapeLayer[] {
  const masks: ShapeLayer[] = [];
  for (const candidate of layers) {
    if (isMaskShape(candidate) && candidate.kind !== "line") {
      masks.push(candidate);
    }
    if (candidate.kind === "group") {
      masks.push(...collectMaskShapes(candidate.children));
    }
  }
  return masks;
}

/** Render a number for display, dropping needless trailing decimals. */
function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

interface SingleLayerPropertiesProps {
  layer: DocumentLayer;
  dispatchCommand: (command: Command) => void;
  activeLayers?: DocumentLayer[] | null;
  /**
   * The active artboard's `<defs>`, needed by the gradient panel because paint
   * servers live on the artboard rather than on the layer.
   */
  defs?: string;
}

/**
 * Command-driven single-selection editor (Req 9.1–9.6). Shows position, size,
 * fill, stroke, stroke width, opacity, and (for text) typography. Every commit
 * is validated; a valid change dispatches exactly one Command, while an invalid
 * commit retains the previous value, shows a field-level error, and records no
 * Command (Req 9.3, 9.5). Effects (shadow/blur) live in a collapsed advanced
 * section (Req 13.11) and apply as an SVG filter (Req 9.6).
 */
function SingleLayerProperties({ layer, dispatchCommand, activeLayers, defs }: SingleLayerPropertiesProps): JSX.Element {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const activeLayersProp = ((): DocumentLayer[] | null => null)();
  const box = getLayerBox(layer);
  const fill = getLayerFill(layer);
  const stroke = getLayerStroke(layer);
  const strokeWidth = getLayerStrokeWidth(layer);
  const canResize = supportsSizeEditing(layer);
  const text = isTextLayer(layer) ? layer : null;
  const effects = parseEffects(layer.filter);
  const maskShapes = layer.kind === "image" && activeLayers
    ? collectMaskShapes(activeLayers).filter((candidate) => candidate.id !== layer.id)
    : [];
  const activeMask = layer.kind === "image" && layer.clipPathId
    ? maskShapes.find((candidate) => candidate.id === layer.clipPathId) ?? null
    : null;

  const dispatchIfPresent = (command: Command | null): void => {
    if (command) {
      dispatchCommand(command);
    }
  };

  function handleDelete(): void {
    if (!activeLayers) {
      // Fallback: mark invisible when we cannot compute index
      dispatchCommand(setPropertyCommand(layer.id, "visible", layer.visible, false));
      return;
    }
    const pos = findLayerPosition(activeLayers, layer.id);
    if (!pos) {
      dispatchCommand(setPropertyCommand(layer.id, "visible", layer.visible, false));
      return;
    }
    dispatchCommand(deleteLayerCommand(layer, pos));
  }

  function cloneLayerWithNewIds(src: DocumentLayer): DocumentLayer {
    function walk(l: DocumentLayer): DocumentLayer {
      const newId = mintId(l.kind === "group" ? "group" : l.kind === "image" ? "image" : l.kind === "text" ? "text" : "shape");
      if (l.kind === "group") {
        return { ...l, id: newId, children: l.children.map((c) => walk(c)) };
      }
      // For leaf shapes/text/images, copy and remap elementId/field where present
      const copy = JSON.parse(JSON.stringify(l)) as DocumentLayer;
      copy.id = newId;
      if ((copy as any).elementId) {
        (copy as any).elementId = `${newId}-element`;
      }
      if ((copy as any).field) {
        (copy as any).field = `${newId}-field`;
      }
      return copy;
    }

    return walk(src);
  }
  function handleDuplicate(): void {
    if (!activeLayers) {
      return;
    }
    const pos = findLayerPosition(activeLayers, layer.id);
    if (!pos) {
      return;
    }
    const next = cloneLayerWithNewIds(layer);
    dispatchCommand(createLayerCommand(next, { parentId: pos.parentId, index: pos.index + 1 }));
  }
  const pos = activeLayers ? findLayerPosition(activeLayers, layer.id) : null;
  const isNested = pos && pos.parentId !== null;

  function handleSeparate(): void {
    if (!activeLayers || !pos) return;
    dispatchCommand(separateLayerCommand(layer, pos));
  }

  function handleReorder(direction: 'up' | 'down' | 'front' | 'back'): void {
    if (!activeLayers || !pos) return;
    let newIndex = pos.index;
    
    // Background layer should always stay at 0. But for other layers, index bounds are 1 to activeLayers.length - 1 if background exists.
    // For simplicity, we just constrain the index to 0 to activeLayers.length - 1
    const maxIndex = activeLayers.length - 1;
    
    if (direction === 'up') {
      newIndex = Math.min(pos.index + 1, maxIndex);
    } else if (direction === 'down') {
      newIndex = Math.max(pos.index - 1, 0);
    } else if (direction === 'front') {
      newIndex = maxIndex;
    } else if (direction === 'back') {
      // If there's a background layer, we should probably only go to index 1, but for now we'll allow 0
      const hasBackground = activeLayers.length > 0 && activeLayers[0].role === 'background';
      newIndex = hasBackground ? 1 : 0;
    }
    
    if (newIndex !== pos.index) {
      dispatchCommand(reorderLayerCommand(layer.id, pos.index, newIndex));
    }
  }

  const [aiState, setAiState] = useState({ active: false, percent: 0, error: null as string | null });

  return (
    <>
      <div className={styles.panelSection}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Properties</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {isNested && (
              <button
                type="button"
                className={styles.iconMini || "icon-mini"}
                title="Separate Layer"
                style={{ 
                  color: "var(--p-fg-1, #ffffff)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "24px",
                  height: "24px",
                  borderRadius: "4px"
                }}
                onClick={handleSeparate}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--p-bg-3, rgba(255,255,255,0.08))"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <Split size={14} />
              </button>
            )}
            <button
              type="button"
              className={styles.iconMini || "icon-mini"}
              title="Delete Layer"
              style={{ 
                color: "var(--p-bad, #ff4d4f)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "24px",
                height: "24px",
                borderRadius: "4px"
              }}
              onClick={handleDelete}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--p-bg-3, rgba(255,255,255,0.08))"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <Trash2 size={14} />
            </button>
            <div style={{ width: "1px", height: "16px", background: "var(--p-border, #333)", margin: "0 4px" }} />
            <button
              type="button"
              className={styles.iconMini || "icon-mini"}
              title="Bring to Front"
              style={{ color: "var(--p-fg-1, #ffffff)", background: "transparent", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", width: "24px", height: "24px", borderRadius: "4px" }}
              onClick={() => handleReorder('front')}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--p-bg-3, rgba(255,255,255,0.08))"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <ArrowUpToLine size={14} />
            </button>
            <button
              type="button"
              className={styles.iconMini || "icon-mini"}
              title="Bring Forward"
              style={{ color: "var(--p-fg-1, #ffffff)", background: "transparent", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", width: "24px", height: "24px", borderRadius: "4px" }}
              onClick={() => handleReorder('up')}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--p-bg-3, rgba(255,255,255,0.08))"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              className={styles.iconMini || "icon-mini"}
              title="Send Backward"
              style={{ color: "var(--p-fg-1, #ffffff)", background: "transparent", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", width: "24px", height: "24px", borderRadius: "4px" }}
              onClick={() => handleReorder('down')}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--p-bg-3, rgba(255,255,255,0.08))"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <ArrowDown size={14} />
            </button>
            <button
              type="button"
              className={styles.iconMini || "icon-mini"}
              title="Send to Back"
              style={{ color: "var(--p-fg-1, #ffffff)", background: "transparent", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", width: "24px", height: "24px", borderRadius: "4px" }}
              onClick={() => handleReorder('back')}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--p-bg-3, rgba(255,255,255,0.08))"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <ArrowDownToLine size={14} />
            </button>
          </div>
        </div>

        {box ? (
          <div className={styles.fieldGrid}>
            <CommitField
              label="X"
              value={formatValue(box.x)}
              validate={(raw) => validateCoordinate(raw, "X")}
              onCommit={(value) => dispatchIfPresent(buildPositionCommand(layer, "x", value))}
            />
            <CommitField
              label="Y"
              value={formatValue(box.y)}
              validate={(raw) => validateCoordinate(raw, "Y")}
              onCommit={(value) => dispatchIfPresent(buildPositionCommand(layer, "y", value))}
            />
            <CommitField
              label="W"
              value={formatValue(box.width)}
              disabled={!canResize}
              validate={(raw) => validateCoordinate(raw, "Width")}
              onCommit={(value) => dispatchIfPresent(buildSizeCommand(layer, "width", value))}
            />
            <CommitField
              label="H"
              value={formatValue(box.height)}
              disabled={!canResize}
              validate={(raw) => validateCoordinate(raw, "Height")}
              onCommit={(value) => dispatchIfPresent(buildSizeCommand(layer, "height", value))}
            />
          </div>
        ) : null}

        <CollapsibleSection title="Effects Stack">
          <EffectStackPanel layer={layer} dispatchCommand={dispatchCommand} />
        </CollapsibleSection>

        <CollapsibleSection title="Fill & Stroke">
          {fill !== null ? (
          <ColorCommitField
            label="Fill"
            value={fill}
            validate={(raw) => validateHexColor(raw, "Fill")}
            onCommit={(value) => dispatchCommand(setPropertyCommand(layer.id, "fill", fill, value))}
          />
        ) : null}
        {stroke !== null && !["rect", "ellipse", "line", "polygon", "path"].includes(layer.kind) ? (
          <ColorCommitField
            label="Stroke"
            value={stroke}
            validate={(raw) => validateHexColor(raw, "Stroke")}
            onCommit={(value) => dispatchCommand(setPropertyCommand(layer.id, "stroke", stroke, value))}
          />
        ) : null}

        {strokeWidth !== null && !["rect", "ellipse", "line", "polygon", "path"].includes(layer.kind) ? (
          <CommitField
            label="Stroke width"
            value={formatValue(strokeWidth)}
            validate={validateStrokeWidth}
            onCommit={(value) => dispatchCommand(setPropertyCommand(layer.id, "strokeWidth", strokeWidth, value))}
          />
        ) : null}
        {["rect", "ellipse", "line", "polygon", "path"].includes(layer.kind) ? (
          <>
            <ColorCommitField
              label="Stroke"
              value={(layer as any).stroke ?? ""}
              validate={(raw) => raw === "" ? { ok: true, value: "" } : validateHexColor(raw, "Stroke")}
              onCommit={(value) => dispatchCommand(setPropertyCommand(layer.id, "stroke", (layer as any).stroke || "", value))}
            />
            <CommitField
              label="Stroke width"
              value={String((layer as any).strokeWidth ?? 1)}
              validate={validateStrokeWidth}
              onCommit={(value) => dispatchCommand(setPropertyCommand(layer.id, "strokeWidth", (layer as any).strokeWidth, value))}
            />
            {(layer as any).geometry?.type === "rect" ? (
              <CommitField
                label="Corner radius"
                value={String((layer as any).geometry.rx ?? 0)}
                validate={(raw) => validateNumberInRange(raw, 0, 1000, { field: "Radius" })}
                onCommit={(value) => dispatchCommand(setPropertyCommand(layer.id, "geometry", (layer as any).geometry, { ...(layer as any).geometry, rx: value, ry: value }))}
              />
            ) : null}
            {(layer as any).geometry?.type === "parametric" ? (
              <>
                <div style={{ padding: "8px 0", fontWeight: 600, fontSize: "12px", borderTop: "1px solid var(--p-border)", marginTop: "12px" }}>
                  Parametric Settings
                </div>
                {Object.entries((layer as any).geometry.parameters).map(([key, val]) => (
                  <CommitField
                    key={key}
                    label={key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}
                    value={String(val)}
                    validate={(raw) => validateNumberInRange(raw, -10000, 10000, { field: key })}
                    onCommit={(value) => dispatchCommand(setPropertyCommand(
                      layer.id, 
                      "geometry", 
                      (layer as any).geometry, 
                      { 
                        ...(layer as any).geometry, 
                        parameters: { ...(layer as any).geometry.parameters, [key]: value } 
                      }
                    ))}
                  />
                ))}
                <button
                  type="button"
                  className={styles.btnSecondary}
                  style={{ width: "100%", marginTop: "8px" }}
                  onClick={() => {
                    const geom = (layer as any).geometry;
                    const d = buildParametricPath(geom.shapeType, { x: geom.x, y: geom.y, width: geom.width, height: geom.height }, geom.parameters);
                    dispatchCommand(setPropertyCommand(layer.id, "geometry", geom, { type: "path", d }));
                  }}
                >
                  Convert to Path
                </button>
              </>
            ) : null}
          </>
        ) : null}
        </CollapsibleSection>

        <CollapsibleSection title="Blend & Opacity">
          <div className={styles.fieldGroup}>
            <CommitField
              label="Opacity"
              value={String(layer.opacity)}
              validate={validateOpacityPercent}
              onCommit={(value) => dispatchCommand(setPropertyCommand(layer.id, "opacity", layer.opacity, value))}
            />
            <SelectField
              label="Blend mode"
              value={layer.blendMode || "normal"}
              options={BLEND_MODES}
              onCommit={(value) => dispatchCommand(setPropertyCommand(layer.id, "blendMode", layer.blendMode || "normal", value))}
            />
          </div>
        </CollapsibleSection>

        {/*
          Gradient authoring. Placed next to Blend & Opacity because it is a paint
          decision, and rendered for any layer that has a fill. The engine already
          supported linear and radial gradients with both units, all three spread
          methods and a focal point; this is the control surface for them.
        */}
        {"fill" in layer && defs !== undefined ? (
          <GradientPanel layer={layer} defs={defs} dispatchCommand={dispatchCommand} />
        ) : null}

        {layer.kind === "image" ? (
          <>
            <CollapsibleSection title="Frame & Mask">
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor={`prop-mask-${layer.id}`}>
                Shape mask
              </label>
              <select
                id={`prop-mask-${layer.id}`}
                className={styles.fieldInput}
                aria-label="Shape mask"
                value={layer.clipPathId ?? ""}
                onChange={(event) => {
                  const previous = imageMaskSnapshot(layer);
                  const nextMaskId = event.target.value;
                  if (nextMaskId === "") {
                    const next: ImageMaskSnapshot = {
                      x: layer.x,
                      y: layer.y,
                      width: layer.width,
                      height: layer.height,
                    };
                    dispatchCommand(setImageMaskCommand(layer.id, previous, next));
                    return;
                  }
                  const mask = maskShapes.find((candidate) => candidate.id === nextMaskId);
                  if (mask) {
                    dispatchCommand(setImageMaskCommand(layer.id, previous, fitImageToMask(layer, mask)));
                  }
                }}
              >
                <option value="">No mask</option>
                {layer.clipPathId && !activeMask ? (
                  <option value={layer.clipPathId}>Missing frame</option>
                ) : null}
                {maskShapes.map((mask) => (
                  <option key={mask.id} value={mask.id}>
                    {mask.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={!activeMask}
                onClick={() => {
                  if (!activeMask) {
                    return;
                  }
                  dispatchCommand(
                    setImageMaskCommand(
                      layer.id,
                      imageMaskSnapshot(layer),
                      fitImageToMask(layer, activeMask),
                    ),
                  );
                }}
                title="Fit image to frame"
              >
                <Scan size={14} />
                Fit
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={!layer.clipPathId}
                onClick={() => {
                  const previous = imageMaskSnapshot(layer);
                  dispatchCommand(
                    setImageMaskCommand(layer.id, previous, {
                      x: layer.x,
                      y: layer.y,
                      width: layer.width,
                      height: layer.height,
                    }),
                  );
                }}
                title="Remove image mask"
              >
                <X size={14} />
                Remove
              </button>
            </div>
          </CollapsibleSection>
          <CollapsibleSection title="Edge AI Tools">
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 0" }}>
              <button
                type="button"
                className={styles.btnPrimary}
                style={{ width: "100%", justifyContent: "center" }}
                disabled={aiState.active}
                onClick={async () => {
                  setAiState({ active: true, percent: 0, error: null });
                  const res = await removeImageBackground(layer, (progress) => {
                     setAiState(prev => ({ ...prev, percent: progress }));
                  });
                  if (res.ok && res.command) {
                     dispatchCommand(res.command);
                     setAiState({ active: false, percent: 0, error: null });
                  } else {
                     setAiState({ active: false, percent: 0, error: res.error || "Failed" });
                  }
                }}
              >
                {aiState.active ? `Removing Background... ${aiState.percent}%` : "🪄 Remove Background"}
              </button>
              {aiState.error && <p style={{ color: "var(--color-danger)", fontSize: 12 }}>{aiState.error}</p>}
            </div>
          </CollapsibleSection>
          </>
        ) : null}
      </div>

      {text ? (
        <div className={styles.panelSection}>
          <h3 className={styles.sectionTitle}>Typography</h3>
          <div className={styles.fieldGroup}>
            <SelectField
              label="Font family"
              value={text.fontFamily || FONT_OPTIONS[0]}
              options={FONT_OPTIONS}
              onCommit={(value) => dispatchCommand(setPropertyCommand(layer.id, "fontFamily", text.fontFamily, value))}
            />
            <FontSizeField
              value={text.fontSize}
              onCommit={(value) => dispatchCommand(setPropertyCommand(layer.id, "fontSize", text.fontSize, value))}
            />
            <SelectField
              label="Font weight"
              value={text.fontWeight}
              options={FONT_WEIGHT_OPTIONS}
              onCommit={(value) => dispatchCommand(setPropertyCommand(layer.id, "fontWeight", text.fontWeight, value))}
            />
            <SelectField
              label="Text align"
              value={text.textAlign}
              options={TEXT_ALIGN_OPTIONS}
              onCommit={(value) => dispatchCommand(setPropertyCommand(layer.id, "textAlign", text.textAlign, value))}
            />
            {/*
              Typography the renderers already implement but that had no control.
              Both the SVG backend and the Skia engine honour every value here —
              decoration and text-transform are asserted by the cross-language
              parity harness — so leaving them unreachable meant shipping engine
              capability that no user could use.
            */}
            <SelectField
              label="Decoration"
              value={text.textDecoration ?? "none"}
              options={TEXT_DECORATIONS}
              onCommit={(value) => dispatchCommand(setPropertyCommand(layer.id, "textDecoration", text.textDecoration ?? "none", value))}
            />
            <SelectField
              label="Letter case"
              value={text.textTransform ?? "none"}
              options={TEXT_TRANSFORMS}
              onCommit={(value) => dispatchCommand(setPropertyCommand(layer.id, "textTransform", text.textTransform ?? "none", value))}
            />
            <CommitField
              label="Letter spacing"
              value={String(text.letterSpacing ?? 0)}
              validate={validateLetterSpacing}
              onCommit={(value) => dispatchCommand(setPropertyCommand(layer.id, "letterSpacing", text.letterSpacing ?? 0, value))}
            />
            <CommitField
              label="Line height"
              value={String(text.lineHeight ?? 0)}
              validate={validateLineHeight}
              onCommit={(value) => dispatchCommand(setPropertyCommand(layer.id, "lineHeight", text.lineHeight ?? 0, value))}
            />
            <CommitField
              label="Word spacing"
              value={String(text.wordSpacing ?? 0)}
              validate={validateWordSpacing}
              onCommit={(value) => dispatchCommand(setPropertyCommand(layer.id, "wordSpacing", text.wordSpacing ?? 0, value))}
            />
            <SelectField
              label="Direction"
              value={text.direction ?? "ltr"}
              options={TEXT_DIRECTIONS}
              onCommit={(value) => dispatchCommand(setPropertyCommand(layer.id, "direction", text.direction ?? "ltr", value))}
            />
          </div>
        </div>
      ) : null}

      <CollapsibleSection title="Effects">
        <EffectsControls
          effects={effects}
          onChange={(next) => {
            const nextFilter = buildFilterValue(next);
            if (nextFilter === (layer.filter ?? "")) {
              return;
            }
            dispatchCommand(setPropertyCommand(layer.id, "filter", layer.filter ?? "", nextFilter));
          }}
        />
      </CollapsibleSection>
    </>
  );
}

function ColorCommitField<T>({ label, value, validate, onCommit, disabled }: CommitFieldProps<T>): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', width: '100%' }}>
      <div style={{ flex: 1 }}>
        <CommitField label={label} value={value} validate={validate} onCommit={onCommit} disabled={disabled} />
      </div>
      <input 
        type="color" 
        value={value.startsWith('#') && (value.length === 7 || value.length === 4) ? (value.length === 4 ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}` : value) : "#000000"} 
        onChange={(e) => onCommit(e.target.value as any)}
        disabled={disabled}
        style={{ 
          width: '28px', 
          height: '28px', 
          padding: 0, 
          border: '1px solid var(--p-bg-3, #333)', 
          borderRadius: '4px', 
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: value
        }}
        title={`Pick ${label} Color`}
      />
    </div>
  );
}

interface CommitFieldProps<T> {
  label: string;
  /** The current committed value (display form). */
  value: string;
  validate: (raw: string) => Validation<T>;
  onCommit: (value: T) => void;
  disabled?: boolean;
}

/**
 * A single text-entry field that commits on Enter or blur. A valid commit calls
 * `onCommit`; an invalid commit reverts the draft to the previous value and
 * shows an inline error, recording nothing (Req 9.3, 9.5). Committing the
 * unchanged value is a silent no-op.
 */
function CommitField<T>({ label, value, validate, onCommit, disabled }: CommitFieldProps<T>): JSX.Element {
  const [draft, setDraft] = useState<string>(value);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(value);
    setError(null);
  }, [value]);

  const fieldId = `prop-${label.replace(/\s+/g, "-").toLowerCase()}`;

  function commit(): void {
    if (disabled || draft === value) {
      setError(null);
      return;
    }
    const result = validate(draft);
    if (!result.ok) {
      setError(result.error);
      setDraft(value); // retain the previous value (Req 9.3, 9.5)
      return;
    }
    setError(null);
    onCommit(result.value);
  }

  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={fieldId}>
        {label}
      </label>
      <input
        id={fieldId}
        className={styles.fieldInput}
        type="text"
        value={draft}
        disabled={disabled}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
      />
      {error ? (
        <span role="alert" className={styles.fieldError}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: readonly string[];
  onCommit: (value: string) => void;
}

/** A labeled select that dispatches a Command only when the value changes. */
function SelectField({ label, value, options, onCommit }: SelectFieldProps): JSX.Element {
  const fieldId = `prop-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={fieldId}>
        {label}
      </label>
      <select
        id={fieldId}
        className={styles.fieldInput}
        aria-label={label}
        value={value}
        onChange={(event) => {
          if (event.target.value !== value) {
            onCommit(event.target.value);
          }
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Font-size field that clamps to 12..200 px and surfaces an adjustment note
 * when the entered value was out of range (Req 6.6).
 */
function FontSizeField({ value, onCommit }: { value: number; onCommit: (value: number) => void }): JSX.Element {
  const [draft, setDraft] = useState<string>(String(value));
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(String(value));
    setNote(null);
    setError(null);
  }, [value]);

  function commit(): void {
    const result = validateFontSize(draft);
    if (!result.ok) {
      setError(result.error);
      setNote(null);
      setDraft(String(value));
      return;
    }
    setError(null);
    const { value: clamped, adjusted } = result.value;
    setNote(adjusted ? `Adjusted to ${clamped}px` : null);
    setDraft(String(clamped));
    if (clamped !== value) {
      onCommit(clamped);
    }
  }

  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor="prop-font-size">
        Font size
      </label>
      <input
        id="prop-font-size"
        className={styles.fieldInput}
        type="text"
        value={draft}
        aria-label="Font size"
        aria-invalid={error ? true : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
      />
      {error ? (
        <span role="alert" className={styles.fieldError}>
          {error}
        </span>
      ) : note ? (
        <span className={styles.fieldNote}>{note}</span>
      ) : null}
    </div>
  );
}

/**
 * Shadow + blur effect controls (Req 9.6). A change recomputes the layer's CSS
 * filter string and asks the parent to dispatch a single setPropertyCommand.
 */
function EffectsControls({
  effects,
  onChange,
}: {
  effects: LayerEffects;
  onChange: (next: LayerEffects) => void;
}): JSX.Element {
  return (
    <>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="prop-shadow">
          Drop shadow
        </label>
        <input
          id="prop-shadow"
          type="checkbox"
          aria-label="Drop shadow"
          checked={effects.shadow}
          onChange={(event) => onChange({ ...effects, shadow: event.target.checked })}
        />
      </div>
      <CommitField
        label="Blur"
        value={String(effects.blur)}
        validate={(raw) => validateNumberInRange(raw, 0, 100, { field: "Blur" })}
        onCommit={(value) => onChange({ ...effects, blur: value })}
      />
      <CommitField
        label="Brightness (%)"
        value={String(effects.brightness ?? 100)}
        validate={(raw) => validateNumberInRange(raw, 0, 200, { field: "Brightness" })}
        onCommit={(value) => onChange({ ...effects, brightness: value })}
      />
      <CommitField
        label="Contrast (%)"
        value={String(effects.contrast ?? 100)}
        validate={(raw) => validateNumberInRange(raw, 0, 200, { field: "Contrast" })}
        onCommit={(value) => onChange({ ...effects, contrast: value })}
      />
      <CommitField
        label="Saturation (%)"
        value={String(effects.saturate ?? 100)}
        validate={(raw) => validateNumberInRange(raw, 0, 200, { field: "Saturation" })}
        onCommit={(value) => onChange({ ...effects, saturate: value })}
      />
      <CommitField
        label="Grayscale (%)"
        value={String(effects.grayscale ?? 0)}
        validate={(raw) => validateNumberInRange(raw, 0, 100, { field: "Grayscale" })}
        onCommit={(value) => onChange({ ...effects, grayscale: value })}
      />
    </>
  );
}

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
}

/**
 * A single advanced section that is collapsed by default (Req 13.11). The
 * header toggles disclosure; the chevron rotates to indicate the open state.
 */
function CollapsibleSection({ title, children }: CollapsibleSectionProps): JSX.Element {
  const [open, setOpen] = useState<boolean>(false);

  return (
    <section className={styles.collapsible}>
      <button
        type="button"
        className={styles.collapsibleHeader}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{title}</span>
        <span className={`${styles.collapsibleChevron} ${open ? styles.collapsibleChevronOpen : ""}`}>
          <Icon name="chevron" size={16} />
        </span>
      </button>
      {open ? <div className={styles.collapsibleBody}>{children}</div> : null}
    </section>
  );
}

