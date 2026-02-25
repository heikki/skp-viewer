import { dirname, join, resolve } from 'node:path';

const { ApplicationMenu, BrowserView, BrowserWindow } =
  await import('electrobun/bun');

import { readSkpFile } from '../../resources/native/native-bridge';

// Detect dev build
const resourcesDir = resolve(dirname(process.argv0), '..', 'Resources');
let isDev = false;
try {
  const versionInfo: { channel?: string } = await Bun.file(
    join(resourcesDir, 'version.json')
  ).json();
  isDev = versionInfo.channel === 'dev';
} catch {
  // ignore
}

// Find project root (where Mökki.skp lives)
function findProjectRoot(): string {
  if (isDev) {
    return resolve(resourcesDir, '..', '..', '..', '..', '..');
  }
  return resolve(resourcesDir, '..');
}

const projectRoot = findProjectRoot();
const defaultSkpPath = join(projectRoot, 'Mökki.skp');

// Locate bundled view files
const appDir = join(resourcesDir, 'app');
const viewsDir = join(appDir, 'views', 'app');

function serveStaticFile(decodedPath: string): Response | null {
  if (decodedPath === '/' || decodedPath === '/index.html') {
    return new Response(Bun.file(join(viewsDir, 'index.html')));
  }

  const viewFile = Bun.file(join(viewsDir, decodedPath));
  if (viewFile.size > 0) return new Response(viewFile);

  return null;
}

// Start local server
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/api/open') {
      const filePath = url.searchParams.get('path');
      if (!filePath) {
        return Response.json({ error: 'Missing path' }, { status: 400 });
      }

      try {
        const data = readSkpFile(filePath);
        return Response.json(data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return Response.json({ error: msg }, { status: 500 });
      }
    }

    if (url.pathname === '/api/default-model') {
      const file = Bun.file(defaultSkpPath);
      if (file.size > 0) {
        return Response.json({ path: defaultSkpPath });
      }
      return Response.json({ path: null });
    }

    // Serve bundled view files
    const decodedPath = decodeURIComponent(url.pathname);
    return (
      serveStaticFile(decodedPath) ?? new Response('Not Found', { status: 404 })
    );
  }
});

const baseUrl = `http://127.0.0.1:${server.port}`;
console.log(`Server running at ${baseUrl}`);

// Application menu
ApplicationMenu.setApplicationMenu([
  {
    label: 'SKP Viewer',
    submenu: [
      { label: 'About SKP Viewer', action: 'about' },
      { type: 'divider' },
      {
        label: 'Quit SKP Viewer',
        action: 'quit',
        accelerator: 'CmdOrCtrl+Q'
      }
    ]
  },
  {
    label: 'File',
    submenu: [
      {
        label: 'Open...',
        action: 'open-file',
        accelerator: 'CmdOrCtrl+O'
      },
      { type: 'divider' },
      {
        label: 'Close Window',
        role: 'close',
        accelerator: 'CmdOrCtrl+W'
      }
    ]
  },
  {
    label: 'Edit',
    submenu: [
      { label: 'Copy', role: 'copy', accelerator: 'CmdOrCtrl+C' },
      { label: 'Select All', role: 'selectAll', accelerator: 'CmdOrCtrl+A' }
    ]
  },
  {
    label: 'Window',
    submenu: [
      { label: 'Minimize', role: 'minimize', accelerator: 'CmdOrCtrl+M' }
    ]
  }
]);

// Handle menu actions
interface ElectrobunEvent {
  data?: { action?: string };
}

ApplicationMenu.on('application-menu-clicked', (event: unknown) => {
  const action = (event as ElectrobunEvent).data?.action ?? '';
  switch (action) {
    case 'quit':
      process.exit(0);
      break;
    case 'open-file':
      // Trigger file open in the webview via navigation
      // The webview toolbar handles the actual file picker
      break;
  }
});

// RPC type definition
interface AppRPC {
  bun: {
    requests: Record<string, never>;
    messages: Record<string, never>;
  };
  webview: {
    requests: Record<string, never>;
    messages: Record<string, never>;
  };
}

const rpc = BrowserView.defineRPC<AppRPC>({
  handlers: {
    requests: {},
    messages: {}
  }
});

const win = new BrowserWindow<typeof rpc>({
  title: 'SKP Viewer',
  url: baseUrl,
  frame: { x: 100, y: 100, width: 1200, height: 800 },
  rpc
});
