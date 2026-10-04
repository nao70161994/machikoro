'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const OnlineRoomShare = require('../js/onlineRoomShare');
const { runTest } = require('./helpers/test-utils');

runTest('online room shareはroom IDと参加者をescapeして共有手順を常設する', () => {
    assert.strictEqual(
        OnlineRoomShare.buildWaitingStatus(' abc123 '),
        'ルーム ABC123 を作成しました。参加者を待っています。'
    );
    assert.strictEqual(
        OnlineRoomShare.buildWaitingStatus('abc123', ['Alice', '待機中...', 'CPU（普通）']),
        'ルーム ABC123。3枠中2人が参加しています。'
    );
    const createdHtml = OnlineRoomShare.buildWaitingHtml('ABC123');
    assert.ok(createdHtml.includes('ルームを作成しました！'));
    assert.ok(createdHtml.includes('プレイヤーを待っています...'));
    const html = OnlineRoomShare.buildWaitingHtml(' ab<12 ', ['Alice', '<Bob>', '待機中...']);
    assert.ok(html.includes('data-ui-action="copyOnlineRoomId"'));
    assert.ok(html.includes('data-ui-action="toggleOnlineRoomQr"'));
    assert.ok(html.includes('data-room-qr-container'));
    assert.ok(html.includes('data-room-id="AB&lt;12"'));
    assert.ok(html.includes('この6文字を参加者に共有してください'));
    assert.ok(html.includes('参加席 <span>3席</span>'));
    assert.ok(html.includes('&lt;Bob&gt;</span>'));
    assert.ok(html.includes('data-seat-state="empty"'));
    assert.ok(html.includes('参加枠が揃い、全員が準備完了になると自動開始します'));
    assert.ok(html.includes('data-ui-action="leaveOnlineLobby"'));
    assert.ok(html.includes('待機室から退出'));
    assert.ok(!html.includes('<Bob>'));
    const readyHtml = OnlineRoomShare.buildWaitingHtml('ABC123', ['Alice', 'Bob']);
    assert.ok(readyHtml.includes('参加席 <span>2席</span>'));
    assert.ok(readyHtml.includes('自動開始します'));
    const optionHtml = OnlineRoomShare.buildWaitingHtml('ABC123', ['Alice', 'Bob'], {
        marketRule: 'ten-type',
    });
    assert.ok(optionHtml.includes('公式10種類市場'));
    assert.ok(optionHtml.includes('常に異なる10種類になるまで山札から補充します'));
    assert.ok(createdHtml.includes('通常市場'));
});

runTest('online room shareはID選択とQR表示のDOM操作を依存注入でまとめる', () => {
    const selectionCalls = [];
    const target = { focus(options) { selectionCalls.push(['focus', options]); } };
    const selection = {
        removeAllRanges() { selectionCalls.push(['clear']); },
        addRange(range) { selectionCalls.push(['add', range]); },
    };
    const range = { selectNodeContents(node) { selectionCalls.push(['select', node]); } };
    assert.strictEqual(OnlineRoomShare.selectRoomIdText({
        document: {
            querySelector: selector => selector === '.room-id-display[data-room-id-value]' ? target : null,
            createRange: () => range,
        },
        window: { getSelection: () => selection },
    }), true);
    assert.deepStrictEqual(selectionCalls, [
        ['select', target], ['clear'], ['add', range], ['focus', { preventScroll: true }],
    ]);

    let visible = false;
    let qrBuilds = 0;
    const attributes = {};
    const container = {
        innerHTML: '',
        classList: {
            contains: name => name === 'is-visible' && visible,
            toggle(name, value) { if (name === 'is-visible') visible = value; },
        },
    };
    const button = {
        parentElement: { querySelector: selector => selector === '[data-room-qr-container]' ? container : null },
        setAttribute(name, value) { attributes[name] = value; },
    };
    const effects = {
        document: { querySelector: selector => selector === '.room-qr-toggle[data-room-id="ABC123"]' ? button : null },
        window: { location: { origin: 'https://example.test' } },
        buildJoinUrl(roomId, location) {
            assert.strictEqual(roomId, 'ABC123');
            assert.strictEqual(location.origin, 'https://example.test');
            return 'https://example.test/?room=ABC123';
        },
        buildSvg(value) { qrBuilds++; return `<svg>${value}</svg>`; },
    };
    assert.strictEqual(OnlineRoomShare.toggleRoomQr(' abc123 ', effects), true);
    assert.strictEqual(visible, true);
    assert.strictEqual(attributes['aria-expanded'], 'true');
    assert.strictEqual(button.textContent, 'QRを隠す');
    assert.strictEqual(qrBuilds, 1);
    assert.ok(container.innerHTML.includes('room=ABC123'));
    assert.strictEqual(OnlineRoomShare.toggleRoomQr('ABC123', effects), true);
    assert.strictEqual(visible, false);
    assert.strictEqual(attributes['aria-expanded'], 'false');
    assert.strictEqual(button.textContent, 'QRを表示');
    assert.strictEqual(qrBuilds, 1);
});

