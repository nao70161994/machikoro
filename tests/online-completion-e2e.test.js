const assert = require('assert');
const { runTest } = require('./helpers/test-utils');

process.env.CANONICAL_STATE_STORE = 'noop';
const serverModule = require('../server');
const connectClient = require('socket.io-client');
const runtime = serverModule.loadGameRuntime();
const PLAYER_NAMES = ['Alice', 'Bob', 'Carol', 'Dave'];
const COMPLETION_LANDMARKS = [
    runtime.LANDMARK_NAMES.HARBOR,
    runtime.LANDMARK_NAMES.STATION,
    runtime.LANDMARK_NAMES.SHOPPING_MALL,
    runtime.LANDMARK_NAMES.AMUSEMENT_PARK,
    runtime.LANDMARK_NAMES.RADIO_TOWER,
    runtime.LANDMARK_NAMES.AIRPORT,
];

function onceEvent(socket, event, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off(event, onEvent);
            reject(new Error(event + ' timed out'));
        }, timeoutMs);
        function onEvent(payload) {
            clearTimeout(timer);
            resolve(payload);
        }
        socket.once(event, onEvent);
    });
}

function connect(origin) {
    return connectClient(origin, { transports: ['websocket'], forceNew: true, reconnection: false });
}

function applyAcceptedAction(game, action, data) {
    if (action === 'rollDice') game.rollDice(data.forceDice, data.tunaDice);
    else if (action === 'selectDice') game.selectDiceCount(data.useTwo, data.d1, data.d2, data.tunaDice);
    else if (action === 'skipReroll') game.skipReroll();
    else if (action === 'rerollDice') game.rerollDice(data.forceDice, data.tunaDice);
    else if (action === 'resolveHarbor') game.resolveHarbor(data.useBonus);
    else if (action === 'buildLandmark') game.buildLandmark(data.name);
    else if (action === 'nextTurn') game.nextTurn();
    else throw new Error('unexpected completion action: ' + action);
}

function restoreSnapshot(game, snapshot) {
    game.players.forEach((player, index) => {
        const state = snapshot.players[index];
        player.name = state.name;
        player.coins = state.coins;
        player.cards = state.cards.map(runtime.createCardByName).filter(Boolean);
        player.dormantCards = (state.dormantIndices || []).map(cardIndex => player.cards[cardIndex]).filter(Boolean);
        player.landmarks = Object.assign({}, player.landmarks, state.landmarks);
        player.itVentureCoins = state.itVentureCoins || 0;
        player.hasYakusho = state.hasYakusho !== false;
    });
    game.currentPlayerIndex = snapshot.currentPlayerIndex;
    game.phase = snapshot.phase;
    game.lastDiceResult = snapshot.lastDiceResult;
    game.lastDice1 = snapshot.lastDice1;
    game.lastDice2 = snapshot.lastDice2;
    game.builtThisTurn = snapshot.builtThisTurn;
    game.pendingTV = snapshot.pendingTV || 0;
    game.pendingBusiness = snapshot.pendingBusiness || 0;
    game.pendingCleaning = snapshot.pendingCleaning || 0;
    game.pendingMover = snapshot.pendingMover || 0;
    game.pendingRenovation = snapshot.pendingRenovation || 0;
    game.pendingActionQueue = (snapshot.pendingActions || []).map(pending => Object.assign({}, pending));
    game.pendingIT = snapshot.pendingIT || false;
    game.usedReroll = snapshot.usedReroll || false;
    game.pendingTunaDice = snapshot.pendingTunaDice || null;
    game.turnCount = snapshot.turnCount || 0;
    game.hadAmusementParkAtRoll = snapshot.hadAmusementParkAtRoll || false;
}

