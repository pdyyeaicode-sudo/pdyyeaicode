# Requirements Document

## Introduction

Creative Studio is a genuinely working visual design editor built on top of the existing PrintRocket LDM-SVG foundation. It transforms the current single-page DesignStudio into a professional, multi-panel editing environment in the spirit of Figma, Modyfi, and Canva, while preserving every backend contract and the canonical SVG layer structure already in place.

This document scopes **v1**: an editable infinite canvas, a full layers system, core drawing and text tools, a properties sidebar, reuse of the existing AI generation and image-decomposition backend, a local-first project/document model with undo/redo and autosave, and PNG/SVG/PDF export. It also defines the minimal monochrome, dark-mode-first UI language with thin single-line icons that the user explicitly emphasized.

The v1 work extends existing code rather than rewriting it. The frontend builds on `useDesignStudio.ts`, `designApi.ts`, the existing component set, and the shared types in `frontend/src/types/index.ts`. The backend reuses `POST /generate-design` and `POST /upload-image` and the Pydantic models in `shared/models.py`. The canonical SVG `data-role` layer schema (background, shapes, image-slots, body, cta, headline, logo, print-marks) remains the source of truth for the document model.

A large north-star vision (RAW photo editing, brush engine, motion/video timeline, multiplayer collaboration, plugin SDK, code export, and more) is intentionally **out of scope for v1** and is captured as a future roadmap in Requirement 14 so it is preserved but not built prematurely.

## Glossary

- **Creative_Studio**: The complete v1 frontend editing application that renders, edits, persists, and exports designs.
- **Editor_Canvas**: The center infinite canvas surface that renders the design and handles pan, zoom, selection, and direct manipulation.
- **Document_Model**: The in-memory representation of a design project, derived from and serialized to the canonical layered SVG plus project metadata (pages, artboards, document name).
- **Canonical_SVG**: The layered SVG structure defined in AGENTS.md, using `<g data-role>` groups (background, shapes, image-slots, body, cta, headline, logo, print-marks) with `data-editable`, `data-field`, and `data-layer-id` attributes.
- **Layer**: A top-level `<g data-role>` group or an editable element within the Canonical_SVG that appears as a selectable, orderable entry in the Layers_Panel.
- **Layers_Panel**: The left-sidebar component that lists layers and supports select, reorder, rename, lock, hide, opacity, and grouping.
- **Tool_Rail**: The left vertical strip of single-purpose tools (select, shape, text, image, pen, etc.).
- **Properties_Panel**: The right sidebar exposing position, size, fill, stroke, typography, opacity, basic effects, export, and AI suggestions for the current selection.
- **Top_Bar**: The application header containing project name, undo/redo, save status, collaborators placeholder, search, AI assistant entry, export, share, and profile controls.
- **Bottom_Panel**: The lower panel hosting timeline/history/inspector views; the timeline view is a placeholder in v1.
- **AI_Backend**: The existing FastAPI orchestrator exposing `POST /generate-design` and `POST /upload-image`, returning a `DesignOutput`.
- **Design_Request**: The existing `DesignRequest` payload (prompt, brandKit, targetSize, outputFormat, sessionHistory).
- **Design_Output**: The existing `DesignOutput` payload (requestId, svgLayers, composedSVG, backgroundImageUrl, printMeta).
- **Brand_Kit**: The existing `BrandKit` model (primaryColor, secondaryColor, fontFamily, logoUrl, tone).
- **Command**: A reversible edit operation captured by the command/history system for undo and redo.
- **History_Stack**: The ordered record of applied Commands supporting undo and redo.
- **Autosave_Store**: The local-first persistence mechanism (browser local storage / IndexedDB) that retains the Document_Model between sessions.
- **Theme**: The active visual appearance of Creative_Studio, either dark mode or light mode.
- **Accent_Color**: The single configurable highlight color applied to active and interactive UI states.
- **Line_Icon**: A thin, stroke-based (approximately 1px stroke), single-color icon with no filled or multicolor styling.
- **Snap_Guide**: A visual alignment indicator shown during element movement to assist precise positioning.
- **Selection_Set**: The collection of one or more Layers currently selected on the Editor_Canvas.
- **Artboard**: A bounded design surface within a Page that defines canvas dimensions for export.
- **Page**: A named container holding one or more Artboards within the Document_Model.

