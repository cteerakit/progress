import { slideIdFromHash } from './messages';
import {
  assignIndexSlideId,
  indexSlideKey,
  isDriveSlideId,
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

function slideIdFromDataAttributes(element: Element): string | null {
  // Only Google's page-id attribute: generic ids elsewhere in the thumbnail
  // (clip paths, element ids) are not slide ids.
  const parsed = parseSlideId(element.getAttribute('data-slide-page-id'));
  if (parsed) {
    return parsed;
  }

  const nested = element.querySelector<Element>('[data-slide-page-id]');
  return nested && nested !== element ? slideIdFromDataAttributes(nested) : null;
}

const FILMSTRIP_SLIDE_ELEMENT_ID = /^filmstrip-slide-\d+-(.+)$/;

/** Google renders each thumbnail page as `<g id="filmstrip-slide-<n>-<pageId>">`. */
function slideIdFromElementId(element: Element): string | null {
  const node = element.id.startsWith('filmstrip-slide-')
    ? element
    : element.querySelector('[id^="filmstrip-slide-"]:not([id$="-bg"])');
  const match = node?.id.match(FILMSTRIP_SLIDE_ELEMENT_ID);
  return match ? parseSlideId(match[1]) : null;
}

interface LiveSlideId {
  id: string | null;
  /** Both DOM sources agree on the id. */
  confirmed: boolean;
}

function liveSlideIdFromElement(element: Element): LiveSlideId {
  const fromData = slideIdFromDataAttributes(element);
  const fromElementId = slideIdFromElementId(element);
  return {
    id: fromData ?? fromElementId,
    confirmed: Boolean(fromData && fromData === fromElementId),
  };
}

export function resolveSlideKeyForThumbnail(
  element: Element,
  index: number,
  idsByIndex: Record<string, string>,
  hashId: string | null = null,
): string {
  return pickSlideKey(
    liveSlideIdFromElement(element).id,
    index,
    idsByIndex,
    hashId,
  );
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

/**
 * Resolve each rendered thumbnail to a slide key. A Drive page id may belong
 * to at most one thumbnail: ids read from the live DOM win, and stale
 * index → id mappings or a lagging `#slide=` hash never hand a slide's id to
 * another thumbnail (e.g. a freshly inserted slide that pushed it down).
 */
export function buildThumbnailInfos(
  filmstrip: ParentNode,
  idsByIndex: Record<string, string>,
): ThumbnailInfo[] {
  const thumbnails = getThumbnails(filmstrip);
  const hashId = slideIdFromHash(window.location.hash);

  const entries = thumbnails.map((element, localIndex) => ({
    element,
    index: getThumbnailGlobalIndex(element, localIndex),
    live: liveSlideIdFromElement(element),
    selected: isThumbnailSelected(element),
  }));

  // Pass 1: live DOM ids. When Google briefly renders the same page id on two
  // thumbnails, keep it on the one whose DOM sources agree (or whose stored
  // index already maps to it).
  const owner = new Map<string, number>();
  entries.forEach((entry, position) => {
    const id = entry.live.id;
    if (!id) return;
    const current = owner.get(id);
    if (current === undefined) {
      owner.set(id, position);
      return;
    }
    const rival = entries[current];
    if (!rival) return;
    const score = (candidate: typeof entry) =>
      (candidate.live.confirmed ? 2 : 0) +
      (idsByIndex[String(candidate.index)] === id ? 1 : 0);
    if (score(entry) > score(rival)) {
      owner.set(id, position);
    }
  });

  const claimed = new Set(owner.keys());
  const keys = entries.map((entry, position) => {
    const id = entry.live.id;
    if (id && owner.get(id) === position) {
      return id;
    }
    return null;
  });

  // Pass 2: thumbnails without a live id fall back to the hash (selected
  // thumbnail only) or the stored mapping, unless another thumbnail owns it.
  entries.forEach((entry, position) => {
    if (keys[position]) return;
    const fallbacks = [
      entry.selected ? hashId : null,
      idsByIndex[String(entry.index)],
    ];
    for (const candidate of fallbacks) {
      if (candidate && isDriveSlideId(candidate) && !claimed.has(candidate)) {
        keys[position] = candidate;
        claimed.add(candidate);
        return;
      }
    }
    keys[position] = indexSlideKey(entry.index);
  });

  return entries.map((entry, position) => ({
    element: entry.element,
    index: entry.index,
    slideKey: keys[position] ?? indexSlideKey(entry.index),
  }));
}

export function buildIndexSlideKeyMap(
  deck: DeckState,
  thumbnails: ThumbnailInfo[] = [],
): Record<string, string> {
  const indexSlideKeys = { ...deck.idsByIndex };

  for (const info of thumbnails) {
    if (isDriveSlideId(info.slideKey)) {
      assignIndexSlideId(indexSlideKeys, info.index, info.slideKey);
    } else {
      // Rendered, but no trustworthy id: the stored mapping is stale.
      delete indexSlideKeys[String(info.index)];
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

function isFilmstripOverflowing(
  filmstrip?: ParentNode | null,
): boolean {
  const scroll = filmstrip
    ? getFilmstripScroll(filmstrip)
    : document.querySelector<HTMLElement>('.punch-filmstrip-scroll');
  if (!scroll) {
    return false;
  }

  return scroll.scrollHeight > scroll.clientHeight + 1;
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
  if (!isFilmstripOverflowing(scroll)) {
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
