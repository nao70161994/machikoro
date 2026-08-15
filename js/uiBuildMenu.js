'use strict';

const UiBuildMenu = (() => {
    const CARD_FILTER_DEFS = Object.freeze([
        Object.freeze({ color: '', label: '全て' }),
        Object.freeze({ color: 'blue', label: '青' }),
        Object.freeze({ color: 'green', label: '緑' }),
        Object.freeze({ color: 'red', label: '赤' }),
        Object.freeze({ color: 'purple', label: '紫' }),
        Object.freeze({ color: 'affordable', label: '建設可' }),
    ]);

    function cardFilterTransition(currentFilter, requestedFilter) {
        return Object.freeze({
            cardFilter: requestedFilter,
            changed: currentFilter !== requestedFilter,
            shouldRender: true,
        });
    }

    function createFilterController(initialFilter = '') {
        let cardFilter = initialFilter;

        function get() {
            return cardFilter;
        }

        function set(requestedFilter) {
            const transition = cardFilterTransition(cardFilter, requestedFilter);
            cardFilter = transition.cardFilter;
            return transition;
        }

        function clear() {
            cardFilter = '';
        }

        function snapshot() {
            return Object.freeze({ cardFilter });
        }

        return Object.freeze({ get, set, clear, snapshot });
    }

    function safeCardColorName(color) {
        return ['blue', 'green', 'red', 'purple'].includes(color) ? color : 'blue';
    }

    function escapeText(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function isBuildGateOpen(options) {
        const { phase, buildPhase, pendingRenovation, builtThisTurn } = options;
        return phase === buildPhase && pendingRenovation <= 0 && !builtThisTurn;
    }

    function includesAction(allowedActions, action) {
        return allowedActions && typeof allowedActions.has === 'function'
            ? allowedActions.has(action)
            : Array.isArray(allowedActions) && allowedActions.includes(action);
    }

    function buildActionState(options) {
        const buildGateOpen = isBuildGateOpen(options);
        const { isHumanTurn, allowedActions } = options;
        return Object.freeze({
            buildGateOpen,
            canBuildCardAction: buildGateOpen && !!isHumanTurn && includesAction(allowedActions, 'buildCard'),
            canBuildLandmarkAction: buildGateOpen && !!isHumanTurn && includesAction(allowedActions, 'buildLandmark'),
        });
    }

    function buildShortcutView(options = {}) {
        const buildActionAvailable = includesAction(options.allowedActions, 'buildCard') ||
            includesAction(options.allowedActions, 'buildLandmark');
        const visible = options.phase === options.buildPhase &&
            options.hasPending !== true && options.builtThisTurn !== true &&
            options.isHumanTurn === true && options.isReplaying !== true &&
            options.inputBlocked !== true && buildActionAvailable;
        return Object.freeze({
            visible,
            display: visible ? 'block' : 'none',
            disabled: !visible,
            ariaHidden: visible ? 'false' : 'true',
        });
    }

    function applyBuildShortcutView(button, view) {
        if (!button || !view) return false;
        button.style.display = view.display;
        button.disabled = view.disabled;
        if (typeof button.setAttribute === 'function') {
            button.setAttribute('aria-hidden', view.ariaHidden);
        }
        return true;
    }

    function focusAndScrollToBuildMenu(target) {
        if (!target || typeof target.focus !== 'function' ||
                typeof target.scrollIntoView !== 'function') return false;
        try {
            target.focus({ preventScroll: true });
        } catch (_) {
            try {
                target.focus();
            } catch (_) {
                return false;
            }
        }
        target.scrollIntoView({ block: 'start' });
        return true;
    }

    function undoBuildActionState(options) {
        const visible = !!options.hasUndoState && !!options.hasGame && !!options.builtThisTurn &&
            includesAction(options.allowedActions, 'undoBuild');
        return Object.freeze({ visible, enabled: visible && !!options.isHumanTurn });
    }

    function buildUndoBuildButtonHtml(state) {
        return state && state.visible
            ? `<button class="undo-btn" data-action="undoBuild"${state.enabled ? '' : ' disabled'}>↩ 建設を取り消す</button>`
            : '';
    }

    function renderBuildCardButton(options) {
        const { card, stock, canBuildThis, escapeHtml, getEffectText, highlighted = false } = options;
        const safeName = escapeHtml(card.name);
        const safeColor = safeCardColorName(card.color);
        const highlightClass = highlighted ? ' market-refill-highlight' : '';
        const highlightBadge = highlighted ? '<span class="market-refill-badge">補充</span>' : '';
        return `<div class="card-wrapper${highlightClass}">${highlightBadge}<button class="card-btn card-color-${safeColor} ${canBuildThis ? 'can-afford' : ''}" data-action="buildCard" data-card-name="${safeName}" ${canBuildThis ? "" : "disabled"}><div class="card-top-strip"><span class="card-dice-num">🎲 ${card.diceNums.join("・")}</span><span class="card-category-tag">${escapeHtml(card.category)}</span></div><div class="card-body"><div class="card-btn-top"><span class="card-name">${safeName}</span><span class="card-cost">💰${card.cost}</span></div><div class="card-effect">${escapeHtml(getEffectText(card))}</div></div></button><div class="card-meta-row"><button class="card-detail-btn" data-action="showCardDetail" data-card-name="${safeName}" aria-label="${safeName}の詳細を開く">ℹ 詳細</button><span class="card-stock">残り${stock}枚</span></div></div>`;
    }

    function renderLandmarkBuildButton(options) {
        const { name, built, cost, canBuildThis, escapeHtml, getLandmarkEffectText, getLandmarkEmoji } = options;
        const safeName = escapeHtml(name);
        return `<div class="card-wrapper"><button class="card-btn card-color-landmark ${canBuildThis ? 'can-afford' : ''}" data-action="buildLandmark" data-landmark-name="${safeName}" ${canBuildThis ? "" : "disabled"}><div class="card-top-strip"><span class="card-dice-num">${getLandmarkEmoji(name)}</span><span class="card-category-tag">ランドマーク</span></div><div class="card-body"><div class="card-btn-top"><span class="card-name">${safeName}</span><span class="card-cost">${built ? "✅済" : "💰" + cost}</span></div><div class="card-effect">${escapeHtml(getLandmarkEffectText(name))}</div></div></button><div class="card-meta-row card-meta-row-detail-only"><button class="card-detail-btn" data-action="showLandmarkDetail" data-landmark-name="${safeName}" aria-label="${safeName}の詳細を開く">ℹ 詳細</button></div></div>`;
    }

    function cardFilterButtonView(cardFilter, color) {
        const active = cardFilter === color;
        return Object.freeze({
            active,
            ariaPressed: active ? 'true' : 'false',
            className: `card-filter-btn${active ? ' active' : ''}`,
        });
    }

    function buildCardFilterBarHtml(cardFilter) {
        return CARD_FILTER_DEFS.map(({ color, label }) => {
            const view = cardFilterButtonView(cardFilter, color);
            return `<button class="${view.className}" data-action="setCardFilter" data-card-filter="${color}" aria-pressed="${view.ariaPressed}">${label}</button>`;
        }).join('');
    }

    function cardFilterFocusPlan(requestedFilter, source = {}) {
        const knownFilter = CARD_FILTER_DEFS.some(definition => definition.color === requestedFilter);
        const restore = knownFilter && source.action === 'setCardFilter' && source.cardFilter === requestedFilter;
        return Object.freeze({ restore, cardFilter: requestedFilter });
    }

    function canRestoreCardFilterFocus(facts = {}) {
        return facts.connected !== false && !facts.hidden && !facts.disabled && !facts.ancestorHidden;
    }

    function buildActionIdentity(source = {}) {
        if (source.action === 'buildCard' && source.cardName) {
            return Object.freeze({ action: 'buildCard', name: source.cardName });
        }
        if (source.action === 'buildLandmark' && source.landmarkName) {
            return Object.freeze({ action: 'buildLandmark', name: source.landmarkName });
        }
        if (source.action === 'undoBuild') {
            return Object.freeze({ action: 'undoBuild', name: '' });
        }
        return null;
    }

    function buildActionFocusPlan(sourceIdentity, previousBuildIdentity, eligible) {
        if (eligible !== true || !sourceIdentity) {
            return Object.freeze({ restore: false, identity: null, fallback: false });
        }
        const identity = sourceIdentity.action === 'undoBuild'
            ? previousBuildIdentity
            : sourceIdentity;
        return Object.freeze({
            restore: true,
            identity: identity || null,
            fallback: true,
        });
    }

    function createActionFocusController() {
        let previousBuildIdentity = null;
        return Object.freeze({
            reset() {
                previousBuildIdentity = null;
            },
            snapshot() {
                return Object.freeze({ previousBuildIdentity });
            },
            plan(source = {}, eligible = false) {
                const sourceIdentity = buildActionIdentity(source);
                const plan = buildActionFocusPlan(
                    sourceIdentity,
                    previousBuildIdentity,
                    eligible
                );
                if (eligible === true && sourceIdentity && sourceIdentity.action !== 'undoBuild') {
                    previousBuildIdentity = sourceIdentity;
                }
                return plan;
            },
        });
    }

    function applyBuildActionFocusPlan(plan, effects = {}) {
        if (!plan || plan.restore !== true) return false;
        const target = typeof effects.findIdentity === 'function'
            ? effects.findIdentity(plan.identity)
            : null;
        if (target && typeof effects.focusIdentity === 'function' &&
                effects.focusIdentity(target) === true) return true;
        return plan.fallback === true && typeof effects.focusFallback === 'function'
            ? effects.focusFallback() === true
            : false;
    }

    function canBuildCard(options) {
        const { card, stock, current, canBuildCardAction } = options;
        return !!canBuildCardAction && stock > 0 && current.coins >= card.cost &&
            !(card.color === 'purple' && current.countCardIncludingDormant(card.name) > 0);
    }

    function cardMatchesFilter(card, cardFilter, canBuildThis) {
        if (cardFilter === 'affordable') return canBuildThis;
        return !cardFilter || card.color === cardFilter;
    }

    function buildCardEmptyStateHtml(cardFilter) {
        return cardFilter === 'affordable'
            ? '<p class="build-filter-empty">現在建設できる施設はありません</p>'
            : '<p class="build-filter-empty">この条件に表示できる施設はありません</p>';
    }

    function buildVisibleCardButtonsHtml(options) {
        const { cards, cardFilter, enabledCards, shopStock, current, canBuildCardAction, compareCardsForDisplay, getShopStockCount, renderBuildCardButton } = options;
        const highlightedNames = new Set(options.highlightedCardNames || []);
        const sortedCards = [...cards].sort(compareCardsForDisplay);
        return sortedCards.map(card => {
            if (!enabledCards.has(card.name)) return "";
            const stock = getShopStockCount(shopStock, card);
            if (stock <= 0) return "";
            const canBuildThis = canBuildCard({ card, stock, current, canBuildCardAction });
            if (!cardMatchesFilter(card, cardFilter, canBuildThis)) return "";
            return renderBuildCardButton(card, stock, canBuildThis, highlightedNames.has(card.name));
        }).join("");
    }

    function buildLandmarkButtonsHtml(options) {
        const { landmarks, enabledLandmarks, currentCoins, canBuildLandmarkAction, landmarkCost, renderLandmarkBuildButton } = options;
        return Object.entries(landmarks).filter(([name]) => enabledLandmarks.has(name)).map(([name, built]) => {
            const cost = landmarkCost(name);
            const canBuildThis = canBuildLandmarkAction && !built && currentCoins >= cost;
            return renderLandmarkBuildButton(name, built, cost, canBuildThis);
        }).join("");
    }

    function buildBuildMenuHtml(options) {
        const { canBuildCardAction, canBuildLandmarkAction, filterBtnsHtml, cardHtml, landmarkHtml, undoBtn, marketStatusHtml = '' } = options;
        const canBuild = canBuildCardAction || canBuildLandmarkAction;
        return `<h3>🏗️ ${canBuild ? "建設する施設を選んでください" : "施設一覧"}</h3>${undoBtn}${marketStatusHtml}<div class="build-section build-card-section"><h4>施設カード</h4><div class="card-filter-bar">${filterBtnsHtml}</div><div class="card-grid">${cardHtml}</div></div><div class="build-section"><h4>ランドマーク</h4><div class="card-grid">${landmarkHtml}</div></div>`;
    }

    function buildMarketStatusHtml(marketSupply, shopStock) {
        if (!marketSupply || marketSupply.mode !== 'ten-type') return '';
        const visibleTypes = Object.values(shopStock || {}).filter(count => Number.isInteger(count) && count > 0).length;
        const deckCount = Array.isArray(marketSupply.deck) ? marketSupply.deck.length : 0;
        const warningClass = deckCount === 0 ? ' market-deck-empty'
            : deckCount <= 10 ? ' market-deck-low' : '';
        const warning = deckCount === 0 ? '<strong>山札切れ</strong>'
            : deckCount <= 10 ? '<strong>残りわずか</strong>' : '';
        const history = Array.isArray(marketSupply.refillHistory)
            ? marketSupply.refillHistory.slice().reverse() : [];
        const historyHtml = history.length > 0
            ? `<details class="market-refill-history"><summary>補充履歴（${history.length}件）</summary><ol>${history.map(entry => {
                const names = Array.isArray(entry && entry.cardNames) ? entry.cardNames : [];
                const counts = new Map();
                for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
                const summary = Array.from(counts, ([name, count]) =>
                    escapeText(count > 1 ? `${name}×${count}` : name)
                ).join('、');
                return `<li>${summary || '補充カードなし'}</li>`;
            }).join('')}</ol></details>`
            : '';
        return `<section class="market-rule-status${warningClass}" aria-label="公式10種類市場の状態"><div>🏪 公式10種類市場：公開${visibleTypes}種類・山札${deckCount}枚 ${warning}</div>${historyHtml}</section>`;
    }

    return Object.freeze({ cardFilterTransition, createFilterController, safeCardColorName, isBuildGateOpen, buildActionState, buildShortcutView, applyBuildShortcutView, focusAndScrollToBuildMenu, undoBuildActionState, buildUndoBuildButtonHtml, renderBuildCardButton, renderLandmarkBuildButton, cardFilterButtonView, buildCardFilterBarHtml, cardFilterFocusPlan, canRestoreCardFilterFocus, buildActionIdentity, buildActionFocusPlan, createActionFocusController, applyBuildActionFocusPlan, canBuildCard, cardMatchesFilter, buildCardEmptyStateHtml, buildVisibleCardButtonsHtml, buildLandmarkButtonsHtml, buildBuildMenuHtml, buildMarketStatusHtml });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiBuildMenu;
if (typeof window !== 'undefined') window.UiBuildMenu = UiBuildMenu;
if (typeof globalThis !== 'undefined') globalThis.UiBuildMenu = UiBuildMenu;
