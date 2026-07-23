# Dreamer (PrintRocket) - Project Context & Architecture

This document serves as the "Source of Truth" for any AI agent joining this workspace. It details the architecture, the logic conventions, the work accomplished so far, and the remaining roadmap to achieve full Canva-level parity.

## 🏗️ Architecture & Philosophy

- **Tech Stack**: React 18, TypeScript, Vite.
- **The SVG is the Source of Truth**: The editor uses a "Canonical SVG" design. There is no heavy JSON schema driving the layout. Instead, semantic SVG `<g data-role="...">` groups act as the ultimate truth.
- **State Management**: Orchestrated via `CreativeStudio.tsx` using custom hooks (`useCreativeStudio.ts`, `useViewport.ts`).
- **No Monoliths**: One file = one responsibility. Components communicate through well-typed commands (e.g., `groupCommand`, `setPropertyCommand`).

## 📁 Key Files & Their Logic

- `frontend/src/editor/CreativeStudio.tsx`: The main shell. Connects sidebars, properties panel, and the canvas. Tracks the active tool, keyboard shortcuts, and `isTextEditing` state.
- `frontend/src/editor/CenterStage.tsx`: Renders the zoomable/pannable stage. Mounts the `InlineTextEditor` natively over the SVG bounding boxes using `requestAnimationFrame`.
- `frontend/src/editor/EditorCanvas.tsx` / `SVGCanvas.tsx`: Renders the actual canonical SVG design.
- `frontend/src/editor/SelectionOverlay.tsx`: Uses `getBoundingClientRect` on the SVG DOM nodes to calculate accurate selection handles and marquees (independent of zoom level).
- `frontend/src/editor/PropertiesPanel.tsx`: The right-side context panel for editing element properties (Fill, Stroke, Arrangement).
- `frontend/src/editor/commands/`: A suite of pure functions returning state mutations for undo/redo integration.

---

## ✅ What We Have Built & Fixed (Phases 1-6)

1. **Vite Hot-Reload Stability**: Moved non-serializable exports (`svgToPathData`) out of React component files to eliminate HMR crashes.
2. **Advanced Z-Index / Arrangement**: Fully functional "Bring to Front", "Send Backward", etc., integrated into both the `PropertiesPanel` and the Right-Click `ContextMenu`.
3. **Layer Grouping Ecosystem**: `groupCommand` and `separateLayerCommand` (Ungroup) fully functional. We solved a complex type bug where `LayerPosition` indexing failed on nested artboards.
4. **Memory Leak Audit**: Audited `useViewport`, `useCanvasDrag`, and `useShapeDrawing`. Zero event listener leaks exist. 
5. **Decoupled Zoom UI**: Zoom buttons in the TopBar dispatch custom `app:zoom` events, allowing `useViewport` to zoom the canvas without causing a re-render of the massive `CreativeStudio` shell.
6. **Double-Click WYSIWYG Text Editing**: Mounted the previously orphaned `InlineTextEditor`. Double-clicking any `<text>` layer spawns a native HTML input directly over the text bounding box.
7. **Native Visual Color Pickers**: Replaced raw Hex-code-only text inputs with hybrid `<input type="color">` pickers in `PropertiesPanel.tsx` for visual Fill and Stroke selection.
8. **Backend Microservices Skeleton**: Scaffolded Node.js services for Collaboration (`ws`, `ioredis`), Export Workers (`bullmq`), and Templates (`pg`, `express`).
9. **SelectionOverlay Infinite Loop Fix**: Fixed `Maximum update depth exceeded` by using deep equality comparisons and primitive dependency arrays in `useLayoutEffect`.
10. **Viewport Passive Event Reliability**: Fixed scrolling passive event spam in `useViewport.ts` by gating `event.preventDefault()` behind an `event.cancelable` check.
11. **SOTA Backend Architecture**: Fully implemented the backend microservices including PostgreSQL schemas for templates and Yjs document states, a Yjs + y-websocket Collaboration Gateway with Redis broadcasting, a full Templates Express API with DB seeding, and a Headless Puppeteer + BullMQ Export pipeline for generating perfect PDF/PNG/JPEG renders from canonical SVGs.
12. **Figma-style Transform Controls**: Implemented bounding boxes, corner/edge resize handles, rotation handles, live measurement labels (X/Y during move, W/H during resize), keyboard nudging (1px, 10px, 0.5px), Pivot points, and object-type aware restrictions (e.g. text can only be scaled horizontally).
13. **Blank Canvas Layer Scaffolding**: Fixed a bug where new canvases created empty scaffold entries (Print Marks, Logo, Headline, etc.). Now, new blank canvases contain only one Background layer, and real layers appear automatically when content is added. Layer controls use `lucide-react` icons for visibility, locking, etc.

