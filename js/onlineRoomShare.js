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

    function buildWaitingHtml(roomId, players = null, options = {}) {
        const normalizedRoomId = normalizeRoomId(roomId);
        const safeRoomId = escapeText(normalizedRoomId);
        const hasPlayerList = Array.isArray(players);
        const marketRule = options.marketRule === 'ten-type'
            ? '<section class="room-market-rule ten-type" aria-label="この対戦の市場ルール"><strong>🏪 公式10種類市場</strong><span>常に異なる10種類になるまで山札から補充します</span></section>'
            : '<section class="room-market-rule standard" aria-label="この対戦の市場ルール"><strong>🏪 通常市場</strong><span>選択した施設をすべて公開します</span></section>';
        const hasWaitingSlot = hasPlayerList && players.some(player => player === WAITING_SLOT_LABEL);
        const playerList = hasPlayerList
            ? `<div class="waiting-players">参加枠（${players.length}枠）: ${players.map(escapeText).join('、')}</div>`
            : '<div class="waiting-players">プレイヤーを待っています...</div>';
        const startHelp = hasWaitingSlot
            ? '<p class="room-share-start-help">参加枠が揃い、全員が準備完了になると自動開始します。</p>'
            : '';
        const participants = Array.isArray(options.participants) ? options.participants : [];
        const selfParticipant = participants.find(player => player.index === options.myPlayerIndex);
        const readiness = participants.length > 0
            ? `<section class="room-readiness" aria-label="参加者の準備状態"><h4>準備状態</h4><ul>${participants.map(player => {
                const remainingSeconds = player.connected === false
                    ? remainingReservationSeconds(player.reservedUntil, options.now)
                    : 0;
                const reconnectLabel = player.connected === false
                    ? `再接続待ち${remainingSeconds > 0 ? `・残り${remainingSeconds}秒` : ''}`
                    : '';
                const roles = [
                    player.index === options.hostPlayerIndex ? 'ホスト' : '',
                    player.index === options.myPlayerIndex ? 'あなた' : '',
                    reconnectLabel,
                ].filter(Boolean);
                const participantLabel = `${player.name}${roles.length ? `（${roles.join('・')}）` : ''}`;
                const stateLabel = player.ready === false ? '準備中' : '準備完了';
                const countdown = player.connected === false && remainingSeconds > 0
                    ? ` data-reserved-until="${player.reservedUntil}" data-player-name="${escapeText(player.name)}"`
                    : '';
                return `<li><span${countdown}>${escapeText(participantLabel)}</span><strong>${stateLabel}</strong></li>`;
            }).join('')}</ul>${selfParticipant ? `<button type="button" class="room-ready-btn" data-ui-action="setOnlineLobbyReady" data-ready="${selfParticipant.ready === false ? 'true' : 'false'}" aria-pressed="${selfParticipant.ready === false ? 'false' : 'true'}">${selfParticipant.ready === false ? '準備完了にする' : '準備を取り消す'}</button>` : ''}<p class="room-ready-help">参加者が揃い、全員が準備完了になると開始します。</p></section>`
            : '';
        const hostControls = options.isHost === true
            ? participants.filter(player => Number.isInteger(player.index) && player.index !== options.hostPlayerIndex)
                .map(player => {
                    const participantLabel = `${player.name}${player.connected === false ? '（再接続待ち）' : ''}`;
                    const safeParticipantLabel = escapeText(participantLabel);
                    const safeRemoveLabel = escapeText(`${participantLabel}を待機室から外す`);
                    return `<li><span>${safeParticipantLabel}</span><button type="button" data-ui-action="removeOnlineLobbyPlayer" data-player-index="${player.index}" aria-label="${safeRemoveLabel}">外す</button></li>`;
                })
                .join('')
            : '';
        const management = options.isHost === true
            ? `<section class="room-host-controls" aria-label="ホストの待機室管理"><h4>ホスト操作</h4><div class="room-slot-controls"><button type="button" data-ui-action="changeOnlineLobbySlots" data-delta="-1" aria-label="参加枠を1つ減らす">−</button><span>参加枠 ${hasPlayerList ? players.length : 0}</span><button type="button" data-ui-action="changeOnlineLobbySlots" data-delta="1" aria-label="参加枠を1つ増やす">＋</button></div>${hostControls ? `<ul>${hostControls}</ul>` : ''}<button type="button" class="room-host-start-btn" data-ui-action="startOnlineLobbyNow">空席をCPU（普通）にして開始</button></section>`
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
            ${playerList}
            ${marketRule}
            ${startHelp}
            ${readiness}
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

    return Object.freeze({
        COPY_FALLBACK_MESSAGE,
        COPY_SUCCESS_MESSAGE,
        WAITING_SLOT_LABEL,
        buildWaitingHtml,
        buildWaitingStatus,
        copyRoomId,
        escapeText,
        normalizeRoomId,
        remainingReservationSeconds,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineRoomShare;
if (typeof window !== 'undefined') window.OnlineRoomShare = OnlineRoomShare;
if (typeof globalThis !== 'undefined') globalThis.OnlineRoomShare = OnlineRoomShare;
