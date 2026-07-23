/**
 * useKeyboardShortcuts.integration.test.tsx — Integration tests for keyboard shortcuts
 * 
 * Tests keyboard shortcuts in realistic user workflows with actual document state.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeyboardShortcuts, type KeyboardShortcutContext } from "./useKeyboardShortcuts";

describe("useKeyboardShortcuts Integration", () => {
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

  describe("Copy-Paste Workflow", () => {
    it("should complete copy-paste workflow", () => {
      const clipboard: string[] = [];
      const layers = ["layer1", "layer2"];
      
      const context: KeyboardShortcutContext = {
        hasSelection: true,
        selectionCount: 2,
        hasClipboard: false,
        canUndo: false,
        canRedo: false,
        isTextEditing: false,
        
        onCopy: vi.fn(() => {
          clipboard.push(...layers);
          context.hasClipboard = true;
        }),
        onPaste: vi.fn(() => {
          expect(clipboard.length).toBe(2);
        }),
      };
      
      renderHook(() => useKeyboardShortcuts(context));
      
      // Copy
      act(() => {
        triggerKeyDown("c", { metaKey: true });
      });
      expect(context.onCopy).toHaveBeenCalledTimes(1);
      expect(clipboard).toEqual(["layer1", "layer2"]);
      
      // Paste
      act(() => {
        triggerKeyDown("v", { metaKey: true });
      });
      expect(context.onPaste).toHaveBeenCalledTimes(1);
    });

    it("should complete cut-paste workflow", () => {
      const clipboard: string[] = [];
      let layers = ["layer1", "layer2", "layer3"];
      
      const context: KeyboardShortcutContext = {
        hasSelection: true,
        selectionCount: 2,
        hasClipboard: false,
        canUndo: false,
        canRedo: false,
        isTextEditing: false,
        
        onCut: vi.fn(() => {
          clipboard.push("layer1", "layer2");
          layers = layers.filter(l => !["layer1", "layer2"].includes(l));
          context.hasClipboard = true;
          context.hasSelection = false;
        }),
        onPaste: vi.fn(() => {
          layers.push(...clipboard);
          context.hasSelection = true;
        }),
      };
      
      renderHook(() => useKeyboardShortcuts(context));
      
      // Cut
      act(() => {
        triggerKeyDown("x", { metaKey: true });
      });
      expect(context.onCut).toHaveBeenCalledTimes(1);
      expect(layers).toEqual(["layer3"]);
      expect(clipboard).toEqual(["layer1", "layer2"]);
      
      // Paste
      act(() => {
        triggerKeyDown("v", { metaKey: true });
      });
      expect(context.onPaste).toHaveBeenCalledTimes(1);
      expect(layers).toEqual(["layer3", "layer1", "layer2"]);
    });
  });

  describe("Undo-Redo Workflow", () => {
    it("should complete undo-redo sequence", () => {
      const historyStack: string[] = [];
      const redoStack: string[] = [];
      
      const context: KeyboardShortcutContext = {
        hasSelection: true,
        selectionCount: 1,
        hasClipboard: false,
        canUndo: false,
        canRedo: false,
        isTextEditing: false,
        
        onUndo: vi.fn(() => {
          if (historyStack.length > 0) {
            const action = historyStack.pop()!;
            redoStack.push(action);
            context.canUndo = historyStack.length > 0;
            context.canRedo = true;
          }
        }),
        onRedo: vi.fn(() => {
          if (redoStack.length > 0) {
            const action = redoStack.pop()!;
            historyStack.push(action);
            context.canRedo = redoStack.length > 0;
            context.canUndo = true;
          }
        }),
      };
      
      renderHook(() => useKeyboardShortcuts(context));
      
      // Simulate some actions
      historyStack.push("action1", "action2", "action3");
      context.canUndo = true;
      
      // Undo twice
      act(() => {
        triggerKeyDown("z", { metaKey: true });
      });
      act(() => {
        triggerKeyDown("z", { metaKey: true });
      });
      
      expect(context.onUndo).toHaveBeenCalledTimes(2);
      expect(historyStack).toEqual(["action1"]);
      expect(redoStack).toEqual(["action3", "action2"]);
      
      // Redo once
      act(() => {
        triggerKeyDown("y", { metaKey: true });
      });
      
      expect(context.onRedo).toHaveBeenCalledTimes(1);
      expect(historyStack).toEqual(["action1", "action2"]);
      expect(redoStack).toEqual(["action3"]);
    });
  });

  describe("Multi-Selection Workflow", () => {
    it("should handle select-all, group, and ungroup", () => {
      let layers = ["layer1", "layer2", "layer3"];
      let selection: string[] = [];
      
      const context: KeyboardShortcutContext = {
        hasSelection: false,
        selectionCount: 0,
        hasClipboard: false,
        canUndo: false,
        canRedo: false,
        isTextEditing: false,
        
        onSelectAll: vi.fn(() => {
          selection = [...layers];
          context.hasSelection = true;
          context.selectionCount = selection.length;
        }),
        onGroup: vi.fn(() => {
          const groupId = "group1";
          layers = layers.filter(l => !selection.includes(l));
          layers.push(groupId);
          selection = [groupId];
          context.selectionCount = 1;
        }),
        onUngroup: vi.fn(() => {
          if (selection[0] === "group1") {
            layers = layers.filter(l => l !== "group1");
            layers.push("layer1", "layer2", "layer3");
            selection = ["layer1", "layer2", "layer3"];
            context.selectionCount = 3;
          }
        }),
      };
      
      renderHook(() => useKeyboardShortcuts(context));
      
      // Select all
      act(() => {
        triggerKeyDown("a", { metaKey: true });
      });
      expect(context.onSelectAll).toHaveBeenCalledTimes(1);
      expect(selection).toEqual(["layer1", "layer2", "layer3"]);
      
      // Group
      act(() => {
        triggerKeyDown("g", { metaKey: true });
      });
      expect(context.onGroup).toHaveBeenCalledTimes(1);
      expect(layers).toEqual(["group1"]);
      
      // Ungroup
      act(() => {
        triggerKeyDown("g", { metaKey: true, shiftKey: true });
      });
      expect(context.onUngroup).toHaveBeenCalledTimes(1);
      expect(layers).toContain("layer1");
      expect(layers).toContain("layer2");
      expect(layers).toContain("layer3");
    });
  });

  describe("Z-Order Workflow", () => {
    it("should reorder layers using z-order shortcuts", () => {
      const layers = ["layer1", "layer2", "layer3", "layer4"];
      const selectedLayer = "layer2";
      
      const context: KeyboardShortcutContext = {
        hasSelection: true,
        selectionCount: 1,
        hasClipboard: false,
        canUndo: false,
        canRedo: false,
        isTextEditing: false,
        
        onBringForward: vi.fn(() => {
          const idx = layers.indexOf(selectedLayer);
          if (idx < layers.length - 1) {
            [layers[idx], layers[idx + 1]] = [layers[idx + 1], layers[idx]];
          }
        }),
        onSendBackward: vi.fn(() => {
          const idx = layers.indexOf(selectedLayer);
          if (idx > 0) {
            [layers[idx], layers[idx - 1]] = [layers[idx - 1], layers[idx]];
          }
        }),
        onBringToFront: vi.fn(() => {
          const idx = layers.indexOf(selectedLayer);
          layers.splice(idx, 1);
          layers.push(selectedLayer);
        }),
        onSendToBack: vi.fn(() => {
          const idx = layers.indexOf(selectedLayer);
          layers.splice(idx, 1);
          layers.unshift(selectedLayer);
        }),
      };
      
      renderHook(() => useKeyboardShortcuts(context));
      
      // Initial: ["layer1", "layer2", "layer3", "layer4"]
      expect(layers.indexOf("layer2")).toBe(1);
      
      // Bring forward: ["layer1", "layer3", "layer2", "layer4"]
      act(() => {
        triggerKeyDown("]", { metaKey: true });
      });
      expect(context.onBringForward).toHaveBeenCalledTimes(1);
      expect(layers.indexOf("layer2")).toBe(2);
      
      // Send backward: ["layer1", "layer2", "layer3", "layer4"]
      act(() => {
        triggerKeyDown("[", { metaKey: true });
      });
      expect(context.onSendBackward).toHaveBeenCalledTimes(1);
      expect(layers.indexOf("layer2")).toBe(1);
      
      // Bring to front: ["layer1", "layer3", "layer4", "layer2"]
      act(() => {
        triggerKeyDown("]", { metaKey: true, shiftKey: true });
      });
      expect(context.onBringToFront).toHaveBeenCalledTimes(1);
      expect(layers.indexOf("layer2")).toBe(3);
      
      // Send to back: ["layer2", "layer1", "layer3", "layer4"]
      act(() => {
        triggerKeyDown("[", { metaKey: true, shiftKey: true });
      });
      expect(context.onSendToBack).toHaveBeenCalledTimes(1);
      expect(layers.indexOf("layer2")).toBe(0);
    });
  });

  describe("Text Editing Mode", () => {
    it("should switch between canvas and text editing modes", () => {
      let isTextEditing = false;
      let selection: string[] = ["layer1"];
      
      const context: KeyboardShortcutContext = {
        hasSelection: true,
        selectionCount: 1,
        hasClipboard: false,
        canUndo: false,
        canRedo: false,
        isTextEditing: false,
        
        onCopy: vi.fn(),
        onClearSelection: vi.fn(() => {
          selection = [];
          context.hasSelection = false;
          context.selectionCount = 0;
          isTextEditing = false;
          context.isTextEditing = false;
        }),
      };
      
      renderHook(() => useKeyboardShortcuts(context));
      
      // Canvas mode: Copy should work
      act(() => {
        triggerKeyDown("c", { metaKey: true });
      });
      expect(context.onCopy).toHaveBeenCalledTimes(1);
      
      // Enter text editing mode
      isTextEditing = true;
      context.isTextEditing = true;
      
      // Text mode: Copy should NOT work (browser handles it)
      act(() => {
        triggerKeyDown("c", { metaKey: true });
      });
      expect(context.onCopy).toHaveBeenCalledTimes(1); // Still 1, not 2
      
      // Escape should exit text mode
      act(() => {
        triggerKeyDown("Escape");
      });
      expect(context.onClearSelection).toHaveBeenCalledTimes(1);
      expect(isTextEditing).toBe(false);
      
      // Back to canvas mode: Copy should work again
      selection = ["layer1"];
      context.hasSelection = true;
      act(() => {
        triggerKeyDown("c", { metaKey: true });
      });
      expect(context.onCopy).toHaveBeenCalledTimes(2);
    });
  });

  describe("Duplicate and Delete Workflow", () => {
    it("should duplicate and delete layers", () => {
      let layers = ["layer1", "layer2"];
      const selection = ["layer1"];
      
      const context: KeyboardShortcutContext = {
        hasSelection: true,
        selectionCount: 1,
        hasClipboard: false,
        canUndo: false,
        canRedo: false,
        isTextEditing: false,
        
        onDuplicate: vi.fn(() => {
          layers.push("layer1-copy");
          context.selectionCount = 1;
        }),
        onDelete: vi.fn(() => {
          layers = layers.filter(l => !selection.includes(l));
          context.hasSelection = false;
          context.selectionCount = 0;
        }),
      };
      
      renderHook(() => useKeyboardShortcuts(context));
      
      // Duplicate
      act(() => {
        triggerKeyDown("d", { metaKey: true });
      });
      expect(context.onDuplicate).toHaveBeenCalledTimes(1);
      expect(layers).toEqual(["layer1", "layer2", "layer1-copy"]);
      
      // Delete
      act(() => {
        triggerKeyDown("Delete");
      });
      expect(context.onDelete).toHaveBeenCalledTimes(1);
      expect(layers).toEqual(["layer2", "layer1-copy"]);
    });
  });
});
