/**
 * useShapeDrawing.ts — Hook for drawing shapes on canvas
 * 
 * Allows users to draw rectangles, circles, and other shapes by clicking and dragging.
 * CRITICAL: Locks viewport/pan during drawing to prevent canvas movement.
 */

import { useState, useCallback, useRef, useEffect } from "react";

export type ShapeType = string;

export interface DrawingState {
  isDrawing: boolean;
  shapeType: ShapeType | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export interface DrawnShape {
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UseShapeDrawingProps {
  enabled: boolean;
  shapeType: ShapeType | null;
  onShapeDrawn: (shape: DrawnShape) => void;
  containerRef: React.RefObject<HTMLElement>;
  onDrawingStateChange?: (isDrawing: boolean) => void; // NEW: Notify parent about drawing state
  constrainProportions?: boolean; // NEW: Force perfect squares/circles when true
}

/**
 * Hook to handle shape drawing with mouse/pointer
 * Supports Shift key to constrain proportions (perfect squares/circles)
 */
export function useShapeDrawing({
  enabled,
  shapeType,
  onShapeDrawn,
  containerRef,
  onDrawingStateChange,
  constrainProportions = false,
}: UseShapeDrawingProps): DrawingState {
  const [drawingState, setDrawingState] = useState<DrawingState>({
    isDrawing: false,
    shapeType: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });
  
  const isDrawingRef = useRef<boolean>(false);
  const pointerIdRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const pendingUpdateRef = useRef<{ x: number; y: number; shiftKey: boolean } | null>(null);
  const shiftKeyRef = useRef<boolean>(false);
  
  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (!enabled || !shapeType || !containerRef.current) return;
    
    // Only start drawing on left click
    if (e.button !== 0) return;
    
    // CRITICAL: Stop event propagation to prevent viewport pan
    e.stopPropagation();
    e.preventDefault();
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Capture pointer to ensure we receive all events
    const target = e.target as Element;
    if (target && 'setPointerCapture' in target) {
      try {
        target.setPointerCapture(e.pointerId);
        pointerIdRef.current = e.pointerId;
      } catch (err) {
        console.warn('[useShapeDrawing] Failed to capture pointer:', err);
      }
    }
    
    isDrawingRef.current = true;
    setDrawingState({
      isDrawing: true,
      shapeType,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
    });
    
    // Notify parent that drawing started (to lock viewport)
    if (onDrawingStateChange) {
      onDrawingStateChange(true);
    }
    
    console.log('[useShapeDrawing] Drawing started at:', { x, y });
  }, [enabled, shapeType, containerRef, onDrawingStateChange]);
  
  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDrawingRef.current || !containerRef.current) return;
    
    e.stopPropagation();
    e.preventDefault();
    
    const rect = containerRef.current.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;
    
    // Store shift key state
    shiftKeyRef.current = e.shiftKey;
    
    // If Shift is held, constrain to perfect square/circle
    if (e.shiftKey && (shapeType === "rectangle" || shapeType === "circle" || shapeType === "ellipse")) {
      const dx = x - drawingState.startX;
      const dy = y - drawingState.startY;
      const size = Math.max(Math.abs(dx), Math.abs(dy));
      x = drawingState.startX + (dx >= 0 ? size : -size);
      y = drawingState.startY + (dy >= 0 ? size : -size);
    }
    
    // Use requestAnimationFrame to throttle updates and prevent flickering
    pendingUpdateRef.current = { x, y, shiftKey: e.shiftKey };
    
    if (animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame(() => {
        const pending = pendingUpdateRef.current;
        if (pending && isDrawingRef.current) {
          setDrawingState(prev => ({
            ...prev,
            currentX: pending.x,
            currentY: pending.y,
          }));
        }
        animationFrameRef.current = null;
      });
    }
  }, [containerRef, shapeType, drawingState.startX, drawingState.startY]);
  
  const handlePointerUp = useCallback((e: PointerEvent) => {
    if (!isDrawingRef.current || !containerRef.current) return;
    
    e.stopPropagation();
    e.preventDefault();
    
    // Release pointer capture
    if (pointerIdRef.current !== null) {
      const target = e.target as Element;
      if (target && 'releasePointerCapture' in target) {
        try {
          target.releasePointerCapture(pointerIdRef.current);
        } catch (err) {
          console.warn('[useShapeDrawing] Failed to release pointer:', err);
        }
      }
      pointerIdRef.current = null;
    }
    
    const rect = containerRef.current.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;
    
    // Preserve exact user coordinates - no normalization
    const width = endX - drawingState.startX;
    const height = endY - drawingState.startY;
    const x = drawingState.startX;
    const y = drawingState.startY;
    
    console.log('[useShapeDrawing] Drawing finished:', { x, y, width, height });
    
    // Only create shape if it has meaningful size (>5px in either dimension)
    if ((Math.abs(width) > 5 || Math.abs(height) > 5) && drawingState.shapeType) {
      onShapeDrawn({
        type: drawingState.shapeType,
        x,
        y,
        width,
        height,
      });
    }
    
    // Reset drawing state
    isDrawingRef.current = false;
    setDrawingState({
      isDrawing: false,
      shapeType: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
    });
    
    // Notify parent that drawing ended (to unlock viewport)
    if (onDrawingStateChange) {
      onDrawingStateChange(false);
    }
    
    // Cancel any pending animation frame
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, [drawingState.startX, drawingState.startY, drawingState.shapeType, onShapeDrawn, containerRef, onDrawingStateChange]);
  
  // Attach event listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;
    
    // Use capture phase to intercept events before viewport handlers
    container.addEventListener("pointerdown", handlePointerDown, { capture: true });
    window.addEventListener("pointermove", handlePointerMove, { capture: true });
    window.addEventListener("pointerup", handlePointerUp, { capture: true });
    
    // Set cursor style
    if (shapeType) {
      container.style.cursor = "crosshair";
    }
    
    return () => {
      container.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      window.removeEventListener("pointermove", handlePointerMove, { capture: true });
      window.removeEventListener("pointerup", handlePointerUp, { capture: true });
      
      if (container.style.cursor === "crosshair") {
        container.style.cursor = "";
      }
      
      // Cleanup animation frame
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [enabled, shapeType, handlePointerDown, handlePointerMove, handlePointerUp, containerRef]);
  
  return drawingState;
}

