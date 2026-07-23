# Design Document: Professional Canvas UX Enhancement

## Overview

This design document architects the implementation of professional-grade canvas UX features to match industry standards (PowerPoint, Canva, Photoshop). The design extends the existing Document Model, Command system, and component architecture while maintaining:

- **Zero rewrites**: Extend existing `useCanvasDrag`, `SelectionOverlay`, commands
- **One responsibility per file**: New files for new capabilities
- **DOM-direct transforms**: No React re-renders during interactions
- **Command pattern**: All mutations are undoable via immutable commands
- **60 FPS target**: GPU-accelerated transforms, debounced updates

## Architecture Context

### Existing System
```
CreativeStudio (shell)
  ├── TopBar (project name, undo/redo, theme, search, export)
  ├── ToolRail (select, shapes, text, image, pen tools)
  ├── LeftSidebar (pages, layers, assets, components, templates, generate)
  ├── CenterStage → EditorCanvas → SVGCanvas + SelectionOverlay
  └── PropertiesPanel (layer properties editor)

Data Flow:
  useCreativeStudio hook → dispatchCommand → History → Document Model → Re-render
  
Interaction:
  useCanvasDrag → DOM transforms → onPointerUp → dispatchCommand
```

### Current Capabilities
- Single selection with resize/rotate handles
- Basic drag (via useCanvasDrag with DOM-direct transforms)
- Undo/redo (Cmd/Ctrl+Z/Y, 50 command cap)
- Arrow key nudge (1px or 10px with Shift)
- Layer panel (visibility, lock, opacity, reorder)
- Shape/text/image creation via AddElementPanel
- Snapping to layer edges and artboard (5px threshold)

### Gaps to Fill
- Multi-selection and marquee
- Clipboard operations (copy/paste/cut/duplicate)
- Keyboard shortcuts (30+ shortcuts)
- Contextual menus
- Alignment and distribution tools
- Group/ungroup operations
- Smart guides rendering
- Grid and ruler overlays
- Performance optimizations for 100+ layers
- Text formatting toolbar
- Visual feedback (toasts, angle indicators)


## Core Design Principles

### 1. Multi-Selection Model
```typescript
// Extend SelectionSet (already exists in documentModel.ts)
interface SelectionSet {
  layerIds: string[];           // 0..n selected layers
  primaryLayerId?: string;       // Last-selected layer (drives PropertiesPanel)
}

// Selection modes (new)
type SelectionMode = 
  | "replace"   // Click: replace selection with single layer
  | "add"       // Shift+Click: add to selection
  | "remove"    // Shift+Click on selected: remove from selection  
  | "marquee"   // Drag empty canvas: rubber-band rectangle
```

**Rationale**: The primaryLayerId tracks which layer was clicked last in multi-selection, driving what properties show in the Properties Panel. This follows Figma/Photoshop conventions.

### 2. Keyboard Shortcut System
```typescript
// New file: useKeyboardShortcuts.ts
interface KeyboardShortcut {
  keys: string[];              // ["Meta", "c"] or ["Delete"]
  action: (context: EditorContext) => void;
  enabled: (context: EditorContext) => boolean;
}

interface EditorContext {
  selection: SelectionSet;
  clipboard: ClipboardData | null;
  canUndo: boolean;
  canRedo: boolean;
  activeTextEditor: boolean;    // Don't trigger shortcuts during text edit
}
```

**Implementation Strategy**:
- Single `useEffect` in CreativeStudio listening to `window.keydown`
- Shortcut registry with priority (text editing > canvas shortcuts > browser)
- Context-aware enabling (e.g., Paste disabled when clipboard empty)

### 3. Clipboard Architecture
```typescript
// New file: clipboard.ts
interface ClipboardData {
  type: "creative-studio-layers";
  version: 1;
  layers: DocumentLayer[];      // Full serialized layers with children
  originalBounds: BoundingBox;  // For smart paste positioning
}

// Serialize layers to JSON
function serializeLayers(layers: DocumentLayer[]): string;

// Deserialize and remap IDs
function deserializeLayers(json: string): DocumentLayer[];

// Generate new unique IDs recursively
function remapLayerIds(layer: DocumentLayer): DocumentLayer;
```

**Design Decision**: Use internal clipboard format (not system clipboard) because:
- System clipboard doesn't reliably handle complex JSON across browsers
- Internal clipboard allows instant paste without async clipboard API
- Can fallback to system clipboard for cross-session copy/paste (future)


