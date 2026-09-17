import type { ElectrobunConfig } from 'electrobun';

export default {
  app: {
    name: 'SKP Viewer',
    identifier: 'com.skpviewer.app',
    version: '1.0.0'
  },

  runtime: {
    exitOnLastWindowClosed: true
  },

  build: {
    // Not the 2.x default of 'cottontail': the app process opens the native
    // SketchUp bridge through bun:ffi and persists settings in bun:sqlite, so
    // it is not portable JavaScript. Electrobun packages its own pinned Bun
    // for this.
    mainProcess: 'bun',

    bun: {
      entrypoint: 'src/app/index.ts'
    },

    views: {
      app: {
        entrypoint: 'src/client/index.ts'
      }
    },

    copy: {
      'src/client/index.html': 'views/app/index.html',
      'src/client/styles.css': 'views/app/styles.css',
      'resources/native/libskpviewer.dylib': 'libskpviewer.dylib',
      // The SketchUp SDK travels with the app: libskpviewer.dylib links
      // @rpath/SketchUpAPI.framework, and its other rpath is the absolute
      // resources/sdk path this machine built it with. Copying the framework in
      // beside the dylib — which is what @loader_path resolves to — is what
      // makes the installed app independent of the checkout, and what lets
      // library validation pass under the hardened runtime.
      'resources/sdk/SketchUpAPI.framework': 'SketchUpAPI.framework'
    },

    mac: {
      defaultRenderer: 'native',
      icons: 'resources/icon.iconset',

      // Signing runs for stable builds only; a dev build is never signed,
      // whatever this says, so the signed path is `bun run install:app`. The
      // identity comes from ELECTROBUN_DEVELOPER_ID, defaulted in that script
      // to the self-signed one `bun run cert --create` makes. Signing gives the
      // app a stable code identity, which is what makes a file-access grant
      // persist across launches and makes the prompt say "SKP Viewer" instead
      // of "launcher".
      //
      // notarize stays false because that needs a real Developer ID
      // certificate; ours is the self-signed local identity.
      codesign: true,
      notarize: false,
      entitlements: {
        // Bun's runtime JITs, so the hardened runtime needs both of these or
        // the signed `bun` process is killed on launch.
        'com.apple.security.cs.allow-jit': true,
        'com.apple.security.cs.allow-unsigned-executable-memory': true,
        // Hutch's default, and it has to stay on with a self-signed identity:
        // library validation matches on TEAM ID, and a self-signed certificate
        // has none. Turning it off gets the app killed at startup on the first
        // dlopen — Electrobun's own libElectrobunCore.dylib — with "mapping
        // process and mapped file (non-platform) have different Team IDs",
        // before libskpviewer.dylib or the SketchUp framework are even reached.
        'com.apple.security.cs.disable-library-validation': true
      }
    }
  }
} satisfies ElectrobunConfig;
