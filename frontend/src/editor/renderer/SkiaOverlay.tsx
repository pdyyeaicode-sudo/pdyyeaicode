"use client";

/**
 * SkiaOverlay — renders the current document through the Skia/WASM engine and
 * paints the result over the canvas for comparison.
 *
 * This is the dual-renderer stage (spec §80 stage 10: remove the old renderer
 * only after parity is verified). The SVG DOM renderer stays mounted and remains
 * the source of all interaction; this overlay is purely visual and is
 * `pointer-events: none`, so selection, dragging and inline text editing behave
 * exactly as they do without it.
 *
 * It is inert unless `/editor?renderer=skia` is set, and renders nothing when the
 * engine artifact is missing, so a checkout that never built the engine is
 * unaffected.
 *
 * Text is a two-pass process, and the ordering matters:
 *
 *   1. Fonts are registered with the surface.
 *   2. The scene is re-extracted using the engine's own shaped metrics, so text
 *      bounds come from the same shaping that paints the glyphs.
 *
 * Everything the engine reports is surfaced rather than discarded: draw counts,
 * culled nodes, isolated layers, unresolved text, unsupported node kinds,
 * unresolved paints and missing font families. An overlay that quietly omitted
 * text would look like a rendering regression instead of an unimplemented
 * feature.
 *
 * One responsibility per file: the flag-gated Skia comparison overlay.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { artboardFromDesignOutput } from "../designOutputMapping";
import { InteractionEngine, type FrameStats } from "../interaction/InteractionEngine";
import { createEngineGestureBridge, type GestureBridge } from "../interaction/gestureBridge";
import {
  createEngineShapeCreateBridge,
  type ShapeCreateBridge,
} from "../interaction/shapeCreateBridge";
import type { GestureChannel } from "../interaction/gestureChannel";
import { IDENTITY } from "./matrix2d";
import type { Artboard, Viewport } from "../types/documentModel";
import type { DesignOutput } from "../../types";
import { findMissingFamilies, registerPublishedFonts } from "./engineFonts";
import { loadEngine, type PydeeSurfaceHandle } from "./engineLoader";
import { createEngineTextMetricsProvider } from "./engineTextMetrics";
import { collectTextFamilies } from "./renderScene";
import { encodeScene } from "./sceneCodec";
import { extractRenderScene } from "./sceneExtractor";

export interface SkiaOverlayProps {
  /**
   * The ORIGINAL canonical SVG, not the viewport-wrapped variant. The wrapper
   * adds a `<g data-viewport>` with no `data-role`, which would make the parser
   * synthesize layer ids and break id parity with the document. The overlay
   * applies pan and zoom itself through CSS.
   */
  readonly designOutput: DesignOutput | null;
  readonly viewport: Viewport;
  /**
   * Live drag gestures from the SVG renderer.
   *
   * When present, a drag is previewed by patching one node's transform through
   * the engine's frame loop — no scene re-upload, no React render per pointer
   * sample. When absent the overlay is still correct; it just only repaints when
   * the document changes.
   */
  readonly gestures?: GestureChannel;
  /**
   * Receives an engine hit-tester, or null when the surface is gone.
   *
   * This is how hit testing leaves the DOM: the owner asks the renderer what is
   * under a client point instead of reading `event.target`. Called with a stable
   * function, so the owner can hold it in a ref.
   */
  readonly onHitTester?: (hitTest: ((clientX: number, clientY: number) => string | null) | null) => void;
  /**
   * Receives the engine's gesture bridge, or null when the surface is gone.
   *
   * This is how resize and rotate leave the DOM. The overlay that owns the handles
   * calls `begin`/`update`/`end` and gets back the solved transform; the engine holds
   * the snapshot, does the matrix algebra and writes the result into the scene it is
   * about to paint. Published as a stable object so the owner can hold it in a ref.
   */
  readonly onGestureBridge?: (bridge: GestureBridge | null) => void;
  /**
   * The shape-creation bridge, published on the same terms as the gesture bridge.
   *
   * Null on unmount, and the running gesture is cancelled first: the outline lives in
   * the engine's scene, so an unpublished-but-live gesture would keep painting.
   */
  readonly onShapeCreateBridge?: (bridge: ShapeCreateBridge | null) => void;
  /**
   * Per-frame timing, for latency measurement.
   *
   * The engine's own `inputLatencyMs` stops when `render` returns, which is not when
   * anything is visible: the pixels still have to be read out of the surface and
   * written into the canvas. `presentLatencyMs` measures to the end of THAT, which is
   * the last moment this code controls — the compositor's presentation step is not
   * observable from a page, so it is excluded and said to be excluded rather than
   * folded in silently.
   */
  readonly onFrameReport?: (report: EngineFrameReport) => void;
  /**
   * Per-upload timing, once per document change.
   *
   * Separate from `onFrameReport` because the two answer different questions: a frame's
   * cost decides whether a drag is smooth, and an upload's cost decides whether
   * RELEASING the drag stutters. Averaging them together hides the second entirely.
   */
  readonly onUploadReport?: (report: EngineUploadReport) => void;
  /**
   * Overlay chrome drawn INSIDE the shared pan/zoom transform.
   *
   * Anything here is positioned in document coordinates and lands on exactly the
   * pixel the engine drew, because it is not separately transformed. This is the seam
   * the selection canvas mounts into.
   */
  readonly selectionLayer?: JSX.Element | null;
  /**
   * Whether the engine is actually PAINTING, reported on every change.
   *
   * This exists because the flag and the fact are different things. `EditorCanvas`
   * hides the SVG design objects so the canvas is the only visual surface — but if the
   * WASM artifact is missing, the module fails to fetch, or the surface allocation
   * fails, nothing paints and hiding the DOM leaves a BLANK canvas. Asking for the
   * engine cannot be allowed to mean losing the document.
   *
   * `ready` is emitted from inside the frame loop, immediately after the first
   * `putImageData` — so it means "pixels are on screen", not "the module resolved".
   */
  readonly onEngineStatus?: (status: EngineStatus) => void;
}

