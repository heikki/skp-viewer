# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SKP Viewer is a macOS desktop app for viewing SketchUp (.skp) 3D model files. It uses **Electrobun** as the app framework (similar to Electron but uses Bun runtime instead of Node.js) with a **Three.js** WebGL frontend.

## Build & Development Commands

```bash
# Build the native C++ bridge library (must run first, or after changing skp-bridge.mm)
bun run build:native

# Build and run the full desktop app in dev mode
bun run dev

# Build and install production app to /Applications/
bun run install:app

# Type checking, linting, formatting
bun run typecheck
bun run lint
bun run format
```

The native library requires the SketchUp SDK framework at `resources/sdk/SketchUpAPI.framework`.

## Architecture

### Three-layer architecture

1. **Native layer** (`resources/native/skp-bridge.mm`) — Objective-C++ that uses the SketchUp C API to parse .skp files. Compiled to `libskpviewer.dylib`. Outputs JSON with mesh data (positions, normals, indices, UVs, colors, textures, groups, layers). Converts SketchUp's Z-up inches to Three.js Y-up meters.

2. **App process** (`src/app/`) — Bun-side backend running in Electrobun. Loads the native dylib via `bun:ffi` through `resources/native/native-bridge.ts`. Serves a local HTTP server with API routes (`/api/open`, `/api/textures/*`, `/api/pick-file`, `/api/state`). Persists settings (window frame, last file, view state) in SQLite via `bun:sqlite`.

3. **Client/webview** (`src/client/`) — Browser-side frontend. Three.js viewer renders the model. Lit web components for UI (toolbar, layer panel, loading overlay). Communicates with app process via fetch to the local HTTP server.

### Path aliases

TypeScript path aliases are configured in both `tsconfig.json` and `electrobun.config.ts`:

- `@common/*` → `src/client/common/*`
- `@native/*` → `resources/native/*`

### Key data flow

1. User opens a .skp file → client fetches `/api/open?path=...` (or `/api/pick-file` to trigger a native file picker)
2. App process calls native bridge → parses SKP → returns `SkpModelData` JSON
3. Textures are extracted to a temp directory, served via `/api/textures/`
4. Client receives mesh data → batches by color/texture per group → creates Three.js geometries
5. View state (camera, hidden groups) is persisted via `/api/state` to SQLite

### UI components (Lit web components)

- `<viewer-toolbar>` — Open file, wireframe toggle, reset camera, model stats
- `<layer-panel>` — Toggle visibility of top-level groups
- `<loading-overlay>` — Loading spinner during model load

### Event system

Components communicate via custom DOM events defined in `src/client/common/events.ts` (`ModelLoadedEvent`, `ToggleGroupEvent`, etc.).
