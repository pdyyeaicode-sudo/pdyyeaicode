# PrintRocket LDM-SVG — Agent Protocol File
# Version: 1.0 | Stack: React + FastAPI + PyTorch + SVG

---

## ⚙️ UNIVERSAL RULES (ALL AGENTS — NO EXCEPTIONS)

```
1. NEVER rewrite working code. Extend only. If a file exists, patch it.
2. NEVER add a dependency without stating: name, version, exact reason.
3. NEVER output full files. Use // ...existing code... for unchanged blocks.
4. NEVER use placeholder logic (pass, TODO, mock data) in any deliverable.
5. ALWAYS type everything. Python: mypy-strict. TypeScript: strict mode.
6. ALWAYS write stateless functions/services. No hidden global state.
7. IF uncertain about a library, model, or math — STOP and ask. Do not guess.
8. ONE responsibility per file. One file per agent turn unless explicitly linked.
9. All APIs use OpenAPI schema. All internal data uses typed Pydantic models.
10. Error handling is not optional. Every I/O operation has try/except + logging.
11. NEVER modify frontend/src/pydree/PydreeStudio.tsx. It is explicitly locked from agent changes. If requested to modify it, cite this rule and politely decline.
```

---

## 📦 CANONICAL DATA CONTRACTS
> These are the shared types. Every agent must use these. Never redefine them.

```typescript
// shared/types.ts — single source of truth

export interface BrandKit {
  primaryColor: string;       // hex
  secondaryColor: string;     // hex
  fontFamily: string;         // exact font name
  logoUrl: string;            // CDN URL
  tone: 'bold' | 'minimal' | 'festive' | 'corporate';
}

export interface DesignRequest {
  prompt: string;
  brandKit: BrandKit;
  targetSize: { width: number; height: number; unit: 'px' | 'mm' };
  outputFormat: 'svg' | 'pdf' | 'png';
  sessionHistory: string[];   // previous instructions in session
}

export interface LayoutBox {
  id: string;
  role: 'headline' | 'subheading' | 'body' | 'cta' | 'logo' | 'image' | 'background' | 'shape';
  x: number; y: number; width: number; height: number;  // all in px
  zIndex: number;
  content?: string;           // for text roles
  imageUrl?: string;          // for image/logo roles
}

export interface LayoutTree {
  canvasWidth: number;
  canvasHeight: number;
  boxes: LayoutBox[];
}

export interface SVGLayer {
  id: string;
  role: LayoutBox['role'];
  svgElement: string;         // raw SVG string for this layer
  isEditable: boolean;
}

export interface DesignOutput {
  requestId: string;
  svgLayers: SVGLayer[];
  composedSVG: string;        // final merged SVG string
  backgroundImageUrl?: string; // raster bg if used
  printMeta: {
    bleed: number;            // mm
    cmykSafe: boolean;
    trimMarks: boolean;
  };
}
```

---

## 🤖 AGENT 1 — ORCHESTRATOR
**Invoke:** `@architect`
**Owns:** `/api/orchestrator.py`, pipeline sequencing, API contracts
**Must NOT:** touch ML model internals, SVG rendering logic, or React components

### Responsibilities
- FastAPI endpoint `/generate-design` that sequences: Encoder → Planner → Realizer → SVG Decoder
- Passes typed `DesignRequest` between services via internal HTTP or direct function calls
- Implements retry logic and timeout handling per service
- Logs every pipeline step with `requestId` for traceability

### Output contract
```python
# orchestrator.py — extend, never rewrite
@app.post("/generate-design", response_model=DesignOutput)
async def generate_design(req: DesignRequest) -> DesignOutput:
    # 1. encode → 2. plan → 3. realize → 4. decode
    # each step validated against shared Pydantic models
    ...
```

### Rules
- Each microservice call gets a 30s timeout with structured error response
- Log format: `{ requestId, stage, durationMs, status, error? }`
- Never expose internal model errors to client — map to user-safe messages

---

