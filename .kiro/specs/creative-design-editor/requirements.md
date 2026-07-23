# Requirements Document

## Introduction

The Creative Design Editor is the frontend editing experience for PrintRocket LDM-SVG. It lets a user load a layered design — produced either by generating a design (`POST /generate-design`) or uploading a raster image (`POST /upload-image`) — and then separate, inspect, and edit the design's layers in a fast, Figma/Modyfi-class editor.

The editor consumes the existing backend's `DesignOutput` contract exactly as produced (`composedSVG` and `svgLayers[]`, with their `data-role`, `data-editable`, `data-field`, and `data-element-id` attributes). The backend is **not** in scope to change: the editor is a pure consumer of the existing FastAPI pipeline.

V1 delivers an editor that can: load a layered design, manage its layers (visibility, lock, reorder, rename within the editor), select individual editable elements on an infinite canvas, transform them (move, resize, rotate), edit text content inline, change visual properties (fill/color, stroke, opacity), undo/redo via a command-pattern history, autosave the working state locally, and export the result. Logo and print-marks layers remain locked, per the canonical SVG contract.

The architecture is intentionally designed to extend toward a future "Ultimate Creative Studio" (non-destructive editing, command-pattern undo/redo, modular dockable panels) without over-building those advanced capabilities in v1. The north-star capabilities (photo/RAW editing, vector pen authoring, motion/video, 3D, multiplayer CRDT, plugin SDK, dev handoff) are explicitly out of v1 scope and captured under Non-Goals.

The frontend builds on the existing React + Vite + TypeScript application under `frontend/src`. The UI is monochrome, dark-mode-first with light-mode support, with a top bar, left toolbar, left sidebar (layers/assets/etc.), center canvas, and right properties sidebar.

## Glossary

- **Editor**: The frontend Creative Design Editor application (React + Vite + TypeScript) that loads and edits layered designs.
- **Backend**: The existing PrintRocket LDM-SVG FastAPI service exposing `POST /generate-design` and `POST /upload-image`.
- **DesignOutput**: The typed contract returned by both backend endpoints, containing `requestId`, `svgLayers[]`, `composedSVG`, optional `backgroundImageUrl`, and `printMeta`.
- **Composed_SVG**: The `DesignOutput.composedSVG` string — the full merged SVG document the Editor renders on the canvas.
- **SVG_Layer**: An entry in `DesignOutput.svgLayers[]`, corresponding to a `<g data-role="...">` group in the Composed_SVG. Roles include `background`, `shapes`, `image-slots`, `body`, `cta`, `headline`, `logo`, and `print-marks`.
- **Editable_Element**: An SVG node carrying `data-editable="true"` (within an editable layer group), identified by `data-element-id` and, where applicable, `data-field`.
- **Locked_Layer**: A layer the Editor must not allow to be selected, transformed, or edited. In V1 the Locked_Layers are the `logo` layer and the `print-marks` layer.
- **Selection**: The set of currently selected Editable_Elements on the canvas.
- **Canvas**: The center editing surface that renders the Composed_SVG with pan, zoom, smart guides, and snapping.
- **Properties_Panel**: The right sidebar showing editable properties (position, size, rotation, typography, fill, stroke, opacity) for the current Selection.
- **Layers_Panel**: The left sidebar listing every SVG_Layer with controls for visibility, lock, and z-order reordering.
- **Command**: A reversible edit operation (apply/undo) recorded in the history stack (command pattern).
- **History**: The ordered stack of executed Commands enabling undo and redo.
- **Editor_Document**: The Editor's in-memory editable model derived from a DesignOutput, including layer order, per-layer visibility/lock state, and element transforms and property overrides.
- **Working_State**: The current Editor_Document plus view state that is autosaved locally so a session can be restored.
- **Export**: The action that produces an output artifact (SVG and PNG in V1) from the current Editor_Document.
- **Smart_Guide**: A visual alignment line shown during transforms to indicate alignment/snapping with other elements or canvas edges.

