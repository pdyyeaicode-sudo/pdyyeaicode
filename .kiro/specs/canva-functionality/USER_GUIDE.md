# Canvas Editor - User Guide

## ✅ What Works Now

### 1. **Action Buttons (NO KEYBOARD SHORTCUTS NEEDED!)**

All actions are now available as **visible buttons** in the Properties Panel on the right side:

#### Undo/Redo
- **↶ Undo** - Click to undo last action
- **↷ Redo** - Click to redo last action

#### Clipboard Actions
- **📋 Copy** - Copy selected layers
- **✂️ Cut** - Cut selected layers
- **📄 Paste** - Paste from clipboard
- **⎘ Duplicate** - Duplicate selected layers
- **🗑️ Delete** - Delete selected layers

#### Layer Order
- **⬆ Forward** - Bring layer forward
- **⬇ Backward** - Send layer backward

#### Group Actions (appears when 2+ layers selected)
- **🔗 Group** - Group selected layers together
- **⛓️‍💥 Ungroup** - Ungroup selected group

---

## 🎨 How to Draw Shapes (Like PowerPoint)

### Step 1: Click Shape Tool
On the **left toolbar**, click any shape button:
- **Rectangle** (square icon)
- **Circle** (circle icon)
- **Line** (line icon)
- **Triangle** (polygon icon)

### Step 2: Draw on Canvas
1. Your cursor will change to a **crosshair** ➕
2. Click and drag on the canvas to draw the shape
3. Release mouse to create the shape
4. The tool automatically switches back to **Select** mode

### Current Status
The shape drawing system is set up with:
- ✅ Tool buttons in toolbar
- ✅ Drawing hook (`useShapeDrawing.ts`)
- ✅ Real-time preview
- ⚠️ **Integration pending** - needs to be connected to CenterStage

---

## 📝 How to Add and Format Text

### Adding Text
1. Click **"Add Text"** button in the Assets panel (left sidebar)
2. Text layer appears in the center
3. Double-click text to edit

### Formatting Text
When text is selected, a **formatting toolbar** appears with:

#### Font Selection
- **Dropdown menu** with 16 professional fonts
- **+Font button** to add your own custom fonts

#### Custom Fonts (Like PowerPoint)
1. Click **"+Font"** button
2. Type the font name (e.g., "Pacifico", "Lobster", "Your Custom Font")
3. Click **✓** to apply
4. Font can be:
   - Google Fonts (just type the name)
   - System fonts (Arial, Times New Roman, etc.)
   - Custom uploaded fonts (if you loaded them via CSS)

#### Text Styling
- **Font Size** - Dropdown with sizes from 8px to 128px
- **B** - Bold text
- **I** - Italic text
- **U** - Underline text
- **Color Picker** - Change text color

---

## 🎯 Multi-Selection

### Select Multiple Layers
1. Click first layer
2. **Shift+Click** other layers to add them
3. OR Click **"Select All"** (upcoming button)

### What You Can Do
- **Align** layers (left, center, right, top, middle, bottom)
- **Distribute** layers evenly
- **Group** layers together
- **Copy/Paste/Delete** all at once

---

## 🔧 What Needs to Be Fixed

### Priority 1: Make Shape Drawing Work
**Problem**: When you click rectangle/circle/etc, shapes don't draw on canvas yet.

**Solution Needed**:
1. Connect `useShapeDrawing` hook to CenterStage
2. Add shape preview overlay
3. Create shape layer on mouse release
4. Switch back to select tool automatically

**Files to Update**:
- `CenterStage.tsx` - Add drawing mode detection
- `CreativeStudio.tsx` - Pass active tool to CenterStage
- Wire up `studio.addShapeLayer()` to drawing system

### Priority 2: Add More Visible Buttons

**Buttons to Add**:
- ✅ Copy/Paste/Delete (DONE)
- ✅ Undo/Redo (DONE)
- ⚠️ Select All (needs button in toolbar)
- ⚠️ Zoom In/Out (needs buttons in bottom panel)
- ⚠️ Fit to Screen (needs button)
- ⚠️ Align buttons (already in multi-selection panel)

### Priority 3: Text Improvements

**What Works**:
- ✅ 16 predefined fonts
- ✅ Custom font import
- ✅ Bold/Italic/Underline
- ✅ Color picker
- ✅ Font size selection

**What's Needed**:
- Integration into the editor (show toolbar when text selected)
- Auto-focus when text layer created
- Better positioning of toolbar

---

## 📋 Implementation Status

### ✅ Completed
- Action buttons (no keyboard shortcuts needed)
- Multi-selection with Shift+Click
- Copy/Paste/Duplicate with buttons
- Undo/Redo with buttons
- Alignment and distribution tools
- Text formatting toolbar with custom fonts
- Performance optimizations

### ⚠️ Needs Integration
- Shape drawing (hook ready, needs connection)
- Text formatting toolbar (component ready, needs integration)
- Select All button (functionality works, needs visible button)
- Zoom controls (functionality exists, needs visible buttons)

### 🔄 In Progress
- Making shapes drawable on canvas (like PowerPoint)
- Adding all visible UI buttons
- Removing reliance on keyboard shortcuts

---

## 🎯 Design Philosophy

**For Beginners**:
- Every action has a **visible button**
- No hidden keyboard shortcuts required
- PowerPoint-like experience
- Click button → do action
- Clear visual feedback

**For Advanced Users**:
- Keyboard shortcuts still work (optional)
- Fast multi-selection with Shift+Click
- Professional alignment tools
- Batch operations

---

## 🚀 Next Steps

1. **Fix Shape Drawing** (highest priority)
   - Make shapes actually draw on canvas
   - PowerPoint-like click-and-drag experience
   - Tool auto-switches after drawing

2. **Add All Visible Buttons**
   - Select All button
   - Zoom In/Out buttons
   - Fit to Screen button
   - Make everything clickable

3. **Test with Beginners**
   - Can they add shapes without help?
   - Can they format text easily?
   - Are all actions discoverable?

---

## 📝 For Developers

### Shape Drawing Integration Checklist

```tsx
// In CenterStage.tsx or CreativeStudio.tsx:

const [drawingMode, setDrawingMode] = useState<ShapeType | null>(null);

// When tool changes:
if (activeTool === 'rect') setDrawingMode('rectangle');
if (activeTool === 'ellipse') setDrawingMode('circle');
// etc.

// Use the hook:
const drawingState = useShapeDrawing({
  enabled: drawingMode !== null,
  shapeType: drawingMode,
  onShapeDrawn: (shape) => {
    // Create the layer
    studio.addShapeLayer(shape.type);
    // Switch back to select
    setActiveTool('select');
    setDrawingMode(null);
  },
  containerRef: canvasContainerRef,
});

// Show preview:
{drawingState.isDrawing && (
  <svg style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none'}}>
    <path
      d={getShapePreviewPath(drawingState)}
      stroke="#4A90E2"
      strokeWidth="2"
      fill="rgba(74, 144, 226, 0.1)"
      strokeDasharray="5,5"
    />
  </svg>
)}
```

### Text Toolbar Integration

```tsx
// When text layer is active and being edited:
const [showTextToolbar, setShowTextToolbar] = useState(false);

{showTextToolbar && textLayer && (
  <TextFormattingToolbar
    layer={textLayer}
    dispatchCommand={dispatchCommand}
    bounds={textLayerBounds}
    onClose={() => setShowTextToolbar(false)}
  />
)}
```

---

**Last Updated**: 2024-07-12  
**Status**: Action buttons complete, shape drawing needs integration  
**Focus**: No keyboard shortcuts - everything must be clickable!
