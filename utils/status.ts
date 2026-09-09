import {
  appendSlideLogEntry,
  clearSlideHistory,
  mergeSlideRecords,
  slideRecordHasHistory,
  slideRecordsEqual,
} from './slide-log';
import {
  DEFAULT_STATUS_PRESET_CONFIG,
  getPresetColor,
  getPresetIcon,
  getPresetLabel,
  getOrderedSelectablePresets,
  type StatusPresetConfig,
} from './status-presets';

/** Stable status id: built-in (`todo`, `done`, …) or custom (`s_…`). */
export type SlideStatus = string;

export interface SlideLogEntry {
  status: SlideStatus;
  updatedAt: number;
  updatedBy?: number;
}

export interface SlideRecord {
  status: SlideStatus;
  updatedAt: number;
  log?: SlideLogEntry[];
  /** Drop log entries older than this timestamp when merging or displaying. */
  historyClearedAt?: number;
}

export interface DeckState {
  slides: Record<string, SlideRecord>;
  idsByIndex: Record<string, string>;
}

export const STATUS_CODES: Record<string, string> = {
  none: 'n',
  todo: 't',
  'in-progress': 'i',
  'need-attention': 'a',
  done: 'd',
};

const CODE_TO_STATUS: Record<string, SlideStatus> = {
  n: 'none',
  t: 'todo',
  i: 'in-progress',
  a: 'need-attention',
  d: 'done',
};

export function codeToStatus(code: string): SlideStatus {
  return CODE_TO_STATUS[code] ?? 'none';
}

export function statusToCode(status: SlideStatus): string {
  return STATUS_CODES[status] ?? status;
}

export function getStatusOptions(
  config: StatusPresetConfig = DEFAULT_STATUS_PRESET_CONFIG,
): { value: SlideStatus; label: string }[] {
  return getOrderedSelectablePresets(config).map((preset) => ({
    value: preset.id,
    label: preset.label,
  }));
}

export function getStatusOrder(
  config: StatusPresetConfig = DEFAULT_STATUS_PRESET_CONFIG,
): SlideStatus[] {
  return getOrderedSelectablePresets(config).map((preset) => preset.id);
}

export function getStatusColors(
  config: StatusPresetConfig = DEFAULT_STATUS_PRESET_CONFIG,
): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const preset of config.statuses) {
    colors[preset.id] = preset.color;
  }
  return colors;
}

export function getStatusColor(
  config: StatusPresetConfig,
  statusId: SlideStatus,
): string {
  return getPresetColor(config, statusId);
}

export function getStatusLabel(
  config: StatusPresetConfig,
  statusId: SlideStatus,
): string {
  return getPresetLabel(config, statusId);
}

export function getStatusIconId(
  config: StatusPresetConfig,
  statusId: SlideStatus,
): string {
  return getPresetIcon(config, statusId);
}

/** @deprecated Use getStatusOptions(config) */
export const STATUS_OPTIONS = getStatusOptions();

/** @deprecated Use getStatusOrder(config) */
export const STATUS_ORDER = getStatusOrder();

/** @deprecated Use getStatusColors(config) */
export const STATUS_COLORS = getStatusColors();

export function createEmptyDeck(): DeckState {
  return { slides: {}, idsByIndex: {} };
}

export function cloneDeck(deck: DeckState): DeckState {
  return {
    slides: { ...deck.slides },
    idsByIndex: { ...deck.idsByIndex },
  };
}

export function indexSlideKey(index: number): string {
  return `index:${index}`;
}

export function isIndexSlideKey(key: string): boolean {
  return key.startsWith('index:');
}

/** Google Slides page IDs as used in `#slide=id.p` / `#slide=id.p1` / `#slide=id.g…`. */
export function isDriveSlideId(key: string): boolean {
  return /^id\.(p\d*|g[A-Za-z0-9_-]+)$/.test(key);
}

export function isSlideKey(key: string): boolean {
  return isIndexSlideKey(key) || isDriveSlideId(key);
}

export function parseSlideId(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (isDriveSlideId(trimmed)) {
    return trimmed;
  }

  const prefixed = trimmed.startsWith('id.') ? trimmed : `id.${trimmed}`;
  return isDriveSlideId(prefixed) ? prefixed : null;
}