## Requirements

### Requirement 1: Editor Canvas Navigation and Selection

**User Story:** As a designer, I want an infinite canvas I can pan, zoom, and select on, so that I can navigate and manipulate my design freely.

#### Acceptance Criteria

1. WHEN a Design_Output is loaded, THE Editor_Canvas SHALL render the Canonical_SVG at its native dimensions centered in the viewport.
2. IF a Design_Output fails to load or cannot be parsed as valid Canonical_SVG, THEN THE Editor_Canvas SHALL leave the current Document_Model unchanged and SHALL display a descriptive error message.
3. WHEN the user performs a pan gesture, THE Editor_Canvas SHALL translate the rendered design without modifying the Document_Model.
4. WHEN the user performs a zoom gesture, THE Editor_Canvas SHALL scale the rendered design to a zoom level within the inclusive range 10% to 6400% while keeping the cursor-anchored point stable.
5. IF a zoom gesture would set the zoom level below 10% or above 6400%, THEN THE Editor_Canvas SHALL clamp the zoom level to the nearest bound (10% or 6400%).
6. THE Editor_Canvas SHALL display the current zoom level as a percentage rounded to the nearest integer.
7. WHEN the user clicks an element whose containing group has `data-editable="true"`, THE Editor_Canvas SHALL set the Selection_Set to contain only the corresponding Layer, replacing any prior selection.
8. WHEN the user clicks empty canvas space, THE Editor_Canvas SHALL clear the Selection_Set so that it contains zero Layers.
9. WHEN the user shift-clicks an editable element that is not in the Selection_Set, THE Editor_Canvas SHALL add the corresponding Layer to the Selection_Set.
10. WHEN the user shift-clicks an editable element that is already in the Selection_Set, THE Editor_Canvas SHALL remove the corresponding Layer from the Selection_Set.
11. WHEN the user clicks an element whose containing group has `data-editable="false"`, THE Editor_Canvas SHALL leave the Selection_Set unchanged.
12. WHILE one or more Layers are selected, THE Editor_Canvas SHALL render selection handles around the combined axis-aligned bounding box of all Layers in the Selection_Set.

### Requirement 2: Snap Guides and Alignment

**User Story:** As a designer, I want smart alignment guides while moving elements, so that I can position elements precisely.

#### Acceptance Criteria

1. WHILE the user drags a Layer, THE Editor_Canvas SHALL display Snap_Guides when the dragged Layer's left edge, right edge, top edge, bottom edge, horizontal center, or vertical center aligns with the corresponding reference of another Layer within a 5px threshold measured in Editor_Canvas pixels.
2. WHILE a Snap_Guide is active, THE Editor_Canvas SHALL adjust the dragged Layer's position to the aligned coordinate independently on each axis.
3. WHEN the user releases a dragged Layer, THE Editor_Canvas SHALL hide all Snap_Guides.
4. WHEN the user drags a Layer near an Artboard edge or center within a 5px threshold measured in Editor_Canvas pixels, THE Editor_Canvas SHALL display a Snap_Guide for that Artboard reference line.
5. WHILE the user drags a Layer AND multiple alignment references are within the 5px threshold, THE Editor_Canvas SHALL display a Snap_Guide for each aligned reference simultaneously.
6. WHILE the user drags a Layer AND no alignment reference is within the 5px threshold, THE Editor_Canvas SHALL hide all Snap_Guides.

### Requirement 3: Layers Panel Management

**User Story:** As a designer, I want a layers panel to organize my design, so that I can control visibility, order, and structure.

#### Acceptance Criteria

