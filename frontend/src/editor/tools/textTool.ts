/**
 * textTool — pure builders, validation, and clamping for the Text tool
 * (Req 6.1–6.8; design.md "Tools State Machine" → Text).
 *
 * This module owns ONLY the pure, testable text logic. It never touches React,
 * the DOM, timers, or any global mutable state; all debounce/throttle wiring,
 * focus handling, and on-canvas rendering belong to the editor (task 14.1) and
 * to `InlineTextEditor.tsx`. Responsibilities:
 *
 *  - Build a `<text>` `TextLayer` inside an editable group, carrying a
 *    `data-field` and `data-element-id` (Req 6.1). Content is constrained to
 *    1..500 characters.
 *  - Evaluate an inline-edit commit: a valid commit (>= 1 non-whitespace
 *    character and <= 500 characters) yields a `textEditCommand`; an empty or
 *    whitespace-only commit yields no command plus a "not applied" signal
 *    (Req 6.3, 6.4).
 *  - Clamp font size to the inclusive range 12..200 px and report whether the
 *    value was adjusted (Req 6.5, 6.6).
 *  - Provide a pure preview update for the throttled live preview; the 300ms
 *    throttle itself is wired by the editor (Req 6.7).
 *
 * Editable text is always represented as a `<text>` node and is never
 * path-traced — this module can only ever produce `kind: "text"` layers, which
 * the type system enforces (Req 6.8, AGENTS.md SVG rules).
 *
 * One responsibility per file: the pure text-tool domain logic.
 */

import { createLayerCommand } from "../commands/createLayerCommand";
import { mintId } from "../commands/helpers";
import { textEditCommand } from "../commands/textEditCommand";
import type { Command, DataRole, TextLayer } from "../types/documentModel";

// --- Bounds (Req 6.1, 6.3, 6.5, 6.6, 6.7) ------------------------------------

/** Minimum text content length, in characters (Req 6.1). */
export const TEXT_CONTENT_MIN = 1;
/** Maximum text content length, in characters (Req 6.1, 6.3). */
export const TEXT_CONTENT_MAX = 500;
/** Minimum applied font size, in px (Req 6.5, 6.6). */
export const FONT_SIZE_MIN = 12;
/** Maximum applied font size, in px (Req 6.5, 6.6). */
export const FONT_SIZE_MAX = 200;
/**
 * Maximum on-canvas preview refresh cadence, in ms (Req 6.7). The throttle
 * itself is implemented by the editor; this constant documents the contract so
 * the wiring layer and tests share a single source of truth.
 */
export const TEXT_PREVIEW_THROTTLE_MS = 300;

/** Editable roles that can host a `<text>` node (AGENTS.md Canonical_SVG). */
export type TextRole = "headline" | "body" | "cta";

const DEFAULT_TEXT_ROLE: TextRole = "body";
const DEFAULT_FONT_FAMILY = "sans-serif";
const DEFAULT_FONT_SIZE = 24; // within 12..200 (Req 6.5)
const DEFAULT_FONT_WEIGHT: TextLayer["fontWeight"] = "normal";
const DEFAULT_TEXT_ALIGN: TextLayer["textAlign"] = "left";
const DEFAULT_FILL = "#000000";

// --- Font-size clamp (Req 6.5, 6.6) ------------------------------------------

export interface FontSizeClampResult {
  /** The applied font size, clamped to the inclusive range 12..200. */
  readonly value: number;
  /** True WHEN the input was outside the range or non-finite and was adjusted. */
  readonly adjusted: boolean;
}

/**
 * Clamp a requested font size to the inclusive range 12..200 px and report
 * whether the value had to be adjusted, so the editor can surface a visible
 * indication that the value was changed (Req 6.6). `NaN` clamps to the minimum
 * bound; `Infinity`/`-Infinity` clamp to the upper/lower bound. All are
 * reported as adjusted.
 */
export function clampFontSize(requested: number): FontSizeClampResult {
  if (Number.isNaN(requested)) {
    return { value: FONT_SIZE_MIN, adjusted: true };
  }
  if (requested < FONT_SIZE_MIN) {
    return { value: FONT_SIZE_MIN, adjusted: true };
  }
  if (requested > FONT_SIZE_MAX) {
    return { value: FONT_SIZE_MAX, adjusted: true };
  }
  return { value: requested, adjusted: false };
}

// --- Content validation (Req 6.1, 6.3, 6.4) ----------------------------------

/** Why a text content value is not a valid, applicable commit. */
export type TextRejectionReason = "empty" | "too-long";

export type TextContentValidation =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: TextRejectionReason };

/**
 * Validate text content against the commit rule (Req 6.3): a value is valid
 * WHEN it contains at least one non-whitespace character AND is no longer than
 * 500 characters. Empty or whitespace-only content is rejected as `"empty"`
 * (Req 6.4); content longer than 500 characters is rejected as `"too-long"`
 * (Req 6.1).
 */
export function validateTextContent(content: string): TextContentValidation {
  if (content.trim().length < TEXT_CONTENT_MIN) {
    return { valid: false, reason: "empty" };
  }
  if (content.length > TEXT_CONTENT_MAX) {
    return { valid: false, reason: "too-long" };
  }
  return { valid: true };
}

// --- Inline-edit commit (Req 6.3, 6.4) ---------------------------------------

