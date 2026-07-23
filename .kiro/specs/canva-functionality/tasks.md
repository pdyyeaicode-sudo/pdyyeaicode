# Tasks: Professional Canvas UX Enhancement

## Tasks

- [ ] 1. Multi-Selection Foundation
  - [x] 1.1 Extend SelectionSet type in documentModel.ts to include `primaryLayerId?: string`
  - [x] 1.2 Create `useMultiSelection.ts` hook with methods: `add`, `remove`, `toggle`, `clear`, `selectAll`
  - [x] 1.3 Update `SelectionOverlay.tsx` to compute combined bounding box for multiple layers
  - [x] 1.4 Add Shift+Click handler in `CreativeStudio.tsx` to toggle layer selection
  - [x] 1.5 Implement Cmd/Ctrl+A shortcut to select all editable layers
  - [x]* 1.6 Write unit tests for multi-selection logic (add/remove/toggle edge cases)
  - [x]* 1.7 Write integration test: Click layer → Shift+Click another → verify both selected
  - **Acceptance**: WHEN user Shift+Clicks unselected layer THEN added to selection; WHEN Shift+Clicks selected layer THEN removed; WHEN multiple selected THEN combined bounding box shown; WHEN Cmd/Ctrl+A THEN all editable layers selected (excluding locked/logo/print-marks); WHEN selection changes THEN primaryLayerId tracks last-clicked layer
  - **Technical**: Do not modify existing single-selection behavior; Use primaryLayerId to determine which layer drives PropertiesPanel; Filter locked and role-locked layers from selectAll
  - _Requirements: 1.1, 1.2, 1.3, 1.10; Dependencies: none; Estimated effort: 4 hours_


- [x] 2. Clipboard Operations Infrastructure
  - [x] 2.1 Create `clipboard.ts` utility with `ClipboardData` type definition
  - [x] 2.2 Implement `serializeLayers(layers: DocumentLayer[]): string` function
  - [x] 2.3 Implement `deserializeLayers(json: string): DocumentLayer[]` with validation
  - [x] 2.4 Implement `remapLayerIds(layer: DocumentLayer): DocumentLayer` recursively
  - [x] 2.5 Add internal clipboard state to `useCreativeStudio` hook
  - [x] 2.6 Create `pasteLayersCommand.ts` with 20px offset logic
  - [x] 2.7 Create `batchDeleteCommand.ts` for multi-layer deletion
  - [x]* 2.8 Write property-based tests for serialize → deserialize round-trip
  - [x]* 2.9 Write unit tests for ID remapping (ensure uniqueness, preserve structure)
  - **Acceptance**: WHEN layers serialized/deserialized THEN structure preserved; WHEN pasted THEN IDs unique; WHEN group pasted THEN hierarchy preserved; WHEN invalid data THEN no crash; WHEN copied locked layer THEN paste unlocked
  - **Technical**: Use JSON.stringify/parse; Store original bounds in ClipboardData; Handle circular references; Clipboard format version: 1
  - _Requirements: 4.1-4.10; Dependencies: Task 1; Estimated effort: 5 hours_


