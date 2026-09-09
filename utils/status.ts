export type SlideStatus =
  | 'none'
  | 'todo'
  | 'in-progress'
  | 'need-attention'
  | 'done';

export interface SlideRecord {
  status: SlideStatus;
  updatedAt: number;
}

export interface DeckState {
  slides: Record<string, SlideRecord>;
  idsByIndex: Record<string, string>;
}

export const STATUS_OPTIONS: { value: SlideStatus; label: string }[] = [
  { value: 'none', label: 'No status' },
  { value: 'todo', label: 'To do' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'need-attention', label: 'Need attention' },
  { value: 'done', label: 'Done' },
];

export const STATUS_ORDER: SlideStatus[] = STATUS_OPTIONS.map(
  (option) => option.value,
);

export const STATUS_COLORS: Record<SlideStatus, string> = {
  none: '#9aa0a6',
  todo: '#fbbc05',
  'in-progress': '#4285f4',
  'need-attention': '#ea4335',
  done: '#34a853',
};

export const STATUS_ICONS: Record<SlideStatus, string> = {
  none: 'radio_button_unchecked',
  todo: 'circle_circle',
  'in-progress': 'radio_button_partial',
  'need-attention': 'error',
  done: 'radio_button_checked',
};

export const STATUS_CODES: Record<SlideStatus, string> = {
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
  return STATUS_CODES[status];
}

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
  return CODE_TO_STATUS[code] ?? null;
}

export function nextUpdatedAt(previous = 0, now = Math.floor(Date.now() / 1000)): number {
  return Math.max(now, previous + 1);
}

export function resetDeckStatuses(deck: DeckState): DeckState {
  const now = Math.floor(Date.now() / 1000);
  const slides: Record<string, SlideRecord> = { ...deck.slides };

  for (const [key, record] of Object.entries(slides)) {
    if (record.status !== 'none') {
      slides[key] = { status: 'none', updatedAt: nextUpdatedAt(record.updatedAt, now) };
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

    if (incomingRecord.updatedAt > current.updatedAt) {
      merged[key] = incomingRecord;
    } else if (
      incomingRecord.updatedAt === current.updatedAt &&
      onTie === 'use-incoming'
    ) {
      merged[key] = incomingRecord;
    }
  }

  return merged;
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
