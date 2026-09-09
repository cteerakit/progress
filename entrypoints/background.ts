import { defineBackground } from 'wxt/utils/define-background';
import type { BackgroundMessage, BackgroundResponse } from '../utils/messages';
import {
  getDeck,
  getPresentationStatusPresets,
  getPresentationUsers,
  getSyncState,
  overwriteDeckSlides,
  saveDeck,
  setPresentationCanEdit,
  setPresentationStatusPresets,
  setPresentationSyncError,
  setPresentationUsers,
  setStatusPresetTemplate,
  updateSyncState,
} from '../background/storage';
import {
  persistActiveSlideState,
  type RepublishActiveSlideMessage,
} from '../utils/active-slide';
import { fetchSignedInUserProfile } from '../utils/auth';
import {
  clearDeckHistory,
  mergeDeckStates,
  mergeIdsByIndex,
  pruneDeckToExistingSlides,
  pruneRedundantIndexSlides,
} from '../utils/status';
import {
  batchUpdatePresentationGrouped,
  fetchPresentation,
  presentationCanEdit,
  SlidesEditDeniedError,
} from '../utils/slides-api';
import {
  buildMarkerDiffRequestGroups,
  decodePresentationMetadata,
  presentationPageObjectIds,
  presentationSlideKeys,
} from '../utils/slide-metadata';
import {
  buildCatalogUsersAppPropertiesPatch,
  decodeAppPropertiesToCatalog,
  decodeAppPropertiesToUsers,
  driveAppPropertiesNeedWrite,
  DriveEditDeniedError,
  encodeCatalogUsersToAppProperties,
  fetchDriveFile,
  updateDriveFileProperties,
} from '../utils/drive-metadata';
import { mergeUserCatalogs } from '../utils/user-catalog';
import { notifyPresentationPresetsUpdated } from '../utils/preset-sync';
import {
  mergeStatusPresetConfigs,
  validateStatusPresetConfig,
} from '../utils/status-presets';
import { isGlobalSyncError } from '../utils/sync-state';
import {
  ensureSyncAlarm,
  flushAlarmPresentationId,
  getWatchedPresentations,
  isPresentationWatched,
  registerPresentationSync,
  scheduleDeferredFlush,
  SYNC_ALARM_NAME,
  unregisterPresentationSync,
  WATCH_SYNC_INTERVAL_MS,
} from '../utils/sync-registry';

const presentationLocks = new Map<string, Promise<unknown>>();
const REMOTE_PUSH_DEBOUNCE_MS = 1_000;
const debouncedPushTimers = new Map<string, ReturnType<typeof setTimeout>>();
let watchSyncTimer: ReturnType<typeof setTimeout> | null = null;

