/**
 * Mapping between the backend `DesignOutput` wire contract and the frontend
 * `Artboard` Document_Model.
 *
 * The backend remains the single source of truth for the wire contract
 * (`DesignOutput`, `SVGLayer`, `PrintMeta`); this module is a thin, additive,
 * frontend-only adapter. It never changes the backend contract and never
 * flattens the canonical `<g data-role>` layer structure (Req 10.9).
 *
 * - `artboardFromDesignOutput` parses `output.composedSVG` via
 *   `parseCanonicalSvg` (never flatten) and carries `output.printMeta` onto the
 *   resulting Artboard (Req 12.3).
 * - `designOutputFromArtboard` serializes the Artboard via `serializeArtboard`
 *   and derives `svgLayers[]` using the shared `extractLayers` helper — the
 *   exact logic the existing `useDesignStudio` mutation path uses — so the
 *   interchange shape stays identical (Req 10.3, 10.5).
 *
 * Pure functions only — no React/state work and no hidden global state.
 * Parse/serialize failures propagate as `CanonicalSvgError`.
 *
 * One responsibility per file: only DesignOutput <-> Artboard mapping.
 */

import { CanonicalSvgError, parseCanonicalSvg, serializeArtboard } from "./canonicalSvg";
import { extractLayers } from "./svgLayerExtraction";
import type { Artboard } from "./types/documentModel";
import type { DesignOutput, SVGLayer } from "../types";

/**
 * Build an `Artboard` from a backend `DesignOutput`.
 *
 * Parses the canonical SVG (never flattening nested `<g data-role>` groups) and
 * overlays the backend `printMeta` (bleed / CMYK-safe / trim marks) onto the
 * Artboard so downstream print/PDF export can honor it (Req 12.3).
 *
 * @throws {CanonicalSvgError} when `composedSVG` is not valid Canonical_SVG, so
 *   callers can keep the current Document_Model unchanged (Req 1.2, 10.x).
 */
export function artboardFromDesignOutput(output: DesignOutput): Artboard {
  const base = parseCanonicalSvg(output.composedSVG); // never flatten (Req 10.9)
  return { ...base, printMeta: output.printMeta }; // carry bleed/CMYK metadata (Req 12.3)
}

/**
 * The same artboard, parsed once per `DesignOutput`.
 *
 * Parsing the canonical SVG is the expensive step and several consumers need the
 * document view of the same output — the render scene, and any gesture that has to
 * read a layer's stored geometry to build a command. A `WeakMap` so a superseded
 * output is collectable.
 *
 * Returns null when the markup cannot be parsed, so a caller reports rather than
 * committing a change against a document it could not read.
 */
const artboardCache = new WeakMap<DesignOutput, Artboard>();

export function artboardForDesignOutput(output: DesignOutput | null): Artboard | null {
  if (output === null) {
    return null;
  }
  const cached = artboardCache.get(output);
  if (cached !== undefined) {
    return cached;
  }
  try {
    const artboard = artboardFromDesignOutput(output);
    artboardCache.set(output, artboard);
    return artboard;
  } catch (error) {
    console.warn(
      "[editor] could not parse the design output into a document:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

/**
 * Build a `DesignOutput`-shaped value from an `Artboard` for export/interchange.
 *
 * Serializes the canonical SVG and derives `svgLayers[]` exactly as the existing
 * `extractLayers` helper does, keeping the backend contract untouched. The
 * Artboard's `printMeta` is propagated back onto the output.
 *
 * @param artboard      Active Artboard to serialize.
 * @param requestId     Request id to stamp on the output (defaults to "").
 * @param previousLayers Prior `svgLayers[]` used to preserve resolved roles when
 *   re-deriving layers (matched by `data-layer-id` / name); defaults to none.
 * @throws {CanonicalSvgError} when the Artboard cannot be serialized to valid
 *   Canonical_SVG.
 */
export function designOutputFromArtboard(
  artboard: Artboard,
  requestId = "",
  previousLayers: SVGLayer[] = [],
): DesignOutput {
  const composedSVG = serializeArtboard(artboard);
  const svgRoot = parseSvgRoot(composedSVG);
  return {
    requestId,
    composedSVG,
    svgLayers: extractLayers(svgRoot, previousLayers),
    printMeta: artboard.printMeta,
  };
}

/**
 * Parse serialized Canonical_SVG markup back into an `SVGSVGElement` so the
 * shared `extractLayers` helper can read the top-level groups. Uses the same
 * `DOMParser` approach as the rest of the editor (tests run under jsdom).
 */
function parseSvgRoot(svg: string): SVGSVGElement {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(svg, "image/svg+xml");
  const parserError = parsed.getElementsByTagName("parsererror")[0];
  if (parserError || parsed.documentElement.nodeName === "parsererror") {
    throw new CanonicalSvgError(
      `Serialized SVG is not well-formed: ${parserError?.textContent?.trim() ?? "unknown error"}`,
    );
  }
  const root = parsed.documentElement;
  if (!(root instanceof SVGSVGElement)) {
    throw new CanonicalSvgError("Serialized markup root is not an <svg> element.");
  }
  return root;
}
