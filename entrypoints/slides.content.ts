import { defineContentScript } from 'wxt/utils/define-content-script';
import { injectGoogleSansLink } from '../utils/fonts';
import { defineDeckBadge, createDeckBadge, DECK_BADGE_SELECTOR, type DeckBadgeElement } from '../utils/badge';
import {
  defineStatusChip,
  createStatusChip,
  STATUS_CHIP_SELECTOR,
  type StatusChipElement,
} from '../utils/chip';
import { getDeckCounts, resolveDeckSlideCount } from '../utils/counts';
import {
  batchDomWork,
  buildIndexSlideKeyMap,
  buildThumbnailInfos,
  ensureChipOverlay,
  findTitleBarAnchor,
  getFilmstripScroll,
  getPresentationSlideCount,
  getPresentationIdFromLocation,
  getSelectedThumbnailInfo,
  pruneChipAnchors,
  repositionChipAnchors,
  upsertChipAnchor,
  waitForFilmstrip,
  CHIP_OVERLAY_CLASS,
  type ThumbnailInfo,
} from '../utils/filmstrip';
import {
  isRepublishActiveSlideMessage,
  setActiveSlideState,
} from '../utils/active-slide';
import {
  pullRemoteDeck,
  requestAuth,
  getAuthStatus,
  loadPresetsInTab,
  slideIdFromHash,
  watchPresentation,
  unwatchPresentation,
  flushPresentation,
} from '../utils/messages';
import {
  loadDeckInTab,
  onDecksChangedInTab,
  onSyncStateChangedInTab,
  persistDeckInTab,
} from '../utils/content-storage';
import {
  cloneStatusPresetConfig,
  DEFAULT_STATUS_PRESET_CONFIG,
  validateStatusPresetConfig,
  type StatusPresetConfig,
} from '../utils/status-presets';
import type { SyncState } from '../utils/sync-state';
import {
  getEffectiveSyncError,
  isGlobalSyncError,
  isSyncReady,
  canEditPresentation,
} from '../utils/sync-state';
import {
  assignIndexSlideId,
  applyStorageDeckUpdate,
  applyReadOnlyRemoteDeck,
  cloneDeck,
  indexSlideKey,
  isDriveSlideId,
  nextUpdatedAt,
  resetDeckStatuses,
  resolveSlideRecord,
  type DeckState,
  type SlideStatus,
} from '../utils/status';
import { appendSlideLogEntry } from '../utils/slide-log';
import {
  getPresentationUsers,
  getSyncState,
  setPresentationUsers,
  statusPresetsByPresentationStorage,
  usersByPresentationStorage,
} from '../background/storage';
import {
  createEmptyUserCatalog,
  registerUserInCatalog,
  type UserCatalog,
} from '../utils/user-catalog';
import { isPresetsUpdatedMessage } from '../utils/preset-sync';

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
    const badgeRef: { current: DeckBadgeElement | null } = { current: null };
    const getBadge = () => badgeRef.current;
    const setBadge = (next: DeckBadgeElement | null) => {
      badgeRef.current = next;
    };
    let statusPresets: StatusPresetConfig = cloneStatusPresetConfig(
      DEFAULT_STATUS_PRESET_CONFIG,
    );
    let userCatalog: UserCatalog = createEmptyUserCatalog();

    const chipFromIndex = (thumbnailIndex: number) => {
      if (!chipOverlay) return null;
      const anchor = chipOverlay.querySelector<HTMLElement>(
        `[data-thumbnail-index="${thumbnailIndex}"]`,
      );
      return (anchor?.querySelector(STATUS_CHIP_SELECTOR) as
        | StatusChipElement
        | null) ?? null;
    };

    const readSlideCount = (): number | null => {
      if (filmstripRoot) {
        return getPresentationSlideCount(filmstripRoot);
      }
      return getPresentationSlideCount();
    };

    const getAuthoritativeSlideCount = (
      indexSlideKeys: Record<string, string>,
    ): number | null =>
      resolveDeckSlideCount(confirmedSlideCount, indexSlideKeys);

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

    const canEditDeck = () => canEditPresentation(syncState, presentationId);

    const applyIncomingDeck = (incoming: DeckState) => {
      deck = canEditDeck()
        ? applyStorageDeckUpdate(deck, incoming)
        : applyReadOnlyRemoteDeck(deck, incoming);
    };

    const updateBadgeLoading = (slideCount: number | null) => {
      const badgeElement = getBadge();
      if (!badgeElement) {
        return;
      }

      if (!syncState.signedIn || !isSyncReady(syncState, presentationId)) {
        badgeElement.setLoading(false);
        return;
      }

      badgeElement.setLoading(slideCount == null);
    };

    const publishActiveSlide = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      const selected = getSelectedThumbnailInfo(thumbnails);
      void setActiveSlideState(
        selected
          ? {
              presentationId,
              slideKey: selected.slideKey,
              index: selected.index,
            }
          : null,
      );
    };

    const refreshUi = () => {
      scheduleSlideCountConfirmation();
      const indexSlideKeys = buildIndexSlideKeyMap(deck, thumbnails);
      const slideCount = getAuthoritativeSlideCount(indexSlideKeys);

      publishActiveSlide();

      for (const info of thumbnails) {
        const chip = chipFromIndex(info.index);
        if (!chip) continue;

        chip.setSlideKey(info.slideKey);
        chip.setStatus(resolveSlideRecord(deck, info.slideKey, info.index).status);
        chip.setEditable(canEditDeck());
        chip.setPresets(statusPresets);
      }

      if (slideCount) {
        getBadge()?.setCounts(
          getDeckCounts(slideCount, deck, indexSlideKeys, statusPresets),
        );
      }
      getBadge()?.setPresets(statusPresets);
      getBadge()?.setSyncState(badgeSyncState());
      getBadge()?.setCanEdit(canEditDeck());
      updateBadgeLoading(slideCount);
    };

    const applyPresetConfig = (nextPresets: StatusPresetConfig) => {
      statusPresets = validateStatusPresetConfig(nextPresets);
      refreshUi();
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
      if (!hashId || !isDriveSlideId(hashId)) return;

      let changed = false;

      for (const info of thumbnails) {
        if (info.slideKey !== hashId) {
          continue;
        }

        if (assignIndexSlideId(deck.idsByIndex, info.index, hashId)) {
          changed = true;
        }

        const indexKey = indexSlideKey(info.index);
        const fromIndex = deck.slides[indexKey];
        if (fromIndex) {
          const existing = deck.slides[hashId];
          if (
            !existing ||
            fromIndex.updatedAt > existing.updatedAt ||
            (fromIndex.updatedAt === existing.updatedAt &&
              existing.status === 'none' &&
              fromIndex.status !== 'none')
          ) {
            deck.slides[hashId] = fromIndex;
            changed = true;
          }
          delete deck.slides[indexKey];
          changed = true;
        }
      }

      if (changed) {
        await persistLatestDeck();
      }
    };

    const refreshLocalSyncState = async (): Promise<void> => {
      syncState = await getSyncState();
    };

    const resolveEditorUserIndex = async (): Promise<number | undefined> => {
      if (!syncState.signedInEmail) {
        await refreshLocalSyncState();
      }

      const email = syncState.signedInEmail;
      if (!email) {
        return undefined;
      }

      const result = registerUserInCatalog(userCatalog, {
        email,
        picture: syncState.signedInPicture ?? undefined,
      });
      if (result.changed) {
        userCatalog = result.catalog;
        await setPresentationUsers(presentationId, userCatalog);
      }

      return result.userIndex;
    };

    const persistStatusChange = async (
      slideKey: string,
      status: SlideStatus,
    ) => {
      await refreshLocalSyncState();

      if (!isSyncReady(syncState, presentationId) || !canEditDeck()) {
        return;
      }

      const info = thumbnails.find((item) => item.slideKey === slideKey);
      const thumbnailIndex = info?.index;
      const mappedId =
        thumbnailIndex != null
          ? deck.idsByIndex[String(thumbnailIndex)]
          : undefined;
      const resolvedKey = isDriveSlideId(slideKey)
        ? slideKey
        : info && isDriveSlideId(info.slideKey)
          ? info.slideKey
          : mappedId && isDriveSlideId(mappedId)
            ? mappedId
            : slideKey;

      const previous = resolveSlideRecord(
        deck,
        slideKey,
        thumbnailIndex,
      );

      if (previous.status === status) {
        return;
      }

      if (thumbnailIndex != null && isDriveSlideId(resolvedKey)) {
        assignIndexSlideId(deck.idsByIndex, thumbnailIndex, resolvedKey);
        delete deck.slides[indexSlideKey(thumbnailIndex)];
      }

      const updatedBy = await resolveEditorUserIndex();
      deck.slides[resolvedKey] = appendSlideLogEntry(previous, {
        status,
        updatedAt: nextUpdatedAt(previous.updatedAt),
        updatedBy,
      });
      refreshUi();
      await persistLatestDeck();
    };

    const applyPullResult = async (
      result: Awaited<ReturnType<typeof pullRemoteDeck>>,
    ) => {
      const signedIn = Boolean(result.signedIn ?? syncState.signedIn);
      const presentationErrors = { ...(syncState.presentationErrors ?? {}) };
      const presentationCanEdit = { ...(syncState.presentationCanEdit ?? {}) };

      if (result.ok) {
        delete presentationErrors[presentationId];
        if (typeof result.canEdit === 'boolean') {
          presentationCanEdit[presentationId] = result.canEdit;
        }
      } else if (result.error && !isGlobalSyncError(result.error)) {
        presentationErrors[presentationId] = result.error;
      }

      syncState = {
        ...(await getSyncState()),
        signedIn,
        lastSyncAt: Date.now(),
        error:
          !result.ok && result.error && isGlobalSyncError(result.error)
            ? result.error
            : result.ok
              ? null
              : syncState.error,
        presentationErrors,
        presentationCanEdit,
      };
    };

    const activateSignedInSession = async () => {
      if (getAuthoritativeSlideCount(deck.idsByIndex) == null) {
        getBadge()?.setLoading(true);
      }
      try {
        applyIncomingDeck(await loadDeckInTab(presentationId));
        const pullResult = await pullRemoteDeck(presentationId);
        await applyPullResult(pullResult);
        applyIncomingDeck(await loadDeckInTab(presentationId));
        const sessionPresets = await loadPresetsInTab(presentationId);
        if (sessionPresets) {
          applyPresetConfig(sessionPresets);
        }
        userCatalog = await getPresentationUsers(presentationId);

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
          await refreshLocalSyncState();
          if (!result.ok) {
            syncState = {
              ...syncState,
              signedIn: false,
              error: result.error ?? null,
            };
          }

          if (!result.ok || !result.signedIn) {
            clearChips();
            refreshUi();
            return;
          }
        }

        await activateSignedInSession();
      },
      async () => {
        if (!syncState.signedIn || !canEditDeck()) {
          return;
        }

        deck = resetDeckStatuses(deck, await resolveEditorUserIndex());
        refreshUi();
        await persistLatestDeck();
      },
    );

    const mountBadge = () => {
      const anchor = findTitleBarAnchor();
      if (!anchor) {
        return;
      }

      if (!getBadge()) {
        setBadge(createDeckBadge());
      }

      const badgeElement = getBadge();
      if (!badgeElement) {
        return;
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

        if (assignIndexSlideId(deck.idsByIndex, info.index, info.slideKey)) {
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

        let chip = anchor.querySelector(
          STATUS_CHIP_SELECTOR,
        ) as StatusChipElement | null;

        if (!chip) {
          chip = createStatusChip(
            info.slideKey,
            resolveSlideRecord(deck, info.slideKey, info.index).status,
            statusPresets,
          );
          chip.dataset.slideKey = info.slideKey;
          anchor.append(chip);
        }

        chip.setSlideKey(info.slideKey);
        chip.setStatus(resolveSlideRecord(deck, info.slideKey, info.index).status);
        chip.setEditable(canEditDeck());
        chip.setPresets(statusPresets);
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
    await refreshLocalSyncState();
    if (!authStatus.signedIn) {
      syncState = {
        ...syncState,
        signedIn: false,
        error: authStatus.ok ? syncState.error : authStatus.error ?? syncState.error,
      };
    }

    const initialPresets = await loadPresetsInTab(presentationId);
    if (initialPresets) {
      applyPresetConfig(initialPresets);
    }
    userCatalog = await getPresentationUsers(presentationId);

    mountBadge();

    const filmstrip = await waitForFilmstrip();
    if (!filmstrip) {
      getBadge()?.setLoading(false);
      return;
    }
    if (ctx.isInvalid) {
      return;
    }

    filmstripRoot = filmstrip;

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
      attributeFilter: [
        'aria-selected',
        'aria-setsize',
        'class',
        'height',
        'data-slide-page-id',
      ],
    });

    const titleObserver = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => {
        if (isExtensionUi(mutation.target)) {
          return false;
        }
        if (mutation.type === 'childList') {
          const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
          if (
            nodes.length > 0 &&
            nodes.every((node) => isExtensionUi(node))
          ) {
            return false;
          }
        }
        return true;
      });
      if (relevant) {
        mountBadge();
      }
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
        await applyPullResult(pullResult);
        applyIncomingDeck(await loadDeckInTab(presentationId));
        const visiblePresets = await loadPresetsInTab(presentationId);
        if (visiblePresets) {
          applyPresetConfig(visiblePresets);
        }
        userCatalog = await getPresentationUsers(presentationId);

        if (!isSyncReady(syncState, presentationId)) {
          clearChips();
        } else if (filmstripRoot) {
          await syncThumbnails(filmstripRoot);
        }

        refreshUi();
      })();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    const onPageHide = () => {
      void persistChain.then(() => flushPresentation(presentationId));
    };
    window.addEventListener('pagehide', onPageHide);

    await watchPresentation(presentationId);

    const unwatchDecks = onDecksChangedInTab((decks) => {
      const nextDeck = decks[presentationId];
      if (!nextDeck) return;
      applyIncomingDeck(nextDeck);
      refreshUi();
    });

    const unwatchPresets = statusPresetsByPresentationStorage.watch((presets) => {
      const nextPresets = presets[presentationId];
      if (!nextPresets) {
        return;
      }
      applyPresetConfig(nextPresets);
    });

    const unwatchUsers = usersByPresentationStorage.watch((users) => {
      const nextUsers = users[presentationId];
      if (!nextUsers) {
        return;
      }
      userCatalog = nextUsers;
    });

    const onRuntimeMessage = (message: unknown) => {
      if (isRepublishActiveSlideMessage(message)) {
        publishActiveSlide();
        return;
      }

      if (
        !isPresetsUpdatedMessage(message) ||
        message.presentationId !== presentationId
      ) {
        return;
      }

      applyPresetConfig(message.presets);
    };

    browser.runtime.onMessage.addListener(onRuntimeMessage);

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
      window.removeEventListener('pagehide', onPageHide);
      void unwatchPresentation(presentationId);
      unwatchDecks();
      unwatchPresets();
      unwatchUsers();
      browser.runtime.onMessage.removeListener(onRuntimeMessage);
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
