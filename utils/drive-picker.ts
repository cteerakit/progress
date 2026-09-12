import { getChromeRuntime, getChromeStorage } from './extension-api';
import {
  FILE_ACCESS_REQUIRED_MESSAGE,
  PICKER_NOT_CONFIGURED_MESSAGE,
} from './file-access';

export const DRIVE_PICKER_PICKED = 'PROGRESS_DRIVE_FILE_PICKED';
export const DRIVE_PICKER_CANCELLED = 'PROGRESS_DRIVE_FILE_CANCELLED';

const PENDING_PICKER_KEY = 'pendingDrivePicker';

const DEFAULT_PICKER_PAGE_URL = 'https://progress.teerakit.com/picker.html';

interface PendingPicker {
  presentationId: string;
  nonce: string;
  windowId: number;
}

interface PickerPageMessage {
  type?: string;
  nonce?: string;
  fileId?: string;
}

type PickerOutcome = 'picked' | 'cancelled';

interface PickerWaiter {
  presentationId: string;
  nonce: string;
  resolve: (outcome: PickerOutcome) => void;
}

let pickerWaiter: PickerWaiter | null = null;

function pickerPageUrl(): string {
  const configured = import.meta.env.WXT_PICKER_PAGE_URL;
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim();
  }
  return DEFAULT_PICKER_PAGE_URL;
}

function pickerApiKey(): string {
  const value = import.meta.env.WXT_GOOGLE_API_KEY;
  return typeof value === 'string' ? value.trim() : '';
}

function pickerAppId(): string {
  const value = import.meta.env.WXT_GOOGLE_APP_ID;
  return typeof value === 'string' ? value.trim() : '';
}

export function pickerOrigin(): string {
  try {
    return new URL(pickerPageUrl()).origin;
  } catch {
    return 'https://progress.teerakit.com';
  }
}

function isPickerSenderUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    const sender = new URL(url);
    const allowed = new URL(pickerPageUrl());
    return (
      sender.origin === allowed.origin &&
      sender.pathname.replace(/\/$/, '') === allowed.pathname.replace(/\/$/, '')
    );
  } catch {
    return false;
  }
}

function createNonce(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function readPendingPicker(): Promise<PendingPicker | null> {
  const storage = getChromeStorage('session');
  if (!storage) {
    return null;
  }

  const result = await storage.get(PENDING_PICKER_KEY);
  const pending = result[PENDING_PICKER_KEY] as PendingPicker | undefined;
  if (
    !pending ||
    typeof pending.presentationId !== 'string' ||
    typeof pending.nonce !== 'string' ||
    typeof pending.windowId !== 'number'
  ) {
    return null;
  }
  return pending;
}

async function writePendingPicker(pending: PendingPicker | null): Promise<void> {
  const storage = getChromeStorage('session');
  if (!storage) {
    return;
  }

  if (!pending) {
    await storage.remove(PENDING_PICKER_KEY);
    return;
  }

  await storage.set({ [PENDING_PICKER_KEY]: pending });
}

async function closePickerWindow(windowId: number): Promise<void> {
  try {
    await browser.windows.remove(windowId);
  } catch {
    // The confirmation window may already be closed.
  }
}

function finishWaiter(pending: PendingPicker, outcome: PickerOutcome): void {
  if (
    pickerWaiter &&
    pickerWaiter.nonce === pending.nonce &&
    pickerWaiter.presentationId === pending.presentationId
  ) {
    pickerWaiter.resolve(outcome);
  }
  pickerWaiter = null;
}

export async function handleDrivePickerExternalMessage(
  message: unknown,
  senderUrl: string | undefined,
): Promise<boolean> {
  if (!isPickerSenderUrl(senderUrl)) {
    return false;
  }

  if (!message || typeof message !== 'object') {
    return false;
  }

  const payload = message as PickerPageMessage;
  if (
    payload.type !== DRIVE_PICKER_PICKED &&
    payload.type !== DRIVE_PICKER_CANCELLED
  ) {
    return false;
  }

  const pending = await readPendingPicker();
  if (!pending || payload.nonce !== pending.nonce) {
    return false;
  }

  const pickedRequestedFile =
    payload.type === DRIVE_PICKER_PICKED &&
    payload.fileId === pending.presentationId;

  await writePendingPicker(null);
  await closePickerWindow(pending.windowId);
  finishWaiter(pending, pickedRequestedFile ? 'picked' : 'cancelled');
  return pickedRequestedFile;
}

export async function handleDrivePickerWindowRemoved(
  windowId: number,
): Promise<void> {
  const pending = await readPendingPicker();
  if (!pending || pending.windowId !== windowId) {
    return;
  }

  await writePendingPicker(null);
  finishWaiter(pending, 'cancelled');
}

export async function promptDriveFileAccess(
  token: string,
  presentationId: string,
): Promise<boolean> {
  const apiKey = pickerApiKey();
  const appId = pickerAppId();
  if (!apiKey || !appId) {
    throw new Error(PICKER_NOT_CONFIGURED_MESSAGE);
  }

  const runtime = getChromeRuntime();
  if (!runtime?.id) {
    throw new Error(FILE_ACCESS_REQUIRED_MESSAGE);
  }

  const existing = await readPendingPicker();
  if (existing) {
    if (existing.presentationId === presentationId) {
      try {
        await browser.windows.update(existing.windowId, { focused: true });
        return await waitForExistingPicker(existing);
      } catch {
        await writePendingPicker(null);
      }
    } else {
      await closePickerWindow(existing.windowId);
      await writePendingPicker(null);
      if (pickerWaiter) {
        pickerWaiter.resolve('cancelled');
        pickerWaiter = null;
      }
    }
  }

  const nonce = createNonce();
  const hash = new URLSearchParams({
    fileId: presentationId,
    token,
    apiKey,
    appId,
    extensionId: runtime.id,
    nonce,
  }).toString();

  const created = await browser.windows.create({
    url: `${pickerPageUrl()}#${hash}`,
    type: 'popup',
    width: 680,
    height: 620,
    focused: true,
  });

  if (created?.id == null) {
    throw new Error(FILE_ACCESS_REQUIRED_MESSAGE);
  }

  const pending: PendingPicker = {
    presentationId,
    nonce,
    windowId: created.id,
  };
  await writePendingPicker(pending);

  const outcome = await new Promise<PickerOutcome>((resolve) => {
    pickerWaiter = {
      presentationId,
      nonce,
      resolve,
    };
  });

  return outcome === 'picked';
}

async function waitForExistingPicker(
  pending: PendingPicker,
): Promise<boolean> {
  if (
    pickerWaiter &&
    pickerWaiter.nonce === pending.nonce &&
    pickerWaiter.presentationId === pending.presentationId
  ) {
    return new Promise<boolean>((resolve) => {
      const previous = pickerWaiter;
      pickerWaiter = {
        presentationId: pending.presentationId,
        nonce: pending.nonce,
        resolve: (outcome) => {
          previous?.resolve(outcome);
          resolve(outcome === 'picked');
        },
      };
    });
  }

  const outcome = await new Promise<PickerOutcome>((resolve) => {
    pickerWaiter = {
      presentationId: pending.presentationId,
      nonce: pending.nonce,
      resolve,
    };
  });
  return outcome === 'picked';
}
