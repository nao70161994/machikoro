'use strict';

const assert = require('assert');
const { loadIntegrationRuntime } = require('./helpers/integration-runtime');
const { runTest } = require('./helpers/test-utils');

runTest('coin change通知はlocal人間を集約しonline相手・CPU・replayを抑止する', () => {
    const rt = loadIntegrationRuntime();
    const announcements = [];
    let announcementText = '';
    Object.defineProperty(rt.__test.elements.coinChangeAnnouncer, 'textContent', {
        configurable: true,
        get() { return announcementText; },
        set(value) {
            announcementText = value;
            if (value) announcements.push(value);
        },
    });

    const game = rt.__test.startLocalGame([
        { type: 'human', name: 'Alice', difficulty: 'normal' },
        { type: 'human', name: 'Bob', difficulty: 'normal' },
    ]);
    game.players[0].name = 'Alice';
    game.players[1].name = 'Bob';
    rt.__test.setCpuPlayers([null, null]);
    assert.deepStrictEqual(announcements, []);

    game.players[0].coins += 3;
    game.players[1].coins -= 2;
    rt.render();
    assert.deepStrictEqual(announcements, [
        'Alice +3コイン、Bob -2コイン',
    ]);

    rt.render();
    rt.__test.setCpuPlayers([null, { difficulty: 'normal' }]);
    game.players[1].coins += 1;
    rt.render();
    assert.strictEqual(announcements.length, 1);

    rt.__test.setOnlineState({ isOnlineGame: true, myPlayerIndex: 0 });
    game.players[1].coins += 1;
    rt.render();
    assert.strictEqual(announcements.length, 1);

    game.players[0].coins += 2;
    game.players[1].coins -= 1;
    rt.render();
    assert.deepStrictEqual(announcements, [
        'Alice +3コイン、Bob -2コイン',
        'Alice +2コイン',
    ]);

    rt.OnlineRuntimeState.runtime.setReplaying(true);
    game.players[0].coins += 4;
    rt.render();
    assert.strictEqual(announcements.length, 2);
});

if (process.exitCode) {
    throw new Error('coin change announcement integrationテストで失敗が発生しました');
}
