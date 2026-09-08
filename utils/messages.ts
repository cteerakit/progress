import { parseSlideId, type DeckState } from './status';
import { getChromeRuntime } from './extension-api';

export type BackgroundMessage =
  | { type: 'PULL'; presentationId: string }
  | { type: 'PUSH'; presentationId: string }
  | { type: 'AUTH'; interactive: boolean }
  | { type: 'AUTH_STATUS' }
  | { type: 'SIGN_OUT' }
  | { type: 'WATCH'; presentationId: string }
  | { type: 'UNWATCH'; presentationId: string }
  | { type: 'LOAD_DECK'; presentationId: string }
  | { type: 'SAVE_DECK'; presentationId: string; deck: DeckState };

export type BackgroundResponse =
  | { ok: true; signedIn?: boolean; canEdit?: boolean; deck?: DeckState }
  | { ok: false; error: string; signedIn?: boolean };

export async function sendBackgroundMessage(
  message: BackgroundMessage,
): Promise<BackgroundResponse> {
  try {
    const runtime = getChromeRuntime();
    if (!runtime?.sendMessage) {
      return { ok: false, error: 'Extension runtime unavailable' };
    }

    const response = await runtime.sendMessage(message);
    if (response && typeof response === 'object' && 'ok' in response) {
      return response as BackgroundResponse;
    }
    return { ok: true };
  } catch (error) {
    const messageText =
      error instanceof Error ? error.message : 'Background message failed';
    return { ok: false, error: messageText };
  }
}

export async function pullRemoteDeck(
  presentationId: string,
): Promise<BackgroundResponse> {
  return sendBackgroundMessage({ type: 'PULL', presentationId });
}

export async function pushLocalDeck(presentationId: string): Promise<void> {
  await sendBackgroundMessage({ type: 'PUSH', presentationId });
}

export async function requestAuth(interactive: boolean): Promise<BackgroundResponse> {
  return sendBackgroundMessage({ type: 'AUTH', interactive });
}

export async function getAuthStatus(): Promise<BackgroundResponse> {
  return sendBackgroundMessage({ type: 'AUTH_STATUS' });
}

export async function requestSignOut(): Promise<BackgroundResponse> {
  return sendBackgroundMessage({ type: 'SIGN_OUT' });
}

export async function watchPresentation(presentationId: string): Promise<void> {
  await sendBackgroundMessage({ type: 'WATCH', presentationId });
}

export async function unwatchPresentation(presentationId: string): Promise<void> {
  await sendBackgroundMessage({ type: 'UNWATCH', presentationId });
}

export function presentationIdFromUrl(url: string): string | null {
  const match = url.match(/\/presentation\/d\/([^/]+)/);
  return match?.[1] ?? null;
}

export function slideIdFromHash(hash: string): string | null {
  const match = hash.match(/slide=id\.([^&]+)/);
  return parseSlideId(match ? `id.${match[1]}` : null);
}

export { indexSlideKey } from './status';
