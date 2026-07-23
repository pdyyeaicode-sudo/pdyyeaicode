import { useState, useCallback, useRef, useEffect } from "react";

export interface Point {
  x: number;
  y: number;
}

export interface FreehandDrawingState {
  isDrawing: boolean;
  points: Point[];
}

export interface UseFreehandDrawingProps {
  enabled: boolean;
  containerRef: React.RefObject<HTMLElement>;
  onDrawingStateChange?: (isDrawing: boolean) => void;
  onStrokeDrawn: (pathString: string, bounds: { x: number, y: number, width: number, height: number }, points: Point[]) => void;
}

export function getSvgPathFromPoints(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y} L ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  
  // A simple quadratic bezier smoothing
  for (let i = 1; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x} ${points[i].y}, ${xc} ${yc}`;
  }
  
  // Connect the last point
  d += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
  return d;
}

export function useFreehandDrawing({
  enabled,
  containerRef,
  onDrawingStateChange,
  onStrokeDrawn
}: UseFreehandDrawingProps): FreehandDrawingState {
  const [drawingState, setDrawingState] = useState<FreehandDrawingState>({
    isDrawing: false,
    points: []
  });

  const isDrawingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const pointsRef = useRef<Point[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (!enabled || !containerRef.current) return;
    
    // Only left click
    if (e.button !== 0) return;

    e.stopPropagation();
    e.preventDefault();

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const target = e.target as Element;
    if (target && 'setPointerCapture' in target) {
      try {
        target.setPointerCapture(e.pointerId);
        pointerIdRef.current = e.pointerId;
      } catch (err) {
        // ignore
      }
    }

    isDrawingRef.current = true;
    pointsRef.current = [{ x, y }];
    
    setDrawingState({
      isDrawing: true,
      points: pointsRef.current
    });

    if (onDrawingStateChange) {
      onDrawingStateChange(true);
    }
  }, [enabled, containerRef, onDrawingStateChange]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDrawingRef.current || !containerRef.current) return;

    e.stopPropagation();
    e.preventDefault();

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    pointsRef.current.push({ x, y });

    if (animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame(() => {
        if (isDrawingRef.current) {
          setDrawingState({
            isDrawing: true,
            points: [...pointsRef.current]
          });
        }
        animationFrameRef.current = null;
      });
    }
  }, [containerRef]);

  const handlePointerUp = useCallback((e: PointerEvent) => {
    if (!isDrawingRef.current || !containerRef.current) return;

    e.stopPropagation();
    e.preventDefault();

    if (pointerIdRef.current !== null) {
      const target = e.target as Element;
      if (target && 'releasePointerCapture' in target) {
        try {
          target.releasePointerCapture(pointerIdRef.current);
        } catch (err) {}
      }
      pointerIdRef.current = null;
    }

    const pts = pointsRef.current;
    if (pts.length > 1) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const width = maxX - minX;
      const height = maxY - minY;
      
      const pathString = getSvgPathFromPoints(pts);
      onStrokeDrawn(pathString, { x: minX, y: minY, width, height }, pts);
    }

    isDrawingRef.current = false;
    pointsRef.current = [];
    
    setDrawingState({
      isDrawing: false,
      points: []
    });

    if (onDrawingStateChange) {
      onDrawingStateChange(false);
    }

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, [containerRef, onStrokeDrawn, onDrawingStateChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    container.addEventListener("pointerdown", handlePointerDown, { capture: true });
    window.addEventListener("pointermove", handlePointerMove, { capture: true });
    window.addEventListener("pointerup", handlePointerUp, { capture: true });

    container.style.cursor = "crosshair";

    return () => {
      container.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      window.removeEventListener("pointermove", handlePointerMove, { capture: true });
      window.removeEventListener("pointerup", handlePointerUp, { capture: true });

      if (container.style.cursor === "crosshair") {
        container.style.cursor = "";
      }

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [enabled, handlePointerDown, handlePointerMove, handlePointerUp, containerRef]);

  return drawingState;
}

export function getFreehandPreviewPath(state: FreehandDrawingState): string {
  if (!state.isDrawing || state.points.length === 0) return "";
  return getSvgPathFromPoints(state.points);
}