1. WHEN a Design_Output is loaded, THE Layers_Panel SHALL list one entry per top-level `<g data-role>` group, presenting entries from top (highest z-index, last in document order) to bottom (lowest z-index, first in document order), within 500 milliseconds of load completion.
2. WHEN the user selects a Layer entry in the Layers_Panel, THE Creative_Studio SHALL set the Selection_Set to contain exactly that Layer and display a selection indicator on the corresponding group on the Editor_Canvas within 200 milliseconds.
3. WHEN the user reorders a Layer entry within the Layers_Panel, THE Creative_Studio SHALL change the corresponding group's document position so that the z-index ordering in the Canonical_SVG matches the panel order while preserving the relative order of all other groups.
4. WHEN the user renames a Layer entry to a name of 1 to 100 characters, THE Creative_Studio SHALL store the new name as a `data-name` attribute on the corresponding group without altering its `data-role`.
5. WHEN the user toggles visibility on a Layer, THE Creative_Studio SHALL hide or show the corresponding group on the Editor_Canvas while retaining the group and its child elements in the Document_Model.
6. WHEN the user toggles lock on an editable Layer, THE Creative_Studio SHALL prevent or restore selection and editing of that Layer.
7. WHEN the user sets the opacity of a Layer to an integer value between 0 and 100 inclusive, THE Creative_Studio SHALL apply the corresponding opacity (0 = fully transparent, 100 = fully opaque) to the group.
8. WHERE a group has `data-editable="false"`, THE Layers_Panel SHALL present the Layer as locked and disable the rename, delete, lock-toggle, and reorder controls for that Layer.
9. WHEN the user groups two or more selected Layers, THE Creative_Studio SHALL nest the selected groups inside a new container group while preserving each member's `data-role` and their relative z-index order.
10. IF the user attempts to rename a Layer entry to an empty value or a value exceeding 100 characters, THEN THE Creative_Studio SHALL reject the rename, retain the previous `data-name` value, and display an error indication identifying the invalid name.
11. IF the user attempts to set the opacity of a Layer to a value outside the range 0 to 100, THEN THE Creative_Studio SHALL reject the change, retain the previous opacity value, and display an error indication identifying the invalid value.
12. IF the user attempts to group fewer than two Layers, THEN THE Creative_Studio SHALL reject the operation and display an indication that at least two Layers must be selected.

### Requirement 4: Selection, Move, and Transform Tools

**User Story:** As a designer, I want to select and move elements on the canvas, so that I can arrange my layout directly.

#### Acceptance Criteria

1. WHILE the select tool is active AND a Layer is selected AND the Layer is not locked, WHEN the user drags the selection and releases the pointer, THE Creative_Studio SHALL translate the selected Layer by the pointer drag delta, in pixels, measured from pointer-down to pointer-release.
2. WHILE a Layer is being dragged, WHEN the dragged Layer's center is within 5 pixels of the canvas center along an axis, THE Creative_Studio SHALL snap the Layer's center to the canvas center on that axis.
3. WHILE a Layer is selected AND the Layer is not locked, WHEN the user drags one of the four corner selection handles, THE Creative_Studio SHALL resize the Layer along the dragged handle's diagonal direction by the pointer drag delta in pixels.
4. WHILE a Layer is selected AND the Layer is not locked, WHEN the user presses an arrow key once, THE Creative_Studio SHALL translate the selected Layer by exactly 1 pixel in the pressed arrow key's direction.
5. IF the user attempts to move, resize, or transform a locked Layer, THEN THE Creative_Studio SHALL leave the Layer's position and size unchanged AND SHALL NOT record a Command in the History_Stack.
6. WHEN a move, resize, or transform operation changes the selected Layer's position or size by a non-zero amount, THE Creative_Studio SHALL record exactly one Command in the History_Stack.
7. WHILE the History_Stack contains 50 Commands, WHEN a new Command is recorded, THE Creative_Studio SHALL discard the oldest Command so that the History_Stack never exceeds 50 Commands.

### Requirement 5: Shape Creation Tools

**User Story:** As a designer, I want to draw shapes, so that I can build graphic compositions.

#### Acceptance Criteria

