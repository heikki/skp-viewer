import { css, html, LitElement } from 'lit';
import { customElement, state as litState } from 'lit/decorators.js';

import {
  ModelLoadedEvent,
  OpenFileEvent,
  ResetCameraEvent,
  ToggleWireframeEvent
} from '@common/events';
import type { SkpModelData } from '@common/types';

@customElement('viewer-toolbar')
export class ViewerToolbar extends LitElement {
  @litState() private _wireframe = false;
  @litState() private _meshCount = 0;
  @litState() private _vertexCount = 0;
  @litState() private _triangleCount = 0;
  @litState() private _loading = false;
  @litState() private _fileName = '';

  static override styles = css`
    :host {
      position: fixed;
      top: 12px;
      left: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 100;
    }

    .toolbar {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    button {
      background: rgba(30, 30, 50, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #e0e0e0;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-family: inherit;
      backdrop-filter: blur(8px);
      transition: background 0.15s;
    }

    button:hover {
      background: rgba(50, 50, 80, 0.9);
    }

    button.active {
      background: rgba(80, 80, 140, 0.9);
      border-color: rgba(120, 120, 200, 0.5);
    }

    .info {
      background: rgba(30, 30, 50, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      color: rgba(200, 200, 220, 0.8);
      backdrop-filter: blur(8px);
      line-height: 1.5;
    }

    .loading {
      color: rgba(150, 150, 255, 0.9);
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener('model-loading', () => {
      this._loading = true;
    });
    document.addEventListener(ModelLoadedEvent.type, ((e: ModelLoadedEvent) => {
      this._updateStats(e.data);
    }) as EventListener);
  }

  private _updateStats(data: SkpModelData) {
    this._meshCount = data.meshCount;
    this._vertexCount = data.vertexCount;
    this._triangleCount = data.triangleCount;
    this._loading = false;
  }

  private readonly _onOpen = async () => {
    try {
      const res = await fetch('/api/pick-file');
      const { path } = (await res.json()) as { path: string | null };
      if (path !== null) {
        this._fileName = path.split('/').pop() ?? path;
        document.dispatchEvent(new OpenFileEvent(path));
      }
    } catch (err) {
      console.error('Failed to pick file:', err);
    }
  };

  private readonly _onToggleWireframe = () => {
    this._wireframe = !this._wireframe;
    document.dispatchEvent(new ToggleWireframeEvent());
  };

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this -- event handler bound to template
  private readonly _onResetCamera = () => {
    document.dispatchEvent(new ResetCameraEvent());
  };

  override render() {
    return html`
      <div class="toolbar">
        <button @click=${this._onOpen}>Open SKP</button>
        <button
          class=${this._wireframe ? 'active' : ''}
          @click=${this._onToggleWireframe}
        >
          Wireframe
        </button>
        <button @click=${this._onResetCamera}>Reset Camera</button>
      </div>
      ${
        this._loading
          ? html`<div class="info loading">Loading model...</div>`
          : this._meshCount > 0
            ? html`<div class="info">
                ${this._fileName === '' ? '' : html`<div>${this._fileName}</div>`}
                <div>
                  ${this._meshCount.toLocaleString()} meshes &middot;
                  ${this._vertexCount.toLocaleString()} vertices &middot;
                  ${this._triangleCount.toLocaleString()} triangles
                </div>
              </div>`
            : ''
      }
    `;
  }
}
