import { GOOGLE_SANS_STACK } from './fonts';
import { createStatusIcon, setStatusIcon } from './material-icons';
import {
  registerDismissiblePanel,
  unregisterDismissiblePanel,
  type DismissiblePanel,
} from './panel-dismiss';
import {
  STATUS_COLORS,
  STATUS_OPTIONS,
  type SlideStatus,
} from './status';

const CHIP_CLASS = 'progress-status-chip';
const STYLE_ID = 'progress-status-chip-styles';

const CHIP_STYLES = `
  :host {
    all: initial;
    anchor-name: --status-chip;
    position: absolute;
    top: 1px;
    right: 1px;
    z-index: 5;
    pointer-events: auto;
    font-family: ${GOOGLE_SANS_STACK};
  }

  .chip-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    margin: 0;
    border: 0;
    border-radius: 999px;
    background: #fff;
    box-shadow: none;
    cursor: pointer;
    transition:
      transform 120ms ease,
      box-shadow 120ms ease;
  }

  .chip-button:hover {
    transform: scale(1.1);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.22);
  }

  .chip-button[data-editable="false"] {
    cursor: default;
  }

  .chip-button[data-editable="false"]:hover {
    transform: none;
    box-shadow: none;
  }

  .chip-icon {
    display: block;
    width: 22px;
    height: 22px;
    color: var(--chip-color, #9aa0a6);
  }

  .status-panel {
    position: fixed;
    position-anchor: --status-chip;
    top: anchor(top);
    left: anchor(right);
    right: auto;
    bottom: auto;
    margin-inline-start: 6px;
    position-try-fallbacks: flip-inline, flip-block;
    width: max-content;
    min-width: 148px;
    padding: 4px;
    border: 1px solid #dadce0;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
  }

  .status-panel[popover]:not(:popover-open) {
    display: none !important;
  }

  .status-panel:popover-open {
    display: inline-flex;
    flex-direction: column;
    align-items: stretch;
  }

  .status-option {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    box-sizing: border-box;
    padding: 5px 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #202124;
    font: 13px/1.2 ${GOOGLE_SANS_STACK};
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }

  .status-option:hover {
    background: #f1f3f4;
  }

  .status-option:disabled {
    cursor: default;
  }

  .status-option:disabled:hover {
    background: transparent;
  }

  .status-option[aria-current="true"] {
    background: #f8f9fa;
  }

  .status-option[aria-current="true"]:hover {
    background: #f1f3f4;
  }

  .status-option[aria-current="true"]:disabled:hover {
    background: #f8f9fa;
  }

  .option-icon {
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
  }
`;

export type StatusChangeHandler = (
  slideKey: string,
  status: SlideStatus,
) => void | Promise<void>;

export type StatusChipElement = HTMLElement & {
  setSlideKey: (slideKey: string) => void;
  setStatus: (status: SlideStatus) => void;
  setEditable: (editable: boolean) => void;
};

let onStatusChange: StatusChangeHandler = async () => {};

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

function supportsPopover(): boolean {
  return typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype;
}

function showPanel(panel: HTMLElement): void {
  try {
    panel.showPopover();
  } catch {
    // Popover API unavailable.
  }
}

function hidePanel(panel: HTMLElement): void {
  try {
    panel.hidePopover();
  } catch {
    // Popover API unavailable or already closed.
  }
}

export function defineStatusChip(handler: StatusChangeHandler): void {
  onStatusChange = handler;
}

export function createStatusChip(
  slideKey: string,
  status: SlideStatus,
): StatusChipElement {
  const host = document.createElement('div') as unknown as StatusChipElement;
  host.className = CHIP_CLASS;

  const shadow = host.attachShadow({ mode: 'open' });
  ensureChipStyles(shadow);

  let currentKey = slideKey;
  let currentStatus: SlideStatus = status;
  let editable = true;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'chip-button';
  button.setAttribute('aria-label', 'Slide status');

  const icon = createStatusIcon(status, { className: 'chip-icon' });
  button.append(icon);

  const panel = document.createElement('div');
  panel.id = `status-panel-${Math.random().toString(36).slice(2)}`;
  panel.className = 'status-panel';
  if (supportsPopover()) {
    panel.setAttribute('popover', 'manual');
  } else {
    panel.hidden = true;
  }

  let panelOpen = false;

  const dismissPanel: DismissiblePanel = {
    roots: [host],
    close: () => setPanelOpen(false),
  };

  const setPanelOpen = (open: boolean) => {
    if (open) {
      registerDismissiblePanel(dismissPanel);
    } else {
      unregisterDismissiblePanel(dismissPanel);
    }

    panelOpen = open;
    if (supportsPopover()) {
      if (open) {
        showPanel(panel);
      } else {
        hidePanel(panel);
      }
      return;
    }

    panel.hidden = !open;
  };

  button.addEventListener('click', (event) => {
    stopSlideInteraction(event);
    if (!editable) {
      return;
    }
    setPanelOpen(!panelOpen);
  });

  if (supportsPopover()) {
    panel.addEventListener('toggle', (event) => {
      panelOpen = (event as ToggleEvent).newState === 'open';
    });
  }

  for (const option of STATUS_OPTIONS) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'status-option';
    item.dataset.status = option.value;

    const optionIcon = createStatusIcon(option.value, {
      className: 'option-icon',
      color: STATUS_COLORS[option.value],
    });

    const label = document.createElement('span');
    label.textContent = option.label;

    item.append(optionIcon, label);
    item.addEventListener('click', (event) => {
      stopSlideInteraction(event);
      if (!editable) {
        return;
      }
      setPanelOpen(false);
      currentStatus = option.value;
      render();
      void onStatusChange(currentKey, option.value);
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

  const render = () => {
    const color = STATUS_COLORS[currentStatus];
    const statusLabel =
      STATUS_OPTIONS.find((item) => item.value === currentStatus)?.label ??
      'No status';
    button.dataset.status = currentStatus;
    button.dataset.editable = editable ? 'true' : 'false';
    button.style.setProperty('--chip-color', color);
    setStatusIcon(icon, currentStatus, color);
    button.setAttribute(
      'aria-label',
      editable
        ? `Slide status: ${statusLabel}`
        : `Slide status: ${statusLabel}. View only`,
    );
    if (editable) {
      button.removeAttribute('title');
    } else {
      button.title = 'View only. You need edit access to change this status.';
      setPanelOpen(false);
    }

    for (const option of panel.querySelectorAll<HTMLButtonElement>(
      '.status-option',
    )) {
      const isCurrent = option.dataset.status === currentStatus;
      option.setAttribute('aria-current', isCurrent ? 'true' : 'false');
      option.disabled = !editable;
    }
  };

  host.setSlideKey = (nextKey) => {
    currentKey = nextKey;
  };
  host.setStatus = (nextStatus) => {
    currentStatus = nextStatus;
    render();
  };
  host.setEditable = (nextEditable) => {
    editable = nextEditable;
    render();
  };

  shadow.append(button, panel);
  render();
  return host;
}

export const STATUS_CHIP_SELECTOR = `.${CHIP_CLASS}`;