/** What the engine is currently doing, in the only terms a caller needs. */
export interface EngineStatus {
  readonly kind: "loading" | "ready" | "unavailable" | "error";
  readonly detail: string;
}

/**
 * One frame's timing, decomposed.
 *
 * Reported rather than summarised, so a regression can be attributed to a stage
 * instead of showing up as "it got slower". `coalescedSamples` matters as much as the
 * latency: a frame that folded four pointer samples into one paint is doing the right
 * thing, and a frame that folded forty means input is outpacing the display.
 */
export interface EngineFrameReport {
  /** Newest pointer sample -> `render` returned. */
  readonly inputLatencyMs: number;
  /** Newest pointer sample -> pixels handed to the canvas. Excludes compositing. */
  readonly presentLatencyMs: number;
  /** Time inside `render` alone. */
  readonly frameDurationMs: number;
  /** Time spent reading the surface back and writing it into the canvas. */
  readonly readbackMs: number;
  /**
   * Time inside `readPixels`, which happens in WASM.
   *
   * Split out from `uploadMs` because the two have completely different fixes. This one
   * is Skia converting the surface's premultiplied pixels to unpremultiplied RGBA and
   * copying them into a buffer — per-pixel work in WebAssembly.
   */
  readonly wasmReadMs: number;
  /**
   * Time handing those pixels to the canvas: one `set` plus `putImageData`.
   *
   * Browser-side work. `putImageData` converts back to the canvas's own premultiplied
   * format, so the round trip unpremultiplies and re-premultiplies every pixel.
   */
  readonly uploadMs: number;
  readonly coalescedSamples: number;
  readonly patchCalls: number;
  readonly nodesDrawn: number;
  /**
   * Pixels actually repainted and copied this frame.
   *
   * The ratio of this to the artboard's area is the whole benefit of damage tracking, and
   * it is reported rather than derived so a frame that quietly fell back to a full repaint
   * is visible as a number instead of as unexplained slowness.
   */
  readonly damagedPixels: number;
}

/**
 * What one scene upload cost, stage by stage.
 *
 * This runs once per document change, not once per frame, and it is where the
 * gesture-end hitch lives: every stage is proportional to the size of the WHOLE
 * document rather than to what actually changed. Measured on a 200-object artboard, a
 * commit froze the page for 233ms and only 30ms of that was the document pipeline — so
 * without this breakdown the remaining 200ms is unattributable.
 */
