> Working context for the Pydee C++/Skia/WASM engine. This file exists so the
> work can be resumed from zero knowledge. `DEPENDENCIES.md` records *why* each
> decision was made; this file records *where everything is and what is true
> right now*.

# 1. Dependency graph

```
                       ┌──────────────────────────────────────┐
                       │ CreativeDocument (TS, AUTHORITATIVE) │
                       └───────────────┬──────────────────────┘
                                       │
              ┌────────────────────────┴─────────────────────────┐
              ▼                                                  ▼
   canonicalSvg  ──> services/svg/composer.py            extractRenderScene()
   (print / PDF / CMYK — UNCHANGED, still ships)                 │
                                                                 ▼
                                                         RenderScene (TS)
                                                                 │
                                    ┌────────────────────────────┴────────────┐
                                    ▼                                         ▼
                            SVG backend                              encodeScene()
                            (shipping renderer)                              │
                                                                    Uint8Array (wire v2)
                                                                             │
                                                                             ▼
                                                             pydee-engine.mjs / .wasm
                                                                             │
                                        ┌────────────────────────────────────┴──────┐
                                        ▼                                           ▼
                              DecodeScene (scene_codec.cpp)                RasterTarget (PIMPL)
                                        │                                           │
                                        ▼                                           ▼
                            Scene (scene.h, tree)  ──> RenderSceneTree ──> SkiaRenderer ──> Skia
                                                       (scene_renderer.cpp)   (ONLY Skia TU)
                                                                                   │
                                                                             FontRegistry
                                                                        (skparagraph + ICU + HarfBuzz)
```

Hard invariants this graph encodes:

- Skia types appear in **exactly one** place above the backend: `skia_renderer.cpp`
  (plus `raster_target.cpp` and `font_registry*.cpp`). `wasm/bindings.cpp`
  includes **zero** Skia headers — it is the only RTTI translation unit.
- `scene_renderer.cpp` holds the single traversal shared by every backend.
- The engine renders and answers geometry queries. It never owns the document.

# 2. File map

## C++ engine (`engine/`)

| File | Responsibility |
|---|---|
| `include/pydee/geometry.h`, `src/geometry.cpp` | affine math; mirrors `matrix2d.ts` |
| `include/pydee/scene.h` | backend-neutral scene tree; `Paint`, `Gradient`, `Stroke`, node structs |
| `include/pydee/paint_servers.h`, `src/paint_servers.cpp` | SVG `<defs>` scanner, CSS colour parser, transform-list parser, gradient resolver |
| `include/pydee/scene_codec.h`, `src/scene_codec.cpp` | binary wire format decoder + `kSceneVersion` |
| `include/pydee/renderer.h` | `Renderer2D` interface — no Skia types |
| `src/scene_renderer.cpp` | the one shared traversal (culling, layers, transforms) |
| `src/skia_renderer.h/.cpp` | **the only Skia rendering TU** |
| `include/pydee/raster_target.h`, `src/raster_target.cpp` | PIMPL surface ownership, hides `SkSurface` from bindings |
| `include/pydee/font_registry.h`, `src/font_registry.cpp`, `src/font_registry_internal.h` | explicit font ownership, skparagraph measurement |
| `wasm/bindings.cpp` | embind surface; RTTI-only TU; no Skia headers |
| `tests/test_engine.cpp` | native checks (raster + geometry + parity) |
| `tests/wasm_smoke_test.mjs` | headless WASM checks through the real module |
| `CMakeLists.txt` | clang pinned, `-fno-exceptions -fno-rtti` except bindings |
| `skia.revision` | pinned Skia commit `8608fa7a9da1b2222b194a89ed629d211f50c95c` |
| `scripts/bootstrap-skia.sh` | host check → apt → clone+pin Skia → sync deps → native libs → CanvasKit baseline |
| `scripts/build-engine.sh` | native engine + tests |
| `scripts/build-engine-wasm.sh` | WASM engine, publishes to `frontend/public/engine/`, runs smoke test |
| `scripts/verify-gn-args.sh` | reads resolved GN args; proves native and wasm configs are independent |
| `scripts/preflight.sh` | host capability report |

## Frontend (`frontend/src/editor/`)

| File | Responsibility |
|---|---|
| `renderer/matrix2d.ts` | affine math, TS side of geometry parity |
| `renderer/renderScene.ts` | `RenderScene` types, `walkScene`, diagnostics codes |
| `renderer/sceneExtractor.ts` | canonical SVG → `RenderScene` |
| `renderer/sceneCodec.ts` | `encodeScene`; `SCENE_FORMAT_VERSION` |
| `renderer/sceneRenderer.ts` | SVG-backend scene painting |
| `renderer/sceneHitTest.ts` | TS hit-testing, must agree with C++ `hitTest` |
| `renderer/pathBounds.ts` | conservative path bounds |
| `renderer/textMeasurement.ts`, `renderer/engineTextMetrics.ts` | measurement providers (DOM / engine) |
| `renderer/engineLoader.ts` | lazy `import()` of the engine, `unavailable` result on absence |
| `renderer/engineFlag.ts` | `?renderer=skia` gate |
| `renderer/engineFonts.ts` | publishes/registers font binaries |
| `renderer/capabilityMatrix.ts` | declared engine coverage, test-enforced against the encoder |
| `renderer/displayListRecorder.ts` | Renderer2D recorder used in tests |
| `renderer/SkiaOverlay.tsx` | flag-gated overlay, `pointer-events: none`; subscribes to the gesture channel |
| `interaction/InteractionEngine.ts` | transient-state drag path: coalesced frames, transform patches, one transaction per gesture |
| `interaction/gestureChannel.ts` | transports live drag events from `SVGCanvas` to its sibling overlay, per mount |
| `useCanvasDrag.ts` | owns the move gesture; emits `onDragGesture` in document px |
| `../../scripts/engine-parity.mts` | cross-language parity (`npm run test:engine`) |

Locked file, never edit: `frontend/src/pydree/PydreeStudio.tsx`.

# 3. Build and verify

WSL paths: repo = `/mnt/h/Sratup projects/Dreamer`; Skia = `~/dev/skia`.
Build dirs live on the Linux filesystem (`~/pydee-engine-build`,
`~/pydee-engine-wasm-build`) because compiling across `/mnt/h` is far slower.

```bash
bash engine/scripts/bootstrap-skia.sh      # once, or after a revision bump
bash engine/scripts/build-engine.sh        # native lib + native tests
bash engine/scripts/build-engine-wasm.sh   # wasm + publish + smoke test
bash engine/scripts/verify-gn-args.sh      # 18 config assertions
```

```powershell
wsl -e bash -lc "cd '/mnt/h/Sratup projects/Dreamer' && bash engine/scripts/build-engine.sh"
```

Frontend, from `frontend/`:

```
npx tsc --noEmit
npm test
npm run test:engine
npm run build
```

Vendored node for scripts that must match the emsdk:
`~/dev/skia/third_party/externals/emsdk/node/20.18.0_64bit/bin/node`

# 4. Wire format

- Magic `0x53445950` (`PYDS`), little-endian, `f64` geometry so values match
  JavaScript numbers exactly.
- Flat node array in paint order with parent indices; **parents must precede
  children**, which makes cycles unrepresentable.
- Kinds: `rect=0, ellipse=1, path=2, group=3, text=4`.
- Paint kinds: `0 none, 1 solid, 2 linear gradient, 3 radial gradient,
  4 paint-server reference (u16 length + UTF-8 id)`.
- **`SCENE_FORMAT_VERSION` (`sceneCodec.ts`) and `kSceneVersion`
  (`scene_codec.h`) must be bumped together.** Currently **3**. The parity
  script fails immediately if they disagree, and so does the WASM smoke test's
  own `SCENE_VERSION` constant.
- Binary crosses the boundary as `Uint8Array`, never `std::string`: embind
  UTF-8 encodes JS strings and corrupts every byte >= 0x80.
- Numbers cross as `int`/`double` only.

# 5. Engine JS API

```
PydeeSurface(width, height)
  loadScene(Uint8Array) -> "" | errorReason
  loadDefs(markup, viewportWidth, viewportHeight) -> "" | errorReason
  paintServerCount() / unsupportedPaintServers() / unresolvedPaintReferences()
  setNodeTransform(id, a, b, c, d, e, f) -> bool
  setNodeDocumentTranslation(id, dx, dy) -> bool
  nodeCount() -> int
  setNodeOpacity(id, opacity) -> bool
  render(a, b, c, d, e, f, pixelRatio, background, useBackground) -> nodesDrawn
  hitTest(x, y) -> nodeId | ""
  readPixels() -> Uint8Array
  registerFont(family, Uint8Array) -> bool
  hasFont(family) -> bool      fontCount() -> int
  measureText(...) -> metrics | null
  lastNodesDrawn() / lastNodesCulled() / lastLayersOpened() / lastUnresolvedText()
  lastUnparsablePaths() / lastUnresolvedPaints() / lastApproximatedPaints()
sceneFormatVersion() -> int
```

`loadDefs` must be called before `loadScene`, because the decoder resolves
`url(#id)` paints against the table it builds.

# 6. Traps already paid for — do not rediscover

1. **No `#` comments inside the GN args heredoc** in `bootstrap-skia.sh`. The
   script flattens newlines to spaces, so one `#` comments out every later
   argument, silently reverting to GCC + system libs and failing on missing
   `png.h` / `ft2build.h`. Comment lines are now stripped before flattening.
2. **`-DSK_TRIVIAL_ABI=[[clang::trivial_abi]]`** is required for the WASM build.
   Skia's CanvasKit config sets `is_trivial_abi=true`, so `sk_sp` returns in a
   register; without the define, `wasm-ld` reports a signature mismatch on
   `SkSurfaces::Raster` — undefined behaviour, not a cosmetic warning. The build
   script fails on any signature mismatch.
3. **Only `wasm/bindings.cpp` is compiled with `-frtti`.** The prebuilt
   `libembind` in the Emscripten sysroot uses RTTI; a `-fno-rtti` bindings TU
   computes different type ids and every type reports as unbound.
4. **`ParagraphBuilder::make` needs a third argument**, `SkUnicodes::ICU::Make()`.
5. **Vitest cannot import the engine module.** Vite percent-encodes the space in
   `Sratup projects` and then fails to resolve. `@vite-ignore` and `new Function`
   are both blocked by its VM. Cross-language checks therefore run from
   `frontend/scripts/engine-parity.mts` via `tsx`, not Vitest.
6. **`Array.prototype.at` is not in this project's `lib` target.** Use explicit
   indexing in tests.
7. **Group opacity uses `saveLayer` isolation, never per-child alpha.** Two
   overlapping opaque black rects in a 50% group must read ~128 in the overlap,
   not ~64. A test asserts this so the bug cannot return.
8. **The overlay takes the original canonical SVG**, not the viewport-wrapped
   `renderOutput`. The wrapper's top-level `<g data-viewport>` has no
   `data-role`, which made the parser synthesize ids like `shapes-0` and
   silently break id parity. A test asserts no synthesized-id warning.
9. Native `skia_use_fontconfig=false` and `skia_use_gl=false` are deliberate;
   `verify-gn-args.sh` proves they do not leak into the WebGL2 browser build.
10. **The pinned Skia has no `SkGradientShader`.** Gradients use
    `SkShaders::LinearGradient` / `RadialGradient` / `TwoPointConicalGradient`
    from `include/effects/SkGradient.h`, with an `SkGradient` description built
    from `SkColor4f` and `float` **spans**. The spans do not own their data, so
    the source vectors must outlive shader construction.
11. **skparagraph draws a decoration in `TextStyle::getColor()`**, not in the
    foreground paint, and that colour defaults to **white**. Set it explicitly or
    underlines render invisible on white backgrounds.
12. **Never edit C++ with a shell text pipeline.** A
    `Get-Content | -replace | Set-Content -NoNewline` run stripped every newline
    in `scene_codec.cpp`, so each `//` comment swallowed the rest of the file.
13. When a feature moves from unsupported to supported, `capabilityMatrix.ts`
    **and** the tests asserting the old diagnostic must both change. The matrix
    test fails in either direction, which is the point.
14. **`InteractionEngine.scheduleFrame` must mark itself pending before calling
    `requestFrame`.** A scheduler that runs its callback inline sets the handle
    to `null` during the call; recording the return value afterwards leaves a
    stale handle and silently drops every later frame. Browsers never hit this
    because rAF is async.
15. **Drag offsets are DOCUMENT pixels on every hop.** Screen pixels look correct
    at zoom 1 and are wrong everywhere else, so the coordinate space is asserted
    at zoom 2.

# 7. State

Verified totals at the last full run:

```
283 checks — native engine         (engine/scripts/build-engine.sh)
 70 checks — wasm headless smoke   (engine/scripts/build-engine-wasm.sh)
 92 checks — cross-language parity (npm run test:engine)
626 tests  — frontend suite        (npm test)
 18 checks — GN configuration      (engine/scripts/verify-gn-args.sh)
```

`npx tsc --noEmit` clean, `npm run build` clean.

Measured artifacts: `pydee-engine.wasm` 4953 KB raw / **1620 KB Brotli**
(CanvasKit baseline 2483 KB). Skia checkout + both builds: 9.6 GB.

Milestones complete: M1 host/toolchain, M2 Skia native + CanvasKit WASM,
M3 engine renders through Skia, M4 WASM + own bindings, M5 TS wire encoder,
M6 flag-gated editor mount, M7 text with real shaping, M8 gradients + text
decoration + the SVG defs parser in C++, **M9 live drags reach the engine**.

Wire format is at **version 3**. Paint kinds: `0 none, 1 solid, 2 linear
gradient, 3 radial gradient, 4 paint-server reference`.

## The drag path

```
pointermove (screen px)
  └─ useCanvasDrag            snaps, converts to DOCUMENT px
       └─ onDragGesture       { phase, layerId, dx, dy }
            └─ GestureChannel  (per EditorCanvas mount, never global)
                 └─ SkiaOverlay subscription
                      └─ InteractionEngine.setTransientTranslation
                           └─ rAF frame, coalesced
                                └─ surface.setNodeDocumentTranslation
                                     └─ Skia
```

Offsets are **document pixels** everywhere on this path. The engine resolves the
ancestor transform chain (`P⁻¹ · T · P`), so a node in a scaled or rotated group
tracks the pointer exactly without the editor doing matrix algebra.

## Division of labour (the standing rule)

TypeScript is UI and document state. Anything that is a render or geometry
calculation belongs in C++:

| In C++ | In TypeScript |
|---|---|
| gradient resolution, `<defs>` parsing | forwarding the id and the markup |
| CSS colour parsing, SVG transform lists | — |
| text shaping, measurement, decoration | asking for metrics |
| hit-test geometry | lock/visibility policy |
| culling, layer isolation, compositing | — |
| paint construction, shaders | — |

`engine/src/paint_servers.cpp` is the reference example: the encoder gained ten
lines, the engine gained the whole feature.

# 8. Open work, in order

1. **Resize, rotate and parametric handles.** They live in `SelectionOverlay`
   with their own session refs (`resizeDragRef`, `rotateDragRef`,
   `parametricDragRef`) and are not on the gesture channel yet.
   `InteractionEngine.setTransientTransform` is the path: they produce a full
   transform rather than a translation, so `DragGestureEvent` needs a matrix
   variant.
2. **Multi-layer drags.** `useCanvasDrag` commits only `intent.layerId` even with
   a multi-selection. Pre-existing; the channel reflects it faithfully rather
   than papering over it.
3. **Images.** Codecs are already linked (`libpng`, `libjpeg`, `libwebp`,
   `libwuffs`). Needs an asset manager caching `SkImage` by href, plus an image
   node on the wire. Data URIs decode synchronously; remote URLs need the async
   load + invalidation path.
