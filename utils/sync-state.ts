export interface SyncState {
  signedIn: boolean;
  lastSyncAt: number;
  /** Account- or auth-level failures only. */
  error: string | null;
  /** Per-presentation sync failures keyed by Drive file id. */
  presentationErrors?: Record<string, string>;
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

export function isGlobalSyncError(message: string): boolean {
  return (
    message === 'Not signed in' ||
    message === 'Authentication expired' ||
    message === 'Sign-in cancelled' ||
    message === 'Sign-in failed' ||
    message.includes('Drive sign-in expired') ||
    message.includes('Google Drive API is disabled')
  );
}
