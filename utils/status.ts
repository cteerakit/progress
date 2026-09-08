export type SlideStatus = 'none' | 'todo' | 'in-progress' | 'done';

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
  { value: 'done', label: 'Done' },
];

export const STATUS_COLORS: Record<SlideStatus, string> = {
  none: '#9aa0a6',
  todo: '#f9ab00',
  'in-progress': '#1a73e8',
  done: '#34a853',
};

export const STATUS_CODES: Record<SlideStatus, string> = {
  none: 'n',
  todo: 't',
  'in-progress': 'i',
  done: 'd',
};

const CODE_TO_STATUS: Record<string, SlideStatus> = {
  n: 'none',
  t: 'todo',
  i: 'in-progress',
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

export function getSlideRecord(
  deck: DeckState,
  slideKey: string,
): SlideRecord {
  return deck.slides[slideKey] ?? { status: 'none', updatedAt: 0 };
}
