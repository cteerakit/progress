import { getDeckCounts } from '../utils/counts';
import {
  buildCatalogDiffRequests,
  buildCatalogDiffRequestGroups,
  buildMarkerDiffRequests,
  buildMarkerDiffRequestGroups,
  CATALOG_MARKER_TITLE,
  decodeMarkerPayload,
  decodePresentationMetadata,
  encodeMarkerPayload,
  MARKER_TITLE,
  presentationPageObjectIds,
  presentationSlideKeys,
  resolveCatalogPageObjectId,
  slideKeyFromObjectId,
} from '../utils/slide-metadata';
import {
  bumpStatusPresetConfig,
  cloneStatusPresetConfig,
  decodeCatalogPayload,
  DEFAULT_STATUS_PRESET_CONFIG,
  encodeCatalogPayload,
} from '../utils/status-presets';
import { reassignDeckStatus } from '../utils/status';
import {
  appendSlideLogEntry,
  collectDeckHistory,
  decodeMarkerLogV3,
  encodeMarkerPayloadCore,
  MARKER_DESCRIPTION_MAX_CHARS,
  normalizeSlideLog,
  truncateSlideLogToMarkerBudget,
} from '../utils/slide-log';
import {
  decodeUsersPayload,
  encodeUsersPayload,
  registerUserInCatalog,
} from '../utils/user-catalog';
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
  pruneDeckToExistingSlides,
  pruneRedundantIndexSlides,
  resetDeckStatuses,
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

const withLog = appendSlideLogEntry(
  { status: 'todo', updatedAt: 300 },
  { status: 'done', updatedAt: 310 },
);
const loggedPayload = encodeMarkerPayload(withLog);
assert(
  loggedPayload.includes('.') && loggedPayload.startsWith('1:d:'),
  'logged payload must append older entries after the current status',
);
const decodedLog = decodeMarkerPayload(loggedPayload);
assert(
  decodedLog?.status === 'done' &&
    decodedLog.updatedAt === 310 &&
    normalizeSlideLog(decodedLog).length === 2,
  'logged marker payload must round-trip current status and history',
);

