# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SKP Viewer is a macOS desktop app for viewing SketchUp (.skp) 3D model files. It uses **Electrobun** as the app framework (similar to Electron but uses Bun runtime instead of Node.js) with a **Three.js** WebGL frontend.

## Build & Development Commands

```bash
# Generate the Electrobun SDK sysroot in .hutch/ (once per clone;
# needed by both builds and typecheck)
bun run sync

# Build the native C++ bridge library (must run first, or after changing skp-bridge.mm)
bun run build:native

# Build and run the full desktop app in dev mode
bun run dev

# Create the self-signed code-signing identity (once per machine)
bun run cert --create

# Build and install the signed production app to /Applications/
bun run install:app

# Remove the installed app, its data and its permission grants
bun run reset:install

# Type checking, linting, formatting
bun run typecheck
bun run lint
bun run format
```

The native library requires the SketchUp SDK framework at `resources/sdk/SketchUpAPI.framework`.

### Signing and permissions

`--env=stable` builds are signed with the self-signed identity `bun run cert --create` puts in the login keychain, passed through `ELECTROBUN_DEVELOPER_ID`; dev builds are never signed. Signing is what gives the app a stable code identity — macOS keys permission grants on identity plus bundle id, so without it a grant is forgotten between launches and the prompt names "launcher", the self-extractor stub.

Signing turns on the hardened runtime, which brings two consequences:

- `com.apple.security.cs.disable-library-validation` must stay on. Library validation matches on **Team ID**, and a self-signed certificate has none, so the first `dlopen` — Electrobun's own `libElectrobunCore.dylib` — is rejected with "mapping process and mapped file (non-platform) have different Team IDs" and the app dies at startup.
- `allow-jit` and `allow-unsigned-executable-memory` are required because Bun's runtime JITs.

`SketchUpAPI.framework` is copied into the bundle beside `libskpviewer.dylib`, and `build:native` gives the dylib an `@loader_path` rpath ahead of the absolute `resources/sdk` one. The installed app therefore carries its own SDK instead of resolving it out of this checkout.

`scripts/finalize-stable.sh` runs between the build and the copy to `/Applications`: it sets `ELECTROBUN_INSTALLER_UI_AUTOCLOSE` on the self-extractor stub so its "Installation complete" panel dismisses itself, then re-signs the bundle, since patching `Info.plist` invalidates the signature.

Electrobun 2.x builds through Hutch, which projects the SDK into a generated, gitignored `.hutch/devkit/` sysroot instead of `node_modules`. `tsconfig.json` maps `electrobun` into it through `paths`; without `bun run sync` those imports don't resolve and `tsc` fails. `build.mainProcess` stays `'bun'` (not the 2.x default of `'cottontail'`) because the app process needs `bun:ffi` and `bun:sqlite`.

## Architecture

### Three-layer architecture

1. **Native layer** (`resources/native/skp-bridge.mm`) — Objective-C++ that uses the SketchUp C API to parse .skp files. Compiled to `libskpviewer.dylib`. Outputs JSON with mesh data (positions, normals, indices, UVs, colors, textures, groups, layers). Converts SketchUp's Z-up inches to Three.js Y-up meters.

2. **App process** (`src/app/`) — Bun-side backend running in Electrobun. Loads the native dylib via `bun:ffi` through `resources/native/native-bridge.ts`. Serves a local HTTP server with API routes (`/api/open`, `/api/textures/*`, `/api/pick-file`, `/api/state`). Persists settings (window frame, last file, view state) in SQLite via `bun:sqlite`.

3. **Client/webview** (`src/client/`) — Browser-side frontend. Three.js viewer renders the model. Lit web components for UI (toolbar, layer panel, loading overlay). Communicates with app process via fetch to the local HTTP server.

### Path aliases

TypeScript path aliases live only in `tsconfig.json` — Electrobun's bundler reads them from there:

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
