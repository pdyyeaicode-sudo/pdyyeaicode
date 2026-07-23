"use client";

import { startTransition, useMemo, useRef, useState } from "react";

import { DesignApiError, generateDesign, uploadImage as uploadImageRequest } from "../api/designApi";
import { extractLayers } from "../editor/svgLayerExtraction";
import { BrandKit, DesignOutput, DesignRequest, SVGLayer, TargetSize } from "../types";
import { createSceneGraphStore, projectSceneGraph, updateSceneGraphFromLayers, type SceneGraphProjection, type SceneGraphStore } from "./sceneGraphStore";

const DEFAULT_BRAND_KIT: BrandKit = {
  primaryColor: "#FF6B00",
  secondaryColor: "#FFD700",
  fontFamily: "Arial",
  logoUrl: "",
  tone: "festive",
};

const DEFAULT_TARGET_SIZE: TargetSize = {
  width: 1080,
  height: 1080,
  unit: "px",
};

const HISTORY_LIMIT = 50;

export interface LayerUpdate {
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right";
  letterSpacing?: string;
  lineHeight?: string;
  textDecoration?: "none" | "underline" | "line-through";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  rx?: number;
  ry?: number;
  textBackgroundFill?: string;
  opacity?: number;
  blendMode?: string;
  brightness?: number;
  contrast?: number;
  blur?: number;
  grayscale?: number;
}

export interface UseDesignStudioResult {
  prompt: string;
  brandKit: BrandKit;
  targetSize: TargetSize;
  isGenerating: boolean;
  isUploading: boolean;
  designOutput: DesignOutput | null;
  error: string | null;
  activeLayer: string | null;
  selectedLayer: SVGLayer | null;
  sceneGraph: SceneGraphProjection;
  historyIndex: number;
  historyLength: number;
  setPrompt: (text: string) => void;
  setBrandKit: (kit: Partial<BrandKit>) => void;
  setTargetSize: (size: TargetSize) => void;
  generate: (options?: GenerateDesignOptions) => Promise<void>;
  uploadImage: (file: File) => Promise<void>;
  setActiveLayer: (layerId: string | null) => void;
  updateLayerText: (elementId: string, newText: string) => void;
  newDocument: (width?: number, height?: number) => void;
  loadDesign: (design: DesignOutput) => void;
  toggleLayerVisibility: (layerId: string) => void;
  setLayerOpacity: (layerId: string, opacityPercent: number) => void;
  toggleLayerLock: (layerId: string) => void;
  deleteLayer: (layerId: string) => void;
  applyLayerUpdate: (layerId: string, changes: LayerUpdate) => void;
  addTextLayer: () => void;
  addShapeLayer: (shapeType: "rectangle" | "circle" | "triangle" | "line") => void;
  addUploadedImageLayer: (file: File) => Promise<void>;
  duplicateLayer: (layerId: string) => void;
  bringForward: (layerId: string) => void;
  sendBackward: (layerId: string) => void;
  bringToFront: (layerId: string) => void;
  sendToBack: (layerId: string) => void;
  translateLayer: (layerId: string, dx: number, dy: number) => void;
  rotateLayer: (layerId: string, transform: string) => void;
  reorderLayers: (draggedLayerId: string, targetLayerId: string) => void;
  alignLayer: (layerId: string, alignment: "left" | "center" | "right" | "top" | "middle" | "bottom") => void;
  undo: () => void;
  redo: () => void;
  exportSVG: () => void;
  exportPNG: () => void;
  exportPDF: () => void;
}

export interface GenerateDesignOptions {
  targetSize?: TargetSize;
}

