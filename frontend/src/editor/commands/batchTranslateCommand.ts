/**
 * batchTranslateCommand.ts — Batch translate multiple layers atomically
 * 
 * Moves multiple layers in a single undo step, used for alignment and distribution.
 */

import { findLayer, getActiveArtboard } from "./helpers";
import type { Command, CreativeDocument } from "../types/documentModel";

export interface BatchTranslateParams {
  offsets: Array<{ layerId: string; dx: number; dy: number }>;
}

export type LayerOffset = { layerId: string; dx: number; dy: number };

/**
 * Create a batch translate command that moves multiple layers atomically
 */
export function batchTranslateCommand(params: BatchTranslateParams): Command {
  const { offsets } = params;
  
  return {
    type: "batch-translate",
    label: `Move ${offsets.length} layer${offsets.length === 1 ? "" : "s"}`,
    
    apply(doc: CreativeDocument): CreativeDocument {
      const artboard = getActiveArtboard(doc);
      if (!artboard) return doc;
      
      let modified = false;
      const newLayers = applyOffsetsToLayers(artboard.layers, offsets, (applied) => {
        if (applied) modified = true;
      });
      
      if (!modified) return doc;
      
      return {
        ...doc,
        pages: doc.pages.map(page =>
          page.id === doc.activePageId
            ? {
                ...page,
                artboards: page.artboards.map(ab =>
                  ab.id === doc.activeArtboardId
                    ? { ...ab, layers: newLayers }
                    : ab
                ),
              }
            : page
        ),
      };
    },
    
    undo(doc: CreativeDocument): CreativeDocument {
      const artboard = getActiveArtboard(doc);
      if (!artboard) return doc;
      
      // Reverse the offsets
      const reverseOffsets = offsets.map(({ layerId, dx, dy }) => ({
        layerId,
        dx: -dx,
        dy: -dy,
      }));
      
      let modified = false;
      const newLayers = applyOffsetsToLayers(artboard.layers, reverseOffsets, (applied) => {
        if (applied) modified = true;
      });
      
      if (!modified) return doc;
      
      return {
        ...doc,
        pages: doc.pages.map(page =>
          page.id === doc.activePageId
            ? {
                ...page,
                artboards: page.artboards.map(ab =>
                  ab.id === doc.activeArtboardId
                    ? { ...ab, layers: newLayers }
                    : ab
                ),
              }
            : page
        ),
      };
    },
  };
}

/**
 * Helper to apply offsets to layers recursively
 */
function applyOffsetsToLayers(
  layers: any[],
  offsets: Array<{ layerId: string; dx: number; dy: number }>,
  onModified: (applied: boolean) => void
): any[] {
  const offsetMap = new Map(offsets.map(o => [o.layerId, { dx: o.dx, dy: o.dy }]));
  
  return layers.map(layer => {
    const offset = offsetMap.get(layer.id);
    
    if (offset) {
      onModified(true);
      
      // Apply offset based on layer kind
      if (layer.kind === "image" || layer.kind === "text") {
        return { ...layer, x: layer.x + offset.dx, y: layer.y + offset.dy };
      }
      
      if (layer.kind === "rect" && layer.geometry?.type === "rect") {
        return {
          ...layer,
          geometry: {
            ...layer.geometry,
            x: layer.geometry.x + offset.dx,
            y: layer.geometry.y + offset.dy,
          },
        };
      }
      
      if (layer.kind === "ellipse" && layer.geometry?.type === "ellipse") {
        return {
          ...layer,
          geometry: {
            ...layer.geometry,
            cx: layer.geometry.cx + offset.dx,
            cy: layer.geometry.cy + offset.dy,
          },
        };
      }
      
      if (layer.kind === "group" && layer.children) {
        // For groups, recursively apply to children
        return {
          ...layer,
          children: applyOffsetsToLayers(layer.children, offsets, onModified),
        };
      }
    }
    
    // Check children for nested layers
    if (layer.kind === "group" && layer.children) {
      const newChildren = applyOffsetsToLayers(layer.children, offsets, onModified);
      if (newChildren !== layer.children) {
        return { ...layer, children: newChildren };
      }
    }
    
    return layer;
  });
}