### 4. Alignment and Distribution Algorithms
```typescript
// New file: alignment.ts
type AlignMode = "left" | "center-h" | "right" | "top" | "center-v" | "bottom";
type DistributeMode = "horizontal" | "vertical";
type AlignTarget = "selection" | "artboard";

interface BoundingBox {
  x: number; y: number; width: number; height: number;
}

// Compute combined bounding box for multiple layers
function getSelectionBounds(
  layers: DocumentLayer[],
  doc: CreativeDocument
): BoundingBox;

// Align layers to reference (either selection or artboard)
function alignLayers(
  layerIds: string[],
  mode: AlignMode,
  target: AlignTarget,
  doc: CreativeDocument
): Map<string, {dx: number, dy: number}>;  // Returns offsets per layer

// Distribute layers evenly
function distributeLayers(
  layerIds: string[],
  mode: DistributeMode,
  doc: CreativeDocument
): Map<string, {dx: number, dy: number}>;
```

**Algorithm Sketch** (Align Left example):
```
1. Filter out locked layers
2. Compute bounding box for each layer
3. If target = selection: reference = leftmost layer's left edge
4. If target = artboard: reference = artboard x
5. For each layer: dx = reference - layer.bounds.x, dy = 0
6. Create batchTranslateCommand with all offsets
```

**Distribution Algorithm** (Horizontal example):
```
1. Sort layers by x position (left to right)
2. leftmost = layers[0], rightmost = layers[last]
3. totalGap = rightmost.x - (leftmost.x + leftmost.width)
4. gapBetween = totalGap / (layers.length - 1)
5. For each layer[i]: targetX = leftmost.x + leftmost.width + i * gapBetween
6. dx[i] = targetX - layers[i].x
```

### 5. Command Pattern Extensions
```typescript
// New command: batchTranslateCommand.ts
interface BatchTranslateCommand extends Command {
  type: "batch-translate";
  label: "Move Layers";
  layerOffsets: Map<string, {dx: number, dy: number}>;
}

// New command: groupLayersCommand.ts (extends existing groupCommand)
interface GroupLayersCommand extends Command {
  type: "group-layers";
  label: "Group Selection";
  layerIds: string[];
  groupId: string;          // Generated unique ID for new group
  insertPosition: number;   // Where to insert in parent's children array
}

// New command: ungroupCommand.ts
interface UngroupCommand extends Command {
  type: "ungroup";
  label: "Ungroup";
  groupId: string;
  previousGroupData: GroupLayer;  // For undo
}

// New command: copyPasteCommand.ts
interface PasteLayersCommand extends Command {
  type: "paste-layers";
  label: "Paste";
  layers: DocumentLayer[];       // With remapped IDs
  offset: {dx: number, dy: number};
}
```

**Batch Command Pattern**: Alignment, distribution, and multi-select delete all use batch commands that record multiple layer changes but count as one undo step.


### 6. Contextual Menu Architecture
```typescript
// New file: ContextMenu.tsx
interface ContextMenuItem {
  label: string;
  icon?: string;
  action: () => void;
  enabled: boolean;
  separator?: boolean;
  submenu?: ContextMenuItem[];
}

interface ContextMenuProps {
  x: number;
  y: number;           // Screen coordinates
  items: ContextMenuItem[];
  onClose: () => void;
}

// Compute menu items based on selection context
function getLayerContextMenu(
  selection: SelectionSet,
  clipboard: ClipboardData | null,
  dispatchCommand: (cmd: Command) => void
): ContextMenuItem[];
```

**Menu Composition Strategy**:
- **Single layer**: Cut, Copy, Duplicate, Delete, | Lock, Hide, | Bring Forward, Send Backward
- **Multi-layer**: Group, Align >, Distribute >, | Lock All, Hide All, | Delete
- **Empty canvas**: Paste, Select All, | Zoom In, Zoom Out, Fit
- **Locked layer**: Unlock, | Copy, Duplicate

**Rendering**: Portal mount to document.body to avoid z-index issues, CSS absolute positioning, click-outside-to-close with useEffect.

### 7. Smart Guides Rendering
```typescript
// New file: SmartGuides.tsx
interface Guide {
  type: "vertical" | "horizontal";
  position: number;        // x for vertical, y for horizontal
  source: "layer" | "artboard" | "center";
  sourceLayerId?: string;
}

interface SmartGuidesProps {
  guides: Guide[];
  viewport: Viewport;
  artboardBounds: BoundingBox;
}

// Compute guides during drag
function computeSnapGuides(
  draggingBounds: BoundingBox,
  otherLayers: DocumentLayer[],
  artboardBounds: BoundingBox,
  snapThreshold: number = 5
): { guides: Guide[], snapOffset: {dx: number, dy: number} };
```

