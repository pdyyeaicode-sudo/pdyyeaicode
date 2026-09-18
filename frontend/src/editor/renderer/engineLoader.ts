/**
 * engineLoader — lazily loads the compiled Pydee WASM engine.
 *
 * The module is fetched on first use, never as part of the initial bundle: it is
 * a multi-megabyte artifact and the default renderer does not need it.
 *
 * Failure is a first-class outcome. The artifact is a build output that is not
 * committed, so a checkout without it must degrade to the SVG renderer rather
 * than throw. `loadEngine` therefore resolves to a discriminated result instead
 * of rejecting, and the failure is logged exactly once.
 *
 * The TypeScript interface here is the whole engine API surface. It mirrors the
 * embind bindings in engine/wasm/bindings.cpp and deliberately contains no Skia
 * concept at all.
 *
 * One responsibility per file: loading and typing the engine module.
 */

import { ENGINE_MODULE_URL } from "./engineFlag";
import type { RectF } from "./matrix2d";

/** Which gesture the engine is running. Matches GestureKindName in gesture.cpp. */
export type EngineGestureKind = "move" | "resize" | "rotate";

/**
 * One solved gesture frame, as the engine reports it.
 *
 * `corners` are the resulting world corners in draw order, derived from the
 * snapshot's local bounds through the new world matrix — so selection chrome can
 * draw straight from this without repeating any transform mathematics. Null when the
 * result is degenerate, which is the signal to draw nothing rather than a guess.
 */
export interface EngineGestureFrame {
  readonly ok: true;
  readonly kind: EngineGestureKind;
  readonly localTransform: {
    readonly a: number;
    readonly b: number;
    readonly c: number;
    readonly d: number;
    readonly e: number;
    readonly f: number;
  };
  readonly localBounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly angle: number;
  readonly worldDelta: { readonly dx: number; readonly dy: number };
  readonly pivot: { readonly x: number; readonly y: number };
  readonly corners: readonly { readonly x: number; readonly y: number }[] | null;
}

/** A failure is a reason, never a null, so a caller cannot mistake it for a frame. */
export type EngineGestureResult =
  | EngineGestureFrame
  | { readonly ok: false; readonly reason: string };

/**
 * The outcome of a partial repaint.
 *
 * A failure carries a reason rather than a null, so "nothing changed" and "I cannot tell
 * what changed" stay distinguishable — the first means skip the frame, the second means
 * repaint everything.
 */
export type EngineDamagedRender =
  | {
      readonly ok: true;
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly nodesDrawn: number;
      readonly nodesCulled: number;
    }
  | { readonly ok: false; readonly reason: string };

/** One node's selection geometry, in world (document) space. */export type EngineOrientedBounds =
  | {
      readonly ok: true;
      /** Draw order: top-left, top-right, bottom-right, bottom-left. */
      readonly corners: readonly { readonly x: number; readonly y: number }[];
      readonly center: { readonly x: number; readonly y: number };
      /** Derived from the corners, never stored, so it cannot drift from the box. */
      readonly angle: number;
      readonly flipped: boolean;
      readonly localBounds: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
      };
      readonly handles: Readonly<Record<string, { readonly x: number; readonly y: number }>>;
    }
  | { readonly ok: false; readonly reason: string };

