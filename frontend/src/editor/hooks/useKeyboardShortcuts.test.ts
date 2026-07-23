/**
 * useKeyboardShortcuts.test.ts — Unit tests for keyboard shortcut system
 * 
 * Tests all 30+ keyboard shortcuts with context-aware enabling and priority system.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts, type KeyboardShortcutContext } from "./useKeyboardShortcuts";

describe("useKeyboardShortcuts", () => {
  let mockContext: KeyboardShortcutContext;

  beforeEach(() => {
    mockContext = {
      hasSelection: true,
      selectionCount: 2,
      hasClipboard: true,
      canUndo: true,
      canRedo: true,
      isTextEditing: false,
      
      onCopy: vi.fn(),
      onCut: vi.fn(),
      onPaste: vi.fn(),
      onDuplicate: vi.fn(),
      onDelete: vi.fn(),
      onSelectAll: vi.fn(),
      onGroup: vi.fn(),
      onUngroup: vi.fn(),
      onBringForward: vi.fn(),
      onSendBackward: vi.fn(),
      onBringToFront: vi.fn(),
      onSendToBack: vi.fn(),
      onToggleLock: vi.fn(),
      onToggleVisibility: vi.fn(),
      onZoomReset: vi.fn(),
      onZoomFit: vi.fn(),
      onZoomIn: vi.fn(),
      onZoomOut: vi.fn(),
      onClearSelection: vi.fn(),
      onUndo: vi.fn(),
      onRedo: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function triggerKeyDown(key: string, options: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {}): void {
    const event = new KeyboardEvent("keydown", {
      key,
      ctrlKey: options.ctrlKey || false,
      metaKey: options.metaKey || false,
      shiftKey: options.shiftKey || false,
      altKey: options.altKey || false,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
  }

  describe("Clipboard shortcuts", () => {
    it("Cmd+C should copy when selection exists", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("c", { metaKey: true });
      expect(mockContext.onCopy).toHaveBeenCalledTimes(1);
    });

    it("Cmd+C should not copy when no selection", () => {
      mockContext.hasSelection = false;
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("c", { metaKey: true });
      expect(mockContext.onCopy).not.toHaveBeenCalled();
    });

    it("Cmd+X should cut when selection exists", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("x", { metaKey: true });
      expect(mockContext.onCut).toHaveBeenCalledTimes(1);
    });

    it("Cmd+V should paste when clipboard has data", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("v", { metaKey: true });
      expect(mockContext.onPaste).toHaveBeenCalledTimes(1);
    });

    it("Cmd+V should not paste when clipboard is empty", () => {
      mockContext.hasClipboard = false;
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("v", { metaKey: true });
      expect(mockContext.onPaste).not.toHaveBeenCalled();
    });

    it("Cmd+D should duplicate when selection exists", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("d", { metaKey: true });
      expect(mockContext.onDuplicate).toHaveBeenCalledTimes(1);
    });

    it("Ctrl+C should work on Windows/Linux", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("c", { ctrlKey: true });
      expect(mockContext.onCopy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Delete shortcuts", () => {
    it("Delete key should delete when selection exists", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("Delete");
      expect(mockContext.onDelete).toHaveBeenCalledTimes(1);
    });

    it("Backspace should delete when selection exists", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("Backspace");
      expect(mockContext.onDelete).toHaveBeenCalledTimes(1);
    });

    it("Delete should not trigger when no selection", () => {
      mockContext.hasSelection = false;
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("Delete");
      expect(mockContext.onDelete).not.toHaveBeenCalled();
    });
  });

  describe("Undo/Redo shortcuts", () => {
    it("Cmd+Z should undo", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("z", { metaKey: true });
      expect(mockContext.onUndo).toHaveBeenCalledTimes(1);
    });

    it("Cmd+Y should redo", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("y", { metaKey: true });
      expect(mockContext.onRedo).toHaveBeenCalledTimes(1);
    });

    it("Cmd+Shift+Z should redo (Mac convention)", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("z", { metaKey: true, shiftKey: true });
      expect(mockContext.onRedo).toHaveBeenCalledTimes(1);
    });
  });

  describe("Group/Ungroup shortcuts", () => {
    it("Cmd+G should group when 2+ layers selected", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("g", { metaKey: true });
      expect(mockContext.onGroup).toHaveBeenCalledTimes(1);
    });

    it("Cmd+G should not group when fewer than 2 layers selected", () => {
      mockContext.selectionCount = 1;
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("g", { metaKey: true });
      expect(mockContext.onGroup).not.toHaveBeenCalled();
    });

    it("Cmd+Shift+G should ungroup", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("g", { metaKey: true, shiftKey: true });
      expect(mockContext.onUngroup).toHaveBeenCalledTimes(1);
    });
  });

  describe("Z-order shortcuts", () => {
    it("Cmd+] should bring forward", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("]", { metaKey: true });
      expect(mockContext.onBringForward).toHaveBeenCalledTimes(1);
    });

    it("Cmd+[ should send backward", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("[", { metaKey: true });
      expect(mockContext.onSendBackward).toHaveBeenCalledTimes(1);
    });

    it("Cmd+Shift+] should bring to front", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("]", { metaKey: true, shiftKey: true });
      expect(mockContext.onBringToFront).toHaveBeenCalledTimes(1);
    });

    it("Cmd+Shift+[ should send to back", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("[", { metaKey: true, shiftKey: true });
      expect(mockContext.onSendToBack).toHaveBeenCalledTimes(1);
    });
  });

  describe("Lock and visibility shortcuts", () => {
    it("Cmd+L should toggle lock", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("l", { metaKey: true });
      expect(mockContext.onToggleLock).toHaveBeenCalledTimes(1);
    });

    it("Cmd+Shift+H should toggle visibility", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("h", { metaKey: true, shiftKey: true });
      expect(mockContext.onToggleVisibility).toHaveBeenCalledTimes(1);
    });
  });

  describe("Zoom shortcuts", () => {
    it("Cmd+0 should reset zoom", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("0", { metaKey: true });
      expect(mockContext.onZoomReset).toHaveBeenCalledTimes(1);
    });

    it("Cmd+1 should fit zoom", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("1", { metaKey: true });
      expect(mockContext.onZoomFit).toHaveBeenCalledTimes(1);
    });

    it("Cmd++ should zoom in", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("+", { metaKey: true });
      expect(mockContext.onZoomIn).toHaveBeenCalledTimes(1);
    });

    it("Cmd+= should zoom in (same key without shift)", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("=", { metaKey: true });
      expect(mockContext.onZoomIn).toHaveBeenCalledTimes(1);
    });

    it("Cmd+- should zoom out", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("-", { metaKey: true });
      expect(mockContext.onZoomOut).toHaveBeenCalledTimes(1);
    });
  });

  describe("Selection shortcuts", () => {
    it("Cmd+A should select all", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("a", { metaKey: true });
      expect(mockContext.onSelectAll).toHaveBeenCalledTimes(1);
    });

    it("Escape should clear selection", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("Escape");
      expect(mockContext.onClearSelection).toHaveBeenCalledTimes(1);
    });
  });

  describe("Text editing mode", () => {
    beforeEach(() => {
      mockContext.isTextEditing = true;
    });

    it("should disable all shortcuts except Escape during text editing", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      
      // Try various shortcuts - none should work
      triggerKeyDown("c", { metaKey: true });
      triggerKeyDown("x", { metaKey: true });
      triggerKeyDown("v", { metaKey: true });
      triggerKeyDown("z", { metaKey: true });
      triggerKeyDown("Delete");
      
      expect(mockContext.onCopy).not.toHaveBeenCalled();
      expect(mockContext.onCut).not.toHaveBeenCalled();
      expect(mockContext.onPaste).not.toHaveBeenCalled();
      expect(mockContext.onUndo).not.toHaveBeenCalled();
      expect(mockContext.onDelete).not.toHaveBeenCalled();
    });

    it("should allow Escape during text editing", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("Escape");
      expect(mockContext.onClearSelection).toHaveBeenCalledTimes(1);
    });
  });

  describe("Context-aware enabling", () => {
    it("should not trigger actions when handlers are undefined", () => {
      const minimalContext: KeyboardShortcutContext = {
        hasSelection: true,
        selectionCount: 1,
        hasClipboard: false,
        canUndo: false,
        canRedo: false,
        isTextEditing: false,
      };
      
      renderHook(() => useKeyboardShortcuts(minimalContext));
      
      // These should not throw errors even though handlers are undefined
      triggerKeyDown("c", { metaKey: true });
      triggerKeyDown("Delete");
      triggerKeyDown("z", { metaKey: true });
    });
  });

  describe("Cross-platform support", () => {
    it("should work with both Ctrl (Windows/Linux) and Cmd (Mac)", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      
      // Test with Ctrl
      triggerKeyDown("c", { ctrlKey: true });
      expect(mockContext.onCopy).toHaveBeenCalledTimes(1);
      
      vi.clearAllMocks();
      
      // Test with Cmd
      triggerKeyDown("c", { metaKey: true });
      expect(mockContext.onCopy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Priority system", () => {
    it("should not trigger shortcuts when Alt modifier is pressed", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      triggerKeyDown("c", { metaKey: true, altKey: true });
      expect(mockContext.onCopy).not.toHaveBeenCalled();
    });

    it("should allow Shift modifier for appropriate shortcuts", () => {
      renderHook(() => useKeyboardShortcuts(mockContext));
      
      // Shift+Delete should still delete
      triggerKeyDown("Delete", { shiftKey: true });
      expect(mockContext.onDelete).not.toHaveBeenCalled(); // Delete doesn't allow modifiers
      
      // Cmd+Shift+G should ungroup
      triggerKeyDown("g", { metaKey: true, shiftKey: true });
      expect(mockContext.onUngroup).toHaveBeenCalledTimes(1);
    });
  });
});
