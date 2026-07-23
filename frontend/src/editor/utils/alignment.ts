/**
 * alignment.ts — Alignment and distribution algorithms for multi-layer operations
 * 
 * Implements 6 alignment modes and 2 distribution modes with locked layer filtering.
 */

import { findLayer, getActiveArtboard } from "../commands/helpers";
import type { CreativeDocument, DocumentLayer } from "../types/documentModel";

export type AlignMode = 
  | "left" 
  | "center-horizontal" 
  | "right" 
  | "top" 
  | "center-vertical" 
  | "bottom";

export type DistributeMode = "horizontal" | "vertical";

export type AlignmentTarget = "selection" | "artboard";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayerOffset {
  layerId: string;
  dx: number;
  dy: number;
}

const LOCKED_ROLES = ["logo", "print-marks"];

/**
 * Check if layer is locked (either explicitly locked or role-locked)
 */
function isLayerLocked(layer: DocumentLayer): boolean {
  return layer.locked || LOCKED_ROLES.includes(layer.role || "");
}

/**
 * Get bounding box for a single layer
 */
function getLayerBounds(layer: DocumentLayer): BoundingBox {
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
 * Get the combined bounding box for a selection of layers
 */
export function getSelectionBounds(layerIds: string[], doc: CreativeDocument): BoundingBox | null {
  const artboard = getActiveArtboard(doc);
  if (!artboard) return null;
  
  const layers: DocumentLayer[] = [];
  layerIds.forEach(id => {
    const layer = findLayer(artboard.layers, id);
    if (layer && !isLayerLocked(layer)) {
      layers.push(layer);
    }
  });
  
  if (layers.length === 0) return null;
  
  const bounds = layers.map(getLayerBounds);
  const minX = Math.min(...bounds.map(b => b.x));
  const minY = Math.min(...bounds.map(b => b.y));
  const maxX = Math.max(...bounds.map(b => b.x + b.width));
  const maxY = Math.max(...bounds.map(b => b.y + b.height));
  
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Compute alignment offsets for layers
 * Returns array of {layerId, dx, dy} for each layer that needs to move
 */
export function alignLayers(
  layerIds: string[],
  mode: AlignMode,
  target: AlignmentTarget,
  doc: CreativeDocument
): LayerOffset[] {
  const artboard = getActiveArtboard(doc);
  if (!artboard) return [];
  
  // Filter out locked layers
  const unlocked = layerIds.filter(id => {
    const layer = findLayer(artboard.layers, id);
    return layer && !isLayerLocked(layer);
  });
  
  if (unlocked.length === 0) return [];
  
  // Get reference bounds
  let referenceBounds: BoundingBox;
  
  if (target === "artboard") {
    referenceBounds = { x: 0, y: 0, width: artboard.width, height: artboard.height };
  } else {
    // Use selection bounds
    const selectionBounds = getSelectionBounds(unlocked, doc);
    if (!selectionBounds) return [];
    referenceBounds = selectionBounds;
  }
  
  const offsets: LayerOffset[] = [];
  
  unlocked.forEach(id => {
    const layer = findLayer(artboard.layers, id);
    if (!layer) return;
    
    const bounds = getLayerBounds(layer);
    let dx = 0;
    let dy = 0;
    
    switch (mode) {
      case "left":
        dx = referenceBounds.x - bounds.x;
        break;
      
      case "center-horizontal":
        dx = (referenceBounds.x + referenceBounds.width / 2) - (bounds.x + bounds.width / 2);
        break;
      
      case "right":
        dx = (referenceBounds.x + referenceBounds.width) - (bounds.x + bounds.width);
        break;
      
      case "top":
        dy = referenceBounds.y - bounds.y;
        break;
      
      case "center-vertical":
        dy = (referenceBounds.y + referenceBounds.height / 2) - (bounds.y + bounds.height / 2);
        break;
      
      case "bottom":
        dy = (referenceBounds.y + referenceBounds.height) - (bounds.y + bounds.height);
        break;
    }
    
    // Only include non-zero offsets
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
      offsets.push({ layerId: id, dx, dy });
    }
  });
  
  return offsets;
}

/**
 * Compute distribution offsets for layers
 * Distributes layers evenly across the selection bounds
 */
export function distributeLayers(
  layerIds: string[],
  mode: DistributeMode,
  doc: CreativeDocument
): LayerOffset[] {
  const artboard = getActiveArtboard(doc);
  if (!artboard) return [];
  
  // Filter out locked layers
  const unlocked = layerIds.filter(id => {
    const layer = findLayer(artboard.layers, id);
    return layer && !isLayerLocked(layer);
  });
  
  if (unlocked.length < 3) return []; // Need at least 3 layers to distribute
  
  // Get layer bounds
  const layerBounds = unlocked.map(id => {
    const layer = findLayer(artboard.layers, id);
    return { layerId: id, bounds: layer ? getLayerBounds(layer) : null };
  }).filter(item => item.bounds !== null) as { layerId: string; bounds: BoundingBox }[];
  
  if (layerBounds.length < 3) return [];
  
  // Sort by position
  if (mode === "horizontal") {
    layerBounds.sort((a, b) => a.bounds.x - b.bounds.x);
  } else {
    layerBounds.sort((a, b) => a.bounds.y - b.bounds.y);
  }
  
  // Calculate total space and gap
  const first = layerBounds[0].bounds;
  const last = layerBounds[layerBounds.length - 1].bounds;
  
  let totalSpace: number;
  let totalLayerSize: number;
  
  if (mode === "horizontal") {
    totalSpace = (last.x + last.width) - first.x;
    totalLayerSize = layerBounds.reduce((sum, item) => sum + item.bounds.width, 0);
  } else {
    totalSpace = (last.y + last.height) - first.y;
    totalLayerSize = layerBounds.reduce((sum, item) => sum + item.bounds.height, 0);
  }
  
  const gap = (totalSpace - totalLayerSize) / (layerBounds.length - 1);
  
  // Compute offsets
  const offsets: LayerOffset[] = [];
  let currentPos = mode === "horizontal" ? first.x : first.y;
  
  layerBounds.forEach((item, index) => {
    if (index === 0) {
      // First layer stays in place
      currentPos += mode === "horizontal" ? item.bounds.width + gap : item.bounds.height + gap;
      return;
    }
    
    if (index === layerBounds.length - 1) {
      // Last layer stays in place
      return;
    }
    
    const targetPos = currentPos;
    const currentLayerPos = mode === "horizontal" ? item.bounds.x : item.bounds.y;
    const offset = targetPos - currentLayerPos;
    
    if (Math.abs(offset) > 0.01) {
      offsets.push({
        layerId: item.layerId,
        dx: mode === "horizontal" ? offset : 0,
        dy: mode === "vertical" ? offset : 0,
      });
    }
    
    currentPos += mode === "horizontal" ? item.bounds.width + gap : item.bounds.height + gap;
  });
  
  return offsets;
}
