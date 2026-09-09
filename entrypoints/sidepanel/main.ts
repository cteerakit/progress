import './style.css';
import {
  getDeck,
  getPresentationStatusPresets,
  getPresentationUsers,
  getSyncState,
  saveDeck,
  watchDecks,
  watchPresentationStatusPresets,
  watchPresentationUsers,
  watchSyncState,
} from '../../background/storage';
import {
  getActiveSlideState,
  watchActiveSlideState,
  type ActiveSlideState,
} from '../../utils/active-slide';
import {
  getAuthStatus,
  persistPresetsInTab,
  pullRemoteDeck,
  pushLocalDeck,
  requestAuth,
  requestSignOut,
} from '../../utils/messages';
import { createStatusIcon, setStatusIcon } from '../../utils/material-icons';
import { mountPresetEditor, type PresetEditorController } from '../../utils/preset-editor';
import {
  collectDeckHistory,
  type DeckHistoryEntry,
} from '../../utils/slide-log';
import {
  reassignDeckStatus,
  type DeckState,
  type SlideStatus,
} from '../../utils/status';
import {
  cloneStatusPresetConfig,
  DEFAULT_STATUS_PRESET_CONFIG,
  getPresetColor,
  getPresetIcon,
  getPresetLabel,
  validateStatusPresetConfig,
  type StatusPresetConfig,
} from '../../utils/status-presets';
import {
  canEditPresentation,
  getAnySyncError,
  isEditAccessKnown,
  type SyncState,
} from '../../utils/sync-state';
import {
  createEmptyUserCatalog,
  getUserFromCatalog,
  initialsFromEmail,
  type CollaborationUser,
  type UserCatalog,
} from '../../utils/user-catalog';

type PanelView = 'history' | 'statuses' | 'account';

function requireElement<T extends HTMLElement>(
  id: string,
  ctor: { new (): T },
): T {
  const element = document.getElementById(id);
  if (!(element instanceof ctor)) {
    throw new Error(`Side panel markup is missing #${id}`);
  }
  return element;
}

const navHistoryButton = requireElement('nav-history', HTMLButtonElement);
const navStatusesButton = requireElement('nav-statuses', HTMLButtonElement);
const navAccountButton = requireElement('nav-account', HTMLButtonElement);
const historyView = requireElement('history-view', HTMLElement);
const statusesView = requireElement('statuses-view', HTMLElement);
const statusesEmpty = requireElement('statuses-empty', HTMLElement);
const statusesEditorHost = requireElement('statuses-editor', HTMLElement);
const accountView = requireElement('account-view', HTMLElement);
const historySummary = requireElement('history-summary', HTMLElement);
const historyList = requireElement('history-list', HTMLOListElement);
const historyLoadMore = requireElement('history-load-more', HTMLButtonElement);
const historyEmpty = requireElement('history-empty', HTMLElement);

const HISTORY_PAGE_SIZE = 25;
const statusDot = requireElement('status-dot', HTMLElement);
const statusLabel = requireElement('status-label', HTMLElement);
const signedInEmail = requireElement('signed-in-email', HTMLElement);
const statusDetail = requireElement('status-detail', HTMLElement);
const signInButton = requireElement('sign-in', HTMLButtonElement);
const signOutButton = requireElement('sign-out', HTMLButtonElement);

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const absoluteTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

let currentView: PanelView = 'history';
let activeSlide: ActiveSlideState | null = null;
let currentDeck: DeckState = { slides: {}, idsByIndex: {} };
let currentPresets: StatusPresetConfig = cloneStatusPresetConfig(
  DEFAULT_STATUS_PRESET_CONFIG,
);
let syncState: SyncState = {
  signedIn: false,
  lastSyncAt: 0,
  error: null,
};
let presetEditor: PresetEditorController | null = null;
let currentUserCatalog: UserCatalog = createEmptyUserCatalog();
let allHistoryEntries: DeckHistoryEntry[] = [];
let historyVisibleCount = HISTORY_PAGE_SIZE;