## Requirements

### Requirement 1: Load a generated or uploaded design into the editor

**User Story:** As a designer, I want to load a generated or uploaded design into the editor, so that I can begin editing its layers.

#### Acceptance Criteria

1. WHEN a user submits a design generation request, THE Editor SHALL call `POST /generate-design` and render the returned `composedSVG` on the Canvas as the active Editor_Document.
2. WHEN a user uploads a raster image whose MIME type is PNG, JPEG, or WEBP and whose file size is between 1 byte and 10 MB, THE Editor SHALL call `POST /upload-image` and render the returned `composedSVG` on the Canvas as the active Editor_Document.
3. IF a user selects a file whose MIME type is not PNG, JPEG, or WEBP, or whose file size exceeds 10 MB, THEN THE Editor SHALL reject the file before calling `POST /upload-image`, SHALL display an error message identifying the unsupported type or size limit, and SHALL retain any previously loaded Editor_Document.
4. WHEN a DesignOutput is received, THE Editor SHALL build an Editor_Document from `composedSVG` and `svgLayers[]` without flattening the layer group structure.
5. WHEN the Editor builds the Editor_Document, THE Editor SHALL preserve each layer's `data-role` attribute, and each element's `data-editable`, `data-field`, and `data-element-id` attributes.
6. IF the backend returns a non-success HTTP status, THEN THE Editor SHALL display a user-readable error message identifying that the request failed and SHALL retain any previously loaded Editor_Document.
7. IF a received DesignOutput is missing `composedSVG` or `svgLayers[]`, or contains a `composedSVG` that cannot be parsed as SVG, THEN THE Editor SHALL display an error message indicating the design could not be loaded and SHALL retain any previously loaded Editor_Document.
8. IF a request to a backend endpoint does not complete within 35 seconds, THEN THE Editor SHALL stop waiting and SHALL display a timeout message offering a retry action.
9. WHILE a backend request is in progress, THE Editor SHALL display a loading indicator and SHALL disable all design-loading actions until the request completes, times out, or fails.

### Requirement 2: View and manage layers

**User Story:** As a designer, I want to see all layers of the design and manage them, so that I can organize my edits.

#### Acceptance Criteria

1. WHEN an Editor_Document is loaded, THE Layers_Panel SHALL display one entry per SVG_Layer labeled by its `data-role` value.
2. IF a loaded SVG_Layer has no `data-role` value, THEN THE Layers_Panel SHALL display that layer's entry with a placeholder label indicating an unnamed layer and SHALL still render exactly one entry for it.
3. THE Layers_Panel SHALL display each layer in z-order, with the topmost rendered layer shown first and the bottommost rendered layer shown last.
4. WHEN a user toggles a layer's visibility control, THE Editor SHALL show or hide that layer on the Canvas to match the control state within 200 milliseconds.
5. WHEN a user activates a layer's lock control, THE Editor SHALL prevent selection and editing of that layer's elements until the layer is unlocked.
6. THE Editor SHALL render the `logo` layer and the `print-marks` layer as Locked_Layers whose lock control is fixed in the locked state and cannot be set to unlocked by the user in V1.
7. IF a user attempts to unlock, select, edit, or reorder a Locked_Layer, THEN THE Editor SHALL reject the action, leave the layer and its z-order unchanged, and indicate that the layer is locked.
8. WHEN a user reorders an unlocked layer in the Layers_Panel, THE Editor SHALL update that layer's z-order on the Canvas to match the new position within 200 milliseconds.
9. WHEN a user selects an unlocked layer entry in the Layers_Panel, THE Editor SHALL set the Selection to that layer's editable elements.
10. THE Editor SHALL keep the `print-marks` layer hidden on the Canvas by default and SHALL retain its hidden state until an export operation requests print marks.

### Requirement 3: Select elements on the canvas