4. **Clipping and masks**, then blend-mode parity coverage.
5. **Per-family font pipeline** with subsetting and fallback chains.
   `FontRegistry::Register` already accepts multiple faces per family.
6. **Patterns** (`<pattern>`): reported by `PaintServerTable::unsupported()`
   today. The parser has the scaffolding; the renderer needs a tiled shader.
7. **Pixel-regression parity harness** (RMSE, max channel error, % differing
   pixels). Blocked on choosing an SVG rasterizer for the reference image.
8. **Vertical writing modes** — largest item, skparagraph has no direct support.

## Verified in a browser and fixed: the SVG drag preview at non-unit zoom

This was recorded as a *suspicion* and has now been measured in Chromium. Both
halves were real.

**1. The preview over-travelled by exactly the zoom factor.** Measured through the
real `SVGCanvas` + `useCanvasDrag` with real pointer events:

| zoom | pointer moved | SVG preview moved |
|---|---|---|
| 0.5 | 40 px | 20 px |
| 1 | 60 px | 60 px |
| 2 | 60 px | **120 px** |

Cause, confirmed on a fixture (`browser-tests/dragCoordinateSpace.spec.ts`): a CSS
`px` translate on an SVG child resolves to SVG **user units**, and the element sits
inside `.svg-canvas-wrapper`, which carries `scale(zoom)` — so the translate is
scaled a second time. Passing `snapX * zoom` therefore travelled `dx * zoom`
screen pixels. Fixed by passing the **document** delta and letting the wrapper's
scale convert it back. Verified at zoom 0.5, 1, 2 and 4.

The `lastSnapX`/`lastSnapY` fields were renamed to `lastDocumentDx`/`lastDocumentDy`
and no longer round-trip through zoom. That round trip — multiply by zoom on write,
divide by zoom at commit — is what made the field's coordinate space ambiguous, and
that ambiguity is how the preview came to be scaled twice.

**2. A second, worse defect the browser exposed: the preview node is destroyed
mid-drag.** A `MutationObserver` on `.svg-canvas-markup` records
`childList +1 -1` several times per gesture under `EditorCanvas`: the markup is
injected through `dangerouslySetInnerHTML`, so any re-render can rewrite the whole
`<svg>`. The node captured at pointerdown becomes detached, and a tagged-node probe
confirmed `stillOriginalNode: false`. The preview transform was being applied to a
node that was no longer on screen — **dragging showed no live movement at all in
the real editor**, only the commit at the end.

Fixed in two layers, because one is not enough:
- the element is re-resolved from `layerId` on every pointer sample, and
- a `MutationObserver` scoped to the gesture re-applies the offset when the subtree
  is replaced. Its callback is a microtask, so it runs after React's DOM write and
  before paint — no flicker, and a *paused* drag keeps its preview, which
  per-sample re-resolution alone cannot guarantee (the replacement is triggered by
  the render that the last sample caused).

The underlying re-render churn is a separate performance problem, already recorded
above as items 2–4 (`SelectionOverlay` state updates at pointer rate). The preview
must not depend on it either way.

**3. SVG and Skia do share one screen-space coordinate system.** Measured by
locating the shape in the Skia canvas bitmap and comparing:
`skiaBitmapDelta == documentDelta`, and `skiaBitmapDelta * zoom == svgScreenDelta ==
pointerDelta`, at zoom 1 and 2. That is the invariant that makes the comparison
overlay meaningful.

## Fixed: the selection outline sat away from rotated shapes

Reported with a screenshot: a rotated text layer's selection box appeared in a
different place from the text, which also made the shape feel ungrabbable — the box
is where a user aims. **Three** compounding defects, all now fixed and verified in
Chromium (`browser-tests/rotatedSelectionBox.spec.ts`).

1. **Mismatched pivots.** The box div was rotated about its own *screen-space
   centre*, while the SVG element rotates about the SVG-space pivot in
   `rotate(a cx cy)`. Different pivots in different units, so the two diverged as
   soon as the pivot was not the centre.
2. **Stale angle.** `handleRotateUp` *appended* a `rotate()` on every gesture, so a
   twice-rotated layer carried `rotate(a …) rotate(b …)`, while `parseRotation`
   read only the first. The outline used angle `a` for a shape rotated `a + b`, and
   the transform string grew on every drag. `composeRotation` now folds a rotation
   about the same pivot into one, and keeps a different pivot separate rather than
   collapsing it incorrectly.
3. **The outline never rendered at all.** `SelectionOverlay`'s measuring
   `useLayoutEffect` depended on `[hostRef, selectedKey, composedSvg, viewport…]`,
   none of which changes when `SVGCanvas` injects the SVG. `hostRef` is a stable
   object, so an effect that ran before that markup existed bailed out with
   `setHandleBox(null)` and never ran again — no outline, no handles, for the life
   of the mount. **Same defect class as the `useCanvasDrag` C1 bug: a ref in a
   dependency array is not a readiness signal.** The rendered `<svg>` is now
   tracked in state.

The box is now derived from the element's real `getScreenCTM()`, which already
composes every transform in the chain — rotation, scale, skew and ancestor group
transforms — so no transform string is parsed at all. Verified: the outline centre
sits within 12 px of the shape centre at zoom 1 and 2, its bounds match the shape's,
and an unrotated shape still gets an exact outline.

**Look for this pattern elsewhere.** Three separate bugs in this codebase now share
one shape: an effect that reads `someRef.current` while listing only the ref in its
dependencies. It works whenever some other dependency happens to change afterwards,
and fails silently when it does not.

## Fixed: text editing froze permanently after the first commit

`isTextEditing` stayed `true` when the editor could not mount. The commit
regenerates the SVG, and if the layer no longer resolved to a `<text>` node,
`CenterStage` cleared `textEditorStyle` but left the flag set — so the editor was
invisible and every later double-click was a no-op, because the flag it would have
set was already true. The layout effect now ends the session through
`onTextEditCancel` and logs why. The callback is held in a ref so the effect does
not re-measure on every keystroke.


| Layer | File | Catches |
|---|---|---|
| Chromium | `browser-tests/dragCoordinateSpace.spec.ts` | the CSS/SVG semantics themselves, on a fixture |
| Chromium | `browser-tests/editorDragParity.spec.ts` | pointer vs preview through the real editor at zoom 0.5/1/2/4, plus subtree replacement |
| Chromium | `browser-tests/skiaSvgCoordinateParity.spec.ts` | SVG vs Skia in one screen-space system |
| Vitest | `useCanvasDrag.test.tsx` | the *formula* — asserts the written transform is `translate(30px, 0px)` for a 60px move at zoom 2 |

The Vitest guard exists because it runs in `npm test`: re-introducing the `* zoom`
factor fails in the fast suite, not only in the browser suite. It deliberately also
asserts the zoom-1 case and says why — the two formulas are identical at zoom 1,
which is exactly how the defect survived a suite that only covered zoom 1.

`npm run test:browser` runs the Playwright suite. Two servers are configured: the
dev server for pure layout questions, and a **production build served by
`vite preview`** for anything involving the Skia overlay, because Vite's dev server
refuses to serve `/public/pydee-engine.mjs` through import analysis. Testing the
built artifact is the more faithful check anyway.

**Dependency added:** `@playwright/test` 1.63.0 (exact, devDependency) plus the
Chromium binary. Reason: jsdom computes no layout, so `getBoundingClientRect`
returns zeros and the question is unanswerable there.


Every remaining gap is *reported at runtime* through scene diagnostics, the
engine's counters and the overlay readout, so nothing is silently missing. The
Skia path stays behind `/editor?renderer=skia` until parity covers images and
export.


# 9. Editor audit — findings and status

A full read-only audit of `frontend/src/editor` and `frontend/src/components/SVGCanvas.tsx`
was run for resource leaks, performance defects, security holes and correctness
bugs. Findings are recorded here with their status so none is silently dropped.

## Fixed

| # | Where | Defect | Fix |
|---|---|---|---|
| C1 | `useCanvasDrag.ts` | The listener effect had `[containerRef]` as its only dep. `SVGCanvas` calls the hook **before** its early return for a null `designOutput`, so on first mount there was no container, the effect returned early, and — because a ref object is stable — it never ran again. **Element dragging was dead for the life of the mount** on the ordinary "generate a design, then drag" path. `selectedLayerIds` and `artboardBounds` were also frozen at mount, making the bounding-box fallback hit-test (which is what lets you grab a thin stroke) permanently dead code. | Config mirrored into refs; a `containerElement` state signal added to the deps so the effect re-runs when the container mounts. Two regression tests: one mounts the container on a later render, one unmounts mid-drag. |
| SEC-1 | `canonicalSvg.ts` | Root `<svg>` attribute **names** were copied verbatim and only their values escaped, so `onload="…"` survived parse → serialize into `composedSVG` and into every export. The in-editor preview is sanitized by DOMPurify; the exported artifact is not. | Allow-list `isSafeRootAttribute` (`data-*` plus a fixed presentation set); anything else is dropped and logged. |
| SEC-2 | `canonicalSvg.ts` | `raw` layers (non-editable groups, unrecognised elements) stored `serializeToString(...)` verbatim and re-emitted it unchanged, so `<script>`, `<foreignObject>`, `on*` handlers and `javascript:` hrefs rode through the document. | `serializeSafeRaw` clones, strips active-content tags, event handlers and unsafe URL schemes (including whitespace-obfuscated `java\nscript:`), and logs what it removed. 10 security regression tests in `canonicalSvg.security.test.ts`. |
| BUG-4 | `SVGCanvas.tsx` | `syncDesignOutputMarkup` assigned `designOutput.composedSVG` / `.svgLayers` **in place**. The object is the parent's `useMemo` result and is shared with history snapshots, so a colour edit retroactively rewrote past undo states — undo could not restore markup that had itself been mutated. It also serialized the live editor DOM, baking selection outlines, generated gradient defs and `opacity: 0` on an open text editor into the exported artifact. | Function removed. Colour edits already reach the document through the command layer, which is the authoritative path. |
| BUG-12 | `history.ts` | `undo` applied `command.undo` and popped the stack **unconditionally**. Command factories address layers by id inside the active artboard only, so undoing after the artboard changed silently did nothing while still consuming the step and moving the command to the redo stack — the edit became unreachable from both directions. `redo` had the same shape. | Both verify the document actually changed (`deepEqual`) before committing, and log when it did not. |
| BUG-10 | `CreativeStudio.tsx` | A dropped image with a zero intrinsic size (routine for corrupt files) made `scale = Infinity` and `height = 0 * Infinity = NaN`, which entered the layer's geometry and selection maths. Serialization coerced it to `"0"`, so the image was invisible while the model stayed poisoned. There was also no `onerror`, so an undecodable drop failed silently. | Finite-size and finite-placement guards, an `onerror` handler, and a refusal to embed an SVG file as a raster `data:` href (`file.type` is OS metadata, so `image/svg+xml` passed the `startsWith("image/")` check). |
| BUG-11 | `SelectionOverlay.tsx` | The rotation transform was built as a string with no finiteness check. `hostPointToSvgPoint` inverts a screen CTM, and a degenerate matrix yields non-finite coordinates — `NaN.toFixed(3)` is the string `"NaN"`, so `transform="rotate(NaN NaN NaN)"` was committed, made the layer non-rendering, and survived every save. | `safeRotation` returns null for any non-finite component; the frame is skipped and the commit reverts to the original transform. |
| H1/H2 | `SVGCanvas.tsx` | The per-layer listener effect had `viewport?.zoom` plus two inline callbacks in its deps. Every wheel notch and every parent render tore down and re-attached 2–3 listeners **per layer**, re-ran gradient injection, and rewrote inline styles across the whole layer list — interleaving `getBBox`/`getBoundingClientRect` reads with style writes. `focusedLayerId` was read in the body but **missing** from the deps, so the focus ring and `tabIndex`/`role` were applied from a stale value, silently breaking keyboard navigation. | `zoom` and both callbacks mirrored into refs (they are only read at event time); `focusedLayerId` added to the deps. |
| M1 | `useCanvasDrag.ts` | The `#canvas-move-measurement` badge used a document-wide id, was looked up with `getElementById` on every `pointermove`, and was never removed by the effect cleanup — so unmounting mid-drag orphaned it, and two canvases contended for the same node. | Scoped class, cached on the gesture object, removed by the cleanup. |
| SEC-6 | `useCanvasDrag.ts` | Layer ids from untrusted `data-layer-id` attributes were interpolated into an attribute selector unescaped, so an id containing a quote retargeted the selector or threw from inside a pointer handler. | `cssAttributeValue` escapes backslashes and quotes. |

## Recorded, not yet fixed — ordered by severity

These are real and were confirmed against the code. They are listed so the next
session starts from evidence rather than re-auditing.

**High**

1. `hooks/useFreehandDrawing.ts:98–110` — O(n²) per stroke. Every rAF copies the
   entire point array (`[...pointsRef.current]`) into React state and rebuilds the
   whole path string, with no decimation and no cap. A long stroke at 120 Hz
   re-copies and re-serializes thousands of points ~60×/s. Line 95 also calls
   `getBoundingClientRect()` on every `pointermove`; the rect should be cached for
   the stroke. Line 126 is a fully empty `catch`.
2. `SelectionOverlay.tsx:932–939` — write → forced layout read → write inside a
   `useLayoutEffect` that runs at **pan/zoom rate** (`useViewport` calls
   `setViewport` on every `pointermove`). The same effect calls `getBBox()` at
   ~920 and `hostPointToSvgPoint` at ~926 whose results are **never used**, does
   `JSON.parse` at ~201, issues three separate state updates from inside a layout
   effect, and for a multi-selection does one `getBoundingClientRect()` per
   selected layer per frame.
3. `SelectionOverlay.tsx:686` — the host capture listeners are re-registered on
   every `EditorCanvas` render because `onPrimaryChange`/`onClear`/`onSetSelection`
   are fresh inline arrows. The cleanup also removes `window` pointermove/up
   listeners that only `handlePointerDown` adds, so a re-render landing mid-gesture
   strands the marquee with `sessionRef` populated and no way to finish.
4. `SelectionOverlay.tsx:440–465`, `343–385` — two state updates per
   `pointermove` during resize/rotate, feeding a render that calls the unmemoized
   `computeHandles` five times (≈5 arrays × 8 objects allocated per move).
5. `hooks/usePenTool.ts:141–157` — all four listeners, including a `window`
   keydown, are torn down and re-registered on every `setSession`, which happens
   per pointer move.
6. `canonicalSvg.ts:338–344` — `parseTextLayer` reads `innerHTML` and decodes
   `&amp;` **before** `&lt;`/`&gt;`, so decoding is not idempotent: text degrades
   one level on every open/save cycle. Using `innerHTML` rather than `textContent`
   also pulls non-`tspan` child markup into the model as literal text.

**Medium**

7. `hooks/usePerformanceMonitor.ts:64–82` — the rAF loop is keyed on *tool
   selection*, not on an active gesture, so merely selecting the hand tool burns a
   frame callback forever and `console.warn`s on every 10th dropped frame.
8. `services/svg/composer.py:441–444` and `canonicalSvg.ts:846–891` — `html.escape`
   / `escapeAttribute` do not neutralise `;`, `(`, `)`, so a model-generated
   `shadow` or an imported `style` can close `drop-shadow(` and append arbitrary
   CSS, including an external `url()` fetch, into the style attribute.
9. `services/svg/composer.py:120–128` — the CMYK pass runs
   `re.sub(r'#[0-9a-fA-F]{6}', …)` over the **entire** composed SVG string, so a
   headline reading `#C0FFEE` and an `href="…#a1b2c3"` fragment are both rewritten.
   3-digit colours are never converted, yet `cmykSafe=True` is hardcoded — the
   print-safety flag is a constant, not a measurement.