function formatRelativeUnit(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
): string {
  if (value === 0 && (unit === 'second' || unit === 'minute')) {
    return 'Now';
  }
  return relativeTime.format(value, unit);
}

function formatRelativeTime(
  epochMs: number,
  absoluteAfterDays = Infinity,
): string {
  const date = new Date(epochMs);
  const deltaSeconds = Math.round((epochMs - Date.now()) / 1000);
  const absSeconds = Math.abs(deltaSeconds);

  if (absSeconds < 60) {
    return formatRelativeUnit(deltaSeconds, 'second');
  }
  if (absSeconds < 3600) {
    return formatRelativeUnit(Math.round(deltaSeconds / 60), 'minute');
  }
  if (absSeconds < 86_400) {
    return formatRelativeUnit(Math.round(deltaSeconds / 3600), 'hour');
  }
  if (absSeconds < absoluteAfterDays * 86_400) {
    return formatRelativeUnit(Math.round(deltaSeconds / 86_400), 'day');
  }

  return absoluteTime.format(date);
}

function formatLastSync(lastSyncAt: number): string {
  if (!lastSyncAt) {
    return 'Not synced yet';
  }

  return formatRelativeTime(lastSyncAt);
}

function formatEntryTime(updatedAt: number): string {
  return formatRelativeTime(updatedAt * 1000, 30);
}

function statusLabelFor(
  status: SlideStatus,
  presets: StatusPresetConfig = currentPresets,
): string {
  return getPresetLabel(presets, status);
}

function canEditPresentationDeck(): boolean {
  if (!activeSlide || !syncState.signedIn) {
    return false;
  }
  return canEditPresentation(syncState, activeSlide.presentationId);
}

function setView(view: PanelView): void {
  currentView = view;

  historyView.hidden = view !== 'history';
  statusesView.hidden = view !== 'statuses';
  accountView.hidden = view !== 'account';

  navHistoryButton.classList.toggle('is-active', view === 'history');
  navStatusesButton.classList.toggle('is-active', view === 'statuses');
  navAccountButton.classList.toggle('is-active', view === 'account');

  navHistoryButton.setAttribute(
    'aria-current',
    view === 'history' ? 'page' : 'false',
  );
  navStatusesButton.setAttribute(
    'aria-current',
    view === 'statuses' ? 'page' : 'false',
  );
  navAccountButton.setAttribute(
    'aria-current',
    view === 'account' ? 'page' : 'false',
  );
}

function setBusy(busy: boolean): void {
  document.querySelector('.panel')?.setAttribute('aria-busy', String(busy));
  signInButton.disabled = busy;
  signOutButton.disabled = busy;
}

function setSignedInEmail(state: SyncState): void {
  if (state.signedIn && state.signedInEmail) {
    signedInEmail.hidden = false;
    signedInEmail.textContent = state.signedInEmail;
    return;
  }

  signedInEmail.hidden = true;
  signedInEmail.textContent = '';
}

function renderAccount(state: SyncState): void {
  syncState = state;
  const syncError = getAnySyncError(state);

  signInButton.hidden = state.signedIn;
  signOutButton.hidden = !state.signedIn;
  setSignedInEmail(state);

  if (!state.signedIn) {
    statusDot.dataset.state = syncError ? 'error' : 'signed-out';
    statusLabel.textContent = syncError ? 'Sign-in failed' : 'Not signed in';
    statusDetail.textContent =
      syncError ?? 'Sign in to sync slide statuses with collaborators.';
    if (syncError) {
      statusDetail.dataset.tone = 'error';
    } else {
      delete statusDetail.dataset.tone;
    }
    presetEditor?.setEditable(false);
    renderStatuses();
    return;
  }

  if (syncError) {
    statusDot.dataset.state = 'error';
    statusLabel.textContent = 'Sync error';
    statusDetail.textContent = syncError;
    statusDetail.dataset.tone = 'error';
    presetEditor?.setEditable(false);
    renderStatuses();
    return;
  }

  statusDot.dataset.state = 'synced';
  statusLabel.textContent = 'Signed in and syncing';
  statusDetail.textContent = `Last synced ${formatLastSync(state.lastSyncAt)}`;
  delete statusDetail.dataset.tone;
  presetEditor?.setEditable(canEditPresentationDeck());
  renderStatuses();
}

