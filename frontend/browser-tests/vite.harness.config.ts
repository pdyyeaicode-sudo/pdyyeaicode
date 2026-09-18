/**
 * Build config for the browser-test harness.
 *
 * Why a production build rather than the dev server: `loadEngine` dynamically
 * imports `/engine/pydee-engine.mjs`, which lives in `public/`. Vite's dev server
 * runs import analysis on that request and refuses it — files in `public/` are
 * copied as-is at build time and are not meant to be imported from source. A
 * production build copies them verbatim, so `vite preview` serves the module the
 * way a real deployment does.
 *
 * That makes this the more faithful test anyway: it exercises the artifact that
 * actually ships, not a dev-server approximation of it.
 *
 * `publicDir` points at the app's real public directory so the engine `.wasm` and
 * the published font are served from their normal paths.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: path.resolve(here, "harness"),
  publicDir: path.resolve(here, "../public"),
  build: {
    outDir: path.resolve(here, "../dist-harness"),
    emptyOutDir: true,
    // Source maps make a failing measurement traceable to real source lines.
    sourcemap: true,
  },
  preview: {
    port: 5200,
    strictPort: true,
  },
});
