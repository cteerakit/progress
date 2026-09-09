import { slideIdFromHash } from './messages';
import {
  assignIndexSlideId,
  parseSlideId,
  pickSlideKey,
  uniqueIndexMappings,
  type DeckState,
} from './status';

const FILMSTRIP_ROOT_SELECTORS = [
  '.punch-filmstrip-scroll',
  '.filmstrip',
  '.punch-filmstrip',
];

const THUMBNAIL_SELECTORS = [
  'g.punch-filmstrip-thumbnail',
  '.punch-filmstrip-thumbnail',
  '.filmstrip [role="option"]',
  '.punch-filmstrip [role="option"]',
  '.filmstrip [role="listitem"]',
  '.punch-filmstrip [role="listitem"]',
];

export const CHIP_OVERLAY_CLASS = 'progress-chip-overlay';
const CHIP_ANCHOR_CLASS = 'progress-chip-anchor';

export interface ThumbnailInfo {
  element: Element;
  index: number;
  slideKey: string;
}

function parsePositiveInt(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function pageIndexFromLabel(
  text: string | null | undefined,
): number | null {
  const parsed = parsePositiveInt(text);
  return parsed ? parsed - 1 : null;
}

function slideIndexFromPageNumber(element: Element): number | null {
  const label = element.querySelector(
    '.punch-filmstrip-thumbnail-pagenumber',
  );
  return pageIndexFromLabel(label?.textContent?.trim());
}

export function getPresentationIdFromLocation(): string | null {
  const match = window.location.pathname.match(/\/presentation\/d\/([^/]+)/);
  return match?.[1] ?? null;
}

export function getFilmstripRoot(): HTMLElement | null {
  for (const selector of FILMSTRIP_ROOT_SELECTORS) {
    const node = document.querySelector<HTMLElement>(selector);
    if (node) {
      return node;
    }
  }
  return null;
}

export function getFilmstripScroll(filmstrip: ParentNode): HTMLElement | null {
  if (
    filmstrip instanceof HTMLElement &&
    filmstrip.classList.contains('punch-filmstrip-scroll')
  ) {
    return filmstrip;
  }

  return (
    (filmstrip as Element).querySelector?.('.punch-filmstrip-scroll') ??
    (filmstrip instanceof HTMLElement ? filmstrip : null)
  );
}

export function getThumbnails(filmstrip: ParentNode): Element[] {
  for (const selector of THUMBNAIL_SELECTORS) {
    const nodes = Array.from(filmstrip.querySelectorAll(selector));
    if (nodes.length > 0) {
      return nodes;
    }
  }
  return [];
}

function isThumbnailSelected(element: Element): boolean {
  return (
    element.getAttribute('aria-selected') === 'true' ||
    element.classList.contains('punch-filmstrip-selected') ||
    element.classList.contains('goog-option-selected') ||
    element.classList.contains('punch-filmstrip-thumbnail-selected')
  );
}

function slideIdFromElement(element: Element): string | null {
  const candidates = [
    element.getAttribute('data-slide-page-id'),
    element.getAttribute('data-slide-id'),
    element instanceof HTMLElement ? element.dataset.slidePageId : undefined,
    element instanceof HTMLElement ? element.dataset.slideId : undefined,
  ];

  for (const raw of candidates) {
    const parsed = parseSlideId(raw);
    if (parsed) {
      return parsed;
    }
  }

  const nested = element.querySelector<HTMLElement>(
    '[data-slide-page-id], [data-slide-id]',
  );
  if (nested && nested !== element) {
    return slideIdFromElement(nested);
  }

  return null;
}

export function resolveSlideKeyForThumbnail(
  element: Element,
  index: number,
  idsByIndex: Record<string, string>,
  hashId: string | null = null,
): string {
  return pickSlideKey(slideIdFromElement(element), index, idsByIndex, hashId);
}

function getThumbnailRect(thumbnail: Element): DOMRect {
  const rects: DOMRect[] = [];
  const collect = (node: Element) => {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      rects.push(rect);
    }
  };

  collect(thumbnail);
  for (const node of thumbnail.querySelectorAll('rect, image, foreignObject, use')) {
    collect(node);
  }

  if (rects.length === 0) {
    return thumbnail.getBoundingClientRect();
  }

  const top = Math.min(...rects.map((rect) => rect.top));
  const left = Math.min(...rects.map((rect) => rect.left));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const right = Math.max(...rects.map((rect) => rect.right));
  return new DOMRect(left, top, right - left, bottom - top);
}

function getThumbnailPreviewRect(thumbnail: Element): DOMRect {
  const preview =
    thumbnail.querySelector('rect.punch-filmstrip-thumbnail-border') ??
    thumbnail.querySelector('rect.punch-filmstrip-thumbnail-border-inner') ??
    thumbnail.querySelector('image');

  if (preview) {
    const rect = preview.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return rect;
    }
  }

  return getThumbnailRect(thumbnail);
}

