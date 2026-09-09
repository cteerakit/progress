import type {
  SlidesBatchRequest,
  SlidesPage,
  SlidesPresentation,
} from './slides-api';
import {
  decodeMarkerLog,
  decodeMarkerLogV2,
  decodeMarkerLogV3,
  decodeMarkerLogV4,
  encodeClearedMarkerPayload,
  encodeMarkerPayloadCore,
  normalizeSlideLog,
  prepareSlideRecord,
  slideRecordHasHistory,
  slideRecordsEqual,
  truncateSlideLogToMarkerBudget,
} from './slide-log';
import {
  decodeUsersPayload,
  encodeUsersPayload,
  type UserCatalog,
} from './user-catalog';
import {
  decodeCatalogPayload,
  encodeCatalogPayload,
  type StatusPresetConfig,
} from './status-presets';
import {
  isDriveSlideId,
  isIndexSlideKey,
  type SlideRecord,
} from './status';

export const MARKER_TITLE = 'progress.slide-status';
export const CATALOG_MARKER_TITLE = 'progress.status-presets';
export const USERS_MARKER_TITLE = 'progress.users';

export interface SlideMarker {
  elementId: string;
  slideKey: string;
  record: SlideRecord;
}

export interface CatalogMarker {
  elementId: string;
  pageObjectId: string;
  config: StatusPresetConfig;
}

export interface UsersMarker {
  elementId: string;
  pageObjectId: string;
  catalog: UserCatalog;
}

export interface DecodedPresentationMetadata {
  slides: Record<string, SlideRecord>;
  idsByIndex: Record<string, string>;
  markers: SlideMarker[];
  occupiedElementIds: Set<string>;
  catalog: CatalogMarker | null;
  users: UsersMarker | null;
}

const EMPTY_MARKER_RECORD: SlideRecord = { status: 'none', updatedAt: 0 };

export function encodeMarkerPayload(record: SlideRecord): string {
  const prepared = prepareSlideRecord(record);
  if (prepared.historyClearedAt != null) {
    return encodeClearedMarkerPayload(prepared);
  }
  const log =
    prepared.log?.length === 0
      ? [{ status: prepared.status, updatedAt: prepared.updatedAt }]
      : normalizeSlideLog(prepared);
  return encodeMarkerPayloadCore(log);
}

export function decodeMarkerPayload(
  description: string | null | undefined,
): SlideRecord | null {
  if (!description) {
    return null;
  }

  const parts = description.split(':');
  const version = parts[0];
  const token = parts[1];
  const rest = parts[2];
  if (!token || !rest) {
    return null;
  }

  if (version === '1') {
    return decodeMarkerLog(token, rest);
  }

  if (version === '2') {
    return decodeMarkerLogV2(token, rest);
  }

  if (version === '3') {
    return decodeMarkerLogV3(token, rest);
  }

  if (version === '4') {
    return decodeMarkerLogV4(token, rest);
  }

  return null;
}

export function slideKeyFromObjectId(objectId: string): string {
  return `id.${objectId}`;
}

export function pageObjectIdFromSlideKey(slideKey: string): string | null {
  if (!isDriveSlideId(slideKey)) {
    return null;
  }
  return slideKey.slice(3);
}

export function buildIdsByIndexFromPresentation(
  presentation: SlidesPresentation,
): Record<string, string> {
  const idsByIndex: Record<string, string> = {};
  for (const [index, slide] of (presentation.slides ?? []).entries()) {
    if (slide.objectId) {
      idsByIndex[String(index)] = slideKeyFromObjectId(slide.objectId);
    }
  }
  return idsByIndex;
}

export function presentationSlideKeys(
  presentation: SlidesPresentation,
): Set<string> {
  const keys = new Set<string>();
  for (const slide of presentation.slides ?? []) {
    if (slide.objectId) {
      keys.add(slideKeyFromObjectId(slide.objectId));
    }
  }
  return keys;
}

export function presentationPageObjectIds(
  presentation: SlidesPresentation,
): Set<string> {
  const ids = new Set<string>();
  for (const slide of presentation.slides ?? []) {
    if (slide.objectId) {
      ids.add(slide.objectId);
    }
  }
  return ids;
}

