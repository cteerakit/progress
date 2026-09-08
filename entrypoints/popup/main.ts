import './style.css';
import { getSyncState, watchSyncState } from '../../background/storage';
import { getAuthStatus, requestAuth, requestSignOut } from '../../utils/messages';
import type { SyncState } from '../../utils/sync-state';

function requireElement<T extends HTMLElement>(
  id: string,
  ctor: { new (): T },
): T {
  const element = document.getElementById(id);
  if (!(element instanceof ctor)) {
    throw new Error(`Popup markup is missing #${id}`);
  }
  return element;
}

const statusDot = requireElement('status-dot', HTMLElement);
const statusLabel = requireElement('status-label', HTMLElement);
const statusDetail = requireElement('status-detail', HTMLElement);
const signInButton = requireElement('sign-in', HTMLButtonElement);
const signOutButton = requireElement('sign-out', HTMLButtonElement);

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function formatLastSync(lastSyncAt: number): string {
  if (!lastSyncAt) {
    return 'Not synced yet';
  }

  const deltaSeconds = Math.round((lastSyncAt - Date.now()) / 1000);
  const absSeconds = Math.abs(deltaSeconds);

  if (absSeconds < 60) {
    return relativeTime.format(deltaSeconds, 'second');
  }
  if (absSeconds < 3600) {
    return relativeTime.format(Math.round(deltaSeconds / 60), 'minute');
  }
  if (absSeconds < 86_400) {
    return relativeTime.format(Math.round(deltaSeconds / 3600), 'hour');
  }
  return relativeTime.format(Math.round(deltaSeconds / 86_400), 'day');
}

function setBusy(busy: boolean): void {
  document.querySelector('.popup')?.setAttribute('aria-busy', String(busy));
  signInButton.disabled = busy;
  signOutButton.disabled = busy;
}

function render(state: SyncState): void {
  signInButton.hidden = state.signedIn;
  signOutButton.hidden = !state.signedIn;

  if (!state.signedIn) {
    statusDot.dataset.state = state.error ? 'error' : 'signed-out';
    statusLabel.textContent = state.error ? 'Sign-in failed' : 'Not signed in';
    statusDetail.textContent =
      state.error ?? 'Sign in to sync slide statuses with collaborators.';
    if (state.error) {
      statusDetail.dataset.tone = 'error';
    } else {
      delete statusDetail.dataset.tone;
    }
    return;
  }

  if (state.error) {
    statusDot.dataset.state = 'error';
    statusLabel.textContent = 'Sync error';
    statusDetail.textContent = state.error;
    statusDetail.dataset.tone = 'error';
    return;
  }

  statusDot.dataset.state = 'synced';
  statusLabel.textContent = 'Signed in and syncing';
  statusDetail.textContent = `Last synced ${formatLastSync(state.lastSyncAt)}`;
  delete statusDetail.dataset.tone;
}

async function withBusy(work: () => Promise<void>): Promise<void> {
  setBusy(true);
  try {
    await work();
    render(await getSyncState());
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
  render(await getSyncState());
  watchSyncState(render);
  void getAuthStatus();
} catch (error) {
  const message =
    error instanceof Error ? error.message : 'Unable to load sync status';
  render({
    signedIn: false,
    lastSyncAt: 0,
    error: message,
  });
}
