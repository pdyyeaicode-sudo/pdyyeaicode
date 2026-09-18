/**
 * Command / History core for the Creative Studio Document_Model.
 *
 * Pure, testable transition functions over an `EditorState`
 * (`{ doc: CreativeDocument; stack: HistoryStack }`). These functions are the
 * heart of the undo/redo system the design describes (design.md → "Command /
 * History System") and are consumed by the `useCreativeStudio` hook; keeping
 * them pure (no React, no hidden global state) lets the property tests in tasks
 * 3.3–3.7 exercise them directly.
 *
 * Contract:
 *  - `pushCommand` appends a command, trims to the 50-command cap (oldest
 *    discarded), and clears the redo/`future` stack (Req 4.7, 11.6).
 *  - `dispatch` applies a command through two dispatch-time guards before
 *    recording it:
 *      • non-zero-edit guard — a command whose `apply` leaves the document
 *        deep-equal records nothing (Req 4.6, 5.7, 6.4, 8.5).
 *      • locked-layer guard — a command that would alter a locked layer (e.g.
 *        logo, print-marks, or a user-locked layer) is inert and records
 *        nothing (Req 4.5, 3.8).
 *  - `undo` reverts the most recent command (no-op when empty) (Req 11.2, 11.3).
 *  - `redo` reapplies the most recently undone command (no-op when empty)
 *    (Req 11.4, 11.5).
 *
 * One responsibility per file: this module only manages history transitions.
 */

import { getActiveArtboard } from "./commands";
import type {
  Command,
  CreativeDocument,
  DocumentLayer,
  HistoryStack,
} from "./types/documentModel";

/** Maximum number of commands retained in the History_Stack (Req 4.7, 11.6). */
export const HISTORY_CAP = 50 as const;

/** The undo/redo state the dispatcher operates on. */
export interface EditorState {
  doc: CreativeDocument;
  stack: HistoryStack;
}

/** Outcome of a dispatch: the (possibly unchanged) state and whether a command was recorded. */
export interface DispatchResult {
  state: EditorState;
  applied: boolean;
}

/** Create an empty History_Stack with the fixed 50-command cap. */
export function createHistoryStack(): HistoryStack {
  return { past: [], future: [], cap: HISTORY_CAP };
}

/** Whether an undo is currently possible. */
export function canUndo(stack: HistoryStack): boolean {
  return stack.past.length > 0;
}

/** Whether a redo is currently possible. */
export function canRedo(stack: HistoryStack): boolean {
  return stack.future.length > 0;
}

/**
 * Append `command` to the stack, trim to the 50-command cap (discarding the
 * oldest), and invalidate the redo stack (Req 4.7, 11.6).
 */
export function pushCommand(stack: HistoryStack, command: Command): HistoryStack {
  const past = [...stack.past, command];
  const trimmed = past.length > stack.cap ? past.slice(past.length - stack.cap) : past;
  return { past: trimmed, future: [], cap: HISTORY_CAP };
}

/**
 * Apply `command` to `state`, enforcing the dispatch-time guards before
 * recording it. Returns the resulting state and whether the command was
 * actually applied/recorded.
 *
 * Guards (both leave `state` untouched and record nothing when triggered):
 *  1. non-zero-edit — the produced document is deep-equal to the prior one.
 *  2. locked-layer — the command would change a locked layer.
 */
export function dispatch(state: EditorState, command: Command): DispatchResult {
  const nextDoc = command.apply(state.doc);

  // Non-zero-edit guard: a no-op edit records nothing (Req 4.6, 5.7, 6.4, 8.5).
  if (deepEqual(nextDoc, state.doc)) {
    return { state, applied: false };
  }

  // Locked-layer guard: commands altering a locked layer are inert (Req 4.5, 3.8).
  if (touchesLockedLayer(state.doc, nextDoc)) {
    return { state, applied: false };
  }

  return {
    state: { doc: nextDoc, stack: pushCommand(state.stack, command) },
    applied: true,
  };
}

/**
 * Revert the most recently applied command, moving it onto the redo stack.
 * No-op (returns the same state) when there is nothing to undo (Req 11.2, 11.3).
 */