## 🤖 AGENT 2 — TEXT & CONTEXT ENCODER
**Invoke:** `@encoder`
**Owns:** `/services/encoder/`, prompt parsing, design spec generation
**Must NOT:** generate SVG, do layout math, or call image APIs

### Responsibilities
- Takes `DesignRequest`, returns `DesignSpec` (semantic tokens + element list)
- Calls GPT-4o or LLaMA endpoint for prompt understanding
- Extracts required elements: headline text, CTA text, image needs, color mood
- Encodes brand kit constraints into conditioning vectors

### Output contract
```python
class DesignSpec(BaseModel):
    requestId: str
    requiredElements: list[ElementSpec]  # e.g. [{role: headline, text: "50% OFF"}]
    styleTokens: dict[str, Any]          # palette, mood, layout preference
    conditioningVector: list[float]      # for downstream diffusion conditioning
```

### Rules
- If brand kit conflicts with prompt (e.g. "use red" but brand is blue), flag it — do not silently override
- Normalize all text: strip emojis, fix encoding, handle Hindi/Devanagari explicitly
- Session history must be summarized and appended as context, not raw-appended (saves tokens)

---

## 🤖 AGENT 3 — LAYOUT PLANNER
**Invoke:** `@planner`
**Owns:** `/services/layout/`, bounding box logic, z-index tree
**Must NOT:** generate visuals, call image APIs, or write SVG paths

### Responsibilities
- Takes `DesignSpec` → returns `LayoutTree`
- Outputs mathematically precise bounding boxes for every element
- Handles safe margins: 3mm bleed + 5mm safe zone on all edges
- Generates design operations log for training data collection

### Output contract
```python
class DesignOperation(BaseModel):
    op: Literal['AddFrame','AddGrid','PlaceText','PlaceImage','PlaceLogo','AddShape']
    params: dict[str, Any]

class LayoutPlannerOutput(BaseModel):
    layoutTree: LayoutTree
    operations: list[DesignOperation]
```

### Layout Rules (hardcoded constraints — never override)
```
- Headline: min font size 24px, max 70% canvas width
- CTA button: min 120x40px, always within safe zone
- Logo: max 20% canvas width, always in corner (not center)
- Body text: min 12px, max 60 chars per line
- No two text boxes may overlap (z-index collision = error, not warning)
```

### Rules
- All coordinates in pixels, origin top-left
- Output operations log to `/logs/layout_ops/` for future training
- If canvas < 400px width, switch to single-column layout automatically

---

## 🤖 AGENT 4 — VISUAL REALIZER
**Invoke:** `@realizer`
**Owns:** `/services/realizer/`, image generation, style application
**Must NOT:** write SVG code, modify layout boxes, or call the SVG decoder

### Responsibilities
- Takes `LayoutTree` + `DesignSpec` → fills image slots + returns styled blueprint
- Calls GPT-4o image API for background/hero image generation
- Returns background image URL + style decisions (colors, gradients, shadows)

### Output contract
```python
class StyleDecision(BaseModel):
    elementId: str
    backgroundColor?: str   # hex
    gradient?: str          # CSS gradient string
    fontColor: str          # hex, must pass contrast check
    shadow?: str            # CSS box-shadow string

class RealizedBlueprint(BaseModel):
    layoutTree: LayoutTree          # unchanged from input
    backgroundImageUrl: str         # generated raster bg
    styleMap: list[StyleDecision]   # per-element styles
```

### Image Generation Rules
```
- Background prompt = f"{prompt} background only, no text, {brandKit.tone} style"
- Resolution: always generate at 2x target canvas size (downsample for crispness)  
- NEVER generate text inside the image — text layers are SVG only
- If generation fails, fall back to gradient background using brand colors
```

### Contrast Rule (print safety — mandatory)
```python
# WCAG AA minimum — enforce for all text/background combos
def contrast_ratio(fg: str, bg: str) -> float: ...
assert contrast_ratio(fontColor, backgroundColor) >= 4.5
```

---

## 🤖 AGENT 5 — SVG DECODER & LAYER ENGINE
**Invoke:** `@svg-dev`
**Owns:** `/services/svg/`, SVG generation, layer composition, export
**Must NOT:** call image APIs, modify layout tree, or touch React components