function formatSlideNumber(slideIndex: number | null): string {
  return slideIndex != null ? String(slideIndex + 1) : '—';
}

function createHistoryAvatar(user: CollaborationUser | null): HTMLSpanElement {
  const avatar = document.createElement('span');
  avatar.className = 'history-item-avatar';

  if (user?.picture) {
    const image = document.createElement('img');
    image.className = 'history-item-avatar-image';
    image.src = user.picture;
    image.alt = '';
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    avatar.append(image);
  } else {
    avatar.classList.add('history-item-avatar-fallback');
    avatar.textContent = user ? initialsFromEmail(user.email) : '?';
  }

  avatar.title = user?.email ?? 'Unknown user';
  return avatar;
}

function createHistoryStatusIcon(status: SlideStatus): SVGSVGElement {
  const icon = createStatusIcon(getPresetIcon(currentPresets, status), {
    className: 'history-item-icon',
    color: getPresetColor(currentPresets, status),
  });
  setStatusIcon(
    icon,
    getPresetIcon(currentPresets, status),
    getPresetColor(currentPresets, status),
  );
  return icon;
}

function createHistoryItem(entry: DeckHistoryEntry): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'history-item';
  const editor = getUserFromCatalog(currentUserCatalog, entry.updatedBy);
  item.title = `${statusLabelFor(entry.fromStatus)} → ${statusLabelFor(entry.status)}${editor ? ` · ${editor.email}` : ''}`;

  const avatar = createHistoryAvatar(editor);

  const transition = document.createElement('span');
  transition.className = 'history-item-transition';
  transition.setAttribute('aria-hidden', 'true');

  const arrow = document.createElement('span');
  arrow.className = 'history-item-arrow';
  arrow.textContent = '→';

  transition.append(
    createHistoryStatusIcon(entry.fromStatus),
    arrow,
    createHistoryStatusIcon(entry.status),
  );

  const slide = document.createElement('span');
  slide.className = 'history-item-slide';
  slide.textContent = formatSlideNumber(entry.slideIndex);
  slide.title = entry.slideIndex != null
    ? `Slide ${entry.slideIndex + 1}`
    : 'Slide';

  const time = document.createElement('time');
  time.className = 'history-item-time';
  time.dateTime = new Date(entry.updatedAt * 1000).toISOString();
  time.textContent = formatEntryTime(entry.updatedAt);
  time.title = absoluteTime.format(new Date(entry.updatedAt * 1000));

  item.append(avatar, transition, slide, time);
  return item;
}

function formatHistorySummary(total: number, visible: number): string {
  const changeLabel = `${total} change${total === 1 ? '' : 's'}`;
  if (visible < total) {
    return `Showing ${visible} of ${changeLabel}`;
  }
  return changeLabel;
}

function updateHistoryLoadMore(): void {
  const remaining = allHistoryEntries.length - historyVisibleCount;
  if (remaining <= 0) {
    historyLoadMore.hidden = true;
    return;
  }

  const nextBatch = Math.min(HISTORY_PAGE_SIZE, remaining);
  historyLoadMore.hidden = false;
  historyLoadMore.textContent =
    nextBatch === 1 ? 'Load 1 more' : `Load ${nextBatch} more`;
}

function appendHistoryEntries(entries: DeckHistoryEntry[]): void {
  for (const entry of entries) {
    historyList.append(createHistoryItem(entry));
  }
}

