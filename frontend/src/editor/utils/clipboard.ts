/**
 * clipboard.ts — Clipboard serialization utilities for copy/paste/cut/duplicate
 * 
 * Implements internal clipboard format for layer operations.
 * - Serializes DocumentLayer[] to JSON string
 * - Deserializes with validation
 * - Remaps all layer IDs recursively to ensure uniqueness
 * 
 * @see Design: Section 3 "Clipboard Architecture"
 * @see Requirements: 4.1-4.10 (Copy, Paste, Cut, and Duplicate Operations)
 */

import type { DocumentLayer } from '../types/documentModel';

/**
 * Bounding box for layer positioning
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * ClipboardData format version 1
 * 
 * Stores serialized layers with metadata for smart paste positioning.
 * Internal clipboard format (not system clipboard) for instant paste.
 */
export interface ClipboardData {
  type: 'creative-studio-layers';
  version: 1;
  layers: DocumentLayer[];           // Full serialized layers with children
  originalBounds: BoundingBox;       // For smart paste positioning (20px offset)
}

/**
 * Serialize layers to JSON string for clipboard storage
 * 
 * @param layers - Array of DocumentLayer objects to serialize
 * @returns JSON string representation of ClipboardData
 * 
 * @example
 * const json = serializeLayers([textLayer, shapeLayer]);
 * // Store in internal clipboard state
 */
export function serializeLayers(layers: DocumentLayer[]): string {
  if (layers.length === 0) {
    return JSON.stringify({
      type: 'creative-studio-layers',
      version: 1,
      layers: [],
      originalBounds: { x: 0, y: 0, width: 0, height: 0 },
    } satisfies ClipboardData);
  }

  // Compute original bounding box for all layers
  const originalBounds = computeBoundingBox(layers);

  const clipboardData: ClipboardData = {
    type: 'creative-studio-layers',
    version: 1,
    layers,
    originalBounds,
  };

  return JSON.stringify(clipboardData);
}

/**
 * Deserialize JSON string to DocumentLayer[] with validation
 * 
 * @param json - JSON string from clipboard
 * @returns Array of DocumentLayer objects, or empty array if invalid
 * 
 * Handles:
 * - Invalid JSON
 * - Wrong format version
 * - Missing required fields
 * - Circular references (should not occur, but validated)
 * 
 * @example
 * const layers = deserializeLayers(clipboardJson);
 * if (layers.length > 0) {
 *   // Valid clipboard data
 * }
 */
export function deserializeLayers(json: string): DocumentLayer[] {
  try {
    const data = JSON.parse(json);

    // Validate clipboard data format
    if (
      typeof data !== 'object' ||
      data === null ||
      data.type !== 'creative-studio-layers' ||
      data.version !== 1 ||
      !Array.isArray(data.layers)
    ) {
      console.warn('[clipboard] Invalid clipboard data format');
      return [];
    }

    const clipboardData = data as ClipboardData;

    // Validate each layer has required fields
    if (!validateLayers(clipboardData.layers)) {
      console.warn('[clipboard] Invalid layer structure in clipboard data');
      return [];
    }

    return clipboardData.layers;
  } catch (error) {
    console.warn('[clipboard] Failed to deserialize clipboard data:', error);
    return [];
  }
}

/**
 * Remap all layer IDs recursively to ensure uniqueness
 * 
 * When pasting layers, all IDs must be regenerated to avoid conflicts.
 * This function recursively remaps:
 * - Layer ID
 * - Child layer IDs (for groups)
 * - Preserves all other properties
 * 
 * @param layer - DocumentLayer to remap
 * @returns New DocumentLayer with remapped IDs
 * 
 * @example
 * const pastedLayer = remapLayerIds(copiedLayer);
 * // pastedLayer.id is new, all children have new IDs
 */
export function remapLayerIds(layer: DocumentLayer): DocumentLayer {
  const newId = generateUniqueId();

  // Handle GroupLayer with children
  if (layer.kind === 'group' && 'children' in layer && Array.isArray(layer.children)) {
    return {
      ...layer,
      id: newId,
      children: layer.children.map(child => remapLayerIds(child)),
    };
  }

  // Handle regular layers (text, shape, image)
  return {
    ...layer,
    id: newId,
  };
}

/**
 * Generate unique ID for layers
 * Uses timestamp + random string for uniqueness
 */
