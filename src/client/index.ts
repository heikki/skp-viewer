import '@components/index';

import {
  ModelLoadedEvent,
  ResetCameraEvent,
  ToggleGroupEvent,
  ToggleWireframeEvent
} from '@common/events';
import type { SkpModelData } from '@common/types';

import {
  getCameraState,
  initViewer,
  loadModel,
  onCameraChange,
  resetCamera,
  setCameraState,
  setGroupVisibility,
  toggleWireframe
} from './viewer';

const container = document.getElementById('viewer-container')!;
initViewer(container);

// Current file path for per-file state
let currentFilePath: string | null = null;

// View state type
interface ViewState {
  file: string;
  hiddenGroups: string[];
  camera: {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  };
}

// Event listeners
document.addEventListener(ToggleWireframeEvent.type, () => {
  toggleWireframe();
});

document.addEventListener(ResetCameraEvent.type, () => {
  resetCamera();
});

document.addEventListener(ToggleGroupEvent.type, ((e: ToggleGroupEvent) => {
  setGroupVisibility(e.groupName, e.visible);
  debounceSaveState();
}) as EventListener);

// Debounced state saving
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function debounceSaveState() {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void saveState();
  }, 1000);
}

async function saveState() {
  if (currentFilePath === null) return;

  // Collect hidden groups from layer-panel visibility
  const layerPanel = document.getElementById('layer-panel') as HTMLElement & {
    getVisibility?: () => Map<string, boolean>;
  };
  const hiddenGroups: string[] = [];
  if (layerPanel.getVisibility !== undefined) {
    for (const [name, visible] of layerPanel.getVisibility()) {
      if (!visible) hiddenGroups.push(name);
    }
  }

  const state: ViewState = {
    file: currentFilePath,
    hiddenGroups,
    camera: getCameraState()
  };

  try {
    await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state)
    });
  } catch {
    // ignore save errors
  }
}

async function loadSavedState(): Promise<ViewState | null> {
  try {
    const res = await fetch('/api/state');
    return (await res.json()) as ViewState | null;
  } catch {
    return null;
  }
}

// Load model from API
async function openModel(path: string) {
  document.dispatchEvent(new Event('model-loading'));
  try {
    const res = await fetch(`/api/open?path=${encodeURIComponent(path)}`);
    const data = (await res.json()) as SkpModelData;
    if ('error' in data) {
      console.error('Failed to load model:', (data as { error: string }).error);
      return;
    }

    currentFilePath = path;

    // Check saved state for this file
    const savedState = await loadSavedState();
    const hasState = savedState !== null && savedState.file === path;
    const hiddenGroups = hasState
      ? new Set(savedState.hiddenGroups)
      : undefined;

    loadModel(data, hiddenGroups);
    document.dispatchEvent(new ModelLoadedEvent(data, hiddenGroups));

    // Restore camera if we have state for this file
    if (hasState) {
      setCameraState(savedState.camera);
    }
  } catch (err) {
    console.error('Failed to load model:', err);
  }
}

// Listen for camera changes
onCameraChange(() => {
  debounceSaveState();
});

// Load default model on startup
async function init() {
  try {
    const res = await fetch('/api/default-model');
    const { path } = (await res.json()) as { path: string | null };
    if (path !== null) {
      await openModel(path);
    }
  } catch (err) {
    console.error('No default model:', err);
  }
}

// File drop support
document.addEventListener('dragover', (e) => {
  e.preventDefault();
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files[0];
  if (file?.name.endsWith('.skp') === true) {
    const path = (file as unknown as { path?: string }).path;
    if (path !== undefined && path !== '') {
      void openModel(path);
    }
  }
});

void init();
