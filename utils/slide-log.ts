import {
  indexSlideKey,
  parseStatusCode,
  parseStatusToken,
  resolveSlideRecord,
  statusToCode,
  type DeckState,
  type SlideLogEntry,
  type SlideRecord,
  type SlideStatus,
} from './status';

export interface DeckHistoryEntry {
  fromStatus: SlideStatus;
  status: SlideStatus;
  updatedAt: number;
  slideIndex: number | null;
  updatedBy?: number;
}

export const MARKER_DESCRIPTION_MAX_CHARS = 1000;
const MARKER_PAYLOAD_VERSION_V1 = '1';
const MARKER_PAYLOAD_VERSION_V2 = '2';
const MARKER_PAYLOAD_VERSION_V3 = '3';

function markerPayloadByteLength(payload: string): number {
  return new TextEncoder().encode(payload).length;
}

function encodeLogEntryV1(entry: SlideLogEntry): string {
  return `${statusToCode(entry.status)}.${entry.updatedAt.toString(36)}`;
}

function encodeLogEntryV2(entry: SlideLogEntry): string {
  return `${entry.status}.${entry.updatedAt.toString(36)}`;
}

const BUILTIN_STATUS_IDS = new Set([
  'none',
  'todo',
  'in-progress',
  'need-attention',
  'done',
]);

function shouldUseV2(log: SlideLogEntry[]): boolean {
  return log.some((entry) => !BUILTIN_STATUS_IDS.has(entry.status));
}

function shouldUseV3(log: SlideLogEntry[]): boolean {
  return log.some((entry) => entry.updatedBy != null);
}

function encodeTimestampUser(entry: SlideLogEntry): string {
  let segment = entry.updatedAt.toString(36);
  if (entry.updatedBy != null) {
    segment += `@${entry.updatedBy.toString(36)}`;
  }
  return segment;
}

function encodeLogEntryV3(entry: SlideLogEntry, useStatusToken: boolean): string {
  const statusToken = useStatusToken
    ? entry.status
    : statusToCode(entry.status);
  return `${statusToken}.${encodeTimestampUser(entry)}`;
}

function markerPayloadVersion(log: SlideLogEntry[]): string {
  if (shouldUseV3(log)) {
    return MARKER_PAYLOAD_VERSION_V3;
  }
  if (shouldUseV2(log)) {
    return MARKER_PAYLOAD_VERSION_V2;
  }
  return MARKER_PAYLOAD_VERSION_V1;
}

export function encodeMarkerPayloadCore(log: SlideLogEntry[]): string {
  if (log.length === 0) {
    return '';
  }

  const [current, ...older] = log;
  if (!current) {
    return '';
  }

  const version = markerPayloadVersion(log);
  const useStatusToken = version !== MARKER_PAYLOAD_VERSION_V1;
  const currentToken = useStatusToken
    ? current.status
    : statusToCode(current.status);

  let payload = `${version}:${currentToken}:${encodeTimestampUser(current)}`;

  for (const entry of older) {
    if (version === MARKER_PAYLOAD_VERSION_V3) {
      payload += `.${encodeLogEntryV3(entry, useStatusToken)}`;
      continue;
    }
    payload += `.${useStatusToken ? encodeLogEntryV2(entry) : encodeLogEntryV1(entry)}`;
  }

  return payload;
}

function parseTimestampUser(
  segment: string,
): { updatedAt: number; updatedBy?: number } | null {
  const [timestampRaw, userRaw] = segment.split('@');
  if (!timestampRaw) {
    return null;
  }

  const updatedAt = Number.parseInt(timestampRaw, 36);
  if (!Number.isFinite(updatedAt) || updatedAt < 0) {
    return null;
  }

  if (!userRaw) {
    return { updatedAt };
  }

  const updatedBy = Number.parseInt(userRaw, 36);
  if (!Number.isFinite(updatedBy) || updatedBy < 0) {
    return { updatedAt };
  }

  return { updatedAt, updatedBy };
}

function parseLogEntrySegment(
  segment: string,
  parseStatus: (token: string) => SlideStatus | null,
): SlideLogEntry | null {
  const dotIndex = segment.indexOf('.');
  if (dotIndex <= 0) {
    return null;
  }

  const statusToken = segment.slice(0, dotIndex);
  const timestampUser = segment.slice(dotIndex + 1);
  const parsed = parseTimestampUser(timestampUser);
  if (!parsed) {
    return null;
  }

  const status = parseStatus(statusToken);
  if (!status) {
    return null;
  }

  return {
    status,
    updatedAt: parsed.updatedAt,
    updatedBy: parsed.updatedBy,
  };
}

export function truncateSlideLogToMarkerBudget(
  log: SlideLogEntry[],
): SlideLogEntry[] {
  let result = [...log];

  while (result.length > 0) {
    const payload = encodeMarkerPayloadCore(result);
    if (
      payload &&
      markerPayloadByteLength(payload) <= MARKER_DESCRIPTION_MAX_CHARS
    ) {
      return result;
    }
    result = result.slice(0, -1);
  }

  return result;
}

