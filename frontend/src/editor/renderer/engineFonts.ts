/**
 * engineFonts — supplies the engine with real font bytes.
 *
 * The engine draws no text until a font is registered, because the browser gives
 * WebAssembly no access to system font enumeration. That is deliberate:
 * substituting a system font would produce metrics that disagree with the
 * exported SVG.
 *
 * The build step publishes a font next to the engine module, so the browser, the
 * native tests and the parity script all shape text with identical data. A full
 * per-family font pipeline — resolving every family a document names, with
 * subsetting and fallback chains — is a later milestone. Until then this module
 * registers what is available and reports precisely which families a document
 * asked for but did not get, so a substitution is never silent.
 *
 * One responsibility per file: loading and registering fonts into the engine.
 */

import type { PydeeSurfaceHandle } from "./engineLoader";

/** A font the build publishes alongside the engine module. */
export interface FontSource {
  readonly family: string;
  readonly url: string;
}

/**
 * Fonts published by engine/scripts/build-engine-wasm.sh. Absent in a checkout
 * that has not built the engine, which the loader reports rather than throwing.
 */
export const PUBLISHED_FONTS: readonly FontSource[] = [
  { family: "Roboto", url: "/engine/fonts/Roboto-Regular.ttf" },
];

export interface FontLoadReport {
  /** Families successfully registered with the surface. */
  readonly registered: readonly string[];
  /** Sources that could not be fetched or decoded, with the reason. */
  readonly failures: readonly { readonly family: string; readonly reason: string }[];
}

/**
 * Fetch and register every published font. Never throws: a missing font must
 * degrade to "text not rendered", not break the editor.
 */
export async function registerPublishedFonts(
  surface: PydeeSurfaceHandle,
  sources: readonly FontSource[] = PUBLISHED_FONTS,
): Promise<FontLoadReport> {
  const registered: string[] = [];
  const failures: { family: string; reason: string }[] = [];

  for (const source of sources) {
    if (surface.hasFont(source.family)) {
      registered.push(source.family);
      continue;
    }
    try {
      const response = await fetch(source.url);
      if (!response.ok) {
        failures.push({ family: source.family, reason: `HTTP ${response.status}` });
        continue;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (surface.registerFont(source.family, bytes)) {
        registered.push(source.family);
      } else {
        failures.push({ family: source.family, reason: "not a decodable font" });
      }
    } catch (error) {
      failures.push({
        family: source.family,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { registered, failures };
}

/**
 * Families a document asked for that the surface cannot resolve. Computed from
 * the engine's own `hasFont`, so the report reflects the renderer's real state
 * rather than an assumption about what was loaded.
 */
export function findMissingFamilies(
  surface: PydeeSurfaceHandle,
  requestedFamilies: Iterable<string>,
): string[] {
  const missing = new Set<string>();
  for (const family of requestedFamilies) {
    const trimmed = family.trim();
    if (trimmed !== "" && !surface.hasFont(trimmed)) {
      missing.add(trimmed);
    }
  }
  return [...missing].sort();
}
