export interface StatusPreset {
  id: string;
  label: string;
  color: string;
  icon: string;
}

export interface StatusPresetConfig {
  version: number;
  updatedAt: number;
  completeStatusIds: string[];
  statuses: StatusPreset[];
}

type StatusPresetConfigInput = StatusPresetConfig & {
  completeStatusId?: string;
};

export const NONE_STATUS_ID = 'none';
export const DEFAULT_COMPLETE_STATUS_ID = 'done';
export const DEFAULT_COMPLETE_STATUS_IDS = [DEFAULT_COMPLETE_STATUS_ID];
export const MAX_EDITABLE_STATUS_COUNT = 10;
export const MAX_STATUS_COUNT = MAX_EDITABLE_STATUS_COUNT + 1;
export const MAX_STATUS_LABEL_LENGTH = 32;

export const BUILTIN_STATUS_IDS = [
  'none',
  'todo',
  'in-progress',
  'need-attention',
  'done',
] as const;

export type BuiltinStatusId = (typeof BUILTIN_STATUS_IDS)[number];

export const ICON_ALLOWLIST = [
  'radio_button_unchecked',
  'circle_circle',
  'radio_button_partial',
  'error',
  'radio_button_checked',
  'check_circle',
] as const;

export const DEFAULT_STATUS_ICON = ICON_ALLOWLIST[0];

export type StatusIconId = (typeof ICON_ALLOWLIST)[number];

export const STATUS_COLOR_PRESETS = [
  '#9aa0a6',
  '#5f6368',
  '#fbbc05',
  '#4285f4',
  '#ea4335',
  '#34a853',
] as const;

export type StatusColorPreset = (typeof STATUS_COLOR_PRESETS)[number];

export const DEFAULT_STATUS_COLOR = STATUS_COLOR_PRESETS[0];

const CUSTOM_STATUS_ID = /^s_[a-z0-9]{4,12}$/;

export const DEFAULT_STATUS_PRESETS: StatusPreset[] = [
  {
    id: 'none',
    label: 'No status',
    color: '#9aa0a6',
    icon: 'radio_button_unchecked',
  },
  {
    id: 'todo',
    label: 'To do',
    color: '#fbbc05',
    icon: 'circle_circle',
  },
  {
    id: 'in-progress',
    label: 'In progress',
    color: '#4285f4',
    icon: 'radio_button_partial',
  },
  {
    id: 'need-attention',
    label: 'Need attention',
    color: '#ea4335',
    icon: 'error',
  },
  {
    id: 'done',
    label: 'Done',
    color: '#34a853',
    icon: 'check_circle',
  },
];

export const DEFAULT_STATUS_PRESET_CONFIG: StatusPresetConfig = {
  version: 1,
  updatedAt: 0,
  completeStatusIds: [...DEFAULT_COMPLETE_STATUS_IDS],
  statuses: DEFAULT_STATUS_PRESETS.map((preset) => ({ ...preset })),
};

export function cloneStatusPresetConfig(
  config: StatusPresetConfig,
): StatusPresetConfig {
  return {
    version: config.version,
    updatedAt: config.updatedAt,
    completeStatusIds: [...config.completeStatusIds],
    statuses: config.statuses.map((preset) => ({ ...preset })),
  };
}

function normalizeCompleteStatusIds(
  config: StatusPresetConfigInput,
  statuses: StatusPreset[],
): string[] {
  const allowedIds = new Set(statuses.map((preset) => preset.id));
  const selected = new Set<string>();

  if (config.completeStatusIds !== undefined) {
    for (const statusId of config.completeStatusIds) {
      if (statusId !== NONE_STATUS_ID && allowedIds.has(statusId)) {
        selected.add(statusId);
      }
    }

    return statuses
      .map((preset) => preset.id)
      .filter((statusId) => selected.has(statusId));
  }

  if (config.completeStatusId) {
    const legacyId = config.completeStatusId;
    if (legacyId !== NONE_STATUS_ID && allowedIds.has(legacyId)) {
      selected.add(legacyId);
    }
  }

  if (selected.size === 0) {
    const defaultDone = statuses.find(
      (preset) => preset.id === DEFAULT_COMPLETE_STATUS_ID,
    );
    if (defaultDone) {
      selected.add(defaultDone.id);
    } else {
      const first = statuses.find((preset) => preset.id !== NONE_STATUS_ID);
      if (first) {
        selected.add(first.id);
      }
    }
  }

  return statuses
    .map((preset) => preset.id)
    .filter((statusId) => selected.has(statusId));
}

export function getPrimaryCompleteStatusId(
  config: StatusPresetConfig,
): string {
  return config.completeStatusIds[0] ?? DEFAULT_COMPLETE_STATUS_ID;
}

export function isCompleteStatus(
  config: StatusPresetConfig,
  statusId: string,
): boolean {
  return config.completeStatusIds.includes(statusId);
}

export function isAllowedIcon(icon: string): boolean {
  return (ICON_ALLOWLIST as readonly string[]).includes(icon);
}

export function isAllowedStatusColor(color: string): boolean {
  return (STATUS_COLOR_PRESETS as readonly string[]).includes(color.toLowerCase());
}

export function normalizeStatusColor(color: string): string {
  const normalized = color.toLowerCase();
  return isAllowedStatusColor(normalized) ? normalized : DEFAULT_STATUS_COLOR;
}

