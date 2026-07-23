import { describe, expect, it } from "vitest";

import { createBackgroundRemovalCommand } from "./aiTool";
import type { CreativeDocument, ImageLayer } from "../types/documentModel";

const SOURCE_HREF = "data:image/png;base64,source";
const RESULT_HREF = "data:image/png;base64,result";

function createImage(overrides: Partial<ImageLayer> = {}): ImageLayer {
  return {
    id: "image-1",
    role: "image-slots",
    name: "Product",
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "image",
    href: SOURCE_HREF,
    x: 20,
    y: 30,
    width: 400,
    height: 300,
    ...overrides,
  };
}

function createDocument(image: ImageLayer): CreativeDocument {
  return {
    schemaVersion: 1,
    name: "Background removal",
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
            defs: "",
            rootAttributes: {},
            printMeta: { bleed: 0, cmykSafe: false, trimMarks: false },
            layers: [image],
          },
        ],
      },
    ],
  };
}

function imageFrom(doc: CreativeDocument): ImageLayer {
  return doc.pages[0].artboards[0].layers[0] as ImageLayer;
}

describe("createBackgroundRemovalCommand", () => {
  it("updates and restores an image without mutating either document", () => {
    const original = createDocument(createImage());
    const command = createBackgroundRemovalCommand("image-1", SOURCE_HREF, RESULT_HREF);

    const applied = command.apply(original);
    const restored = command.undo(applied);

    expect(applied).not.toBe(original);
    expect(imageFrom(original).href).toBe(SOURCE_HREF);
    expect(imageFrom(applied).href).toBe(RESULT_HREF);
    expect(imageFrom(restored).href).toBe(SOURCE_HREF);
  });

  it("does not overwrite a newer image edit with a stale async result", () => {
    const newerHref = "data:image/png;base64,newer-edit";
    const current = createDocument(createImage({ href: newerHref }));
    const command = createBackgroundRemovalCommand("image-1", SOURCE_HREF, RESULT_HREF);

    expect(command.apply(current)).toBe(current);
    expect(imageFrom(current).href).toBe(newerHref);
  });

  it("does not revert an image that changed after the command was applied", () => {
    const changedAfterApply = createDocument(createImage({ href: "data:image/png;base64,changed-again" }));
    const command = createBackgroundRemovalCommand("image-1", SOURCE_HREF, RESULT_HREF);

    expect(command.undo(changedAfterApply)).toBe(changedAfterApply);
  });
});
