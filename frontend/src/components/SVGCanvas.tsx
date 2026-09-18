"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { useCanvasDrag } from "../editor/useCanvasDrag";
import type { DragSceneNode } from "../editor/useCanvasDrag";
import type { LiveTransformStore } from "../editor/interaction/liveTransformStore";
import type { DragGestureEvent } from "../editor/interaction/gestureChannel";
import { SmartGuides } from "../editor/SmartGuides";
import DOMPurify from 'dompurify';
import {
  gradientIdForFill,
  gradientVector,
  parseGradientFill,
} from "../editor/gradientFill";
import type { SnapGuide } from "../editor/snapping";
import { DesignOutput, SVGLayer } from "../types";
import styles from "../pages/DesignStudio.module.css";

export interface SVGCanvasProps {
  designOutput: DesignOutput | null;
  activeLayer: string | null;
  onLayerSelect: (layerId: string) => void;
  onLayerTextUpdate: (elementId: string, newText: string) => void;
  onLayerTransform: (layerId: string, dx: number, dy: number) => void;
  /**
   * Authoritative transform chain for a layer, supplied by the owner.
   *
   * Passed in rather than derived here because this component receives the
   * viewport-WRAPPED markup, and parsing that makes `canonicalSvg` synthesize
   * layer ids that do not match the document. The owner has the unwrapped output,
   * so it is the only place the scene can be built with real ids.
   */
  resolveSceneNode?: (layerId: string) => DragSceneNode | undefined;
  /** Retained gesture state, forwarded to `useCanvasDrag`. */
  liveTransforms?: LiveTransformStore;
  /** Engine hit testing, forwarded to the drag hook. */
  hitTestClient?: (clientX: number, clientY: number) => string | null;
  /**
   * Hide the SVG design objects, because another surface is painting them.
   *
   * `visibility: hidden` rather than unmounting: the subtree keeps its layout, so
   * `getBBox`, text-editor positioning and the export path still work, while nothing
   * is rasterised. Unmounting is a later step and needs text editing moved off the
   * DOM first.
   */
  hideDesignObjects?: boolean;
  /**
   * Whether the drag preview writes the SVG `transform` attribute.
   *
   * False when the engine previews the gesture, so a drag mutates no design object in
   * the DOM at all. The gesture still flows through `onDragGesture`.
   */
  domPreview?: boolean;
  onResize?: (layerId: string, prevBox: { x: number; y: number; width: number; height: number }, nextBox: { x: number; y: number; width: number; height: number }) => void;
  onRotate?: (layerId: string, prev: { transform?: string }, next: { transform?: string }) => void;
  viewport?: { zoom: number; panX: number; panY: number };
  focusedLayerId?: string | null;
  /** Enables alignment snapping and smart guides while moving canvas layers. */
  snappingEnabled?: boolean;
  /** Disable the built-in textarea when a parent owns the inline text editor. */
  allowInlineTextEditing?: boolean;
  /** Notify a parent-owned editor about a layer double-click. */
  onLayerDoubleClick?: (layerId: string, textElementId?: string) => void;
  /**
   * Live drag reporting in document pixels, at pointer rate.
   *
   * Passed straight through to `useCanvasDrag`. It exists so a renderer mounted
   * as a sibling of this component can follow a drag without the per-frame
   * offset being lifted into React state.
   */
  onDragGesture?: (event: DragGestureEvent) => void;
}

interface TextEditorState {
  elementId: string;
  field: string;
  layerId: string;
  initialValue: string;
  left: number;
  top: number;
  width: number;
  fontSize?: string;
  fontFamily?: string;
  fontWeight?: string;
  color?: string;
  textAlign?: string;
}

interface SelectedBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ColorPickerState {
  layerId: string;
  value: string;
}

// DragState has been replaced by useCanvasDrag — DOM-direct transform pattern.
// (No React state is updated per frame during a drag.)

interface LayerColorEventDetail {
  role: string;
  color: string;
}

