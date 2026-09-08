import { storage } from 'wxt/utils/storage';
import type { DeckState } from '../utils/status';
import { applyLocalDeckSave, createEmptyDeck } from '../utils/status';
import type { SyncState } from '../utils/sync-state';

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

let decksLock: Promise<void> = Promise.resolve();

function withDecksLock<T>(work: () => Promise<T>): Promise<T> {
  const run = decksLock.then(work, work);
  decksLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function getDeck(presentationId: string): Promise<DeckState> {
  return withDecksLock(async () => {
    const decks = await decksStorage.getValue();
    return decks[presentationId] ?? createEmptyDeck();
  });
}

export async function saveDeck(
  presentationId: string,
  deck: DeckState,
): Promise<void> {
  await withDecksLock(async () => {
    const decks = { ...(await decksStorage.getValue()) };
    const existing = decks[presentationId] ?? createEmptyDeck();
    decks[presentationId] = applyLocalDeckSave(existing, deck);
    await decksStorage.setValue(decks);
  });
}

export async function getSyncState(): Promise<SyncState> {
  return syncStateStorage.getValue();
}

export async function updateSyncState(
  partial: Partial<SyncState>,
): Promise<void> {
  const current = await syncStateStorage.getValue();
  await syncStateStorage.setValue({ ...current, ...partial });
}

export async function setPresentationSyncError(
  presentationId: string,
  error: string | null,
): Promise<void> {
  const current = await syncStateStorage.getValue();
  const presentationErrors = { ...(current.presentationErrors ?? {}) };

  if (error) {
    presentationErrors[presentationId] = error;
  } else {
    delete presentationErrors[presentationId];
  }

  await syncStateStorage.setValue({
    ...current,
    presentationErrors,
  });
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
