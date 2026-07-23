"use client";

/**
 * useCreativeStudio — composes the existing `useDesignStudio` hook and layers
 * the Creative Studio Document_Model command/history on top of it, without
 * disturbing the legacy string-snapshot SVG history that the current
 * `DesignStudio` page relies on (AGENTS.md: extend, never rewrite).
 *
 * The legacy hook remains the source of truth for the backend `DesignOutput`,
 * the live `SVGCanvas`, and its own undo/redo. This composing hook derives a
 * structured `CreativeDocument` from each loaded `DesignOutput` and exposes the
 * command-driven editing surface the design specifies:
 *   document, dispatchCommand(command), undo(), redo(), canUndo, canRedo.
 *
 * Command dispatch goes through the pure history core (`history.ts`), which
 * enforces the 50-command cap, redo invalidation, the non-zero-edit guard, and
 * the locked-layer guard. Pan/zoom and selection never produce commands.
 *
 * One responsibility per file: this module only wires the history core into a
 * React hook surface.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useDesignStudio, type UseDesignStudioResult } from "../hooks/useDesignStudio";
import { artboardFromDesignOutput, designOutputFromArtboard } from "./designOutputMapping";
import {
  canRedo as canRedoStack,
  canUndo as canUndoStack,
  createHistoryStack,
  dispatch as dispatchHistory,
  redo as redoHistory,
  undo as undoHistory,
  type EditorState,
} from "./history";
import { useToast } from "./useToast";
import { serializeLayers, deserializeLayers } from "./utils/clipboard";
import { pasteLayersCommand } from "./commands/pasteLayersCommand";
import { batchDeleteCommand } from "./commands/batchDeleteCommand";
import { reorderLayerCommand } from "./commands/reorderLayerCommand";
import { getActiveArtboard, findLayer, findParentChain, findLayerPosition, mapLayerInDoc } from "./commands/helpers";
import type { Artboard, Command, CreativeDocument, DocumentLayer } from "./types/documentModel";
import type { DesignOutput } from "../types";

// Tool names for canvas tools
type ToolName = "select" | "hand" | "pan" | "rect" | "ellipse" | "text" | "image" | "rounded-rect" | "circle" | "triangle" | "diamond" | "pentagon" | "hexagon" | "octagon" | "star" | "heart" | "cross" | "donut" | "chat-bubble" | "cloud" | "banner" | "badge" | "shield";

export interface UseCreativeStudioResult extends UseDesignStudioResult {
  /** Structured Document_Model derived from the loaded DesignOutput, or null when none is loaded. */
  document: CreativeDocument | null;
  /** Apply a command to the Document_Model and record it (subject to the dispatch guards). */
  dispatchCommand: (command: Command) => void;
  /** Revert the most recent command on the Document_Model (no-op when empty). */
  undo: () => void;
  /** Reapply the most recently undone command (no-op when empty). */
  redo: () => void;
  /** Whether a document-model undo is currently available. */
  canUndo: boolean;
  /** Whether a document-model redo is currently available. */
  canRedo: boolean;
  /** Internal clipboard state (JSON string) */
  clipboard: string | null;
  loading: { message: string; progress?: number } | null;
  setLoading: (loading: { message: string; progress?: number } | null) => void;
  /** Copy selected layers to clipboard */
  copy: (layerIds: string[]) => void;
  /** Cut selected layers (copy + delete) */
  cut: (layerIds: string[]) => void;
  /** Updates the artboard background color */
  updateBackground: (color: string) => void;
  /** Paste layers from clipboard */
  paste: () => void;
  /** Duplicate selected layers with offset */
  duplicate: (layerIds: string[]) => void;
  bringForward: (layerId: string) => void;
  sendBackward: (layerId: string) => void;
  bringToFront: (layerId: string) => void;
  sendToBack: (layerId: string) => void;
  applyLayerUpdate: (layerId: string, changes: Partial<DocumentLayer>) => void;
  /** Delete multiple layers */
  deleteMultiple: (layerIds: string[]) => void;
  /** Isolation mode */
  isolationMode: { groupId: string; parentPath: string[] } | null;
  enterIsolation: (groupId: string) => void;
  exitIsolation: () => void;
  /** Active tool name */
  activeTool: ToolName;
  setActiveTool: (tool: ToolName) => void;
  /** Toast notifications */
  toasts: Array<{ id: string; message: string; type: 'info' | 'success' | 'error' }>;
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void;
  dismissToast: (id: string) => void;
}

