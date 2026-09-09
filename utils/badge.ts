import type { DeckCounts } from './counts';
import { GOOGLE_SANS_STACK } from './fonts';
import {
  createCompleteIcon,
  createHistoryIcon,
  createProgressRing,
  createStatusIcon,
  setProgressRing,
} from './material-icons';
import {
  registerDismissiblePanel,
  unregisterDismissiblePanel,
  type DismissiblePanel,
} from './panel-dismiss';
import { STATUS_COLORS } from './status';
import type { SyncState } from './sync-state';

const BADGE_CLASS = 'progress-deck-badge';
const STYLE_ID = 'progress-deck-badge-styles';

const BADGE_STYLES = `
  :host {
    all: initial;
    display: inline-flex;
    align-items: center;
    position: relative;
    z-index: 2;
    margin-left: 8px;
    pointer-events: auto;
    font-family: ${GOOGLE_SANS_STACK};
  }

  .badge-wrap {
    anchor-name: --progress-badge;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  @keyframes badge-skeleton {
    0% { background-position: 100% 0; }
    100% { background-position: -100% 0; }
  }

  .percent-button {
    display: none;
    align-items: center;
    gap: 5px;
    padding: 4px 8px 4px 6px;
    border: 1px solid #dadce0;
    border-radius: 999px;
    background: #fff;
    color: #202124;
    font: 12px/1 ${GOOGLE_SANS_STACK};
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .percent-button:hover:not(:disabled) {
    background: #f8f9fa;
  }

  .percent-button:active:not(:disabled) {
    background: #f1f3f4;
  }

  .progress-ring {
    display: block;
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
  }

  .progress-complete-icon {
    display: block;
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
  }

  .badge-wrap[data-complete="true"] .progress-ring {
    display: none;
  }

  .badge-wrap[data-complete="false"] .progress-complete-icon {
    display: none;
  }

  .badge-wrap[data-loading="true"] .percent-button,
  .badge-wrap[data-loading="false"][data-mode="ready"] .percent-button {
    display: inline-flex;
  }

  .badge-wrap[data-loading="true"] .percent-button {
    pointer-events: none;
    cursor: default;
    border-color: transparent;
    background: linear-gradient(
      90deg,
      #e8eaed 25%,
      #f1f3f4 50%,
      #e8eaed 75%
    );
    background-size: 200% 100%;
    animation: badge-skeleton 1.2s ease-in-out infinite;
  }

  .badge-wrap[data-loading="true"] .progress-ring,
  .badge-wrap[data-loading="true"] .progress-complete-icon,
  .badge-wrap[data-loading="true"] .percent-label {
    visibility: hidden;
  }

  .badge-wrap[data-mode="ready"] .sync-button,
  .badge-wrap[data-loading="true"] .sync-button {
    display: none;
  }

  .sync-button {
    display: inline-flex;
    align-items: center;
    padding: 6px 12px;
    border: 0;
    border-radius: 999px;
    background: #e8f0fe;
    color: #1a73e8;
    font: 12px/1 ${GOOGLE_SANS_STACK};
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .sync-button:hover:not(:disabled) {
    background: #d2e3fc;
  }

  .sync-button:active:not(:disabled) {
    background: #aecbfa;
  }

  .sync-button[data-state="signed-out"] {
    padding: 6px 12px;
  }

  .sync-button[data-state="synced"] {
    display: none;
  }

  .sync-button[data-state="error"] {
    background: #fce8e6;
    color: #c5221f;
  }

  .sync-button[data-state="error"]:hover:not(:disabled) {
    background: #f9dedc;
  }

  .sync-button[data-state="error"]:active:not(:disabled) {
    background: #f6d5d3;
  }

  .error-popover {
    position: fixed;
    position-anchor: --progress-badge;
    top: anchor(bottom);
    left: anchor(left);
    position-try: flip-block;
    margin: 6px 0 0;
    max-width: 320px;
    padding: 10px 12px;
    border: 1px solid #dadce0;
    border-radius: 10px;
    background: #fff;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
    color: #202124;
    font: 12px/1.4 ${GOOGLE_SANS_STACK};
  }

  .error-popover[popover]:not(:popover-open) {
    pointer-events: none;
  }

  .error-popover[hidden] {
    display: none !important;
    pointer-events: none;
  }

  .error-popover-message {
    margin: 0 0 8px;
    color: #c5221f;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .error-popover-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .error-reset-button,
  .error-copy-button {
    padding: 4px 10px;
    border: 1px solid #dadce0;
    border-radius: 4px;
    background: #fff;
    font: 500 12px/1 ${GOOGLE_SANS_STACK};
    cursor: pointer;
  }

  .error-reset-button {
    color: #c5221f;
  }

  .error-copy-button {
    color: #1a73e8;
  }

  .error-reset-button:hover:not(:disabled),
  .error-copy-button:hover:not(:disabled) {
    background: #f8f9fa;
  }

  .error-reset-button:disabled,
  .error-copy-button:disabled {
    cursor: default;
    opacity: 0.7;
  }

  .detail-panel {
    position: fixed;
    position-anchor: --progress-badge;
    top: anchor(bottom);
    left: anchor(left);
    position-try: flip-block;
    margin: 6px 0 0;
    min-width: 160px;
    width: max-content;
    padding: 6px;
    border: 1px solid #dadce0;
    border-radius: 10px;
    background: #fff;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
  }

  .detail-panel[popover]:not(:popover-open) {
    pointer-events: none;
  }

  .detail-panel[hidden] {
    display: none !important;
    pointer-events: none;
  }

  .detail-body {
    display: grid;
    grid-template-columns: max-content auto;
    column-gap: 8px;
    row-gap: 6px;
    align-items: center;
    color: #202124;
    font: 13px/1.2 ${GOOGLE_SANS_STACK};
  }

  .detail-row {
    display: contents;
  }

  .detail-label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .detail-count {
    justify-self: end;
    padding-right: 4px;
  }

  .detail-icon {
    display: block;
    width: 20px;
    height: 20px;
    flex: 0 0 auto;
  }

  .reset-button {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    margin: 6px 0 0;
    padding: 6px 0 0;
    border: 0;
    border-top: 1px solid #e8eaed;
    background: transparent;
    color: #9aa0a6;
    font: 13px/1 ${GOOGLE_SANS_STACK};
    text-align: left;
    cursor: pointer;
  }

  .reset-button:hover:not(:disabled) {
    color: #5f6368;
  }

  .reset-button:disabled {
    color: #dadce0;
    cursor: default;
  }

  .reset-button[hidden] {
    display: none;
  }

  .reset-icon {
    display: block;
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
    color: currentColor;
  }

  .reset-dialog {
    width: min(22rem, calc(100vw - 32px));
    padding: 20px;
    border: 0;
    border-radius: 8px;
    background: #fff;
    color: #202124;
    font-family: ${GOOGLE_SANS_STACK};
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  }

  .reset-dialog::backdrop {
    background: rgba(0, 0, 0, 0.32);
  }

  .reset-dialog h2 {
    margin: 0 0 12px;
    font-size: 18px;
    font-weight: 500;
    line-height: 24px;
  }

  .reset-dialog p {
    margin: 0 0 20px;
    color: #5f6368;
    font-size: 14px;
    line-height: 20px;
  }

  .reset-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .reset-dialog button {
    padding: 8px 16px;
    border-radius: 4px;
    font: 500 14px/20px ${GOOGLE_SANS_STACK};
    cursor: pointer;
  }

  .reset-cancel {
    border: 1px solid #dadce0;
    background: #fff;
    color: #1a73e8;
  }

  .reset-cancel:hover:not(:disabled) {
    background: #f8f9fa;
  }

  .reset-confirm {
    border: 0;
    background: #c5221f;
    color: #fff;
  }

  .reset-confirm:hover:not(:disabled) {
    background: #a50e0e;
  }
`;

