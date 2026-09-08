import { defineDeckBadge, createDeckBadge, DECK_BADGE_SELECTOR } from '../utils/badge';
import {
  defineStatusChip,
  createStatusChip,
  STATUS_CHIP_SELECTOR,
} from '../utils/chip';
import { getDeckCounts } from '../utils/counts';
import {
  batchDomWork,
  buildThumbnailInfos,
  findTitleBarAnchor,
  getPresentationIdFromLocation,
  waitForFilmstrip,
  type ThumbnailInfo,
} from '../utils/filmstrip';
import {
  pullRemoteDeck,
  pushLocalDeck,
  requestAuth,
  getAuthStatus,
  slideIdFromHash,
} from '../utils/messages';
import {
  getDeck,
  saveDeck,
  watchDecks,
  watchSyncState,
  type SyncState,
} from '../utils/storage';
import type { SlideStatus } from '../utils/status';
import { getSlideRecord } from '../utils/status';

const POLL_INTERVAL_MS = 2000;
const CHIP_BATCH_SIZE = 20;

export default defineContentScript({
  matches: ['https://docs.google.com/presentation/*'],
  runAt: 'document_idle',

  async main(ctx) {
    const presentationId = getPresentationIdFromLocation();
    if (!presentationId) {
      return;
    }

    let deck = await getDeck(presentationId);
    let syncState: SyncState = {
      signedIn: false,
      lastSyncAt: 0,
      error: null,
    };
    let thumbnails: ThumbnailInfo[] = [];
    let badgeElement: (HTMLElement & {
      setCounts: (counts: ReturnType<typeof getDeckCounts>) => void;
      setSyncState: (state: SyncState) => void;
    }) | null = null;

    const refreshUi = () => {
      const slideKeys = thumbnails.map((item) => item.slideKey);
      const counts = getDeckCounts(slideKeys, deck.slides);

      for (const info of thumbnails) {
        const chip = info.element.querySelector(STATUS_CHIP_SELECTOR) as
          | (HTMLElement & {
              setSlideKey: (slideKey: string) => void;
              setStatus: (status: SlideStatus) => void;
            })
          | null;

        if (!chip) continue;

        chip.setSlideKey(info.slideKey);
        chip.setStatus(getSlideRecord(deck, info.slideKey).status);
      }

      badgeElement?.setCounts(counts);
      badgeElement?.setSyncState(syncState);
    };

    const rememberSelectedSlideIds = async () => {
      const hashId = slideIdFromHash(window.location.hash);
      if (!hashId) return;

      let changed = false;

      for (const info of thumbnails) {
        const selected =
          info.element.getAttribute('aria-selected') === 'true' ||
          info.element.classList.contains('punch-filmstrip-selected') ||
          info.element.classList.contains('goog-option-selected');

        if (selected) {
          if (deck.idsByIndex[String(info.index)] !== hashId) {
            deck.idsByIndex[String(info.index)] = hashId;
            changed = true;
          }

          if (deck.slides[info.slideKey] && info.slideKey !== hashId) {
            deck.slides[hashId] = deck.slides[info.slideKey];
            delete deck.slides[info.slideKey];
            changed = true;
          }
        }
      }

      if (changed) {
        await saveDeck(presentationId, deck);
      }
    };

    const persistStatusChange = async (
      slideKey: string,
      status: SlideStatus,
    ) => {
      deck.slides[slideKey] = {
        status,
        updatedAt: Math.floor(Date.now() / 1000),
      };
      await saveDeck(presentationId, deck);
      refreshUi();

      const auth = await getAuthStatus();
      if (auth.signedIn) {
        await pushLocalDeck(presentationId);
      }
    };

    defineStatusChip(persistStatusChange);
    defineDeckBadge(async () => {
      const result = await requestAuth(true);
      syncState = {
        signedIn: Boolean(result.signedIn),
        lastSyncAt: Date.now(),
        error: result.ok ? null : result.error,
      };
      refreshUi();

      if (result.ok && result.signedIn) {
        await pullRemoteDeck(presentationId);
        deck = await getDeck(presentationId);
        refreshUi();
      }
    });

    const mountBadge = () => {
      const anchor = findTitleBarAnchor();
      if (!anchor || anchor.querySelector(DECK_BADGE_SELECTOR)) {
        return;
      }

      badgeElement = createDeckBadge();
      anchor.append(badgeElement);
      refreshUi();
    };

    const syncThumbnails = async (filmstrip: ParentNode) => {
      await rememberSelectedSlideIds();
      thumbnails = buildThumbnailInfos(filmstrip, deck.idsByIndex);

      await batchDomWork(thumbnails, CHIP_BATCH_SIZE, (info) => {
        const thumbnail = info.element;
        if (getComputedStyle(thumbnail).position === 'static') {
          thumbnail.style.position = 'relative';
        }

        let chip = thumbnail.querySelector(STATUS_CHIP_SELECTOR) as
          | (HTMLElement & {
              setSlideKey: (slideKey: string) => void;
              setStatus: (status: SlideStatus) => void;
            })
          | null;

        if (!chip) {
          chip = createStatusChip(
            info.slideKey,
            getSlideRecord(deck, info.slideKey).status,
          ) as HTMLElement & {
            setSlideKey: (slideKey: string) => void;
            setStatus: (status: SlideStatus) => void;
          };
          thumbnail.append(chip);
        }

        chip.setSlideKey(info.slideKey);
        chip.setStatus(getSlideRecord(deck, info.slideKey).status);
      });

      refreshUi();
    };

    let syncQueued = false;
    const queueSync = (filmstrip: ParentNode) => {
      if (syncQueued) return;
      syncQueued = true;
      ctx.requestAnimationFrame(async () => {
        syncQueued = false;
        await syncThumbnails(filmstrip);
      });
    };

    const filmstrip = await waitForFilmstrip();
    if (!filmstrip || ctx.isInvalid) {
      return;
    }

    mountBadge();
    await syncThumbnails(filmstrip);

    const observer = new MutationObserver(() => {
      queueSync(filmstrip);
      mountBadge();
    });

    observer.observe(filmstrip, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-selected', 'class'],
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
      void rememberSelectedSlideIds().then(() => {
        queueSync(filmstrip);
      });
    };

    window.addEventListener('hashchange', onHashChange);

    const unwatchDecks = watchDecks((decks) => {
      const nextDeck = decks[presentationId];
      if (!nextDeck) return;
      deck = nextDeck;
      refreshUi();
    });

    const unwatchSync = watchSyncState((state) => {
      syncState = state;
      refreshUi();
    });

    const authStatus = await getAuthStatus();
    syncState = {
      signedIn: Boolean(authStatus.signedIn),
      lastSyncAt: Date.now(),
      error: authStatus.ok ? null : authStatus.error,
    };
    refreshUi();

    if (authStatus.signedIn) {
      await pullRemoteDeck(presentationId);
      deck = await getDeck(presentationId);
      refreshUi();
    }

    const poll = async () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      const status = await getAuthStatus();
      if (status.signedIn) {
        await pullRemoteDeck(presentationId);
        deck = await getDeck(presentationId);
        refreshUi();
      }
    };

    ctx.setInterval(poll, POLL_INTERVAL_MS);

    ctx.onInvalidated(() => {
      observer.disconnect();
      titleObserver.disconnect();
      window.removeEventListener('hashchange', onHashChange);
      unwatchDecks();
      unwatchSync();
    });
  },
});
