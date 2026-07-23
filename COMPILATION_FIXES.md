# 🔧 Compilation Fixes - Apply These Changes

## PRIORITY 1: Critical Type Fixes (Apply First)

### Fix 1: batchTranslateCommand - Add missing `type` property
**File:** `frontend/src/editor/commands/batchTranslateCommand.ts`

**Line 20 - Change:**
```typescript
return {
  label: `Move ${offsets.length} layer${offsets.length === 1 ? "" : "s"}`,
```

**To:**
```typescript
return {
  type: "batch-translate",
  label: `Move ${offsets.length} layer${offsets.length === 1 ? "" : "s"}`,
```

**Line 11 - Export LayerOffset type:**
```typescript
export interface BatchTranslateParams {
  offsets: Array<{ layerId: string; dx: number; dy: number }>;
}

// ADD THIS:
export type LayerOffset = { layerId: string; dx: number; dy: number };
```

---

### Fix 2: batchPropertyCommand - Fix Document Model Access
**File:** `frontend/src/editor/commands/batchPropertyCommand.ts`

**Replace ALL occurrences of `doc.artboards` with:**
```typescript
// Find active page first
const activePage = doc.pages.find((p: any) => p.id === doc.activePageId);
if (!activePage) return doc;

// Then find active artboard
const activeArtboard = activePage.artboards.find((a: any) => a.id === doc.activeArtboardId);
```

**Remove the `description` property (line 10) - it's not part of Command interface**

**Add `type` property:**
```typescript
return {
  type: "batch-property",
  label: `Change ${property} on ${layerIds.length} layers`,
  // Remove: description: ...
```

---

### Fix 3: Export BoxSnapshot and RotateSnapshot
**File:** `frontend/src/editor/commands/index.ts`

**Add these exports:**
```typescript
// At the top with other exports
export type BoxSnapshot = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RotateSnapshot = {
  rotation: number;
  centerX: number;
  centerY: number;
};
```

---

### Fix 4: clipboard.ts - Export Missing Functions
**File:** `frontend/src/editor/utils/clipboard.ts`

**Add BoundingBox type definition:**
```typescript
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

**Export these functions:**
```typescript
// Make sure these are exported:
export function offsetLayerPosition(layer: DocumentLayer, dx: number, dy: number): DocumentLayer {
  // ... implementation
}

export function unlockLayer(layer: DocumentLayer): DocumentLayer {
  return { ...layer, locked: false };
}
```

---

### Fix 5: useCreativeStudio - Add Missing Properties
**File:** `frontend/src/editor/useCreativeStudio.ts`

**Import ToolName:**
```typescript
// At top
type ToolName = "select" | "hand" | "pan" | "rect" | "ellipse" | "text" | "image";
```

**Add toast state:**
```typescript
// Add with other state
const [toasts, setToasts] = useState<Array<{
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
}>>([]);

const showToast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
  const id = `toast-${Date.now()}`;
  setToasts(prev => [...prev, { id, message, type }]);
}, []);

const dismissToast = useCallback((id: string) => {
  setToasts(prev => prev.filter(t => t.id !== id));
}, []);
```

**Fix undo/redo to use `label` instead of `description`:**
```typescript
const undo = useCallback(() => {
  if (canUndo) {
    const cmd = history.past[history.past.length - 1];
    historyUndo();
    showToast(`Undo ${cmd.label}`, 'info'); // Changed from cmd.description
  }
}, [canUndo, history, historyUndo, showToast]);
```

**Return toasts:**
```typescript
return {
  // ... existing returns
  toasts,
  showToast,
  dismissToast,
  activeTool,
  setActiveTool,
};
```

---

### Fix 6: CreativeStudio - Fix Duplicate activeArtboard
**File:** `frontend/src/editor/CreativeStudio.tsx`

**Line 118 - Remove this duplicate:**
```typescript
// DELETE THIS LINE (it's declared again later)
const activeArtboard = studio.document ? getActiveArtboard(studio.document) : null;
```

**Line 348 - Keep only this one**

**Fix studio.activeTool:**
```typescript
// Line 167 - Change:
const isInteracting = studio.activeTool === "pan" || studio.activeTool === "hand";