**Rendering Strategy**:
- SVG `<line>` elements in a dedicated overlay (not part of SelectionOverlay)
- Position: `x1={guide.position * viewport.zoom + viewport.panX}`
- Style: `stroke="rgba(255,0,255,0.8)" stroke-width="1" vector-effect="non-scaling-stroke"`
- Performance: Recompute only during drag move events, clear on drag end

**Snapping Logic**:
```
1. Get edges of dragging layer: left, center-x, right, top, center-y, bottom
2. For each other layer and artboard: compute their edges
3. For each pair of edges: if distance < threshold, record guide + snap offset
4. Apply snap offset with highest priority (center > edge)
5. Show all active guides (may be multiple simultaneous)
```


### 8. Grid and Ruler Overlays
```typescript
// New file: GridOverlay.tsx
interface GridOverlayProps {
  viewport: Viewport;
  artboardBounds: BoundingBox;
  gridSize: number;        // Base grid spacing in px (default 10)
  enabled: boolean;
}

// Adaptive grid: adjust spacing based on zoom
function getAdaptiveGridSize(baseSize: number, zoom: number): number {
  if (zoom < 0.25) return baseSize * 4;
  if (zoom < 0.5) return baseSize * 2;
  if (zoom > 2) return baseSize / 2;
  return baseSize;
}

// New file: RulerOverlay.tsx
interface RulerOverlayProps {
  viewport: Viewport;
  artboardBounds: BoundingBox;
  orientation: "horizontal" | "vertical";
  height: number;          // Ruler thickness (default 20px)
}
```

**Grid Rendering**:
- SVG `<pattern>` element with id="grid" defining the grid cell
- `<rect>` filling artboard with pattern fill
- Update pattern size on zoom change: `patternUnits="userSpaceOnUse" width={gridSize} height={gridSize}`

**Ruler Rendering**:
- Fixed-position div above canvas
- Canvas 2D context for tick marks and labels
- Redraw on viewport pan/zoom
- Show dragging indicator: vertical/horizontal line tracking mouse position

### 9. Performance Optimization Strategies

#### 9.1 Visibility Culling
```typescript
// New file: useVisibilityCulling.ts
function useVisibilityCulling(
  layers: DocumentLayer[],
  viewport: Viewport,
  viewportBounds: BoundingBox
): string[] {  // Returns visible layer IDs
  return useMemo(() => {
    return layers
      .filter(layer => {
        const bounds = getLayerBounds(layer);
        return boundsIntersect(bounds, viewportBounds);
      })
      .map(l => l.id);
  }, [layers, viewport]);
}
```

**Integration**: SVGCanvas receives `visibleLayerIds` and only renders those layers. Layers outside viewport get `display: none`.

#### 9.2 Debouncing and Batching
```typescript
// Text input debounce (already exists in InlineTextEditor, verify 300ms)
const debouncedUpdate = useMemo(
  () => debounce((text: string) => onTextUpdate(text), 300),
  [onTextUpdate]
);

// Selection change batching
const batchedSelectionUpdate = useRef<SelectionSet | null>(null);
const flushSelection = useCallback(() => {
  if (batchedSelectionUpdate.current) {
    setSelection(batchedSelectionUpdate.current);
    batchedSelectionUpdate.current = null;
  }
}, []);
```

#### 9.3 GPU Acceleration
All transforms use CSS `transform` property (already done in useCanvasDrag):
```css
.layer {
  transform: translate(10px, 20px) rotate(45deg) scale(1.2);
  will-change: transform;  /* Hint to browser to use GPU */
}
```

#### 9.4 Image Thumbnails (Future)
```typescript
// Placeholder for lazy implementation
interface ImageLayer {
  href: string;           // Full resolution data URI
  thumbnail?: string;     // Low-res version for zoom < 50%
}
```


### 10. Text Formatting Enhancements
```typescript
// New file: TextFormattingToolbar.tsx
interface TextFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
}

interface TextFormattingToolbarProps {
  selection: TextSelection;  // Character range in text layer
  currentFormat: TextFormat;
  onFormatChange: (format: Partial<TextFormat>) => void;
  position: {x: number, y: number};  // Float above selected text
}

// Extend TextLayer in documentModel.ts
interface TextLayer extends BaseLayer {
  // ... existing fields
  fontWeight: "normal" | "bold" | string;  // Support numeric weights
  fontStyle: "normal" | "italic";
  textDecoration?: "none" | "underline" | "line-through";
}
```

**Implementation Notes**:
- Toolbar appears only during inline text editing when user selects text
- Position calculated from selection range bounding rect
- Format changes dispatch setPropertyCommand per change
- For v1: apply format to entire text layer (no rich text spans)
- Future: Support `<tspan>` for character-level formatting

### 11. Visual Feedback Components