function withPresentationLock<T>(
  presentationId: string,
  work: () => Promise<T>,
): Promise<T> {
  const previous = presentationLocks.get(presentationId) ?? Promise.resolve();
  const run = previous.then(work, work);
  presentationLocks.set(
    presentationId,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

async function getAuthToken(interactive: boolean): Promise<string | null> {
  try {
    const result = await browser.identity.getAuthToken({ interactive });
    if (typeof result === 'string') {
      return result;
    }
    if (result && typeof result === 'object' && 'token' in result) {
      return (result as { token: string }).token;
    }
    return null;
  } catch (error) {
    console.error('[progress] getAuthToken failed', error);
    return null;
  }
}

async function clearCachedToken(token: string | null): Promise<void> {
  if (!token) return;
  try {
    await browser.identity.removeCachedAuthToken({ token });
  } catch (error) {
    console.warn('[progress] removeCachedAuthToken failed', error);
  }
}

async function withAuthToken<T>(
  interactive: boolean,
  work: (token: string) => Promise<T>,
): Promise<T> {
  let token = await getAuthToken(interactive);
  if (!token) {
    throw new Error('Not signed in');
  }

  try {
    return await work(token);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('401')) {
      throw error;
    }

    await clearCachedToken(token);
    token = await getAuthToken(false);
    if (!token) {
      throw new Error('Authentication expired');
    }

    return await work(token);
  }
}

async function syncSignedInProfile(token: string | null): Promise<void> {
  if (!token) {
    await updateSyncState({ signedInEmail: null, signedInPicture: null });
    return;
  }

  try {
    const profile = await fetchSignedInUserProfile(token);
    await updateSyncState({
      signedInEmail: profile?.email ?? null,
      signedInPicture: profile?.picture ?? null,
    });
  } catch (error) {
    console.warn('[progress] fetchSignedInUserProfile failed', error);
  }
}

async function recordSyncFailure(
  presentationId: string,
  message: string,
): Promise<{ signedIn: boolean }> {
  const signedIn = message !== 'Not signed in';

  if (isGlobalSyncError(message)) {
    await updateSyncState({
      signedIn,
      error: signedIn ? message : null,
    });
    return { signedIn };
  }

  if (!signedIn) {
    await updateSyncState({
      signedIn: false,
      error: null,
      signedInEmail: null,
      signedInPicture: null,
    });
    return { signedIn: false };
  }

  await setPresentationSyncError(presentationId, message);
  return { signedIn: true };
}

async function recordSyncSuccess(presentationId: string): Promise<void> {
  await setPresentationSyncError(presentationId, null);
  await updateSyncState({
    signedIn: true,
    lastSyncAt: Date.now(),
    error: null,
  });
}

async function syncDeckWithSlides(
  presentationId: string,
  token: string,
  options: { persistRemote?: boolean } = {},
): Promise<boolean> {
  const presentation = await fetchPresentation(token, presentationId);
  const driveFile = await fetchDriveFile(token, presentationId);
  const canEditSlides = presentationCanEdit(presentation);
  const canEditDrive = driveFile.accessible && driveFile.canEdit;
  await setPresentationCanEdit(presentationId, canEditSlides);

  const remote = decodePresentationMetadata(presentation);
  const validSlideKeys = presentationSlideKeys(presentation);
  const validPageIds = presentationPageObjectIds(presentation);
  const local = pruneDeckToExistingSlides(
    await getDeck(presentationId),
    validSlideKeys,
  );
  const localPresets = await getPresentationStatusPresets(presentationId);
  const drivePresets = decodeAppPropertiesToCatalog(driveFile.appProperties);
  const remotePresets =
    drivePresets ?? remote.catalog?.config ?? null;
  let activePresets = localPresets;
  let presetsLocalChanged = false;

  if (remotePresets) {
    const presetMerge = mergeStatusPresetConfigs(localPresets, remotePresets);
    activePresets = presetMerge.merged;
    presetsLocalChanged = presetMerge.localChanged;
  }

  if (presetsLocalChanged) {
    await setPresentationStatusPresets(presentationId, activePresets);
    await notifyPresentationPresetsUpdated(presentationId, activePresets);
  }

  const localUsers = await getPresentationUsers(presentationId);
  const driveUsers = decodeAppPropertiesToUsers(driveFile.appProperties);
  const remoteUsers =
    driveUsers ?? remote.users?.catalog ?? null;
  let activeUsers = localUsers;
  let usersLocalChanged = false;

  if (remoteUsers) {
    const userMerge = mergeUserCatalogs(localUsers, remoteUsers);
    activeUsers = userMerge.merged;
    usersLocalChanged = userMerge.localChanged;
  }

  if (usersLocalChanged || remoteUsers) {
    await setPresentationUsers(presentationId, activeUsers);
  }

  const { merged, localChanged } = mergeDeckStates(local, remote.slides, {
    canEdit: canEditSlides,
    validSlideKeys,
  });
  const withIds = {
    ...merged,
    idsByIndex: mergeIdsByIndex(merged.idsByIndex, remote.idsByIndex),
  };
  const pruned = pruneRedundantIndexSlides(withIds);
  const prunedIndexKeys =
    Object.keys(pruned.slides).length !== Object.keys(merged.slides).length;

  if (localChanged || prunedIndexKeys) {
    if (canEditSlides) {
      await saveDeck(presentationId, pruned);
    } else {
      await overwriteDeckSlides(presentationId, pruned);
    }
  }

  if (!canEditSlides) {
    return false;
  }

  // Writing Drive metadata or slide shapes while the editor tab is open
  // fights Google's saver and leaves the title bar on "Saving…".
  if (!options.persistRemote) {
    return true;
  }

  const latest = pruneRedundantIndexSlides(
    pruneDeckToExistingSlides(await getDeck(presentationId), validSlideKeys),
  );
  const pushMerge = mergeDeckStates(latest, remote.slides, {
    validSlideKeys,
  });

  const desiredDriveProps = encodeCatalogUsersToAppProperties(
    activePresets,
    activeUsers,
  );
  const driveNeedsUpdate = driveAppPropertiesNeedWrite(
    driveFile.appProperties,
    desiredDriveProps,
  );
  if (canEditDrive && driveNeedsUpdate) {
    try {
      const patch = buildCatalogUsersAppPropertiesPatch(
        driveFile.appProperties,
        activePresets,
        activeUsers,
      );
      await updateDriveFileProperties(token, presentationId, patch);
    } catch (error) {
      if (error instanceof DriveEditDeniedError) {
        return false;
      }
      throw error;
    }
  }

  // Leave leftover catalog/users shapes in place. Deleting them while the
  // editor is open fights Google Slides' saver and sticks the title bar on
  // "Saving…". Drive appProperties are the source of truth once present.

  if (pushMerge.remoteChanged) {
    try {
      const markerRequestGroups = buildMarkerDiffRequestGroups(
        pushMerge.merged.slides,
        remote.markers,
        validPageIds,
        remote.occupiedElementIds,
      );
      if (markerRequestGroups.length === 0) {
        return true;
      }
      await batchUpdatePresentationGrouped(
        token,
        presentationId,
        markerRequestGroups,
      );
    } catch (error) {
      if (error instanceof SlidesEditDeniedError) {
        await setPresentationCanEdit(presentationId, false);
        await overwriteDeckSlides(presentationId, {
          slides: remote.slides,
          idsByIndex: latest.idsByIndex,
        });
        return false;
      }
      throw error;
    }
  }

  return true;
}

async function handlePull(presentationId: string): Promise<BackgroundResponse> {
  return withPresentationLock(presentationId, async () => {
    try {
      const canEdit = await withAuthToken(false, async (token) => {
        const canEdit = await syncDeckWithSlides(presentationId, token, {
          persistRemote: false,
        });
        await recordSyncSuccess(presentationId);
        return canEdit;
      });

      return { ok: true, signedIn: true, canEdit };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Pull failed';
      const { signedIn } = await recordSyncFailure(presentationId, message);

      return { ok: false, error: message, signedIn };
    }
  });
}

async function handlePush(
  presentationId: string,
  options: { persistRemote?: boolean } = {},
): Promise<BackgroundResponse> {
  return withPresentationLock(presentationId, async () => {
    try {
      const persistRemote =
        options.persistRemote ?? !(await isPresentationWatched(presentationId));
      const canEdit = await withAuthToken(false, async (token) => {
        const canEdit = await syncDeckWithSlides(presentationId, token, {
          persistRemote,
        });
        await recordSyncSuccess(presentationId);
        return canEdit;
      });

      return { ok: true, signedIn: true, canEdit };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Push failed';
      const { signedIn } = await recordSyncFailure(presentationId, message);

      return { ok: false, error: message, signedIn };
    }
  });
}

async function handleClearHistory(
  presentationId: string,
): Promise<BackgroundResponse> {
  return withPresentationLock(presentationId, async () => {
    try {
      const cleared = clearDeckHistory(await getDeck(presentationId));
      await overwriteDeckSlides(presentationId, cleared);

      const canEdit = await withAuthToken(false, async (token) => {
        const canEdit = await syncDeckWithSlides(presentationId, token, {
          persistRemote: true,
        });
        await recordSyncSuccess(presentationId);
        return canEdit;
      });

      return {
        ok: true,
        signedIn: true,
        canEdit,
        deck: await getDeck(presentationId),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Clear history failed';
      const { signedIn } = await recordSyncFailure(presentationId, message);

      return { ok: false, error: message, signedIn };
    }
  });
}

async function reflectAuthInAction(signedIn: boolean): Promise<void> {
  try {
    await browser.action.setTitle({
      title: signedIn ? 'Progress for Google Slides' : 'Sign in to use Progress for Google Slides',
    });
  } catch (error) {
    console.warn('[progress] action.setTitle failed', error);
  }
}

async function handleAuth(interactive: boolean): Promise<BackgroundResponse> {
  try {
    const token = await getAuthToken(interactive);
    if (!token) {
      await updateSyncState({
        signedIn: false,
        error: null,
        signedInEmail: null,
        signedInPicture: null,
      });
      await reflectAuthInAction(false);
      return { ok: false, error: 'Sign-in cancelled', signedIn: false };
    }

    await updateSyncState({
      signedIn: true,
      lastSyncAt: Date.now(),
      error: null,
    });
    await syncSignedInProfile(token);
    await reflectAuthInAction(true);

    return { ok: true, signedIn: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sign-in failed';
    console.error('[progress] handleAuth failed', error);
    await updateSyncState({
      signedIn: false,
      error: message,
      signedInEmail: null,
      signedInPicture: null,
    });
    await reflectAuthInAction(false);
    return { ok: false, error: message, signedIn: false };
  }
}

async function handleAuthStatus(): Promise<BackgroundResponse> {
  const current = await getSyncState();
  if (!current.signedIn) {
    await reflectAuthInAction(false);
    return { ok: true, signedIn: false };
  }

  const token = await getAuthToken(false);
  const signedIn = Boolean(token);
  if (!signedIn) {
    await updateSyncState({
      signedIn: false,
      error: null,
      signedInEmail: null,
      signedInPicture: null,
    });
  } else {
    await syncSignedInProfile(token);
  }
  await reflectAuthInAction(signedIn);
  return { ok: true, signedIn };
}

async function handleSignOut(): Promise<BackgroundResponse> {
  try {
    if (typeof browser.identity.clearAllCachedAuthTokens === 'function') {
      await browser.identity.clearAllCachedAuthTokens();
    } else {
      await clearCachedToken(await getAuthToken(false));
    }
  } catch (error) {
    console.warn('[progress] sign-out token clear failed', error);
  }

  await updateSyncState({
    signedIn: false,
    error: null,
    signedInEmail: null,
    signedInPicture: null,
  });
  await reflectAuthInAction(false);
  return { ok: true, signedIn: false };
}

async function syncWatchedPresentations(): Promise<void> {
  const state = await getSyncState();
  if (!state.signedIn) {
    return;
  }

  const token = await getAuthToken(false);
  if (!token) {
    await updateSyncState({
      signedIn: false,
      error: null,
      signedInEmail: null,
      signedInPicture: null,
    });
    await reflectAuthInAction(false);
    return;
  }

  const watched = await getWatchedPresentations();
  for (const presentationId of watched) {
    await handlePull(presentationId);
  }
}

function scheduleDebouncedRemotePush(presentationId: string): void {
  const existing = debouncedPushTimers.get(presentationId);
  if (existing != null) {
    clearTimeout(existing);
  }

  debouncedPushTimers.set(
    presentationId,
    setTimeout(() => {
      debouncedPushTimers.delete(presentationId);
      void handlePush(presentationId, { persistRemote: true });
    }, REMOTE_PUSH_DEBOUNCE_MS),
  );
}

function scheduleWatchSyncLoop(): void {
  if (watchSyncTimer != null) {
    return;
  }

  watchSyncTimer = setTimeout(() => {
    watchSyncTimer = null;
    void (async () => {
      try {
        await syncWatchedPresentations();
      } finally {
        const watched = await getWatchedPresentations();
        if (watched.length > 0) {
          scheduleWatchSyncLoop();
        }
      }
    })();
  }, WATCH_SYNC_INTERVAL_MS);
}

async function ensureWatchSyncLoop(): Promise<void> {
  const watched = await getWatchedPresentations();
  if (watched.length > 0) {
    scheduleWatchSyncLoop();
  }
}

async function enableSidePanelOnActionClick(): Promise<void> {
  if (!browser.sidePanel?.setPanelBehavior) {
    return;
  }

  try {
    await browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.warn('[progress] sidePanel.setPanelBehavior failed', error);
  }
}

const REPUBLISH_ACTIVE_SLIDE: RepublishActiveSlideMessage = {
  type: 'REPUBLISH_ACTIVE_SLIDE',
};

function isSlidesPresentationUrl(url?: string): boolean {
  return Boolean(url?.includes('/presentation/d/'));
}

async function requestActiveSlideRepublish(tabId: number): Promise<void> {
  if (!browser.tabs?.sendMessage) {
    return;
  }

  try {
    await browser.tabs.sendMessage(tabId, REPUBLISH_ACTIVE_SLIDE);
  } catch {
    // The content script may not be ready yet.
  }
}

async function requestActiveSlideRepublishForWindow(
  windowId: number,
): Promise<void> {
  if (!browser.tabs?.query) {
    return;
  }

  const tabs = await browser.tabs.query({ active: true, windowId });
  const tab = tabs[0];
  if (tab?.id && isSlidesPresentationUrl(tab.url)) {
    await requestActiveSlideRepublish(tab.id);
  }
}

function registerActiveSlideTabListeners(): void {
  if (browser.tabs?.onActivated) {
    browser.tabs.onActivated.addListener(({ tabId }) => {
      void requestActiveSlideRepublish(tabId);
    });
  }

  if (browser.tabs?.onUpdated) {
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (!tab.active) {
        return;
      }

      if (changeInfo.url || changeInfo.status === 'complete') {
        void requestActiveSlideRepublish(tabId);
      }
    });
  }

  if (browser.sidePanel?.onOpened) {
    browser.sidePanel.onOpened.addListener(({ windowId }) => {
      void requestActiveSlideRepublishForWindow(windowId);
    });
  }
}

export default defineBackground(() => {
  void enableSidePanelOnActionClick();
  registerActiveSlideTabListeners();
  void ensureSyncAlarm();
  void handleAuthStatus();
  void ensureWatchSyncLoop();
  void (async () => {
    const state = await getSyncState();
    if (state.error && !isGlobalSyncError(state.error)) {
      await updateSyncState({ error: null });
    }
  })();

  browser.alarms.onAlarm.addListener((alarm) => {
    const flushPresentationId = flushAlarmPresentationId(alarm.name);
    if (flushPresentationId) {
      void (async () => {
        if (await isPresentationWatched(flushPresentationId)) {
          return;
        }
        await handlePush(flushPresentationId, { persistRemote: true });
      })();
      return;
    }

    if (alarm.name !== SYNC_ALARM_NAME) {
      return;
    }

    void syncWatchedPresentations();
  });

  browser.runtime.onMessage.addListener(
    (message: BackgroundMessage, _sender, sendResponse) => {
      (async () => {
        let response: BackgroundResponse;

        switch (message.type) {
          case 'PULL':
            response = await handlePull(message.presentationId);
            break;
          case 'PUSH':
            response = await handlePush(message.presentationId, {
              persistRemote: message.persistRemote,
            });
            break;
          case 'AUTH':
            response = await handleAuth(message.interactive);
            break;
          case 'AUTH_STATUS':
            response = await handleAuthStatus();
            break;
          case 'SIGN_OUT':
            response = await handleSignOut();
            break;
          case 'WATCH':
            await registerPresentationSync(message.presentationId);
            scheduleWatchSyncLoop();
            response = { ok: true };
            break;
          case 'UNWATCH':
            await unregisterPresentationSync(message.presentationId);
            response = { ok: true };
            break;
          case 'FLUSH': {
            const remaining = await unregisterPresentationSync(
              message.presentationId,
            );
            if (remaining === 0) {
              await scheduleDeferredFlush(message.presentationId);
            }
            response = { ok: true };
            break;
          }
          case 'CLEAR_HISTORY':
            response = await handleClearHistory(message.presentationId);
            break;
          case 'LOAD_DECK':
            response = {
              ok: true,
              deck: await getDeck(message.presentationId),
            };
            break;
          case 'SAVE_DECK':
            await withPresentationLock(message.presentationId, () =>
              saveDeck(message.presentationId, message.deck),
            );
            scheduleDebouncedRemotePush(message.presentationId);
            response = { ok: true };
            break;
          case 'LOAD_PRESETS':
            response = {
              ok: true,
              presets: await getPresentationStatusPresets(message.presentationId),
            };
            break;
          case 'SAVE_PRESETS': {
            const presets = validateStatusPresetConfig(message.presets);
            await setPresentationStatusPresets(message.presentationId, presets);
            if (message.updateTemplate) {
              await setStatusPresetTemplate(presets);
            }
            await notifyPresentationPresetsUpdated(
              message.presentationId,
              presets,
            );
            response = { ok: true };
            break;
          }
          case 'SET_ACTIVE_SLIDE':
            await persistActiveSlideState(message.state);
            response = { ok: true };
            break;
          default:
            response = { ok: false, error: 'Unknown message type' };
        }

        sendResponse(response);
      })();

      return true;
    },
  );
});