let onSignIn: SignInHandler = async () => {};
let onResetAll: ResetStatusesHandler = async () => {};

function supportsPopoverToggle(): boolean {
  return typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype;
}

function ensureBadgeStyles(shadow: ShadowRoot): void {
  if (shadow.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = BADGE_STYLES;
  shadow.append(style);
}

function stopTitleBarInteraction(event: Event): void {
  event.stopPropagation();
}

function hidePanel(panel: HTMLElement): void {
  try {
    panel.hidePopover();
  } catch {
    // Popover API unavailable or already closed.
  }
}

function showPanel(panel: HTMLElement): void {
  try {
    panel.showPopover();
  } catch {
    // Popover API unavailable.
  }
}

export type SignInHandler = () => void | Promise<void>;
export type ResetStatusesHandler = () => void | Promise<void>;

export type DeckBadgeElement = HTMLElement & {
  setCounts: (counts: DeckCounts) => void;
  setSyncState: (syncState: SyncState) => void;
  setLoading: (loading: boolean) => void;
  setCanEdit: (canEdit: boolean) => void;
};

export function defineDeckBadge(
  handler: SignInHandler,
  resetHandler: ResetStatusesHandler = async () => {},
): void {
  onSignIn = handler;
  onResetAll = resetHandler;
}

export function createDeckBadge(): DeckBadgeElement {
  const host = document.createElement('div') as unknown as DeckBadgeElement;
  host.className = BADGE_CLASS;

  const shadow = host.attachShadow({ mode: 'open' });
  ensureBadgeStyles(shadow);

  let counts: DeckCounts = {
    total: 0,
    done: 0,
    percent: 0,
    rows: [],
  };
  let syncState: SyncState = {
    signedIn: false,
    lastSyncAt: 0,
    error: null,
  };
  let loading = true;
  let canEdit = true;

  const wrap = document.createElement('div');
  wrap.className = 'badge-wrap';
  wrap.dataset.loading = 'true';

  const percentButton = document.createElement('button');
  percentButton.type = 'button';
  percentButton.className = 'percent-button';

  const ring = createProgressRing({ className: 'progress-ring' });

  const completeIcon = createCompleteIcon({
    className: 'progress-complete-icon',
    color: STATUS_COLORS.done,
  });

  const label = document.createElement('span');
  label.className = 'percent-label';
  label.textContent = '0%';

  percentButton.append(ring, completeIcon, label);

  const detailPanel = document.createElement('div');
  detailPanel.className = 'detail-panel';
  detailPanel.id = `progress-detail-${Math.random().toString(36).slice(2)}`;

  const detailBody = document.createElement('div');
  detailBody.className = 'detail-body';

  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'reset-button';
  resetButton.setAttribute('aria-label', 'Reset all slide statuses to no status');

  resetButton.textContent = '';

  const resetIcon = createHistoryIcon({ className: 'reset-icon' });
  const resetLabel = document.createElement('span');
  resetLabel.className = 'reset-label';
  resetLabel.textContent = 'Reset';
  resetButton.append(resetIcon, resetLabel);

  detailPanel.append(detailBody, resetButton);

  const dialogIds = {
    title: `reset-title-${detailPanel.id}`,
    description: `reset-desc-${detailPanel.id}`,
  };

  const resetDialog = document.createElement('dialog');
  resetDialog.className = 'reset-dialog';
  resetDialog.setAttribute('role', 'alertdialog');
  resetDialog.setAttribute('aria-labelledby', dialogIds.title);
  resetDialog.setAttribute('aria-describedby', dialogIds.description);

  const resetForm = document.createElement('form');
  resetForm.method = 'dialog';

  const resetTitle = document.createElement('h2');
  resetTitle.id = dialogIds.title;
  resetTitle.textContent = 'Reset all slide statuses?';

  const resetDescription = document.createElement('p');
  resetDescription.id = dialogIds.description;
  resetDescription.textContent =
    'Every slide in this presentation will be set to No status. This syncs with collaborators.';

  const resetActions = document.createElement('div');
  resetActions.className = 'reset-actions';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'submit';
  cancelButton.className = 'reset-cancel';
  cancelButton.value = 'cancel';
  cancelButton.textContent = 'Cancel';
  cancelButton.setAttribute('autofocus', '');

  const confirmButton = document.createElement('button');
  confirmButton.type = 'submit';
  confirmButton.className = 'reset-confirm';
  confirmButton.value = 'confirm';
  confirmButton.textContent = 'Reset';

  resetActions.append(cancelButton, confirmButton);
  resetForm.append(resetTitle, resetDescription, resetActions);
  resetDialog.append(resetForm);

  const openResetDialog = () => {
    resetDialog.returnValue = '';
    setPanelOpen(false);
    try {
      resetDialog.showModal();
    } catch {
      if (
        window.confirm(
          'Reset all slide statuses? Every slide in this presentation will be set to No status.',
        )
      ) {
        void onResetAll();
      }
    }
  };

  resetButton.addEventListener('click', (event) => {
    stopTitleBarInteraction(event);
    if (!canEdit) {
      return;
    }
    openResetDialog();
  });

  resetDialog.addEventListener('close', () => {
    const value = resetDialog.returnValue;
    resetDialog.returnValue = '';
    if (value === 'confirm' && canEdit) {
      void onResetAll();
    }
  });

  const syncButton = document.createElement('button');
  syncButton.type = 'button';
  syncButton.className = 'sync-button';
  syncButton.textContent = 'Sign in to use Progress';

  const errorPopover = document.createElement('div');
  errorPopover.className = 'error-popover';
  errorPopover.id = `progress-error-${Math.random().toString(36).slice(2)}`;

  const errorPopoverMessage = document.createElement('p');
  errorPopoverMessage.className = 'error-popover-message';

  const errorPopoverActions = document.createElement('div');
  errorPopoverActions.className = 'error-popover-actions';

  const errorResetButton = document.createElement('button');
  errorResetButton.type = 'button';
  errorResetButton.className = 'error-reset-button';
  errorResetButton.textContent = 'Reset';

  const errorCopyButton = document.createElement('button');
  errorCopyButton.type = 'button';
  errorCopyButton.className = 'error-copy-button';
  errorCopyButton.textContent = 'Copy';

  errorPopoverActions.append(errorResetButton, errorCopyButton);
  errorPopover.append(errorPopoverMessage, errorPopoverActions);

  let errorPopoverHideTimer: number | undefined;
  let copyResetTimer: number | undefined;

  const setErrorPopoverOpen = (open: boolean) => {
    if (!syncState.error) {
      open = false;
    }

    window.clearTimeout(errorPopoverHideTimer);

    if (supportsPopoverToggle()) {
      if (open) {
        showPanel(errorPopover);
      } else {
        hidePanel(errorPopover);
      }
      return;
    }

    errorPopover.hidden = !open;
  };

  const scheduleErrorPopoverHide = () => {
    window.clearTimeout(errorPopoverHideTimer);
    errorPopoverHideTimer = window.setTimeout(() => {
      setErrorPopoverOpen(false);
    }, 120);
  };

  const showErrorPopover = () => {
    if (!syncState.error || loading) {
      return;
    }
    setErrorPopoverOpen(true);
  };

  if (supportsPopoverToggle()) {
    errorPopover.setAttribute('popover', 'manual');
  } else {
    errorPopover.hidden = true;
  }

  syncButton.addEventListener('mouseenter', showErrorPopover);
  syncButton.addEventListener('mouseleave', scheduleErrorPopoverHide);
  syncButton.addEventListener('focus', showErrorPopover);
  syncButton.addEventListener('blur', scheduleErrorPopoverHide);

  errorPopover.addEventListener('mouseenter', showErrorPopover);
  errorPopover.addEventListener('mouseleave', scheduleErrorPopoverHide);

  errorResetButton.addEventListener('click', (event) => {
    stopTitleBarInteraction(event);
    if (!syncState.error || !syncState.signedIn || !canEdit) {
      return;
    }
    setErrorPopoverOpen(false);
    openResetDialog();
  });

  errorCopyButton.addEventListener('click', async (event) => {
    stopTitleBarInteraction(event);
    if (!syncState.error) {
      return;
    }

    errorCopyButton.disabled = true;
    try {
      await navigator.clipboard.writeText(syncState.error);
      errorCopyButton.textContent = 'Copied';
      window.clearTimeout(copyResetTimer);
      copyResetTimer = window.setTimeout(() => {
        errorCopyButton.textContent = 'Copy';
        errorCopyButton.disabled = false;
      }, 1500);
    } catch {
      errorCopyButton.textContent = 'Copy failed';
      window.clearTimeout(copyResetTimer);
      copyResetTimer = window.setTimeout(() => {
        errorCopyButton.textContent = 'Copy';
        errorCopyButton.disabled = false;
      }, 1500);
    }
  });

  syncButton.addEventListener('click', async () => {
    setErrorPopoverOpen(false);
    syncButton.disabled = true;
    syncButton.textContent = syncState.signedIn ? 'Retrying...' : 'Signing in...';
    try {
      await onSignIn();
    } finally {
      render();
    }
  });

  percentButton.setAttribute('aria-haspopup', 'true');
  percentButton.setAttribute('aria-expanded', 'false');

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
    percentButton.setAttribute('aria-expanded', open ? 'true' : 'false');

    if (supportsPopoverToggle()) {
      if (open) {
        showPanel(detailPanel);
      } else {
        hidePanel(detailPanel);
      }
      return;
    }

    detailPanel.hidden = !open;
  };

  if (supportsPopoverToggle()) {
    detailPanel.setAttribute('popover', 'manual');
    detailPanel.addEventListener('toggle', (event) => {
      const { newState } = event as ToggleEvent;
      panelOpen = newState === 'open';
      percentButton.setAttribute(
        'aria-expanded',
        panelOpen ? 'true' : 'false',
      );
    });
  } else {
    detailPanel.hidden = true;
  }

  percentButton.addEventListener('click', (event) => {
    stopTitleBarInteraction(event);
    setPanelOpen(!panelOpen);
  });

  for (const eventName of ['pointerdown', 'mousedown'] as const) {
    percentButton.addEventListener(eventName, stopTitleBarInteraction);
    detailPanel.addEventListener(eventName, stopTitleBarInteraction);
    errorPopover.addEventListener(eventName, stopTitleBarInteraction);
    resetDialog.addEventListener(eventName, stopTitleBarInteraction);
  }

  const render = () => {
    wrap.dataset.loading = loading ? 'true' : 'false';
    wrap.setAttribute('aria-busy', loading ? 'true' : 'false');
    percentButton.disabled = loading;

    if (loading) {
      setPanelOpen(false);
      setErrorPopoverOpen(false);
    }

    const isComplete = counts.percent === 100;
    wrap.dataset.complete = isComplete ? 'true' : 'false';

    setProgressRing(ring, counts.percent);
    label.textContent = `${counts.percent}%`;
    percentButton.setAttribute(
      'aria-label',
      `Slide progress: ${counts.percent} percent complete`,
    );

    detailBody.replaceChildren();

    for (const row of counts.rows) {
      const line = document.createElement('div');
      line.className = 'detail-row';

      const left = document.createElement('span');
      left.className = 'detail-label';

      const icon = createStatusIcon(row.status, {
        className: 'detail-icon',
        color: STATUS_COLORS[row.status],
      });

      const text = document.createElement('span');
      text.textContent = row.label;

      const count = document.createElement('strong');
      count.className = 'detail-count';
      count.textContent = String(row.count);

      left.append(icon, text);
      line.append(left, count);
      detailBody.append(line);
    }

    const isReady = syncState.signedIn && !syncState.error;
    wrap.dataset.mode = isReady ? 'ready' : 'blocked';

    if (syncState.error) {
      errorPopoverMessage.textContent = syncState.error;
      errorResetButton.hidden = !syncState.signedIn || !canEdit;
      errorResetButton.disabled = loading || !syncState.signedIn || !canEdit;
      errorCopyButton.disabled = false;
      errorCopyButton.textContent = 'Copy';
    } else {
      errorPopoverMessage.textContent = '';
      errorResetButton.hidden = true;
      setErrorPopoverOpen(false);
    }

    const noneCount =
      counts.rows.find((row) => row.status === 'none')?.count ?? 0;
    const hasAssignedStatuses = counts.total > 0 && noneCount < counts.total;
    const canReset =
      syncState.signedIn && canEdit && hasAssignedStatuses;
    resetButton.hidden = !canEdit;
    resetButton.disabled = loading || !canReset;
    if (!canEdit && resetDialog.open) {
      resetDialog.returnValue = 'cancel';
      resetDialog.close();
    }

    if (!syncState.signedIn) {
      syncButton.dataset.state = 'signed-out';
      syncButton.textContent = syncState.error
        ? 'Sign-in failed — try again'
        : 'Sign in to use Progress';
      syncButton.disabled = false;
      syncButton.setAttribute(
        'aria-label',
        syncState.error
          ? `Sign-in failed: ${syncState.error}. Hover for details. Click to retry`
          : 'Sign in to use Progress',
      );
    } else if (syncState.error) {
      syncButton.dataset.state = 'error';
      syncButton.textContent = 'Sync error';
      syncButton.disabled = false;
      syncButton.setAttribute(
        'aria-label',
        `Sync error: ${syncState.error}. Hover for details. Click to retry`,
      );
    } else {
      syncButton.dataset.state = 'synced';
      syncButton.textContent = 'Synced';
      syncButton.disabled = true;
      syncButton.setAttribute('aria-label', 'Statuses synced');
    }
  };

  host.setCounts = (nextCounts) => {
    counts = nextCounts;
    render();
  };
  host.setSyncState = (nextState) => {
    syncState = nextState;
    render();
  };
  host.setLoading = (nextLoading) => {
    loading = nextLoading;
    render();
  };
  host.setCanEdit = (nextCanEdit) => {
    canEdit = nextCanEdit;
    render();
  };

  wrap.append(percentButton, syncButton, detailPanel, errorPopover);
  shadow.append(wrap, resetDialog);
  render();
  return host;
}

export const DECK_BADGE_SELECTOR = `.${BADGE_CLASS}`;
