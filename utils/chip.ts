import {
  STATUS_COLORS,
  STATUS_OPTIONS,
  type SlideStatus,
} from './status';

const CHIP_TAG = 'progress-status-chip';
const STYLE_ID = 'progress-status-chip-styles';

const CHIP_STYLES = `
  :host {
    all: initial;
    position: absolute;
    top: 4px;
    right: 4px;
    z-index: 5;
    font-family: "Google Sans", Roboto, Arial, sans-serif;
  }

  .chip-button {
    anchor-name: --status-chip;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border-radius: 999px;
    border: 2px solid var(--chip-color, #9aa0a6);
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    cursor: pointer;
  }

  .chip-button[data-status="none"] {
    background: rgba(255, 255, 255, 0.95);
  }

  .chip-button[data-status]:not([data-status="none"]) {
    background: var(--chip-color);
    border-color: var(--chip-color);
  }

  .chip-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: transparent;
  }

  .chip-button[data-status]:not([data-status="none"]) .chip-dot {
    background: #fff;
  }

  .status-panel {
    position-anchor: --status-chip;
    position-area: block-end span-inline-end;
    inset: auto;
    position-try-fallbacks: flip-block, flip-inline;
    margin: 4px 0 0;
    min-width: 148px;
    padding: 6px;
    border: 1px solid #dadce0;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
  }

  .status-option {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #202124;
    font: 13px/1.2 "Google Sans", Roboto, Arial, sans-serif;
    text-align: left;
    cursor: pointer;
  }

  .status-option:hover,
  .status-option[aria-current="true"] {
    background: #f1f3f4;
  }

  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    border: 2px solid var(--swatch-color);
    flex: 0 0 auto;
  }

  .swatch[data-status]:not([data-status="none"]) {
    background: var(--swatch-color);
    border-color: var(--swatch-color);
  }
`;

let chipDefined = false;

export type StatusChangeHandler = (
  slideKey: string,
  status: SlideStatus,
) => void | Promise<void>;

function ensureChipStyles(shadow: ShadowRoot): void {
  if (shadow.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CHIP_STYLES;
  shadow.append(style);
}

function stopSlideInteraction(event: Event): void {
  event.stopPropagation();
}

export function defineStatusChip(onStatusChange: StatusChangeHandler): void {
  if (chipDefined || customElements.get(CHIP_TAG)) {
    chipDefined = true;
    return;
  }

  class ProgressStatusChip extends HTMLElement {
    #slideKey = '';
    #status: SlideStatus = 'none';
    #button: HTMLButtonElement | null = null;
    #panel: HTMLDivElement | null = null;

    connectedCallback(): void {
      const shadow = this.attachShadow({ mode: 'open' });
      ensureChipStyles(shadow);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip-button';
      button.setAttribute('aria-label', 'Slide status');

      const dot = document.createElement('span');
      dot.className = 'chip-dot';
      dot.setAttribute('aria-hidden', 'true');
      button.append(dot);

      const panel = document.createElement('div');
      panel.id = `status-panel-${Math.random().toString(36).slice(2)}`;
      panel.className = 'status-panel';
      panel.setAttribute('popover', 'auto');
      button.setAttribute('popovertarget', panel.id);
      button.setAttribute('popovertargetaction', 'toggle');

      for (const option of STATUS_OPTIONS) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'status-option';
        item.dataset.status = option.value;

        const swatch = document.createElement('span');
        swatch.className = 'swatch';
        swatch.dataset.status = option.value;
        swatch.style.setProperty('--swatch-color', STATUS_COLORS[option.value]);

        const label = document.createElement('span');
        label.textContent = option.label;

        item.append(swatch, label);
        item.addEventListener('click', async (event) => {
          stopSlideInteraction(event);
          const nextStatus = option.value;
          await onStatusChange(this.#slideKey, nextStatus);
          panel.hidePopover();
        });

        panel.append(item);
      }

      for (const eventName of [
        'pointerdown',
        'mousedown',
        'click',
        'dragstart',
      ] as const) {
        button.addEventListener(eventName, stopSlideInteraction);
        panel.addEventListener(eventName, stopSlideInteraction);
      }

      shadow.append(button, panel);
      this.#button = button;
      this.#panel = panel;
      this.render();
    }

    setSlideKey(slideKey: string): void {
      this.#slideKey = slideKey;
    }

    setStatus(status: SlideStatus): void {
      this.#status = status;
      this.render();
    }

    render(): void {
      if (!this.#button || !this.#panel) return;

      const color = STATUS_COLORS[this.#status];
      this.#button.dataset.status = this.#status;
      this.#button.style.setProperty('--chip-color', color);
      this.#button.setAttribute(
        'aria-label',
        `Slide status: ${STATUS_OPTIONS.find((item) => item.value === this.#status)?.label ?? 'No status'}`,
      );

      for (const option of this.#panel.querySelectorAll<HTMLButtonElement>(
        '.status-option',
      )) {
        const isCurrent = option.dataset.status === this.#status;
        option.setAttribute('aria-current', isCurrent ? 'true' : 'false');
      }
    }
  }

  customElements.define(CHIP_TAG, ProgressStatusChip);
  chipDefined = true;
}

export function createStatusChip(
  slideKey: string,
  status: SlideStatus,
): HTMLElement {
  const chip = document.createElement(CHIP_TAG) as HTMLElement & {
    setSlideKey: (slideKey: string) => void;
    setStatus: (status: SlideStatus) => void;
  };
  chip.setSlideKey(slideKey);
  chip.setStatus(status);
  return chip;
}

export const STATUS_CHIP_SELECTOR = CHIP_TAG;