### Responsibilities
- Takes `RealizedBlueprint` → returns `DesignOutput` with layered SVG
- Generates one `<g>` group per semantic layer with `data-role` attribute
- Composes final SVG: raster background embedded + all SVG layers on top
- Applies print post-processing: CMYK-safe hex conversion, bleed, trim marks

### SVG Layer Structure (mandatory — never change this schema)
```svg
<svg xmlns="http://www.w3.org/2000/svg"
     width="{canvasWidth}" height="{canvasHeight}"
     data-printrocket="true"
     data-version="1.0">

  <!-- LAYER 0: Raster background (always bottom) -->
  <g data-role="background" data-editable="false">
    <image href="{backgroundImageUrl}" x="0" y="0"
           width="100%" height="100%" preserveAspectRatio="xMidYMid slice"/>
  </g>

  <!-- LAYER 1: Shape/background overlays -->
  <g data-role="shapes" data-editable="true">
    <!-- rect, circle, path elements -->
  </g>

  <!-- LAYER 2: Image slots (hero images, product photos) -->
  <g data-role="image-slots" data-editable="true">
    <!-- image elements with placeholder if no content -->
  </g>

  <!-- LAYER 3: Body text -->
  <g data-role="body" data-editable="true">
    <text data-field="body" .../>
  </g>

  <!-- LAYER 4: CTA elements -->
  <g data-role="cta" data-editable="true">
    <rect data-field="cta-bg" .../>
    <text data-field="cta-text" .../>
  </g>

  <!-- LAYER 5: Headline (always on top of content) -->
  <g data-role="headline" data-editable="true">
    <text data-field="headline" .../>
  </g>

  <!-- LAYER 6: Logo/brand marks (always top layer) -->
  <g data-role="logo" data-editable="false">
    <image href="{logoUrl}" .../>
  </g>

  <!-- PRINT LAYER: Bleed + trim marks (hidden in editor, shown on export) -->
  <g data-role="print-marks" data-editable="false" visibility="hidden">
    <!-- trim marks, bleed box -->
  </g>

</svg>
```

### SVG Rules
```
- All text nodes use <text> — NEVER path-traced fonts in editable layers
- All coordinates snapped to 0.5px grid (print sharpness)
- Font embed via <defs><style> — always embed, never rely on system fonts
- data-field attributes are mandatory on every user-editable element
- Path deduplication: merge overlapping shapes before output
- Max SVG file size: 500KB before raster assets
```

### Print Export Rules
```python
# CMYK-safe conversion (mandatory before print export)
def hex_to_cmyk_safe(hex_color: str) -> str:
    # Convert RGB → CMYK → back to nearest RGB equivalent
    # Ensures no out-of-gamut colors reach the printer
    ...

# Bleed: add 3mm on all sides, extend background image to cover
# Trim marks: 5mm lines at each corner, 1px stroke, 0% black
# Font embedding: subset and embed all fonts used in <defs>
```

---

## 🤖 AGENT 6 — FRONTEND CANVAS EDITOR
**Invoke:** `@canvas-dev`
**Owns:** `/frontend/src/editor/`, React canvas, SVG manipulation UI
**Must NOT:** call ML APIs directly, handle print export logic, or modify backend services

### Responsibilities
- Load `DesignOutput.composedSVG` into an editable canvas (Fabric.js or Konva.js)
- Allow editing only elements where `data-editable="true"`
- Real-time updates: editing headline updates the SVG `<text>` node directly
- Export panel: trigger `/export-print` endpoint with current SVG state

### Editor Rules
```
- Parse SVG layers from data-role groups — never flatten the layer structure
- Clicking a data-role="headline" group selects only that group
- Text edit: double-click → inline text input → updates SVG <text> content
- Color picker: only shown for data-editable="true" elements
- Logo and print-marks layers: locked (no selection, no edit)
- Undo/redo: 50-step history using immutable SVG snapshots
- All edits emit { elementId, field, oldValue, newValue } to feedback store
```