function decodeUsersFromPage(
  pageObjectId: string,
  pageElements: Array<{ objectId: string; title?: string; description?: string }>,
): UsersMarker | null {
  for (const element of pageElements) {
    if (element.title !== USERS_MARKER_TITLE) {
      continue;
    }

    const catalog = decodeUsersPayload(element.description);
    if (!catalog) {
      continue;
    }

    return {
      elementId: element.objectId,
      pageObjectId,
      catalog,
    };
  }

  return null;
}

function decodeCatalogFromPage(
  pageObjectId: string,
  pageElements: Array<{ objectId: string; title?: string; description?: string }>,
): CatalogMarker | null {
  for (const element of pageElements) {
    if (element.title !== CATALOG_MARKER_TITLE) {
      continue;
    }

    const config = decodeCatalogPayload(element.description);
    if (!config) {
      continue;
    }

    return {
      elementId: element.objectId,
      pageObjectId,
      config,
    };
  }

  return null;
}

export function decodePresentationMetadata(
  presentation: SlidesPresentation,
): DecodedPresentationMetadata {
  const slides: Record<string, SlideRecord> = {};
  const markers: SlideMarker[] = [];
  const occupiedElementIds = collectOccupiedElementIds(presentation);
  let catalog: CatalogMarker | null = null;
  let users: UsersMarker | null = null;

  for (const page of presentation.slides ?? []) {
    const slideKey = slideKeyFromObjectId(page.objectId);
    const expectedMarkerId = markerElementIdForPage(page.objectId);
    for (const element of page.pageElements ?? []) {
      const isProgressMarker =
        element.title === MARKER_TITLE || element.objectId === expectedMarkerId;
      if (!isProgressMarker) {
        continue;
      }

      const record = decodeMarkerPayload(element.description);
      if (record && slideRecordHasHistory(record)) {
        slides[slideKey] = record;
        markers.push({
          elementId: element.objectId,
          slideKey,
          record,
        });
        continue;
      }

      // Shape already occupies the marker id (incomplete create, or no
      // history yet). Keep it so a later sync updates instead of createShape.
      markers.push({
        elementId: element.objectId,
        slideKey,
        record: EMPTY_MARKER_RECORD,
      });
    }
  }

  for (const page of catalogSearchPages(presentation)) {
    const pageElements = page.pageElements ?? [];

    if (!catalog) {
      catalog = decodeCatalogFromPage(page.objectId, pageElements);
    }

    if (!users) {
      users = decodeUsersFromPage(page.objectId, pageElements);
    }

    if (catalog && users) {
      break;
    }
  }

  return {
    slides,
    idsByIndex: buildIdsByIndexFromPresentation(presentation),
    markers,
    occupiedElementIds,
    catalog,
    users,
  };
}

function collectOccupiedElementIds(
  presentation: SlidesPresentation,
): Set<string> {
  const ids = new Set<string>();
  for (const page of catalogSearchPages(presentation)) {
    if (page.objectId) {
      ids.add(page.objectId);
    }
    for (const element of page.pageElements ?? []) {
      if (element.objectId) {
        ids.add(element.objectId);
      }
    }
  }
  return ids;
}

function markerElementIdForPage(pageObjectId: string): string {
  const safe = pageObjectId.replace(/[^A-Za-z0-9_-]/g, '_');
  return `progress_marker_${safe}`;
}

function recordsMatch(left: SlideRecord, right: SlideRecord): boolean {
  return slideRecordsEqual(left, right);
}

function shouldKeepMarker(record: SlideRecord): boolean {
  return slideRecordHasHistory(record);
}

/** Sit just left of the slide at the top edge — avoids vertical canvas growth. */
const MARKER_TRANSFORM = {
  scaleX: 1,
  scaleY: 1,
  translateX: -1,
  translateY: 0,
  unit: 'PT',
} as const;

