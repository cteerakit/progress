import {
  encodeDeckToAppProperties,
  decodeAppPropertiesToSlides,
  mergeDeckStates,
} from '../utils/drive';
import {
  applyLocalDeckSave,
  applyReadOnlyRemoteDeck,
  applyStorageDeckUpdate,
  assignIndexSlideId,
  createEmptyDeck,
  isDriveSlideId,
  nextUpdatedAt,
  pickSlideKey,
  pruneRedundantIndexSlides,
  resolveSlideRecord,
  uniqueIndexMappings,
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

const viewerLocal: DeckState = {
  slides: { 'id.p1': { status: 'done', updatedAt: 200 } },
  idsByIndex: { '0': 'id.p1' },
};
const viewerRemote = {
  'id.p1': { status: 'todo' as const, updatedAt: 100 },
};
const viewerMerge = mergeDeckStates(viewerLocal, viewerRemote, { canEdit: false });
assert(
  viewerMerge.merged.slides['id.p1']?.status === 'todo' &&
    viewerMerge.remoteChanged === false,
  'view-only merge must take remote statuses and never mark Drive for write',
);

const viewerApplied = applyReadOnlyRemoteDeck(viewerLocal, {
  slides: viewerRemote,
  idsByIndex: { '0': 'id.p1' },
});
assert(
  viewerApplied.slides['id.p1']?.status === 'todo',
  'view-only storage apply must not keep newer local status edits',
);

assert(
  pickSlideKey('id.greal35', 25, { '25': 'id.gstale' }) === 'id.greal35',
  'live filmstrip page id must win over a stale index mapping',
);
assert(
  pickSlideKey(null, 25, { '25': 'id.gmapped' }) === 'id.gmapped',
  'index mapping is used when the thumbnail has no page id',
);
assert(
  pickSlideKey(null, 25, {}, 'id.ghash') === 'id.ghash',
  'selected hash id is used when there is no live page id',
);
assert(
  pickSlideKey(null, 25, {}) === 'index:25',
  'index key is the last-resort identity',
);

const leaked: DeckState = {
  slides: {
    'id.greal35': { status: 'todo', updatedAt: 10 },
    'id.gstale': { status: 'in-progress', updatedAt: 99 },
  },
  idsByIndex: { '34': 'id.gstale' },
};
assert(
  resolveSlideRecord(leaked, 'id.greal35', 34).status === 'todo',
  'a conflicting index mapping must not steal another slide\'s status',
);

const dups = uniqueIndexMappings({
  '25': 'id.gshared',
  '34': 'id.greal',
  '92': 'id.gshared',
  '99': 'id.gshared',
});
assert(
  dups['34'] === 'id.greal' &&
    dups['99'] === 'id.gshared' &&
    dups['25'] == null &&
    dups['92'] == null,
  'duplicate index mappings must collapse to one index per slide id',
);

const ids: Record<string, string> = {
  '25': 'id.gshared',
  '92': 'id.gshared',
};
assert(
  assignIndexSlideId(ids, 34, 'id.gshared') === true &&
    ids['34'] === 'id.gshared' &&
    ids['25'] == null &&
    ids['92'] == null,
  'assigning a live id must unbind it from other indices',
);

const savedDups: DeckState = {
  slides: { 'id.gshared': { status: 'in-progress', updatedAt: 50 } },
  idsByIndex: { '25': 'id.gshared', '92': 'id.gshared', '99': 'id.gshared' },
};
const afterDedupe = applyLocalDeckSave(savedDups, {
  slides: { 'id.greal35': { status: 'todo', updatedAt: 51 } },
  idsByIndex: { '34': 'id.greal35' },
});
assert(
  afterDedupe.idsByIndex['34'] === 'id.greal35' &&
    Object.values(afterDedupe.idsByIndex).filter((id) => id === 'id.gshared')
      .length === 1,
  'saving live thumbnail ids must not keep duplicate mappings',
);

console.log('deck merge tests passed');
