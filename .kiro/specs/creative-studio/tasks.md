# Implementation Plan: Creative Studio (v1)

## Overview

Creative Studio v1. Per AGENTS.md, every existing artifact is **extended, never rewritten**:
`useDesignStudio.ts`, `designApi.ts`, `SVGCanvas.tsx`, `LayerList.tsx`, `EditorToolbar.tsx`,
`AddElementPanel.tsx`, `AlignmentGuides.tsx`, `PromptForm.tsx`, `DesignStudio.tsx`, and
`types/index.ts`. New single-responsibility modules live under `frontend/src/editor/` (the directory
AGENTS.md assigns to `@canvas-dev`). The backend is consumed unchanged.

Implementation language is **TypeScript (strict mode)**, matching the existing frontend and the
design. Property-based tests use **fast-check** at **>= 100 iterations**, each tagged with a comment
in the format `Feature: creative-studio, Property {number}: {property_text}`. The 32 correctness
properties from the design are distributed across the implementation tasks closest to the code they
verify, and the three required round-trips are first-class tests: SVG export/re-import (Property 1),
undo (Property 2), and autosave persist/restore (Property 4).

Sub-tasks marked with `*` are optional (tests) and can be skipped for a faster MVP; core
implementation sub-tasks are never optional.

## Tasks

- [x] 1. Set up frontend test tooling and editor dependencies
  - [x] 1.1 Install and configure the test runner and PBT tooling
    - Add dev dependencies: `vitest@^2.1.0`, `jsdom@^25.0.0`, `@testing-library/react@^16.0.0`, `@testing-library/jest-dom@^6.5.0`, `fast-check@^3.23.0`
    - Add a `test` script (single run, no watch) and a Vitest config using the `jsdom` environment so `DOMParser`, `XMLSerializer`, and SVG DOM APIs exist in tests
    - Verify `tsconfig.json` keeps `strict` mode for test files
    - _Requirements: Testing Strategy (design); supports all property/unit/integration tasks_
  - [x] 1.2 Add editor runtime dependencies
    - Add `lucide-react@^0.460.0` (thin single-color line icons), `idb@^8.0.0` (IndexedDB autosave), `jspdf@^2.5.2` and `svg2pdf.js@^2.2.3` (vector PDF export)
    - Confirm versions install cleanly and types resolve under strict mode
    - _Requirements: 13.5, 13.6, 11.7, 11.8, 12.3_

- [x] 2. Document_Model types and canonical SVG parse/serialize
  - [x] 2.1 Define Document_Model types
    - Create `frontend/src/editor/types/documentModel.ts` with `DataRole`, `LOCKED_ROLES`, `BaseLayer`, `ShapeLayer`, `TextLayer`, `ImageLayer`, `GroupLayer`, `DocumentLayer`, `ShapeGeometry`, `Artboard`, `Page`, `CreativeDocument`, `SelectionSet`, `Viewport`, `ToolId`, `Theme`, `SaveStatus`
    - Re-export the new types from `frontend/src/types/index.ts` (extend, do not redefine `DesignOutput`, `SVGLayer`, `BrandKit`, `PrintMeta`, `TargetSize`)
    - _Requirements: 11.1, 3.4, 3.7, 3.8, 1.4, 1.5_
  - [x] 2.2 Implement canonical SVG parse/serialize
    - Create `frontend/src/editor/canonicalSvg.ts` with pure `parseCanonicalSvg(svg): Artboard`, `serializeArtboard(artboard): string`, and a typed `CanonicalSvgError`
    - Preserve root attributes and `<defs>` verbatim, never flatten nested `<g data-role>` groups, synthesize a unique `role-N` id when `data-layer-id` is missing (log the reason), and snap every emitted coordinate to the 0.5px grid; always emit text as `<text>`
    - Throw `CanonicalSvgError` on parse failure or non-`data-printrocket` root so callers can keep the current model
    - _Requirements: 1.2, 5.6, 6.8, 10.3, 10.9_
  - [ ]* 2.3 Write property test for canonical SVG round-trip
    - **Property 1: serialize(parse(svg)) preserves the set of roles, data-layer-ids, document order, and nesting; re-parsing yields a structurally equal Artboard (never flatten)**
    - Build a shared `arbCanonicalSvg` generator (random group sets, nesting, text/shape/image payloads); assert structural equality of `parse(serialize(parse(svg)))`
    - Tag: `Feature: creative-studio, Property 1: ...`; run >= 100 iterations
    - **Validates: Requirements 10.3, 10.5, 10.9, 12.1**
  - [ ]* 2.4 Write property test for 0.5px grid snapping
    - **Property 14: every emitted coordinate in the serialized Canonical_SVG is an integer multiple of 0.5**
    - Tag: `Feature: creative-studio, Property 14: ...`; run >= 100 iterations
    - **Validates: Requirements 5.6**
  - [x] 2.5 Map DesignOutput to/from Artboard
    - Add `artboardFromDesignOutput(output): Artboard` (parse + carry `printMeta`) and a reverse mapping that derives `svgLayers[]` exactly as the existing `extractLayers` helper, keeping the backend contract untouched
    - _Requirements: 10.3, 10.5, 12.3, 10.9_

