'use strict';

const UiPlayerInsights = (() => {
    function snapshot(player, options = {}) {
        const cards = Array.isArray(player?.cards) ? player.cards : [];
        const grouped = new Map();
        for (const card of cards) {
            if (!card || typeof card.name !== 'string') continue;
            const row = grouped.get(card.name) || { name: card.name, count: 0, dormant: 0 };
            row.count++;
            if (typeof player.isDormant === 'function' && player.isDormant(card)) row.dormant++;
            grouped.set(card.name, row);
        }
        const known = new Set(Array.isArray(options.landmarkNames) ? options.landmarkNames : []);
        const landmarks = Array.from(options.enabledLandmarks || []).filter(name => known.has(name))
            .map(name => Object.freeze({ name, built: player.landmarks?.[name] === true }));
        return Object.freeze({
            name: String(player?.name || ''), coins: player?.coins || 0,
            cards: Object.freeze([...grouped.values()].map(row => Object.freeze(row))),
            landmarks: Object.freeze(landmarks), hasYakusho: player?.hasYakusho === true,
        });
    }

    function buildHtml(player, escapeHtml, options = {}) {
        const view = snapshot(player, options);
        const facilities = view.cards.map(row => `<li><button type="button" data-action="showCardDetail" data-card-name="${escapeHtml(row.name)}">${escapeHtml(row.name)} ×${row.count}${row.dormant ? `（休業 ${row.dormant}枚）` : ''}</button></li>`).join('');
        const landmarks = view.landmarks.map(row => `<li><button type="button" data-action="showLandmarkDetail" data-landmark-name="${escapeHtml(row.name)}">${escapeHtml(row.name)}：${row.built ? '建設済' : '未建設'}</button></li>`).join('');
        return `<p class="plaza-insights-coins">所持 ${escapeHtml(String(view.coins))}コイン</p><h3>所有施設</h3><ul class="plaza-insights-facilities">${facilities || '<li>施設なし</li>'}</ul><h3>ランドマーク</h3><ul class="plaza-insights-landmarks">${landmarks}</ul><p>役所：${view.hasYakusho ? 'あり' : 'なし'}</p>`;
    }

    return Object.freeze({ snapshot, buildHtml });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiPlayerInsights;
if (typeof window !== 'undefined') window.UiPlayerInsights = UiPlayerInsights;
if (typeof globalThis !== 'undefined') globalThis.UiPlayerInsights = UiPlayerInsights;
