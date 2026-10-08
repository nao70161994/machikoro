'use strict';
/* global UiBuildMenu, Player */

// Read-only card board. Rules, selected seats, and event boundaries belong to callers.
const UiCardBoard = (() => {
    const colors = new Set(['blue', 'green', 'red', 'purple']);
    const colorNames = Object.freeze({ blue: '青', green: '緑', red: '赤', purple: '紫' });
    const colorLabels = Object.freeze({ blue: '青：全員の手番に発動', green: '緑：自分の手番に発動',
        red: '赤：相手の手番に相手から支払い', purple: '紫：自分の手番の特殊効果' });
    function selectDetailIndices(playerCount, options = {}) {
        const count = Number.isInteger(playerCount) ? Math.max(0, Math.min(10, playerCount)) : 0;
        const all = Array.from({ length: count }, (_, index) => index);
        const maxVisible = Number.isInteger(options.maxVisible)
            ? Math.max(0, Math.min(count, options.maxVisible))
            : count <= 4 ? count : 3;
        if (!maxVisible) return [];
        if (count <= 4 && maxVisible === count) return all;
        const selected = new Set();
        const priority = options.preferSelected === true
            ? [options.selfIndex, options.selectedIndex, options.currentIndex, ...all]
            : [options.selfIndex, options.currentIndex, options.selectedIndex, ...all];
        for (const index of priority) {
            if (Number.isInteger(index) && index >= 0 && index < count) selected.add(index);
            if (selected.size === maxVisible) break;
        }
        return [...selected];
    }
    function escapeDefault(value) {
        return String(value ?? '').replace(/[&<>"']/g, character =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    }
    function helpers(options) {
        return {
            escape: value => (options.escapeHtml || escapeDefault)(String(value ?? '')),
            art: options.renderFacilityArt || (typeof UiBuildMenu !== 'undefined' ? UiBuildMenu.renderFacilityArt : () => ''),
        };
    }
    function landmarkNames(player, options) {
        const known = options.landmarkNames || (typeof Player !== 'undefined' ? Player.landmarkNames() : Object.keys(player.landmarks || {}));
        const enabled = options.enabledLandmarks || known;
        return [...enabled].filter(name => known.includes(name));
    }
    function activationFor(events, name, index) {
        const matching = (events?.activations || []).filter(event => event.facility === true &&
            event.subject === name && (Number.isInteger(event.owner) ? event.owner === index : event.to !== null ? event.to === index : event.from === index) &&
            Number.isSafeInteger(event.amount) && event.amount >= 0);
        if (!matching.length) return null;
        let net = 0, count = 0;
        const activations = new Set();
        for (const event of matching) {
            net += (event.to === index ? event.amount : 0) - (event.from === index ? event.amount : 0);
            if (event.activation && activations.has(event.activation)) continue;
            if (event.activation) activations.add(event.activation);
            count += Number.isSafeInteger(event.count) && event.count > 0 ? event.count : 1;
        }
        const order = matching.reduce((earliest, event) => Number.isInteger(event.order)
            ? earliest === null ? event.order : Math.min(earliest, event.order) : earliest, null);
        return Number.isSafeInteger(net) && Number.isSafeInteger(count)
            ? { net, count, order: Math.max(0, order ?? 0) } : null;
    }
    function buildPlayerHtml(player, options = {}) {
        const { escape, art } = helpers(options);
        const index = Number.isInteger(options.index) ? options.index : 0;
        const grouped = new Map();
        for (const card of player.cards || []) {
            if (!card || typeof card.name !== 'string') continue;
            const group = grouped.get(card.name) || { card, count: 0, dormant: 0 };
            group.count++;
            if (typeof player.isDormant === 'function' ? player.isDormant(card)
                : (player.dormantCards || []).includes(card)) group.dormant++;
            grouped.set(card.name, group);
        }
        const cards = [...grouped.values()].map(({ card, count, dormant }) => {
            const color = colors.has(card.color) ? card.color : 'unknown';
            const dice = (Array.isArray(card.diceNums) ? card.diceNums : []).filter(value => Number.isInteger(value) && value >= 1 && value <= 14);
            const event = activationFor(options.events, card.name, index);
            const activationOrder = event ? Math.min(7, event.order) : 0;
            const eventAttrs = event ? ` data-cardboard-activation-count="${event.count}" data-cardboard-activation-net="${event.net}" data-cardboard-activation-order="${activationOrder}" style="--cardboard-activation-delay:${activationOrder * 100}ms"` : '';
            const eventHtml = event ? `<span class="cardboard-activation" data-short-label="${event.net > 0 ? '+' : ''}${event.net} · ${event.count}回">確認済み：${event.net > 0 ? '+' : ''}${event.net}コイン · 発動${event.count}回</span>` : '';
            return `<button type="button" class="cardboard-card cardboard-card-${color}${dormant === count ? ' cardboard-card-dormant' : ''}${event ? ' cardboard-card-activated' : ''}" data-action="showCardDetail" data-card-name="${escape(card.name)}"${eventAttrs}><span class="cardboard-dice" data-category-label="${escape(colorNames[color] || '不明')}" aria-label="発動する出目 ${escape(dice.join('・'))}">${escape(dice.join('・') || '—')}</span><span class="cardboard-category"><span aria-hidden="true"><span class="card-family-mark" data-category="${escape(card.category)}"></span>${escape(colorNames[color] || '不明')} · ${escape(card.category)}</span><span class="visually-hidden">${escape(card.category)}。${escape(colorLabels[color] || '分類不明')}。詳しい効果を開く。</span></span><span class="cardboard-art">${art(card.name, false, card.category)}</span><span class="cardboard-name">${escape(card.name)}</span><span class="cardboard-count">所有 ×${count}</span>${dormant ? `<span class="cardboard-dormant" data-short-label="休${dormant} 稼${count - dormant}">休業 ${dormant}枚 / 稼働 ${count - dormant}枚</span>` : ''}${eventHtml}</button>`;
        }).join('');
        const names = landmarkNames(player, options);
        const landmarks = names.map(name => {
            const built = player.landmarks?.[name] === true;
            return `<button type="button" class="cardboard-landmark ${built ? 'cardboard-landmark-built' : 'cardboard-landmark-unbuilt'}" data-action="showLandmarkDetail" data-landmark-name="${escape(name)}" title="${escape(name)}：${built ? '建設済' : '未建設'}"><span class="cardboard-art" aria-hidden="true">${art(name, true)}</span><span class="cardboard-name">${escape(name)}</span><span class="cardboard-landmark-status">${built ? '建設済' : '未建設'}</span></button>`;
        }).join('');
        const builtCount = names.filter(name => player.landmarks?.[name] === true).length;
        const content = `<header class="cardboard-header"><h2 title="席${index + 1}・${escape(player.name)}">席${index + 1}・${escape(player.name)}${index === options.selfIndex ? '（自分）' : ''}</h2><p class="cardboard-player-hud"><span class="cardboard-player-coins"><b>${escape(player.coins)}</b>コイン</span><span class="cardboard-player-progress">目標 ${builtCount}/${names.length}</span>${index === options.currentIndex ? '<span class="cardboard-turn-marker">現在の手番</span>' : ''}</p></header>${options.events?.incomplete ? '<p class="cardboard-events-incomplete">収支はログから確認できた分のみです。</p>' : ''}<div class="cardboard-cards">${cards || '<p class="cardboard-empty">所有施設なし</p>'}</div><h3>ランドマーク</h3><div class="cardboard-landmarks">${landmarks || '<p class="cardboard-empty">対象ランドマークなし</p>'}</div>`;
        if (options.contentOnly === true) return content;
        return `<section class="cardboard-player${index === options.selfIndex ? ' cardboard-player-self' : ''}${index === options.currentIndex ? ' cardboard-player-current' : ''}" data-cardboard-player-index="${index}">${content}</section>`;
    }
    function buildRosterHtml(players, options = {}) {
        const { escape } = helpers(options);
        return `<nav class="cardboard-roster" aria-label="表示するプレイヤー">${players.slice(0, 10).map((player, index) => {
            const names = landmarkNames(player, options);
            const built = names.filter(name => player.landmarks?.[name] === true).length;
            const counts = { blue: 0, green: 0, red: 0, purple: 0 };
            for (const card of player.cards || []) { if (Object.hasOwn(counts, card.color)) counts[card.color]++; }
            const trend = Object.keys(counts).map(color => `<span class="cardboard-color-count cardboard-color-count-${color}">${colorNames[color]} ${counts[color]}</span>`).join('');
            return `<button type="button" class="cardboard-roster-seat${index === options.selfIndex ? ' cardboard-roster-self' : ''}" data-cardboard-player-index="${index}" aria-pressed="${index === options.selectedIndex}"${index === options.currentIndex ? ' aria-current="true"' : ''}><strong>席${index + 1}・${escape(player.name)}${index === options.selfIndex ? '（自分）' : ''}</strong><span>${escape(player.coins)}コイン · 目標 ${built}/${names.length}</span><small class="cardboard-roster-trend">${trend}</small></button>`;
        }).join('')}</nav>`;
    }
    return Object.freeze({ buildPlayerHtml, buildRosterHtml, selectDetailIndices });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = UiCardBoard;
if (typeof window !== 'undefined') window.UiCardBoard = UiCardBoard;
