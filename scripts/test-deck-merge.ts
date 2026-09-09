import {
  buildMarkerDiffRequests,
  decodeMarkerPayload,
  decodePresentationMetadata,
  encodeMarkerPayload,
  MARKER_TITLE,
  slideKeyFromObjectId,
} from '../utils/slide-metadata';
import {
  applyLocalDeckSave,
  applyReadOnlyRemoteDeck,
  applyStorageDeckUpdate,
  assignIndexSlideId,
  createEmptyDeck,
  isDriveSlideId,
  mergeDeckStates,
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

const record: SlideRecord = { status: 'todo', updatedAt: 1_700_000_100 };
const payload = encodeMarkerPayload(record);
assert(
  payload.startsWith('1:t:'),
  'marker payload must encode version, status code, and timestamp',
);
const decoded = decodeMarkerPayload(payload);
assert(
  decoded?.status === 'todo' && decoded.updatedAt === 1_700_000_100,
  'marker payload must round-trip',
);

const presentation = {
  revisionId: 'rev-1',
  slides: [
    {
      objectId: 'p1',
      pageElements: [
        {
          objectId: 'marker-p1',
          title: MARKER_TITLE,
          description: encodeMarkerPayload({ status: 'done', updatedAt: 200 }),
        },
      ],
    },
    {
      objectId: 'gabc123',
      pageElements: [],
    },
  ],
};
const remote = decodePresentationMetadata(presentation);
assert(
  remote.slides['id.p1']?.status === 'done' &&
    remote.slides['id.p1']?.updatedAt === 200 &&
    remote.idsByIndex['0'] === 'id.p1' &&
    remote.idsByIndex['1'] === 'id.gabc123' &&
    remote.markers.length === 1,
  'presentation decode must map markers and slide order',
);

const createRequests = buildMarkerDiffRequests(
  {
    'id.p2': { status: 'in-progress', updatedAt: 300 },
    'index:5': { status: 'todo', updatedAt: 301 },
  },
  [],
);
const createShapeRequest = createRequests.find(
  (request) => 'createShape' in request,
);
assert(
  createShapeRequest &&
    createRequests.some((request) => 'updatePageElementAltText' in request) &&
    !createRequests.some(
      (request) =>
        'createShape' in request &&
        (request.createShape as { elementProperties?: { pageObjectId?: string } })
          .elementProperties?.pageObjectId === '5',
    ),
  'diff must create markers for slide ids but not index keys',
);
const createTransform = (
  createShapeRequest.createShape as {
    elementProperties?: { transform?: { translateX?: number; translateY?: number } };
  }
).elementProperties?.transform;
assert(
  createTransform?.translateX === -1 && createTransform?.translateY === 0,
  'markers must sit just left of the slide top edge to avoid editor scrolling',
);

const updateRequests = buildMarkerDiffRequests(
  {
    'id.p1': { status: 'todo', updatedAt: 250 },
  },
  remote.markers,
);
assert(
  updateRequests.length === 2 &&
    updateRequests.some((request) => 'updatePageElementTransform' in request) &&
    updateRequests.some(
      (request) =>
        'updatePageElementAltText' in request &&
        (request.updatePageElementAltText as { objectId: string })
          .objectId === 'marker-p1',
    ),
  'diff must reposition and update an existing marker when local is newer',
);

const deleteRequests = buildMarkerDiffRequests(
  {
    'id.p1': { status: 'none', updatedAt: 260 },
  },
  remote.markers,
);
const deleteRequest = deleteRequests[0];
assert(
  deleteRequests.length === 1 &&
    deleteRequest &&
    'deleteObject' in deleteRequest,
  'resetting to none must delete the remote marker',
);

const orphanDelete = buildMarkerDiffRequests({}, remote.markers);
const orphanRequest = orphanDelete[0];
assert(
  orphanDelete.length === 1 &&
    orphanRequest &&
    (orphanRequest.deleteObject as { objectId: string }).objectId ===
      'marker-p1',
  'local deck without a slide must delete leftover remote markers',
);

assert(
  slideKeyFromObjectId('p1') === 'id.p1',
  'slide keys must use the id. prefix',
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
  'view-only merge must take remote statuses and never mark Slides for write',
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

const editorMerge = mergeDeckStates(
  { slides: { 'id.p1': { status: 'todo', updatedAt: 100 } }, idsByIndex: {} },
  { 'id.p1': { status: 'done', updatedAt: 150 } },
  { canEdit: true },
);
assert(
  editorMerge.merged.slides['id.p1']?.status === 'done' &&
    editorMerge.localChanged === true,
  'editor merge must accept newer remote statuses',
);

const pushMerge = mergeDeckStates(
  { slides: { 'id.p1': { status: 'done', updatedAt: 200 } }, idsByIndex: {} },
  { 'id.p1': { status: 'todo', updatedAt: 150 } },
  { canEdit: true },
);
assert(
  pushMerge.remoteChanged === true &&
    pushMerge.merged.slides['id.p1']?.status === 'done',
  'editor merge must keep newer local statuses for push',
);

console.log('deck merge tests passed');