export function useDesignStudio(): UseDesignStudioResult {
  const [prompt, setPrompt] = useState<string>("");
  const [brandKit, setBrandKitState] = useState<BrandKit>(DEFAULT_BRAND_KIT);
  const [targetSize, setTargetSize] = useState<TargetSize>(DEFAULT_TARGET_SIZE);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [designOutput, setDesignOutput] = useState<DesignOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [sceneGraphStore, setSceneGraphStore] = useState<SceneGraphStore>(() => createSceneGraphStore([]));
  const nextLayerSequenceRef = useRef<number>(0);

  const selectedLayer = useMemo(() => {
    if (!designOutput || !activeLayer) {
      return null;
    }
    return designOutput.svgLayers.find((layer) => layer.id === activeLayer) ?? null;
  }, [activeLayer, designOutput]);

  const sceneGraph = useMemo<SceneGraphProjection>(
    () => projectSceneGraph(sceneGraphStore, activeLayer),
    [activeLayer, sceneGraphStore],
  );

  async function generate(options: GenerateDesignOptions = {}): Promise<void> {
    setIsGenerating(true);
    setError(null);

    const requestTargetSize = options.targetSize ?? targetSize;
    if (options.targetSize) {
      setTargetSize(options.targetSize);
    }

    const request: DesignRequest = {
      prompt,
      brandKit,
      targetSize: requestTargetSize,
      outputFormat: "svg",
      sessionHistory: [],
    };

    try {
      const nextDesignOutput = await generateDesign(request);
      startTransition(() => {
        initializeDesignOutput(nextDesignOutput);
      });
    } catch (requestError) {
      setError(readRequestErrorMessage(requestError, "Unable to generate a design right now."));
    } finally {
      setIsGenerating(false);
    }
  }

  async function uploadImage(file: File): Promise<void> {
    setIsUploading(true);
    setError(null);

    try {
      const nextDesignOutput = await uploadImageRequest(file);
      startTransition(() => {
        initializeDesignOutput(nextDesignOutput);
        setTargetSize(readTargetSizeFromSvg(nextDesignOutput.composedSVG));
      });
    } catch (requestError) {
      setError(readRequestErrorMessage(requestError, "Unable to upload an image right now."));
    } finally {
      setIsUploading(false);
    }
  }

  function initializeDesignOutput(nextDesignOutput: DesignOutput): void {
    setDesignOutput(nextDesignOutput);
    setActiveLayer(null);
    setHistory([nextDesignOutput.composedSVG]);
    setHistoryIndex(0);
    setSceneGraphStore(createSceneGraphStore(nextDesignOutput.svgLayers));
  }

  function createLayerId(prefix: string): string {
    nextLayerSequenceRef.current += 1;
    return `${prefix}-${nextLayerSequenceRef.current}`;
  }

  function newDocument(width: number = 1080, height: number = 1080): void {
    if (typeof window === "undefined") {
      return;
    }
    const blankSvg = buildBlankSvg(width, height);
    const svgRoot = new DOMParser().parseFromString(blankSvg, "image/svg+xml").documentElement;
    if (!(svgRoot instanceof SVGSVGElement)) {
      setError("Unable to create a blank document.");
      return;
    }
    setTargetSize({ width, height, unit: "px" });
    initializeDesignOutput({
      requestId: `doc-${Date.now()}`,
      composedSVG: blankSvg,
      svgLayers: extractLayers(svgRoot, []),
      printMeta: { bleed: 0, cmykSafe: false, trimMarks: false },
    });
  }

  function loadDesign(design: DesignOutput): void {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const svgRoot = new DOMParser().parseFromString(design.composedSVG, "image/svg+xml").documentElement;
      if (!(svgRoot instanceof SVGSVGElement)) {
        setError("Unable to open this project.");
        return;
      }

      setTargetSize(readTargetSizeFromSvg(design.composedSVG));
      initializeDesignOutput({ ...design, svgLayers: extractLayers(svgRoot, design.svgLayers) });
    } catch (loadError: unknown) {
      console.error("Unable to load saved design", loadError);
      setError("Unable to open this project.");
    }
  }

  function setBrandKit(kit: Partial<BrandKit>): void {
    setBrandKitState((currentBrandKit) => ({
      ...currentBrandKit,
      ...kit,
    }));
  }

  function pushHistory(nextSvgMarkup: string): void {
    setHistory((currentHistory) => {
      const baseHistory = currentHistory.slice(0, historyIndex + 1);
      const lastSnapshot = baseHistory[baseHistory.length - 1];
      if (lastSnapshot === nextSvgMarkup) {
        return currentHistory;
      }
      const nextHistory = [...baseHistory, nextSvgMarkup];
      return nextHistory.length > HISTORY_LIMIT ? nextHistory.slice(nextHistory.length - HISTORY_LIMIT) : nextHistory;
    });
    setHistoryIndex((currentHistoryIndex) => {
      const nextIndex = currentHistoryIndex + 1;
      return nextIndex >= HISTORY_LIMIT ? HISTORY_LIMIT - 1 : nextIndex;
    });
  }

  function applySvgMutation(
    mutator: (svgRoot: SVGSVGElement) => void,
    options?: { recordHistory?: boolean; nextActiveLayer?: string | null },
  ): void {
    setError(null);
    let nextDesignOutput: DesignOutput | null = null;
    let nextSvgMarkup: string | null = null;
    setDesignOutput((currentDesignOutput) => {
      if (!currentDesignOutput || typeof window === "undefined") {
        return currentDesignOutput;
      }
      nextDesignOutput = mutateDesignOutput(currentDesignOutput, mutator);
      nextSvgMarkup = nextDesignOutput.composedSVG;
      setSceneGraphStore((currentStore) =>
        updateSceneGraphFromLayers(currentStore, nextDesignOutput!.svgLayers),
      );
      return nextDesignOutput;
    });

    if (nextSvgMarkup && options?.recordHistory !== false) {
      pushHistory(nextSvgMarkup);
    }
    if (options && "nextActiveLayer" in options) {
      setActiveLayer(options.nextActiveLayer ?? null);
    }
  }

  function updateLayerText(elementId: string, newText: string): void {
    const trimmedText = newText.trim();
    if (!trimmedText) {
      return;
    }

    applySvgMutation((svgRoot) => {
      const targetElement = Array.from(svgRoot.querySelectorAll<SVGTextElement>("text[data-element-id]")).find(
        (node) => node.getAttribute("data-element-id") === elementId,
      );
      if (!targetElement) {
        return;
      }
      const lines = trimmedText.split("\n");
      const x = targetElement.getAttribute("x") || "0";
      targetElement.textContent = ""; // Clear existing
      
      lines.forEach((line, index) => {
        const tspan = svgRoot.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "tspan");
        tspan.textContent = line;
        tspan.setAttribute("x", x);
        if (index > 0) {
          const lh = targetElement.getAttribute("data-line-height") || "1.2em";
          tspan.setAttribute("dy", lh);
        }
        targetElement.appendChild(tspan);
      });
    });
  }

  function toggleLayerVisibility(layerId: string): void {
    applySvgMutation((svgRoot) => {
      const targetGroup = findLayerGroup(svgRoot, layerId);
      if (!targetGroup) {
        return;
      }
      const isVisible = targetGroup.getAttribute("display") !== "none" && targetGroup.getAttribute("visibility") !== "hidden";
      if (isVisible) {
        targetGroup.setAttribute("display", "none");
      } else {
        targetGroup.removeAttribute("display");
        if (targetGroup.getAttribute("visibility") === "hidden") {
          targetGroup.setAttribute("visibility", "visible");
        }
      }
    });
  }

  function setLayerOpacity(layerId: string, opacityPercent: number): void {
    const nextOpacity = Math.max(0, Math.min(100, opacityPercent)) / 100;
    applySvgMutation((svgRoot) => {
      const targetGroup = findLayerGroup(svgRoot, layerId);
      if (!targetGroup) {
        return;
      }
      targetGroup.setAttribute("opacity", nextOpacity.toFixed(2));
    });
  }

  function toggleLayerLock(layerId: string): void {
    applySvgMutation((svgRoot) => {
      const targetGroup = findLayerGroup(svgRoot, layerId);
      if (!targetGroup || targetGroup.getAttribute("data-editable") !== "true") {
        return;
      }
      const isLocked = targetGroup.getAttribute("pointer-events") === "none";
      if (isLocked) {
        targetGroup.removeAttribute("pointer-events");
      } else {
        targetGroup.setAttribute("pointer-events", "none");
      }
    });
  }

  function deleteLayer(layerId: string): void {
    applySvgMutation((svgRoot) => {
      const targetGroup = findLayerGroup(svgRoot, layerId);
      if (!targetGroup || targetGroup.getAttribute("data-editable") !== "true") {
        return;
      }
      targetGroup.remove();
    }, { nextActiveLayer: activeLayer === layerId ? null : activeLayer });
  }

  function applyLayerUpdate(layerId: string, changes: LayerUpdate): void {
    applySvgMutation((svgRoot) => {
      const targetGroup = findLayerGroup(svgRoot, layerId);
      if (!targetGroup) {
        return;
      }

      if (typeof changes.opacity === "number") {
        const opacityValue = changes.opacity > 1 ? changes.opacity / 100 : changes.opacity;
        targetGroup.setAttribute("opacity", Math.max(0, Math.min(1, opacityValue)).toFixed(2));
      }

      if (typeof changes.blendMode === "string") {
        targetGroup.style.mixBlendMode = changes.blendMode === "normal" ? "" : changes.blendMode;
      }

      if (typeof changes.fill === "string") {
        targetGroup.setAttribute("data-color", changes.fill);
        const shapeElements = Array.from(targetGroup.querySelectorAll<SVGGeometryElement>("path, rect, circle, ellipse, polygon, polyline"));
        shapeElements.forEach((element) => {
          element.setAttribute("fill", changes.fill as string);
        });
        const lineElements = Array.from(targetGroup.querySelectorAll<SVGLineElement>("line"));
        lineElements.forEach((lineElement) => {
          lineElement.setAttribute("stroke", changes.fill as string);
        });
        const textElements = Array.from(targetGroup.querySelectorAll<SVGTextElement>("text"));
        textElements.forEach((textElement) => {
          textElement.setAttribute("fill", changes.fill as string);
        });
      }

      const textElements = Array.from(targetGroup.querySelectorAll<SVGTextElement>("text"));
      textElements.forEach((textElement) => {
        if (typeof changes.fontSize === "number") {
          textElement.setAttribute("font-size", String(Math.max(8, Math.min(200, changes.fontSize))));
        }
        if (typeof changes.fontFamily === "string") {
          textElement.setAttribute("font-family", changes.fontFamily);
          textElement.style.fontFamily = changes.fontFamily;
        }
        if (typeof changes.fontWeight === "string") {
          textElement.setAttribute("font-weight", changes.fontWeight);
        }
        if (typeof changes.fontStyle === "string") {
          textElement.setAttribute("font-style", changes.fontStyle);
        }
        if (typeof changes.textAlign === "string") {
          const textAnchor = changes.textAlign === "left" ? "start" : changes.textAlign === "right" ? "end" : "middle";
          textElement.setAttribute("text-anchor", textAnchor);
        }
        if (typeof changes.letterSpacing === "string") {
          textElement.setAttribute("letter-spacing", changes.letterSpacing);
        }
        if (typeof changes.textDecoration === "string") {
          textElement.setAttribute("text-decoration", changes.textDecoration);
        }
        if (typeof changes.lineHeight === "string") {
          textElement.setAttribute("data-line-height", changes.lineHeight);
          // Apply to existing tspans except the first one
          const tspans = Array.from(textElement.querySelectorAll("tspan"));
          for (let i = 1; i < tspans.length; i++) {
            tspans[i].setAttribute("dy", changes.lineHeight);
          }
        }
      });

      if (typeof changes.stroke === "string") {
        const shapeElements = Array.from(targetGroup.querySelectorAll<SVGGeometryElement>("path, rect, circle, ellipse, polygon, polyline, line"));
        shapeElements.forEach((element) => {
          element.setAttribute("stroke", changes.stroke as string);
        });
      }

      if (typeof changes.strokeWidth === "number") {
        const shapeElements = Array.from(targetGroup.querySelectorAll<SVGGeometryElement>("path, rect, circle, ellipse, polygon, polyline, line"));
        shapeElements.forEach((element) => {
          element.setAttribute("stroke-width", String(changes.strokeWidth));
        });
      }

      if (typeof changes.strokeDasharray === "string") {
        const shapeElements = Array.from(targetGroup.querySelectorAll<SVGGeometryElement>("path, rect, circle, ellipse, polygon, polyline, line"));
        shapeElements.forEach((element) => {
          if (changes.strokeDasharray) {
            element.setAttribute("stroke-dasharray", changes.strokeDasharray);
          } else {
            element.removeAttribute("stroke-dasharray");
          }
        });
      }

      if (typeof changes.rx === "number") {
        const rectElements = Array.from(targetGroup.querySelectorAll<SVGRectElement>("rect"));
        rectElements.forEach((element) => {
          element.setAttribute("rx", String(changes.rx));
          if (changes.ry !== undefined) {
            element.setAttribute("ry", String(changes.ry));
          } else {
            element.setAttribute("ry", String(changes.rx));
          }
        });
      }

      if (typeof changes.textBackgroundFill === "string") {
        const firstTextElement = textElements[0];
        if (!firstTextElement) {
          return;
        }
        const fontSize = Number.parseFloat(firstTextElement.getAttribute("font-size") ?? "48");
        const x = Number.parseFloat(firstTextElement.getAttribute("x") ?? "0");
        const y = Number.parseFloat(firstTextElement.getAttribute("y") ?? "0");
        const textValue = firstTextElement.textContent ?? "";
        const estimatedWidth = Math.max(160, textValue.length * fontSize * 0.58);
        const estimatedHeight = Math.max(56, fontSize * 1.4);
        let backgroundRect = targetGroup.querySelector<SVGRectElement>("rect[data-text-background='true']");
        if (!backgroundRect) {
          backgroundRect = svgRoot.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "rect");
          backgroundRect.setAttribute("data-text-background", "true");
          targetGroup.insertBefore(backgroundRect, firstTextElement);
        }
        backgroundRect.setAttribute("x", String(x - estimatedWidth / 2 - 16));
        backgroundRect.setAttribute("y", String(y - estimatedHeight + 12));
        backgroundRect.setAttribute("width", String(estimatedWidth + 32));
        backgroundRect.setAttribute("height", String(estimatedHeight));
        backgroundRect.setAttribute("rx", "8");
        backgroundRect.setAttribute("fill", changes.textBackgroundFill);
      }

      // Handle Image Filters
      if (
        changes.brightness !== undefined ||
        changes.contrast !== undefined ||
        changes.blur !== undefined ||
        changes.grayscale !== undefined
      ) {
        const filterElements = Array.from(targetGroup.querySelectorAll<SVGElement>("image, rect, circle, polygon, path"));
        
        filterElements.forEach((element) => {
          if (changes.brightness !== undefined) element.setAttribute("data-brightness", String(changes.brightness));
          if (changes.contrast !== undefined) element.setAttribute("data-contrast", String(changes.contrast));
          if (changes.blur !== undefined) element.setAttribute("data-blur", String(changes.blur));
          if (changes.grayscale !== undefined) element.setAttribute("data-grayscale", String(changes.grayscale));

          const b = element.getAttribute("data-brightness") ?? "100";
          const c = element.getAttribute("data-contrast") ?? "100";
          const blur = element.getAttribute("data-blur") ?? "0";
          const g = element.getAttribute("data-grayscale") ?? "0";

          if (b === "100" && c === "100" && blur === "0" && g === "0") {
            element.removeAttribute("filter");
          } else {
            element.setAttribute("filter", `brightness(${b}%) contrast(${c}%) blur(${blur}px) grayscale(${g}%)`);
          }
        });
      }

    });
  }

  function addTextLayer(): void {
    const layerId = createLayerId("user-text");
    applySvgMutation((svgRoot) => {
      const { width, height } = readSvgSize(svgRoot.outerHTML);
      const group = svgRoot.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("data-role", "headline");
      group.setAttribute("data-editable", "true");
      group.setAttribute("data-layer-id", layerId);

      const text = svgRoot.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", String(width / 2));
      text.setAttribute("y", String(height / 2));
      text.setAttribute("font-size", "48");
      text.setAttribute("fill", "#1A1A1A");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("data-field", layerId);
      text.setAttribute("data-element-id", layerId);
      text.textContent = "Click to edit";

      group.appendChild(text);
      svgRoot.appendChild(group);
    }, { nextActiveLayer: layerId });
  }

  function addShapeLayer(shapeType: "rectangle" | "circle" | "triangle" | "line"): void {
    const layerId = createLayerId("shape");
    applySvgMutation((svgRoot) => {
      const { width, height } = readSvgSize(svgRoot.outerHTML);
      const centerX = width / 2;
      const centerY = height / 2;
      const group = svgRoot.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("data-role", "shapes");
      group.setAttribute("data-editable", "true");
      group.setAttribute("data-layer-id", layerId);
      group.setAttribute("data-color", shapeType === "line" ? "#1A1A1A" : "#FF6B00");

      if (shapeType === "rectangle") {
        const rect = svgRoot.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", String(centerX - 100));
        rect.setAttribute("y", String(centerY - 50));
        rect.setAttribute("width", "200");
        rect.setAttribute("height", "100");
        rect.setAttribute("rx", "8");
        rect.setAttribute("fill", "#FF6B00");
        group.appendChild(rect);
      } else if (shapeType === "circle") {
        const circle = svgRoot.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", String(centerX));
        circle.setAttribute("cy", String(centerY));
        circle.setAttribute("r", "80");
        circle.setAttribute("fill", "#FF6B00");
        group.appendChild(circle);
      } else if (shapeType === "triangle") {
        const triangle = svgRoot.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "polygon");
        triangle.setAttribute(
          "points",
          `${centerX},${centerY - 90} ${centerX - 100},${centerY + 70} ${centerX + 100},${centerY + 70}`,
        );
        triangle.setAttribute("fill", "#FF6B00");
        group.appendChild(triangle);
      } else {
        const line = svgRoot.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", String(centerX - 120));
        line.setAttribute("y1", String(centerY));
        line.setAttribute("x2", String(centerX + 120));
        line.setAttribute("y2", String(centerY));
        line.setAttribute("stroke", "#1A1A1A");
        line.setAttribute("stroke-width", "3");
        group.appendChild(line);
      }

      svgRoot.appendChild(group);
    }, { nextActiveLayer: layerId });
  }

  async function addUploadedImageLayer(file: File): Promise<void> {
    const dataUrl = await fileToDataUrl(file);
    const layerId = createLayerId("uploaded");
    applySvgMutation((svgRoot) => {
      const { width, height } = readSvgSize(svgRoot.outerHTML);
      const group = svgRoot.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("data-role", "image-slots");
      group.setAttribute("data-editable", "true");
      group.setAttribute("data-layer-id", layerId);

      const image = svgRoot.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "image");
      image.setAttribute("href", dataUrl);
      image.setAttribute("x", String(width / 2 - 150));
      image.setAttribute("y", String(height / 2 - 150));
      image.setAttribute("width", "300");
      image.setAttribute("height", "300");
      group.appendChild(image);

      svgRoot.appendChild(group);
    }, { nextActiveLayer: layerId });
  }

  function duplicateLayer(layerId: string): void {
    const nextLayerId = createLayerId(`${layerId}-copy`);
    applySvgMutation((svgRoot) => {
      const targetGroup = findLayerGroup(svgRoot, layerId);
      if (!targetGroup) {
        return;
      }
      const clone = targetGroup.cloneNode(true);
      if (!(clone instanceof SVGGElement)) {
        return;
      }
      clone.setAttribute("data-layer-id", nextLayerId);
      clone.querySelectorAll<SVGElement>("[data-element-id]").forEach((element, index) => {
        element.setAttribute("data-element-id", `${nextLayerId}-element-${index}`);
      });
      clone.querySelectorAll<SVGElement>("[data-field]").forEach((element, index) => {
        element.setAttribute("data-field", `${nextLayerId}-field-${index}`);
      });
      targetGroup.insertAdjacentElement("afterend", clone);
    }, { nextActiveLayer: nextLayerId });
  }

  function bringForward(layerId: string): void {
    applySvgMutation((svgRoot) => {
      const targetGroup = findLayerGroup(svgRoot, layerId);
      const nextSibling = targetGroup?.nextElementSibling;
      // Background layer should always stay at the bottom, we might need to handle that, but typically it's locked.
      if (!targetGroup || !nextSibling) {
        return;
      }
      // insert nextSibling before targetGroup -> moves targetGroup after nextSibling
      svgRoot.insertBefore(nextSibling, targetGroup);
    });
  }

  function sendBackward(layerId: string): void {
    applySvgMutation((svgRoot) => {
      const targetGroup = findLayerGroup(svgRoot, layerId);
      if (!targetGroup || !targetGroup.previousElementSibling) {
        return;
      }
      // Don't send backward behind the background layer
      if (targetGroup.previousElementSibling.getAttribute("data-role") === "background") {
        return;
      }
      svgRoot.insertBefore(targetGroup, targetGroup.previousElementSibling);
    });
  }

  function bringToFront(layerId: string): void {
    applySvgMutation((svgRoot) => {
      const targetGroup = findLayerGroup(svgRoot, layerId);
      if (!targetGroup) return;
      svgRoot.appendChild(targetGroup);
    });
  }

  function sendToBack(layerId: string): void {
    applySvgMutation((svgRoot) => {
      const targetGroup = findLayerGroup(svgRoot, layerId);
      if (!targetGroup) return;
      const firstChild = svgRoot.firstElementChild;
      // Ensure we don't place it before the background layer
      if (firstChild?.getAttribute("data-role") === "background") {
        const secondChild = firstChild.nextElementSibling;
        if (secondChild && secondChild !== targetGroup) {
          svgRoot.insertBefore(targetGroup, secondChild);
        }
      } else {
        svgRoot.insertBefore(targetGroup, firstChild);
      }
    });
  }

  function reorderLayers(draggedLayerId: string, targetLayerId: string): void {
    if (draggedLayerId === targetLayerId) {
      return;
    }
    applySvgMutation((svgRoot) => {
      const draggedGroup = findLayerGroup(svgRoot, draggedLayerId);
      const targetGroup = findLayerGroup(svgRoot, targetLayerId);
      if (!draggedGroup || !targetGroup) {
        return;
      }
      targetGroup.insertAdjacentElement("beforebegin", draggedGroup);
    });
  }

  function alignLayer(layerId: string, alignment: "left" | "center" | "right" | "top" | "middle" | "bottom"): void {
    applySvgMutation((svgRoot) => {
      const targetGroup = findLayerGroup(svgRoot, layerId);
      if (!targetGroup) return;

      const { width: canvasW, height: canvasH } = readSvgSize(svgRoot.outerHTML);
      const isShape = targetGroup.querySelector<SVGGeometryElement>("rect, circle, polygon, path");
      const isImage = targetGroup.querySelector<SVGImageElement>("image");
      const isText = targetGroup.querySelector<SVGTextElement>("text");

      // Reset translation so absolute positioning works correctly
      const transform = targetGroup.getAttribute("transform") || "";
      if (transform.includes("translate")) {
         targetGroup.removeAttribute("transform"); // or keep rotation if we had robust parsing, but removeAttribute is safe for now
      }

      if (isShape || isImage) {
        const el = isShape || isImage;
        if (!el) return;
        const width = Number.parseFloat(el.getAttribute("width") || "0");
        const height = Number.parseFloat(el.getAttribute("height") || "0");
        const r = Number.parseFloat(el.getAttribute("r") || "0");
        
        let elW = width;
        let elH = height;
        if (el.tagName === "circle") {
          elW = r * 2;
          elH = r * 2;
        }

        if (alignment === "left") {
          if (el.tagName === "circle") el.setAttribute("cx", String(r));
          else el.setAttribute("x", "0");
        } else if (alignment === "center") {
          if (el.tagName === "circle") el.setAttribute("cx", String(canvasW / 2));
          else el.setAttribute("x", String((canvasW - elW) / 2));
        } else if (alignment === "right") {
          if (el.tagName === "circle") el.setAttribute("cx", String(canvasW - r));
          else el.setAttribute("x", String(canvasW - elW));
        } else if (alignment === "top") {
          if (el.tagName === "circle") el.setAttribute("cy", String(r));
          else el.setAttribute("y", "0");
        } else if (alignment === "middle") {
          if (el.tagName === "circle") el.setAttribute("cy", String(canvasH / 2));
          else el.setAttribute("y", String((canvasH - elH) / 2));
        } else if (alignment === "bottom") {
          if (el.tagName === "circle") el.setAttribute("cy", String(canvasH - r));
          else el.setAttribute("y", String(canvasH - elH));
        }
      } else if (isText) {
        if (alignment === "left") {
          isText.setAttribute("text-anchor", "start");
          isText.setAttribute("x", "0");
        } else if (alignment === "center") {
          isText.setAttribute("text-anchor", "middle");
          isText.setAttribute("x", String(canvasW / 2));
        } else if (alignment === "right") {
          isText.setAttribute("text-anchor", "end");
          isText.setAttribute("x", String(canvasW));
        } else if (alignment === "top") {
           const fontSize = Number.parseFloat(isText.getAttribute("font-size") || "16");
           isText.setAttribute("y", String(fontSize));
        } else if (alignment === "middle") {
           isText.setAttribute("y", String(canvasH / 2));
        } else if (alignment === "bottom") {
           isText.setAttribute("y", String(canvasH - 8));
        }

        const bgRect = targetGroup.querySelector<SVGRectElement>("rect[data-text-background='true']");
        if (bgRect) {
           bgRect.remove(); // Removing it will force it to regenerate next time text changes. Or user can toggle fill.
        }
      }
    });
  }

  function translateLayer(layerId: string, dx: number, dy: number): void {
    applySvgMutation((svgRoot) => {
      const targetGroup = findLayerGroup(svgRoot, layerId);
      if (!targetGroup) {
        return;
      }
      const { x, y } = readTranslate(targetGroup.getAttribute("transform"));
      targetGroup.setAttribute("transform", `translate(${x + dx} ${y + dy})`);
    });
  }

  function rotateLayer(layerId: string, transform: string): void {
    applySvgMutation((svgRoot) => {
      const targetGroup = findLayerGroup(svgRoot, layerId);
      if (!targetGroup) return;
      // Preserve existing translate if present, append the new transform.
      const { x, y } = readTranslate(targetGroup.getAttribute("transform"));
      const translate = `translate(${x} ${y})`;
      const next = transform ? `${translate} ${transform}` : translate;
      targetGroup.setAttribute("transform", next);
    });
  }

  function undo(): void {
    if (historyIndex <= 0) {
      return;
    }
    const nextIndex = historyIndex - 1;
    const snapshot = history[nextIndex];
    if (!snapshot || !designOutput) {
      return;
    }
    setHistoryIndex(nextIndex);
    const restored = restoreDesignOutputFromSnapshot(designOutput, snapshot);
    setDesignOutput(restored);
    setSceneGraphStore(createSceneGraphStore(restored.svgLayers));
  }

  function redo(): void {
    if (historyIndex >= history.length - 1) {
      return;
    }
    const nextIndex = historyIndex + 1;
    const snapshot = history[nextIndex];
    if (!snapshot || !designOutput) {
      return;
    }
    setHistoryIndex(nextIndex);
    const restored = restoreDesignOutputFromSnapshot(designOutput, snapshot);
    setDesignOutput(restored);
    setSceneGraphStore(createSceneGraphStore(restored.svgLayers));
  }

  function exportSVG(): void {
    if (!designOutput || typeof window === "undefined") {
      return;
    }
    downloadBlob(
      new Blob([designOutput.composedSVG], { type: "image/svg+xml;charset=utf-8" }),
      `${designOutput.requestId}.svg`,
    );
  }

  function exportPNG(): void {
    if (!designOutput || typeof window === "undefined") {
      return;
    }
    void exportSvgAsPng(designOutput)
      .then((pngBlob) => {
        downloadBlob(pngBlob, `${designOutput.requestId}.png`);
      })
      .catch((pngError) => {
        setError(pngError instanceof Error ? pngError.message : "Unable to export PNG.");
      });
  }

  function exportPDF(): void {
    if (!designOutput || typeof window === "undefined") {
      return;
    }
    void exportSvgAsPdf(designOutput)
      .then((pdfBlob) => {
        downloadBlob(pdfBlob, `${designOutput.requestId}.pdf`);
      })
      .catch((pdfError) => {
        setError(pdfError instanceof Error ? pdfError.message : "Unable to export PDF.");
      });
  }

  return {
    prompt,
    brandKit,
    targetSize,
    isGenerating,
    isUploading,
    designOutput,
    error,
    activeLayer,
    selectedLayer,
    sceneGraph,
    historyIndex,
    historyLength: history.length,
    setPrompt,
    setBrandKit,
    setTargetSize,
    generate,
    uploadImage,
    setActiveLayer,
    updateLayerText,
    newDocument,
    loadDesign,
    toggleLayerVisibility,
    setLayerOpacity,
    toggleLayerLock,
    deleteLayer,
    applyLayerUpdate,
    addTextLayer,
    addShapeLayer,
    addUploadedImageLayer,
    duplicateLayer,
    bringForward,
    sendBackward,
    bringToFront,
    sendToBack,
    translateLayer,
    rotateLayer,
    reorderLayers,
    alignLayer,
    undo,
    redo,
    exportSVG,
    exportPNG,
    exportPDF,
  };
}