- [x] 3. Command and History system
  - [x] 3.1 Implement the Command set
    - Create `frontend/src/editor/commands/` with one file per command type: `translateLayerCommand`, `resizeLayerCommand`, `setPropertyCommand`, `createLayerCommand`, `textEditCommand`, `reorderLayerCommand`, `groupCommand`, `deleteLayerCommand`
    - Each command captures inverse data at construction so `apply`/`undo` are pure and exactly invertible; validation/clamping happens before the command is built
    - _Requirements: 4.6, 5.5, 6.3, 7.5, 8.4, 9.2, 9.4, 9.6_
  - [x] 3.2 Implement the HistoryStack and dispatcher
    - Extend `useDesignStudio.ts` with `dispatchCommand`, `undo`, `redo`, `canUndo`, `canRedo`; implement `pushCommand` (50-cap trim, redo/`future` invalidation), the non-zero-edit guard (no-op edits record nothing), and the locked-layer guard (locked layers are inert)
    - _Requirements: 4.5, 4.6, 4.7, 11.2, 11.3, 11.4, 11.5, 11.6_
  - [ ]* 3.3 Write property test for undo round-trip
    - **Property 2: command.undo(command.apply(doc)) is deep-equal to doc**
    - Build shared `arbDocument` and `arbCommand` generators; tag `Feature: creative-studio, Property 2: ...`; run >= 100 iterations
    - **Validates: Requirements 7.5, 8.4, 11.2**
  - [ ]* 3.4 Write property test for undo/redo identity
    - **Property 3: apply then undo then apply yields a document deep-equal to the once-applied document**
    - Tag: `Feature: creative-studio, Property 3: ...`; run >= 100 iterations
    - **Validates: Requirements 11.4**
  - [ ]* 3.5 Write property test for history cap
    - **Property 5: for any sequence of N recorded Commands, the History_Stack length equals min(N, 50) and contains the last 50 in order**
    - Tag: `Feature: creative-studio, Property 5: ...`; run >= 100 iterations
    - **Validates: Requirements 4.7, 11.6**
  - [ ]* 3.6 Write property test for one-command-per-edit
    - **Property 6: any non-zero edit on an unlocked layer increases the History_Stack length by exactly one**
    - Tag: `Feature: creative-studio, Property 6: ...`; run >= 100 iterations
    - **Validates: Requirements 4.6, 5.4, 5.5, 6.3, 8.4, 9.2, 9.4, 9.6**
  - [ ]* 3.7 Write property test for locked-layer inertness
    - **Property 7: any move/resize/transform/edit attempt on a locked layer (including logo and print-marks) leaves the Document_Model and History_Stack unchanged**
    - Tag: `Feature: creative-studio, Property 7: ...`; run >= 100 iterations
    - **Validates: Requirements 3.8, 4.5**