export interface EngineUploadReport {
  /** Registering fonts. Cached after the first upload, so normally near zero. */
  readonly fontsMs: number;
  /** Parsing the artboard's `<defs>` into paint servers, in C++. */
  readonly defsMs: number;
  /** Canonical-SVG artboard -> RenderScene, including text measurement. */
  readonly extractMs: number;
  /** RenderScene -> binary wire buffer. */
  readonly encodeMs: number;
  /** Handing the buffer to the engine and decoding it there. */
  readonly loadSceneMs: number;
  /** The whole upload, from the effect starting to the scene being live. */
  readonly totalMs: number;
  readonly sceneBytes: number;
}

/** Everything worth showing about a frame the engine produced. */interface OverlayReport {
  readonly kind: "loading" | "ready" | "unavailable" | "error";
  readonly detail: string;
  readonly nodesDrawn: number;
  readonly nodesCulled: number;
  readonly layersOpened: number;
  readonly unresolvedText: number;
  readonly skippedNodes: readonly string[];
  readonly missingFonts: readonly string[];
  readonly unsupportedPaints: number;
  /** Gradients the engine parsed out of the artboard's `<defs>`. */
  readonly paintServers: number;
  /** Paint servers in the defs the engine could not represent. */
  readonly unsupportedPaintServers: number;
  /** `url(#id)` paints in the scene that no defs entry resolved. */
  readonly unresolvedPaintReferences: number;
  /** Paints the engine drew with a documented approximation. */
  readonly approximatedPaints: number;
  /** Path data the engine could not parse. */
  readonly unparsablePaths: number;
  /** Milliseconds the last engine frame took, from the frame loop. */
  readonly frameMs: number;
}

const EMPTY_REPORT: OverlayReport = {
  kind: "loading",
  detail: "loading engine",
  nodesDrawn: 0,
  nodesCulled: 0,
  layersOpened: 0,
  unresolvedText: 0,
  skippedNodes: [],
  missingFonts: [],
  unsupportedPaints: 0,
  paintServers: 0,
  unsupportedPaintServers: 0,
  unresolvedPaintReferences: 0,
  approximatedPaints: 0,
  unparsablePaths: 0,
  frameMs: 0,
};

