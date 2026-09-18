/**
 * Harness that mounts the REAL editor canvas for browser measurement.
 *
 * The point of this file is that nothing is reimplemented: it renders the actual
 * `SVGCanvas` — which owns the `.svg-canvas-wrapper` with its `scale(zoom)` — and
 * the actual `useCanvasDrag` hook that computes and applies the drag preview. A
 * hand-built fixture could accidentally differ from the editor in exactly the
 * detail under test.
 *
 * `?zoom=` sets the viewport zoom. `?skia=1` additionally mounts `EditorCanvas`,
 * so the Skia overlay's rendered pixels can be compared against the SVG preview in
 * the same screen-space coordinate system.
 *
 * Committed transforms are recorded on `window.__pydeeCommits` so a test can assert
 * the document-space value as well as the on-screen displacement.
 */

import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { EditorCanvas } from "../../src/editor/EditorCanvas";
import { SVGCanvas } from "../../src/components/SVGCanvas";
import { artboardFromDesignOutput } from "../../src/editor/designOutputMapping";
import { serializeArtboard } from "../../src/editor/canonicalSvg";
import { createShapeCreateSession } from "../../src/editor/interaction/shapeCreateSession";
import {
  resizeLayerCommand,
  rotateLayerCommand,
  translateLayerCommand,
} from "../../src/editor/commands";
import type {
  Command,
  ResizeSnapshot,
  RotateSnapshot,
} from "../../src/editor/types/documentModel";
import type { DesignOutput } from "../../src/types";
import type { GestureBridge } from "../../src/editor/interaction/gestureBridge";

const ARTBOARD = 400;

/**
 * Realistic content, appended to the fixture on `?content=heavy`.
 *
 * The default fixture is four small rects and one text node, chosen to make geometry
 * defects unmistakable. That is the wrong thing to benchmark: a real 1080x1080 design has
 * gradient fills, several text layers with different families, nested groups, and paths
 * with many segments, and each of those exercises a different part of the engine —
 * gradient resolution, skparagraph shaping, layer isolation, path parsing.
 *
 * Spread across the whole artboard so culling cannot skip most of it, and positioned in
 * artboard-relative units so it fills whatever size is requested.
 */
function heavyContent(size: number): string {
  const parts: string[] = [];
  const at = (fraction: number): number => Math.round(fraction * size);

  // A full-bleed gradient background: the most common single layer in a real design and
  // the one that touches every pixel.
  parts.push(
    `<g data-role="background" data-editable="true" data-layer-id="heavy-bg">`
      + `<rect data-field="shape" data-element-id="heavy-bg-el" x="0" y="0" `
      + `width="${size}" height="${size}" fill="url(#heavy-linear)"/></g>`,
  );

  // A radial-gradient blob, which resolves through a different code path.
  parts.push(
    `<g data-role="shapes" data-editable="true" data-layer-id="heavy-blob">`
      + `<ellipse data-field="shape" data-element-id="heavy-blob-el" cx="${at(0.72)}" cy="${at(0.28)}" `
      + `rx="${at(0.22)}" ry="${at(0.18)}" fill="url(#heavy-radial)"/></g>`,
  );

  // Text in three sizes. Shaping cost scales with glyph count, not layer count.
  const lines: Array<[string, number, number]> = [
    ["Summer Collection 2026", 0.62, 0.06],
    ["Everything must go — up to 70% off every item in store", 0.72, 0.028],
    ["Terms apply. See in store for details.", 0.82, 0.018],
  ];
  lines.forEach(([content, y, fontSize], index) => {
    parts.push(
      `<g data-role="body" data-editable="true" data-layer-id="heavy-text-${index}">`
        + `<text data-field="body" data-element-id="heavy-text-${index}-el" x="${at(0.08)}" y="${at(y)}" `
        + `font-family="sans-serif" font-size="${at(fontSize)}" fill="#0f172a">${content}</text></g>`,
    );
  });

  // A group of paths with real segment counts, inside a transform, so layer isolation and
  // the path parser are both exercised.
  const petals: string[] = [];
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    const x = Math.round(Math.cos(angle) * 60);
    const y = Math.round(Math.sin(angle) * 60);
    petals.push(
      `<path data-field="shape" data-element-id="heavy-petal-${index}" `
        + `d="M0 0 C ${x} ${y} ${x * 2} ${y * 2} ${x} ${y * 3} S ${-x} ${y * 2} 0 0 Z" `
        + `fill="hsl(${index * 30} 65% 55%)" opacity="0.55"/>`,
    );
  }
  parts.push(
    `<g data-role="shapes" data-editable="true" data-layer-id="heavy-flower" `
      + `transform="translate(${at(0.24)} ${at(0.34)}) scale(1.4) rotate(12)">${petals.join("")}</g>`,
  );

  return parts.join("\n");
}

