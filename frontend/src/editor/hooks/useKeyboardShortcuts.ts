/**
 * useKeyboardShortcuts — Comprehensive keyboard shortcut system
 * 
 * Manages 30+ keyboard shortcuts with context-aware enabling and priority system.
 * Shortcuts are disabled during text editing to prevent conflicts.
 */

/**
 * useKeyboardShortcuts — Comprehensive keyboard shortcut system
 * 
 * Manages 30+ keyboard shortcuts with context-aware enabling and priority system.
 * Shortcuts are disabled during text editing to prevent conflicts.
 */

import { useEffect } from "react";

export interface KeyboardShortcutContext {
  // Selection state
  hasSelection: boolean;
  selectionCount: number;
  
  // Clipboard state
  hasClipboard: boolean;
  
  // Undo/redo state
  canUndo: boolean;
  canRedo: boolean;
  
  // Text editing state
  isTextEditing: boolean;
  
  // Actions
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onSelectAll?: () => void;
  
  onGroup?: () => void;
  onUngroup?: () => void;
  
  onBringForward?: () => void;
  onSendBackward?: () => void;
  onBringToFront?: () => void;
  onSendToBack?: () => void;
  
  onToggleLock?: () => void;
  onToggleVisibility?: () => void;
  
  onZoomReset?: () => void;
  onZoomFit?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  
  onClearSelection?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onExitIsolation?: () => void;
  isIsolationModeActive?: boolean;
}

export function useKeyboardShortcuts(context: KeyboardShortcutContext): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      // Context detection (Task 15.5)
      let activeEl = document.activeElement;
      while (activeEl?.shadowRoot && activeEl.shadowRoot.activeElement) {
        activeEl = activeEl.shadowRoot.activeElement;
      }
      const isTextInput = 
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        activeEl?.tagName === 'SELECT' ||
        activeEl?.getAttribute('contenteditable') === 'true' ||
        (activeEl instanceof HTMLElement && activeEl.isContentEditable) ||
        activeEl?.closest("input, textarea, select, [contenteditable='true'], [role='textbox']") !== null;

      const isModalOpen = document.querySelector('[role="dialog"]') !== null;
      const isMenuOpen = document.querySelector('[role="menu"]') !== null;
      const meta = event.metaKey || event.ctrlKey;
      const shift = event.shiftKey;
      const alt = event.altKey;
      
      // Priority 1: Text input - editor shortcuts must never hijack native text
      // editing behaviour (including Ctrl/Cmd combinations such as copy and undo).
      // Escape is intentionally handled below so an editor can still dismiss its
      // current selection or isolation state.
      if ((isTextInput || context.isTextEditing) && event.key !== 'Escape') {
        return;
      }

      // Priority 2: Modal/Menu - only Escape and navigation
      if (isModalOpen || isMenuOpen) {
        if (event.key === 'Escape') {
          // In a real app we might close them here, but we let their own listeners handle it
          return;
        }
        if (event.key === 'Tab') {
          return; // Let focus trap handle it
        }
        // Block other shortcuts
        if (!isTextInput) return;
      }

      // Priority 3: Isolation mode - Escape exits first
      if (event.key === "Escape") {
        event.preventDefault();
        
        if (context.isIsolationModeActive) {
          context.onExitIsolation?.();
          return;
        }
        
        context.onClearSelection?.();
        return;
      }

      // Meta-only shortcuts
      if (meta && !shift && !alt) {
        switch (event.key.toLowerCase()) {
          case "z":
            event.preventDefault();
            context.onUndo?.();
            return;
          
          case "y":
            event.preventDefault();
            context.onRedo?.();
            return;
          
          case "c":
            if (context.hasSelection) {
              event.preventDefault();
              context.onCopy?.();
            }
            return;
          
          case "x":
            if (context.hasSelection) {
              event.preventDefault();
              context.onCut?.();
            }
            return;
          
          case "v":
            if (context.hasClipboard) {
              event.preventDefault();
              context.onPaste?.();
            }
            return;
          
          case "d":
            if (context.hasSelection) {
              event.preventDefault();
              context.onDuplicate?.();
            }
            return;
          
          case "a":
            event.preventDefault();
            context.onSelectAll?.();
            return;
          
          case "g":
            if (context.selectionCount >= 2) {
              event.preventDefault();
              context.onGroup?.();
            }
            return;
          
          case "l":
            if (context.hasSelection) {
              event.preventDefault();
              context.onToggleLock?.();
            }
            return;
          
          case "]":
            if (context.hasSelection) {
              event.preventDefault();
              context.onBringForward?.();
            }
            return;
          
          case "[":
            if (context.hasSelection) {
              event.preventDefault();
              context.onSendBackward?.();
            }
            return;
          
          case "0":
            event.preventDefault();
            context.onZoomReset?.();
            return;
          
          case "1":
            event.preventDefault();
            context.onZoomFit?.();
            return;
          
          case "=":
          case "+":
            event.preventDefault();
            context.onZoomIn?.();
            return;
          
          case "-":
          case "_":
            event.preventDefault();
            context.onZoomOut?.();
            return;
        }
      }

      // Meta+Shift shortcuts
      if (meta && shift && !alt) {
        switch (event.key.toLowerCase()) {
          case "z":
            // Cmd/Ctrl+Shift+Z is redo on Mac
            event.preventDefault();
            context.onRedo?.();
            return;
          
          case "g":
            if (context.hasSelection) {
              event.preventDefault();
              context.onUngroup?.();
            }
            return;
          
          case "h":
            if (context.hasSelection) {
              event.preventDefault();
              context.onToggleVisibility?.();
            }
            return;
          
          case "]":
            if (context.hasSelection) {
              event.preventDefault();
              context.onBringToFront?.();
            }
            return;
          
          case "[":
            if (context.hasSelection) {
              event.preventDefault();
              context.onSendToBack?.();
            }
            return;
        }
      }

      // Delete/Backspace (no modifiers)
      if (!meta && !shift && !alt) {
        if (event.key === "Delete" || event.key === "Backspace") {
          if (context.hasSelection) {
            event.preventDefault();
            context.onDelete?.();
          }
          return;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [context]);
}
