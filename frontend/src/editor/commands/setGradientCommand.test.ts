/**
 * Tests for the gradient command.
 *
 * A gradient edit touches two places — the artboard `<defs>` and the layer's fill
 * — so the properties that matter are that both move together and that undo is an
 * exact inverse. A half-undone state would leave a fill pointing at a definition
 * that no longer exists, which renders as nothing and looks like a bug.
 */

import { describe, expect, it } from "vitest";

import { clearGradientCommand, setGradientCommand } from "./setGradientCommand";
import { createGradient, gradientIdFromFill } from "../gradients/gradientModel";
import type { CreativeDocument, ShapeLayer } from "../types/documentModel";

function makeShape(overrides: Partial<ShapeLayer> = {}): ShapeLayer {
  return {
    id: "shape-1",
    role: "shapes",
    name: "shape-1",
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "rect",
    field: "shape",
    geometry: { type: "rect", x: 0, y: 0, width: 10, height: 10 },
    fill: "#ff0000",
    ...overrides,
  };
}

function makeDoc(defs = "", layer = makeShape()): CreativeDocument {
  return {
    schemaVersion: 1,
    name: "test",
    activePageId: "page-1",
    activeArtboardId: "artboard-1",
    pages: [
      {
        id: "page-1",
        name: "Page 1",
        artboards: [
          {
            id: "artboard-1",
            width: 100,
            height: 100,
            printMeta: { bleed: 3, cmykSafe: true, trimMarks: true },
            layers: [layer],
            defs,
            rootAttributes: {},
          },
        ],
      },
    ],
  };
}

function artboardOf(doc: CreativeDocument) {
  return doc.pages[0].artboards[0];
}

function fillOf(doc: CreativeDocument): string | undefined {
  return (artboardOf(doc).layers[0] as ShapeLayer).fill;
}

describe("setGradientCommand", () => {
  it("writes the defs entry and the fill reference in one step", () => {
    const doc = makeDoc();
    const gradient = createGradient("grad-shape-1");
    const command = setGradientCommand("shape-1", gradient, {
      defs: artboardOf(doc).defs,
      paint: fillOf(doc),
    });

    const applied = command.apply(doc);

    expect(fillOf(applied)).toBe("url(#grad-shape-1)");
    expect(artboardOf(applied).defs).toContain('id="grad-shape-1"');
    expect(artboardOf(applied).defs).toContain("<linearGradient");
  });

  it("undoes to the exact previous fill and defs", () => {
    const doc = makeDoc('<filter id="f1"></filter>');
    const previous = { defs: artboardOf(doc).defs, paint: fillOf(doc) };
    const command = setGradientCommand("shape-1", createGradient("grad-shape-1"), previous);

    const reverted = command.undo(command.apply(doc));

    expect(fillOf(reverted)).toBe("#ff0000");
    expect(artboardOf(reverted).defs).toBe('<filter id="f1"></filter>');
  });

  it("restores the previous gradient when one replaces another", () => {
    const doc = makeDoc();
    const first = setGradientCommand("shape-1", createGradient("grad-shape-1", "linear"), {
      defs: artboardOf(doc).defs,
      paint: fillOf(doc),
    }).apply(doc);

    // Replacing a gradient must restore the ORIGINAL definition on undo, not
    // merely remove the new one — that is why the command snapshots the whole
    // defs string rather than reversing its own edit.
    const second = setGradientCommand("shape-1", createGradient("grad-shape-1", "radial"), {
      defs: artboardOf(first).defs,
      paint: fillOf(first),
    });
    const applied = second.apply(first);
    expect(artboardOf(applied).defs).toContain("<radialGradient");

    const reverted = second.undo(applied);
    expect(artboardOf(reverted).defs).toContain("<linearGradient");
    expect(artboardOf(reverted).defs).not.toContain("<radialGradient");
  });

  it("preserves unrelated defs content across apply and undo", () => {
    const other = "<style>@font-face{font-family:X}</style>";
    const doc = makeDoc(other);
    const command = setGradientCommand("shape-1", createGradient("grad-shape-1"), {
      defs: other,
      paint: fillOf(doc),
    });

    const applied = command.apply(doc);
    expect(artboardOf(applied).defs).toContain("<style>");
    expect(artboardOf(command.undo(applied)).defs).toBe(other);
  });

  it("leaves other artboards alone", () => {
    const doc = makeDoc();
    const twoArtboards: CreativeDocument = {
      ...doc,
      pages: [
        {
          ...doc.pages[0],
          artboards: [
            doc.pages[0].artboards[0],
            { ...doc.pages[0].artboards[0], id: "artboard-2", defs: "untouched" },
          ],
        },
      ],
    };

    const applied = setGradientCommand("shape-1", createGradient("g"), {
      defs: "",
      paint: "#ff0000",
    }).apply(twoArtboards);

    expect(applied.pages[0].artboards[1].defs).toBe("untouched");
  });
});

describe("clearGradientCommand", () => {
  it("removes the definition and restores a solid fill", () => {
    const doc = makeDoc();
    const withGradient = setGradientCommand("shape-1", createGradient("grad-shape-1"), {
      defs: "",
      paint: "#ff0000",
    }).apply(doc);

    const cleared = clearGradientCommand(
      "shape-1",
      "grad-shape-1",
      { defs: artboardOf(withGradient).defs, paint: fillOf(withGradient) },
      "#ffffff",
    ).apply(withGradient);

    expect(fillOf(cleared)).toBe("#ffffff");
    expect(gradientIdFromFill(fillOf(cleared))).toBeNull();
    expect(artboardOf(cleared).defs).not.toContain("grad-shape-1");
  });

  it("undoes back to the gradient", () => {
    const doc = makeDoc();
    const withGradient = setGradientCommand("shape-1", createGradient("grad-shape-1"), {
      defs: "",
      paint: "#ff0000",
    }).apply(doc);
    const snapshot = { defs: artboardOf(withGradient).defs, paint: fillOf(withGradient) };
    const clear = clearGradientCommand("shape-1", "grad-shape-1", snapshot, "#ffffff");

    const reverted = clear.undo(clear.apply(withGradient));

    expect(fillOf(reverted)).toBe("url(#grad-shape-1)");
    expect(artboardOf(reverted).defs).toContain('id="grad-shape-1"');
  });
});
