import type { SkpModelData } from './types';

export class ModelLoadedEvent extends Event {
  static readonly type = 'model-loaded';
  constructor(
    public readonly data: SkpModelData,
    public readonly hiddenGroups?: Set<string>
  ) {
    super(ModelLoadedEvent.type, { bubbles: true });
  }
}

export class ToggleWireframeEvent extends Event {
  static readonly type = 'toggle-wireframe';
  constructor() {
    super(ToggleWireframeEvent.type, { bubbles: true });
  }
}

export class ResetCameraEvent extends Event {
  static readonly type = 'reset-camera';
  constructor() {
    super(ResetCameraEvent.type, { bubbles: true });
  }
}

export class OpenFileEvent extends Event {
  static readonly type = 'open-file';
  constructor(public readonly path: string) {
    super(OpenFileEvent.type, { bubbles: true });
  }
}

export class ToggleGroupEvent extends Event {
  static readonly type = 'toggle-group';
  constructor(
    public readonly groupName: string,
    public readonly visible: boolean
  ) {
    super(ToggleGroupEvent.type, { bubbles: true });
  }
}

declare global {
  interface HTMLElementEventMap {
    'model-loaded': ModelLoadedEvent;
    'toggle-wireframe': ToggleWireframeEvent;
    'reset-camera': ResetCameraEvent;
    'open-file': OpenFileEvent;
    'toggle-group': ToggleGroupEvent;
  }
}
