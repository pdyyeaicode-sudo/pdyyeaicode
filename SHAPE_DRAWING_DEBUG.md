# Shape Drawing Debug Guide

## Problem
User reports that clicking shape buttons in the left ToolRail does nothing - buttons appear non-clickable.

## Debug Steps Added

I've added console logging to help trace the issue. Open your browser's Developer Console (F12) and follow these steps:

### 1. Check if ToolRail clicks are registered
**What to do**: Click any shape button (Rectangle, Circle, Line, Triangle) in the left toolbar

**Expected console output**:
```
[CreativeStudio] Tool changed to: rect
[CreativeStudio] Drawing mode activated: rect
```

**If you DON'T see this**: The click handler in ToolRail is not working. Check:
- Is there an overlay covering the buttons?
- Are the buttons rendering at all?
- Is there a CSS `pointer-events: none` somewhere?

### 2. Check if CenterStage receives the tool change
**Expected console output after clicking Rectangle**:
```
[CenterStage] activeTool changed to: rect
[CenterStage] Setting drawing mode: rectangle
[CenterStage] Drawing state: { enabled: true, shapeType: "rectangle", isDrawing: false }
```

**If you DON'T see this**: The activeTool prop is not being passed correctly from CreativeStudio to CenterStage.

### 3. Check if drawing events are captured
**What to do**: Click and drag on the canvas area (center stage)

**Expected console output**:
```
[CenterStage] Drawing state: { enabled: true, shapeType: "rectangle", isDrawing: true }
```

**When you release the mouse**:
```
[CenterStage] Shape drawn: { type: "rectangle", x: 100, y: 100, width: 200, height: 150 }
```

**If you DON'T see drawing events**: The useShapeDrawing hook is not attaching event listeners properly.

## Common Issues

### Issue 1: Buttons are covered by another element
**Symptom**: No console logs at all when clicking buttons
**Fix**: Check for overlapping divs with higher z-index

### Issue 2: Click handlers not connected
**Symptom**: Buttons change visual state but no console logs
**Fix**: Verify ToolRail onSelectTool is called

### Issue 3: Drawing disabled on canvas
**Symptom**: Console shows drawing mode activated but can't draw
**Fix**: Check if containerRef is pointing to the correct element

### Issue 4: Event listeners not attached
**Symptom**: Drawing mode active but no pointer events captured
**Fix**: Check useShapeDrawing hook's useEffect dependencies

## Manual Testing Checklist

Run through this checklist and report which step fails:

- [ ] Open the app in browser
- [ ] Open Developer Console (F12)
- [ ] Click on Rectangle button in left toolbar
- [ ] See "[CreativeStudio] Tool changed to: rect" in console?
- [ ] See "[CenterStage] activeTool changed to: rect" in console?
- [ ] See "[CenterStage] Setting drawing mode: rectangle" in console?
- [ ] Cursor changes to crosshair when hovering canvas?
- [ ] Click and drag on canvas creates blue preview?
- [ ] Release mouse creates the rectangle?
- [ ] Tool switches back to Select automatically?

## Expected Full Console Output (Success Case)

```
[CreativeStudio] Tool changed to: rect
[CreativeStudio] Drawing mode activated: rect
[CenterStage] activeTool changed to: rect
[CenterStage] Setting drawing mode: rectangle
[CenterStage] Drawing state: { enabled: true, shapeType: "rectangle", isDrawing: false }
[CenterStage] Drawing state: { enabled: true, shapeType: "rectangle", isDrawing: true }
[CenterStage] Shape drawn: { type: "rectangle", x: 150, y: 200, width: 300, height: 200 }
[CreativeStudio] Tool changed to: select
[CenterStage] activeTool changed to: select
[CenterStage] Clearing drawing mode
[CenterStage] Drawing state: { enabled: false, shapeType: null, isDrawing: false }
```

## Next Steps Based on Console Output

**If you see NO logs at all**:
- Problem is with ToolRail rendering or click capture
- Check browser console for React errors
- Verify CreativeStudio component is mounted

**If you see CreativeStudio logs but not CenterStage logs**:
- Problem is with prop passing
- Check that CenterStage receives `activeTool` prop
- Verify prop name matches exactly

**If you see all logs but cursor doesn't change**:
- Problem is with useShapeDrawing hook
- Check that containerRef is set correctly
- Verify CSS cursor styling isn't being overridden

**If cursor changes but can't draw**:
- Problem is with pointer event capture
- Check if another element is capturing pointer events
- Verify z-index of canvas vs overlays

## Files Modified with Debug Logs

1. `frontend/src/editor/CreativeStudio.tsx` - handleToolChange function
2. `frontend/src/editor/CenterStage.tsx` - activeTool useEffect and drawingState

These debug logs can be removed once the issue is identified and fixed.
