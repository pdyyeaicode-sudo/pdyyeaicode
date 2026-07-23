import { describe, expect, it } from "vitest";

import type {
  Artboard,
  CreativeDocument,
  Page,
  TextLayer,
} from "../types/documentModel";
import {
  clampFontSize,
  createTextLayer,
  evaluateTextCommit,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  previewTextContent,
  TEXT_CONTENT_MAX,
  validateTextContent,
} from "./textTool";

/**
 * Example unit tests for the pure text-tool logic: font-size clamping
 * (Req 6.5, 6.6), content validation (Req 6.1, 6.3, 6.4), commit evaluation
 * (Req 6.3, 6.4), `<text>` layer creation (Req 6.1, 6.8), and the throttle-
 * friendly preview update (Req 6.7). Property-based coverage lands in the
 * dedicated tasks (7.8, 7.9).
 */

function makeTextLayer(overrides: Partial<TextLayer> = {}): TextLayer {
  return {
    id: "text-1",
    role: "body",
    name: "body",
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "text",
    elementId: "text-el-1",
    field: "body",
    content: "Hello",
    x: 40,
    y: 60,
    fontFamily: "sans-serif",
    fontSize: 24,
    fontWeight: "normal",
    textAlign: "left",
    fill: "#000000",
    ...overrides,
  };
}

function makeDoc(layer: TextLayer): CreativeDocument {
  const artboard: Artboard = {
    id: "ab-1",
    width: 1080,
    height: 1080,
    printMeta: { bleed: 3, cmykSafe: true, trimMarks: true },
    layers: [layer],
    defs: "",
    rootAttributes: {},
  };
  const page: Page = { id: "page-1", name: "Page 1", artboards: [artboard] };
  return {
    schemaVersion: 1,
    name: "Doc",
    pages: [page],
    activePageId: "page-1",
    activeArtboardId: "ab-1",
  };
}

describe("clampFontSize (Req 6.5, 6.6)", () => {
  it("leaves in-range values untouched", () => {
    expect(clampFontSize(24)).toEqual({ value: 24, adjusted: false });
    expect(clampFontSize(FONT_SIZE_MIN)).toEqual({ value: FONT_SIZE_MIN, adjusted: false });
    expect(clampFontSize(FONT_SIZE_MAX)).toEqual({ value: FONT_SIZE_MAX, adjusted: false });
  });

  it("clamps below the minimum and reports adjustment", () => {
    expect(clampFontSize(4)).toEqual({ value: FONT_SIZE_MIN, adjusted: true });
  });

  it("clamps above the maximum and reports adjustment", () => {
    expect(clampFontSize(640)).toEqual({ value: FONT_SIZE_MAX, adjusted: true });
  });

  it("clamps non-finite input to the minimum bound", () => {
    expect(clampFontSize(Number.NaN)).toEqual({ value: FONT_SIZE_MIN, adjusted: true });
    expect(clampFontSize(Number.POSITIVE_INFINITY)).toEqual({
      value: FONT_SIZE_MAX,
      adjusted: true,
    });
  });
});

describe("validateTextContent (Req 6.1, 6.3, 6.4)", () => {
  it("accepts content with at least one non-whitespace char within 500", () => {
    expect(validateTextContent("Hi")).toEqual({ valid: true });
    expect(validateTextContent("a".repeat(TEXT_CONTENT_MAX))).toEqual({ valid: true });
  });

  it("rejects empty and whitespace-only content as empty", () => {
    expect(validateTextContent("")).toEqual({ valid: false, reason: "empty" });
    expect(validateTextContent("   \t\n ")).toEqual({ valid: false, reason: "empty" });
  });

  it("rejects content longer than 500 characters", () => {
    expect(validateTextContent("a".repeat(TEXT_CONTENT_MAX + 1))).toEqual({
      valid: false,
      reason: "too-long",
    });
  });
});

