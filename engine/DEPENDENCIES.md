# Pydee engine dependencies and build

Every dependency is listed with name, version policy and the exact reason it is
present (AGENTS.md rule 2). Nothing here is installed implicitly.

## Toolchain

| Dependency | Version policy | Reason |
|---|---|---|
| WSL2 + Ubuntu 24.04 | pinned distro | Skia's supported build host. Its Windows build is documented as the painful path and the CanvasKit flow is Linux/bash-centric. |
| clang + lld | Ubuntu 24.04 default | Skia requires a C++20 compiler and recommends Clang for optimized builds. `lld` links the large static libs. |
| GN | fetched by `bin/fetch-gn` | Skia's meta-build system. Taken from the pinned Skia tree so it always matches. |
| Ninja | fetched by `bin/fetch-ninja` | Skia's build executor. Same reason. |
| Emscripten SDK | **vendored by Skia** in `third_party/externals/emsdk` | Activated by `tools/git-sync-deps`. Using Skia's own emsdk guarantees ABI/flag compatibility with the WASM static libs we link. A separately installed emsdk is a second version pin that silently drifts. |
| ccache | Ubuntu default | Turns a Skia revision bump from ~40 min into minutes. |
| brotli | Ubuntu default | Measures the real compressed size of the shipped `.wasm` instead of estimating it. |
| cmake + ninja-build | Ubuntu 24.04 default (CMake 3.28) | Build the Pydee engine itself. CMake 3.30+ is only required by Skia when building Dawn, which we disable. |
| Skia | **pinned commit** in `engine/skia.revision` | The 2D graphics engine. First bootstrap run resolves `SKIA_REF` to a concrete commit and records it; later runs reproduce that exact commit. |

Deliberately **not** installed:

- **depot_tools** — `git clone` + `tools/git-sync-deps` + `bin/fetch-gn` +
  `bin/fetch-ninja` covers everything we need. `gclient`/`git-cl` are unused, so
  installing it only adds ~1 GB and PATH mutations that can break.
- **bazelisk** — only required to regenerate Skia's own `BUILD.bazel` files,
  which we never modify.
- **standalone HarfBuzz / ICU** — Skia's `skshaper`/`skparagraph` modules already
  integrate them through `third_party`. Hand-integrating a second copy would
  duplicate a capability Skia supplies.

## Build

Prerequisite that requires elevation and a reboot, so it cannot be automated
from an unprivileged shell:

```powershell
# Admin PowerShell, once
wsl --install -d Ubuntu-24.04
```

Then create `C:\Users\<you>\.wslconfig` and run `wsl --shutdown`:

```ini
[wsl2]
memory=11GB
processors=10
swap=8GB
```

The 11 GB cap matters: this machine has ~15.7 GB total, and `wasm-ld` linking
Skia will be OOM-killed if WSL2 and Windows fight over memory.

Everything after that is scripted and idempotent:

```bash
bash engine/scripts/bootstrap-skia.sh
```

Stages: verify host → apt toolchain → clone + pin Skia → sync deps (activates
vendored emsdk) → build native static libs → build CanvasKit WASM baseline →
report measured artifact sizes.

Re-running after a failure is safe; completed stages are skipped.

## Why CanvasKit is built first

The WASM stage builds Skia's *own* CanvasKit before we introduce any Pydee
bindings. It is the known-good reference configuration: if it succeeds, the
vendored emsdk, the WebGL2/Ganesh backend, and the shaping/paragraph modules are
all verified working. Only our bindings remain unproven at that point, which
makes the next failure unambiguous to diagnose.

CanvasKit's JS API is **not** shipped to the app. The next milestone links our
own `engine/` sources against these static libs and exposes the Pydee scene API,
so no Skia type ever crosses into TypeScript.

## Architecture boundary

```
CreativeDocument (TypeScript, authoritative)
  ├─> canonical SVG ──> print / PDF / CMYK export        [unchanged]
  └─> extractRenderScene() ──> RenderScene
                                 ├─> SVG backend          [shipping today]
                                 └─> Skia backend         [this engine]
```

The C++ engine renders and answers geometry queries. It does **not** own the
document: canonical SVG is a hard product contract shared with
`services/svg/composer.py`, the print pipeline, and the locked
`frontend/src/pydree/PydreeStudio.tsx`.

## Measured results

The bootstrap has run successfully end to end. These are real measurements, not
estimates.

