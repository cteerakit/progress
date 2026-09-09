type ChromeApi = typeof chrome;

function chromeApi(): ChromeApi | undefined {
  return (globalThis as typeof globalThis & { chrome?: ChromeApi }).chrome;
}

export function getChromeRuntime(): ChromeApi['runtime'] | undefined {
  return chromeApi()?.runtime;
}

export function getChromeStorage(
  area: 'local' | 'session' = 'local',
): ChromeApi['storage']['local'] | undefined {
  const storage = chromeApi()?.storage;
  if (!storage) {
    return undefined;
  }

  return area === 'session' ? storage.session : storage.local;
}