export function SVGCanvas({
  designOutput,
  activeLayer,
  onLayerSelect,
  onLayerTextUpdate,
  onLayerTransform,
  resolveSceneNode,
  liveTransforms,
  hitTestClient,
  hideDesignObjects = false,
  domPreview = true,
  onResize,
  onRotate,
  viewport,
  focusedLayerId,
  snappingEnabled = true,
  allowInlineTextEditing = true,
  onLayerDoubleClick,
  onDragGesture,
}: SVGCanvasProps): JSX.Element | null {
  const containerRef = useRef<HTMLDivElement | null>(null);

  /**
   * Values read at EVENT time by the per-layer listener effect below.
   *
   * They are mirrored into refs rather than listed as dependencies because that
   * effect walks every `[data-layer-id]` element and re-attaches two or three
   * listeners per element, re-runs `applyGradientToElement`, and rewrites inline
   * styles across the whole layer list. Having `viewport.zoom` in the deps meant
   * all of that ran on every wheel notch, and inline callbacks from the parent
   * meant it ran on every parent render — while `zoom` is only consumed inside a
   * double-click handler, at event time.
   */
  const onLayerSelectRef = useRef(onLayerSelect);
  const onLayerDoubleClickRef = useRef(onLayerDoubleClick);
  const zoomRef = useRef(viewport?.zoom ?? 1);
  onLayerSelectRef.current = onLayerSelect;
  onLayerDoubleClickRef.current = onLayerDoubleClick;
  zoomRef.current = viewport?.zoom ?? 1;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputValueRef = useRef<string>("");
  const debounceTimersRef = useRef<Record<string, number>>({});
  const [textEditor, setTextEditor] = useState<TextEditorState | null>(null);
  const [selectedBounds, setSelectedBounds] = useState<SelectedBounds | null>(null);
  const [colorPicker, setColorPicker] = useState<ColorPickerState | null>(null);
  const [showOverlayEditToast, setShowOverlayEditToast] = useState<boolean>(false);
  const [guides, setGuides] = useState<SnapGuide[]>([]);

  const canvasSize = designOutput ? readSvgSize(designOutput.composedSVG) : { width: 1080, height: 1080 };

  // Unified drag state machine (miniPaint pattern): zero React re-renders during
  // move; DOM transform applied directly; model committed only on pointerup.
  //
  // `resolveSceneNode` is the authoritative transform chain for the dragged
  // layer: the same scene, the same `worldTransform` the selection overlay
  // derives its box from and the renderers paint with. Without it the drag and
  // the outline would be working from different geometry again.
  useCanvasDrag({
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
    zoom: viewport?.zoom ?? 1,
    onLayerTransform,
    resolveSceneNode,
    liveTransforms,
    hitTestClient,
    domPreview,
    onLayerClick: onLayerSelect,
    onSnapGuidesChange: setGuides,
    artboardBounds: canvasSize,
    snappingEnabled,
    selectedLayerIds: activeLayer ? [activeLayer] : [],
    onDragGesture,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const svgRoot = container.querySelector("svg");
    if (!(svgRoot instanceof SVGSVGElement)) {
      return undefined;
    }

    const gradientEls = Array.from(svgRoot.querySelectorAll<SVGElement>(
      "[fill^='gradient:'], [stroke^='gradient:'], [data-fill^='gradient:'], [data-stroke^='gradient:']",
    ));
    gradientEls.forEach(el => {
      const fill = el.getAttribute("data-fill") ?? el.getAttribute("fill");
      if (fill && parseGradientFill(fill)) {
        const gradId = applyGradientToElement(svgRoot, fill);
        if (gradId) el.setAttribute("fill", `url(#${gradId})`);
      }
      const stroke = el.getAttribute("data-stroke") ?? el.getAttribute("stroke");
      if (stroke && parseGradientFill(stroke)) {
        const gradId = applyGradientToElement(svgRoot, stroke);
        if (gradId) el.setAttribute("stroke", `url(#${gradId})`);
      }
    });
      const elements = Array.from(svgRoot.querySelectorAll<SVGElement>("[data-layer-id]"));
    const cleanupTasks: Array<() => void> = [];

    elements.forEach((el) => {
      const layerId = el.getAttribute("data-layer-id");
      const roleGroup = el.closest("g[data-role]");
      const groupEditability = roleGroup?.getAttribute("data-editable");
      // Canonical SVG normally declares editability on the semantic group, but
      // imported documents can carry it on the element itself. A missing group
      // marker must not silently make an explicitly editable element inert.
      const isEditable = groupEditability === null || groupEditability === undefined
        ? el.getAttribute("data-editable") !== "false"
        : groupEditability === "true";
      clearSelectionOutline(el);

      if (layerId === activeLayer) {
        applySelectionOutline(el);
        updateSelectedBounds(el, container, setSelectedBounds);
      }

      // Focus Indicator (Task 14)
      if (layerId === focusedLayerId) {
        el.classList.add(styles.layerFocused || 'layer-focused');
        el.style.outline = '2px solid var(--accent-primary)';
        el.style.outlineOffset = '2px';
        el.setAttribute('tabIndex', '0');
        el.setAttribute('role', 'img');
      } else {
        el.classList.remove(styles.layerFocused || 'layer-focused');
        el.style.outline = 'none';
        el.removeAttribute('tabIndex');
        el.removeAttribute('role');
      }

      if (!isEditable || !layerId) {
        el.style.pointerEvents = "none";
        return;
      }

      const isLocked = el.getAttribute("pointer-events") === "none";
      el.style.pointerEvents = isLocked ? "none" : "all";

      // If it is a top-level role group that has children with data-layer-id,
      // let pointer events pass through to those children.
      if (el.tagName.toLowerCase() === "g" && el.hasAttribute("data-role")) {
        const hasEditableChildren = Array.from(el.children).some(child => child.hasAttribute("data-layer-id"));
        if (hasEditableChildren) {
          el.style.pointerEvents = "none";
          return;
        }
      }

      el.style.cursor = isLocked ? "default" : "move";

      const handleClick = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        onLayerSelectRef.current(layerId);
      };

      el.addEventListener("click", handleClick);
      cleanupTasks.push(() => el.removeEventListener("click", handleClick));

      const handleDoubleClick = (event: MouseEvent) => {
        const clickedNode = event.target instanceof Element ? event.target : null;
        const textElement = clickedNode?.closest("text[data-element-id]") as SVGTextElement | null
          ?? el.querySelector<SVGTextElement>("text[data-element-id]")
          ?? (el.tagName.toLowerCase() === "text" ? el as SVGTextElement : null);

        if (!allowInlineTextEditing) {
          event.preventDefault();
          event.stopPropagation();
          onLayerDoubleClickRef.current?.(
            layerId,
            textElement?.getAttribute("data-element-id") ?? undefined,
          );
          return;
        }
        event.preventDefault();
        event.stopPropagation();

        if (!textElement) {
          return;
        }

        const elementId = textElement.getAttribute("data-element-id");
        const field = textElement.getAttribute("data-field");
        if (!elementId || !field) {
          return;
        }

        const tspans = Array.from(textElement.querySelectorAll("tspan"));
        let initialText = "";
        if (tspans.length > 0) {
          initialText = tspans.map(t => t.textContent || "").join("\n");
        } else {
          initialText = textElement.textContent ?? "";
        }

        const containerRect = container.getBoundingClientRect();
        const textRect = textElement.getBoundingClientRect();
        const editorWidth = Math.max(textRect.width + 24, 140);
        
        // Extract computed text styles for inline overlay matching.
        // computedStyle.fontSize is the SVG document-space value; multiply by
        // viewport.zoom so the overlay textarea matches the visual size on screen.
        const computedStyle = window.getComputedStyle(textElement);
        const baseFontPx = parseFloat(computedStyle.fontSize) || 16;
        const currentZoom = zoomRef.current;
        const fontSize = `${baseFontPx * currentZoom}px`;
        const fontFamily = computedStyle.fontFamily;
        const fontWeight = computedStyle.fontWeight;
        const fill = textElement.getAttribute("fill") || computedStyle.fill || "#1a1a1a";
        const textAnchor = textElement.getAttribute("text-anchor") || computedStyle.textAnchor;
        const textAlign = textAnchor === "middle" ? "center" : textAnchor === "end" ? "right" : "left";

        inputValueRef.current = initialText;
        setTextEditor({
          elementId,
          field,
          layerId,
          initialValue: initialText,
          left: textRect.left - containerRect.left,
          top: textRect.top - containerRect.top,
          width: editorWidth,
          fontSize,
          fontFamily,
          fontWeight,
          color: fill,
          textAlign,
        });
      };

      const textElements = Array.from(el.querySelectorAll<SVGTextElement>("text[data-element-id]"));
      textElements.forEach((textElement) => {
        textElement.style.cursor = "text";
      });
      const imageElements = Array.from(el.querySelectorAll<SVGImageElement>("image"));
      imageElements.forEach((imageElement) => {
        imageElement.style.pointerEvents = isLocked ? "none" : "all";
        imageElement.style.cursor = isLocked ? "default" : "pointer";
        imageElement.addEventListener("click", handleClick);
        cleanupTasks.push(() => imageElement.removeEventListener("click", handleClick));
      });

      el.addEventListener("dblclick", handleDoubleClick);
      cleanupTasks.push(() => el.removeEventListener("dblclick", handleDoubleClick));
    });

    return () => {
      cleanupTasks.forEach((cleanup) => cleanup());
    };
  }, [
    activeLayer,
    allowInlineTextEditing,
    designOutput?.composedSVG,
    focusedLayerId,
  ]);



  useEffect(() => {
    const container = containerRef.current;
    const svgRoot = container?.querySelector("svg");
    if (!container || !(svgRoot instanceof SVGSVGElement) || !activeLayer) {
      setSelectedBounds(null);
      setColorPicker(null);
      return;
    }

    const targetGroup = findLayerGroup(svgRoot, activeLayer);
    if (!targetGroup || targetGroup.tagName.toLowerCase() !== "g") {
      setSelectedBounds(null);
      setColorPicker(null);
      return;
    }

    updateSelectedBounds(targetGroup, container, setSelectedBounds);
    const currentColor = readGroupColor(targetGroup);
    setColorPicker(
      currentColor
        ? { layerId: activeLayer, value: currentColor }
        : null
    );
  }, [activeLayer, designOutput?.composedSVG]);

  // Hide the original text element in the SVG DOM while editing is active
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const svgRoot = container.querySelector("svg");
    if (!svgRoot) return;

    // Reset all text element opacities
    Array.from(svgRoot.querySelectorAll<SVGTextElement>("text[data-element-id]")).forEach((el) => {
      el.style.opacity = "1";
    });

    if (textEditor) {
      const activeText = svgRoot.querySelector(`text[data-element-id="${textEditor.elementId}"]`) as SVGTextElement | null;
      if (activeText) {
        activeText.style.opacity = "0";
      }
    }
  }, [textEditor, designOutput?.composedSVG]);

  useEffect(() => {
    const handleSetLayerColor = (event: Event) => {
      const customEvent = event as CustomEvent<LayerColorEventDetail>;
      const layerId = customEvent.detail?.role;
      const color = customEvent.detail?.color;
      if (!layerId || !color) {
        return;
      }
      queueLayerColorUpdate(layerId, color);
    };

    window.addEventListener("printrocket:set-layer-color", handleSetLayerColor as EventListener);
    return () => {
      window.removeEventListener("printrocket:set-layer-color", handleSetLayerColor as EventListener);
    };
  }, [designOutput]);

  useEffect(() => {
    return () => {
      Object.values(debounceTimersRef.current).forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, []);

  useEffect(() => {
    if (!textEditor || !inputRef.current) {
      return;
    }
    inputRef.current.focus();
    inputRef.current.select();
  }, [textEditor]);

  useEffect(() => {
    setTextEditor(null);
    setSelectedBounds(null);
  }, [designOutput?.requestId]);

  useEffect(() => {
    if (!designOutput || !isOverlayEditMode(designOutput.composedSVG)) {
      setShowOverlayEditToast(false);
      return undefined;
    }

    setShowOverlayEditToast(true);
    const timeoutId = window.setTimeout(() => {
      setShowOverlayEditToast(false);
    }, 3000);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [designOutput?.requestId, designOutput?.composedSVG]);

  // dragState useEffect removed — useCanvasDrag owns all element move interaction.




  const commitTextEdit = useCallback((): void => {
    if (!textEditor) {
      return;
    }

    const trimmedText = inputValueRef.current.trim();
    const container = containerRef.current;
    const svgRoot = container?.querySelector("svg");
    if (!container || !(svgRoot instanceof SVGSVGElement)) {
      setTextEditor(null);
      return;
    }

    if (!trimmedText) {
      setTextEditor(null);
      return;
    }

    const group = findLayerGroup(svgRoot, textEditor.layerId);
    const targetText = group?.querySelector(
      `text[data-field="${textEditor.field}"][data-element-id="${textEditor.elementId}"]`,
    ) ?? group?.querySelector(`text[data-field="${textEditor.field}"]`);
    if (targetText instanceof SVGTextElement) {
      targetText.textContent = trimmedText;
    }

    const existingTimer = debounceTimersRef.current[textEditor.elementId];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }
    debounceTimersRef.current[textEditor.elementId] = window.setTimeout(() => {
      onLayerTextUpdate(textEditor.elementId, trimmedText);
      delete debounceTimersRef.current[textEditor.elementId];
    }, 300);
    setTextEditor(null);
  }, [onLayerTextUpdate, textEditor]);

  function queueLayerColorUpdate(layerId: string, nextColor: string): void {
    setColorPicker((currentColorPicker) => (
      currentColorPicker && currentColorPicker.layerId === layerId
        ? {
            ...currentColorPicker,
            value: nextColor,
          }
        : currentColorPicker
    ));

    const debounceKey = `color:${layerId}`;
    const existingTimer = debounceTimersRef.current[debounceKey];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }
    debounceTimersRef.current[debounceKey] = window.setTimeout(() => {
      applyLayerColor(layerId, nextColor);
      delete debounceTimersRef.current[debounceKey];
    }, 300);
  }

  function applyLayerColor(layerId: string, nextColor: string): void {
    const container = containerRef.current;
    const svgRoot = container?.querySelector("svg");
    if (!designOutput || !(svgRoot instanceof SVGSVGElement)) {
      return;
    }

    const targetGroup = findLayerGroup(svgRoot, layerId);
    if (!(targetGroup instanceof SVGGElement) || targetGroup.getAttribute("data-editable") !== "true") {
      return;
    }

    const currentColor = readGroupColor(targetGroup);
    if (!currentColor) {
      return;
    }

    let fillValue = nextColor;

    if (nextColor.startsWith("gradient:")) {
      let defs = svgRoot.querySelector("defs");
      if (!defs) {
        defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        svgRoot.insertBefore(defs, svgRoot.firstChild);
      }
      
      const gradId = `grad-${layerId}`;
      let linearGrad = defs.querySelector(`#${gradId}`);
      if (!linearGrad) {
        linearGrad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
        linearGrad.setAttribute("id", gradId);
        defs.appendChild(linearGrad);
      }
      
      const parts = nextColor.split(",");
      if (parts.length >= 3) {
        const stopsData = parts.slice(2).join(","); 
        linearGrad.innerHTML = "";
        
        stopsData.split(",").forEach(stop => {
          const [color, offset] = stop.split(":");
          if (color && offset) {
            const stopEl = document.createElementNS("http://www.w3.org/2000/svg", "stop");
            stopEl.setAttribute("offset", `${offset}%`);
            stopEl.setAttribute("stop-color", color);
            linearGrad.appendChild(stopEl);
          }
        });
      }
      fillValue = `url(#${gradId})`;
    } else {
      const gradId = `grad-${layerId}`;
      const existingGrad = svgRoot.querySelector(`#${gradId}`);
      if (existingGrad) {
        existingGrad.remove();
      }
    }

    const rects = Array.from(targetGroup.querySelectorAll<SVGRectElement>("rect"));
    rects.forEach((rect) => {
      rect.setAttribute("fill", fillValue);
    });

    const paths = Array.from(targetGroup.querySelectorAll<SVGPathElement | SVGTextElement | SVGLineElement | SVGPolylineElement>("path, circle, polygon, ellipse, text, line, polyline"));
    paths.forEach((element) => {
      if (element.tagName.toLowerCase() === "line" || element.tagName.toLowerCase() === "polyline") {
        element.setAttribute("stroke", fillValue);
      } else {
        element.setAttribute("fill", fillValue);
      }
    });

    const images = Array.from(targetGroup.querySelectorAll<SVGImageElement>("image"));
    if (isHexColor(currentColor) && isHexColor(nextColor)) {
      const nextFilter = buildImageFilter(currentColor, nextColor);
      images.forEach((image) => {
        image.style.filter = nextFilter;
      });
    }

    targetGroup.setAttribute("data-color", nextColor);
    // The prop is NOT mutated here. It is the parent's memo result and is shared
    // with history snapshots; writing to it silently rewrote past undo states and
    // baked live editor decorations into the exported document. The colour change
    // reaches the document through the event below and the command layer.
    window.dispatchEvent(
      new CustomEvent<LayerColorEventDetail>("printrocket:layer-color-updated", {
        detail: {
          role: layerId,
          color: nextColor,
        },
      }),
    );
  }

  if (!designOutput) {
    return null;
  }



  return (
    <div ref={containerRef} className={styles.canvas} style={{ position: "relative" }}>
      <div
        className="svg-canvas-wrapper"
        style={{ 
          width: canvasSize.width,
          height: canvasSize.height,
          background: "#ffffff",
          transform: `translate(${viewport?.panX ?? 0}px, ${viewport?.panY ?? 0}px) scale(${viewport?.zoom ?? 1})`,
          transformOrigin: "0 0",
          boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4)",
        }}
      >
        <div
          className="svg-canvas-markup"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            /*
              Hidden, not unmounted, when the engine paints the design.

              `visibility: hidden` keeps the subtree laid out, so `getBBox`, the text
              editor's positioning and the canonical-SVG/export path all still work,
              while the browser rasterises none of it. That makes the canvas the only
              visual surface without breaking the compatibility backend — which the
              migration is explicitly required to keep.
            */
            visibility: hideDesignObjects ? "hidden" : "visible",
          }}
          data-design-objects-hidden={hideDesignObjects ? "true" : "false"}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(designOutput.composedSVG, { USE_PROFILES: { svg: true } }) }}
        />
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          <SmartGuides 
            guides={guides} 
            viewport={{ zoom: viewport?.zoom ?? 1, panX: viewport?.panX ?? 0, panY: viewport?.panY ?? 0 }} 
            artboardBounds={canvasSize} 
          />
        </svg>
      </div>
      {showOverlayEditToast ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "absolute",
            top: "16px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 12,
            padding: "0.75rem 1rem",
            borderRadius: "10px",
            background: "rgba(26, 26, 26, 0.88)",
            color: "#ffffff",
            fontSize: "0.92rem",
            lineHeight: 1.4,
            boxShadow: "0 10px 24px rgba(0, 0, 0, 0.18)",
          }}
        >
          Image loaded. Add text and elements using the toolbar on the left.
        </div>
      ) : null}

      {selectedBounds && colorPicker ? (
        <input
          type="color"
          aria-label={`Color picker for ${colorPicker.layerId}`}
          value={isHexColor(colorPicker.value) ? colorPicker.value : "#ffffff"}
          onChange={(event) => {
            queueLayerColorUpdate(colorPicker.layerId, event.target.value);
          }}
          style={{
            position: "absolute",
            left: `${selectedBounds.left + selectedBounds.width - 22}px`,
            top: `${Math.max(0, selectedBounds.top - 22)}px`,
            width: "24px",
            height: "24px",
            padding: 0,
            border: "1px solid #ffffff",
            background: "#ffffff",
            zIndex: 11,
          }}
        />
      ) : null}
      {textEditor ? (
        <textarea
          ref={inputRef as any}
          defaultValue={textEditor.initialValue}
          onChange={(event) => {
            inputValueRef.current = event.target.value;
            event.target.style.height = "auto";
            event.target.style.height = `${event.target.scrollHeight}px`;
          }}
          onBlur={commitTextEdit}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              commitTextEdit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setTextEditor(null);
            }
          }}
          style={{
            position: "absolute",
            left: `${textEditor.left}px`,
            top: `${textEditor.top}px`,
            width: `${Math.max(textEditor.width, 200)}px`,
            height: "auto",
            zIndex: 9999,
            padding: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            boxShadow: "none",
            pointerEvents: "all",
            resize: "none",
            overflow: "hidden",
            whiteSpace: "pre-wrap",
            fontSize: textEditor.fontSize,
            fontFamily: textEditor.fontFamily,
            fontWeight: textEditor.fontWeight,
            color: textEditor.color,
            textAlign: textEditor.textAlign as any,
            caretColor: textEditor.color || "#ff6b00",
            lineHeight: "normal",
          }}
        />
      ) : null}
    </div>
  );
}
function applySelectionOutline(el: SVGElement): void {
  try {
    if (el.tagName.toLowerCase() === "g") {
      const bounds = (el as SVGGElement).getBBox();
      const documentRef = el.ownerDocument;
      const outline = documentRef.createElementNS("http://www.w3.org/2000/svg", "rect");
      outline.setAttribute("data-selection-outline", "true");
      outline.setAttribute("x", String(bounds.x - 4));
      outline.setAttribute("y", String(bounds.y - 4));
      outline.setAttribute("width", String(bounds.width + 8));
      outline.setAttribute("height", String(bounds.height + 8));
      outline.setAttribute("fill", "none");
      outline.setAttribute("stroke", "#FF6B00");
      outline.setAttribute("stroke-dasharray", "4 2");
      outline.setAttribute("stroke-width", "1.5");
      outline.setAttribute("vector-effect", "non-scaling-stroke");
      outline.setAttribute("pointer-events", "none");
      el.insertBefore(outline, el.firstChild);
    } else {
      el.setAttribute("data-active", "true");
    }
  } catch {
    el.setAttribute("data-active", "true");
  }
}