const hugeLog = Array.from({ length: 200 }, (_, index) => ({
  status: 'todo' as const,
  updatedAt: 10_000 + index,
}));
const truncated = truncateSlideLogToMarkerBudget(hugeLog);
const truncatedPayload = encodeMarkerPayloadCore(truncated);
assert(
  truncated.length < hugeLog.length &&
    new TextEncoder().encode(truncatedPayload).length <=
      MARKER_DESCRIPTION_MAX_CHARS &&
    truncated[0]?.updatedAt === hugeLog[0]?.updatedAt,
  'truncation must keep the newest entries within the marker budget',
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
assert(createShapeRequest, 'create marker request must exist');
const createTransform = (
  createShapeRequest!.createShape as {
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
  updateRequests.length === 5 &&
    updateRequests.some((request) => 'deleteObject' in request) &&
    updateRequests.some((request) => 'createShape' in request) &&
    updateRequests.some(
      (request) =>
        'updatePageElementAltText' in request &&
        (request.updatePageElementAltText as { objectId: string })
          .objectId === 'progress_marker_p1',
    ),
  'diff must recreate an existing marker when local is newer',
);

const resetWithHistory = buildMarkerDiffRequests(
  {
    'id.p1': {
      status: 'none',
      updatedAt: 260,
      log: [
        { status: 'none', updatedAt: 260 },
        { status: 'done', updatedAt: 200 },
      ],
    },
  },
  remote.markers,
);
assert(
  resetWithHistory.length === 5 &&
    resetWithHistory.some((request) => 'createShape' in request),
  'resetting to none with history must recreate the marker instead of deleting it',
);

const deleteRequests = buildMarkerDiffRequests(
  {
    'id.p1': { status: 'none', updatedAt: 0 },
  },
  remote.markers,
);
const deleteRequest = deleteRequests[0];
assert(
  deleteRequests.length === 1 &&
    deleteRequest &&
    'deleteObject' in deleteRequest,
  'clearing a slide with no history must delete the remote marker',
);

const resetDeck = resetDeckStatuses({
  slides: {
    'id.p1': { status: 'done', updatedAt: 100 },
    'id.p2': { status: 'none', updatedAt: 0 },
  },
  idsByIndex: {},
});
assert(
  resetDeck.slides['id.p1']?.status === 'none' &&
    normalizeSlideLog(resetDeck.slides['id.p1'] ?? { status: 'none', updatedAt: 0 })
      .length === 2,
  'reset all must append a none entry while preserving prior history',
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

const splitScenarioGroups = buildMarkerDiffRequestGroups(
  {
    'id.p10': { status: 'todo', updatedAt: 310 },
  },
  Array.from({ length: 11 }, (_, index) => ({
    elementId: `orphan-${index}`,
    slideKey: `id.orphan-${index}`,
    record: { status: 'done' as const, updatedAt: 100 + index },
  })),
);
const createGroup = splitScenarioGroups.find((group) =>
  group.some((request) => 'createShape' in request),
);
assert(
  splitScenarioGroups.length === 12 &&
    createGroup?.length === 4 &&
    createGroup.some((request) => 'updateShapeProperties' in request),
  'marker diff groups must keep createShape follow-ups with their create call',
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

const customRecord = {
  status: 's_review',
  updatedAt: 1_700_000_200,
};
const customPayload = encodeMarkerPayload(customRecord);
assert(
  customPayload.startsWith('2:s_review:'),
  'custom statuses must encode with payload version 2',
);
const decodedCustom = decodeMarkerPayload(customPayload);
assert(
  decodedCustom?.status === 's_review' &&
    decodedCustom.updatedAt === 1_700_000_200,
  'custom marker payload must round-trip',
);

const catalog = bumpStatusPresetConfig(
  cloneStatusPresetConfig({
    ...DEFAULT_STATUS_PRESET_CONFIG,
    statuses: [
      ...DEFAULT_STATUS_PRESET_CONFIG.statuses,
      {
        id: 's_review',
        label: 'Review',
        color: '#4285f4',
        icon: 'check_circle',
      },
    ],
  }),
);
const catalogPayload = encodeCatalogPayload(catalog);
const decodedCatalog = decodeCatalogPayload(catalogPayload);
assert(
  decodedCatalog?.statuses.some((preset) => preset.id === 's_review') &&
    decodedCatalog.completeStatusIds.includes('done'),
  'catalog payload must round-trip custom statuses',
);

const catalogPresentation = {
  revisionId: 'rev-1',
  notesMaster: {
    objectId: 'n',
    pageElements: [
      {
        objectId: 'catalog-marker',
        title: CATALOG_MARKER_TITLE,
        description: catalogPayload,
      },
    ],
  },
  slides: [{ objectId: 'p1', pageElements: [] }],
};
const catalogRemote = decodePresentationMetadata(catalogPresentation);
assert(
  catalogRemote.catalog?.config.statuses.some((preset) => preset.id === 's_review') &&
    catalogRemote.catalog?.pageObjectId === 'n',
  'presentation decode must still read a legacy catalog marker from notes master',
);
assert(
  resolveCatalogPageObjectId(catalogPresentation) === 'p1',
  'new catalog markers must target the first slide, not the notes master',
);

const catalogCreate = buildCatalogDiffRequests(
  catalog,
  null,
  catalogPresentation,
);
const catalogCreateGroups = buildCatalogDiffRequestGroups(
  catalog,
  null,
  catalogPresentation,
);
const catalogCreateShape = catalogCreate.find(
  (request) => 'createShape' in request,
) as
  | {
      createShape?: { elementProperties?: { pageObjectId?: string } };
    }
  | undefined;
assert(
  catalogCreateGroups.length === 1 &&
    catalogCreateGroups[0]?.some((request) => 'createShape' in request),
  'catalog diff must return grouped create requests',
);
assert(
  catalogCreateShape?.createShape?.elementProperties?.pageObjectId === 'p1',
  'missing catalog marker must create a hidden shape on the first slide',
);

const catalogMigrate = buildCatalogDiffRequests(
  catalog,
  catalogRemote.catalog,
  catalogPresentation,
);
const catalogMigrateShape = catalogMigrate.find(
  (request) => 'createShape' in request,
) as
  | {
      createShape?: { elementProperties?: { pageObjectId?: string } };
    }
  | undefined;
assert(
  catalogMigrateShape?.createShape?.elementProperties?.pageObjectId === 'p1',
  'a notes-master catalog must be rewritten onto the first slide',
);

const slideCatalogPresentation = {
  revisionId: 'rev-1',
  notesMaster: {
    objectId: 'n',
    pageElements: [
      {
        objectId: 'legacy-catalog',
        title: CATALOG_MARKER_TITLE,
        description: catalogPayload,
      },
    ],
  },
  slides: [
    {
      objectId: 'p1',
      pageElements: [
        {
          objectId: 'slide-catalog',
          title: CATALOG_MARKER_TITLE,
          description: catalogPayload,
        },
      ],
    },
  ],
};
const slideCatalogRemote = decodePresentationMetadata(slideCatalogPresentation);
assert(
  slideCatalogRemote.catalog?.elementId === 'slide-catalog',
  'catalog decode must prefer a writable slide marker over notes master',
);

const customComplete = bumpStatusPresetConfig({
  ...DEFAULT_STATUS_PRESET_CONFIG,
  completeStatusIds: ['in-progress'],
});
const customCounts = getDeckCounts(
  4,
  {
    slides: {
      'id.p1': { status: 'in-progress', updatedAt: 1 },
      'id.p2': { status: 'todo', updatedAt: 1 },
      'id.p3': { status: 'done', updatedAt: 1 },
      'id.p4': { status: 'none', updatedAt: 0 },
    },
    idsByIndex: {
      '0': 'id.p1',
      '1': 'id.p2',
      '2': 'id.p3',
      '3': 'id.p4',
    },
  },
  {
    '0': 'id.p1',
    '1': 'id.p2',
    '2': 'id.p3',
    '3': 'id.p4',
  },
  customComplete,
);
assert(
  customCounts.percent === 25 && customCounts.done === 1,
  'completion percent must follow the configured complete status',
);

const multiComplete = bumpStatusPresetConfig({
  ...DEFAULT_STATUS_PRESET_CONFIG,
  completeStatusIds: ['done', 'in-progress'],
});
const multiCounts = getDeckCounts(
  4,
  {
    slides: {
      'id.p1': { status: 'in-progress', updatedAt: 1 },
      'id.p2': { status: 'todo', updatedAt: 1 },
      'id.p3': { status: 'done', updatedAt: 1 },
      'id.p4': { status: 'none', updatedAt: 0 },
    },
    idsByIndex: {
      '0': 'id.p1',
      '1': 'id.p2',
      '2': 'id.p3',
      '3': 'id.p4',
    },
  },
  {
    '0': 'id.p1',
    '1': 'id.p2',
    '2': 'id.p3',
    '3': 'id.p4',
  },
  multiComplete,
);
assert(
  multiCounts.percent === 50 && multiCounts.done === 2,
  'completion percent must include every configured complete status',
);

const reassigned = reassignDeckStatus(
  {
    slides: {
      'id.p1': { status: 's_old', updatedAt: 10 },
      'id.p2': { status: 'todo', updatedAt: 10 },
    },
    idsByIndex: {},
  },
  's_old',
  'none',
);
assert(
  reassigned.slides['id.p1']?.status === 'none' &&
    reassigned.slides['id.p2']?.status === 'todo',
  'deleting a preset must be able to reassign slides to none',
);

const historyDeck: DeckState = {
  slides: {
    'id.p1': {
      status: 'done',
      updatedAt: 200,
      log: [
        { status: 'done', updatedAt: 200 },
        { status: 'todo', updatedAt: 100 },
      ],
    },
    'id.p2': { status: 'in-progress', updatedAt: 150 },
    'index:0': {
      status: 'done',
      updatedAt: 200,
      log: [
        { status: 'done', updatedAt: 200 },
        { status: 'todo', updatedAt: 100 },
      ],
    },
  },
  idsByIndex: { '0': 'id.p1', '1': 'id.p2' },
};
const history = collectDeckHistory(historyDeck);
assert(
  history.length === 3 &&
    history[0]?.updatedAt === 200 &&
    history[0]?.fromStatus === 'todo' &&
    history[0]?.status === 'done' &&
    history[0]?.slideIndex === 0 &&
    history[1]?.updatedAt === 150 &&
    history[1]?.fromStatus === 'none' &&
    history[1]?.status === 'in-progress' &&
    history[1]?.slideIndex === 1 &&
    history[2]?.updatedAt === 100 &&
    history[2]?.fromStatus === 'none' &&
    history[2]?.status === 'todo' &&
    history[2]?.slideIndex === 0,
  'collectDeckHistory must dedupe alias keys and sort newest first',
);

const staleDeck: DeckState = {
  slides: {
    'id.p1': { status: 'todo', updatedAt: 100 },
    'id.gdeleted': { status: 'done', updatedAt: 200 },
    'index:1': { status: 'in-progress', updatedAt: 150 },
  },
  idsByIndex: { '0': 'id.p1', '1': 'id.gdeleted', '34': 'id.gdeleted' },
};
const validKeys = new Set(['id.p1']);
const prunedStale = pruneDeckToExistingSlides(staleDeck, validKeys);
assert(
  prunedStale.slides['id.p1']?.status === 'todo' &&
    prunedStale.slides['id.gdeleted'] == null &&
    prunedStale.slides['index:1']?.status === 'in-progress' &&
    prunedStale.idsByIndex['0'] === 'id.p1' &&
    prunedStale.idsByIndex['1'] == null &&
    prunedStale.idsByIndex['34'] == null,
  'pruneDeckToExistingSlides must drop stale id.* records and mappings',
);

const staleMerge = mergeDeckStates(
  staleDeck,
  { 'id.p1': { status: 'none', updatedAt: 0 } },
  { canEdit: true, validSlideKeys: validKeys },
);
assert(
  staleMerge.remoteChanged === false,
  'merge must not push markers for slides deleted from the presentation',
);

const livePresentation = {
  slides: [{ objectId: 'p1' }, { objectId: 'g3fa6e2bd5bd_95_0' }],
};
const pageIds = presentationPageObjectIds(livePresentation);
const staleCreate = buildMarkerDiffRequestGroups(
  {
    'id.p1': { status: 'todo', updatedAt: 100 },
    'id.gdeleted': { status: 'done', updatedAt: 200 },
  },
  [],
  pageIds,
);
assert(
  staleCreate.length === 1 &&
    staleCreate[0]?.some((request) => 'createShape' in request) &&
    !staleCreate.some((group) =>
      group.some(
        (request) =>
          'createShape' in request &&
          (request.createShape as { elementProperties?: { pageObjectId?: string } })
            .elementProperties?.pageObjectId === 'gdeleted',
      ),
    ),
  'marker diff must skip createShape for page ids not in the presentation',
);
assert(
  presentationSlideKeys(livePresentation).has('id.p1') &&
    presentationSlideKeys(livePresentation).has('id.g3fa6e2bd5bd_95_0'),
  'presentationSlideKeys must map page object ids to slide keys',
);

const userCatalog = registerUserInCatalog(
  registerUserInCatalog(
    { version: 1, updatedAt: 0, users: [] },
    { email: 'alice@example.com', picture: 'https://example.com/a.png' },
  ).catalog,
  { email: 'bob@example.com' },
).catalog;
const usersPayload = encodeUsersPayload(userCatalog);
assert(
  decodeUsersPayload(usersPayload)?.users.length === 2 &&
    decodeUsersPayload(usersPayload)?.users[0]?.email === 'alice@example.com',
  'users catalog payload must round-trip collaborators',
);

const attributedLog = appendSlideLogEntry(
  { status: 'todo', updatedAt: 300, log: [{ status: 'todo', updatedAt: 300, updatedBy: 0 }] },
  { status: 'done', updatedAt: 310, updatedBy: 1 },
);
const attributedPayload = encodeMarkerPayloadCore(normalizeSlideLog(attributedLog));
const decodedAttributed = decodeMarkerLogV3('done', attributedPayload.split(':').slice(2).join(':'));
assert(
  decodedAttributed?.status === 'done' &&
    normalizeSlideLog(decodedAttributed)[0]?.updatedBy === 1 &&
    normalizeSlideLog(decodedAttributed)[1]?.updatedBy === 0,
  'marker payload v3 must round-trip editor attribution',
);

console.log('deck merge tests passed');
