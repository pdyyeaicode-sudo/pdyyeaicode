"use client";

/**
 * CreativeStudio — the v1 editor shell (Req 13.7, 13.8, 13.11).
 *
 * Lays out the full studio chrome: a Top_Bar, a left Tool_Rail, a left sidebar
 * with the six sections (Pages/Layers/Assets/Components/Templates/Generate), the
 * center stage hosting the existing canvas, a right Properties_Panel, and a
 * Bottom_Panel. State flows from the extended `useCreativeStudio` hook (the
 * Document_Model command surface composed over the legacy `useDesignStudio`).
 *
 * This is the scaffold/layout milestone: it renders, compiles, and visibly lays
 * out every panel using the existing data. Full tool interactivity, the
 * selection overlay, pan/zoom, autosave, and export wiring are layered in by
 * later tasks (5.x, 11.x, 12.x, 13.x, 14.x) through clearly-marked seams here.
 * Per task 14.1, this component is intentionally NOT mounted from
 * `DesignStudio.tsx` yet — it stands alone so the existing app keeps working.
 *
 * One responsibility per file: shell composition, theme application, and the
 * wiring of intents from chrome into the hook.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { BottomPanel } from "./BottomPanel";
import type { PenCompletion } from "./tools/penTool";
import { CenterStage } from "./CenterStage";
import { ContextMenu, ContextMenuItem } from "@astryxdesign/core/ContextMenu";
import { LeftSidebar } from "./LeftSidebar";
import { SidebarNav, type SidebarSection } from "./SidebarNav";
import { FloatingToolbar } from "./FloatingToolbar";
import { TextFormattingToolbar } from "./TextFormattingToolbar";
import { PropertiesPanel } from "./PropertiesPanel";
import { usePerformanceMonitor, useLayerCountWarning } from "./hooks/usePerformanceMonitor";
import { TopBar } from "./TopBar";
import { ToastContainer } from "./ToastContainer";
import { applyTheme, persistTheme, resolveTheme } from "./theme";
import { findLayer, getActiveArtboard, createLayerCommand, mintId, groupCommand, findLayerPosition, separateLayerCommand } from "./commands";
import { translateLayerCommand, resizeLayerCommand, rotateLayerCommand } from "./commands";
import { useCreativeStudio } from "./useCreativeStudio";
import { generateShapePath } from "./hooks/useShapeDrawing";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useLayerFocus } from "./hooks/useLayerFocus";
import { createShapeCommand } from "./tools/shapeTool";
import { KeyboardShortcutsPanel } from "./KeyboardShortcutsPanel";
import { LoadingOverlay } from "./LoadingOverlay";
import styles from "./CreativeStudio.module.css";
import type { BoxSnapshot, RotateSnapshot, SaveStatus, Theme, ToolId } from "./types/documentModel";
import type { ResizeSnapshot as CommandResizeSnapshot } from "./commands/resizeLayerCommand";
import type { DesignRequest } from "../types";

const DEFAULT_PROJECT_NAME = "Untitled Design";

export function CreativeStudio(): JSX.Element {
  const studio = useCreativeStudio();

  // Shell-local UI state. These are the seams later tasks promote into the hook
  // (viewport/zoom in 5.x, autosave saveStatus in 12.x, active tool in 7.x).
  const [theme, setTheme] = useState<Theme>(() => resolveTheme());
  const [activeTool, setActiveTool] = useState<ToolId>("select");
  const [activeSection, setActiveSection] = useState<SidebarSection>("generate");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const saveStatus: SaveStatus = "idle";
  
  // Selection is managed by CenterStage's useSelection hook; we track the primary
  // layer here for keyboard shortcuts and PropertiesPanel integration
  const [primaryLayerId, setPrimaryLayerId] = useState<string | null>(null);
  const [selectionCount, setSelectionCount] = useState<number>(0);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [isTextEditing, setIsTextEditing] = useState<boolean>(false);
  
  // Grid and Ruler states (Task 9)
  const [gridEnabled, setGridEnabled] = useState(false);
  const [rulersEnabled, setRulersEnabled] = useState(false);
  const [mousePosition, setMousePosition] = useState<{x: number; y: number} | null>(null);

  // Track mouse position for ruler indicator
  useEffect(() => {
    if (!rulersEnabled) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    
    const handleMouseLeave = () => {
      setMousePosition(null);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [rulersEnabled]);

  // Add grid/ruler shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "'") {
          e.preventDefault();
          setGridEnabled(prev => !prev);
        } else if (e.key === "r") {
          e.preventDefault();
          setRulersEnabled(prev => !prev);
        } else if (e.key === "/") {
          e.preventDefault();
          setShowShortcuts(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  const [showShortcuts, setShowShortcuts] = useState(false);
  
  // Context menu state


  // Layer count warning - get activeArtboard when needed
  const layerCount = studio.document ? (getActiveArtboard(studio.document)?.layers.length || 0) : 0;
  useLayerCountWarning(layerCount, 100);

  // Layer Focus (Task 14)
  // Get activeArtboard first before using it
  const activeArtboard = studio.document ? getActiveArtboard(studio.document) : null;
  
  const { focusedLayerId, focusNext, focusPrevious, clearFocus, setFocusedLayerId } = useLayerFocus(
    studio.document!,
    activeArtboard?.id || ''
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Tab navigation (when not in text edit mode)
      if (e.key === 'Tab' && !isTextEditing) {
        e.preventDefault();
        if (e.shiftKey) {
          focusPrevious();
        } else {
          focusNext();
        }
        return;
      }
      
      // Enter to select focused layer
      if (e.key === 'Enter' && focusedLayerId && !isTextEditing) {
        e.preventDefault();
        studio.setActiveLayer(focusedLayerId);
        clearFocus();
        return;
      }
      
      // Space to edit focused text layer
      if (e.key === ' ' && focusedLayerId && !isTextEditing) {
        if (!studio.document) return;
        const layer = findLayer(getActiveArtboard(studio.document)?.layers || [], focusedLayerId);
        if (layer?.kind === 'text') {
          e.preventDefault();
          setIsTextEditing(true);
          clearFocus();
          return;
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedLayerId, focusNext, focusPrevious, clearFocus, isTextEditing, studio]);

  // Basic interaction heuristic: if a tool is active and we're dragging, or pan tool is active
  const isInteracting = studio.activeTool === "pan" || studio.activeTool === "hand";
  usePerformanceMonitor(isInteracting, layerCount);

  // Expose studio methods to global namespace for E2E tests
  // Ref to hold the selectAll callback from CenterStage
  const selectAllCallbackRef = useRef<((layerIds: string[]) => void) | null>(null);
  
  // Handle tool changes - when shape tool selected, we're in drawing mode
  function handleToolChange(toolId: ToolId): void {
    console.log(`[CreativeStudio] Tool changed to: ${toolId}`);
    setActiveTool(toolId);
    
    // If switching away from drawing tools, go back to select
    if (["rect", "ellipse", "line", "polygon"].includes(toolId)) {
      // Drawing mode - cursor will change in CenterStage
      console.log(`[CreativeStudio] Drawing mode activated: ${toolId}`);
    }
  }

  // Collect all editable layer IDs from current document
  const collectEditableLayerIds = useCallback((): string[] => {
    if (!studio.document) return [];
    const artboard = getActiveArtboard(studio.document);
    if (!artboard) return [];
    
    const collectIds = (layers: any[]): string[] => {
      return layers.flatMap(layer => {
        // Skip locked layers and role-locked layers (logo, print-marks)
        if (layer.locked || layer.role === 'logo' || layer.role === 'print-marks') {
          return [];
        }
        if (!layer.editable) return [];
        
        // For groups, recursively collect children
        if (layer.kind === 'group' && layer.children) {
          return [layer.id, ...collectIds(layer.children)];
        }
        return [layer.id];
      });
    };
    
    return collectIds(artboard.layers);
  }, [studio.document]);

  // Integrate keyboard shortcuts system (Task 3)
  useKeyboardShortcuts({
    hasSelection: selectedLayerIds.length > 0 || primaryLayerId !== null,
    selectionCount: selectedLayerIds.length > 0 ? selectedLayerIds.length : (primaryLayerId ? 1 : 0),
    hasClipboard: studio.clipboard !== null,
    canUndo: studio.canUndo,
    canRedo: studio.canRedo,
    isTextEditing,
    
    onCopy: () => studio.copy(selectedLayerIds.length > 0 ? selectedLayerIds : (primaryLayerId ? [primaryLayerId] : [])),
    onCut: () => studio.cut(selectedLayerIds.length > 0 ? selectedLayerIds : (primaryLayerId ? [primaryLayerId] : [])),
    onPaste: () => studio.paste(),
    onDuplicate: () => studio.duplicate(selectedLayerIds.length > 0 ? selectedLayerIds : (primaryLayerId ? [primaryLayerId] : [])),
    onDelete: () => studio.deleteMultiple(selectedLayerIds.length > 0 ? selectedLayerIds : (primaryLayerId ? [primaryLayerId] : [])),
    
    onSelectAll: () => {
      const editableIds = collectEditableLayerIds();
      if (selectAllCallbackRef.current && editableIds.length > 0) {
        selectAllCallbackRef.current(editableIds);
      }
    },
    
    onGroup: () => {
      const editableIds = collectEditableLayerIds();
      if (editableIds.length > 1 && studio.document) {
        const activeArtboard = getActiveArtboard(studio.document);
        if (activeArtboard) {
          studio.dispatchCommand(groupCommand(editableIds, activeArtboard.layers));
        }
      }
    },
    
    onUngroup: () => {
      const editableIds = collectEditableLayerIds();
      if (editableIds.length === 1 && studio.document) {
        const activeArtboard = getActiveArtboard(studio.document);
        if (activeArtboard) {
          const layerToSeparate = findLayer(activeArtboard.layers, editableIds[0]);
          const pos = findLayerPosition(activeArtboard.layers, editableIds[0]);
          if (pos && layerToSeparate && layerToSeparate.kind === "group") {
            studio.dispatchCommand(separateLayerCommand(layerToSeparate, pos));
          }
        }
      }
    },
    
    onBringForward: () => {
      if (primaryLayerId) {
        studio.bringForward(primaryLayerId);
      }
    },
    
    onSendBackward: () => {
      if (primaryLayerId) {
        studio.sendBackward(primaryLayerId);
      }
    },
    
    onBringToFront: () => {
      if (primaryLayerId) {
        studio.bringToFront(primaryLayerId);
      }
    },
    
    onSendToBack: () => {
      if (primaryLayerId) {
        studio.sendToBack(primaryLayerId);
      }
    },
    
    onToggleLock: () => {
      if (primaryLayerId) {
        studio.toggleLayerLock(primaryLayerId);
      }
    },
    
    onToggleVisibility: () => {
      if (primaryLayerId) {
        studio.toggleLayerVisibility(primaryLayerId);
      }
    },
    
    onZoomReset: () => {
      window.dispatchEvent(new CustomEvent('app:zoom', { detail: { action: 'reset' } }));
    },
    
    onZoomFit: () => {
      window.dispatchEvent(new CustomEvent('app:zoom', { detail: { action: 'fit' } }));
    },
    
    onZoomIn: () => {
      window.dispatchEvent(new CustomEvent('app:zoom', { detail: { action: 'in' } }));
    },
    
    onZoomOut: () => {
      window.dispatchEvent(new CustomEvent('app:zoom', { detail: { action: 'out' } }));
    },
    
    onClearSelection: () => {
      if (selectAllCallbackRef.current) {
        selectAllCallbackRef.current([]);
      }
      setIsTextEditing(false);
    },
    
    onUndo: () => studio.undo(),
    onRedo: () => studio.redo(),
    
    isIsolationModeActive: studio.isolationMode !== null,
    onExitIsolation: studio.exitIsolation,
  });

  // Apply the resolved theme on first paint (Req 13.1/13.2).
  useEffect(() => {
    applyTheme(theme);
    // Run once on mount; the toggle handler keeps the DOM in sync thereafter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleToggleTheme(): void {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      persistTheme(next); // Req 13.3: persist for subsequent loads.
      applyTheme(next);
      return next;
    });
  }

  function handleSubmitPrompt(_request: DesignRequest): void {
    void studio.generate();
  }

  function handleLayerUpdate(changes: Parameters<typeof studio.applyLayerUpdate>[1]): void {
    if (studio.activeLayer) {
      studio.applyLayerUpdate(studio.activeLayer, changes);
    }
  }

  function handleLayerAction(action: (layerId: string) => void): void {
    if (studio.activeLayer) {
      action(studio.activeLayer);
    }
  }

  const projectName = studio.document?.name || DEFAULT_PROJECT_NAME;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;

    const file = e.dataTransfer.files[0];
    if (!file.type.startsWith("image/")) return;
    // `file.type` is OS-supplied metadata, so `image/svg+xml` passes the check
    // above. An SVG dropped here would be embedded verbatim as a `data:` href and
    // carried into every export, where a full renderer would execute it.
    if (file.type === "image/svg+xml" || /\.svgz?$/i.test(file.name)) {
      console.warn(
        "[editor] refused to embed an SVG file as a raster image; import it as a document instead",
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) return;

      const img = new Image();
      img.onerror = () => {
        // Silent failure here used to mean a dropped file simply vanished.
        console.warn("[editor] dropped image could not be decoded and was ignored");
      };
      img.onload = () => {
        const defaultWidth = 300;
        // An intrinsic size of 0 — routine for corrupt files — made `scale`
        // Infinity and `height` NaN, which then flowed into the layer's geometry
        // and into selection maths. Serialization coerced it to "0", so the image
        // was invisible while the in-memory model stayed poisoned.
        if (!Number.isFinite(img.width) || !Number.isFinite(img.height)
            || img.width <= 0 || img.height <= 0) {
          console.warn(
            `[editor] dropped image reported an unusable intrinsic size (${img.width}x${img.height}) and was ignored`,
          );
          return;
        }
        const scale = defaultWidth / img.width;
        const width = defaultWidth;
        const height = img.height * scale;

        const artboardWidth = activeArtboard?.width || 1080;
        const artboardHeight = activeArtboard?.height || 1080;

        const x = (artboardWidth - width) / 2;
        const y = (artboardHeight - height) / 2;

        if (![x, y, width, height].every(Number.isFinite)) {
          console.warn("[editor] computed a non-finite image placement and ignored the drop");
          return;
        }

        const newLayerId = `layer-image-${Date.now()}`;
        const newLayer: any = {
          kind: "image",
          id: newLayerId,
          role: "image",
          href: dataUrl,
          x,
          y,
          width,
          height,
        };

        if (studio.dispatchCommand) {
          studio.dispatchCommand(createLayerCommand(newLayer));
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Resolve the single selected Document_Model layer for the Properties_Panel
  // command-driven editor (task 10.1). When multi-selection is active, use the
  // primaryLayerId to determine which layer drives the panel display.
  const documentLayer =
    activeArtboard && primaryLayerId ? findLayer(activeArtboard.layers, primaryLayerId) : null;

  useEffect(() => {
    function onNudge(event: KeyboardEvent): void {
      // Arrow-key nudge when a layer is selected and no input modifiers (except Shift for larger steps)
      const primaryLayer = primaryLayerId;
      if (!primaryLayer) return;
      if (event.ctrlKey || event.metaKey) return; // Allow Alt for finer nudge

      let step = 1;
      if (event.shiftKey) step = 10;
      else if (event.altKey) step = 0.5;
      let dx = 0;
      let dy = 0;
      switch (event.key) {
        case "ArrowLeft":
          dx = -step;
          break;
        case "ArrowRight":
          dx = step;
          break;
        case "ArrowUp":
          dy = -step;
          break;
        case "ArrowDown":
          dy = step;
          break;
        default:
          return;
      }
      event.preventDefault();
      if (studio.document && studio.dispatchCommand) {
        studio.dispatchCommand(translateLayerCommand(primaryLayer, dx, dy));
      } else {
        studio.translateLayer?.(primaryLayer, dx, dy);
      }
    }
    window.addEventListener("keydown", onNudge);
    return () => window.removeEventListener("keydown", onNudge);
  }, [studio, primaryLayerId]);



  return (
    <div className={styles.shell} onDragOver={handleDragOver} onDrop={handleDrop}>
      <TopBar
        projectName={projectName}
        canUndo={studio.canUndo}
        canRedo={studio.canRedo}
        onUndo={studio.undo}
        onRedo={studio.redo}
        saveStatus={saveStatus}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenAssistant={() => setActiveSection("generate")}
        onExportSVG={studio.exportSVG}
        onExportPNG={studio.exportPNG}
        onExportPDF={studio.exportPDF}
        onOpenProfile={() => {
          /* Profile is a placeholder seam in v1. */
        }}
      />

      <ContextMenu 
        isDisabled={selectedLayerIds.length === 0 && studio.clipboard === null}
        menuContent={
          <>
            <ContextMenuItem 
              label="Cut" 
              endContent={<span style={{color: "var(--fg-2)", fontSize: "0.75rem"}}>Ctrl+X</span>}
              onClick={() => studio.cut(selectedLayerIds)} 
              isDisabled={selectedLayerIds.length === 0} 
            />
            <ContextMenuItem 
              label="Copy" 
              endContent={<span style={{color: "var(--fg-2)", fontSize: "0.75rem"}}>Ctrl+C</span>}
              onClick={() => studio.copy(selectedLayerIds)} 
              isDisabled={selectedLayerIds.length === 0} 
            />
            <ContextMenuItem 
              label="Paste" 
              endContent={<span style={{color: "var(--fg-2)", fontSize: "0.75rem"}}>Ctrl+V</span>}
              onClick={() => studio.paste()} 
              isDisabled={studio.clipboard === null} 
            />
            <ContextMenuItem 
              label="Delete" 
              endContent={<span style={{color: "var(--fg-2)", fontSize: "0.75rem"}}>Del</span>}
              onClick={() => studio.deleteMultiple(selectedLayerIds)} 
              isDisabled={selectedLayerIds.length === 0} 
            />
            <div style={{ height: 1, backgroundColor: "var(--border-subtle)", margin: "4px 0" }} />
            <ContextMenuItem 
              label="Duplicate" 
              endContent={<span style={{color: "var(--fg-2)", fontSize: "0.75rem"}}>Ctrl+D</span>}
              onClick={() => studio.duplicate(selectedLayerIds)} 
              isDisabled={selectedLayerIds.length === 0} 
            />
            <ContextMenuItem 
              label="Bring Forward" 
              endContent={<span style={{color: "var(--fg-2)", fontSize: "0.75rem"}}>]</span>}
              onClick={() => { if (primaryLayerId) studio.bringForward(primaryLayerId); }} 
              isDisabled={!primaryLayerId} 
            />
            <ContextMenuItem 
              label="Send Backward" 
              endContent={<span style={{color: "var(--fg-2)", fontSize: "0.75rem"}}>[</span>}
              onClick={() => { if (primaryLayerId) studio.sendBackward(primaryLayerId); }} 
              isDisabled={!primaryLayerId} 
            />
            <ContextMenuItem 
              label="Bring to Front" 
              onClick={() => { if (primaryLayerId) studio.bringToFront(primaryLayerId); }} 
              isDisabled={!primaryLayerId} 
            />
            <ContextMenuItem 
              label="Send to Back" 
              onClick={() => { if (primaryLayerId) studio.sendToBack(primaryLayerId); }} 
              isDisabled={!primaryLayerId} 
            />
            <div style={{ height: 1, backgroundColor: "var(--border-subtle)", margin: "4px 0" }} />
            <ContextMenuItem 
              label="Group" 
              endContent={<span style={{color: "var(--fg-2)", fontSize: "0.75rem"}}>Ctrl+G</span>}
              onClick={() => {
                const editableIds = collectEditableLayerIds();
                if (editableIds.length > 1 && studio.document) {
                  const activeArtboard = getActiveArtboard(studio.document);
                  if (activeArtboard) studio.dispatchCommand(groupCommand(editableIds, activeArtboard.layers));
                }
              }} 
              isDisabled={selectedLayerIds.length < 2} 
            />
            <ContextMenuItem 
              label="Ungroup" 
              onClick={() => {
                const editableIds = collectEditableLayerIds();
                if (editableIds.length === 1 && studio.document) {
                  const activeArtboard = getActiveArtboard(studio.document);
                  if (activeArtboard) {
                    const layerToSeparate = findLayer(activeArtboard.layers, editableIds[0]);
                    const pos = findLayerPosition(activeArtboard.layers, editableIds[0]);
                    if (pos && layerToSeparate && layerToSeparate.kind === "group") {
                      studio.dispatchCommand(separateLayerCommand(layerToSeparate, pos));
                    }
                  }
                }
              }} 
              isDisabled={(() => {
                if (selectedLayerIds.length !== 1 || !studio.document) return true;
                const activeArtboard = getActiveArtboard(studio.document);
                if (!activeArtboard) return true;
                const layerToSeparate = findLayer(activeArtboard.layers, selectedLayerIds[0]);
                return !(layerToSeparate && layerToSeparate.kind === "group");
              })()}
            />
          </>
        }
      >
        <div className={styles.body}>
          <SidebarNav activeSection={activeSection} onSelectSection={setActiveSection} />

          <LeftSidebar
            activeSection={activeSection}
            layers={studio.sceneGraph.nodes}
            activeLayer={studio.activeLayer}
            onSelectLayer={studio.setActiveLayer}
            onToggleVisibility={studio.toggleLayerVisibility}
            onToggleLock={studio.toggleLayerLock}
            onOpacityChange={studio.setLayerOpacity}
            onDeleteLayer={studio.deleteLayer}
            onReorderLayers={studio.reorderLayers}
            onAddText={studio.addTextLayer}
            onAddShape={studio.addShapeLayer}
            onUploadAsset={studio.addUploadedImageLayer}
            prompt={studio.prompt}
            brandKit={studio.brandKit}
            targetSize={studio.targetSize}
            isGenerating={studio.isGenerating}
            isUploading={studio.isUploading}
            onPromptChange={studio.setPrompt}
            onBrandKitChange={studio.setBrandKit}
            onTargetSizeChange={studio.setTargetSize}
            onSubmitPrompt={handleSubmitPrompt}
            onUploadImage={studio.uploadImage}
            onUpdateBackground={studio.updateBackground}
            designOutput={studio.designOutput}
          />
          <FloatingToolbar activeTool={activeTool} onSelectTool={handleToolChange} />
          {documentLayer?.kind === "text" && studio.dispatchCommand && (
            <TextFormattingToolbar
              layer={documentLayer}
              dispatchCommand={studio.dispatchCommand}
              onClose={() => setPrimaryLayerId(null)}
            />
          )}
          <CenterStage
            isolationMode={studio.isolationMode}
            onExitIsolation={studio.exitIsolation}
            gridEnabled={gridEnabled}
            rulersEnabled={rulersEnabled}
            mousePosition={mousePosition}
            theme={theme}
            artboardBounds={activeArtboard ? {
              x: 0,
              y: 0,
              width: activeArtboard.width || 1920,
              height: activeArtboard.height || 1080
            } : undefined}
            designOutput={studio.designOutput}
            activeLayer={primaryLayerId ?? null}
            activeTool={activeTool}
            isTextEditing={isTextEditing}
            onTextEditCancel={() => setIsTextEditing(false)}
            onLayerSelect={(layerId: string) => {
              setPrimaryLayerId(layerId);
              studio.setActiveLayer(layerId);
            }}
            onDoubleClick={(layerId) => {
              const layer = studio.document ? findLayer(getActiveArtboard(studio.document)?.layers || [], layerId) : null;
              if (layer?.kind === 'group') {
                studio.enterIsolation(layerId);
              } else if (layer?.kind === 'text') {
                setIsTextEditing(true);
              }
            }}
            onLayerTextUpdate={studio.updateLayerText}
          isHandToolActive={activeTool === "pan"}
          onSelectionChange={(selection) => {
            setPrimaryLayerId(selection.primaryLayerId ?? null);
            setSelectionCount(selection.layerIds.length);
            setSelectedLayerIds(selection.layerIds);
          }}
          onExposeSelectAll={(selectAllFn) => {
            selectAllCallbackRef.current = selectAllFn;
          }}
          onShapeDrawn={(shapeType, x, y, width, height) => {
            if (!studio.document || !studio.dispatchCommand) return;
            
            const w = Math.abs(width);
            const h = Math.abs(height);
            // Ignore tiny accidental clicks
            if (w < 2 && h < 2) {
              setActiveTool("select");
              return;
            }

            const left = Math.min(x, x + width);
            const top = Math.min(y, y + height);
            
            let kind: "rect" | "ellipse" | "line" | "polygon" | "path" = "path";
            let geometry: any;
            
            // Map all shape types to appropriate geometry
            switch (shapeType) {
              case "custom":
                if (studio.activeShapeDef) {
                  const cx = left + w / 2;
                  const cy = top + h / 2;
                  const input = studio.activeShapeDef.insert(
                    cx, 
                    cy,
                    w >= 5 ? w : undefined,
                    h >= 5 ? h : undefined
                  );
                  
                  const existingIds = new Set<string>();
                  const ab = getActiveArtboard(studio.document);
                  ab?.layers.forEach((l: any) => existingIds.add(l.id));
                  const cmd = createShapeCommand(input, { existingIds, brandKit: studio.brandKit });
                  
                  if (cmd) {
                    studio.dispatchCommand(cmd);
                  }
                  setActiveTool("select");
                  studio.setActiveShapeDef?.(null);
                  return;
                }
                break;
                
              case "rectangle":
                kind = "rect";
                geometry = { type: "rect", x: left, y: top, width: w, height: h };
                break;
                
              case "ellipse":
              case "circle":
                kind = "ellipse";
                geometry = { type: "ellipse", cx: left + w / 2, cy: top + h / 2, rx: w / 2, ry: h / 2 };
                break;
                
              case "line":
                kind = "line";
                geometry = { type: "line", x1: x, y1: y, x2: x + width, y2: y + height };
                break;
                
              case "triangle":
                kind = "polygon";
                geometry = { type: "polygon", points: [[left + w / 2, top], [left + w, top + h], [left, top + h]] };
                break;
                
              // All complex shapes use path geometry with generateShapePath
              case "rounded-rect":
              case "diamond":
              case "pentagon":
              case "hexagon":
              case "octagon":
              case "star":
              case "heart":
              case "cross":
              case "donut":
              case "chat-bubble":
              case "cloud":
              case "banner":
              case "badge":
              case "shield":
                kind = "path";
                geometry = { type: "path", d: generateShapePath(shapeType, x, y, width, height) };
                break;
                
              default:
                console.warn(`[CreativeStudio] Unknown shape type: ${shapeType}`);
                kind = "path";
                geometry = { type: "path", d: generateShapePath(shapeType as any, x, y, width, height) };
                break;
            }

            const layerId = mintId("shape");
            const newLayer: any = {
              id: layerId,
              role: "shapes",
              name: shapeType.charAt(0).toUpperCase() + shapeType.slice(1),
              editable: true,
              locked: false,
              visible: true,
              opacity: 100,
              kind: kind,
              field: layerId,
              geometry: geometry,
              fill: "var(--accent-color, #4A90E2)", // Default blue fill
              stroke: "var(--text-primary, #333333)", // Default stroke
              strokeWidth: 2,
            };

            studio.dispatchCommand(createLayerCommand(newLayer));
            setActiveTool("select");
          }}
                    onPenPathCompleted={(completion: PenCompletion) => {
            if (completion.status === "created") {
              if (studio.dispatchCommand) {
                studio.dispatchCommand(completion.command);
              }
              if (completion.layer && completion.layer.id) {
                studio.setActiveLayer?.(completion.layer.id);
              }
            } else {
              if (typeof console !== 'undefined') console.warn(completion.reason);
            }
            setActiveTool("select");
          }}
          onFreehandDrawn={(pathString, bounds) => {
            if (!studio.document || !studio.dispatchCommand) return;
            
            // Ignore tiny strokes
            if (bounds.width < 2 && bounds.height < 2) {
              setActiveTool("select");
              return;
            }
            
            const layerId = mintId("stroke");
            const newLayer: any = {
              id: layerId,
              role: "shapes",
              name: "Freehand Stroke",
              editable: true,
              locked: false,
              visible: true,
              opacity: 100,
              kind: "path",
              field: layerId,
              geometry: { type: "path", d: pathString },
              fill: "none",
              stroke: "var(--accent-color, #4A90E2)",
              strokeWidth: 3,
            };
            
            studio.dispatchCommand(createLayerCommand(newLayer));
            setActiveTool("select");
          }}
          onLayerTransform={(layerId: string, dx: number, dy: number) => {
            if (studio.document && studio.dispatchCommand) {
              // Build and dispatch a translate command; dispatch guards handle no-op/locked layers.
              studio.dispatchCommand(translateLayerCommand(layerId, dx, dy));
            } else {
              studio.translateLayer?.(layerId, dx, dy);
            }
          }}
          onResizeSnapshot={(layerId: string, prev: CommandResizeSnapshot, next: CommandResizeSnapshot) => {
            // The overlay solved this resize in the layer's OWN space and chose the
            // snapshot kind that can express it exactly (geometry/resizeGeometry.ts),
            // so there is nothing left to reconstruct here.
            //
            // What used to be here rebuilt geometry from a screen-derived box per
            // layer kind: every polygon was assumed to be a triangle, path data was
            // regenerated from the layer's NAME via generateShapePath, freehand
            // strokes were refused outright, and anything else fell through to a
            // silent no-op. All of that guessing is gone.
            if (!studio.document || !studio.dispatchCommand) return;
            if (JSON.stringify(prev) === JSON.stringify(next)) return;
            studio.dispatchCommand(resizeLayerCommand(layerId, prev, next));
          }}
          onRotate={(layerId: string, prevBox: RotateSnapshot, nextBox: RotateSnapshot) => {
            if (studio.document && studio.dispatchCommand) {
              const prevSnap = { kind: "transform" as const, transform: prevBox.transform };
              const nextSnap = { kind: "transform" as const, transform: nextBox.transform };
              if (prevSnap.transform === nextSnap.transform) return;
              studio.dispatchCommand(rotateLayerCommand(layerId, prevSnap, nextSnap));
            } else {
              // Legacy DOM mutation fallback: apply transform directly to the group.
              if (typeof nextBox?.transform === "string") {
                studio.rotateLayer?.(layerId, nextBox.transform);
              }
            }
          }}
        />

        <PropertiesPanel
          selectedLayer={studio.selectedLayer}
          selectionCount={selectionCount}
          documentLayer={documentLayer}
          dispatchCommand={studio.dispatchCommand}
          activeLayers={activeArtboard?.layers ?? null}
          selectedLayerIds={selectedLayerIds}
          document={studio.document ?? undefined}
          hasClipboard={studio.clipboard !== null}
          canUndo={studio.canUndo}
          canRedo={studio.canRedo}
          onCopy={() => studio.copy(selectedLayerIds)}
          onCut={() => studio.cut(selectedLayerIds)}
          onPaste={() => studio.paste()}
          onDuplicate={() => studio.duplicate(selectedLayerIds)}
          onDeleteMultiple={() => studio.deleteMultiple(selectedLayerIds)}
          onUndo={() => studio.undo()}
          onRedo={() => studio.redo()}
          onUpdate={handleLayerUpdate}
          onDelete={() => handleLayerAction(studio.deleteLayer)}
          onMoveUp={() => handleLayerAction(studio.bringForward)}
          onMoveDown={() => handleLayerAction(studio.sendBackward)}
        />
      </div>
    </ContextMenu>

      {studio.error ? (
        <div role="alert" className={styles.placeholder} style={{ margin: "0 0.75rem 0.5rem" }}>
          {studio.error}
        </div>
      ) : null}

      <BottomPanel
        gridEnabled={gridEnabled}
        onGridToggle={() => setGridEnabled(prev => !prev)}
        rulersEnabled={rulersEnabled}
        onRulersToggle={() => setRulersEnabled(prev => !prev)}
      />
      

      
      <ToastContainer toasts={studio.toasts} onDismiss={studio.dismissToast} />

      {/* ARIA Live Region (Task 14) */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          left: '-10000px',
          width: '1px',
          height: '1px',
          overflow: 'hidden'
        }}
      >
        {selectionCount === 0 ? 'No layers selected' :
         selectionCount === 1 ? `Selected 1 layer` :
         `${selectionCount} layers selected`}
      </div>

      {/* Keyboard Shortcuts Panel */}
      {showShortcuts && (
        <KeyboardShortcutsPanel onClose={() => setShowShortcuts(false)} />
      )}
      
      {/* Loading Overlay */}
      {studio.loading && (
        <LoadingOverlay message={studio.loading.message} progress={studio.loading.progress} />
      )}
    </div>
  );
}

export default CreativeStudio;