export function SkiaOverlay({
  designOutput,
  viewport,
  gestures,
  onHitTester,
  onGestureBridge,
  onShapeCreateBridge,
  onFrameReport,
  onUploadReport,
  selectionLayer,
  onEngineStatus,
}: SkiaOverlayProps): JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<PydeeSurfaceHandle | null>(null);
  const interactionRef = useRef<InteractionEngine | null>(null);
  /**
   * Mirrored so the paint closure never has to be rebuilt when the consumer changes.
   *
   * The frame callback is created inside the scene-loading effect; making it depend on
   * a prop would re-run the whole upload — fonts, defs, extract, encode, loadScene —
   * every time a measurement consumer re-rendered.
   */
  const onFrameReportRef = useRef(onFrameReport);
  onFrameReportRef.current = onFrameReport;
  const onUploadReportRef = useRef(onUploadReport);
  onUploadReportRef.current = onUploadReport;
  const [report, setReport] = useState<OverlayReport>(EMPTY_REPORT);

  /*
    Status published on CHANGE, not on every frame.

    `report` is replaced on every painted frame, so calling the consumer from the render
    body would fire it sixty times a second and re-render the editor with it. Only the
    kind and detail are of interest to a caller deciding whether the DOM design objects
    can be hidden, and those change a handful of times per session.
  */
  const onEngineStatusRef = useRef(onEngineStatus);
  onEngineStatusRef.current = onEngineStatus;
  useEffect(() => {
    onEngineStatusRef.current?.({ kind: report.kind, detail: report.detail });
  }, [report.kind, report.detail]);

  /**
   * Follow live drags.
   *
   * Subscribed once, keyed only on the channel, so the listener survives every
   * scene reload. It reads `interactionRef` at event time rather than closing
   * over an engine instance, because the engine is replaced when the artboard
   * size changes and a stale reference would silently stop previewing.
   *
   * The offset is handed to the engine in DOCUMENT pixels and the engine
   * resolves the ancestor transform chain, so a node inside a rotated or scaled
   * group tracks the pointer exactly.
   */
  useEffect(() => {
    if (gestures === undefined) {
      return undefined;
    }
    return gestures.subscribe((event) => {
      const engine = interactionRef.current;
      if (engine === null) {
        return;
      }
      switch (event.phase) {
        case "begin":
          // The base transform is unused on this path: the engine translates
          // relative to the transform the scene was loaded with.
          engine.beginGesture([{ layerId: event.layerId, baseTransform: IDENTITY }]);
          break;
        case "move":
          engine.setTransientTranslation(event.layerId, event.dx, event.dy);
          break;
        case "end":
          // The offset stays applied. The document commit that follows triggers
          // a re-extract, which replaces the transient transform with real
          // geometry — so there is no frame where the layer snaps back.
          engine.endGesture();
          break;
        case "cancel":
          engine.cancelGesture();
          break;
      }
    });
  }, [gestures]);

  // Parsing the canonical SVG is the expensive step, so it is keyed on the
  // markup itself rather than redone on every pan or zoom.
  const artboard = useMemo<Artboard | { readonly error: string } | null>(() => {
    if (designOutput === null) {
      return null;
    }
    try {
      return artboardFromDesignOutput(designOutput);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [designOutput]);

  useEffect(() => {
    let disposed = false;

    async function draw(): Promise<void> {
      if (artboard === null) {
        return;
      }
      if ("error" in artboard) {
        setReport({ ...EMPTY_REPORT, kind: "error", detail: artboard.error });
        return;
      }

      // Timed from here, so the report covers the whole upload rather than only the
      // parts that turned out to be cheap.
      const uploadStartedMs = performance.now();

      const loaded = await loadEngine();
      if (disposed) {
        return;
      }
      if (loaded.status !== "ready") {
        setReport({ ...EMPTY_REPORT, kind: "unavailable", detail: loaded.reason });
        return;
      }

      const canvas = canvasRef.current;
      if (canvas === null) {
        return;
      }

      const width = Math.max(1, Math.round(artboard.width));
      const height = Math.max(1, Math.round(artboard.height));

      // Recreate the surface only when the artboard size changes. Emscripten
      // objects are not garbage collected, so the old one is explicitly deleted.
      let surface = surfaceRef.current;
      if (surface === null || surface.width() !== width || surface.height() !== height) {
        surface?.delete();
        interactionRef.current?.dispose();
        interactionRef.current = null;
        surface = new loaded.engine.PydeeSurface(width, height);
        surfaceRef.current = surface;
      }
      if (!surface.isValid()) {
        setReport({ ...EMPTY_REPORT, kind: "error", detail: "engine surface allocation failed" });
        return;
      }

      // Fonts first: text measurement and drawing both depend on them.
      const fontsStartedMs = performance.now();
      const fontReport = await registerPublishedFonts(surface);
      if (disposed) {
        return;
      }
      const defsStartedMs = performance.now();

      // Paint servers next, so `url(#id)` fills resolve when the scene loads.
      // The engine parses the markup itself; nothing here interprets a gradient.
      const defsError = surface.loadDefs(artboard.defs, artboard.width, artboard.height);
      if (defsError !== "") {
        setReport({ ...EMPTY_REPORT, kind: "error", detail: `defs: ${defsError}` });
        return;
      }
      const extractStartedMs = performance.now();

      // Extract with the engine's shaped metrics so text bounds match the
      // painted glyphs exactly instead of being reported as unmeasured.
      const scene = extractRenderScene(artboard, {
        textMetrics: createEngineTextMetricsProvider(surface),
      });
      const encodeStartedMs = performance.now();
      const encoded = encodeScene(scene);
      const loadStartedMs = performance.now();

      // A full re-extract is exactly what must never happen mid-drag, so the
      // interaction engine is told about it and reports a nonzero count if it
      // ever does.
      interactionRef.current?.noteSceneRebuild();

      const loadError = surface.loadScene(encoded.buffer);
      if (loadError !== "") {
        setReport({ ...EMPTY_REPORT, kind: "error", detail: loadError });
        return;
      }
      const loadedMs = performance.now();

      onUploadReportRef.current?.({
        fontsMs: defsStartedMs - fontsStartedMs,
        defsMs: extractStartedMs - defsStartedMs,
        extractMs: encodeStartedMs - extractStartedMs,
        encodeMs: loadStartedMs - encodeStartedMs,
        loadSceneMs: loadedMs - loadStartedMs,
        totalMs: loadedMs - uploadStartedMs,
        sceneBytes: encoded.buffer.length,
      });

      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (context === null) {
        setReport({ ...EMPTY_REPORT, kind: "error", detail: "2d context unavailable" });
        return;
      }

      const missingFonts = findMissingFamilies(surface, collectTextFamilies(scene));
      const fontFailures = fontReport.failures
        .map((failure) => `${failure.family} (${failure.reason})`)
        .join(", ");
      const activeSurface = surface;

      /*
        ONE ImageData for the surface's lifetime, reused every frame.

        Measured on a 400x400 artboard (browser-tests/inputLatency.spec.ts): the engine
        RENDERS in 0.7-2.3ms while the pixel handoff took 8ms — three to ten times the
        drawing. Allocating a fresh `Uint8ClampedArray` and `ImageData` per frame meant
        640KB of garbage every 16ms, and at a realistic 1080x1080 artboard it would be
        4.6MB per frame.

        Reusing the buffer removes the allocation. The two remaining copies — WASM heap
        into this buffer, then this buffer into the canvas — are inherent to reading a
        CPU surface back through a 2D context. Removing THOSE needs the engine to render
        into a GPU surface the canvas already owns, which is a renderer change rather
        than a tuning one and is not attempted here.
      */
      const frameImage = new ImageData(width, height);

      // Every paint goes through the interaction engine's frame loop, so a drag
      // and a document change share one coalesced path to the surface and React
      // is never in the hot path.
      const publish = (stats: FrameStats): void => {
        const readbackStartedMs = performance.now();

        /*
          A partial repaint is only worth anything if the READBACK is partial too.

          Reading the whole surface after a clipped render would keep the dominant cost —
          34ms per megapixel — while adding the bookkeeping. So the region the engine
          repainted is the region copied, and the canvas's own retained content is the rest
          of the frame.

          The rows are copied into the full-size `frameImage` at their real offsets, and
          `putImageData`'s dirty-rect form blits only that sub-rectangle. That reuses the one
          buffer, so a partial frame allocates nothing at all.
        */
        const damage = stats.damage;
        if (damage !== null) {
          const region = activeSurface.readPixelsRegion(
            damage.x,
            damage.y,
            damage.width,
            damage.height,
          );
          if (region === null || region.width <= 0 || region.height <= 0) {
            // The region resolved to nothing — entirely off-surface. Nothing to present,
            // and reported rather than blitting a stale buffer.
            onFrameReportRef.current?.({
              inputLatencyMs: stats.inputLatencyMs,
              presentLatencyMs: 0,
              frameDurationMs: stats.frameDurationMs,
              readbackMs: performance.now() - readbackStartedMs,
              wasmReadMs: performance.now() - readbackStartedMs,
              uploadMs: 0,
              coalescedSamples: stats.coalescedSamples,
              patchCalls: stats.patchCalls,
              nodesDrawn: stats.nodesDrawn,
              damagedPixels: 0,
            });
            return;
          }
          const readMs = performance.now();
          const destination = frameImage.data;
          const rowBytes = region.width * 4;
          for (let row = 0; row < region.height; row += 1) {
            const source = region.pixels.subarray(row * rowBytes, (row + 1) * rowBytes);
            destination.set(source, ((region.y + row) * width + region.x) * 4);
          }
          context.putImageData(
            frameImage,
            0,
            0,
            region.x,
            region.y,
            region.width,
            region.height,
          );
          const presentedMs = performance.now();

          onFrameReportRef.current?.({
            inputLatencyMs: stats.inputLatencyMs,
            presentLatencyMs: stats.sampleMs === 0 ? 0 : presentedMs - stats.sampleMs,
            frameDurationMs: stats.frameDurationMs,
            readbackMs: presentedMs - readbackStartedMs,
            wasmReadMs: readMs - readbackStartedMs,
            uploadMs: presentedMs - readMs,
            coalescedSamples: stats.coalescedSamples,
            patchCalls: stats.patchCalls,
            nodesDrawn: stats.nodesDrawn,
            damagedPixels: region.width * region.height,
          });
          return;
        }

        const pixels = activeSurface.readPixels();
        if (pixels === null) {
          setReport({ ...EMPTY_REPORT, kind: "error", detail: "pixel readback failed" });
          return;
        }
        const readMs = performance.now();
        // readPixels returns unpremultiplied RGBA, which is exactly ImageData's
        // format, so the buffer transfers without conversion.
        frameImage.data.set(pixels);
        context.putImageData(frameImage, 0, 0);
        const presentedMs = performance.now();

        // Reported before the React state update below, so a slow consumer of the
        // readout cannot be mistaken for a slow frame.
        onFrameReportRef.current?.({
          inputLatencyMs: stats.inputLatencyMs,
          presentLatencyMs: stats.sampleMs === 0 ? 0 : presentedMs - stats.sampleMs,
          frameDurationMs: stats.frameDurationMs,
          readbackMs: presentedMs - readbackStartedMs,
          wasmReadMs: readMs - readbackStartedMs,
          uploadMs: presentedMs - readMs,
          coalescedSamples: stats.coalescedSamples,
          patchCalls: stats.patchCalls,
          nodesDrawn: stats.nodesDrawn,
          damagedPixels: width * height,
        });

        setReport({
          kind: "ready",
          detail: fontFailures === "" ? "" : `font load failed: ${fontFailures}`,
          nodesDrawn: activeSurface.lastNodesDrawn(),
          nodesCulled: activeSurface.lastNodesCulled(),
          layersOpened: activeSurface.lastLayersOpened(),
          unresolvedText: activeSurface.lastUnresolvedText(),
          skippedNodes: encoded.skippedNodeIds,
          missingFonts,
          unsupportedPaints: encoded.diagnostics.filter(
            (diagnostic) => diagnostic.code === "engine-unsupported-paint",
          ).length,
          paintServers: activeSurface.paintServerCount(),
          unsupportedPaintServers: activeSurface.unsupportedPaintServers(),
          unresolvedPaintReferences: activeSurface.unresolvedPaintReferences(),
          approximatedPaints: activeSurface.lastApproximatedPaints(),
          unparsablePaths: activeSurface.lastUnparsablePaths(),
          frameMs: stats.frameDurationMs,
        });
      };

      // The overlay draws the artboard at its native size; the stage applies pan
      // and zoom through CSS, exactly as it does for the SVG renderer.
      const view = {
        viewTransform: IDENTITY,
        pixelRatio: 1,
        backgroundColor: 0x00000000,
        useBackground: true,
      };

      if (interactionRef.current === null) {
        interactionRef.current = new InteractionEngine({
          surface: activeSurface,
          view,
          onFramePainted: publish,
        });
      } else {
        interactionRef.current.setView(view);
        interactionRef.current.setFramePaintedHandler(publish);
      }
      interactionRef.current.requestPaint();
    }

    void draw();
    return () => {
      disposed = true;
    };
  }, [artboard]);

  /**
   * Publish an engine hit-tester to the owner.
   *
   * Hit testing belongs to whatever RENDERED the pixels, which is why this lives
   * here rather than being reimplemented against the DOM. The engine's `hitTest`
   * walks the same scene, in reverse paint order, with the same world transforms it
   * drew with — so a click cannot resolve to a different object than the one under
   * the cursor. `sceneHitTest.ts` is the TypeScript mirror and the parity suite holds
   * the two to the same answers at twelve sample points.
   *
   * Client -> document needs no knowledge of zoom or pan. The canvas is drawn at the
   * artboard's native size with an IDENTITY view transform and then CSS-scaled by the
   * stage, so the ratio of its backing store to its displayed rect IS the effective
   * scale, and its rect is where it actually landed on screen. Reading both from the
   * element is exact and survives any future change to how the stage applies zoom.
   *
   * The callback is created once and reads refs, so it never needs re-publishing and
   * cannot go stale. It returns null until the surface exists.
   */
  const hitTest = useCallback((clientX: number, clientY: number): string | null => {
    const surface = surfaceRef.current;
    const canvas = canvasRef.current;
    if (surface === null || canvas === null) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    const documentX = ((clientX - rect.left) * canvas.width) / rect.width;
    const documentY = ((clientY - rect.top) * canvas.height) / rect.height;
    if (!Number.isFinite(documentX) || !Number.isFinite(documentY)) {
      return null;
    }
    const id = surface.hitTest(documentX, documentY);
    return id === "" ? null : id;
  }, []);

  useEffect(() => {
    onHitTester?.(hitTest);
    return () => {
      // Withdrawn on unmount so the owner falls back to the DOM path rather than
      // calling into a disposed surface.
      onHitTester?.(null);
    };
  }, [onHitTester, hitTest]);

  /**
   * The engine's gesture bridge, built once and reading refs.
   *
   * Everything it needs is fetched at call time, so the surface can be recreated for
   * a new artboard size without the overlay having to republish anything — and a
   * gesture can never hold a reference to a deleted WASM object.
   *
   * `requestPaint` rather than a transform push: `updateTransformGesture` has already
   * written the solved transform into the scene, so the only thing left is asking the
   * frame loop for a paint. That keeps the loop the single paint path.
   */
  const gestureBridge = useMemo<GestureBridge>(
    () =>
      createEngineGestureBridge({
        surface: () => surfaceRef.current,
        canvas: () => canvasRef.current,
        requestPaint: () => interactionRef.current?.requestPaint(),
        // Marks a gesture as running with NO targets, deliberately: the engine owns
        // the transforms now, so handing them to the interaction engine as well would
        // give two writers to one node. The empty gesture still makes
        // `sceneRebuildsDuringGesture` count a mid-gesture re-upload, which is the
        // regression that must stay impossible.
        noteGestureStart: () => interactionRef.current?.beginGesture([]),
        noteGestureEnd: () => interactionRef.current?.endGesture(),
      }),
    [],
  );

  useEffect(() => {
    onGestureBridge?.(gestureBridge);
    return () => {
      onGestureBridge?.(null);
    };
  }, [onGestureBridge, gestureBridge]);

  /**
   * The shape-creation bridge, alongside the transform one.
   *
   * A separate object rather than more methods on `GestureBridge`, because the two
   * gestures differ in what they are anchored to: a transform gesture holds an immutable
   * snapshot of an EXISTING node, while a creation gesture has no node until it produces
   * one and its geometry changes on every frame. One interface covering both would have
   * to lie about what it holds for half its methods.
   *
   * `requestPaint` for the same reason as above: the engine has already mutated its own
   * scene by the time the bridge returns, so the only thing left is asking the frame
   * loop for a paint. The loop stays the single paint path.
   */
  const shapeCreateBridge = useMemo<ShapeCreateBridge>(
    () =>
      createEngineShapeCreateBridge({
        surface: () => surfaceRef.current,
        canvas: () => canvasRef.current,
        requestPaint: () => interactionRef.current?.requestPaint(),
      }),
    [],
  );

  useEffect(() => {
    onShapeCreateBridge?.(shapeCreateBridge);
    return () => {
      // Cancelled on unmount, not merely unpublished: the ephemeral node lives in the
      // engine's scene, and leaving it there would paint an outline for a gesture whose
      // handler is gone.
      shapeCreateBridge.cancel();
      onShapeCreateBridge?.(null);
    };
  }, [onShapeCreateBridge, shapeCreateBridge]);

  // Release the WASM object when the overlay unmounts.
  useEffect(() => {
    return () => {
      interactionRef.current?.dispose();
      interactionRef.current = null;
      surfaceRef.current?.delete();
      surfaceRef.current = null;
    };
  }, []);

  if (artboard === null) {
    return null;
  }

  return (
    <div
      data-role="skia-overlay"
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 5,
      }}
    >
      <div
        data-role="skia-stage"
        style={{
          /*
            ONE transform for both canvases.

            The design canvas and the selection canvas must share the pan/zoom
            transform exactly, or the selection drifts from the object at some zoom —
            the class of bug this whole migration removes. Putting the transform on a
            shared parent makes that structural: there is only one transform, so there
            is nothing to keep in sync.
          */
          position: "relative",
          width: "error" in artboard ? 1 : Math.max(1, Math.round(artboard.width)),
          height: "error" in artboard ? 1 : Math.max(1, Math.round(artboard.height)),
          transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
          /*
            `0 0`, matching `.svg-canvas-wrapper`.

            This was `center center`, which put the two surfaces in DIFFERENT places at
            every zoom but 1. Flex-centred, a 400px artboard in a 1200px host starts at
            x=400; scaling about `0 0` leaves that edge put, so document x=100 lands at
            400 + 100*zoom. Scaling about the centre instead holds the CENTRE put, so
            the same point lands at 400 + 200 - 200*zoom + 100*zoom. At zoom 2 those are
            600 and 400 — 200px apart, and 600px apart at zoom 4. Measured, not
            reasoned: `rendererDocumentParity.spec.ts` reports the numbers.

            It was invisible because the engine path hides the DOM chrome, so nothing
            drawn from the DOM geometry was on screen to disagree with. Anything still
            positioned in the DOM — the inline text editor above all — would have been
            placed by exactly that error.
          */
          transformOrigin: "0 0",
        }}
      >
        <canvas ref={canvasRef} data-role="skia-canvas" style={{ display: "block" }} />
        {selectionLayer}
      </div>
      <EngineReadout report={report} />
    </div>
  );
}

