import { css, html, LitElement } from 'lit';
import { customElement, state as litState } from 'lit/decorators.js';

import { ModelLoadedEvent } from '@common/events';

@customElement('loading-overlay')
export class LoadingOverlay extends LitElement {
  @litState() private _visible = false;

  static override styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 1000;
      pointer-events: none;
    }

    .backdrop {
      position: absolute;
      inset: 0;
      background: rgba(10, 10, 20, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.3s;
    }

    .backdrop.hidden {
      opacity: 0;
    }

    .spinner-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(255, 255, 255, 0.15);
      border-top-color: rgba(180, 180, 220, 0.8);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .label {
      font-size: 14px;
      color: rgba(200, 200, 220, 0.8);
      font-family: system-ui, sans-serif;
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener(ModelLoadedEvent.type, () => {
      this._visible = false;
    });
    document.addEventListener('model-loading', () => {
      this._visible = true;
    });
    // Without this a file that fails to parse leaves the overlay up for the
    // rest of the session, covering the toolbar that would let you pick
    // another one.
    document.addEventListener('model-load-failed', () => {
      this._visible = false;
    });
  }

  override render() {
    return html`
      <div class="backdrop ${this._visible ? '' : 'hidden'}">
        <div class="spinner-container">
          <div class="spinner"></div>
          <span class="label">Loading model...</span>
        </div>
      </div>
    `;
  }
}