function renderHistory(): void {
  historyList.replaceChildren();
  historySummary.textContent = '';
  historyList.hidden = true;
  historyLoadMore.hidden = true;

  if (!activeSlide) {
    historyEmpty.hidden = false;
    historyEmpty.textContent = 'Open a Google Slides tab to view status history.';
    return;
  }

  allHistoryEntries = collectDeckHistory(currentDeck);
  historyVisibleCount = Math.min(HISTORY_PAGE_SIZE, allHistoryEntries.length);

  if (allHistoryEntries.length === 0) {
    historyEmpty.hidden = false;
    historyEmpty.textContent = 'No status changes yet.';
    return;
  }

  historyEmpty.hidden = true;
  historySummary.textContent = formatHistorySummary(
    allHistoryEntries.length,
    historyVisibleCount,
  );
  appendHistoryEntries(allHistoryEntries.slice(0, historyVisibleCount));
  historyList.hidden = false;
  updateHistoryLoadMore();
}

function reassignRemovedStatuses(
  deck: DeckState,
  previous: StatusPresetConfig,
  next: StatusPresetConfig,
): DeckState {
  const nextIds = new Set(next.statuses.map((preset) => preset.id));
  const removed = previous.statuses.filter(
    (preset) => !nextIds.has(preset.id) && preset.id !== 'none',
  );
  if (removed.length === 0) {
    return deck;
  }

  let updated = deck;
  for (const preset of removed) {
    const hasStatus = Object.values(updated.slides).some(
      (record) => record.status === preset.id,
    );
    if (hasStatus) {
      updated = reassignDeckStatus(updated, preset.id, 'none');
    }
  }
  return updated;
}

async function savePresets(nextPresets: StatusPresetConfig): Promise<void> {
  if (!activeSlide || !canEditPresentationDeck()) {
    return;
  }

  const presentationId = activeSlide.presentationId;
  const validated = validateStatusPresetConfig(nextPresets);
  const reassignedDeck = reassignRemovedStatuses(
    currentDeck,
    currentPresets,
    validated,
  );
  const deckChanged = reassignedDeck !== currentDeck;

  currentPresets = validated;
  renderHistory();

  await persistPresetsInTab(presentationId, validated, true);

  if (deckChanged) {
    currentDeck = reassignedDeck;
    await saveDeck(presentationId, reassignedDeck);
  }

  await pushLocalDeck(presentationId);
}

function ensurePresetEditor(): void {
  if (presetEditor) {
    return;
  }

  presetEditor = mountPresetEditor(statusesEditorHost, {
    editable: canEditPresentationDeck(),
    config: currentPresets,
    onDraftChange: (nextPresets) => {
      currentPresets = validateStatusPresetConfig(nextPresets);
      renderHistory();
    },
    onSave: async (nextPresets) => {
      await savePresets(nextPresets);
    },
  });
}

function renderStatuses(): void {
  if (!activeSlide) {
    statusesEmpty.hidden = false;
    statusesEmpty.textContent =
      'Open a Google Slides presentation to customize statuses.';
    statusesEditorHost.hidden = true;
    presetEditor?.destroy();
    presetEditor = null;
    return;
  }

  ensurePresetEditor();
  presetEditor?.setConfig(currentPresets);
  statusesEditorHost.hidden = false;

  if (!syncState.signedIn) {
    statusesEmpty.hidden = false;
    statusesEmpty.textContent = 'Sign in to customize statuses.';
    presetEditor?.setEditable(false);
    return;
  }

  if (getAnySyncError(syncState)) {
    statusesEmpty.hidden = false;
    statusesEmpty.textContent = 'Fix sync issues before customizing statuses.';
    presetEditor?.setEditable(false);
    return;
  }

  if (!isEditAccessKnown(syncState, activeSlide.presentationId)) {
    statusesEmpty.hidden = false;
    statusesEmpty.textContent = 'Checking edit access…';
    presetEditor?.setEditable(false);
    return;
  }

  if (!canEditPresentationDeck()) {
    statusesEmpty.hidden = false;
    statusesEmpty.textContent =
      'You need edit access to this presentation to customize statuses.';
    presetEditor?.setEditable(false);
    return;
  }

  statusesEmpty.hidden = true;
  presetEditor?.setEditable(true);
}

