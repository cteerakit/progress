import type { SlideStatus } from './status';
import { getSlideRecord } from './status';

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
  done: 'Done',
};

export function getDeckCounts(
  slideKeys: string[],
  slides: Record<string, { status: SlideStatus; updatedAt: number }>,
): DeckCounts {
  const counts: Record<SlideStatus, number> = {
    none: 0,
    todo: 0,
    'in-progress': 0,
    done: 0,
  };

  for (const slideKey of slideKeys) {
    const record = getSlideRecord({ slides, idsByIndex: {} }, slideKey);
    counts[record.status] += 1;
  }

  const total = slideKeys.length;
  const done = counts.done;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  const rows: SlideCountRow[] = (
    ['none', 'todo', 'in-progress', 'done'] as SlideStatus[]
  ).map((status) => ({
    status,
    label: COUNT_LABELS[status],
    count: counts[status],
  }));

  return { total, done, percent, rows };
}
