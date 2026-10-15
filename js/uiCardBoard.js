'use strict';
/* global UiBuildMenu, Player */

// Read-only card board. Rules, selected seats, and event boundaries belong to callers.
const UiCardBoard = (() => {
    const colors = new Set(['blue', 'green', 'red', 'purple']);
    const colorNames = Object.freeze({ blue: '青', green: '緑', red: '赤', purple: '紫' });
    const colorLabels = Object.freeze({ blue: '青：全員の手番に発動', green: '緑：自分の手番に発動',
        red: '赤：相手の手番に相手から支払い', purple: '紫：自分の手番の特殊効果' });
    function selectTableIndices(playerCount) {
        const count = Number.isInteger(playerCount) ? Math.max(0, Math.min(10, playerCount)) : 0;
        return Array.from({ length: count }, (_, index) => index);
    }
    function eventFocusSeatIndex(playerCount, milestones = [], activations = []) {
        const count = Number.isInteger(playerCount) ? Math.max(0, Math.min(10, playerCount)) : 0;
        if (count === 0) return null;
        const isSeat = index => Number.isInteger(index) && index >= 0 && index < count;
        const builtSeat = milestones.find(milestone => isSeat(milestone?.playerIndex))?.playerIndex;
        if (isSeat(builtSeat)) return builtSeat;
        const firstActivation = activations.find(event => event?.facility === true &&
            [event.owner, event.to, event.from].some(isSeat));
        if (!firstActivation) return null;
        return [firstActivation.owner, firstActivation.to, firstActivation.from].find(isSeat) ?? null;
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
    function buildConstructionReceiptHtml(player, options = {}) {
        if (!player || typeof options.name !== 'string' || !options.name) return '';
        const { escape, art } = helpers(options);
        const name = options.name;
        const landmark = options.landmark === true;
        const card = !landmark && (player.cards || []).find(candidate => candidate.name === name);
        if (landmark ? player.landmarks?.[name] !== true : !card) return '';
        const count = landmark ? null : player.cards.filter(candidate => candidate.name === name).length;
        const names = landmarkNames(player, options);
        const built = names.filter(candidate => player.landmarks?.[candidate] === true).length;
        const detail = landmark ? `ランドマーク完成 · 目標 ${built}/${names.length}` : `建設完了 · 現在の所有 ×${count}`;
        const action = landmark ? 'showLandmarkDetail' : 'showCardDetail';
        const subjectAttribute = landmark ? 'data-landmark-name' : 'data-card-name';
        const detailHtml = landmark
            ? `<span class="cardboard-build-receipt-detail">ランドマーク完成</span><span class="cardboard-build-receipt-progress"><span>目標</span><strong>${built}/${names.length}</strong></span>`
            : `<span class="cardboard-build-receipt-detail">${escape(detail)}</span>`;
        return `<button type="button" class="cardboard-build-receipt plaza-important-event plaza-important-${landmark ? 'landmark' : 'build'}" data-kind="${landmark ? 'landmark' : 'facility'}" data-action="${action}" ${subjectAttribute}="${escape(name)}" aria-label="${escape(`${player.name}の${name}。${detail}。詳しい効果を表示`)}"><span class="cardboard-build-receipt-art" aria-hidden="true">${art(name, landmark, card?.category || '')}</span><span class="cardboard-build-receipt-copy"><span class="cardboard-build-receipt-player">${escape(player.name)}の街に</span><strong class="cardboard-build-receipt-name">${escape(name)}</strong>${detailHtml}</span><span class="cardboard-build-receipt-more" aria-hidden="true">›</span></button>`;
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
        if (!Number.isSafeInteger(net) || !Number.isSafeInteger(count)) return null;
        const firstLogIndex = Math.max(0, events.activations.indexOf(matching[0]));
        const precedingActivations = new Set();
        for (let index = 0; index < firstLogIndex; index++) {
            const prior = events.activations[index];
            if (prior?.facility !== true) continue;
            precedingActivations.add(prior.activation || `legacy:${index}`);
        }
        return { net, count, order: precedingActivations.size, logOrder: firstLogIndex };
    }
    function buildActivationPreviewHtml(events, players, options = {}) {
        if (!Array.isArray(players) || !Array.isArray(events?.activations)) return '';
        const { escape, art } = helpers(options);
        const definitions = Array.isArray(options.cards) ? options.cards : players.flatMap(player => player?.cards || []);
        const known = new Map(definitions.filter(card => card && typeof card.name === 'string').map(card => [card.name, card]));
        const groups = new Map();
        const validEvents = [];
        for (const event of events.activations) {
            if (event?.facility !== true || !known.has(event.subject) || !Number.isSafeInteger(event.amount) || event.amount < 0) continue;
            // Match activationFor's historical recipient/bank-payment inference,
            // while a supplied typed owner must be a valid player seat.
            const typedOwner = event.owner !== undefined && event.owner !== null;
            const owner = typedOwner ? event.owner : event.to !== null ? event.to : event.from;
            if (!Number.isInteger(owner) || owner < 0 || owner >= players.length || !players[owner]) continue;
            const projected = { ...event, owner };
            validEvents.push(projected);
            const key = JSON.stringify([owner, event.subject]);
            if (!groups.has(key)) groups.set(key, { owner, name: event.subject });
        }
        const previews = [];
        for (const group of groups.values()) {
            const activation = activationFor({ activations: validEvents }, group.name, group.owner);
            if (!activation) continue;
            const signed = `${activation.net > 0 ? '+' : ''}${activation.net}`;
            const owner = `席${group.owner + 1}・${players[group.owner].name || 'プレイヤー'}`;
            const label = `${owner}の${group.name}。施設収支${signed}コイン、発動${activation.count}回`;
            const category = known.get(group.name).category || '';
            previews.push(`<span class="cardboard-event-preview-card" role="group" data-player-index="${group.owner}" data-card-name="${escape(group.name)}" title="${escape(label)}" aria-label="${escape(label)}"><span class="cardboard-event-preview-art" aria-hidden="true">${art(group.name, false, category)}</span><span class="cardboard-event-preview-name">${escape(group.name)}</span><span class="cardboard-event-preview-owner">${escape(owner)} · ${escape(signed)}コイン</span></span>`);
            if (previews.length === 2) break;
        }
        return previews.join('');
    }

    function playerKind(options, index) {
        const setting = options.playerSettings?.[index];
        if (!setting) return { html: '', label: '' };
        return {
            html: typeof options.renderPlayerKindIcon === 'function' ? options.renderPlayerKindIcon(setting, index) : '',
            label: typeof options.playerKindAccessibleLabel === 'function' ? options.playerKindAccessibleLabel(setting) : '',
        };
    }
    function compareDiceSequences(left, right) {
        const length = Math.min(left.length, right.length);
        for (let index = 0; index < length; index++) {
            if (left[index] !== right[index]) return left[index] - right[index];
        }
        return left.length - right.length;
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
        const cards = [...grouped.values()].map(group => ({
            ...group,
            dice: (Array.isArray(group.card.diceNums) ? group.card.diceNums : [])
                .filter(value => Number.isInteger(value) && value >= 1 && value <= 14),
        })).sort((left, right) => compareDiceSequences(left.dice, right.dice))
            .map(({ card, count, dormant, dice }) => {
                const color = colors.has(card.color) ? card.color : 'unknown';
                const event = activationFor(options.events, card.name, index);
                const eventAttrs = event ? ` data-cardboard-activation-count="${event.count}" data-cardboard-activation-net="${event.net}"` : '';
                const activationStyle = event ? ` style="--cardboard-activation-delay:${Math.min(Math.max(event.logOrder, 0), 7) * 80}ms"` : '';
                const majorIncomeClass = event?.net >= 5 ? ' cardboard-card-major-income' : '';
                const effectText = typeof options.getEffectText === 'function' ? options.getEffectText(card) : '';
                const effectHtml = effectText ? `<span class="cardboard-effect" title="${escape(effectText)}">${escape(effectText)}</span>` : '';
                const activationStepClass = event ? ` cardboard-activation-step-${Math.min(event.order, 4)}` : '';
                const eventHtml = event ? `<span class="cardboard-activation" data-short-label="#${event.order + 1} ${event.net > 0 ? '+' : ''}${event.net}·${event.count}">発動${event.order + 1}番目 · 確認済み：${event.net > 0 ? '+' : ''}${event.net}コイン · 発動${event.count}回</span>` : '';
                const cardTitle = `${card.name} · ${colorNames[color] || '不明'} ${card.category} · 出目 ${dice.join('・') || '—'} · 所有 ×${count}${dormant ? ` · 休業 ${dormant}枚` : ''}${event ? ` · 今回 ${event.net > 0 ? '+' : ''}${event.net}コイン、${event.count}回発動` : ''}`;
                const accessibleLabel = [
                    card.name,
                    `${colorNames[color] || '不明'}、${card.category}。${colorLabels[color] || '分類不明'}`,
                    `出目 ${dice.join('、') || 'なし'}`,
                    `所有 ${count}枚`,
                    effectText,
                    dormant ? `休業 ${dormant}枚、稼働 ${count - dormant}枚` : '',
                    event ? `今回、施設連鎖の${event.order + 1}番目、確認できた純収支 ${event.net > 0 ? '+' : ''}${event.net}コイン、発動 ${event.count}回` : '',
                    '詳しい効果を表示',
                ].filter(Boolean).join('。');
                return `<button type="button" class="cardboard-card cardboard-card-${color}${dormant === count ? ' cardboard-card-dormant' : ''}${event ? ` cardboard-card-activated${activationStepClass}` : ''}${majorIncomeClass}" data-action="showCardDetail" data-card-name="${escape(card.name)}"${event ? ` data-cardboard-activation-order="${event.order + 1}"` : ''} title="${escape(cardTitle)}" aria-label="${escape(accessibleLabel)}"${eventAttrs}${activationStyle}><span class="cardboard-dice" data-category-label="${escape(colorNames[color] || '不明')}" aria-hidden="true">${escape(dice.join('・') || '—')}</span><span class="cardboard-category"><span aria-hidden="true"><span class="card-family-mark" data-category="${escape(card.category)}"></span>${escape(colorNames[color] || '不明')} · ${escape(card.category)}</span><span class="visually-hidden">${escape(card.category)}。${escape(colorLabels[color] || '分類不明')}。詳しい効果を開く。</span></span><span class="cardboard-art" aria-hidden="true">${art(card.name, false, card.category)}</span><span class="cardboard-name">${escape(card.name)}</span><span class="cardboard-count">所有 ×${count}</span>${effectHtml}${dormant ? `<span class="cardboard-dormant" data-short-label="休${dormant} 稼${count - dormant}">休業 ${dormant}枚 / 稼働 ${count - dormant}枚</span>` : ''}${eventHtml}</button>`;
        }).join('');
        const names = landmarkNames(player, options);
        const landmarks = names.map(name => {
            const built = player.landmarks?.[name] === true;
            return `<button type="button" class="cardboard-landmark ${built ? 'cardboard-landmark-built' : 'cardboard-landmark-unbuilt'}" data-action="showLandmarkDetail" data-landmark-name="${escape(name)}" aria-label="${escape(name)}、${built ? '建設済' : '未建設'}。詳細を表示" title="${escape(name)}：${built ? '建設済' : '未建設'}"><span class="cardboard-art" aria-hidden="true">${art(name, true)}</span><span class="cardboard-landmark-copy"><span class="cardboard-name">${escape(name)}</span><span class="cardboard-landmark-status">${built ? '建設済' : '未建設'}</span></span></button>`;
        }).join('');
        const builtCount = names.filter(name => player.landmarks?.[name] === true).length;
        const ownedCardCount = Array.isArray(player.cards) ? player.cards.length : 0;
        const facilityShelfLabel = `${player.name}の施設、${grouped.size}種類、合計${ownedCardCount}枚`;
        const townScenery = grouped.size > 0 && grouped.size <= 2 && ownedCardCount <= 4 &&
            typeof options.renderTownScenery === 'function'
            ? `<div class="cardboard-town-vignette" aria-hidden="true"><span class="cardboard-town-vignette-caption">街の風景</span>${options.renderTownScenery(player, new Set(names))}</div>` : '';
        const facilityHeading = `<h3 class="cardboard-facility-heading"><span>所有施設</span><small><span>${grouped.size}種類 · ${ownedCardCount}枚</span><span class="cardboard-facility-scroll-hint" aria-hidden="true"></span></small></h3>`;
        const kind = playerKind(options, index);
        const kindBadge = kind.html ? `<span class="cardboard-player-kind" aria-hidden="true">${kind.html}</span>` : '';
        const kindDescription = kind.label ? `<span class="visually-hidden">${escape(kind.label)}。</span>` : '';
        const heading = index === options.selfIndex ? 'あなたの施設' : `席${index + 1}・${player.name}`;
        const headingContext = index === options.selfIndex
            ? `<span class="visually-hidden">席${index + 1}・${escape(player.name)}（自分）</span>` : '';

        const content = `<header class="cardboard-header"><h2 class="cardboard-player-heading" title="席${index + 1}・${escape(player.name)}"><span class="cardboard-player-heading-name">${escape(heading)}</span>${kindBadge}${headingContext}${kindDescription}</h2><p class="cardboard-player-hud"><span class="cardboard-player-coins"><b>${escape(player.coins)}</b>コイン</span><span class="cardboard-player-progress">目標 ${builtCount}/${names.length}</span>${index === options.currentIndex ? '<span class="cardboard-turn-marker">手番</span>' : ''}</p></header>${options.events?.incomplete ? '<p class="cardboard-events-incomplete">収支はログから確認できた分のみです。</p>' : ''}${facilityHeading}<div class="cardboard-cards" role="group" aria-label="${escape(facilityShelfLabel)}">${cards || '<p class="cardboard-empty">所有施設なし</p>'}${townScenery}</div><h3 class="cardboard-landmark-heading"><span>ランドマーク</span><span class="cardboard-landmark-scroll-hint" aria-hidden="true" hidden>横にスクロール →</span></h3><div class="cardboard-landmarks">${landmarks || '<p class="cardboard-empty">対象ランドマークなし</p>'}</div>`;
        if (options.contentOnly === true) return content;
        return `<section class="cardboard-player${index === options.selfIndex ? ' cardboard-player-self' : ''}${index === options.currentIndex ? ' cardboard-player-current' : ''}" data-cardboard-player-index="${index}">${content}</section>`;
    }
    function buildRosterHtml(players, options = {}) {
        const { escape } = helpers(options);
        const activationCounts = new Map();
        for (const activation of options.events?.activations || []) {
            if (!Number.isInteger(activation.owner) || activation.owner < 0 || activation.owner >= players.length) continue;
            const owners = activationCounts.get(activation.owner) || new Map();
            const identity = activation.activation || `legacy:${activation.subject}`;
            const repeats = Number.isSafeInteger(activation.count) && activation.count > 0 ? activation.count : 1;
            // A single typed activation can have several recipient routes. Keep
            // the highest repeat count for that activation instead of summing routes.
            owners.set(identity, Math.max(owners.get(identity) || 0, repeats));
            activationCounts.set(activation.owner, owners);
        }
        const keyboardHint = players.length > 1
            ? 'キーボードでは左右矢印、Home、Endで席を移動できます。' : '';
        const rosterLabel = players.length > 4
            ? `表示するプレイヤー。席が隠れている場合は横にスクロールして選べます。${keyboardHint}選ぶと所有施設カードを大きく表示`
            : `表示するプレイヤー。${keyboardHint}選ぶと所有施設カードを大きく表示`;
        const rovingIndex = Number.isInteger(options.selectedIndex) && options.selectedIndex >= 0 && options.selectedIndex < players.length
            ? options.selectedIndex
            : Number.isInteger(options.currentIndex) && options.currentIndex >= 0 && options.currentIndex < players.length
                ? options.currentIndex : 0;
        return `<nav class="cardboard-roster" aria-label="${escape(rosterLabel)}">${players.slice(0, 10).map((player, index) => {
            const names = landmarkNames(player, options);
            const built = names.filter(name => player.landmarks?.[name] === true).length;
            const counts = { blue: 0, green: 0, red: 0, purple: 0 };
            for (const card of player.cards || []) { if (Object.hasOwn(counts, card.color)) counts[card.color]++; }
            const trend = Object.keys(counts).map(color => `<span class="cardboard-color-count cardboard-color-count-${color}">${colorNames[color]} ${counts[color]}</span>`).join('');
            const kind = playerKind(options, index);
            const kindIcon = kind.html ? `<span class="cardboard-roster-kind" aria-hidden="true">${kind.html}</span>` : '';
            const kindLabel = kind.label;
            const roles = `${index === options.selfIndex ? '<span class="cardboard-roster-badge cardboard-roster-self-badge">あなた</span>' : ''}${index === options.currentIndex ? '<span class="cardboard-roster-badge cardboard-roster-turn-badge">手番</span>' : ''}`;
            const activationCount = [...(activationCounts.get(index)?.values() || [])].reduce((total, count) =>
                Number.isSafeInteger(total + count) ? total + count : total, 0);
            const activationBadge = activationCount ? `<span class="cardboard-roster-badge cardboard-roster-activation-badge">施設 ${activationCount}回</span>` : '';
            const roleLabels = `${index === options.selfIndex ? '、あなた' : ''}${index === options.currentIndex ? '、現在の手番' : ''}`;
            const showingDetails = options.focusMode === true && index === options.selectedIndex;
            return `<button type="button" class="cardboard-roster-seat${index === options.selfIndex ? ' cardboard-roster-self' : ''}${activationCount ? ' cardboard-roster-activated' : ''}" data-cardboard-player-index="${index}" tabindex="${index === rovingIndex ? '0' : '-1'}" title="席${index + 1}・${escape(player.name)}" aria-pressed="${index === options.selectedIndex}" aria-label="席${index + 1}・${escape(player.name)}${roleLabels}${showingDetails ? '、施設カードを選択中' : ''}${kindLabel ? `、${escape(kindLabel)}` : ''}、${escape(player.coins)}コイン、目標 ${built}/${names.length}${activationCount ? `、今回施設発動 ${activationCount}回` : ''}"${index === options.currentIndex ? ' aria-current="true"' : ''}><strong><span class="cardboard-roster-seat-number">席${index + 1}</span>${kindIcon}<span class="cardboard-roster-name">${escape(player.name)}</span>${roles}${activationBadge}</strong><span class="cardboard-roster-summary"><span class="cardboard-roster-summary-text"><b class="cardboard-roster-coins">${escape(player.coins)}<span>コイン</span></b><span class="cardboard-roster-progress"><span> · 目標 </span><b>${built}/${names.length}</b></span></span></span><small class="cardboard-roster-trend">${trend}</small></button>`;
        }).join('')}</nav>`;
    }
    return Object.freeze({ buildPlayerHtml, buildRosterHtml, buildConstructionReceiptHtml, buildActivationPreviewHtml, selectTableIndices, eventFocusSeatIndex });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = UiCardBoard;
if (typeof window !== 'undefined') window.UiCardBoard = UiCardBoard;
