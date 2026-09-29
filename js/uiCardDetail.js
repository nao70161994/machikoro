'use strict';

const UiCardDetail = (() => {
    const COLOR_NAMES = Object.freeze({ blue: '青', green: '緑', red: '赤', purple: '紫' });
    const COLOR_BADGES = Object.freeze({ blue: 'blue-badge', green: 'green-badge', red: 'red-badge', purple: 'purple-badge' });

    function cardEffectText(card, effectDescriptions) {
        const formatter = effectDescriptions && effectDescriptions[card.effect];
        if (typeof formatter === 'function') return formatter(card.income);
        if (card.color === 'red') return '相手から' + card.income + 'コイン奪う';
        return '+' + card.income + 'コイン';
    }

    function landmarkPresentation(name, definitions, townHallName) {
        const definition = Array.isArray(definitions)
            ? definitions.find(candidate => candidate.name === name) : null;
        return Object.freeze({
            effectText: definition && definition.effect || '',
            emoji: name === townHallName ? '🏛️' : definition && definition.emoji || '🏛️',
        });
    }

    function renderDetailMark(kind) {
        if (kind === 'coin') {
            return '<svg class="card-detail-mark card-detail-coin" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="8"/><circle cx="10" cy="10" r="5.8"/><path d="M11.5 6.8c-.4-.4-.9-.6-1.6-.6-.9 0-1.6.5-1.6 1.3 0 1.9 3.4.9 3.4 2.9 0 .8-.7 1.5-1.8 1.5-.8 0-1.4-.3-1.9-.8M10 5.6v8.8"/></svg>';
        }
        return '<svg class="card-detail-mark card-detail-dice" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="1.5" y="1.5" width="17" height="17" rx="4"/><circle cx="6" cy="6" r="1.2"/><circle cx="14" cy="6" r="1.2"/><circle cx="10" cy="10" r="1.2"/><circle cx="6" cy="14" r="1.2"/><circle cx="14" cy="14" r="1.2"/></svg>';
    }

    function detailArt(options) {
        const { name, landmark, category = '', color = 'landmark', renderFacilityArt, useSunsetIcons } = options;
        if (!useSunsetIcons || typeof renderFacilityArt !== 'function') return '';
        return '<div class="card-detail-art card-color-' + color + '" aria-hidden="true">' +
            renderFacilityArt(name, landmark, category) + '</div>';
    }

    function buildLandmarkDetailContent(options) {
        const { name, emoji, cost, effectText, escapeHtml, useSunsetIcons = false, renderFacilityArt } = options;
        const effect = escapeHtml(effectText);
        const title = useSunsetIcons ? name : `${emoji} ${name}`;
        const coin = useSunsetIcons ? renderDetailMark('coin') : '💰';
        const art = detailArt({ name, landmark: true, renderFacilityArt, useSunsetIcons });
        return {
            title,
            html: art + `<div class="card-detail-section"><div class="card-detail-row"><span>コスト</span><span>${coin} ${cost}</span></div><div class="card-detail-row"><span>種別</span><span>ランドマーク</span></div></div><div class="card-detail-effect">${effect}</div>`,
        };
    }

    function buildCardDetailContent(options) {
        const { card, escapeHtml, getEffectText, safeCardColorName, useSunsetIcons = false, renderFacilityArt } = options;
        const safeColor = safeCardColorName(card.color);
        const coin = useSunsetIcons ? renderDetailMark('coin') : '💰';
        const dice = useSunsetIcons ? renderDetailMark('dice') : '🎲';
        const art = detailArt({
            name: card.name,
            landmark: false,
            category: card.category,
            color: safeColor,
            renderFacilityArt,
            useSunsetIcons,
        });
        return {
            title: card.name,
            html: art + `<div class="card-detail-section"><div class="card-detail-row"><span>コスト</span><span>${coin} ${card.cost}</span></div><div class="card-detail-row"><span>ダイス</span><span>${dice} [${card.diceNums.join(', ')}]</span></div><div class="card-detail-row"><span>種別</span><span><span class="color-badge ${COLOR_BADGES[safeColor]}">${COLOR_NAMES[safeColor]}</span> ${escapeHtml(card.category)}</span></div></div><div class="card-detail-effect">${escapeHtml(getEffectText(card))}</div>`,
        };
    }

    return Object.freeze({
        cardEffectText,
        landmarkPresentation,
        buildLandmarkDetailContent,
        buildCardDetailContent,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiCardDetail;
if (typeof window !== 'undefined') window.UiCardDetail = UiCardDetail;
if (typeof globalThis !== 'undefined') globalThis.UiCardDetail = UiCardDetail;
