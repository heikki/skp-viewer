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
bun run cert --create   # once per machine
bun install:app
```

`install:app` signs the app with a self-signed identity, which is what gives it
a stable code identity: macOS pins permission grants to that identity, and
prompts and System Settings entries name "SKP Viewer" rather than "launcher".
The certificate does not need to be trusted — `CSSMERR_TP_NOT_TRUSTED` is
expected. The SketchUp framework is copied into the app bundle, so the
installed app keeps working if this checkout moves or goes away.

To hand the Mac back the state it had before the app was ever installed —
app, its data, and its permission grants — use `bun run reset:install`
(`--keep-state` preserves the window frame, last file and camera).