export function undo(state: EditorState): EditorState {
  const { past, future } = state.stack;
  if (past.length === 0) {
    return state;
  }
  const command = past[past.length - 1];
  const reverted = command.undo(state.doc);

  // The command factories address layers by id inside the ACTIVE artboard only.
  // If the active artboard changed since the command was recorded, `undo` can
  // silently do nothing — and previously it still consumed the step and moved
  // the command onto the redo stack, so the edit became unreachable from both
  // directions. Verify the inverse actually did something before committing.
  if (deepEqual(reverted, state.doc)) {
    logHistoryFallback(
      `undo of "${command.label}" changed nothing — the command's target is not in the active artboard. The step was kept.`,
    );
    return state;
  }

  return {
    doc: reverted,
    stack: {
      past: past.slice(0, past.length - 1),
      future: [...future, command],
      cap: HISTORY_CAP,
    },
  };
}

/**
 * Reapply the most recently undone command, moving it back onto the past stack.
 * No-op (returns the same state) when there is nothing to redo (Req 11.4, 11.5).
 */
export function redo(state: EditorState): EditorState {
  const { past, future } = state.stack;
  if (future.length === 0) {
    return state;
  }
  const command = future[future.length - 1];
  const reapplied = command.apply(state.doc);

  // Same reasoning as `undo`: a redo that changes nothing must not consume the
  // step, or the command is lost from both stacks.
  if (deepEqual(reapplied, state.doc)) {
    logHistoryFallback(
      `redo of "${command.label}" changed nothing — the command's target is not in the active artboard. The step was kept.`,
    );
    return state;
  }

  return {
    doc: reapplied,
    stack: {
      past: [...past, command],
      future: future.slice(0, future.length - 1),
      cap: HISTORY_CAP,
    },
  };
}

/** AGENTS.md: no silent fallbacks — every fallback is logged with its reason. */
function logHistoryFallback(reason: string): void {
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(`[history] ${reason}`);
  }
}

// ---------------------------------------------------------------------------
// Locked-layer detection
// ---------------------------------------------------------------------------

/**
 * Return `true` when applying a command changed any layer that was locked in
 * the prior document — including a locked layer that was removed. Because the
 * command factories are pure and do not themselves check the lock flag, this
 * dispatch-time comparison is what makes locked layers inert (Req 4.5, 3.8).
 */
function touchesLockedLayer(prevDoc: CreativeDocument, nextDoc: CreativeDocument): boolean {
  const lockedBefore = collectLockedLayers(prevDoc);
  if (lockedBefore.size === 0) {
    return false;
  }
  const after = collectLayers(nextDoc);
  for (const [id, before] of lockedBefore) {
    const current = after.get(id);
    if (!current || !deepEqual(before, current)) {
      return true;
    }
  }
  return false;
}

/** Map every layer (recursively) of the active artboard by id. */
function collectLayers(doc: CreativeDocument): Map<string, DocumentLayer> {
  const map = new Map<string, DocumentLayer>();
  const artboard = getActiveArtboard(doc);
  if (artboard) {
    walkLayers(artboard.layers, (layer) => map.set(layer.id, layer));
  }
  return map;
}

/** Map every locked layer (recursively) of the active artboard by id. */
function collectLockedLayers(doc: CreativeDocument): Map<string, DocumentLayer> {
  const map = new Map<string, DocumentLayer>();
  const artboard = getActiveArtboard(doc);
  if (artboard) {
    walkLayers(artboard.layers, (layer) => {
      if (layer.locked) {
        map.set(layer.id, layer);
      }
    });
  }
  return map;
}

function walkLayers(layers: readonly DocumentLayer[], visit: (layer: DocumentLayer) => void): void {
  for (const layer of layers) {
    visit(layer);
    if (layer.kind === "group") {
      walkLayers(layer.children, visit);
    }
  }
}

// ---------------------------------------------------------------------------
// Structural deep equality (plain JSON-shaped data only)
// ---------------------------------------------------------------------------

/**
 * Structural deep equality for the Document_Model, which is plain serializable
 * data (objects, arrays, primitives — no functions, Dates, Maps, or cycles).
 * Used by both dispatch guards; order-insensitive on object keys so values
 * rebuilt via object spreads compare equal regardless of key order.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (a === null || b === null || typeof a !== "object") {
    // Primitives that were not `===` (covers NaN, which is never equal here).
    return false;
  }

  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);
  if (aIsArray !== bIsArray) {
    return false;
  }

  if (aIsArray && bIsArray) {
    if (a.length !== b.length) {
      return false;
    }
    for (let index = 0; index < a.length; index += 1) {
      if (!deepEqual(a[index], b[index])) {
        return false;
      }
    }
    return true;
  }

  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bRecord, key)) {
      return false;
    }
    if (!deepEqual(aRecord[key], bRecord[key])) {
      return false;
    }
  }
  return true;
}
