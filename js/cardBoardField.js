'use strict';
/* global queueMicrotask, GAME_PHASES, LOG_TYPES, MutationObserver, CardTableCamera, CardTableLayout, CardBoardTransfers, CardBoardActivationTags, CardBoardFeedback, UiCardBoard, UiTurnEvents, UiTurnReceipt, UiBuildMenu, UiPlayerDisplay, UiDiceDisplay, PlazaField, DesignTheme, CARDS, Player */

const CARDBOARD_ROLL_FEEDBACK_MS = 1400;

// Presentation state only: no game actions, storage, random calls or rule updates.
const CardBoardField = (() => {
    function createScrollMemory() {
        const positions = new Map();
        const selectors = ['.cardboard-cards', '.cardboard-landmarks', '.compact-market-facilities', '.cardboard-roster'];
        function capture(key, element) {
            if (!element) return;
            positions.set(key, ['', ...selectors].map(selector => {
                const target = selector ? element.querySelector(selector) : element;
                return { selector, top: target?.scrollTop || 0, left: target?.scrollLeft || 0 };
            }));
        }
        function restore(key, element) {
            const stored = positions.get(key);
            if (!stored || !element) return;
            for (const position of stored) {
                const target = position.selector ? element.querySelector(position.selector) : element;
                if (target) { target.scrollTop = position.top; target.scrollLeft = position.left; }
            }
            positions.delete(key);
        }
        return Object.freeze({ capture, restore, clear: () => positions.clear() });
    }
    const scrollMemory = createScrollMemory();
    const renderedHtml = new WeakMap();
    let facts = null;
    let initialized = false;
    let tableCamera = null;
    let tableLayout = null;
    let ownerLabelFrame = null;
    let ownerLabelsInspecting = false;
    let mounted = false;
    let actionOrigin = null;
    let statusOrigin = null;
    let connectivityOrigin = null;
    let toolbarOrigin = null;
    let guideOrigin = null;
    let selectedIndex = null;
    let focusTurnIndex = null;
    let session = null;
    let receiptSession = null;
    let resultAnnouncement = '';
    let buildAnnouncement = '';
    let revealDiceCandidateAfterMarketUpdate = false;
    let feedbackTimer = null;
    let transferFrame = null;
    let transferSequence = 0;
    let buildCueTimer = null;
    let buildNoticeTimer = null;
    let buildNoticeContext = null;
    let purchaseOrigin = null;
    let buildFlight = null;
    /** @type {{ left: number, top: number } | null} */
    let buildFlightScroll = null;
    let buildFlightAnimation = null;
    let buildFlightGeneration = 0;
    let buildCueCard = null;
    let buildCueListener = null;
    const landmarkCues = new Map();
    const additionalActivationCues = new Map();
    let pendingBuildCues = [];
    let previousChoice = null;
    let previousBuiltLandmarks = null;
    let previousBuildLog = null;
    let townIndex = null;
    let townLauncher = null;
    let restoreTownFocus = true;
    let marketHome = null;
    let marketLauncher = null;
    let marketLauncherSelector = null;
    let restoreMarketFocus = true;
    let suspendedMarketDetail = null;
    let ignoredMarketCloseEvents = 0;
    let choiceInitialized = false;
    let themeFocus = null;
    const transfers = typeof CardBoardTransfers !== 'undefined' ? CardBoardTransfers.create() : null;
    let activationTags = null;
    const feedback = typeof CardBoardFeedback !== 'undefined' ? CardBoardFeedback.create() : null;
    const disclosureSelector = '#cardboardEventDetails, .compact-market-filter-disclosure, .compact-market-goal-disclosure, .plaza-receipt-details, .plaza-guide-disclosure, .game-action-toolbar > details';
    function closeDisclosures(except = null) {
        for (const root of [node('cardboardBoard'), node('cardboardMarketDialog')]) {
            root?.querySelectorAll(disclosureSelector).forEach(element => {
                const details = /** @type {HTMLDetailsElement} */ (element);
                if (details !== except && !details.contains?.(except)) details.open = false;
            });
        }
    }
    /** @param {string} id @returns {HTMLElement | null} */
    function node(id) { return document.getElementById(id); }
    const enabled = () => document.documentElement.dataset.design === 'cardboard';

    function arrangeCompactStatus() {
        const status = node('status');
        const actions = node('cardboardActionSlot')?.querySelector('.game-action-panel');
        const compact = mounted && !status?.classList.contains('game-winner');
        const connectivity = node('gameConnectivityPanel');
        if (compact && connectivity && actions) {
            if (!connectivityOrigin) {
                connectivityOrigin = document.createComment('cardboard-connectivity-origin');
                connectivity.parentNode.insertBefore(connectivityOrigin, connectivity);
            }
            if (connectivity.parentNode !== actions) actions.appendChild(connectivity);
            connectivity.classList.add('cardboard-docked-connectivity');
        } else if (connectivityOrigin) {
            if (connectivity) connectivityOrigin.parentNode?.insertBefore(connectivity, connectivityOrigin);
            connectivityOrigin.remove();
            connectivityOrigin = null;
            connectivity?.classList.remove('cardboard-docked-connectivity');
        }
        if (compact && status && actions) {
            if (!statusOrigin) {
                statusOrigin = document.createComment('cardboard-status-origin');
                status.parentNode.insertBefore(statusOrigin, status);
            }
            if (status.parentNode !== actions) actions.prepend(status);
            status.classList.add('cardboard-docked-status');
        } else if (statusOrigin) {
            statusOrigin.parentNode?.insertBefore(status, statusOrigin);
            statusOrigin.remove();
            statusOrigin = null;
            status?.classList.remove('cardboard-docked-status');
        }
    }

    function syncOwnerLabels() {
        if (ownerLabelFrame !== null) window.cancelAnimationFrame(ownerLabelFrame);
        ownerLabelFrame = null;
        // The action row changes height with phase, orientation and long names.
        const actions = node('cardboardActionSlot');
        const board = node('gameScreen');
        if (mounted && actions && board) {
            const actionBounds = actions.getBoundingClientRect();
            if (actionBounds.height > 0) {
                board.style.setProperty('--cardboard-receipt-bottom', `${Math.max(8, window.innerHeight - actionBounds.top + 8)}px`);
            }
        }
        updateOwnerLabels();
    }

    function scheduleOwnerLabels() {
        if (ownerLabelFrame !== null) return;
        ownerLabelFrame = window.requestAnimationFrame(syncOwnerLabels);
    }

    function updateOwnerLabels() {
        const viewport = node('cardboardTableViewport');
        const layer = node('cardboardOwnerLabels');
        if (!viewport || !layer) return;
        layer.replaceChildren();
        const panels = Array.from(node('cardboardSeats')?.querySelectorAll('.cardboard-player') || []);
        panels.forEach(panel => panel.classList.remove('cardboard-owner-labeled'));
        if (!enabled() || !mounted || ownerLabelsInspecting || panels.length > 4) return;
        const bounds = viewport.getBoundingClientRect();
        const innerLeft = bounds.left + viewport.clientLeft;
        const innerTop = bounds.top + viewport.clientTop;
        const innerRight = innerLeft + viewport.clientWidth;
        const innerBottom = innerTop + viewport.clientHeight;
        layer.style.width = `${viewport.clientWidth}px`;
        layer.style.height = `${viewport.clientHeight}px`;
        layer.style.transform = `translate(${viewport.scrollLeft}px, ${viewport.scrollTop}px)`;
        const obstacles = Array.from(viewport.querySelectorAll('.cardboard-card, .cardboard-landmark, #cardboardCenter'))
            .map(element => element.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0);
        const cardGroups = panels.map(panel => ({ panel, rects: Array.from(panel.querySelectorAll('.cardboard-card'))
            .map(card => card.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0) }));
        const placed = [];
        const shallow = bounds.height < 340;
        const width = shallow || bounds.width < 500 ? 96 : 124;
        const height = shallow ? 18 : 22;
        const gap = shallow ? 2 : 4;
        const clearance = shallow ? 1 : 3;
        layer.style.setProperty('--owner-label-height', `${height}px`);
        layer.style.setProperty('--owner-label-font', shallow ? '11px' : '12px');
        layer.style.setProperty('--owner-label-padding', shallow ? '0px' : '2px');
        const intersects = (left, top, rect) => left < rect.right + clearance && left + width > rect.left - clearance &&
            top < rect.bottom + clearance && top + height > rect.top - clearance;
        for (const panel of panels) {
            const heading = panel.querySelector('.cardboard-player-heading');
            if (!heading) continue;
            const index = Number(/** @type {HTMLElement} */ (panel).dataset.playerIndex);
            const player = facts?.game?.players?.[index];
            if (!player) continue;
            const anchor = heading.getBoundingClientRect();
            const region = panel.getBoundingClientRect();
            /** @type {[number, number][]} */
            const candidates = [
                [anchor.left + (anchor.width - width) / 2, anchor.top + (anchor.height - height) / 2],
                [region.left, region.top - height - 4],
                [region.right - width, region.top - height - 4],
                [region.left, region.bottom + 4],
                [region.right - width, region.bottom + 4],
                [region.left - width - 4, region.top],
                [region.right + 4, region.top],
            ];
            for (const fraction of [0.15, 0.35, 0.5, 0.65, 0.85]) {
                const x = region.left + region.width * fraction - width / 2;
                const y = region.top + region.height * fraction - height / 2;
                candidates.push(
                    [anchor.left + (anchor.width - width) * fraction, anchor.top + (anchor.height - height) * fraction],
                    [x, region.top - height - gap], [x, region.bottom + gap],
                    [region.left - width - gap, y], [region.right + gap, y],
                );
            }
            const ownCards = cardGroups.find(group => group.panel === panel)?.rects || [];
            if (!ownCards.length) continue;
            // Panel boxes include empty cells in ragged collections. Anchor to
            // actual facility edges, so a label cannot float in that empty rim.
            for (const card of ownCards) {
                candidates.push([card.left, card.top - height - gap], [card.right - width, card.top - height - gap],
                    [card.left, card.bottom + gap], [card.right - width, card.bottom + gap],
                    [card.left - width - gap, card.top], [card.right + gap, card.top]);
            }
            const distance = (left, top, rect) => Math.hypot(
                Math.max(rect.left - left - width, left - rect.right, 0),
                Math.max(rect.top - top - height, top - rect.bottom, 0));
            const nearest = (left, top, cards) => cards.length
                ? Math.min(...cards.map(rect => distance(left, top, rect))) : Infinity;
            const otherCards = cardGroups.filter(group => group.panel !== panel).flatMap(group => group.rects);
            const centerX = ownCards.length ? ownCards.reduce((sum, rect) => sum + rect.left + rect.width / 2, 0) / ownCards.length : anchor.left;
            const centerY = ownCards.length ? ownCards.reduce((sum, rect) => sum + rect.top + rect.height / 2, 0) / ownCards.length : anchor.top;
            const available = candidates.filter(([left, top]) => left >= innerLeft + gap && left + width <= innerRight - gap &&
                top >= innerTop + gap && top + height <= innerBottom - gap &&
                !obstacles.some(rect => intersects(left, top, rect)) && !placed.some(rect => intersects(left, top, rect)) &&
                nearest(left, top, ownCards) <= nearest(left, top, otherCards) + 0.5);
            const score = ([left, top]) => nearest(left, top, ownCards) +
                Math.hypot(left + width / 2 - centerX, top + height / 2 - centerY) * 0.002;
            const ranked = available.map(position => ({ position, score: score(position) }));
            ranked.sort((a, b) => a.score - b.score);
            const position = ranked[0]?.position;
            if (!position) continue;
            const [left, top] = position;
            const label = document.createElement('span');
            label.className = 'cardboard-owner-label';
            label.dataset.playerIndex = String(index);
            label.textContent = `席${index + 1} · ${player.name}`;
            label.title = label.textContent;
            label.style.left = `${left - bounds.left - viewport.clientLeft}px`;
            label.style.top = `${top - bounds.top - viewport.clientTop}px`;
            label.style.width = `${width}px`;
            label.style.setProperty('--cardboard-seat-accent', window.getComputedStyle(panel).getPropertyValue('--cardboard-seat-accent'));
            layer.appendChild(label);
            panel.classList.add('cardboard-owner-labeled');
            placed.push({ left, top, right: left + width, bottom: top + height });
        }
    }

    function ensureTable() {
        const board = node('cardboardBoard');
        const seats = node('cardboardSeats');
        if (!board || !seats) return;
        let viewport = node('cardboardTableViewport');
        if (!viewport) {
            viewport = document.createElement('div');
            viewport.id = 'cardboardTableViewport';
            viewport.setAttribute('role', 'region');
            viewport.setAttribute('aria-label', '全員の施設カードと中央市場。1本指で移動、2本指で拡大縮小、ボタンでも操作できます');
            viewport.tabIndex = 0;
            const canvas = document.createElement('div');
            canvas.id = 'cardboardTableCanvas';
            seats.parentNode.insertBefore(viewport, seats);
            viewport.appendChild(canvas);
            canvas.appendChild(seats);
        }
        if (!node('cardboardOwnerLabels')) {
            const labels = document.createElement('div');
            labels.id = 'cardboardOwnerLabels';
            labels.setAttribute('aria-hidden', 'true');
            viewport.appendChild(labels);
            viewport.addEventListener('scroll', scheduleOwnerLabels, { passive: true });
        }
        const center = node('cardboardCenter');
        if (center && center.parentNode !== seats) seats.appendChild(center);
        const actions = node('cardboardActionSlot');
        if (actions && actions.parentNode !== board) board.appendChild(actions);
        if (!node('cardboardCameraTools')) {
            const tools = document.createElement('nav');
            tools.id = 'cardboardCameraTools';
            tools.setAttribute('aria-label', 'カード卓の移動と拡大縮小');
            tools.innerHTML = '<button type="button" data-cardboard-camera="overview">全体</button><button type="button" data-cardboard-camera="back" aria-label="カード確認前の表示へ戻る">戻る</button><button type="button" data-cardboard-camera="market">市場</button><button type="button" data-cardboard-camera="self">自分</button><button type="button" data-cardboard-camera="readable">読みやすく</button><button type="button" data-cardboard-camera="out" aria-label="カード卓を縮小">−</button><button type="button" data-cardboard-camera="in" aria-label="カード卓を拡大">＋</button>';
            board.appendChild(tools);
        }
        if (!node('cardboardViewHint')) {
            const hint = document.createElement('p');
            hint.id = 'cardboardViewHint';
            const label = document.createElement('strong');
            label.textContent = 'カード卓';
            label.setAttribute('aria-live', 'polite');
            label.setAttribute('aria-atomic', 'true');
            const explanation = document.createElement('span');
            explanation.textContent = '名前で正面へ · 全体で俯瞰';
            hint.appendChild(label);
            hint.appendChild(explanation);
            hint.title = `${label.textContent} · ${explanation.textContent}`;
            board.appendChild(hint);
        }
        if (!node('cardboardCameraSettings')) {
            const settings = document.createElement('div');
            settings.id = 'cardboardCameraSettings';
            settings.setAttribute('role', 'group');
            settings.setAttribute('aria-label', 'カード卓の倍率');
            for (const command of ['readable', 'out', 'in']) {
                const button = node('cardboardCameraTools').querySelector(`[data-cardboard-camera="${command}"]`);
                if (button) settings.appendChild(button);
            }
            node('cardboardMoreMenuContent').appendChild(settings);
        }
        if (!node('cardboardCurrentResult')) {
            const result = document.createElement('p');
            result.id = 'cardboardCurrentResult';
            result.setAttribute('aria-label', '現在の手番の結果');
            result.hidden = true;
            board.appendChild(result);
        }
        const receipt = node('cardboardDiceReceipt');
        if (receipt && !node('cardboardEventDetails')) {
            const details = document.createElement('details');
            details.id = 'cardboardEventDetails';
            const summary = document.createElement('summary');
            summary.textContent = '出目・収支';
            details.appendChild(summary);
            details.appendChild(receipt);
            node('cardboardCameraTools').appendChild(details);
        }
        if (!tableLayout && typeof CardTableLayout !== 'undefined') {
            tableLayout = CardTableLayout.create({ viewport, world: seats, market: center,
                onLayout: () => { tableCamera?.refresh(); scheduleOwnerLabels(); } });
        }
        if (!tableCamera && typeof CardTableCamera !== 'undefined') {
            tableCamera = CardTableCamera.create({ viewport, canvas: node('cardboardTableCanvas'), world: seats,
                onPaint: syncOwnerLabels,
                onReadingChange: (index, minScale) => tableLayout?.setReadingSeat(index, minScale),
                onContextChange: ({ label, pan, playerIndex, canReturn }) => {
                    ownerLabelsInspecting = playerIndex !== null;
                    scheduleOwnerLabels();
                    const back = /** @type {HTMLButtonElement | null} */ (node('cardboardCameraTools')?.querySelector('[data-cardboard-camera="back"]'));
                    if (back) back.disabled = !canReturn;
                    const hint = node('cardboardViewHint');
                    if (!hint) return;
                    const heading = hint.querySelector('strong');
                    const explanation = hint.querySelector('span');
                    const direction = pan === 'both' ? '上下左右に移動' : pan === 'x' ? '左右に移動'
                        : pan === 'y' ? '上下に移動' : '施設カードを確認';
                    const text = playerIndex === null ? '名前で正面へ · 全体で俯瞰'
                        : `${direction} · 戻るで元の卓`;
                    if (heading && heading.textContent !== label) heading.textContent = label;
                    if (explanation && explanation.textContent !== text) explanation.textContent = text;
                    const title = `${label} · ${text}`;
                    if (hint.title !== title) hint.title = title;
                },
                onViewChange: () => {
                    scheduleOwnerLabels();
                    if (buildFlight) clearBuildFlight();
                    activationTags?.clear();
                    // Clear effects anchored to the old geometry, but preserve
                    // a fresh result queued after layout. Its frame reads the
                    // new bounds and still checks session/turn/replay guards.
                    transfers?.clear();
                } });
        }
    }

    function updateRosterOverflow() {
        const container = node('cardboardRoster');
        const roster = container?.querySelector('.cardboard-roster');
        if (!container || !roster) return;
        container.dataset.rosterOverflow = String(roster.scrollWidth > roster.clientWidth + 1);
    }

    function updatePlayerOverflow() {
        node('cardboardSeats')?.querySelectorAll('.cardboard-player').forEach(element => {
            const panel = /** @type {HTMLElement} */ (element);
            const cards = panel.querySelector('.cardboard-cards');
            const cardHint = /** @type {HTMLElement | null} */ (panel.querySelector('.cardboard-facility-scroll-hint'));
            if (cards && cardHint) {
                const overflow = window.getComputedStyle?.(cards);
                const horizontal = !['hidden', 'clip'].includes(overflow?.overflowX || 'auto') && cards.scrollWidth > cards.clientWidth + 1;
                const vertical = !['hidden', 'clip'].includes(overflow?.overflowY || 'auto') && cards.scrollHeight > cards.clientHeight + 1;
                cardHint.hidden = !horizontal && !vertical;
                cardHint.dataset.direction = horizontal && vertical ? 'both' : vertical ? 'vertical' : 'horizontal';
                cardHint.textContent = horizontal && vertical ? '横・縦にスクロール ↔ ↕' : vertical ? '縦にスクロール ↓' : '横に送る →';
            }
            const landmarks = panel.querySelector('.cardboard-landmarks');
            const landmarkHint = /** @type {HTMLElement | null} */ (panel.querySelector('.cardboard-landmark-scroll-hint'));
            if (landmarks && landmarkHint) {
                landmarkHint.hidden = landmarks.scrollWidth <= landmarks.clientWidth + 1;
            }
            const overflows = panel.scrollHeight > panel.clientHeight + 1;
            panel.dataset.verticalOverflow = String(overflows);
            if (overflows) {
                if (cardHint?.hidden) {
                    cardHint.hidden = false;
                    cardHint.dataset.direction = 'panel';
                    cardHint.textContent = '街を縦にスクロール ↓';
                }
                const heading = panel.querySelector('.cardboard-player-heading-name')?.textContent?.trim() || '選択中の街';
                panel.tabIndex = 0;
                panel.setAttribute('role', 'region');
                panel.setAttribute('aria-label', `${heading}。上下にスクロールできます`);
            } else if (document.activeElement !== panel) {
                panel.removeAttribute('tabindex');
                panel.removeAttribute('role');
                panel.removeAttribute('aria-label');
            } else {
                panel.setAttribute('aria-label', `${panel.querySelector('.cardboard-player-heading-name')?.textContent?.trim() || '選択中の街'}の詳細`);
            }
        });
        updateMarketOverflow();
    }

    function updateMarketOverflow() {
        const market = node('cardboardMarket');
        const shelf = market?.querySelector('.compact-market-facilities');
        const heading = /** @type {HTMLElement | null} */ (market?.querySelector('.compact-market-header h2'));
        if (!shelf || !heading) return;
        const overflowing = shelf.scrollHeight > shelf.clientHeight + 1;
        const hint = !overflowing ? '' : shelf.scrollTop + shelf.clientHeight < shelf.scrollHeight - 2 ? '↓ 下に施設' : '↑ 上に施設';
        if (heading.dataset.scrollHint !== hint) heading.dataset.scrollHint = hint;
        const label = overflowing ? '中央市場の施設一覧。上下にスクロールできます' : '中央市場の施設一覧';
        if (shelf.getAttribute('aria-label') !== label) shelf.setAttribute('aria-label', label);
    }

    function turnEventsFor(game, display) {
        const log = Array.isArray(game.log) ? game.log : [];
        return UiTurnEvents.project(log, {
            players: game.players, turnPlayerIndex: game.currentPlayerIndex, display,
            cardNames: CARDS.map(card => card.name), landmarkNames: Player.landmarkNames(), maxActivations: 1000,
        });
    }

    function collectNewFacilityBuilds(game, replaying, sessionToken) {
        const log = Array.isArray(game.log) ? game.log : [];
        const previous = previousBuildLog;
        previousBuildLog = {
            session: sessionToken, turn: game.turnCount, actor: game.currentPlayerIndex,
            replaying: replaying === true, length: log.length,
            tail: log.slice(-4).map(entry => `${entry?.type || ''}\u0000${entry?.message || ''}`),
        };
        const prefixTailStart = previous ? previous.length - previous.tail.length : 0;
        const prefixUnchanged = previous && previous.length <= log.length && previous.tail.every((value, index) => {
            const entry = log[prefixTailStart + index];
            return value === `${entry?.type || ''}\u0000${entry?.message || ''}`;
        });
        if (!previous || previous.session !== sessionToken || previous.replaying || replaying ||
                previous.turn !== game.turnCount || previous.actor !== game.currentPlayerIndex ||
                !prefixUnchanged) return [];
        return log.slice(previous.length).map(entry => {
            const match = typeof entry?.message === 'string' ? entry.message.match(/^🏗️ (.+)を建設！$/u) : null;
            return match ? { playerIndex: game.currentPlayerIndex, name: match[1] } : null;
        }).filter(Boolean);
    }

    function reducedMotionEnabled() {
        return document.body.classList.contains('accessibility-reduced-motion') ||
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    }

    function revealInScrollport(target, scrollport) {
        if (!target || !scrollport) return;
        // Scroll offsets use layout pixels. Screen rectangles are scaled and
        // rotated by the table camera, so their deltas cannot be added here.
        const origin = element => {
            let left = 0, top = 0;
            for (let current = element; current; current = current.offsetParent) {
                left += current.offsetLeft;
                top += current.offsetTop;
            }
            return { left, top };
        };
        const start = origin(target), container = origin(scrollport);
        const left = start.left - container.left - scrollport.clientLeft;
        const top = start.top - container.top - scrollport.clientTop;
        if (left < scrollport.scrollLeft || left + target.offsetWidth > scrollport.scrollLeft + scrollport.clientWidth) {
            scrollport.scrollLeft = left;
        }
        if (top < scrollport.scrollTop) scrollport.scrollTop = top;
        else if (top + target.offsetHeight > scrollport.scrollTop + scrollport.clientHeight) {
            scrollport.scrollTop = top + target.offsetHeight - scrollport.clientHeight;
        }
    }

    function clearBuildFlight() {
        buildFlightGeneration++;
        buildFlightAnimation?.cancel();
        buildFlightAnimation = null;
        buildFlight?.remove();
        buildFlight = null;
        buildFlightScroll = null;
    }

    function visibleMarketOrigin(name) {
        const market = node('cardboardMarket');
        const card = Array.from(market?.querySelectorAll('.compact-market-item') || []).find(element =>
            element.querySelector('[data-action="buildCard"]')?.getAttribute('data-card-name') === name);
        if (!card) return null;
        const bounds = card.getBoundingClientRect();
        const screen = globalThis.visualViewport;
        const clip = { left: screen?.offsetLeft || 0, top: screen?.offsetTop || 0,
            right: (screen?.offsetLeft || 0) + (screen?.width || globalThis.innerWidth),
            bottom: (screen?.offsetTop || 0) + (screen?.height || globalThis.innerHeight) };
        const shelf = card.closest('.compact-market-facilities')?.getBoundingClientRect();
        if (shelf) {
            clip.left = Math.max(clip.left, shelf.left); clip.right = Math.min(clip.right, shelf.right);
            clip.top = Math.max(clip.top, shelf.top); clip.bottom = Math.min(clip.bottom, shelf.bottom);
        }
        if (!bounds.width || !bounds.height || bounds.left < clip.left - 1 || bounds.right > clip.right + 1 ||
                bounds.top < clip.top - 1 || bounds.bottom > clip.bottom + 1) return null;
        return { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
    }

    function refreshPendingBuildOrigins() {
        const game = facts?.game;
        for (const cue of pendingBuildCues) {
            cue.origin = !cue.landmark && cue.session === session && cue.turn === game?.turnCount &&
                cue.actor === game?.currentPlayerIndex && game.log.includes(cue.entry)
                ? visibleMarketOrigin(cue.name) : null;
        }
    }

    function startBuildFlight(card, origin, entry, destination = /** @type {DOMRect | null} */ (null)) {
        clearBuildFlight();
        if (!origin || !entry || reducedMotionEnabled()) return;
        const generation = buildFlightGeneration;
        const context = { session, turn: facts?.game?.turnCount, actor: facts?.game?.currentPlayerIndex };
        const current = () => generation === buildFlightGeneration && enabled() && mounted && !facts?.replaying &&
            !document.hidden && node('gameScreen')?.style.display !== 'none' && card.isConnected &&
            session === context.session && facts.game.turnCount === context.turn &&
            facts.game.currentPlayerIndex === context.actor && facts.game.log.includes(entry) && !reducedMotionEnabled();
        // focusCard applies its layout, matrix and instant scroll synchronously.
        // Read that final geometry now: another RAF delays purchase feedback by
        // an entire frame on renderers already busy painting the returned table.
        if (!current()) return;
        const viewport = node('cardboardTableViewport');
        const clip = viewport?.getBoundingClientRect();
        const target = destination || card.getBoundingClientRect();
        const angle = (Number(viewport?.dataset.tableAngle || 0) +
            Number(card.closest('.cardboard-player')?.dataset.tableAngle || 0)) % 360;
        // Rotated inline seats retain their real-card cue. Do not land
        // an upright ghost on an edge whose reading direction differs.
        if (angle !== 0 || !clip || !target.width || !target.height || target.left < clip.left ||
                target.top < clip.top || target.right > clip.right || target.bottom > clip.bottom) return;
        const ghost = card.cloneNode(true);
        ghost.id = 'cardboardBuildFlight';
        ghost.className = ['cardboard-build-flight', ...Array.from(card.classList).filter(name => /^cardboard-card-(blue|green|red|purple)$/.test(String(name)))].join(' ');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.setAttribute('tabindex', '-1');
        ghost.removeAttribute('data-action');
        ghost.dataset.cardName = card.dataset.cardName;
        ghost.dataset.session = String(context.session);
        ghost.dataset.turn = String(context.turn);
        ghost.style.left = `${origin.left}px`; ghost.style.top = `${origin.top}px`;
        ghost.style.width = `${origin.width}px`; ghost.style.height = `${origin.height}px`;
        node('cardboardBoard').appendChild(ghost);
        buildFlight = ghost;
        buildFlightScroll = { left: viewport.scrollLeft, top: viewport.scrollTop };
        if (typeof ghost.animate !== 'function') { clearBuildFlight(); return; }
        const animation = ghost.animate([
            { transform: 'translate(0, 0) scale(1)', opacity: 0.9 },
            { transform: `translate(${target.left - origin.left}px, ${target.top - origin.top}px) scale(${target.width / origin.width}, ${target.height / origin.height})`, opacity: 1 },
        ], { duration: 480, easing: 'cubic-bezier(.2,.7,.25,1)', fill: 'both' });
        buildFlightAnimation = animation;
        animation.finished.then(() => { if (buildFlight === ghost) clearBuildFlight(); }).catch(() => {});
    }

    function clearBuildNotice() {
        if (buildNoticeTimer !== null) clearTimeout(buildNoticeTimer);
        buildNoticeTimer = null;
        buildNoticeContext = null;
        node('cardboardBuildNotice')?.remove();
    }

    function showBuildNotice(card) {
        clearBuildNotice();
        const board = node('cardboardBoard');
        if (!enabled() || facts?.replaying || document.hidden ||
                board?.classList.contains('cardboard-new-roll') ||
                Array.from(board?.querySelectorAll('#diceResult .rolling, #cardboardDiceConfirmation, .cardboard-preview-playing, .cardboard-activation-tag') || [])
                    .some(element => element.getClientRects().length > 0 && globalThis.getComputedStyle(element).visibility !== 'hidden')) return false;
        const owner = Number(card.closest('.cardboard-player')?.dataset.playerIndex);
        const player = facts?.game?.players?.[owner];
        const html = UiCardBoard.buildFacilityConstructionNoticeHtml(player, {
            name: card.dataset.cardName, escapeHtml: facts.escapeHtml, renderFacilityArt: UiBuildMenu.renderFacilityArt,
        });
        const viewport = node('cardboardTableViewport');
        if (!html || !viewport) return false;
        // The completed purchase returns attention to the real card. Keep
        // the receipt data available without stacking two result panels.
        const receiptDetails = /** @type {HTMLDetailsElement | null} */ (node('cardboardEventDetails'));
        if (receiptDetails) receiptDetails.open = false;
        const notice = document.createElement('div');
        notice.id = 'cardboardBuildNotice';
        notice.setAttribute('aria-hidden', 'true');
        notice.innerHTML = html;
        board.appendChild(notice);
        const bounds = viewport.getBoundingClientRect();
        notice.style.left = `${Math.max(bounds.left + 8, bounds.right - notice.offsetWidth - 8)}px`;
        notice.style.top = `${Math.max(bounds.top + 8, bounds.bottom - notice.offsetHeight - 8)}px`;
        buildNoticeContext = { session, turn: facts.game.turnCount, actor: facts.game.currentPlayerIndex };
        buildNoticeTimer = setTimeout(clearBuildNotice, 1200);
        return true;
    }

    function clearBuildCue() {
        if (buildCueTimer !== null) clearTimeout(buildCueTimer);
        buildCueTimer = null;
        if (buildCueCard && buildCueListener) buildCueCard.removeEventListener('animationend', buildCueListener);
        buildCueListener = null;
        buildCueCard?.classList.remove('cardboard-card-newly-built');
        buildCueCard = null;
    }

    function showBuildCue(card, animate, origin = null, entry = null) {
        clearBuildCue();
        card.classList.remove('cardboard-card-newly-built');
        if (animate) void card.offsetWidth;
        const destination = card.getBoundingClientRect();
        card.classList.add('cardboard-card-newly-built');
        buildCueCard = card;
        if (showBuildNotice(card)) startBuildFlight(card, origin, entry, destination);
        else clearBuildFlight();
        const clearArrival = event => {
            if (event.target !== card || event.animationName !== 'cardboard-card-arrival') return;
            clearBuildCue();
        };
        buildCueListener = clearArrival;
        card.addEventListener('animationend', clearArrival);
        buildCueTimer = setTimeout(clearBuildCue, 1200);
    }

    function clearLandmarkCue(landmark) {
        const cue = landmarkCues.get(landmark);
        if (!cue) return;
        clearTimeout(cue.timer);
        landmark.removeEventListener('animationend', cue.listener);
        landmark.classList.remove('cardboard-landmark-newly-built');
        landmarkCues.delete(landmark);
    }

    function clearLandmarkCues() {
        for (const landmark of landmarkCues.keys()) clearLandmarkCue(landmark);
    }

    function showLandmarkCue(landmark, animate) {
        clearLandmarkCue(landmark);
        landmark.classList.remove('cardboard-landmark-newly-built');
        if (animate) void landmark.offsetWidth;
        landmark.classList.add('cardboard-landmark-newly-built');
        const listener = event => {
            if (event.target === landmark && event.animationName === 'cardboard-landmark-complete') {
                clearLandmarkCue(landmark);
            }
        };
        const timer = setTimeout(() => clearLandmarkCue(landmark), 1250);
        landmark.addEventListener('animationend', listener);
        landmarkCues.set(landmark, { timer, listener });
    }

    function clearAdditionalActivationCue(card) {
        const cue = additionalActivationCues.get(card);
        if (!cue) return;
        clearTimeout(cue.timer);
        card.removeEventListener('animationend', cue.listener);
        card.classList.remove('cardboard-card-additional-activation');
        card.style.removeProperty('--cardboard-additional-activation-delay');
        additionalActivationCues.delete(card);
    }

    function clearAdditionalActivationCues() {
        for (const card of additionalActivationCues.keys()) clearAdditionalActivationCue(card);
    }

    function showAdditionalActivationCue(card, order) {
        clearAdditionalActivationCue(card);
        if (!Number.isInteger(order) || order < 0 || order >= 8) return;
        const delay = order * 700;
        card.style.setProperty('--cardboard-additional-activation-delay', `${delay}ms`);
        card.classList.add('cardboard-card-additional-activation');
        const listener = event => {
            if (event.target === card && event.animationName === 'cardboard-card-activate') clearAdditionalActivationCue(card);
        };
        const timer = setTimeout(() => clearAdditionalActivationCue(card), delay + 800);
        card.addEventListener('animationend', listener);
        additionalActivationCues.set(card, { timer, listener });
    }

    function presentBuildCue(button, playerIndex, name, landmark) {
        const game = facts?.game;
        const marker = `${landmark ? '🏆' : '🏗️'} ${name}を建設！`;
        const entry = game?.log?.findLast(item => item.message === marker);
        const captured = purchaseOrigin;
        purchaseOrigin = null;
        const origin = !landmark && captured?.session === session && captured?.turn === game?.turnCount &&
            captured?.actor === game?.currentPlayerIndex && captured?.name === name ? captured.rect : null;
        if (isMarketExpanded()) {
            if (entry) pendingBuildCues.push({ session, turn: game.turnCount, actor: game.currentPlayerIndex, playerIndex, name, landmark, entry, origin: null });
            return;
        }
        if (landmark) showLandmarkCue(button, !reducedMotionEnabled());
        else showBuildCue(button, !reducedMotionEnabled(), origin, entry);
    }

    function presentPendingBuildCues() {
        if (isMarketExpanded()) return;
        const pending = pendingBuildCues;
        pendingBuildCues = [];
        const game = facts?.game;
        if (!game || !mounted || !enabled() || facts.replaying || document.hidden || node('gameScreen')?.style.display === 'none') return;
        for (const cue of pending) {
            if (cue.session !== session || cue.turn !== game.turnCount || cue.actor !== game.currentPlayerIndex || !game.log.includes(cue.entry)) continue;
            const panel = node('cardboardSeats')?.querySelector(`[data-player-index="${cue.playerIndex}"]`);
            const selector = cue.landmark ? '.cardboard-landmark' : '.cardboard-card';
            const button = Array.from(panel?.querySelectorAll(selector) || []).find(element =>
                element.getAttribute(cue.landmark ? 'data-landmark-name' : 'data-card-name') === cue.name);
            if (!button) continue;
            if (cue.landmark && game.players[cue.playerIndex]?.landmarks[cue.name] !== true) continue;
            // Closing a successful purchase reveals the actual new card,
            // including later rows that a seat-header focus cannot expose.
            tableCamera?.focusCard(button);
            if (cue.landmark) showLandmarkCue(button, !reducedMotionEnabled());
            else showBuildCue(button, !reducedMotionEnabled(), cue.origin, cue.entry);
        }
    }

    function clearFeedback() {
        clearBuildFlight();
        purchaseOrigin = null;
        clearBuildNotice();
        clearAdditionalActivationCues();
        activationTags?.clear();
        node('cardboardEventDetails')?.classList.remove('cardboard-preview-playing');
        node('cardboardDiceConfirmation')?.remove();
        pendingBuildCues = [];
        if (transferFrame !== null) globalThis.cancelAnimationFrame(transferFrame);
        transferFrame = null;
        transferSequence++;
        transfers?.clear();
        const announcer = node('turnStatusAnnouncer');
        if (resultAnnouncement && announcer?.textContent === resultAnnouncement) announcer.textContent = '';
        resultAnnouncement = '';
        const buildAnnouncer = node('buildStatusAnnouncer');
        if (buildAnnouncement && buildAnnouncer?.textContent === buildAnnouncement) buildAnnouncer.textContent = '';
        buildAnnouncement = '';
        if (feedbackTimer !== null) clearTimeout(feedbackTimer);
        feedbackTimer = null;
        clearBuildCue();
        clearLandmarkCues();
        node('cardboardBoard')?.classList.remove('cardboard-new-roll', 'cardboard-roll-reviewed');
        node('cardboardBoard')?.querySelectorAll('.cardboard-card-newly-built').forEach(card => card.classList.remove('cardboard-card-newly-built'));
    }

    function restoreMarketNode() {
        const market = node('cardboardMarket');
        const home = marketHome;
        if (market && home?.parent?.isConnected) {
            // Expanded-dialog lists become floating popovers on the compact
            // landscape board. Do not carry them over and cover turn controls.
            market.querySelectorAll('.compact-market-filter-disclosure, .compact-market-goal-disclosure').forEach(details => {
                /** @type {HTMLDetailsElement} */ (details).open = false;
            });
            const before = home.nextSibling?.parentNode === home.parent ? home.nextSibling : null;
            home.parent.insertBefore(market, before);
        }
        marketHome = null;
    }

    function setMarketExpanded(expanded) {
        node('cardboardMarket')?.querySelectorAll('.compact-market-expand').forEach(button =>
            button.setAttribute('aria-expanded', String(expanded)));
    }

    function finishMarketClose() {
        restoreMarketNode();
        setMarketExpanded(false);
        const launcher = marketLauncher?.isConnected && marketLauncher.getClientRects().length
            ? marketLauncher : node('cardboardMarket')?.querySelector(marketLauncherSelector || '.compact-market-expand');
        marketLauncher = null;
        marketLauncherSelector = null;
        if (restoreMarketFocus && enabled() && node('gameScreen')?.style.display !== 'none') {
            launcher?.focus({ preventScroll: true });
        }
        restoreMarketFocus = true;
        tableLayout?.refresh();
        if (tableLayout) globalThis.requestAnimationFrame(presentPendingBuildCues);
        else presentPendingBuildCues();
    }

    function isMarketExpanded() {
        return !!suspendedMarketDetail || /** @type {HTMLDialogElement | null} */ (node('cardboardMarketDialog'))?.open === true;
    }

    function suspendMarketForDetail() {
        const dialog = /** @type {HTMLDialogElement | null} */ (node('cardboardMarketDialog'));
        if (!enabled() || !dialog?.open || suspendedMarketDetail) return false;
        suspendedMarketDetail = { session, game: facts?.game };
        // Native close dispatches asynchronously. This is not a market exit:
        // keep the same shelf, scroll, launcher and pending construction cues.
        ignoredMarketCloseEvents++;
        dialog.close();
        return true;
    }

    /** @param {HTMLElement | null} target */
    function resumeMarketAfterDetail(target = null) {
        const suspended = suspendedMarketDetail;
        suspendedMarketDetail = null;
        const dialog = /** @type {HTMLDialogElement | null} */ (node('cardboardMarketDialog'));
        const market = node('cardboardMarket');
        if (!suspended || !enabled() || suspended.session !== session || suspended.game !== facts?.game ||
                node('gameScreen')?.style.display === 'none' || !dialog || !marketHome || !market) return false;
        dialog.showModal();
        setMarketExpanded(true);
        const matching = target?.dataset?.action ? Array.from(/** @type {NodeListOf<HTMLButtonElement>} */ (market.querySelectorAll('button[data-action]'))).find(button =>
            button.dataset.action === target.dataset.action && button.dataset.cardName === target.dataset.cardName &&
            button.dataset.landmarkName === target.dataset.landmarkName &&
            !button.disabled && button.getClientRects().length > 0) : null;
        const replacement = target?.isConnected && market.contains(target) ? target : matching
            || /** @type {HTMLElement | null} */ (market.querySelector('.compact-market-detail:not(:disabled), .compact-market-buy:not(:disabled)')) || node('cardboardMarketClose');
        replacement?.focus({ preventScroll: true });
        return true;
    }

    function closeMarket(restoreFocus = true) {
        suspendedMarketDetail = null;
        const dialog = /** @type {HTMLDialogElement | null} */ (node('cardboardMarketDialog'));
        restoreMarketFocus = restoreFocus;
        if (!restoreFocus) pendingBuildCues = [];
        setMarketExpanded(false);
        const wasOpen = dialog?.open === true;
        if (wasOpen && restoreFocus) refreshPendingBuildOrigins();
        if (wasOpen) dialog.close();
        restoreMarketNode();
        if (!wasOpen) finishMarketClose();
    }

    function openMarket() {
        const dialog = /** @type {HTMLDialogElement | null} */ (node('cardboardMarketDialog'));
        const market = node('cardboardMarket');
        const slot = node('cardboardMarketDialogSlot');
        if (!enabled() || !dialog || !market || !slot || typeof dialog.showModal !== 'function') return false;
        if (suspendedMarketDetail) return false;
        if (dialog.open) return true;
        marketLauncher = document.activeElement;
        marketLauncherSelector = marketLauncher?.closest?.('.compact-market-filter-disclosure')
            ? '.compact-market-filter-disclosure > summary'
            : marketLauncher?.closest?.('.compact-market-goal-disclosure') ? '.compact-market-goal-disclosure > summary' : null;
        marketHome = { parent: market.parentNode, nextSibling: market.nextSibling };
        slot.appendChild(market);
        dialog.showModal();
        setMarketExpanded(true);
        (/** @type {HTMLElement | null} */ (market.querySelector('.compact-market-buy:not(:disabled), .compact-market-detail') || node('cardboardMarketClose')))?.focus({ preventScroll: true });
        return true;
    }

    function updateTown() {
        const dialog = /** @type {HTMLDialogElement | null} */ (node('cardboardTownDialog'));
        if (!dialog?.open) return;
        const player = facts?.game?.players?.[townIndex];
        if (!enabled() || !player) { closeTown(false); return; }
        node('cardboardTownHeading').textContent = `${player.name}の街`;
        replaceHtml(node('cardboardTownContent'), UiBuildMenu.renderTownHtml(player, facts.enabledLandmarks));
        const owned = new Map();
        for (const card of player.cards || []) owned.set(card.name, (owned.get(card.name) || 0) + 1);
        const landmarks = Object.keys(player.landmarks || {}).filter(name => player.landmarks[name] === true && facts.enabledLandmarks.has(name));
        node('cardboardTownDescription').textContent = [
            [...owned].map(([name, count]) => `${name}${count}枚`).join('、') || '所有施設なし',
            `完成ランドマーク：${landmarks.join('、') || 'なし'}`,
        ].join('。');
    }

    function finishTownClose() {
        const launcher = townLauncher?.isConnected ? townLauncher
            : node('cardboardSeats')?.querySelector('.cardboard-player-selected [data-cardboard-town]')
                || node('cardboardRoster')?.querySelector('.cardboard-roster-seat[aria-current="true"]');
        townLauncher = null;
        townIndex = null;
        node('cardboardTownContent')?.replaceChildren();
        if (node('cardboardTownDescription')) node('cardboardTownDescription').textContent = '';
        if (restoreTownFocus && enabled() && node('gameScreen')?.style.display !== 'none') launcher?.focus({ preventScroll: true });
        restoreTownFocus = true;
    }

    function closeTown(restoreFocus = true) {
        const dialog = /** @type {HTMLDialogElement | null} */ (node('cardboardTownDialog'));
        restoreTownFocus = restoreFocus;
        if (dialog?.open) dialog.close();
        else finishTownClose();
    }

    function openTown(launcher) {
        const dialog = /** @type {HTMLDialogElement | null} */ (node('cardboardTownDialog'));
        const index = Number(launcher.dataset.cardboardTown);
        if (!enabled() || !facts?.game?.players?.[index] || !dialog || typeof dialog.showModal !== 'function') return;
        townIndex = index;
        townLauncher = launcher;
        restoreTownFocus = true;
        dialog.showModal();
        updateTown();
        node('cardboardTownClose')?.focus({ preventScroll: true });
    }

    function detach() {
        if (ownerLabelFrame !== null) window.cancelAnimationFrame(ownerLabelFrame);
        ownerLabelFrame = null;
        ownerLabelsInspecting = false;
        node('cardboardOwnerLabels')?.replaceChildren();
        closeTown(false);
        closeMarket(false);
        revealDiceCandidateAfterMarketUpdate = false;
        previousChoice = null;
        choiceInitialized = false;
        clearFeedback();
        feedback?.reset();
        const wasMounted = mounted;
        mounted = false;
        arrangeCompactStatus();
        tableLayout?.destroy();
        tableLayout = null;
        tableCamera?.destroy();
        tableCamera = null;
        if (!wasMounted) return;
        const guide = node('tutorialBox');
        if (guide && guideOrigin?.parentNode) guideOrigin.parentNode.insertBefore(guide, guideOrigin);
        guideOrigin?.remove();
        guideOrigin = null;
        const toolbar = node('cardboardControls')?.querySelector('.game-action-toolbar');
        if (toolbar && toolbarOrigin?.parentNode) toolbarOrigin.parentNode.insertBefore(toolbar, toolbarOrigin);
        toolbarOrigin?.remove();
        toolbarOrigin = null;
        const actions = node('cardboardActionSlot')?.querySelector('.game-action-panel');
        if (actions && actionOrigin?.parentNode) actionOrigin.parentNode.insertBefore(actions, actionOrigin);
        actionOrigin?.remove();
        actionOrigin = null;
        if (typeof DesignTheme !== 'undefined') DesignTheme.arrangeGameSections(document, document.documentElement.dataset.design);
        node('gameLogContainer')?.classList.remove('cardboard-panel-open');
        node('cardboardLogToggle')?.setAttribute('aria-expanded', 'false');
        node('cardboardMarket')?.replaceChildren();
        node('cardboardSeats').querySelectorAll('.cardboard-player').forEach(element => element.remove());
        node('cardboardDiceReceipt').replaceChildren();
        const currentResult = node('cardboardCurrentResult');
        if (currentResult) { currentResult.textContent = ''; currentResult.hidden = true; }
        receiptSession = null;
        node('cardboardRoster').replaceChildren();
        const eventDetails = /** @type {HTMLDetailsElement | null} */ (node('cardboardEventDetails'));
        if (eventDetails) eventDetails.open = false;
        node('cardboardBoard').classList.remove('cardboard-card-table');
        node('cardboardBoard').hidden = true;
        mounted = false;
    }

    function updateMarket(html) {
        if (!mounted || typeof html !== 'string') return;
        replaceHtml(node('cardboardMarket'), html);
        setMarketExpanded(isMarketExpanded());
        scrollMemory.restore('market', node('cardboardMarket'));
        const game = facts?.game;
        if (game?.players?.length) {
            const validSelf = Number.isInteger(facts.selfIndex) && facts.selfIndex >= 0 && facts.selfIndex < game.players.length;
            tableLayout?.refresh({ selfIndex: validSelf ? facts.selfIndex : 0, playerCount: game.players.length, session });
            tableCamera?.refresh({ selfIndex: validSelf ? facts.selfIndex : 0, currentIndex: game.currentPlayerIndex, session });
        }
        if (revealDiceCandidateAfterMarketUpdate) {
            revealDiceCandidateAfterMarketUpdate = false;
            const revealSession = session;
            // Layout chooses the market's column count on the next frame.
            // Reveal against that final shelf, not its previous dimensions.
            globalThis.requestAnimationFrame(() => {
                if (!mounted || session !== revealSession) return;
                const shelf = node('cardboardMarket')?.querySelector('.compact-market-facilities');
                const matchingCard = shelf?.querySelector('.compact-market-roll-match');
                if (matchingCard && shelf) revealInScrollport(matchingCard, shelf);
                updateMarketOverflow();
            });
        }
        updateMarketOverflow();
    }

    function initialize() {
        if (initialized || !node('cardboardBoard')) return;
        initialized = true;
        globalThis.matchMedia('(min-width: 601px) and (max-height: 500px)').addEventListener('change', arrangeCompactStatus);
        ensureTable();
        node('cardboardBoard').addEventListener('scroll', event => {
            if (/** @type {HTMLElement} */ (event.target).classList?.contains('compact-market-facilities')) updateMarketOverflow();
        }, true);
        node('cardboardMarketDialog')?.addEventListener('scroll', updateMarketOverflow, true);
        node('cardboardMarket')?.addEventListener('click', event => {
            const button = /** @type {HTMLButtonElement | null} */ (/** @type {HTMLElement} */ (event.target).closest?.('[data-action="buildCard"]'));
            if (!enabled() || !button || button.disabled || !facts?.game) return;
            purchaseOrigin = { session, turn: facts.game.turnCount, actor: facts.game.currentPlayerIndex,
                name: button.dataset.cardName, rect: visibleMarketOrigin(button.dataset.cardName) };
        }, true);
        node('cardboardTableViewport')?.addEventListener('scroll', () => {
            const viewport = node('cardboardTableViewport');
            if (buildFlight && viewport && (viewport.scrollLeft !== buildFlightScroll?.left ||
                    viewport.scrollTop !== buildFlightScroll?.top)) clearBuildFlight();
        }, { passive: true });
        node('cardboardTableViewport')?.addEventListener('pointerdown', clearBuildFlight, { passive: true });
        node('cardboardTableViewport')?.addEventListener('wheel', clearBuildFlight, { passive: true });
        window.addEventListener('resize', clearBuildFlight, { passive: true });
        node('cardboardBoard')?.addEventListener('click', event => {
            if (event.defaultPrevented) return;
            const source = /** @type {HTMLElement} */ (event.target);
            const detail = source.closest?.('.cardboard-card[data-action="showCardDetail"], .cardboard-landmark[data-action="showLandmarkDetail"]');
            // Camera capture suppresses drag/pinch clicks before this handler.
            // Readable cards still count as inspection without a camera change.
            if (detail?.closest('.cardboard-player') && node('cardboardSeats')?.contains(detail)) facts?.onUserInspection?.();
            const button = source.closest?.('[data-cardboard-camera]');
            if (!button || !tableCamera) return;
            const command = button.getAttribute('data-cardboard-camera');
            if (command === 'self' || command === 'readable') facts?.onUserInspection?.();
            if (command === 'overview') tableCamera.fit();
            else if (command === 'back') { if (!tableCamera.restoreView()) tableCamera.fit(); }
            else if (command === 'market') tableCamera.focusMarket();
            else if (command === 'self') {
                const ownIndex = facts?.selfIndex;
                tableCamera.focusSeat(Number.isInteger(ownIndex) && ownIndex >= 0 && ownIndex < (facts?.game?.players?.length || 0)
                    ? ownIndex : facts?.game?.currentPlayerIndex ?? 0);
            }
            else if (command === 'readable') tableCamera.readable();
            else tableCamera.zoomBy(command === 'in' ? 1.25 : 0.8);
            if (button.closest('#cardboardMoreMenu')) closeMoreMenu(true);
        });
        window.addEventListener('resize', () => {
            clearBuildNotice();
            updateRosterOverflow();
            updatePlayerOverflow();
        }, { passive: true });
        node('cardboardMarket')?.addEventListener('click', event => {
            const summary = /** @type {HTMLElement} */ (event.target).closest?.('summary');
            const details = /** @type {HTMLDetailsElement | null} */ (summary?.parentElement);
            if (!details?.matches('.compact-market-filter-disclosure, .compact-market-goal-disclosure') ||
                    !node('cardboardSeats')?.contains(details)) return;
            // A fixed popup inside a transformed table does not use screen
            // coordinates. Inspect its real controls in the existing dialog.
            event.preventDefault();
            details.open = false;
            if (!openMarket()) return;
            closeDisclosures(details);
            details.open = true;
            const target = /** @type {HTMLElement | null} */ (details.querySelector('button[aria-pressed="true"]') || details.querySelector('button:not(:disabled)') || summary);
            target?.focus({ preventScroll: true });
        });
        node('cardboardMarket')?.addEventListener('keydown', event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            const source = /** @type {HTMLElement} */ (event.target);
            const shelf = source.closest?.('.compact-market-facilities');
            if (!shelf || shelf.scrollWidth <= shelf.clientWidth + 1) return;
            const firstItem = shelf.querySelector('.compact-market-item');
            const step = Math.max(160, Math.round(firstItem?.getBoundingClientRect?.().width || shelf.clientWidth * 0.8));
            const direction = event.key === 'ArrowRight' ? 1 : -1;
            const motion = reducedMotionEnabled() ? 'auto' : 'smooth';
            event.preventDefault();
            shelf.scrollBy({ left: direction * step, behavior: /** @type {ScrollBehavior} */ (motion) });
        });
        const onDisclosureToggle = event => {
            const details = /** @type {HTMLDetailsElement} */ (event.target);
            if (!details.matches?.(disclosureSelector) || !details.open) return;
            closeDisclosures(details);
            facts?.closeLog?.();
        };
        for (const root of [node('cardboardBoard'), node('cardboardMarketDialog')]) {
            root?.addEventListener('toggle', onDisclosureToggle, true);
        }
        const clearHiddenFeedback = () => {
            if (document.hidden || node('gameScreen')?.style.display === 'none') {
                closeTown(false);
                closeMarket(false);
                previousChoice = null;
                choiceInitialized = false;
                clearFeedback();
                feedback?.reset();
            }
        };
        node('cardboardChoiceJump')?.addEventListener('click', () => {
            node('diceChoose')?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
            const button = /** @type {HTMLButtonElement | null} */ (node('diceChoose')?.querySelector('button:not(:disabled)'));
            button?.focus({ preventScroll: true });
        });
        node('cardboardSeats')?.addEventListener('click', event => {
            const launcher = /** @type {HTMLElement} */ (event.target).closest?.('[data-cardboard-town]');
            if (launcher) openTown(launcher);
        });
        node('cardboardTownClose')?.addEventListener('click', () => closeTown());
        node('cardboardTownDialog')?.addEventListener('close', finishTownClose);
        node('cardboardTownDialog')?.addEventListener('click', event => {
            if (event.target === event.currentTarget) closeTown();
        });
        node('cardboardMarketClose')?.addEventListener('click', () => closeMarket());
        node('cardboardMarketDialog')?.addEventListener('cancel', refreshPendingBuildOrigins);
        node('cardboardMarketDialog')?.addEventListener('close', () => {
            if (ignoredMarketCloseEvents > 0) { ignoredMarketCloseEvents--; return; }
            finishMarketClose();
        });
        node('cardboardMarketDialog')?.addEventListener('click', event => {
            if (event.target === event.currentTarget) closeMarket();
        });
        node('cardboardCompareToggle')?.addEventListener('click', () => PlazaField.toggleComparison());
        const moreMenu = /** @type {HTMLDetailsElement | null} */ (node('cardboardMoreMenu'));
        const closeMoreMenu = restoreFocus => {
            if (!moreMenu?.open) return;
            moreMenu.open = false;
            if (restoreFocus) moreMenu.querySelector('summary')?.focus({ preventScroll: true });
        };
        moreMenu?.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || !moreMenu.open) return;
            event.preventDefault();
            closeMoreMenu(true);
        });
        moreMenu?.addEventListener('click', event => {
            const action = /** @type {HTMLElement} */ (event.target).closest?.('button[data-ui-action]');
            if (action) closeMoreMenu(false);
        });
        document.addEventListener('pointerdown', event => {
            if (moreMenu?.open && !moreMenu.contains(/** @type {Node} */ (event.target))) closeMoreMenu(false);
        });
        document.addEventListener('visibilitychange', clearHiddenFeedback);
        let wasReducedMotion = reducedMotionEnabled();
        const updateMotionFeedback = (reduced = reducedMotionEnabled()) => {
            if (reduced && !wasReducedMotion) clearFeedback();
            wasReducedMotion = reduced;
        };
        window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => {
            // A queued reduce event still cancels feedback if the OS preference
            // has already changed back by the time this callback is delivered.
            updateMotionFeedback(event.matches || reducedMotionEnabled());
        });
        new MutationObserver(() => updateMotionFeedback()).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        new MutationObserver(clearHiddenFeedback).observe(node('gameScreen'), { attributes: true, attributeFilter: ['style'] });
        node('cardboardRoster').addEventListener('click', event => {
            const button = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-cardboard-player-index]'));
            if (!button) return;
            facts?.onUserInspection?.();
            selectedIndex = Number(button.dataset.cardboardPlayerIndex);
            scrollMemory.capture('roster', node('cardboardRoster'));
            draw();
            tableCamera?.focusSeat(selectedIndex);
        });
        node('cardboardRoster').addEventListener('keydown', event => {
            const key = event.key;
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key) || event.altKey || event.ctrlKey || event.metaKey) return;
            const source = /** @type {HTMLElement} */ (event.target).closest?.('.cardboard-roster-seat');
            if (!source) return;
            const seats = Array.from(node('cardboardRoster').querySelectorAll('.cardboard-roster-seat'));
            const index = seats.indexOf(source);
            if (index < 0 || seats.length < 2) return;
            const nextIndex = key === 'Home' ? 0 : key === 'End' ? seats.length - 1
                : (index + (key === 'ArrowRight' ? 1 : -1) + seats.length) % seats.length;
            event.preventDefault();
            const nextSeat = /** @type {HTMLButtonElement | undefined} */ (seats[nextIndex]);
            nextSeat?.focus({ preventScroll: true });
            nextSeat?.click();
        });
        const captureThemeFocus = () => {
            const active = /** @type {HTMLElement | null} */ (document.activeElement);
            const marketFocus = active?.closest?.('#cardboardMarket, #buildMenu') ? {
                action: active.dataset.action, cardName: active.dataset.cardName,
                landmarkName: active.dataset.landmarkName, cardFilter: active.dataset.cardFilter,
            } : null;
            return { active, marketFocus };
        };
        document.addEventListener('design-theme-will-change', () => {
            closeTown(false);
            themeFocus = captureThemeFocus();
            // Capture before the outgoing theme's CSS hides its scroll boxes.
            if (enabled() && mounted) {
                scrollMemory.capture('market', node('cardboardMarket'));
                scrollMemory.capture('roster', node('cardboardRoster'));
                node('cardboardSeats').querySelectorAll('.cardboard-player').forEach(panel =>
                    scrollMemory.capture(`player:${/** @type {HTMLElement} */ (panel).dataset.playerIndex}`, panel));
            }
        });
        document.addEventListener('design-theme-change', () => {
            closeMoreMenu(false);
            const { active, marketFocus } = themeFocus || captureThemeFocus();
            themeFocus = null;
            if (!enabled()) detach();
            draw();
            facts?.refreshMarket?.();
            if (marketFocus?.action) {
                const market = node(enabled() ? 'cardboardMarket' : 'buildMenu');
                const target = Array.from(market?.querySelectorAll('button') || []).find(button =>
                    !button.disabled && button.dataset.action === marketFocus.action &&
                    button.dataset.cardName === marketFocus.cardName &&
                    button.dataset.landmarkName === marketFocus.landmarkName &&
                    button.dataset.cardFilter === marketFocus.cardFilter);
                focusVisible(target || node('gameDesignThemeSelect'));
            } else if (active?.isConnected) active.focus({ preventScroll: true });
        });
    }

    function focusVisible(target) {
        if (!target) return;
        for (let parent = target.parentElement; parent; parent = parent.parentElement) {
            if (parent.tagName === 'DETAILS' && target.tagName !== 'SUMMARY') parent.open = true;
        }
        target.focus({ preventScroll: true });
    }

    function replacePlayerHtml(panel, html) {
        if (renderedHtml.get(panel) === html && panel.childNodes.length) return;
        const template = document.createElement('template');
        template.innerHTML = html;
        const next = Array.from(template.content.children);
        const current = Array.from(panel.children);
        if (current.length !== next.length || current.some((part, index) =>
            part.tagName !== next[index].tagName || part.className !== next[index].className)) {
            replaceHtml(panel, html);
            for (const part of Array.from(panel.children)) renderedHtml.set(part, part.innerHTML);
            return;
        }
        // A balance/header refresh must not rebuild unchanged card SVGs. Keep
        // their loaded external artwork, focus, and in-flight presentation.
        renderedHtml.set(panel, html);
        current.forEach((part, index) => {
            const label = next[index].getAttribute('aria-label');
            if (label !== null) part.setAttribute('aria-label', label);
            replaceHtml(part, next[index].innerHTML);
        });
    }

    function presentationNodeKey(node) {
        if (node.nodeType !== 1) return null;
        const element = /** @type {Element} */ (node);
        if (element.id) return `id:${element.id}`;
        const card = element.matches('.compact-market-item')
            ? element.querySelector('[data-card-name], [data-landmark-name]') : element;
        for (const attribute of ['data-card-name', 'data-landmark-name', 'data-player-index', 'data-cardboard-player-index']) {
            if (card?.hasAttribute(attribute)) return JSON.stringify([element.tagName, attribute,
                card.getAttribute(attribute), card.getAttribute('data-action')]);
        }
        return null;
    }

    function patchPresentationChildren(parent, nextParent) {
        let cursor = parent.firstChild;
        for (const next of Array.from(nextParent.childNodes)) {
            const key = presentationNodeKey(next);
            let current = cursor;
            if (key && presentationNodeKey(current || nextParent) !== key) {
                current = null;
                for (let candidate = cursor; candidate; candidate = candidate.nextSibling) {
                    if (presentationNodeKey(candidate) === key) { current = candidate; break; }
                }
            }
            const compatible = current && current.nodeType === next.nodeType && current.nodeName === next.nodeName &&
                presentationNodeKey(current) === key;
            if (!compatible) {
                parent.insertBefore(next.cloneNode(true), cursor);
                continue;
            }
            if (current !== cursor) parent.insertBefore(current, cursor);
            if (current.nodeType === 1) {
                const target = /** @type {Element} */ (current);
                const source = /** @type {Element} */ (next);
                if (target.outerHTML !== source.outerHTML) {
                    for (const attribute of Array.from(target.attributes)) {
                        if (!source.hasAttribute(attribute.name)) target.removeAttribute(attribute.name);
                    }
                    for (const attribute of Array.from(source.attributes)) {
                        if (target.getAttribute(attribute.name) !== attribute.value) target.setAttribute(attribute.name, attribute.value);
                    }
                    patchPresentationChildren(target, source);
                }
            } else if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
            cursor = current.nextSibling;
        }
        while (cursor) {
            const obsolete = cursor;
            cursor = cursor.nextSibling;
            parent.removeChild(obsolete);
        }
    }

    function replaceHtml(element, html) {
        // Native details.open and normalized HTML entities change innerHTML
        // without changing the requested content. Do not replace a focused
        // disclosure just because the user opened it between renders.
        if (renderedHtml.get(element) === html && (!html || element.childNodes.length)) return;
        renderedHtml.set(element, html);
        const active = document.activeElement;
        const focused = element.contains(active) ? /** @type {HTMLElement} */ (active) : null;
        const action = focused?.dataset.action;
        const card = focused?.dataset.cardName;
        const landmark = focused?.dataset.landmarkName;
        const seat = focused?.dataset.cardboardPlayerIndex;
        const town = focused?.dataset.cardboardTown;
        const filter = focused?.dataset.cardFilter;
        const summaryFocused = focused?.tagName === 'SUMMARY';
        const disclosureClass = summaryFocused ? focused.parentElement?.className : null;
        const scrollTop = element.scrollTop;
        const scrollLeft = element.scrollLeft;
        const childScroll = ['.cardboard-cards', '.cardboard-landmarks', '.compact-market-facilities', '.cardboard-roster'].map(selector => ({
            selector, top: element.querySelector(selector)?.scrollTop || 0,
            left: element.querySelector(selector)?.scrollLeft || 0,
        }));
        const disclosures = ['.compact-market-filter-disclosure', '.compact-market-goal-disclosure'].map(selector => ({
            selector, open: (/** @type {HTMLDetailsElement | null} */ (element.querySelector(selector)))?.open,
        }));
        const template = document.createElement('template');
        template.innerHTML = html;
        // Preserve unchanged external SVG nodes even when activation, balance,
        // stock, filters or purchase buttons change around them.
        patchPresentationChildren(element, template.content);
        for (const disclosure of disclosures) {
            const child = /** @type {HTMLDetailsElement | null} */ (element.querySelector(disclosure.selector));
            if (child && disclosure.open !== undefined) child.open = disclosure.open;
        }
        element.scrollTop = scrollTop;
        element.scrollLeft = scrollLeft;
        for (const position of childScroll) {
            const child = element.querySelector(position.selector);
            if (child) { child.scrollTop = position.top; child.scrollLeft = position.left; }
        }
        if (!focused) return;
        const buttons = Array.from(element.querySelectorAll('button'));
        const matchesFocus = button => town !== undefined ? button.dataset.cardboardTown === town
            : seat !== undefined ? button.dataset.cardboardPlayerIndex === seat
            : button.dataset.action === action && button.dataset.cardName === card &&
                button.dataset.landmarkName === landmark && button.dataset.cardFilter === filter;
        let target = summaryFocused
            ? Array.from(element.querySelectorAll('details')).find(details => details.className === disclosureClass)?.querySelector('summary')
            : buttons.find(button => !button.disabled && matchesFocus(button));
        if (!target && ['buildCard', 'buildLandmark'].includes(action)) {
            target = buttons.find(button => !button.disabled && button.dataset.action === action) ||
                (/** @type {HTMLDialogElement | null} */ (node('cardboardMarketDialog'))?.open ? node('cardboardMarketClose') : null);
        }
        focusVisible(target);
    }

    function updateCurrentResult(events, game, selfIndex) {
        const result = node('cardboardCurrentResult');
        if (!result) return;
        const construction = events.important?.find(event => ['build', 'landmark'].includes(event.kind));
        const constructionName = construction?.message?.match(/^(?:🏗️|🏆)\s+(.+)を建設！$/u)?.[1];
        const facilities = new Map();
        for (const activation of events.activations || []) {
            if (!activation.facility || !activation.subject) continue;
            const owner = Number.isInteger(activation.owner) ? activation.owner
                : activation.to !== null ? activation.to : activation.from;
            const key = activation.activation || `${owner}:${activation.subject}`;
            const previous = facilities.get(key);
            facilities.set(key, {
                name: activation.subject,
                count: Math.max(previous?.count || 0, Number.isSafeInteger(activation.count) ? activation.count : 1),
            });
        }
        const names = [...new Set([...facilities.values()].map(facility => facility.name))];
        const count = [...facilities.values()].reduce((sum, facility) => sum + facility.count, 0);
        const balanceIndex = Number.isInteger(selfIndex) ? selfIndex : game.currentPlayerIndex;
        const balance = events.balances?.find(entry => entry.index === balanceIndex);
        const net = Number.isSafeInteger(balance?.facilityNet) ? balance.facilityNet : 0;
        const parts = [];
        if (events.dice) parts.push(`出目 ${events.dice.harbor ? `${events.dice.base}→${events.dice.effective}（港+2）` : events.dice.effective ?? events.dice.base}${events.dice.rerolled ? '（振り直し）' : ''}`);
        if (count) parts.push(`施設${count}回：${names.slice(0, 3).join('・')}${names.length > 3 ? `ほか${names.length - 3}種類` : ''}`);
        if (events.dice) parts.push(`${balanceIndex === selfIndex ? 'あなた' : game.players[balanceIndex]?.name || '手番'}の${events.incomplete ? '確認できた施設収支' : '施設収支'} ${net > 0 ? '+' : ''}${net}コイン`);
        if (constructionName) parts.push(`${game.players[construction.actorIndex]?.name || 'プレイヤー'}が${constructionName}${construction.kind === 'landmark' ? 'を完成' : 'を建設'}`);
        if (events.incomplete) parts.push('一部の収支は内訳で確認');
        result.textContent = parts.join(' · ');
        result.hidden = !events.dice && !constructionName;
        result.dataset.kind = constructionName ? 'build' : events.dice ? 'roll' : 'idle';
        result.dataset.net = String(net);
        result.dataset.largeIncome = String(net >= 5);
        const details = node('cardboardEventDetails');
        const summary = details?.querySelector('summary');
        if (!details || !summary) return;
        const hasResult = Boolean(events.dice || constructionName);
        if (!hasResult || constructionName) {
            details.classList.remove('cardboard-preview-playing');
            node('cardboardDiceConfirmation')?.remove();
        }
        details.dataset.hasResult = String(hasResult);
        details.dataset.largeIncome = String(net >= 5);
        summary.dataset.net = String(net);
        summary.dataset.largeIncome = String(net >= 5);
        if (!hasResult) {
            details.dataset.activationPreview = 'false';
            summary.textContent = '出目・収支';
            summary.removeAttribute('aria-label');
            summary.removeAttribute('title');
            return;
        }
        const headingText = constructionName
            ? construction.kind === 'landmark' ? '目標完成' : '建設完了'
            : `${events.dice.harbor ? `港${events.dice.base}→${events.dice.effective}` : `出目${events.dice.effective ?? events.dice.base}`} · ${net > 0 ? '+' : ''}${net}`;
        const detailText = constructionName || `施設${count}回・${events.incomplete ? '確認分' : '収支'}`;
        let heading = summary.querySelector('.cardboard-result-heading');
        let detail = summary.querySelector('.cardboard-result-detail');
        if (!heading || !detail) {
            heading = document.createElement('span');
            heading.className = 'cardboard-result-heading';
            detail = document.createElement('span');
            detail.className = 'cardboard-result-detail';
            summary.replaceChildren(heading, detail);
        }
        const preview = constructionName ? '' : UiCardBoard.buildActivationPreviewHtml(events, game.players, {
            cards: CARDS, escapeHtml: facts.escapeHtml, renderFacilityArt: UiBuildMenu.renderFacilityArt, limit: 8,
        });
        details.dataset.activationPreview = String(Boolean(preview));
        heading.textContent = preview ? `${headingText} · 施設${count}回` : headingText;
        if (preview) replaceHtml(detail, preview);
        else detail.textContent = detailText;
        summary.setAttribute('aria-label', `${result.textContent}。出目と収支を確認`);
        summary.title = result.textContent;
    }

    function draw() {
        if (!facts || !node('cardboardBoard')) return;
        const { game, escapeHtml, enabledLandmarks, getEffectText } = facts;
        if (!game?.players?.length) return;
        const builtLandmarks = game.players.map(player => Object.keys(player.landmarks || {}).filter(name => player.landmarks[name] === true));
        const newlyBuiltLandmarks = !facts.replaying && previousBuiltLandmarks
            ? builtLandmarks.flatMap((names, index) => names.filter(name => !previousBuiltLandmarks[index]?.includes(name)).map(name => ({ index, name })))
            : [];
        previousBuiltLandmarks = builtLandmarks;
        const newlyBuiltCards = collectNewFacilityBuilds(game, facts.replaying, facts.session);
        if (!enabled()) { detach(); return; }
        const buildMilestones = [
            ...newlyBuiltCards.map(build => ({ playerIndex: build.playerIndex, name: build.name, landmark: false })),
            ...newlyBuiltLandmarks.map(build => ({ playerIndex: build.index, name: build.name, landmark: true })),
        ];
        if (buildMilestones.length) {
            facts.onBuildMilestones?.(buildMilestones);
            const announcer = node('buildStatusAnnouncer');
            if (announcer) {
                const announcements = buildMilestones.map(build => {
                    const playerName = game.players[build.playerIndex]?.name || `席${build.playerIndex + 1}`;
                    return build.landmark
                        ? `${playerName}がランドマーク「${build.name}」を完成させました`
                        : `${playerName}が施設「${build.name}」を建設しました`;
                });
                buildAnnouncement = announcements.join('。');
                announcer.textContent = buildAnnouncement;
            }
        }
        if (!mounted) {
            const actions = document.querySelector('#gameScreen .game-action-panel');
            if (actions) {
                actionOrigin = document.createComment('cardboard action origin');
                actions.parentNode.insertBefore(actionOrigin, actions);
                node('cardboardActionSlot').appendChild(actions);
                const toolbar = actions.querySelector('.game-action-toolbar');
                if (toolbar) {
                    toolbarOrigin = document.createComment('cardboard toolbar origin');
                    toolbar.parentNode.insertBefore(toolbarOrigin, toolbar);
                    node('cardboardMoreMenuContent').appendChild(toolbar);
                }
            }
            const guide = node('tutorialBox');
            if (guide) {
                guideOrigin = document.createComment('cardboard guide origin');
                guide.parentNode.insertBefore(guideOrigin, guide);
                node('cardboardControls').appendChild(guide);
            }
            node('cardboardBoard').classList.add('cardboard-card-table');
            node('cardboardBoard').hidden = false;
            mounted = true;
        }
        ensureTable();
        const validIndex = index => Number.isInteger(index) && index >= 0 && index < game.players.length;
        const currentIndex = validIndex(game.currentPlayerIndex) ? game.currentPlayerIndex : 0;
        if (buildNoticeContext && (buildNoticeContext.session !== session || buildNoticeContext.turn !== game.turnCount ||
                buildNoticeContext.actor !== currentIndex || facts.replaying || game.phase !== GAME_PHASES.BUILD)) {
            clearBuildNotice();
            clearBuildFlight();
            purchaseOrigin = null;
        }
        const selfIndex = validIndex(facts.selfIndex) ? facts.selfIndex : null;
        const turnChanged = focusTurnIndex !== currentIndex;
        if (turnChanged) {
            selectedIndex = currentIndex;
            focusTurnIndex = currentIndex;
        }
        if (!validIndex(selectedIndex)) selectedIndex = selfIndex ?? currentIndex;
        const newRoll = feedback?.refresh(facts) === true;
        const events = turnEventsFor(game, facts.display);
        updateCurrentResult(events, game, selfIndex);
        const freshResultLogs = feedback?.takeResultLogs() || [];
        const freshEvents = freshResultLogs.length ? UiTurnEvents.project(freshResultLogs, {
            players: game.players, turnPlayerIndex: currentIndex, display: facts.display,
            cardNames: CARDS.map(card => card.name), landmarkNames: Player.landmarkNames(), maxActivations: 1000,
        }) : null;
        const freshDiceResolution = freshResultLogs.some(entry => entry.type === LOG_TYPES.DICE && entry.diceResolution);
        if (newRoll) node('cardboardBoard')?.style.setProperty('--cardboard-event-lead', freshDiceResolution ? '500ms' : '0ms');
        // Feedback consumes only newly appended consequences after a pending
        // choice. Never pulse the older facilities retained in the turn receipt.
        const additionalActivations = new Map();
        if (!newRoll && freshEvents && !facts.replaying && !feedback?.wasInvalidated()) {
            for (const event of freshEvents.activations) {
                const owner = Number.isInteger(event.owner) ? event.owner : event.to !== null ? event.to : event.from;
                if (!event.facility || !Number.isInteger(owner) || !event.subject) continue;
                const key = JSON.stringify([owner, event.subject]);
                if (!additionalActivations.has(key)) additionalActivations.set(key, additionalActivations.size);
            }
        }
        if (newRoll || freshResultLogs.length) {
            node('cardboardDiceConfirmation')?.remove();
            activationTags?.clear();
            clearAdditionalActivationCues();
            node('cardboardEventDetails')?.classList.remove('cardboard-preview-playing');
        }
        const eventFocusSeatIndex = UiCardBoard.eventFocusSeatIndex(
            game.players.length,
            buildMilestones,
            (newRoll || freshResultLogs.length > 0) && !facts.replaying
                ? freshEvents?.activations || events.activations : [],
        );
        if (validIndex(eventFocusSeatIndex)) selectedIndex = eventFocusSeatIndex;
        if (facts.replaying || feedback?.wasInvalidated()) clearFeedback();
        else if (!newRoll && node('cardboardBoard')?.classList.contains('cardboard-new-roll')) {
            node('cardboardBoard')?.classList.add('cardboard-roll-reviewed');
        }
        const choice = [GAME_PHASES.SELECT_DICE, GAME_PHASES.REROLL_CONFIRM, GAME_PHASES.HARBOR_CHOICE].includes(game.phase)
            && currentIndex === selfIndex ? `${game.turnCount}:${currentIndex}:${game.phase}` : null;
        if (choiceInitialized && choice && choice !== previousChoice && !facts.replaying) {
            const currentFacts = facts;
            queueMicrotask(() => {
                if (enabled() && facts === currentFacts && !facts.replaying && previousChoice === choice && !document.hidden && node('gameScreen')?.style.display !== 'none') {
                    node('diceChoose')?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
                }
            });
        }
        previousChoice = choice;
        choiceInitialized = true;
        if (node('cardboardChoiceJump')) node('cardboardChoiceJump').hidden = !choice;
        replaceHtml(node('cardboardRoster'), UiCardBoard.buildRosterHtml(game.players, {
            selfIndex, currentIndex, selectedIndex, focusMode: false, escapeHtml, enabledLandmarks, events,
            playerSettings: facts.playerSettings,
            renderPlayerKindIcon: UiPlayerDisplay.renderPlayerKindIcon,
            playerKindAccessibleLabel: UiPlayerDisplay.playerKindAccessibleLabel,
        }));
        scrollMemory.restore('roster', node('cardboardRoster'));
        updateRosterOverflow();
        if (validIndex(eventFocusSeatIndex)) {
            node('cardboardRoster')?.querySelector(`.cardboard-roster-seat[data-cardboard-player-index="${eventFocusSeatIndex}"]`)
                ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: reducedMotionEnabled() ? 'auto' : 'smooth' });
        }
        const seats = node('cardboardSeats');
        seats.dataset.playerCount = String(game.players.length);
        const board = node('cardboardBoard');
        board.dataset.playerCount = String(game.players.length);
        board.classList.remove('cardboard-focus-view');
        const indices = UiCardBoard.selectTableIndices(game.players.length);
        const others = indices.filter(index => index !== selfIndex);
        let removedFocusedPanel = false;
        seats.querySelectorAll('.cardboard-player').forEach(element => {
            const index = Number(/** @type {HTMLElement} */ (element).dataset.playerIndex);
            if (!indices.includes(index)) {
                scrollMemory.capture(`player:${index}`, element);
                if (element.contains(document.activeElement)) removedFocusedPanel = true;
                element.remove();
            }
        });
        for (const index of indices) {
            let panel = seats.querySelector(`.cardboard-player[data-player-index="${index}"]`);
            if (!panel) {
                panel = document.createElement('section');
                panel.className = 'cardboard-player';
                /** @type {HTMLElement} */ (panel).dataset.playerIndex = String(index);
                seats.appendChild(panel);
            }
            const position = index === selfIndex ? 'bottom'
                : others.length === 1 ? 'top'
                    : others.length === 2 ? (index === others[0] ? 'left' : 'right')
                        : index === others[0] ? 'left' : index === others[1] ? 'top' : 'right';
            panel.classList.toggle('cardboard-player-self', index === selfIndex);
            panel.classList.toggle('cardboard-player-current', index === currentIndex);
            panel.classList.toggle('cardboard-player-selected', index === selectedIndex);
            /** @type {HTMLElement} */ (panel).dataset.seatPosition = position;
            replacePlayerHtml(panel, UiCardBoard.buildPlayerHtml(game.players[index], {
                index, selfIndex, currentIndex, enabledLandmarks, escapeHtml, events, contentOnly: true,
                playerSettings: facts.playerSettings,
                renderPlayerKindIcon: UiPlayerDisplay.renderPlayerKindIcon,
                playerKindAccessibleLabel: UiPlayerDisplay.playerKindAccessibleLabel,
                renderFacilityArt: UiBuildMenu.renderFacilityArt,
                renderTownScenery: null,
                getEffectText,
            }));
            for (const landmark of newlyBuiltLandmarks) {
                if (landmark.index !== index) continue;
                const button = Array.from(/** @type {NodeListOf<HTMLElement>} */ (panel.querySelectorAll('.cardboard-landmark'))).find(item => item.dataset.landmarkName === landmark.name);
                if (!button) continue;
                presentBuildCue(button, index, landmark.name, true);
            }
            for (const button of Array.from(panel.querySelectorAll('.cardboard-card'))) {
                const key = JSON.stringify([index, button.getAttribute('data-card-name')]);
                if (additionalActivations.has(key)) showAdditionalActivationCue(button, additionalActivations.get(key));
            }
            scrollMemory.restore(`player:${index}`, panel);
            const newBuild = newlyBuiltCards.find(build => build.playerIndex === index);
            const activatedCard = newRoll || freshResultLogs.length > 0
                ? panel.querySelector('.cardboard-card-activated') : null;
            const builtCard = newBuild
                ? Array.from(/** @type {NodeListOf<HTMLElement>} */ (panel.querySelectorAll('.cardboard-card'))).find(item => item.dataset.cardName === newBuild.name)
                : null;
            const card = activatedCard || builtCard;
            const cardList = card?.closest('.cardboard-cards');
            if (card && cardList) {
                revealInScrollport(card, cardList);
                if (builtCard === card) presentBuildCue(card, index, newBuild.name, false);
            }
        }
        if (removedFocusedPanel) {
            (/** @type {HTMLElement | null} */ (node('cardboardRoster')?.querySelector(`[data-cardboard-player-index="${selectedIndex}"]`)))
                ?.focus({ preventScroll: true });
        }
        arrangeCompactStatus();
        tableLayout?.refresh({ selfIndex: selfIndex ?? 0, playerCount: game.players.length, session });
        tableCamera?.refresh({ selfIndex: selfIndex ?? currentIndex, currentIndex, session });
        scheduleOwnerLabels();
        updateTown();
        const receipt = node('cardboardDiceReceipt');
        const disclosure = receipt.querySelector('details');
        const open = disclosure?.open;
        const previousDice = receipt.dataset.dice;
        const previousReceiptScroll = receipt.scrollTop;
        const dice = JSON.stringify([game.turnCount, currentIndex, events.dice]);
        const construction = events.important[0];
        const constructionMatch = ['build', 'landmark'].includes(construction?.kind)
            ? construction.message.match(/^(?:🏗️|🏆)\s+(.+)を建設！$/u) : null;
        const constructionPlayer = constructionMatch && game.players[construction.actorIndex];
        const headlineHtml = constructionPlayer ? UiCardBoard.buildConstructionReceiptHtml(constructionPlayer, {
            name: constructionMatch[1], landmark: construction.kind === 'landmark',
            enabledLandmarks, escapeHtml, renderFacilityArt: UiBuildMenu.renderFacilityArt,
        }) : '';
        // This enhances the current-turn receipt, without replaying a transient
        // construction event on redraw, Undo, restore, or theme changes.
        replaceHtml(receipt, UiTurnReceipt.buildHtml(events, escapeHtml, { headlineHtml, emphasizeIncome: true }));
        const nextDisclosure = receipt.querySelector('details');
        if (nextDisclosure) nextDisclosure.open = Boolean(open && receiptSession === session && previousDice === dice);
        receipt.scrollTop = freshResultLogs.length || previousDice !== dice ? 0 : previousReceiptScroll;
        receipt.dataset.dice = dice;
        receiptSession = session;
        if (freshResultLogs.length) {
            const announceResult = node('turnStatusAnnouncer');
            if (announceResult) {
                const participantName = index => Number.isInteger(index)
                    ? freshEvents.participantNames[index] || `席${index + 1}`
                    : index === 'pool' ? '分配プール' : '銀行';
                const diceText = freshEvents.dice
                    ? `出目${freshEvents.dice.values.length > 1
                        ? `${freshEvents.dice.values.join('+')}=${freshEvents.dice.base}`
                        : freshEvents.dice.base}${freshEvents.dice.harbor ? `、港効果後${freshEvents.dice.effective}` : ''}${freshEvents.dice.rerolled ? '、振り直し' : ''}`
                    : '出目の結果';
                const activationsById = new Map();
                const legacyFacilityRecords = [];
                for (const event of freshEvents.activations) {
                    if (!event.facility) continue;
                    if (!event.activation) { legacyFacilityRecords.push(event); continue; }
                    const repeats = Number.isSafeInteger(event.count) && event.count > 0 ? event.count : 1;
                    const previous = activationsById.get(event.activation);
                    activationsById.set(event.activation, previous
                        ? { ...previous, repeats: Math.max(previous.repeats, repeats) }
                        : { event, repeats });
                }
                const confirmedActivations = [...activationsById.values()];
                const facilityCount = confirmedActivations.reduce((total, activation) =>
                    Number.isSafeInteger(total + activation.repeats) ? total + activation.repeats : total, 0);
                const facilityNames = confirmedActivations.slice(0, 3).map(({ event }) =>
                    `${Number.isInteger(event.owner) ? `${participantName(event.owner)}の` : ''}${event.subject}`);
                const transferRoutes = (typeof CardBoardTransfers !== 'undefined'
                    ? CardBoardTransfers.project(freshEvents) : []).filter(route => route.amount > 0);
                const routes = transferRoutes.slice(0, 3).map(route => route.text);
                announceResult.textContent = [
                    freshEvents.actorName ? `${freshEvents.actorName}の結果` : '',
                    diceText,
                    facilityCount ? `施設発動${facilityCount}回${facilityNames.length ? `：${facilityNames.join('、')}` : ''}`
                        : legacyFacilityRecords.length ? `施設の発動記録${legacyFacilityRecords.length}件` : '施設発動なし',
                    ...routes,
                    transferRoutes.length > routes.length ? `ほか${transferRoutes.length - routes.length}件のコイン移動は画面の収支欄で確認` : '',
                    freshEvents.omittedActivations ? `ほか${freshEvents.omittedActivations}件は内訳で確認` : '',
                    freshEvents.incomplete ? '未集計の効果があります。内訳を確認してください' : '',
                ].filter(Boolean).join('。');
                resultAnnouncement = announceResult.textContent;
            }
            // Camera layout is queued earlier in this draw. Read the flight
            // endpoints after that layout, without replaying the result on redraw.
            if (transferFrame !== null) globalThis.cancelAnimationFrame(transferFrame);
            const sequence = ++transferSequence;
            const capturedSession = session;
            const capturedTurn = game.turnCount;
            const capturedActor = currentIndex;
            const capturedReroll = game.usedReroll === true;
            transferFrame = globalThis.requestAnimationFrame(() => {
                transferFrame = null;
                if (sequence !== transferSequence || !mounted || !enabled() || document.hidden ||
                        facts?.replaying || session !== capturedSession || facts?.game?.turnCount !== capturedTurn ||
                        facts?.game?.currentPlayerIndex !== capturedActor || (facts?.game?.usedReroll === true) !== capturedReroll ||
                        node('gameScreen')?.style.display === 'none') return;
                if (freshDiceResolution) {
                    // The turn greeting has served its purpose once the dice
                    // resolve. Give the result and real facilities the stage.
                    facts.onDiceResult?.();
                }
                if (newRoll && freshDiceResolution && freshEvents?.dice?.values?.length) {
                    node('cardboardDiceConfirmation')?.remove();
                    const dice = freshEvents.dice.values;
                    const confirmation = document.createElement('span');
                    confirmation.id = 'cardboardDiceConfirmation';
                    confirmation.className = 'cardboard-dice-confirmation';
                    confirmation.setAttribute('aria-hidden', 'true');
                    const total = document.createElement('span');
                    total.className = 'cardboard-confirmation-total';
                    total.textContent = dice.length === 1 ? `出目 ${dice[0]}` : `${dice.join(' + ')} = ${freshEvents.dice.base}`;
                    if (typeof UiDiceDisplay !== 'undefined') {
                        const faces = document.createElement('span');
                        faces.className = 'cardboard-confirmation-faces';
                        faces.innerHTML = dice.map(value => UiDiceDisplay.buildFaceHtml(value, { decorative: true })).join('');
                        confirmation.appendChild(faces);
                    }
                    confirmation.appendChild(total);
                    node('cardboardBoard').appendChild(confirmation);
                }
                if (!activationTags && typeof CardBoardActivationTags !== 'undefined') {
                    activationTags = CardBoardActivationTags.create({ container: node('cardboardBoard'), viewport: node('cardboardTableViewport') });
                }
                activationTags?.play({ events: freshEvents, players: game.players, reducedMotion: reducedMotionEnabled(),
                    delayMs: newRoll && freshDiceResolution ? 500 : 0, isCurrent: () =>
                    sequence === transferSequence && mounted && enabled() && !document.hidden && !facts?.replaying &&
                    session === capturedSession && facts?.game?.turnCount === capturedTurn &&
                    facts?.game?.currentPlayerIndex === capturedActor && (facts?.game?.usedReroll === true) === capturedReroll });
                transfers?.play({ container: node('cardboardBoard'), summaryContainer: node('cardboardDiceReceipt'),
                    events: freshEvents, delayMs: newRoll && freshDiceResolution ? 500 : 0 });
            });
        }
        if (newRoll) {
            if (feedbackTimer !== null) clearTimeout(feedbackTimer);
            const board = node('cardboardBoard');
            board.classList.remove('cardboard-new-roll', 'cardboard-roll-reviewed');
            // Reuse the loaded card artwork while starting this actual roll's
            // pulse afresh, including a quick reroll of the same facilities.
            if (!reducedMotionEnabled()) void board.offsetWidth;
            board.classList.add('cardboard-new-roll');
            const preview = node('cardboardEventDetails');
            if (!facts.replaying && !reducedMotionEnabled() && !document.hidden &&
                    preview?.querySelectorAll('.cardboard-event-preview-card').length > 1) {
                preview.classList.add('cardboard-preview-playing');
            }

            feedbackTimer = setTimeout(() => {
                feedbackTimer = null;
                node('cardboardBoard')?.classList.remove('cardboard-new-roll', 'cardboard-roll-reviewed');
            // The eighth activation can start 560ms after the first and runs
            // for 760ms. Keep the roll state through the final highlight.
            }, CARDBOARD_ROLL_FEEDBACK_MS);
        }
        if ((newRoll || freshResultLogs.length > 0) && !facts.replaying &&
                currentIndex === selfIndex && game.phase === GAME_PHASES.BUILD && game.builtThisTurn !== true) {
            // The enclosing UI refreshes the board before rebuilding market
            // markup. Defer the reveal to updateMarket so it targets this roll.
            revealDiceCandidateAfterMarketUpdate = true;
        }
    }

    function render(nextFacts) {
        initialize();
        if (nextFacts.session !== session) {
            detach();
            scrollMemory.clear();
            selectedIndex = null;
            focusTurnIndex = null;
            previousChoice = null;
            previousBuiltLandmarks = null;
            choiceInitialized = false;
            clearFeedback();
            feedback?.reset();
            session = nextFacts.session;
        }
        facts = nextFacts;
        draw();
        updatePlayerOverflow();
    }
    function syncViewport() {
        const screen = node('gameScreen');
        if (!mounted || !enabled() || document.hidden || !screen?.getClientRects().length) return false;
        return tableCamera?.syncViewport() === true;
    }
    return Object.freeze({ render, updateMarket, syncViewport, detach, closeDisclosures, openMarket, closeMarket, suspendMarketForDetail, resumeMarketAfterDetail, closeTown, createScrollMemory });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CardBoardField;
if (typeof window !== 'undefined') window.CardBoardField = CardBoardField;