function gameStateHash(game, shopStock, undoState) {
    return JSON.stringify({
        players: game.players.map(player => ({
            name: player.name,
            coins: player.coins,
            cards: player.cards.map(card => card.name),
            dormantIndices: player.dormantCards.map(card => player.cards.indexOf(card)),
            landmarks: player.landmarks,
            itVentureCoins: player.itVentureCoins,
            hasYakusho: player.hasYakusho,
        })),
        currentPlayerIndex: game.currentPlayerIndex,
        phase: game.phase,
        lastDiceResult: game.lastDiceResult,
        lastDice1: game.lastDice1,
        lastDice2: game.lastDice2,
        builtThisTurn: game.builtThisTurn,
        pendingTV: game.pendingTV,
        pendingBusiness: game.pendingBusiness,
        pendingCleaning: game.pendingCleaning,
        pendingMover: game.pendingMover,
        pendingRenovation: game.pendingRenovation,
        pendingActions: runtime.GameManager.serializedPendingActionsFor(game),
        pendingIT: game.pendingIT,
        usedReroll: game.usedReroll,
        pendingTunaDice: game.pendingTunaDice,
        turnCount: game.turnCount,
        hadAmusementParkAtRoll: game.hadAmusementParkAtRoll,
        shopStock: shopStock || null,
        undoState: undoState || null,
    });
}

function nextCompletionAction(game) {
    if (game.phase === runtime.GAME_PHASES.ROLL) return { action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] } };
    if (game.phase === runtime.GAME_PHASES.SELECT_DICE) {
        return { action: 'selectDice', data: { useTwo: false, diceCount: 1, d1: 1, d2: 1, tunaDice: [1, 1] } };
    }
    if (game.phase === runtime.GAME_PHASES.REROLL_CONFIRM) return { action: 'skipReroll', data: {} };
    if (game.phase === runtime.GAME_PHASES.HARBOR_CHOICE) return { action: 'resolveHarbor', data: { useBonus: false } };
    if (game.phase === runtime.GAME_PHASES.BUILD) {
        const current = game.currentPlayer();
        const landmark = COMPLETION_LANDMARKS.find(name => !current.landmarks[name]);
        if (landmark && current.coins >= runtime.Player.landmarkCost(landmark)) {
            return { action: 'buildLandmark', data: { name: landmark } };
        }
        return { action: 'nextTurn', data: {} };
    }
    throw new Error('unexpected completion phase: ' + game.phase);
}

function trackSocket(socket, state) {
    socket.on('gameAction', entry => {
        state.sequences.push(entry.seq);
        state.deliveryCounts.set(entry.seq, (state.deliveryCounts.get(entry.seq) || 0) + 1);
    });
    socket.on('actionAccepted', entry => {
        state.sequences.push(entry.seq);
        state.accepted.push(entry);
    });
    socket.on('appError', error => state.appErrors.push(error));
}

async function rejoinClient(origin, clients, states, credentials, index) {
    clients[index].close();
    const socket = connect(origin);
    clients[index] = socket;
    trackSocket(socket, states[index]);
    await onceEvent(socket, 'connect');
    const promise = onceEvent(socket, 'rejoinData');
    socket.emit('rejoinRoom', {
        roomId: credentials.roomId,
        playerIndex: index,
        playerName: PLAYER_NAMES[index],
        reconnectToken: credentials.tokens[index],
        clientVersion: 'completion-e2e',
    });
    const data = await promise;
    return data;
}

