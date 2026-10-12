'use strict';

const UiPlayerInsights = (() => {
    function snapshot(player, options = {}) {
        const cards = Array.isArray(player?.cards) ? player.cards : [];
        const definitions = new Map((Array.isArray(options.cardDefinitions) ? options.cardDefinitions : [])
            .filter(card => card && typeof card.name === 'string').map(card => [card.name, card]));
        const grouped = new Map();
        for (const card of cards) {
            if (!card || typeof card.name !== 'string') continue;
            const definition = definitions.get(card.name);
            const row = grouped.get(card.name) || {
                name: card.name, count: 0, dormant: 0,
                color: ['blue', 'green', 'red', 'purple'].includes(definition?.color) ? definition.color : 'blue',
                category: typeof definition?.category === 'string' ? definition.category : '',
                diceNums: Array.isArray(definition?.diceNums) ? [...definition.diceNums] : [],
            };
            row.count++;
            if (typeof player.isDormant === 'function' && player.isDormant(card)) row.dormant++;
            grouped.set(card.name, row);
        }
        const known = new Set(Array.isArray(options.landmarkNames) ? options.landmarkNames : []);
        const landmarks = Array.from(options.enabledLandmarks || []).filter(name => known.has(name))
            .map(name => Object.freeze({ name, built: player.landmarks?.[name] === true }));
        const orderedCards = [...grouped.values()].sort((left, right) => {
            const leftRoll = Number.isFinite(left.diceNums[0]) ? left.diceNums[0] : Number.POSITIVE_INFINITY;
            const rightRoll = Number.isFinite(right.diceNums[0]) ? right.diceNums[0] : Number.POSITIVE_INFINITY;
            return leftRoll - rightRoll || left.name.localeCompare(right.name, 'ja');
        });
        return Object.freeze({
            name: String(player?.name || ''), coins: player?.coins || 0,
            cards: Object.freeze(orderedCards.map(row => Object.freeze({
                ...row, diceNums: Object.freeze(row.diceNums),
            }))),
            landmarks: Object.freeze(landmarks), hasYakusho: player?.hasYakusho === true,
        });
    }

    function buildHtml(player, escapeHtml, options = {}) {
        const view = snapshot(player, options);
        const art = typeof options.renderFacilityArt === 'function' ? options.renderFacilityArt : () => '';
        const facilities = view.cards.map(row => {
            const name = escapeHtml(row.name);
            const dice = row.diceNums.length ? row.diceNums.map(escapeHtml).join('・') : '—';
            const dormant = row.dormant ? `<span class="plaza-insight-dormant">休業 ${row.dormant}枚</span>` : '';
            const label = `${row.name}、出目 ${row.diceNums.join('・') || '不明'}、所有 ${row.count}枚${row.dormant ? `、休業 ${row.dormant}枚` : ''}`;
            return `<li class="plaza-insight-card plaza-insight-card-${row.color}"><button type="button" data-action="showCardDetail" data-card-name="${name}" aria-label="${escapeHtml(label)}"><span class="plaza-insight-card-top"><span class="plaza-insight-dice">出目 ${dice}</span><span class="plaza-insight-count">×${row.count}</span></span>${art(row.name, false, row.category)}<span class="plaza-insight-card-name">${name}</span>${dormant}</button></li>`;
        }).join('');
        const landmarks = view.landmarks.map(row => {
            const name = escapeHtml(row.name);
            return `<li class="plaza-insight-landmark${row.built ? ' is-built' : ''}"><button type="button" data-action="showLandmarkDetail" data-landmark-name="${name}" aria-label="${escapeHtml(`${row.name}、${row.built ? '建設済み' : '未建設'}`)}">${art(row.name, true)}<span>${name}</span><small>${row.built ? '建設済み' : '未建設'}</small></button></li>`;
        }).join('');
        return `<p class="plaza-insights-coins">所持 ${escapeHtml(String(view.coins))}コイン</p><h3>所有施設・出目順</h3><ul class="plaza-insights-facilities">${facilities || '<li>施設なし</li>'}</ul><h3>ランドマーク</h3><ul class="plaza-insights-landmarks">${landmarks}</ul><p>役所：${view.hasYakusho ? 'あり' : 'なし'}</p>`;
    }

    return Object.freeze({ snapshot, buildHtml });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiPlayerInsights;
if (typeof window !== 'undefined') window.UiPlayerInsights = UiPlayerInsights;
if (typeof globalThis !== 'undefined') globalThis.UiPlayerInsights = UiPlayerInsights;