- [x] 4. Editor shell, theme tokens, and Icon system
  - [x] 4.1 Implement theme tokens and resolution
    - Create `frontend/src/editor/theme.ts` and a monochrome-plus-single-accent CSS token set applied via `data-theme="dark|light"`; resolve dark by default, honor a saved preference, and persist selection to `localStorage` for synchronous first-paint
    - _Requirements: 13.1, 13.2, 13.3, 13.4_
  - [ ]* 4.2 Write property test for theme resolution and round-trip
    - **Property 29: applied Theme is the saved preference when present and dark otherwise; persisting then reloading applies the same Theme**
    - Tag: `Feature: creative-studio, Property 29: ...`; run >= 100 iterations
    - **Validates: Requirements 13.1, 13.2, 13.3**
  - [x] 4.3 Implement the Icon wrapper
    - Create `frontend/src/editor/Icon.tsx` wrapping `lucide-react`, hard-setting `strokeWidth` in `[1.0, 1.5]`, forcing `fill="none"` and single color from `--fg-*`/`--accent`; add a lint guard banning direct `lucide-react` imports outside `Icon.tsx` and raster/`fill=` chrome icons
    - _Requirements: 13.5, 13.6_
  - [ ]* 4.4 Write property test for line-icon stroke invariant
    - **Property 30: any chrome icon rendered through Icon has stroke-width in [1.0, 1.5], fill none, and a single color**
    - Tag: `Feature: creative-studio, Property 30: ...`; run >= 100 iterations
    - **Validates: Requirements 13.5**
  - [x] 4.5 Build the CreativeStudio shell layout
    - Create `frontend/src/editor/CreativeStudio.tsx` plus `TopBar`, `ToolRail`, `LeftSidebar` (Pages/Layers/Assets/Components/Templates/Generate), `CenterStage`, `PropertiesPanel` and `BottomPanel` scaffolds; render Top_Bar controls (project name, undo, redo, save status, collaborators placeholder, search, AI entry, export, share, profile) and use `Icon` everywhere
    - _Requirements: 13.7, 13.8, 13.11_
  - [ ]* 4.6 Write property test for active-state accent
    - **Property 31: activating any tool or panel control renders the active state using the Accent_Color token**
    - Tag: `Feature: creative-studio, Property 31: ...`; run >= 100 iterations
    - **Validates: Requirements 13.10**

- [x] 5. EditorCanvas rendering, pan/zoom, and selection
  - [x] 5.1 Implement EditorCanvas rendering
    - Create `frontend/src/editor/EditorCanvas.tsx` wrapping the extended `SVGCanvas`, rendering one `<g data-role>` group per layer (never merged) inside a viewport wrapper group, centered at native dimensions on load
    - _Requirements: 1.1, 1.3, 10.9_
  - [x] 5.2 Implement pan/zoom
    - Translate on pan without mutating the model; cursor-anchored zoom clamped to `[0.10, 64.0]`; show the zoom indicator as `Math.round(zoom * 100)%`; pan/zoom emit no Command
    - _Requirements: 1.3, 1.4, 1.5, 1.6_
  - [ ]* 5.3 Write property test for numeric clamping
    - **Property 12: applied value equals clamp(value, lo, hi) for zoom [0.10, 64.0] and font-size [12, 200], with an adjustment indication when out of range**
    - Tag: `Feature: creative-studio, Property 12: ...`; run >= 100 iterations
    - **Validates: Requirements 1.4, 1.5, 6.6**
  - [ ]* 5.4 Write property test for zoom percentage formatting
    - **Property 27: for any zoom in [0.10, 64.0], the displayed percentage equals Math.round(zoom * 100)**
    - Tag: `Feature: creative-studio, Property 27: ...`; run >= 100 iterations
    - **Validates: Requirements 1.6**
  - [x] 5.5 Implement selection, handles, and marquee
    - Create `frontend/src/editor/SelectionOverlay.tsx`; click selects exactly the editable layer, empty-canvas click clears, shift-click toggles, clicking a non-editable layer leaves the set unchanged; render 8 handles around the combined axis-aligned bounding box; marquee selects intersecting editable layers
    - _Requirements: 1.7, 1.8, 1.9, 1.10, 1.11, 1.12_
  - [ ]* 5.6 Write property test for selection-set transitions
    - **Property 8: click sets exactly that layer; empty-canvas click empties; shift-click toggles (twice restores); non-editable click is a no-op**
    - Tag: `Feature: creative-studio, Property 8: ...`; run >= 100 iterations
    - **Validates: Requirements 1.7, 1.8, 1.9, 1.10, 1.11, 3.2**
  - [ ]* 5.7 Write property test for combined selection bounding box
    - **Property 28: the selection-handle box equals the axis-aligned union of all selected layers' bounding boxes**
    - Tag: `Feature: creative-studio, Property 28: ...`; run >= 100 iterations
    - **Validates: Requirements 1.12**

