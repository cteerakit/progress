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
  saveDeck,
  updateSyncState,
} from '../utils/storage';

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
  } catch {
    return null;
  }
}

async function clearCachedToken(token: string | null): Promise<void> {
  if (!token) return;
  try {
    await browser.identity.removeCachedAuthToken({ token });
  } catch {
    // Ignore token cleanup failures.
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

async function handlePull(presentationId: string): Promise<BackgroundResponse> {
  try {
    await withAuthToken(false, async (token) => {
      const remote = await fetchDriveFile(token, presentationId);
      const remoteSlides = decodeAppPropertiesToSlides(remote.appProperties);
      const local = await getDeck(presentationId);
      const { merged, localChanged, remoteChanged } = mergeDeckStates(
        local,
        remoteSlides,
      );

      if (localChanged) {
        await saveDeck(presentationId, merged);
      }

      if (remoteChanged && remote.canEdit) {
        assertPayloadFits(merged.slides);
        await updateDriveFileProperties(
          token,
          presentationId,
          encodeDeckToAppProperties(merged.slides),
        );
      }

      await updateSyncState({
        signedIn: true,
        lastSyncAt: Date.now(),
        error: null,
      });
    });

    return { ok: true, signedIn: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Pull failed';
    const signedIn = message !== 'Not signed in';

    await updateSyncState({
      signedIn,
      error: signedIn ? message : null,
    });

    return { ok: false, error: message, signedIn };
  }
}

async function handlePush(presentationId: string): Promise<BackgroundResponse> {
  try {
    await withAuthToken(false, async (token) => {
      const remote = await fetchDriveFile(token, presentationId);
      const remoteSlides = decodeAppPropertiesToSlides(remote.appProperties);
      const local = await getDeck(presentationId);
      const { merged, localChanged, remoteChanged } = mergeDeckStates(
        local,
        remoteSlides,
      );

      if (localChanged) {
        await saveDeck(presentationId, merged);
      }

      if (!remote.canEdit) {
        await updateSyncState({
          signedIn: true,
          lastSyncAt: Date.now(),
          error: null,
        });
        return;
      }

      if (remoteChanged) {
        assertPayloadFits(merged.slides);
        await updateDriveFileProperties(
          token,
          presentationId,
          encodeDeckToAppProperties(merged.slides),
        );
      }

      await updateSyncState({
        signedIn: true,
        lastSyncAt: Date.now(),
        error: null,
      });
    });

    return { ok: true, signedIn: true };
  } catch (error) {
    if (error instanceof DrivePayloadTooLargeError) {
      await updateSyncState({
        signedIn: true,
        error: error.message,
      });
      return { ok: false, error: error.message, signedIn: true };
    }

    const message = error instanceof Error ? error.message : 'Push failed';
    const signedIn = message !== 'Not signed in';

    await updateSyncState({
      signedIn,
      error: signedIn ? message : null,
    });

    return { ok: false, error: message, signedIn };
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
      return { ok: false, error: 'Sign-in cancelled', signedIn: false };
    }

    await updateSyncState({
      signedIn: true,
      lastSyncAt: Date.now(),
      error: null,
    });

    return { ok: true, signedIn: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sign-in failed';
    await updateSyncState({
      signedIn: false,
      error: message,
    });
    return { ok: false, error: message, signedIn: false };
  }
}

async function handleAuthStatus(): Promise<BackgroundResponse> {
  const token = await getAuthToken(false);
  const signedIn = Boolean(token);
  await updateSyncState({
    signedIn,
    error: signedIn ? null : null,
  });
  return { ok: true, signedIn };
}

export default defineBackground(() => {
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
          default:
            response = { ok: false, error: 'Unknown message type' };
        }

        sendResponse(response);
      })();

      return true;
    },
  );
});