| Metric | Measured |
|---|---|
| Pinned Skia revision | `8608fa7a9da1b2222b194a89ed629d211f50c95c` |
| Disk used by the Skia checkout + both builds | **9.6 GB** |
| `libskia.a` (native, official build) | 34 MB |
| `canvaskit.wasm` raw | **8059 KB** |
| `canvaskit.wasm` Brotli | **2483 KB** — the real shipped cost |
| Compile errors | 0 |

Host it was verified on: Ubuntu 24.04.5 under WSL2, 10.7 GiB RAM, 8 GiB swap,
10 threads, `ninja -j8`.

Libraries produced by both targets (native and WASM now have parity):

```
libskia          libskparagraph   libskshaper      libskunicode_core
libskunicode_icu libskottie       libsksg          libskresources
libsvg           libskcms         libharfbuzz      libicu
libfreetype2     libpng           libjpeg          libwebp
libwuffs         libzlib          libexpat
```

Text shaping is therefore available in both builds through Skia's
`skshaper`/`skparagraph` modules, which integrate HarfBuzz and ICU — no separate
HarfBuzz integration is required.

### Configuration decisions forced by the real build

Three problems surfaced during the build. Each fix was chosen for architectural
correctness, not merely to get past the error:

1. **HTTP 429 rate limiting** during `git-sync-deps`. Anonymous googlesource.com
   access is rate limited and the sync fans out to dozens of repositories.
   Fixed with retry plus exponential backoff, which works because the sync is
   idempotent and resumable — every attempt keeps prior progress. The second run
   completed with zero retries needed.
2. **`fontconfig/fontconfig.h` not found.** Resolved with
   `skia_use_fontconfig=false` rather than installing `libfontconfig1-dev`. The
   browser target has no system font enumeration, so the engine owns a font
   registry fed with explicit font binaries. Host fontconfig would make native
   golden images depend on whichever fonts happen to be installed and diverge
   from CI and from the browser.
3. **`GL/gl.h` not found.** Resolved with `skia_use_gl=false`. Skia's native
   Linux GPU backend defaults to desktop GL through GLX, and this WSL2 instance
   has no X display, so that backend would be unusable even if it compiled. The
   native build exists for engine unit tests, deterministic golden images and
   profiling, which the raster backend serves exactly (spec §42). The browser
   reaches the GPU via WebGL2 in the separate Emscripten build.

A fourth gap was caught by inspecting the output rather than by an error:
building only the `skia` ninja target silently omitted every module library.
The script now builds the default target set, so `skparagraph`, `skshaper`,
`skunicode`, `skottie` and `svg` are all produced.

### Confirmed CanvasKit configuration

The baseline WASM build enables Ganesh + WebGL2, `skshaper` + `skparagraph`,
ICU + HarfBuzz, SkSL runtime effects, Skottie and pathops. It disables Graphite,
WebGPU, Dawn and — matching the architecture decision above — the Skia PDF
backend, so print export stays on the canonical SVG path.

## M3: the engine compiles and renders

The C++ engine now builds against the pinned Skia libraries and renders real
pixels. Verified by a clean rebuild through `engine/scripts/build-engine.sh`:

```
42 checks, 0 failure(s)
```

| Artifact | Size |
|---|---|
| `libpydee_engine.a` | 21 KB |
| `pydee_engine_tests` | 5.3 MB (statically links Skia) |

Layout:

```
engine/
├── include/pydee/
│   ├── geometry.h      # affine math, mirrors matrix2d.ts
│   ├── scene.h         # backend-neutral scene tree
│   └── renderer.h      # Renderer2D interface, no Skia types
├── src/
│   ├── geometry.cpp
│   ├── scene_renderer.cpp   # the one shared traversal
│   ├── skia_renderer.h/.cpp # the ONLY place Skia appears
└── tests/test_engine.cpp
```

Skia is confined to `skia_renderer.cpp`. Nothing above it references `SkCanvas`,
`SkPaint` or `SkPath`, which is what keeps the backend swappable and keeps Skia
out of the future WASM bindings.

### What the tests actually prove

- **Geometry parity.** The same cases as `matrix2d.test.ts`, including the
  composition convention. If C++ and TypeScript ever disagree, a click would
  resolve to a different object than the one painted; this fails the build first.
- **Real rasterisation.** Scene → traversal → Skia → readback pixels, asserting
  actual colour values rather than "it didn't crash".
- **Group isolation.** Two overlapping opaque black rects inside a 50% group.
  Correct offscreen compositing gives ~128 everywhere the group covers; applying
  alpha per child would give ~64 in the overlap. The test asserts ~128, so the
  compositing bug this design avoids cannot silently return.
