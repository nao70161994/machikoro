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
        const matchesRoll = Number.isInteger(options.activeDiceValue) &&
            Array.isArray(card.diceNums) && card.diceNums.includes(options.activeDiceValue);
        const color = buildMenu.safeCardColorName(card.color);
        const colorName = colorNames[color] || '不明';
        const art = options.renderFacilityArt || buildMenu.renderFacilityArt;
        const effect = escape(getEffectText(card));
        const status = canBuildThis ? `${escape(card.cost)}コインで建設可能`
            : options.current?.coins < card.cost ? `コイン不足、${escape(card.cost)}コイン必要`
                : card.color === 'purple' && options.current?.countCardIncludingDormant?.(card.name) > 0
                    ? '紫施設はすでに所有済みのため建設できません' : '現在は建設できません';
        const coins = Number(options.current?.coins) || 0;
        const shortAffordability = !canBuildThis && coins < card.cost
            ? `<span>不足${escape(card.cost - coins)}コ</span><span>価格${escape(card.cost)}コ</span>`
            : !canBuildThis && card.color === 'purple' && options.current?.countCardIncludingDormant?.(card.name) > 0
                ? `<span>所有済み</span><span>価格${escape(card.cost)}コ</span>` : '';
        const affordability = !canBuildThis && coins < card.cost
            ? `不足${escape(card.cost - coins)}コイン・価格${escape(card.cost)}コイン`
            : !canBuildThis && card.color === 'purple' && options.current?.countCardIncludingDormant?.(card.name) > 0
                ? `所有済み・価格${escape(card.cost)}コイン` : `${escape(card.cost)}コイン`;
        const compactStatus = shortAffordability
            ? `<span class="compact-market-price-short" aria-hidden="true">${shortAffordability}</span>` : '';
        return `<article class="compact-market-item compact-market-${color}${canBuildThis ? '' : ' compact-market-unavailable'}${highlighted ? ' compact-market-refilled' : ''}${matchesRoll ? ' compact-market-roll-match' : ''}"><button type="button" class="compact-market-buy${canBuildThis ? ' can-afford' : ''}" data-action="buildCard" data-card-name="${name}"${canBuildThis ? '' : ' disabled'} aria-label="${name}。${colorName}、${escape(card.category)}。出目${escape(card.diceNums.join('・'))}${matchesRoll ? `。今回の出目${escape(options.activeDiceValue)}に一致。今建設しても、この出目では発動しません` : ''}。${status}。残り${escape(stock)}枚。${effect}"><span class="compact-market-dice" aria-label="発動する出目 ${escape(card.diceNums.join('・'))}">${escape(card.diceNums.join('・'))}</span><span class="compact-market-kind"><span class="card-family-mark" data-category="${escape(card.category)}" aria-hidden="true"></span>${colorName} · ${escape(card.category)}</span><span class="compact-market-art" aria-hidden="true">${art(card.name, false, card.category)}</span><strong class="compact-market-name">${name}</strong><span class="compact-market-price${compactStatus ? ' compact-market-price-has-short' : ''}"${canBuildThis ? '' : ' data-build-status="unavailable"'}><span class="compact-market-price-full">${affordability}</span>${compactStatus}</span><span class="compact-market-effect visually-hidden">${effect}</span><span class="compact-market-stock" data-short-stock="残${escape(stock)}">残り${escape(stock)}枚${highlighted ? ' · 補充' : ''}</span></button><button type="button" class="compact-market-detail" data-action="showCardDetail" data-card-name="${name}" aria-label="${name}の詳細を開く"><span aria-hidden="true">i</span></button></article>`;
    }

    function renderLandmark(name, built, cost, canBuildThis, options) {
        const { escapeHtml, getLandmarkEffectText } = options;
        const escape = value => escapeHtml(String(value));
        const safeName = escape(name);
        const effect = escape(getLandmarkEffectText(name));
        const renderArt = options.renderFacilityArt || buildMenu.renderFacilityArt;
        const status = built ? '建設済'
            : canBuildThis ? `${escape(cost)}コインで建設可能`
                : options.currentCoins < cost ? `コイン不足、${escape(cost)}コイン必要` : '現在は建設できません';
        const currentCoins = Number(options.currentCoins) || 0;
        const priceLabel = built ? '建設済' : !canBuildThis && currentCoins < cost
            ? `不足${escape(cost - currentCoins)}コイン・価格${escape(cost)}コイン`
            : `${escape(cost)}コイン`;
        const compactPrice = !built && !canBuildThis && currentCoins < cost
            ? `<span>不足${escape(cost - currentCoins)}コ</span><span>価格${escape(cost)}コ</span>` : '';
        const compactStatus = compactPrice
            ? `<span class="compact-market-price-short" aria-hidden="true">${compactPrice}</span>` : '';
        return `<article class="compact-market-item compact-market-landmark${built ? ' compact-market-built' : !canBuildThis ? ' compact-market-unavailable' : ''}"><button type="button" class="compact-market-buy${canBuildThis ? ' can-afford' : ''}" data-action="buildLandmark" data-landmark-name="${safeName}"${canBuildThis ? '' : ' disabled'} aria-label="${safeName}、${status}。${effect}"><span class="compact-market-art" aria-hidden="true">${renderArt(name, true)}</span><strong class="compact-market-name">${safeName}</strong><span class="compact-market-price${compactStatus ? ' compact-market-price-has-short' : ''}"${canBuildThis || built ? '' : ' data-build-status="unavailable"'}><span class="compact-market-price-full">${priceLabel}</span>${compactStatus}</span><span class="compact-market-effect visually-hidden">${effect}</span></button><button type="button" class="compact-market-detail" data-action="showLandmarkDetail" data-landmark-name="${safeName}" aria-label="${safeName}の詳細を開く"><span aria-hidden="true">i</span></button></article>`;
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
        return `<section class="compact-market" aria-label="中央市場"><header class="compact-market-header"><h2>中央市場</h2><button type="button" class="compact-market-expand" data-action="expandMarket" aria-controls="cardboardMarketDialog" aria-haspopup="dialog" aria-expanded="false" aria-label="中央市場を大きく表示">拡大</button>${options.undoBtn || ''}</header>${options.marketStatusHtml || ''}<details class="compact-market-filter-disclosure"><summary>絞込：${options.escapeHtml(filterLabel)}</summary><nav class="compact-market-filters" aria-label="施設の絞り込み">${filter}</nav></details><div class="compact-market-facilities" role="region" aria-label="中央市場の施設一覧" tabindex="0">${buildFacilitiesHtml(options)}</div><details class="compact-market-goal-disclosure"><summary>目標</summary><section class="compact-market-goals" aria-label="自分のランドマーク建設"><h3>ランドマーク</h3><div class="compact-market-landmarks">${buildLandmarksHtml(options)}</div></section></details></section>`;
    }
    return Object.freeze({ buildHtml, buildFacilitiesHtml, buildLandmarksHtml });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = UiCompactMarket;
if (typeof window !== 'undefined') window.UiCompactMarket = UiCompactMarket;