---

## 🚧 What Is Left To Implement (The Canva Parity Roadmap)

The following features are missing or stubbed out, and must be implemented to achieve 100% Canva parity:

1. **Smart Guides & Snapping (High Priority)**
   - Elements currently drag, but they do not auto-snap to the edges of the canvas or align with other elements. `SmartGuides.tsx` exists but needs to be fully integrated with `useCanvasDrag.ts`.
2. **Typography Controls (High Priority)**
   - Text editing works, but changing Font Family, Bold, Italic, and Text Alignment (Left/Center/Right) from the Top Toolbar or Properties Panel is not wired up.
3. **Image Upload & Masking**
   - Dragging an image from the `AddElementPanel` (or OS desktop) onto an SVG shape should mask the image into that shape (placeholder image slots).
4. **Undo / Redo Global Shortcuts**
   - The commands exist, but `Ctrl+Z` / `Ctrl+Y` need robust event listeners that don't misfire while the user is typing in a text field.
5. **AI Orchestration (`agents.md`) Integration**
   - The backend Python FastAPI pipeline (Encoders, Planners, Realizers) needs its frontend hooks wired so users can type a prompt and have the AI generate the Canonical SVG layout automatically.

---

## 🛠️ Deep Logic Blueprints for Unimplemented Features

To achieve full Canva parity, agents should follow these architectural blueprints for the remaining features:

### A. Grids, Snapping, and Alignment (Polotno-style)
- **Current State**: `useCanvasDrag.ts` handles raw coordinate translation. `SmartGuides.tsx` exists as a UI overlay but is completely disconnected from the actual dragging math.
- **Implementation Strategy**:
  1. Modify `useCanvasDrag.ts` to compute intersection lines against the bounding boxes of ALL other siblings in the active artboard.
  2. Emit a snapping delta (e.g., if within 5px of a sibling's center or edge, lock coordinate).
  3. `CreativeStudio` should pass these active guide lines to `CenterStage`, which then passes them to `SmartGuides.tsx` for visual rendering.
  4. Ensure performance by throttling or caching sibling bounding boxes at the start of a drag interaction.

### B. Typography & Text Styling
- **Current State**: `InlineTextEditor` edits the raw string, but `TextFormattingToolbar.tsx` is completely unhooked.
- **Implementation Strategy**:
  1. Font Family: Need to maintain a list of Google Fonts. When selected, the `font-family` attribute must be updated via a new property command. The font must be dynamically injected into a `<style>` tag inside the SVG `<defs>` so it renders correctly upon export.
  2. Alignment (Left/Center/Right): Text `x`, `y` and `text-anchor` attributes in the Canonical SVG must be shifted mathematically to preserve the visual bounding box while changing alignment.
  3. Bold/Italic: Update `font-weight` and `font-style` attributes respectively.

### C. Drag & Drop Image Masking (Placeholders)
- **Current State**: `UploadPanel.tsx` and `AddElementPanel.tsx` exist, but dropping an image onto the canvas just creates a floating raster.
- **Implementation Strategy**:
  1. Images dragged from the sidebar must use HTML5 `dataTransfer`.
  2. `SVGCanvas.tsx` / `CenterStage.tsx` needs an `onDrop` handler.
  3. If dropped OVER an existing `<rect>` or `<path>` that has `data-role="image-slots"`, the SVG should be mutated to convert that shape into a `<clipPath>` and nest the uploaded `<image href="...">` inside it.

### D. The Unlimited Canvas (Artboards)
- **Current State**: There is a single `activeArtboard` concept.
- **Implementation Strategy**:
  1. To support multi-page documents, `EditorCanvas` needs to render a vertical scrolling list of Artboards, each with its own Canonical SVG viewport.
  2. Commands like `translateLayerCommand` must be aware of which artboard the layer belongs to, preventing layers from dragging "between" pages unless explicitly transferred in the DOM tree.

---

## ⚠️ Agent Instructions & Rules

1. **Never use wildcard rewrites**: If you modify a file, patch it. Do not erase surrounding logic.
2. **Respect `data-role`**: When manipulating the SVG DOM, never flatten or destroy the `data-role="headline"`, `data-role="shapes"`, etc., layer groups. They are required for the AI backend.
3. **TypeScript Strictness**: `npm run build` must always pass. If you add a prop to a component, update its `interface` and properly chain it through parent components.
4. **SVG is the Source of Truth**: Never store element positions in a React `useState` array if they are part of the document design. They must live as `x/y` attributes in the `designOutput.composedSVG`.
5. **No Memory Leaks**: When adding global event listeners (like keyboard shortcuts or mouse tracking), ALWAYS return a cleanup function in `useEffect`.
