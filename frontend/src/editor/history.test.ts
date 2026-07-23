import { describe, expect, it } from "vitest";

import { createLayerCommand } from "./commands/createLayerCommand";
import { setPropertyCommand } from "./commands/setPropertyCommand";
import { translateLayerCommand } from "./commands/translateLayerCommand";
import { getActiveArtboard } from "./commands/helpers";
import {
  HISTORY_CAP,
  canRedo,
  canUndo,
  createHistoryStack,
  deepEqual,
  dispatch,
  pushCommand,
  redo,
  undo,
  type EditorState,
} from "./history";
import type { CreativeDocument, DocumentLayer, ShapeLayer } from "./types/documentModel";

/**
 * A representative document with an unlocked rectangle and a locked logo layer
 * so both dispatch guards (non-zero-edit and locked-layer) can be exercised.
 */
function makeDoc(): CreativeDocument {
  const layers: DocumentLayer[] = [
    {
      id: "rect-1",
      role: "shapes",
      name: "Rect",
      editable: true,
      locked: false,
      visible: true,
      opacity: 100,
      kind: "rect",
      field: "shape",
      geometry: { type: "rect", x: 10, y: 20, width: 200, height: 100 },
      fill: "#FF6B00",
    },
    {
      id: "logo-1",
      role: "logo",
      name: "Logo",
      editable: false,
      locked: true,
      visible: true,
      opacity: 100,
      kind: "image",
      href: "data:image/png;base64,AAAA",
      x: 900,
      y: 40,
      width: 120,
      height: 60,
    },
  ];

  return {
    schemaVersion: 1,
    name: "Test Document",
    activePageId: "page-1",
    activeArtboardId: "artboard-1",
    pages: [
      {
        id: "page-1",
        name: "Page 1",
        artboards: [
          {
            id: "artboard-1",
            width: 1080,
            height: 1080,
            printMeta: { bleed: 3, cmykSafe: true, trimMarks: true },
            layers,
            defs: "",
            rootAttributes: { "data-printrocket": "true", "data-version": "1.0" },
          },
        ],
      },
    ],
  };
}

function clone(doc: CreativeDocument): CreativeDocument {
  return JSON.parse(JSON.stringify(doc)) as CreativeDocument;
}

function initialState(): EditorState {
  return { doc: makeDoc(), stack: createHistoryStack() };
}

function rectOf(doc: CreativeDocument): ShapeLayer {
  const artboard = getActiveArtboard(doc);
  const rect = artboard?.layers.find((l): l is ShapeLayer => l.id === "rect-1");
  if (!rect) {
    throw new Error("rect-1 missing");
  }
  return rect;
}

describe("pushCommand", () => {
  it("appends a command and clears the redo/future stack (Req 11.6)", () => {
    const stack = { past: [], future: [translateLayerCommand("rect-1", 1, 0)], cap: 50 as const };
    const next = pushCommand(stack, translateLayerCommand("rect-1", 2, 0));
    expect(next.past).toHaveLength(1);
    expect(next.future).toHaveLength(0);
  });

  it("trims to the 50-command cap, discarding the oldest (Req 4.7, 11.6)", () => {
    let stack = createHistoryStack();
    const commands = Array.from({ length: 60 }, (_unused, index) =>
      translateLayerCommand("rect-1", index + 1, 0),
    );
    commands.forEach((command) => {
      stack = pushCommand(stack, command);
    });
    expect(stack.past).toHaveLength(HISTORY_CAP);
    // Contains the last 50 in order: commands[10..59].
    expect(stack.past).toEqual(commands.slice(commands.length - HISTORY_CAP));
  });
});

describe("dispatch guards", () => {
  it("records exactly one command for a non-zero edit (Req 4.6)", () => {
    const result = dispatch(initialState(), translateLayerCommand("rect-1", 15, -7.5));
    expect(result.applied).toBe(true);
    expect(result.state.stack.past).toHaveLength(1);
    expect(rectOf(result.state.doc).geometry).toMatchObject({ x: 25, y: 12.5 });
  });

  it("drops a zero-delta (no-op) edit and records nothing (Req 4.6)", () => {
    const state = initialState();
    const result = dispatch(state, translateLayerCommand("rect-1", 0, 0));
    expect(result.applied).toBe(false);
    expect(result.state).toBe(state);
    expect(result.state.stack.past).toHaveLength(0);
  });

  it("leaves a locked layer inert and records nothing (Req 4.5)", () => {
    const state = initialState();
    const before = clone(state.doc);
    const result = dispatch(state, translateLayerCommand("logo-1", 25, 25));
    expect(result.applied).toBe(false);
    expect(result.state).toBe(state);
    expect(result.state.stack.past).toHaveLength(0);
    expect(result.state.doc).toEqual(before);
  });

  it("still applies edits to unlocked layers when a locked layer exists", () => {
    const result = dispatch(initialState(), setPropertyCommand("rect-1", "fill", "#FF6B00", "#123456"));
    expect(result.applied).toBe(true);
    expect(rectOf(result.state.doc).fill).toBe("#123456");
  });
});

describe("undo / redo transitions", () => {
  it("undo reverts the most recent command (Req 11.2)", () => {
    const start = initialState();
    const original = clone(start.doc);
    const applied = dispatch(start, translateLayerCommand("rect-1", 30, 10)).state;
    const reverted = undo(applied);
    expect(reverted.doc).toEqual(original);
    expect(canUndo(reverted.stack)).toBe(false);
    expect(canRedo(reverted.stack)).toBe(true);
  });

  it("undo is a no-op when the stack is empty (Req 11.3)", () => {
    const state = initialState();
    const result = undo(state);
    expect(result).toBe(state);
  });

  it("redo reapplies the most recently undone command (Req 11.4)", () => {
    const applied = dispatch(initialState(), translateLayerCommand("rect-1", 30, 10)).state;
    const afterApply = clone(applied.doc);
    const redone = redo(undo(applied));
    expect(redone.doc).toEqual(afterApply);
    expect(canRedo(redone.stack)).toBe(false);
  });

  it("redo is a no-op when there is nothing to redo (Req 11.5)", () => {
    const state = initialState();
    const result = redo(state);
    expect(result).toBe(state);
  });

  it("a new command after undo invalidates the redo stack (Req 11.6)", () => {
    const first = dispatch(initialState(), translateLayerCommand("rect-1", 10, 0)).state;
    const undone = undo(first);
    expect(canRedo(undone.stack)).toBe(true);
    const second = dispatch(undone, translateLayerCommand("rect-1", 0, 20)).state;
    expect(canRedo(second.stack)).toBe(false);
    expect(second.stack.past).toHaveLength(1);
  });
});

describe("deepEqual", () => {
  it("is insensitive to object key order", () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it("distinguishes differing nested values and array lengths", () => {
    expect(deepEqual({ a: [1, 2] }, { a: [1, 3] })).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });
});