1. WHEN the user creates a rectangle, ellipse, line, or polygon (a polygon having a minimum of 3 vertices), THE Creative_Studio SHALL add a new editable element to the `shapes` group with a `data-layer-id` value unique within the current document and a non-empty `data-field` attribute.
2. WHEN the user creates a closed shape (rectangle, ellipse, or polygon), THE Creative_Studio SHALL apply the Brand_Kit primaryColor as the default fill WHERE a Brand_Kit is active, and otherwise SHALL apply the Accent_Color as the default fill.
3. WHEN the user creates a line, THE Creative_Studio SHALL apply the Brand_Kit primaryColor as the default stroke WHERE a Brand_Kit is active, and otherwise SHALL apply the Accent_Color as the default stroke.
4. WHEN a shape is created, THE Creative_Studio SHALL add exactly one new entry for the shape in the Layers_Panel.
5. WHEN a shape is created, THE Creative_Studio SHALL record exactly one Command in the History_Stack.
6. WHEN a shape is created, THE Creative_Studio SHALL round each shape coordinate to the nearest 0.5px increment consistent with the Canonical_SVG print-sharpness rule.
7. IF a created shape is degenerate (0px width or 0px height), THEN THE Creative_Studio SHALL discard the shape, add no Layers_Panel entry, record no Command, and leave the Document_Model unchanged.

### Requirement 6: Text Tool

**User Story:** As a designer, I want to add and edit text, so that I can communicate a message in my design.

#### Acceptance Criteria

1. WHEN the user creates a text element, THE Creative_Studio SHALL add a `<text>` node within an editable group carrying `data-field` and `data-element-id` attributes, with text content constrained to 1 to 500 characters.
2. WHEN the user double-clicks an editable text element, THE Creative_Studio SHALL present an inline text input pre-populated with the element's current text content within 200 milliseconds of the double-click.
3. WHEN the user commits an inline text edit by pressing Enter or moving focus away from the inline input, with content containing at least one non-whitespace character and no more than 500 characters, THE Creative_Studio SHALL update the `<text>` node content and record one Command in the History_Stack.
4. IF the user commits an inline text edit with empty or whitespace-only content, THEN THE Creative_Studio SHALL retain the previous `<text>` node content unchanged, SHALL NOT record a Command in the History_Stack, and SHALL provide a visible indication that the edit was not applied.
5. WHEN the user changes font family, font size, or text color for a selected text Layer, THE Creative_Studio SHALL apply the corresponding `font-family`, `font-size`, and `fill` attributes to the `<text>` node, where `font-size` is within the range of 12px to 200px inclusive.
6. IF the user enters a font size below 12px or above 200px, THEN THE Creative_Studio SHALL clamp the applied `font-size` to the nearest bound (12px or 200px) and SHALL provide a visible indication that the value was adjusted.
7. WHILE the user is typing in the inline text input, THE Creative_Studio SHALL refresh the on-canvas `<text>` preview no more than once per 300 milliseconds.
8. THE Creative_Studio SHALL represent all editable text as `<text>` nodes and SHALL NOT convert editable text into path-traced outlines.

### Requirement 7: Image Placement

**User Story:** As a designer, I want to place images on the canvas, so that I can include photos and graphics.

#### Acceptance Criteria

1. WHEN the user places an image file of type PNG, JPEG, or WEBP that is 10MB or smaller, THE Creative_Studio SHALL add exactly one `<image>` element to the `image-slots` group with a `data-layer-id` value that is unique among all existing layer identifiers in the Document_Model.
2. WHEN an image is placed, THE Creative_Studio SHALL embed the image data inline within the `<image>` element so that the Document_Model renders the image with no external network request.
3. IF a selected image file exceeds 10MB or its type is not PNG, JPEG, or WEBP, THEN THE Creative_Studio SHALL reject the file, leave the Document_Model unchanged, and display an error message identifying the reason for rejection (file size limit exceeded or unsupported file type).
4. IF a selected image file is within the size and type limits but cannot be read or decoded, THEN THE Creative_Studio SHALL reject the file, leave the Document_Model unchanged, and display an error message indicating the file could not be loaded.
5. WHEN an image is placed, THE Creative_Studio SHALL record one Command in the History_Stack that, when reverted, removes the placed `<image>` element and restores the Document_Model to its prior state.

### Requirement 8: Pen and Path Basics

