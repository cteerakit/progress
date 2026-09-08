import type { DeckState } from './status';

export type BackgroundMessage =
  | { type: 'PULL'; presentationId: string }
  | { type: 'PUSH'; presentationId: string }
  | { type: 'AUTH'; interactive: boolean }
  | { type: 'AUTH_STATUS' };

export type BackgroundResponse =
  | { ok: true; signedIn?: boolean; canEdit?: boolean }
  | { ok: false; error: string; signedIn?: boolean };

export async function sendBackgroundMessage(
  message: BackgroundMessage,
): Promise<BackgroundResponse> {
  try {
    const response = await browser.runtime.sendMessage(message);
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

export async function pullRemoteDeck(presentationId: string): Promise<void> {
  await sendBackgroundMessage({ type: 'PULL', presentationId });
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

export function presentationIdFromUrl(url: string): string | null {
  const match = url.match(/\/presentation\/d\/([^/]+)/);
  return match?.[1] ?? null;
}

export function slideIdFromHash(hash: string): string | null {
  const match = hash.match(/slide=id\.([^&]+)/);
  return match ? `id.${match[1]}` : null;
}

export function indexSlideKey(index: number): string {
  return `index:${index}`;
}

export async function setSlideStatus(
  presentationId: string,
  slideKey: string,
  status: DeckState['slides'][string]['status'],
  getDeck: (id: string) => Promise<DeckState>,
  saveDeck: (id: string, deck: DeckState) => Promise<void>,
): Promise<DeckState> {
  const deck = await getDeck(presentationId);
  deck.slides[slideKey] = {
    status,
    updatedAt: Math.floor(Date.now() / 1000),
  };
  await saveDeck(presentationId, deck);
  return deck;
}
