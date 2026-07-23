/**
 * Pure validation helpers for the Layers_Panel (task 9.1).
 *
 * The Layers_Panel routes every mutation through `dispatchCommand`, but it must
 * reject invalid rename and opacity edits *before* a Command is built (Req 3.4,
 * 3.7, 3.10, 3.11). Keeping that validation here — free of React and of any
 * Document_Model coupling — makes the rules independently testable and reusable
 * by the Properties_Panel's matching property/opacity checks.
 *
 * One responsibility per file: this module only validates Layers_Panel inputs.
 */

/** A layer name must be 1..100 characters (Req 3.4, 3.10). */
export const LAYER_NAME_MIN_LENGTH = 1;
export const LAYER_NAME_MAX_LENGTH = 100;

/** Layer opacity is an integer percentage 0..100 (Req 3.7, 3.11). */
export const LAYER_OPACITY_MIN = 0;
export const LAYER_OPACITY_MAX = 100;

/** Discriminated result so callers branch on `ok` with a typed payload/error. */
export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

/**
 * Validate a proposed layer name. Empty / whitespace-only names and names
 * longer than 100 characters are rejected with a descriptive message; valid
 * names are returned unchanged so the original text (including significant
 * interior spacing) is stored as `data-name` (Req 3.4, 3.10).
 */
export function validateLayerName(name: string): ValidationResult<string> {
  if (name.trim().length < LAYER_NAME_MIN_LENGTH) {
    return { ok: false, error: "Name cannot be empty." };
  }
  if (name.length > LAYER_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Name must be ${LAYER_NAME_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true, value: name };
}

/**
 * Parse and validate a proposed opacity percentage entered as text. The value
 * must parse to an integer within 0..100; anything else (non-numeric,
 * fractional, or out of range) is rejected, leaving the previous value to be
 * retained by the caller (Req 3.7, 3.11).
 */
export function validateOpacityInput(raw: string): ValidationResult<number> {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || !/^[-+]?\d+$/.test(trimmed)) {
    return { ok: false, error: "Opacity must be a whole number from 0 to 100." };
  }
  return validateOpacityPercent(Number.parseInt(trimmed, 10));
}

/**
 * Validate an already-numeric opacity percentage. Non-integer or out-of-range
 * values are rejected (Req 3.11); valid values pass through unchanged.
 */
export function validateOpacityPercent(value: number): ValidationResult<number> {
  if (!Number.isInteger(value)) {
    return { ok: false, error: "Opacity must be a whole number from 0 to 100." };
  }
  if (value < LAYER_OPACITY_MIN || value > LAYER_OPACITY_MAX) {
    return {
      ok: false,
      error: `Opacity must be between ${LAYER_OPACITY_MIN} and ${LAYER_OPACITY_MAX}.`,
    };
  }
  return { ok: true, value };
}