#### 11.1 Toast Notifications
```typescript
// New file: Toast.tsx
interface Toast {
  id: string;
  message: string;
  type: "info" | "success" | "error";
  duration: number;        // Auto-dismiss after ms
}

// New file: useToast.ts
function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  const show = useCallback((message: string, type: "info" | "success" | "error" = "info") => {
    const toast: Toast = { id: mintId(), message, type, duration: 2000 };
    setToasts(prev => [...prev, toast]);
    setTimeout(() => dismiss(toast.id), toast.duration);
  }, []);
  
  return { toasts, show, dismiss };
}
```

**Usage**: `toast.show("Undo Move Layer", "info")` on undo/redo actions.

#### 11.2 Angle Indicator
```typescript
// New file: AngleIndicator.tsx
interface AngleIndicatorProps {
  angle: number;           // Degrees 0-360
  position: {x: number, y: number};  // Near cursor
  visible: boolean;
}

// Render: <div style={{position: "absolute", ...}}>{angle}°</div>
```

**Integration**: SelectionOverlay renders AngleIndicator during rotation, updates angle on every pointermove.


## Component Breakdown

### New Components
```
frontend/src/editor/
  ├── ContextMenu.tsx              // Right-click menu system
  ├── SmartGuides.tsx              // Snap guide rendering
  ├── GridOverlay.tsx              // Grid pattern overlay
  ├── RulerOverlay.tsx             // Horizontal/vertical rulers
  ├── TextFormattingToolbar.tsx   // Floating text format controls
  ├── AngleIndicator.tsx           // Rotation angle display
  ├── Toast.tsx                    // Toast notification component
  ├── ToastContainer.tsx           // Toast portal mount
  └── AlignmentToolbar.tsx         // Alignment/distribution buttons (in PropertiesPanel)
```

### New Hooks
```
frontend/src/editor/hooks/
  ├── useKeyboardShortcuts.ts      // Global keyboard shortcut registry
  ├── useClipboard.ts              // Internal clipboard state + operations
  ├── useContextMenu.ts            // Context menu state + positioning
  ├── useToast.ts                  // Toast notification queue
  ├── useVisibilityCulling.ts      // Layer culling for performance
  └── useMultiSelection.ts         // Multi-selection logic (extends current selection)
```

### New Utilities
```
frontend/src/editor/utils/
  ├── clipboard.ts                 // Serialize/deserialize layers
  ├── alignment.ts                 // Alignment/distribution algorithms
  ├── snapping.ts (extend)         // Add smart guide computation
  ├── bounds.ts                    // Bounding box utilities
  └── idGenerator.ts (extend)      // Ensure mintId is robust
```

### New Commands
```
frontend/src/editor/commands/
  ├── batchTranslateCommand.ts     // Multi-layer translate
  ├── pasteLayersCommand.ts        // Paste from clipboard
  ├── ungroupCommand.ts            // Ungroup layers
  ├── batchPropertyCommand.ts      // Apply property to multiple layers
  └── batchDeleteCommand.ts        // Delete multiple layers
```

### Extensions to Existing Files

#### useCreativeStudio.ts (add methods)
```typescript
interface CreativeStudioState {
  // ... existing fields
  selection: SelectionSet;         // Extend to multi-selection
  clipboard: ClipboardData | null; // Internal clipboard
  contextMenu: ContextMenuState | null;
  
  // New methods
  selectMultiple: (layerIds: string[]) => void;
  toggleSelection: (layerId: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  
  copy: () => void;
  cut: () => void;
  paste: () => void;
  duplicate: () => void;
  
  group: () => void;
  ungroup: () => void;
  
  align: (mode: AlignMode, target: AlignTarget) => void;
  distribute: (mode: DistributeMode) => void;
  
  showContextMenu: (x: number, y: number) => void;
  hideContextMenu: () => void;
}
```

#### SelectionOverlay.tsx (extend)
```typescript
// Add marquee selection logic
function useMarqueeSelection(
  hostRef: RefObject<HTMLElement>,
  viewport: Viewport,
  onSetSelection: (layerIds: string[]) => void
) {
  // Listen for drag on empty canvas
  // Show rubber-band rectangle
  // On release: compute intersecting layers, call onSetSelection
}

// Add rotation angle indicator
const [rotationAngle, setRotationAngle] = useState<number | null>(null);
```


