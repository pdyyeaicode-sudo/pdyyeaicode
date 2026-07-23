import { useState, useCallback } from 'react';
import type { CreativeDocument, DocumentLayer } from '../types/documentModel';

export function useLayerFocus(doc: CreativeDocument, activeArtboardId: string) {
  const [focusedLayerId, setFocusedLayerId] = useState<string | null>(null);

  // Get all focusable layers in document order
  const getFocusableLayers = useCallback((): DocumentLayer[] => {
    const activePage = doc.pages.find(p => p.id === doc.activePageId);
    const artboard = activePage?.artboards.find((a: any) => a.id === activeArtboardId);
    if (!artboard) return [];

    const focusable: DocumentLayer[] = [];
    
    function walk(layers: DocumentLayer[]) {
      for (const layer of layers) {
        // Skip locked and role-locked layers
        if (!layer.locked && !['logo', 'print-marks'].includes(layer.role || '')) {
          focusable.push(layer);
        }
        if (layer.kind === 'group' && layer.children) {
          walk(layer.children);
        }
      }
    }
    
    walk(artboard.layers);
    return focusable;
  }, [doc, activeArtboardId]);

  // Focus next layer (Tab)
  const focusNext = useCallback(() => {
    const layers = getFocusableLayers();
    if (layers.length === 0) return;

    const currentIndex = focusedLayerId 
      ? layers.findIndex(l => l.id === focusedLayerId)
      : -1;
    
    const nextIndex = (currentIndex + 1) % layers.length;
    setFocusedLayerId(layers[nextIndex].id);
  }, [focusedLayerId, getFocusableLayers]);

  // Focus previous layer (Shift+Tab)
  const focusPrevious = useCallback(() => {
    const layers = getFocusableLayers();
    if (layers.length === 0) return;

    const currentIndex = focusedLayerId 
      ? layers.findIndex(l => l.id === focusedLayerId)
      : 0;
    
    const prevIndex = currentIndex === 0 ? layers.length - 1 : currentIndex - 1;
    setFocusedLayerId(layers[prevIndex].id);
  }, [focusedLayerId, getFocusableLayers]);

  // Clear focus
  const clearFocus = useCallback(() => {
    setFocusedLayerId(null);
  }, []);

  return {
    focusedLayerId,
    setFocusedLayerId,
    focusNext,
    focusPrevious,
    clearFocus
  };
}