export function getThumbnailGlobalIndex(
  element: Element,
  fallbackIndex: number,
): number {
  const fromPage = slideIndexFromPageNumber(element);
  if (fromPage != null) {
    return fromPage;
  }

  const posinset = element.getAttribute('aria-posinset');
  if (posinset) {
    const parsed = Number.parseInt(posinset, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed - 1;
    }
  }

  return fallbackIndex;
}

export function getSelectedThumbnailInfo(
  thumbnails: ThumbnailInfo[],
  hashId: string | null = slideIdFromHash(window.location.hash),
): ThumbnailInfo | null {
  const selected = thumbnails.find((info) => isThumbnailSelected(info.element));
  if (selected) {
    return selected;
  }

  if (hashId) {
    return thumbnails.find((info) => info.slideKey === hashId) ?? null;
  }

  return null;
}

export function buildThumbnailInfos(
  filmstrip: ParentNode,
  idsByIndex: Record<string, string>,
): ThumbnailInfo[] {
  const thumbnails = getThumbnails(filmstrip);
  const selectedIndex = thumbnails.findIndex((element) =>
    isThumbnailSelected(element),
  );
  const hashId = slideIdFromHash(window.location.hash);

  return thumbnails.map((element, localIndex) => {
    const index = getThumbnailGlobalIndex(element, localIndex);
    return {
      element,
      index,
      slideKey: resolveSlideKeyForThumbnail(
        element,
        index,
        idsByIndex,
        selectedIndex === localIndex ? hashId : null,
      ),
    };
  });
}

export function buildIndexSlideKeyMap(
  deck: DeckState,
  thumbnails: ThumbnailInfo[] = [],
): Record<string, string> {
  const indexSlideKeys = { ...deck.idsByIndex };

  for (const info of thumbnails) {
    if (!info.slideKey.startsWith('index:')) {
      assignIndexSlideId(indexSlideKeys, info.index, info.slideKey);
    }
  }

  return uniqueIndexMappings(indexSlideKeys);
}

export function ensureChipOverlay(scroll: HTMLElement): HTMLElement {
  if (getComputedStyle(scroll).position === 'static') {
    scroll.style.position = 'relative';
  }

  let overlay = scroll.querySelector<HTMLElement>(`.${CHIP_OVERLAY_CLASS}`);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = CHIP_OVERLAY_CLASS;
    overlay.style.cssText = [
      'position:absolute',
      'left:0',
      'top:0',
      'width:100%',
      'min-height:100%',
      'overflow:visible',
      'pointer-events:none',
      'z-index:6',
    ].join(';');
    scroll.append(overlay);
  }

  const svg = scroll.querySelector('svg.punch-filmstrip-thumbnails');
  if (svg instanceof SVGSVGElement) {
    const bbox = svg.getBBox();
    overlay.style.height = `${Math.max(bbox.height, scroll.scrollHeight, scroll.clientHeight)}px`;
  } else if (svg) {
    const heightAttr = svg.getAttribute('height');
    overlay.style.height =
      heightAttr || `${svg.getBoundingClientRect().height}px`;
  }

  return overlay;
}

export function getChipAnchor(
  overlay: HTMLElement,
  thumbnailIndex: number,
): HTMLElement | null {
  return overlay.querySelector<HTMLElement>(
    `.${CHIP_ANCHOR_CLASS}[data-thumbnail-index="${thumbnailIndex}"]`,
  );
}

export function upsertChipAnchor(
  overlay: HTMLElement,
  thumbnail: Element,
  thumbnailIndex: number,
): HTMLElement {
  let anchor = getChipAnchor(overlay, thumbnailIndex);
  if (!anchor) {
    anchor = document.createElement('div');
    anchor.className = CHIP_ANCHOR_CLASS;
    anchor.dataset.thumbnailIndex = String(thumbnailIndex);
    overlay.append(anchor);
  }

  const overlayRect = overlay.getBoundingClientRect();
  const thumbRect = getThumbnailPreviewRect(thumbnail);
  const top = thumbRect.top - overlayRect.top;
  const left = thumbRect.left - overlayRect.left;

  anchor.style.cssText = [
    'position:absolute',
    `top:${Math.max(0, top)}px`,
    `left:${Math.max(0, left)}px`,
    `width:${Math.max(0, thumbRect.width)}px`,
    `height:${Math.max(0, thumbRect.height)}px`,
    'pointer-events:none',
  ].join(';');

  return anchor;
}

export function pruneChipAnchors(
  overlay: HTMLElement,
  liveIndices: Set<number>,
): void {
  for (const anchor of overlay.querySelectorAll(`.${CHIP_ANCHOR_CLASS}`)) {
    const index = Number((anchor as HTMLElement).dataset.thumbnailIndex);
    if (!Number.isFinite(index) || !liveIndices.has(index)) {
      anchor.remove();
    }
  }
}