**User Story:** As a designer, I want to select individual elements on the canvas, so that I can edit a specific part of the design.

#### Acceptance Criteria

1. WHEN a user clicks an Editable_Element on the Canvas, THE Editor SHALL set the Selection to contain exactly that single element.
2. IF a user clicks an element belonging to a Locked_Layer, THEN THE Editor SHALL leave the Selection unchanged and SHALL provide a visual indication that the element is not selectable.
3. WHEN a user clicks an empty area of the Canvas, where an empty area is a location containing no Editable_Element, THE Editor SHALL clear the Selection so that the Selection contains zero elements.
4. WHEN a user holds the multi-select modifier and clicks an Editable_Element that is not in the Selection, THE Editor SHALL add that element to the Selection.
5. WHEN a user holds the multi-select modifier and clicks an Editable_Element that is already in the Selection, THE Editor SHALL remove that element from the Selection.
6. WHEN a user drags a selection rectangle over the Canvas, THE Editor SHALL set the Selection to contain only the Editable_Elements whose bounds are fully enclosed by the rectangle, and SHALL exclude any Editable_Element that is only partially enclosed.
7. IF a user completes a selection rectangle that fully encloses zero Editable_Elements, THEN THE Editor SHALL set the Selection to contain zero elements.
8. WHILE the Selection contains one or more elements, THE Editor SHALL display selection handles around the combined bounding box of all elements in the Selection.
9. WHILE the Selection contains zero elements, THE Editor SHALL suppress all selection handles and SHALL display the Properties_Panel in a no-selection state.
10. WHEN the Selection changes, THE Editor SHALL update the Properties_Panel to reflect the current Selection within 100 milliseconds.

### Requirement 4: Transform elements (move, resize, rotate)

**User Story:** As a designer, I want to move, resize, and rotate selected elements, so that I can adjust the layout.

#### Acceptance Criteria

1. WHILE a user drags the Selection on the Canvas, THE Editor SHALL update the selected elements' position to follow the pointer with coordinates rounded to the nearest 0.5px grid increment.
2. WHILE a user drags a resize handle, THE Editor SHALL update the selected element's width and height according to the handle dragged, rounded to the nearest 0.5px grid increment, constrained to a minimum of 1px and a maximum equal to the corresponding Canvas dimension on each axis.
3. WHILE a user drags the rotation handle, THE Editor SHALL update the selected element's rotation angle within the range 0 to 359.99 degrees, rounded to the nearest 0.5px-equivalent grid increment, wrapping values at or beyond 360 degrees back into the 0 to 359.99 range.
4. WHEN a user commits a position, size, or rotation value in the Properties_Panel, THE Editor SHALL apply that exact value to the Selection, with size values constrained to 1px minimum and the corresponding Canvas dimension maximum, and rotation values constrained to the 0 to 359.99 degree range.
5. IF a user commits a non-numeric value or a value outside the permitted range in the Properties_Panel, THEN THE Editor SHALL reject the change, SHALL preserve the current Selection values unchanged, and SHALL indicate the invalid field to the user.
6. WHILE a user drags an element such that a corresponding edge or center of the dragged element is within 6px of the corresponding edge or center of another element along an aligned axis, THE Editor SHALL display a Smart_Guide and SHALL snap the dragged element to the aligned position.
7. WHEN a transform completes, THE Editor SHALL record the transform as a single Command in the History.
8. IF the Selection includes one or more elements from Locked_Layers, THEN THE Editor SHALL reject the entire transform, SHALL leave all selected elements unchanged, and SHALL present a user-visible indication that the transform is blocked.

### Requirement 5: Edit text content

**User Story:** As a designer, I want to edit the text content of text elements, so that I can change the design's wording.

#### Acceptance Criteria

