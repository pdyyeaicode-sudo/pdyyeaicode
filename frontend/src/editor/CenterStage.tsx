"use client";

/**
 * CenterStage — the center editing area (Req 13.8).
 *
 * Hosts the `EditorCanvas` (which wraps the existing `SVGCanvas`) inside a
 * framed stage, with a thin contextual toolbar affordance above it and a zoom
 * indicator / zoom controls overlay. The Editor_Canvas renders the design at
 * native dimensions centered in the stage (Req 1.1) and the stage owns the
 * pan/zoom interaction (task 5.2) via `useViewport`:
 *
 *   - wheel / ctrl-wheel  → cursor-anchored zoom clamped to [0.10, 64.0]
 *   - middle-drag / space-drag → 1:1 pan
 *   - zoom in/out/reset controls
 *
 * Pan/zoom drive only the viewport transform passed to `EditorCanvas`; they
 * never mutate the Document_Model and emit no Command (Req 1.3). The indicator
 * shows `Math.round(zoom * 100)%` (Req 1.6).
 *
 * One responsibility per file: framing the canvas surface and its viewport.
 */

import { useEffect, useState, useCallback, useLayoutEffect, useRef } from "react";
import { EditorCanvas } from "./EditorCanvas";
import { GridOverlay } from "./GridOverlay";
import { RulerOverlay } from "./RulerOverlay";
import { IsolationBreadcrumb } from "./IsolationBreadcrumb";
import { InlineTextEditor } from "./InlineTextEditor";
import { useSelection } from "./useSelection";
import { useViewport } from "./useViewport";
import { useShapeDrawing, getShapePreviewPath, type ShapeType, type DrawnShape } from "./hooks/useShapeDrawing";
import { usePenTool } from './hooks/usePenTool';
import type { PenCompletion } from './tools/penTool';
import { useFreehandDrawing, getFreehandPreviewPath, getSvgPathFromPoints } from "./hooks/useFreehandDrawing";
import { Icon } from "./Icon";
import styles from "./CreativeStudio.module.css";
import type { BoxSnapshot, RotateSnapshot, ToolId } from "./types/documentModel";
import type { DesignOutput } from "../types";

export interface CenterStageProps {
  designOutput: DesignOutput | null;
  activeLayer: string | null;
  activeTool?: ToolId; // Current tool from ToolRail
  onLayerSelect: (layerId: string) => void;
  onLayerTextUpdate: (elementId: string, newText: string) => void;
  onLayerTransform: (layerId: string, dx: number, dy: number) => void;
  onResize?: (layerId: string, prevBox: BoxSnapshot, nextBox: BoxSnapshot) => void;
  onResizeSnapshot?: (layerId: string, prev: any, next: any) => void;
  onRotate?: (layerId: string, prev: RotateSnapshot, next: RotateSnapshot) => void;
  onTextPlacement?: (x: number, y: number) => void;
  onShapeDrawn?: (shapeType: ShapeType, x: number, y: number, width: number, height: number) => void;
  onPenPathCompleted?: (completion: PenCompletion) => void;
  onFreehandDrawn?: (pathString: string, bounds: { x: number, y: number, width: number, height: number }) => void;
  isHandToolActive?: boolean;
  isTextEditing?: boolean;
  onTextEditCancel?: () => void;
  /** Callback to receive selection state updates for external keyboard shortcuts */
  onSelectionChange?: (selection: { layerIds: string[]; primaryLayerId?: string }) => void;
  /** Callback to expose selectAll method for keyboard shortcuts */
  onExposeSelectAll?: (selectAll: (layerIds: string[]) => void) => void;
  /** Group isolation state */
  isolationMode?: { groupId: string; parentPath: string[] } | null;
  /** Callback to exit isolation */
  onExitIsolation?: () => void;
  /** Double click handler */
  onDoubleClick?: (layerId: string, textElementId?: string) => void;
  
  // Grid and Ruler Overlays (Task 9)
  gridEnabled?: boolean;
  rulersEnabled?: boolean;
  /** Enables alignment snapping and smart guides while moving canvas layers. */
  snappingEnabled?: boolean;
  mousePosition?: { x: number; y: number } | null;
  theme?: 'light' | 'dark';
  artboardBounds?: { x: number; y: number; width: number; height: number };
}

