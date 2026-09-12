export interface SyncState {
  signedIn: boolean;
  lastSyncAt: number;
  /** Google account email for the active OAuth session. */
  signedInEmail?: string | null;
  /** Google account profile photo URL for the active OAuth session. */
  signedInPicture?: string | null;
  /** Account- or auth-level failures only. */
  error: string | null;
  /** Per-presentation sync failures keyed by presentation id. */
  presentationErrors?: Record<string, string>;
  /** Per-presentation edit capability. Missing means unknown. */
  presentationCanEdit?: Record<string, boolean>;
}

export function getPresentationSyncError(
  state: SyncState,
  presentationId: string,
): string | null {
  return state.presentationErrors?.[presentationId] ?? null;
}

export function getEffectiveSyncError(
  state: SyncState,
  presentationId: string,
): string | null {
  return state.error ?? getPresentationSyncError(state, presentationId);
}

export function getAnySyncError(state: SyncState): string | null {
  if (state.error) {
    return state.error;
  }

  const presentationErrors = state.presentationErrors;
  if (!presentationErrors) {
    return null;
  }

  return Object.values(presentationErrors)[0] ?? null;
}

export function isSyncReady(
  state: SyncState,
  presentationId?: string,
): boolean {
  if (!state.signedIn || state.error) {
    return false;
  }

  if (!presentationId) {
    return true;
  }

  return !getPresentationSyncError(state, presentationId);
}

export function isEditAccessKnown(
  state: SyncState,
  presentationId: string,
): boolean {
  return state.presentationCanEdit?.[presentationId] !== undefined;
}

export function canEditPresentation(
  state: SyncState,
  presentationId: string,
): boolean {
  return state.presentationCanEdit?.[presentationId] === true;
}

export function isGlobalSyncError(message: string): boolean {
  return (
    message === 'Not signed in' ||
    message === 'Authentication expired' ||
    message === 'Sign-in cancelled' ||
    message === 'Sign-in failed' ||
    message.includes('Slides sign-in expired') ||
    message.includes('Google Slides API is disabled') ||
    message.includes('Google Drive API is disabled') ||
    message.includes('Drive permissions are out of date') ||
    message.includes('cannot confirm this presentation')
  );
}