describe("evaluateTextCommit (Req 6.3, 6.4)", () => {
  it("produces an applied command that updates content for a valid change", () => {
    const result = evaluateTextCommit("text-1", "Hello", "Goodbye");
    expect(result.status).toBe("applied");
    if (result.status !== "applied") {
      throw new Error("expected applied");
    }
    const doc = makeDoc(makeTextLayer({ content: "Hello" }));
    const next = result.command.apply(doc);
    expect((next.pages[0].artboards[0].layers[0] as TextLayer).content).toBe("Goodbye");
    // undo restores prior content exactly.
    const reverted = result.command.undo(next);
    expect((reverted.pages[0].artboards[0].layers[0] as TextLayer).content).toBe("Hello");
  });

  it("rejects an empty/whitespace commit with no command (Req 6.4)", () => {
    expect(evaluateTextCommit("text-1", "Hello", "   ")).toEqual({
      status: "rejected",
      reason: "empty",
    });
  });

  it("rejects an over-length commit with no command", () => {
    expect(evaluateTextCommit("text-1", "Hello", "a".repeat(TEXT_CONTENT_MAX + 1))).toEqual({
      status: "rejected",
      reason: "too-long",
    });
  });

  it("treats an unchanged valid commit as a silent no-op", () => {
    expect(evaluateTextCommit("text-1", "Hello", "Hello")).toEqual({ status: "unchanged" });
  });
});

describe("createTextLayer (Req 6.1, 6.5, 6.6, 6.8)", () => {
  it("builds an editable <text> layer with field and element id", () => {
    const result = createTextLayer({ content: "Sale", x: 10.3, y: 20.7, id: "t-1", elementId: "e-1" });
    expect(result.status).toBe("created");
    if (result.status !== "created") {
      throw new Error("expected created");
    }
    expect(result.layer.kind).toBe("text"); // never path-traced (Req 6.8)
    expect(result.layer.editable).toBe(true);
    expect(result.layer.field).toBe("body");
    expect(result.layer.elementId).toBe("e-1");
    expect(result.layer.content).toBe("Sale");
    // coordinates snapped to the 0.5px grid.
    expect(result.layer.x).toBe(10.5);
    expect(result.layer.y).toBe(20.5);
  });

  it("clamps the requested font size and reports adjustment (Req 6.6)", () => {
    const result = createTextLayer({ content: "Big", x: 0, y: 0, fontSize: 999 });
    expect(result.status).toBe("created");
    if (result.status !== "created") {
      throw new Error("expected created");
    }
    expect(result.layer.fontSize).toBe(FONT_SIZE_MAX);
    expect(result.fontSizeAdjusted).toBe(true);
  });

  it("records exactly one create command that inserts the layer", () => {
    const result = createTextLayer({ content: "Hi", x: 0, y: 0, id: "t-2", elementId: "e-2" });
    if (result.status !== "created") {
      throw new Error("expected created");
    }
    const doc = makeDoc(makeTextLayer({ id: "existing" }));
    const next = result.command.apply(doc);
    expect(next.pages[0].artboards[0].layers).toHaveLength(2);
    const reverted = result.command.undo(next);
    expect(reverted.pages[0].artboards[0].layers).toHaveLength(1);
  });

  it("rejects invalid content with no layer (Req 6.1)", () => {
    expect(createTextLayer({ content: "   ", x: 0, y: 0 })).toEqual({
      status: "rejected",
      reason: "empty",
    });
  });
});

describe("previewTextContent (Req 6.7, 6.8)", () => {
  it("returns a text layer with updated content and never changes kind", () => {
    const layer = makeTextLayer({ content: "old" });
    const next = previewTextContent(layer, "new");
    expect(next.kind).toBe("text");
    expect(next.content).toBe("new");
    expect(layer.content).toBe("old"); // original is untouched (pure)
  });

  it("returns the same reference when content is unchanged", () => {
    const layer = makeTextLayer({ content: "same" });
    expect(previewTextContent(layer, "same")).toBe(layer);
  });
});
