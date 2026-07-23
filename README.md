# PrintRocket LDM-SVG — Phase 1

## Setup
1. Install dependencies:
   pip install -r requirements.txt

2. Add your API key:
   Open .env and set:

   GOOGLE_API_KEY=your_google_ai_studio_key_here
   OPENAI_API_KEY=your_openai_key_here

   GOOGLE_API_KEY: from aistudio.google.com (free, 500 images/day)

   OPENAI_API_KEY or OPENAI_BASE_URL+key: for text encoding

   OpenAI-compatible text settings:
   OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
   TEXT_MODEL=gemini-2.0-flash
   IMAGE_MODEL=gemini-2.0-flash

3. Run the server:
   uvicorn api.orchestrator:app --host 0.0.0.0 --port 8000

## Test the pipeline
Send this to POST http://localhost:8000/generate-design

{
  "prompt": "Diwali sale poster 50% off electronics bold style",
  "brandKit": {
    "primaryColor": "#FF6B00",
    "secondaryColor": "#FFD700",
    "fontFamily": "Arial",
    "logoUrl": "https://your-cdn.com/logo.png",
    "tone": "festive"
  },
  "targetSize": { "width": 1080, "height": 1080, "unit": "px" },
  "outputFormat": "svg",
  "sessionHistory": []
}

## Expected response
Returns DesignOutput with composedSVG ready to render or print.

## Architecture
See agents.md for full pipeline documentation.

## Creative Studio Canvas

See `CANVAS_FEATURES.md` for comprehensive feature documentation of the frontend canvas editor.

### Keyboard Shortcuts
Press `Cmd+/` in the editor to view all keyboard shortcuts.

### Frontend Features
- **Frontend**: React + TypeScript + Vite
- **Canvas**: SVG-based with DOM-direct transforms
- **State**: Document Model + Command Pattern + History
- **Performance**: 60 FPS with GPU acceleration

Configure features via `.env`:
```env
VITE_FEATURE_GRID=true
VITE_FEATURE_RULERS=true
VITE_FEATURE_GROUP_ISOLATION=true
```

## Frontend
cd frontend
npm install
npm run dev

Opens at http://localhost:3000
Backend must be running at http://localhost:8000

### Workspace authentication and projects

The dashboard is the authenticated entry point and is built with Astryx. Copy
`frontend/.env.example` to `frontend/.env.local`, then provide the public Clerk
and Supabase values. Do not put service-role keys in the browser environment.

Apply `supabase/migrations/20260715170000_create_projects.sql` to your Supabase
project. Configure Clerk as a Supabase third-party auth provider so its JWT
contains the `sub` claim used by the row-level-security policies. Once set up,
sign-in and sign-up redirect to `/dashboard`; the editor is protected at
`/editor`.