function createMarkerRequests(
  pageObjectId: string,
  record: SlideRecord,
): SlidesBatchRequest[] {
  const elementId = markerElementIdForPage(pageObjectId);
  const payload = encodeMarkerPayload(record);

  return [
    {
      createShape: {
        objectId: elementId,
        shapeType: 'RECTANGLE',
        elementProperties: {
          pageObjectId,
          size: {
            width: { magnitude: 1, unit: 'PT' },
            height: { magnitude: 1, unit: 'PT' },
          },
          transform: MARKER_TRANSFORM,
        },
      },
    },
    {
      updateShapeProperties: {
        objectId: elementId,
        shapeProperties: {
          shapeBackgroundFill: {
            solidFill: {
              color: {
                rgbColor: { red: 1, green: 1, blue: 1 },
              },
              alpha: 0,
            },
          },
          outline: {
            propertyState: 'NOT_RENDERED',
          },
        },
        fields: 'shapeBackgroundFill,outline',
      },
    },
    {
      updatePageElementAltText: {
        objectId: elementId,
        title: MARKER_TITLE,
        description: payload,
      },
    },
    {
      updatePageElementsZOrder: {
        pageElementObjectIds: [elementId],
        operation: 'SEND_TO_BACK',
      },
    },
  ];
}

function updateMarkerRequests(
  elementId: string,
  record: SlideRecord,
): SlidesBatchRequest[] {
  // Update alt text in place. Deleting and recreating the shape while the
  // Slides editor is open leaves the document stuck on "Saving…".
  return [
    {
      updatePageElementAltText: {
        objectId: elementId,
        title: MARKER_TITLE,
        description: encodeMarkerPayload(record),
      },
    },
  ];
}

function deleteMarkerRequest(elementId: string): SlidesBatchRequest {
  return {
    deleteObject: {
      objectId: elementId,
    },
  };
}

function selectRemoteMarker(
  markers: SlideMarker[],
  slideKey: string,
  pageObjectId: string,
): SlideMarker | undefined {
  const matches = markers.filter((marker) => marker.slideKey === slideKey);
  if (matches.length === 0) {
    return undefined;
  }

  const expectedId = markerElementIdForPage(pageObjectId);
  const withHistory = matches.filter((marker) => shouldKeepMarker(marker.record));
  return (
    withHistory.find((marker) => marker.elementId === expectedId) ??
    withHistory.at(-1) ??
    matches.find((marker) => marker.elementId === expectedId) ??
    matches.at(-1)
  );
}

export function buildMarkerDiffRequestGroups(
  localSlides: Record<string, SlideRecord>,
  remoteMarkers: SlideMarker[],
  validPageIds?: ReadonlySet<string>,
  occupiedElementIds?: ReadonlySet<string>,
): SlidesBatchRequest[][] {
  const groups: SlidesBatchRequest[][] = [];
  const handledElementIds = new Set<string>();
  const handledSlideKeys = new Set<string>();

  for (const [slideKey, localRecord] of Object.entries(localSlides)) {
    if (isIndexSlideKey(slideKey) || !isDriveSlideId(slideKey)) {
      continue;
    }

    const pageObjectId = pageObjectIdFromSlideKey(slideKey);
    if (!pageObjectId || (validPageIds && !validPageIds.has(pageObjectId))) {
      continue;
    }

    handledSlideKeys.add(slideKey);
    const remoteMarker = selectRemoteMarker(
      remoteMarkers,
      slideKey,
      pageObjectId,
    );
    const expectedId = markerElementIdForPage(pageObjectId);

    if (!shouldKeepMarker(localRecord)) {
      if (remoteMarker) {
        groups.push([deleteMarkerRequest(remoteMarker.elementId)]);
        handledElementIds.add(remoteMarker.elementId);
      }
      continue;
    }

    if (!remoteMarker) {
      if (occupiedElementIds?.has(expectedId)) {
        groups.push(updateMarkerRequests(expectedId, localRecord));
        handledElementIds.add(expectedId);
        continue;
      }
      groups.push(createMarkerRequests(pageObjectId, localRecord));
      handledElementIds.add(expectedId);
      continue;
    }

    handledElementIds.add(remoteMarker.elementId);
    if (!recordsMatch(localRecord, remoteMarker.record)) {
      groups.push(updateMarkerRequests(remoteMarker.elementId, localRecord));
    }
  }

  for (const marker of remoteMarkers) {
    if (
      handledElementIds.has(marker.elementId) ||
      handledSlideKeys.has(marker.slideKey)
    ) {
      continue;
    }

    groups.push([deleteMarkerRequest(marker.elementId)]);
    handledElementIds.add(marker.elementId);
  }

  return groups;
}

