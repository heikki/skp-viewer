# SKP Viewer

A macOS app for viewing SketchUp (.skp) 3D model files.

![SKP Viewer screenshot](screenshot.png)

## Setup

Requires macOS, [Bun](https://bun.sh/), and the [SketchUp SDK](https://extensions.sketchup.com/sketchup-sdk) extracted to `resources/sdk/SketchUpAPI.framework`.

```bash
bun install
bun run sync
bun dev
```

Electrobun 2.x keeps its SDK in a generated `.hutch/` sysroot rather than
`node_modules`, so `bun run sync` is needed once per clone — before any build
and before `bun run typecheck`.

To build and install to `/Applications`:

```bash
bun install:app
```
