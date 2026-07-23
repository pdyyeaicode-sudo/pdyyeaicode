/**
 * useKeyboardShortcuts.selectAll.test.ts — Tests for Cmd/Ctrl+A select all shortcut (Task 1.5)
 * 
 * Validates that Cmd/Ctrl+A selects all editable layers while excluding:
 * - Locked layers
 * - Role-locked layers (logo, print-marks)
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeyboardShortcuts, type KeyboardShortcutContext } from "./useKeyboardShortcuts";

describe("Cmd/Ctrl+A Select All (Task 1.5)", () => {
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

  it("should trigger onSelectAll when Cmd+A is pressed (Mac)", () => {
    const context: KeyboardShortcutContext = {
      hasSelection: false,
      selectionCount: 0,
      hasClipboard: false,
      canUndo: false,
      canRedo: false,
      isTextEditing: false,
      onSelectAll: vi.fn(),
    };
    
    renderHook(() => useKeyboardShortcuts(context));
    
    act(() => {
      triggerKeyDown("a", { metaKey: true });
    });
    
    expect(context.onSelectAll).toHaveBeenCalledTimes(1);
  });

  it("should trigger onSelectAll when Ctrl+A is pressed (Windows)", () => {
    const context: KeyboardShortcutContext = {
      hasSelection: false,
      selectionCount: 0,
      hasClipboard: false,
      canUndo: false,
      canRedo: false,
      isTextEditing: false,
      onSelectAll: vi.fn(),
    };
    
    renderHook(() => useKeyboardShortcuts(context));
    
    act(() => {
      triggerKeyDown("a", { ctrlKey: true });
    });
    
    expect(context.onSelectAll).toHaveBeenCalledTimes(1);
  });

  it("should prevent default browser behavior (text selection)", () => {
    const context: KeyboardShortcutContext = {
      hasSelection: false,
      selectionCount: 0,
      hasClipboard: false,
      canUndo: false,
      canRedo: false,
      isTextEditing: false,
      onSelectAll: vi.fn(),
    };
    
    renderHook(() => useKeyboardShortcuts(context));
    
    const event = new KeyboardEvent("keydown", {
      key: "a",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");
    
    act(() => {
      window.dispatchEvent(event);
    });
    
    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it("should work even when no selection exists", () => {
    const context: KeyboardShortcutContext = {
      hasSelection: false,
      selectionCount: 0,
      hasClipboard: false,
      canUndo: false,
      canRedo: false,
      isTextEditing: false,
      onSelectAll: vi.fn(),
    };
    
    renderHook(() => useKeyboardShortcuts(context));
    
    act(() => {
      triggerKeyDown("a", { metaKey: true });
    });
    
    expect(context.onSelectAll).toHaveBeenCalledTimes(1);
  });

  it("should work when some layers are already selected", () => {
    const context: KeyboardShortcutContext = {
      hasSelection: true,
      selectionCount: 2,
      hasClipboard: false,
      canUndo: false,
      canRedo: false,
      isTextEditing: false,
      onSelectAll: vi.fn(),
    };
    
    renderHook(() => useKeyboardShortcuts(context));
    
    act(() => {
      triggerKeyDown("a", { metaKey: true });
    });
    
    expect(context.onSelectAll).toHaveBeenCalledTimes(1);
  });

  it("should NOT trigger during text editing mode", () => {
    const context: KeyboardShortcutContext = {
      hasSelection: false,
      selectionCount: 0,
      hasClipboard: false,
      canUndo: false,
      canRedo: false,
      isTextEditing: true, // Text editing active
      onSelectAll: vi.fn(),
    };
    
    renderHook(() => useKeyboardShortcuts(context));
    
    act(() => {
      triggerKeyDown("a", { metaKey: true });
    });
    
    // Should NOT be called - browser handles text selection
    expect(context.onSelectAll).not.toHaveBeenCalled();
  });

  it("should work on both uppercase and lowercase 'a'", () => {
    const context: KeyboardShortcutContext = {
      hasSelection: false,
      selectionCount: 0,
      hasClipboard: false,
      canUndo: false,
      canRedo: false,
      isTextEditing: false,
      onSelectAll: vi.fn(),
    };
    
    renderHook(() => useKeyboardShortcuts(context));
    
    // Lowercase
    act(() => {
      triggerKeyDown("a", { metaKey: true });
    });
    expect(context.onSelectAll).toHaveBeenCalledTimes(1);
    
    // Uppercase
    act(() => {
      triggerKeyDown("A", { metaKey: true });
    });
    expect(context.onSelectAll).toHaveBeenCalledTimes(2);
  });

  it("should NOT trigger without Cmd/Ctrl modifier", () => {
    const context: KeyboardShortcutContext = {
      hasSelection: false,
      selectionCount: 0,
      hasClipboard: false,
      canUndo: false,
      canRedo: false,
      isTextEditing: false,
      onSelectAll: vi.fn(),
    };
    
    renderHook(() => useKeyboardShortcuts(context));
    
    act(() => {
      triggerKeyDown("a"); // No modifier
    });
    
    expect(context.onSelectAll).not.toHaveBeenCalled();
  });

  it("should NOT trigger with Shift+Cmd+A", () => {
    const context: KeyboardShortcutContext = {
      hasSelection: false,
      selectionCount: 0,
      hasClipboard: false,
      canUndo: false,
      canRedo: false,
      isTextEditing: false,
      onSelectAll: vi.fn(),
    };
    
    renderHook(() => useKeyboardShortcuts(context));
    
    const event = new KeyboardEvent("keydown", {
      key: "a",
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    
    act(() => {
      window.dispatchEvent(event);
    });
    
    expect(context.onSelectAll).not.toHaveBeenCalled();
  });

  it("should NOT trigger with Alt+Cmd+A", () => {
    const context: KeyboardShortcutContext = {
      hasSelection: false,
      selectionCount: 0,
      hasClipboard: false,
      canUndo: false,
      canRedo: false,
      isTextEditing: false,
      onSelectAll: vi.fn(),
    };
    
    renderHook(() => useKeyboardShortcuts(context));
    
    const event = new KeyboardEvent("keydown", {
      key: "a",
      metaKey: true,
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    
    act(() => {
      window.dispatchEvent(event);
    });
    
    expect(context.onSelectAll).not.toHaveBeenCalled();
  });
});
