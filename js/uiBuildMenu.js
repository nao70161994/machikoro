'use strict';

const UiBuildMenu = (() => {
    function safeCardColorName(color) {
        return ['blue', 'green', 'red', 'purple'].includes(color) ? color : 'blue';
    }

    function renderBuildCardButton(options) {
        const { card, stock, canBuildThis, escapeHtml, getEffectText } = options;
        const safeName = escapeHtml(card.name);
        const safeColor = safeCardColorName(card.color);
        return `<div class="card-wrapper"><button class="card-btn card-color-${safeColor} ${canBuildThis ? 'can-afford' : ''}" data-action="buildCard" data-card-name="${safeName}" ${canBuildThis ? "" : "disabled"}><div class="card-top-strip"><span class="card-dice-num">🎲 ${card.diceNums.join("・")}</span><span class="card-category-tag">${escapeHtml(card.category)}</span></div><div class="card-body"><div class="card-btn-top"><span class="card-name">${safeName}</span><span class="card-cost">💰${card.cost}</span></div><div class="card-effect">${escapeHtml(getEffectText(card))}</div></div><div class="card-footer">残り${stock}枚</div></button><button class="card-detail-btn" data-action="showCardDetail" data-card-name="${safeName}" aria-label="${safeName}の詳細を開く">ℹ</button></div>`;
    }

    function renderLandmarkBuildButton(options) {
        const { name, built, cost, canBuildThis, escapeHtml, getLandmarkEffectText, getLandmarkEmoji } = options;
        const safeName = escapeHtml(name);
        return `<div class="card-wrapper"><button class="card-btn card-color-landmark ${canBuildThis ? 'can-afford' : ''}" data-action="buildLandmark" data-landmark-name="${safeName}" ${canBuildThis ? "" : "disabled"}><div class="card-top-strip"><span class="card-dice-num">${getLandmarkEmoji(name)}</span><span class="card-category-tag">ランドマーク</span></div><div class="card-body"><div class="card-btn-top"><span class="card-name">${safeName}</span><span class="card-cost">${built ? "✅済" : "💰" + cost}</span></div><div class="card-effect">${escapeHtml(getLandmarkEffectText(name))}</div></div></button><button class="card-detail-btn" data-action="showLandmarkDetail" data-landmark-name="${safeName}" aria-label="${safeName}の詳細を開く">ℹ</button></div>`;
    }

    function buildCardFilterBarHtml(cardFilter) {
        const filterDefs = [['', '全て'], ['blue', '青'], ['green', '緑'], ['red', '赤'], ['purple', '紫']];
        return filterDefs.map(([c, label]) =>
            `<button class="card-filter-btn${cardFilter === c ? ' active' : ''}" data-action="setCardFilter" data-card-filter="${c}">${label}</button>`
        ).join('');
    }

    function buildVisibleCardButtonsHtml(options) {
        const { cards, cardFilter, enabledCards, shopStock, current, canBuildCardAction, compareCardsForDisplay, getShopStockCount, renderBuildCardButton } = options;
        const sortedCards = [...cards].sort(compareCardsForDisplay);
        const visibleCards = cardFilter ? sortedCards.filter(c => c.color === cardFilter) : sortedCards;
        return visibleCards.map(card => {
            if (!enabledCards.has(card.name)) return "";
            const stock = getShopStockCount(shopStock, card);
            if (stock <= 0) return "";
            const canBuildThis = canBuildCardAction && current.coins >= card.cost && !(card.color === "purple" && current.countCardIncludingDormant(card.name) > 0);
            return renderBuildCardButton(card, stock, canBuildThis);
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
        const { canBuildCardAction, canBuildLandmarkAction, filterBtnsHtml, cardHtml, landmarkHtml, undoBtn } = options;
        const canBuild = canBuildCardAction || canBuildLandmarkAction;
        return `<h3>🏗️ ${canBuild ? "建設する施設を選んでください" : "施設一覧"}</h3>${undoBtn}<div class="build-section"><h4>施設カード</h4><div class="card-filter-bar">${filterBtnsHtml}</div><div class="card-grid">${cardHtml}</div></div><div class="build-section"><h4>ランドマーク</h4><div class="card-grid">${landmarkHtml}</div></div>`;
    }

    return Object.freeze({ safeCardColorName, renderBuildCardButton, renderLandmarkBuildButton, buildCardFilterBarHtml, buildVisibleCardButtonsHtml, buildLandmarkButtonsHtml, buildBuildMenuHtml });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiBuildMenu;
if (typeof window !== 'undefined') window.UiBuildMenu = UiBuildMenu;
if (typeof globalThis !== 'undefined') globalThis.UiBuildMenu = UiBuildMenu;
