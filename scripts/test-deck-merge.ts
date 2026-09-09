import { getDeckCounts, resolveDeckSlideCount } from '../utils/counts';
import {
  buildCatalogDiffRequests,
  buildCatalogDiffRequestGroups,
  buildCatalogMarkerDeleteRequestGroups,
  buildMarkerDiffRequests,
  buildMarkerDiffRequestGroups,
  buildUsersMarkerDeleteRequestGroups,
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
  buildCatalogUsersAppPropertiesPatch,
  catalogUsersAppPropertiesEqual,
  decodeAppPropertiesToCatalog,
  decodeAppPropertiesToUsers,
  driveAppPropertiesNeedWrite,
  encodeCatalogUsersToAppProperties,
  hasDriveCatalogOrUsers,
} from '../utils/drive-metadata';
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
  clearSlideHistory,
  collectDeckHistory,
  decodeMarkerLogV3,
  encodeMarkerPayloadCore,
  MARKER_DESCRIPTION_MAX_CHARS,
  normalizeSlideLog,
  prepareSlideRecord,
  truncateSlideLogToMarkerBudget,
} from '../utils/slide-log';
import {
  decodeUsersDrivePayload,
  decodeUsersPayload,
  encodeUsersDrivePayload,
  encodeUsersPayload,
  mergeUserCatalogs,
  registerUserInCatalog,
} from '../utils/user-catalog';
import {
  applyLocalDeckSave,
  applyReadOnlyRemoteDeck,
  applyStorageDeckUpdate,
  assignIndexSlideId,
  clearDeckHistory,
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
  getMappedSlideCount,
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

const occupiedIdGroups = buildMarkerDiffRequestGroups(
  {
    'id.p2': { status: 'todo', updatedAt: 400 },
  },
  [],
  new Set(['p2']),
  new Set(['progress_marker_p2']),
);
assert(
  occupiedIdGroups.length === 1 &&
    occupiedIdGroups[0]?.some((request) => 'updatePageElementAltText' in request) &&
    !occupiedIdGroups.some((group) =>
      group.some((request) => 'createShape' in request),
    ),
  'must update in place when the deterministic marker id already exists',
);

const untitledMarker = decodePresentationMetadata({
  slides: [
    {
      objectId: 'g3e2ddb2740b_0_1227',
      pageElements: [
        { objectId: 'progress_marker_g3e2ddb2740b_0_1227' },
      ],
    },
  ],
});
assert(
  untitledMarker.slides['id.g3e2ddb2740b_0_1227'] == null &&
    untitledMarker.markers.some(
      (marker) => marker.elementId === 'progress_marker_g3e2ddb2740b_0_1227',
    ) &&
    untitledMarker.occupiedElementIds.has('progress_marker_g3e2ddb2740b_0_1227'),
  'an existing marker shape without alt text must still occupy its object id',
);
const untitledReset = buildMarkerDiffRequests(
  {
    'id.g3e2ddb2740b_0_1227': {
      status: 'none',
      updatedAt: 500,
      log: [
        { status: 'none', updatedAt: 500 },
        { status: 'done', updatedAt: 400 },
      ],
    },
  },
  untitledMarker.markers,
  new Set(['g3e2ddb2740b_0_1227']),
  untitledMarker.occupiedElementIds,
);
assert(
  untitledReset.some((request) => 'updatePageElementAltText' in request) &&
    !untitledReset.some((request) => 'createShape' in request),
  'reset all must not createShape over a leftover marker object id',
);

const updateRequests = buildMarkerDiffRequests(
  {
    'id.p1': { status: 'todo', updatedAt: 250 },
  },
  remote.markers,
);
assert(
  updateRequests.length === 1 &&
    !updateRequests.some((request) => 'deleteObject' in request) &&
    !updateRequests.some((request) => 'createShape' in request) &&
    updateRequests.some(
      (request) =>
        'updatePageElementAltText' in request &&
        (request.updatePageElementAltText as { objectId: string })
          .objectId === 'marker-p1',
    ),
  'diff must update an existing marker in place when local is newer',
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
  resetWithHistory.length === 1 &&
    resetWithHistory.some((request) => 'updatePageElementAltText' in request) &&
    !resetWithHistory.some((request) => 'deleteObject' in request),
  'resetting to none with history must update the marker instead of deleting it',
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

const virtualizedIds: Record<string, string> = {};
for (let index = 0; index < 103; index += 1) {
  virtualizedIds[String(index)] = `id.gslide${index}`;
}
assert(
  getMappedSlideCount(virtualizedIds) === 103,
  'mapped slide count must use the full index map, not visible thumbnails',
);
assert(
  resolveDeckSlideCount(14, virtualizedIds) === 103,
  'badge total must not follow a virtualized filmstrip window',
);
assert(
  resolveDeckSlideCount(104, virtualizedIds) === 104,
  'a larger live filmstrip total must win after a slide is added',
);
assert(
  resolveDeckSlideCount(1, {}) === 1,
  'a 1-slide filmstrip must still count as 1 before mappings exist',
);

const virtualizedCounts = getDeckCounts(
  resolveDeckSlideCount(14, virtualizedIds) ?? 0,
  {
    slides: {
      'id.gslide0': { status: 'todo', updatedAt: 1 },
      'id.gslide50': { status: 'done', updatedAt: 1 },
      'id.gslide102': { status: 'done', updatedAt: 1 },
    },
    idsByIndex: virtualizedIds,
  },
  virtualizedIds,
);
assert(
  virtualizedCounts.total === 103 &&
    virtualizedCounts.done === 2 &&
    virtualizedCounts.rows.find((row) => row.status === 'todo')?.count === 1 &&
    virtualizedCounts.rows.find((row) => row.status === 'none')?.count === 100,
  'breakdown must include off-screen slides before the filmstrip is scrolled',
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
  history.length === 2 &&
    history[0]?.updatedAt === 200 &&
    history[0]?.fromStatus === 'todo' &&
    history[0]?.status === 'done' &&
    history[0]?.slideIndex === 0 &&
    history[1]?.updatedAt === 100 &&
    history[1]?.fromStatus === 'none' &&
    history[1]?.status === 'todo' &&
    history[1]?.slideIndex === 0,
  'collectDeckHistory must dedupe alias keys and sort newest first',
);

const noOpHistoryDeck: DeckState = {
  slides: {
    'id.p1': {
      status: 'none',
      updatedAt: 500,
      log: [{ status: 'none', updatedAt: 500, updatedBy: 0 }],
    },
  },
  idsByIndex: { '0': 'id.p1' },
};
assert(
  collectDeckHistory(noOpHistoryDeck).length === 0,
  'collectDeckHistory must skip no-op none transitions',
);
assert(
  prepareSlideRecord({
    status: 'none',
    updatedAt: 500,
    log: [{ status: 'none', updatedAt: 500, updatedBy: 0 }],
  }).log === undefined,
  'prepareSlideRecord must drop attribution-only none logs',
);
assert(
  collectDeckHistory({
    slides: {
      'id.p1': {
        status: 'none',
        updatedAt: 260,
        log: [
          { status: 'none', updatedAt: 260 },
          { status: 'done', updatedAt: 200 },
        ],
      },
    },
    idsByIndex: { '0': 'id.p1' },
  }).some(
    (entry) => entry.fromStatus === 'done' && entry.status === 'none',
  ),
  'collectDeckHistory must still show meaningful none transitions',
);

const clearedHistoryDeck = clearDeckHistory(historyDeck);
assert(
  collectDeckHistory(clearedHistoryDeck).length === 0 &&
    clearedHistoryDeck.slides['id.p1']?.status === 'done' &&
    (clearedHistoryDeck.slides['id.p1']?.updatedAt ?? 0) > 200 &&
    clearedHistoryDeck.slides['id.p1']?.log?.length === 0 &&
    clearedHistoryDeck.slides['id.p2']?.status === 'in-progress' &&
    clearedHistoryDeck.slides['id.p2']?.log?.length === 0,
  'clearDeckHistory must strip logs while keeping current statuses',
);

const clearedMerge = mergeDeckStates(
  clearedHistoryDeck,
  historyDeck.slides,
);
assert(
  collectDeckHistory(clearedMerge.merged).length === 0 &&
    clearedMerge.remoteChanged === true &&
    clearedMerge.merged.slides['id.p1']?.log?.length === 0,
  'merge must not restore cleared history from remote markers',
);

const clearedPayload = encodeMarkerPayload(
  clearedHistoryDeck.slides['id.p1'] ?? { status: 'done', updatedAt: 201, log: [] },
);
const decodedCleared = decodeMarkerPayload(clearedPayload);
assert(
  clearedPayload.startsWith('4:') &&
    decodedCleared?.status === 'done' &&
    (decodedCleared.log?.length ?? 0) === 0 &&
    decodedCleared.historyClearedAt != null &&
    collectDeckHistory({
      slides: { 'id.p1': decodedCleared },
      idsByIndex: { '0': 'id.p1' },
    }).length === 0,
  'cleared history must round-trip through a v4 marker payload',
);

const decodedClearedMerge = mergeDeckStates(
  {
    slides: { 'id.p1': decodedCleared ?? { status: 'done', updatedAt: 201, log: [] } },
    idsByIndex: {},
  },
  {
    'id.p1': historyDeck.slides['id.p1'] ?? { status: 'done', updatedAt: 200 },
  },
);
assert(
  collectDeckHistory(decodedClearedMerge.merged).length === 0,
  'decoded cleared markers must not re-union older remote logs',
);

const clearHistoryMarkerDiff = buildMarkerDiffRequests(
  {
    'id.p1': clearedHistoryDeck.slides['id.p1'] ?? {
      status: 'done',
      updatedAt: 201,
      log: [],
    },
  },
  [
    {
      elementId: 'marker-p1',
      slideKey: 'id.p1',
      record: {
        status: 'done',
        updatedAt: 200,
        log: [
          { status: 'done', updatedAt: 200 },
          { status: 'todo', updatedAt: 100 },
        ],
      },
    },
  ],
);
assert(
  clearHistoryMarkerDiff.length === 1 &&
    clearHistoryMarkerDiff.some(
      (request) => 'updatePageElementAltText' in request,
    ),
  'clearing history must update remote markers with compact payloads',
);

assert(
  clearSlideHistory({
    status: 'none',
    updatedAt: 260,
    log: [
      { status: 'none', updatedAt: 260 },
      { status: 'done', updatedAt: 200 },
    ],
  }).log?.length === 0,
  'clearSlideHistory must remove prior log entries',
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
  { 'id.p1': { status: 'todo', updatedAt: 100 } },
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

const driveCatalog = bumpStatusPresetConfig(
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
const driveUsers = registerUserInCatalog(
  registerUserInCatalog(
    { version: 1, updatedAt: 0, users: [] },
    { email: 'alice@example.com', picture: 'https://example.com/a.png' },
  ).catalog,
  { email: 'bob@example.com' },
).catalog;
const driveProps = encodeCatalogUsersToAppProperties(driveCatalog, driveUsers);
assert(
  driveProps.v === '2' &&
    hasDriveCatalogOrUsers(driveProps) &&
    decodeAppPropertiesToCatalog(driveProps)?.statuses.some(
      (preset) => preset.id === 's_review',
    ) &&
    decodeAppPropertiesToUsers(driveProps)?.users.length === 2,
  'drive appProperties must round-trip catalog and users',
);
const driveUsersPayload = encodeUsersDrivePayload(driveUsers);
assert(
  !driveUsersPayload.includes('example.com/a.png') &&
    decodeUsersDrivePayload(driveUsersPayload)?.users[0]?.picture === undefined,
  'drive users payload must store emails only',
);
const pictureOnlyMerge = mergeUserCatalogs(
  registerUserInCatalog(
    { version: 1, updatedAt: 10, users: [{ email: 'alice@example.com' }] },
    { email: 'alice@example.com', picture: 'https://example.com/a.png' },
  ).catalog,
  { version: 1, updatedAt: 10, users: [{ email: 'alice@example.com' }] },
);
assert(
  pictureOnlyMerge.localChanged &&
    !pictureOnlyMerge.remoteChanged,
  'picture-only user updates must stay local',
);
const staleDriveProps = {
  ...driveProps,
  s0: 'legacy-slide-status',
  c9: 'stale',
};
const drivePatch = buildCatalogUsersAppPropertiesPatch(
  staleDriveProps,
  driveCatalog,
  driveUsers,
);
const patchedDriveProps: Record<string, string> = {
  ...staleDriveProps,
  ...Object.fromEntries(
    Object.entries(drivePatch).filter(
      (entry): entry is [string, string] => entry[1] !== null,
    ),
  ),
};
assert(
  drivePatch.s0 === null &&
    drivePatch.c9 === null &&
    catalogUsersAppPropertiesEqual(patchedDriveProps, driveProps),
  'drive patch must null stale progress keys',
);
assert(
  !driveAppPropertiesNeedWrite({}, { v: '2' }) &&
    !driveAppPropertiesNeedWrite({ v: '2' }, { v: '2' }) &&
    driveAppPropertiesNeedWrite({}, driveProps),
  'must not write Drive metadata just to stamp a schema version',
);
const legacyCatalogMarker = {
  elementId: 'catalog-marker',
  pageObjectId: 'p1',
  config: driveCatalog,
};
const legacyUsersMarker = {
  elementId: 'users-marker',
  pageObjectId: 'p1',
  catalog: driveUsers,
};
const catalogDelete = buildCatalogMarkerDeleteRequestGroups(legacyCatalogMarker);
const usersDelete = buildUsersMarkerDeleteRequestGroups(legacyUsersMarker);
const catalogDeleteRequest = catalogDelete[0]?.[0] as
  | { deleteObject?: { objectId?: string } }
  | undefined;
const usersDeleteRequest = usersDelete[0]?.[0] as
  | { deleteObject?: { objectId?: string } }
  | undefined;
assert(
  catalogDelete.length === 1 &&
    usersDelete.length === 1 &&
    catalogDeleteRequest?.deleteObject?.objectId === 'catalog-marker' &&
    usersDeleteRequest?.deleteObject?.objectId === 'users-marker',
  'legacy catalog and users markers must delete by object id only',
);

console.log('deck merge tests passed');
