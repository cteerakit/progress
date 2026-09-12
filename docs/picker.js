(() => {
  const DRIVE_PICKER_PICKED = 'PROGRESS_DRIVE_FILE_PICKED';
  const DRIVE_PICKER_CANCELLED = 'PROGRESS_DRIVE_FILE_CANCELLED';
  const PRESENTATION_MIME = 'application/vnd.google-apps.presentation';

  const status = document.getElementById('status');
  const retry = document.getElementById('retry');
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const fileId = params.get('fileId') ?? '';
  const token = params.get('token') ?? '';
  const apiKey = params.get('apiKey') ?? '';
  const appId = params.get('appId') ?? '';
  const extensionId = params.get('extensionId') ?? '';
  const nonce = params.get('nonce') ?? '';

  history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);

  function setStatus(message, isError = false) {
    if (!status) {
      return;
    }
    status.textContent = message;
    if (isError) {
      status.dataset.tone = 'error';
    } else {
      delete status.dataset.tone;
    }
  }

  function sendToExtension(payload) {
    if (!extensionId || typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(extensionId, payload, () => {
        resolve(!chrome.runtime.lastError);
      });
    });
  }

  async function finish(type, pickedFileId) {
    await sendToExtension({
      type,
      nonce,
      fileId: pickedFileId ?? fileId,
    });
    window.close();
  }

  function showRetry(message) {
    setStatus(message, true);
    if (retry) {
      retry.hidden = false;
    }
  }

  function createView() {
    const view = new google.picker.DocsView()
      .setIncludeFolders(false)
      .setMimeTypes(PRESENTATION_MIME)
      .setMode(google.picker.DocsViewMode.LIST);

    if (typeof view.setEnableDrives === 'function') {
      view.setEnableDrives(true);
    }
    if (typeof view.setFileIds === 'function') {
      view.setFileIds(fileId);
    }

    return view;
  }

  function openPicker() {
    const builder = new google.picker.PickerBuilder()
      .addView(createView())
      .setOAuthToken(token)
      .setDeveloperKey(apiKey)
      .setAppId(appId)
      .setTitle('Allow Progress to use this presentation')
      .setCallback((data) => {
        const action = data[google.picker.Response.ACTION];
        if (action === google.picker.Action.CANCEL) {
          void finish(DRIVE_PICKER_CANCELLED);
          return;
        }
        if (action !== google.picker.Action.PICKED) {
          return;
        }

        const docs = data[google.picker.Response.DOCUMENTS] ?? [];
        const pickedId = docs[0]?.[google.picker.Document.ID];
        if (pickedId !== fileId) {
          showRetry('Select the presentation that is currently open, then continue.');
          return;
        }

        void finish(DRIVE_PICKER_PICKED, pickedId);
      });

    if (google.picker.Feature?.SUPPORT_DRIVES) {
      builder.enableFeature(google.picker.Feature.SUPPORT_DRIVES);
    }
    if (google.picker.Feature?.NAV_HIDDEN) {
      builder.enableFeature(google.picker.Feature.NAV_HIDDEN);
    }
    if (typeof builder.setOrigin === 'function') {
      builder.setOrigin(window.location.origin);
    }

    builder.build().setVisible(true);
  }

  function start() {
    if (!fileId || !token || !apiKey || !appId || !extensionId || !nonce) {
      showRetry('This confirmation page is missing required Progress settings.');
      return;
    }

    if (typeof gapi === 'undefined' || typeof gapi.load !== 'function') {
      showRetry("Google's confirmation dialog failed to load. Check your network and try again.");
      return;
    }

    gapi.load('picker', {
      callback: openPicker,
      onerror: () => {
        showRetry("Google's confirmation dialog failed to load. Try again.");
      },
    });
  }

  retry?.addEventListener('click', () => {
    retry.hidden = true;
    setStatus(
      'Confirm this open deck so Progress can sync statuses. This is required once per presentation.',
    );
    start();
  });

  start();
})();