export function CenterStage({
  designOutput,
  activeLayer,
  activeTool = "select",
  onLayerSelect,
  onLayerTextUpdate,
  onLayerTransform,
  onResize,
  onResizeSnapshot,
  onRotate,
  onTextPlacement,
  onShapeDrawn,
  onPenPathCompleted,
  onFreehandDrawn,
  isHandToolActive = false,
  isTextEditing = false,
  onTextEditCancel,
  onSelectionChange,
  onExposeSelectAll,
  isolationMode,
  onExitIsolation,
  onDoubleClick,
  gridEnabled = false,
  rulersEnabled = false,
  snappingEnabled = true,
  mousePosition,
  theme = 'light',
  artboardBounds,
}: CenterStageProps): JSX.Element {
  // Track if we're currently drawing to lock viewport
  const [isDrawingShape, setIsDrawingShape] = useState<boolean>(false);
  
  // Capture the engine's hit tester to disambiguate object drag from canvas pan
  const engineHitTesterRef = useRef<((clientX: number, clientY: number) => string | null) | null>(null);

  const {
    viewport,
    zoomPercent,
    isPanning,
    containerRef,
    onWheel,
    onPointerDown,
    zoomIn,
    zoomOut,
    reset,
  } = useViewport(engineHitTesterRef, isHandToolActive);
  
  // Determine drawing mode from active tool - map ALL shape tools to ShapeType
  const [drawingShapeType, setDrawingShapeType] = useState<ShapeType | null>(null);
  
  useEffect(() => {
    console.log(`[CenterStage] activeTool changed to: ${activeTool}`);
    
    // Map ToolId to ShapeType for all supported shapes
    const toolToShapeMap: Record<string, ShapeType | null> = {
      "rect": "rectangle",
      "rounded-rect": "rounded-rect",
      "ellipse": "ellipse",
      "circle": "circle",
      "line": "line",
      "triangle": "triangle",
      "diamond": "diamond",
      "pentagon": "pentagon",
      "hexagon": "hexagon",
      "octagon": "octagon",
      "star": "star",
      "heart": "heart",
      "cross": "cross",
      "donut": "donut",
      "chat-bubble": "chat-bubble",
      "cloud": "cloud",
      "banner": "banner",
      "badge": "badge",
      "shield": "shield",
      "polygon": "triangle", // Generic polygon defaults to triangle
    };
    
    const mappedShape = toolToShapeMap[activeTool] !== undefined 
      ? toolToShapeMap[activeTool] 
      : (["select", "pan", "text", "image", "pen"].includes(activeTool) ? null : activeTool as ShapeType);
    
    if (mappedShape) {
      console.log(`[CenterStage] Setting drawing mode: ${mappedShape}`);
      setDrawingShapeType(mappedShape);
    } else {
      console.log("[CenterStage] Clearing drawing mode");
      setDrawingShapeType(null);
    }
  }, [activeTool]);
  
  // Hook handles all pointer events, updates preview path, and calls onShapeDrawn when complete
  const drawingState = useShapeDrawing({
    enabled: drawingShapeType !== null,
    shapeType: drawingShapeType,
    onShapeDrawn: (shape: DrawnShape) => {
      const { type, x, y, width, height } = shape;
      const scale = viewport.zoom;
      const svgX = (x - viewport.panX) / scale;
      const svgY = (y - viewport.panY) / scale;
      const svgWidth = width / scale;
      const svgHeight = height / scale;
      console.log(`[CenterStage] Shape drawn complete: ${type} at ${svgX},${svgY} ${svgWidth}x${svgHeight}`);
      if (onShapeDrawn) onShapeDrawn(type, svgX, svgY, svgWidth, svgHeight);
    },
    containerRef: containerRef as React.RefObject<HTMLElement>,
    onDrawingStateChange: (isDrawing) => {
      console.log(`[CenterStage] Drawing state changed: ${isDrawing}`);
      setIsDrawingShape(isDrawing);
    },
  });

    const penState = usePenTool({
    enabled: activeTool === "pencil",
    containerRef: containerRef as React.RefObject<HTMLElement>,
    onDrawingStateChange: (isDrawing) => {
      setIsDrawingShape(isDrawing);
    },
    onPenPathCompleted: (completion) => {
      if (onPenPathCompleted) onPenPathCompleted(completion);
    },
    viewport
  });

  const freehandState = useFreehandDrawing({
    enabled: activeTool === "pen",
    containerRef: containerRef as React.RefObject<HTMLElement>,
    onDrawingStateChange: (isDrawing) => {
      setIsDrawingShape(isDrawing);
    },
    onStrokeDrawn: (pathString, bounds, points) => {
      const scale = viewport.zoom;
      const svgX = (bounds.x - viewport.panX) / scale;
      const svgY = (bounds.y - viewport.panY) / scale;
      const svgWidth = bounds.width / scale;
      const svgHeight = bounds.height / scale;
      
      // Convert all points to artboard-relative coordinate space
      // and relative to the bounding box (svgX, svgY)
      const transformedPoints = points.map(p => ({
        x: ((p.x - viewport.panX) / scale) - svgX,
        y: ((p.y - viewport.panY) / scale) - svgY
      }));
      
      const scaledPath = getSvgPathFromPoints(transformedPoints);
      
      if (onFreehandDrawn) {
        onFreehandDrawn(scaledPath, { x: svgX, y: svgY, width: svgWidth, height: svgHeight });
      }
    }
  });

  // Selection_Set state for the canvas (task 5.5). Selection is pure UI state:
  // it never mutates the Document_Model or records a Command. The primary
  // (last-picked) layer is also pushed to the legacy single-select seam
  // (`onLayerSelect`) so the Properties_Panel keeps tracking the selection.
  const selectionState = useSelection(activeLayer ? [activeLayer] : []);
  const previousActiveLayerRef = useRef<string | null>(activeLayer);
  // Guard to prevent re-notifying the parent when the selection change was
  // caused by the parent's own activeLayer prop update (breaks the cycle).
  const isSyncingFromPropRef = useRef(false);

  // Keep external selections (layer tree, Escape, delete) and the canvas
  // overlay in sync without collapsing a valid multi-selection whose primary
  // layer is already part of the set.
  useEffect(() => {
    const previousActiveLayer = previousActiveLayerRef.current;
    previousActiveLayerRef.current = activeLayer;
    if (activeLayer === null) {
      if (previousActiveLayer !== null && selectionState.selection.layerIds.length > 0) {
        isSyncingFromPropRef.current = true;
        selectionState.clear();
      }
      return;
    }
    if (!selectionState.selection.layerIds.includes(activeLayer)) {
      isSyncingFromPropRef.current = true;
      selectionState.selectOnly(activeLayer);
    }
  }, [activeLayer, selectionState.clear, selectionState.selectOnly, selectionState.selection.layerIds]);
  
  // Notify parent of selection changes (for keyboard shortcuts handling).
  // IMPORTANT: Do NOT call onLayerSelect here — that would set the parent's
  // primaryLayerId which flows back as the activeLayer prop, restarting this
  // effect and causing an infinite update loop. The parent already receives
  // selection state via onSelectionChange.
  useEffect(() => {
    // Skip notification when the change was triggered by the parent's own
    // activeLayer prop update flowing through the sync effect above.
    if (isSyncingFromPropRef.current) {
      isSyncingFromPropRef.current = false;
      return;
    }
    if (onSelectionChange) {
      onSelectionChange(selectionState.selection);
    }
  }, [selectionState.selection, onSelectionChange]);
  
  // Expose selectAll method to parent for keyboard shortcuts
  useEffect(() => {
    if (onExposeSelectAll) {
      onExposeSelectAll(selectionState.selectAll);
    }
  }, [onExposeSelectAll, selectionState.selectAll]);
  
  // Wrapper for viewport onPointerDown that disables during drawing
  const [activeTextContent, setActiveTextContent] = useState<string>("");
  const [textEditorStyle, setTextEditorStyle] = useState<React.CSSProperties | null>(null);

  useLayoutEffect(() => {
    let frameId: number | null = null;
    if (isTextEditing && activeLayer && containerRef.current) {
      const layerElement = Array.from(
        containerRef.current.querySelectorAll<SVGElement>("[data-layer-id]"),
      ).find((element) => element.getAttribute("data-layer-id") === activeLayer);
      const textEl = layerElement?.tagName.toLowerCase() === "text"
        ? layerElement as SVGTextElement
        : layerElement?.querySelector<SVGTextElement>("text") ?? null;
      if (textEl) {
        setActiveTextContent(textEl.textContent || "");
        // We use requestAnimationFrame to allow the layout to settle, just in case
        frameId = requestAnimationFrame(() => {
          if (!containerRef.current) return;
          const rect = textEl.getBoundingClientRect();
          const hostRect = containerRef.current.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(textEl);
          
          setTextEditorStyle({
            position: 'absolute',
            left: rect.left - hostRect.left,
            top: rect.top - hostRect.top,
            width: rect.width + 40, // slight padding
            height: rect.height + 20,
            zIndex: 1000,
            fontFamily: computedStyle.fontFamily,
            fontSize: computedStyle.fontSize,
            fontWeight: computedStyle.fontWeight,
            color: textEl.getAttribute('fill') || computedStyle.color,
            background: 'transparent',
            outline: 'none',
            border: '2px solid var(--p-accent-1, #00C4CC)',
            padding: 0,
            margin: 0,
            whiteSpace: 'nowrap',
            lineHeight: computedStyle.lineHeight,
            textAlign: (textEl.getAttribute('text-anchor') === 'middle' ? 'center' : 'left'),
            transform: `translate(${textEl.getAttribute('text-anchor') === 'middle' ? '-50%' : '0'}, -25%)`,
          });
        });
      }
    } else {
      setTextEditorStyle(null);
    }
    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [isTextEditing, activeLayer, designOutput?.composedSVG, viewport.zoom, viewport.panX, viewport.panY]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    // CRITICAL: Block viewport pan when drawing is active
    if (isDrawingShape || drawingShapeType !== null || activeTool === "pen") {
      console.log('[CenterStage] Blocking viewport pan - drawing mode active');
      return;
    }
    onPointerDown(event);
  }, [isDrawingShape, drawingShapeType, activeTool, onPointerDown]);

  return (
    <section className={styles.center} aria-label="Canvas">
      <div className={styles.contextualBar} aria-label="Contextual toolbar">
        <span>{designOutput ? "Editing design" : "No design loaded"}</span>
      </div>
      <div
        ref={containerRef as React.RefObject<HTMLDivElement>}
        className={styles.stage}
        onWheel={onWheel}
        onPointerDown={handlePointerDown}
        style={{ 
          cursor: isPanning ? "grabbing" : 
                  (isHandToolActive ? "grab" : 
                  (drawingShapeType !== null || activeTool === "pen" ? "crosshair" : "default")) 
        }}
      >
        {rulersEnabled && artboardBounds && (
          <>
            <RulerOverlay
              viewport={viewport}
              artboardBounds={artboardBounds}
              orientation="horizontal"
              height={20}
              mousePosition={mousePosition}
              theme={theme}
            />
            <RulerOverlay
              viewport={viewport}
              artboardBounds={artboardBounds}
              orientation="vertical"
              height={20}
              mousePosition={mousePosition}
              theme={theme}
            />
          </>
        )}
        {isolationMode && (
          <IsolationBreadcrumb
            parentPath={isolationMode.parentPath}
            onNavigate={(index) => {
              if (onExitIsolation) onExitIsolation();
            }}
          />
        )}
        {designOutput ? (
          <>
            {gridEnabled && artboardBounds && (
              <GridOverlay
                viewport={viewport}
                artboardBounds={artboardBounds}
                enabled={gridEnabled}
                theme={theme}
              />
            )}
            <EditorCanvas
              isolationMode={isolationMode}
              designOutput={designOutput}
              activeLayer={activeLayer}
              onLayerSelect={onLayerSelect}
              onLayerTextUpdate={onLayerTextUpdate}
              onLayerTransform={onLayerTransform}
              viewport={viewport}
              snappingEnabled={snappingEnabled}
              externalTextEditing
              selection={selectionState.selection}
              onDoubleClick={onDoubleClick}
              onSelectOnly={(layerId) => {
                selectionState.selectOnly(layerId);
                onLayerSelect(layerId);
              }}
              onToggleSelection={selectionState.toggle}
              onClearSelection={selectionState.clear}
              onSetSelection={selectionState.setSelection}
              onResize={onResize}
              onResizeSnapshot={onResizeSnapshot}
              onRotate={onRotate}
              onHitTester={(tester) => {
                engineHitTesterRef.current = tester;
              }}
            />
            {isTextEditing && textEditorStyle && activeLayer && (
              <InlineTextEditor
                initialContent={activeTextContent}
                style={textEditorStyle}
                onCommit={(newText) => {
                  onLayerTextUpdate(activeLayer, newText);
                  onTextEditCancel?.();
                }}
                onRejected={(reason, msg) => {
                  console.warn("Text edit rejected:", msg);
                  onTextEditCancel?.();
                }}
                onCancel={() => {
                  onTextEditCancel?.();
                }}
              />
            )}
            {drawingState.isDrawing && (
              <svg
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                  zIndex: 1000,
                }}
              >
                <path
                  d={getShapePreviewPath(drawingState)}
                  stroke="#4A90E2"
                  strokeWidth="1"
                  fill="none"
                  strokeDasharray="4,4"
                  opacity="0.8"
                />
              </svg>
            )}
                  {penState.isDrawing && penState.previewData && (
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 1000
          }}
        >
          <path
            d={penState.previewData}
            fill="none"
            stroke="var(--p-accent, #3b82f6)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            transform={`translate(${viewport.panX} ${viewport.panY}) scale(${viewport.zoom})`}
          />
        </svg>
      )}
      {freehandState.isDrawing && freehandState.points.length > 0 && (
              <svg
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                  zIndex: 1001,
                }}
              >
                <path
                  d={getFreehandPreviewPath(freehandState)}
                  stroke="var(--accent-color)"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </>
        ) : null}
        <div className={styles.zoomControls} aria-label="Zoom controls">
          <button
            type="button"
            className={styles.zoomButton}
            onClick={zoomOut}
            aria-label="Zoom out"
          >
            <Icon name="minus" size={16} />
          </button>
          <button
            type="button"
            className={styles.zoomReset}
            onClick={reset}
            aria-label="Reset zoom"
            title="Reset zoom"
          >
            {zoomPercent}%
          </button>
          <button
            type="button"
            className={styles.zoomButton}
            onClick={zoomIn}
            aria-label="Zoom in"
          >
            <Icon name="plus" size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
