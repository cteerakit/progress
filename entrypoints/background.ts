import { defineBackground } from 'wxt/utils/define-background';
import {
  assertPayloadFits,
  decodeAppPropertiesToSlides,
  encodeDeckToAppProperties,
  fetchDriveFile,
  mergeDeckStates,
  updateDriveFileProperties,
  DrivePayloadTooLargeError,
} from '../utils/drive';
import type { BackgroundMessage, BackgroundResponse } from '../utils/messages';
import {
  getDeck,
  getSyncState,
  saveDeck,
  setPresentationSyncError,
  updateSyncState,
} from '../background/storage';
import { isGlobalSyncError } from '../utils/sync-state';
import { pruneRedundantIndexSlides } from '../utils/status';
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

async function syncDeckWithDrive(
  presentationId: string,
  token: string,
): Promise<void> {
  const remote = await fetchDriveFile(token, presentationId);
  const remoteSlides = decodeAppPropertiesToSlides(remote.appProperties);
  const local = await getDeck(presentationId);
  const { merged, localChanged } = mergeDeckStates(
    local,
    remoteSlides,
  );
  const pruned = pruneRedundantIndexSlides(merged);
  const prunedIndexKeys =
    Object.keys(pruned.slides).length !== Object.keys(merged.slides).length;

  if (localChanged || prunedIndexKeys) {
    await saveDeck(presentationId, pruned);
  }

  const latest = pruneRedundantIndexSlides(await getDeck(presentationId));
  const { remoteChanged } = mergeDeckStates(latest, remoteSlides);

  if (remoteChanged && remote.canEdit) {
    assertPayloadFits(latest.slides);
    await updateDriveFileProperties(
      token,
      presentationId,
      encodeDeckToAppProperties(latest.slides),
    );
  }
}

async function handlePull(presentationId: string): Promise<BackgroundResponse> {
  return withPresentationLock(presentationId, async () => {
    try {
      await withAuthToken(false, async (token) => {
        await syncDeckWithDrive(presentationId, token);
        await recordSyncSuccess(presentationId);
      });

      return { ok: true, signedIn: true };
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
      await withAuthToken(false, async (token) => {
        await syncDeckWithDrive(presentationId, token);
        await recordSyncSuccess(presentationId);
      });

      return { ok: true, signedIn: true };
    } catch (error) {
      if (error instanceof DrivePayloadTooLargeError) {
        await setPresentationSyncError(presentationId, error.message);
        return { ok: false, error: error.message, signedIn: true };
      }

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
      });
      await reflectAuthInAction(false);
      return { ok: false, error: 'Sign-in cancelled', signedIn: false };
    }

    await updateSyncState({
      signedIn: true,
      lastSyncAt: Date.now(),
      error: null,
    });
    await reflectAuthInAction(true);

    return { ok: true, signedIn: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sign-in failed';
    console.error('[progress] handleAuth failed', error);
    await updateSyncState({
      signedIn: false,
      error: message,
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
    });
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
    });
    await reflectAuthInAction(false);
    return;
  }

  const watched = await getWatchedPresentations();
  for (const presentationId of watched) {
    await handlePull(presentationId);
  }
}

export default defineBackground(() => {
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
          default:
            response = { ok: false, error: 'Unknown message type' };
        }

        sendResponse(response);
      })();

      return true;
    },
  );
});