runTest('online room shareはhostだけに自分以外の参加者管理を表示する', () => {
    const html = OnlineRoomShare.buildWaitingHtml('ABC123', ['Alice', 'Bob'], {
        isHost: true,
        hostPlayerIndex: 0,
        participants: [
            { index: 0, name: 'Alice', connected: true },
            { index: 1, name: '<Bob>', connected: false },
        ],
    });
    assert.ok(html.includes('ホストの待機室管理'));
    assert.ok(html.includes('data-ui-action="changeOnlineLobbySlots"'));
    assert.ok(html.includes('data-ui-action="startOnlineLobbyNow"'));
    assert.ok(html.includes('data-ui-action="removeOnlineLobbyPlayer" data-player-index="1"'));
    assert.ok(html.includes('&lt;Bob&gt;（再接続待ち）'));
    assert.ok(html.includes('aria-label="&lt;Bob&gt;（再接続待ち）を待機室から外す"'));
    assert.ok(!html.includes('aria-label="<Bob>'));
    assert.ok(!html.includes('data-player-index="0"'));
    const connectedHtml = OnlineRoomShare.buildWaitingHtml('ABC123', ['Alice', 'Carol'], {
        isHost: true,
        hostPlayerIndex: 0,
        participants: [
            { index: 0, name: 'Alice', connected: true },
            { index: 2, name: 'Carol & Co.', connected: true },
        ],
    });
    assert.ok(connectedHtml.includes('aria-label="Carol &amp; Co.を待機室から外す"'));
    assert.ok(!connectedHtml.includes('aria-label="Carol &amp; Co.（再接続待ち）'));
    assert.ok(!OnlineRoomShare.buildWaitingHtml('ABC123', ['Alice', 'Bob'], {
        isHost: false,
        hostPlayerIndex: 0,
        participants: [{ index: 1, name: 'Bob', connected: true }],
    }).includes('removeOnlineLobbyPlayer'));
});

runTest('online room shareは全参加者へ対戦設定と選択内容を安全に表示する', () => {
    const html = OnlineRoomShare.buildWaitingHtml('ABC123', ['Alice', 'CPU（強）', 'Bob'], {
        setupSummary: {
            playerSlots: ['人間', 'CPU（強）', '人間'],
            cpuSpeed: 800,
            enabledCards: ['麦畑', '<危険な施設>'],
            enabledLandmarks: ['駅', '港 & 空港'],
            marketRule: 'ten-type',
        },
    });
    assert.ok(html.includes('id="roomSetupSummaryTitle"'));
    assert.ok(html.includes('3人（人間2・CPU1）'));
    assert.ok(html.includes('1. 人間 / 2. CPU（強） / 3. 人間'));
    assert.ok(html.includes('<dt>CPU速度</dt><dd>0.8秒</dd>'));
    assert.ok(html.includes('<dt>市場</dt><dd>公式10種類市場</dd>'));
    assert.ok(html.includes('<dt>施設</dt><dd>2種類</dd>'));
    assert.ok(html.includes('&lt;危険な施設&gt;'));
    assert.ok(html.includes('港 &amp; 空港'));
    assert.ok(!html.includes('<危険な施設>'));
});

runTest('online room shareは予約席の再接続残り時間を表示する', () => {
    assert.strictEqual(OnlineRoomShare.remainingReservationSeconds(61001, 1000), 61);
    assert.strictEqual(OnlineRoomShare.remainingReservationSeconds(999, 1000), 0);
    const html = OnlineRoomShare.buildWaitingHtml('abc123', [], {
        now: 1000,
        participants: [{ index: 0, name: 'Alice', connected: false, ready: true, reservedUntil: 61000 }],
        myPlayerIndex: 0,
        hostPlayerIndex: 0,
    });
    assert.match(html, /Alice（再接続待ち・残り60秒）/);
    assert.match(html, /data-reserved-until="61000"/);
    assert.match(html, /data-player-name="Alice"/);
});