/** Prefer the live filmstrip page id; never let a stale index mapping win. */
export function pickSlideKey(
  dataId: string | null | undefined,
  index: number,
  idsByIndex: Record<string, string>,
  hashId: string | null = null,
): string {
  if (dataId && isDriveSlideId(dataId)) {
    return dataId;
  }
  if (hashId && isDriveSlideId(hashId)) {
    return hashId;
  }
  const mappedId = idsByIndex[String(index)];
  if (mappedId && isDriveSlideId(mappedId)) {
    return mappedId;
  }
  return indexSlideKey(index);
}

/** Map index → slide id, ensuring each Drive id belongs to at most one index. */
export function assignIndexSlideId(
  idsByIndex: Record<string, string>,
  index: number,
  slideId: string,
): boolean {
  const key = String(index);
  let changed = idsByIndex[key] !== slideId;

  for (const [idx, id] of Object.entries(idsByIndex)) {
    if (idx !== key && id === slideId) {
      delete idsByIndex[idx];
      changed = true;
    }
  }

  idsByIndex[key] = slideId;
  return changed;
}

export function uniqueIndexMappings(
  idsByIndex: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  const ownedBy = new Map<string, string>();

  for (const [index, slideId] of Object.entries(idsByIndex)) {
    if (isDriveSlideId(slideId)) {
      const previous = ownedBy.get(slideId);
      if (previous !== undefined) {
        delete result[previous];
      }
      ownedBy.set(slideId, index);
    }
    result[index] = slideId;
  }

  return result;
}

export function parseStatusCode(code: string): SlideStatus | null {
  if (CODE_TO_STATUS[code]) {
    return CODE_TO_STATUS[code];
  }
  return null;
}

export function parseStatusToken(token: string): SlideStatus | null {
  if (CODE_TO_STATUS[token]) {
    return CODE_TO_STATUS[token];
  }
  if (token && token !== 'none') {
    return token;
  }
  if (token === 'none') {
    return 'none';
  }
  return null;
}

export function reassignDeckStatus(
  deck: DeckState,
  fromStatus: SlideStatus,
  toStatus: SlideStatus,
  updatedBy?: number,
): DeckState {
  const now = Math.floor(Date.now() / 1000);
  const slides: Record<string, SlideRecord> = { ...deck.slides };

  for (const [key, record] of Object.entries(slides)) {
    if (record.status === fromStatus) {
      slides[key] = appendSlideLogEntry(record, {
        status: toStatus,
        updatedAt: nextUpdatedAt(record.updatedAt, now),
        updatedBy,
      });
    }
  }

  return {
    slides,
    idsByIndex: { ...deck.idsByIndex },
  };
}

export function nextUpdatedAt(previous = 0, now = Math.floor(Date.now() / 1000)): number {
  return Math.max(now, previous + 1);
}

export function clearDeckHistory(deck: DeckState): DeckState {
  const now = Math.floor(Date.now() / 1000);
  const slides: Record<string, SlideRecord> = {};

  for (const [key, record] of Object.entries(deck.slides)) {
    const cleared = clearSlideHistory(record);
    if (
      cleared.log?.length === 0 &&
      (cleared.status !== 'none' || cleared.updatedAt > 0)
    ) {
      const updatedAt = nextUpdatedAt(cleared.updatedAt, now);
      slides[key] = {
        ...cleared,
        updatedAt,
        historyClearedAt: updatedAt,
        log: [],
      };
      continue;
    }

    slides[key] = cleared;
  }

  return {
    slides,
    idsByIndex: { ...deck.idsByIndex },
  };
}

export function resetDeckStatuses(
  deck: DeckState,
  updatedBy?: number,
): DeckState {
  const now = Math.floor(Date.now() / 1000);
  const slides: Record<string, SlideRecord> = { ...deck.slides };

  for (const [key, record] of Object.entries(slides)) {
    if (record.status !== 'none') {
      slides[key] = appendSlideLogEntry(record, {
        status: 'none',
        updatedAt: nextUpdatedAt(record.updatedAt, now),
        updatedBy,
      });
    }
  }

  return {
    slides,
    idsByIndex: { ...deck.idsByIndex },
  };
}