const HEAVY_DEFS =
  `<linearGradient id="heavy-linear" x1="0%" y1="0%" x2="100%" y2="100%">`
  + `<stop offset="0" stop-color="#fdf2f8"/><stop offset="0.55" stop-color="#c7d2fe"/>`
  + `<stop offset="1" stop-color="#0f172a"/></linearGradient>`
  + `<radialGradient id="heavy-radial" cx="50%" cy="50%" r="50%" fx="35%" fy="40%">`
  + `<stop offset="0" stop-color="#fbbf24"/><stop offset="1" stop-color="#f43f5e" stop-opacity="0.15"/>`
  + `</radialGradient>`;

/**
 * A minimal Canonical_SVG with:
 *   - `target`   — a plain draggable rect
 *   - `rotated`  — a rotated text layer
 *   - `nested`   — a rect whose ANCESTOR is scaled and translated, and which
 *                  carries its own rotation. This is the case a `dx / zoom`
 *                  conversion cannot get right: the ancestor scale multiplies the
 *                  delta again and the node's own rotation redirects the geometry
 *                  offset the commit writes.
 *   - `spun`     — a rect rotated 90 degrees about its own centre. Chosen so a
 *                  direction error is unmistakable: a translate applied in the
 *                  layer's own space instead of its parent's moves it DOWN when the
 *                  pointer goes right.
 *   - `offcentre` — a rect rotated about its own TOP-LEFT CORNER rather than its
 *                  centre. Every other rotated layer here happens to spin about its
 *                  own centre, and for those a rotation composed on the left and one
 *                  composed on the right give the SAME answer — which is why a real
 *                  rotation defect passed every test for as long as it did. Here they
 *                  differ by about 15px at a 45 degree drag.
 */
const COMPOSED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${ARTBOARD}" height="${ARTBOARD}" viewBox="0 0 ${ARTBOARD} ${ARTBOARD}" data-printrocket="true" data-version="1.0">
<defs></defs>
<g data-role="shapes" data-editable="true" data-layer-id="target">
<rect data-field="shape" data-element-id="target-el" x="100" y="100" width="80" height="60" fill="#e11d48"/>
</g>
<g data-role="headline" data-editable="true" data-layer-id="rotated" transform="rotate(35 250 300)">
<text data-field="headline" data-element-id="rotated-el" x="250" y="300" font-family="sans-serif" font-size="40" fill="#7c3aed">dhhfg</text>
</g>
<g data-role="shapes" data-editable="true" data-layer-id="scaled-group" transform="translate(40 30) scale(2)">
<g data-layer-id="nested" transform="rotate(25 30 20)">
<rect data-field="shape" data-element-id="nested-el" x="10" y="10" width="40" height="20" fill="#0ea5e9"/>
</g>
</g>
<g data-role="shapes" data-editable="true" data-layer-id="spun" transform="rotate(90 300 120)">
<rect data-field="shape" data-element-id="spun-el" x="270" y="100" width="60" height="40" fill="#16a34a"/>
</g>
<g data-role="shapes" data-editable="true" data-layer-id="offcentre" transform="rotate(25 60 220)">
<rect data-field="shape" data-element-id="offcentre-el" x="60" y="220" width="80" height="40" fill="#f59e0b"/>
</g>
<!--
  MIRRORED horizontally about its own centre: matrix(-1 0 0 1 520 0), i.e. reflected
  about x = 260.

  Present because a flip is the case a box-and-angle selection box cannot describe.
  Two positive edge lengths plus one arctangent have to call a mirror a 180-degree
  rotation, which puts every handle on the opposite corner - and every fixture that is
  merely rotated agrees with that reduction, so none of them discriminate.