10. `composer.py:38–42` — `PRINT_MARKS_PATTERN` requires one literal attribute
    order and raises when it does not match, so any DOM round trip that normalises
    attribute order makes print export fail on a document the editor considers
    valid.
11. `SVGCanvas.tsx:493–524` vs `~766–802` — two gradient implementations disagree
    on the def id (`grad-${layerId}` vs `gradientIdForFill(fill)`), so a fill
    written by one is not found by the other after a re-render, leaving a dangling
    paint reference.
12. Silent `catch` blocks that contradict the project's own no-silent-fallback
    rule: `useCreativeStudio.ts:383`, `:438`; `EditorCanvas.tsx:299`;
    `SVGCanvas.tsx:~717`, `~746`; `useFreehandDrawing.ts:126`.
13. `propertyEditing.ts:176–179` and `canonicalSvg.ts:1200–1204` — an unbounded
    `match(/…/g).map(Number)` over user-controlled path/points data on the
    Properties-panel render path, with no length cap and no memoisation.
14. DOMPurify is configured with no hardening options, so the in-editor render
    permits remote `href` targets (an external `<image href="https://…">` fires on
    every render, confirming document opens) and an SVG-namespace `<style>` whose
    rules apply to the whole page because the markup is inlined into an HTML div.

**Checked and NOT vulnerable** — no `eval`/`new Function`/`insertAdjacentHTML`;
no prototype-pollution sink (the one dynamic-key write is an own-property
definition in an object literal); no catastrophic-backtracking regex on user
input (the real cost is unbounded input length, item 13).

# 10. Feature union — engine capability the UI can now reach

Closed this session: `plus-lighter` blend mode (the engine renders it as
`SkBlendMode::kPlus`; the validator omitted it so it could not even be typed),
`line-through`, `letterSpacing`, `lineHeight`, `wordSpacing`, `textTransform` and
`direction`. All were already implemented by **both** renderers and asserted by
the parity harness while no control existed. The command layer
(`setPropertyCommand`) already declared every one of them.

Still unreachable, ordered by user-visible value:

1. **Gradient authoring — the largest unused capability.** The engine parses
   `<defs>` itself and supports linear and radial, both `gradientUnits`, all three
   `spreadMethod`s, `gradientTransform`, `href` inheritance and a radial focal
   point. The editor has **zero** gradient control: the only fill input is
   validated by `validateHexColor`, which rejects `url(#…)` outright.
   `WIRE_PAINT.linearGradient` / `radialGradient` exist on the wire and no UI path
   emits them.
2. **Numeric transform fields.** `capabilityMatrix` declares `transform` full and
   `ParseSvgTransform` handles `matrix/translate/scale/rotate/skewX/skewY`, but
   `BaseLayer.transform` is reachable only through drag and rotate gestures — skew
   and precise rotation cannot be entered.
3. **Group isolation toggle.** `GroupNode::isolate` is inferred by the extractor
   and reported per frame as `lastLayersOpened()`, never controllable.
4. **Engine hit-testing and `setNodeOpacity`.** Fully implemented in the bindings
   and unreachable: the Skia surface is `pointer-events: none` and the editor
   hit-tests in TypeScript.
5. **Engine text metrics in the live editor.** `engineTextMetrics.ts` is only
   called by `SkiaOverlay`, so the editor's own selection bounds stay
   `pending-measurement` / `conservative` even when the engine could answer
   exactly.


# 11. Sub-pixel precision — what was blocking it

Fine dragging was impossible by construction. Three independent quantisers, each
individually defensible, combined to discard any movement below half a pixel.

| Where | Was | Now |
|---|---|---|
| `canonicalSvg.ts` `snap()` | `Math.round(v * 2) / 2` — a **0.5px grid** on every document round trip | `AUTHORING_PRECISION = 1000` (0.001px). The 0.5px grid moved to `snapToPrintGrid`, exported for the print path |
| `canonicalSvg.ts` `formatNumber()` | `value.toFixed(1)` — **one decimal** | Three decimals, trailing zeros trimmed |
| `useCanvasDrag.ts` `DRAG_THRESHOLD` | **4px** for every device | 1px for mouse/pen, 4px for touch |

The grid's stated justification is AGENTS.md's print-sharpness rule, and that rule
is real — but it was being enforced in the wrong place. `serializeArtboard` runs on
every document change, not only on export, so a 0.2px nudge quantised to zero. At
zoom 8 a single screen pixel is 0.125 document px, and at the maximum zoom of 64x
it is 0.0156 — both entirely below the old grid, so precision work was impossible
no matter how good the input device was. Print sharpness only matters at print
time, so `snapToPrintGrid` is what the export path should call.

`AUTHORING_PRECISION` at three decimals resolves one screen pixel at 64x zoom with
room to spare, and is coarse enough that floating-point noise never reaches the
markup.

The threshold is device dependent because the tradeoff differs: a mouse or pen
reports position precisely and does not wobble, so 1px lets a deliberate nudge
register immediately; a finger does wobble, and 1px would turn every tap into a
drag. The threshold only gates when a gesture *starts* — once it has, the offset is
measured from the original pointer-down position, so no travel is discarded.

Pinned by tests: a 1px mouse nudge registers, a 0.4px move does not start a drag,
and a two-pixel move at zoom 8 commits exactly `0.375` document px.

# 12. Gradient authoring

`frontend/src/editor/gradients/gradientModel.ts` (model + serializer + reader),
`GradientPanel.tsx` (UI), `commands/setGradientCommand.ts` (one undoable step).

## Why there are two gradient parsers, deliberately

- The **renderer** parses `<defs>` in C++ (`engine/src/paint_servers.cpp`). That is
  the single source of truth for how a gradient is *drawn*.
- `gradientModel.ts` is the source of truth for how a gradient is *authored*.

They cannot drift because the authoring side **writes every attribute
explicitly**, including the ones that equal the SVG default. A gradient authored
here is fully specified, so there is no default for the two implementations to
disagree about. The parity script closes the loop: markup from
`serializeGradient` is fed to the real compiled engine and asserted to parse,
resolve and paint — including a radial gradient with a displaced focal point,
which is the geometry most likely to be rejected.

## Design decisions

- **Angle, not endpoints.** The UI works in degrees because that is how designers
  think; `endpointsForAngle` / `angleForEndpoints` convert, so the panel holds no
  geometry maths.
- **One command per edit.** A gradient touches the artboard `<defs>` and the
  layer's `fill`. Two commands would make undo take two presses and would allow a
  half-undone state where a fill references a definition that no longer exists.
- **Undo restores the whole defs string**, not just the gradient it added: an edit
  may have *replaced* an existing definition, and removal would lose it.
- **`normaliseStops` forces non-decreasing offsets.** The engine's decoder
  *rejects* a descending offset outright — failing the whole scene, not just the
  gradient — so the panel must not be able to produce one.
- **Ids are derived from the layer** (`grad-<layerId>`), so a layer owns exactly
  one gradient and re-applying replaces it instead of accumulating dead entries.
- **Unrelated defs content survives.** Embedded fonts, filters and other gradients
  are matched around by id; a naive rewrite would discard them. Tested.
- **The preview swatch is CSS.** It is a hint; the canvas is painted by the real
  renderers, so the swatch can never be mistaken for the source of truth.

One bug worth recording: the first `findGradientElement` searched for `/>` from the
element start to detect a self-closing tag, but a gradient's `<stop .../>` children
are self-closing — so it truncated the element at the first stop and lost every
stop after it. It now finds the end of the *opening* tag before deciding.

## Totals after this work

```
283 native · 70 wasm · 102 parity · 683 frontend tests · 18 GN
```


# 13. Reported but NOT yet done

Recorded verbatim so none of it is lost. Nothing here is claimed as working.

1. **Delete / Backspace on selection.** Already wired
   (`useKeyboardShortcuts.ts:219`, `onDelete` at `CreativeStudio.tsx:232`), and
   reported as not working. Not reproduced — the handler bails when focus is in an
   `INPUT`/`TEXTAREA`/`contenteditable`, which is the most likely cause, but that
   is a hypothesis. Needs a browser test driving a real click-then-Backspace, which
   needs a `CreativeStudio` harness rather than the current `EditorCanvas` one.
2. **The full Canva shortcut set.** Not researched, not added.
3. **Dummy text controls.** Several Properties-panel controls — text stroke was
   named specifically — render but are reported not to apply. Each needs tracing
   from the control through `setPropertyCommand` to `canonicalSvg` serialization and
   then to both renderers. Not audited.
4. **Selection outline following the shape's own outline**, rather than an oriented
   bounding box. The box is now geometrically correct (see §8) but is still a
   rectangle; the request was for the outline to trace non-rectangular geometry,
   which needs the path's own outline stroked in the overlay.
5. **Remaining unreached engine capability**, from §10: gradient
   `gradientTransform` authoring, numeric transform fields (skew, precise rotate),
   a group isolation toggle, engine hit-testing, and engine text metrics in the live
   editor's selection bounds.
6. **The performance findings in §9 are still open** — items 1–7 there, notably the
   freehand tool's O(n²) per-stroke cost and `SelectionOverlay`'s double reflow at
   pan rate. These are the most likely remaining causes of drag not feeling as
   smooth as it should, because they burn frame budget during the gesture. The
   coordinate correctness is now verified; the frame cost is not addressed.

Verified totals at this point:

```
686 Vitest · 17 Playwright · 102 parity · 283 native · 70 wasm · 18 GN
```


# 14. Selection/transform geometry rebuilt on one authoritative model

## Root cause

There were **two independent sources of truth** for where an object is.
`sceneExtractor.ts:136` already computed `worldTransform = parentWorld x
localTransform` with the full ancestor chain, and both renderers used it.
`SelectionOverlay.computeSelectionBox` ignored all of it and measured the DOM
(`getScreenCTM`, `getBoundingClientRect`), then reconstructed rotation by parsing
`rotate()` out of a transform attribute. Two implementations of the same fact
always diverge; the only question is when.

Four incompatible screen-to-document conversions existed:

| Where | Method |
|---|---|
| `sceneExtractor` | `worldTransform` (correct, authoritative) |
| `SelectionOverlay.computeSelectionBox` | `getScreenCTM` / `getBoundingClientRect` |
| `SelectionOverlay.hostPointToSvgPoint` | screen-CTM inversion |
| `useCanvasDrag` | divide by `zoom` only — ignores the parent chain entirely |

## The model now

```
local --[ node.worldTransform ]--> world --[ x zoom, +origin ]--> viewport --> client --> device
```

`coordinateSpaces.ts` brands every point with its space (`LocalPoint`,
`WorldPoint`, `ViewportPoint`, `ClientPoint`, `DevicePoint`), so mixing them is a
**compile error** rather than a comment that went stale. Exactly one conversion
exists per pair, each with a documented source and destination. Lengths convert
through a separate function from positions, because applying an origin offset to a
distance is easy to write and hard to see.

`CanvasView` folds pan into `originClient` — the client position of world (0,0) —
so pan cannot be applied twice. It returns `null` for a non-finite or zero zoom
instead of defaulting.

## Selection geometry is derived, never measured

`selectionGeometry.ts`: `worldCorner = worldTransform x localCorner`. The OBB
stores its four corners **explicitly** rather than position + size + angle, because
a stored angle is a second representation that can disagree with the corners; the
angle is always derived. Every handle — four corners, four sides, rotation — is
computed by interpolating those corners, so rotation, scale, skew, flip and every
ancestor group transform come along for free. Nothing in that file knows what a
rotation is.

Multi-selection returns a deliberately **different type** (axis-aligned world
rect), because several objects with different rotations have no single orientation.
That matches Figma, Illustrator, Photoshop and Canva.

`resizeLocalBounds` works entirely in the node's **local** space, which is what
makes a diagonal corner drag resize along the object's rotated axes automatically —
local space *is* the rotated frame, and the opposite anchor is fixed by
construction. Negative extents are preserved because a flip is a valid transform.

Failures are typed and reported, never substituted: `bounds-unavailable`,
`singular-transform`, `non-finite-geometry`, each carrying the node id.

## The text gap this exposed

Text had `localBounds: null` on the SVG path, so `obbForNode` correctly refused to
invent a box — meaning **no text layer had a selection box at all**. The engine has
`skparagraph`; the SVG path had nothing. `domTextMetrics.ts` closes that with
Canvas 2D `measureText`, which uses the same font stack the browser paints the
`<text>` element with. Each backend now measures with the engine that draws it;
neither approximates the other.

## Deleted, not disabled

`computeSelectionBox` and `parseRotation` are gone. Keeping them would recreate the
two-systems problem the rewrite exists to remove.

## Also fixed

`SelectionOverlay` was receiving the viewport-**wrapped** SVG. Its top-level
`<g data-viewport>` has no `data-role`, so the parser synthesized ids like
`shapes-0` and every selection lookup missed. Caught by the pre-existing
synthesized-id assertion in the Skia overlay test.

## Verified

```
736 Vitest (50 new geometry tests) · 17 Playwright · 102 parity · tsc clean · build clean
```

Browser-measured: a rotated text layer's outline centre sits within 12px of the
shape centre at zoom 1 and 2, its bounds match the shape's, and an unrotated shape
is exact.

## NOT done — do not assume otherwise

1. **C++ `getWorldTransform` / `getWorldCorners` / `getOrientedBounds`** and the
   TS-vs-C++ parity assertions for them. The TS side is authoritative today; the
   engine has not been given the matching query API.
2. **Resize and rotate gestures still use the old screen-space maths**
   (`selectionMath.unrotatePoint`, `resizeBoxFromHandle`, `hostBoxToSvgBox`). The
   *box* is now correct, so handles sit on the object — but the resize arithmetic
   has not been migrated onto `resizeLocalBounds`. That migration is the next step
   and is why corner-resize-after-rotation is not yet claimed correct.
3. **The full acceptance matrix** (resize from each of 8 handles, flip, nested
   groups, undo, cancel, 4x zoom, pan, both renderers) is not yet automated.
4. `useCanvasDrag` still converts screen to document by dividing by `zoom`, which
   is correct only while no ancestor group scales the layer.


---

# Phase: C++ geometry API, TS↔C++ parity, and the scaled-ancestor drag fix

## Recovered first: `SelectionOverlay.tsx` had been emptied

A PowerShell one-liner computing a line number wrote an empty file over the 1123-line
source. It was recovered **verbatim** from `frontend/dist-harness/assets/*.js.map`,
whose `sourcesContent` still held the pre-damage TSX from the last harness build, and
re-verified against every gate. Two lessons, both now standing rules:

- Never compute line numbers in PowerShell and write files by index. `Select-String`
  returns an array; `($array - 1)` throws per line and `Set-Content` then writes
  nothing. Use `str_replace` on unique text instead.
- Build sourcemaps are a real recovery path. `dist-harness` is worth keeping.

## `getWorldTransform` / `getWorldCorners` / `getOrientedBounds` now exist in C++

`engine/include/pydee/selection.h` + `engine/src/selection.cpp` mirror
`frontend/src/editor/geometry/selectionGeometry.ts`: oriented bounds from
`world × localCorner`, derived angle and flip, the eight handle positions, the
multi-selection AABB, and `ResizeLocalBounds` including aspect-lock and
centre-resize. Exposed through `bindings.cpp` as `getWorldTransform`,
`getWorldCorners`, `getOrientedBounds`, `getAxisAlignedBounds` and
`resizeLocalBounds`.

Failures are reported, never substituted: `node-not-found`, `bounds-unavailable`,
`singular-transform`, `non-finite-geometry` — the same vocabulary both sides use.

## Why two implementations exist, and what retires one

This is the open architectural question, stated plainly rather than left implicit.

The engine should own geometry. It cannot own it *exclusively* yet, because the
editor draws a selection box and previews a drag on the SVG render path, where the
WASM module may not be loaded at all. So the TypeScript implementations remain, and
they are held to the C++ answer by a build gate rather than by review:

| Property | How parity is proven | Cases |
|---|---|---|
| world transform | `getWorldTransform` vs `node.worldTransform` | 6 nodes, 1e-9 |
| oriented corners | `getWorldCorners` vs `obbForNode` | 6 nodes × 4 corners |
| angle, flip, 8 handles | `getOrientedBounds` vs derived TS values | 6 nodes |
| resize from every handle | `resizeLocalBounds` both sides | 384 cases |
| multi-selection AABB | `getAxisAlignedBounds` vs `aabbForNodes` | 1 |
| `P⁻¹·T·P` drag conversion | `setNodeDocumentTranslation` + `getWorldTransform` vs `transformDelta.ts` | 24 |

The parity scene is asserted to be non-trivial — a 37° rotation, a mirrored node and
a 2× ancestor scale — because a comparison over axis-aligned unscaled nodes would
pass for two wrong implementations.

**The retirement condition:** once the engine is loaded unconditionally rather than
behind `?renderer=skia`, the TS geometry modules become adapters over the engine
calls and the parity suite becomes a regression guard for the C++ alone. Until then
the gate is what makes two copies acceptable; it is not a permanent arrangement.

## Fixed: the scaled/rotated-ancestor drag conversion

`useCanvasDrag` divided the pointer delta by `zoom` and handed that one number to
three different consumers. Measured in Chromium
(`browser-tests/nestedTransformDrag.spec.ts`):

1. An ancestor `scale(2)` multiplies the translate **again** — a 40px drag moved the
   layer 80px, at every zoom.
2. An ancestor `rotate(90)` **redirects** it — a 40px horizontal drag moved the layer
   40px *downward*. No scalar division can fix a direction.
3. `element.style.transform` **replaces** the SVG `transform` attribute rather than
   composing with it, so a rotated layer visibly lost its rotation for the duration
   of every drag. The code comment asserted the opposite.

One world displacement now produces three deltas, in `geometry/transformDelta.ts`:

```
pointer screen delta
  ÷ zoom       → world  → the engine (which applies P⁻¹·T·P itself), snapping, badge
  P⁻¹ linear   → parent → the DOM preview, prepended to the transform ATTRIBUTE
  W⁻¹ linear   → local  → translateLayerCommand, which offsets geometry
```

`P⁻¹·T·P = [I | M⁻¹t]`, so the conversion is the inverse of the basis's linear part
applied to the delta — the `÷ zoom` form is the special case where `M` is a uniform
scale with no rotation.

Also fixed in the same pass:

- Snap reference boxes came from `getBBox()` per layer, i.e. each layer's **own local
  space**, and were compared against each other. They now come from the scene's
  `worldBounds`, the only space in which two layers' boxes mean the same thing.
- The scene is extracted once per `DesignOutput` (module-level `WeakMap`) and shared
  by the selection overlay and the drag hook, so both cannot drift and the document
  is not parsed twice.
- `resolveSceneNode` is supplied by `EditorCanvas`, which holds the **unwrapped**
  design output. Building it from `SVGCanvas`'s viewport-wrapped markup makes
  `canonicalSvg` synthesize layer ids that no longer match the document — caught by
  the pre-existing synthesized-id assertion.
- A layer absent from the scene, or a singular ancestor chain, is now logged. It was
  silently absorbed by the identity assumption.

## The browser harness is now a real editing loop

`?commit=1` runs the genuine pipeline on release —
`composedSVG → artboardFromDesignOutput → translateLayerCommand → serializeArtboard`
— so "does the shape jump when I let go?" is measurable. Without it the shape sprang
back to its document position and a wrong commit space was invisible.

`?snap=1` makes snapping opt-in for tests. It was on by default and pulled a
48px drag by 3.3px at zoom 1, which is indistinguishable from a conversion error.

**Finding:** with snapping off there is **no mid-drag React re-render at all**. The
subtree replacement the preview guard exists for is caused by the snap-guide state
updates. Both guard tests now run with `snap=1`, or they would have passed without
exercising the guard.

## Proven load-bearing, not assumed

The acceptance suite was re-run with the new conversion disabled (`if (false && …)`):
4 of 6 tests fail, including all three zoom levels and the commit round-trip. The two
that still pass are the untransformed control and the attribute-vs-style check, which
is correct.

## Verified

```
389 native C++ checks · 106 WASM smoke checks · 142 engine parity checks
770 Vitest (34 new transformDelta tests) · 29 Playwright · tsc clean · build clean
```

Browser-measured, through the real editor at zoom 1, 2 and 4: a layer inside
`translate(40 30) scale(2)` carrying its own `rotate(25 …)` tracks the pointer
exactly, keeps its rotation during the drag, and does not move when the preview is
released and the document takes over.

## NOT done — do not assume otherwise

1. **Resize and rotate gestures still use the old screen-space maths**
   (`selectionMath.unrotatePoint`, `resizeBoxFromHandle`, `hostBoxToSvgBox`). The box
   and its handles are correct and `resizeLocalBounds` exists and is parity-tested on
   both sides, but the gesture handlers have not been migrated onto it. Corner resize
   after rotation is therefore still not claimed correct.
2. **Resize/rotate are not on the gesture channel.** `DragGestureEvent` carries a
   translation only; a matrix variant is needed before the engine can preview them.
3. **The full acceptance matrix** — 8 handles × rotate × flip × nested groups × undo
   × cancel × 1x/2x/4x × both renderers — is not automated. Drag is covered; resize
   and rotate are not.
4. **`offsetLayer` on a GROUP offsets every descendant's geometry by the same
   delta.** That is only correct while the descendants carry no transforms of their
   own. Dragging a group whose children are individually rotated or scaled will move
   them by the wrong amounts. Not triggered by the drag path yet because a drag
   targets the innermost layer, but it is reachable through group selection.
5. **Multi-layer drag** commits one layer. `selectedLayerIds` is used for hit-testing
   only.
6. The engine is still gated behind `?renderer=skia`, which is why the TS geometry
   duplication above still exists.


---

# Phase: resize and rotate migrated onto the authoritative geometry

## The reason corner resize never worked: the handles were unreachable

`.cornerRotationHandle` is 24px, `pointer-events: auto`, `z-index: 10`, and was
positioned **exactly on the corner** — where the 10px `.selectionHandle` sits, with
no z-index of its own. The rotation zone therefore received every corner
pointer-down. A corner drag rotated the shape; corner resize could not be performed
at all.

Found by measurement, not by reading: a diagnostic Playwright run dragged `nw` and
dumped the result — `__pydeeResizes` was empty, the rect's attributes were
unchanged, and every handle had come back rotated.

Fixed by offsetting the four rotation zones 20px outward along the diagonal (the
affordance Figma uses) and giving `.selectionHandle` `z-index: 12` so resize wins if
they are ever brought back together.

## Resize was also a no-op for every shape, by a second independent route

`SelectionOverlay` committed `{ kind: "box" }` for all layer kinds.
`resizeLayerCommand.applySnapshot` handles a box only for image and text — for a
shape it returns the layer **unchanged**. So even when a resize gesture did reach
the commit, a rect, ellipse, line, polygon or path was left exactly as it was.

Now `geometry/resizeGeometry.ts` maps new local bounds onto the real geometry, and
the snapshot kind is chosen by what can be expressed **exactly**:

| Layer | Snapshot | Why |
|---|---|---|
| rect, ellipse, line, polygon, parametric | `geometry` | numbers rewritten; properties panel stays meaningful, stroke width untouched |
| image | `box` | x/y/width/height IS its geometry |
| text, group, path | `transform` | no size field / arcs cannot be rescaled without mapping radii and axis rotation |

Path data is refused rather than approximated: an affine composed into the layer's
transform is exact for every path command, at the cost of scaling stroke width, and
that tradeoff is taken deliberately rather than silently producing wrong curves.

## The maths moved into the layer's own space

`handlePointerMoveForHandle` used to work in host pixels and un-rotate the pointer
about the box **centre**, while the box actually pivots on its **top-left corner** —
two errors that cancelled only for unrotated shapes. It now does:

```
client pointer --clientToWorld(view)--> world --resizeLocalBounds(obb, handle)--> local bounds
```

and the drawn box is DERIVED from those bounds through the same world transform the
renderer uses, so outline and shape cannot disagree. Deleted from the resize path:
`unrotatePoint`, `resizeBoxFromHandle`, `hostBoxToSvgBox`.

Resize now also previews on the shape itself, by APPENDING the bounds mapping to the
element's `transform` (appending puts it in the layer's own space; prepending would
move it instead of resizing it).

## Rotation pivot was in the wrong space, twice

1. `rotate(a cx cy)` composed into a layer's `transform` has its pivot in the
   **parent's** space. The pivot was being read through `getScreenCTM` inversion,
   which gives the SVG **root's** space — correct only for a top-level layer. Inside
   `translate(40 30) scale(2)` the shape swung about the wrong point.
2. The pivot was reconstructed as `box.x + width/2`, which is the centre of the
   **unrotated** rectangle. `obbCenter` is derived from the four world corners and
   is the real centre under any transform.

Both fixed; the nested-rotation test moved from 10.9px of centre drift to under 3px.

## `CreativeStudio.onResize` deleted, not adapted

65 lines that rebuilt geometry from a screen-derived box per layer kind: every
polygon assumed to be a triangle, path data regenerated from the layer's *name* via
`generateShapePath`, freehand strokes refused, anything else falling through to a
silent no-op. Replaced by `onResizeSnapshot`, which dispatches what the overlay
already computed.

`PydreeStudio.tsx` is locked and its inline `onResize` handler reads
`prevBox.x`/`.width` directly, so the box callback survives alongside the new one —
with its boxes now in the layer's **own** space rather than screen-derived, which is
what its per-kind mapping always needed. When a box cannot express the resize, the
overlay logs instead of mis-applying it.

Also collapsed: `ResizeSnapshot` was declared twice (`documentModel` and
`resizeLayerCommand`) and the copies had drifted. One definition now, re-exported.

## Acceptance matrix (browser, real commits)

`resizeRotateAcceptance.spec.ts` runs against `?commit=1`, so every gesture goes
through command → document → canonical SVG → re-render. The resize invariant is the
definition of the operation rather than a per-case number:

> dragging handle H moves H, and leaves the OPPOSITE anchor exactly where it was

which holds under any rotation, scale or nesting. Handle positions are read from the
overlay's own `[data-handle]` elements, so a box that disagreed with its handles
would fail too.

Covered: 8 handles × {`target`, `nested`} × zoom {1, 2} = 32 gestures; geometry
commit for a shape; transform commit for text; undo restoring exact prior geometry;
a flip past the anchor preserved; rotation centre fixed for a plain layer and for one
inside a scaled, translated group.

Each of the six failures found along the way was a distinct real defect, and each
test failed before its fix — the suite is load-bearing, not decorative.

## Verified

```
389 native C++ · 106 WASM smoke · 142 engine parity
805 Vitest (35 new resizeGeometry tests) · 39 Playwright · tsc clean · build clean
```

## NOT done — do not assume otherwise

1. **Resize/rotate are not on the gesture channel**, so the Skia renderer does not
   preview them. `DragGestureEvent` carries a translation only; a matrix variant is
   needed first.
2. **`offsetLayer` on a GROUP offsets every descendant's geometry by the same
   delta**, which is only correct while the descendants carry no transforms of their
   own. Reachable through group selection.
3. **Multi-layer resize and rotate** are not implemented; both act on the primary
   (last-picked) layer only.
4. **Text resize scales glyphs via a transform rather than changing `fontSize`**, so
   the typography panel's size field does not follow a handle drag.
5. `serializeArtboard` writes `data-layer-id` onto both a layer's `<g>` and the
   primitive it wraps, so the attribute is not unique in the DOM after a round-trip.
   Every current lookup takes the first match, which is the group, but it is a trap.
6. The engine is still gated behind `?renderer=skia`, which is why the TS geometry
   duplication described in the previous phase still exists.


---

# Phase: 4x coverage, the transform-doubling bug, and the full verification run

## User-reported defect: "rotate a shape, then drag it quickly, and the transform box detaches and throws away in the other direction"

Root cause, found by measurement rather than inspection. A diagnostic Playwright run
dumped the DOM around a single drag of a rect carrying `rotate(90 300 120)`:

```
initial      <g transform="rotate(90 300 120)">                 box 40x60 at (680,340)
during drag  <g transform="translate(30 0) rotate(90 300 120)"> box 40x60 at (710,340)   <- correct
after commit <g transform="rotate(90 300 120)">                 box 60x40 at (670,380)   <- wrong
             <rect transform="rotate(90 300 120)" x=270 y=70>
```

The commit itself was right (`dy: -30`, the correct local delta). The damage was in
**serialization**: `serializeShapeElement`, `serializeTextElement` and
`serializeImageElement` each wrote the layer's `transform` — and its
`data-layer-id` — onto the primitive, while `topLevelGroupAttributes` wrote both onto
the wrapping `<g>`. So the transform was applied **twice**. `rotate(90)` became
`rotate(180)`, which is precisely "throws away in the other direction", and the
dimensions flipped back from 40x60 to 60x40.

Two compounding consequences:

1. **Every commit doubled a transformed layer's transform.** Not just rotation —
   scale and translate too. The document corrupted itself progressively.
2. **`data-layer-id` was not unique in the DOM.** `target.closest("[data-layer-id]")`
   in `useCanvasDrag.resolveLayerTarget` could resolve the primitive instead of the
   layer group, which puts a preview translate in the layer's OWN space rather than
   its parent's. That is rate-dependent: a slow drag re-renders (snap guides) and the
   mid-drag re-resolve silently corrects it, which is why the report says "quickly".

Fixed by giving the three primitive serializers a `wrapped` flag. `serializePayload`
(top-level, inside a `<g>` that carries the identity and transform) passes `true` and
the primitive omits both; `serializeChildLayer` (a child with no per-layer wrapper)
passes `false` and the primitive keeps them.

`multiSelection.integration.test.tsx` queried `svg text[data-layer-id="text-live"]`,
which only ever worked because of the duplication. It now goes through the group.
That test was the only consumer; no production code relied on it.

Regression coverage: `browser-tests/dragAfterCommit.spec.ts` asserts the id and the
transform each appear exactly ONCE after a commit, that a second quick drag of a
90-degree-rotated rect still follows the pointer (a rotated-axis translate would move
it downward instead), and that the selection box tracks the shape through the drag and
its commit. The harness gained a `spun` rect rotated 90 degrees about its own centre
specifically so a direction error cannot be mistaken for a distance error.

## The 4x zoom gap was a test-environment fault, not a geometry fault

`playwright.config.ts` set `viewport: { width: 1280, height: 960 }` at the top level,
then `projects: [{ use: { ...devices["Desktop Chrome"] } }]` — and a project's `use`
REPLACES the top-level one for the keys it sets. `devices["Desktop Chrome"]` sets
`viewport`, so every test actually ran at 1280x720 while the config claimed 960.

The harness host is 1200x900, so at 4x zoom a handle at y ~890 was outside the
window. `page.mouse.move` to an off-screen point does nothing, which surfaced as
"the dragged handle did not move" rather than as a reachability problem. Viewport is
now 1400x1000, restated inside the project so the override cannot silently win again.

## Acceptance coverage now

| Gesture | Layers | Zooms |
|---|---|---|
| drag | plain, nested-in-scaled-group | 1x, 2x, 4x |
| drag after a commit | 90-degree-rotated rect, plain | 1x |
| resize, all 8 handles | plain, nested-in-scaled-group | 1x, 2x, 4x |
| resize commit kind | shape (geometry), text (transform) | 1x |
| undo, flip | plain | 1x |
| rotate, centre fixed | plain, nested-in-scaled-group | 1x, 2x, 4x |