export function normalizeSlideLog(record: SlideRecord): SlideLogEntry[] {
  if (record.log && record.log.length > 0) {
    return record.log;
  }

  if (record.status !== 'none' || record.updatedAt > 0) {
    return [{ status: record.status, updatedAt: record.updatedAt }];
  }

  return [];
}

export function slideRecordHasHistory(record: SlideRecord): boolean {
  return normalizeSlideLog(record).length > 0;
}

function slideIndexForKey(deck: DeckState, slideKey: string): number | null {
  if (slideKey.startsWith('index:')) {
    const parsed = Number(slideKey.slice('index:'.length));
    return Number.isFinite(parsed) ? parsed : null;
  }

  for (const [index, id] of Object.entries(deck.idsByIndex)) {
    if (id === slideKey) {
      const parsed = Number(index);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }

  return null;
}

function collectCanonicalSlides(
  deck: DeckState,
): { slideKey: string; index: number | null }[] {
  const seenKeys = new Set<string>();
  const slides: { slideKey: string; index: number | null }[] = [];
  const indexValues = new Set<string>();

  for (const index of Object.keys(deck.idsByIndex)) {
    indexValues.add(index);
  }
  for (const key of Object.keys(deck.slides)) {
    if (key.startsWith('index:')) {
      indexValues.add(key.slice('index:'.length));
    }
  }

  for (const indexStr of [...indexValues].sort(
    (left, right) => Number(left) - Number(right),
  )) {
    const index = Number(indexStr);
    if (!Number.isFinite(index)) {
      continue;
    }

    const mappedId = deck.idsByIndex[indexStr];
    const slideKey = mappedId ?? indexSlideKey(index);
    const dedupeKey = mappedId ?? slideKey;
    if (seenKeys.has(dedupeKey)) {
      continue;
    }
    seenKeys.add(dedupeKey);
    slides.push({ slideKey, index });
  }

  for (const key of Object.keys(deck.slides)) {
    if (key.startsWith('index:') || seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);
    slides.push({ slideKey: key, index: slideIndexForKey(deck, key) });
  }

  return slides;
}

export function collectDeckHistory(deck: DeckState): DeckHistoryEntry[] {
  const entries: DeckHistoryEntry[] = [];
  const seen = new Set<string>();

  for (const { slideKey, index } of collectCanonicalSlides(deck)) {
    const log = normalizeSlideLog(
      resolveSlideRecord(deck, slideKey, index ?? undefined),
    );
    for (let entryIndex = 0; entryIndex < log.length; entryIndex += 1) {
      const entry = log[entryIndex];
      if (!entry) {
        continue;
      }

      const dedupeKey = `${index ?? slideKey}:${entry.updatedAt}:${entry.status}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      entries.push({
        fromStatus: log[entryIndex + 1]?.status ?? 'none',
        status: entry.status,
        updatedAt: entry.updatedAt,
        slideIndex: index,
        updatedBy: entry.updatedBy,
      });
    }
  }

  return entries.sort((left, right) => right.updatedAt - left.updatedAt);
}

export function prepareSlideRecord(record: SlideRecord): SlideRecord {
  const log = truncateSlideLogToMarkerBudget(normalizeSlideLog(record));
  if (log.length === 0) {
    return { status: 'none', updatedAt: 0 };
  }

  const [current, ...older] = log;
  if (!current) {
    return { status: 'none', updatedAt: 0 };
  }

  return {
    status: current.status,
    updatedAt: current.updatedAt,
    log:
      older.length > 0 || current.updatedBy != null
        ? log
        : undefined,
  };
}

function shouldPersistLog(log: SlideLogEntry[]): boolean {
  if (log.length > 1) {
    return true;
  }
  return log[0]?.updatedBy != null;
}

export function unionSlideLogs(
  left: SlideLogEntry[],
  right: SlideLogEntry[],
): SlideLogEntry[] {
  const byTimestamp = new Map<number, SlideLogEntry>();

  for (const entry of [...left, ...right]) {
    const existing = byTimestamp.get(entry.updatedAt);
    if (
      !existing ||
      (existing.status === 'none' && entry.status !== 'none') ||
      (entry.updatedBy != null && existing.updatedBy == null)
    ) {
      byTimestamp.set(entry.updatedAt, entry);
    }
  }

  return [...byTimestamp.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function appendSlideLogEntry(
  record: SlideRecord,
  entry: SlideLogEntry,
): SlideRecord {
  const log = truncateSlideLogToMarkerBudget(
    unionSlideLogs([entry], normalizeSlideLog(record)),
  );

  return {
    status: entry.status,
    updatedAt: entry.updatedAt,
    log: shouldPersistLog(log) ? log : undefined,
  };
}

export function mergeSlideRecords(
  base: SlideRecord,
  incoming: SlideRecord,
  onTie: 'keep-base' | 'use-incoming' = 'keep-base',
): SlideRecord {
  const winner =
    incoming.updatedAt > base.updatedAt
      ? incoming
      : base.updatedAt > incoming.updatedAt
        ? base
        : onTie === 'use-incoming'
          ? incoming
          : base;
  const log = truncateSlideLogToMarkerBudget(
    unionSlideLogs(normalizeSlideLog(base), normalizeSlideLog(incoming)),
  );

  return {
    status: winner.status,
    updatedAt: winner.updatedAt,
    log: shouldPersistLog(log) ? log : undefined,
  };
}

export function slideRecordsEqual(
  left: SlideRecord,
  right: SlideRecord,
): boolean {
  if (left.status !== right.status || left.updatedAt !== right.updatedAt) {
    return false;
  }

  const leftLog = normalizeSlideLog(left);
  const rightLog = normalizeSlideLog(right);
  if (leftLog.length !== rightLog.length) {
    return false;
  }

  return leftLog.every(
    (entry, index) =>
      entry.status === rightLog[index]?.status &&
      entry.updatedAt === rightLog[index]?.updatedAt &&
      entry.updatedBy === rightLog[index]?.updatedBy,
  );
}

export function decodeMarkerLog(
  code: string,
  rest: string,
): SlideRecord | null {
  const status = parseStatusCode(code);
  if (!status) {
    return null;
  }

  const segments = rest.split('.');
  const head = segments[0];
  if (!head) {
    return null;
  }

  const updatedAt = Number.parseInt(head, 36);
  if (!Number.isFinite(updatedAt) || updatedAt < 0) {
    return null;
  }

  const log: SlideLogEntry[] = [{ status, updatedAt }];

  for (let index = 1; index < segments.length; index += 2) {
    const entryCode = segments[index];
    const timestampRaw = segments[index + 1];
    if (!entryCode || !timestampRaw) {
      break;
    }

    const entryStatus = parseStatusCode(entryCode);
    const entryUpdatedAt = Number.parseInt(timestampRaw, 36);
    if (
      !entryStatus ||
      !Number.isFinite(entryUpdatedAt) ||
      entryUpdatedAt < 0
    ) {
      break;
    }

    log.push({ status: entryStatus, updatedAt: entryUpdatedAt });
  }

  return prepareSlideRecord({
    status,
    updatedAt,
    log: log.length > 1 ? log : undefined,
  });
}

export function decodeMarkerLogV2(
  statusToken: string,
  rest: string,
): SlideRecord | null {
  const status = parseStatusToken(statusToken);
  if (!status || status === 'none') {
    return null;
  }

  const segments = rest.split('.');
  const head = segments[0];
  if (!head) {
    return null;
  }

  const updatedAt = Number.parseInt(head, 36);
  if (!Number.isFinite(updatedAt) || updatedAt < 0) {
    return null;
  }

  const log: SlideLogEntry[] = [{ status, updatedAt }];

  for (let index = 1; index < segments.length; index += 2) {
    const entryToken = segments[index];
    const timestampRaw = segments[index + 1];
    if (!entryToken || !timestampRaw) {
      break;
    }

    const entryStatus = parseStatusToken(entryToken);
    const entryUpdatedAt = Number.parseInt(timestampRaw, 36);
    if (
      !entryStatus ||
      !Number.isFinite(entryUpdatedAt) ||
      entryUpdatedAt < 0
    ) {
      break;
    }

    log.push({ status: entryStatus, updatedAt: entryUpdatedAt });
  }

  return prepareSlideRecord({
    status,
    updatedAt,
    log: log.length > 1 ? log : undefined,
  });
}

export function decodeMarkerLogV3(
  statusToken: string,
  rest: string,
): SlideRecord | null {
  const status = parseStatusToken(statusToken);
  if (!status || status === 'none') {
    return null;
  }

  const segments = rest.split('.');
  const head = segments[0];
  if (!head) {
    return null;
  }

  const parsedHead = parseTimestampUser(head);
  if (!parsedHead) {
    return null;
  }

  const log: SlideLogEntry[] = [
    {
      status,
      updatedAt: parsedHead.updatedAt,
      updatedBy: parsedHead.updatedBy,
    },
  ];

  for (let index = 1; index < segments.length; index += 1) {
    const entrySegment = segments[index];
    if (!entrySegment) {
      break;
    }

    const entry = parseLogEntrySegment(entrySegment, parseStatusToken);
    if (!entry) {
      break;
    }

    log.push(entry);
  }

  return prepareSlideRecord({
    status,
    updatedAt: parsedHead.updatedAt,
    log: shouldPersistLog(log) ? log : undefined,
  });
}
