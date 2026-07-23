/**
 * useMultiSelection — Multi-selection state management hook
 * 
 * Manages selection of multiple layers with add/remove/toggle operations.
 * Tracks primaryLayerId for properties panel display.
 */

import { useCallback } from "react";
import type { SelectionSet, DocumentLayer } from "../types/documentModel";
import { LOCKED_ROLES } from "../types/documentModel";

export interface UseMultiSelectionOptions {
  selection: SelectionSet;
  onSelectionChange: (selection: SelectionSet) => void;
  layers: DocumentLayer[];
}

export interface UseMultiSelectionResult {
  add: (layerId: string) => void;
  remove: (layerId: string) => void;
  toggle: (layerId: string) => void;
  clear: () => void;
  selectAll: () => void;
  replaceWith: (layerId: string) => void;
  isSelected: (layerId: string) => boolean;
}

export function useMultiSelection({
  selection,
  onSelectionChange,
  layers,
}: UseMultiSelectionOptions): UseMultiSelectionResult {
  
  const add = useCallback((layerId: string) => {
    if (selection.layerIds.includes(layerId)) {
      return; // Already selected
    }
    
    onSelectionChange({
      layerIds: [...selection.layerIds, layerId],
      primaryLayerId: layerId, // Last-added becomes primary
    });
  }, [selection, onSelectionChange]);

  const remove = useCallback((layerId: string) => {
    const newLayerIds = selection.layerIds.filter(id => id !== layerId);
    
    // If removing primary, set new primary to last remaining layer
    const newPrimaryId = selection.primaryLayerId === layerId
      ? newLayerIds[newLayerIds.length - 1]
      : selection.primaryLayerId;
    
    onSelectionChange({
      layerIds: newLayerIds,
      primaryLayerId: newPrimaryId,
    });
  }, [selection, onSelectionChange]);


  const toggle = useCallback((layerId: string) => {
    if (selection.layerIds.includes(layerId)) {
      remove(layerId);
    } else {
      add(layerId);
    }
  }, [selection.layerIds, add, remove]);

  const clear = useCallback(() => {
    onSelectionChange({
      layerIds: [],
      primaryLayerId: undefined,
    });
  }, [onSelectionChange]);

  const selectAll = useCallback(() => {
    // Filter out locked layers and role-locked layers (logo, print-marks)
    const selectableLayers = layers.filter(layer => {
      if (layer.locked) return false;
      if (LOCKED_ROLES.has(layer.role)) return false;
      return layer.editable;
    });

    const layerIds = selectableLayers.map(l => l.id);
    
    onSelectionChange({
      layerIds,
      primaryLayerId: layerIds[layerIds.length - 1], // Last layer as primary
    });
  }, [layers, onSelectionChange]);

  const replaceWith = useCallback((layerId: string) => {
    onSelectionChange({
      layerIds: [layerId],
      primaryLayerId: layerId,
    });
  }, [onSelectionChange]);

  const isSelected = useCallback((layerId: string) => {
    return selection.layerIds.includes(layerId);
  }, [selection.layerIds]);

  return {
    add,
    remove,
    toggle,
    clear,
    selectAll,
    replaceWith,
    isSelected,
  };
}
