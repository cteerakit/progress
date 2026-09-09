import type { DeckState, SlideRecord } from './status';
import { isSlideKey, parseStatusCode, statusToCode } from './status';

const CHUNK_KEY_PREFIX = 's';
const SCHEMA_VERSION_KEY = 'v';
const SCHEMA_VERSION = '1';
/** Drive allows 30 appProperties per app. Reserve one slot for schema version `v`. */
const MAX_APP_PROPERTIES = 30;
const MAX_CHUNK_KEYS = MAX_APP_PROPERTIES - 1;
/** Drive limit: 124 bytes per key+value (UTF-8). Reserve ~3 bytes for key. */
const MAX_CHUNK_VALUE_BYTES = 118;
const PROGRESS_APP_PROPERTY_KEY = /^(?:v|s\d+)$/;

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
      if (chunkIndex >= MAX_CHUNK_KEYS) {
        throw new DrivePayloadTooLargeError();
      }
      current = part;
    } else {
      current = candidate;
    }
  }

  if (current) {
    if (chunkIndex >= MAX_CHUNK_KEYS) {
      throw new DrivePayloadTooLargeError();
    }
    props[`${CHUNK_KEY_PREFIX}${chunkIndex}`] = current;
  }

  return props;
}

export function encodeDeckToAppProperties(
  slides: Record<string, SlideRecord>,
): Record<string, string> {
  const entries = Object.entries(slides)
    .filter(
      ([key, record]) => isSlideKey(key) && record.status !== 'none',
    )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([slideId, record]) =>
        `${slideId}:${statusToCode(record.status)}:${record.updatedAt.toString(36)}`,
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

    const updatedAtRaw = rest.slice(lastColon + 1);
    const updatedAt = /^[0-9]+$/.test(updatedAtRaw)
      ? Number.parseInt(updatedAtRaw, 10)
      : Number.parseInt(updatedAtRaw, 36) || 0;

    slides[slideId] = {
      status,
      updatedAt,
    };
  }

  return slides;
}

function slideMapsDiffer(
  left: Record<string, SlideRecord>,
  right: Record<string, SlideRecord>,
): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    const a = left[key];
    const b = right[key];
    if (!a || !b) {
      return Boolean(a) !== Boolean(b);
    }
    if (a.status !== b.status || a.updatedAt !== b.updatedAt) {
      return true;
    }
  }
  return false;
}

export function mergeDeckStates(
  local: DeckState,
  remoteSlides: Record<string, SlideRecord>,
  options: { canEdit?: boolean } = {},
): { merged: DeckState; localChanged: boolean; remoteChanged: boolean } {
  if (options.canEdit === false) {
    return {
      merged: {
        slides: { ...remoteSlides },
        idsByIndex: { ...local.idsByIndex },
      },
      localChanged: slideMapsDiffer(local.slides, remoteSlides),
      remoteChanged: false,
    };
  }

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
    super(
      'Too many slide statuses to sync on this presentation. Reset all slides to No status, then try again.',
    );
    this.name = 'DrivePayloadTooLargeError';
  }
}

export class DriveEditDeniedError extends Error {
  constructor(
    message = 'You can open this presentation but do not have edit access on Drive.',
  ) {
    super(message);
    this.name = 'DriveEditDeniedError';
  }
}

export function assertPayloadFits(slides: Record<string, SlideRecord>): void {
  const props = encodeDeckToAppProperties(slides);

  if (Object.keys(props).length > MAX_APP_PROPERTIES) {
    throw new DrivePayloadTooLargeError();
  }

  for (const [key, value] of Object.entries(props)) {
    if (byteLength(key) + byteLength(value) > 124) {
      throw new DrivePayloadTooLargeError();
    }
  }
}

export function buildAppPropertiesPatch(
  remoteProps: Record<string, string>,
  slides: Record<string, SlideRecord>,
): Record<string, string | null> {
  const next = encodeDeckToAppProperties(slides);
  const patch: Record<string, string | null> = { ...next };

  for (const key of Object.keys(remoteProps)) {
    if (PROGRESS_APP_PROPERTY_KEY.test(key) && !(key in next)) {
      patch[key] = null;
    }
  }

  return patch;
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
  appProperties: Record<string, string | null>,
): Promise<void> {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('fields', 'appProperties');

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
        errors?: Array<{ reason?: string }>;
        details?: Array<{ reason?: string }>;
      };
    };
    apiMessage = parsed.error?.message ?? '';
    reason =
      parsed.error?.errors?.[0]?.reason ??
      parsed.error?.details?.[0]?.reason ??
      parsed.error?.status ??
      '';
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

  if (
    apiMessage.includes('property limit') ||
    apiMessage.includes('app property limit')
  ) {
    return 'This presentation hit Google Drive\'s sync metadata limit. Use Reset in the progress panel to clear all statuses, then set statuses again.';
  }

  if (response.status === 401) {
    return 'Drive sign-in expired. Sign in again.';
  }

  if (response.status === 403) {
    if (reason === 'appNotAuthorizedToFile') {
      return action === 'update'
        ? 'Could not save status sync data. Google Drive blocked this app from updating the file. Sign out, sign in again, then retry.'
        : 'Could not read status sync data. Google Drive blocked this app from accessing the file. Sign out, sign in again, then retry.';
    }

    if (
      reason === 'insufficientPermissions' ||
      apiMessage.includes('Insufficient Permission') ||
      apiMessage.includes('insufficient authentication scopes')
    ) {
      return 'Drive permissions are out of date. Sign out of Progress, sign in again, then retry.';
    }

    if (
      reason === 'insufficientFilePermissions' ||
      apiMessage.includes('does not have sufficient permissions')
    ) {
      if (action === 'update') {
        throw new DriveEditDeniedError();
      }

      return 'You can open this presentation but do not have permission to read its Drive metadata.';
    }

    if (action === 'update') {
      if (apiMessage) {
        return `Could not save status sync data to Drive: ${apiMessage}`;
      }
      return 'Could not save status sync data to Drive. Confirm you can edit this presentation, then retry.';
    }

    if (apiMessage) {
      return `Could not read status sync data from Drive: ${apiMessage}`;
    }

    return 'Could not read status sync data from Drive.';
  }

  if (response.status === 404) {
    return 'This presentation was not found on Drive.';
  }

  const verb = action === 'update' ? 'save' : 'read';

  if (apiMessage) {
    return `Could not ${verb} status sync data (${response.status}): ${apiMessage}`;
  }

  return `Could not ${verb} status sync data (${response.status}).`;
}
