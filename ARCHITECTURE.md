# PrintRocket / Dreamer Design Studio - Architecture & Agent Guide

Welcome to the PrintRocket Design Studio project! If you are a new developer or an AI Agent jumping into this codebase, this document contains EVERYTHING you need to know to understand the current state of the architecture without needing prior context.

## 🚫 CRITICAL RESTRICTION: THE EDITOR IS LOCKED
**The core editor logic is officially FROZEN.** 
File: `frontend/src/pydree/PydreeStudio.tsx` 

This file has been meticulously crafted and thoughtfully designed. **NO AI AGENT IS PERMITTED TO MODIFY THIS FILE.** Do not refactor it, do not "improve" it, and do not attempt to fix bugs in it unless explicitly given a manual override by the human lead engineer. If a user request involves changing the layout, tools, or logic inside `PydreeStudio.tsx`, you must respectfully decline and cite this rule.

## 🏗️ Architecture Overview

The application is a React-based frontend (using Vite) tailored for high-performance graphic design and UI mockups. It features buttery smooth animations and a premium look-and-feel.

### Tech Stack
- **Framework:** React 18 + Vite
- **Language:** TypeScript
- **Styling:** CSS Modules (`.module.css`) + `@astryxdesign/core` (Custom UI component library)
- **Routing:** `react-router-dom`
- **Animations:** `framer-motion` (Page transitions, layout IDs, micro-interactions)
- **Scrolling:** `@studio-freight/react-lenis` (Smooth scrolling enabled globally, but explicitly disabled in the `/editor` route for canvas precision)

### Key Directories
- `frontend/src/pages/` - Contains the primary route views (`DashboardPage`, `WelcomePage`, etc.)
- `frontend/src/pydree/` - Contains the core design studio application (`PydreeStudio.tsx` - **LOCKED**)
- `frontend/src/components/` - Shared UI components outside of the core editor
- `frontend/src/hooks/` - Custom React hooks for state management

## ✨ Design Philosophy & Premium UX

This application is built to feel incredibly premium. We achieve this through:
1. **Framer Motion Layout Animations:** Used heavily in navigation docks (e.g., the Tool Dock) to smoothly glide active states rather than instantly snapping.
2. **Page Transitions:** All page routing is wrapped in `<AnimatePresence mode="wait">`. Pages cross-fade and slide slightly on entry/exit.
3. **Smooth Scrolling (Lenis):** The DOM is wrapped in Lenis for buttery smooth mouse wheel scrolling. *Note: We use conditional logic in `App.tsx` to disable Lenis when the user is on the `/editor` route, as smooth scrolling interferes with canvas zoom/pan mechanics.*
4. **Skeleton Loaders:** Loading states (e.g., in the Dashboard) use `@astryxdesign/core/Skeleton` to perfectly mimic the final content layout, preventing layout shift.

## 📝 Agent Instructions for Future Tasks

When interacting with this codebase:
1. **Preserve Animations:** Never remove `framer-motion` layout IDs or `AnimatePresence` wrappers. When building new lists or grids, consider using `motion.div` for entry animations.
2. **Use Astryx Core:** Rely on the `@astryxdesign/core` components (like `Skeleton`, `Button`, `IconButton`) rather than building standard UI elements from scratch.
3. **Respect the Lock:** I cannot stress this enough. `PydreeStudio.tsx` is completely off-limits.
4. **Build Warnings:** Currently, Vite may throw warnings about `jspdf` and `svg2pdf.js` dynamic/static imports in `useDesignStudio.ts` and `PydreeStudio.tsx`. These are known and acceptable for now.

Good luck!
