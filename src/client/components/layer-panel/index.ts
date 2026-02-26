import { css, html, LitElement, nothing } from 'lit';
import { customElement, state as litState } from 'lit/decorators.js';

import { ModelLoadedEvent, ToggleGroupEvent } from '@common/events';
import type { SkpModelData } from '@common/types';

@customElement('layer-panel')
export class LayerPanel extends LitElement {
  @litState() private _groups: string[] = [];
  @litState() private _visibility = new Map<string, boolean>();
  @litState() private _collapsed = false;

  static override styles = css`
    :host {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 100;
    }

    .panel {
      background: rgba(30, 30, 50, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 6px;
      backdrop-filter: blur(8px);
      min-width: 180px;
      max-height: calc(100vh - 40px);
      display: flex;
      flex-direction: column;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      cursor: pointer;
      user-select: none;
    }

    .header:hover {
      background: rgba(50, 50, 80, 0.5);
    }

    .header span {
      font-size: 13px;
      font-weight: 500;
      color: #e0e0e0;
    }

    .chevron {
      font-size: 11px;
      color: rgba(200, 200, 220, 0.6);
      transition: transform 0.15s;
    }

    .chevron.collapsed {
      transform: rotate(-90deg);
    }

    .group-list {
      overflow-y: auto;
      padding: 4px 0;
    }

    label {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 12px;
      font-size: 12px;
      color: rgba(200, 200, 220, 0.9);
      cursor: pointer;
      transition: background 0.1s;
    }

    label:hover {
      background: rgba(50, 50, 80, 0.5);
    }

    input[type='checkbox'] {
      accent-color: rgba(120, 120, 200, 0.8);
      margin: 0;
    }

    .group-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener(ModelLoadedEvent.type, ((e: ModelLoadedEvent) => {
      this._onModelLoaded(e.data, e.hiddenGroups);
    }) as EventListener);
  }

  private _onModelLoaded(data: SkpModelData, hiddenGroups?: Set<string>) {
    this._groups = [...data.groups].sort((a, b) => a.localeCompare(b));
    const vis = new Map<string, boolean>();
    for (const group of this._groups) {
      const visible = !(hiddenGroups?.has(group) ?? false);
      vis.set(group, visible);
    }
    this._visibility = vis;
  }

  private _onToggle(groupName: string) {
    const current = this._visibility.get(groupName) ?? true;
    const next = !current;
    const vis = new Map(this._visibility);
    vis.set(groupName, next);
    this._visibility = vis;
    document.dispatchEvent(new ToggleGroupEvent(groupName, next));
  }

  private readonly _toggleCollapse = () => {
    this._collapsed = !this._collapsed;
  };

  /** Returns the current visibility map for all groups */
  getVisibility(): Map<string, boolean> {
    return new Map(this._visibility);
  }

  override render() {
    if (this._groups.length <= 1) return nothing;

    return html`
      <div class="panel">
        <div class="header" @click=${this._toggleCollapse}>
          <span>Groups (${this._groups.length})</span>
          <span class="chevron ${this._collapsed ? 'collapsed' : ''}"
            >&#9660;</span
          >
        </div>
        ${this._collapsed
          ? nothing
          : html`
              <div class="group-list">
                ${this._groups.map(
                  (group) => html`
                    <label>
                      <input
                        type="checkbox"
                        .checked=${this._visibility.get(group) ?? true}
                        @change=${() => {
                          this._onToggle(group);
                        }}
                      />
                      <span class="group-name">${group}</span>
                    </label>
                  `
                )}
              </div>
            `}
      </div>
    `;
  }
}
