# Creative Studio Canvas Features

## Overview

This document describes the professional canvas editing features available in the Creative Studio editor.

## Core Features

### Multi-Selection
- **Shift+Click**: Add/remove layers from selection
- **Cmd/Ctrl+A**: Select all layers on active artboard
- **Marquee**: Drag on empty canvas to select multiple layers
- **Combined Actions**: All operations work on multi-selection (move, resize, delete, etc.)

### Clipboard Operations
- **Cmd/Ctrl+C**: Copy selected layers
- **Cmd/Ctrl+X**: Cut selected layers
- **Cmd/Ctrl+V**: Paste with 20px offset
- **Cmd/Ctrl+D**: Duplicate in place
- **Group Paste**: Preserves hierarchy and relative positions

### Keyboard Shortcuts

#### Selection & Navigation
- `Tab` / `Shift+Tab` - Cycle layer focus
- `Enter` - Select focused layer
- `Escape` - Clear selection / Exit mode
- `Cmd/Ctrl+A` - Select all

#### Editing
- `Cmd/Ctrl+C/X/V/D` - Copy/Cut/Paste/Duplicate
- `Delete` / `Backspace` - Delete selection
- `Arrow Keys` - Nudge 1px
- `Shift+Arrow` - Nudge 10px

#### Grouping
- `Cmd/Ctrl+G` - Group selection
- `Cmd/Ctrl+Shift+G` - Ungroup
- `Double-click group` - Enter isolation mode

#### Layer Order
- `Cmd/Ctrl+]` - Bring forward
- `Cmd/Ctrl+[` - Send backward
- `Cmd/Ctrl+Shift+]` - Bring to front
- `Cmd/Ctrl+Shift+[` - Send to back

#### View
- `Cmd/Ctrl+'` - Toggle grid
- `Cmd/Ctrl+R` - Toggle rulers
- `Cmd/Ctrl+0` - Reset zoom
- `Cmd/Ctrl+1` - Fit to screen
- `Cmd/Ctrl+/` - Show keyboard shortcuts

### Alignment & Distribution

Available when 2+ layers selected:

- **Align Left/Center/Right** - Horizontal alignment
- **Align Top/Middle/Bottom** - Vertical alignment
- **Distribute Horizontal** - Even spacing on X axis
- **Distribute Vertical** - Even spacing on Y axis
- **Align to Artboard** - Use artboard as reference instead of selection

### Smart Guides & Snapping

- **Auto-snapping**: Layers snap to edges and centers of other layers (5px threshold)
- **Visual guides**: Magenta lines show alignment references
- **Cmd/Ctrl modifier**: Hold to temporarily disable snapping
- **Multiple guides**: Shows all active alignment references simultaneously

### Group Isolation Mode

- **Double-click group**: Enter isolation mode
- **Breadcrumb navigation**: Shows hierarchy path
- **Escape**: Exit isolation mode
- **Nested groups**: Can isolate child groups recursively

### Grid & Rulers

- **Grid**: Adaptive spacing based on zoom (10px base)
- **Rulers**: Horizontal and vertical pixel measurements
- **Dragging indicator**: Shows position on rulers during drag
- **Grid snapping**: Snap to grid intersections when enabled

### Context Menus

Right-click for context-appropriate actions:

- **Single layer**: Cut, Copy, Duplicate, Delete, Lock, Hide, Z-order
- **Multi-selection**: Group, Align, Distribute, Lock All, Hide All
- **Empty canvas**: Paste, Select All, View options
- **Locked layer**: Unlock as primary action

### Visual Feedback

- **Toast notifications**: Confirm actions (Undo, Copy, Paste, etc.)
- **Angle indicator**: Shows rotation angle during rotate
- **Loading states**: Progress for async operations
- **Focus indicators**: Visible outline on keyboard-focused layers

### Accessibility

- **Keyboard navigation**: Full canvas control without mouse
- **Screen reader support**: ARIA labels and live regions
- **Focus management**: Tab through layers, Enter to select
- **Keyboard shortcuts help**: Cmd+/ to view all shortcuts

## Performance

- **60 FPS target**: Smooth interactions with 100+ layers
- **Visibility culling**: Off-screen layers not rendered
- **GPU acceleration**: CSS transforms for all interactions
- **Debounced updates**: Text input (300ms), selection (16ms)
- **Performance monitoring**: Automatic frame rate tracking

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Known Limitations

- Group isolation limited to single level (nested not yet supported)
- Text formatting applies to entire text layer (no character-level)
- Grid/rulers available only at zoom 10%-400%

## Feedback & Issues

Report issues or request features via [GitHub Issues](link).

---

**Last Updated**: 2026-07-12
**Version**: 1.0.0