- [x] 6. Snap guides and alignment
  - [x] 6.1 Extend AlignmentGuides to inter-layer references
    - Extend `AlignmentGuides.tsx` to compute candidate references from other layers' edges/centers plus Artboard edges/center; show a guide for each reference within a 5px on-screen threshold (divide by zoom); snap per axis independently; hide all guides on release or when none are within threshold
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 4.2_
  - [ ]* 6.2 Write property test for snap-guide predicate and per-axis independence
    - **Property 9: a guide is shown for exactly those references within 5px (Editor_Canvas pixels), and snapping adjusts position to the aligned coordinate independently on each axis**
    - Tag: `Feature: creative-studio, Property 9: ...`; run >= 100 iterations
    - **Validates: Requirements 2.1, 2.2, 2.4, 2.5, 2.6, 4.2**

- [x] 7. Tools (select/move/transform, shapes, text, image, pen)
  - [x] 7.1 Implement select/move/transform tool
    - Create `frontend/src/editor/tools/selectTool.ts`; drag-translate by pointer delta, corner-handle resize along the diagonal, arrow-key 1px nudge, center-snap at 5px; locked layers inert; each non-zero op dispatches one command
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  - [ ]* 7.2 Write property test for translation by delta
    - **Property 10: for any unlocked layer and any delta (dx, dy) (including a 1px arrow nudge and a snapped delta), the position after the move equals the prior position plus (dx, dy)**
    - Tag: `Feature: creative-studio, Property 10: ...`; run >= 100 iterations
    - **Validates: Requirements 4.1, 4.4**
  - [ ]* 7.3 Write property test for corner-handle resize
    - **Property 11: for any unlocked layer and corner-handle drag delta, the size changes along the handle's diagonal by the drag delta**
    - Tag: `Feature: creative-studio, Property 11: ...`; run >= 100 iterations
    - **Validates: Requirements 4.3**
  - [x] 7.4 Implement shape tools
    - Create `frontend/src/editor/tools/shapeTool.ts` for rect/ellipse/line/polygon (>= 3 vertices); apply Brand_Kit primaryColor (else Accent_Color) as fill for closed shapes and stroke for lines; add exactly one layer + one Layers_Panel entry + one Command; snap coordinates to 0.5px; discard degenerate (0x0) shapes with no model change
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_
  - [ ]* 7.5 Write property test for default color source
    - **Property 13: a closed shape gets Brand_Kit primaryColor fill when a Brand_Kit is active and Accent_Color otherwise; a line gets the same color source as stroke**
    - Tag: `Feature: creative-studio, Property 13: ...`; run >= 100 iterations
    - **Validates: Requirements 5.2, 5.3**
  - [ ]* 7.6 Write property test for unique layer identifier on creation
    - **Property 15: a newly created shape/image/path has a data-layer-id unique among existing identifiers and a non-empty data-field**
    - Tag: `Feature: creative-studio, Property 15: ...`; run >= 100 iterations
    - **Validates: Requirements 5.1, 7.1, 8.2**
  - [x] 7.7 Implement text tool and inline editor
    - Create `frontend/src/editor/tools/textTool.ts`; create `<text>` in an editable group with `data-field`/`data-element-id` (1..500 chars); double-click opens a pre-populated inline input within 200ms; valid commit updates content + records one Command; empty/whitespace commit retains prior content with a not-applied indication and no Command; font-size clamped 12..200; live preview throttled to <=1/300ms; never path-trace text
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_
  - [ ]* 7.8 Write property test for whitespace-only text rejection
    - **Property 18: committing a whitespace-only string leaves prior text unchanged, records no Command, and produces a not-applied indication**
    - Tag: `Feature: creative-studio, Property 18: ...`; run >= 100 iterations
    - **Validates: Requirements 6.4**
  - [ ]* 7.9 Write property test for text remaining `<text>`
    - **Property 19: after any sequence of edits to a text layer and a serialize round-trip, the layer is represented as a `<text>` node with no path-traced outline**
    - Tag: `Feature: creative-studio, Property 19: ...`; run >= 100 iterations
    - **Validates: Requirements 6.8**
  - [x] 7.10 Implement image placement tool
    - Create `frontend/src/editor/tools/imageTool.ts`; accept PNG/JPEG/WEBP <= 10MB, embed inline as a data URI (reuse `fileToDataUrl`, no network), add one `<image>` to `image-slots` with a unique `data-layer-id` and one Command; reject oversize/unsupported with a reason-specific error and undecodable files with a load error, leaving the model unchanged
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [ ]* 7.11 Write property test for inline image embedding
    - **Property 16: a placed image's `<image>` href is an inline data: URI (no external request)**
    - Tag: `Feature: creative-studio, Property 16: ...`; run >= 100 iterations
    - **Validates: Requirements 7.2**
  - [ ]* 7.12 Write property test for image file validation
    - **Property 17: placement is accepted iff size <= 10MB and type is PNG/JPEG/WEBP; rejection leaves the model unchanged with a reason-specific error (size vs. type)**
    - Build a shared `arbFileMeta` generator; tag `Feature: creative-studio, Property 17: ...`; run >= 100 iterations
    - **Validates: Requirements 7.3**
  - [x] 7.13 Implement pen/path tool
    - Create `frontend/src/editor/tools/penTool.ts`; click adds anchors (rendered <= 100ms); close on first anchor or finalize via Enter/Escape/tool-change; >= 2 anchors emit one `<path>` in `shapes` with a unique `data-layer-id` + `data-field` and one Command; < 2 anchors discard with an indication and no model change
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 8. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Layers_Panel
  - [ ] 9.1 Extend LayerList into Layers_Panel
    - Extend `LayerList.tsx` into `frontend/src/editor/LayersPanel.tsx`: list one entry per top-level group top-to-bottom (reverse document order) within 500ms; select within 200ms; drag-reorder mapping panel order to z-order preserving others; rename to 1..100 chars stored as `data-name` (reject empty/over-100 with error); visibility toggle; lock toggle for editable layers; opacity 0..100 (reject out-of-range with error); locked roles disable rename/delete/lock/reorder — all routed through commands
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.10, 3.11_
  - [ ]* 9.2 Write property test for reorder stability
    - **Property 21: a single-layer reorder places the moved layer at the requested position and preserves the relative order of all other layers**
    - Tag: `Feature: creative-studio, Property 21: ...`; run >= 100 iterations
    - **Validates: Requirements 3.3**
  - [ ]* 9.3 Write property test for opacity mapping
    - **Property 23: for any integer opacity 0..100, the group's effective opacity equals value / 100**
    - Tag: `Feature: creative-studio, Property 23: ...`; run >= 100 iterations
    - **Validates: Requirements 3.7**
  - [ ] 9.4 Implement layer grouping
    - Group >= 2 selected layers into a new container group preserving each member's `data-role` and relative z-order; reject grouping < 2 layers with a "select at least two" indication
    - _Requirements: 3.9, 3.12_
  - [ ]* 9.5 Write property test for grouping
    - **Property 22: grouping nests exactly the selected layers in one new container, preserving each member's data-role and relative z-order; panel display order is the reverse of document order**
    - Tag: `Feature: creative-studio, Property 22: ...`; run >= 100 iterations
    - **Validates: Requirements 3.1, 3.9**

