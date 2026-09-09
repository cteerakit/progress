import { storage } from 'wxt/utils/storage';
import type { DeckState } from '../utils/status';
import { applyLocalDeckSave, createEmptyDeck, pruneRedundantIndexSlides } from '../utils/status';
import {
  cloneStatusPresetConfig,
  DEFAULT_STATUS_PRESET_CONFIG,
  validateStatusPresetConfig,
  type StatusPresetConfig,
} from '../utils/status-presets';
import { canEditPresentation, type SyncState } from '../utils/sync-state';
import {
  cloneUserCatalog,
  createEmptyUserCatalog,
  type UserCatalog,
} from '../utils/user-catalog';

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

export const statusPresetTemplateStorage =
  storage.defineItem<StatusPresetConfig>('local:statusPresetTemplate', {
    fallback: DEFAULT_STATUS_PRESET_CONFIG,
  });

export const statusPresetsByPresentationStorage = storage.defineItem<
  Record<string, StatusPresetConfig>
>('local:statusPresetsByPresentation', { fallback: {} });

export const usersByPresentationStorage = storage.defineItem<
  Record<string, UserCatalog>
>('local:usersByPresentation', { fallback: {} });

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
    const canEdit = canEditPresentation(await getSyncState(), presentationId);

    if (!canEdit) {
      decks[presentationId] = applyLocalDeckSave(existing, {
        slides: existing.slides,
        idsByIndex: deck.idsByIndex,
      });
    } else {
      decks[presentationId] = applyLocalDeckSave(existing, deck);
    }
    await decksStorage.setValue(decks);
  });
}

export async function overwriteDeckSlides(
  presentationId: string,
  deck: DeckState,
): Promise<void> {
  await withDecksLock(async () => {
    const decks = { ...(await decksStorage.getValue()) };
    const existing = decks[presentationId] ?? createEmptyDeck();
    decks[presentationId] = pruneRedundantIndexSlides({
      slides: { ...deck.slides },
      idsByIndex: { ...existing.idsByIndex, ...deck.idsByIndex },
    });
    await decksStorage.setValue(decks);
  });
}

export async function setPresentationCanEdit(
  presentationId: string,
  canEdit: boolean,
): Promise<void> {
  const current = await getSyncState();
  const presentationCanEdit = { ...(current.presentationCanEdit ?? {}) };
  presentationCanEdit[presentationId] = canEdit;
  await syncStateStorage.setValue({
    ...current,
    presentationCanEdit,
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

export async function getStatusPresetTemplate(): Promise<StatusPresetConfig> {
  return validateStatusPresetConfig(await statusPresetTemplateStorage.getValue());
}

export async function setStatusPresetTemplate(
  config: StatusPresetConfig,
): Promise<void> {
  await statusPresetTemplateStorage.setValue(
    validateStatusPresetConfig(config),
  );
}

export async function getPresentationStatusPresets(
  presentationId: string,
): Promise<StatusPresetConfig> {
  const byPresentation = await statusPresetsByPresentationStorage.getValue();
  const cached = byPresentation[presentationId];
  if (cached) {
    return validateStatusPresetConfig(cached);
  }
  return cloneStatusPresetConfig(DEFAULT_STATUS_PRESET_CONFIG);
}

export async function setPresentationStatusPresets(
  presentationId: string,
  config: StatusPresetConfig,
): Promise<void> {
  const byPresentation = {
    ...(await statusPresetsByPresentationStorage.getValue()),
  };
  byPresentation[presentationId] = validateStatusPresetConfig(config);
  await statusPresetsByPresentationStorage.setValue(byPresentation);
}

export function watchPresentationStatusPresets(
  callback: (presets: Record<string, StatusPresetConfig>) => void,
): () => void {
  return statusPresetsByPresentationStorage.watch((value) => {
    callback(value ?? {});
  });
}

export function watchStatusPresetTemplate(
  callback: (config: StatusPresetConfig) => void,
): () => void {
  return statusPresetTemplateStorage.watch((value) => {
    callback(validateStatusPresetConfig(value ?? DEFAULT_STATUS_PRESET_CONFIG));
  });
}

export async function getPresentationUsers(
  presentationId: string,
): Promise<UserCatalog> {
  const byPresentation = await usersByPresentationStorage.getValue();
  return cloneUserCatalog(
    byPresentation[presentationId] ?? createEmptyUserCatalog(),
  );
}

export async function setPresentationUsers(
  presentationId: string,
  catalog: UserCatalog,
): Promise<void> {
  const byPresentation = {
    ...(await usersByPresentationStorage.getValue()),
  };
  byPresentation[presentationId] = cloneUserCatalog(catalog);
  await usersByPresentationStorage.setValue(byPresentation);
}

export function watchPresentationUsers(
  callback: (users: Record<string, UserCatalog>) => void,
): () => void {
  return usersByPresentationStorage.watch((value) => {
    callback(value ?? {});
  });
}
