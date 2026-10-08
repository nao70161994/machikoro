'use strict';
/* global queueMicrotask, GAME_PHASES, MutationObserver, CardBoardTransfers, CardBoardFeedback, UiCardBoard, UiTurnEvents, UiTurnReceipt, UiBuildMenu, DesignTheme, CARDS, Player */

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
    let session = null;
    let receiptSession = null;
    let feedbackTimer = null;
    let previousChoice = null;
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

    function clearFeedback() {
        transfers?.clear();
        if (feedbackTimer !== null) clearTimeout(feedbackTimer);
        feedbackTimer = null;
        node('cardboardBoard')?.classList.remove('cardboard-new-roll');
    }

    function detach() {
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
        scrollMemory.restore('market', node('cardboardMarket'));
    }

    function initialize() {
        if (initialized || !node('cardboardBoard')) return;
        initialized = true;
        node('cardboardBoard').addEventListener('toggle', event => {
            const details = /** @type {HTMLDetailsElement} */ (event.target);
            if (!details.matches?.(disclosureSelector) || !details.open) return;
            closeDisclosures(details);
            facts?.closeLog?.();
        }, true);
        const clearHiddenFeedback = () => {
            if (document.hidden || node('gameScreen')?.style.display === 'none') {
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
                focusVisible(target);
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
        const target = summaryFocused ? Array.from(element.querySelectorAll('details')).find(details => details.className === disclosureClass)?.querySelector('summary') : Array.from(element.querySelectorAll('button')).find(button =>
            seat !== undefined ? button.dataset.cardboardPlayerIndex === seat
                : button.dataset.action === action && button.dataset.cardName === card && button.dataset.landmarkName === landmark && button.dataset.cardFilter === filter);
        focusVisible(target);
    }

    function draw() {
        if (!facts || !node('cardboardBoard')) return;
        if (!enabled()) { detach(); return; }
        const { game, escapeHtml, enabledLandmarks } = facts;
        if (!game?.players?.length) return;
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
        const events = UiTurnEvents.project(game.log, {
            players: game.players, turnPlayerIndex: currentIndex, display: facts.display,
            cardNames: CARDS.map(card => card.name), landmarkNames: Player.landmarkNames(), maxActivations: 1000,
        });
        replaceHtml(node('cardboardRoster'), UiCardBoard.buildRosterHtml(game.players, {
            selfIndex, currentIndex, selectedIndex, escapeHtml, enabledLandmarks,
        }));
        scrollMemory.restore('roster', node('cardboardRoster'));
        const seats = node('cardboardSeats');
        seats.dataset.playerCount = String(game.players.length);
        node('cardboardBoard').dataset.playerCount = String(game.players.length);
        const indices = UiCardBoard.selectDetailIndices(game.players.length, { selfIndex, currentIndex, selectedIndex });
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
            /** @type {HTMLElement} */ (panel).dataset.seatPosition = position;
            replaceHtml(panel, UiCardBoard.buildPlayerHtml(game.players[index], {
                index, selfIndex, currentIndex, enabledLandmarks, escapeHtml, events, contentOnly: true,
                renderFacilityArt: UiBuildMenu.renderFacilityArt,
            }));
            scrollMemory.restore(`player:${index}`, panel);
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
            previousChoice = null;
            choiceInitialized = false;
            clearFeedback();
            feedback?.reset();
            session = nextFacts.session;
        }
        facts = nextFacts;
        draw();
    }
    return Object.freeze({ render, updateMarket, detach, closeDisclosures, createScrollMemory });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CardBoardField;
if (typeof window !== 'undefined') window.CardBoardField = CardBoardField;
