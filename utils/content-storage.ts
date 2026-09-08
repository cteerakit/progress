import type { DeckState } from './status';
import { createEmptyDeck } from './status';
import type { SyncState } from './sync-state';
import { getChromeStorage } from './extension-api';
import { sendBackgroundMessage } from './messages';

const DECKS_KEY = 'decks';
const SYNC_STATE_KEY = 'syncState';

interface StorageChange {
  newValue?: unknown;
  oldValue?: unknown;
}

export async function loadDeckInTab(presentationId: string): Promise<DeckState> {
  const response = await sendBackgroundMessage({
    type: 'LOAD_DECK',
    presentationId,
  });

  if (!response.ok || !response.deck) {
    return createEmptyDeck();
  }

  return response.deck;
}

export async function persistDeckInTab(
  presentationId: string,
  deck: DeckState,
): Promise<void> {
  await sendBackgroundMessage({
    type: 'SAVE_DECK',
    presentationId,
    deck,
  });
}

export function onDecksChangedInTab(
  callback: (decks: Record<string, DeckState>) => void,
): () => void {
  const storageApi = getChromeStorage();
  if (!storageApi?.onChanged) {
    return () => {};
  }

  const listener = (
    changes: Record<string, StorageChange>,
    area: string,
  ) => {
    if (area !== 'local' || !changes[DECKS_KEY]) {
      return;
    }

    callback(
      (changes[DECKS_KEY].newValue as Record<string, DeckState> | undefined) ??
        {},
    );
  };

  storageApi.onChanged.addListener(listener);
  return () => storageApi.onChanged.removeListener(listener);
}

export function onSyncStateChangedInTab(
  callback: (state: SyncState) => void,
): () => void {
  const storageApi = getChromeStorage();
  if (!storageApi?.onChanged) {
    return () => {};
  }

  const listener = (
    changes: Record<string, StorageChange>,
    area: string,
  ) => {
    if (area !== 'local' || !changes[SYNC_STATE_KEY]) {
      return;
    }

    callback(
      (changes[SYNC_STATE_KEY].newValue as SyncState | undefined) ?? {
        signedIn: false,
        lastSyncAt: 0,
        error: null,
      },
    );
  };

  storageApi.onChanged.addListener(listener);
  return () => storageApi.onChanged.removeListener(listener);
}