- **Culling** skips known-outside nodes and never culls unknown bounds.
- **Malformed path data** is counted via `unparsable_paths()`, not silently
  dropped.

### Build decisions

- **clang, not g++.** CMake defaulted to GNU 13.3 while Skia was built with
  clang. Mixing two C++ toolchains across a large static boundary is an avoidable
  ABI/ODR hazard, so the engine pins clang to match.
- **Same flags as Skia** (`-fno-exceptions -fno-rtti`, C++20) for the same reason.
- **Skia libraries are globbed and linked as a group.** They are mutually
  dependent so a single-pass link fails, and a hardcoded list silently rots as
  the enabled module set changes.
- **CMake warns on revision drift** between the checkout and
  `engine/skia.revision`, so a silently moved Skia cannot produce a build that
  differs from what the tests were written against.
- **Build directory lives on the Linux filesystem**, not `/mnt/h`; compiling
  across the Windows drive mount is far slower.



## M4: the engine runs in the browser

Compiled to WebAssembly with our own bindings and verified by a headless smoke
test that loads the real module, renders, and reads pixels back:

```
86 checks, 0 failure(s)   — native (engine/scripts/build-engine.sh)
27 checks, 0 failure(s)   — wasm   (engine/scripts/build-engine-wasm.sh)
```

| Artifact | Size |
|---|---|
| `pydee-engine.wasm` raw | **1662 KB** |
| `pydee-engine.wasm` Brotli | **491 KB** |

For comparison, Skia's own CanvasKit baseline is 2483 KB Brotli. Ours is ~5x
smaller because it exports only the Pydee scene API and links only what that
needs, at `-Oz`. Text shaping and codecs will grow it when those milestones land.

### The JavaScript API

CanvasKit's JS API is not re-exported. JavaScript sees only:

```
PydeeSurface(width, height)
  loadScene(Uint8Array) -> "" | errorReason
  setNodeTransform(id, a, b, c, d, e, f) -> bool
  setNodeOpacity(id, opacity) -> bool
  render(a, b, c, d, e, f, pixelRatio, background, useBackground) -> nodesDrawn
  hitTest(x, y) -> nodeId | ""
  readPixels() -> Uint8Array
  lastNodesDrawn() / lastNodesCulled() / lastLayersOpened()
sceneFormatVersion() -> int
```

Boundary discipline: the scene is uploaded once per document change as one binary
buffer; a drag calls `setNodeTransform` with six doubles and allocates nothing.
Numbers cross as `int`/`double` only, so colours pass as doubles rather than
relying on unsigned-integer marshalling.

### Three real defects the tests caught

1. **ABI signature mismatch.** `wasm-ld` warned that `SkSurfaces::Raster` had a
   different signature in our object than in `libskia.a`. Skia's CanvasKit build
   sets `is_trivial_abi=true`, which marks `sk_sp` `[[clang::trivial_abi]]` and
   returns it in a register instead of through a hidden pointer. Fixed by
   defining `SK_TRIVIAL_ABI` identically. The build script now **fails** on any
   signature mismatch, because that is undefined behaviour at the call site
   rather than a cosmetic warning.
2. **embind reported every type as unbound.** The prebuilt `libembind` in the
   Emscripten sysroot is compiled with RTTI, so a `-fno-rtti` binding TU computes
   different type identifiers and nothing marshals. Fixed by compiling only
   `wasm/bindings.cpp` with RTTI — which required moving surface ownership behind
   `pydee::RasterTarget`, a PIMPL that exposes no Skia type. That restored the
   rule that Skia appears only in the backend, so the RTTI difference cannot
   reach Skia's vtables.
3. **Binary data corrupted in transit.** `loadScene` originally took a
   `std::string`. embind UTF-8 encodes JavaScript strings, so every byte >= 0x80
   expanded to two bytes and shifted the whole buffer — the `0xFFFFFFFF` root
   parent index broke it immediately. Binary now crosses as a `Uint8Array`.

### Wire format

`engine/include/pydee/scene_codec.h` defines a versioned little-endian format: a
flat node array in paint order with parent indices, so the decoder allocates once
and rebuilds the tree in a single pass. Parent indices must refer to earlier
nodes, which makes cycles unrepresentable. Every read is bounds-checked and a
malformed buffer is rejected whole, never partially applied. Rejections are
asserted from both sides: bad magic, unsupported version, truncation, and forward
parent references.

`f64` is used for all geometry so values match JavaScript numbers exactly.



## M5: TypeScript speaks the wire format

The encoder is in `frontend/src/editor/renderer/sceneCodec.ts`, verified against
the **real compiled decoder** rather than a mock:

```
16 tests  — byte-layout unit tests
 9 tests  — cross-language integration against the compiled WASM engine
554 tests — full frontend suite
```

The integration test runs the entire pipeline in one chain:

```
DocumentLayer -> extractRenderScene -> encodeScene -> WASM decode
              -> Skia raster -> pixel readback
```

Three properties it pins down that a mock could not:

- **Version agreement.** `engine.sceneFormatVersion()` must equal the encoder's
  `SCENE_FORMAT_VERSION`, so the two halves cannot drift apart silently.
- **Matrix component order.** A rotated rectangle is asserted at a point covered
  only under the correct rotation. A transposed matrix would still render
  something, so a weaker assertion would pass while selection broke.
- **Hit-test parity.** Twelve sample points are resolved by both
  `hitTestScene` in TypeScript and `surface.hitTest` in C++, and must agree
  exactly. This is what keeps selection consistent when the renderer is swapped.

### Coverage is reported, never assumed

The engine build renders rect, ellipse, path and group. Text, image, polygon and
line nodes are **not** silently dropped: `encodeScene` returns `skippedNodeIds`
and a diagnostic for each. The dual-renderer parity harness needs this, otherwise
a missing text layer would look like a rendering regression rather than an
unimplemented feature.

Unresolvable paints are handled the same way. A `url(#grad-1)` paint server or an
unparsable colour produces an `engine-unsupported-paint` diagnostic and paints
nothing, instead of substituting an arbitrary colour.

Colour parsing covers what the Canonical_SVG actually emits — hex in all four
lengths, `rgb()`/`rgba()` including percentages, `none`/`transparent`, and the
basic keywords. Anything else returns null and is reported. Note that CSS hex is
`#RRGGBBAA` while the wire format is `AARRGGBB`; the reordering is tested.

### Division of responsibility for hit-testing

The engine answers **geometric** hits. Lock state and visibility policy stay in
the editor, which is why the wire format carries no `hitTestable` flag: the
editor already knows which layers accept input and filters the engine's answer.

### Wire format compatibility rule

`SCENE_FORMAT_VERSION` in `sceneCodec.ts` and `kSceneVersion` in
`scene_codec.h` must be bumped together whenever the layout changes. The
integration test fails immediately if they disagree, and the decoder rejects an
unknown version outright rather than misreading a buffer.

## M6: the engine is mounted in the editor, flag-gated

The Skia renderer now runs inside the editor as a comparison overlay, off by
default:

```
554 tests  — frontend suite, unchanged behaviour
 32 checks — cross-language parity (npm run test:engine)
 86 / 27   — native / wasm engine checks
```

### How to turn it on

```
/editor?renderer=skia
```

No UI control, no config change, no build flag. The overlay is `pointer-events:
none` and `aria-hidden`, and the SVG renderer stays mounted and keeps owning
every interaction — selection, dragging and inline text editing are untouched.
This is the dual-renderer stage; the SVG display path is removed only after
parity is demonstrated.

With the flag off, `EditorCanvas` renders exactly what it always did: no canvas
element, no engine fetch. That is asserted by a test rather than assumed.

### Graceful absence

`engine/artifacts/` and `frontend/public/engine/` are build outputs and are
gitignored. A checkout that never built the engine still works: `loadEngine`
resolves to an `unavailable` result instead of rejecting, logs the reason once
with the build command, and the overlay reports `skia: unavailable`. The editor
continues on the SVG renderer.

### Two defects caught during this step

1. **Wrong SVG passed to the overlay.** It initially received the
   viewport-wrapped `renderOutput`, whose top-level `<g data-viewport>` has no
   `data-role`. `canonicalSvg` then *synthesized* layer ids such as `shapes-0`,
   which would have silently broken id parity with the document and made
   hit-test comparison meaningless. Found by reading the parser's warnings in
   test output. The overlay now takes the original canonical SVG and applies pan
   and zoom itself, and a test asserts no synthesized-id warning is emitted.
2. **Vitest cannot import the engine module.** Vitest routes dynamic imports
   through Vite's module graph, which percent-encodes the space in this
   repository's path and then fails to resolve. `@vite-ignore` and a
   `new Function` escape hatch were both rejected by its VM. Rather than keep
   fighting the bundler, the cross-language check moved to a plain `tsx` script,
   `frontend/scripts/engine-parity.mts`, run with `npm run test:engine`. It
   imports the TypeScript encoder and the ESM module the way runtime does.

### Module format