/**
 * Get preview path for the shape being drawn - PRESERVES USER PROPORTIONS
 */
export function getShapePreviewPath(state: DrawingState): string {
  if (!state.isDrawing || !state.shapeType) return "";
  
  // Preserve exact coordinates - no Math.min/max normalization
  const startX = state.startX;
  const startY = state.startY;
  const endX = state.currentX;
  const endY = state.currentY;
  const width = endX - startX;
  const height = endY - startY;
  
  switch (state.shapeType) {
    case "rectangle": {
      // Draw rectangle from start to end, preserving direction
      return `M ${startX} ${startY} L ${endX} ${startY} L ${endX} ${endY} L ${startX} ${endY} Z`;
    }
    
    case "circle":
    case "ellipse": {
      // Draw ellipse with exact user proportions
      const cx = startX + width / 2;
      const cy = startY + height / 2;
      const rx = Math.abs(width / 2);
      const ry = Math.abs(height / 2);
      
      if (rx < 1 || ry < 1) return "";
      
      // Ellipse path using arc commands
      return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0`;
    }
    
    case "line": {
      // Draw line from exact start to exact end
      return `M ${startX} ${startY} L ${endX} ${endY}`;
    }
    
    case "triangle": {
      // Draw triangle preserving user's drag direction and proportions
      const midX = startX + width / 2;
      return `M ${midX} ${startY} L ${endX} ${endY} L ${startX} ${endY} Z`;
    }
    
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
    case "shield": {
      return generateShapePath(state.shapeType, startX, startY, width, height);
    }
    
    default:
      return "";
  }
}

/**
 * Generates an SVG path string for complex shapes based on bounding box.
 */
export function generateShapePath(type: ShapeType, x: number, y: number, width: number, height: number): string {
  const w = Math.abs(width);
  const h = Math.abs(height);
  const left = Math.min(x, x + width);
  const right = Math.max(x, x + width);
  const top = Math.min(y, y + height);
  const bottom = Math.max(y, y + height);
  const cx = left + w / 2;
  const cy = top + h / 2;
  const rx = w / 2;
  const ry = h / 2;

  switch (type) {
    case "diamond":
      return `M ${cx} ${top} L ${right} ${cy} L ${cx} ${bottom} L ${left} ${cy} Z`;
    case "pentagon": {
      const p1x = cx, p1y = top;
      const p2x = right, p2y = top + h * 0.38;
      const p3x = left + w * 0.81, p3y = bottom;
      const p4x = left + w * 0.19, p4y = bottom;
      const p5x = left, p5y = top + h * 0.38;
      return `M ${p1x} ${p1y} L ${p2x} ${p2y} L ${p3x} ${p3y} L ${p4x} ${p4y} L ${p5x} ${p5y} Z`;
    }
    case "hexagon": {
      const qw = w * 0.25;
      return `M ${left + qw} ${top} L ${right - qw} ${top} L ${right} ${cy} L ${right - qw} ${bottom} L ${left + qw} ${bottom} L ${left} ${cy} Z`;
    }
    case "octagon": {
      const q = Math.min(w, h) * 0.29;
      return `M ${left + q} ${top} L ${right - q} ${top} L ${right} ${top + q} L ${right} ${bottom - q} L ${right - q} ${bottom} L ${left + q} ${bottom} L ${left} ${bottom - q} L ${left} ${top + q} Z`;
    }
    case "star": {
      const outerR = Math.min(w, h) / 2;
      const innerR = outerR * 0.382;
      let path = "";
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        path += (i === 0 ? `M ` : ` L `) + `${px} ${py}`;
      }
      return path + " Z";
    }
    case "heart": {
      return `M ${cx} ${top + h * 0.3} C ${cx} ${top}, ${left} ${top}, ${left} ${top + h * 0.3} C ${left} ${top + h * 0.6}, ${cx} ${bottom * 0.9}, ${cx} ${bottom} C ${cx} ${bottom * 0.9}, ${right} ${top + h * 0.6}, ${right} ${top + h * 0.3} C ${right} ${top}, ${cx} ${top}, ${cx} ${top + h * 0.3} Z`;
    }
    case "cross": {
      const t = Math.min(w, h) * 0.33; // thickness
      return `M ${cx - t/2} ${top} L ${cx + t/2} ${top} L ${cx + t/2} ${cy - t/2} L ${right} ${cy - t/2} L ${right} ${cy + t/2} L ${cx + t/2} ${cy + t/2} L ${cx + t/2} ${bottom} L ${cx - t/2} ${bottom} L ${cx - t/2} ${cy + t/2} L ${left} ${cy + t/2} L ${left} ${cy - t/2} L ${cx - t/2} ${cy - t/2} Z`;
    }
    case "donut": {
      const outerRx = w / 2;
      const outerRy = h / 2;
      const innerRx = outerRx * 0.5;
      const innerRy = outerRy * 0.5;
      return `M ${cx - outerRx} ${cy} A ${outerRx} ${outerRy} 0 1 0 ${cx + outerRx} ${cy} A ${outerRx} ${outerRy} 0 1 0 ${cx - outerRx} ${cy} M ${cx - innerRx} ${cy} A ${innerRx} ${innerRy} 0 1 1 ${cx + innerRx} ${cy} A ${innerRx} ${innerRy} 0 1 1 ${cx - innerRx} ${cy}`;
    }
    case "chat-bubble": {
      const r = Math.min(w, h) * 0.15;
      const tail = Math.min(w, h) * 0.2;
      return `M ${left + r} ${top} L ${right - r} ${top} Q ${right} ${top} ${right} ${top + r} L ${right} ${bottom - tail - r} Q ${right} ${bottom - tail} ${right - r} ${bottom - tail} L ${left + w * 0.4} ${bottom - tail} L ${left + w * 0.2} ${bottom} L ${left + w * 0.25} ${bottom - tail} L ${left + r} ${bottom - tail} Q ${left} ${bottom - tail} ${left} ${bottom - tail - r} L ${left} ${top + r} Q ${left} ${top} ${left + r} ${top} Z`;
    }
    case "cloud": {
      return `M ${left + w*0.3} ${bottom} A ${w*0.15} ${h*0.2} 0 0 1 ${left + w*0.15} ${bottom - h*0.2} A ${w*0.2} ${h*0.25} 0 0 1 ${left + w*0.3} ${top + h*0.3} A ${w*0.25} ${h*0.3} 0 0 1 ${right - w*0.3} ${top + h*0.2} A ${w*0.2} ${h*0.25} 0 0 1 ${right - w*0.1} ${bottom - h*0.25} A ${w*0.15} ${h*0.2} 0 0 1 ${right - w*0.1} ${bottom} Z`;
    }
    case "banner": {
      const fold = w * 0.15;
      return `M ${left} ${top} L ${right} ${top} L ${right} ${bottom - h*0.3} L ${right - fold} ${bottom - h*0.3} L ${right - fold} ${bottom} L ${cx} ${bottom - h*0.15} L ${left + fold} ${bottom} L ${left + fold} ${bottom - h*0.3} L ${left} ${bottom - h*0.3} Z`;
    }
    case "badge": {
      let path = "";
      const outerR = Math.min(w, h) / 2;
      const innerR = outerR * 0.85;
      for (let i = 0; i < 16; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (i * Math.PI) / 8;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        path += (i === 0 ? `M ` : ` L `) + `${px} ${py}`;
      }
      return path + " Z";
    }
    case "shield": {
      return `M ${left} ${top} L ${right} ${top} L ${right} ${top + h * 0.4} C ${right} ${bottom * 0.8} ${cx} ${bottom} ${cx} ${bottom} C ${cx} ${bottom} ${left} ${bottom * 0.8} ${left} ${top + h * 0.4} Z`;
    }
    case "rounded-rect": {
      const rx = Math.min(w, h) * 0.2;
      const ry = rx;
      return `M ${left + rx} ${top} L ${right - rx} ${top} A ${rx} ${ry} 0 0 1 ${right} ${top + ry} L ${right} ${bottom - ry} A ${rx} ${ry} 0 0 1 ${right - rx} ${bottom} L ${left + rx} ${bottom} A ${rx} ${ry} 0 0 1 ${left} ${bottom - ry} L ${left} ${top + ry} A ${rx} ${ry} 0 0 1 ${left + rx} ${top} Z`;
    }
    default:
      if (type.startsWith("icon:")) {
        return `M ${left} ${top} L ${right} ${top} L ${right} ${bottom} L ${left} ${bottom} Z`;
      }
      return "";
  }
}
