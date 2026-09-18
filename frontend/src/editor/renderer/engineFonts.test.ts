/**
 * Tests for the engine font pipeline.
 *
 * The property that matters: a font that cannot be loaded must degrade to
 * "text not rendered" with a stated reason, never to a silent substitution and
 * never to a thrown error that breaks the editor.
 */

import { describe, expect, it, vi } from "vitest";

import type { Artboard, DocumentLayer, TextLayer } from "../types/documentModel";
import { findMissingFamilies, registerPublishedFonts, type FontSource } from "./engineFonts";
import type { PydeeSurfaceHandle } from "./engineLoader";
import { collectTextFamilies } from "./renderScene";
import { extractRenderScene } from "./sceneExtractor";

/** Minimal stand-in for the WASM surface, tracking what was registered. */
function makeFakeSurface(options: { readonly acceptFonts?: boolean } = {}) {
  const registered = new Set<string>();
  const surface: Partial<PydeeSurfaceHandle> = {
    hasFont: (family: string) => registered.has(family),
    registerFont: (family: string) => {
      if (options.acceptFonts === false) {
        return false;
      }
      registered.add(family);
      return true;
    },
  };
  return { surface: surface as PydeeSurfaceHandle, registered };
}

function makeText(id: string, fontFamily: string): TextLayer {
  return {
    id,
    role: "headline",
    name: id,
    editable: true,
    locked: false,
    visible: true,
    opacity: 100,
    kind: "text",
    elementId: `${id}-el`,
    field: "headline",
    content: "Hello",
    x: 0,
    y: 20,
    fontFamily,
    fontSize: 24,
    fontWeight: "normal",
    textAlign: "left",
    fill: "#000000",
  };
}

function makeArtboard(layers: DocumentLayer[]): Artboard {
  return {
    id: "artboard-1",
    width: 200,
    height: 200,
    printMeta: { bleed: 3, cmykSafe: true, trimMarks: true },
    layers,
    defs: "",
    rootAttributes: {},
  };
}

describe("collectTextFamilies", () => {
  it("collects distinct families from every text node, including nested ones", () => {
    const scene = extractRenderScene(
      makeArtboard([
        makeText("a", "Inter"),
        makeText("b", "Inter"),
        {
          id: "g",
          role: "shapes",
          name: "g",
          editable: true,
          locked: false,
          visible: true,
          opacity: 100,
          kind: "group",
          children: [makeText("c", "Roboto")],
        },
      ]),
    );
    expect(collectTextFamilies(scene)).toEqual(["Inter", "Roboto"]);
  });

  it("ignores blank families", () => {
    const scene = extractRenderScene(makeArtboard([makeText("a", "   ")]));
    expect(collectTextFamilies(scene)).toEqual([]);
  });
});

describe("findMissingFamilies", () => {
  it("reports families the engine cannot resolve, using the engine's own state", () => {
    const { surface } = makeFakeSurface();
    surface.registerFont("Roboto", new Uint8Array([0]));

    expect(findMissingFamilies(surface, ["Roboto", "Inter", "Helvetica"])).toEqual([
      "Helvetica",
      "Inter",
    ]);
  });

  it("returns nothing when every family is registered", () => {
    const { surface } = makeFakeSurface();
    surface.registerFont("Roboto", new Uint8Array([0]));
    expect(findMissingFamilies(surface, ["Roboto"])).toEqual([]);
  });
});

describe("registerPublishedFonts", () => {
  const sources: readonly FontSource[] = [{ family: "Roboto", url: "/engine/fonts/Roboto.ttf" }];

  it("registers a font that fetches successfully", async () => {
    const { surface, registered } = makeFakeSurface();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      })),
    );

    const report = await registerPublishedFonts(surface, sources);

    expect(report.registered).toEqual(["Roboto"]);
    expect(report.failures).toEqual([]);
    expect(registered.has("Roboto")).toBe(true);
    vi.unstubAllGlobals();
  });

  it("reports an HTTP failure with its status instead of throwing", async () => {
    const { surface } = makeFakeSurface();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));

    const report = await registerPublishedFonts(surface, sources);

    expect(report.registered).toEqual([]);
    expect(report.failures).toEqual([{ family: "Roboto", reason: "HTTP 404" }]);
    vi.unstubAllGlobals();
  });

  it("reports a network error instead of throwing", async () => {
    const { surface } = makeFakeSurface();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const report = await registerPublishedFonts(surface, sources);

    expect(report.failures).toEqual([{ family: "Roboto", reason: "network down" }]);
    vi.unstubAllGlobals();
  });

  it("reports data the engine refuses to decode", async () => {
    const { surface } = makeFakeSurface({ acceptFonts: false });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([9, 9]).buffer,
      })),
    );

    const report = await registerPublishedFonts(surface, sources);

    expect(report.failures).toEqual([{ family: "Roboto", reason: "not a decodable font" }]);
    vi.unstubAllGlobals();
  });

  it("does not refetch a family the surface already has", async () => {
    const { surface } = makeFakeSurface();
    surface.registerFont("Roboto", new Uint8Array([0]));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const report = await registerPublishedFonts(surface, sources);

    expect(report.registered).toEqual(["Roboto"]);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
