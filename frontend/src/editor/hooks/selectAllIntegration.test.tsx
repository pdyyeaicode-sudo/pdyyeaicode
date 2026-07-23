/**
 * selectAllIntegration.test.tsx — Integration test for Cmd/Ctrl+A (Task 1.5)
 * 
 * Tests the complete flow from keyboard shortcut to layer selection,
 * verifying that all editable layers are selected while excluding:
 * - Locked layers
 * - Role-locked layers (logo, print-marks)
 * - Non-editable layers
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeyboardShortcuts, type KeyboardShortcutContext } from "./useKeyboardShortcuts";
import { useMultiSelection } from "./useMultiSelection";
import type { SelectionSet, DocumentLayer } from "../types/documentModel";

describe("Cmd/Ctrl+A Integration (Task 1.5)", () => {
  function createLayer(overrides: Partial<DocumentLayer>): DocumentLayer {
    return {
      id: overrides.id || "layer-1",
      kind: overrides.kind || "rect",
      role: overrides.role || "shape",
      editable: overrides.editable !== undefined ? overrides.editable : true,
      locked: overrides.locked || false,
      visible: overrides.visible !== undefined ? overrides.visible : true,
      opacity: overrides.opacity || 1,
      ...overrides,
    } as DocumentLayer;
  }

  function triggerKeyDown(key: string, options: { ctrlKey?: boolean; metaKey?: boolean } = {}): void {
    const event = new KeyboardEvent("keydown", {
      key,
      ctrlKey: options.ctrlKey || false,
      metaKey: options.metaKey || false,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
  }

  it("should select all editable layers when Cmd+A is pressed", () => {
    // Setup layers
    const layers: DocumentLayer[] = [
      createLayer({ id: "headline", editable: true, role: "headline" }),
      createLayer({ id: "body", editable: true, role: "body" }),
      createLayer({ id: "cta", editable: true, role: "cta" }),
    ];

    // Setup selection hook
    let currentSelection: SelectionSet = { layerIds: [], primaryLayerId: undefined };
    const onSelectionChange = vi.fn((selection: SelectionSet) => {
      currentSelection = selection;
    });

    const { result: multiSelectionResult } = renderHook(() =>
      useMultiSelection({
        selection: currentSelection,
        onSelectionChange,
        layers,
      })
    );

    // Setup keyboard shortcuts
    const context: KeyboardShortcutContext = {
      hasSelection: false,
      selectionCount: 0,
      hasClipboard: false,
      canUndo: false,
      canRedo: false,
      isTextEditing: false,
      onSelectAll: () => multiSelectionResult.current.selectAll(),
    };

    renderHook(() => useKeyboardShortcuts(context));

    // Trigger Cmd+A
    act(() => {
      triggerKeyDown("a", { metaKey: true });
    });

    // Verify all editable layers are selected
    expect(onSelectionChange).toHaveBeenCalledWith({
      layerIds: ["headline", "body", "cta"],
      primaryLayerId: "cta",
    });
  });

  it("should exclude locked and role-locked layers when selecting all", () => {
    // Setup layers with mixed properties
    const layers: DocumentLayer[] = [
      createLayer({ id: "headline", editable: true, role: "headline" }), // ✓ Selectable
      createLayer({ id: "logo", editable: true, role: "logo" }), // ✗ Role-locked
      createLayer({ id: "locked-text", editable: true, locked: true }), // ✗ Locked
      createLayer({ id: "background", editable: false, role: "background" }), // ✗ Not editable
      createLayer({ id: "cta", editable: true, role: "cta" }), // ✓ Selectable
      createLayer({ id: "print", editable: true, role: "print-marks" }), // ✗ Role-locked
      createLayer({ id: "body", editable: true, role: "body" }), // ✓ Selectable
    ];

    // Setup selection hook
    let currentSelection: SelectionSet = { layerIds: [], primaryLayerId: undefined };
    const onSelectionChange = vi.fn((selection: SelectionSet) => {
      currentSelection = selection;
    });

    const { result: multiSelectionResult } = renderHook(() =>
      useMultiSelection({
        selection: currentSelection,
        onSelectionChange,
        layers,
      })
    );

    // Setup keyboard shortcuts
    const context: KeyboardShortcutContext = {
      hasSelection: false,
      selectionCount: 0,
      hasClipboard: false,
      canUndo: false,
      canRedo: false,
      isTextEditing: false,
      onSelectAll: () => multiSelectionResult.current.selectAll(),
    };

    renderHook(() => useKeyboardShortcuts(context));

    // Trigger Cmd+A
    act(() => {
      triggerKeyDown("a", { metaKey: true });
    });

    // Verify only editable, unlocked, non-role-locked layers are selected
    expect(onSelectionChange).toHaveBeenCalledWith({
      layerIds: ["headline", "cta", "body"],
      primaryLayerId: "body",
    });
    
    // Verify excluded layers
    expect(currentSelection.layerIds).not.toContain("logo");
    expect(currentSelection.layerIds).not.toContain("locked-text");
    expect(currentSelection.layerIds).not.toContain("background");
    expect(currentSelection.layerIds).not.toContain("print");
  });

  it("should work on both Windows (Ctrl+A) and Mac (Cmd+A)", () => {
    const layers: DocumentLayer[] = [
      createLayer({ id: "layer-1", editable: true }),
      createLayer({ id: "layer-2", editable: true }),
    ];

    let currentSelection: SelectionSet = { layerIds: [], primaryLayerId: undefined };
    const onSelectionChange = vi.fn((selection: SelectionSet) => {
      currentSelection = selection;
    });

    const { result: multiSelectionResult } = renderHook(() =>
      useMultiSelection({
        selection: currentSelection,
        onSelectionChange,
        layers,
      })
    );

    const context: KeyboardShortcutContext = {
      hasSelection: false,
      selectionCount: 0,
      hasClipboard: false,
      canUndo: false,
      canRedo: false,
      isTextEditing: false,
      onSelectAll: () => multiSelectionResult.current.selectAll(),
    };

    renderHook(() => useKeyboardShortcuts(context));

    // Test Ctrl+A (Windows)
    act(() => {
      triggerKeyDown("a", { ctrlKey: true });
    });
    
    expect(onSelectionChange).toHaveBeenCalledWith({
      layerIds: ["layer-1", "layer-2"],
      primaryLayerId: "layer-2",
    });

    // Reset
    onSelectionChange.mockClear();
    currentSelection = { layerIds: [], primaryLayerId: undefined };

    // Test Cmd+A (Mac)
    act(() => {
      triggerKeyDown("a", { metaKey: true });
    });
    
    expect(onSelectionChange).toHaveBeenCalledWith({
      layerIds: ["layer-1", "layer-2"],
      primaryLayerId: "layer-2",
    });
  });

  it("should not trigger during text editing mode", () => {
    const layers: DocumentLayer[] = [
      createLayer({ id: "layer-1", editable: true }),
      createLayer({ id: "layer-2", editable: true }),
    ];

    const onSelectionChange = vi.fn();

    const { result: multiSelectionResult } = renderHook(() =>
      useMultiSelection({
        selection: { layerIds: [], primaryLayerId: undefined },
        onSelectionChange,
        layers,
      })
    );

    const context: KeyboardShortcutContext = {
      hasSelection: false,
      selectionCount: 0,
      hasClipboard: false,
      canUndo: false,
      canRedo: false,
      isTextEditing: true, // Text editing mode active
      onSelectAll: () => multiSelectionResult.current.selectAll(),
    };

    renderHook(() => useKeyboardShortcuts(context));

    // Trigger Cmd+A during text editing
    act(() => {
      triggerKeyDown("a", { metaKey: true });
    });

    // Should NOT select layers - browser handles text selection instead
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it("should replace existing selection with all layers", () => {
    const layers: DocumentLayer[] = [
      createLayer({ id: "layer-1", editable: true }),
      createLayer({ id: "layer-2", editable: true }),
      createLayer({ id: "layer-3", editable: true }),
    ];

    let currentSelection: SelectionSet = {
      layerIds: ["layer-1"], // Pre-existing selection
      primaryLayerId: "layer-1",
    };

    const onSelectionChange = vi.fn((selection: SelectionSet) => {
      currentSelection = selection;
    });

    const { result: multiSelectionResult } = renderHook(() =>
      useMultiSelection({
        selection: currentSelection,
        onSelectionChange,
        layers,
      })
    );

    const context: KeyboardShortcutContext = {
      hasSelection: true,
      selectionCount: 1,
      hasClipboard: false,
      canUndo: false,
      canRedo: false,
      isTextEditing: false,
      onSelectAll: () => multiSelectionResult.current.selectAll(),
    };

    renderHook(() => useKeyboardShortcuts(context));

    // Trigger Cmd+A
    act(() => {
      triggerKeyDown("a", { metaKey: true });
    });

    // Verify all layers are now selected
    expect(onSelectionChange).toHaveBeenCalledWith({
      layerIds: ["layer-1", "layer-2", "layer-3"],
      primaryLayerId: "layer-3",
    });
  });

  it("should set primaryLayerId to last layer in document order", () => {
    const layers: DocumentLayer[] = [
      createLayer({ id: "first", editable: true }),
      createLayer({ id: "middle", editable: true }),
      createLayer({ id: "last", editable: true }),
    ];

    const onSelectionChange = vi.fn();

    const { result: multiSelectionResult } = renderHook(() =>
      useMultiSelection({
        selection: { layerIds: [], primaryLayerId: undefined },
        onSelectionChange,
        layers,
      })
    );

    const context: KeyboardShortcutContext = {
      hasSelection: false,
      selectionCount: 0,
      hasClipboard: false,
      canUndo: false,
      canRedo: false,
      isTextEditing: false,
      onSelectAll: () => multiSelectionResult.current.selectAll(),
    };

    renderHook(() => useKeyboardShortcuts(context));

    // Trigger Cmd+A
    act(() => {
      triggerKeyDown("a", { metaKey: true });
    });

    // Verify primaryLayerId is the last layer
    expect(onSelectionChange).toHaveBeenCalledWith({
      layerIds: ["first", "middle", "last"],
      primaryLayerId: "last", // Last layer in array order
    });
  });

  it("should handle empty artboard gracefully", () => {
    const layers: DocumentLayer[] = [];

    const onSelectionChange = vi.fn();

    const { result: multiSelectionResult } = renderHook(() =>
      useMultiSelection({
        selection: { layerIds: [], primaryLayerId: undefined },
        onSelectionChange,
        layers,
      })
    );

    const context: KeyboardShortcutContext = {
      hasSelection: false,
      selectionCount: 0,
      hasClipboard: false,
      canUndo: false,
      canRedo: false,
      isTextEditing: false,
      onSelectAll: () => multiSelectionResult.current.selectAll(),
    };

    renderHook(() => useKeyboardShortcuts(context));

    // Trigger Cmd+A on empty artboard
    act(() => {
      triggerKeyDown("a", { metaKey: true });
    });

    // Should result in empty selection
    expect(onSelectionChange).toHaveBeenCalledWith({
      layerIds: [],
      primaryLayerId: undefined,
    });
  });
});