function clearSelectionOutline(el: SVGElement): void {
  if (el.tagName.toLowerCase() === "g") {
    const outline = el.querySelector("[data-selection-outline='true']");
    if (outline) {
      outline.remove();
    }
  }
  el.removeAttribute("data-active");
}

function updateSelectedBounds(
  el: SVGElement,
  container: HTMLDivElement,
  setSelectedBounds: (bounds: SelectedBounds | null) => void,
): void {
  try {
    const groupRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    setSelectedBounds({
      left: groupRect.left - containerRect.left,
      top: groupRect.top - containerRect.top,
      width: groupRect.width,
      height: groupRect.height,
    });
  } catch {
    setSelectedBounds(null);
  }
}

function buildHandleStyle(left: number, top: number): CSSProperties {
  return {
    position: "absolute",
    left: `${left - 4}px`,
    top: `${top - 4}px`,
    width: "8px",
    height: "8px",
    background: "#FF6B00",
    border: "1px solid #FFFFFF",
    boxSizing: "border-box",
    pointerEvents: "none",
    zIndex: 9,
  };
}

function applyGradientToElement(svgRoot: SVGSVGElement, gradientString: string): string | null {
  const gradient = parseGradientFill(gradientString);
  if (!gradient) {
    return null;
  }

  let defs = svgRoot.querySelector("defs");
  if (!defs) {
    defs = svgRoot.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "defs");
    svgRoot.insertBefore(defs, svgRoot.firstChild);
  }

  const gradId = gradientIdForFill(gradientString);
  let linearGrad = defs.querySelector(`#${gradId}`);
  if (!linearGrad) {
    linearGrad = svgRoot.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
    linearGrad.setAttribute("id", gradId);
    defs.appendChild(linearGrad);
  }

  const vector = gradientVector(gradient.angle);
  linearGrad.setAttribute("x1", vector.x1);
  linearGrad.setAttribute("y1", vector.y1);
  linearGrad.setAttribute("x2", vector.x2);
  linearGrad.setAttribute("y2", vector.y2);
  linearGrad.setAttribute("data-printrocket-generated", "gradient");
  linearGrad.setAttribute("data-fill", gradientString);
  linearGrad.replaceChildren();
  gradient.stops.forEach((stop) => {
    const stopElement = svgRoot.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "stop");
    stopElement.setAttribute("offset", `${stop.offset}%`);
    stopElement.setAttribute("stop-color", stop.color);
    linearGrad.appendChild(stopElement);
  });

  return gradId;
}