runTest('online room shareは本人の準備状態と参加者全員の状態を明示する', () => {
    const waiting = OnlineRoomShare.buildWaitingHtml('ABC123', ['Alice', 'Bob'], {
        myPlayerIndex: 1,
        hostPlayerIndex: 0,
        participants: [
            { index: 0, name: 'Alice', connected: true, ready: true },
            { index: 1, name: '<Bob>', connected: true, ready: false },
        ],
    });
    assert.ok(waiting.includes('aria-label="参加者の準備状態"'));
    assert.ok(waiting.includes('data-seat-state="ready"'));
    assert.ok(waiting.includes('<span>ホスト</span>'));
    assert.ok(waiting.includes('&lt;Bob&gt;</span>'));
    assert.ok(waiting.includes('<span>あなた</span>'));
    assert.ok(waiting.includes('data-seat-state="preparing"'));
    assert.ok(waiting.includes('data-ui-action="setOnlineLobbyReady" data-ready="true" aria-pressed="false"'));
    assert.ok(waiting.includes('準備完了にする'));

    const ready = OnlineRoomShare.buildWaitingHtml('ABC123', ['Alice', 'Bob'], {
        myPlayerIndex: 1,
        participants: [{ index: 1, name: 'Bob', connected: true, ready: true }],
    });
    assert.ok(ready.includes('data-ready="false" aria-pressed="true"'));
    assert.ok(ready.includes('準備を取り消す'));
});

runTest('online room shareはClipboard成功時に正規化IDを通知する', async () => {
    const calls = [];
    const result = await OnlineRoomShare.copyRoomId(' abc123 ', {
        writeText: value => { calls.push(['write', value]); return Promise.resolve(); },
        selectText: () => calls.push(['select']),
        notify: message => calls.push(['notify', message]),
    });
    assert.deepStrictEqual(result, { copied: true, roomId: 'ABC123' });
    assert.deepStrictEqual(calls, [
        ['write', 'ABC123'],
        ['notify', OnlineRoomShare.COPY_SUCCESS_MESSAGE],
    ]);
});

runTest('online room shareはClipboard拒否・非対応時にID選択と手動共有を案内する', async () => {
    for (const writeText of [undefined, () => Promise.reject(new Error('denied'))]) {
        const calls = [];
        const result = await OnlineRoomShare.copyRoomId('ABC123', {
            writeText,
            selectText: () => calls.push('select'),
            notify: message => calls.push(message),
        });
        assert.deepStrictEqual(result, { copied: false, roomId: 'ABC123' });
        assert.deepStrictEqual(calls, ['select', OnlineRoomShare.COPY_FALLBACK_MESSAGE]);
    }
});

runTest('online room shareは389px以下でIDとcopy操作を縦に並べる', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
    const roomShareStart = css.indexOf('.room-share-panel');
    const narrowStart = css.indexOf('@media (max-width: 389px)', roomShareStart);
    const waitingPlayersStart = css.indexOf('.waiting-players', narrowStart);
    const narrowRule = css.slice(narrowStart, waitingPlayersStart);
    assert.ok(roomShareStart >= 0 && narrowStart > roomShareStart);
    assert.ok(narrowRule.includes('.room-share-row'));
    assert.ok(narrowRule.includes('flex-direction: column;'));
    assert.ok(narrowRule.includes('.room-id-copy-btn'));
    assert.ok(narrowRule.includes('min-height: 44px;'));
});

runTest('online waiting uses one seat roster and preserves interleaved CPU/reserved seat actions', () => {
    const html = OnlineRoomShare.buildWaitingHtml('ABC123', ['Alice', 'CPU（強）', 'Bob（再接続待ち）', '待機中...'], {
        isHost: true, hostPlayerIndex: 0, myPlayerIndex: 0, now: 1000,
        participants: [{ index: 0, name: 'Alice', ready: false },
            { index: 2, name: 'Bob', connected: false, reservedUntil: 61000, ready: true }],
    });
    assert.strictEqual((html.match(/class="room-seat"/g) || []).length, 4);
    assert.strictEqual((html.match(/Bob（再接続待ち/g) || []).length, 2); // Seat and remove accessible name.
    assert.ok(html.includes('data-seat-state="cpu"'));
    assert.ok(html.includes('data-seat-state="reconnecting"'));
    assert.ok(html.includes('data-seat-state="empty"'));
    assert.ok(html.includes('data-player-index="2"'));
    assert.ok(!html.includes('data-player-index="1"'));
    assert.ok(!html.includes('🏪'));
    assert.ok(html.includes('aria-hidden="true"'));
});
