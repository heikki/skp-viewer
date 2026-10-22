import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { getTextureDir, readSkpFile } from '@native/native-bridge';
import {
  ApplicationMenu,
  BrowserView,
  BrowserWindow,
  Utils
} from 'electrobun/main';

import { getSetting, openAppDb, setSetting } from './app-db';
import { enterUrl, newWindowKey, windowOnly } from './window-only';

// Detect dev build
const resourcesDir = resolve(dirname(process.argv0), '..', 'Resources');
let isDev = false;
try {
  const versionInfo = (await Bun.file(
    join(resourcesDir, 'version.json')
  ).json()) as { channel?: string };
  isDev = versionInfo.channel === 'dev';
} catch {
  // ignore
}

// Open database. Installed, it lives in a directory named for the app, not
// Utils.paths.userData, which is <bundle id>/<channel> and shared with
// Electrobun's own files.
const dataDir = isDev
  ? join(resolve(resourcesDir, '..', '..', '..', '..', '..'), 'data')
  : join(Utils.paths.appData, 'SKP Viewer');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
openAppDb(dataDir);

// Locate bundled view files
const appDir = join(resourcesDir, 'app');
const viewsDir = join(appDir, 'views', 'app');

// `rel` within `dir`, or null if it climbs out: a URL path is decoded before
// it gets here, so an encoded `..` would otherwise reach any file on disk.
function within(dir: string, rel: string) {
  const root = resolve(dir);
  const path = resolve(root, `.${sep}${rel}`);
  return path.startsWith(root + sep) ? path : null;
}

function serveStaticFile(decodedPath: string): Response | null {
  if (decodedPath === '/' || decodedPath === '/index.html') {
    return new Response(Bun.file(join(viewsDir, 'index.html')));
  }

  const path = within(viewsDir, decodedPath);
  if (path === null) return null;
  const viewFile = Bun.file(path);
  if (viewFile.size > 0) return new Response(viewFile);

  return null;
}

// API route handlers
function handleOpen(url: URL): Response {
  const filePath = url.searchParams.get('path');
  if (filePath === null || filePath === '') {
    return Response.json({ error: 'Missing path' }, { status: 400 });
  }
  try {
    const data = readSkpFile(filePath);
    setSetting('lastFile', filePath);
    return Response.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

// The file to reopen on launch. Checked for existence here rather than in the
// client: a file that has been moved or deleted since should land the app in an
// empty viewport, not an error.
function handleLastFile(): Response {
  const filePath = getSetting('lastFile');
  if (filePath === null || !existsSync(filePath)) {
    return Response.json({ path: null });
  }
  return Response.json({ path: filePath });
}

function handleTexture(url: URL): Response {
  const texName = decodeURIComponent(
    url.pathname.replace('/api/textures/', '')
  );
  const texDir = getTextureDir();
  if (texDir === '') {
    return new Response('No textures loaded', { status: 404 });
  }
  const path = within(texDir, texName);
  if (path === null) return new Response('Texture not found', { status: 404 });
  const texFile = Bun.file(path);
  if (texFile.size > 0) {
    return new Response(texFile);
  }
  return new Response('Texture not found', { status: 404 });
}

async function handlePickFile(): Promise<Response> {
  const result = await Utils.openFileDialog({
    allowedFileTypes: '.skp',
    canChooseFiles: true,
    canChooseDirectory: false,
    allowsMultipleSelection: false
  });
  const path = Array.isArray(result) && result.length > 0 ? result[0]! : null;
  return Response.json({ path });
}

async function handleState(req: Request): Promise<Response> {
  if (req.method === 'GET') {
    const raw = getSetting('viewState');
    if (raw === null) return Response.json(null);
    return Response.json(JSON.parse(raw) as unknown);
  }
  if (req.method === 'PUT') {
    const body: unknown = await req.json();
    setSetting('viewState', JSON.stringify(body));
    return Response.json({ ok: true });
  }
  return new Response('Method not allowed', { status: 405 });
}

async function route(req: Request) {
  const url = new URL(req.url);

  if (url.pathname === '/api/open') return handleOpen(url);
  if (url.pathname === '/api/last-file') return handleLastFile();
  if (url.pathname.startsWith('/api/textures/')) return handleTexture(url);
  if (url.pathname === '/api/pick-file') return await handlePickFile();
  if (url.pathname === '/api/state') return await handleState(req);

  const decodedPath = decodeURIComponent(url.pathname);
  return (
    serveStaticFile(decodedPath) ?? new Response('Not Found', { status: 404 })
  );
}

// Start local server. It reads any .skp path and file on request, so only the
// app's window gets in: loopback only, and a per-launch key (see windowOnly).
const windowKey = newWindowKey();
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: windowOnly(windowKey, route)
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

// Restore saved window frame or use defaults
const defaultFrame = { x: 100, y: 100, width: 1200, height: 800 };
let savedFrame = defaultFrame;
try {
  const raw = getSetting('window');
  if (raw !== null) savedFrame = JSON.parse(raw) as typeof defaultFrame;
} catch {
  // use defaults
}

const win = new BrowserWindow<typeof rpc>({
  title: 'SKP Viewer',
  url: enterUrl(server.url, windowKey),
  frame: savedFrame,
  rpc
});

// Debounce-save window frame on move/resize
let frameTimer: ReturnType<typeof setTimeout> | null = null;
function saveWindowFrame() {
  if (frameTimer !== null) clearTimeout(frameTimer);
  frameTimer = setTimeout(() => {
    const frame = win.getFrame();
    setSetting('window', JSON.stringify(frame));
  }, 500);
}

win.on('move', () => {
  saveWindowFrame();
});
win.on('resize', () => {
  saveWindowFrame();
});
