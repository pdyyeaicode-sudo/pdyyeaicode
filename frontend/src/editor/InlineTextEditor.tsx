"use client";

/**
 * InlineTextEditor — a small, standalone inline text input for editing an
 * on-canvas `<text>` layer (Req 6.2, 6.3, 6.4, 6.7).
 *
 * This component is intentionally self-contained and unmounted by default: it
 * is NOT imported by the editor shell yet. Final mounting/positioning and the
 * double-click trigger are wired in task 14.1. It owns no global state and
 * defers ALL validation/commit decisions to the pure `textTool` helpers, so the
 * editing rules live in exactly one tested place.
 *
 * Behavior:
 *  - Pre-populates with the element's current content (Req 6.2). The caller is
 *    responsible for mounting it within 200ms of the double-click.
 *  - Commits on Ctrl/Cmd+Enter or blur. Enter inserts a new line so paragraph
 *    text remains editable. A valid commit (>= 1 non-whitespace char, <= 500
 *    chars) calls `onCommit`; an empty/whitespace-only or over-length commit
 *    calls `onRejected` with a reason and a not-applied message so the editor
 *    can show a visible indication, and records no edit (Req 6.3, 6.4).
 *  - Escape cancels with no commit.
 *  - While typing, it reports the in-progress value through `onPreview` no more
 *    than once per `TEXT_PREVIEW_THROTTLE_MS` (Req 6.7); the actual `<text>`
 *    repaint is performed by the editor.
 *
 * One responsibility per file: the inline text-edit input UI.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, KeyboardEvent } from "react";

import {
  TEXT_CONTENT_MAX,
  TEXT_PREVIEW_THROTTLE_MS,
  validateTextContent,
  type TextRejectionReason,
} from "./tools/textTool";

/** Human-readable "not applied" messages keyed by rejection reason (Req 6.4). */
const REJECTION_MESSAGE: Record<TextRejectionReason, string> = {
  empty: "Text not applied: enter at least one non-whitespace character.",
  "too-long": `Text not applied: keep it to ${TEXT_CONTENT_MAX} characters or fewer.`,
};

export interface InlineTextEditorProps {
  /** Current content of the text element, used to pre-populate the input. */
  readonly initialContent: string;
  /** Called with the committed text WHEN the commit is valid (Req 6.3). */
  readonly onCommit: (nextContent: string) => void;
  /**
   * Called WHEN a commit is rejected (empty/whitespace-only or over-length),
   * with the reason and a ready-to-show not-applied message (Req 6.4).
   */
  readonly onRejected?: (reason: TextRejectionReason, message: string) => void;
  /** Called when the user cancels with Escape (no commit). */
  readonly onCancel?: () => void;
  /**
   * Throttled in-progress value for the live `<text>` preview (Req 6.7),
   * emitted at most once per `TEXT_PREVIEW_THROTTLE_MS`.
   */
  readonly onPreview?: (content: string) => void;
  /** Optional absolute positioning style applied by the editor when mounting. */
  readonly style?: CSSProperties;
}

export function InlineTextEditor({
  initialContent,
  onCommit,
  onRejected,
  onCancel,
  onPreview,
  style,
}: InlineTextEditorProps): JSX.Element {
  const [value, setValue] = useState<string>(initialContent);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const committedRef = useRef<boolean>(false);

  // Throttle bookkeeping for the live preview (Req 6.7). Timing lives here in
  // the UI layer, never in the pure textTool module.
  const lastPreviewAtRef = useRef<number>(0);
  const pendingPreviewRef = useRef<number | null>(null);

  // A persistent stage can switch layers without unmounting the editor. Make
  // each layer's edit session start from that layer's actual text and accept a
  // new commit even after the previous session has finished.
  useEffect(() => {
    setValue(initialContent);
    committedRef.current = false;
  }, [initialContent]);

  // Focus and select-all so the pre-populated content is immediately editable.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.select();
    }
    return () => {
      if (pendingPreviewRef.current !== null) {
        window.clearTimeout(pendingPreviewRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    input.style.height = "auto";
    input.style.height = `${Math.max(input.scrollHeight, input.offsetHeight)}px`;
  }, [value]);

  const emitPreview = useCallback(
    (next: string) => {
      if (!onPreview) {
        return;
      }
      const now = Date.now();
      const elapsed = now - lastPreviewAtRef.current;
      if (elapsed >= TEXT_PREVIEW_THROTTLE_MS) {
        lastPreviewAtRef.current = now;
        onPreview(next);
        return;
      }
      if (pendingPreviewRef.current !== null) {
        window.clearTimeout(pendingPreviewRef.current);
      }
      pendingPreviewRef.current = window.setTimeout(() => {
        lastPreviewAtRef.current = Date.now();
        pendingPreviewRef.current = null;
        onPreview(next);
      }, TEXT_PREVIEW_THROTTLE_MS - elapsed);
    },
    [onPreview],
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const next = event.target.value;
      setValue(next);
      emitPreview(next);
    },
    [emitPreview],
  );

  const commit = useCallback(() => {
    if (committedRef.current) {
      return;
    }
    committedRef.current = true;
    const validation = validateTextContent(value);
    if (validation.valid) {
      onCommit(value);
      return;
    }
    onRejected?.(validation.reason, REJECTION_MESSAGE[validation.reason]);
  }, [onCommit, onRejected, value]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      // Keep every editing keystroke inside the textarea. Canvas tools such as
      // Pen and Frame register window-level shortcuts, which must not consume
      // text input, spaces, Enter, or modifier combinations.
      event.stopPropagation();
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        commit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        committedRef.current = true;
        onCancel?.();
      }
    },
    [commit, onCancel],
  );

  return (
    <textarea
      ref={inputRef}
      value={value}
      maxLength={TEXT_CONTENT_MAX}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={commit}
      aria-label="Edit text"
      style={{
        ...style,
        height: "auto",
        minHeight: style?.height,
        resize: "none",
        overflow: "hidden",
        whiteSpace: "pre-wrap",
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}
