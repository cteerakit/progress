import type { DeckState, SlideRecord, SlideStatus } from './status';
import { indexSlideKey, resolveSlideRecord, STATUS_ORDER } from './status';

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

const COUNT_LABELS: Record<SlideStatus, string> = {
  none: 'No status',
  todo: 'To do',
  'in-progress': 'In progress',
  'need-attention': 'Need attention',
  done: 'Done',
};

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
): DeckCounts {
  const counts: Record<SlideStatus, number> = {
    none: 0,
    todo: 0,
    'in-progress': 0,
    'need-attention': 0,
    done: 0,
  };
  for (let index = 0; index < slideCount; index += 1) {
    const record = getStatusForDeckIndex(deck, index, indexSlideKeys);
    counts[record.status] += 1;
  }

  const total = slideCount;
  const done = counts.done;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  const rows: SlideCountRow[] = STATUS_ORDER.map((status) => ({
    status,
    label: COUNT_LABELS[status],
    count: counts[status],
  }));
  return { total, done, percent, rows };
}
