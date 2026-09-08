type ChromeApi = typeof chrome;

function chromeApi(): ChromeApi | undefined {
  return (globalThis as typeof globalThis & { chrome?: ChromeApi }).chrome;
}

export function getChromeRuntime(): ChromeApi['runtime'] | undefined {
  return chromeApi()?.runtime;
}

export function getChromeStorage(): ChromeApi['storage'] | undefined {
  return chromeApi()?.storage;
}
