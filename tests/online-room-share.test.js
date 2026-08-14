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
    assert.ok(html.includes('data-room-id="AB&lt;12"'));
    assert.ok(html.includes('この6文字を参加者に共有してください'));
    assert.ok(html.includes('参加枠（3枠）: Alice、&lt;Bob&gt;、待機中...'));
    assert.ok(html.includes('参加枠が揃い、全員が準備完了になると自動開始します'));
    assert.ok(html.includes('data-ui-action="leaveOnlineLobby"'));
    assert.ok(html.includes('待機室から退出'));
    assert.ok(!html.includes('<Bob>'));
    const readyHtml = OnlineRoomShare.buildWaitingHtml('ABC123', ['Alice', 'Bob']);
    assert.ok(readyHtml.includes('参加枠（2枠）: Alice、Bob'));
    assert.ok(!readyHtml.includes('自動開始します'));
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

runTest('online room shareは予約席の再接続残り時間を表示する', () => {
    assert.strictEqual(OnlineRoomShare.remainingReservationSeconds(61001, 1000), 61);
    assert.strictEqual(OnlineRoomShare.remainingReservationSeconds(999, 1000), 0);
    const html = OnlineRoomShare.buildWaitingHtml('abc123', [], {
        now: 1000,
        participants: [{ index: 0, name: 'Alice', connected: false, ready: true, reservedUntil: 61000 }],
        myPlayerIndex: 0,
        hostPlayerIndex: 0,
    });
    assert.match(html, /Alice（ホスト・あなた・再接続待ち・残り60秒）/);
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
    assert.ok(waiting.includes('Alice（ホスト）</span><strong>準備完了'));
    assert.ok(waiting.includes('&lt;Bob&gt;（あなた）</span><strong>準備中'));
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
