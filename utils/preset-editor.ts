import {
  createStatusIcon,
  createTrashIcon,
  setStatusIcon,
} from './material-icons';
import {
  registerDismissiblePanel,
  unregisterDismissiblePanel,
  type DismissiblePanel,
} from './panel-dismiss';
import {
  bumpStatusPresetConfig,
  cloneStatusPresetConfig,
  createCustomStatusId,
  DEFAULT_STATUS_PRESET_CONFIG,
  ICON_ALLOWLIST,
  MAX_EDITABLE_STATUS_COUNT,
  NONE_STATUS_ID,
  normalizeStatusLabel,
  STATUS_COLOR_PRESETS,
  validateStatusPresetConfig,
  type StatusPreset,
  type StatusPresetConfig,
} from './status-presets';

export type PresetSaveHandler = (
  config: StatusPresetConfig,
) => void | Promise<void>;

export interface PresetEditorController {
  setConfig: (config: StatusPresetConfig) => void;
  setEditable: (editable: boolean) => void;
  destroy: () => void;
}

export function mountPresetEditor(
  container: HTMLElement,
  options: {
    onSave: PresetSaveHandler;
    onDraftChange?: PresetSaveHandler;
    editable: boolean;
    config?: StatusPresetConfig;
  },
): PresetEditorController {
  let draft = cloneStatusPresetConfig(
    options.config ?? DEFAULT_STATUS_PRESET_CONFIG,
  );
  let editable = options.editable;
  let openIconPicker: HTMLElement | null = null;
  let openIconPickerAnchor: HTMLButtonElement | null = null;
  let openPickerStatusId: string | null = null;
  let dismissAppearancePicker: DismissiblePanel | null = null;
  let saveTimer: number | undefined;
  let pendingSave = false;

  const root = document.createElement('div');
  root.className = 'preset-editor';

  const intro = document.createElement('p');
  intro.className = 'preset-editor-intro';

  const setIntroText = () => {
    intro.textContent = editable
      ? 'Changes sync with collaborators. Select which statuses count toward completion.'
      : 'View only. You need edit access to customize statuses.';
  };

  setIntroText();

  const rows = document.createElement('div');
  rows.className = 'preset-editor-rows';

  const footer = document.createElement('div');
  footer.className = 'preset-editor-footer';

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'button button-secondary preset-editor-add';
  addButton.textContent = 'Add status';

  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'button button-secondary preset-editor-reset';
  resetButton.textContent = 'Reset to defaults';

  footer.append(addButton, resetButton);
  root.append(intro, rows, footer);
  container.replaceChildren(root);

  const flushPendingSave = () => {
    if (!editable || !pendingSave) {
      return;
    }

    pendingSave = false;
    window.clearTimeout(saveTimer);
    void options.onSave(validateStatusPresetConfig(draft));
  };

  const closeIconPicker = () => {
    const wasOpen = openPickerStatusId !== null;

    if (dismissAppearancePicker) {
      unregisterDismissiblePanel(dismissAppearancePicker);
      dismissAppearancePicker = null;
    }

    openIconPicker?.remove();
    openIconPicker = null;
    openIconPickerAnchor = null;
    openPickerStatusId = null;

    if (wasOpen) {
      flushPendingSave();
    }
  };

  const openAppearancePicker = (
    iconButton: HTMLButtonElement,
    index: number,
    preset: StatusPreset,
  ) => {
    const picker = renderAppearancePicker(iconButton, index, preset);
    document.body.append(picker);
    positionIconPicker(picker, iconButton);
    openIconPicker = picker;
    openIconPickerAnchor = iconButton;
    openPickerStatusId = preset.id;

    dismissAppearancePicker = {
      roots: [picker, iconButton],
      close: closeIconPicker,
    };
    registerDismissiblePanel(dismissAppearancePicker);
  };

  const positionIconPicker = (
    picker: HTMLElement,
    iconButton: HTMLButtonElement,
  ) => {
    const rect = iconButton.getBoundingClientRect();
    picker.style.top = `${rect.bottom + 4}px`;
    picker.style.left = `${rect.left}px`;

    const pickerRect = picker.getBoundingClientRect();
    const overflowBottom = pickerRect.bottom - window.innerHeight;
    if (overflowBottom > 0 && rect.top > pickerRect.height + 8) {
      picker.style.top = `${rect.top - pickerRect.height - 4}px`;
    }

    const overflowRight = pickerRect.right - window.innerWidth;
    if (overflowRight > 0) {
      picker.style.left = `${Math.max(8, rect.right - pickerRect.width)}px`;
    }
  };

  rows.addEventListener(
    'scroll',
    () => {
      closeIconPicker();
    },
    { passive: true },
  );

  const notifyDraftChange = () => {
    options.onDraftChange?.(validateStatusPresetConfig(draft));
  };

  const scheduleSave = () => {
    if (!editable) {
      return;
    }

    if (openPickerStatusId) {
      pendingSave = true;
      return;
    }

    pendingSave = false;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void options.onSave(validateStatusPresetConfig(draft));
    }, 300);
  };

  const isAtStatusLimit = () =>
    getEditablePresets().length >= MAX_EDITABLE_STATUS_COUNT;

  const setControlsDisabled = () => {
    const disabled = !editable;
    addButton.disabled = disabled || isAtStatusLimit();
    resetButton.disabled = disabled;
    for (const input of root.querySelectorAll('input, button')) {
      if (input instanceof HTMLButtonElement && input.classList.contains('delete-button')) {
        input.disabled = disabled;
      } else if (
        input instanceof HTMLInputElement &&
        (input.type === 'radio' || input.type === 'checkbox')
      ) {
        input.disabled = disabled;
      } else if (input instanceof HTMLButtonElement && input.classList.contains('drag-handle')) {
        input.disabled = disabled;
      } else if (input instanceof HTMLButtonElement && input.classList.contains('icon-button')) {
        input.disabled = disabled;
      } else if (input instanceof HTMLInputElement && input.classList.contains('label-input')) {
        input.disabled = disabled;
      }
    }
  };

  const getEditablePresets = () =>
    draft.statuses.filter((preset) => preset.id !== NONE_STATUS_ID);

  const getMinEditableIndex = () => {
    const noneIndex = draft.statuses.findIndex(
      (preset) => preset.id === NONE_STATUS_ID,
    );
    return noneIndex >= 0 ? noneIndex + 1 : 0;
  };

  const reorderPreset = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) {
      return;
    }

    const minIndex = getMinEditableIndex();
    if (toIndex < minIndex || fromIndex < minIndex) {
      return;
    }

    const statuses = [...draft.statuses];
    const removed = statuses.splice(fromIndex, 1);
    const item = removed[0];
    if (!item) {
      return;
    }

    statuses.splice(toIndex, 0, item);
    draft = bumpStatusPresetConfig({ ...draft, statuses });
    renderRows();
    notifyDraftChange();
    scheduleSave();
  };

  const clearDragState = () => {
    for (const row of rows.querySelectorAll('.preset-editor-row')) {
      row.classList.remove('is-dragging', 'is-drag-over');
    }
  };

  const updatePreset = (index: number, patch: Partial<StatusPreset>) => {
    const statuses = draft.statuses.map((preset, rowIndex) =>
      rowIndex === index ? { ...preset, ...patch } : preset,
    );
    draft = bumpStatusPresetConfig({ ...draft, statuses });
    notifyDraftChange();
    scheduleSave();
  };

  const deletePreset = (index: number) => {
    const preset = draft.statuses[index];
    if (!preset || preset.id === NONE_STATUS_ID) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${preset.label}"? Slides using this status will be set to No status.`,
    );
    if (!confirmed) {
      return;
    }

    const statuses = draft.statuses.filter((_, rowIndex) => rowIndex !== index);
    const completeStatusIds = draft.completeStatusIds.filter(
      (statusId) => statusId !== preset.id,
    );

    draft = bumpStatusPresetConfig({
      ...draft,
      statuses,
      completeStatusIds,
    });
    renderRows();
    notifyDraftChange();
    scheduleSave();
    void options.onSave(validateStatusPresetConfig(draft));
  };

  const renderAppearancePicker = (
    iconButton: HTMLButtonElement,
    index: number,
    preset: StatusPreset,
  ) => {
    const picker = document.createElement('div');
    picker.className = 'preset-icon-picker';

    const iconsSection = document.createElement('div');
    iconsSection.className = 'preset-icon-picker-icons';

    const colorsSection = document.createElement('div');
    colorsSection.className = 'preset-color-options';

    const getCurrentPreset = () => draft.statuses[index] ?? preset;

    const syncRowButton = () => {
      const current = getCurrentPreset();
      iconButton.replaceChildren(
        createStatusIcon(current.icon, { color: current.color }),
      );
    };

    const syncPickerSelection = () => {
      const current = getCurrentPreset();

      for (const option of iconsSection.querySelectorAll('.preset-icon-option')) {
        const iconId = option.getAttribute('data-icon-id');
        option.classList.toggle('is-selected', iconId === current.icon);
        const icon = option.querySelector('svg');
        if (icon) {
          setStatusIcon(icon, iconId ?? current.icon, current.color);
        }
      }

      for (const swatch of colorsSection.querySelectorAll('.preset-color-option')) {
        const color = swatch.getAttribute('data-color');
        swatch.classList.toggle('is-selected', color === current.color);
      }
    };

    for (const iconId of ICON_ALLOWLIST) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'preset-icon-option';
      option.dataset.iconId = iconId;
      option.append(createStatusIcon(iconId, { color: preset.color }));
      option.addEventListener('click', (event) => {
        event.stopPropagation();
        updatePreset(index, { icon: iconId });
        syncRowButton();
        syncPickerSelection();
      });
      iconsSection.append(option);
    }

    for (const color of STATUS_COLOR_PRESETS) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'preset-color-option';
      swatch.dataset.color = color;
      swatch.title = color;

      const dot = document.createElement('span');
      dot.className = 'preset-color-option-dot';
      dot.style.backgroundColor = color;
      swatch.append(dot);
      swatch.addEventListener('click', (event) => {
        event.stopPropagation();
        updatePreset(index, { color });
        syncRowButton();
        syncPickerSelection();
      });
      colorsSection.append(swatch);
    }

    picker.append(iconsSection, colorsSection);
    syncPickerSelection();
    return picker;
  };

  const teardownAppearancePicker = () => {
    if (dismissAppearancePicker) {
      unregisterDismissiblePanel(dismissAppearancePicker);
      dismissAppearancePicker = null;
    }

    openIconPicker?.remove();
    openIconPicker = null;
    openIconPickerAnchor = null;
  };

  const renderRows = () => {
    const restorePickerStatusId = openPickerStatusId;

    teardownAppearancePicker();
    rows.replaceChildren();

    const editablePresets = getEditablePresets();
    let pickerToRestore: {
      iconButton: HTMLButtonElement;
      index: number;
      preset: StatusPreset;
    } | null = null;

    editablePresets.forEach((preset) => {
      const index = draft.statuses.findIndex((item) => item.id === preset.id);
      if (index < 0) {
        return;
      }

      const row = document.createElement('div');
      row.className = 'preset-editor-row';
      row.dataset.index = String(index);

      const dragHandle = document.createElement('button');
      dragHandle.type = 'button';
      dragHandle.className = 'drag-handle';
      dragHandle.draggable = editable;
      dragHandle.disabled = !editable;
      dragHandle.setAttribute('aria-label', `Reorder ${preset.label}`);
      dragHandle.title = 'Drag to reorder';
      dragHandle.append(createDragHandleIcon());

      dragHandle.addEventListener('dragstart', (event) => {
        if (!editable) {
          event.preventDefault();
          return;
        }

        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(index));
        row.classList.add('is-dragging');
      });

      dragHandle.addEventListener('dragend', () => {
        clearDragState();
      });

      const iconWrap = document.createElement('div');
      iconWrap.className = 'preset-icon-wrap';

      const iconButton = document.createElement('button');
      iconButton.type = 'button';
      iconButton.className = 'icon-button';
      iconButton.disabled = !editable;
      iconButton.append(createStatusIcon(preset.icon, { color: preset.color }));
      iconButton.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!editable) {
          return;
        }
        if (openIconPicker && openIconPickerAnchor === iconButton) {
          closeIconPicker();
          return;
        }

        closeIconPicker();
        openAppearancePicker(iconButton, index, preset);
      });

      iconWrap.append(iconButton);

      if (restorePickerStatusId === preset.id) {
        pickerToRestore = { iconButton, index, preset };
      }

      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.className = 'label-input';
      labelInput.dataset.statusId = preset.id;
      labelInput.value = preset.label;
      labelInput.disabled = !editable;
      labelInput.addEventListener('change', () => {
        updatePreset(index, {
          label: normalizeStatusLabel(labelInput.value) || preset.label,
        });
        labelInput.value = draft.statuses[index]?.label ?? preset.label;
      });

      const completeWrap = document.createElement('div');
      completeWrap.className = 'preset-complete-wrap';

      const completeInput = document.createElement('input');
      completeInput.type = 'checkbox';
      completeInput.checked = draft.completeStatusIds.includes(preset.id);
      completeInput.disabled = !editable;
      completeInput.title = 'Counts toward completion';
      completeInput.setAttribute('aria-label', `Count ${preset.label} toward completion`);
      completeInput.addEventListener('change', () => {
        const nextIds = new Set(draft.completeStatusIds);
        if (completeInput.checked) {
          nextIds.add(preset.id);
        } else if (nextIds.size <= 1) {
          completeInput.checked = true;
          return;
        } else {
          nextIds.delete(preset.id);
        }

        draft = bumpStatusPresetConfig({
          ...draft,
          completeStatusIds: draft.statuses
            .map((item) => item.id)
            .filter((statusId) => nextIds.has(statusId)),
        });
        notifyDraftChange();
        scheduleSave();
      });
      completeWrap.append(completeInput);

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'delete-button';
      deleteButton.setAttribute('aria-label', `Delete ${preset.label}`);
      deleteButton.title = 'Delete status';
      deleteButton.disabled = !editable;
      deleteButton.append(createTrashIcon());
      deleteButton.addEventListener('click', () => deletePreset(index));

      row.addEventListener('dragover', (event) => {
        if (!editable) {
          return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        row.classList.add('is-drag-over');
      });

      row.addEventListener('dragleave', (event) => {
        if (event.relatedTarget instanceof Node && row.contains(event.relatedTarget)) {
          return;
        }

        row.classList.remove('is-drag-over');
      });

      row.addEventListener('drop', (event) => {
        event.preventDefault();
        row.classList.remove('is-drag-over');

        if (!editable) {
          return;
        }

        const fromIndex = Number.parseInt(
          event.dataTransfer.getData('text/plain'),
          10,
        );
        if (Number.isNaN(fromIndex)) {
          return;
        }

        reorderPreset(fromIndex, index);
      });

      row.append(
        dragHandle,
        iconWrap,
        labelInput,
        completeWrap,
        deleteButton,
      );
      rows.append(row);
    });

    if (pickerToRestore && editable) {
      openAppearancePicker(
        pickerToRestore.iconButton,
        pickerToRestore.index,
        pickerToRestore.preset,
      );
    } else {
      openPickerStatusId = null;
    }

    setControlsDisabled();
  };

  function createDragHandleIcon(): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
      'd',
      'M9 5h2v2H9V5zm0 6h2v2H9v-2zm0 6h2v2H9v-2zm4-12h2v2h-2V5zm0 6h2v2h-2v-2zm0 6h2v2h-2v-2Z',
    );
    path.setAttribute('fill', 'currentColor');
    svg.append(path);
    return svg;
  }

  addButton.addEventListener('click', () => {
    if (!editable || isAtStatusLimit()) {
      return;
    }

    const id = createCustomStatusId();
    draft = bumpStatusPresetConfig({
      ...draft,
      statuses: [
        ...draft.statuses,
        {
          id,
          label: 'New status',
          color: '#5f6368',
          icon: 'check_circle',
        },
      ],
    });
    renderRows();
    notifyDraftChange();
    scheduleSave();
  });

  resetButton.addEventListener('click', () => {
    if (!editable) {
      return;
    }
    if (
      !window.confirm(
        'Reset all statuses to the default set? This syncs with collaborators.',
      )
    ) {
      return;
    }

    draft = bumpStatusPresetConfig(
      cloneStatusPresetConfig(DEFAULT_STATUS_PRESET_CONFIG),
    );
    renderRows();
    notifyDraftChange();
    scheduleSave();
  });

  renderRows();
  setControlsDisabled();

  return {
    setConfig(config) {
      if (openPickerStatusId !== null) {
        return;
      }

      const next = validateStatusPresetConfig(config);
      const current = validateStatusPresetConfig(draft);
      if (JSON.stringify(next) === JSON.stringify(current)) {
        return;
      }

      draft = cloneStatusPresetConfig(next);
      renderRows();
      setControlsDisabled();
    },
    setEditable(nextEditable) {
      if (editable === nextEditable) {
        return;
      }

      editable = nextEditable;
      setIntroText();
      closeIconPicker();
      renderRows();
      setControlsDisabled();
    },
    destroy() {
      window.clearTimeout(saveTimer);
      pendingSave = false;
      closeIconPicker();
      container.replaceChildren();
    },
  };
}