- [ ] 10. Properties_Panel
  - [ ] 10.1 Implement single-selection properties and validation
    - Extend `EditorToolbar.tsx` into `frontend/src/editor/PropertiesPanel.tsx`: show position/size/fill/stroke/stroke-width/opacity and (for text) typography; accept position/size within 0..100000 → one Command within 300ms; reject non-numeric/out-of-range/unparseable-color with a field-level error, retaining the previous value and recording no Command; apply shadow/blur as an SVG filter; advanced controls in collapsible sections collapsed by default
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 13.11_
  - [ ]* 10.2 Write property test for invalid property commits
    - **Property 20: any invalid property commit (name empty/>100, opacity outside 0..100, position/size non-numeric or outside 0..100000, unparseable color) is rejected, retains the previous value, records no Command, and shows a field-level error**
    - Tag: `Feature: creative-studio, Property 20: ...`; run >= 100 iterations
    - **Validates: Requirements 3.10, 3.11, 9.3, 9.5**
  - [ ] 10.3 Implement document-level and multi-selection controls
    - No-selection: Artboard width/height and export options (format + size); multi-selection: alignment (left/h-center/right/top/v-center/bottom) and distribution (horizontal/vertical) over the Selection_Set, each emitting one Command
    - _Requirements: 9.7, 9.8_
  - [ ]* 10.4 Write property test for alignment and distribution
    - **Property 24: each alignment operation sets the corresponding edge/center of every selected layer to the shared target coordinate, and distribution equalizes spacing along the chosen axis**
    - Tag: `Feature: creative-studio, Property 24: ...`; run >= 100 iterations
    - **Validates: Requirements 9.8**

