import type { DeckCounts } from './counts';
import { STATUS_COLORS, type SlideStatus } from './status';
import type { SyncState } from './storage';

const BADGE_TAG = 'progress-deck-badge';
const STYLE_ID = 'progress-deck-badge-styles';

const BADGE_STYLES = `
  :host {
    all: initial;
    display: inline-flex;
    align-items: center;
    margin-left: 8px;
    font-family: "Google Sans", Roboto, Arial, sans-serif;
  }

  .badge-wrap {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .percent-button {
    anchor-name: --progress-badge;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border: 1px solid #dadce0;
    border-radius: 999px;
    background: #fff;
    color: #202124;
    font: 12px/1 "Google Sans", Roboto, Arial, sans-serif;
    cursor: default;
  }

  .progress-ring {
    width: 14px;
    height: 14px;
    border-radius: 999px;
    background:
      radial-gradient(farthest-side, #fff 72%, transparent 73% 100%),
      conic-gradient(#34a853 calc(var(--percent, 0) * 1%), #e8eaed 0);
  }

  .sync-button {
    padding: 4px 8px;
    border: 0;
    border-radius: 6px;
    background: #e8f0fe;
    color: #1a73e8;
    font: 12px/1 "Google Sans", Roboto, Arial, sans-serif;
    cursor: pointer;
  }

  .sync-button[data-state="synced"] {
    background: transparent;
    color: #5f6368;
    cursor: default;
  }

  .sync-button[data-state="error"] {
    background: #fce8e6;
    color: #c5221f;
  }

  .detail-panel {
    position-anchor: --progress-badge;
    top: anchor(bottom);
    left: anchor(left);
    position-try: flip-block;
    margin: 6px 0 0;
    min-width: 180px;
    padding: 10px 12px;
    border: 1px solid #dadce0;
    border-radius: 10px;
    background: #fff;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
  }

  .detail-title {
    margin: 0 0 8px;
    color: #5f6368;
    font: 11px/1.2 "Google Sans", Roboto, Arial, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .detail-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 0;
    color: #202124;
    font: 13px/1.3 "Google Sans", Roboto, Arial, sans-serif;
  }

  .detail-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    border: 2px solid var(--dot-color);
    flex: 0 0 auto;
  }

  .dot[data-status]:not([data-status="none"]) {
    background: var(--dot-color);
    border-color: var(--dot-color);
  }
`;

let badgeDefined = false;
let hideHintTimer: number | null = null;

function supportsInterestInvokers(): boolean {
  return 'interestForElement' in HTMLButtonElement.prototype;
}