#### CreativeStudio.tsx (integrate new features)
```typescript
// Import new components
import { ContextMenu } from "./ContextMenu";
import { ToastContainer } from "./ToastContainer";
import { GridOverlay } from "./GridOverlay";
import { RulerOverlay } from "./RulerOverlay";
import { SmartGuides } from "./SmartGuides";

// Add keyboard shortcuts hook
const { } = useKeyboardShortcuts({
  selection: studio.selection,
  clipboard: studio.clipboard,
  onCopy: studio.copy,
  onPaste: studio.paste,
  // ... all shortcuts
});

// Add context menu rendering
{studio.contextMenu && (
  <ContextMenu
    x={studio.contextMenu.x}
    y={studio.contextMenu.y}
    items={studio.contextMenu.items}
    onClose={studio.hideContextMenu}
  />
)}
```

## Data Structures

### Clipboard Data Format
```json
{
  "type": "creative-studio-layers",
  "version": 1,
  "layers": [
    {
      "id": "original-id-will-be-remapped",
      "kind": "text",
      "content": "Hello",
      "x": 100,
      "y": 200,
      ...
    }
  ],
  "originalBounds": {
    "x": 100,
    "y": 200,
    "width": 200,
    "height": 50
  }
}
```

### Context Menu State
```typescript
interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}
```

### Multi-Selection State
```typescript
interface SelectionSet {
  layerIds: string[];              // All selected layer IDs
  primaryLayerId?: string;         // Last-clicked layer
}

// Helpers
function isPrimaryLayer(layerId: string, selection: SelectionSet): boolean {
  return selection.primaryLayerId === layerId;
}

function getSelectionBounds(selection: SelectionSet, doc: CreativeDocument): BoundingBox {
  // Compute combined bounding box of all selected layers
}
```


## Implementation Strategy

### Phase 1: Multi-Selection Foundation
**Inspired by**: tldraw's selection system, Excalidraw's multi-select
**Goal**: Enable selecting multiple layers and basic batch operations

1. Extend `SelectionSet` to support `layerIds: string[]` and `primaryLayerId`
2. Implement `useMultiSelection` hook with add/remove/toggle logic
3. Update `SelectionOverlay` to show combined bounding box for multi-selection
4. Add Shift+Click handler to CreativeStudio for toggle selection
5. Implement Cmd/Ctrl+A for select all

**Key Pattern from tldraw**: Use a single selection state with computed derived values (bounds, center) rather than storing redundant data.

### Phase 2: Keyboard Shortcuts System
**Inspired by**: Figma's comprehensive shortcuts, VS Code's keybinding system
**Goal**: Add 30+ keyboard shortcuts for productivity

1. Create `useKeyboardShortcuts` hook with shortcut registry
2. Implement context-aware enabling (e.g., disable canvas shortcuts during text edit)
3. Add shortcuts for: copy/paste/cut/duplicate, delete, group/ungroup, z-order, nudge, zoom
4. Priority system: text input > canvas > browser defaults
5. Visual feedback: show toast on actions like "Undo Move Layer"

**Key Pattern from VS Code**: Single event listener at root with priority-based dispatch to prevent conflicts.

### Phase 3: Clipboard Operations
**Inspired by**: Polotno's layer serialization, Penpot's clipboard handling
**Goal**: Reliable copy/paste/cut/duplicate with full layer fidelity

1. Create `clipboard.ts` utilities for serialize/deserialize
2. Implement `remapLayerIds` for recursive ID regeneration
3. Add internal clipboard state (JSON format in memory)
4. Create `pasteLayersCommand` with 20px offset from original position
5. Handle group pasting (recursive children with new IDs)

**Key Pattern from Polotno**: Store full layer tree in JSON with metadata (original bounds) for smart paste positioning.

### Phase 4: Alignment & Distribution Tools
**Inspired by**: Figma's alignment panel, PowerPoint's distribute functions
**Goal**: Precise multi-layer arrangement tools

1. Implement alignment algorithms (6 modes: left, center-h, right, top, center-v, bottom)
2. Implement distribution algorithms (2 modes: horizontal, vertical)
3. Add `AlignmentToolbar` component in PropertiesPanel
4. Create `batchTranslateCommand` for atomic alignment operations
5. Add artboard vs selection alignment toggle

**Key Pattern from Figma**: Compute all offsets first, then apply as single batch command for atomic undo.


### Phase 5: Contextual Menus
**Inspired by**: Excalidraw's context menu, Penpot's right-click actions
**Goal**: Quick access to common operations via right-click

1. Create `ContextMenu` component with portal rendering
2. Implement `useContextMenu` hook for state + positioning
3. Add context detection: layer vs multi-select vs empty canvas vs locked layer
4. Menu composition functions returning enabled/disabled items
5. Integration: right-click handlers in CreativeStudio and SelectionOverlay

**Key Pattern from Excalidraw**: Compose menu items from context functions, render in portal to body for clean z-index.

