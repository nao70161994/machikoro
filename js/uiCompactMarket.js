'use strict';
/* global UiBuildMenu */

// A second presentation of the shared purchase policy, never a second market.
const UiCompactMarket = (() => {
    const buildMenu = typeof UiBuildMenu !== 'undefined' ? UiBuildMenu : require('./uiBuildMenu');
    const colorNames = Object.freeze({ blue: '青', green: '緑', red: '赤', purple: '紫' });

    function renderFacility(card, stock, canBuildThis, highlighted, options) {
        const { escapeHtml, getEffectText } = options;
        const escape = value => escapeHtml(String(value));
        const name = escape(card.name);
        const color = buildMenu.safeCardColorName(card.color);
        const art = options.renderFacilityArt || buildMenu.renderFacilityArt;
        const effect = escape(getEffectText(card));
        return `<article class="compact-market-item compact-market-${color}${highlighted ? ' compact-market-refilled' : ''}"><button type="button" class="compact-market-buy${canBuildThis ? ' can-afford' : ''}" data-action="buildCard" data-card-name="${name}"${canBuildThis ? '' : ' disabled'} aria-label="${name}を${escape(card.cost)}コインで建設。${effect}"><span class="compact-market-dice" aria-label="発動する出目 ${escape(card.diceNums.join('・'))}">${escape(card.diceNums.join('・'))}</span><span class="compact-market-kind"><span class="card-family-mark" data-category="${escape(card.category)}" aria-hidden="true"></span>${colorNames[color] || '不明'} · ${escape(card.category)}</span><span class="compact-market-art" aria-hidden="true">${art(card.name, false, card.category)}</span><strong class="compact-market-name">${name}</strong><span class="compact-market-price">${escape(card.cost)}コイン</span><span class="compact-market-effect visually-hidden">${effect}</span><span class="compact-market-stock" data-short-stock="残${escape(stock)}">残り${escape(stock)}枚${highlighted ? ' · 補充' : ''}</span></button><button type="button" class="compact-market-detail" data-action="showCardDetail" data-card-name="${name}" aria-label="${name}の詳細を開く"><span aria-hidden="true">i</span></button></article>`;
    }

    function renderLandmark(name, built, cost, canBuildThis, options) {
        const { escapeHtml, getLandmarkEffectText } = options;
        const escape = value => escapeHtml(String(value));
        const safeName = escape(name);
        const effect = escape(getLandmarkEffectText(name));
        return `<article class="compact-market-item compact-market-landmark${built ? ' compact-market-built' : ''}"><button type="button" class="compact-market-buy${canBuildThis ? ' can-afford' : ''}" data-action="buildLandmark" data-landmark-name="${safeName}"${canBuildThis ? '' : ' disabled'} aria-label="${safeName}、${built ? '建設済' : `${escape(cost)}コインで建設`}。${effect}"><strong class="compact-market-name">${safeName}</strong><span class="compact-market-price">${built ? '建設済' : `${escape(cost)}コイン`}</span><span class="compact-market-effect visually-hidden">${effect}</span></button><button type="button" class="compact-market-detail" data-action="showLandmarkDetail" data-landmark-name="${safeName}" aria-label="${safeName}の詳細を開く"><span aria-hidden="true">i</span></button></article>`;
    }

    function buildFacilitiesHtml(options) {
        return buildMenu.buildVisibleCardButtonsHtml({
            ...options,
            renderBuildCardButton: (card, stock, canBuildThis, highlighted) =>
                renderFacility(card, stock, canBuildThis, highlighted, options),
        }) || buildMenu.buildCardEmptyStateHtml(options.cardFilter);
    }

    function buildLandmarksHtml(options) {
        return buildMenu.buildLandmarkButtonsHtml({
            ...options,
            renderLandmarkBuildButton: (name, built, cost, canBuildThis) =>
                renderLandmark(name, built, cost, canBuildThis, options),
        });
    }

    function buildHtml(options) {
        const filter = options.filterBtnsHtml ?? buildMenu.buildCardFilterBarHtml(options.cardFilter);
        const filterLabel = { blue: '青', green: '緑', red: '赤', purple: '紫', affordable: '建設可' }[options.cardFilter] || '全て';
        return `<section class="compact-market" aria-label="中央市場"><header class="compact-market-header"><h2>中央市場</h2>${options.undoBtn || ''}</header>${options.marketStatusHtml || ''}<details class="compact-market-filter-disclosure"><summary>絞込：${options.escapeHtml(filterLabel)}</summary><nav class="compact-market-filters" aria-label="施設の絞り込み">${filter}</nav></details><div class="compact-market-facilities">${buildFacilitiesHtml(options)}</div><details class="compact-market-goal-disclosure"><summary>目標</summary><section class="compact-market-goals" aria-label="自分のランドマーク建設"><h3>ランドマーク</h3><div class="compact-market-landmarks">${buildLandmarksHtml(options)}</div></section></details></section>`;
    }
    return Object.freeze({ buildHtml, buildFacilitiesHtml, buildLandmarksHtml });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = UiCompactMarket;
if (typeof window !== 'undefined') window.UiCompactMarket = UiCompactMarket;
