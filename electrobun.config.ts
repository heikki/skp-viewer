import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ElectrobunConfig } from 'electrobun';

const baseDir = resolve('.');

function resolveWithExtensions(basePath: string): string {
  for (const ext of ['', '.ts', '.tsx', '.js', '/index.ts', '/index.js']) {
    const candidate = basePath + ext;
    if (existsSync(candidate)) return candidate;
  }
  return basePath;
}

const pathAliasPlugin = {
  name: 'tsconfig-paths',
  setup(build: {
    onResolve: (
      opts: { filter: RegExp },
      cb: (args: { path: string }) => { path: string }
    ) => void;
  }) {
    build.onResolve({ filter: /^@common\// }, (args: { path: string }) => ({
      path: resolveWithExtensions(
        resolve(baseDir, 'src/client/common', args.path.replace('@common/', ''))
      )
    }));

    build.onResolve({ filter: /^@native\// }, (args: { path: string }) => ({
      path: resolveWithExtensions(
        resolve(baseDir, 'resources/native', args.path.replace('@native/', ''))
      )
    }));
  }
};

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
    bun: {
      entrypoint: 'src/app/index.ts',
      plugins: [pathAliasPlugin]
    },

    views: {
      app: {
        entrypoint: 'src/client/index.ts',
        plugins: [pathAliasPlugin]
      }
    },

    copy: {
      'src/client/index.html': 'views/app/index.html',
      'src/client/styles.css': 'views/app/styles.css',
      'resources/native/libskpviewer.dylib': 'libskpviewer.dylib'
    },

    mac: {
      defaultRenderer: 'native'
    }
  }
} satisfies ElectrobunConfig;