function ensureBadgeStyles(shadow: ShadowRoot): void {
  if (shadow.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = BADGE_STYLES;
  shadow.append(style);
}

export type SignInHandler = () => void | Promise<void>;

export function defineDeckBadge(onSignIn: SignInHandler): void {
  if (badgeDefined || customElements.get(BADGE_TAG)) {
    badgeDefined = true;
    return;
  }

  class ProgressDeckBadge extends HTMLElement {
    #percentButton: HTMLButtonElement | null = null;
    #syncButton: HTMLButtonElement | null = null;
    #detailPanel: HTMLDivElement | null = null;
    #detailBody: HTMLDivElement | null = null;
    #counts: DeckCounts = {
      total: 0,
      done: 0,
      percent: 0,
      rows: [],
    };
    #syncState: SyncState = {
      signedIn: false,
      lastSyncAt: 0,
      error: null,
    };

    connectedCallback(): void {
      const shadow = this.attachShadow({ mode: 'open' });
      ensureBadgeStyles(shadow);

      const wrap = document.createElement('div');
      wrap.className = 'badge-wrap';

      const percentButton = document.createElement('button');
      percentButton.type = 'button';
      percentButton.className = 'percent-button';

      const ring = document.createElement('span');
      ring.className = 'progress-ring';
      ring.setAttribute('aria-hidden', 'true');

      const label = document.createElement('span');
      label.className = 'percent-label';
      label.textContent = '0%';

      percentButton.append(ring, label);

      const detailPanel = document.createElement('div');
      detailPanel.className = 'detail-panel';
      detailPanel.setAttribute('popover', 'hint');
      detailPanel.id = `progress-detail-${Math.random().toString(36).slice(2)}`;

      const detailTitle = document.createElement('p');
      detailTitle.className = 'detail-title';
      detailTitle.textContent = 'Slide status breakdown';

      const detailBody = document.createElement('div');
      detailBody.className = 'detail-body';

      detailPanel.append(detailTitle, detailBody);

      const syncButton = document.createElement('button');
      syncButton.type = 'button';
      syncButton.className = 'sync-button';
      syncButton.textContent = 'Sign in to sync';
      syncButton.addEventListener('click', async () => {
        await onSignIn();
      });

      if (supportsInterestInvokers()) {
        percentButton.setAttribute('interestfor', detailPanel.id);
      } else {
        const showHint = () => {
          if (hideHintTimer) {
            window.clearTimeout(hideHintTimer);
            hideHintTimer = null;
          }
          detailPanel.showPopover();
        };

        const scheduleHide = () => {
          hideHintTimer = window.setTimeout(() => {
            detailPanel.hidePopover();
          }, 180);
        };

        percentButton.addEventListener('pointerenter', showHint);
        percentButton.addEventListener('focus', showHint);
        percentButton.addEventListener('pointerleave', scheduleHide);
        percentButton.addEventListener('blur', scheduleHide);
        detailPanel.addEventListener('pointerenter', showHint);
        detailPanel.addEventListener('pointerleave', scheduleHide);
      }

      wrap.append(percentButton, syncButton);
      shadow.append(wrap, detailPanel);

      this.#percentButton = percentButton;
      this.#syncButton = syncButton;
      this.#detailPanel = detailPanel;
      this.#detailBody = detailBody;
      this.render();
    }

    setCounts(counts: DeckCounts): void {
      this.#counts = counts;
      this.render();
    }

    setSyncState(syncState: SyncState): void {
      this.#syncState = syncState;
      this.render();
    }

    render(): void {
      if (
        !this.#percentButton ||
        !this.#syncButton ||
        !this.#detailBody ||
        !this.#detailPanel
      ) {
        return;
      }

      const ring = this.#percentButton.querySelector<HTMLElement>(
        '.progress-ring',
      );
      const label = this.#percentButton.querySelector<HTMLElement>(
        '.percent-label',
      );

      if (ring) {
        ring.style.setProperty('--percent', String(this.#counts.percent));
      }

      if (label) {
        label.textContent = `${this.#counts.percent}%`;
      }

      this.#percentButton.setAttribute(
        'aria-label',
        `Slide progress: ${this.#counts.percent} percent complete`,
      );

      this.#detailBody.replaceChildren();
      for (const row of this.#counts.rows) {
        const line = document.createElement('div');
        line.className = 'detail-row';

        const left = document.createElement('span');
        left.className = 'detail-label';

        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.dataset.status = row.status;
        dot.style.setProperty('--dot-color', STATUS_COLORS[row.status]);

        const text = document.createElement('span');
        text.textContent = row.label;

        const count = document.createElement('strong');
        count.textContent = String(row.count);

        left.append(dot, text);
        line.append(left, count);
        this.#detailBody.append(line);
      }

      const syncButton = this.#syncButton;
      if (!this.#syncState.signedIn) {
        syncButton.dataset.state = 'signed-out';
        syncButton.textContent = 'Sign in to sync';
        syncButton.disabled = false;
      } else if (this.#syncState.error) {
        syncButton.dataset.state = 'error';
        syncButton.textContent = 'Sync error';
        syncButton.disabled = false;
      } else {
        syncButton.dataset.state = 'synced';
        syncButton.textContent = 'Synced';
        syncButton.disabled = true;
      }
    }
  }

  customElements.define(BADGE_TAG, ProgressDeckBadge);
  badgeDefined = true;
}

export function createDeckBadge(): HTMLElement & {
  setCounts: (counts: DeckCounts) => void;
  setSyncState: (syncState: SyncState) => void;
} {
  return document.createElement(BADGE_TAG) as HTMLElement & {
    setCounts: (counts: DeckCounts) => void;
    setSyncState: (syncState: SyncState) => void;
  };
}

export const DECK_BADGE_SELECTOR = BADGE_TAG;