runTest('online completion e2e: 4人humanが通常ランドマーク戦を圧縮・host再接続込みで完走する', async () => {
    const httpServer = serverModule.__io.httpServer;
    await new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(0, '127.0.0.1', resolve);
    });
    const origin = 'http://127.0.0.1:' + httpServer.address().port;
    const clients = Array.from({ length: 4 }, () => connect(origin));
    const states = Array.from({ length: 4 }, () => ({ sequences: [], accepted: [], deliveryCounts: new Map(), appErrors: [] }));
    clients.forEach((socket, index) => trackSocket(socket, states[index]));

    try {
        await Promise.all(clients.map(client => onceEvent(client, 'connect')));
        const gameStartPromises = clients.map(client => onceEvent(client, 'gameStart'));
        const createdPromise = onceEvent(clients[0], 'roomCreated');
        clients[0].emit('createRoom', {
            playerName: PLAYER_NAMES[0],
            playerCount: 4,
            playerSettings: Array.from({ length: 4 }, () => ({ type: 'human' })),
            cpuSpeed: 0,
            enabledLandmarks: COMPLETION_LANDMARKS,
            clientVersion: 'completion-e2e',
        });
        const created = await createdPromise;
        const tokens = [created.reconnectToken];
        for (let index = 1; index < clients.length; index++) {
            const joinedPromise = onceEvent(clients[index], 'roomJoined');
            clients[index].emit('joinRoom', {
                roomId: created.roomId,
                playerName: PLAYER_NAMES[index],
                clientVersion: 'completion-e2e',
            });
            tokens[index] = (await joinedPromise).reconnectToken;
        }
        const gameStarts = await Promise.all(gameStartPromises);
        const gameStart = gameStarts[0];
        for (const payload of gameStarts.slice(1)) assert.deepStrictEqual(payload.playerOrder, gameStart.playerOrder);

        const credentials = { roomId: created.roomId, tokens };
        const game = new runtime.GameManager(4);
        game.enabledLandmarks = new Set(COMPLETION_LANDMARKS);
        game.players.forEach((player, index) => {
            player.name = PLAYER_NAMES[gameStart.playerOrder[index]];
        });
        const expectedShopStock = {};
        for (const card of runtime.CARDS) {
            runtime.setShopStockCount(expectedShopStock, card, runtime.getInitialCardStock(card, 4));
        }
        let actionCount = 0;
        let compactedRejoinData = null;
        let deduplicatedSeq = null;
        let dedupeActorIndex = null;
        let hostDisconnectDone = false;
        let replayedWhileDisconnected = 0;

        while (!game.checkWinner() && actionCount < 1500) {
            const actorIndex = gameStart.playerOrder[game.currentPlayerIndex];
            const actor = clients[actorIndex];
            const command = nextCompletionAction(game);
            const clientActionId = 'completion-' + (actionCount + 1);
            const acceptedPromise = onceEvent(actor, 'actionAccepted');
            actor.emit('gameAction', { action: command.action, data: command.data, clientActionId });
            const accepted = await acceptedPromise;
            actionCount++;
            assert.strictEqual(accepted.seq, actionCount);
            assert.strictEqual(accepted.clientActionId, clientActionId, 'ACKが送信action IDと対応すること');
            applyAcceptedAction(game, accepted.action, accepted.data);

            if (actionCount === 10) {
                const duplicatePromise = onceEvent(actor, 'actionAccepted');
                actor.emit('gameAction', { action: command.action, data: command.data, clientActionId });
                const duplicate = await duplicatePromise;
                assert.strictEqual(duplicate.seq, accepted.seq);
                assert.strictEqual(duplicate.action, accepted.action);
                assert.strictEqual(duplicate.clientActionId, clientActionId);
                deduplicatedSeq = duplicate.seq;
                dedupeActorIndex = actorIndex;
            }

            if (!hostDisconnectDone && actionCount >= 20 && gameStart.playerOrder[game.currentPlayerIndex] !== 0) {
                hostDisconnectDone = true;
                const disconnectedAtSeq = actionCount;
                const hostChangedPromises = clients.slice(1).map(socket => onceEvent(socket, 'hostChanged'));
                clients[0].close();
                const hostChanges = await Promise.all(hostChangedPromises);
                assert.ok(hostChanges.every(change => change.hostPlayerIndex !== 0));

                while (gameStart.playerOrder[game.currentPlayerIndex] !== 0 && replayedWhileDisconnected < 20) {
                    const interimActorIndex = gameStart.playerOrder[game.currentPlayerIndex];
                    const interimCommand = nextCompletionAction(game);
                    const interimId = 'completion-' + (actionCount + 1);
                    const interimAcceptedPromise = onceEvent(clients[interimActorIndex], 'actionAccepted');
                    clients[interimActorIndex].emit('gameAction', {
                        action: interimCommand.action,
                        data: interimCommand.data,
                        clientActionId: interimId,
                    });
                    const interimAccepted = await interimAcceptedPromise;
                    actionCount++;
                    replayedWhileDisconnected++;
                    assert.strictEqual(interimAccepted.seq, actionCount);
                    assert.strictEqual(interimAccepted.clientActionId, interimId);
                    applyAcceptedAction(game, interimAccepted.action, interimAccepted.data);
                }
                assert.ok(replayedWhileDisconnected > 0, 'host切断中も他clientのactionが進むこと');
                const rejoinData = await rejoinClient(origin, clients, states, credentials, 0);
                const missedEntries = rejoinData.actionLog.filter(entry => entry.seq > disconnectedAtSeq);
                assert.strictEqual(missedEntries.length, replayedWhileDisconnected, '切断中actionがresidual logへ全件含まれること');
                assert.deepStrictEqual(missedEntries.map(entry => entry.seq), Array.from(
                    { length: replayedWhileDisconnected },
                    (_, index) => disconnectedAtSeq + index + 1
                ));
                states[0].sequences.push(...missedEntries.map(entry => entry.seq));
            }

            if (actionCount === 220) {
                compactedRejoinData = await rejoinClient(origin, clients, states, credentials, 0);
                assert.ok(compactedRejoinData.stateSnapshot, '200 action超でstate snapshotへ圧縮されること');
                assert.ok(compactedRejoinData.stateSnapshot.actionSeq >= 201);
                assert.ok(compactedRejoinData.actionLog.length <= 200);

                const restored = new runtime.GameManager(4);
                restored.enabledLandmarks = new Set(COMPLETION_LANDMARKS);
                restoreSnapshot(restored, compactedRejoinData.stateSnapshot);
                compactedRejoinData.actionLog.forEach((entry, index) => {
                    assert.strictEqual(entry.seq, compactedRejoinData.stateSnapshot.actionSeq + index + 1);
                    applyAcceptedAction(restored, entry.action, entry.data);
                });
                assert.strictEqual(
                    gameStateHash(restored, compactedRejoinData.stateSnapshot.shopStock, compactedRejoinData.stateSnapshot.undoState),
                    gameStateHash(game, expectedShopStock, null),
                    'snapshot + residualがshopStock/undoStateを含むoracle状態を復元すること'
                );
            }
        }

        assert.ok(game.checkWinner(), '通常の全ランドマーク条件で勝者へ到達すること');
        assert.ok(actionCount > 200, 'action log圧縮境界を越えること');
        assert.ok(compactedRejoinData, '圧縮後の再接続を実行すること');
        assert.ok(deduplicatedSeq, '受理済みactionの再送を同じsequenceへdedupeすること');
        assert.ok(actionCount < 1500, '完走フローが停止しないこと');

        const expectedSequences = Array.from({ length: actionCount }, (_, index) => index + 1);
        states.forEach((state, stateIndex) => {
            const dedupeOccurrences = state.sequences.reduce((count, seq) => count + (seq === deduplicatedSeq ? 1 : 0), 0);
            assert.strictEqual(dedupeOccurrences, stateIndex === dedupeActorIndex ? 2 : 1,
                '意図した送信者だけがdedupe ACKを追加受信すること');
            const logicalSequences = state.sequences.slice();
            if (stateIndex === dedupeActorIndex) {
                const secondIndex = logicalSequences.lastIndexOf(deduplicatedSeq);
                logicalSequences.splice(secondIndex, 1);
                assert.strictEqual(state.accepted.filter(entry => entry.clientActionId === 'completion-' + deduplicatedSeq).length, 2);
            }
            assert.deepStrictEqual(logicalSequences, expectedSequences, 'live delivery + reconnect replayが順序どおりexactly onceになること');
            assert.deepStrictEqual(state.appErrors, []);
            assert.ok((state.deliveryCounts.get(deduplicatedSeq) || 0) <= 1, 'duplicate actionを再broadcastしないこと');
        });
    } finally {
        clients.forEach(client => client.close());
        await new Promise(resolve => serverModule.__io.close(resolve));
    }
});