The engine is emitted as an ES module (`-sEXPORT_ES6=1`, `pydee-engine.mjs`) so
the browser can `import()` it lazily and Node can load it without a shim. It is
never part of the initial bundle.

## M7: text, wired into the editor

Text renders through the engine with real shaping, and the overlay now uses
everything the engine reports.

```
138 checks — native engine
 47 checks — wasm headless smoke
 49 checks — cross-language parity (npm run test:engine)
565 tests  — frontend suite
```

| Artifact | Raw | Brotli |
|---|---|---|
| `pydee-engine.wasm` | 4901 KB | **1606 KB** |

Text tripled the payload, as expected: it pulls in HarfBuzz, ICU and skparagraph.
Still below CanvasKit's 2483 KB baseline, and the size levers below remain.

### Fonts are explicit, by design

The browser gives WebAssembly no system font enumeration, so the engine draws no
text until a font is registered. Both targets resolve text **exclusively** through
`pydee::FontRegistry`, which owns an empty custom font manager plus skparagraph's
`TypefaceFontProvider`. Nothing is inherited from the host.

That is deliberate rather than a limitation: if the native build used system fonts
and the browser used supplied fonts, native golden images would disagree with what
users actually see, and text bounds would disagree with the exported SVG.

Consequences, all reported rather than hidden:

- Unregistered family → nothing painted, counted in `lastUnresolvedText()`.
- Corrupt font bytes → `registerFont` returns false.
- Measurement with no font → returns null, and the extractor records
  `text-measurement-unavailable` instead of approximating.

The build publishes `Roboto-Regular.ttf` from the pinned Skia checkout next to the
module, so the browser overlay, the native tests and the parity script all shape
text with identical data. A full per-family pipeline with subsetting and fallback
chains is a later milestone.

### Shaping, not glyph positioning

Layout goes through `skparagraph`, which integrates HarfBuzz and ICU.
`SkUnicodes::ICU::Make()` supplies the grapheme, word, line-break and bidi
analysis that `ParagraphBuilder` requires. Positioning glyphs by advance width
would break every script needing reordering, ligatures or combining marks.

SVG anchors text by **baseline** around an explicit origin, while a paragraph
draws from its top-left. The renderer converts using the shaped first-line ascent
and the anchor offset, so text lands where the canonical SVG puts it. Asserted by
tests that check glyphs appear above the baseline and that `start`/`middle`/`end`
anchors order left-to-right correctly.

### Two-pass text in the overlay

Ordering matters, so the overlay does it explicitly:

1. Register fonts with the surface.
2. Re-extract the scene using `createEngineTextMetricsProvider`, so text bounds
   come from the same shaping that paints the glyphs.

That is what makes text bounds `exact` rather than `pending-measurement`, and it
is why text hit-testing now agrees across both languages.

### Nothing the engine reports is discarded

The overlay readout surfaces draw count, culled nodes, isolated layers,
unresolved text, unsupported node kinds, unresolved paints and missing font
families — the last computed from the engine's own `hasFont`, so it reflects the
renderer's real state. The readout is additive and confined to the overlay; the
editor's own layout is unchanged.

### A build-script bug worth recording

Adding `#` comments inside the GN args heredoc silently broke the native build.
The script flattens newlines to spaces, so the first `#` commented out every
argument after it — reverting the build to GCC and system libraries, which then
failed on missing `png.h` and `ft2build.h`. Comment lines are now stripped before
flattening, so this cannot recur.

### Configuration separation, verified

`engine/scripts/verify-gn-args.sh` proves the two builds are configured
independently, reading resolved values from GN rather than trusting intent:

| | native | wasm |
|---|---|---|
| `target_cpu` | host | `"wasm"` |
| `skia_use_gl` | **false** | **true** |
| `skia_use_webgl` | false | **true** |
| `skia_enable_ganesh` | true | true |
| `skia_use_fontconfig` | false | false |
| `skia_enable_graphite` / `skia_use_dawn` | false | false |
| `is_trivial_abi` | false | **true** |
| compiler | clang | vendored `em++` |

18 assertions, 0 failures. The native headless restrictions do not leak into the
browser GPU build.



## Closed without an engine rebuild

Three gaps were closed purely in the encoder, with no C++ change and no new
engine node kinds:

- **Polygons and lines** are exactly expressible as paths, so they are encoded as
  paths. Adding engine node kinds would have duplicated geometry the renderer
  already handles. Verified by rendering a filled triangle and a stroked line
  through the real engine and asserting interior and exterior pixels.