## Full verification run

```
engine/scripts/build-engine.sh        389 checks, 0 failures
engine/scripts/build-engine-wasm.sh   106 checks, 0 failures   (4961 KB raw / 1624 KB brotli)
engine/scripts/verify-gn-args.sh       18 assertions, 0 failures
npm run test:engine                   142 checks, 0 failures
npx tsc --noEmit                      clean
npm test                              805 tests, 63 files, 0 failures
npm run test:browser                   48 tests, 0 failures
npm run build                         clean
```

## Root causes found across the whole effort, in one list

1. Selection geometry was measured from the DOM while the renderers used
   `worldTransform` — two sources of truth for one fact.
2. Four incompatible screen-to-document conversions existed; `useCanvasDrag` divided
   by `zoom` only, which is wrong under any ancestor scale and wrong in DIRECTION
   under any ancestor rotation.
3. `element.style.transform` REPLACES the SVG `transform` attribute, so every drag
   silently dropped a rotated layer's rotation. The code comment claimed it composed.
4. The 24px corner rotation zones sat exactly on the 10px corner resize handles with
   a higher z-index, making corner resize unreachable.
5. Shape resize committed `{ kind: "box" }`, which `applySnapshot` ignores for shape
   layers — so resizing any rect, ellipse, line, polygon or path did nothing.
6. The rotation pivot was read in the SVG root's space instead of the layer's parent
   space, and reconstructed from the UNROTATED box centre.
7. Snap reference boxes came from `getBBox()` per layer — each in its own local space
   — and were compared against each other.
8. `serializeArtboard` wrote the layer's transform and id onto both the wrapper and
   the primitive, doubling the transform on every commit.
9. `ResizeSnapshot` was declared twice and the copies had drifted.
10. The Playwright viewport was silently overridden, hiding the 4x cases.

## Remaining limitations — do not assume otherwise

1. **Resize/rotate are not on the gesture channel**, so the Skia renderer does not
   preview them. `DragGestureEvent` carries a translation only; a matrix variant is
   needed first.
2. **`offsetLayer` on a GROUP offsets every descendant's geometry by the same
   delta**, correct only while the descendants carry no transforms of their own.
   Reachable through group selection.
3. **Multi-layer resize and rotate** are not implemented; both act on the primary
   (last-picked) layer only. Multi-layer DRAG also commits one layer.
4. **Text resize scales glyphs via a transform** rather than changing `fontSize`, so
   the typography panel's size field does not follow a handle drag.
5. **Parsing is lossy for `<g transform="A"><rect transform="B"/></g>`** at top level:
   the primitive's own transform is dropped in favour of the group's. Not produced by
   this editor, but an imported document could contain it.
6. **The engine is still gated behind `?renderer=skia`**, which is why the TypeScript
   geometry modules still duplicate the C++ ones. The parity gate is what makes that
   acceptable; the retirement condition is loading the engine unconditionally.
7. Freehand path resize goes through the transform path, so its stroke width scales
   with the shape.


---

# Phase: the interaction hot path made DOM-free

## What was copied, and what was not

Two reference repos were suggested for their canvas smoothness. Neither was copied,
for reasons that are facts rather than preferences:

| Repo | Licence | Canvas |
|---|---|---|
| `Davronov-Alimardon/canva-clone` | Apache-2.0 | **Fabric.js**, in-repo |
| `imgly/canva-clone-react-cesdk` | **AGPL-3.0** | **CE.SDK** — commercial, licence-keyed, *not in the repo* |

The IMG.LY repo is AGPL-3.0, which is viral: importing its code would oblige the whole
product to be open-sourced, and its canvas is not there anyway (1.7 MB of mostly CSS
wrapping a paid SDK). The other one's smoothness *is* Fabric.js, a Canvas2D
immediate-mode JavaScript library — replacing real Skia compiled to WASM with it would
be a downgrade, and was explicitly ruled out.

What was adopted is the **behavioural property**: retained object state, rAF-driven
rendering, and no DOM on the interaction hot path.

## Measured first, so the work targeted the real cost

`browser-tests/canvasSmoothness.spec.ts` profiles a 60-sample drag on the live editor,
dispatching pointer events in-page so the numbers are our handler cost rather than
Playwright's pacing.

| | before | after |
|---|---|---|
| mean per pointer sample | 0.53–0.75 ms | **0.03–0.07 ms** |
| worst single sample | 7.5–8.0 ms | **0.6–1.5 ms** |
| total for 60 samples | 31.8–44.9 ms | **1.8–4.4 ms** |
| DOM attribute writes across 60 samples | 40–61 | **0** |

The worst sample fell from roughly half a 16.7 ms frame to under a tenth of one. Zero
attribute writes during a non-yielding sample loop is the *correct* result: the writes
are coalesced into the animation frame, which that loop never reaches.

## `interaction/liveTransformStore.ts`

One retained `LiveTransform` describes the whole gesture, and every gesture reduces to
the same value — the node's local transform for this frame. A move contributes
`P⁻¹·T·P`, a rotate a `rotate(a cx cy)` about a parent-space pivot, a resize the affine
mapping its old local bounds onto its new ones. Because all three are the same kind of
value, the engine needs exactly one entry point (`setNodeTransform`) and renderers need
no per-gesture branching.

Pointer handlers now do arithmetic and one assignment. Every DOM write — the element's
transform, the measurement badge, and the element re-resolve that guards against React
rebuilding the subtree — happens in the store's frame callback.

`end()` notifies synchronously and cancels any pending frame, because a deferred clear
would leave one frame where the preview and the committed document are both applied and
the object would jump by twice the drag.

Not a singleton: created by the owner, so two editors cannot cross-talk.

## Four real faults found while landing it

1. **The store dropped every sample after the first when its scheduler ran callbacks
   synchronously.** `pendingFrame` doubled as the "outstanding" flag; a synchronous
   callback cleared it, then `request` returned and re-assigned the handle, so the
   store believed a frame was still owed. Now tracked by a separate boolean and
   covered by a test that uses an inline scheduler.
2. **`setPointerCapture` bound the gesture to a node React owns.** Rewriting the
   markup removed it, so Chromium fired `pointercancel` mid-drag. Capture is gone;
   move and up are on the `window`, which makes the gesture independent of the
   subtree React rebuilds.
3. **`pointercancel` was wired to `dragEnd`, so an interrupted gesture COMMITTED a
   partial offset.** A cancel is now reported once and the gesture continues.
4. **The listener effect's cleanup abandoned an in-flight gesture on every
   re-attach**, not just on unmount, so a mid-drag re-render silently ended the drag.
   Guarded by an unmount-only ref whose cleanup runs first by declaration order.

## One tracked expected failure

`dragAfterCommit.spec.ts` → "the second drag still follows the pointer" is marked
`test.fail()`. With only two pointer samples and no yielding, the second sample of the
second gesture after a commit is not delivered to `dragMove`; the preview settles at
4px instead of 40px. Instrumentation shows `dragStart`, `dragMove(pending, 4)`,
`dragMove(move, 4)`, then nothing.

Ruled out: layer resolution, pointer ids, the drag threshold, container/svg
connectedness, pointer capture, `pointercancel` handling, and the cleanup abort — each
was a genuine fault, each is fixed, none was this one. It is a race with the re-render
that follows a commit, exposed by moving the write to a frame; a normal drag (four
samples with waits) tracks the pointer exactly at 1x, 2x and 4x, and the sibling tests
still verify the second drag's DIRECTION and the selection box following the shape.

`test.fail()` rather than `skip` on purpose: it stays green while the defect exists and
turns red the moment it is fixed, forcing the annotation to be removed.

## Verified

```
142 engine parity · 840 Vitest (12 new store tests) · 51 Playwright · tsc clean · build clean
```

## Still to do for the full property

1. **The selection overlay does not yet subscribe to the store**, so the box is static
   during a drag while the shape moves. `EditorCanvas` needs to own the store and pass
   it to both `SVGCanvas` and `SelectionOverlay`. This is the most visible remaining
   difference from an immediate-mode canvas.
2. **Resize and rotate still write the DOM synchronously** in `SelectionOverlay`; they
   should publish to the store like the drag does.
3. **The Skia renderer is still gated behind `?renderer=skia`.** Making it the
   interaction renderer is what removes the SVG attribute write entirely, rather than
   reducing it to one per frame.


---

# Single-canvas migration: baseline measurements and audit

## The measurements do NOT yet justify the migration on frame-rate grounds

`browser-tests/dragFrameRate.spec.ts` drives a continuous one-second drag from inside
the page (four pointer samples per animation frame) and counts frames actually
delivered. Both renderers, two document sizes:

| config | fps | p95 gap | max gap | DOM mutations / gesture | engine live |
|---|---|---|---|---|---|
| SVG, 1 object | 61 | 16.7 ms | 16.8 ms | 61 | – |
| SVG, 200 objects | 61 | 16.8 ms | 16.8 ms | 60 | – |
| Skia, 1 object | 61 | 16.7 ms | 16.8 ms | 60 | yes |
| Skia, 200 objects | **59** | 16.8 ms | **33.4 ms** | 59 | yes |

Read plainly:

* The SVG path sustains 61 fps with 200 objects. It is not dropping frames on this
  workload, so "the SVG DOM cannot keep up" is not supported here.
* The Skia path is currently **no faster, and marginally worse** at 200 objects (one
  33.4 ms gap, i.e. one dropped frame).
* DOM mutations are ~60 per gesture in BOTH modes — one per frame. Even with
  `?renderer=skia` the SVG DOM is still live and still being written, because
  `SkiaOverlay` paints *on top of* it. That is the hybrid, and it is real.

Two measurement traps were hit and fixed on the way, both of which would have
produced a confident wrong answer:

1. **The first Skia run never loaded the engine.** The spec used the dev server, which
   refuses to serve `/engine/pydee-engine.mjs` through import analysis, so the
   "Skia" number was an SVG number wearing a Skia label. The spec now uses the built
   harness on port 5200 and asserts `engineLoaded`.
2. **A one-rectangle fixture measures nothing about a real design.** `?objects=N` now
   pads the artboard, because SVG re-raster cost scales with subtree content.

## What this means for the plan

The migration is still worth doing — but for the reason the user gave first, not for
frame rate: **two live surfaces and one object model is a synchronization problem.**
Every defect found this session came from that seam, not from throughput:

* the selection box measured the DOM while the renderer used `worldTransform`
* `dx / zoom` was wrong under any ancestor transform
* `style.transform` silently dropped a rotated layer's rotation
* the serializer applied a layer's transform twice
* a mid-gesture React re-render abandoned the drag

None of those is a performance bug. All of them are consequences of the hybrid.

**So the migration should be justified and measured as a correctness/architecture
change, with frame time as a guardrail (must not regress), not as its headline.**

Before claiming smoothness, the next measurements needed are the ones that actually
correspond to "feels laggy" when fps is already 61:

1. **input-to-render latency** — pointer timestamp to the frame that shows the new
   position. 61 fps with a two-frame lag still feels detached.
2. **commit cost** — on release the whole document is parsed, mutated, re-serialised
   and re-injected as `innerHTML`. That is one large synchronous hitch per gesture and
   is not visible in a frame-rate average.
3. **the real editor shell**, not the bare harness: panels, more React, real raster
   assets (this repo ships a 28 MB JPEG and a 9.8 MB SVG).

## Audit: every path that currently renders or measures interactively

| Path | File | Status |
|---|---|---|
| design objects as SVG DOM | `SVGCanvas.tsx` (`dangerouslySetInnerHTML`) | to migrate |
| drag preview writes `transform` attribute | `useCanvasDrag.ts` `applyPreviewTranslate` | one write per FRAME now; to remove |
| resize preview writes `transform` attribute | `SelectionOverlay.tsx` `handlePointerMoveForHandle` | synchronous per sample; to migrate |
| rotate preview writes `transform` attribute | `SelectionOverlay.tsx` `handleRotateMove` | synchronous per sample; to migrate |
| selection box + handles as DOM divs | `SelectionOverlay.tsx` render | to migrate to canvas |
| live drag offset on a DOM node | `SelectionOverlay.tsx` `liveOffsetRef` | added this session; interim |
| snap guides as SVG | `SmartGuides.tsx` | to migrate to canvas |
| marquee as a DOM div | `SelectionOverlay.tsx` | to migrate to canvas |
| `getBoundingClientRect` for object geometry | none remaining | **done** — deleted in the geometry phase |
| `getScreenCTM` for object geometry | none remaining | **done** |
| `getBBox` for snap references | `useCanvasDrag.ts` (no-scene path only) | degraded path, logged |
| hit-testing via DOM pointer targets | `useCanvasDrag.resolveLayerTarget`, `SelectionOverlay` | to migrate to engine `hitTest` |
| React re-render per gesture sample | none (snap guides only, and only when snapping is on) | **done** |

Already in place for the target architecture: `interaction/liveTransformStore.ts`
(retained state + rAF coalescing), `interaction/gestureChannel.ts`,
`geometry/coordinateSpaces.ts`, `geometry/selectionGeometry.ts`,
`geometry/transformDelta.ts`, and the C++ `getWorldTransform` / `getWorldCorners` /
`getOrientedBounds` / `hitTest` API with 142 parity checks.

Still missing on the C++ side: `beginTransformGesture` / `updateTransformGesture` /
`endTransformGesture` / `cancelTransformGesture`, and canvas-rendered selection
(box, handles, rotation handle, guides) drawn by Skia in the same pass as the scene.

## Wired this session

`EditorCanvas` now owns the `liveTransformStore` and passes it to both `SVGCanvas`
(→ `useCanvasDrag`) and `SelectionOverlay`, so the selection box follows the dragged
shape in the same frame instead of waiting for the commit. The overlay applies the
offset to a dedicated node imperatively from the store's frame callback — React never
sets a transform on it, so the two cannot fight over the property.

## Verified

```
840 Vitest · 55 Playwright (+1 tracked expected failure) · tsc clean
```


---

# Single-canvas migration — Phase 1 COMPLETE: persistent canvas

## Finding: the contract already held, and is now pinned by tests

`browser-tests/canvasPersistence.spec.ts` (8 tests, all green on the first run) proves
the interactive canvas is created once and kept:

| survives | verified |
|---|---|
| selection change (to another layer, to none, back) | yes |
| zoom 2x, 4x, 0.5x, 1x, changed IN PLACE | yes |
| pan | yes |
| every sample of a drag gesture | yes |
| the document commit at gesture end | yes |
| undo | yes |
| exactly ONE interactive canvas mounted | yes |
| the WASM surface is not reallocated by zoom/pan/selection | yes |
| an in-place zoom actually redraws the canvas | yes |

`SkiaOverlay` already reallocates the `PydeeSurface` only when the artboard's pixel
size changes, and explicitly `delete()`s the old one (Emscripten objects are not
garbage collected). Selection, zoom, pan and commits do not touch it.

## How persistence is actually verified

Identity is checked by stamping `__mark` on the element and re-reading it. A selector
match would pass even if React had replaced the node between assertions, so the marker
is the only thing that proves persistence rather than mere presence.

The WASM surface is checked separately from the element, because the element can
survive while the surface behind it is thrown away — and the surface is the expensive
half. Surface identity is inferred from the backing-store size plus the engine readout
not going "unavailable".

## Two harness capabilities added for this

`window.__pydeeSetViewport(zoom, panX, panY)` and `window.__pydeeSelect(layerId)`
change viewport and selection IN PLACE. Driving them through the URL would reload the
page and destroy the canvas trivially, which would have proved nothing. Viewport and
selection are now React state in the harness rather than URL constants.

`?objects=N` pads the artboard with N ellipses, because a one-rectangle fixture cannot
show a cost that scales with subtree content.

## Guardrail for the rest of the migration

