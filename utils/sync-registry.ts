export const SYNC_ALARM_NAME = 'progress-sync';
export const SYNC_INTERVAL_MINUTES = 1;
/** Pull remote changes for open presentations between alarm ticks. */
export const WATCH_SYNC_INTERVAL_MS = 15_000;
export const FLUSH_ALARM_PREFIX = 'progress-flush:';
const FLUSH_DELAY_MINUTES = 1;

interface SessionData {
  watchedPresentations?: string[];
  watchedPresentationCounts?: Record<string, number>;
}

async function getWatchCounts(): Promise<Record<string, number>> {
  const {
    watchedPresentationCounts = {},
    watchedPresentations = [],
  } = (await browser.storage.session.get([
    'watchedPresentationCounts',
    'watchedPresentations',
  ])) as SessionData;

  if (Object.keys(watchedPresentationCounts).length > 0) {
    return { ...watchedPresentationCounts };
  }

  const migrated: Record<string, number> = {};
  for (const presentationId of watchedPresentations) {
    migrated[presentationId] = 1;
  }
  return migrated;
}

async function setWatchCounts(counts: Record<string, number>): Promise<void> {
  const nextCounts: Record<string, number> = {};
  for (const [presentationId, count] of Object.entries(counts)) {
    if (count > 0) {
      nextCounts[presentationId] = count;
    }
  }

  await browser.storage.session.set({
    watchedPresentationCounts: nextCounts,
    watchedPresentations: Object.keys(nextCounts),
  });
}

export async function getWatchedPresentations(): Promise<string[]> {
  return Object.keys(await getWatchCounts());
}

export async function isPresentationWatched(
  presentationId: string,
): Promise<boolean> {
  const counts = await getWatchCounts();
  return (counts[presentationId] ?? 0) > 0;
}

export async function registerPresentationSync(
  presentationId: string,
): Promise<void> {
  const counts = await getWatchCounts();
  counts[presentationId] = (counts[presentationId] ?? 0) + 1;
  await setWatchCounts(counts);
  await cancelDeferredFlush(presentationId);
}

export async function unregisterPresentationSync(
  presentationId: string,
): Promise<number> {
  const counts = await getWatchCounts();
  const remaining = Math.max(0, (counts[presentationId] ?? 0) - 1);
  if (remaining === 0) {
    delete counts[presentationId];
  } else {
    counts[presentationId] = remaining;
  }
  await setWatchCounts(counts);
  return remaining;
}

export function flushAlarmPresentationId(alarmName: string): string | null {
  if (!alarmName.startsWith(FLUSH_ALARM_PREFIX)) {
    return null;
  }
  return alarmName.slice(FLUSH_ALARM_PREFIX.length) || null;
}

export async function scheduleDeferredFlush(
  presentationId: string,
): Promise<void> {
  await browser.alarms.create(`${FLUSH_ALARM_PREFIX}${presentationId}`, {
    delayInMinutes: FLUSH_DELAY_MINUTES,
  });
}

export async function cancelDeferredFlush(
  presentationId: string,
): Promise<void> {
  await browser.alarms.clear(`${FLUSH_ALARM_PREFIX}${presentationId}`);
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