- **`text-transform`** (uppercase / lowercase / capitalize) is applied at encode
  time. It is presentation-only, so the document keeps the author's original
  string — asserted by a test. Parity confirms casing changes the shaped width,
  so an unapplied transform would be detectable rather than silent.

Current totals:

```
138 checks — native engine
 47 checks — wasm headless smoke
 63 checks — cross-language parity (npm run test:engine)
568 tests  — frontend suite
```

## Remaining gaps and how to close them

Each is reported at runtime today, so nothing is silently missing. Ordered by
cost.

**1. Text decoration (underline, line-through).** Cheapest remaining item.
`skparagraph`'s `TextStyle` has `setDecoration`/`setDecorationStyle`. Add two bits
to the text style byte in `scene_codec.h`, bump `kSceneVersion` and
`SCENE_FORMAT_VERSION` together, set the decoration in `MakeParagraphStyle`, and
remove the diagnostic in `sceneCodec.ts`. Roughly one C++ file plus one TS file.

**2. Gradients and paint servers.** The scene already preserves them as
`{ kind: "paint-server", referenceId }` rather than inventing a colour, so the
data is not lost. Closing it needs: parse `<defs>` from the artboard (the
`Artboard.defs` string is already carried), encode stop lists in the wire format
as a new paint kind, and build `SkGradientShader` in `skia_renderer.cpp`. The
scene model change is the larger part; the Skia side is straightforward.

**3. Images.** Needs the asset manager: decode via the codecs already linked into
the WASM build (`libpng`, `libjpeg`, `libwebp`, `libwuffs` are all present),
cache decoded `SkImage`s keyed by href, and add an image node to the wire format.
Data-URI hrefs decode synchronously; remote URLs need the async load and
invalidation path from spec §14.

**4. Per-family font pipeline.** Today one published font is registered and any
unresolved family is reported by name in the overlay readout. A real pipeline
resolves each family a document names, with subsetting and fallback chains.
`FontRegistry::Register` already accepts multiple faces per family, so this is a
frontend loading concern rather than an engine change.

**5. Vertical writing modes.** `vertical-rl` / `vertical-lr` need paragraph-level
vertical layout, which skparagraph does not provide directly. This is the largest
item and should follow the others.

## Handoff notes

- Wire format compatibility: `SCENE_FORMAT_VERSION` (`sceneCodec.ts`) and
  `kSceneVersion` (`scene_codec.h`) must be bumped together. The parity script
  fails immediately if they disagree.
- Rebuild after any C++ change: `bash engine/scripts/build-engine.sh` then
  `bash engine/scripts/build-engine-wasm.sh` (the second also publishes to
  `frontend/public/engine/` and runs the smoke test).
- Verify with: `npm test`, `npm run test:engine`, `npm run build`, and
  `bash engine/scripts/verify-gn-args.sh`.
- Never put `#` comments inside the GN args heredoc in `bootstrap-skia.sh`.
- The Skia renderer stays behind `/editor?renderer=skia` until parity covers
  images, gradients and export. The SVG path remains the shipping renderer.



## Size levers if the payload needs trimming

The shipped WASM is 1606 KB Brotli. Available reductions: drop Skottie, use
`libgrapheme`/`icu4x` instead of full ICU (the largest single lever now that text
is in), drop unused codecs, closure compilation. The engine module is built with
`-sMODULARIZE` and is lazy-loaded, so it is never part of the initial bundle.

## Deferred deliberately

- **pthreads / SharedArrayBuffer** — would force COOP/COEP headers, breaking
  third-party embeds and requiring server changes. Single-threaded WASM first.
- **Graphite / WebGPU** — CanvasKit ships Ganesh/WebGL2; WebGPU currently needs
  Skia patches. Kept behind a future build flag.
- **Skia PDF backend** — its documented limitations (mask filters, path effects,
  some blend modes get dropped or rasterized) would regress print correctness
  that the canonical SVG path already handles.


## M8: gradients, text decoration, and the paint-server parser — all in C++

```
283 checks — native engine
 60 checks — wasm headless smoke
 83 checks — cross-language parity (npm run test:engine)
605 tests  — frontend suite
```

| Artifact | Raw | Brotli |
|---|---|---|
| `pydee-engine.wasm` | 4950 KB | **1619 KB** |

Gradients and the defs parser cost 13 KB Brotli. Still below CanvasKit's 2483 KB.

### Where the work was placed, and why

