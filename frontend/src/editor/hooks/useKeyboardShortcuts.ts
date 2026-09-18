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

  onAddText?: () => void;
  onAddRectangle?: () => void;
  onAddCircle?: () => void;
  onAddLine?: () => void;
}

export function useKeyboardShortcuts(context: KeyboardShortcutContext): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
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
      
      if ((isTextInput || context.isTextEditing) && event.key !== 'Escape') {
        return;
      }

      if (isModalOpen || isMenuOpen) {
        if (event.key === 'Escape') {
          return;
        }
        if (event.key === 'Tab') {
          return;
        }
        if (!isTextInput) return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        
        if (context.isIsolationModeActive) {
          context.onExitIsolation?.();
          return;
        }
        
        context.onClearSelection?.();
        return;
      }

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

      if (meta && shift && !alt) {
        switch (event.key.toLowerCase()) {
          case "z":
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

      // No modifiers (T, R, C, L, Delete, Backspace)
      if (!meta && !shift && !alt) {
        if (event.key === "Delete" || event.key === "Backspace") {
          if (context.hasSelection) {
            event.preventDefault();
            context.onDelete?.();
          }
          return;
        }

        switch (event.key.toLowerCase()) {
          case "t":
            event.preventDefault();
            context.onAddText?.();
            return;
          case "r":
            event.preventDefault();
            context.onAddRectangle?.();
            return;
          case "c":
            event.preventDefault();
            context.onAddCircle?.();
            return;
          case "l":
            event.preventDefault();
            context.onAddLine?.();
            return;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [context]);
}