### Phase 6: Smart Guides & Enhanced Snapping
**Inspired by**: Figma's smart guides, Sketch's alignment indicators
**Goal**: Visual alignment feedback during drag/resize

1. Create `SmartGuides` component with SVG line rendering
2. Extend snapping.ts with guide computation algorithm
3. Integrate guide rendering into SelectionOverlay drag handlers
4. Show multiple simultaneous guides (center + edges)
5. Cmd/Ctrl to temporarily disable snapping

**Key Pattern from Figma**: Compute guides from all layers + artboard edges, show magenta lines across full artboard.

### Phase 7: Group & Ungroup Operations
**Inspired by**: Penpot's group handling, Figma's nested groups
**Goal**: Organize layers into hierarchical groups

1. Extend existing `groupCommand` to support multi-selection
2. Create `ungroupCommand` to dissolve groups
3. Add group isolation mode (double-click group shows only children)
4. Breadcrumb navigation to exit isolation
5. Handle transform preservation during group/ungroup

**Key Pattern from Penpot**: Store absolute transforms on children, recalculate relative positions on group creation.

### Phase 8: Marquee Selection
**Inspired by**: tldraw's marquee, Photoshop's selection rectangle
**Goal**: Rubber-band drag to select multiple layers

1. Add marquee state to useCanvasDrag hook
2. Render selection rectangle in SelectionOverlay
3. Implement intersection testing: layer bounds vs marquee bounds
4. Handle viewport transform (screen coords → canvas coords)
5. Select all enclosed layers on release

**Key Pattern from tldraw**: Use screen-space rectangle during drag, transform to canvas space for hit testing.

### Phase 9: Grid & Ruler Overlays
**Inspired by**: Figma's layout grid, Photoshop's rulers
**Goal**: Measurement and alignment aids

1. Create `GridOverlay` with SVG pattern rendering
2. Adaptive grid spacing based on zoom level
3. Create `RulerOverlay` with Canvas 2D rendering
4. Show tick marks every 10px, labels every 50px
5. Enable/disable toggles in TopBar or BottomPanel

**Key Pattern from Figma**: Use SVG `<pattern>` for efficient grid rendering, update on zoom change only.


### Phase 10: Performance Optimizations
**Inspired by**: tldraw's rendering optimizations, React Flow's culling
**Goal**: Maintain 60 FPS with 100+ layers

1. Implement `useVisibilityCulling` to skip off-screen layers
2. Add debouncing for text input (300ms) and selection updates (16ms)
3. Ensure GPU acceleration: `will-change: transform` on layer groups
4. Add performance monitoring: warn if frame drops detected
5. Consider virtual scrolling for layer panel with 100+ items

**Key Pattern from tldraw**: Cull rendering outside viewport, use RAF batching for updates, GPU transforms for all interactions.

### Phase 11: Text Formatting Enhancements
**Inspired by**: Lexical's rich text, Canva's text editor
**Goal**: Professional text editing with formatting toolbar

1. Create `TextFormattingToolbar` floating component
2. Extend `TextLayer` model with bold, italic, underline, color
3. Show toolbar on text selection (not just layer selection)
4. Apply formats via `setPropertyCommand`
5. For v1: format entire text layer (no character-level spans)

**Key Pattern from Canva**: Float toolbar above selection, apply to whole layer initially, plan for `<tspan>` in future.

### Phase 12: Visual Feedback System
**Inspired by**: VS Code's notification system, Figma's status toasts
**Goal**: Clear action feedback without being intrusive

1. Create `Toast` component with auto-dismiss (2s default)
2. Implement `useToast` hook for showing/dismissing
3. Show toasts on: undo/redo, copy/paste/cut, group/ungroup, errors
4. Create `AngleIndicator` component for rotation feedback
5. Add loading states for async operations (export, save)

**Key Pattern from VS Code**: Queue toasts, auto-dismiss, show most recent on top, limit to 3 visible.

### Phase 13: Accessibility Improvements
**Inspired by**: Radix UI's accessibility patterns, Gov.uk design system
**Goal**: Keyboard navigation and screen reader support

1. Add visible focus indicators on canvas elements
2. Implement Tab/Shift+Tab to cycle through layers
3. Add ARIA labels to all interactive elements
4. Trap focus in modals and context menus
5. Announce selection changes to screen readers

**Key Pattern from Radix UI**: Use roving tabindex for layer navigation, aria-live regions for announcements.


## Technical Decisions & Rationale

### Why Internal Clipboard vs System Clipboard?
**Decision**: Use internal clipboard (in-memory) for copy/paste.

**Rationale**:
- System Clipboard API is async and has browser inconsistencies
- Complex layer trees with nested groups need custom serialization
- Internal clipboard gives instant paste without async delays
- Can add system clipboard sync as future enhancement