The obvious implementation would have parsed `<defs>` in TypeScript and sent
resolved gradient stops over the wire. That was rejected. Gradient geometry,
percentage resolution against the viewport, `gradientTransform` composition,
`href` inheritance and SVG's default values are *rendering calculations*. A
TypeScript implementation of them would be a second set of rounding and
default-value decisions that could drift from the renderer's, and only the
renderer can be held responsible for the result.

So the boundary is:

```
TypeScript  ──>  "the fill is url(#ramp)"        (an id, 2 + n bytes)
                 "the defs markup is <this>"     (a string, once per document)
C++         ──>  everything else
```

`engine/src/paint_servers.cpp` owns the scanner, the colour parser and the
transform-list parser. `sceneCodec.ts` gained roughly ten lines and lost a
diagnostic. This is the pattern for every future feature of this shape.

### What the engine now renders

- **Linear and radial gradients**, both `gradientUnits`, all three
  `spreadMethod` values, `gradientTransform`, and displaced focal points
  (`fx`/`fy`) via two-point conical gradients.
- **Text decoration** — underline and line-through.

The pinned Skia revision has replaced `SkGradientShader::MakeLinear` with
`SkShaders::LinearGradient` plus an `SkGradient` description taking
`SkColor4f` spans. The spans are non-owning, so the colour and position vectors
must outlive shader construction; that is noted at the call site.

### Behaviour chosen to match SVG rather than to be convenient

| Case | Behaviour | Why |
|---|---|---|
| One stop | Painted as a flat colour | SVG defines it that way; Skia requires two colours |
| Degenerate geometry (`x1==x2 && y1==y2`, or `r==0`) | Last stop as a flat colour | SVG rule |
| Zero-area bounding box with `objectBoundingBox` | Nothing painted, **counted** | SVG does not render the element |
| No stops | Nothing painted, **counted** | Nothing to interpolate |
| Descending or out-of-range stop offsets on the wire | Buffer **rejected** | The two halves of the codec disagree |
| Unresolvable `stop-color` (e.g. `currentColor`) | Whole gradient dropped, **counted** | One bad stop changes the entire ramp |
| `url(#id)` with no defs entry | Nothing painted, **counted** | An invented colour is indistinguishable from a design choice |
| Both decoration bits set on the wire | Buffer **rejected** | The document model produces exactly one |

Nothing in that table degrades silently. Three new counters carry the reports
out through `RasterTarget` to the bindings and into the overlay readout:
`unresolvedPaintReferences`, `unsupportedPaintServers`, `lastUnresolvedPaints`
and `lastApproximatedPaints`.

### One approximation, declared

skparagraph resolves a decoration's colour from `TextStyle::getColor()`, which
is independent of the foreground paint and **defaults to white** — verified by
reading `modules/skparagraph/src/Decorations.cpp` rather than assuming. The
renderer therefore sets the decoration colour explicitly. A decoration cannot
take a shader, so a gradient-filled underline uses the gradient's first stop and
increments `approximated_paints()`. That is the only approximation in this
milestone and it is counted, not hidden.

### The overlay now paints through the interaction frame loop

`SkiaOverlay` no longer calls `surface.render()` directly. Every paint — a
document change, a future drag, a zoom — goes through
`InteractionEngine.requestPaint()`, so there is exactly one coalesced path to
the surface and React is never in the hot path. `InteractionEngine` gained
`requestPaint()` and `setFramePaintedHandler()`; rebinding the handler rather
than constructing a new engine keeps the cumulative counters, including
`sceneRebuildsDuringGesture`, meaningful across a session.

The overlay also calls `noteSceneRebuild()` whenever it re-extracts, so a full
re-serialisation during a gesture would show up as a nonzero count rather than
as vague slowness.

**Still to wire:** real pointer gestures. `EditorCanvas` mounts the overlay with
only `designOutput` and `viewport`, so no drag state reaches it yet. Feeding
gestures in requires touching the SVG selection/drag path, which is the next
step — the frame loop it will drive is already in place and tested.

### Capability matrix is enforced, not decorative

`gradient` and `text-decoration` moved from `skia: "none"` to `"full"` with
`parityTested: true`. Four tests that asserted the old "reported as unsupported"
behaviour failed on the way through and were updated to assert the new
behaviour. That is the matrix working as designed: it fails when a feature
starts working without the table being updated, which is how a matrix quietly
becomes fiction.

### A tooling mistake worth recording

A PowerShell `Get-Content | -replace | Set-Content -NoNewline` pipeline was used
to update several call sites in `scene_codec.cpp` at once. It stripped every
newline, which turned each `//` comment into one that swallowed the rest of the
file. The file was reconstructed by hand. Multi-site C++ edits go through the
editor, never through a shell text pipeline.


