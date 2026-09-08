import type { DeckState, SlideRecord } from './status';
import { isSlideKey, parseStatusCode, statusToCode } from './status';

const CHUNK_KEY_PREFIX = 's';
const SCHEMA_VERSION_KEY = 'v';
const SCHEMA_VERSION = '1';
/** Drive limit: 124 bytes per key+value (UTF-8). Reserve ~3 bytes for key. */
const MAX_CHUNK_VALUE_BYTES = 118;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function splitIntoChunks(payload: string): Record<string, string> {
  const props: Record<string, string> = {
    [SCHEMA_VERSION_KEY]: SCHEMA_VERSION,
  };

  if (!payload) {
    return props;
  }

  let chunkIndex = 0;
  let current = '';

  for (const part of payload.split('|')) {
    const candidate = current ? `${current}|${part}` : part;
    const key = `${CHUNK_KEY_PREFIX}${chunkIndex}`;
    const wouldExceed =
      byteLength(candidate) > MAX_CHUNK_VALUE_BYTES ||
      byteLength(key) + byteLength(candidate) > 124;

    if (wouldExceed && current) {
      props[key] = current;
      chunkIndex += 1;
      current = part;
    } else {
      current = candidate;
    }
  }

  if (current) {
    props[`${CHUNK_KEY_PREFIX}${chunkIndex}`] = current;
  }

  return props;
}

export function encodeDeckToAppProperties(
  slides: Record<string, SlideRecord>,
): Record<string, string> {
  const entries = Object.entries(slides)
    .filter(
      ([key, record]) =>
        isSlideKey(key) && (record.status !== 'none' || record.updatedAt > 0),
    )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([slideId, record]) =>
        `${slideId}:${statusToCode(record.status)}:${record.updatedAt}`,
    );

  return splitIntoChunks(entries.join('|'));
}

export function decodeAppPropertiesToSlides(
  appProperties: Record<string, string> | null | undefined,
): Record<string, SlideRecord> {
  if (!appProperties) {
    return {};
  }

  const chunkKeys = Object.keys(appProperties)
    .filter((key) => key.startsWith(CHUNK_KEY_PREFIX))
    .sort((a, b) => {
      const ai = Number.parseInt(a.slice(CHUNK_KEY_PREFIX.length), 10);
      const bi = Number.parseInt(b.slice(CHUNK_KEY_PREFIX.length), 10);
      return ai - bi;
    });

  const payload = chunkKeys.map((key) => appProperties[key]).join('|');
  const slides: Record<string, SlideRecord> = {};

  for (const part of payload.split('|')) {
    if (!part) continue;
    const colon = part.indexOf(':');
    if (colon === -1) continue;

    const slideId = part.slice(0, colon);
    if (!isSlideKey(slideId)) continue;

    const rest = part.slice(colon + 1);
    const lastColon = rest.lastIndexOf(':');
    if (lastColon === -1) continue;

    const status = parseStatusCode(rest.slice(0, lastColon));
    if (!status) continue;

    const updatedAt = Number.parseInt(rest.slice(lastColon + 1), 10) || 0;

    slides[slideId] = {
      status,
      updatedAt,
    };
  }

  return slides;
}

export function mergeDeckStates(
  local: DeckState,
  remoteSlides: Record<string, SlideRecord>,
): { merged: DeckState; localChanged: boolean; remoteChanged: boolean } {
  const mergedSlides: Record<string, SlideRecord> = { ...local.slides };
  let localChanged = false;
  let remoteChanged = false;

  const allKeys = new Set([
    ...Object.keys(local.slides),
    ...Object.keys(remoteSlides),
  ]);

  for (const slideKey of allKeys) {
    const localRecord = local.slides[slideKey];
    const remoteRecord = remoteSlides[slideKey];

    if (!isSlideKey(slideKey)) {
      continue;
    }

    if (!remoteRecord) {
      if (localRecord && localRecord.status !== 'none') {
        remoteChanged = true;
      }
      continue;
    }

    if (!localRecord || remoteRecord.updatedAt > localRecord.updatedAt) {
      mergedSlides[slideKey] = remoteRecord;
      if (
        !localRecord ||
        localRecord.status !== remoteRecord.status ||
        localRecord.updatedAt !== remoteRecord.updatedAt
      ) {
        localChanged = true;
      }
    } else if (localRecord.updatedAt > remoteRecord.updatedAt) {
      remoteChanged = true;
    }
  }

  return {
    merged: {
      slides: mergedSlides,
      idsByIndex: { ...local.idsByIndex },
    },
    localChanged,
    remoteChanged,
  };
}

export class DrivePayloadTooLargeError extends Error {
  constructor() {
    super('Slide status data exceeds Drive appProperties size limit.');
    this.name = 'DrivePayloadTooLargeError';
  }
}

export function assertPayloadFits(slides: Record<string, SlideRecord>): void {
  const props = encodeDeckToAppProperties(slides);
  const chunkCount = Object.keys(props).filter((key) =>
    key.startsWith(CHUNK_KEY_PREFIX),
  ).length;

  if (chunkCount > 30) {
    throw new DrivePayloadTooLargeError();
  }

  for (const [key, value] of Object.entries(props)) {
    if (byteLength(key) + byteLength(value) > 124) {
      throw new DrivePayloadTooLargeError();
    }
  }
}

export interface DriveFileMetadata {
  appProperties: Record<string, string>;
  canEdit: boolean;
}

export async function fetchDriveFile(
  token: string,
  fileId: string,
): Promise<DriveFileMetadata> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
  url.searchParams.set('fields', 'appProperties,capabilities');
  url.searchParams.set('supportsAllDrives', 'true');

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(await formatDriveError('read', response));
  }

  const data = await response.json();
  return {
    appProperties: data.appProperties ?? {},
    canEdit: Boolean(data.capabilities?.canEdit),
  };
}

export async function updateDriveFileProperties(
  token: string,
  fileId: string,
  appProperties: Record<string, string>,
): Promise<void> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
  url.searchParams.set('supportsAllDrives', 'true');

  const response = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ appProperties }),
  });

  if (!response.ok) {
    throw new Error(await formatDriveError('update', response));
  }
}

async function formatDriveError(
  action: 'read' | 'update',
  response: Response,
): Promise<string> {
  const body = await response.text();
  let apiMessage = '';
  let reason = '';

  try {
    const parsed = JSON.parse(body) as {
      error?: {
        message?: string;
        status?: string;
        details?: Array<{ reason?: string }>;
      };
    };
    apiMessage = parsed.error?.message ?? '';
    reason = parsed.error?.details?.[0]?.reason ?? parsed.error?.status ?? '';
  } catch {
    apiMessage = body.slice(0, 180);
  }

  if (
    reason === 'SERVICE_DISABLED' ||
    apiMessage.includes('has not been used in project') ||
    apiMessage.includes('is disabled')
  ) {
    return 'Google Drive API is disabled for this Cloud project. Enable it, wait a minute, then retry.';
  }

  if (response.status === 401) {
    return 'Drive sign-in expired. Sign in again.';
  }

  if (response.status === 403) {
    return 'Drive access was denied. Confirm this Google account can edit the presentation.';
  }

  if (response.status === 404) {
    return 'This presentation was not found on Drive.';
  }

  if (apiMessage) {
    return `Could not ${action} Drive metadata (${response.status}): ${apiMessage}`;
  }

  return `Could not ${action} Drive metadata (${response.status}).`;
}
