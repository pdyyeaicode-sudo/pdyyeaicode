

## Pen Tool and Path Updates
* 2026-07-22 11:51:19.519779
* The Pen Tool now correctly implements point-to-point drawing, snapping and closing the path to a shape when clicking on the initial point.
* Paths drawn via the Pen tool or SVG shapes can now be dragged, moved, and selected correctly by calculating bounding boxes from their `d` paths.

### Changes Made:
1. **propertyEditing.ts**: Added `getPathBoundingBox()` to convert SVG paths into bounding boxes.
2. **usePenTool.ts**: Created the new `usePenTool` React Hook wrapper around the existing `penTool.ts` functional tool.
3. **CenterStage.tsx & PydreeStudio.tsx**: Wired up `usePenTool` to the pen tool state to correctly emit path generation commands.
