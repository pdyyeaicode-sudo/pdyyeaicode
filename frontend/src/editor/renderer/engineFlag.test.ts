/**
 * Tests for the renderer flag and the engine loader's failure behaviour.
 *
 * The property that matters most here is the default, and it has INVERTED: the Skia
 * engine is now what runs unless the session asks for `?renderer=svg`. What has not
 * changed is that a checkout without the built engine artifact must keep working —
 * `loadEngine` reports the artifact as unavailable rather than throwing, and
 * `EditorCanvas` keeps the SVG DOM visible until the engine reports a painted frame.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { isSkiaRendererEnabled } from "./engineFlag";
import { loadEngine, resetEngineLoaderForTests } from "./engineLoader";

function setSearch(search: string): void {
  // jsdom allows replacing location for the duration of a test.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, search },
  });
}

afterEach(() => {
  setSearch("");
  resetEngineLoaderForTests();
  vi.restoreAllMocks();
});

describe("isSkiaRendererEnabled", () => {
  it("is on by default, so the engine is the shipping renderer", () => {
    setSearch("");
    expect(isSkiaRendererEnabled()).toBe(true);
  });

  it("turns off only for the exact opt-out value", () => {
    setSearch("?renderer=svg");
    expect(isSkiaRendererEnabled()).toBe(false);

    setSearch("?renderer=skia");
    expect(isSkiaRendererEnabled()).toBe(true);

    // Case-sensitive, and a near-miss does not downgrade the renderer: a typo in a
    // query parameter should not silently change which engine a user is running on.
    setSearch("?renderer=SVG");
    expect(isSkiaRendererEnabled()).toBe(true);
    setSearch("?renderer=canvas");
    expect(isSkiaRendererEnabled()).toBe(true);
  });

  it("ignores unrelated parameters", () => {
    setSearch("?project=abc&zoom=2");
    expect(isSkiaRendererEnabled()).toBe(true);
  });

  it("still opts out when the parameter is not first", () => {
    setSearch("?project=abc&renderer=svg&zoom=2");
    expect(isSkiaRendererEnabled()).toBe(false);
  });

  it("never throws on a malformed query string", () => {
    setSearch("?%");
    expect(() => isSkiaRendererEnabled()).not.toThrow();
  });
});

describe("loadEngine", () => {
  it("reports the engine as unavailable instead of rejecting", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const result = await loadEngine("/engine/definitely-not-built.mjs");

    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toContain("definitely-not-built.mjs");
    }
    // The reason is surfaced once, with build instructions, never silently.
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0]?.[0])).toContain("build-engine-wasm.sh");
  });

  it("memoizes the attempt so a missing artifact is not refetched per render", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const first = await loadEngine("/engine/definitely-not-built.mjs");
    const second = await loadEngine("/engine/definitely-not-built.mjs");

    expect(second).toBe(first);
  });
});
