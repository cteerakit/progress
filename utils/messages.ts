import type { ActiveSlideState } from './active-slide';
import { parseSlideId, type DeckState } from './status';
import type { StatusPresetConfig } from './status-presets';
import { getChromeRuntime } from './extension-api';

export type BackgroundMessage =
  | {
      type: 'PULL';
      presentationId: string;
      promptForFileAccess?: boolean;
    }
  | { type: 'PUSH'; presentationId: string; persistRemote?: boolean }
  | { type: 'AUTH'; interactive: boolean }
  | { type: 'AUTH_STATUS' }
  | { type: 'SIGN_OUT' }
  | { type: 'WATCH'; presentationId: string }
  | { type: 'UNWATCH'; presentationId: string }
  | { type: 'FLUSH'; presentationId: string }
  | { type: 'CLEAR_HISTORY'; presentationId: string }
  | { type: 'LOAD_DECK'; presentationId: string }
  | { type: 'SAVE_DECK'; presentationId: string; deck: DeckState }
  | { type: 'LOAD_PRESETS'; presentationId: string }
  | {
      type: 'SAVE_PRESETS';
      presentationId: string;
      presets: StatusPresetConfig;
      updateTemplate?: boolean;
    }
  | { type: 'SET_ACTIVE_SLIDE'; state: ActiveSlideState | null };

export type BackgroundResponse =
  | {
      ok: true;
      signedIn?: boolean;
      canEdit?: boolean;
      deck?: DeckState;
      presets?: StatusPresetConfig;
    }
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
  options: { promptForFileAccess?: boolean } = {},
): Promise<BackgroundResponse> {
  return sendBackgroundMessage({
    type: 'PULL',
    presentationId,
    promptForFileAccess: options.promptForFileAccess,
  });
}

export async function pushLocalDeck(
  presentationId: string,
  options: { persistRemote?: boolean } = {},
): Promise<BackgroundResponse> {
  return sendBackgroundMessage({
    type: 'PUSH',
    presentationId,
    persistRemote: options.persistRemote,
  });
}

export async function clearPresentationHistory(
  presentationId: string,
): Promise<BackgroundResponse> {
  return sendBackgroundMessage({ type: 'CLEAR_HISTORY', presentationId });
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

export async function flushPresentation(
  presentationId: string,
): Promise<BackgroundResponse> {
  return sendBackgroundMessage({ type: 'FLUSH', presentationId });
}

export async function loadPresetsInTab(
  presentationId: string,
): Promise<StatusPresetConfig | null> {
  const response = await sendBackgroundMessage({
    type: 'LOAD_PRESETS',
    presentationId,
  });
  if (!response.ok || !response.presets) {
    return null;
  }
  return response.presets;
}

export async function persistPresetsInTab(
  presentationId: string,
  presets: StatusPresetConfig,
  updateTemplate = false,
): Promise<boolean> {
  const response = await sendBackgroundMessage({
    type: 'SAVE_PRESETS',
    presentationId,
    presets,
    updateTemplate,
  });
  return response.ok;
}

export function presentationIdFromUrl(url: string): string | null {
  const match = url.match(/\/presentation\/d\/([^/]+)/);
  return match?.[1] ?? null;
}

export function slideIdFromHash(hash: string): string | null {
  const match = hash.match(/slide=id\.([^&]+)/);
  return parseSlideId(match ? `id.${match[1]}` : null);
}