async function refreshPresentationData(): Promise<void> {
  if (!activeSlide) {
    currentDeck = { slides: {}, idsByIndex: {} };
    currentPresets = cloneStatusPresetConfig(DEFAULT_STATUS_PRESET_CONFIG);
    currentUserCatalog = createEmptyUserCatalog();
    renderHistory();
    renderStatuses();
    return;
  }

  if (syncState.signedIn && !getAnySyncError(syncState)) {
    await pullRemoteDeck(activeSlide.presentationId);
    syncState = await getSyncState();
  }

  currentDeck = await getDeck(activeSlide.presentationId);
  currentPresets = await getPresentationStatusPresets(activeSlide.presentationId);
  currentUserCatalog = await getPresentationUsers(activeSlide.presentationId);
  renderHistory();
  renderStatuses();
}

historyLoadMore.addEventListener('click', () => {
  const nextCount = Math.min(
    historyVisibleCount + HISTORY_PAGE_SIZE,
    allHistoryEntries.length,
  );
  appendHistoryEntries(
    allHistoryEntries.slice(historyVisibleCount, nextCount),
  );
  historyVisibleCount = nextCount;
  historySummary.textContent = formatHistorySummary(
    allHistoryEntries.length,
    historyVisibleCount,
  );
  updateHistoryLoadMore();
});

navHistoryButton.addEventListener('click', () => {
  setView('history');
});

navStatusesButton.addEventListener('click', () => {
  setView('statuses');
});

navAccountButton.addEventListener('click', () => {
  setView('account');
});

async function withBusy(work: () => Promise<void>): Promise<void> {
  setBusy(true);
  try {
    await work();
    renderAccount(await getSyncState());
  } finally {
    setBusy(false);
  }
}

signInButton.addEventListener('click', () => {
  void withBusy(async () => {
    await requestAuth(true);
  });
});

signOutButton.addEventListener('click', () => {
  void withBusy(async () => {
    await requestSignOut();
  });
});

try {
  setView('history');
  activeSlide = await getActiveSlideState();
  syncState = await getSyncState();
  await refreshPresentationData();
  renderAccount(syncState);

  watchActiveSlideState((state) => {
    activeSlide = state;
    void (async () => {
      syncState = await getSyncState();
      await refreshPresentationData();
    })();
  });

  watchDecks((decks) => {
    if (!activeSlide) {
      return;
    }

    currentDeck = decks[activeSlide.presentationId] ?? {
      slides: {},
      idsByIndex: {},
    };
    void (async () => {
      currentUserCatalog = await getPresentationUsers(activeSlide.presentationId);
      renderHistory();
    })();
  });

  watchPresentationStatusPresets((presetsByPresentation) => {
    if (!activeSlide) {
      return;
    }

    const next = presetsByPresentation[activeSlide.presentationId];
    if (!next) {
      return;
    }

    const validated = validateStatusPresetConfig(next);
    if (JSON.stringify(validated) === JSON.stringify(currentPresets)) {
      return;
    }

    currentPresets = validated;
    renderHistory();
    presetEditor?.setConfig(currentPresets);
  });

  watchPresentationUsers((usersByPresentation) => {
    if (!activeSlide) {
      return;
    }

    const next = usersByPresentation[activeSlide.presentationId];
    if (!next) {
      return;
    }

    currentUserCatalog = next;
    renderHistory();
  });

  watchSyncState(renderAccount);
  void getAuthStatus();
} catch (error) {
  const message =
    error instanceof Error ? error.message : 'Unable to load side panel';
  historyEmpty.hidden = false;
  historyEmpty.textContent = message;
  statusesEmpty.hidden = false;
  statusesEmpty.textContent = message;
  renderAccount({
    signedIn: false,
    lastSyncAt: 0,
    error: message,
  });
}
