"use client";

/**
 * useSelection — React state container for the Editor_Canvas `Selection_Set`
 * (task 5.5).
 *
 * Owns the `SelectionSet` (`{ layerIds: string[], primaryLayerId?: string }`) and
 * exposes the four selection transitions the requirements call for, all delegating
 * their set algebra to the pure `selectionMath` helpers:
 *
 *   - `selectOnly(id)`  → selection becomes exactly that layer (Req 1.7)
 *   - `toggle(id)`      → shift-click add/remove membership (Req 1.9, 1.10)
 *   - `clear()`         → empty-canvas click clears the set (Req 1.8)
 *   - `setSelection(ids)` → marquee result / programmatic select (Req 1.12)
 *
 * The `primaryLayerId` tracks the last-clicked layer in multi-selection, driving
 * which layer's properties appear in the PropertiesPanel.
 *
 * Selection never mutates the Document_Model and never records a Command; it is
 * pure UI state. One responsibility per file: selection-set state + handlers.
 */

import { useCallback, useMemo, useState } from "react";

import { toggleSelection } from "./selectionMath";
import type { SelectionSet } from "./types/documentModel";

export interface UseSelectionResult {
  /** Current selection set; drives the SelectionOverlay handles. */
  selection: SelectionSet;
  /** Replace the selection with exactly one layer (Req 1.7). */
  selectOnly: (layerId: string) => void;
  /** Add the layer if absent, remove it if present (Req 1.9, 1.10). */
  toggle: (layerId: string) => void;
  /** Clear the selection so it contains zero layers (Req 1.8). */
  clear: () => void;
  /** Replace the whole selection (marquee release / programmatic). */
  setSelection: (layerIds: string[]) => void;
  /** Whether the given layer id is currently selected. */
  isSelected: (layerId: string) => boolean;
  /** Select all layers from the given list (filtered externally for editability) */
  selectAll: (layerIds: string[]) => void;
}

export function useSelection(initial: readonly string[] = []): UseSelectionResult {
  const [selection, setSelectionState] = useState<SelectionSet>(() => ({
    layerIds: [...initial],
    primaryLayerId: initial.length > 0 ? initial[0] : undefined,
  }));

  const selectOnly = useCallback((layerId: string): void => {
    setSelectionState({
      layerIds: [layerId],
      primaryLayerId: layerId,
    });
  }, []);

  const toggle = useCallback((layerId: string): void => {
    setSelectionState((current) => {
      const nextIds = toggleSelection(current.layerIds, layerId);
      // If toggling off the primary layer, set primary to the last remaining layer
      let nextPrimary = current.primaryLayerId;
      if (current.primaryLayerId === layerId && !nextIds.includes(layerId)) {
        nextPrimary = nextIds.length > 0 ? nextIds[nextIds.length - 1] : undefined;
      } else if (!current.layerIds.includes(layerId) && nextIds.includes(layerId)) {
        // Adding a new layer: set it as primary
        nextPrimary = layerId;
      }
      return {
        layerIds: nextIds,
        primaryLayerId: nextPrimary,
      };
    });
  }, []);

  const clear = useCallback((): void => {
    setSelectionState((current) =>
      current.layerIds.length === 0 ? current : { layerIds: [], primaryLayerId: undefined },
    );
  }, []);

  const setSelection = useCallback((layerIds: string[]): void => {
    setSelectionState({
      layerIds: [...layerIds],
      primaryLayerId: layerIds.length > 0 ? layerIds[layerIds.length - 1] : undefined,
    });
  }, []);

  const selectAll = useCallback((layerIds: string[]): void => {
    setSelectionState({
      layerIds: [...layerIds],
      primaryLayerId: layerIds.length > 0 ? layerIds[layerIds.length - 1] : undefined,
    });
  }, []);

  const isSelected = useCallback(
    (layerId: string): boolean => selection.layerIds.includes(layerId),
    [selection.layerIds],
  );

  return useMemo(
    () => ({
      selection,
      selectOnly,
      toggle,
      clear,
      setSelection,
      isSelected,
      selectAll,
    }),
    [selection, selectOnly, toggle, clear, setSelection, isSelected, selectAll],
  );
}