**Precedent**: Figma, Excalidraw both use internal clipboard for design elements.

### Why Batch Commands vs Individual Commands?
**Decision**: Alignment, distribution, and multi-layer operations use batch commands.

**Rationale**:
- User expects single undo step for "Align Left" on 5 layers
- Prevents history pollution (5 layers = 1 command, not 5)
- Atomic operations: all layers move together or none
- Simpler undo/redo mental model

**Precedent**: All professional tools (Figma, Photoshop, Illustrator) batch multi-object operations.

### Why DOM-Direct Transforms During Drag?
**Decision**: Apply CSS transforms directly to SVG groups during drag, commit to Document Model on release.

**Rationale**:
- React re-render on every mousemove = 10-30 FPS (stuttering)
- Direct DOM manipulation = 60 FPS (smooth)
- Pattern already proven in useCanvasDrag refactor
- Single commit on pointerup preserves history simplicity

**Precedent**: tldraw, Excalidraw, Figma all use direct DOM manipulation for drag performance.

### Why SVG for Guides vs Canvas?
**Decision**: Render smart guides as SVG `<line>` elements.

**Rationale**:
- Scales with viewport zoom automatically
- vector-effect="non-scaling-stroke" keeps 1px width at all zooms
- Simpler integration with existing SVG canvas
- No need for separate Canvas 2D context

**Precedent**: Figma, Sketch use SVG overlays for guides.

### Why Pattern-Based Grid vs Line-by-Line?
**Decision**: Use SVG `<pattern>` with single rect fill for grid.

**Rationale**:
- Rendering 100+ individual lines is expensive
- Pattern is GPU-accelerated and cached by browser
- Automatic tiling across viewport
- Update pattern definition once per zoom change

**Precedent**: Figma, Framer use pattern-based grids for performance.


## Testing Strategy

### Unit Tests
**Files to test**:
- `alignment.ts`: Alignment/distribution algorithms with property-based tests
- `clipboard.ts`: Serialize/deserialize round-trip tests
- `bounds.ts`: Bounding box computation edge cases
- `snapping.ts`: Guide computation with various layer configurations
- All command files: apply/undo round-trip properties

**Pattern**: Use Vitest with property-based testing (fast-check) for math-heavy utilities.

### Integration Tests
**Scenarios**:
1. Multi-selection: Click layer → Shift+Click another → verify both selected
2. Marquee: Drag empty canvas → verify layers inside rectangle are selected
3. Alignment: Select 3 layers → click Align Left → verify all aligned
4. Copy/Paste: Select layer → Cmd+C → Cmd+V → verify new layer with offset
5. Keyboard shortcuts: Press Cmd+G → verify group created

**Pattern**: Use React Testing Library with user-event for realistic interaction simulation.

### Visual Regression Tests
**Critical UI**:
- ContextMenu positioning at various screen positions
- SmartGuides rendering during drag
- SelectionOverlay handles for multi-selection
- GridOverlay at different zoom levels
- RulerOverlay tick marks and labels

**Pattern**: Use Playwright for visual snapshots, compare against baseline images.

### Performance Tests
**Benchmarks**:
- Drag performance with 100+ layers (measure FPS)
- Selection change latency (measure time from click to visual update)
- Undo/redo performance (measure Document Model update time)
- Grid rendering at various zoom levels

**Pattern**: Use browser DevTools Performance API, log warnings if below 60 FPS target.

## Migration & Rollout Plan

### Stage 1: Foundation (No User-Facing Changes)
- Add new types to documentModel.ts (SelectionSet, clipboard types)
- Create utility files (alignment.ts, clipboard.ts, bounds.ts)
- Add new command files
- Add unit tests for all utilities
- **Risk**: None (no user impact)

### Stage 2: Multi-Selection (Opt-In)
- Implement useMultiSelection hook
- Update SelectionOverlay for multi-selection bounding box
- Add Shift+Click support
- **Risk**: Low (additive only, single-selection still works)

### Stage 3: Keyboard Shortcuts (Gradual Rollout)
- Add useKeyboardShortcuts hook
- Enable core shortcuts: Cmd+Z/Y (already works), Cmd+C/V/X, Delete
- Add toast notifications for feedback
- **Risk**: Medium (may conflict with browser shortcuts, test thoroughly)


### Stage 4: Visual Enhancements (Parallel Development)
- Add ContextMenu component (render on right-click)
- Add SmartGuides rendering (integrate with existing snapping)
- Add GridOverlay and RulerOverlay (toggle in settings)
- Add AngleIndicator to rotation handles
- **Risk**: Low (visual-only, no behavioral changes)

