'use strict';
/* global UiCardBoard, UiPlazaEvents, UiBuildMenu, PlazaField, CARDS, Player */

// Presentation state only: no game actions, storage, random calls or rule updates.
const CardBoardField = (() => {
    let facts = null;
    let initialized = false;
    let mounted = false;
    let selectedIndex = null;
    let marketAnchor = null;
    let session = null;
    let receiptSession = null;
    const node = id => document.getElementById(id);
    const enabled = () => document.documentElement.dataset.design === 'cardboard';

    function detach() {
        if (!mounted) return;
        const market = node('buildMenu');
        const goals = node('cardboardGoalsBody');
        // Restore the original nodes, preserving delegated actions and market identity.
        for (const section of Array.from(goals.children)) market.appendChild(section);
        if (market.parentElement === node('cardboardMarket') && marketAnchor?.parentNode) {
            marketAnchor.parentNode.insertBefore(market, marketAnchor);
        }
        marketAnchor?.remove();
        marketAnchor = null;
        node('cardboardSeats').querySelectorAll('.cardboard-player').forEach(element => element.remove());
        node('cardboardDiceReceipt').replaceChildren();
        receiptSession = null;
        node('cardboardRoster').replaceChildren();
        node('cardboardBoard').hidden = true;
        mounted = false;
    }

    function updateMarket() {
        if (!mounted) return;
        const market = node('buildMenu');
        const body = node('cardboardGoalsBody');
        // renderBuildMenu replaces its children; never retain an obsolete action button.
        const sections = Array.from(market.querySelectorAll('.build-section')).filter(section => !section.classList.contains('build-card-section'));
        if (sections.length) {
            body.replaceChildren();
            for (const section of sections) body.appendChild(section);
        }
        node('cardboardGoals').hidden = !body.children.length || facts?.game.currentPlayerIndex !== facts?.selfIndex;
    }

    function initialize() {
        if (initialized || !node('cardboardBoard')) return;
        initialized = true;
        node('cardboardRoster').addEventListener('click', event => {
            const button = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-cardboard-player-index]'));
            if (!button) return;
            selectedIndex = Number(button.dataset.cardboardPlayerIndex);
            draw();
            node('cardboardSeats').querySelector(`[data-player-index="${selectedIndex}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        });
        document.addEventListener('design-theme-change', () => {
            // The existing plaza must restore its shared market before we take it.
            if (!enabled()) detach();
            if (typeof PlazaField !== 'undefined') PlazaField.sync();
            draw();
        });
    }

    function replaceHtml(element, html) {
        if (element.innerHTML === html) return;
        const active = document.activeElement;
        const focused = element.contains(active) ? /** @type {HTMLElement} */ (active) : null;
        const action = focused?.dataset.action;
        const card = focused?.dataset.cardName;
        const landmark = focused?.dataset.landmarkName;
        const seat = focused?.dataset.cardboardPlayerIndex;
        const summaryFocused = focused?.tagName === 'SUMMARY';
        const scrollTop = element.scrollTop;
        const childScroll = ['.cardboard-cards', '.cardboard-landmarks'].map(selector => ({
            selector, top: element.querySelector(selector)?.scrollTop || 0,
            left: element.querySelector(selector)?.scrollLeft || 0,
        }));
        element.innerHTML = html;
        element.scrollTop = scrollTop;
        for (const position of childScroll) {
            const child = element.querySelector(position.selector);
            if (child) { child.scrollTop = position.top; child.scrollLeft = position.left; }
        }
        if (!focused) return;
        const target = summaryFocused ? element.querySelector('summary') : Array.from(element.querySelectorAll('button')).find(button =>
            seat !== undefined ? button.dataset.cardboardPlayerIndex === seat
                : button.dataset.action === action && button.dataset.cardName === card && button.dataset.landmarkName === landmark);
        target?.focus({ preventScroll: true });
    }

    function draw() {
        if (!facts || !node('cardboardBoard')) return;
        if (!enabled()) { detach(); return; }
        const { game, escapeHtml, enabledLandmarks } = facts;
        if (!game?.players?.length) return;
        if (!mounted) {
            const market = node('buildMenu');
            marketAnchor = document.createComment('cardboard-market-origin');
            market.parentNode.insertBefore(marketAnchor, market);
            node('cardboardMarket').appendChild(market);
            node('cardboardBoard').hidden = false;
            mounted = true;
        }
        const validIndex = index => Number.isInteger(index) && index >= 0 && index < game.players.length;
        const currentIndex = validIndex(game.currentPlayerIndex) ? game.currentPlayerIndex : 0;
        const selfIndex = validIndex(facts.selfIndex) ? facts.selfIndex : currentIndex;
        if (!validIndex(selectedIndex)) selectedIndex = selfIndex;
        const events = UiPlazaEvents.project(game.log, {
            players: game.players, turnPlayerIndex: currentIndex, display: facts.display,
            cardNames: CARDS.map(card => card.name), landmarkNames: Player.landmarkNames(), maxActivations: 1000,
        });
        replaceHtml(node('cardboardRoster'), UiCardBoard.buildRosterHtml(game.players, {
            selfIndex, currentIndex, selectedIndex, escapeHtml, enabledLandmarks,
        }));
        const seats = node('cardboardSeats');
        seats.dataset.playerCount = String(game.players.length);
        const indices = game.players.length <= 4
            ? game.players.map((_, index) => index)
            : [...new Set([selfIndex, currentIndex, selectedIndex])];
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
        }
        const receipt = node('cardboardDiceReceipt');
        const disclosure = receipt.querySelector('details');
        const open = disclosure?.open;
        const previousDice = receipt.dataset.dice;
        const dice = JSON.stringify([game.turnCount, currentIndex, events.dice]);
        replaceHtml(receipt, UiPlazaEvents.buildReceiptHtml(events, escapeHtml));
        const nextDisclosure = receipt.querySelector('details');
        if (nextDisclosure) nextDisclosure.open = Boolean(open && receiptSession === session && previousDice === dice);
        receipt.dataset.dice = dice;
        receiptSession = session;
        updateMarket();
    }

    function render(nextFacts) {
        initialize();
        if (nextFacts.session !== session) {
            selectedIndex = null;
            session = nextFacts.session;
        }
        facts = nextFacts;
        draw();
    }
    return Object.freeze({ render, updateMarket, detach });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CardBoardField;
if (typeof window !== 'undefined') window.CardBoardField = CardBoardField;