**User Story:** As a designer, I want basic pen/path drawing, so that I can create custom shapes.

#### Acceptance Criteria

1. WHILE the pen tool is active, WHEN the user clicks at a position within the Editor_Canvas bounds, THE Creative_Studio SHALL add an anchor point at the clicked position to the path being constructed and render the updated in-progress path within 100 milliseconds.
2. WHEN the user closes the path by clicking the initial anchor point and the path contains two or more anchor points, THE Creative_Studio SHALL add a `<path>` element to the `shapes` group with a `data-layer-id` value that is unique among all existing layer IDs in the Document_Model and a `data-field` attribute.
3. WHEN the user completes the pen action without closing the path by pressing Escape, pressing Enter, or selecting another tool, and the path contains two or more anchor points, THE Creative_Studio SHALL add a `<path>` element to the `shapes` group with a `data-layer-id` value that is unique among all existing layer IDs in the Document_Model and a `data-field` attribute.
4. WHEN a `<path>` element is added to the `shapes` group, THE Creative_Studio SHALL record a single Command in the History_Stack that supports both undo and redo of the path addition.
5. IF the user closes or completes a path that contains fewer than two anchor points, THEN THE Creative_Studio SHALL discard the path, leave the Document_Model unchanged, and display an indication that the path was discarded.

### Requirement 9: Properties Panel

**User Story:** As a designer, I want a properties sidebar, so that I can edit precise attributes of a selection.

#### Acceptance Criteria

1. WHILE exactly one Layer is selected, THE Properties_Panel SHALL display the selected Layer's position (x and y in pixels), size (width and height in pixels), fill color, stroke color, stroke width, opacity (0 to 100 percent), and, WHERE the selected Layer is a text Layer, typography controls (font family, font size, font weight, and text alignment).
2. WHEN the user commits a position or size value within the range 0 to 100000 pixels in the Properties_Panel, THE Creative_Studio SHALL apply the value to the selected Layer within 300 milliseconds and record exactly one Command in the History_Stack.
3. IF the user commits a position or size value that is non-numeric or outside the range 0 to 100000 pixels, THEN THE Creative_Studio SHALL reject the value, retain the selected Layer's previous value, and display an error indication identifying the invalid field, without recording a Command in the History_Stack.
4. WHEN the user commits a fill color, stroke color, or opacity value (opacity within 0 to 100 percent) in the Properties_Panel, THE Creative_Studio SHALL apply the change to the selected Layer within 300 milliseconds and record exactly one Command in the History_Stack.
5. IF the user commits an opacity value outside the range 0 to 100 percent or an unparseable color value, THEN THE Creative_Studio SHALL reject the value, retain the selected Layer's previous value, and display an error indication identifying the invalid field, without recording a Command in the History_Stack.
6. WHEN the user applies a shadow or blur effect in the Properties_Panel, THE Creative_Studio SHALL apply the corresponding SVG attribute or filter to the selected Layer within 300 milliseconds and record exactly one Command in the History_Stack.
7. WHILE no Layer is selected, THE Properties_Panel SHALL display document-level properties including Artboard width and height (in pixels) and export options (output format and export size).
8. WHILE more than one Layer is selected, THE Properties_Panel SHALL display alignment controls (left, horizontal center, right, top, vertical center, bottom) and distribution controls (horizontal and vertical) for the Selection_Set.

### Requirement 10: AI Design Generation and Image Import

**User Story:** As a designer, I want to generate a design from a prompt or decompose an uploaded image, so that I can start editing from AI-produced layers.

#### Acceptance Criteria

