import { FileAccessRequiredError, isUnsharedDriveFileResponse } from './file-access';
import type { StatusPresetConfig } from './status-presets';
import {
  decodeCatalogPayload,
  encodeCatalogPayload,
} from './status-presets';
import {
  decodeUsersDrivePayload,
  encodeUsersDrivePayload,
  type UserCatalog,
} from './user-catalog';

export const SCHEMA_VERSION = '2';
const SCHEMA_VERSION_KEY = 'v';
/** Drive allows 30 appProperties per app. Reserve one slot for schema version `v`. */
const MAX_APP_PROPERTIES = 30;
const MAX_CHUNK_KEYS = MAX_APP_PROPERTIES - 1;
/** Drive limit: 124 bytes per key+value (UTF-8). */
const MAX_KEY_VALUE_BYTES = 124;

export const PROGRESS_APP_PROPERTY_KEY = /^(?:v|[csu]\d+)$/;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function chunkKey(prefix: string, index: number): string {
  return `${prefix}${index}`;
}

function joinChunks(
  appProperties: Record<string, string>,
  prefix: string,
): string {
  const keys = Object.keys(appProperties)
    .filter((key) => key.startsWith(prefix) && /^\d+$/.test(key.slice(1)))
    .sort(
      (left, right) =>
        Number.parseInt(left.slice(1), 10) - Number.parseInt(right.slice(1), 10),
    );

  return keys.map((key) => appProperties[key]).join('');
}

function chunkPayload(
  payload: string,
  prefix: string,
  maxChunks: number,
): Record<string, string> {
  const chunks: Record<string, string> = {};
  let remaining = payload;
  let index = 0;

  while (remaining.length > 0) {
    if (index >= maxChunks) {
      throw new DrivePayloadTooLargeError();
    }

    const key = chunkKey(prefix, index);
    let low = 1;
    let high = remaining.length;
    let best = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = remaining.slice(0, mid);
      if (byteLength(key) + byteLength(candidate) <= MAX_KEY_VALUE_BYTES) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (best <= 0) {
      throw new DrivePayloadTooLargeError();
    }

    chunks[key] = remaining.slice(0, best);
    remaining = remaining.slice(best);
    index += 1;
  }

  return chunks;
}

export function encodeCatalogUsersToAppProperties(
  catalog: StatusPresetConfig,
  users: UserCatalog,
): Record<string, string> {
  const props: Record<string, string> = {
    [SCHEMA_VERSION_KEY]: SCHEMA_VERSION,
  };
  let remainingChunks = MAX_CHUNK_KEYS;

  if (catalog.updatedAt > 0) {
    const catalogChunks = chunkPayload(
      encodeCatalogPayload(catalog),
      'c',
      remainingChunks,
    );
    Object.assign(props, catalogChunks);
    remainingChunks -= Object.keys(catalogChunks).length;
  }

  if (users.users.length > 0) {
    const usersChunks = chunkPayload(
      encodeUsersDrivePayload(users),
      'u',
      remainingChunks,
    );
    Object.assign(props, usersChunks);
  }

  return props;
}

export function decodeAppPropertiesToCatalog(
  appProperties: Record<string, string> | null | undefined,
): StatusPresetConfig | null {
  if (!appProperties) {
    return null;
  }

  const payload = joinChunks(appProperties, 'c');
  if (!payload) {
    return null;
  }

  return decodeCatalogPayload(payload);
}

export function decodeAppPropertiesToUsers(
  appProperties: Record<string, string> | null | undefined,
): UserCatalog | null {
  if (!appProperties) {
    return null;
  }

  const payload = joinChunks(appProperties, 'u');
  if (!payload) {
    return null;
  }

  return decodeUsersDrivePayload(payload);
}

export function hasDriveCatalogOrUsers(
  appProperties: Record<string, string> | null | undefined,
): boolean {
  if (!appProperties) {
    return false;
  }

  return Object.keys(appProperties).some((key) => /^[cu]\d+$/.test(key));
}

export function catalogUsersAppPropertiesEqual(
  left: Record<string, string> | null | undefined,
  right: Record<string, string> | null | undefined,
): boolean {
  const normalizedLeft = normalizeCatalogUsersProps(left ?? {});
  const normalizedRight = normalizeCatalogUsersProps(right ?? {});
  const leftKeys = Object.keys(normalizedLeft).sort();
  const rightKeys = Object.keys(normalizedRight).sort();

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every(
    (key, index) =>
      key === rightKeys[index] && normalizedLeft[key] === normalizedRight[key],
  );
}

/** Avoid a Drive revision that only stamps schema version `v`. */
export function driveAppPropertiesNeedWrite(
  remote: Record<string, string> | null | undefined,
  desired: Record<string, string>,
): boolean {
  if (catalogUsersAppPropertiesEqual(remote, desired)) {
    return false;
  }

  return hasDriveCatalogOrUsers(remote) || hasDriveCatalogOrUsers(desired);
}

function normalizeCatalogUsersProps(
  props: Record<string, string>,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(props)) {
    if (PROGRESS_APP_PROPERTY_KEY.test(key)) {
      normalized[key] = value;
    }
  }
  return normalized;
}