-->
<g data-role="shapes" data-editable="true" data-layer-id="mirrored" transform="matrix(-1 0 0 1 520 0)">
<rect data-field="shape" data-element-id="mirrored-el" x="230" y="220" width="60" height="40" fill="#db2777"/>
</g>
<!--
  A PATH with corner arcs, so the selection box has to be measured rather than asserted.
  A rounded rectangle's arcs used to inflate its reported bounds by the full corner
  radius on all four sides: this one is 100x60 at (20, 300) and was reported as 140x100
  at (0, 280).
-->
<g data-role="shapes" data-editable="true" data-layer-id="rounded">
<path data-field="shape" data-element-id="rounded-el" d="M 40 300 L 100 300 A 20 20 0 0 1 120 320 L 120 340 A 20 20 0 0 1 100 360 L 40 360 A 20 20 0 0 1 20 340 L 20 320 A 20 20 0 0 1 40 300 Z" fill="#0891b2"/>
</g>
<!--
  Four copies of one rect rotated to 15, 45, 90 and 135 degrees about their own
  centres, for the rotation-angle sweep in geometryAuthority.spec.ts. Each is a
  60x40 rect whose centre is the pivot in its own rotate(), so a correct chrome sits
  exactly on it and a box-and-angle reduction that mishandles a right angle shows up
  at 90.
