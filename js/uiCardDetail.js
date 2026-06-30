'use strict';

const UiCardDetail = (() => {
    const COLOR_NAMES = Object.freeze({ blue: '青', green: '緑', red: '赤', purple: '紫' });
    const COLOR_BADGES = Object.freeze({ blue: 'blue-badge', green: 'green-badge', red: 'red-badge', purple: 'purple-badge' });

    function buildLandmarkDetailContent(options) {
        const { name, emoji, cost, effectText, escapeHtml } = options;
        const effect = escapeHtml(effectText);
        return {
            title: `${emoji} ${name}`,
            html: `<div class="card-detail-section"><div class="card-detail-row"><span>コスト</span><span>💰 ${cost}</span></div><div class="card-detail-row"><span>種別</span><span>ランドマーク</span></div></div><div class="card-detail-effect">${effect}</div>`,
        };
    }

    function buildCardDetailContent(options) {
        const { card, escapeHtml, getEffectText, safeCardColorName } = options;
        const safeColor = safeCardColorName(card.color);
        return {
            title: card.name,
            html: `<div class="card-detail-section"><div class="card-detail-row"><span>コスト</span><span>💰 ${card.cost}</span></div><div class="card-detail-row"><span>ダイス</span><span>🎲 [${card.diceNums.join(', ')}]</span></div><div class="card-detail-row"><span>種別</span><span><span class="color-badge ${COLOR_BADGES[safeColor]}">${COLOR_NAMES[safeColor]}</span> ${escapeHtml(card.category)}</span></div></div><div class="card-detail-effect">${escapeHtml(getEffectText(card))}</div>`,
        };
    }

    return Object.freeze({ buildLandmarkDetailContent, buildCardDetailContent });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiCardDetail;
if (typeof window !== 'undefined') window.UiCardDetail = UiCardDetail;
if (typeof globalThis !== 'undefined') globalThis.UiCardDetail = UiCardDetail;