function generateUniqueId(): string {
  return `layer-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Compute bounding box encompassing all layers
 */
function computeBoundingBox(layers: DocumentLayer[]): BoundingBox {
  if (layers.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const layer of layers) {
    let x = 0, y = 0, width = 0, height = 0;
    
    // Extract position based on layer kind
    if (layer.kind === 'text' || layer.kind === 'image') {
      x = ('x' in layer && typeof layer.x === 'number') ? layer.x : 0;
      y = ('y' in layer && typeof layer.y === 'number') ? layer.y : 0;
      width = ('width' in layer && typeof layer.width === 'number') ? layer.width : 0;
      height = ('height' in layer && typeof layer.height === 'number') ? layer.height : 0;
    } else if (layer.kind === 'rect' && 'geometry' in layer && layer.geometry?.type === 'rect') {
      x = layer.geometry.x;
      y = layer.geometry.y;
      width = layer.geometry.width;
      height = layer.geometry.height;
    } else if (layer.kind === 'ellipse' && 'geometry' in layer && layer.geometry?.type === 'ellipse') {
      x = layer.geometry.cx - layer.geometry.rx;
      y = layer.geometry.cy - layer.geometry.ry;
      width = layer.geometry.rx * 2;
      height = layer.geometry.ry * 2;
    }

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Validate layer structure
 * Ensures layers have required fields and no circular references
 */
function validateLayers(layers: unknown): layers is DocumentLayer[] {
  if (!Array.isArray(layers)) {
    return false;
  }

  for (const layer of layers) {
    if (
      typeof layer !== 'object' ||
      layer === null ||
      typeof layer.id !== 'string' ||
      typeof layer.kind !== 'string'
    ) {
      return false;
    }

    // Recursively validate children for groups
    if (layer.kind === 'group' && 'children' in layer) {
      if (!validateLayers((layer as any).children)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Offset layer position by dx, dy
 * Applies offset to layer position based on layer kind
 * Recursively offsets group children
 * 
 * @param layer - DocumentLayer to offset
 * @param dx - Horizontal offset in pixels
 * @param dy - Vertical offset in pixels
 * @returns New DocumentLayer with offset position
 * 
 * @example
 * const offset = offsetLayerPosition(layer, 20, 20);
 * // Layer position moved by 20px right and 20px down
 */
export function offsetLayerPosition(layer: DocumentLayer, dx: number, dy: number): DocumentLayer {
  // Handle text and image layers with x, y properties
  if ((layer.kind === 'text' || layer.kind === 'image') && 'x' in layer && 'y' in layer) {
    return {
      ...layer,
      x: (layer.x || 0) + dx,
      y: (layer.y || 0) + dy,
    };
  }

  // Handle rect geometry
  if (layer.kind === 'rect' && 'geometry' in layer && layer.geometry?.type === 'rect') {
    return {
      ...layer,
      geometry: {
        ...layer.geometry,
        x: layer.geometry.x + dx,
        y: layer.geometry.y + dy,
      },
    };
  }

  // Handle ellipse geometry
  if (layer.kind === 'ellipse' && 'geometry' in layer && layer.geometry?.type === 'ellipse') {
    return {
      ...layer,
      geometry: {
        ...layer.geometry,
        cx: layer.geometry.cx + dx,
        cy: layer.geometry.cy + dy,
      },
    };
  }

  // Handle group - recursively offset children
  if (layer.kind === 'group' && 'children' in layer && Array.isArray(layer.children)) {
    return {
      ...layer,
      children: layer.children.map(child => offsetLayerPosition(child, dx, dy)),
    };
  }

  // Default: return layer unchanged
  return layer;
}

/**
 * Unlock layer and recursively unlock all children
 * Used when pasting locked layers (pasted copies should be unlocked)
 * 
 * @param layer - DocumentLayer to unlock
 * @returns New DocumentLayer with locked: false
 * 
 * @example
 * const unlocked = unlockLayer(lockedLayer);
 * // unlocked.locked === false, all children unlocked
 */
export function unlockLayer(layer: DocumentLayer): DocumentLayer {
  // Handle group - recursively unlock children
  if (layer.kind === 'group' && 'children' in layer && Array.isArray(layer.children)) {
    return {
      ...layer,
      locked: false,
      children: layer.children.map(child => unlockLayer(child)),
    };
  }

  // Regular layer - just unlock
  return {
    ...layer,
    locked: false,
  };
}
