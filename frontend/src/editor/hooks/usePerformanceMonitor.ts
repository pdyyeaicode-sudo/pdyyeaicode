/**
 * usePerformanceMonitor.ts — Monitor frame time and log warnings
 * 
 * Tracks performance during interactions and warns when FPS drops below 50.
 */

import { useEffect, useRef, useCallback } from "react";

const TARGET_FRAME_TIME = 16; // 60 FPS = 16ms per frame
const WARNING_THRESHOLD = 20; // 50 FPS = 20ms per frame

export interface PerformanceMetrics {
  averageFrameTime: number;
  currentFPS: number;
  droppedFrames: number;
}

/**
 * Hook to monitor performance during interactions
 * 
 * @param isInteracting - Whether user is currently interacting (dragging, zooming, etc.)
 * @param layerCount - Number of layers in the document
 * @returns Performance metrics
 */
export function usePerformanceMonitor(
  isInteracting: boolean,
  layerCount: number
): PerformanceMetrics {
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const droppedFramesRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);
  
  const measureFrame = useCallback(() => {
    const now = performance.now();
    const frameTime = now - lastFrameTimeRef.current;
    lastFrameTimeRef.current = now;
    
    // Keep last 60 frames (1 second at 60 FPS)
    frameTimesRef.current.push(frameTime);
    if (frameTimesRef.current.length > 60) {
      frameTimesRef.current.shift();
    }
    
    // Track dropped frames
    if (frameTime > WARNING_THRESHOLD) {
      droppedFramesRef.current++;
      
      // Log warning for significant performance degradation
      if (droppedFramesRef.current % 10 === 0) {
        console.warn(
          `⚠️ Performance degradation detected: ${frameTime.toFixed(1)}ms frame time (target: ${TARGET_FRAME_TIME}ms). ` +
          `Dropped ${droppedFramesRef.current} frames. Layer count: ${layerCount}`
        );
      }
    }
    
    // Continue measuring while interacting
    if (isInteracting) {
      rafIdRef.current = requestAnimationFrame(measureFrame);
    }
  }, [isInteracting, layerCount]);
  
  useEffect(() => {
    if (isInteracting) {
      // Start measuring
      lastFrameTimeRef.current = performance.now();
      droppedFramesRef.current = 0;
      rafIdRef.current = requestAnimationFrame(measureFrame);
    } else {
      // Stop measuring
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    }
    
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [isInteracting, measureFrame]);
  
  // Compute metrics
  const averageFrameTime = frameTimesRef.current.length > 0
    ? frameTimesRef.current.reduce((sum, t) => sum + t, 0) / frameTimesRef.current.length
    : TARGET_FRAME_TIME;
  
  const currentFPS = averageFrameTime > 0 ? 1000 / averageFrameTime : 60;
  
  return {
    averageFrameTime,
    currentFPS: Math.round(currentFPS),
    droppedFrames: droppedFramesRef.current,
  };
}

/**
 * Log a one-time warning when layer count exceeds threshold
 */
export function useLayerCountWarning(layerCount: number, threshold: number = 100): void {
  const warnedRef = useRef<boolean>(false);
  
  useEffect(() => {
    if (layerCount > threshold && !warnedRef.current) {
      console.warn(
        `⚠️ High layer count detected: ${layerCount} layers. ` +
        `Consider reducing complexity for better performance. ` +
        `Recommended: <${threshold} layers.`
      );
      warnedRef.current = true;
    }
    
    // Reset warning if layer count drops below threshold
    if (layerCount <= threshold) {
      warnedRef.current = false;
    }
  }, [layerCount, threshold]);
}
