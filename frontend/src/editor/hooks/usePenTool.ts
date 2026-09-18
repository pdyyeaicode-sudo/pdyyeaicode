import { useState, useCallback, useRef, useEffect } from "react";
import { 
  createPenSession, 
  addAnchor, 
  isOnFirstAnchor, 
  updateLastAnchorHandles,
  close, 
  finalize, 
  previewPathData,
  type PenSession,
  type PenAnchor,
  type PenCompletion
} from "../tools/penTool";

export interface PenToolState {
  isDrawing: boolean;
  previewData: string;
  anchors: readonly PenAnchor[];
}

export interface UsePenToolProps {
  enabled: boolean;
  containerRef: React.RefObject<HTMLElement>;
  onDrawingStateChange?: (isDrawing: boolean) => void;
  onPenPathCompleted: (completion: PenCompletion) => void;
  viewport: { panX: number, panY: number, zoom: number };
}

export function usePenTool({
  enabled,
  containerRef,
  onDrawingStateChange,
  onPenPathCompleted,
  viewport
}: UsePenToolProps): PenToolState {
  const [session, setSession] = useState<PenSession>(createPenSession());
  const [liveCursor, setLiveCursor] = useState<PenAnchor | null>(null);
  
  const isDraggingRef = useRef(false);
  const [isDraggingState, setIsDraggingState] = useState(false);
  const setDragging = useCallback((val: boolean) => {
    isDraggingRef.current = val;
    setIsDraggingState(val);
  }, []);

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Sync state upward
  const isDrawing = session.anchors.length > 0;
  useEffect(() => {
    if (onDrawingStateChange) onDrawingStateChange(isDrawing);
  }, [isDrawing, onDrawingStateChange]);

  // Reset if disabled
  useEffect(() => {
    if (!enabled) {
      setSession(createPenSession());
      setLiveCursor(null);
      setDragging(false);
    }
  }, [enabled, setDragging]);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (!enabledRef.current || !containerRef.current) return;
    if (e.button !== 0) return; // Only left click

    e.stopPropagation();
    e.preventDefault();

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert screen coordinates to model space
    const modelX = (x - viewport.panX) / viewport.zoom;
    const modelY = (y - viewport.panY) / viewport.zoom;
    const point = { x: modelX, y: modelY };

    setSession((currentSession) => {
      // Check if closing
      if (isOnFirstAnchor(currentSession, point)) {
        const completion = close(currentSession, { existingLayerIds: [] });
        onPenPathCompleted(completion);
        setDragging(false);
        return createPenSession();
      }
      setDragging(true);
      return addAnchor(currentSession, point);
    });
  }, [containerRef, viewport, onPenPathCompleted, setDragging]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!enabledRef.current || !containerRef.current || session.anchors.length === 0) {
      setLiveCursor(null);
      return;
    }

    e.stopPropagation();
    e.preventDefault();

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const modelX = (x - viewport.panX) / viewport.zoom;
    const modelY = (y - viewport.panY) / viewport.zoom;
    const point = { x: modelX, y: modelY };

    if (isDraggingRef.current) {
      setSession((currentSession) => updateLastAnchorHandles(currentSession, point));
      setLiveCursor(null);
    } else {
      // Snap to the first anchor if close enough
      if (isOnFirstAnchor(session, point)) {
        setLiveCursor(session.anchors[0]);
      } else {
        setLiveCursor(point);
      }
    }
  }, [containerRef, session, viewport]);

  const handlePointerUp = useCallback((e: PointerEvent) => {
    if (!enabledRef.current) return;
    setDragging(false);
  }, [setDragging]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabledRef.current || session.anchors.length === 0) return;
    
    if (e.key === "Enter" || e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      
      const completion = finalize(session, { existingLayerIds: [] });
      onPenPathCompleted(completion);
      setSession(createPenSession());
      setLiveCursor(null);
    }
  }, [session, onPenPathCompleted]);

  useEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (container) {
      container.addEventListener("pointerdown", handlePointerDown);
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        container.removeEventListener("pointerdown", handlePointerDown);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [enabled, containerRef, handlePointerDown, handlePointerMove, handlePointerUp, handleKeyDown]);

  const previewData = previewPathData(session, !isDraggingRef.current && liveCursor ? liveCursor : undefined);

  return {
    isDrawing: session.anchors.length > 0,
    previewData,
    anchors: session.anchors,
  };
}
