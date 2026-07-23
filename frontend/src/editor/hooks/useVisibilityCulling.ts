/**
 * useVisibilityCulling.ts — Compute visible layer IDs based on viewport
 * 
 * Filters layers to only render those within the visible viewport for performance.
 */

import { useMemo } from "react";
import type { DocumentLayer } from "../types/documentModel";

export interface ViewportBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

export interface LayerBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Get bounding box for a single layer
 */
function getLayerBounds(layer: DocumentLayer): LayerBounds {
  if (layer.kind === "image" || layer.kind === "text") {
    return { 
      x: layer.x, 
      y: layer.y, 
      width: ('width' in layer && typeof layer.width === 'number') ? layer.width : 0,
      height: ('height' in layer && typeof layer.height === 'number') ? layer.height : 0
    };
  }
  
  if (layer.kind === "rect" && layer.geometry?.type === "rect") {
    const { x, y, width, height } = layer.geometry;
    return { x, y, width, height };
  }
  
  if (layer.kind === "ellipse" && layer.geometry?.type === "ellipse") {
    const { cx, cy, rx, ry } = layer.geometry;
    return { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 };
  }
  
  if (layer.kind === "group" && layer.children) {
    // Compute union of all children bounds
    const childBounds = layer.children.map(getLayerBounds);
    if (childBounds.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    
    const minX = Math.min(...childBounds.map(b => b.x));
    const minY = Math.min(...childBounds.map(b => b.y));
    const maxX = Math.max(...childBounds.map(b => b.x + b.width));
    const maxY = Math.max(...childBounds.map(b => b.y + b.height));
    
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  
  return { x: 0, y: 0, width: 0, height: 0 };
}

/**
 * Check if layer bounds intersect with viewport
 */
function intersectsViewport(layerBounds: LayerBounds, viewport: ViewportBounds): boolean {
  const layerRight = layerBounds.x + layerBounds.width;
  const layerBottom = layerBounds.y + layerBounds.height;
  const viewportRight = viewport.x + viewport.width;
  const viewportBottom = viewport.y + viewport.height;
  
  // Add margin to keep layers slightly outside viewport visible (prevents pop-in)
  const margin = 100;
  
  return !(
    layerRight < viewport.x - margin ||
    layerBounds.x > viewportRight + margin ||
    layerBottom < viewport.y - margin ||
    layerBounds.y > viewportBottom + margin
  );
}

/**
 * Recursively collect visible layer IDs
 */
function collectVisibleIds(
  layers: DocumentLayer[],
  viewport: ViewportBounds,
  visibleIds: Set<string>
): void {
  layers.forEach(layer => {
    const bounds = getLayerBounds(layer);
    
    if (intersectsViewport(bounds, viewport)) {
      visibleIds.add(layer.id);
      
      // If layer is a group, recursively check children
      if (layer.kind === "group" && layer.children) {
        collectVisibleIds(layer.children, viewport, visibleIds);
      }
    }
  });
}

/**
 * Hook to compute visible layer IDs based on viewport bounds
 * 
 * @param layers - All layers in the artboard
 * @param viewport - Current viewport bounds and zoom level
 * @param enabled - Whether culling is enabled (defaults to true)
 * @returns Set of visible layer IDs
 */
export function useVisibilityCulling(
  layers: DocumentLayer[],
  viewport: ViewportBounds | null,
  enabled: boolean = true
): Set<string> {
  return useMemo(() => {
    // If culling disabled or no viewport, all layers are visible
    if (!enabled || !viewport) {
      const allIds = new Set<string>();
      const collectAll = (layerList: DocumentLayer[]) => {
        layerList.forEach(layer => {
          allIds.add(layer.id);
          if (layer.kind === "group" && layer.children) {
            collectAll(layer.children);
          }
        });
      };
      collectAll(layers);
      return allIds;
    }
    
    const visibleIds = new Set<string>();
    collectVisibleIds(layers, viewport, visibleIds);
    return visibleIds;
  }, [layers, viewport, enabled]);
}