export function getSlideRecord(
  deck: DeckState,
  slideKey: string,
): SlideRecord {
  return deck.slides[slideKey] ?? { status: 'none', updatedAt: 0 };
}

export function resolveSlideRecord(
  deck: DeckState,
  slideKey: string,
  index?: number,
): SlideRecord {
  const keys = new Set<string>([slideKey]);

  if (typeof index === 'number' && Number.isFinite(index)) {
    keys.add(indexSlideKey(index));
    const mapped = deck.idsByIndex[String(index)];
    if (mapped && (!isDriveSlideId(slideKey) || mapped === slideKey)) {
      keys.add(mapped);
    }
  } else if (slideKey.startsWith('index:')) {
    const mapped = deck.idsByIndex[slideKey.slice('index:'.length)];
    if (mapped) {
      keys.add(mapped);
    }
  } else {
    for (const [idx, id] of Object.entries(deck.idsByIndex)) {
      if (id === slideKey) {
        keys.add(indexSlideKey(Number(idx)));
      }
    }
  }

  let best: SlideRecord | undefined;
  for (const key of keys) {
    const record = deck.slides[key];
    if (!record) {
      continue;
    }
    if (
      !best ||
      record.updatedAt > best.updatedAt ||
      (record.updatedAt === best.updatedAt &&
        best.status === 'none' &&
        record.status !== 'none')
    ) {
      best = record;
    }
  }

  return best ?? { status: 'none', updatedAt: 0 };
}

export function mergeSlideMaps(
  base: Record<string, SlideRecord>,
  incoming: Record<string, SlideRecord>,
  onTie: 'keep-base' | 'use-incoming' = 'keep-base',
): Record<string, SlideRecord> {
  const merged: Record<string, SlideRecord> = { ...base };

  for (const [key, incomingRecord] of Object.entries(incoming)) {
    const current = merged[key];
    if (!current) {
      merged[key] = incomingRecord;
      continue;
    }

    merged[key] = mergeSlideRecords(current, incomingRecord, onTie);
  }

  return merged;
}

/** Drop id.* slide records and index mappings for pages no longer in the deck. */
export function pruneDeckToExistingSlides(
  deck: DeckState,
  validSlideKeys: ReadonlySet<string>,
): DeckState {
  const slides = { ...deck.slides };
  const idsByIndex = { ...deck.idsByIndex };
  let changed = false;

  for (const key of Object.keys(slides)) {
    if (isDriveSlideId(key) && !validSlideKeys.has(key)) {
      delete slides[key];
      changed = true;
    }
  }

  for (const [index, slideId] of Object.entries(idsByIndex)) {
    if (isDriveSlideId(slideId) && !validSlideKeys.has(slideId)) {
      delete idsByIndex[index];
      changed = true;
    }
  }

  if (!changed) {
    return deck;
  }

  return {
    slides,
    idsByIndex: uniqueIndexMappings(idsByIndex),
  };
}

export function pruneRedundantIndexSlides(deck: DeckState): DeckState {
  const slides = { ...deck.slides };
  const idsByIndex = uniqueIndexMappings({ ...deck.idsByIndex });

  for (const [index, slideId] of Object.entries(idsByIndex)) {
    if (!slideId || slideId.startsWith('index:')) {
      continue;
    }

    const fallbackKey = indexSlideKey(Number(index));
    const indexRecord = slides[fallbackKey];
    if (!indexRecord) {
      continue;
    }

    const idRecord = slides[slideId];
    if (!idRecord || indexRecord.updatedAt > idRecord.updatedAt) {
      slides[slideId] = indexRecord;
    }
    delete slides[fallbackKey];
  }

  return { slides, idsByIndex };
}

export function applyLocalDeckSave(
  existing: DeckState,
  incoming: DeckState,
): DeckState {
  const idsByIndex = { ...existing.idsByIndex };
  for (const [index, slideId] of Object.entries(incoming.idsByIndex)) {
    if (
      isDriveSlideId(slideId) ||
      !idsByIndex[index] ||
      !isDriveSlideId(idsByIndex[index])
    ) {
      idsByIndex[index] = slideId;
    }
  }

  return pruneRedundantIndexSlides({
    slides: mergeSlideMaps(existing.slides, incoming.slides, 'use-incoming'),
    idsByIndex,
  });
}