- [ ] 11. AI integration wiring
  - [ ] 11.1 Wire generation and image decomposition into the Document_Model
    - Extend `useDesignStudio.ts` to call `generateDesign`/`uploadImage` from `designApi.ts` unchanged; validate empty/whitespace prompt and non-positive target size client-side (no call, model unchanged); on success load via `artboardFromDesignOutput` one layer per `data-role` group (never flatten) and set Artboard size from the returned SVG for uploads; surface backend errors and the existing 300s timeout while preserving the model; drive a loading indicator that disables resubmission of the in-flight request
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9_
  - [ ]* 11.2 Write integration tests for AI flows (mocked backend)
    - Assert `generateDesign`/`uploadImage` are called with correctly built payloads; backend error surfaces its message and preserves the model; the 300s timeout maps to a timeout error and preserves the model; loading state disables resubmission
    - _Requirements: 10.1, 10.4, 10.6, 10.7, 10.8_

- [ ] 12. Autosave and persistence
  - [ ] 12.1 Implement the IndexedDB autosave store
    - Create `frontend/src/editor/autosaveStore.ts` using `idb`; serialize the `CreativeDocument` (via `serializeArtboard`) on a 2s trailing-edge debounce; restore on startup before any backend call; drive `saveStatus` (idle→saving→saved/save-failed) reflected in the Top_Bar within 1s; on write failure retain the in-memory model, show a save-failed warning, and retry up to 3 times at 5s intervals
    - _Requirements: 11.7, 11.8, 11.9, 11.10_
  - [ ]* 12.2 Write property test for autosave persist/restore round-trip
    - **Property 4: serializing any valid CreativeDocument to the Autosave_Store and restoring it yields a deep-equal CreativeDocument**
    - Use an in-memory `idb` test double; tag `Feature: creative-studio, Property 4: ...`; run >= 100 iterations
    - **Validates: Requirements 11.7, 11.8**
  - [ ]* 12.3 Write unit test for the retry sequence
    - Under fake timers, assert a failed write retries up to 3 times at 5s intervals while preserving the in-memory model and showing the save-failed status
    - _Requirements: 11.9, 11.10_

- [ ] 13. Export (SVG / PNG / PDF)
  - [ ] 13.1 Implement SVG and PNG export
    - Create `frontend/src/editor/export/exportImage.ts`; SVG export via `serializeArtboard(activeArtboard)` (reuse existing download path); PNG export rasterized at exactly the Artboard pixel dimensions (reuse `exportSvgAsPng`); 30s timeout terminates with a timeout error; any failure leaves the model unchanged; filename derives from document name or `requestId` when empty
    - _Requirements: 12.1, 12.2, 12.4, 12.5, 12.6_
  - [ ]* 13.2 Write property test for PNG export dimensions
    - **Property 25: a PNG export produces a raster whose pixel width and height equal the Artboard's width and height in pixels**
    - Tag: `Feature: creative-studio, Property 25: ...`; run >= 100 iterations
    - **Validates: Requirements 12.2**
  - [ ]* 13.3 Write property test for export filename selection
    - **Property 26: the exported filename derives from the document name when non-empty and from the requestId when empty, with the format-appropriate extension**
    - Tag: `Feature: creative-studio, Property 26: ...`; run >= 100 iterations
    - **Validates: Requirements 12.6**
  - [ ] 13.4 Implement PDF export
    - Create `frontend/src/editor/export/exportPdf.ts` using `jspdf` + `svg2pdf.js`; render the canonical SVG to a vector PDF sized to the Artboard, extend the page box by `printMeta.bleed`, draw trim marks where defined, and route fills through a CMYK-safe mapping for every element where that metadata is defined; 30s timeout + failure leave the model unchanged
    - _Requirements: 12.3, 12.4, 12.5, 12.6_
  - [ ]* 13.5 Write integration test for PDF export
    - Assert a document with defined `printMeta` produces a PDF whose page box is extended by `bleed` and whose fills are routed through the CMYK-safe mapping
    - _Requirements: 12.3_

