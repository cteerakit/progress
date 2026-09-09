import type { StatusPresetConfig } from './status-presets';
import { validateStatusPresetConfig } from './status-presets';

export type PresetsUpdatedMessage = {
  type: 'PRESETS_UPDATED';
  presentationId: string;
  presets: StatusPresetConfig;
};

export function isPresetsUpdatedMessage(
  message: unknown,
): message is PresetsUpdatedMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const candidate = message as PresetsUpdatedMessage;
  return (
    candidate.type === 'PRESETS_UPDATED' &&
    typeof candidate.presentationId === 'string' &&
    Boolean(candidate.presets)
  );
}

export async function notifyPresentationPresetsUpdated(
  presentationId: string,
  presets: StatusPresetConfig,
): Promise<void> {
  if (!browser.tabs?.query || !browser.tabs.sendMessage) {
    return;
  }

  const validated = validateStatusPresetConfig(presets);
  const tabs = await browser.tabs.query({
    url: `*://docs.google.com/presentation/d/${presentationId}/*`,
  });

  for (const tab of tabs) {
    if (!tab.id) {
      continue;
    }

    try {
      await browser.tabs.sendMessage(tab.id, {
        type: 'PRESETS_UPDATED',
        presentationId,
        presets: validated,
      });
    } catch {
      // The content script may not be ready on inactive tabs.
    }
  }
}