1. WHEN the user submits a prompt with a Brand_Kit and target size, THE Creative_Studio SHALL send a Design_Request to `POST /generate-design` using the existing API client.
2. IF the submitted prompt is empty or whitespace-only, or any target-size dimension is non-positive, THEN THE Creative_Studio SHALL reject the request, display a validation error, and leave the Document_Model unchanged.
3. WHEN `POST /generate-design` returns a Design_Output, THE Creative_Studio SHALL load the returned Canonical_SVG into the Document_Model as editable Layers, with each Layer mapped to one `data-role` group.
4. WHEN the user uploads an image for decomposition, THE Creative_Studio SHALL send the file to `POST /upload-image` using the existing API client.
5. WHEN `POST /upload-image` returns a Design_Output, THE Creative_Studio SHALL load the returned Layers and set the Artboard size to the returned SVG dimensions.
6. IF the AI_Backend returns an error response, THEN THE Creative_Studio SHALL display the error message from the response and SHALL leave the current Document_Model unchanged.
7. IF an AI_Backend request does not complete within 300 seconds, THEN THE Creative_Studio SHALL terminate the request, display a timeout error, and leave the Document_Model unchanged.
8. WHILE an AI_Backend request is in progress, THE Creative_Studio SHALL display a loading indicator and SHALL disable resubmission of the same request until the in-flight request completes, fails, or times out.
9. THE Creative_Studio SHALL preserve the canonical `data-role` layer structure of any Design_Output without flattening the layer groups.

### Requirement 11: Project Document Model, Undo/Redo, and Autosave

**User Story:** As a designer, I want my work organized into a project with undo, redo, and autosave, so that I do not lose progress and can reverse mistakes.

#### Acceptance Criteria

1. THE Document_Model SHALL contain a document name of 1 to 255 characters, one or more Pages (1 to 100), and at least one Artboard per Page.
2. WHEN the user performs an undo action AND the History_Stack has a prior Command, THE Creative_Studio SHALL revert the Document_Model to the state before that Command.
3. IF the user performs an undo action AND the History_Stack has no prior Command, THEN THE Creative_Studio SHALL leave the Document_Model unchanged and SHALL present a disabled-undo indication.
4. WHEN the user performs a redo action AND a reverted Command exists, THE Creative_Studio SHALL reapply that Command to the Document_Model.
5. IF the user performs a redo action AND no reverted Command exists, THEN THE Creative_Studio SHALL leave the Document_Model unchanged and SHALL present a disabled-redo indication.
6. THE History_Stack SHALL retain the 50 most recent Commands, and WHEN a new Command exceeds that limit, THE Creative_Studio SHALL discard the oldest Command.
7. WHEN the Document_Model changes, THE Creative_Studio SHALL write the current Document_Model to the Autosave_Store within 2 seconds of the change.
8. WHEN Creative_Studio starts AND a saved Document_Model exists in the Autosave_Store, THE Creative_Studio SHALL restore that Document_Model.
9. IF a write to the Autosave_Store fails, THEN THE Creative_Studio SHALL retain the in-memory Document_Model, SHALL display a save-status warning indicating the failure, and SHALL retry the write up to 3 times at 5-second intervals.
10. WHILE a save operation is in progress, completed, or failed, THE Top_Bar SHALL display the corresponding save status of saving, saved, or save-failed within 1 second of the state change.

### Requirement 12: Export

**User Story:** As a designer, I want to export my design as PNG, SVG, or PDF, so that I can deliver and print my work.

#### Acceptance Criteria

1. WHEN the user requests SVG export, THE Creative_Studio SHALL produce a file containing the current Canonical_SVG of the active Artboard, and SHALL complete the export within 30 seconds.
2. WHEN the user requests PNG export, THE Creative_Studio SHALL produce a raster file whose pixel width and height equal the active Artboard dimensions in pixels, and SHALL complete the export within 30 seconds.
3. WHEN the user requests PDF export, THE Creative_Studio SHALL produce a print-oriented file that applies the existing backend print metadata, including bleed and CMYK-safe handling, to every element for which that metadata is defined.
4. IF an export operation fails, THEN THE Creative_Studio SHALL display an error message indicating the reason for the failure, AND SHALL leave the Document_Model unchanged from its state immediately before the export request.
5. IF an export operation does not complete within 30 seconds, THEN THE Creative_Studio SHALL terminate the operation, display an error message indicating a timeout, AND SHALL leave the Document_Model unchanged.
6. WHEN an export completes successfully, THE Creative_Studio SHALL initiate a download of the produced file named with the document name, or with the requestId when the document name is empty.

### Requirement 13: UI Design Language — Monochrome, Dark-First, Thin Line Icons