- [x] 3. Keyboard Shortcuts System
  - [x] 3.1 Create `useKeyboardShortcuts.ts` hook with shortcut registry
  - [x] 3.2 Define `KeyboardShortcut` interface with keys, action, enabled function
  - [x] 3.3 Implement context detection (activeTextEditor, hasSelection, hasClipboard)
  - [x] 3.4 Add shortcuts: Cmd+C/X/V/D (copy/cut/paste/duplicate)
  - [x] 3.5 Add shortcuts: Delete/Backspace (delete), Cmd+G/Shift+G (group/ungroup)
  - [x] 3.6 Add shortcuts: Cmd+]/[ and Cmd+Shift+]/[ (z-order)
  - [x] 3.7 Add shortcuts: Cmd+L, Cmd+Shift+H (lock/hide toggle)
  - [x] 3.8 Add shortcuts: Cmd+0/1/+/- (zoom controls)
  - [x] 3.9 Add shortcuts: Escape (clear selection/exit tool)
  - [x] 3.10 Add priority system: text input > canvas > browser defaults
  - [x] 3.11 Integrate with CreativeStudio via single window.keydown listener
  - [x]* 3.12 Write integration tests for each shortcut combination
  - **Acceptance**: WHEN Cmd+C THEN copied; WHEN Cmd+V THEN pasted with offset; WHEN Cmd+G THEN grouped; WHEN Delete THEN deleted; WHEN text editing THEN canvas shortcuts disabled; WHEN Escape THEN selection cleared; WHEN Cmd+0 THEN zoom reset to 100%
  - **Technical**: Use event.metaKey || event.ctrlKey; Prevent default browser behavior; Log warning on conflicts; Support both Delete and Backspace
  - _Requirements: 2.1-2.20; Dependencies: Task 1, Task 2; Estimated effort: 6 hours_


- [x] 4. Alignment and Distribution Tools
  - [x] 4.1 Create `alignment.ts` utility with `AlignMode` and `DistributeMode` types
  - [x] 4.2 Implement `getSelectionBounds(layers, doc): BoundingBox` function
  - [x] 4.3 Implement `alignLayers(layerIds, mode, target, doc)` for 6 alignment modes
  - [x] 4.4 Implement `distributeLayers(layerIds, mode, doc)` for 2 distribution modes
  - [x] 4.5 Create `batchTranslateCommand.ts` for atomic multi-layer moves
  - [x] 4.6 Create `AlignmentToolbar.tsx` component with 8 buttons (6 align + 2 distribute)
  - [x] 4.7 Integrate AlignmentToolbar into PropertiesPanel (show when 2+ layers selected)
  - [x] 4.8 Add artboard vs selection alignment toggle
  - [x]* 4.9 Write unit tests for alignment algorithms with various layer configurations
  - [x]* 4.10 Write property-based tests for distribution (verify even spacing)
  - **Acceptance**: WHEN Align Left THEN align to leftmost; WHEN Align Center Horizontal THEN align to average center; WHEN Distribute Horizontal THEN evenly spaced; WHEN <2 layers THEN buttons disabled; WHEN applied THEN single undo step; WHEN locked layers THEN excluded
  - **Technical**: Alignment reference: leftmost/rightmost/topmost/bottommost; Distribution: sort by position, compute gap; Filter locked layers; Record all offsets in single batchTranslateCommand
  - _Requirements: 6.1-6.12; Dependencies: Task 1; Estimated effort: 6 hours_

- [x] 5. Contextual Menu System
  - [x] 5.1 Create `ContextMenu.tsx` component with portal rendering to document.body
  - [x] 5.2 Create `useContextMenu.ts` hook for state management and positioning
  - [x] 5.3 Implement `getLayerContextMenu()` function for single-layer context
  - [x] 5.4 Implement `getMultiSelectionContextMenu()` function for multi-selection context
  - [x] 5.5 Implement `getCanvasContextMenu()` function for empty canvas context
  - [x] 5.6 Add right-click handler in CreativeStudio and SelectionOverlay
  - [x] 5.7 Implement click-outside-to-close behavior
  - [x] 5.8 Implement Escape-to-close behavior
  - [x] 5.9 Style menu with consistent design system colors
  - [x]* 5.10 Write integration tests for menu opening and action execution
  - **Acceptance**: WHEN right-click layer THEN menu shows Cut/Copy/Duplicate/Delete/Lock/Hide/Bring Forward/Send Backward; WHEN right-click multi-selection THEN Group/Align/Distribute/Delete/Lock All/Hide All; WHEN right-click empty canvas THEN Paste/Select All/Zoom; WHEN right-click locked layer THEN Unlock primary; WHEN Paste disabled THEN visually disabled; WHEN action triggered THEN menu closes
  - **Technical**: Use React Portal; Position at cursor (handle screen edges); Disable based on context; Prevent on text inputs
  - _Requirements: 3.1-3.9; Dependencies: Task 2, Task 3, Task 4; Estimated effort: 5 hours_

- [ ] 6. Smart Guides and Enhanced Snapping
  - [ ] 6.1 Create `SmartGuides.tsx` component with SVG line rendering
  - [~] 6.2 Extend `snapping.ts` with `computeSnapGuides()` function
  - [~] 6.3 Implement guide computation: layer edges + artboard edges + centers
  - [~] 6.4 Add multiple simultaneous guide support
  - [~] 6.5 Integrate guide rendering into SelectionOverlay drag handlers
  - [x] 6.6 Add Cmd/Ctrl modifier to temporarily disable snapping
  - [~] 6.7 Style guides: magenta color, 1px stroke, full artboard extent
  - [~] 6.8 Implement guide clearing on drag end
  - [ ]* 6.9 Write unit tests for guide computation with various layer positions
  - [ ]* 6.10 Write integration test: drag layer near another → verify guide appears
  - **Acceptance**: WHEN dragging near edge THEN guide appears; WHEN dragging near center THEN center guide; WHEN align to multiple THEN multiple guides; WHEN drag ends THEN guides disappear; WHEN Cmd/Ctrl held THEN snapping disabled; WHEN guide shown THEN extends across artboard
  - **Technical**: Threshold: 5px; Priority: center > edges; Compute on every drag move (RAF if needed); Use vector-effect="non-scaling-stroke"
  - _Requirements: 7.1-7.10; Dependencies: Task 1; Estimated effort: 5 hours_

- [ ] 7. Group and Ungroup Operations
  - [~] 7.1 Extend existing `groupCommand.ts` to support multi-selection grouping
  - [~] 7.2 Create `ungroupCommand.ts` to dissolve groups and promote children
  - [~] 7.3 Implement transform preservation: compute relative positions for children
  - [x] 7.4 Add group isolation mode state to useCreativeStudio
  - [x] 7.5 Implement double-click on group to enter isolation mode
  - [x] 7.6 Create breadcrumb navigation component for isolation mode
  - [x] 7.7 Implement exit isolation (click breadcrumb or Escape)
  - [ ]* 7.8 Write unit tests for group/ungroup with transform preservation
  - [ ]* 7.9 Write integration test: group layers → move group → ungroup → verify absolute positions
  - [ ]* 7.10 Write test: nested groups (group within group)
  - **Acceptance**: WHEN Cmd+G THEN grouped with preserved positions; WHEN Cmd+Shift+G THEN dissolved; WHEN group moved THEN children move together; WHEN double-click group THEN isolation mode; WHEN in isolation THEN breadcrumb shows "Artboard > Group Name"; WHEN exit THEN full view restored
  - **Technical**: Compute group bounds as union; Store children with relative positions; On ungroup: convert to absolute coords; Filter layers in isolation mode; Generate unique names: "Group 1", "Group 2"
  - _Requirements: 5.1-5.10; Dependencies: Task 1, Task 3; Estimated effort: 6 hours_

- [ ] 8. Marquee Selection
  - [~] 8.1 Add marquee state to `useCanvasDrag` hook (extend existing drag intent)
  - [~] 8.2 Detect drag-start on empty canvas (not on layer)
  - [~] 8.3 Render selection rectangle in SelectionOverlay during drag
  - [~] 8.4 Implement screen-to-canvas coordinate transformation for hit testing
  - [~] 8.5 Implement layer intersection testing: layer bounds vs marquee bounds
  - [~] 8.6 Select all enclosed layers on pointerup
  - [~] 8.7 Clear selection if marquee encloses zero layers
  - [~] 8.8 Handle viewport transform (zoom/pan) in hit testing
  - [~] 8.9 Style marquee: dashed border, semi-transparent fill
  - [ ]* 8.10 Write integration test: drag empty canvas → verify layers inside selected
  - **Acceptance**: WHEN drag on empty canvas THEN marquee appears; WHEN drag continues THEN updates real-time; WHEN released THEN enclosed layers selected; WHEN encloses zero THEN selection cleared; WHEN viewport zoomed/panned THEN correct testing; WHEN cancelled THEN unchanged
  - **Technical**: Distinguish move vs marquee intent; Hit test: layer bounds fully inside marquee; Coordinate transform: screen → viewport → canvas; Visual: 1px dashed, rgba(0,120,255,0.1); Use RAF if needed
  - _Requirements: 1.4-1.6; Dependencies: Task 1; Estimated effort: 5 hours_


- [ ] 9. Grid and Ruler Overlays
  - [~] 9.1 Create `GridOverlay.tsx` with SVG pattern-based rendering
  - [~] 9.2 Implement adaptive grid sizing based on zoom level
  - [~] 9.3 Add grid enable/disable toggle to TopBar or BottomPanel
  - [~] 9.4 Create `RulerOverlay.tsx` with Canvas 2D rendering
  - [~] 9.5 Implement ruler tick marks (every 10px) and labels (every 50px)
  - [~] 9.6 Add horizontal and vertical ruler components
  - [~] 9.7 Add ruler enable/disable toggle
  - [~] 9.8 Implement dragging indicator on ruler (shows current position)
  - [~] 9.9 Update grid/ruler on viewport zoom/pan changes
  - [ ]* 9.10 Write visual regression tests for grid at various zoom levels
  - **Acceptance**: WHEN grid enabled THEN 10px base spacing shown; WHEN zoom <50% THEN spacing adapts; WHEN zoom >200% THEN spacing adapts; WHEN rulers enabled THEN shown at edges; WHEN dragging THEN ruler shows position; WHEN disabled THEN hidden; WHEN grid+snapping THEN snap to grid intersections
  - **Technical**: Grid: SVG <pattern> for performance; Adaptive: 10px base, 20px if zoom<0.5, 40px if zoom<0.25, 5px if zoom>2; Rulers: fixed-position, 20px height/width; Grid style: rgba(0,0,0,0.1) light, rgba(255,255,255,0.1) dark
  - _Requirements: 12.1-12.10; Dependencies: none; Estimated effort: 5 hours_

- [ ] 10. Performance Optimizations
  - [~] 10.1 Create `useVisibilityCulling.ts` hook to compute visible layer IDs
  - [~] 10.2 Integrate culling in SVGCanvas: only render visible layers
  - [~] 10.3 Add `will-change: transform` CSS hint to layer groups
  - [x] 10.4 Verify text input debouncing is 300ms in InlineTextEditor
  - [x] 10.5 Add selection change batching with 16ms debounce (1 frame)
  - [~] 10.6 Implement performance monitoring using Performance API
  - [~] 10.7 Log warning if FPS drops below 50 during interactions
  - [x] 10.8 Add layer count warning in UI when >100 layers
  - [ ]* 10.9 Benchmark drag performance with 100+ layers
  - [ ]* 10.10 Write performance tests measuring FPS during drag/zoom/pan
  - **Acceptance**: WHEN 100+ layers THEN 60 FPS maintained; WHEN off-screen THEN not rendered; WHEN text editing THEN 300ms debounce; WHEN rapid selection THEN batched per frame; WHEN degrades THEN warning logged; WHEN >100 layers THEN UI shows suggestion
  - **Technical**: Culling: compute intersection with viewport; GPU: CSS transform with will-change; Debouncing: lodash.debounce or custom; Performance: performance.now() for frame time; Target: 16ms/frame=60FPS; Warning: 20ms/frame=50FPS
  - _Requirements: 13.1-13.10; Dependencies: none; Estimated effort: 4 hours_

- [ ] 11. Text Formatting Enhancements
  - [~] 11.1 Create `TextFormattingToolbar.tsx` component with floating position
  - [~] 11.2 Extend `TextLayer` type with fontWeight, fontStyle, textDecoration fields
  - [~] 11.3 Implement toolbar show/hide logic: appears on text selection
  - [~] 11.4 Add bold button: toggles fontWeight between "normal" and "bold"
  - [~] 11.5 Add italic button: toggles fontStyle between "normal" and "italic"
  - [~] 11.6 Add underline button: toggles textDecoration
  - [~] 11.7 Add color picker: dispatches setPropertyCommand with fill color
  - [~] 11.8 Position toolbar above text selection using bounding rect
  - [~] 11.9 Apply formats via setPropertyCommand (single undo per format change)
  - [ ]* 11.10 Write integration test: select text → click bold → verify fontWeight updated
  - **Acceptance**: WHEN double-click text THEN inline edit mode; WHEN text selected in edit mode THEN toolbar appears; WHEN bold clicked THEN fontWeight toggles; WHEN italic clicked THEN fontStyle toggles; WHEN color changed THEN updates immediately; WHEN format applied THEN single undo step; WHEN edit mode exited THEN toolbar disappears
  - **Technical**: For v1: format entire text layer (no character-level spans); Position: compute bounding rect, offset 40px above; Handle screen edges: flip below if near top; Future: support <tspan> for character-level; Color picker: HTML input type="color" or custom palette
  - _Requirements: 15.1-15.10; Dependencies: Task 1; Estimated effort: 5 hours_

- [x] 12. Visual Feedback System
  - [x] 12.1 Create `Toast.tsx` component with auto-dismiss functionality
  - [x] 12.2 Create `ToastContainer.tsx` component with portal rendering
  - [x] 12.3 Implement `useToast.ts` hook with show/dismiss methods
  - [x] 12.4 Add toast queue: limit to 3 visible toasts at once
  - [x] 12.5 Integrate toasts with undo/redo actions
  - [x] 12.6 Integrate toasts with copy/paste/cut/duplicate actions
  - [x] 12.7 Integrate toasts with group/ungroup actions
  - [x] 12.8 Create `AngleIndicator.tsx` component for rotation feedback
  - [x] 12.9 Integrate angle indicator in SelectionOverlay rotation handler
  - [ ]* 12.10 Write integration test: perform action → verify toast appears and dismisses
  - **Acceptance**: WHEN undo THEN toast "Undo [Action]" for 2s; WHEN redo THEN toast "Redo [Action]" for 2s; WHEN copy THEN toast "Copied" for 2s; WHEN paste THEN toast "Pasted" for 2s; WHEN rotating THEN angle indicator shows angle; WHEN rotation ends THEN indicator disappears; WHEN >3 toasts THEN oldest dismissed
  - **Technical**: Toast position: bottom-right, 20px margin; Style: shadow, rounded corners, theme-aware; Auto-dismiss: 2000ms default; Queue: FIFO, max 3; Angle indicator: format as "45°", position 20px from cursor; Use React Portal for both
  - _Requirements: 16.1-16.10; Dependencies: Task 3; Estimated effort: 4 hours_

- [ ] 13. Batch Operations and Commands
  - [~] 13.1 Create `batchTranslateCommand.ts` for multi-layer translation
  - [x] 13.2 Create `batchPropertyCommand.ts` for applying property to multiple layers
  - [~] 13.3 Create `batchDeleteCommand.ts` for deleting multiple layers (extend existing)
  - [~] 13.4 Implement lock/unlock all for multi-selection
  - [~] 13.5 Implement hide/show all for multi-selection
  - [~] 13.6 Add z-order batch operations: bring all forward, send all backward
  - [~] 13.7 Filter locked layers from batch operations
  - [ ]* 13.8 Write unit tests for each batch command (apply/undo round-trip)
  - [ ]* 13.9 Write property-based test: batch operation → undo → verify state restored
  - [ ]* 13.10 Write integration test: select 5 layers → delete → undo → verify all restored
  - **Acceptance**: WHEN batch applied THEN single undo step; WHEN batch undo THEN all reverted together; WHEN locked in selection THEN excluded; WHEN batch delete THEN all removed atomically; WHEN batch property THEN all updated; WHEN batch z-order THEN all moved maintaining relative order
  - **Technical**: Batch command stores Map<layerId, change>; Apply iterates map; Undo iterates reverse; Lock filter: check layer.locked and LOCKED_ROLES; Z-order: maintain relative order; Record original state for undo
  - _Requirements: 14.1-14.10; Dependencies: Task 1, Task 2, Task 4; Estimated effort: 4 hours_

- [ ] 14. Accessibility Improvements
  - [~] 14.1 Add visible focus indicators to layer elements on canvas
  - [~] 14.2 Implement Tab/Shift+Tab to cycle through layers
  - [~] 14.3 Add ARIA labels to all interactive controls (buttons, inputs)
  - [~] 14.4 Implement focus trapping in ContextMenu and modals
  - [~] 14.5 Add aria-live region for selection change announcements
  - [~] 14.6 Implement Enter key to select focused layer
  - [~] 14.7 Implement Space key on focused text layer to enter edit mode
  - [~] 14.8 Add keyboard navigation instructions to help panel
  - [ ]* 14.9 Test with screen reader (NVDA or JAWS)
  - [ ]* 14.10 Write accessibility audit report
  - **Acceptance**: WHEN Tab THEN focus cycles through layers; WHEN focused THEN visible focus indicator; WHEN selection changes THEN screen reader announces "X layers selected"; WHEN modal opens THEN focus trapped; WHEN interactive control THEN aria-label present; WHEN Enter on focused layer THEN selected; WHEN Space on focused text THEN inline edit mode
  - **Technical**: Focus indicator: 2px blue outline, visible in both themes; Tab order: follows document layer order; ARIA live region: politeness="polite"; Focus trap: cycle within modal/menu, Escape to exit; Follow WCAG 2.1 AA guidelines
  - _Requirements: 17.1-17.10; Dependencies: Task 1; Estimated effort: 4 hours_

- [ ] 15. Integration and Polish
  - [~] 15.1 Integrate all new hooks and components into CreativeStudio.tsx
  - [~] 15.2 Update PropertiesPanel to show multi-selection properties ("mixed" for differing values)
  - [~] 15.3 Add feature flags for gradual rollout (grid, rulers, advanced shortcuts)
  - [~] 15.4 Polish transitions: fade toasts, smooth menu animations
  - [~] 15.5 Ensure consistent keyboard shortcut behavior across all contexts
  - [~] 15.6 Add loading states for async operations (paste large groups)
  - [~] 15.7 Polish error handling: user-friendly messages for all edge cases
  - [~] 15.8 Update user documentation with new features and shortcuts
  - [ ]* 15.9 Perform end-to-end testing with realistic design workflow
  - [ ]* 15.10 Create demo video showing all new features
  - **Acceptance**: WHEN multi-selection active THEN PropertiesPanel shows common properties; WHEN properties differ THEN "mixed" indicator; WHEN feature flag disabled THEN feature hidden; WHEN toast appears THEN smooth fade-in; WHEN context menu opens THEN smooth slide-in; WHEN error occurs THEN user-friendly message; WHEN all integrated THEN no console errors; WHEN realistic workflow tested THEN all operations work smoothly
  - **Technical**: Multi-selection properties: compute intersection of editable properties; Show "mixed" for differing values; Feature flags: environment variables or config file; Transitions: 200ms duration, ease-out timing; Error messages: user-friendly not technical; Documentation: update README with shortcuts; Demo video: 2-3 minutes showing key workflows
  - _Requirements: All 20 requirements satisfied; Dependencies: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9, Task 10, Task 11, Task 12, Task 13, Task 14; Estimated effort: 6 hours_


## Task Summary

**Total Tasks**: 15  
**Estimated Total Effort**: 73 hours (~2-3 weeks for 1 developer)

### Critical Path
Task 1 → Task 2 → Task 3 → Task 13 → Task 15

### Recommended Implementation Order
**Phase 1 (Week 1)**: Foundation
- Task 1: Multi-Selection Foundation
- Task 2: Clipboard Operations
- Task 3: Keyboard Shortcuts System
- Task 10: Performance Optimizations

**Phase 2 (Week 2)**: Advanced Features
- Task 4: Alignment and Distribution
- Task 6: Smart Guides
- Task 7: Group/Ungroup
- Task 8: Marquee Selection
- Task 13: Batch Operations

**Phase 3 (Week 3)**: Polish & Accessibility
- Task 5: Contextual Menu
- Task 9: Grid and Rulers
- Task 11: Text Formatting
- Task 12: Visual Feedback
- Task 14: Accessibility
- Task 15: Integration and Polish

### Success Criteria
- All 20 requirements from requirements.md satisfied
- 60 FPS maintained with 100+ layers during interactions
- 30+ keyboard shortcuts functional and conflict-free
- Zero data loss in copy/paste/undo/redo operations
- WCAG 2.1 AA accessibility compliance
- All tests passing (target: 95%+ coverage for new code)
