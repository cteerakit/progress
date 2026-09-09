import type { SlidesBatchRequest, SlidesPresentation } from './slides-api';
import {
  isDriveSlideId,
  isIndexSlideKey,
  parseStatusCode,
  statusToCode,
  type SlideRecord,
} from './status';

export const MARKER_TITLE = 'progress.slide-status';
const PAYLOAD_VERSION = '1';

export interface SlideMarker {
  elementId: string;
  slideKey: string;
  record: SlideRecord;
}

export interface DecodedPresentationMetadata {
  slides: Record<string, SlideRecord>;
  idsByIndex: Record<string, string>;
  markers: SlideMarker[];
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

export function encodeMarkerPayload(record: SlideRecord): string {
  return `${PAYLOAD_VERSION}:${statusToCode(record.status)}:${record.updatedAt.toString(36)}`;
}

export function decodeMarkerPayload(
  description: string | null | undefined,
): SlideRecord | null {
  if (!description) {
    return null;
  }

  const parts = description.split(':');
  const version = parts[0];
  const code = parts[1];
  const updatedAtRaw = parts[2];
  if (
    parts.length !== 3 ||
    version !== PAYLOAD_VERSION ||
    !code ||
    !updatedAtRaw
  ) {
    return null;
  }

  const status = parseStatusCode(code);
  if (!status || status === 'none') {
    return null;
  }

  const updatedAt = Number.parseInt(updatedAtRaw, 36);
  if (!Number.isFinite(updatedAt) || updatedAt < 0) {
    return null;
  }

  return { status, updatedAt };
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

export function decodePresentationMetadata(
  presentation: SlidesPresentation,
): DecodedPresentationMetadata {
  const slides: Record<string, SlideRecord> = {};
  const markers: SlideMarker[] = [];

  for (const page of presentation.slides ?? []) {
    const slideKey = slideKeyFromObjectId(page.objectId);
    for (const element of page.pageElements ?? []) {
      if (element.title !== MARKER_TITLE) {
        continue;
      }

      const record = decodeMarkerPayload(element.description);
      if (!record) {
        continue;
      }

      slides[slideKey] = record;
      markers.push({
        elementId: element.objectId,
        slideKey,
        record,
      });
    }
  }

  return {
    slides,
    idsByIndex: buildIdsByIndexFromPresentation(presentation),
    markers,
  };
}

function markerElementIdForPage(pageObjectId: string): string {
  const safe = pageObjectId.replace(/[^A-Za-z0-9_-]/g, '_');
  return `progress_marker_${safe}`;
}

function recordsMatch(left: SlideRecord, right: SlideRecord): boolean {
  return left.status === right.status && left.updatedAt === right.updatedAt;
}

/** Sit just left of the slide at the top edge — avoids vertical canvas growth. */
const MARKER_TRANSFORM = {
  scaleX: 1,
  scaleY: 1,
  translateX: -1,
  translateY: 0,
  unit: 'PT',
} as const;

function repositionMarkerRequest(elementId: string): SlidesBatchRequest {
  return {
    updatePageElementTransform: {
      objectId: elementId,
      transform: MARKER_TRANSFORM,
      applyMode: 'ABSOLUTE',
    },
  };
}

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
  return [
    repositionMarkerRequest(elementId),
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

export function buildMarkerDiffRequests(
  localSlides: Record<string, SlideRecord>,
  remoteMarkers: SlideMarker[],
): SlidesBatchRequest[] {
  const requests: SlidesBatchRequest[] = [];
  const remoteBySlideKey = new Map(
    remoteMarkers.map((marker) => [marker.slideKey, marker]),
  );
  const handledRemote = new Set<string>();

  for (const [slideKey, localRecord] of Object.entries(localSlides)) {
    if (isIndexSlideKey(slideKey) || !isDriveSlideId(slideKey)) {
      continue;
    }

    const pageObjectId = pageObjectIdFromSlideKey(slideKey);
    if (!pageObjectId) {
      continue;
    }

    const remoteMarker = remoteBySlideKey.get(slideKey);
    handledRemote.add(slideKey);

    if (localRecord.status === 'none') {
      if (remoteMarker) {
        requests.push(deleteMarkerRequest(remoteMarker.elementId));
      }
      continue;
    }

    if (!remoteMarker) {
      requests.push(...createMarkerRequests(pageObjectId, localRecord));
      continue;
    }

    if (!recordsMatch(localRecord, remoteMarker.record)) {
      requests.push(
        ...updateMarkerRequests(remoteMarker.elementId, localRecord),
      );
    }
  }

  for (const marker of remoteMarkers) {
    if (handledRemote.has(marker.slideKey)) {
      continue;
    }

    requests.push(deleteMarkerRequest(marker.elementId));
  }

  return requests;
}

export function slidesForRemoteMerge(
  localSlides: Record<string, SlideRecord>,
): Record<string, SlideRecord> {
  const result: Record<string, SlideRecord> = {};

  for (const [slideKey, record] of Object.entries(localSlides)) {
    if (isDriveSlideId(slideKey) && record.status !== 'none') {
      result[slideKey] = record;
    }
  }

  return result;
}