export function applyStorageDeckUpdate(
  local: DeckState,
  incoming: DeckState,
): DeckState {
  return pruneRedundantIndexSlides({
    slides: mergeSlideMaps(local.slides, incoming.slides, 'keep-base'),
    idsByIndex: { ...incoming.idsByIndex, ...local.idsByIndex },
  });
}

/** View-only: remote slide statuses always win; keep local thumbnail id mappings. */
export function applyReadOnlyRemoteDeck(
  local: DeckState,
  incoming: DeckState,
): DeckState {
  return pruneRedundantIndexSlides({
    slides: { ...incoming.slides },
    idsByIndex: { ...incoming.idsByIndex, ...local.idsByIndex },
  });
}

function slideMapsDiffer(
  left: Record<string, SlideRecord>,
  right: Record<string, SlideRecord>,
): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    const a = left[key];
    const b = right[key];
    if (!a || !b) {
      return Boolean(a) !== Boolean(b);
    }
    if (!slideRecordsEqual(a, b)) {
      return true;
    }
  }
  return false;
}

export function mergeDeckStates(
  local: DeckState,
  remoteSlides: Record<string, SlideRecord>,
  options: {
    canEdit?: boolean;
    validSlideKeys?: ReadonlySet<string>;
  } = {},
): { merged: DeckState; localChanged: boolean; remoteChanged: boolean } {
  if (options.canEdit === false) {
    return {
      merged: {
        slides: { ...remoteSlides },
        idsByIndex: { ...local.idsByIndex },
      },
      localChanged: slideMapsDiffer(local.slides, remoteSlides),
      remoteChanged: false,
    };
  }

  const mergedSlides: Record<string, SlideRecord> = { ...local.slides };
  let localChanged = false;
  let remoteChanged = false;

  const allKeys = new Set([
    ...Object.keys(local.slides),
    ...Object.keys(remoteSlides),
  ]);

  for (const slideKey of allKeys) {
    const localRecord = local.slides[slideKey];
    const remoteRecord = remoteSlides[slideKey];

    if (!isSlideKey(slideKey)) {
      continue;
    }

    if (!remoteRecord) {
      if (
        localRecord &&
        slideRecordHasHistory(localRecord) &&
        (!options.validSlideKeys || options.validSlideKeys.has(slideKey))
      ) {
        remoteChanged = true;
      }
      continue;
    }

    if (!localRecord) {
      mergedSlides[slideKey] = remoteRecord;
      localChanged = true;
      continue;
    }

    if (remoteRecord.updatedAt > localRecord.updatedAt) {
      mergedSlides[slideKey] = mergeSlideRecords(localRecord, remoteRecord, 'use-incoming');
      if (!slideRecordsEqual(localRecord, mergedSlides[slideKey])) {
        localChanged = true;
      }
    } else if (localRecord.updatedAt > remoteRecord.updatedAt) {
      mergedSlides[slideKey] = mergeSlideRecords(localRecord, remoteRecord, 'keep-base');
      if (!slideRecordsEqual(remoteRecord, mergedSlides[slideKey])) {
        remoteChanged = true;
      }
    } else if (!slideRecordsEqual(localRecord, remoteRecord)) {
      mergedSlides[slideKey] = mergeSlideRecords(localRecord, remoteRecord, 'keep-base');
      localChanged = true;
      remoteChanged = true;
    }
  }

  return {
    merged: {
      slides: mergedSlides,
      idsByIndex: { ...local.idsByIndex },
    },
    localChanged,
    remoteChanged,
  };
}

export function mergeIdsByIndex(
  local: Record<string, string>,
  remote: Record<string, string>,
): Record<string, string> {
  const merged = { ...local };
  for (const [index, slideId] of Object.entries(remote)) {
    if (
      isDriveSlideId(slideId) ||
      !merged[index] ||
      !isDriveSlideId(merged[index])
    ) {
      merged[index] = slideId;
    }
  }
  return uniqueIndexMappings(merged);
}
