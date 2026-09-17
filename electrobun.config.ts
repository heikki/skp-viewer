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
      'resources/native/libskpviewer.dylib': 'libskpviewer.dylib'
    },

    mac: {
      defaultRenderer: 'native',
      icons: 'resources/icon.iconset'
    }
  }
} satisfies ElectrobunConfig;