## M9: a live drag reaches the engine

```
283 checks — native engine
 70 checks — wasm headless smoke
 92 checks — cross-language parity (npm run test:engine)
626 tests  — frontend suite
```

`pydee-engine.wasm` 4953 KB raw / **1620 KB Brotli** (+1 KB).

### The path a pointer now takes

```
pointermove (screen px)
  └─ useCanvasDrag            snaps, converts to DOCUMENT px
       └─ onDragGesture       { phase, layerId, dx, dy }
            └─ GestureChannel  (created per EditorCanvas mount, not global)
                 └─ SkiaOverlay subscription
                      └─ InteractionEngine.setTransientTranslation
                           └─ rAF frame, coalesced
                                └─ surface.setNodeDocumentTranslation
                                     └─ Skia
```

No React state is touched per pointer sample, and the scene is never
re-serialised during a gesture. Verified, not assumed: the parity script drives
ten samples through the real compiled engine and asserts
`sceneRebuildsDuringGesture === 0` with exactly one transform patch per sample.

### Why the drag maths is in C++

A node's local transform maps into its **parent's** space, so a document-space
translation `T` is `P⁻¹ · T · P` in that space, where `P` is the parent's world
transform. Applying `T` directly drags a node inside a scaled or rotated group
in the wrong direction and by the wrong distance.

`P` is knowledge the engine has and the editor does not, so
`setNodeDocumentTranslation(id, dx, dy)` lives in the bindings. TypeScript sends
two numbers. The smoke test and the parity script both drag a child of a
`scale(2)` group 40 document px and assert it lands at 40 — the number a naive
implementation would get wrong by exactly 2x.

Offsets are relative to the transform the scene **loaded** with, not the current
one, so a stream of drag frames cannot accumulate rounding error. Asserted by
sending the same offset three times and checking the node has not crept.

### Two real bugs found by wiring this up

1. **A synchronous frame scheduler silently dropped every frame after the
   first.** `scheduleFrame` assigned `this.frameHandle` from the return value of
   `requestFrame`, but a scheduler that invokes its callback inline sets the
   handle to `null` *during* that call — and the assignment then overwrote it
   with a stale handle, so the pending-frame guard never cleared again. Browsers
   never hit this because rAF is always async; the parity harness did on its
   first run. Fixed with a pending sentinel written before the request, plus a
   unit test using an inline scheduler.
2. **`endGesture` discarded the released position.** It cancelled the pending
   frame, so the final pointer sample was never painted and the drag visibly
   stuttered back one frame until the document commit arrived. It now flushes
   dirty transforms before tearing the gesture down.

### Coordinate space is the trap, so it is tested at zoom 2

The gesture carries **document** pixels — the same value `dragEnd` commits.
Emitting screen pixels would be invisible in any test at zoom 1 and wrong
everywhere else, so `useCanvasDrag.test.tsx` now drags 40 screen px at zoom 2 and
asserts the reported offset is 20.

Snapping is respected: the reported offset is the *snapped* one, so the engine
preview shows what will actually be committed rather than the raw pointer delta.

### Suspected pre-existing issue, recorded rather than changed

`useCanvasDrag` previews the drag with
`applyDomTranslate(el, snapX * zoom, snapY * zoom)`. The dragged element sits
inside `.svg-canvas-wrapper`, which carries `scale(zoom)`
(`SVGCanvas.tsx:558–568`), so that local translate appears to render at
`snapX * zoom²` screen pixels — twice the pointer travel at zoom 2. The
*committed* value is correct (`lastSnapX / zoom`), and the engine preview is now
correct independently.

This was **not** changed. It is core drag behaviour, the existing tests only
cover zoom 1, and confirming the SVG user-unit-to-CSS-pixel ratio needs a real
browser rather than jsdom. It should be verified at zoom 2 before anyone
"fixes" it — and if it is real, the Skia overlay and the SVG preview will
visibly disagree at non-unit zoom, which is the dual-renderer stage doing its
job.

### What is still not wired

Resize, rotate and parametric handles live in `SelectionOverlay` with their own
session refs and commit through `onResize` / `onRotate` / `onParametricChange`.
They are not on the gesture channel yet. `InteractionEngine.setTransientTransform`
is the path for them: they produce a full transform rather than a translation,
and the channel's event shape will need a matrix variant.

Multi-layer drags are also still single-layer: `useCanvasDrag` commits only
`intent.layerId` even with a multi-selection. That is pre-existing behaviour, and
the gesture channel faithfully reflects it rather than papering over it.