From `dragFrameRate.spec.ts`, to be re-run after each phase — frame time must not
regress:

```
SVG   1 object : 61 fps, p95 16.7ms, max 16.8ms, 61 DOM mutations/gesture
SVG 200 objects: 61 fps, p95 16.8ms, max 16.8ms, 60 DOM mutations/gesture
Skia  1 object : 61 fps, p95 16.7ms, max 16.8ms, 60 DOM mutations/gesture
Skia 200 object: 59 fps, p95 16.8ms, max 33.4ms, 59 DOM mutations/gesture
```

The DOM-mutation column is the migration's real progress metric: it must reach 0 for
the Skia path. Today it is ~60 per gesture in BOTH modes, because `SkiaOverlay` paints
on top of a live SVG DOM instead of replacing it.

## Verified

```
840 Vitest · 63 Playwright (+1 tracked expected failure) · tsc clean
```

## Phase 2 starting point

`SkiaOverlay`'s draw effect is keyed on `[artboard]`, which is derived from
`designOutput`. So the whole path — register fonts, `loadDefs`, extract RenderScene,
encode, `loadScene`, render — re-runs on every document commit. That is correct for a
commit and must NOT become per-frame, but it is also the "gesture-end hitch" Phase 6
has to measure.

For Phase 2 the work is to stop `SVGCanvas` painting design objects while the Skia
renderer is active, keeping the SVG DOM only as the export/compatibility backend. The
blockers to resolve first, in order:

1. **Hit-testing** currently reads DOM pointer targets (`resolveLayerTarget`,
   `SelectionOverlay`'s `data-layer-id` lookups). Without SVG objects in the DOM there
   is nothing to hit. This is Phase 5 and must land before, or together with, Phase 2.
2. **Text editing** mounts a DOM input positioned over the `<text>` node, and
   `EditorCanvas.handleExternalDoubleClick` resolves the text element from the DOM.
3. **`domTextMetrics`** measures with Canvas 2D `measureText` for the SVG path; the
   Skia path already uses engine metrics, so removing SVG must not silently switch
   which metrics the document was authored against.


---

# Single-canvas migration — Phase 5 landed: hit testing comes from the engine

Done before Phase 2 on purpose: with no SVG objects in the DOM there is nothing for
`event.target` to hit, so DOM-target hit testing had to go first.

## The seam

`SkiaOverlay` publishes a hit-tester upward via `onHitTester`, a stable callback that
reads refs so it never goes stale and returns null until the surface exists.
`EditorCanvas` holds it in a ref and passes `hitTestClient` to `SVGCanvas` ->
`useCanvasDrag`, which prefers the engine's answer and keeps the DOM result only for
the compatibility path — and only for the ELEMENT, never for the identity.

Hit testing lives with whatever rendered the pixels. The engine walks the same scene,
in reverse paint order, with the same world transforms it drew with, so a click cannot
resolve to a different object than the one under the cursor. `event.target` answers a
different question — which element received the event — and that depends on stroke
width, `pointer-events`, fill rules and however the serializer nested things.

## Client -> document needs no knowledge of zoom or pan

The canvas is drawn at the artboard's native size with an IDENTITY view transform and
then CSS-scaled by the stage, so:

```
documentX = (clientX - rect.left) * canvas.width  / rect.width
documentY = (clientY - rect.top)  * canvas.height / rect.height
```

The ratio of backing store to displayed rect IS the effective scale, and the rect is
where the canvas actually landed. Verified at zoom 1, 2 and 4 without the conversion
being told the zoom.

## Three things the tests caught

1. **`EditorCanvas` silently dropped the prop.** The harness passed `onHitTester` to a
   component that did not declare it, so the callback never fired and every probe
   returned null. Declared and forwarded.
2. **The readiness poll passed too early.** The readout starts as `"loading"`, so
   `!includes("skia: unavailable")` was true immediately and probes raced `loadScene`,
   returning null nondeterministically. The poll now waits for the CAPABILITY — a
   known-solid document point resolving — not for a string.
3. **My expectation was wrong, not the code.** The engine returns `nested-el` for the
   layer inside the scaled group. That is the innermost DOCUMENT layer: the fixture's
   rect carries `data-element-id="nested-el"`, and `parseChildElement` makes it a layer
   in its own right, so the DOM path returns the same id. The engine is not "returning
   leaves instead of layers".

## Verified

`browser-tests/engineHitTest.spec.ts`, 5 tests. Seven fixture points at zoom 1, 2 and
4: the plain rect and its corner regions, the 90-degree rotated rect, the layer nested
in `translate(40 30) scale(2)`, and two empty points. Plus the decisive case — a point
inside the rotated rect's AXIS-ALIGNED box but outside its real geometry must MISS,
which is the difference between geometry and a bounding box.

```
840 Vitest · 68 Playwright (+1 tracked expected failure) · tsc clean
```

## Frame-time guardrail after Phase 5 — no regression

```
SVG   1 object : 61 fps, p95 16.7ms, 61 DOM mutations/gesture
SVG 200 objects: 61 fps, p95 16.7ms, 61 DOM mutations/gesture
Skia  1 object : 61 fps, p95 16.7ms, 59 DOM mutations/gesture
Skia 200 object: 61 fps, p95 16.7ms, 61 DOM mutations/gesture   (was 59 fps / 33.4ms max)
```

Skia at 200 objects improved from 59 fps with a 33.4 ms stall to 61 fps with no gap
over one frame interval. DOM mutations are still ~60 per gesture in both modes, which
is Phase 2's job: `SkiaOverlay` still paints on top of a live SVG DOM.

## Phase 2 remaining blockers

1. **Text editing** mounts a DOM input over the `<text>` node, and
   `EditorCanvas.handleExternalDoubleClick` resolves the text element from the DOM. A
   canvas-only surface needs the caret/input positioned from engine geometry instead.
2. **`domTextMetrics`** measures with Canvas 2D `measureText` for the SVG path while
   the Skia path uses engine metrics. Removing the SVG surface must not silently change
   which metrics a document was authored against.
3. **`SelectionOverlay` and `SmartGuides`** still position DOM elements; that is
   Phase 3, and it can follow Phase 2 because they sit above the canvas rather than
   depending on SVG objects existing.


---

# Single-canvas migration — Phase 2 landed: the engine is the only visual surface

## The measured result

```
                fps   p95      over-budget frames   DOM mutations / gesture
SVG   1 object   61   16.7ms          15                    61
SVG 200 objects  61   16.7ms           9                    61
Skia  1 object   61   16.8ms           4                     0
Skia 200 objects 61   16.8ms           4                     0
```

**Zero DOM mutations during a whole gesture on the engine path**, at 1 and at 200
objects. Over-budget frames also fell from 22–32 (before Phase 5) to 4, against 9–15
for the SVG path — the first measurement in this migration that actually favours the
single-canvas architecture, and it only appeared once the duplicate work was removed.

Both numbers are now ASSERTED, not logged: `dragFrameRate.spec.ts` fails if the engine
path mutates any design-object attribute, and fails if the SVG design layer is still
visible. The SVG path is asserted to still mutate, so if it ever stops we know the
compatibility renderer broke rather than improved.

## What changed

Two separate flags, because hiding pixels and suppressing writes are separate facts and
conflating them makes a half-migrated state impossible to describe:

* `SVGCanvas.hideDesignObjects` — `visibility: hidden` on `.svg-canvas-markup`. Hidden,
  **not unmounted**: the subtree keeps its layout, so `getBBox`, the text editor's
  positioning and the canonical-SVG/export path all still work, while the browser
  rasterises none of it.
* `useCanvasDrag.domPreview` — when false, the frame callback skips
  `applyPreviewTranslate` entirely (and so does the MutationObserver re-apply). The
  retained state is still updated and still published every frame; nothing reaches the
  DOM.

`EditorCanvas` sets both from `skiaOverlayEnabled`, so SVG mode is byte-identical to
before.

## Three tests had to change, and one of them was asserting the hybrid

1. **`waitForSelector` defaults to waiting for VISIBILITY.** Two specs timed out
   because the SVG objects are now correctly invisible. They wait for
   `state: "attached"` now — the layout is all they need.
2. **`skiaSvgCoordinateParity` asserted that BOTH renderers move during the drag.**
   That is the hybrid, restated as a test. With one interactive surface the SVG
   deliberately does not move, so keeping that assertion would have forced the
   duplicate write back. Retargeted:
   * the engine's bitmap moves by the document delta, and therefore by the pointer's
     screen displacement — this IS the preview now;
   * the SVG design layer moves by ZERO during the gesture;
   * parity is checked on the COMMITTED document instead — after release, the SVG
     catches up to where the engine already drew. That is the property Phase 8 needs,
     and it is a stronger check than comparing two live previews.
3. That spec was not applying commits (`commit=1` absent), so there was nothing for the
   SVG to catch up to. Fixed.

## Verified

```
840 Vitest · 68 Playwright (+1 tracked expected failure) · tsc clean · build clean
```

## What is still on the DOM (Phase 3 and beyond)

The design objects are gone from the interactive surface. These remain:

* selection box, handles, rotation handle, marquee — `SelectionOverlay` DOM divs
* snap guides — `SmartGuides` SVG
* the live drag offset node in `SelectionOverlay`
* text editing — a DOM input positioned over the `<text>` node
* resize/rotate previews still write SVG `transform` synchronously in
  `SelectionOverlay`; only the drag has been moved off

None of these renders a design object, so the "one visual surface for the design" claim
holds. They are overlay chrome, and Phase 3 moves them into the Skia coordinate system.

The SVG subtree is still MOUNTED and still mutated by resize/rotate. Unmounting it needs
text editing moved off the DOM first — that is the remaining hard dependency, and
`domTextMetrics` (Canvas 2D `measureText`) versus engine metrics has to be reconciled at
the same time so a document is not silently re-measured with a different engine.


---

# Single-canvas migration — Phase 3 landed: selection is drawn on a canvas

## Coincidence is structural, not asserted

The design canvas and the selection canvas now sit inside ONE transformed parent,
`[data-role="skia-stage"]`:

```
<div data-role="skia-overlay">            // flex-centred, inset 0
  <div data-role="skia-stage"            // artboard-sized, ONE translate+scale
       transform="translate(pan) scale(zoom)">
    <canvas data-role="skia-canvas"/>    // the engine's pixels
    <canvas data-role="selection-canvas"/>  // absolute 0,0, NO transform of its own
  </div>
</div>
```

Both canvases are the artboard's native pixel size and neither is separately
transformed, so a point drawn at document coordinate `p` on the selection canvas lands
on exactly the pixel where the engine drew `p`. There is no conversion between them, so
there is nothing to disagree about. The previous DOM overlay had a second coordinate
system and drifted in it.

The zoom/pan transform previously lived on the design canvas itself; moving it to the
shared parent is what makes this guarantee possible.

## `renderer/SelectionCanvas.tsx`

Draws the outline, eight handles and the rotation control in DOCUMENT coordinates from
`obbCorners(obb)` — i.e. `worldTransform × localCorner`, the same matrix the engine
rendered with. There is no trigonometry in the file: handles are interpolated from the
four corners, so rotation, scale, skew, flip and every ancestor group transform come
along for free.

Zoom appears in exactly one place: sizes. Handle size, outline width and the rotation
offset are screen-pixel constants divided by zoom, because the shared parent scales the
canvas. Those are LENGTHS; positions are pure document coordinates.

It subscribes to `liveTransformStore`, so during a drag the box moves in the same frame
as the object, from the same retained state, with no React render and no DOM write.

A non-finite corner draws NOTHING rather than a guessed box.

## The DOM chrome is hidden, not removed

`SelectionOverlay` gained `chromeHidden`, set from `skiaOverlayEnabled`, which applies
`opacity: 0`. The handles stay in the DOM as invisible pointer targets because resize
and rotate gestures still live there — Phase 4 moves them. Two *visible* selections
would be the hybrid made obvious, just for chrome instead of for objects.

## Verified — `browser-tests/selectionCanvas.spec.ts`, 7 tests, green first run

Coincidence is checked by reading PIXELS, not element rects — an element rect would tell
us where a DOM node is, which is the measurement this migration removed.

* the two canvases have identical backing stores AND identical displayed rects (so the
  same effective transform)
* handles land on all four of the object's corners at zoom 1, 2 and 4
* no selection ink far from the object
* the outline follows a ROTATED object's real corners — `spun` is a 60x40 rect rotated
  90° about (300, 120), so the test requires ink at (280, 90) and (320, 150). An
  axis-aligned box around the unrotated geometry would put them at (270, 100) and
  (330, 140), so this case is what distinguishes an oriented box from a bounding box.
* an empty selection draws nothing
* during a drag the box is at the NEW corner and *not* at the old one

## One test had to change

`canvasPersistence`'s "zoom actually redraws" watched the canvas element's own CSS
transform. Zoom now lives on the shared stage, so the canvas correctly has no transform
and nothing about it changes. It watches the stage's transform instead — and additionally
asserts the stage EXISTS, since its absence would silently reintroduce two transforms.

## Frame guardrail — no regression

```
SVG   1 object : 61 fps, p95 16.7ms, 60 DOM mutations
SVG 200 objects: 61 fps, p95 16.8ms, 60 DOM mutations
Skia  1 object : 61 fps, p95 16.8ms,  0 DOM mutations
Skia 200 object: 61 fps, p95 16.7ms,  0 DOM mutations
```

Still zero DOM mutations per gesture on the engine path, now while also painting the
selection every frame.

```
840 Vitest · 75 Playwright (+1 tracked expected failure) · tsc clean
```

## What Phase 4 has to take on

Resize and rotate still write SVG `transform` synchronously in `SelectionOverlay`, and
their gestures still read DOM handle elements. Moving them needs the C++ lifecycle —
`beginTransformGesture` / `updateTransformGesture` / `endTransformGesture` /
`cancelTransformGesture` — plus hit regions for the handles from the engine so the
invisible DOM handles can be deleted rather than merely hidden.


---

# Phase 4 — the gesture lifecycle moved into C++

Resize and rotate were the last two gestures writing an SVG `transform` attribute
synchronously on every pointer sample, and the last two reading DOM handle elements to
decide what was grabbed. Both now go through the engine.

## New files

| File | Responsibility |
|---|---|
| `engine/include/pydee/gesture.h`, `engine/src/gesture.cpp` | solving an in-flight gesture into a transform; handle hit regions |
| `frontend/src/editor/geometry/gestureSolve.ts` | the TypeScript mirror, used by the canonical-SVG renderer |
| `frontend/src/editor/interaction/gestureBridge.ts` | the seam between a pointer handler and whoever solves the gesture |
| `frontend/src/editor/renderer/selectionChrome.ts` | chrome sizes shared by the drawing and the hit test |

`selection.h` gained one accessor, `TransformContextForNode`, which returns a node's
`parent_world`, `local_transform` and `world_transform` together. All three are needed
because recovering one factor by inverting the other fails for a node that is scaled to
zero on an axis — and such a node is still draggable.

A separate file rather than an extension of `selection.cpp`: that file's stated
responsibility is deriving geometry from world transforms, which is a pure function of
the scene. A gesture also depends on something in flight. AGENTS.md rule 8.

## The three expressions

```
move    local' = P⁻¹ · T(Δ)        · P · L₀
rotate  local' = P⁻¹ · R(δ, pivot) · P · L₀
resize  local' =      L₀ · B(from → to)
```

`P` is the parent's world transform, `L₀` the node's own transform at pointer-down.

The asymmetry is the point, not an inconsistency. Move and rotate compose on the LEFT,
in the parent's space, because "move or turn the object as it appears on screen" is a
statement about world space. Resize composes on the RIGHT, in the node's own space,
because "make this box that box" is a statement about local geometry.

## The defect this uncovered

The editor's rotation appended `rotate(δ cx cy)` to the layer's transform with `cx,cy`
measured in the PARENT's space — a right-composition carrying a left-composition's
pivot. Those agree **only when the layer's existing transform is itself a rotation about
that same point**.

Every rotated layer in the browser fixture happened to satisfy that: `rotated` is
`rotate(35 250 300)` on text anchored at (250,300), `nested` is `rotate(25 30 20)` on a
rect whose centre is (30,20), `spun` is `rotate(90 300 120)` on a rect centred at
(300,120). So the difference was identically zero and a real rotation defect passed
every test it had, at three zoom levels, for as long as it existed.

Three new pieces of coverage separate them:

- `TestRotationPivotIsNotAffectedByAnExistingTransform` (native) — computes the old
  formulation alongside the new one and requires them to differ by more than 5 world
  units, so the invariant is not vacuous.
- `gestureSolve.test.ts` — the same, plus a case that shows the two COINCIDE when the
  existing pivot is the centre, which is why the defect stayed hidden.
- A new fixture layer `offcentre`, rotated about its own top-left corner, and
  `engineGestureLifecycle.spec.ts` driving a 45° rotation through the real editor on
  BOTH renderers. The old composition moves that layer's centre by ~15px; the assertion
  allows 4px.

## Handle hit regions replace invisible DOM elements

With the chrome painted on a canvas there is no element under the cursor, so a press is
resolved by asking where the handles ARE. `HitTestSelection` answers from the same
geometry and the same size constants that drew them, in this order: the eight resize
handles, then the rotation control above the top edge, then the four corner rotation
zones, then the object's body (tested in LOCAL space, so it is exact for any rotation,
skew or flip), then nothing.