export function buildCatalogUsersAppPropertiesPatch(
  remoteProps: Record<string, string>,
  catalog: StatusPresetConfig,
  users: UserCatalog,
): Record<string, string | null> {
  const next = encodeCatalogUsersToAppProperties(catalog, users);
  const patch: Record<string, string | null> = { ...next };

  for (const key of Object.keys(remoteProps)) {
    if (PROGRESS_APP_PROPERTY_KEY.test(key) && !(key in next)) {
      patch[key] = null;
    }
  }

  return patch;
}

export class DrivePayloadTooLargeError extends Error {
  constructor(
    message = 'Too much preset or collaborator data to sync on this presentation.',
  ) {
    super(message);
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

export interface DriveFileMetadata {
  appProperties: Record<string, string>;
  canEdit: boolean;
  /** False when Drive returned not-found/forbidden for this file id. */
  accessible: boolean;
}

const EMPTY_DRIVE_FILE: DriveFileMetadata = {
  appProperties: {},
  canEdit: false,
  accessible: false,
};

function driveFileUrl(fileId: string): URL {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
  url.searchParams.set('supportsAllDrives', 'true');
  return url;
}

export async function fetchDriveFile(
  token: string,
  fileId: string,
): Promise<DriveFileMetadata> {
  const url = driveFileUrl(fileId);
  url.searchParams.set('fields', 'appProperties,capabilities/canEdit');

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const body = await response.clone().text();
    if (isUnsharedDriveFileResponse(response.status, body)) {
      throw new FileAccessRequiredError();
    }

    if (isDriveFileUnavailable(response.status, body)) {
      return EMPTY_DRIVE_FILE;
    }

    throw new Error(await formatDriveError('read', response));
  }

  const data = (await response.json()) as {
    appProperties?: Record<string, string>;
    capabilities?: { canEdit?: boolean };
  };

  return {
    appProperties: data.appProperties ?? {},
    canEdit: Boolean(data.capabilities?.canEdit),
    accessible: true,
  };
}

export async function updateDriveFileProperties(
  token: string,
  fileId: string,
  appProperties: Record<string, string | null>,
): Promise<void> {
  if (Object.keys(appProperties).length === 0) {
    return;
  }

  const url = driveFileUrl(fileId);
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
    const body = await response.clone().text();
    if (isUnsharedDriveFileResponse(response.status, body)) {
      throw new FileAccessRequiredError();
    }
    throw new Error(await formatDriveError('update', response));
  }
}

function parseDriveErrorBody(body: string): {
  apiMessage: string;
  reason: string;
} {
  try {
    const parsed = JSON.parse(body) as {
      error?: {
        message?: string;
        status?: string;
        errors?: Array<{ reason?: string }>;
      };
    };
    return {
      apiMessage: parsed.error?.message ?? '',
      reason: parsed.error?.errors?.[0]?.reason ?? parsed.error?.status ?? '',
    };
  } catch {
    return { apiMessage: body.slice(0, 180), reason: '' };
  }
}

function isDriveFileUnavailable(status: number, body: string): boolean {
  if (status === 404) {
    return true;
  }

  if (status !== 403) {
    return false;
  }

  const { reason, apiMessage } = parseDriveErrorBody(body);
  return (
    reason === 'notFound' ||
    reason === 'fileNotFound' ||
    apiMessage.includes('File not found')
  );
}

async function formatDriveError(
  action: 'read' | 'update',
  response: Response,
): Promise<string> {
  const body = await response.text();
  const { apiMessage, reason } = parseDriveErrorBody(body);

  if (
    reason === 'SERVICE_DISABLED' ||
    apiMessage.includes('has not been used in project') ||
    apiMessage.includes('is disabled')
  ) {
    return 'Google Drive API is disabled for this Cloud project. Enable it, wait a minute, then retry.';
  }

  if (response.status === 401) {
    return 'Slides sign-in expired. Sign in again.';
  }

  if (response.status === 403) {
    if (
      reason === 'insufficientPermissions' ||
      apiMessage.includes('Insufficient Permission') ||
      apiMessage.includes('insufficient authentication scopes')
    ) {
      return 'Drive permissions are out of date. Sign out of Progress, sign in again, then retry.';
    }

    if (
      reason === 'forbidden' ||
      apiMessage.includes('does not have permission') ||
      apiMessage.includes('The caller does not have permission')
    ) {
      if (action === 'update') {
        throw new DriveEditDeniedError();
      }

      return 'You can open this presentation but do not have permission to read its Drive metadata.';
    }

    if (action === 'update') {
      if (apiMessage) {
        return `Could not save preset sync data to Drive: ${apiMessage}`;
      }
      return 'Could not save preset sync data to Drive. Confirm you can edit this presentation, then retry.';
    }

    if (apiMessage) {
      return `Could not read preset sync data from Drive: ${apiMessage}`;
    }

    return 'Could not read preset sync data from Drive.';
  }

  if (response.status === 404) {
    return 'This presentation was not found on Google Drive.';
  }

  const verb = action === 'update' ? 'save' : 'read';

  if (apiMessage) {
    return `Could not ${verb} preset sync data (${response.status}): ${apiMessage}`;
  }

  return `Could not ${verb} preset sync data.`;
}