1. WHEN a user double-clicks a text Editable_Element that is not within a Locked_Layer, THE Editor SHALL enter inline text editing mode for that element within 300 milliseconds and display a text caret within the element.
2. WHILE inline text editing mode is active, THE Editor SHALL render the in-progress text on the corresponding SVG `<text>` node.
3. WHEN a user types in inline text editing mode, THE Editor SHALL update the underlying `<text>` content no more frequently than once per 300 milliseconds of input inactivity.
4. IF the text entered in inline text editing mode would exceed 1000 characters, THEN THE Editor SHALL reject the input beyond 1000 characters and retain the text content at the 1000-character limit.
5. WHEN a user commits inline text editing mode by pressing the Enter key or clicking outside the element, THE Editor SHALL exit inline text editing mode and record the text change as a single Command in the History.
6. WHEN a user cancels inline text editing mode by pressing the Escape key, THE Editor SHALL exit inline text editing mode, restore the text content to its value at edit start, and not record a Command.
7. IF a user double-clicks a text Editable_Element within a Locked_Layer, THEN THE Editor SHALL not enter inline text editing mode and SHALL leave the element's text content unchanged.
8. WHEN inline text editing mode is exited with the text content identical to its value at edit start, THE Editor SHALL not record a Command.

### Requirement 6: Edit visual properties (fill, stroke, opacity)

**User Story:** As a designer, I want to change color, stroke, and opacity of selected elements, so that I can restyle the design.

#### Acceptance Criteria

1. WHILE a single Editable_Element is selected, THE Properties_Panel SHALL display the element's fill color and stroke color as 6-digit hexadecimal values, stroke width in pixels, and opacity as a decimal value.
2. WHEN a user changes the fill color in the Properties_Panel to a valid 6-digit hexadecimal value, THE Editor SHALL apply the selected color to the element's fill within 300 milliseconds.
3. WHEN a user changes the stroke color to a valid 6-digit hexadecimal value or the stroke width to a value between 0 and 100 pixels inclusive in the Properties_Panel, THE Editor SHALL apply the change to the element's stroke within 300 milliseconds.
4. WHEN a user changes opacity in the Properties_Panel to a value between 0 and 1 inclusive, THE Editor SHALL set the element's opacity to that value within 300 milliseconds.
5. WHEN a property change is applied, THE Editor SHALL record the change as a single Command in the History that is reversible in one undo step and reapplicable in one redo step.
6. IF a user enters a fill color or stroke color that is not a valid 6-digit hexadecimal value, a stroke width outside 0 to 100 pixels inclusive, or an opacity outside 0 to 1 inclusive, THEN THE Editor SHALL reject the change, retain the element's existing value, display an inline error indication identifying the affected field, and record no Command in the History.
7. WHILE the Selection includes only elements from Locked_Layers, THE Properties_Panel SHALL display the element's properties as read-only, reject any edit to those properties, apply no change to the element, and record no Command in the History.

### Requirement 7: Undo and redo edits

**User Story:** As a designer, I want to undo and redo my edits, so that I can recover from mistakes and explore changes.

#### Acceptance Criteria

1. THE Editor SHALL maintain a History that retains at least the 50 most recent undoable Commands.
2. WHEN a user triggers undo and the History contains at least one undoable Command, THE Editor SHALL revert the most recent Command, restore the Editor_Document to the exact state it had immediately before that Command was applied, and render the resulting Canvas state within 200 milliseconds.
3. WHEN a user triggers redo and a previously undone Command exists in the redo stack, THE Editor SHALL re-apply the most recently undone Command, restore the Editor_Document to the exact state it had immediately after that Command was originally applied, and render the resulting Canvas state within 200 milliseconds.
4. WHEN a new Command is recorded after one or more undos, THE Editor SHALL discard all Commands currently held in the redo stack and SHALL present a user-visible indication that redo is no longer available.
5. IF a user triggers undo and the History contains no undoable Command, THEN THE Editor SHALL leave the Editor_Document unchanged and SHALL present a user-visible no-op indication that no further undo is available.
6. IF a user triggers redo and the redo stack is empty, THEN THE Editor SHALL leave the Editor_Document unchanged and SHALL present a user-visible no-op indication that no redo is available.
7. FOR ALL recorded Commands, applying the Command and then undoing it SHALL return the Editor_Document to a byte-for-byte identical state compared to the Editor_Document captured immediately before the Command was applied (round-trip property).
8. WHEN a new undoable Command is recorded while the History already retains 50 undoable Commands, THE Editor SHALL discard the oldest retained undoable Command so that the retained count does not exceed 50.

