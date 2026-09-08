export const SYNC_ALARM_NAME = 'progress-sync';
export const SYNC_INTERVAL_MINUTES = 1;

interface SessionData {
  watchedPresentations?: string[];
}

export async function getWatchedPresentations(): Promise<string[]> {
  const { watchedPresentations = [] } =
    await browser.storage.session.get('watchedPresentations') as SessionData;
  return watchedPresentations;
}

export async function registerPresentationSync(
  presentationId: string,
): Promise<void> {
  const watched = await getWatchedPresentations();
  if (watched.includes(presentationId)) {
    return;
  }

  await browser.storage.session.set({
    watchedPresentations: [...watched, presentationId],
  });
}

export async function unregisterPresentationSync(
  presentationId: string,
): Promise<void> {
  const watched = await getWatchedPresentations();
  await browser.storage.session.set({
    watchedPresentations: watched.filter((id) => id !== presentationId),
  });
}

export async function ensureSyncAlarm(): Promise<void> {
  const existing = await browser.alarms.get(SYNC_ALARM_NAME);
  if (existing) {
    return;
  }

  await browser.alarms.create(SYNC_ALARM_NAME, {
    periodInMinutes: SYNC_INTERVAL_MINUTES,
  });
}
