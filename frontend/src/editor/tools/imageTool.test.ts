import { describe, expect, it } from "vitest";

import type { CreativeDocument, ImageLayer } from "../types/documentModel";
import { getActiveArtboard } from "../commands";
import {
  buildImageLayer,
  defaultImageLoader,
  IMAGE_MAX_BYTES,
  placeImageFile,
  uniqueImageLayerId,
  validateImageFile,
  type ImageLoader,
  type LoadedImage,
} from "./imageTool";

/** Build a `File` with a controlled `type` and `size` without allocating bytes. */
function fakeFile(name: string, type: string, size: number): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

/** A loader stub that always succeeds with a fixed inline data URI + size. */
const okLoader: ImageLoader = async (): Promise<LoadedImage> => ({
  dataUrl: "data:image/png;base64,iVBORw0KGgo=",
  width: 120,
  height: 80,
});

/** A loader stub that always fails, modelling an unreadable/undecodable file. */
const failLoader: ImageLoader = async (): Promise<LoadedImage> => {
  throw new Error("decode failed");
};

/** An empty single-artboard document for applying the placement command. */
function makeDoc(): CreativeDocument {
  return {
    schemaVersion: 1,
    name: "Doc",
    pages: [
      {
        id: "page-1",
        name: "Page 1",
        artboards: [
          {
            id: "art-1",
            width: 800,
            height: 600,
            printMeta: { bleed: 0, cmykSafe: false, trimMarks: false },
            layers: [],
            defs: "",
            rootAttributes: {},
          },
        ],
      },
    ],
    activePageId: "page-1",
    activeArtboardId: "art-1",
  };
}

describe("validateImageFile (Req 7.3)", () => {
  it("accepts PNG, JPEG, and WEBP within the size limit", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      const result = validateImageFile(fakeFile("photo", type, 1024));
      expect(result.ok).toBe(true);
    }
  });

  it("accepts a file exactly at the configured upload boundary", () => {
    const result = validateImageFile(fakeFile("photo.png", "image/png", IMAGE_MAX_BYTES));
    expect(result.ok).toBe(true);
  });

  it("rejects unsupported types with a type-specific reason", () => {
    const result = validateImageFile(fakeFile("anim.gif", "image/gif", 1024));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("type");
      expect(result.message).toMatch(/type/i);
    }
  });

  it("rejects supported types that exceed the configured limit with a size-specific reason", () => {
    const result = validateImageFile(
      fakeFile("big.png", "image/png", IMAGE_MAX_BYTES + 1),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("size");
      expect(result.message).toMatch(/1TB|large/i);
    }
  });

  it("reports type before size when a file is both unsupported and oversized", () => {
    const result = validateImageFile(
      fakeFile("huge.gif", "image/gif", IMAGE_MAX_BYTES + 1),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("type");
    }
  });
});

describe("uniqueImageLayerId (Req 7.1)", () => {
  it("returns the first slot id when none are taken", () => {
    expect(uniqueImageLayerId([])).toBe("image-slot-1");
  });

  it("skips taken ids to stay unique among existing identifiers", () => {
    const id = uniqueImageLayerId(["image-slot-1", "image-slot-2", "rect-9"]);
    expect(id).toBe("image-slot-3");
    expect(["image-slot-1", "image-slot-2"]).not.toContain(id);
  });
});

describe("buildImageLayer (Req 7.1, 7.2)", () => {
  it("builds an image-slots layer with an inline data URI and unique id", () => {
    const loaded: LoadedImage = { dataUrl: "data:image/webp;base64,UklGRg==", width: 64, height: 32 };
    const layer = buildImageLayer(fakeFile("logo.webp", "image/webp", 2048), loaded, {
      existingLayerIds: ["image-slot-1"],
    });
    expect(layer.kind).toBe("image");
    expect(layer.role).toBe("image-slots");
    expect(layer.id).toBe("image-slot-2");
    expect(layer.href.startsWith("data:")).toBe(true);
    expect(layer.width).toBe(64);
    expect(layer.height).toBe(32);
    expect(layer.name).toBe("logo.webp");
  });

  it("truncates very long file names to 100 characters", () => {
    const longName = `${"a".repeat(150)}.png`;
    const layer = buildImageLayer(fakeFile(longName, "image/png", 1024), {
      dataUrl: "data:image/png;base64,AA==",
      width: 1,
      height: 1,
    }, { existingLayerIds: [] });
    expect(layer.name.length).toBe(100);
  });
});

describe("placeImageFile (Req 7.1–7.5)", () => {
  it("returns a reversible command that adds one image to image-slots on success", async () => {
    const result = await placeImageFile(fakeFile("hero.png", "image/png", 4096), {
      existingLayerIds: [],
      loader: okLoader,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.layer.href.startsWith("data:")).toBe(true);

    const doc = makeDoc();
    const applied = result.command.apply(doc);
    const layers = getActiveArtboard(applied)?.layers ?? [];
    expect(layers).toHaveLength(1);
    const placed = layers[0] as ImageLayer;
    expect(placed.role).toBe("image-slots");
    expect(placed.kind).toBe("image");

    // Reverting restores the prior (empty) state exactly (Req 7.5).
    const reverted = result.command.undo(applied);
    expect(getActiveArtboard(reverted)?.layers).toHaveLength(0);
  });

  it("assigns a data-layer-id unique among existing identifiers (Req 7.1)", async () => {
    const result = await placeImageFile(fakeFile("a.jpg", "image/jpeg", 4096), {
      existingLayerIds: ["image-slot-1", "image-slot-2"],
      loader: okLoader,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.layer.id).toBe("image-slot-3");
    }
  });

  it("rejects oversized/unsupported files with a reason and no command (Req 7.3)", async () => {
    const oversize = await placeImageFile(
      fakeFile("big.png", "image/png", IMAGE_MAX_BYTES + 1),
      { existingLayerIds: [], loader: okLoader },
    );
    expect(oversize.ok).toBe(false);
    if (!oversize.ok) {
      expect(oversize.kind).toBe("validation");
      expect(oversize.reason).toBe("size");
    }

    const badType = await placeImageFile(fakeFile("clip.gif", "image/gif", 1024), {
      existingLayerIds: [],
      loader: okLoader,
    });
    expect(badType.ok).toBe(false);
    if (!badType.ok) {
      expect(badType.kind).toBe("validation");
      expect(badType.reason).toBe("type");
    }
  });

  it("reports a load error and no command when a valid file cannot be read/decoded (Req 7.4)", async () => {
    const result = await placeImageFile(fakeFile("corrupt.png", "image/png", 2048), {
      existingLayerIds: [],
      loader: failLoader,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("load");
      expect(result.message).toMatch(/could not be loaded/i);
    }
  });
});

describe("defaultImageLoader", () => {
  it("is the loader used when none is injected", () => {
    expect(typeof defaultImageLoader).toBe("function");
  });
});