function findLayerGroup(svgRoot: SVGSVGElement, layerId: string): SVGElement | null {
  const el = svgRoot.querySelector(`[data-layer-id="${layerId}"]`);
  if (el instanceof SVGElement) {
    return el;
  }
  const groups = Array.from(svgRoot.querySelectorAll<SVGGElement>("g[data-role]"));
  return groups.find((group) => group.getAttribute("data-layer-id") === layerId || group.getAttribute("data-role") === layerId) ?? null;
}

function isColorPayload(value: string | null): boolean {
  return typeof value === "string" && (isHexColor(value) || (value as string).startsWith("gradient:"));
}

function readGroupColor(group: SVGElement): string | null {
  const color = group.getAttribute("data-color");
  return isColorPayload(color) ? color : null;
}
function isHexColor(value: string | null): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function buildImageFilter(fromColor: string, toColor: string): string {
  const fromHsl = rgbToHsl(hexToRgb(fromColor));
  const toHsl = rgbToHsl(hexToRgb(toColor));
  const hueRotate = Math.round(toHsl.h - fromHsl.h);
  const saturation = Math.max(40, Math.round((toHsl.s / Math.max(fromHsl.s, 0.01)) * 100));
  const brightness = Math.max(40, Math.round((toHsl.l / Math.max(fromHsl.l, 0.01)) * 100));
  return `hue-rotate(${hueRotate}deg) saturate(${saturation}%) brightness(${brightness}%)`;
}