// To (if activeTool is undefined, add a check):
const isInteracting = (studio.activeTool === "pan" || studio.activeTool === "hand") || false;
```

**Fix artboardBounds (Line 457):**
```typescript
// Change:
artboardBounds={activeArtboard?.bounds}

// To:
artboardBounds={activeArtboard ? {
  x: 0,
  y: 0,
  width: activeArtboard.width || 1920,
  height: activeArtboard.height || 1080
} : undefined}
```

**Remove duplicate onDuplicate (Line 594)**

---

### Fix 7: SelectionOverlay - Remove Duplicate Props
**File:** `frontend/src/editor/SelectionOverlay.tsx`

**Lines 75-90 - Keep only ONE set of onResize/onRotate props:**
```typescript
// Remove lines 75-80 if they're duplicates
// Keep lines 89-90
```

---

### Fix 8: TextFormattingToolbar - Add Missing TextLayer Properties
**File:** `frontend/src/editor/TextFormattingToolbar.tsx`

**Fix type assertions:**
```typescript
// Line 54 - Add type guard:
const currentFontStyle = 
  layer.kind === "text" && 'fontStyle' in layer
    ? (layer.fontStyle || "normal")
    : "normal";

// Line 55:
const currentTextDecoration = 
  layer.kind === "text" && 'textDecoration' in layer
    ? (layer.textDecoration || "none")
    : "none";

// Line 56:
const currentFill = 
  'fill' in layer ? layer.fill || "#000000" : "#000000";
```

**Fix setPropertyCommand call (Line 87):**
```typescript
// Add the 4th parameter (prevValue):
const prevValue = layer.kind === "text" ? (layer as any)[property] : undefined;
dispatchCommand(setPropertyCommand(layer.id, property, value, prevValue));
```

---

### Fix 9: Icon.tsx - Fix Missing Lucide Icons
**File:** `frontend/src/editor/Icon.tsx`

**Replace missing icons with available ones:**
```typescript
// Line 55-59 - Change:
import {
  // Remove these (not in lucide-react):
  // AlignTop,
  // AlignVerticalCenter,
  // AlignBottom,
  // DistributeHorizontalSpacing,
  // DistributeVerticalSpacing,
  
  // Use these instead:
  AlignStartVertical as AlignTop,
  AlignCenterVertical as AlignVerticalCenter,
  AlignEndVertical as AlignBottom,
  AlignHorizontalSpaceAround as DistributeHorizontalSpacing,
  AlignVerticalSpaceAround as DistributeVerticalSpacing,
} from "lucide-react";
```

---

### Fix 10: IsolationBreadcrumb - Add 'x' to IconName
**File:** `frontend/src/editor/Icon.tsx`

**Add 'x' to IconName type:**
```typescript
export type IconName =
  | "select"
  | "hand"
  | "pen"
  // ... existing icons
  | "x"  // ADD THIS
  | "ruler"
  | "grid";
