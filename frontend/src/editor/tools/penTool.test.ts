import { describe, expect, it } from "vitest";

import type { CreativeDocument, DocumentLayer, ShapeLayer } from "../types/documentModel";
import { getActiveArtboard } from "../commands/helpers";
import {
  addAnchor,
  anchorCount,
  buildPathData,
  close,
  createPenSession,
  finalize,
  isOnFirstAnchor,
  previewPathData,
  type PenCompletion,
} from "./penTool";

/**
 * Build a minimal document whose active artboard already contains one `shapes`
 * layer, so created-path commands can be applied and uniqueness against
 * existing ids exercised.
 */
function makeDoc(extraLayers: DocumentLayer[] = []): CreativeDocument {
  const existing: ShapeLayer = {
    id: "path",
    role: "shapes",
    name: "Existing",
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "path",
    field: "path",
    geometry: { type: "path", d: "M 0 0 L 1 1" },
  };
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
            layers: [existing, ...extraLayers],
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

function expectCreated(
  completion: PenCompletion,
): Extract<PenCompletion, { status: "created" }> {
  if (completion.status !== "created") {
    throw new Error(`expected created completion, got ${completion.status}`);
  }
  return completion;
}

describe("pen session anchor accumulation (Req 8.1)", () => {
  it("starts empty and appends anchors immutably", () => {
    const s0 = createPenSession();
    expect(anchorCount(s0)).toBe(0);

    const s1 = addAnchor(s0, { x: 10, y: 10 });
    const s2 = addAnchor(s1, { x: 20, y: 30 });

    expect(anchorCount(s2)).toBe(2);
    // earlier sessions are not mutated
    expect(anchorCount(s0)).toBe(0);
    expect(anchorCount(s1)).toBe(1);
  });

  it("exposes an open `d` string for live preview", () => {
    const session = addAnchor(addAnchor(createPenSession(), { x: 10, y: 10 }), { x: 20, y: 30 });
    expect(previewPathData(session)).toBe("M 10 10 L 20 30");
  });

  it("snaps preview coordinates to the 0.5px grid", () => {
    const session = addAnchor(createPenSession(), { x: 10.24, y: 5.74 });
    expect(previewPathData(session)).toBe("M 10 5.5");
  });
});

describe("first-anchor close detection", () => {
  it("returns false when there are no anchors", () => {
    expect(isOnFirstAnchor(createPenSession(), { x: 0, y: 0 })).toBe(false);
  });

  it("detects a click within threshold of the first anchor", () => {
    const session = addAnchor(addAnchor(createPenSession(), { x: 100, y: 100 }), { x: 200, y: 50 });
    expect(isOnFirstAnchor(session, { x: 102, y: 101 })).toBe(true);
    expect(isOnFirstAnchor(session, { x: 140, y: 140 })).toBe(false);
  });
});

describe("completion with fewer than two anchors is discarded (Req 8.5)", () => {
  it("discards an empty session on finalize", () => {
    const result = finalize(createPenSession(), { existingLayerIds: [] });
    expect(result.status).toBe("discarded");
  });

  it("discards a single-anchor session on close, with no command", () => {
    const session = addAnchor(createPenSession(), { x: 10, y: 10 });
    const result = close(session, { existingLayerIds: [] });
    expect(result).toEqual({ status: "discarded", reason: expect.any(String) });
  });
});

describe("finalize with >= 2 anchors builds an open path command (Req 8.3, 8.4)", () => {
  it("produces a `<path>` ShapeLayer in the shapes group with field + unique id", () => {
    const doc = makeDoc();
    const existingIds = getActiveArtboard(doc)!.layers.map((l) => l.id);
    const session = addAnchor(addAnchor(createPenSession(), { x: 10, y: 10 }), { x: 40, y: 60 });

    const created = expectCreated(finalize(session, { existingLayerIds: existingIds }));

    expect(created.layer.kind).toBe("path");
    expect(created.layer.role).toBe("shapes");
    expect(created.layer.field.length).toBeGreaterThan(0);
    expect(created.layer.geometry).toEqual({ type: "path", d: "M 10 10 L 40 60" });
    // id is unique against the document's existing ids (which include "path")
    expect(existingIds).not.toContain(created.layer.id);
  });

  it("applies the create command into the shapes group and undoes it exactly", () => {
    const doc = makeDoc();
    const session = addAnchor(addAnchor(createPenSession(), { x: 0, y: 0 }), { x: 100, y: 0 });
    const created = expectCreated(
      finalize(session, { existingLayerIds: getActiveArtboard(doc)!.layers.map((l) => l.id) }),
    );

    const applied = created.command.apply(doc);
    const appliedLayers = getActiveArtboard(applied)!.layers;
    expect(appliedLayers).toHaveLength(2);
    expect(appliedLayers.some((l) => l.id === created.layer.id)).toBe(true);

    const reverted = created.command.undo(applied);
    expect(reverted).toEqual(doc);
  });
});

describe("close on first anchor builds a closed path (Req 8.2)", () => {
  it("emits a `<path>` whose `d` ends with a closepath", () => {
    const doc = makeDoc();
    const session = addAnchor(
      addAnchor(addAnchor(createPenSession(), { x: 0, y: 0 }), { x: 50, y: 0 }),
      { x: 25, y: 40 },
    );

    const created = expectCreated(
      close(session, { existingLayerIds: getActiveArtboard(doc)!.layers.map((l) => l.id) }),
    );

    expect(created.layer.geometry).toEqual({ type: "path", d: "M 0 0 L 50 0 L 25 40 Z" });
  });

  it("derives a unique id by suffixing when the base id collides", () => {
    const session = addAnchor(addAnchor(createPenSession(), { x: 1, y: 1 }), { x: 2, y: 2 });
    const created = expectCreated(
      close(session, { existingLayerIds: ["path", "path-2"], idBase: "path" }),
    );
    expect(created.layer.id).toBe("path-3");
  });
});

describe("buildPathData", () => {
  it("returns an empty string for no anchors", () => {
    expect(buildPathData([])).toBe("");
  });

  it("omits the closepath for open paths and includes it for closed paths", () => {
    const anchors = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(buildPathData(anchors)).toBe("M 0 0 L 10 10");
    expect(buildPathData(anchors, { closed: true })).toBe("M 0 0 L 10 10 Z");
  });
});
