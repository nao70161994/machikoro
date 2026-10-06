'use strict';

const OnlineRoomShare = (() => {
    const COPY_SUCCESS_MESSAGE = 'ルームIDをコピーしました。参加者に共有してください。';
    const COPY_FALLBACK_MESSAGE = '自動コピーできませんでした。選択した6文字を参加者に共有してください。';
    const WAITING_SLOT_LABEL = '待機中...';

    function escapeText(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeRoomId(roomId) {
        return String(roomId ?? '').trim().toUpperCase();
    }

    function remainingReservationSeconds(reservedUntil, now = Date.now()) {
        if (!Number.isFinite(reservedUntil) || !Number.isFinite(now)) return 0;
        return Math.max(0, Math.ceil((reservedUntil - now) / 1000));
    }

    function buildWaitingStatus(roomId, players = null) {
        const normalizedRoomId = normalizeRoomId(roomId);
        if (!Array.isArray(players)) {
            return `ルーム ${normalizedRoomId} を作成しました。参加者を待っています。`;
        }
        const joinedCount = players.filter(player => player !== WAITING_SLOT_LABEL).length;
        return `ルーム ${normalizedRoomId}。${players.length}枠中${joinedCount}人が参加しています。`;
    }

    function formatCpuSpeed(value) {
        const milliseconds = Number.isInteger(value) && value >= 0 ? value : 1500;
        return milliseconds < 1000
            ? `${milliseconds / 1000}秒`
            : `${(milliseconds / 1000).toFixed(milliseconds % 1000 === 0 ? 0 : 1)}秒`;
    }

    function buildSetupSummaryHtml(value) {
        if (!value || typeof value !== 'object') return '';
        const playerSlots = Array.isArray(value.playerSlots)
            ? value.playerSlots.filter(label => typeof label === 'string').slice(0, 10)
            : [];
        const enabledCards = Array.isArray(value.enabledCards)
            ? value.enabledCards.filter(name => typeof name === 'string').slice(0, 100)
            : [];
        const enabledLandmarks = Array.isArray(value.enabledLandmarks)
            ? value.enabledLandmarks.filter(name => typeof name === 'string').slice(0, 20)
            : [];
        if (playerSlots.length === 0 && enabledCards.length === 0 && enabledLandmarks.length === 0) return '';
        const humanCount = playerSlots.filter(label => label === '人間').length;
        const cpuCount = playerSlots.length - humanCount;
        const marketLabel = value.marketRule === 'ten-type' ? '公式10種類市場' : '通常市場';
        const slots = playerSlots.map((label, index) => `${index + 1}. ${escapeText(label)}`).join(' / ');
        const cards = enabledCards.map(escapeText).join('、') || 'なし';
        const landmarks = enabledLandmarks.map(escapeText).join('、') || 'なし';
        const speed = cpuCount > 0
            ? `<div><dt>CPU速度</dt><dd>${escapeText(formatCpuSpeed(value.cpuSpeed))}</dd></div>`
            : '';
        return `<details class="room-setup-summary">
            <summary id="roomSetupSummaryTitle">対戦設定 <span>${playerSlots.length}人 · 施設${enabledCards.length} · ランドマーク${enabledLandmarks.length}</span></summary>
            <dl>
                <div><dt>人数構成</dt><dd>${playerSlots.length}人（人間${humanCount}・CPU${cpuCount}）</dd></div>
                <div><dt>参加枠</dt><dd>${slots}</dd></div>
                ${speed}
                <div><dt>市場</dt><dd>${marketLabel}</dd></div>
                <div><dt>施設</dt><dd>${enabledCards.length}種類</dd></div>
                <div><dt>ランドマーク</dt><dd>${enabledLandmarks.length}種類</dd></div>
            </dl>
            <details><summary>選択した施設・ランドマークを確認</summary>
                <p><strong>施設:</strong> ${cards}</p>
                <p><strong>ランドマーク:</strong> ${landmarks}</p>
            </details>
        </details>`;
    }

    function buildWaitingHtml(roomId, players = null, options = {}) {
        const normalizedRoomId = normalizeRoomId(roomId);
        const safeRoomId = escapeText(normalizedRoomId);
        const hasPlayerList = Array.isArray(players);
        const marketSymbol = '<svg class="room-market-symbol" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 10v10h16V10M3 10l2-6h14l2 6M3 10c0 3 4 3 4 0 0 3 5 3 5 0 0 3 5 3 5 0 0 3 4 3 4 0M9 20v-6h6v6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        const marketRule = options.marketRule === 'ten-type'
            ? `<section class="room-market-rule ten-type" aria-label="この対戦の市場ルール"><strong>${marketSymbol}公式10種類市場</strong><span>常に異なる10種類になるまで山札から補充します</span></section>`
            : `<section class="room-market-rule standard" aria-label="この対戦の市場ルール"><strong>${marketSymbol}通常市場</strong><span>選択した施設をすべて公開します</span></section>`;
        const setupSummary = buildSetupSummaryHtml(options.setupSummary);
        const participants = Array.isArray(options.participants) ? options.participants : [];
        const selfParticipant = participants.find(player => player.index === options.myPlayerIndex);
        // The server indexes humans by their configured seat, with CPU seats between them.
        const seatIndexes = new Set(hasPlayerList ? players.map((_, index) => index) : []);
        for (const player of participants) {
            if (Number.isInteger(player.index) && player.index >= 0) seatIndexes.add(player.index);
        }
        const orderedSeats = Array.from(seatIndexes).sort((left, right) => left - right);
        const tableColumns = Math.ceil(orderedSeats.length / 2);
        const counts = { empty: 0, preparing: 0, reconnecting: 0, cpu: 0 };
        const seats = orderedSeats.map((index, position) => {
            const player = participants.find(candidate => candidate.index === index);
            const label = player ? player.name : hasPlayerList ? players[index] : WAITING_SLOT_LABEL;
            const empty = label === WAITING_SLOT_LABEL || label === undefined;
            const cpu = !player && !empty && /^CPU（/u.test(label);
            const disconnected = player && player.connected === false;
            const state = disconnected ? 'reconnecting' : empty ? 'empty' : cpu ? 'cpu'
                : player && player.ready === false ? 'preparing' : 'ready';
            if (Object.prototype.hasOwnProperty.call(counts, state)) counts[state]++;
            const stateLabel = disconnected ? '再接続待ち' : empty ? '参加待ち' : cpu ? 'CPU'
                : !player ? '参加済み' : player.ready === false ? '準備中' : '準備完了';
            const roles = player ? [index === options.hostPlayerIndex ? 'ホスト' : '',
                index === options.myPlayerIndex ? 'あなた' : ''].filter(Boolean) : [];
            const remainingSeconds = disconnected ? remainingReservationSeconds(player.reservedUntil, options.now) : 0;
            const name = empty ? '空いている席' : label;
            const countdown = disconnected && remainingSeconds > 0
                ? ` data-reserved-until="${player.reservedUntil}" data-player-name="${escapeText(player.name)}"` : '';
            const displayName = disconnected
                ? `${name}（再接続待ち${remainingSeconds > 0 ? `・残り${remainingSeconds}秒` : ''}）` : name;
            const remove = options.isHost === true && player && index !== options.hostPlayerIndex
                ? `<button type="button" class="room-seat-remove" data-ui-action="removeOnlineLobbyPlayer" data-player-index="${index}" aria-label="${escapeText(`${name}${disconnected ? '（再接続待ち）' : ''}を待機室から外す`)}">外す</button>` : '';
            const side = position < tableColumns ? 'near' : 'far';
            const self = index === options.myPlayerIndex && !!player;
            const chair = '<svg class="room-seat-chair" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M10 27V10Q10 6 15 6H33Q38 6 38 10V27M8 27H40V35H8ZM12 35V43M36 35V43" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M16 12H32V23H16Z" fill="currentColor" opacity=".18"/></svg>';
            return `<li class="room-seat" data-seat-state="${state}" data-seat-index="${index}" data-seat-side="${side}"${self ? ' data-seat-self="true"' : ''}>${chair}<span class="room-seat-number" aria-label="席${index + 1}">${index + 1}</span><div class="room-seat-info"><span class="room-seat-name"${countdown}>${escapeText(displayName)}</span>${roles.length ? `<span class="room-seat-roles">${roles.map(role => `<span>${role}</span>`).join('')}</span>` : ''}</div><strong class="room-seat-state">${stateLabel}</strong>${remove}</li>`;
        }).join('');
        const occupied = orderedSeats.length - counts.empty;
        const nextStep = selfParticipant && selfParticipant.ready === false
            ? '着席したら「準備完了にする」を押してください。'
            : counts.reconnecting > 0 ? '再接続を待っています。ホストは参加席を管理できます。'
            : counts.empty > 0 ? 'ルームIDを共有して、空いている席へ参加してもらいましょう。'
            : counts.preparing > 0 ? 'ほかの参加者が準備を完了するまでお待ちください。'
            : '全員の準備が揃うと対戦が始まります。';
        const tableArt = '<svg class="room-game-table-art" viewBox="0 0 240 160" aria-hidden="true" focusable="false"><ellipse cx="120" cy="91" rx="106" ry="60" fill="#284b4b" stroke="#b6a071" stroke-width="8"/><ellipse cx="120" cy="83" rx="98" ry="54" fill="#52756a" stroke="#d1bd89" stroke-width="3"/><path d="M40 87Q120 54 200 87M66 114Q120 87 174 114" fill="none" stroke="#b4be8b" stroke-width="3"/><path d="M69 77V62L84 51L99 62V77ZM150 78V60H173V78" fill="#d3c5a0" stroke="#3f6065" stroke-width="2"/><rect x="105" y="78" width="29" height="29" rx="5" fill="#f4dfac" stroke="#304f57" stroke-width="2"/><g fill="#3d5c61"><circle cx="112" cy="85" r="2"/><circle cx="127" cy="100" r="2"/><circle cx="119" cy="92" r="2"/></g></svg>';
        const readiness = seats
            ? `<section class="room-readiness room-seats" aria-label="参加者の準備状態"><h4>参加席 <span>${seatIndexes.size}席</span></h4><p class="room-table-status">着席 ${occupied}/${orderedSeats.length}席 · 空席 ${counts.empty}${counts.cpu ? ` · CPU ${counts.cpu}` : ''}${counts.preparing ? ` · 準備中 ${counts.preparing}` : ''}${counts.reconnecting ? ` · 再接続待ち ${counts.reconnecting}` : ''}</p><div class="room-table-layout" data-seat-count="${orderedSeats.length}" style="--room-table-columns:${tableColumns}"><div class="room-game-table">${tableArt}<span>このテーブルで対戦します</span></div><ul class="room-seat-list">${seats}</ul></div>${selfParticipant ? `<button type="button" class="room-ready-btn" data-ui-action="setOnlineLobbyReady" data-ready="${selfParticipant.ready === false ? 'true' : 'false'}" aria-pressed="${selfParticipant.ready === false ? 'false' : 'true'}">${selfParticipant.ready === false ? '準備完了にする' : '準備を取り消す'}</button>` : ''}<p class="room-table-next-step">${nextStep}</p><p class="room-ready-help">参加枠が揃い、全員が準備完了になると自動開始します。</p></section>`
            : '<div class="waiting-players">プレイヤーを待っています...</div>';
        const management = options.isHost === true
            ? `<section class="room-host-controls" aria-label="ホストの待機室管理"><h4>ホスト操作</h4><div class="room-slot-controls"><button type="button" data-ui-action="changeOnlineLobbySlots" data-delta="-1" aria-label="参加枠を1つ減らす">−</button><span>参加枠 ${hasPlayerList ? players.length : 0}</span><button type="button" data-ui-action="changeOnlineLobbySlots" data-delta="1" aria-label="参加枠を1つ増やす">＋</button></div><button type="button" class="room-host-start-btn" data-ui-action="startOnlineLobbyNow">空席をCPU（普通）にして開始</button></section>`
            : '';
        return `<div class="room-share-panel">
            ${hasPlayerList ? '' : '<div class="room-share-state">ルームを作成しました！</div>'}
            <div class="room-share-label">ルームID</div>
            <div class="room-share-row">
                <code class="room-id-display" data-room-id-value tabindex="0">${safeRoomId}</code>
                <button type="button" class="room-id-copy-btn" data-ui-action="copyOnlineRoomId" data-room-id="${safeRoomId}">IDをコピー</button>
            </div>
            <p class="room-share-help">この6文字を参加者に共有してください。</p>
            <button type="button" class="room-qr-toggle" data-ui-action="toggleOnlineRoomQr" data-room-id="${safeRoomId}" aria-expanded="false">QRを表示</button>
            <div class="room-qr-container" data-room-qr-container aria-live="polite"></div>
            ${readiness}
            ${marketRule}
            ${setupSummary}
            ${management}
            <button type="button" class="room-leave-btn" data-ui-action="leaveOnlineLobby">待機室から退出</button>
        </div>`;
    }

    async function copyRoomId(roomId, effects = {}) {
        const normalizedRoomId = normalizeRoomId(roomId);
        try {
            if (!normalizedRoomId || typeof effects.writeText !== 'function') {
                throw new Error('clipboard unavailable');
            }
            await effects.writeText(normalizedRoomId);
            if (typeof effects.notify === 'function') effects.notify(COPY_SUCCESS_MESSAGE);
            return Object.freeze({ copied: true, roomId: normalizedRoomId });
        } catch (_) {
            if (typeof effects.selectText === 'function') effects.selectText();
            if (typeof effects.notify === 'function') effects.notify(COPY_FALLBACK_MESSAGE);
            return Object.freeze({ copied: false, roomId: normalizedRoomId });
        }
    }

    function selectRoomIdText(effects = {}) {
        const documentObject = effects.document;
        const windowObject = effects.window;
        const target = documentObject && typeof documentObject.querySelector === 'function'
            ? documentObject.querySelector('.room-id-display[data-room-id-value]') : null;
        const selection = windowObject && typeof windowObject.getSelection === 'function'
            ? windowObject.getSelection() : null;
        if (!target || !selection || !documentObject ||
                typeof documentObject.createRange !== 'function') return false;
        const range = documentObject.createRange();
        range.selectNodeContents(target);
        selection.removeAllRanges();
        selection.addRange(range);
        if (typeof target.focus === 'function') target.focus({ preventScroll: true });
        return true;
    }

    function toggleRoomQr(roomId, effects = {}) {
        const normalizedRoomId = normalizeRoomId(roomId);
        const documentObject = effects.document;
        const windowObject = effects.window;
        const button = normalizedRoomId && documentObject &&
            typeof documentObject.querySelector === 'function'
            ? documentObject.querySelector(`.room-qr-toggle[data-room-id="${normalizedRoomId}"]`)
            : null;
        const container = button && button.parentElement &&
            typeof button.parentElement.querySelector === 'function'
            ? button.parentElement.querySelector('[data-room-qr-container]') : null;
        if (!button || !container || !container.classList ||
                typeof container.classList.contains !== 'function' ||
                typeof container.classList.toggle !== 'function') return false;
        const visible = !container.classList.contains('is-visible');
        container.classList.toggle('is-visible', visible);
        if (typeof button.setAttribute === 'function') {
            button.setAttribute('aria-expanded', visible ? 'true' : 'false');
        }
        button.textContent = visible ? 'QRを隠す' : 'QRを表示';
        if (visible && !container.innerHTML &&
                typeof effects.buildJoinUrl === 'function' && typeof effects.buildSvg === 'function') {
            const joinUrl = effects.buildJoinUrl(normalizedRoomId,
                windowObject && windowObject.location || {});
            container.innerHTML = effects.buildSvg(joinUrl || normalizedRoomId);
        }
        return true;
    }

    return Object.freeze({
        COPY_FALLBACK_MESSAGE,
        COPY_SUCCESS_MESSAGE,
        WAITING_SLOT_LABEL,
        buildSetupSummaryHtml,
        buildWaitingHtml,
        buildWaitingStatus,
        copyRoomId,
        escapeText,
        normalizeRoomId,
        remainingReservationSeconds,
        selectRoomIdText,
        toggleRoomQr,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineRoomShare;
if (typeof window !== 'undefined') window.OnlineRoomShare = OnlineRoomShare;
if (typeof globalThis !== 'undefined') globalThis.OnlineRoomShare = OnlineRoomShare;