export function repositionChipAnchors(
  overlay: HTMLElement,
  thumbnails: ThumbnailInfo[],
): void {
  const overlayRect = overlay.getBoundingClientRect();

  for (const info of thumbnails) {
    const anchor = getChipAnchor(overlay, info.index);
    if (!anchor) {
      continue;
    }

    const thumbRect = getThumbnailPreviewRect(info.element);
    const top = thumbRect.top - overlayRect.top;
    const left = thumbRect.left - overlayRect.left;

    anchor.style.top = `${Math.max(0, top)}px`;
    anchor.style.left = `${Math.max(0, left)}px`;
    anchor.style.width = `${Math.max(0, thumbRect.width)}px`;
    anchor.style.height = `${Math.max(0, thumbRect.height)}px`;
  }
}

export function waitForFilmstrip(
  timeoutMs = 30_000,
): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const ready = () => {
      const root = getFilmstripRoot();
      if (root && getThumbnails(root).length > 0) {
        return root;
      }
      return null;
    };

    const existing = ready();
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const filmstrip = ready();
      if (filmstrip) {
        observer.disconnect();
        resolve(filmstrip);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    window.setTimeout(() => {
      observer.disconnect();
      resolve(ready());
    }, timeoutMs);
  });
}

function getLabeledSlideTotal(): number | null {
  const totalLabel = document.getElementById('punch-total-slide-count');
  return parsePositiveInt(totalLabel?.textContent?.trim());
}

function getThumbnailStride(thumbnails: Element[]): number | null {
  const first = getThumbnailRect(thumbnails[0]);
  if (first.height <= 0) {
    return null;
  }

  if (thumbnails.length > 1) {
    const second = getThumbnailRect(thumbnails[1]);
    const measured = second.top - first.top;
    if (measured > 0) {
      return measured;
    }
  }

  return first.height;
}

function estimateSlideCountFromScroll(
  scroll: HTMLElement | null,
  thumbnails: Element[],
): number | null {
  if (!scroll || thumbnails.length === 0) {
    return null;
  }

  // Google sizes the filmstrip SVG to the viewport even for a 1-slide deck,
  // filling the rest with an empty background rect. That is not extra slides.
  // Only estimate from scroll height when the strip actually overflows.
  if (scroll.scrollHeight <= scroll.clientHeight + 1) {
    return thumbnails.length;
  }

  const first = getThumbnailRect(thumbnails[0]);
  const stride = getThumbnailStride(thumbnails);
  if (!stride || first.height <= 0 || scroll.scrollHeight <= 0) {
    return null;
  }

  // scrollHeight spans (n - 1) strides plus the first thumbnail height.
  const estimated =
    Math.round((scroll.scrollHeight - first.height) / stride) + 1;
  return estimated >= thumbnails.length ? estimated : thumbnails.length;
}

function reconcileSlideCounts(candidates: number[]): number | null {
  const unique = [...new Set(candidates)].sort((a, b) => a - b);
  if (unique.length === 0) {
    return null;
  }
  if (unique.length === 1) {
    return unique[0];
  }

  const spread = unique[unique.length - 1] - unique[0];
  if (spread <= 1) {
    return unique[0];
  }

  return null;
}

function collectFilmstripAriaCounts(filmstrip: ParentNode): number[] {
  const counts: number[] = [];

  for (const selector of THUMBNAIL_SELECTORS) {
    for (const element of filmstrip.querySelectorAll(selector)) {
      const size = parsePositiveInt(element.getAttribute('aria-setsize'));
      if (size) {
        counts.push(size);
      }
    }
  }

  const listbox = filmstrip.querySelector('[role="listbox"], [role="list"]');
  const listSize = parsePositiveInt(listbox?.getAttribute('aria-setsize') ?? null);
  if (listSize) {
    counts.push(listSize);
  }

  return counts;
}

export function getPresentationSlideCount(
  filmstrip?: ParentNode | null,
): number | null {
  const labeledTotal = getLabeledSlideTotal();
  if (labeledTotal) {
    return labeledTotal;
  }

  if (filmstrip) {
    const filmstripCount = reconcileSlideCounts(
      collectFilmstripAriaCounts(filmstrip),
    );
    if (filmstripCount) {
      return filmstripCount;
    }

    const estimated = estimateSlideCountFromScroll(
      getFilmstripScroll(filmstrip),
      getThumbnails(filmstrip),
    );
    if (estimated) {
      return estimated;
    }
  }

  return null;
}

export function findTitleBarAnchor(): HTMLElement | null {
  const selectors = [
    '#docs-save-indicator-container',
    '.docs-save-indicator-container',
    '#docs-save-indicator-badge',
    '#docs-save-indicator-id',
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

    const scheduler = (
      globalThis as typeof globalThis & {
        scheduler?: { yield: () => Promise<void> };
      }
    ).scheduler;
    if (scheduler?.yield) {
      await scheduler.yield();
    }
  }
}