### Requirement 8: Autosave and restore working state

**User Story:** As a designer, I want my work saved automatically, so that I do not lose progress if I close or reload the editor.

#### Acceptance Criteria

1. WHEN the Editor_Document changes and no further change occurs for 1000 milliseconds, THE Editor SHALL persist the Working_State to local browser storage within 200 milliseconds of that inactivity threshold being reached.
2. WHILE the Editor_Document is changing continuously without a 1000 millisecond pause, THE Editor SHALL persist the Working_State to local browser storage at least once every 5000 milliseconds.
3. WHEN the Editor loads and a Working_State for the current design exists in local browser storage, THE Editor SHALL restore the Working_State and render an Editor_Document whose editable elements, content, positions, and z-order match the persisted Working_State.
4. IF the Editor loads and the stored Working_State for the current design is absent, unparseable, or fails schema validation, THEN THE Editor SHALL start with an empty Editor_Document, SHALL display a non-blocking warning indicating the saved state could not be restored, and SHALL NOT overwrite the stored Working_State until the next successful change-triggered save.
5. WHEN a save to local browser storage is initiated, THE Editor SHALL display a save-status indicator showing the "saving" state; WHEN the save completes successfully, THE Editor SHALL update the indicator to the "saved" state within 200 milliseconds; IF the save fails, THEN THE Editor SHALL update the indicator to the "failed" state within 200 milliseconds.
6. IF persisting the Working_State to local browser storage fails, THEN THE Editor SHALL display a non-blocking warning identifying the failure and SHALL keep the in-memory Editor_Document unchanged and fully editable.
7. FOR ALL Editor_Documents, persisting the Working_State to local browser storage and then restoring it SHALL reproduce an Editor_Document in which every editable element's identity, role, content, position, dimensions, and z-order are identical to those of the source Editor_Document (round-trip property).

### Requirement 9: Export the design

**User Story:** As a designer, I want to export my edited design, so that I can use it outside the editor.

#### Acceptance Criteria

1. WHEN a user triggers export as SVG, THE Editor SHALL produce an SVG document that reflects the current Editor_Document including all layers with `visibility` not set to hidden and all applied edits.
2. WHEN a user triggers export as PNG, THE Editor SHALL produce a raster PNG image rendered from the current Editor_Document at the design's canvas dimensions (width equal to `canvasWidth` px and height equal to `canvasHeight` px).
3. WHEN the Editor produces an exported SVG, THE Editor SHALL preserve the `data-role` layer group structure such that the set of `<g>` groups and their `data-role` values are identical to those in the current Editor_Document.
4. WHEN the Editor produces an exported SVG, THE Editor SHALL preserve the `data-element-id` attribute and its value for every editable element present in the current Editor_Document.
5. WHEN the Editor exports and print marks are not explicitly enabled by the user, THE Editor SHALL keep the `print-marks` layer hidden in the exported output.
6. WHERE the user has explicitly enabled print marks for the export, THE Editor SHALL include the `print-marks` layer as visible in the exported output.
7. IF the current Editor_Document is empty (contains zero editable elements), THEN THE Editor SHALL disable the export action.
8. IF an export operation fails after being triggered, THEN THE Editor SHALL display an error message indicating that the export did not complete and SHALL retain the current Editor_Document unchanged.
9. FOR ALL non-empty Editor_Documents, WHEN a user exports as SVG and re-imports that SVG into the Editor, THE Editor SHALL reproduce an Editor_Document whose layer structure (the set of `data-role` groups and their nesting) and editable-element set (the set of `data-element-id` values and their associated editable fields) are identical to those of the Editor_Document at the time of export.

