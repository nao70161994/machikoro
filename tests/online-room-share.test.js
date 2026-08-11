'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const OnlineRoomShare = require('../js/onlineRoomShare');
const { runTest } = require('./helpers/test-utils');

runTest('online room shareはroom IDと参加者をescapeして共有手順を常設する', () => {
    const createdHtml = OnlineRoomShare.buildWaitingHtml('ABC123');
    assert.ok(createdHtml.includes('ルームを作成しました！'));
    assert.ok(createdHtml.includes('プレイヤーを待っています...'));
    const html = OnlineRoomShare.buildWaitingHtml(' ab<12 ', ['Alice', '<Bob>']);
    assert.ok(html.includes('data-ui-action="copyOnlineRoomId"'));
    assert.ok(html.includes('data-room-id="AB&lt;12"'));
    assert.ok(html.includes('この6文字を参加者に共有してください'));
    assert.ok(html.includes('Alice、&lt;Bob&gt; (2人)'));
    assert.ok(!html.includes('<Bob>'));
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
