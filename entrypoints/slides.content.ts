import { defineContentScript } from 'wxt/utils/define-content-script';
import { injectGoogleSansLink } from '../utils/fonts';
import { defineDeckBadge, createDeckBadge, DECK_BADGE_SELECTOR } from '../utils/badge';
import {
  defineStatusChip,
  createStatusChip,
  STATUS_CHIP_SELECTOR,
} from '../utils/chip';
import { getDeckCounts } from '../utils/counts';
import {
  batchDomWork,
  buildIndexSlideKeyMap,
  buildThumbnailInfos,
  ensureChipOverlay,
  findTitleBarAnchor,
  getFilmstripScroll,
  getPresentationSlideCount,
  getPresentationIdFromLocation,
  pruneChipAnchors,
  repositionChipAnchors,
  upsertChipAnchor,
  waitForFilmstrip,
  CHIP_OVERLAY_CLASS,
  type ThumbnailInfo,
} from '../utils/filmstrip';
import {
  pullRemoteDeck,
  pushLocalDeck,
  requestAuth,
  getAuthStatus,
  slideIdFromHash,
  watchPresentation,
  unwatchPresentation,
} from '../utils/messages';
import {
  loadDeckInTab,
  onDecksChangedInTab,
  onSyncStateChangedInTab,
  persistDeckInTab,
} from '../utils/content-storage';
import type { SyncState } from '../utils/sync-state';
import {
  getEffectiveSyncError,
  isGlobalSyncError,
  isSyncReady,
} from '../utils/sync-state';
import {
  applyStorageDeckUpdate,
  cloneDeck,
  indexSlideKey,
  isDriveSlideId,
  nextUpdatedAt,
  resetDeckStatuses,
  resolveSlideRecord,
  type SlideStatus,
} from '../utils/status';

const CHIP_BATCH_SIZE = 20;
const SLIDE_COUNT_STABLE_MS = 200;