### Requirement 10: Editor shell and navigation chrome

**User Story:** As a designer, I want a clear and fast editor layout, so that I can navigate tools and panels efficiently.

#### Acceptance Criteria

1. THE Editor SHALL display a top bar containing the project name, an undo control, a redo control, a save-status indicator, an export control, and a theme toggle, with all six elements visible without scrolling.
2. THE Editor SHALL display a left toolbar containing at least the following five tools: move, text, shape, hand (pan), and zoom.
3. THE Editor SHALL display a left sidebar containing the Layers_Panel and an assets section.
4. THE Editor SHALL display a right sidebar containing the Properties_Panel.
5. WHEN a user selects a tool in the left toolbar, THE Editor SHALL set that tool as the single active tool within 200 milliseconds.
6. WHILE a tool is the active tool, THE Editor SHALL render that tool's toolbar control in a visually distinct state that differs from all inactive tool controls, and SHALL render exactly one tool control in the active state at any time.
7. WHEN the Editor is opened and no prior theme preference exists, THE Editor SHALL apply the dark theme as the default active theme.
8. WHEN a user activates the theme toggle, THE Editor SHALL switch the active theme to the other of the two supported themes (dark or light) within 200 milliseconds and SHALL apply the switched theme to the top bar, left toolbar, left sidebar, and right sidebar.
9. THE save-status indicator SHALL display exactly one of the following states at any time: saved, unsaved changes, or saving.

### Requirement 11: Canvas navigation

**User Story:** As a designer, I want to pan and zoom the canvas, so that I can work at different levels of detail.

#### Acceptance Criteria

1. WHEN a user zooms via the zoom control or zoom gesture, THE Editor SHALL scale the Canvas rendering to the requested zoom level constrained to the range 10% to 800% inclusive.
2. IF a user attempts to zoom below 10% or above 800%, THEN THE Editor SHALL clamp the zoom level to the nearest bound (10% or 800%) and retain the current Canvas view without error.
3. WHEN a user pans the Canvas with the hand tool or pan gesture, THE Editor SHALL translate the Canvas view by the same distance as the pointer movement in a 1:1 ratio at the current zoom level.
4. WHEN a user triggers fit-to-screen, THE Editor SHALL scale and center the Canvas so the full design bounding box is visible within the viewport with the resulting zoom level constrained to the 10% to 800% range.
5. WHILE zooming or panning, THE Editor SHALL render all text and vector elements using vector rendering and SHALL NOT rasterize the editable SVG layers (those with `data-editable="true"`).
6. WHEN the zoom level changes, THE Editor SHALL display the current zoom level as a percentage rounded to the nearest whole number within the 10% to 800% range.

## Non-Goals (Out of V1 Scope)

The following north-star capabilities are explicitly out of scope for V1. The editor architecture should not preclude them, but V1 will not implement:

- Photo and RAW image editing (retouching, filters, channel/curve editing, non-destructive adjustment layers beyond simple property overrides).
- Vector authoring with a pen/bezier tool (creating new arbitrary vector paths from scratch).
- Motion, animation, and video editing or timelines.
- 3D scene editing or rendering.
- Real-time multiplayer collaboration and CRDT-based co-editing.
- Plugin SDK and third-party extensions.
- Developer handoff (code/spec inspection, redlines, asset slicing).
- Modifying, retraining, or restructuring the backend pipeline or its endpoints.
- Server-side persistence of projects (V1 autosave is local browser storage only).
- Print-grade CMYK export and trim/bleed post-processing in the frontend (this remains a backend/export-service concern).