function buildBlankSvg(width: number, height: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" data-printrocket="true" data-version="1.0">` +
    `<g data-role="background" data-editable="false" data-layer-id="background">` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#FFFFFF"/></g>` +
    `</svg>`
  );
}

function mutateDesignOutput(
  currentDesignOutput: DesignOutput,
  mutator: (svgRoot: SVGSVGElement) => void,
): DesignOutput {
  const parser = new DOMParser();
  const svgDocument = parser.parseFromString(currentDesignOutput.composedSVG, "image/svg+xml");
  const svgRoot = svgDocument.documentElement;
  if (!(svgRoot instanceof SVGSVGElement)) {
    throw new Error("Generated SVG markup could not be parsed.");
  }

  mutator(svgRoot);

  const serializer = new XMLSerializer();
  return {
    ...currentDesignOutput,
    composedSVG: serializer.serializeToString(svgRoot),
    svgLayers: extractLayers(svgRoot, currentDesignOutput.svgLayers),
  };
}

function restoreDesignOutputFromSnapshot(currentDesignOutput: DesignOutput, svgSnapshot: string): DesignOutput {
  const parser = new DOMParser();
  const svgDocument = parser.parseFromString(svgSnapshot, "image/svg+xml");
  const svgRoot = svgDocument.documentElement;
  if (!(svgRoot instanceof SVGSVGElement)) {
    return currentDesignOutput;
  }
  return {
    ...currentDesignOutput,
    composedSVG: svgSnapshot,
    svgLayers: extractLayers(svgRoot, currentDesignOutput.svgLayers),
  };
}

