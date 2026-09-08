import { storage } from 'wxt/storage';
import type { DeckState } from './status';
import { createEmptyDeck } from './status';

export interface SyncState {
  signedIn: boolean;
  lastSyncAt: number;
  error: string | null;
}

export const decksStorage = storage.defineItem<Record<string, DeckState>>(
  'local:decks',
  { fallback: {} },
);

export const syncStateStorage = storage.defineItem<SyncState>(
  'local:syncState',
  {
    fallback: {
      signedIn: false,
      lastSyncAt: 0,
      error: null,
    },
  },
);

export async function getDeck(presentationId: string): Promise<DeckState> {
  const decks = await decksStorage.getValue();
  return decks[presentationId] ?? createEmptyDeck();
}

export async function saveDeck(
  presentationId: string,
  deck: DeckState,
): Promise<void> {
  const decks = await decksStorage.getValue();
  decks[presentationId] = deck;
  await decksStorage.setValue(decks);
}

export async function updateSyncState(
  partial: Partial<SyncState>,
): Promise<void> {
  const current = await syncStateStorage.getValue();
  await syncStateStorage.setValue({ ...current, ...partial });
}

export function watchDecks(
  callback: (decks: Record<string, DeckState>) => void,
): () => void {
  return decksStorage.watch((value) => {
    callback(value ?? {});
  });
}

export function watchSyncState(callback: (state: SyncState) => void): () => void {
  return syncStateStorage.watch((value) => {
    callback(
      value ?? {
        signedIn: false,
        lastSyncAt: 0,
        error: null,
      },
    );
  });
}
