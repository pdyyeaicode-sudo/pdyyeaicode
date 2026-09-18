import { describe, expect, it } from "vitest";

import { parseCanonicalSvg, serializeArtboard } from "../canonicalSvg";
import type { CreativeDocument } from "../types/documentModel";
import { rotateLayerCommand } from "./rotateLayerCommand";

/**
 * Regression cover for the crash on the first Ctrl+Z after a rotation.
 *
 * Rotating a shape that had no transform recorded `prev = { kind: "transform" }` with
 * no `transform` field. Undo spread that as `{ ...layer, transform: undefined }`,
 * which left the key PRESENT with an undefined value. `serializeArtboard` tested for
 * it with `'transform' in layer`, tried to escape `undefined`, threw, and React
 * unmounted the editor — the canvas went blank and every subsequent action was gone.
 *
 * Found by `rendererDocumentParity.spec.ts`, on both renderers, which is what
 * identifies it as a document-layer defect rather than anything to do with the
 * migration.
 *
 * Asserted through the real serializer rather than by inspecting the layer object,
 * because the layer object was never the thing that broke.
 */

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" data-printrocket="true" data-version="1.0">
<defs></defs>
<g data-role="shapes" data-editable="true" data-layer-id="target">
<rect data-field="shape" data-element-id="target-el" x="100" y="100" width="80" height="60" fill="#e11d48"/>
</g>
</svg>`;

const ROTATION = "matrix(0.798635 0.601815 -0.601815 0.798635 106.427005 -58.076724)";

function documentFrom(markup: string): CreativeDocument {
  const artboard = parseCanonicalSvg(markup);
  return {
    schemaVersion: 1,
    name: "test",
    pages: [{ id: "page-1", name: "Page 1", artboards: [artboard] }],
    activePageId: "page-1",
    activeArtboardId: artboard.id,
  };
}

function markupOf(document: CreativeDocument): string {
  return serializeArtboard(document.pages[0].artboards[0]);
}

describe("rotateLayerCommand undo", () => {
  it("restores a layer that had NO transform without throwing", () => {
    const before = documentFrom(SVG);
    const baseline = markupOf(before);

    // The snapshot the overlay records for a previously untransformed layer: the
    // `transform` field is simply absent.
    const command = rotateLayerCommand(
      "target",
      { kind: "transform" },
      { kind: "transform", transform: ROTATION },
    );

    const rotated = command.apply(before);
    expect(markupOf(rotated)).toContain(`transform="${ROTATION}"`);

    const undone = command.undo(rotated);
    // This is the line that threw `CanonicalSvgError: Failed to serialize Artboard`.
    expect(() => markupOf(undone)).not.toThrow();
    expect(markupOf(undone)).toBe(baseline);
    expect(markupOf(undone)).not.toContain("transform=");
  });

  it("does not leave an undefined-valued transform key behind", () => {
    // The serializer is now type-safe about this, so the only way to see the defect
    // at this level is to look at the object the command produced.
    const command = rotateLayerCommand(
      "target",
      { kind: "transform" },
      { kind: "transform", transform: ROTATION },
    );
    const undone = command.undo(command.apply(documentFrom(SVG)));
    const layer = undone.pages[0].artboards[0].layers.find((candidate) => candidate.id === "target");

    expect(layer).toBeDefined();
    expect("transform" in (layer as object)).toBe(false);
  });

  it("treats an empty-string snapshot the same as an absent one", () => {
    const command = rotateLayerCommand(
      "target",
      { kind: "transform", transform: "" },
      { kind: "transform", transform: ROTATION },
    );
    const undone = command.undo(command.apply(documentFrom(SVG)));
    expect(markupOf(undone)).toBe(markupOf(documentFrom(SVG)));
  });

  it("restores a PREVIOUS transform rather than clearing it", () => {
    // The other direction: rotating an already-rotated layer must undo back to the
    // original matrix, not to no transform at all.
    const original = "matrix(1 0 0 1 12 -8)";
    const rotatedSvg = SVG.replace(
      'data-layer-id="target"',
      `data-layer-id="target" transform="${original}"`,
    );
    const command = rotateLayerCommand(
      "target",
      { kind: "transform", transform: original },
      { kind: "transform", transform: ROTATION },
    );
    const undone = command.undo(command.apply(documentFrom(rotatedSvg)));
    expect(markupOf(undone)).toContain(`transform="${original}"`);
    expect(markupOf(undone)).not.toContain(ROTATION);
  });
});