-->
<g data-role="shapes" data-editable="true" data-layer-id="rot15" transform="rotate(15 400 130)">
<rect data-field="shape" data-element-id="rot15-el" x="370" y="110" width="60" height="40" fill="#4f46e5"/>
</g>
<g data-role="shapes" data-editable="true" data-layer-id="rot45" transform="rotate(45 400 210)">
<rect data-field="shape" data-element-id="rot45-el" x="370" y="190" width="60" height="40" fill="#4f46e5"/>
</g>
<g data-role="shapes" data-editable="true" data-layer-id="rot90" transform="rotate(90 400 290)">
<rect data-field="shape" data-element-id="rot90-el" x="370" y="270" width="60" height="40" fill="#4f46e5"/>
</g>
<g data-role="shapes" data-editable="true" data-layer-id="rot135" transform="rotate(135 400 370)">
<rect data-field="shape" data-element-id="rot135-el" x="370" y="350" width="60" height="40" fill="#4f46e5"/>
</g>
</svg>`;

const designOutput: DesignOutput = {
  requestId: "harness",
  svgLayers: [],
  composedSVG: COMPOSED_SVG,
  printMeta: { bleed: 3, cmykSafe: true, trimMarks: true },
};

declare global {
  interface Window {
    __pydeeCommits: Array<{ layerId: string; dx: number; dy: number }>;
    /** Resize commits, so a test can assert the document change as well as pixels. */
    __pydeeResizes: Array<{ layerId: string; prev: unknown; next: unknown }>;
    __pydeeRotates: Array<{ layerId: string; prev: unknown; next: unknown }>;
    /** Undo the last applied command, for the acceptance matrix's undo column. */
    __pydeeUndo: () => boolean;
    /**
     * The document's CURRENT canonical markup.
     *
     * Renderer parity has to be asserted on the committed document, not on pixels:
     * the two renderers paint differently by construction, but they must produce
     * byte-identical canonical SVG from the same gesture, because the document —
     * not the surface — is what gets saved, exported and printed.
     */
    __pydeeMarkup: () => string;
    /** How many commands are on the harness undo stack. */
    __pydeeUndoDepth: () => number;
    /**
     * Which renderer this page resolved, as opposed to which one was asked for.
     *
     * A spec that means to measure one renderer and silently measures the other is a
     * false pass that looks exactly like a real one, and this codebase has produced
     * that twice — once from the dev server not serving the engine module, once from
     * the renderer default flipping. So the answer is published rather than inferred.
     */
    __pydeeRenderer: "svg" | "skia";
    /**
     * The engine's own status, as it reports it.
     *
     * `chromeGeometry` starts answering as soon as the scene is uploaded, which is
     * BEFORE the first frame has been presented — and until then the editor keeps the
     * DOM as the visual surface and the DOM chrome as the pointer target. A spec that
     * waits only for geometry therefore drives the SVG path while believing it is
     * driving the engine. `ready` here means pixels are on screen.
     */
    __pydeeEngineStatus: "loading" | "ready" | "unavailable" | "error" | "none";
    /**
     * A live shape-creation session driven by the ENGINE's builder.
     *
     * Exposed as a session rather than as the raw bridge so a test exercises the same
     * state machine the editor does — the threshold, the single commit, the cancel —
     * rather than calling the engine directly and proving nothing about the sequencing.
     */
    __pydeeShapeCreate?: {
      down: (shapeType: string, clientX: number, clientY: number) => boolean;
      move: (clientX: number, clientY: number, shift?: boolean, alt?: boolean) => void;
      up: (clientX: number, clientY: number, shift?: boolean, alt?: boolean) => void;
      cancel: () => void;
      phase: () => string;
      /** The outline currently on screen: `d` plus its measured bounds. */
      outline: () => { kind: string; d: string; bounds: { x: number; y: number; width: number; height: number } } | null;
    };
    /** Every outline committed by a creation gesture, newest last. */
    __pydeeShapeCommits: Array<{
      shapeType: string;
      d: string;
      bounds: { x: number; y: number; width: number; height: number };
    }>;
    /** Change zoom/pan in place, without reloading and destroying the canvas. */
    __pydeeSetViewport: (zoom: number, panX: number, panY: number) => void;
    /** Change the selected layer in place. */
    __pydeeSelect: (layerId: string | null) => void;
    /**
     * The engine hit-tester the renderer published.
     *
     * Exposed so a test can ask the ENGINE what is under a point, rather than
     * inferring it from which DOM element happened to receive an event.
     */
    __pydeeHitTest?: (clientX: number, clientY: number) => string | null;
    /**
     * The engine's gesture bridge, as published by the renderer.
     *
     * Exposed so a test can ask WHERE the painted handles are and drive a gesture
     * through the same geometry that drew them, instead of pressing on a DOM element
     * that is no longer the interaction surface.
     */
    __pydeeGestureBridge?: GestureBridge | null;
    /**
     * Every engine frame's timing, newest last.
     *
     * A ring buffer rather than a running average: a latency distribution's TAIL is what
     * a user notices, and an average hides it. Only the Skia path fills this — the SVG
     * renderer cannot attribute a frame from inside.
     */
    __pydeeFrameReports: Array<{
      inputLatencyMs: number;
      presentLatencyMs: number;
      frameDurationMs: number;
      readbackMs: number;
      wasmReadMs: number;
      uploadMs: number;
      coalescedSamples: number;
      patchCalls: number;
      nodesDrawn: number;
    }>;
    /** Per-stage timing of every committed command. */
    __pydeeCommitTimings: Array<{
      label: string;
      parseMs: number;
      applyMs: number;
      serialiseMs: number;
      totalMs: number;
      markupBytes: number;
      atMs: number;
    }>;
  }
}

window.__pydeeCommits = [];
window.__pydeeResizes = [];
window.__pydeeRotates = [];
window.__pydeeFrameReports = [];
window.__pydeeCommitTimings = [];
window.__pydeeEngineStatus = "none";
window.__pydeeShapeCommits = [];

/*
  `?editor=1` still means "EditorCanvas on the SVG renderer".

  It meant that for free while the engine was opt-in: `?renderer=skia` turned the
  engine on and its absence left the SVG path. The engine is now the DEFAULT, so the
  absence of `renderer` means the engine, and eleven specs that use `?editor=1` to
  measure the SVG path would silently have measured the engine instead — the same
  false-pass shape as pointing a Skia test at the dev server.

  `EditorCanvas` reads the flag straight from `window.location`, so the intent has to
  be written into the URL before React mounts. Done here, in one place, rather than in
  twenty call sites, and `__pydeeRenderer` below lets a spec assert which renderer it
  actually got instead of trusting this.
*/
const requestedRenderer = new URLSearchParams(window.location.search);
if (requestedRenderer.get("editor") === "1" && requestedRenderer.get("renderer") === null) {
  requestedRenderer.set("renderer", "svg");
  window.history.replaceState(null, "", `${window.location.pathname}?${requestedRenderer.toString()}`);
}

const params = new URLSearchParams(window.location.search);
const zoom = Number(params.get("zoom") ?? "1");
// `EditorCanvas` owns the engine; `SVGCanvas` is the plain compatibility renderer with
// no selection overlay. Either renderer value mounts EditorCanvas, which separates
// "EditorCanvas is the problem" from "the engine's re-renders are the problem".
const useEditorCanvas = params.get("renderer") === "skia" || params.get("editor") === "1";
/** Which renderer the editor will actually resolve for this page. */
window.__pydeeRenderer = params.get("renderer") === "svg" ? "svg" : "skia";
/** Which layer the selection overlay should show handles for. */
const selectedLayerId = params.get("select");
/**
 * Snapping is OFF by default here.
 *
 * A coordinate-space measurement must not be perturbed by an alignment pull: a
 * snap of a few pixels is indistinguishable from a conversion error of a few
 * pixels. `?snap=1` turns it back on for tests that are about snapping.
 */
const snappingEnabled = params.get("snap") === "1";
/**
 * `?objects=N` pads the artboard with N extra shapes.
 *
 * A one-rectangle fixture cannot show the cost the SVG renderer actually pays: the
 * browser re-rasters the layer subtree each time an attribute changes, and that cost
 * scales with how much is in it. Measuring smoothness on a single rect measures
 * nothing about a real design.
 */
const extraObjects = Math.max(0, Number(params.get("objects") ?? "0") | 0);
/**
 * `?artboard=N` renders an N x N artboard instead of the default 400.
 *
 * The real editor's default document is 1080x1080 — 7.3 times the fixture's area — and the
 * engine's dominant per-frame cost is reading the surface back, which is proportional to
 * pixel count. A benchmark on a 400x400 fixture therefore understates it by that factor,
 * so the size has to be a variable rather than a constant.
 *
 * The fixture's own layers keep their coordinates and stay in the top-left corner. Readback
 * cost depends on artboard AREA, not on where content sits, and keeping them put means
 * every existing spec's probe positions are unaffected.
 */
const artboardSize = Math.max(64, Number(params.get("artboard") ?? String(ARTBOARD)) | 0);
/**
 * `?content=heavy` adds gradients, text at three sizes, and a group of bezier paths.
 *
 * Four small rects are the right fixture for finding geometry defects and the wrong one for
 * benchmarking: they exercise no gradient resolution, almost no text shaping, no layer
 * isolation and no path parsing.
 */
const heavy = params.get("content") === "heavy";

/**
 * The fixture markup, resized and padded according to the query.
 *
 * Done as string surgery on the canonical markup rather than by building a second fixture,
 * so there is exactly one definition of the layers every other spec depends on.
 */
function buildComposedSvg(): string {
  let markup = COMPOSED_SVG;
  if (artboardSize !== ARTBOARD) {
    markup = markup
      .replace(`width="${ARTBOARD}" height="${ARTBOARD}"`, `width="${artboardSize}" height="${artboardSize}"`)
      .replace(`viewBox="0 0 ${ARTBOARD} ${ARTBOARD}"`, `viewBox="0 0 ${artboardSize} ${artboardSize}"`);
  }
  if (heavy) {
    markup = markup.replace("<defs></defs>", `<defs>${HEAVY_DEFS}</defs>`);
    // Prepended, so the gradient background sits BEHIND the fixture layers rather than
    // covering the shapes every other spec probes for.
    markup = markup.replace(
      '<g data-role="shapes" data-editable="true" data-layer-id="target">',
      `${heavyContent(artboardSize)}\n<g data-role="shapes" data-editable="true" data-layer-id="target">`,
    );
  }
  if (extraObjects > 0) {
    markup = markup.replace("</svg>", `${paddingLayers(extraObjects, artboardSize)}\n</svg>`);
  }
  return markup;
}

function paddingLayers(count: number, size: number): string {
  const parts: string[] = [];
  const span = Math.max(1, size - 40);
  for (let index = 0; index < count; index += 1) {
    let x = 8 + ((index * 17) % span);
    let y = 8 + ((index * 29) % span);
    /*
      Keep clear of `target`.

      Padding is meant to make the SCENE heavier, not to change which object a press
      lands on — and hit testing answers that by depth, so a pad ellipse sitting over
      the target's centre silently made the gesture drag the ellipse instead. Every
      measurement that then watched the target's position reported that nothing moved.
      Found by inputLatency.spec.ts, where 40 of 40 trials missed at objects=200 and
      none did at objects=1.
    */
    if (x > 82 && x < 198 && y > 82 && y < 178) {
      x = 8 + ((x + 200) % span);
      y = 8 + ((y + 190) % span);
    }
    const hue = (index * 37) % 360;
    parts.push(
      `<g data-role="shapes" data-editable="true" data-layer-id="pad-${index}">`
        + `<ellipse data-field="shape" data-element-id="pad-${index}-el" cx="${x}" cy="${y}" rx="9" ry="6" `
        + `fill="hsl(${hue} 70% 60%)" stroke="#1e293b" stroke-width="0.75"/>`
        + `</g>`,
    );
  }
  return parts.join("\n");
}
/**
 * `?commit=1` makes the harness a real editing loop.
 *
 * Without it, `onLayerTransform` only records the delta, so the shape springs back
 * to its document position the moment the preview is released — which hides
 * whether the committed delta was in the right space. With it, the commit runs the
 * genuine pipeline the editor uses:
 *
 *   composedSVG -> artboardFromDesignOutput -> translateLayerCommand
 *               -> serializeArtboard -> composedSVG
 *
 * so "does the shape jump when I let go?" becomes an assertable question.
 */
const applyCommits = params.get("commit") === "1";

const viewport = { zoom, panX: 0, panY: 0 };

function recordCommit(layerId: string, dx: number, dy: number): void {
  window.__pydeeCommits.push({ layerId, dx, dy });
}

/**
 * The harness root, so a commit can change the document and re-render.
 *
 * Kept as a component rather than module state because the whole point is that
 * React re-renders the canvas from the new markup — which is also what destroys
 * and rebuilds the SVG subtree mid-gesture, the behaviour `editorDragParity`
 * depends on.
 */
function Harness(): JSX.Element {
  const [output, setOutput] = useState<DesignOutput>(() => ({
    ...designOutput,
    composedSVG: buildComposedSvg(),
  }));
  /**
   * Viewport and selection as STATE, driven from `window` by the tests.
   *
   * Phase 1 of the single-canvas migration requires the canvas element to survive a
   * selection change, a zoom, a pan and a commit. Changing those through the URL
   * would reload the page and destroy the canvas trivially, which would prove
   * nothing — so they have to be changeable in place.
   */
  const [liveViewport, setLiveViewport] = useState(viewport);
  const [liveSelection, setLiveSelection] = useState<string | null>(selectedLayerId);

  useEffect(() => {
    window.__pydeeSetViewport = (zoom, panX, panY) => {
      setLiveViewport({ zoom, panX, panY });
    };
    window.__pydeeSelect = (layerId) => {
      setLiveSelection(layerId);
    };
  }, []);
  /** Applied commands, newest last, so `__pydeeUndo` can walk backwards. */
  const undoStack = useRef<Command[]>([]);

  /**
   * Run a command through the real document pipeline.
   *
   * Every gesture commits the same way the editor does — command applied to a
   * `CreativeDocument`, then re-serialised to canonical SVG — so a wrong
   * coordinate space shows up as the shape moving when it should not.
   */
  const dispatch = useCallback((command: Command): void => {
    if (!applyCommits) {
      return;
    }
    /*
      Timed per STAGE, not as one number.

      The gesture-end hitch is the sum of a chain — parse the canonical SVG into an
      artboard, apply the command, serialise back to markup, hand it to React, let the
      renderer re-extract and re-upload — and "the commit is slow" is not an actionable
      finding. Attributing it is. `parseMs` and `serialiseMs` are measured here because
      they happen synchronously in this call; everything downstream is measured from the
      test as a frame gap, because it spans React and the renderer.
    */
    const startedMs = performance.now();
    setOutput((previous) => {
      const parseStartedMs = performance.now();
      const artboard = artboardFromDesignOutput(previous);
      const appliedStartedMs = performance.now();
      const applied = command.apply({
        schemaVersion: 1,
        name: "harness",
        pages: [{ id: "page-1", name: "Page 1", artboards: [artboard] }],
        activePageId: "page-1",
        activeArtboardId: artboard.id,
      });
      const serialiseStartedMs = performance.now();
      const composedSVG = serializeArtboard(applied.pages[0].artboards[0]);
      const finishedMs = performance.now();
      window.__pydeeCommitTimings.push({
        label: command.type,
        parseMs: appliedStartedMs - parseStartedMs,
        applyMs: serialiseStartedMs - appliedStartedMs,
        serialiseMs: finishedMs - serialiseStartedMs,
        totalMs: finishedMs - startedMs,
        markupBytes: composedSVG.length,
        atMs: finishedMs,
      });
      return { ...previous, composedSVG };
    });
    undoStack.current.push(command);
  }, []);

  const undo = useCallback((): boolean => {
    const command = undoStack.current.pop();
    if (command === undefined) {
      return false;
    }
    setOutput((previous) => {
      const artboard = artboardFromDesignOutput(previous);
      const reverted = command.undo({
        schemaVersion: 1,
        name: "harness",
        pages: [{ id: "page-1", name: "Page 1", artboards: [artboard] }],
        activePageId: "page-1",
        activeArtboardId: artboard.id,
      });
      return { ...previous, composedSVG: serializeArtboard(reverted.pages[0].artboards[0]) };
    });
    return true;
  }, []);

  useEffect(() => {
    window.__pydeeUndo = undo;
  }, [undo]);

  /*
    Republished on every document change, not captured once at mount.

    A closure created in a mount-only effect keeps returning the FIRST render's
    markup — the same stale-closure shape that made a commit read a pre-gesture
    bounds and shrink the shape by 99px. Depending on `output` here means a test
    that asks for the markup after a commit gets the markup after that commit.
  */
  useEffect(() => {
    window.__pydeeMarkup = () => output.composedSVG;
    window.__pydeeUndoDepth = () => undoStack.current.length;
  }, [output]);

  const handleTransform = useCallback(
    (layerId: string, dx: number, dy: number): void => {
      recordCommit(layerId, dx, dy);
      dispatch(translateLayerCommand(layerId, dx, dy));
    },
    [dispatch],
  );

  const handleResize = useCallback(
    (layerId: string, prev: ResizeSnapshot, next: ResizeSnapshot): void => {
      window.__pydeeResizes.push({ layerId, prev, next });
      dispatch(resizeLayerCommand(layerId, prev, next));
    },
    [dispatch],
  );

  const handleRotate = useCallback(
    (layerId: string, prev: RotateSnapshot, next: RotateSnapshot): void => {
      window.__pydeeRotates.push({ layerId, prev, next });
      dispatch(rotateLayerCommand(layerId, prev, next));
    },
    [dispatch],
  );

  return (
    <div
      id="harness-host"
      style={{ position: "relative", width: 1200, height: 900, overflow: "hidden" }}
    >
      {useEditorCanvas ? (
        <EditorCanvas
          designOutput={output}
          activeLayer={liveSelection ?? "target"}
          selection={{ layerIds: liveSelection === null ? [] : [liveSelection] }}
          viewport={liveViewport}
          snappingEnabled={snappingEnabled}
          onLayerSelect={() => undefined}
          onLayerTextUpdate={() => undefined}
          onLayerTransform={handleTransform}
          onResizeSnapshot={handleResize}
          onRotate={handleRotate}
          onHitTester={(hitTest) => {
            window.__pydeeHitTest = hitTest ?? undefined;
          }}
          onGestureBridge={(bridge) => {
            window.__pydeeGestureBridge = bridge;
          }}
          onEngineStatus={(status) => {
            window.__pydeeEngineStatus = status.kind;
          }}
          onShapeCreateBridge={(bridge) => {
            if (bridge === null) {
              window.__pydeeShapeCreate = undefined;
              return;
            }
            /*
              The real session, driven through the real bridge.

              Client -> document conversion goes through the bridge's own
              `clientToDocument`, which reads the canvas's live rect — so a test at any
              zoom presses at screen coordinates and the outline appears in the right
              place without the test knowing the viewport transform.

              No snapping here: the harness has snapping off by default for the same
              reason every coordinate measurement does, since a few pixels of alignment
              pull is indistinguishable from a few pixels of conversion error.
            */
            const session = createShapeCreateSession({
              bridge,
              toDocument: (clientX, clientY) => bridge.clientToDocument(clientX, clientY),
              onCommit: (outline, shapeType) => {
                window.__pydeeShapeCommits.push({
                  shapeType,
                  d: outline.d,
                  bounds: { ...outline.bounds },
                });
              },
            });
            const modifiers = (shift?: boolean, alt?: boolean) => ({
              preserveAspect: shift === true,
              fromCenter: alt === true,
            });
            window.__pydeeShapeCreate = {
              down: (shapeType, clientX, clientY) =>
                session.pointerDown(shapeType, clientX, clientY, {
                  fillArgb: 0xff3b82f6,
                  strokeArgb: 0xff1d4ed8,
                  strokeWidth: 1,
                }),
              move: (clientX, clientY, shift, alt) =>
                session.pointerMove(clientX, clientY, modifiers(shift, alt)),
              up: (clientX, clientY, shift, alt) =>
                session.pointerUp(clientX, clientY, modifiers(shift, alt)),
              cancel: () => session.cancel(),
              phase: () => session.snapshot().phase,
              outline: () => {
                const current = session.snapshot().outline;
                return current === null
                  ? null
                  : { kind: current.kind, d: current.d, bounds: { ...current.bounds } };
              },
            };
          }}
          onFrameReport={(frameReport) => {
            // Bounded, so a long session cannot grow without limit while still keeping
            // enough history for a percentile to mean something.
            if (window.__pydeeFrameReports.length > 2000) {
              window.__pydeeFrameReports.shift();
            }
            window.__pydeeFrameReports.push(frameReport);
          }}
        />
      ) : (
        <SVGCanvas
          designOutput={output}
          activeLayer="target"
          viewport={liveViewport}
          snappingEnabled={snappingEnabled}
          onLayerSelect={() => undefined}
          onLayerTextUpdate={() => undefined}
          onLayerTransform={handleTransform}
        />
      )}
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);

root.render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