/**
 * Previously this assigned `designOutput.composedSVG` and
 * `designOutput.svgLayers` in place.
 *
 * Two things were wrong with that. The object is the parent's `useMemo` result,
 * so mutating it left React's cache holding edited markup it had no way to
 * invalidate, and the parent's real `designOutput` never learned about the edit.
 * Worse, any history snapshot sharing the reference was rewritten too, so undoing
 * a colour change could not restore the previous markup — the "previous" snapshot
 * had been mutated as well.
 *
 * It also serialized the LIVE editor DOM, which by that point carries injected
 * selection outlines, generated gradient defs, and inline `style` and `opacity`
 * writes — all of which were baked into the exported print artifact, including an
 * `opacity: 0` on whichever headline happened to be open in the text editor.
 *
 * Colour edits already reach the document through `queueLayerColorUpdate` and the
 * command layer, which is the authoritative path. This function is deliberately
 * gone rather than reimplemented: there was nothing it did that the command layer
 * does not already do correctly.
 */

function extractLayers(svgRoot: SVGSVGElement, previousLayers: SVGLayer[]): SVGLayer[] {
  const serializer = new XMLSerializer();
  const previousLayerById = new Map<string, SVGLayer>();
  previousLayers.forEach((layer) => {
    previousLayerById.set(layer.id, layer);
  });
  const topLevelGroups = Array.from(svgRoot.children).filter(
    (node): node is SVGGElement => node instanceof SVGGElement && node.hasAttribute("data-role"),
  );

  return topLevelGroups.map((group, index) => {
    const layerId = group.getAttribute("data-layer-id") ?? `layer-${index}`;
    const previousLayer = previousLayerById.get(layerId);
    return {
      id: layerId,
      role: previousLayer?.role ?? toLayerRole(group.getAttribute("data-role") ?? "shapes"),
      svgElement: serializer.serializeToString(group),
      isEditable: group.getAttribute("data-editable") === "true",
    };
  });
}