export type TextCommitResult =
  /** Valid, changed content → exactly one Command to record (Req 6.3). */
  | { readonly status: "applied"; readonly command: Command }
  /** Valid content identical to the prior value → a silent no-op, no Command. */
  | { readonly status: "unchanged" }
  /**
   * Empty/whitespace-only or over-length content → no Command; the editor must
   * retain the prior content and show a "not applied" indication (Req 6.4).
   */
  | { readonly status: "rejected"; readonly reason: TextRejectionReason };

/**
 * Evaluate an inline text-edit commit for the layer `layerId`, whose current
 * content is `prevText`, against the proposed `nextText`.
 *
 *  - Valid and changed → `{ status: "applied", command }` carrying a
 *    `textEditCommand` (Req 6.3). The command swaps only the string content, so
 *    the layer always remains a `<text>` node (Req 6.8).
 *  - Valid but identical to `prevText` → `{ status: "unchanged" }`: a no-op
 *    records no Command (design.md "No-op → no Command").
 *  - Empty/whitespace-only or over-length → `{ status: "rejected", reason }`:
 *    the caller retains the prior content and shows a not-applied indication
 *    and records no Command (Req 6.4).
 */
export function evaluateTextCommit(
  layerId: string,
  prevText: string,
  nextText: string,
): TextCommitResult {
  const validation = validateTextContent(nextText);
  if (!validation.valid) {
    return { status: "rejected", reason: validation.reason };
  }
  if (nextText === prevText) {
    return { status: "unchanged" };
  }
  return { status: "applied", command: textEditCommand(layerId, prevText, nextText) };
}

// --- Text layer creation (Req 6.1, 6.5, 6.6) ---------------------------------

export interface CreateTextParams {
  /** Initial text content; must be 1..500 chars with >= 1 non-whitespace char. */
  readonly content: string;
  /** Insertion baseline x in model px (snapped to the 0.5px grid). */
  readonly x: number;
  /** Insertion baseline y in model px (snapped to the 0.5px grid). */
  readonly y: number;
  /** Editable host role; defaults to `"body"`. */
  readonly role?: TextRole;
  /** `data-field`; defaults to the role name. Must be non-empty. */
  readonly field?: string;
  /** `data-element-id`; defaults to a freshly minted id. */
  readonly elementId?: string;
  /** `data-layer-id`; defaults to a freshly minted id. */
  readonly id?: string;
  /** Layers_Panel display name; defaults to the role name. */
  readonly name?: string;
  readonly fontFamily?: string;
  /** Requested font size; clamped to 12..200 (Req 6.5, 6.6). */
  readonly fontSize?: number;
  readonly fontWeight?: TextLayer["fontWeight"];
  readonly textAlign?: TextLayer["textAlign"];
  readonly fill?: string;
}

export type CreateTextResult =
  /** Built layer + the create Command to record (exactly one Command). */
  | {
      readonly status: "created";
      readonly layer: TextLayer;
      readonly command: Command;
      /** True WHEN the requested font size was clamped (Req 6.6). */
      readonly fontSizeAdjusted: boolean;
    }
  /** Content failed the 1..500 / non-whitespace constraint (Req 6.1). */
  | { readonly status: "rejected"; readonly reason: TextRejectionReason };

/**
 * Build a `<text>` `TextLayer` inside an editable group, with `data-field` and
 * `data-element-id` set and content constrained to 1..500 characters (Req 6.1),
 * together with the `createLayerCommand` that inserts it (exactly one Command,
 * design.md "Create shape / image / path"). The requested font size is clamped
 * to 12..200 (Req 6.5, 6.6). Invalid content is rejected with no layer and no
 * command. The produced layer is always `kind: "text"` and is never
 * path-traced (Req 6.8).
 */
export function createTextLayer(params: CreateTextParams): CreateTextResult {
  const validation = validateTextContent(params.content);
  if (!validation.valid) {
    return { status: "rejected", reason: validation.reason };
  }

  const role: DataRole = params.role ?? DEFAULT_TEXT_ROLE;
  const field = params.field ?? role;
  const { value: fontSize, adjusted: fontSizeAdjusted } = clampFontSize(
    params.fontSize ?? DEFAULT_FONT_SIZE,
  );

  const layer: TextLayer = {
    id: params.id ?? mintId("text"),
    role,
    name: params.name ?? role,
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "text",
    elementId: params.elementId ?? mintId("text-el"),
    field,
    content: params.content,
    x: snapToGrid(params.x),
    y: snapToGrid(params.y),
    fontFamily: params.fontFamily ?? DEFAULT_FONT_FAMILY,
    fontSize,
    fontWeight: params.fontWeight ?? DEFAULT_FONT_WEIGHT,
    textAlign: params.textAlign ?? DEFAULT_TEXT_ALIGN,
    fill: params.fill ?? DEFAULT_FILL,
  };

  return {
    status: "created",
    layer,
    command: createLayerCommand(layer),
    fontSizeAdjusted,
  };
}

// --- Live preview (Req 6.7) --------------------------------------------------

/**
 * Pure preview update used by the throttled live preview: return a copy of
 * `layer` whose content reflects the in-progress input, without producing any
 * Command. The editor calls this no more than once per
 * `TEXT_PREVIEW_THROTTLE_MS` (Req 6.7); the throttle/debounce timing lives in
 * the editor, never here. The layer stays a `<text>` node (Req 6.8).
 */
export function previewTextContent(layer: TextLayer, content: string): TextLayer {
  if (layer.content === content) {
    return layer;
  }
  return { ...layer, content };
}

// --- Internal -----------------------------------------------------------------

/** Snap to the nearest 0.5px increment (Req 5.6, AGENTS.md print-sharpness). */
function snapToGrid(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 2) / 2;
}