/** What a point in a selection's neighbourhood is on. */
export type EngineHandleHit =
  | {
      readonly ok: true;
      /** "none" | "body" | "resize" | "rotate". */
      readonly region: string;
      /** The compass handle, or the corner a rotation zone belongs to. */
      readonly handle: string;
      readonly rotationControl: { readonly x: number; readonly y: number } | null;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * An outline the engine built, plus the box it exactly fills.
 *
 * `bounds` is MEASURED from `d` by Skia, not the box the caller asked for. The two
 * agree for every shape the builder produces — it normalises until they do — and
 * reporting the measurement rather than the request is what keeps a selection box
 * from being an assertion about geometry it never checked.
 */
export type EngineShapePreview =
  | {
      readonly ok: true;
      readonly kind: string;
      /** SVG path data in DOCUMENT coordinates. */
      readonly d: string;
      readonly bounds: RectF;
    }
  | { readonly ok: false; readonly reason: string };

/** One render session bound to an offscreen surface. */
export interface PydeeSurfaceHandle {
  isValid(): boolean;
  width(): number;
  height(): number;
  /** Upload a scene. Returns "" on success, or the decoder's reason. */
  loadScene(bytes: Uint8Array): string;
  /**
   * Parse the artboard's `<defs>` so `url(#id)` paints resolve. Call this before
   * `loadScene`. Returns "" on success, or the parser's reason.
   *
   * The parsing lives in C++ on purpose: gradient geometry, percentage
   * resolution against the viewport and `gradientTransform` composition are
   * rendering calculations, and a TypeScript copy would be a second set of
   * default-value decisions that could drift from the renderer's.
   */
  loadDefs(markup: string, viewportWidth: number, viewportHeight: number): string;
  /** Paint servers parsed from the last `loadDefs` call. */
  paintServerCount(): number;
  /** Paint servers in the defs the engine could not represent. */
  unsupportedPaintServers(): number;
  /** `url(#id)` paints in the loaded scene that no defs entry resolved. */
  unresolvedPaintReferences(): number;
  /**
   * Register a font binary under a family name. Text does not render until a
   * font is registered: the browser gives WASM no system font enumeration, and
   * substituting one would produce metrics that disagree with exported SVG.
   * Returns false when the bytes are not a decodable font.
   */
  registerFont(family: string, bytes: Uint8Array): boolean;
  hasFont(family: string): boolean;
  fontCount(): number;
  /**
   * Shaped text extents, or null when no font resolves. Never an approximation.
   */
  measureText(
    family: string,
    content: string,
    fontSize: number,
    bold: boolean,
    italic: boolean,
    letterSpacing: number,
    lineHeight: number,
  ): {
    readonly width: number;
    readonly height: number;
    readonly firstLineAscent: number;
    readonly lineCount: number;
  } | null;
  setNodeTransform(
    id: string,
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ): boolean;
  setNodeOpacity(id: string, opacity: number): boolean;
  /**
   * Move a node by a document-space offset, relative to where the scene loaded
   * it.
   *
   * The engine resolves the ancestor transform chain itself, so dragging a node
   * inside a rotated or scaled group is correct without the caller doing matrix
   * algebra. Being relative to the loaded transform means a stream of drag
   * frames cannot accumulate error. Returns false for an unknown id or a
   * degenerate ancestor transform.
   */
  setNodeDocumentTranslation(id: string, dx: number, dy: number): boolean;
  /** Nodes indexed from the loaded scene, for verifying id coverage. */
  nodeCount(): number;
  /** Returns the number of nodes drawn, or -1 when the surface is invalid. */
  render(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    pixelRatio: number,
    backgroundColor: number,
    useBackground: boolean,
  ): number;
  /**
   * Render ONLY the region that changed since the last render, and report it.
   *
   * Both rendering and reading a surface back cost 34–44ms per megapixel in WebAssembly,
   * and both are proportional to AREA — so at the editor's default 1080x1080 document a
   * drag frame cost ~92ms to move one small object. This makes both costs proportional to
   * the change instead.
   *
   * The engine tracks the damage itself, unioning a node's world bounds before and after
   * every transform change, because only it knows the transform chain. `padding` is added
   * on all sides for strokes, shadows and antialiasing, which paint outside a node's
   * bounds.
   *
   * `{ ok: false }` with a reason when a full repaint is required — after a scene upload,
   * or when a node's geometry could not bound what changed. Degrades gracefully rather
   * than guessing a smaller rect.
   */
  renderDamaged(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    pixelRatio: number,
    backgroundColor: number,
    useBackground: boolean,
    padding: number,
  ): EngineDamagedRender;
  /**
   * Read one rectangle of the surface, tightly packed at `width * 4` bytes per row.
   *
   * The rect is clamped to the surface and the CLAMPED dimensions come back, so a caller
   * copying `width * height * 4` bytes is always reading exactly what exists. Null when
   * the rect is entirely outside.
   */
  readPixelsRegion(
    x: number,
    y: number,
    width: number,
    height: number,
  ): {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly pixels: Uint8Array;
  } | null;
  /** True when a partial repaint is possible: something changed, and not everything. */
  hasPartialDamage(): boolean;
  /** Force the next render to be a full one. For a view change or a surface resize. */
  invalidateAll(): void;
  /** Topmost node id at a document-space point, or "" for a miss. */
  hitTest(x: number, y: number): string;
  /**
   * The node's oriented world bounds, its derived angle and all eight handles.
   *
   * Everything the selection UI needs for one node, computed from the matrix the
   * renderer painted with — which is what makes the outline and the pixels incapable
   * of disagreeing. A failure is a reason, never a substituted box.
   */
  getOrientedBounds(id: string): EngineOrientedBounds;
  /**
   * Capture the gesture snapshot for a layer and return its starting frame.
   *
   * `kind` is "move" | "resize" | "rotate"; `handle` is a compass name and is used
   * only by a resize. The engine holds the snapshot, so every later frame is solved
   * from the same base and a long drag cannot accumulate rounding error.
   */
  beginTransformGesture(
    id: string,
    kind: EngineGestureKind,
    handle: string,
    pointerX: number,
    pointerY: number,
  ): EngineGestureResult;
  /**
   * Solve and APPLY one frame of the active gesture.
   *
   * The transform is written into the scene here rather than returned for the
   * caller to apply, so the next `render` already includes it. The value comes back
   * as well, for the selection chrome.
   */
  updateTransformGesture(
    pointerX: number,
    pointerY: number,
    preserveAspect: boolean,
    fromCenter: boolean,
    angleSnapDegrees: number,
  ): EngineGestureResult;
  /**
   * Finish the gesture, leaving the final transform applied.
   *
   * It stays applied on purpose: the document commit that follows re-uploads the
   * scene, and reverting first would show one frame of the object back at its old
   * position.
   */
  endTransformGesture(
    pointerX: number,
    pointerY: number,
    preserveAspect: boolean,
    fromCenter: boolean,
    angleSnapDegrees: number,
  ): EngineGestureResult;
  /** Abandon the gesture, restoring the snapshot's transform exactly. */
  cancelTransformGesture(): boolean;
  hasActiveGesture(): boolean;
  /**
   * Which part of a layer's selection chrome a document-space point is on.
   *
   * This is what replaces invisible DOM handle elements: the geometry that decides
   * where a handle is DRAWN decides what a point hits, so the two cannot disagree.
   * Sizes are in world units, because the caller owns the zoom.
   */
  hitTestSelectionHandle(
    id: string,
    x: number,
    y: number,
    handleSize: number,
    rotationOffset: number,
    rotationRadius: number,
    cornerRotationOffset: number,
    cornerRotationSize: number,
  ): EngineHandleHit;

  // --- shape creation: an outline the ENGINE builds, previews and hands back ---

  /**
   * Change the parameters shapes are built with. Valid before or during a drag.
   *
   * All ratios, never lengths, so a resize never has to rescale them. Applied
   * immediately when a creation gesture is running, so a star's point count changes
   * on the next frame rather than on the next pointer move.
   */
  setShapeCreateParameters(
    pointCount: number,
    innerRatio: number,
    cornerRatio: number,
    thicknessRatio: number,
    holeRatio: number,
    headRatio: number,
  ): boolean;
  /** Start a creation gesture at a DOCUMENT point. */
  beginShapeCreate(
    shapeType: string,
    startX: number,
    startY: number,
    fillArgb: number,
    strokeArgb: number,
    strokeWidth: number,
  ): EngineShapePreview | { ok: true; kind: string } | { ok: false; reason: string };
  /**
   * One frame of the gesture.
   *
   * The point is in DOCUMENT coordinates and must ALREADY BE SNAPPED if snapping is
   * active: the preview has to show the placement that will be committed, and the
   * guides that decide a snap are a document-wide question that stays in TypeScript.
   */
  updateShapeCreate(
    x: number,
    y: number,
    preserveAspect: boolean,
    fromCenter: boolean,
  ): EngineShapePreview | { ok: false; reason: string };
  /** The current outline, without advancing the gesture. */
  getShapePreview(): EngineShapePreview | { ok: false; reason: string };
  /**
   * Finish, returning the outline to commit.
   *
   * The `d` is the SAME string the preview was painted from, not a rebuild, so
   * `preview === committed` is a property of the data flow rather than an agreement
   * between two generators.
   */
  commitShapeCreate(): EngineShapePreview | { ok: false; reason: string };
  /** Abandon. There was never a document change to undo. */
  cancelShapeCreate(): boolean;
  hasShapeCreateGesture(): boolean;
  /** Tight bounds of arbitrary path data, via Skia. The parity reference. */
  measurePathBounds(
    pathData: string,
  ): { ok: true; bounds: RectF } | { ok: false; reason: string };
  /** Build an outline without a gesture, for click-to-insert. */
  buildShapePath(
    shapeType: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): EngineShapePreview | { ok: false; reason: string };
  /** Root nodes in the scene, INCLUDING the ephemeral creation preview. */
  sceneRootCount(): number;
  /** Unpremultiplied RGBA bytes, four per pixel in row order. */
  readPixels(): Uint8Array | null;
  lastNodesDrawn(): number;
  lastNodesCulled(): number;
  lastLayersOpened(): number;
  /** Text nodes in the last render that had no resolvable font. */
  lastUnresolvedText(): number;
  /** Path nodes in the last render whose SVG path data could not be parsed. */
  lastUnparsablePaths(): number;
  /**
   * Paints in the last render the engine could not honour at all — a gradient
   * with no stops, or one in objectBoundingBox units on zero-area geometry.
   */
  lastUnresolvedPaints(): number;
  /**
   * Paints drawn with a documented approximation: today only a text decoration
   * under a gradient fill, which skparagraph can only draw in one colour.
   */
  lastApproximatedPaints(): number;
  /** Releases the WASM-side object. Emscripten objects are not GC-managed. */
  delete(): void;
}

export interface PydeeEngineModule {
  PydeeSurface: new (width: number, height: number) => PydeeSurfaceHandle;
  sceneFormatVersion(): number;
}

export type EngineLoadResult =
  | { readonly status: "ready"; readonly engine: PydeeEngineModule }
  | { readonly status: "unavailable"; readonly reason: string };

type EngineFactory = (options?: Record<string, unknown>) => Promise<PydeeEngineModule>;

let pending: Promise<EngineLoadResult> | null = null;
let loggedFailure = false;

/**
 * Load the engine, memoized for the lifetime of the page. Never rejects.
 */
export function loadEngine(moduleUrl: string = ENGINE_MODULE_URL): Promise<EngineLoadResult> {
  if (pending === null) {
    pending = importEngine(moduleUrl);
  }
  return pending;
}

/** Discard the memoized module. Intended for tests. */
export function resetEngineLoaderForTests(): void {
  pending = null;
  loggedFailure = false;
}

async function importEngine(moduleUrl: string): Promise<EngineLoadResult> {
  try {
    const factory = await loadEngineFactory(moduleUrl);
    if (typeof factory !== "function") {
      return unavailable(`${moduleUrl} did not export an engine factory`);
    }
    const engine = await factory();
    if (typeof engine?.PydeeSurface !== "function") {
      return unavailable(`${moduleUrl} loaded but does not expose PydeeSurface`);
    }
    return { status: "ready", engine };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return unavailable(`could not load ${moduleUrl}: ${detail}`);
  }
}

/**
 * Fetch the engine factory as a PUBLIC ASSET, never through Vite's module graph.
 *
 * `public/engine/pydee-engine.mjs` is a generated Emscripten artifact copied verbatim
 * into the build. A source `import(url)` — even with `@vite-ignore`, which only stops
 * BUNDLING — still hits the dev server's transform middleware, which refuses a file in
 * `/public` with "should not be imported from source code". So the module is loaded the
 * way the browser loads any public script: a `<script type="module">` that imports the
 * URL and hands its default export back through a one-shot global.
 *
 * The global is an implementation detail of THIS function — it is set and immediately
 * read inside a single promise, never exposed to the editor — so the engine's factory
 * and Emscripten internals stay off the application's API. The editor still sees only
 * the narrow `PydeeEngineModule` this file types.
 *
 * In a non-DOM environment (Vitest, SSR) there is no `document`, so it falls back to a
 * dynamic `import()`; those environments have no built artifact anyway and resolve to
 * `unavailable`, which is the tested behaviour.
 */
function loadEngineFactory(moduleUrl: string): Promise<EngineFactory | undefined> {
  if (typeof document === "undefined" || document.head === null) {
    // No DOM: fall back to a plain dynamic import. Used only in tests, where the
    // artifact is absent and this resolves to the unavailable path.
    return import(/* @vite-ignore */ moduleUrl).then(
      (imported: { default?: EngineFactory }) => imported.default,
    );
  }

  return new Promise<EngineFactory | undefined>((resolve, reject) => {
    // A unique global slot per attempt, so two concurrent loads (or a reset in a test)
    // cannot read each other's factory.
    const slot = `__pydeeEngineFactory_${(loadCounter += 1)}`;
    const bag = window as unknown as Record<string, EngineFactory | undefined>;

    const script = document.createElement("script");
    script.type = "module";
    // The module script imports the PUBLIC url — the browser resolves this against the
    // origin and fetches it as a static asset. Vite never sees this import: it is a
    // string inside a script the browser evaluates, not a source module Vite parses.
    script.textContent =
      `import factory from ${JSON.stringify(moduleUrl)};\n`
      + `window[${JSON.stringify(slot)}] = factory;\n`
      + `window.dispatchEvent(new CustomEvent(${JSON.stringify(slot)}));\n`;

    const cleanup = (): void => {
      delete bag[slot];
      window.removeEventListener(slot, onReady);
      window.removeEventListener("error", onError, true);
      script.remove();
    };
    const onReady = (): void => {
      const factory = bag[slot];
      cleanup();
      resolve(factory);
    };
    const onError = (event: ErrorEvent): void => {
      // A module-script load or evaluation error surfaces on the window; only act on one
      // that names this url, so an unrelated page error does not fail the load.
      if (typeof event.filename === "string" && event.filename.includes("pydee-engine")) {
        cleanup();
        reject(new Error(event.message || `failed to evaluate ${moduleUrl}`));
      }
    };

    window.addEventListener(slot, onReady, { once: true });
    window.addEventListener("error", onError, true);
    document.head.appendChild(script);
  });
}

let loadCounter = 0;

function unavailable(reason: string): EngineLoadResult {
  if (!loggedFailure) {
    loggedFailure = true;
    // Logged once, with the reason. The editor continues on the SVG renderer.
    console.info(
      `[pydee-engine] Skia renderer unavailable, continuing with the SVG renderer: ${reason}. `
        + "Build it with: bash engine/scripts/build-engine-wasm.sh",
    );
  }
  return { status: "unavailable", reason };
}