const DEFAULT_DOCUMENT_NAME = "Untitled Design";

export function useCreativeStudio(): UseCreativeStudioResult {
  const base = useDesignStudio();
  const { designOutput } = base;

  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [activeTool, setActiveTool] = useState<ToolName>("select");
  const [clipboard, setClipboard] = useState<string | null>(null);
  const [isolationMode, setIsolationMode] = useState<{ groupId: string; parentPath: string[] } | null>(null);
  
  const { toasts, show: showToast, dismiss: dismissToast } = useToast();
  const lastRequestIdRef = useRef<string | null>(null);

  // Rebuild the Document_Model and reset its history whenever a new
  // DesignOutput is loaded (generate / upload). A DesignOutput that cannot be
  // parsed as Canonical_SVG leaves the document null and the legacy path
  // untouched (Req 1.2, 10.9).
  useEffect(() => {
    if (!designOutput) {
      setEditorState(null);
      lastRequestIdRef.current = null;
      return;
    }
    // Initialize only when a new DesignOutput is loaded (by requestId). This
    // avoids resetting the in-memory command/history stack on every SVG
    // mutation produced by the legacy `useDesignStudio` hook.
    if (lastRequestIdRef.current === designOutput.requestId && editorState) {
      return;
    }
    const nextDoc = buildCreativeDocument(designOutput);
    setEditorState(nextDoc ? { doc: nextDoc, stack: createHistoryStack() } : null);
    lastRequestIdRef.current = designOutput.requestId;
  }, [designOutput]);

  const dispatchCommand = useCallback((command: Command): void => {
    setEditorState((current) => {
      if (!current) {
        return current;
      }
      const result = dispatchHistory(current, command);
      // When a guard drops the command, the same state reference is returned
      // and React skips the re-render.
      return result.applied ? result.state : current;
    });
  }, []);

  const undo = useCallback((): void => {
    setEditorState((current) => {
      if (!current || !canUndoStack(current.stack)) return current;
      const cmd = current.stack.past[current.stack.past.length - 1];
      showToast(`Undo ${cmd.label}`, 'info');
      return undoHistory(current);
    });
  }, [showToast]);

  const redo = useCallback((): void => {
    setEditorState((current) => (current ? redoHistory(current) : current));
  }, []);

  const document = editorState?.doc ?? null;
  const canUndo = editorState ? canUndoStack(editorState.stack) : false;
  const canRedo = editorState ? canRedoStack(editorState.stack) : false;

  // Clipboard operations
  const copy = useCallback((layerIds: string[]): void => {
    if (!document || layerIds.length === 0) return;

    const artboard = getActiveArtboard(document);
    if (!artboard) return;

    const layers: DocumentLayer[] = [];
    layerIds.forEach(id => {
      const layer = findLayer(artboard.layers, id);
      if (layer) {
        layers.push(layer);
      }
    });

    if (layers.length > 0) {
      setClipboard(serializeLayers(layers));
      showToast('Copied', 'info');
    }
  }, [document, showToast]);

  const cut = useCallback((layerIds: string[]): void => {
    copy(layerIds);
    deleteMultiple(layerIds);
  }, [copy]);


  const paste = useCallback(async (): Promise<void> => {
    if (!clipboard) return;
    try {
      const layers = deserializeLayers(clipboard);
      if (layers.length === 0) return;
      
      const command = pasteLayersCommand({ layers });
      dispatchCommand(command);
      
      // Note: Selection will be handled by the parent component
      showToast(`Pasted ${layers.length} layer${layers.length === 1 ? '' : 's'}`, 'success');
    } catch (error) {
      showToast('Failed to paste', 'error');
      console.error(error);
    }
  }, [clipboard, dispatchCommand, showToast]);

  const duplicate = useCallback((layerIds: string[]): void => {
    if (!document || layerIds.length === 0) return;

    const artboard = getActiveArtboard(document);
    if (!artboard) return;

    const layers: DocumentLayer[] = [];
    layerIds.forEach(id => {
      const layer = findLayer(artboard.layers, id);
      if (layer) {
        layers.push(layer);
      }
    });

    if (layers.length > 0) {
      const command = pasteLayersCommand({ layers });
      dispatchCommand(command);
    }
  }, [document, dispatchCommand]);

  const bringForward = useCallback((layerId: string): void => {
    if (!document) return;
    const ab = getActiveArtboard(document);
    if (!ab) return;
    const pos = findLayerPosition(ab.layers, layerId);
    if (!pos || pos.index === ab.layers.length - 1) return;
    dispatchCommand(reorderLayerCommand(layerId, pos.index, pos.index + 1));
  }, [document, dispatchCommand]);

  const sendBackward = useCallback((layerId: string): void => {
    if (!document) return;
    const ab = getActiveArtboard(document);
    if (!ab) return;
    const pos = findLayerPosition(ab.layers, layerId);
    if (!pos || pos.index === 0) return;
    dispatchCommand(reorderLayerCommand(layerId, pos.index, pos.index - 1));
  }, [document, dispatchCommand]);

  const bringToFront = useCallback((layerId: string): void => {
    if (!document) return;
    const ab = getActiveArtboard(document);
    if (!ab) return;
    const pos = findLayerPosition(ab.layers, layerId);
    if (!pos || pos.index === ab.layers.length - 1) return;
    dispatchCommand(reorderLayerCommand(layerId, pos.index, ab.layers.length - 1));
  }, [document, dispatchCommand]);

  const sendToBack = useCallback((layerId: string): void => {
    if (!document) return;
    const ab = getActiveArtboard(document);
    if (!ab) return;
    const pos = findLayerPosition(ab.layers, layerId);
    if (!pos || pos.index === 0) return;
    dispatchCommand(reorderLayerCommand(layerId, pos.index, 0));
  }, [document, dispatchCommand]);

  const applyLayerUpdate = useCallback((layerId: string, changes: Partial<DocumentLayer>): void => {
    if (!document) return;
    const ab = getActiveArtboard(document);
    if (!ab) return;
    const oldLayer = findLayer(ab.layers, layerId);
    if (!oldLayer) return;
    const command: Command = {
      type: "update-layer",
      label: "Update Layer",
      apply: (doc) => mapLayerInDoc(doc, layerId, (l) => ({ ...l, ...changes }) as any),
      undo: (doc) => mapLayerInDoc(doc, layerId, () => oldLayer)
    };
    dispatchCommand(command);
  }, [document, dispatchCommand]);

  const updateBackground = useCallback((color: string) => {
    if (!document) return;
    const artboard = getActiveArtboard(document);
    if (!artboard) return;

    const bgLayer = artboard.layers.find(l => l.role === "background");
    if (bgLayer) {
        applyLayerUpdate(bgLayer.id, { fill: color });
    } else {
        const command: Command = {
            type: "ADD_LAYER",
            label: "Add Background",
            apply: (doc) => ({
                ...doc,
                pages: doc.pages.map(p => ({
                    ...p,
                    artboards: p.artboards.map(a => a.id === artboard.id ? { 
                        ...a, 
                        layers: [{
                            id: crypto.randomUUID(),
                            role: "background",
                            name: "Background",
                            editable: false,
                            locked: true,
                            visible: true,
                            opacity: 100,
                            kind: "rect",
                            field: "background",
                            geometry: { type: "rect", x: 0, y: 0, width: a.width, height: a.height },
                            fill: color,
                            stroke: "none",
                            strokeWidth: 0
                        } as DocumentLayer, ...a.layers] 
                    } : a)
                }))
            }),
            undo: (doc) => ({
                ...doc,
                pages: doc.pages.map(p => ({
                    ...p,
                    artboards: p.artboards.map(a => a.id === artboard.id ? { 
                        ...a, 
                        layers: a.layers.filter(l => l.role !== "background") 
                    } : a)
                }))
            })
        };
        dispatchCommand(command);
    }
  }, [document, dispatchCommand, applyLayerUpdate]);

  const deleteMultiple = useCallback((layerIds: string[]): void => {
    if (layerIds.length === 0) return;

    const command = batchDeleteCommand({ layerIds });
    dispatchCommand(command);
  }, [dispatchCommand]);

  const enterIsolation = useCallback((groupId: string) => {
    if (!document) return;
    const artboard = getActiveArtboard(document);
    if (!artboard) return;
    const group = findLayer(artboard.layers, groupId);
    if (!group || group.kind !== 'group') {
      console.warn('Cannot enter isolation: not a group');
      return;
    }

    // Build breadcrumb path by walking up parent hierarchy
    const parentPath: string[] = ['Artboard'];
    const parents = findParentChain(artboard.layers, groupId);
    parents.forEach(parent => {
      if (parent.kind === 'group') {
        parentPath.push(parent.name || 'Group');
      }
    });
    
    parentPath.push(group.name || 'Group');

    setIsolationMode({ groupId, parentPath });
    
    showToast(`Editing ${group.name || 'Group'}`, 'info');
  }, [document, showToast]);

  const exitIsolation = useCallback(() => {
    if (!isolationMode) return;
    setIsolationMode(null);
    showToast('Exited group', 'info');
  }, [isolationMode, showToast]);

  const liveDesignOutput = useMemo(() => {
    if (!document || !designOutput) return designOutput;

    const page = document.pages.find((p) => p.id === document.activePageId) ?? document.pages[0];
    const artboard = page?.artboards.find((a) => a.id === document.activeArtboardId) ?? page?.artboards[0];
    if (!artboard) return designOutput;

    let isolatedArtboard = artboard;
    if (isolationMode) {
      const group = findLayer(artboard.layers, isolationMode.groupId);
      if (group && group.kind === 'group') {
        isolatedArtboard = { ...artboard, layers: group.children };
      }
    }

    try {
      return designOutputFromArtboard(isolatedArtboard, designOutput.requestId, designOutput.svgLayers);
    } catch {
      return designOutput;
    }
  }, [document, designOutput, isolationMode]);

  const [loading, setLoading] = useState<{ message: string; progress?: number } | null>(null);

  return useMemo(
    () => ({
      ...base,
      designOutput: liveDesignOutput,
      document,
      dispatchCommand,
      undo,
      redo,
      canUndo,
      canRedo,
      clipboard,
      loading,
      setLoading,
      copy,
      cut,
      updateBackground,
      paste,
      duplicate,
      bringForward,
      sendBackward,
      bringToFront,
      sendToBack,
      applyLayerUpdate,
      deleteMultiple,
      isolationMode,
      enterIsolation,
      exitIsolation,
      activeTool,
      setActiveTool,
      toasts,
      showToast,
      dismissToast,
    }),
    [base, liveDesignOutput, document, dispatchCommand, undo, redo, canUndo, canRedo, clipboard, loading, copy, cut, paste, duplicate, bringForward, sendBackward, bringToFront, sendToBack, applyLayerUpdate, deleteMultiple, isolationMode, enterIsolation, exitIsolation, activeTool, setActiveTool, toasts, showToast, dismissToast],
  );
}

/**
 * Wrap a backend `DesignOutput` into a single-page, single-artboard
 * `CreativeDocument`. Returns `null` when the output cannot be parsed as
 * Canonical_SVG so the caller can keep the legacy model unchanged (Req 1.2).
 */
export function buildCreativeDocument(output: DesignOutput): CreativeDocument | null {
  let artboard: Artboard;
  try {
    artboard = artboardFromDesignOutput(output);
  } catch {
    return null;
  }

  const pageId = `page-${artboard.id}`;
  const name = output.requestId.trim() ? output.requestId.trim().slice(0, 255) : DEFAULT_DOCUMENT_NAME;

  return {
    schemaVersion: 1,
    name,
    pages: [{ id: pageId, name: "Page 1", artboards: [artboard] }],
    activePageId: pageId,
    activeArtboardId: artboard.id,
  };
}
