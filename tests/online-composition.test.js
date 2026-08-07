'use strict';

const assert = require('assert');
const OnlineClientEffects = require('../js/onlineClientEffects');
const OnlineComposition = require('../js/onlineComposition');
const OnlineDomEffects = require('../js/onlineDomEffects');
const OnlineSocketEffects = require('../js/onlineSocketEffects');
const { runTest } = require('./helpers/test-utils');

function createHarness() {
    const emitted = [];
    const effects = [];
    const status = { textContent: '', style: {} };
    let socket = { emit: (event, payload) => emitted.push({ event, payload }) };
    const sessionState = {
        snapshot: () => Object.freeze({ socket, isOnlineGame: true }),
        setSocket(value) {
            socket = value;
            return this.snapshot();
        },
    };
    const storage = Object.freeze({ marker: 'storage-facade' });
    const composition = OnlineComposition.create({
        clientEffectsModule: OnlineClientEffects,
        clientStorageModule: { createFacade: () => storage },
        domEffectsModule: OnlineDomEffects,
        gameState: { snapshot: () => Object.freeze({ game: 'game-a' }) },
        getDocument: () => ({ getElementById: id => id === 'onlineStatus' ? status : null }),
        hostlessEvents: { REQUEST: 'requestHostlessRestore' },
        resolveClientEffect: name => (...args) => effects.push({ name, args }),
        sessionState,
        socketEffectsModule: OnlineSocketEffects,
    });
    return { composition, effects, emitted, sessionState, status, storage };
}

runTest('online compositionはstate・storage・client・DOM・socket境界を一度に構成する', () => {
    const harness = createHarness();

    assert.deepStrictEqual(harness.composition.snapshotGame(), { game: 'game-a' });
    assert.strictEqual(harness.composition.snapshotSession().isOnlineGame, true);
    assert.strictEqual(harness.composition.sessionState, harness.sessionState);
    assert.strictEqual(harness.composition.storage, harness.storage);

    harness.composition.clientEffects.render('render-reason');
    harness.composition.domEffects.setStatusText('接続中');
    harness.composition.socketEffects.rejoinRoom({ roomId: 'ROOM01' });

    assert.deepStrictEqual(harness.effects, [
        { name: 'render', args: ['render-reason'] },
    ]);
    assert.strictEqual(harness.status.textContent, '接続中');
    assert.deepStrictEqual(harness.emitted, [
        { event: 'rejoinRoom', payload: { roomId: 'ROOM01' } },
    ]);
});

runTest('online compositionのsocket境界はnamed state transition後のsocketを遅延参照する', () => {
    const harness = createHarness();
    const replacementEmits = [];
    harness.composition.sessionState.setSocket({
        emit: (event, payload) => replacementEmits.push({ event, payload }),
    });

    harness.composition.socketEffects.createRoom({ playerName: 'Alice' });

    assert.deepStrictEqual(harness.emitted, []);
    assert.deepStrictEqual(replacementEmits, [
        { event: 'createRoom', payload: { playerName: 'Alice' } },
    ]);
});

runTest('online compositionは不足した依存を初期化時に拒否する', () => {
    assert.throws(
        () => OnlineComposition.create({}),
        /online composition dependency is required/
    );
});