export function buildMarkerDiffRequests(
  localSlides: Record<string, SlideRecord>,
  remoteMarkers: SlideMarker[],
  validPageIds?: ReadonlySet<string>,
  occupiedElementIds?: ReadonlySet<string>,
): SlidesBatchRequest[] {
  return buildMarkerDiffRequestGroups(
    localSlides,
    remoteMarkers,
    validPageIds,
    occupiedElementIds,
  ).flat();
}

export function slidesForRemoteMerge(
  localSlides: Record<string, SlideRecord>,
): Record<string, SlideRecord> {
  const result: Record<string, SlideRecord> = {};

  for (const [slideKey, record] of Object.entries(localSlides)) {
    if (isDriveSlideId(slideKey) && shouldKeepMarker(record)) {
      result[slideKey] = record;
    }
  }

  return result;
}

const CATALOG_MARKER_ID = 'progress_status_presets_catalog';
const USERS_MARKER_ID = 'progress_users_catalog';

function catalogMarkerTransform(): typeof MARKER_TRANSFORM {
  return MARKER_TRANSFORM;
}

function createCatalogMarkerRequests(
  pageObjectId: string,
  config: StatusPresetConfig,
): SlidesBatchRequest[] {
  const elementId = CATALOG_MARKER_ID;
  const payload = encodeCatalogPayload(config);

  return [
    {
      createShape: {
        objectId: elementId,
        shapeType: 'RECTANGLE',
        elementProperties: {
          pageObjectId,
          size: {
            width: { magnitude: 1, unit: 'PT' },
            height: { magnitude: 1, unit: 'PT' },
          },
          transform: catalogMarkerTransform(),
        },
      },
    },
    {
      updateShapeProperties: {
        objectId: elementId,
        shapeProperties: {
          shapeBackgroundFill: {
            solidFill: {
              color: {
                rgbColor: { red: 1, green: 1, blue: 1 },
              },
              alpha: 0,
            },
          },
          outline: {
            propertyState: 'NOT_RENDERED',
          },
        },
        fields: 'shapeBackgroundFill,outline',
      },
    },
    {
      updatePageElementAltText: {
        objectId: elementId,
        title: CATALOG_MARKER_TITLE,
        description: payload,
      },
    },
    {
      updatePageElementsZOrder: {
        pageElementObjectIds: [elementId],
        operation: 'SEND_TO_BACK',
      },
    },
  ];
}

function updateCatalogMarkerRequests(
  elementId: string,
  config: StatusPresetConfig,
): SlidesBatchRequest[] {
  return [
    {
      updatePageElementAltText: {
        objectId: elementId,
        title: CATALOG_MARKER_TITLE,
        description: encodeCatalogPayload(config),
      },
    },
  ];
}

function catalogSearchPages(presentation: SlidesPresentation): SlidesPage[] {
  return [
    ...(presentation.slides ?? []),
    ...(presentation.masters ?? []),
    presentation.notesMaster,
  ].filter((page): page is SlidesPage => Boolean(page?.objectId));
}

function isNotesMasterPage(
  pageObjectId: string,
  presentation: SlidesPresentation,
): boolean {
  return presentation.notesMaster?.objectId === pageObjectId;
}

export function resolveCatalogPageObjectId(
  presentation: SlidesPresentation,
): string | null {
  const firstSlide = presentation.slides?.find((page) => page.objectId);
  if (firstSlide?.objectId) {
    return firstSlide.objectId;
  }

  const firstMaster = presentation.masters?.find(
    (page) =>
      page.objectId && page.objectId !== presentation.notesMaster?.objectId,
  );
  return firstMaster?.objectId ?? null;
}