export function isValidStatusId(id: string): boolean {
  if (BUILTIN_STATUS_IDS.includes(id as BuiltinStatusId)) {
    return true;
  }
  return CUSTOM_STATUS_ID.test(id);
}

export function createCustomStatusId(): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `s_${suffix}`;
}

export function normalizeStatusLabel(label: string): string {
  return label.trim().slice(0, MAX_STATUS_LABEL_LENGTH);
}

export function validateStatusPresetConfig(
  config: StatusPresetConfigInput,
): StatusPresetConfig {
  const statuses: StatusPreset[] = [];
  const seen = new Set<string>();

  for (const preset of config.statuses.slice(0, MAX_STATUS_COUNT)) {
    if (!preset || typeof preset.id !== 'string' || !isValidStatusId(preset.id)) {
      continue;
    }
    if (seen.has(preset.id)) {
      continue;
    }

    const icon = isAllowedIcon(preset.icon)
      ? preset.icon
      : DEFAULT_STATUS_ICON;
    const color = normalizeStatusColor(preset.color);
    const label = normalizeStatusLabel(preset.label) || preset.id;

    seen.add(preset.id);
    statuses.push({ id: preset.id, label, color, icon });
  }

  if (!statuses.some((preset) => preset.id === NONE_STATUS_ID)) {
    statuses.unshift(
      DEFAULT_STATUS_PRESETS.find((preset) => preset.id === NONE_STATUS_ID)!,
    );
  }

  const noneIndex = statuses.findIndex((preset) => preset.id === NONE_STATUS_ID);
  if (noneIndex > 0) {
    const removed = statuses.splice(noneIndex, 1);
    const nonePreset = removed[0];
    if (nonePreset) {
      statuses.unshift(nonePreset);
    }
  }

  const completeStatusIds = normalizeCompleteStatusIds(config, statuses);

  return {
    version: 1,
    updatedAt: Number.isFinite(config.updatedAt) ? config.updatedAt : 0,
    completeStatusIds,
    statuses,
  };
}

export function getPresetById(
  config: StatusPresetConfig,
  statusId: string,
): StatusPreset | undefined {
  return config.statuses.find((preset) => preset.id === statusId);
}

export function getPresetLabel(
  config: StatusPresetConfig,
  statusId: string,
): string {
  return getPresetById(config, statusId)?.label ?? 'Unknown';
}

export function getPresetColor(
  config: StatusPresetConfig,
  statusId: string,
): string {
  return getPresetById(config, statusId)?.color ?? DEFAULT_STATUS_COLOR;
}

export function getPresetIcon(
  config: StatusPresetConfig,
  statusId: string,
): string {
  return getPresetById(config, statusId)?.icon ?? DEFAULT_STATUS_ICON;
}

export function getOrderedSelectablePresets(
  config: StatusPresetConfig,
): StatusPreset[] {
  return config.statuses;
}

export function encodeCatalogPayload(config: StatusPresetConfig): string {
  const validated = validateStatusPresetConfig(config);
  return JSON.stringify({
    v: validated.version,
    u: validated.updatedAt,
    c: validated.completeStatusIds,
    s: validated.statuses.map((preset) => [
      preset.id,
      preset.label,
      preset.color,
      preset.icon,
    ]),
  });
}

export function decodeCatalogPayload(
  description: string | null | undefined,
): StatusPresetConfig | null {
  if (!description) {
    return null;
  }

  try {
    const parsed = JSON.parse(description) as {
      v?: number;
      u?: number;
      c?: string | string[];
      s?: Array<[string, string, string, string]>;
    };

    if (!parsed.s || !Array.isArray(parsed.s)) {
      return null;
    }

    const completeStatusIds = Array.isArray(parsed.c)
      ? parsed.c
      : parsed.c
        ? [parsed.c]
        : [...DEFAULT_COMPLETE_STATUS_IDS];

    return validateStatusPresetConfig({
      version: parsed.v ?? 1,
      updatedAt: parsed.u ?? 0,
      completeStatusIds,
      statuses: parsed.s.map(([id, label, color, icon]) => ({
        id,
        label,
        color,
        icon,
      })),
    });
  } catch {
    return null;
  }
}

export function mergeStatusPresetConfigs(
  local: StatusPresetConfig,
  remote: StatusPresetConfig,
): { merged: StatusPresetConfig; localChanged: boolean; remoteChanged: boolean } {
  if (remote.updatedAt > local.updatedAt) {
    return {
      merged: cloneStatusPresetConfig(remote),
      localChanged: true,
      remoteChanged: false,
    };
  }

  if (local.updatedAt > remote.updatedAt) {
    return {
      merged: cloneStatusPresetConfig(local),
      localChanged: false,
      remoteChanged: true,
    };
  }

  const merged = validateStatusPresetConfig(local);
  const remoteValidated = validateStatusPresetConfig(remote);
  const changed =
    JSON.stringify(merged.statuses) !== JSON.stringify(remoteValidated.statuses) ||
    JSON.stringify(merged.completeStatusIds) !==
      JSON.stringify(remoteValidated.completeStatusIds);

  return {
    merged,
    localChanged: changed,
    remoteChanged: changed,
  };
}

export function bumpStatusPresetConfig(
  config: StatusPresetConfig,
  now = Math.floor(Date.now() / 1000),
): StatusPresetConfig {
  return {
    ...cloneStatusPresetConfig(config),
    updatedAt: Math.max(now, config.updatedAt + 1),
  };
}
