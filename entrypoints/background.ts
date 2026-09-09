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
import { persistActiveSlideState } from '../utils/active-slide';
import { fetchSignedInUserProfile } from '../utils/auth';
import {
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
  buildCatalogDiffRequestGroups,
  buildMarkerDiffRequestGroups,
  buildUsersDiffRequestGroups,
  decodePresentationMetadata,
  presentationPageObjectIds,
  presentationSlideKeys,
} from '../utils/slide-metadata';
import { mergeUserCatalogs } from '../utils/user-catalog';
import { notifyPresentationPresetsUpdated } from '../utils/preset-sync';
import {
  mergeStatusPresetConfigs,
  validateStatusPresetConfig,
} from '../utils/status-presets';
import { isGlobalSyncError } from '../utils/sync-state';
import {
  ensureSyncAlarm,
  getWatchedPresentations,
  registerPresentationSync,
  SYNC_ALARM_NAME,
  unregisterPresentationSync,
} from '../utils/sync-registry';

const presentationLocks = new Map<string, Promise<unknown>>();

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
): Promise<boolean> {
  const presentation = await fetchPresentation(token, presentationId);
  const canEdit = presentationCanEdit(presentation);
  await setPresentationCanEdit(presentationId, canEdit);

  const remote = decodePresentationMetadata(presentation);
  const validSlideKeys = presentationSlideKeys(presentation);
  const validPageIds = presentationPageObjectIds(presentation);
  const local = pruneDeckToExistingSlides(
    await getDeck(presentationId),
    validSlideKeys,
  );
  const localPresets = await getPresentationStatusPresets(presentationId);
  const remotePresets = remote.catalog?.config ?? null;
  let activePresets = localPresets;
  let presetsLocalChanged = false;
  let presetsRemoteChanged = false;

  if (remotePresets) {
    const presetMerge = mergeStatusPresetConfigs(localPresets, remotePresets);
    activePresets = presetMerge.merged;
    presetsLocalChanged = presetMerge.localChanged;
    presetsRemoteChanged = presetMerge.remoteChanged;
  } else if (canEdit && localPresets.updatedAt > 0) {
    presetsRemoteChanged = true;
  }

  if (presetsLocalChanged) {
    await setPresentationStatusPresets(presentationId, activePresets);
    await notifyPresentationPresetsUpdated(presentationId, activePresets);
  }

  const localUsers = await getPresentationUsers(presentationId);
  const remoteUsers = remote.users?.catalog ?? null;
  let activeUsers = localUsers;
  let usersLocalChanged = false;
  let usersRemoteChanged = false;

  if (remoteUsers) {
    const userMerge = mergeUserCatalogs(localUsers, remoteUsers);
    activeUsers = userMerge.merged;
    usersLocalChanged = userMerge.localChanged;
    usersRemoteChanged = userMerge.remoteChanged;
  } else if (canEdit && localUsers.users.length > 0) {
    usersRemoteChanged = true;
  }

  if (usersLocalChanged || remoteUsers) {
    await setPresentationUsers(presentationId, activeUsers);
  }

  const { merged, localChanged } = mergeDeckStates(local, remote.slides, {
    canEdit,
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
    if (canEdit) {
      await saveDeck(presentationId, pruned);
    } else {
      await overwriteDeckSlides(presentationId, pruned);
    }
  }

  if (!canEdit) {
    return false;
  }

  const latest = pruneRedundantIndexSlides(
    pruneDeckToExistingSlides(await getDeck(presentationId), validSlideKeys),
  );
  const { remoteChanged } = mergeDeckStates(latest, remote.slides, {
    validSlideKeys,
  });

  if (remoteChanged || presetsRemoteChanged || usersRemoteChanged) {
    try {
      const markerRequestGroups = buildMarkerDiffRequestGroups(
        latest.slides,
        remote.markers,
        validPageIds,
      );
      const catalogRequestGroups = buildCatalogDiffRequestGroups(
        activePresets,
        remote.catalog,
        presentation,
      );
      const usersRequestGroups = buildUsersDiffRequestGroups(
        activeUsers,
        remote.users,
        presentation,
      );
      await batchUpdatePresentationGrouped(
        token,
        presentationId,
        markerRequestGroups,
      );
      await batchUpdatePresentationGrouped(
        token,
        presentationId,
        catalogRequestGroups,
      );
      await batchUpdatePresentationGrouped(
        token,
        presentationId,
        usersRequestGroups,
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
        const canEdit = await syncDeckWithSlides(presentationId, token);
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

async function handlePush(presentationId: string): Promise<BackgroundResponse> {
  return withPresentationLock(presentationId, async () => {
    try {
      const canEdit = await withAuthToken(false, async (token) => {
        const canEdit = await syncDeckWithSlides(presentationId, token);
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

export default defineBackground(() => {
  void enableSidePanelOnActionClick();
  void ensureSyncAlarm();
  void handleAuthStatus();
  void (async () => {
    const state = await getSyncState();
    if (state.error && !isGlobalSyncError(state.error)) {
      await updateSyncState({ error: null });
    }
  })();

  browser.alarms.onAlarm.addListener((alarm) => {
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
            response = await handlePush(message.presentationId);
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
            response = { ok: true };
            break;
          case 'UNWATCH':
            await unregisterPresentationSync(message.presentationId);
            response = { ok: true };
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