`selectionChrome.ts` exists so the drawing and the hit test cannot disagree about what
"a 9px handle" means. The hit sizes are deliberately larger than the drawn ones —
`HANDLE_HIT_SIZE_PX` 14 vs `HANDLE_SIZE_PX` 9, `ROTATION_HIT_RADIUS_PX` 11 vs
`ROTATION_RADIUS_PX` 5.5 — as separate constants, so the difference is a decision.

On the engine path the DOM chrome is `opacity: 0` **and** `pointerEvents: none`. Without
the second, one press starts two gestures.

## Parity, because two implementations exist

The canonical-SVG renderer is also the export path and has to keep working, so
`gestureSolve.ts` is the fallback. `engine-parity.mts` hands both solvers the SAME
snapshot and pointer over 480 frames — four nodes × three kinds × four offsets × three
modifier sets, on a scene with a translating+scaling ancestor, an inner group that
rotates and mirrors, and rotations about non-centre pivots — and requires the local
transform, local bounds, angle, world delta, pivot and all four world corners to agree
to 1e-9. Cancellation runs on every iteration, and the suite then asserts the scene is
byte-identical to how it loaded, so a drifting base cannot silently weaken later
comparisons. Non-vacuity is asserted too: 48 rotation frames, largest 48.89°.

## Two defects found by measurement

1. **A stale closure in the window listeners.** `attachGestureListeners` is memoized
   with no dependencies, so a captured `finishHandleGesture` was the FIRST render's —
   closing over that render's `designOutput`, which the commit reads. After one resize
   committed, a second 25px drag computed its bounds ratio (105 → 130) against the
   ORIGINAL 80-wide geometry and committed a SHRINK to 99.05px. The handlers are now
   reached through a ref re-pointed every render. Covered by "a second gesture in quick
   succession commits against the CURRENT document".

2. **`from` and `to` in different spaces.** `originLocalBounds` came from this file's
   own geometry while `to` came from the engine's snapshot, which is uploaded from an
   effect and therefore one render behind the document. Both now come from whoever
   solved the gesture.

## Commits are matrices now

A rotation commits `matrix(a b c d e f)` — the transform the solver produced for the
final frame — instead of a `rotate()` string appended to whatever was there. The
committed document and the previewed pixels are then the same matrix by construction
rather than by two derivations agreeing, and `composeRotation`/`safeRotation` (57 lines
of string surgery that existed to fold stacked `rotate()` calls) are deleted, because a
matrix cannot accumulate.

## Frame guardrail

`browser-tests/handleGestureFrameRate.spec.ts`, 248 pointer samples over one second:

```
                fps  p95      design-object mutations  chrome mutations
SVG    resize    61  16.8ms    61  (one per FRAME)      1381
SVG    rotate    61  16.7ms    61  (one per FRAME)      2223
Skia   resize    61  16.8ms     0                        119
Skia   rotate    61  16.8ms     0                        119
```

Zero design-object mutations for a whole resize or rotate on the engine path. The SVG
path is at one write per frame rather than one per sample — a 4× reduction at this
sample rate, which is the coalescing rather than a change of renderer. The 119 chrome
mutations on the engine path are the measurement badge's per-frame position update; the
DOM selection box is not updated at all when a canvas is drawing it.

Drag, unchanged: 61 fps, 0 mutations on the engine path, 61 on SVG.

```
551 native checks · 164 WASM smoke checks · 630 parity checks
863 Vitest · 85 Playwright (+1 tracked expected failure) · tsc clean · build clean
```

## What is still on the DOM

The marquee, the smart guides, the measurement badge, the inline text editor, and the
selection chrome as `opacity: 0` markup for the SVG renderer's benefit. None of them
renders a design object or decides where a handle is. Deleting the chrome markup
entirely waits for the SVG renderer to stop being an interactive surface at all, which
is Phase 8.


---

# Phase 6 — measurement: latency, micro-movement fidelity, and the commit hitch

## Micro-movement fidelity was the first thing checked, because FPS does not measure it

A renderer can hold 60fps while quantising to whole pixels, waiting for a large delta, or
dropping samples — and all three feel like the object is stuck. `Davronov-Alimardon/canva-clone`
is a useful behavioural reference for the retained-canvas model (object state in memory,
rAF-driven repaint, no DOM on the interaction path) and remains the wrong implementation to
copy: its canvas IS Fabric.js. The property was reproduced on the C++/Skia engine instead.

An audit of the interaction path found NO quantiser: `normalisePointer` passes `clientX`
through, `dragMove` computes `clientX - startX` in doubles, `clientToWorld` divides by zoom,
`setNodeDocumentTranslation` takes doubles, and no `setPointerCapture` is used anywhere (it
was removed earlier because it bound the gesture to a node React replaces). The 0.5px
authoring quantiser had already been deleted; `formatTransformValue` keeps four decimals and
only feeds the SVG fallback preview.

Two things were missing and are now in place:

- **`interaction/pointerSample.ts`** — `newestPointerSample` takes the LAST entry of
  `getCoalescedEvents()`, never an average and never a replay of the list. Averaging puts the
  object behind the pointer; replaying applies states the display cannot show. Shared by the
  drag hook and by resize/rotate so both read input identically.
- **`pointerrawupdate`** as an additional source on both paths, feature-detected. It does not
  make the object move more often — the store still publishes once per animation frame — it
  makes the sample that frame uses NEWER. The handlers recompute from the gesture's start
  state and overwrite retained state, so two streams cannot double-apply anything.

### Measured — `browser-tests/subPixelFidelity.spec.ts`, 19 tests

The object's position is read from the engine's world transform, because at a quarter of a
pixel a pixel probe cannot distinguish movement from antialiasing. The loop is then closed:
one test accumulates 40 x 0.25px steps and asserts the PAINTED shape moved >= 9px, so the
sub-pixel work is verified through the transform and the transform against the pixels.

Tolerance is 0.01 document px — four orders of magnitude above the floating-point floor and
eight times smaller than the smallest increment driven. Snapping is off, because alignment
snapping is the one feature legitimately allowed to pull an object off the pointer.

```
zoom 1  0.25px steps -> 0.25, 0.50, 0.75 ...  maxError 0      deadSamples 0
zoom 4  0.25px steps -> 0.0625, 0.125 ...     maxError 0      deadSamples 0
zoom 4  0.5px  steps -> 0.125, 0.25 ...       maxError 0      deadSamples 0
rotated / nested-in-scale(2) / offcentre, zoom 1 and 4        maxError 0, deadSamples 0
pen and mouse, identical                                     maxError 0, deadSamples 0
```

Not "within tolerance" — bit-exact. At 4x zoom a 0.25px pointer step moves the object by
exactly one sixteenth of a document pixel, every sample, including through a rotated
ancestor and a 2x scaled group.

Latest-wins was measured separately, since coalescing is correct and interpolation is not:
eight 0.25px samples dispatched with no frame between them render 2.00px — the eighth sample
— not 0.25 (the first) and not 1.125 (the mean). Both alternatives are asserted to be far
enough away that the check cannot pass by coincidence.

Touch is deliberately excluded: its 4px threshold absorbs finger wobble, so a 0.25px step
would never start a gesture and asserting otherwise would assert the threshold is broken.
The threshold gates gesture START only; the tests cross it with one 6px move that is not
measured, then measure every sample after it.

## Input-to-visible latency — `browser-tests/inputLatency.spec.ts`

Per trial: timestamp, dispatch one `pointermove`, then watch the visible representation each
animation frame until it reflects that sample. Two limitations stated rather than hidden: a
rAF callback runs BEFORE compositing, so this is time until our code produced the new visible
state; and the floor is therefore about one frame period. The dispatch is jittered against
the frame clock so the best case is not the only case measured.

```
                pointer -> visible            engine decomposition (median)
              median   p95    max      render  readPixels  upload  wait for frame
SVG    1 obj    8.8   16.4   16.6        —         —         —          —
SVG  200 obj    8.8   16.9   17.2        —         —         —          —
Skia   1 obj   14.9   25.0   25.2       0.7       6.7       0.2       ~6.5
Skia 200 obj   20.5   28.4   29.7       2.8       7.9       0.3       ~8.5
```

**The SVG path is currently LOWER latency than the engine path**, and the decomposition says
exactly why: `readPixels` costs 6.7–7.9ms per frame while rendering costs 0.7–2.8ms. The
engine draws the scene ten times faster than it can hand the result to a canvas.

`readPixels` reads the surface as UNPREMULTIPLIED RGBA because that is what `ImageData`
requires, so Skia converts every pixel out of the surface's premultiplied form — 160,000
pixels per frame at ~44ns each. `putImageData` itself is 0.2ms, so the browser is not the
problem.

Two changes were made off the back of this:

- The per-frame `Uint8ClampedArray` + `ImageData` allocation is gone; one `ImageData` is
  reused for the surface's lifetime. 640KB of garbage per frame removed (4.6MB at 1080x1080).
- `RasterTarget::ReadPixelsRGBA` used `assign(n, 0)`, zero-filling the whole buffer before
  Skia overwrote every byte. Now `resize`, which is free after the first frame.

**Honest negative result:** the memset removal did not measurably help — 8.0ms before, 6.7ms
after, inside run-to-run variance. The cost is the per-pixel conversion, not the zero-fill.
Both changes are kept because they are strictly better and free, but neither is the fix.

