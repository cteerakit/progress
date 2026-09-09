import { getChromeStorage } from './extension-api';
import { sendBackgroundMessage } from './messages';

export interface ActiveSlideState {
  presentationId: string;
  slideKey: string;
  index: number | null;
}

export const ACTIVE_SLIDE_SESSION_KEY = 'activeSlide';

export type RepublishActiveSlideMessage = {
  type: 'REPUBLISH_ACTIVE_SLIDE';
};

export function isRepublishActiveSlideMessage(
  message: unknown,
): message is RepublishActiveSlideMessage {
  return (
    Boolean(message) &&
    typeof message === 'object' &&
    (message as RepublishActiveSlideMessage).type === 'REPUBLISH_ACTIVE_SLIDE'
  );
}

export function isActiveSlideState(value: unknown): value is ActiveSlideState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as ActiveSlideState;
  return (
    typeof candidate.presentationId === 'string' &&
    typeof candidate.slideKey === 'string'
  );
}

export function normalizeActiveSlideState(
  value: unknown,
): ActiveSlideState | null {
  if (!isActiveSlideState(value)) {
    return null;
  }

  return {
    presentationId: value.presentationId,
    slideKey: value.slideKey,
    index:
      typeof value.index === 'number' && Number.isFinite(value.index)
        ? value.index
        : null,
  };
}

export async function persistActiveSlideState(
  state: ActiveSlideState | null,
): Promise<void> {
  const storageApi = getChromeStorage('session');
  if (!storageApi) {
    return;
  }

  const normalized = state == null ? null : normalizeActiveSlideState(state);
  if (!normalized) {
    await storageApi.remove(ACTIVE_SLIDE_SESSION_KEY);
    return;
  }

  await storageApi.set({ [ACTIVE_SLIDE_SESSION_KEY]: normalized });
}

export async function setActiveSlideState(
  state: ActiveSlideState | null,
): Promise<void> {
  await sendBackgroundMessage({
    type: 'SET_ACTIVE_SLIDE',
    state,
  });
}

export async function getActiveSlideState(): Promise<ActiveSlideState | null> {
  const storageApi = getChromeStorage('session');
  if (!storageApi) {
    return null;
  }

  const result = await storageApi.get(ACTIVE_SLIDE_SESSION_KEY);
  return normalizeActiveSlideState(result[ACTIVE_SLIDE_SESSION_KEY]);
}

export function watchActiveSlideState(
  callback: (state: ActiveSlideState | null) => void,
): () => void {
  const storageApi = getChromeStorage('session');
  if (!storageApi?.onChanged) {
    return () => {};
  }

  const listener = (
    changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
    area?: string,
  ) => {
    if ((area && area !== 'session') || !changes[ACTIVE_SLIDE_SESSION_KEY]) {
      return;
    }

    callback(normalizeActiveSlideState(changes[ACTIVE_SLIDE_SESSION_KEY].newValue));
  };

  storageApi.onChanged.addListener(listener);
  return () => storageApi.onChanged.removeListener(listener);
}