function findLayerGroup(svgRoot: SVGSVGElement, layerId: string): SVGGElement | null {
  const groups = Array.from(svgRoot.children).filter(
    (node): node is SVGGElement => node instanceof SVGGElement && node.hasAttribute("data-role"),
  );
  return groups.find((group) => group.getAttribute("data-layer-id") === layerId || group.getAttribute("data-role") === layerId) ?? null;
}

function readTargetSizeFromSvg(svgMarkup: string): TargetSize {
  const { width, height } = readSvgSize(svgMarkup);
  return {
    width,
    height,
    unit: "px",
  };
}

async function exportSvgAsPng(designOutput: DesignOutput): Promise<Blob> {
  const svgBlob = new Blob([designOutput.composedSVG], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(svgBlob);

  try {
    const { width, height } = readSvgSize(designOutput.composedSVG);
    const image = await loadImage(objectUrl);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas rendering is unavailable in this browser.");
    }

    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("PNG export failed."));
          return;
        }
        resolve(blob);
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function exportSvgAsPdf(designOutput: DesignOutput): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  await import("svg2pdf.js");
  
  const { width, height } = readSvgSize(designOutput.composedSVG);
  
  // Create an invisible div to mount the SVG to, as svg2pdf requires a DOM node
  const container = document.createElement("div");
  container.innerHTML = designOutput.composedSVG;
  const svgElement = container.querySelector("svg");
  if (!svgElement) {
    throw new Error("Invalid SVG document.");
  }
  
  // Determine orientation based on aspect ratio
  const orientation = width > height ? "landscape" : "portrait";
  
  // Setup jsPDF document
  const doc = new jsPDF({
    orientation,
    unit: "px",
    format: [width, height],
    compress: true
  });
  
  // Render SVG into PDF
  await doc.svg(svgElement, {
    x: 0,
    y: 0,
    width,
    height
  });
  
  return doc.output("blob");
}

