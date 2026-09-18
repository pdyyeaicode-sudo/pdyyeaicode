/**
 * engineFlag — decides which renderer paints the editor's canvas.
 *
 * The Skia engine is now the DEFAULT. The canonical-SVG DOM renderer remains in the
 * codebase and stays mounted — it is the export, print and text-measurement backend,
 * and it is the explicit fallback — but it is no longer what the user looks at.
 *
 * Opt back out per session, which needs no UI and no config change:
 *
 *   /editor?renderer=svg
 *
 * What justified the flip, all measured rather than assumed:
 *
 *  - `rendererDocumentParity.spec.ts`: a move, a resize and a rotate produce
 *    BYTE-IDENTICAL canonical SVG under either renderer, including on a rotated layer
 *    nested inside a scaled group, and at zoom 2.
 *  - `subPixelFidelity.spec.ts`: 0.0625px document steps land exactly, with zero dead
 *    samples, at zoom 1/2/4 on rotated, nested and off-pivot layers.
 *  - `realisticContent.spec.ts`: 60.5fps at 400, 800, 1080 and 1350 square artboards,
 *    because damage tracking makes a gesture frame cost 0.3ms instead of 32ms per
 *    megapixel.
 *  - `engine-parity.mts`: 630 checks pinning the C++ solver to the TypeScript one
 *    at 1e-9, so the fallback cannot disagree with the default.
 *
 * Asking for the engine is NOT the same as getting it. A checkout without the built
 * WASM artifact, a failed fetch, or a failed surface allocation must fall back rather
 * than show a blank canvas, so `EditorCanvas` hides the DOM design objects only once
 * the engine reports a presented frame. This function answers "which renderer was
 * asked for", never "which one is painting".
 *
 * Reading the flag is safe during server rendering and in tests: without a `window`
 * it returns the default.
 *
 * One responsibility per file: resolving the renderer flag.
 */

/** Query parameter that selects the renderer. */
export const RENDERER_QUERY_KEY = "renderer";
/** Value that selects the engine. Explicit as well as default, so a link can pin it. */
export const SKIA_RENDERER_QUERY_VALUE = "skia";
/** Value that opts out, back to the canonical-SVG DOM renderer. */
export const SVG_RENDERER_QUERY_VALUE = "svg";

/**
 * Retained name for the query key.
 *
 * The key was named for the flag it used to set, and it is referenced from the test
 * harness and several specs. Renaming it there is churn with no reader benefit, so the
 * old name stays as an alias rather than being duplicated as a second literal.
 */
export const SKIA_RENDERER_QUERY_KEY = RENDERER_QUERY_KEY;

/** Where the build script publishes the engine module for Vite to serve. */
export const ENGINE_MODULE_URL = "/engine/pydee-engine.mjs";

/**
 * True unless this session explicitly asked for the SVG renderer.
 *
 * Evaluated on each call so a test can change the location without reloading the
 * module. Anything other than the exact opt-out value means the engine — including a
 * misspelling, because a typo in a query parameter should not silently downgrade the
 * renderer a user is running on.
 */
export function isSkiaRendererEnabled(): boolean {
  if (typeof window === "undefined" || typeof window.location?.search !== "string") {
    return true;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(RENDERER_QUERY_KEY) !== SVG_RENDERER_QUERY_VALUE;
  } catch {
    // A malformed query string must never decide which renderer runs.
    return true;
  }
}
