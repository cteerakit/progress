export const FILE_ACCESS_REQUIRED_MESSAGE =
  'Allow Progress to use this presentation. Google requires a one-time confirmation for each deck.';

export const PICKER_NOT_CONFIGURED_MESSAGE =
  'Progress cannot confirm this presentation. The Google Picker API key or Cloud project number is missing.';

export class FileAccessRequiredError extends Error {
  constructor(message = FILE_ACCESS_REQUIRED_MESSAGE) {
    super(message);
    this.name = 'FileAccessRequiredError';
  }
}

export function isFileAccessRequiredError(
  error: unknown,
): error is FileAccessRequiredError {
  return error instanceof FileAccessRequiredError;
}

export function isFileAccessRequiredMessage(
  message: string | null | undefined,
): boolean {
  return message === FILE_ACCESS_REQUIRED_MESSAGE;
}

export function isUnsharedDriveFileResponse(
  status: number,
  body: string,
): boolean {
  if (status === 404) {
    return true;
  }

  if (status !== 403) {
    return false;
  }

  let apiMessage = body;
  let reason = '';
  try {
    const parsed = JSON.parse(body) as {
      error?: {
        message?: string;
        status?: string;
        errors?: Array<{ reason?: string }>;
      };
    };
    apiMessage = parsed.error?.message ?? body;
    reason = parsed.error?.errors?.[0]?.reason ?? parsed.error?.status ?? '';
  } catch {
    apiMessage = body.slice(0, 180);
  }

  const normalized = `${reason} ${apiMessage}`.toLowerCase();
  return (
    reason === 'notFound' ||
    reason === 'fileNotFound' ||
    normalized.includes('file not found') ||
    normalized.includes('has not granted') ||
    normalized.includes('not been granted')
  );
}