function readSvgSize(svgMarkup: string): { width: number; height: number } {
  const parser = new DOMParser();
  const svgDocument = parser.parseFromString(svgMarkup, "image/svg+xml");
  const svgRoot = svgDocument.documentElement;

  const widthValue = Number.parseFloat(svgRoot.getAttribute("width") ?? "0");
  const heightValue = Number.parseFloat(svgRoot.getAttribute("height") ?? "0");

  if (Number.isFinite(widthValue) && widthValue > 0 && Number.isFinite(heightValue) && heightValue > 0) {
    return {
      width: widthValue,
      height: heightValue,
    };
  }

  const viewBox = svgRoot.getAttribute("viewBox");
  if (viewBox) {
    const [, , viewBoxWidth, viewBoxHeight] = viewBox.split(/\s+/).map(Number);
    if (Number.isFinite(viewBoxWidth) && Number.isFinite(viewBoxHeight)) {
      return {
        width: viewBoxWidth,
        height: viewBoxHeight,
      };
    }
  }

  return {
    width: 1080,
    height: 1080,
  };
}

function readTranslate(transformValue: string | null): { x: number; y: number } {
  if (!transformValue) {
    return { x: 0, y: 0 };
  }
  const match = transformValue.match(/translate\(([-0-9.]+)[ ,]([-0-9.]+)\)/);
  if (!match) {
    return { x: 0, y: 0 };
  }
  return {
    x: Number.parseFloat(match[1]) || 0,
    y: Number.parseFloat(match[2]) || 0,
  };
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load SVG for PNG export."));
    image.src = source;
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(downloadUrl);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read the image file."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("Unable to read the image file."));
    reader.readAsDataURL(file);
  });
}

function readRequestErrorMessage(requestError: unknown, fallbackMessage: string): string {
  return requestError instanceof DesignApiError
    ? requestError.message
    : requestError instanceof Error
      ? requestError.message
      : fallbackMessage;
}