The structural fix, named and not attempted here: render into a GPU surface the canvas
already owns (CanvasKit's WebGL backend), so there is no readback at all. That is a renderer
change, not a tuning one. At 400x400 the engine path fits in a frame with ~2ms to spare; at
200 objects it does not, which is why over-budget frames appear at all.

## The commit hitch — `browser-tests/commitHitch.spec.ts`

Releasing the pointer runs a chain no drag frame touches, and every stage is proportional to
the size of the WHOLE document rather than to what moved:

```
canonical SVG -> artboardFromDesignOutput -> command.apply -> serializeArtboard
              -> React re-render -> innerHTML parse
              -> extractRenderScene -> encodeScene -> loadScene -> render
```

```
              worst frame:  during drag   after release   excess   longest task   pipeline (parse/apply/serialise)   markup
SVG    1 obj                   16.7           66.8         50.1         73         0.8 / 0.1 /  1.3                  1.5KB
Skia   1 obj                   16.7           33.4         16.7          0         1.5 / 1.9 /  4.6                  1.5KB
SVG  200 obj                   16.7          383.3        366.6        390        13.0 / 0.2 / 12.0                 45.9KB
Skia 200 obj                   33.3          233.3        200.0        245        12.2 / 0.8 / 16.5                 45.9KB
```

**This is the largest user-visible cost in the system by an order of magnitude** — a third of
a second of frozen UI on release with a 200-object document, against 16.7ms frames during the
drag itself. A frame-rate average over the gesture hides it completely, which is why it is
measured separately.

The document pipeline is only 30–66ms of it. `SkiaOverlay` now reports its upload stages
(`onUploadReport`: fonts / defs / extract / encode / loadScene / total / sceneBytes) so the
rest is attributable rather than a gap.

The identified fix is architectural: a commit currently round-trips the whole document
through a canonical-SVG STRING — serialise 46KB, hand it to React, `innerHTML` it, re-parse
it, re-extract the scene, re-encode and re-upload — for what was a change to one layer's
geometry. Keeping the artboard as the propagation format and updating the scene incrementally
is the fix. It touches how commits flow through CreativeStudio, so it is recorded here with
the measurement that justifies it rather than attempted inside a measurement phase.

## Instrumentation added

- `InteractionEngine.FrameStats.sampleMs` — the newest sample's timestamp, so latency can be
  measured to any downstream milestone instead of only to the end of `render`.
- `SkiaOverlay.onFrameReport` -> `EngineFrameReport`: inputLatency, presentLatency,
  frameDuration, readback split into `wasmReadMs` and `uploadMs`, coalescedSamples,
  patchCalls, nodesDrawn.
- `SkiaOverlay.onUploadReport` -> `EngineUploadReport`: per-stage upload timing.
- Harness: `__pydeeFrameReports` (bounded ring buffer) and `__pydeeCommitTimings` (per-stage
  document pipeline).

## One fixture defect this found

`paddingLayers` scattered ellipses across the whole artboard, including over `target`'s
centre. Hit testing answers by depth, so a press meant for `target` silently dragged an
ellipse instead, and every measurement watching the target's position reported that nothing
moved — 40 of 40 trials at objects=200, none at objects=1. Padding now keeps clear of the
target's box. Any earlier objects=200 measurement that only counted frames or mutations is
still valid; anything that watched the target's position was not.

```
551 native checks · 164 WASM smoke checks · 630 parity checks
863 Vitest · 116 Playwright (+1 tracked expected failure) · tsc clean · build clean
```


---

# Phase 7 — realistic content, and the change that made the architecture viable

## The measurement that forced the work

Every earlier number came from a 400x400 artboard holding four small rects. The editor's
actual default document is 1080x1080 — 7.3x the area — and Phase 6 had established that both
of the engine's dominant per-frame costs scale with pixel COUNT. So the small fixture was
understating them by that factor.

`?artboard=N` and `?content=heavy` were added to the harness: a full-bleed gradient, a
radial-gradient blob, text at three sizes and a group of twelve bezier paths, so gradient
resolution, skparagraph shaping, layer isolation and the path parser are all exercised.

Measured before the fix, on an idle machine:

```
size     MP     fps    render   readPixels   present
 400   0.16   59-61      8.0          4.9      16.4
 800   0.64    18.7     30.2         23.4      57.3
1080   1.17    11.3     51.7         39.5      96.3
1350   1.82     7.7     75.4         60.8     143.8
```

**11.3fps at the editor's default document size.** Both costs were ~34-44ms per megapixel, so
tuning either one could not have helped: a full repaint plus a full readback simply does not
fit in a frame at a real document size.

## The fix: repaint and read back only what changed

The engine now tracks damage itself, because only it knows the transform chain. Every
transform mutation — `setNodeTransform`, `setNodeDocumentTranslation`, and the gesture
lifecycle's `applyGestureTransform` — unions the node's world bounds BEFORE and AFTER the
change. Both, because covering only the new position leaves the old one painted.

New API:

| Call | Responsibility |
|---|---|
| `renderDamaged(view…, padding)` | render clipped to the damage rect; returns the rect, or a reason |
| `readPixelsRegion(x, y, w, h)` | read one tightly packed rectangle, clamped to the surface |
| `hasPartialDamage()` | whether a partial repaint is possible at all |
| `invalidateAll()` | force the next paint to be full |
| `RasterTarget::ReadPixelsRegionRGBA` | the C++ half of the region read |

`RenderOptions.dirty_rect` and `cull_rect` already existed and already worked — `dirty_rect`
clips the canvas so Skia rasterises only that area (and the background clear is clipped with
it), and `cull_rect` skips nodes that cannot touch it so their paints are never set up. The
missing pieces were the region readback and something to decide the rect.

`InteractionEngine.paint` prefers the damaged path and falls back to a full render when the
engine refuses — after a scene upload, or when a node's geometry cannot bound what changed.
`setView` invalidates, because a different view makes every existing pixel suspect.
`SkiaOverlay` copies the region's rows into the existing full-size `ImageData` at their real
offsets and uses `putImageData`'s dirty-rect form, so a partial frame allocates nothing.

`DAMAGE_PADDING_PX = 4` on every side: a stroke, a shadow and antialiasing all paint outside a
node's bounds, and a rect that hugged them would leave a one-pixel ghost of the previous
outline.

## The selection canvas had the same bug

With the engine down to ~1ms per frame, 1080x1080 still only delivered 32.7fps. The remaining
cost was `SelectionCanvas` clearing all 1.17 megapixels every frame to redraw a box a couple
of hundred pixels across. It now clears the union of where the chrome was and where it now is,
computed from the corners plus the rotation-control offset and handle size. That alone took
1080x1080 from 32.7 to 53.5fps.

## Measured after, `npm run test:bench` on an idle machine

```
size     MP    fps   p95     FULL repaint      GESTURE frame          damage   nodes
                             render / read     render/read/upload     frac     full/gesture
 400   0.16   60.5  16.8      36.4 / 11.3       0.6 / 0.3 / 0.0        4%      82 / 7
 800   0.64   60.5  16.8      56.3 / 22.3       0.4 / 0.2 / 0.0        1%      82 / 4
1080   1.17   60.5  16.7      69.2 / 38.1       0.3 / 0.2 / 0.0        1%      82 / 2
1350   1.82   60.0  16.8     106.2 / 58.6       0.3 / 0.2 / 0.0        0%      82 / 2
```

**60fps at every size, p95 inside the 16.7ms budget, engine work half a millisecond per
frame.** 1080x1080 went from 11.3fps to 60.5. A full repaint still costs what it always did —
that is the number damage tracking exists to avoid, and it is still measured so the comparison
stays honest.

Latency reversed the Phase 6 finding as well:

```
                pointer -> visible (median / p95)   engine render / read
SVG    1 obj           8.8 / 16.4                        —
Skia   1 obj  (P6)    14.9 / 25.0                    0.7 / 6.7
Skia   1 obj  (now)    9.8 / 16.1                    0.2 / 0.2
Skia 200 obj  (now)   10.9 / 16.2                    0.2 / 0.2
```

Phase 6 had to report that the SVG path was LOWER latency than the engine path. It no longer
is: the engine path is now at parity on the median and better on p95.

The commit hitch improved without being the target: at 200 objects the worst frame after
release went from 233ms to 66.7ms, and at one object from 33.4ms to 16.8ms — one frame, no
long task at all.

## Three defects this phase found

1. **Padding objects covered the drag target.** Hit testing answers by depth, so a pad ellipse
   over `target`'s centre meant a press meant for the target dragged the ellipse instead. 40 of
   40 latency trials missed at objects=200 and none at objects=1. Padding now keeps clear of
   the target's box.

2. **The SVG wrapper auto-fits to the host; the Skia stage does not.** At an artboard larger
   than the 1200x900 harness host, `getBoundingClientRect` on the SVG layer reported it 0.888x
   smaller and in a different place than the engine drew it. A benchmark that took its press
   position from the SVG element therefore pressed on empty background — the target did not
   move at all, and what got dragged was the full-bleed gradient whose damage rect is the whole
   artboard. That is what the 6.4fps/91%-damage reading at 1350 actually was.

   The benchmark now uses fit-to-viewport zoom, as `useViewport` does, and takes its press
   position from the engine's own `documentToClient`. **The underlying disagreement is still
   there and is a Phase 8 item**: any DOM-positioned UI — the inline text editor above all —
   is placed from the SVG's geometry, so at those zoom levels it would land in the wrong place.

3. **Benchmarks starved the correctness suite.** Five two-second gesture benchmarks on six
   workers made a 400x400 artboard measure SLOWER than a 1080x1080 one, and six of
   `resizeRotateAcceptance`'s handle-drag cases timed out while passing on their own.
   Benchmarks now live in `playwright.bench.config.ts` (`npm run test:bench`, one worker) and
   are excluded from `npm run test:browser`; the assertions that remain in the shared suite are
   ratios and pixel counts, which contention cannot distort. `resizeRotateAcceptance` also got
   a 120s budget, because eight sequential page loads in one test never fitted in 30s.

## Honest negatives from this phase

- The `assign(n, 0)` -> `resize` fix in `ReadPixelsRGBA` (removing a 640KB memset per frame)
  did not measurably help. The cost was the per-pixel unpremultiply, not the zero-fill. Kept
  because it is strictly better and free, but it was not the fix.
- Full repaints still cost ~32ms per megapixel. Damage tracking avoids them during gestures; it
  does not make them cheap. A scene upload, a zoom or a pan still pays it. The named structural
  fix remains a GPU surface the canvas already owns.

```
589 native checks · 187 WASM smoke checks · 630 parity checks
863 Vitest · 108 Playwright · 24 Playwright benchmarks · tsc clean · build clean
```


# Phase 8 - the SVG backend verified, then the engine made the default

The question this phase had to answer was not "is the engine fast enough" — Phase 7 settled
that — but "can the engine be the default without anything being lost". Three things had to
hold: the export/print backend must not depend on the DOM being painted, the document a
gesture commits must not depend on which renderer painted it, and asking for the engine must
never be able to leave a blank canvas.

All three now hold. Verifying them found four real defects, none of which were in the engine.

## The export path never touched the live DOM, which had to be checked rather than assumed

`useDesignStudio.exportSVG/exportPNG/exportPDF` and `PydreeStudio.handleExportPrintReadySVG`
all build from `designOutput.composedSVG` — a string. PNG goes through a `Blob` -> object URL
-> `Image` -> detached `<canvas>`; PDF through a detached container div and `svg2pdf`; print
through `POST /api/export-print`. Nothing rasterises the editor's DOM, so `visibility: hidden`
on `.svg-canvas-markup` cannot produce a blank export. `html2canvas` is in the bundle but no
export path imports it.

This mattered because the alternative was unrecoverable: an export that screenshots the canvas
host would have silently started producing empty files the moment the engine became default.

## `matrix(a b c d e f)` survives the whole persistence chain

The editor commits a single resolved matrix rather than appending `rotate(deg cx cy)`. The
pre-existing canonical-SVG round-trip coverage only exercised `rotate(...)` and `skewX(...)` —
the forms the *backend composer* emits — so the form the *editor* emits was untested.

- `frontend/src/editor/canonicalSvg.matrixTransform.test.ts` (11 tests): six components,
  negatives, comma separators, sub-pixel decimals, three save/load cycles, and a decode back
  through `parseSvgTransform` to the same numbers.
- `scripts/verify_print_transforms.py` (11 checks): `apply_print_meta` is pure regex over the
  markup — it substitutes the print-marks group and rewrites 6-digit hex — so matrices pass
  through byte-for-byte. Idempotent, and the generated id prefixes (`printrocket-`,
  `gradient-`) are what keep the CMYK regex from eating a `url(#...)` reference.

### Defect 1: a collapsed group silently dropped the primitive's transform

`parseCanonicalSvg` folds a single-primitive role group into one typed layer, and the fold
passed the GROUP's base down while never reading the primitive's own `transform`. So
`<g transform=G><rect transform=E/></g>` persisted as G alone: the shape moved by G's
translation instead of G·E's on the first save.

Fixed by `composeCollapsedTransform`, which folds them into their product — SVG applies the
outer group first, so the effective matrix is `multiply(G, E)`. When either string contains a
function that cannot be resolved to a matrix (`ref(svg, ...)`), the collapse is DECLINED and
logged rather than half-resolved: the group stays a group and both strings survive on their own
nodes. Guessing at a composition and dropping a factor are both wrong, and neither is silent
now.

## Renderer parity is asserted on the DOCUMENT, not on pixels

`browser-tests/rendererDocumentParity.spec.ts` (17 tests). Every earlier parity spec compares
screen positions; this one compares the artefact that persists. The invariant:

> the same screen gesture, on the same document, at the same zoom, produces byte-identical
> canonical SVG under either renderer.

Byte-identical rather than approximately equal, because the two solvers are pinned to 1e-9 by
`engine-parity.mts` and serialization snaps to a 0.001px grid — four orders of magnitude
coarser. A difference in the markup is therefore a disagreement about meaning, not noise.

Holds for move, resize and rotate on a plain rect; for a resize of a rotated layer nested
inside `translate(40 30) scale(2)`; and at zoom 2. Also asserted: one gesture is exactly one
undoable command of the right kind, undo restores the document byte-identically, and a
mid-drag `pointercancel` still commits exactly once (which is the deliberate behaviour — see
`useCanvasDrag.dragCancelled`; treating a cancel as abandonment killed every gesture after the
first commit).

The gesture is driven from the DOM `[data-handle]` elements in both runs, so the test measures
the SOLVE and the COMMIT. Handle PLACEMENT is asserted separately, below.

### Defect 2: the two surfaces scaled about different origins

`skia-stage` used `transformOrigin: center center`; `.svg-canvas-wrapper` uses `0 0`. Both are
flex-centred in the host, so at zoom 1 they agreed and at every other zoom they did not.
Measured on a 400px artboard in a 1200px host: document (100,100) landed at client x=600 in the
DOM and x=400 on the canvas at zoom 2, and 800 vs 200 at zoom 4.

It was invisible because the engine path hides the DOM chrome — nothing drawn from the DOM
geometry was on screen to disagree with. Anything still POSITIONED in the DOM would have been
placed by exactly that error, the inline text editor first among them.

### Defect 3: the design markup was silently refitted to its host

`.canvas :global(svg) { max-width: 100% }` in `DesignStudio.module.css` — a rule for incidental
shell SVG (icons, empty states) — also matched the design document. A 1350px artboard in a
1200px host was drawn at 0.888x, so the editor ran at an effective zoom nobody asked for and
the zoom control read 1 while showing 0.888.

That is the long-standing "auto-fit vs native size" disagreement, now identified. It is not
cosmetic: `useSelectionGeometry` measures the real SVG layout and followed the shrink, while
the engine draws at the artboard's native size and scales by the zoom alone. The two disagreed
by the fit factor at any artboard larger than its host — which is the DEFAULT case, since the
stock document is 1080x1080. Scoped out for `.svg-canvas-markup > svg`. Fitting a document to
the viewport is the zoom's job, and the zoom is a value the editor owns and can report.

Both fixes are verified by the chrome-agreement tests: every one of the eight handles lands
within 1.5px of the engine's own `chromeGeometry`, at zoom 1, 2 and 4, and on a 1350px artboard
in a 1200px host.

## The flag flip, and the guard that had to exist first

`engineFlag.isSkiaRendererEnabled()` now returns true unless the session passes
`?renderer=svg`. Anything else — including a misspelling — means the engine, because a typo in a
query parameter should not silently downgrade the renderer a user is running on.

The blocker that had to be removed first: `EditorCanvas` hid the SVG design objects on the
strength of the FLAG. With the engine opt-in, a missing WASM artifact was a self-inflicted
foot-gun; as the default it would be the first thing a user saw — a blank canvas over a
document that was still there, with nothing drawing it.

So `SkiaOverlay` now reports `onEngineStatus`, emitted from inside the frame loop immediately
after the first `putImageData`, and `EditorCanvas` derives `engineOwnsSurface = flag &&
enginePainting`. `hideDesignObjects`, `domPreview` and `chromeHidden` all key off that single
derived value, so the DOM cannot end up half-suppressed. A failure logs why and falls back;
`SkiaOverlay.test.tsx` pins that the design objects stay visible and the DOM chrome stays
interactive when the artifact is absent, which is always the case under jsdom.

### Defect 4: undoing a rotation blanked the editor

Found by the new parity spec, failing identically on BOTH renderers — which is what identified
it as a document-layer defect rather than anything to do with the migration.

`rotateLayerCommand.undo` restores its `prev` snapshot with `{ ...layer, transform:
snap.transform }`. For a shape that had no transform before the rotation, `snap.transform` is
`undefined`, which leaves the KEY present with an undefined value. `canonicalSvg.hasTransform`
tested for it with `'transform' in layer`, so it tried `escapeAttribute(undefined)`,
`serializeArtboard` threw `CanonicalSvgError`, and React unmounted the entire tree. Rotate a
shape, press Ctrl+Z, and the editor went blank.

Fixed at both ends. `hasTransform` now requires a non-empty string — an absent transform and an
`undefined` one are the same fact and both serialize to no attribute, so there was never a
distinction to preserve. `applySnapshot` removes the key instead of setting it to `undefined`,
so no other consumer has to defend against it. Covered by
`commands/rotateLayerCommand.test.ts` (4 tests), which asserts through the real serializer
because the layer object was never the thing that broke.

### Defect 5: the flip exposed a readiness gap in the specs

Fifteen sub-pixel and gesture-lifecycle cases began failing intermittently with "rendered 0px".
`chromeGeometry` answers as soon as the scene is uploaded, but the editor keeps the DOM as the
surface until the engine reports a PRESENTED frame — and those two moments are milliseconds
apart. A gesture started in between was solved by the SVG path while the spec measured the
engine's transform, so nothing appeared to move.

Two changes. `onDragGesture` is now wired whenever the engine was ASKED for, not only once it
is painting: the engine drops pre-load gestures silently by design, and only the visual
suppression can blank the canvas. And the harness publishes `__pydeeEngineStatus`, so the three
affected `ready()`/`open()` helpers wait for a presented frame rather than for geometry.

`__pydeeRenderer` was added for the same class of problem: a parity spec that ran the same
renderer twice would pass trivially, so the resolved renderer is asserted rather than assumed.
`?editor=1` still means "EditorCanvas on the SVG renderer", which now has to be written into
the URL — normalised in one place in the harness, with the resolved value published so no spec
has to trust that normalisation.

## What is still on the DOM, and what is still open

- Text editing. `InlineTextEditor` is positioned in the DOM and reads `domTextMetrics`
  (Canvas2D `measureText`) rather than the engine's shaped metrics. The two geometry systems now
  agree to 1.5px at every zoom and artboard size, so it is placed correctly — but it is still
  the reason the SVG subtree cannot be unmounted.
- `dragAfterCommit.spec.ts` "the second drag still follows the pointer" remains a tracked
  `test.fail()`.
- Full repaints still cost ~32ms per megapixel; the named structural fix (a GPU surface the
  canvas owns, with no readback) is not attempted.
- Not yet done from the milestone: DPR variants 1/1.25/1.5/2/3, marquee selection in C++,
  leak/lifecycle tests, the full shape/text/image coverage matrix, and moving the viewport
  matrix into C++ (the view transform is deliberately IDENTITY today, with zoom and pan as CSS
  on the shared stage — that is what makes client->document conversion exact with no second
  source of truth).

```
589 native checks · 187 WASM smoke checks · 630 parity checks
880 Vitest · 125 Playwright · 24 Playwright benchmarks · 11 print-transform checks
tsc clean · harness build clean · production build clean
```