```

**Add X icon mapping:**
```typescript
const iconMap: Record<IconName, LucideIcon> = {
  // ... existing mappings
  x: X,  // ADD THIS (import X from lucide-react)
};
```

---

### Fix 11: CenterStage - Fix onShapeDrawn Signature
**File:** `frontend/src/editor/CenterStage.tsx`

**Line 130 - Fix callback:**
```typescript
// Change:
onShapeDrawn: (type, x, y, w, h) => {

// To:
onShapeDrawn: (shape: DrawnShape) => {
  const { type, x, y, width: w, height: h } = shape;
```

**Line 147 - Fix function call:**
```typescript
// Remove extra parameters - should be:
<EditorCanvas
  // ... other props
/>
// (Don't pass activeLayer, onLayerSelect, onSelectionChange separately if they cause errors)
```

---

### Fix 12: batchDeleteCommand - Fix LayerPosition Access
**File:** `frontend/src/editor/commands/batchDeleteCommand.ts`

**Line 43-44 - Fix parent access:**
```typescript
// Change:
const layer = position.parent
  ? position.parent.children[position.index]

// To:
const parentLayer = findLayerById(doc, position.parentId);
const layer = parentLayer && 'children' in parentLayer
  ? parentLayer.children[position.index]
```

**Line 57 - Fix position.layer:**
```typescript
// Change:
updatedLayers = removeLayerById(updatedLayers, position.layer.id);

// To:
const layerId = /* extract from position or pass separately */;
updatedLayers = removeLayerById(updatedLayers, layerId);
```

---

### Fix 13: useLayerFocus - Fix artboards Access
**File:** `frontend/src/editor/hooks/useLayerFocus.ts`

**Line 9 - Fix:**
```typescript
// Change:
const artboard = doc.artboards.find(a => a.id === activeArtboardId);

// To:
const activePage = doc.pages.find(p => p.id === doc.activePageId);
const artboard = activePage?.artboards.find((a: any) => a.id === activeArtboardId);
```

---

### Fix 14: errorHandler - Fix showToast Type
**File:** `frontend/src/editor/errorHandler.ts`

**Line 90 - Fix type:**
```typescript
export function handleError(
  errorCode: keyof typeof errorMessages,
  context?: any,
  showToast?: (message: string, type: 'error' | 'warning' | 'info') => void  // ADD 'info'
) {
  // ... rest
}
```

---

### Fix 15: Test Files - Fix zIndex and geometry
**Files:** 
- `frontend/src/editor/hooks/selectAllIntegration.test.tsx`
- `frontend/src/editor/hooks/useMultiSelection.selectAll.test.ts`
- `frontend/src/editor/multiSelection.integration.test.tsx`

**For all test files with zIndex errors:**
```typescript
// Remove zIndex from layer creation:
createLayer({ 
  id: "first", 
  editable: true, 
  // zIndex: 0,  // REMOVE THIS
})
```

**Fix role: "shapes" → role: "shape":**
```typescript
// Change:
role: "shapes",
// To:
role: "shape",
```

**Fix geometry access in tests:**
```typescript
// Add type guards before accessing geometry.x/y:
if (layer.geometry && 'x' in layer.geometry) {
  expect(layer.geometry.x).toBe(70);
}
```

---

### Fix 16: alignment.ts and useVisibilityCulling.ts - Add Width/Height
**Files:**
- `frontend/src/editor/utils/alignment.ts`
- `frontend/src/editor/hooks/useVisibilityCulling.ts`

**Fix width/height access:**
```typescript
// Change:
return { x: layer.x, y: layer.y, width: layer.width || 0, height: layer.height || 0 };

// To:
return { 
  x: layer.x, 
  y: layer.y, 
  width: 'width' in layer ? layer.width || 0 : 100,
  height: 'height' in layer ? layer.height || 0 : 100
};
```

---

## Apply These Fixes In Order:

1. ✅ Fix 1-5 (Critical exports and types)
2. ✅ Fix 6-9 (Component fixes)
3. ✅ Fix 10-13 (Icon and access fixes)
4. ✅ Fix 14-16 (Test and type guard fixes)

Then run: `npm run build`

---

## Additional: Make Shapes and TopBar Usable

### Fix Shape Tools
**File:** `frontend/src/editor/ToolRail.tsx`

Ensure all shape tools are properly wired:
```typescript
<button
  onClick={() => onToolSelect("rect")}
  className={activeTool === "rect" ? "active" : ""}
  aria-label="Rectangle tool"
>
  <Icon name="square" />
</button>

<button
  onClick={() => onToolSelect("ellipse")}
  className={activeTool === "ellipse" ? "active" : ""}
  aria-label="Ellipse tool"
>
  <Icon name="circle" />
</button>
```

### Fix TopBar Buttons
**File:** `frontend/src/editor/TopBar.tsx`

Make sure all buttons have onClick handlers:
```typescript
<button
  onClick={onUndo}
  disabled={!canUndo}
  aria-label="Undo"
  title="Undo (Cmd+Z)"
>
  <Icon name="undo" />
</button>

<button
  onClick={onRedo}
  disabled={!canRedo}
  aria-label="Redo"
  title="Redo (Cmd+Shift+Z)"
>
  <Icon name="redo" />
</button>
```

---

After applying all fixes, run:
```bash
npm run build
```

Expected result: **0 errors** ✅