### Stage 5: Advanced Features (Feature Flagged)
- Enable alignment/distribution tools in PropertiesPanel
- Enable group/ungroup operations (Cmd+G, Cmd+Shift+G)
- Enable marquee selection (drag empty canvas)
- **Risk**: Medium (complex interactions, needs extensive testing)

### Stage 6: Performance Optimizations (Monitoring Required)
- Add visibility culling
- Add performance monitoring and warnings
- Optimize layer panel rendering for 100+ layers
- **Risk**: Low (improves performance, no functional changes)

## Success Metrics

### Performance Metrics
- **60 FPS target**: Maintain during drag, zoom, pan with 100 layers
- **50ms undo/redo**: Complete history operation in <50ms
- **Instant selection**: Selection change visible in <16ms (1 frame)

### Usability Metrics
- **Keyboard coverage**: 90% of common operations accessible via shortcuts
- **Discovery**: Context menu usage >30% of edit operations
- **Efficiency**: Multi-selection usage >40% of alignments

### Stability Metrics
- **Zero data loss**: Copy/paste round-trip preserves all properties
- **Zero undo failures**: All commands have perfect undo/redo
- **Zero crashes**: No uncaught exceptions during normal use

## Open Questions & Future Work

### Open Questions
1. **Rich text spans**: Support character-level formatting in text layers?
   - **Decision Needed**: v1 = whole layer only, v2 = add `<tspan>` support
   
2. **External clipboard**: Sync with system clipboard for cross-app paste?
   - **Decision Needed**: v1 = internal only, v2 = explore Clipboard API

3. **Layer panel virtualization**: Needed for 100+ layers?
   - **Decision Needed**: Implement if testing shows scroll lag

### Future Enhancements
- **Blend modes and effects** (Requirement 18): CSS mix-blend-mode, SVG filters
- **Import/export** (Requirement 19): SVG/PNG/PDF export with quality settings
- **Responsive UI** (Requirement 20): Mobile layout, touch gestures
- **History panel**: Selective undo like Photoshop's History panel
- **Layer search**: Filter layers by name/type in large documents
- **Smart selection**: Double-click text to select, Alt+drag to duplicate


## References & Inspiration

### Primary References
1. **tldraw** (https://github.com/tldraw/tldraw)
   - Multi-selection architecture
   - Marquee selection implementation
   - Performance optimization patterns

2. **Excalidraw** (https://github.com/excalidraw/excalidraw)
   - Context menu system
   - Keyboard shortcut registry
   - Collaborative editing patterns

3. **Penpot** (https://github.com/penpot/penpot)
   - Group/ungroup operations
   - Layer hierarchy management
   - SVG manipulation techniques

4. **Polotno Studio** (https://github.com/polotno-project/polotno-studio)
   - Clipboard serialization
   - Template system architecture
   - Asset management

5. **miniPaint** (https://github.com/viliusle/miniPaint)
   - Tool state machine patterns
   - Layer effects implementation
   - History system design

### Key Patterns Adopted

#### From tldraw
```typescript
// Selection bounds computation
const bounds = computed(() => {
  return selectedLayers.reduce((acc, layer) => {
    return unionBounds(acc, getLayerBounds(layer));
  }, null);
});
```

#### From Excalidraw
```typescript
// Context menu composition
function getContextMenuItems(selection, clipboard) {
  return [
    { label: "Cut", action: cut, enabled: selection.length > 0 },
    { label: "Copy", action: copy, enabled: selection.length > 0 },
    { label: "Paste", action: paste, enabled: clipboard !== null },
    // ...
  ];
}
```

#### From Penpot
```typescript
// Group transform preservation
function groupLayers(layers) {
  const groupBounds = getSelectionBounds(layers);
  return {
    kind: "group",
    children: layers.map(layer => ({
      ...layer,
      x: layer.x - groupBounds.x,  // Relative to group
      y: layer.y - groupBounds.y,
    })),
  };
}
```

#### From miniPaint
```typescript
// Tool state machine
type DragState = 
  | { type: "idle" }
  | { type: "pending", origin: Point }
  | { type: "dragging", offset: Point };
```

## Conclusion

This design provides a comprehensive architecture for enhancing the Creative Studio canvas to professional-tool standards while maintaining the existing codebase's principles:

- **Extend, never rewrite**: All new features build on existing infrastructure
- **Performance first**: 60 FPS guaranteed through DOM-direct transforms and GPU acceleration
- **Undo/redo integrity**: Every operation is a reversible command
- **Progressive enhancement**: Features can be rolled out incrementally
- **Best-practice patterns**: Inspired by proven open-source editors

The phased implementation approach allows for continuous testing and validation, ensuring each capability works reliably before moving to the next.

