export const PRESENTATION_FIELDS =
  'revisionId,slides(objectId,pageElements(objectId,title,description))';

export interface SlidesPageElement {
  objectId: string;
  title?: string;
  description?: string;
}

export interface SlidesPage {
  objectId: string;
  pageElements?: SlidesPageElement[];
}

export interface SlidesPresentation {
  revisionId?: string;
  slides?: SlidesPage[];
}

export type SlidesBatchRequest = Record<string, unknown>;

export class SlidesEditDeniedError extends Error {
  constructor(
    message = 'You can open this presentation but do not have edit access.',
  ) {
    super(message);
    this.name = 'SlidesEditDeniedError';
  }
}

export async function fetchPresentation(
  token: string,
  presentationId: string,
): Promise<SlidesPresentation> {
  const url = new URL(
    `https://slides.googleapis.com/v1/presentations/${presentationId}`,
  );
  url.searchParams.set('fields', PRESENTATION_FIELDS);

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(await formatSlidesError('read', response));
  }

  return (await response.json()) as SlidesPresentation;
}

export async function batchUpdatePresentation(
  token: string,
  presentationId: string,
  requests: SlidesBatchRequest[],
): Promise<void> {
  if (requests.length === 0) {
    return;
  }

  const url = new URL(
    `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
  );

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    throw new Error(await formatSlidesError('update', response));
  }
}

export async function batchUpdatePresentationChunked(
  token: string,
  presentationId: string,
  requests: SlidesBatchRequest[],
  chunkSize = 50,
): Promise<void> {
  for (let index = 0; index < requests.length; index += chunkSize) {
    const chunk = requests.slice(index, index + chunkSize);
    await batchUpdatePresentation(token, presentationId, chunk);
  }
}

export function presentationCanEdit(presentation: SlidesPresentation): boolean {
  return Boolean(presentation.revisionId);
}

async function formatSlidesError(
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
      };
    };
    apiMessage = parsed.error?.message ?? '';
    reason = parsed.error?.errors?.[0]?.reason ?? parsed.error?.status ?? '';
  } catch {
    apiMessage = body.slice(0, 180);
  }

  if (
    reason === 'SERVICE_DISABLED' ||
    apiMessage.includes('has not been used in project') ||
    apiMessage.includes('is disabled')
  ) {
    return 'Google Slides API is disabled for this Cloud project. Enable it, wait a minute, then retry.';
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
      return 'Slides permissions are out of date. Sign out of Progress, sign in again, then retry.';
    }

    if (
      reason === 'forbidden' ||
      apiMessage.includes('does not have permission') ||
      apiMessage.includes('The caller does not have permission')
    ) {
      if (action === 'update') {
        throw new SlidesEditDeniedError();
      }

      return 'You can open this presentation but do not have permission to read its slide metadata.';
    }

    if (action === 'update') {
      if (apiMessage) {
        return `Could not save status sync data to Slides: ${apiMessage}`;
      }
      return 'Could not save status sync data to Slides. Confirm you can edit this presentation, then retry.';
    }

    if (apiMessage) {
      return `Could not read status sync data from Slides: ${apiMessage}`;
    }

    return 'Could not read status sync data from Slides.';
  }

  if (response.status === 404) {
    return 'This presentation was not found on Google Slides.';
  }

  const verb = action === 'update' ? 'save' : 'read';

  if (apiMessage) {
    return `Could not ${verb} status sync data (${response.status}): ${apiMessage}`;
  }

  return `Could not ${verb} status sync data (${response.status}).`;
}