function createUsersMarkerRequests(
  pageObjectId: string,
  catalog: UserCatalog,
): SlidesBatchRequest[] {
  const elementId = USERS_MARKER_ID;
  const payload = encodeUsersPayload(catalog);

  return [
    {
      createShape: {
        objectId: elementId,
        shapeType: 'RECTANGLE',
        elementProperties: {
          pageObjectId,
          size: {
            width: { magnitude: 1, unit: 'PT' },
            height: { magnitude: 1, unit: 'PT' },
          },
          transform: catalogMarkerTransform(),
        },
      },
    },
    {
      updateShapeProperties: {
        objectId: elementId,
        shapeProperties: {
          shapeBackgroundFill: {
            solidFill: {
              color: {
                rgbColor: { red: 1, green: 1, blue: 1 },
              },
              alpha: 0,
            },
          },
          outline: {
            propertyState: 'NOT_RENDERED',
          },
        },
        fields: 'shapeBackgroundFill,outline',
      },
    },
    {
      updatePageElementAltText: {
        objectId: elementId,
        title: USERS_MARKER_TITLE,
        description: payload,
      },
    },
    {
      updatePageElementsZOrder: {
        pageElementObjectIds: [elementId],
        operation: 'SEND_TO_BACK',
      },
    },
  ];
}

function updateUsersMarkerRequests(
  elementId: string,
  catalog: UserCatalog,
): SlidesBatchRequest[] {
  return [
    {
      updatePageElementAltText: {
        objectId: elementId,
        title: USERS_MARKER_TITLE,
        description: encodeUsersPayload(catalog),
      },
    },
  ];
}

export function buildUsersDiffRequestGroups(
  localCatalog: UserCatalog,
  remoteUsers: UsersMarker | null,
  presentation: SlidesPresentation,
): SlidesBatchRequest[][] {
  if (localCatalog.users.length === 0) {
    return [];
  }

  const pageObjectId = resolveCatalogPageObjectId(presentation);
  if (!pageObjectId || isNotesMasterPage(pageObjectId, presentation)) {
    return [];
  }

  if (
    !remoteUsers ||
    isNotesMasterPage(remoteUsers.pageObjectId, presentation)
  ) {
    return [createUsersMarkerRequests(pageObjectId, localCatalog)];
  }

  const localPayload = encodeUsersPayload(localCatalog);
  const remotePayload = encodeUsersPayload(remoteUsers.catalog);
  if (localPayload === remotePayload) {
    return [];
  }

  if (localCatalog.updatedAt >= remoteUsers.catalog.updatedAt) {
    return [updateUsersMarkerRequests(remoteUsers.elementId, localCatalog)];
  }

  return [];
}

export function buildCatalogDiffRequestGroups(
  localConfig: StatusPresetConfig,
  remoteCatalog: CatalogMarker | null,
  presentation: SlidesPresentation,
): SlidesBatchRequest[][] {
  const pageObjectId = resolveCatalogPageObjectId(presentation);
  if (!pageObjectId || isNotesMasterPage(pageObjectId, presentation)) {
    return [];
  }

  if (
    !remoteCatalog ||
    isNotesMasterPage(remoteCatalog.pageObjectId, presentation)
  ) {
    return [createCatalogMarkerRequests(pageObjectId, localConfig)];
  }

  if (remoteCatalog.config.updatedAt === localConfig.updatedAt) {
    const localPayload = encodeCatalogPayload(localConfig);
    const remotePayload = encodeCatalogPayload(remoteCatalog.config);
    if (localPayload === remotePayload) {
      return [];
    }
  }

  if (localConfig.updatedAt >= remoteCatalog.config.updatedAt) {
    return [updateCatalogMarkerRequests(remoteCatalog.elementId, localConfig)];
  }

  return [];
}

export function buildCatalogDiffRequests(
  localConfig: StatusPresetConfig,
  remoteCatalog: CatalogMarker | null,
  presentation: SlidesPresentation,
): SlidesBatchRequest[] {
  return buildCatalogDiffRequestGroups(
    localConfig,
    remoteCatalog,
    presentation,
  ).flat();
}

export function buildCatalogMarkerDeleteRequestGroups(
  remoteCatalog: CatalogMarker | null,
): SlidesBatchRequest[][] {
  if (!remoteCatalog) {
    return [];
  }

  return [[deleteMarkerRequest(remoteCatalog.elementId)]];
}

export function buildUsersMarkerDeleteRequestGroups(
  remoteUsers: UsersMarker | null,
): SlidesBatchRequest[][] {
  if (!remoteUsers) {
    return [];
  }

  return [[deleteMarkerRequest(remoteUsers.elementId)]];
}
