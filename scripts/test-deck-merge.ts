import {
  encodeDeckToAppProperties,
  decodeAppPropertiesToSlides,
} from '../utils/drive';
import {
  applyLocalDeckSave,
  applyStorageDeckUpdate,
  createEmptyDeck,
  isDriveSlideId,
  nextUpdatedAt,
  pruneRedundantIndexSlides,
  resolveSlideRecord,
  type DeckState,
  type SlideRecord,
} from '../utils/status';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const empty = createEmptyDeck();

const saved: DeckState = {
  slides: { 'id.p1': { status: 'todo', updatedAt: 100 } },
  idsByIndex: { '0': 'id.p1' },
};

const stale: DeckState = {
  slides: {},
  idsByIndex: {},
};

const afterStaleWrite = applyLocalDeckSave(saved, stale);
assert(
  afterStaleWrite.slides['id.p1']?.status === 'todo',
  'stale full-deck save must not drop a newer slide status',
);

const olderNone: DeckState = {
  slides: { 'id.p1': { status: 'none', updatedAt: 50 } },
  idsByIndex: { '0': 'id.p1' },
};
const afterOlderNone = applyLocalDeckSave(saved, olderNone);
assert(
  afterOlderNone.slides['id.p1']?.status === 'todo',
  'older none must not overwrite a newer status',
);

const localOptimistic: DeckState = {
  slides: { 'id.p1': { status: 'in-progress', updatedAt: 120 } },
  idsByIndex: { '0': 'id.p1' },
};
const fromStorage = applyStorageDeckUpdate(localOptimistic, saved);
assert(
  fromStorage.slides['id.p1']?.status === 'in-progress',
  'in-memory newer status must win over older storage updates',
);

const mixed: DeckState = {
  slides: {
    'index:0': { status: 'done', updatedAt: 80 },
  },
  idsByIndex: { '0': 'id.p1' },
};
assert(
  resolveSlideRecord(mixed, 'index:0', 0).status === 'done',
  'status stored under an index key should still resolve',
);
const pruned = pruneRedundantIndexSlides(mixed);
assert(
  pruned.slides['id.p1']?.status === 'done' && !pruned.slides['index:0'],
  'index keys should migrate onto the mapped slide id',
);

assert(nextUpdatedAt(100, 100) === 101, 'local writes must bump same-second timestamps');
assert(nextUpdatedAt(0, 50) === 50, 'first write can use wall-clock seconds');

const afterMerge = applyLocalDeckSave(empty, saved);
assert(
  afterMerge.slides['id.p1']?.status === 'todo',
  'first save into an empty deck should keep the new status',
);

assert(isDriveSlideId('id.p'), 'first slide id.p must be accepted');
assert(isDriveSlideId('id.p1'), 'id.p1 must be accepted');
assert(isDriveSlideId('id.gabc123'), 'id.g… must be accepted');
assert(!isDriveSlideId('id.0'), 'generic data-id values must not count as slide ids');

const manySlides: Record<string, SlideRecord> = {};
for (let i = 1; i <= 20; i += 1) {
  manySlides[`id.p${i}`] = { status: 'todo', updatedAt: 1_700_000_000 + i };
}
const encoded = encodeDeckToAppProperties(manySlides);
assert(
  Object.keys(encoded).filter((key) => key.startsWith('s')).length > 1,
  'large decks must span multiple Drive property chunks',
);
const decoded = decodeAppPropertiesToSlides(encoded);
assert(
  Object.keys(decoded).length === 20 && decoded['id.p20']?.status === 'todo',
  'chunked Drive payloads must round-trip every slide status',
);

const repaired = decodeAppPropertiesToSlides({
  v: '1',
  s0: 'id.p1:t:100',
  s1: 'id.p2:d:101',
});
assert(
  repaired['id.p1']?.status === 'todo' && repaired['id.p2']?.status === 'done',
  'chunk join must restore the pipe between Drive property chunks',
);

const ignoredCorrupt = decodeAppPropertiesToSlides({
  v: '1',
  s0: 'id.p1:t:100id.p2:d:101',
});
assert(
  ignoredCorrupt['id.p1'] == null,
  'concatenated corrupt entries must not decode as none',
);

const mappingKept = applyLocalDeckSave(
  { slides: { 'id.p1': { status: 'todo', updatedAt: 100 } }, idsByIndex: { '0': 'id.p1' } },
  { slides: { 'id.p1': { status: 'todo', updatedAt: 100 } }, idsByIndex: { '0': 'id.clip0' } },
);
assert(
  mappingKept.idsByIndex['0'] === 'id.p1',
  'a real slide-id mapping must not be replaced by a bogus id',
);

console.log('deck merge tests passed');
