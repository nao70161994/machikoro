'use strict';
/* global queueMicrotask, GAME_PHASES, MutationObserver, CardBoardTransfers, CardBoardFeedback, UiCardBoard, UiTurnEvents, UiTurnReceipt, UiBuildMenu, UiPlayerDisplay, PlazaField, DesignTheme, CARDS, Player */

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
    let mounted = false;
    let actionOrigin = null;
    let toolbarOrigin = null;
    let guideOrigin = null;
    let selectedIndex = null;
    let focusTurnIndex = null;
    let session = null;
    let receiptSession = null;
    let resultAnnouncement = '';
    let feedbackTimer = null;
    let buildCueTimer = null;
    let buildCueCard = null;
    let buildCueListener = null;
    const landmarkCues = new Map();
    let previousChoice = null;
    let previousBuiltLandmarks = null;
    let previousBuildLog = null;
    let marketHome = null;
    let marketLauncher = null;
    let restoreMarketFocus = true;
    let choiceInitialized = false;
    let themeFocus = null;
    const transfers = typeof CardBoardTransfers !== 'undefined' ? CardBoardTransfers.create() : null;
    const feedback = typeof CardBoardFeedback !== 'undefined' ? CardBoardFeedback.create() : null;
    const disclosureSelector = '.compact-market-filter-disclosure, .compact-market-goal-disclosure, .plaza-receipt-details, .plaza-guide-disclosure, .game-action-toolbar > details';
    function closeDisclosures(except = null) {
        node('cardboardBoard')?.querySelectorAll(disclosureSelector).forEach(element => {
            const details = /** @type {HTMLDetailsElement} */ (element);
            if (details !== except) details.open = false;
        });
    }
    const node = id => document.getElementById(id);
    const enabled = () => document.documentElement.dataset.design === 'cardboard';

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
        const targetBounds = target.getBoundingClientRect();
        const scrollBounds = scrollport.getBoundingClientRect();
        if (targetBounds.left < scrollBounds.left) scrollport.scrollLeft += targetBounds.left - scrollBounds.left;
        else if (targetBounds.right > scrollBounds.right) scrollport.scrollLeft += targetBounds.right - scrollBounds.right;
        if (targetBounds.top < scrollBounds.top) scrollport.scrollTop += targetBounds.top - scrollBounds.top;
        else if (targetBounds.bottom > scrollBounds.bottom) scrollport.scrollTop += targetBounds.bottom - scrollBounds.bottom;
    }

    function clearBuildCue() {
        if (buildCueTimer !== null) clearTimeout(buildCueTimer);
        buildCueTimer = null;
        if (buildCueCard && buildCueListener) buildCueCard.removeEventListener('animationend', buildCueListener);
        buildCueListener = null;
        buildCueCard?.classList.remove('cardboard-card-newly-built');
        buildCueCard = null;
    }

    function showBuildCue(card, animate) {
        clearBuildCue();
        card.classList.remove('cardboard-card-newly-built');
        if (animate) void card.offsetWidth;
        card.classList.add('cardboard-card-newly-built');
        buildCueCard = card;
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

    function clearFeedback() {
        transfers?.clear();
        const announcer = node('turnStatusAnnouncer');
        if (resultAnnouncement && announcer?.textContent === resultAnnouncement) announcer.textContent = '';
        resultAnnouncement = '';
        if (feedbackTimer !== null) clearTimeout(feedbackTimer);
        feedbackTimer = null;
        clearBuildCue();
        clearLandmarkCues();
        node('cardboardBoard')?.classList.remove('cardboard-new-roll');
        node('cardboardBoard')?.querySelectorAll('.cardboard-card-newly-built').forEach(card => card.classList.remove('cardboard-card-newly-built'));
    }

    function restoreMarketNode() {
        const market = node('cardboardMarket');
        const home = marketHome;
        if (market && home?.parent?.isConnected) {
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
        const launcher = marketLauncher?.isConnected ? marketLauncher : node('cardboardMarket')?.querySelector('.compact-market-expand');
        marketLauncher = null;
        if (restoreMarketFocus && enabled() && node('gameScreen')?.style.display !== 'none') {
            launcher?.focus({ preventScroll: true });
        }
        restoreMarketFocus = true;
    }

    function closeMarket(restoreFocus = true) {
        const dialog = node('cardboardMarketDialog');
        restoreMarketFocus = restoreFocus;
        setMarketExpanded(false);
        const wasOpen = dialog?.open === true;
        if (wasOpen) dialog.close();
        restoreMarketNode();
        if (!wasOpen) finishMarketClose();
    }

    function openMarket() {
        const dialog = node('cardboardMarketDialog');
        const market = node('cardboardMarket');
        const slot = node('cardboardMarketDialogSlot');
        if (!enabled() || !dialog || !market || !slot || typeof dialog.showModal !== 'function') return false;
        if (dialog.open) return true;
        marketLauncher = document.activeElement;
        marketHome = { parent: market.parentNode, nextSibling: market.nextSibling };
        slot.appendChild(market);
        dialog.showModal();
        setMarketExpanded(true);
        (market.querySelector('.compact-market-buy:not(:disabled), .compact-market-detail') || node('cardboardMarketClose'))?.focus({ preventScroll: true });
        return true;
    }

    function detach() {
        closeMarket(false);
        previousChoice = null;
        choiceInitialized = false;
        clearFeedback();
        feedback?.reset();
        if (!mounted) return;
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
        receiptSession = null;
        node('cardboardRoster').replaceChildren();
        node('cardboardBoard').hidden = true;
        mounted = false;
    }

    function updateMarket(html) {
        if (!mounted || typeof html !== 'string') return;
        replaceHtml(node('cardboardMarket'), html);
        setMarketExpanded(node('cardboardMarketDialog')?.open === true);
        scrollMemory.restore('market', node('cardboardMarket'));
    }

    function initialize() {
        if (initialized || !node('cardboardBoard')) return;
        initialized = true;
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
        node('cardboardBoard').addEventListener('toggle', event => {
            const details = /** @type {HTMLDetailsElement} */ (event.target);
            if (!details.matches?.(disclosureSelector) || !details.open) return;
            closeDisclosures(details);
            facts?.closeLog?.();
        }, true);
        const clearHiddenFeedback = () => {
            if (document.hidden || node('gameScreen')?.style.display === 'none') {
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
        node('cardboardMarketClose')?.addEventListener('click', () => closeMarket());
        node('cardboardMarketDialog')?.addEventListener('close', finishMarketClose);
        node('cardboardMarketDialog')?.addEventListener('click', event => {
            if (event.target === event.currentTarget) closeMarket();
        });
        node('cardboardCompareToggle')?.addEventListener('click', () => PlazaField.toggleComparison());
        document.addEventListener('visibilitychange', clearHiddenFeedback);
        new MutationObserver(clearHiddenFeedback).observe(node('gameScreen'), { attributes: true, attributeFilter: ['style'] });
        node('cardboardRoster').addEventListener('click', event => {
            const button = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-cardboard-player-index]'));
            if (!button) return;
            selectedIndex = Number(button.dataset.cardboardPlayerIndex);
            draw();
            node('cardboardSeats').querySelector(`[data-player-index="${selectedIndex}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
        const filter = focused?.dataset.cardFilter;
        const summaryFocused = focused?.tagName === 'SUMMARY';
        const disclosureClass = summaryFocused ? focused.parentElement?.className : null;
        const scrollTop = element.scrollTop;
        const childScroll = ['.cardboard-cards', '.cardboard-landmarks', '.compact-market-facilities'].map(selector => ({
            selector, top: element.querySelector(selector)?.scrollTop || 0,
            left: element.querySelector(selector)?.scrollLeft || 0,
        }));
        const disclosures = ['.compact-market-filter-disclosure', '.compact-market-goal-disclosure'].map(selector => ({
            selector, open: (/** @type {HTMLDetailsElement | null} */ (element.querySelector(selector)))?.open,
        }));
        element.innerHTML = html;
        for (const disclosure of disclosures) {
            const child = /** @type {HTMLDetailsElement | null} */ (element.querySelector(disclosure.selector));
            if (child && disclosure.open !== undefined) child.open = disclosure.open;
        }
        element.scrollTop = scrollTop;
        for (const position of childScroll) {
            const child = element.querySelector(position.selector);
            if (child) { child.scrollTop = position.top; child.scrollLeft = position.left; }
        }
        if (!focused) return;
        const buttons = Array.from(element.querySelectorAll('button'));
        const matchesFocus = button => seat !== undefined ? button.dataset.cardboardPlayerIndex === seat
            : button.dataset.action === action && button.dataset.cardName === card &&
                button.dataset.landmarkName === landmark && button.dataset.cardFilter === filter;
        let target = summaryFocused
            ? Array.from(element.querySelectorAll('details')).find(details => details.className === disclosureClass)?.querySelector('summary')
            : buttons.find(button => !button.disabled && matchesFocus(button));
        if (!target && ['buildCard', 'buildLandmark'].includes(action)) {
            target = buttons.find(button => !button.disabled && button.dataset.action === action) ||
                (node('cardboardMarketDialog')?.open ? node('cardboardMarketClose') : null);
        }
        focusVisible(target);
    }

    function draw() {
        if (!facts || !node('cardboardBoard')) return;
        const { game, escapeHtml, enabledLandmarks } = facts;
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
        if (buildMilestones.length) facts.onBuildMilestones?.(buildMilestones);
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
                    node('cardboardControls').appendChild(toolbar);
                }
            }
            const guide = node('tutorialBox');
            if (guide) {
                guideOrigin = document.createComment('cardboard guide origin');
                guide.parentNode.insertBefore(guideOrigin, guide);
                node('cardboardControls').appendChild(guide);
            }
            node('cardboardBoard').hidden = false;
            mounted = true;
        }
        const validIndex = index => Number.isInteger(index) && index >= 0 && index < game.players.length;
        const currentIndex = validIndex(game.currentPlayerIndex) ? game.currentPlayerIndex : 0;
        const selfIndex = validIndex(facts.selfIndex) ? facts.selfIndex : currentIndex;
        const turnChanged = focusTurnIndex !== currentIndex;
        if (turnChanged) {
            selectedIndex = currentIndex;
            focusTurnIndex = currentIndex;
        }
        if (!validIndex(selectedIndex)) selectedIndex = selfIndex;
        const newRoll = feedback?.refresh(facts) === true;
        if (facts.replaying || feedback?.wasInvalidated()) clearFeedback();
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
        const events = turnEventsFor(game, facts.display);
        replaceHtml(node('cardboardRoster'), UiCardBoard.buildRosterHtml(game.players, {
            selfIndex, currentIndex, selectedIndex, escapeHtml, enabledLandmarks, events,
            playerSettings: facts.playerSettings,
            renderPlayerKindIcon: UiPlayerDisplay.renderPlayerKindIcon,
            playerKindAccessibleLabel: UiPlayerDisplay.playerKindAccessibleLabel,
        }));
        scrollMemory.restore('roster', node('cardboardRoster'));
        const seats = node('cardboardSeats');
        seats.dataset.playerCount = String(game.players.length);
        const board = node('cardboardBoard');
        board.dataset.playerCount = String(game.players.length);
        board.classList.toggle('cardboard-focus-view', game.players.length >= 2 && game.players.length <= 10);
        if (turnChanged && board.classList.contains('cardboard-focus-view')) {
            const currentSeat = node('cardboardRoster')?.querySelector('.cardboard-roster-seat[aria-current="true"]');
            currentSeat?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotionEnabled() ? 'auto' : 'smooth' });
        }
        const indices = UiCardBoard.selectDetailIndices(game.players.length, { selfIndex, currentIndex, selectedIndex });
        const animateNewCards = newlyBuiltCards.length > 0 && !reducedMotionEnabled();
        const others = indices.filter(index => index !== selfIndex);
        seats.querySelectorAll('.cardboard-player').forEach(element => {
            if (!indices.includes(Number(/** @type {HTMLElement} */ (element).dataset.playerIndex))) element.remove();
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
            replaceHtml(panel, UiCardBoard.buildPlayerHtml(game.players[index], {
                index, selfIndex, currentIndex, enabledLandmarks, escapeHtml, events, contentOnly: true,
                playerSettings: facts.playerSettings,
                renderPlayerKindIcon: UiPlayerDisplay.renderPlayerKindIcon,
                playerKindAccessibleLabel: UiPlayerDisplay.playerKindAccessibleLabel,
                renderFacilityArt: UiBuildMenu.renderFacilityArt,
            }));
            for (const landmark of newlyBuiltLandmarks) {
                if (landmark.index !== index) continue;
                const button = Array.from(/** @type {NodeListOf<HTMLElement>} */ (panel.querySelectorAll('.cardboard-landmark'))).find(item => item.dataset.landmarkName === landmark.name);
                if (!button) continue;
                showLandmarkCue(button, !reducedMotionEnabled());
            }
            scrollMemory.restore(`player:${index}`, panel);
            const newBuild = newlyBuiltCards.find(build => build.playerIndex === index);
            const activatedCard = newRoll ? panel.querySelector('.cardboard-card-activated') : null;
            const builtCard = newBuild
                ? Array.from(panel.querySelectorAll('.cardboard-card')).find(item => item.dataset.cardName === newBuild.name)
                : null;
            const card = activatedCard || builtCard;
            const cardList = card?.closest('.cardboard-cards');
            if (card && cardList) {
                revealInScrollport(card, cardList);
                if (builtCard === card) showBuildCue(card, animateNewCards);
            }
        }
        const receipt = node('cardboardDiceReceipt');
        const disclosure = receipt.querySelector('details');
        const open = disclosure?.open;
        const previousDice = receipt.dataset.dice;
        const dice = JSON.stringify([game.turnCount, currentIndex, events.dice]);
        replaceHtml(receipt, UiTurnReceipt.buildHtml(events, escapeHtml));
        const nextDisclosure = receipt.querySelector('details');
        if (nextDisclosure) nextDisclosure.open = Boolean(open && receiptSession === session && previousDice === dice);
        receipt.dataset.dice = dice;
        receiptSession = session;
        const freshResultLogs = feedback?.takeResultLogs() || [];
        if (freshResultLogs.length) {
            const freshEvents = UiTurnEvents.project(freshResultLogs, {
                players: game.players, turnPlayerIndex: currentIndex, display: facts.display,
                cardNames: CARDS.map(card => card.name), landmarkNames: Player.landmarkNames(), maxActivations: 1000,
            });
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
                const routes = freshEvents.activations.filter(event => event.facility && event.amount > 0).slice(0, 2).map(event => {
                    const facility = `${Number.isInteger(event.owner) ? `${participantName(event.owner)}の` : ''}${event.subject}`;
                    return `${facility}、${participantName(event.from)}から${participantName(event.to)}へ${event.amount}コイン`;
                });
                announceResult.textContent = [
                    freshEvents.actorName ? `${freshEvents.actorName}の結果` : '',
                    diceText,
                    facilityCount ? `施設発動${facilityCount}回${facilityNames.length ? `：${facilityNames.join('、')}` : ''}`
                        : legacyFacilityRecords.length ? `施設の発動記録${legacyFacilityRecords.length}件` : '施設発動なし',
                    ...routes,
                    freshEvents.omittedActivations ? `ほか${freshEvents.omittedActivations}件は内訳で確認` : '',
                    freshEvents.incomplete ? '未集計の効果があります。内訳を確認してください' : '',
                ].filter(Boolean).join('。');
                resultAnnouncement = announceResult.textContent;
            }
            transfers?.play({ container: node('cardboardBoard'), events: freshEvents });
        }
        if (newRoll) {
            if (feedbackTimer !== null) clearTimeout(feedbackTimer);
            node('cardboardBoard').classList.add('cardboard-new-roll');

            feedbackTimer = setTimeout(() => {
                feedbackTimer = null;
                node('cardboardBoard')?.classList.remove('cardboard-new-roll');
            }, 900);
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
    }
    return Object.freeze({ render, updateMarket, detach, closeDisclosures, openMarket, closeMarket, createScrollMemory });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CardBoardField;
if (typeof window !== 'undefined') window.CardBoardField = CardBoardField;