function toLayerRole(layerName: string): SVGLayer["role"] {
  switch (layerName) {
    case "background":
      return "background";
    case "image-slots":
      return "image";
    case "logo":
      return "logo";
    case "headline":
      return "headline";
    case "cta":
      return "cta";
    case "body":
      return "body";
    default:
      return "shape";
  }
}

function hexToRgb(hexColor: string): { r: number; g: number; b: number } {
  return {
    r: Number.parseInt(hexColor.slice(1, 3), 16),
    g: Number.parseInt(hexColor.slice(3, 5), 16),
    b: Number.parseInt(hexColor.slice(5, 7), 16),
  };
}

function rgbToHsl(rgb: { r: number; g: number; b: number }): { h: number; s: number; l: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return { h: 0, s: 0, l: lightness };
  }

  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;

  if (max === r) {
    hue = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
  } else if (max === g) {
    hue = ((b - r) / delta + 2) * 60;
  } else {
    hue = ((r - g) / delta + 4) * 60;
  }

  return {
    h: hue,
    s: saturation,
    l: lightness,
  };
}

function readSvgSize(svgMarkup: string): { width: number; height: number } {
  const parser = new DOMParser();
  const svgDocument = parser.parseFromString(svgMarkup, "image/svg+xml");
  const svgRoot = svgDocument.documentElement;
  const widthValue = Number.parseFloat(svgRoot.getAttribute("width") ?? "0");
  const heightValue = Number.parseFloat(svgRoot.getAttribute("height") ?? "0");
  return {
    width: Number.isFinite(widthValue) && widthValue > 0 ? widthValue : 1080,
    height: Number.isFinite(heightValue) && heightValue > 0 ? heightValue : 1080,
  };
}

function isOverlayEditMode(svgMarkup: string): boolean {
  const parser = new DOMParser();
  const svgDocument = parser.parseFromString(svgMarkup, "image/svg+xml");
  return svgDocument.documentElement.getAttribute("data-mode") === "overlay-edit";
}

function snapDragDelta(
  group: SVGGElement,
  container: HTMLDivElement,
  dx: number,
  dy: number,
): { dx: number; dy: number } {
  const groupRect = group.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  let nextDx = dx;
  let nextDy = dy;
  const nextCenterX = (groupRect.left - containerRect.left) + (groupRect.width / 2) + dx;
  const nextCenterY = (groupRect.top - containerRect.top) + (groupRect.height / 2) + dy;
  const containerCenterX = containerRect.width / 2;
  const containerCenterY = containerRect.height / 2;

  if (Math.abs(nextCenterX - containerCenterX) <= 5) {
    nextDx += containerCenterX - nextCenterX;
  }
  if (Math.abs(nextCenterY - containerCenterY) <= 5) {
    nextDy += containerCenterY - nextCenterY;
  }

  return { dx: nextDx, dy: nextDy };
}