/**
 * Compact readout of what the engine actually did with the frame.
 *
 * Additive and confined to the overlay: it appears only when the Skia renderer is
 * explicitly enabled, and it changes nothing about the editor's own layout.
 */
function EngineReadout({ report }: { readonly report: OverlayReport }): JSX.Element {
  const gaps: string[] = [];
  if (report.unresolvedText > 0) {
    gaps.push(`${report.unresolvedText} text without font`);
  }
  if (report.missingFonts.length > 0) {
    gaps.push(`fonts missing: ${report.missingFonts.join(", ")}`);
  }
  if (report.skippedNodes.length > 0) {
    gaps.push(`${report.skippedNodes.length} node(s) unsupported`);
  }
  if (report.unsupportedPaints > 0) {
    gaps.push(`${report.unsupportedPaints} paint(s) unparsable`);
  }
  if (report.unresolvedPaintReferences > 0) {
    gaps.push(`${report.unresolvedPaintReferences} url(#…) unresolved`);
  }
  if (report.unsupportedPaintServers > 0) {
    gaps.push(`${report.unsupportedPaintServers} paint server(s) unsupported`);
  }
  if (report.approximatedPaints > 0) {
    gaps.push(`${report.approximatedPaints} paint(s) approximated`);
  }
  if (report.unparsablePaths > 0) {
    gaps.push(`${report.unparsablePaths} path(s) unparsable`);
  }

  const healthy = report.kind === "ready" && gaps.length === 0 && report.detail === "";

  return (
    <span
      data-role="skia-overlay-status"
      style={{
        position: "absolute",
        bottom: 4,
        left: 6,
        maxWidth: "min(90%, 640px)",
        font: "11px ui-monospace, SFMono-Regular, Menlo, monospace",
        lineHeight: 1.45,
        color: healthy ? "#0a7" : "#c04000",
        background: "rgba(255,255,255,0.82)",
        padding: "2px 6px",
        borderRadius: 3,
        whiteSpace: "pre-wrap",
      }}
    >
      {report.kind === "ready"
        ? `skia: ${report.nodesDrawn} drawn · ${report.nodesCulled} culled · ${report.layersOpened} layer(s) · ${report.paintServers} gradient(s) · ${report.frameMs.toFixed(1)}ms`
        : `skia: ${report.kind}${report.detail === "" ? "" : ` — ${report.detail}`}`}
      {report.kind === "ready" && report.detail !== "" ? `\n${report.detail}` : ""}
      {gaps.length > 0 ? `\nnot yet rendered: ${gaps.join(" · ")}` : ""}
    </span>
  );
}