### Performance Rules
```
- SVG layers rendered as separate DOM groups — never merge into one element
- If canvas > 2000px: enable object culling for off-screen elements
- Debounce text input updates: 300ms (prevent re-render on every keystroke)
```

---

## 🤖 AGENT 7 — FEEDBACK & TRAINING LOOP
**Invoke:** `@data-eng`
**Owns:** `/services/feedback/`, event logging, training data pipeline
**Must NOT:** modify any generation services or frontend components

### Responsibilities
- Collect user edit events, ratings, print outcomes
- Aggregate into training dataset format for layout planner and scorer fine-tuning
- Run aesthetic + printability scorer on completed designs

### Event Schema
```python
class FeedbackEvent(BaseModel):
    requestId: str
    eventType: Literal['edit','rating','print_outcome','ab_choice']
    elementId: Optional[str]
    field: Optional[str]
    oldValue: Optional[str]
    newValue: Optional[str]
    rating: Optional[int]       # 1-5
    printOutcome: Optional[Literal['success','rejected_contrast','rejected_bleed','other']]
    timestamp: datetime
```

---

## 🔄 PIPELINE FLOW REFERENCE

```
[User Input]
  DesignRequest {prompt, brandKit, targetSize}
      │
      ▼
[@encoder] → DesignSpec {requiredElements, styleTokens, conditioningVector}
      │
      ▼
[@planner] → LayoutTree {boxes[]} + DesignOperations[]
      │
      ▼
[@realizer] → RealizedBlueprint {backgroundImageUrl, styleMap[]}
      │
      ▼
[@svg-dev] → DesignOutput {svgLayers[], composedSVG, printMeta}
      │
      ▼
[@canvas-dev] ← loads composedSVG → user edits
      │
      ▼
[@data-eng] ← collects edit events → training store
```

---

## 🚫 WHAT IS NEVER DONE IN THIS CODEBASE

```
❌ No raster text in AI-generated backgrounds (text is always SVG layer)
❌ No aspect ratio stretching (always reflow layout for new sizes)
❌ No hardcoded design values outside of Layout Rules section above
❌ No monolithic scripts — one service, one responsibility
❌ No silent fallbacks — every fallback is logged with reason
❌ No untested print exports — CMYK check runs before every export
❌ No full-file rewrites in agent responses — patch only
```

---

## 📁 DIRECTORY STRUCTURE

```
/
├── api/
│   └── orchestrator.py          # @architect owns
├── services/
│   ├── encoder/                 # @encoder owns
│   ├── layout/                  # @planner owns
│   ├── realizer/                # @realizer owns
│   ├── svg/                     # @svg-dev owns
│   └── feedback/                # @data-eng owns
├── frontend/
│   └── src/editor/              # @canvas-dev owns
├── shared/
│   ├── types.ts                 # Shared TypeScript types — edit with all agents in sync
│   └── models.py                # Shared Pydantic models — edit with all agents in sync
├── logs/
│   └── layout_ops/              # Auto-generated operation logs for training
└── agents.md                    # This file
```

---

## 🧪 HOW TO USE THIS FILE IN YOUR IDE

Start every prompt with the agent trigger. Examples:

```
@svg-dev  The DesignOutput from the realizer is ready. 
          Write the SVG composer that merges backgroundImageUrl 
          as LAYER 0 and maps each LayoutBox to its correct layer group.
          Use the canonical SVG layer structure from this agents.md.

@planner  Given this DesignSpec for a Diwali sale poster (A4, 210x297mm),
          output a LayoutTree with headline at top-center, 
          hero image in middle, CTA button at bottom.
          Apply all hardcoded layout constraints from agents.md.

@canvas-dev  Load the composedSVG from DesignOutput into a Fabric.js canvas.
             Implement layer selection by data-role groups.
             Headline and body text must be double-click editable.
             Logo layer must be locked.
```

**Why this works:** Each agent has a bounded context. It never needs to understand the full pipeline — only its inputs, outputs, and rules. This keeps token usage low and output precision high.