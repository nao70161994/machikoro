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
        let manuallySelected = false;

        function get() {
            return cardFilter;
        }

        function set(requestedFilter) {
            manuallySelected = true;
            const transition = cardFilterTransition(cardFilter, requestedFilter);
            cardFilter = transition.cardFilter;
            return transition;
        }

        function setAutomatic(requestedFilter) {
            if (manuallySelected) {
                return Object.freeze({ cardFilter, changed: false, shouldRender: false });
            }
            const transition = cardFilterTransition(cardFilter, requestedFilter);
            cardFilter = transition.cardFilter;
            return transition;
        }

        function clear() {
            cardFilter = '';
            manuallySelected = false;
        }

        function wasManuallySelected() {
            return manuallySelected;
        }

        function snapshot() {
            return Object.freeze({ cardFilter });
        }

        return Object.freeze({ get, set, setAutomatic, clear, wasManuallySelected, snapshot });
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
            ? `<button class="undo-btn" data-action="undoBuild"${state.enabled ? '' : ' disabled'}><span class="undo-btn-fallback-icon" aria-hidden="true">↩</span><svg class="undo-btn-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="icons/interface-ui.svg#undo"></use></svg><span>建設を取り消す</span></button>`
            : '';
    }

    const FACILITY_ART = Object.freeze({
        '麦畑': 'field', '花畑': 'flower', 'コーン畑': 'corn', 'ブドウ園': 'vineyard',
        '牧場': 'ranch', '森林': 'forest', 'リンゴ園': 'orchard', '鉱山': 'mine',
        'パン屋': 'bakery', 'コンビニ': 'convenience', 'チーズ工場': 'cheese',
        '家具工場': 'furniture', '青果市場': 'produce', 'カフェ': 'cafe',
        'ファミレス': 'family', 'スタジアム': 'stadium', 'テレビ局': 'tv-station',
        'ビジネスセンター': 'business-center', 'サンマ漁船': 'fishery',
        'マグロ漁船': 'tuna-boat', 'フラワーショップ': 'florist',
        '食品倉庫': 'warehouse', '寿司屋': 'sushi', 'ピザ屋': 'pizzeria',
        'バーガーショップ': 'burger', '出版社': 'publisher', '税務署': 'tax-office',
        '雑貨屋': 'general-store', '改装屋': 'remodel', '貸金業': 'lender',
        'ワイナリー': 'winery', '引越し屋': 'mover', 'ドリンク工場': 'beverage',
        '高級フレンチ': 'bistro', '会員制BAR': 'members-bar', '清掃業': 'cleaning',
        'ITベンチャー': 'startup', '公園': 'park-ground',
    });

    const LANDMARK_ART = Object.freeze({
        '駅': 'station', 'ショッピングモール': 'mall', '遊園地': 'park',
        '電波塔': 'radio', '港': 'port', '空港': 'airport',
    });

    const CATEGORY_ART = Object.freeze({
        '農園': 'field', '畜産': 'ranch', '工業': 'factory', '海産': 'harbor', '大施設': 'civic',
    });

    const CATEGORY_SCENE = Object.freeze({
        '農園': 'pasture', '畜産': 'pasture', '工業': 'industrial', '海産': 'water',
        '商店': 'street', '飲食店': 'street', '特殊': 'street', '大施設': 'civic',
    });

    const FACILITY_ART_FRAMING = Object.freeze({
        '空港': '0 0 160 80',
        '遊園地': '12 2 136 76',
        '港': '18 4 130 72',
        '寿司屋': '0 0 160 80',
        '牧場': '0 0 160 80',
        '鉱山': '0 0 160 80',
    });

    function renderFacilityArt(name, landmark = false, category = '') {
        const named = Object.prototype.hasOwnProperty.call(FACILITY_ART, name) ? FACILITY_ART[name] : null;
        const grouped = Object.prototype.hasOwnProperty.call(CATEGORY_ART, category) ? CATEGORY_ART[category] : null;
        const landmarkMotif = Object.prototype.hasOwnProperty.call(LANDMARK_ART, name) ? LANDMARK_ART[name] : 'landmark';
        const motif = landmark ? landmarkMotif : (named || grouped || 'shop');
        const scene = landmark ? 'landmark' : (CATEGORY_SCENE[category] || 'street');
        const viewBox = FACILITY_ART_FRAMING[name] || '0 0 160 80';
        return `<svg class="sunset-facility-art facility-scene-${scene}" viewBox="${viewBox}" aria-hidden="true" focusable="false"><use href="icons/facility-art.svg#${motif}"></use></svg>`;
    }

    function renderLandmarkBadgeIcon(name) {
        const motif = Object.prototype.hasOwnProperty.call(LANDMARK_ART, name) ? LANDMARK_ART[name] : 'landmark';
        return `<svg class="landmark-badge-icon" viewBox="0 0 160 80" aria-hidden="true" focusable="false"><use href="icons/facility-art.svg#${motif}"></use></svg>`;
    }

    function townDevelopmentStage(facilityCount, landmarkCount) {
        const facilities = Number.isFinite(facilityCount) ? Math.max(0, Math.floor(facilityCount)) : 0;
        const landmarks = Number.isFinite(landmarkCount) ? Math.max(0, Math.floor(landmarkCount)) : 0;
        const development = facilities + landmarks * 2;
        if (development >= 8) return 'city';
        if (development >= 3) return 'neighborhood';
        return 'quiet';
    }

    function renderDiceMark() {
        return '<svg class="card-dice-mark" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="1.5" y="1.5" width="17" height="17" rx="4" fill="#fff4d6" stroke="#9b713f" stroke-width="1.5"/><circle cx="6" cy="6" r="1.35" fill="#31475a"/><circle cx="14" cy="6" r="1.35" fill="#31475a"/><circle cx="10" cy="10" r="1.35" fill="#31475a"/><circle cx="6" cy="14" r="1.35" fill="#31475a"/><circle cx="14" cy="14" r="1.35" fill="#31475a"/></svg>';
    }

    function renderCoinMark() {
        return '<svg class="card-coin-mark" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><use href="icons/interface-ui.svg#coin"></use></svg>';
    }

    function renderTownBackdrop() {
        return `<svg class="town-backdrop" viewBox="0 0 640 180" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
            <path d="M0 106Q94 62 192 106T384 97T640 92V180H0Z" fill="#5b7779" opacity=".45"/>
            <path d="M0 131Q138 103 266 135T640 120V180H0Z" fill="#496b68"/>
            <g class="town-backdrop-neighborhood" stroke="#294653" stroke-width="2" stroke-linejoin="round">
                <path d="M24 123V85L54 66L83 85V123Z" fill="#b7b49a"/><path d="M17 86L54 59L90 86" fill="#526a71"/>
                <path d="M34 92H47V105H34ZM60 92H73V105H60Z" fill="#f1d493"/><path d="M49 123V107H62V123" fill="#405c67"/>
                <path d="M95 124V95L128 75L159 95V124Z" fill="#829798"/><path d="M89 96L128 69L166 96" fill="#4a636d"/>
                <path d="M106 103H119V115H106ZM136 103H149V115H136Z" fill="#f0cd8b"/>
                <path d="M475 128V86H531V128Z" fill="#a3aa99"/><path d="M468 87L481 73H525L539 87Z" fill="#49646d"/>
                <path d="M486 98H519V113H486Z" fill="#e8cb91"/><path d="M480 96H525L521 101H484Z" fill="#d4b47e"/>
                <path d="M551 126V84L583 62L614 84V126Z" fill="#b3b49d"/><path d="M545 84L583 55L621 84" fill="#49616c"/>
                <path d="M564 95H576V109H564ZM591 95H603V109H591Z" fill="#f4d697"/>
            </g>
            <g class="town-backdrop-city" stroke="#294653" stroke-width="2" stroke-linejoin="round">
                <path d="M186 123V69H225V123Z" fill="#758e95"/><path d="M183 69L191 60H219L229 69Z" fill="#425e6c"/>
                <path d="M195 81H205V92H195ZM212 81H220V92H212ZM195 100H205V111H195ZM212 100H220V111H212Z" fill="#f0cf8d"/>
                <path d="M247 123V80L271 63L296 80V123Z" fill="#a2ac9c"/><path d="M241 81L271 57L302 81" fill="#4c6870"/>
                <path d="M257 91H266V103H257ZM277 91H286V103H277Z" fill="#ebca8a"/>
                <path d="M320 124V56H344V124Z" fill="#afa889"/><path d="M313 56L332 33L351 56Z" fill="#4e6570"/>
                <circle cx="332" cy="68" r="9" fill="#eddbac"/><path d="M332 62V68L337 71" fill="none"/>
                <path d="M321 108H343V119H321Z" fill="#e9c983"/>
                <path d="M365 127V88H403V127Z" fill="#8e9f99"/><path d="M359 88L384 68L409 88" fill="#4c6971"/>
                <path d="M374 99H383V111H374ZM390 99H399V111H390Z" fill="#efcf8e"/>
                <path d="M421 126V68H452V126Z" fill="#779297"/><path d="M417 69H456L451 58H422Z" fill="#415e6b"/>
                <path d="M428 80H437V91H428ZM443 80H449V91H443ZM428 101H437V112H428ZM443 101H449V112H443Z" fill="#f0d492"/>
            </g>
            <path d="M0 157Q156 141 315 158T640 147" fill="none" stroke="#a19b83" stroke-width="12" opacity=".38"/>
            <g class="town-backdrop-lamps" stroke="#d7bf87" stroke-width="2" fill="#f4d998">
                <path d="M17 155V121M157 153V118M488 152V117M627 149V114"/>
                <path d="M11 122L17 112L23 122ZM151 119L157 109L163 119ZM482 118L488 108L494 118ZM621 115L627 105L633 115Z"/>
            </g>
        </svg>`;
    }

    function renderTownHtml(player, enabledLandmarks = new Set()) {
        const cards = Array.isArray(player.cards) ? player.cards : [];
        const grouped = new Map();
        for (const card of cards) {
            const entry = grouped.get(card.name) || { card, count: 0 };
            entry.count++;
            grouped.set(card.name, entry);
        }
        const built = Object.entries(player.landmarks || {})
            .filter(([name, value]) => value === true && enabledLandmarks.has(name));
        const stage = townDevelopmentStage(cards.length, built.length);
        const facilities = [...grouped.values()].slice(0, 8).map(({ card, count }) =>
            `<span class="town-building" data-town-building="card:${escapeText(card.name)}">${renderFacilityArt(card.name, false, card.category)}<span class="town-building-count">×${count}</span></span>`
        ).join('');
        const landmarks = built.map(([name]) =>
            `<span class="town-building town-landmark" data-town-building="landmark:${escapeText(name)}">${renderFacilityArt(name, true)}</span>`
        ).join('');
        const remaining = grouped.size > 8 ? `<span class="town-overflow">ほか${grouped.size - 8}種</span>` : '';
        return `<div class="sunset-town"><p class="town-summary">育てた街<span>施設 ${cards.length}枚 · ランドマーク ${built.length}個</span></p><div class="town-street" data-town-stage="${stage}" aria-hidden="true">${renderTownBackdrop()}<span class="town-skyline-lights"></span>${facilities}${landmarks}${remaining}</div></div>`;
    }

    function renderBuildCardButton(options) {
        const { card, stock, canBuildThis, escapeHtml, getEffectText, highlighted = false } = options;
        const safeName = escapeHtml(card.name);
        const safeColor = safeCardColorName(card.color);
        const highlightClass = highlighted ? ' market-refill-highlight' : '';
        const highlightBadge = highlighted ? '<span class="market-refill-badge">補充</span>' : '';
        return `<div class="card-wrapper${highlightClass}">${highlightBadge}<button class="card-btn card-color-${safeColor} ${canBuildThis ? 'can-afford' : ''}" data-action="buildCard" data-card-name="${safeName}" ${canBuildThis ? "" : "disabled"}><div class="card-top-strip"><span class="card-dice-num">${renderDiceMark()} ${card.diceNums.join("・")}</span><span class="card-category-tag"><span class="card-family-mark" data-category="${escapeHtml(card.category)}" aria-hidden="true"></span>${escapeHtml(card.category)}</span></div>${renderFacilityArt(card.name, false, card.category)}<div class="card-body"><div class="card-btn-top"><span class="card-name">${safeName}</span><span class="card-cost">${renderCoinMark()}${card.cost}</span></div><div class="card-effect">${escapeHtml(getEffectText(card))}</div></div></button><div class="card-meta-row"><button class="card-detail-btn" data-action="showCardDetail" data-card-name="${safeName}" aria-label="${safeName}の詳細を開く"><span class="card-detail-emoji" aria-hidden="true">ℹ</span><svg class="card-detail-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="icons/interface-ui.svg#info"></use></svg><span class="card-detail-label"> 詳細</span></button><span class="card-stock">残り${stock}枚</span></div></div>`;
    }

    function renderLandmarkBuildButton(options) {
        const { name, built, cost, canBuildThis, escapeHtml, getLandmarkEffectText, getLandmarkEmoji, renderLandmarkMark } = options;
        const safeName = escapeHtml(name);
        const landmarkMark = typeof renderLandmarkMark === 'function'
            ? `<span class="card-landmark-mark">${renderLandmarkMark(name)}</span>`
            : getLandmarkEmoji(name);
        const builtStatus = '<span class="card-built-status"><span class="card-built-emoji" aria-hidden="true">✅</span><svg class="card-built-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="icons/interface-ui.svg#check"></use></svg><span>済</span></span>';
        return `<div class="card-wrapper"><button class="card-btn card-color-landmark ${canBuildThis ? 'can-afford' : ''}" data-action="buildLandmark" data-landmark-name="${safeName}" ${canBuildThis ? "" : "disabled"}><div class="card-top-strip"><span class="card-dice-num">${landmarkMark}</span><span class="card-category-tag"><span class="card-family-mark" data-category="大施設" aria-hidden="true"></span>ランドマーク</span></div>${renderFacilityArt(name, true)}<div class="card-body"><div class="card-btn-top"><span class="card-name">${safeName}</span><span class="card-cost">${built ? builtStatus : renderCoinMark() + cost}</span></div><div class="card-effect">${escapeHtml(getLandmarkEffectText(name))}</div></div></button><div class="card-meta-row card-meta-row-detail-only"><button class="card-detail-btn" data-action="showLandmarkDetail" data-landmark-name="${safeName}" aria-label="${safeName}の詳細を開く"><span class="card-detail-emoji" aria-hidden="true">ℹ</span><svg class="card-detail-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="icons/interface-ui.svg#info"></use></svg><span class="card-detail-label"> 詳細</span></button></div></div>`;
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
        return `<h3><span class="build-menu-heading-emoji" aria-hidden="true">🏗️</span><svg class="build-menu-heading-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="icons/interface-ui.svg#market"></use></svg><span>${canBuild ? "市場から施設を選んでください" : "施設一覧"}</span></h3>${undoBtn}${marketStatusHtml}<div class="build-section build-card-section"><h4>施設カード</h4><div class="card-filter-bar">${filterBtnsHtml}</div><div class="card-grid">${cardHtml}</div></div><div class="build-section"><h4>ランドマーク</h4><div class="card-grid">${landmarkHtml}</div></div>`;
    }

    function buildMarketStatusHtml(marketSupply, shopStock, players = []) {
        if (!marketSupply || marketSupply.mode !== 'ten-type') return '';
        const visibleTypes = Object.values(shopStock || {}).filter(count => Number.isInteger(count) && count > 0).length;
        const deckCount = Array.isArray(marketSupply.deck) ? marketSupply.deck.length : 0;
        const warningClass = deckCount === 0 ? ' market-deck-empty'
            : deckCount <= 10 ? ' market-deck-low' : '';
        const warning = deckCount === 0 ? '<strong>山札切れ</strong>'
            : deckCount <= 10 ? '<strong>残りわずか</strong>' : '';
        const history = Array.isArray(marketSupply.refillHistory)
            ? marketSupply.refillHistory.slice().reverse() : [];
        const revealedCount = Number.isSafeInteger(marketSupply.revealedCardCount) &&
            marketSupply.revealedCardCount >= 0 ? marketSupply.revealedCardCount : 0;
        const totalCards = revealedCount + deckCount;
        const gaugePercent = marketSupply.totalsComplete === true && totalCards > 0
            ? Math.max(0, Math.min(100, Math.round(revealedCount / totalCards * 100))) : null;
        const gaugeHtml = gaugePercent === null ? ''
            : `<div class="market-deck-gauge" aria-hidden="true"><span style="width:${gaugePercent}%"></span></div>`;
        const historyHtml = history.length > 0
            ? `<details class="market-refill-history"><summary>補充履歴（${history.length}件）</summary><ol>${history.map(entry => {
                const names = Array.isArray(entry && entry.cardNames) ? entry.cardNames : [];
                const counts = new Map();
                for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
                const summary = Array.from(counts, ([name, count]) =>
                    escapeText(count > 1 ? `${name}×${count}` : name)
                ).join('、');
                const player = Number.isSafeInteger(entry && entry.playerIndex)
                    ? players[entry.playerIndex] : null;
                const turn = Number.isSafeInteger(entry && entry.turnCount) && entry.turnCount >= 0
                    ? `${entry.turnCount + 1}ターン目` : '';
                const actor = player && typeof player.name === 'string'
                    ? `${escapeText(player.name)}の建設後` : '';
                const context = [turn, actor].filter(Boolean).join('・');
                return `<li>${context ? `<span class="market-refill-context">${context}</span>` : ''}${summary || '補充カードなし'}</li>`;
            }).join('')}</ol></details>`
            : '';
        return `<section class="market-rule-status${warningClass}" aria-label="公式10種類市場の状態"><div><span class="market-status-emoji" aria-hidden="true">🏪</span><svg class="market-status-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="icons/interface-ui.svg#market"></use></svg> 公式10種類市場：公開${visibleTypes}種類・山札${deckCount}枚 ${warning}</div>${gaugeHtml}${historyHtml}</section>`;
    }

    return Object.freeze({ renderTownHtml, townDevelopmentStage, renderFacilityArt, renderLandmarkBadgeIcon, renderCoinMark, cardFilterTransition, createFilterController, safeCardColorName, isBuildGateOpen, buildActionState, buildShortcutView, applyBuildShortcutView, focusAndScrollToBuildMenu, undoBuildActionState, buildUndoBuildButtonHtml, renderBuildCardButton, renderLandmarkBuildButton, cardFilterButtonView, buildCardFilterBarHtml, cardFilterFocusPlan, canRestoreCardFilterFocus, buildActionIdentity, buildActionFocusPlan, createActionFocusController, applyBuildActionFocusPlan, canBuildCard, cardMatchesFilter, buildCardEmptyStateHtml, buildVisibleCardButtonsHtml, buildLandmarkButtonsHtml, buildBuildMenuHtml, buildMarketStatusHtml });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiBuildMenu;
if (typeof window !== 'undefined') window.UiBuildMenu = UiBuildMenu;
if (typeof globalThis !== 'undefined') globalThis.UiBuildMenu = UiBuildMenu;