**User Story:** As a user, I want a clean, minimal, dark-mode-first interface with thin line icons, so that the studio feels like a modern professional design tool.

#### Acceptance Criteria

1. WHEN Creative_Studio first loads without a saved Theme preference, THE Creative_Studio SHALL apply the dark Theme by default.
2. WHEN Creative_Studio loads AND a saved Theme preference exists, THE Creative_Studio SHALL apply the saved Theme.
3. WHEN the user selects a Theme using the Theme control, THE Creative_Studio SHALL apply the selected Theme, persist it, and re-apply it on subsequent loads.
4. THE Creative_Studio SHALL render its interface using a monochrome palette plus a single Accent_Color for active and interactive states.
5. THE Creative_Studio SHALL render every interface icon as a Line_Icon with a stroke-based single-color style of 1.0px to 1.5px stroke width (nominal 1px).
6. THE Creative_Studio SHALL NOT use filled, multicolor, or raster icons in the interface chrome.
7. THE Creative_Studio SHALL display a Top_Bar containing the project name, undo control, redo control, save status, a collaborators placeholder, search, an AI assistant entry, export, share, and a profile control.
8. THE Creative_Studio SHALL display a left Tool_Rail, a left sidebar with pages, layers, assets, components, and templates sections, the center Editor_Canvas, a right Properties_Panel, and a Bottom_Panel.
9. WHERE the Bottom_Panel timeline view is shown in v1, THE Creative_Studio SHALL present the timeline as a labeled placeholder that provides no animation functionality and performs no action when its controls are activated.
10. WHEN the user activates a tool or panel control, THE Creative_Studio SHALL indicate the active state using the Accent_Color within 100 milliseconds.
11. THE Creative_Studio SHALL present advanced Properties_Panel controls in collapsible sections that are collapsed by default and visually separated from the primary controls.

### Requirement 14: Out-of-Scope and Future Roadmap

**User Story:** As a product stakeholder, I want the north-star vision recorded as explicit non-goals for v1, so that the long-term direction is preserved without expanding v1 scope.

#### Acceptance Criteria

1. THE Creative_Studio v1 SHALL exclude photo RAW editing, non-destructive adjustment layers, and advanced retouching from its delivered functionality.
2. THE Creative_Studio v1 SHALL exclude a vector brush engine and pressure-sensitive illustration tools from its delivered functionality.
3. THE Creative_Studio v1 SHALL exclude motion and video editing, keyframe animation, and a functional timeline from its delivered functionality.
4. THE Creative_Studio v1 SHALL exclude real-time multiplayer collaboration and CRDT-based concurrent editing from its delivered functionality.
5. THE Creative_Studio v1 SHALL exclude a plugin SDK and third-party extension runtime from its delivered functionality.
6. THE Creative_Studio v1 SHALL exclude developer handoff code export (HTML, CSS, or framework code) from its delivered functionality.
7. THE Creative_Studio v1 SHALL present collaborators and timeline affordances as non-functional placeholders to reserve space for future roadmap features.

#### Future Roadmap (non-binding, documented to preserve the north-star vision)

The following capability areas are recorded for future phases and are not delivered in v1:

- **Design**: advanced auto-layout, constraints, components and variants, design tokens, template marketplace.
- **Photo Editing**: RAW import and develop, curves and channels, masking, healing and clone, AI background removal, generative fill.
- **Illustration**: full vector brush engine, pressure and tilt support, boolean path operations, mesh gradients, pattern fills.
- **Motion / Video**: animation timeline, keyframes and easing, video import and trim, audio tracks, export to MP4 and GIF and Lottie.
- **AI**: in-canvas generative edits, AI layout suggestions surfaced in the Properties_Panel, prompt-driven restyling, content-aware resize.
- **Collaboration**: multiplayer cursors, CRDT concurrent editing, comments and review mode, sharing permissions and roles.
- **Publishing**: direct-to-print ordering, web publishing, social export presets, brand asset libraries.
- **Developer Handoff**: inspect mode, code export (HTML/CSS/React/SwiftUI), measurement specs, design-token sync.