- [ ] 14. Final wiring and smoke/integration tests
  - [ ] 14.1 Wire all panels, tools, and canvas into the shell
    - Connect `EditorCanvas`, `LayersPanel`, `PropertiesPanel`, `ToolRail`, tools, AI, autosave, and export through the extended `useDesignStudio` hook in `CreativeStudio.tsx`; add keyboard shortcuts (undo/redo, arrow nudge, tool switch); mount `CreativeStudio` from `DesignStudio.tsx` so no orphaned code remains
    - _Requirements: 13.7, 13.8, 13.10_
  - [ ] 14.2 Implement inert Bottom_Panel timeline and collaborators placeholder
    - Render the Bottom_Panel timeline as a labeled placeholder whose controls perform no action and the collaborators control as a non-functional placeholder
    - _Requirements: 13.9, 14.3, 14.7_
  - [ ]* 14.3 Write property test for the inert timeline placeholder
    - **Property 32: activating any Bottom_Panel timeline control leaves the Document_Model and editor state unchanged and records no Command**
    - Tag: `Feature: creative-studio, Property 32: ...`; run >= 100 iterations
    - **Validates: Requirements 13.9, 14.3, 14.7**
  - [ ]* 14.4 Write smoke/static tests
    - Assert the theme token set is monochrome plus one accent (13.4), the icon lint guard forbids raster imports and inline `fill` on chrome icons and direct `lucide-react` imports outside `Icon.tsx` (13.6), and the out-of-scope features (RAW edit, brush engine, motion/timeline, multiplayer, plugin SDK, code export) are absent from the v1 build (14.1–14.7)
    - _Requirements: 13.4, 13.6, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

- [ ] 15. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests) and can be skipped for a faster MVP; core implementation sub-tasks are never optional.
- Every task extends existing code per AGENTS.md (extend, never rewrite; one responsibility per file; strict typing; every I/O has error handling) and references the specific requirements it implements.
- Property-based tests use fast-check at >= 100 iterations and are tagged `Feature: creative-studio, Property {number}: {property_text}`.
- The three required round-trips are first-class: SVG export/re-import (Property 1, task 2.3), undo (Property 2, task 3.3), and autosave persist/restore (Property 4, task 12.2).
- All 32 correctness properties from the design are distributed across the relevant implementation tasks; checkpoints ensure incremental validation.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "4.1", "4.3"] },
    { "id": 2, "tasks": ["2.2", "4.2", "4.4"] },
    { "id": 3, "tasks": ["2.3", "2.4", "2.5", "3.1"] },
    { "id": 4, "tasks": ["3.2", "4.5"] },
    { "id": 5, "tasks": ["3.3", "3.4", "3.5", "3.6", "3.7", "4.6", "5.1"] },
    { "id": 6, "tasks": ["5.2", "5.5"] },
    { "id": 7, "tasks": ["5.3", "5.4", "5.6", "5.7", "6.1"] },
    { "id": 8, "tasks": ["6.2", "7.1", "7.4", "7.7", "7.10", "7.13"] },
    { "id": 9, "tasks": ["7.2", "7.3", "7.5", "7.6", "7.8", "7.9", "7.11", "7.12"] },
    { "id": 10, "tasks": ["9.1", "10.1"] },
    { "id": 11, "tasks": ["9.2", "9.3", "9.4", "10.2", "10.3"] },
    { "id": 12, "tasks": ["9.5", "10.4", "11.1"] },
    { "id": 13, "tasks": ["11.2", "12.1"] },
    { "id": 14, "tasks": ["12.2", "12.3", "13.1"] },
    { "id": 15, "tasks": ["13.2", "13.3", "13.4"] },
    { "id": 16, "tasks": ["13.5", "14.1"] },
    { "id": 17, "tasks": ["14.2"] },
    { "id": 18, "tasks": ["14.3", "14.4"] }
  ]
}
```
