# Testing Guide - UI & Toolbar Phase 2

## Server Status
✅ **Dev server running on**: `http://localhost:3001`

## Quick Test Checklist

### 1. Landing Page Test
**URL**: `http://localhost:3001/`

**Expected**:
- [ ] Purple gradient background
- [ ] Pydee logo (120x120) centered at top
- [ ] "Pydee" heading
- [ ] 3 feature cards (AI-Powered, Lightning Fast, Layer Control)
- [ ] "Start Creating" button
- [ ] Click button → navigates to /editor

### 2. Editor Header Test
**URL**: `http://localhost:3001/editor`

**Expected Layout**:
```
[Logo] Home | Menu | ─ | [Undo] [Redo] | ─ | Document Name
           [Select] [Hand] [Frame] [Rectangle] [Pen] [Text] [Image] [Color] [Crop]
                                                    Download [Profile]
```

**Test Each Element**:
- [ ] Logo displays (32x32)
- [ ] Home button visible with icon
- [ ] Click Home → goes to landing page
- [ ] Undo button (disabled if nothing to undo)
- [ ] Redo button (disabled if nothing to redo)
- [ ] Document name shows "Untitled" or current name
- [ ] All 9 tool buttons visible
- [ ] Download button in top-right
- [ ] Profile avatar shows "P"

### 3. Toolbar Tooltips Test
Hover over each button and verify tooltip appears:

- [ ] Select → "Select (V)"
- [ ] Hand → "Hand Tool (H)"
- [ ] Frame → "Frame (F)"
- [ ] Rectangle → "Rectangle (R)"
- [ ] Pen → "Pen (P)"
- [ ] Text → "Text (T)"
- [ ] Image → "Image (I)"
- [ ] Color → "Color"
- [ ] Crop → "Crop (C)"
- [ ] Undo → "Undo (Ctrl+Z)"
- [ ] Redo → "Redo (Ctrl+Shift+Z)"
- [ ] Download → "Download (Ctrl+Shift+E)"

### 4. Shape Drawing Test (Square Tool)

**Without Shift**:
1. [ ] Click Rectangle button (or press R)
2. [ ] Cursor changes to crosshair
3. [ ] Click and drag on canvas
4. [ ] See thin dashed preview
5. [ ] Release mouse
6. [ ] Rectangle appears at exact location
7. [ ] Can select, resize, rotate, delete

**With Shift (Perfect Square)**:
1. [ ] Click Rectangle button (or press R)
2. [ ] Hold Shift key
3. [ ] Click and drag on canvas
4. [ ] Preview constrains to perfect square
5. [ ] Release mouse
6. [ ] Perfect square appears
7. [ ] Width === Height

### 5. Download Menu Test
**Steps**:
1. [ ] Draw a shape on canvas
2. [ ] Click Download button
3. [ ] Menu appears with options:
   - Export PNG ✓
   - Export JPG ✓
   - Export SVG ✓
   - Export PDF (Soon)
   - Export JSON (Soon)

**Test PNG Export**:
1. [ ] Click "Export PNG"
2. [ ] File downloads as "[DocumentName].png"
3. [ ] Open file → shows design

**Test JPG Export**:
1. [ ] Click "Export JPG"
2. [ ] File downloads as "[DocumentName].jpg"
3. [ ] Open file → shows design with white background

**Test SVG Export**:
1. [ ] Click "Export SVG"
2. [ ] File downloads as "[DocumentName].svg"
3. [ ] Open file → shows design (vector)

### 6. Keyboard Shortcuts Test

**Tool Selection**:
- [ ] Press `V` → Select tool activates (button highlights)
- [ ] Press `H` → Hand tool activates
- [ ] Press `R` → Rectangle tool activates
- [ ] Press `O` → Circle tool activates
- [ ] Press `L` → Line tool activates
- [ ] Press `T` → Text tool activates
- [ ] Press `I` → Image file picker opens
- [ ] Press `C` → Crop tool activates (if image selected)

**Editing**:
1. [ ] Draw a rectangle
2. [ ] Press `Ctrl+D` → Rectangle duplicates
3. [ ] Press `Ctrl+Z` → Undo (duplicate removed)
4. [ ] Press `Ctrl+Shift+Z` → Redo (duplicate returns)
5. [ ] Press `Delete` → Rectangle deleted
6. [ ] Press `Escape` → Deselects all

**Export**:
- [ ] Press `Ctrl+Shift+E` → Download menu opens

**Layer Ordering** (if layer selected):
- [ ] Press `]` → Layer moves forward
- [ ] Press `[` → Layer moves backward

