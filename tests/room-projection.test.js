const assert = require('assert');
const makeRoomProjection = require('../server/roomProjection');
const { runTest } = require('./helpers/test-utils');

const projection = makeRoomProjection({
    cpuDifficultyLabel: difficulty => ({ strong: '強', rl: '学' }[difficulty] || '普'),
    hashReconnectToken: token => 'hash:' + token,
});

function makeRoom() {
    return {
        maxPlayers: 4,
        playerSettings: [
            { type: 'cpu', difficulty: 'rl' },
            { type: 'human' },
            { type: 'cpu', difficulty: 'strong' },
            { type: 'human' },
        ],
        players: [
            { id: 'socket-a', index: 1, name: 'Alice', reconnectToken: 'ta' },
            { id: 'socket-b', index: 3, name: 'Bob', reconnectToken: 'tb' },
            { id: 'socket-stale', index: 9, name: 'Ghost' },
        ],
    };
}

runTest('room projection はロビー表示と開始名を同じroom設定からpureに構築する', () => {
    const room = makeRoom();

    assert.deepStrictEqual(
        projection.buildPlayerList(room),
        ['CPU（学）', 'Alice', 'CPU（強）', 'Bob']
    );
    assert.strictEqual(projection.countRoomHumanSlots(room), 2);
    assert.deepStrictEqual(
        projection.buildGameStartPlayerNames(room),
        ['CPU1（学）', 'Alice', 'CPU2（強）', 'Bob']
    );
});

runTest('room projection はlegacy roomの名前とhuman slot数を維持する', () => {
    const room = {
        maxPlayers: 2,
        playerSettings: [],
        players: [{ name: 'Alice' }, { name: 'Bob' }],
    };

    assert.deepStrictEqual(projection.buildPlayerList(room), ['Alice', 'Bob']);
    assert.strictEqual(projection.countRoomHumanSlots(room), 2);
    assert.deepStrictEqual(projection.buildGameStartPlayerNames(room), ['Alice', 'Bob']);
});

runTest('room projection はshuffleの乱数順と入力非破壊を維持する', () => {
    const playerNames = ['A', 'B', 'C'];
    let calls = 0;
    const order = projection.shuffledPlayerOrder(playerNames, () => {
        calls++;
        return 0;
    });

    assert.deepStrictEqual(order, [1, 2, 0]);
    assert.strictEqual(calls, 2);
    assert.deepStrictEqual(playerNames, ['A', 'B', 'C']);
});

runTest('room projection はsocket metadataをplayer順のwire値へ投影する', () => {
    const room = makeRoom();
    const sockets = new Map([
        ['socket-a', { clientVersion: 'v-a', hostlessRestoreVersion: 1 }],
        ['socket-b', { hostlessRestoreVersion: 0 }],
    ]);
    const playerNames = ['CPU1（学）', 'Alice', 'CPU2（強）', 'Bob'];

    assert.deepStrictEqual(
        projection.roomClientVersions(sockets, room),
        ['v-a', 'unknown', 'unknown']
    );
    assert.deepStrictEqual(
        projection.roomReconnectTokenHashes(room, playerNames),
        ['', 'hash:ta', '', 'hash:tb']
    );
    assert.deepStrictEqual(
        projection.roomHostlessRestoreCapabilities(sockets, room, playerNames),
        [0, 1, 0, 0]
    );
});
