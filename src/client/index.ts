import '@components/index';

import {
  ModelLoadedEvent,
  ResetCameraEvent,
  ToggleGroupEvent,
  ToggleWireframeEvent
} from '@common/events';
import type { SkpModelData } from '@common/types';

import {
  fitCameraToModel,
  initViewer,
  loadModel,
  resetCamera,
  setGroupVisibility,
  toggleWireframe
} from './viewer';

const container = document.getElementById('viewer-container')!;
initViewer(container);

// Event listeners
document.addEventListener(ToggleWireframeEvent.type, () => {
  toggleWireframe();
});

document.addEventListener(ResetCameraEvent.type, () => {
  resetCamera();
});

document.addEventListener(ToggleGroupEvent.type, ((e: ToggleGroupEvent) => {
  setGroupVisibility(e.groupName, e.visible);
}) as EventListener);

// Groups hidden by default
const defaultHidden = new Set(['Sekalaista']);

// Load model from API
async function openModel(path: string) {
  try {
    const res = await fetch(`/api/open?path=${encodeURIComponent(path)}`);
    const data: SkpModelData = await res.json();
    if ('error' in data) {
      console.error('Failed to load model:', (data as { error: string }).error);
      return;
    }
    loadModel(data, defaultHidden);
    document.dispatchEvent(new ModelLoadedEvent(data));
  } catch (err) {
    console.error('Failed to load model:', err);
  }
}

// Load default model on startup
async function init() {
  try {
    const res = await fetch('/api/default-model');
    const { path } = await res.json();
    if (path) {
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
  if (file?.name.endsWith('.skp')) {
    const path = (file as unknown as { path?: string }).path;
    if (path) {
      void openModel(path);
    }
  }
});

void init();