export default defineContentScript({
  matches: ['https://docs.google.com/presentation/*'],
  runAt: 'document_idle',
  world: 'ISOLATED',

  async main(ctx) {
    injectGoogleSansLink();

    const presentationId = getPresentationIdFromLocation();
    if (!presentationId) {
      return;
    }

    try {
    let deck = await loadDeckInTab(presentationId);
    let syncState: SyncState = {
      signedIn: false,
      lastSyncAt: 0,
      error: null,
    };
    let thumbnails: ThumbnailInfo[] = [];
    let chipOverlay: HTMLElement | null = null;
    let confirmedSlideCount: number | null = null;
    let pendingSlideCount: number | null = null;
    let pendingSlideCountTimer: number | null = null;
    let filmstripResizeObserver: ResizeObserver | null = null;
    let badgeElement: (HTMLElement & {
      setCounts: (counts: ReturnType<typeof getDeckCounts>) => void;
      setSyncState: (state: SyncState) => void;
      setLoading: (loading: boolean) => void;
    }) | null = null;

    const chipFromIndex = (thumbnailIndex: number) => {
      if (!chipOverlay) return null;
      const anchor = chipOverlay.querySelector<HTMLElement>(
        `[data-thumbnail-index="${thumbnailIndex}"]`,
      );
      return (anchor?.querySelector(STATUS_CHIP_SELECTOR) as
        | (HTMLElement & {
            setSlideKey: (slideKey: string) => void;
            setStatus: (status: SlideStatus) => void;
          })
        | null) ?? null;
    };

    const readSlideCount = (): number | null => {
      if (filmstripRoot) {
        return getPresentationSlideCount(filmstripRoot);
      }
      return getPresentationSlideCount();
    };

    const getAuthoritativeSlideCount = (): number | null => confirmedSlideCount;

    const observeFilmstripLayout = () => {
      if (!filmstripResizeObserver || !filmstripRoot) {
        return;
      }

      const layoutRoot = getFilmstripScroll(filmstripRoot);
      if (layoutRoot) {
        filmstripResizeObserver.observe(layoutRoot);
      }

      const host =
        layoutRoot ?? (filmstripRoot instanceof Element ? filmstripRoot : null);
      const svg = host?.querySelector('svg.punch-filmstrip-thumbnails');
      if (svg) {
        filmstripResizeObserver.observe(svg);
      }
    };

    const scheduleSlideCountConfirmation = () => {
      observeFilmstripLayout();
      const next = readSlideCount();
      if (next == null) {
        return;
      }

      if (next === confirmedSlideCount) {
        pendingSlideCount = next;
        return;
      }

      if (next === pendingSlideCount && pendingSlideCountTimer != null) {
        return;
      }

      pendingSlideCount = next;
      if (pendingSlideCountTimer != null) {
        window.clearTimeout(pendingSlideCountTimer);
      }
      pendingSlideCountTimer = window.setTimeout(() => {
        pendingSlideCountTimer = null;
        const latest = readSlideCount();
        if (latest == null) {
          return;
        }
        if (latest !== pendingSlideCount) {
          scheduleSlideCountConfirmation();
          return;
        }
        if (latest !== confirmedSlideCount) {
          confirmedSlideCount = latest;
          refreshUi();
        }
      }, SLIDE_COUNT_STABLE_MS);
    };

    const badgeSyncState = (): SyncState => ({
      ...syncState,
      error: getEffectiveSyncError(syncState, presentationId),
    });

    const updateBadgeLoading = () => {
      if (!badgeElement) {
        return;
      }

      if (!syncState.signedIn || !isSyncReady(syncState, presentationId)) {
        badgeElement.setLoading(false);
        return;
      }

      badgeElement.setLoading(confirmedSlideCount == null);
    };

    const refreshUi = () => {
      scheduleSlideCountConfirmation();
      const slideCount = getAuthoritativeSlideCount();
      const indexSlideKeys = buildIndexSlideKeyMap(deck, thumbnails);

      for (const info of thumbnails) {
        const chip = chipFromIndex(info.index);
        if (!chip) continue;

        chip.setSlideKey(info.slideKey);
        chip.setStatus(resolveSlideRecord(deck, info.slideKey, info.index).status);
      }

      if (slideCount) {
        badgeElement?.setCounts(getDeckCounts(slideCount, deck, indexSlideKeys));
      }
      badgeElement?.setSyncState(badgeSyncState());
      updateBadgeLoading();
    };

    let persistChain = Promise.resolve();
    const persistLatestDeck = async () => {
      persistChain = persistChain
        .catch(() => undefined)
        .then(() => persistDeckInTab(presentationId, cloneDeck(deck)));
      await persistChain;
    };

    const rememberSelectedSlideIds = async () => {
      if (!isSyncReady(syncState, presentationId)) return;
      const hashId = slideIdFromHash(window.location.hash);
      if (!hashId) return;

      let changed = false;

      for (const info of thumbnails) {
        const selected =
          info.element.getAttribute('aria-selected') === 'true' ||
          info.element.classList.contains('punch-filmstrip-selected') ||
          info.element.classList.contains('goog-option-selected');

        if (selected && isDriveSlideId(hashId)) {
          if (deck.idsByIndex[String(info.index)] !== hashId) {
            deck.idsByIndex[String(info.index)] = hashId;
            changed = true;
          }

          const indexKey = indexSlideKey(info.index);
          const fromIndex = deck.slides[indexKey];
          const fromSlideKey =
            info.slideKey !== hashId ? deck.slides[info.slideKey] : undefined;
          const source =
            fromIndex && fromSlideKey
              ? fromIndex.updatedAt >= fromSlideKey.updatedAt
                ? fromIndex
                : fromSlideKey
              : (fromIndex ?? fromSlideKey);

          if (source) {
            const existing = deck.slides[hashId];
            if (
              !existing ||
              source.updatedAt > existing.updatedAt ||
              (source.updatedAt === existing.updatedAt &&
                existing.status === 'none' &&
                source.status !== 'none')
            ) {
              deck.slides[hashId] = source;
              changed = true;
            }
          }

          if (fromIndex) {
            delete deck.slides[indexKey];
            changed = true;
          }
        }
      }

      if (changed) {
        await persistLatestDeck();
      }
    };

    const persistStatusChange = async (
      slideKey: string,
      status: SlideStatus,
    ) => {
      if (!isSyncReady(syncState, presentationId)) {
        return;
      }

      const info = thumbnails.find((item) => item.slideKey === slideKey);
      const thumbnailIndex = info?.index;
      const mappedId =
        thumbnailIndex != null
          ? deck.idsByIndex[String(thumbnailIndex)]
          : undefined;
      const resolvedKey =
        mappedId && isDriveSlideId(mappedId)
          ? mappedId
          : isDriveSlideId(slideKey)
            ? slideKey
            : info && isDriveSlideId(info.slideKey)
              ? info.slideKey
              : slideKey;

      const previous = resolveSlideRecord(
        deck,
        slideKey,
        thumbnailIndex,
      ).updatedAt;

      if (thumbnailIndex != null && isDriveSlideId(resolvedKey)) {
        deck.idsByIndex[String(thumbnailIndex)] = resolvedKey;
        delete deck.slides[indexSlideKey(thumbnailIndex)];
      }

      deck.slides[resolvedKey] = {
        status,
        updatedAt: nextUpdatedAt(previous),
      };
      refreshUi();
      await persistLatestDeck();
      await persistChain;
      await pushLocalDeck(presentationId);
    };

    const applyPullResult = (result: Awaited<ReturnType<typeof pullRemoteDeck>>) => {
      const signedIn = Boolean(result.signedIn ?? syncState.signedIn);
      const presentationErrors = { ...(syncState.presentationErrors ?? {}) };

      if (result.ok) {
        delete presentationErrors[presentationId];
      } else if (result.error && !isGlobalSyncError(result.error)) {
        presentationErrors[presentationId] = result.error;
      }

      syncState = {
        signedIn,
        lastSyncAt: Date.now(),
        error:
          !result.ok && result.error && isGlobalSyncError(result.error)
            ? result.error
            : result.ok
              ? null
              : syncState.error,
        presentationErrors,
      };
    };

    const activateSignedInSession = async () => {
      if (confirmedSlideCount == null) {
        badgeElement?.setLoading(true);
      }
      try {
        deck = applyStorageDeckUpdate(deck, await loadDeckInTab(presentationId));
        const pullResult = await pullRemoteDeck(presentationId);
        applyPullResult(pullResult);
        deck = applyStorageDeckUpdate(deck, await loadDeckInTab(presentationId));

        if (!isSyncReady(syncState, presentationId)) {
          clearChips();
          refreshUi();
          return;
        }

        if (filmstripRoot) {
          await syncThumbnails(filmstripRoot);
        } else {
          refreshUi();
        }
      } catch {
        refreshUi();
      }
    };

    const clearChips = () => {
      if (chipOverlay) {
        pruneChipAnchors(chipOverlay, new Set());
      }
      thumbnails = [];
      refreshUi();
    };

    defineStatusChip(persistStatusChange);
    defineDeckBadge(
      async () => {
        if (!syncState.signedIn) {
          const result = await requestAuth(true);
          syncState = {
            signedIn: Boolean(result.signedIn),
            lastSyncAt: Date.now(),
            error: result.ok ? null : result.error ?? null,
          };

          if (!result.ok || !result.signedIn) {
            clearChips();
            refreshUi();
            return;
          }
        }

        await activateSignedInSession();
      },
      async () => {
        if (!isSyncReady(syncState, presentationId)) {
          return;
        }

        deck = resetDeckStatuses(deck);
        refreshUi();
        await persistLatestDeck();
        await persistChain;
        await pushLocalDeck(presentationId);
      },
    );

    const mountBadge = () => {
      const anchor = findTitleBarAnchor();
      if (!anchor) {
        return;
      }

      if (!badgeElement) {
        badgeElement = createDeckBadge();
      }

      if (badgeElement.previousElementSibling === anchor) {
        return;
      }

      anchor.after(badgeElement);
      refreshUi();
    };

    const syncThumbnails = async (filmstrip: ParentNode) => {
      if (!isSyncReady(syncState, presentationId)) {
        clearChips();
        return;
      }

      await rememberSelectedSlideIds();
      thumbnails = buildThumbnailInfos(filmstrip, deck.idsByIndex);

      let idsChanged = false;
      for (const info of thumbnails) {
        if (!isDriveSlideId(info.slideKey)) {
          continue;
        }

        const current = deck.idsByIndex[String(info.index)];
        if (!current || !isDriveSlideId(current)) {
          deck.idsByIndex[String(info.index)] = info.slideKey;
          idsChanged = true;
        }
      }

      if (idsChanged) {
        await persistLatestDeck();
      }

      const scroll = getFilmstripScroll(filmstrip);
      if (scroll) {
        chipOverlay = ensureChipOverlay(scroll);
        pruneChipAnchors(
          chipOverlay,
          new Set(thumbnails.map((item) => item.index)),
        );
      }

      await batchDomWork(thumbnails, CHIP_BATCH_SIZE, (info) => {
        if (!chipOverlay) {
          return;
        }

        const anchor = upsertChipAnchor(
          chipOverlay,
          info.element,
          info.index,
        );

        let chip = anchor.querySelector(STATUS_CHIP_SELECTOR) as
          | (HTMLElement & {
              setSlideKey: (slideKey: string) => void;
              setStatus: (status: SlideStatus) => void;
            })
          | null;

        if (!chip) {
          chip = createStatusChip(
            info.slideKey,
            resolveSlideRecord(deck, info.slideKey, info.index).status,
          ) as HTMLElement & {
            setSlideKey: (slideKey: string) => void;
            setStatus: (status: SlideStatus) => void;
          };
          chip.dataset.slideKey = info.slideKey;
          anchor.append(chip);
        }

        chip.setSlideKey(info.slideKey);
        chip.setStatus(resolveSlideRecord(deck, info.slideKey, info.index).status);
      });

      repositionChips();
      refreshUi();
    };

    const repositionChips = () => {
      if (!chipOverlay || thumbnails.length === 0) {
        return;
      }

      repositionChipAnchors(chipOverlay, thumbnails);
    };

    let filmstripRoot: ParentNode | null = null;
    let scrollContainer: HTMLElement | null = null;
    let syncing = false;
    let resyncNeeded = false;
    const queueSync = (filmstrip: ParentNode) => {
      if (syncing) {
        resyncNeeded = true;
        return;
      }

      syncing = true;
      void (async () => {
        try {
          do {
            resyncNeeded = false;
            await syncThumbnails(filmstrip);
          } while (resyncNeeded && !ctx.isInvalid);
        } finally {
          syncing = false;
        }
      })();
    };

    const isExtensionUi = (node: Node | null): boolean => {
      if (!(node instanceof Element)) {
        return false;
      }

      return Boolean(
        node.closest(`.${CHIP_OVERLAY_CLASS}`) ||
          node.closest(DECK_BADGE_SELECTOR) ||
          node.classList.contains(CHIP_OVERLAY_CLASS),
      );
    };

    const authStatus = await getAuthStatus();
    syncState = {
      signedIn: Boolean(authStatus.signedIn),
      lastSyncAt: Date.now(),
      error: authStatus.ok ? null : authStatus.error ?? null,
    };

    mountBadge();

    const filmstrip = await waitForFilmstrip();
    if (!filmstrip || ctx.isInvalid) {
      badgeElement?.setLoading(false);
      return;
    }

    filmstripRoot = filmstrip;

    filmstripResizeObserver?.disconnect();
    if (typeof ResizeObserver !== 'undefined') {
      filmstripResizeObserver = new ResizeObserver(() => {
        scheduleSlideCountConfirmation();
      });

      if (filmstrip instanceof Element) {
        filmstripResizeObserver.observe(filmstrip);
      }

      const layoutRoot = getFilmstripScroll(filmstrip);
      if (layoutRoot && layoutRoot !== filmstrip) {
        filmstripResizeObserver.observe(layoutRoot);
      }

      const svg = (layoutRoot ?? (filmstrip instanceof Element ? filmstrip : null))
        ?.querySelector('svg.punch-filmstrip-thumbnails');
      if (svg) {
        filmstripResizeObserver.observe(svg);
      }
    }

    scrollContainer = getFilmstripScroll(filmstrip);
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', repositionChips, {
        passive: true,
      });
      scrollContainer.addEventListener(
        'scroll',
        () => {
          if (isSyncReady(syncState, presentationId)) {
            queueSync(filmstrip);
          }
        },
        { passive: true },
      );
    }

    if (isSyncReady(syncState, presentationId)) {
      await activateSignedInSession();
    } else {
      clearChips();
    }

    const selectionClassNames = [
      'punch-filmstrip-selected',
      'goog-option-selected',
      'punch-filmstrip-thumbnail-selected',
    ];

    const classMarksSelection = (value: string | null): boolean =>
      Boolean(
        value &&
          selectionClassNames.some((name) =>
            value.split(/\s+/).includes(name),
          ),
      );

    const observer = new MutationObserver((mutations) => {
      let needsSync = false;
      let needsLayout = false;

      for (const mutation of mutations) {
        if (isExtensionUi(mutation.target)) {
          continue;
        }

        if (mutation.type === 'attributes') {
          if (mutation.attributeName === 'height') {
            needsLayout = true;
            continue;
          }

          if (mutation.attributeName === 'class') {
            const next =
              mutation.target instanceof Element
                ? mutation.target.getAttribute('class')
                : null;
            if (classMarksSelection(mutation.oldValue) === classMarksSelection(next)) {
              continue;
            }
          }
        }

        if (mutation.type === 'childList') {
          const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
          if (
            nodes.length > 0 &&
            nodes.every((node) => isExtensionUi(node))
          ) {
            continue;
          }
        }

        needsSync = true;
      }

      if (needsSync) {
        queueSync(filmstrip);
        mountBadge();
        return;
      }

      if (needsLayout) {
        repositionChips();
        scheduleSlideCountConfirmation();
      }
    });

    observer.observe(filmstrip, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['aria-selected', 'aria-setsize', 'class', 'height'],
    });

    const titleObserver = new MutationObserver(() => {
      mountBadge();
    });

    const titleRoot =
      document.querySelector('#docs-chrome') ??
      document.querySelector('#docs-header-container');
    if (titleRoot) {
      titleObserver.observe(titleRoot, { childList: true, subtree: true });
    }

    const onHashChange = () => {
      void (async () => {
        await rememberSelectedSlideIds();
        queueSync(filmstrip);
      })();
    };

    window.addEventListener('hashchange', onHashChange);

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      void (async () => {
        const status = await getAuthStatus();
        if (!status.signedIn) {
          syncState = {
            signedIn: false,
            lastSyncAt: Date.now(),
            error: null,
          };
          clearChips();
          refreshUi();
          return;
        }

        const pullResult = await pullRemoteDeck(presentationId);
        applyPullResult(pullResult);
        deck = applyStorageDeckUpdate(deck, await loadDeckInTab(presentationId));

        if (!isSyncReady(syncState, presentationId)) {
          clearChips();
        } else if (filmstripRoot) {
          await syncThumbnails(filmstripRoot);
        }

        refreshUi();
      })();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    await watchPresentation(presentationId);

    const unwatchDecks = onDecksChangedInTab((decks) => {
      const nextDeck = decks[presentationId];
      if (!nextDeck) return;
      deck = applyStorageDeckUpdate(deck, nextDeck);
      refreshUi();
    });

    const unwatchSync = onSyncStateChangedInTab((state) => {
      const wasReady = isSyncReady(syncState, presentationId);
      syncState = state;

      if (isSyncReady(state) && !wasReady) {
        void activateSignedInSession();
        return;
      }

      if (!isSyncReady(state)) {
        clearChips();
      }

      refreshUi();
    });

    ctx.onInvalidated(() => {
      observer.disconnect();
      titleObserver.disconnect();
      filmstripResizeObserver?.disconnect();
      if (pendingSlideCountTimer != null) {
        window.clearTimeout(pendingSlideCountTimer);
      }
      scrollContainer?.removeEventListener('scroll', repositionChips);
      window.removeEventListener('hashchange', onHashChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void unwatchPresentation(presentationId);
      unwatchDecks();
      unwatchSync();
    });
    } catch (error) {
      console.error(
        '[progress] content script failed',
        error,
        error instanceof Error ? error.stack : '',
      );
    }
  },
});
