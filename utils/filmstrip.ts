import { indexSlideKey, slideIdFromHash } from './messages';

const THUMBNAIL_SELECTORS = [
  '.punch-filmstrip-thumbnail',
  '.punch-filmstrip [role="option"]',
  '.punch-filmstrip [role="listitem"]',
];

export interface ThumbnailInfo {
  element: HTMLElement;
  index: number;
  slideKey: string;
}

export function getPresentationIdFromLocation(): string | null {
  const match = window.location.pathname.match(/\/presentation\/d\/([^/]+)/);
  return match?.[1] ?? null;
}

export function getFilmstripRoot(): HTMLElement | null {
  return document.querySelector('.punch-filmstrip');
}

export function getThumbnails(filmstrip: ParentNode): HTMLElement[] {
  for (const selector of THUMBNAIL_SELECTORS) {
    const nodes = Array.from(
      filmstrip.querySelectorAll<HTMLElement>(selector),
    );
    if (nodes.length > 0) {
      return nodes;
    }
  }
  return [];
}

function isThumbnailSelected(element: HTMLElement): boolean {
  return (
    element.getAttribute('aria-selected') === 'true' ||
    element.classList.contains('punch-filmstrip-selected') ||
    element.classList.contains('goog-option-selected')
  );
}

export function resolveSlideKeyForThumbnail(
  element: HTMLElement,
  index: number,
  idsByIndex: Record<string, string>,
): string {
  const mappedId = idsByIndex[String(index)];
  if (mappedId) {
    return mappedId;
  }

  if (isThumbnailSelected(element)) {
    const hashId = slideIdFromHash(window.location.hash);
    if (hashId) {
      return hashId;
    }
  }

  const dataId =
    element.getAttribute('data-slide-id') ??
    element.getAttribute('data-id') ??
    element.dataset.slideId;

  if (dataId) {
    return dataId.startsWith('id.') ? dataId : `id.${dataId}`;
  }

  return indexSlideKey(index);
}

export function buildThumbnailInfos(
  filmstrip: ParentNode,
  idsByIndex: Record<string, string>,
): ThumbnailInfo[] {
  const thumbnails = getThumbnails(filmstrip);
  return thumbnails.map((element, index) => ({
    element,
    index,
    slideKey: resolveSlideKeyForThumbnail(element, index, idsByIndex),
  }));
}

export function waitForFilmstrip(
  timeoutMs = 30_000,
): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const existing = getFilmstripRoot();
    if (existing) {
      resolve(existing);
      return;
    }

    const started = Date.now();
    const observer = new MutationObserver(() => {
      const filmstrip = getFilmstripRoot();
      if (filmstrip) {
        observer.disconnect();
        resolve(filmstrip);
      } else if (Date.now() - started > timeoutMs) {
        observer.disconnect();
        resolve(null);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    window.setTimeout(() => {
      observer.disconnect();
      resolve(getFilmstripRoot());
    }, timeoutMs);
  });
}

export function findTitleBarAnchor(): HTMLElement | null {
  const selectors = [
    '.docs-titlebar-buttons',
    '.docs-titlebar',
    '#docs-titlebar-container',
  ];

  for (const selector of selectors) {
    const node = document.querySelector<HTMLElement>(selector);
    if (node) {
      return node;
    }
  }

  return null;
}

export async function batchDomWork<T>(
  items: T[],
  batchSize: number,
  work: (item: T) => void,
): Promise<void> {
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        for (const item of batch) {
          work(item);
        }
        resolve();
      });
    });

    if (globalThis.scheduler?.yield) {
      await scheduler.yield();
    }
  }
}
