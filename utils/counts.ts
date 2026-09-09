import type { DeckState, SlideRecord, SlideStatus } from './status';
import { getMappedSlideCount, indexSlideKey, resolveSlideRecord } from './status';
import type { StatusPresetConfig } from './status-presets';
import { DEFAULT_STATUS_PRESET_CONFIG, getPresetLabel } from './status-presets';

export interface SlideCountRow {
  status: SlideStatus;
  label: string;
  count: number;
}

export interface DeckCounts {
  total: number;
  done: number;
  percent: number;
  rows: SlideCountRow[];
}

/**
 * Pick the live slide total for the title-bar breakdown.
 *
 * Google only keeps a window of filmstrip thumbnails in the DOM, so a
 * filmstrip estimate can be just that window until the user scrolls. Synced
 * `idsByIndex` covers the full deck. Use the larger of the two so the badge
 * does not undercount; a later pull trims a stale mapping after deletes.
 */
export function resolveDeckSlideCount(
  filmstripCount: number | null,
  idsByIndex: Record<string, string>,
): number | null {
  const mapped = getMappedSlideCount(idsByIndex);
  if (mapped != null && filmstripCount != null) {
    return Math.max(mapped, filmstripCount);
  }
  return mapped ?? filmstripCount;
}

function getStatusForDeckIndex(
  deck: DeckState,
  index: number,
  indexSlideKeys: Record<string, string>,
): SlideRecord {
  const mappedId = indexSlideKeys[String(index)];
  return resolveSlideRecord(
    {
      slides: deck.slides,
      idsByIndex: { ...deck.idsByIndex, ...indexSlideKeys },
    },
    mappedId ?? indexSlideKey(index),
    index,
  );
}

export function getDeckCounts(
  slideCount: number,
  deck: DeckState,
  indexSlideKeys: Record<string, string> = deck.idsByIndex,
  presets: StatusPresetConfig = DEFAULT_STATUS_PRESET_CONFIG,
): DeckCounts {
  const counts = new Map<string, number>();
  for (const preset of presets.statuses) {
    counts.set(preset.id, 0);
  }

  for (let index = 0; index < slideCount; index += 1) {
    const record = getStatusForDeckIndex(deck, index, indexSlideKeys);
    counts.set(record.status, (counts.get(record.status) ?? 0) + 1);
  }

  const total = slideCount;
  const done = presets.completeStatusIds.reduce(
    (sum, statusId) => sum + (counts.get(statusId) ?? 0),
    0,
  );
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  const rows: SlideCountRow[] = presets.statuses.map((preset) => ({
    status: preset.id,
    label: getPresetLabel(presets, preset.id),
    count: counts.get(preset.id) ?? 0,
  }));

  const unknownStatuses = [...counts.keys()].filter(
    (statusId) => !presets.statuses.some((preset) => preset.id === statusId),
  );
  for (const statusId of unknownStatuses) {
    if (statusId === 'none') {
      continue;
    }
    rows.push({
      status: statusId,
      label: 'Unknown',
      count: counts.get(statusId) ?? 0,
    });
  }

  return { total, done, percent, rows };
}