### 7. Undo/Redo Functionality Test
**Scenario**:
1. [ ] Create rectangle → Undo button enabled
2. [ ] Click Undo → Rectangle disappears, Redo enabled
3. [ ] Click Redo → Rectangle reappears
4. [ ] Create circle
5. [ ] Click Undo → Circle disappears
6. [ ] Click Undo → Rectangle disappears
7. [ ] Undo button disabled (nothing more to undo)
8. [ ] Click Redo twice → Rectangle and circle return

### 8. Menu Dropdown Test
**Steps**:
1. [ ] Click Menu button (hamburger icon)
2. [ ] Dropdown appears with:
   - [ ] New Document (with + icon)
   - [ ] Import & Separate (with image icon)
   - [ ] Export SVG (with download icon)
3. [ ] Click anywhere outside → Menu closes
4. [ ] Click "New Document" → Creates blank canvas

### 9. Shape Menu Dropdown Test
**Steps**:
1. [ ] Click Rectangle button (has down arrow)
2. [ ] Dropdown appears with 4 shapes:
   - [ ] Rectangle (R)
   - [ ] Circle (O)
   - [ ] Line (L)
   - [ ] Triangle
3. [ ] Click each option → Tool activates
4. [ ] Each has tooltip with shortcut

### 10. Responsive Header Test
**Resize browser window**:
- [ ] Logo always visible at all sizes
- [ ] Home button always visible
- [ ] Download button always accessible
- [ ] Toolbar tools scroll if window too narrow
- [ ] No overlapping elements
- [ ] Proper spacing maintained

### 11. Navigation Test
**Test all routes**:
- [ ] Navigate to `/` → Landing page
- [ ] Navigate to `/editor` → Editor
- [ ] Navigate to `/settings` → Redirects to `/editor`
- [ ] Navigate to `/templates` → Redirects to `/editor`
- [ ] Navigate to `/pricing` → Redirects to `/editor`
- [ ] Navigate to `/help` → Redirects to `/editor`
- [ ] Navigate to `/random-invalid-url` → Redirects to `/`

### 12. Home Button Navigation Test
**From Editor**:
1. [ ] Click Home button
2. [ ] Navigates to landing page (no reload)
3. [ ] URL changes to `/`
4. [ ] Browser back button works

**From Landing Page**:
1. [ ] Click "Start Creating"
2. [ ] Navigates to editor (no reload)
3. [ ] URL changes to `/editor`
4. [ ] Click Home → back to landing

## Known Issues (Pre-existing)
These errors existed before Phase 2 and are not related to our changes:
- TypeScript errors in batch commands
- Type mismatches in test files
- Pre-existing component errors

## Success Criteria
✅ All checkboxes above should pass
✅ No console errors related to new features
✅ Smooth navigation without page reloads
✅ All keyboard shortcuts work as expected
✅ Export functionality works for PNG, JPG, SVG
✅ Shift key constrains rectangles to squares

## Browser Testing
Test in multiple browsers:
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari (if available)

## Performance Check
- [ ] No lag when drawing shapes
- [ ] Smooth preview during drag
- [ ] Fast tool switching
- [ ] Quick export generation

## Accessibility Check
- [ ] All buttons have tooltips
- [ ] Keyboard navigation works
- [ ] Proper ARIA labels (title attributes)
- [ ] Focus states visible

## Final Verification
After testing all items above:
- [ ] All features work as documented
- [ ] No regressions in existing functionality
- [ ] Professional feel achieved
- [ ] Ready for production use

---

## If Issues Found

### Logo Not Showing
**Fix**: Check if `/logo.png` exists in public folder
```bash
ls h:\Sratup\ projects\Dreamer\frontend\public\logo.png
```

### Routing Not Working
**Fix**: Verify react-router-dom installed
```bash
npm list react-router-dom
```

### Keyboard Shortcuts Not Working
**Check**: Console for any JavaScript errors
**Verify**: Not typing in input field when pressing shortcuts

### Export Fails
**Check**: Canvas has content before exporting
**Verify**: Browser allows downloads (check popup blocker)

### Shift Key Not Constraining
**Check**: Hold Shift WHILE dragging, not before
**Verify**: Works only with Rectangle tool (not other shapes)

---

## Developer Notes

### Architecture
- React Router v6 for navigation
- useNavigate hook for programmatic navigation
- BrowserRouter for client-side routing
- No page reloads (SPA behavior)

### Export Implementation
- SVG → Canvas → PNG/JPG conversion
- Uses createObjectURL for downloads
- Cleanup with revokeObjectURL after download

### Keyboard Shortcuts
- Global listener on window
- Checks if typing in input (ignores if yes)
- Event.preventDefault() to avoid browser defaults

### Shift Constraint
- Detected in pointermove event
- Calculates max(abs(dx), abs(dy))
- Applies to both preview and final shape
