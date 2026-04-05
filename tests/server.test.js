const assert = require('assert');
const {
    APP_ERROR_EVENT,
    emitAppError,
    resolveBuildHash,
    loadGameRuntime,
    sanitizeName,
    resolveRejoinPlayer,
    getRemainingConnectedPlayers,
    serializeMirrorState,
    restoreMirrorState,
    compactRoomActionLog,
    createRoomMirror,
    validateGameAction,
    validateBusinessPayload,
    validateCleaningPayload,
    validateMoverPayload,
    validateRenovationPayload,
    makeUndoStateFromMirror,
} = require('../server');

function runTest(name, fn) {
    try {
        fn();
        console.log(`テスト成功: ${name}`);
    } catch (error) {
        console.error(`テスト失敗: ${name}`);
        console.error(error.stack);
        process.exitCode = 1;
    }
}

function makeRoom() {
    return {
        hostPlayerIndex: 0,
        started: true,
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        gameStartPayload: {
            playerNames: ['A', 'B'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            enabledCards: ['麦畑', 'パン屋', 'カフェ', 'ビジネスセンター', '引越し屋'],
            enabledLandmarks: ['駅', 'ショッピングモール'],
        },
        actionLog: [],
        lastUndoState: null,
    };
}

function makeGame() {
    const runtime = loadGameRuntime();
    return {
        GameManager: runtime.GameManager,
        createCardByName: runtime.createCardByName,
    };
}

runTest('server validateBusinessPayload はカードindex指定を許可する', () => {
    const { GameManager, createCardByName } = makeGame();
    const game = new GameManager(2);
    game.currentPlayer().cards = [
        createCardByName('麦畑'),
        createCardByName('パン屋'),
        createCardByName('ビジネスセンター'),
    ];
    game.players[1].cards = [
        createCardByName('麦畑'),
        createCardByName('カフェ'),
    ];
    game.phase = 'pending';
    game.pendingBusiness = 1;
    const result = validateBusinessPayload(game, {
        myCard: 1,
        targetIndex: 1,
        theirCard: 1,
    });
    assert.strictEqual(result, true);
});

runTest('server validateMoverPayload はカードindex指定を許可する', () => {
    const { GameManager, createCardByName } = makeGame();
    const game = new GameManager(2);
    game.currentPlayer().cards = [
        createCardByName('麦畑'),
        createCardByName('パン屋'),
        createCardByName('引越し屋'),
    ];
    game.phase = 'pending';
    game.pendingMover = 1;
    const result = validateMoverPayload(game, {
        cardIndex: 2,
        targetIndex: 1,
    });
    assert.strictEqual(result, true);
});

runTest('online validateGameAction は lastUndoState があると undoBuild を許可する', () => {
    const room = makeRoom();
    room.actionLog = [{ action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] } }];
    const baseMirror = validateGameAction(room, { playerIndex: 0 }, 'buildCard', { cardName: 'カフェ' });
    room.lastUndoState = makeUndoStateFromMirror(baseMirror.mirror.game, baseMirror.mirror.shopStock);
    room.actionLog = [
        { action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] } },
        { action: 'buildCard', data: { cardName: 'カフェ' } },
    ];
    const result = validateGameAction(room, { playerIndex: 0 }, 'undoBuild', {});
    assert.strictEqual(result.ok, true);
});

runTest('online validateGameAction は無効化されたランドマーク建設を拒否する', () => {
    const room = makeRoom();
    room.actionLog = [{ action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] } }];
    const result = validateGameAction(room, { playerIndex: 0 }, 'buildLandmark', { name: '港' });
    assert.strictEqual(result.ok, false);
});

// ===== sanitizeName =====

runTest('sanitizeName がHTMLタグ・特殊文字を除去し20文字に制限する', () => {
    assert.strictEqual(sanitizeName('<b>name</b>'), 'bname/b');
    assert.strictEqual(sanitizeName('a'.repeat(25)), 'a'.repeat(20));
    assert.strictEqual(sanitizeName('  Alice  '), 'Alice');
    assert.strictEqual(sanitizeName(null), '');
    assert.strictEqual(sanitizeName('<>&"\'`'), '');
});

runTest('emitAppError は appError イベントでメッセージを送る', () => {
    const emitted = [];
    emitAppError({ emit(name, payload) { emitted.push({ name, payload }); } }, 'bad');
    assert.deepStrictEqual(emitted, [{ name: APP_ERROR_EVENT, payload: 'bad' }]);
});

runTest('resolveBuildHash は環境変数 BUILD_HASH を優先する', () => {
    const before = process.env.BUILD_HASH;
    process.env.BUILD_HASH = 'from-env';
    assert.strictEqual(resolveBuildHash(), 'from-env');
    if (before === undefined) delete process.env.BUILD_HASH;
    else process.env.BUILD_HASH = before;
});

// ===== validateGameAction =====

runTest('validateGameAction は非現在プレイヤーのアクションを拒否する', () => {
    const room = makeRoom();
    room.actionLog = []; // プレイヤー0のターン
    // プレイヤー1がrollDiceを試みる
    const result = validateGameAction(room, { playerIndex: 1 }, 'rollDice', { forceDice: 3, tunaDice: [1, 1] });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は enabledCards に含まれないカードの建設を拒否する', () => {
    const room = makeRoom();
    // enabledCards: ['麦畑','パン屋','カフェ','ビジネスセンター','引越し屋']
    // 鉱山はリストにない
    room.actionLog = [{ action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] } }];
    const result = validateGameAction(room, { playerIndex: 0 }, 'buildCard', { cardName: '鉱山' });
    assert.strictEqual(result.ok, false);
});

// ===== validateCleaningPayload =====

runTest('validateCleaningPayload は休業済みカードを対象にできない', () => {
    const { GameManager, createCardByName } = makeGame();
    const game = new GameManager(2);
    const cafe = createCardByName('カフェ');
    game.currentPlayer().cards = [cafe];
    game.currentPlayer().dormantCards = [];
    game.players[1].cards = [];
    game.players[1].dormantCards = [];
    game.phase = 'pending';
    game.pendingCleaning = 1;
    // アクティブなカフェは対象にできる
    assert.strictEqual(validateCleaningPayload(game, { cardName: 'カフェ' }), true);
    // 休業中は対象にできない
    game.currentPlayer().makeDormant(cafe);
    assert.strictEqual(validateCleaningPayload(game, { cardName: 'カフェ' }), false);
    // 存在しないカード名は拒否
    assert.strictEqual(validateCleaningPayload(game, { cardName: '存在しないカード' }), false);
});

// ===== validateRenovationPayload =====

runTest('validateRenovationPayload は建設済みランドマークのみ受け付ける', () => {
    const { GameManager } = makeGame();
    const game = new GameManager(2);
    game.phase = 'pending';
    game.pendingRenovation = 1;
    // 未建設は拒否
    assert.strictEqual(validateRenovationPayload(game, { landmarkName: '駅' }), false);
    // 建設済みは許可
    game.currentPlayer().landmarks['駅'] = true;
    assert.strictEqual(validateRenovationPayload(game, { landmarkName: '駅' }), true);
    // 無効なランドマーク名は拒否
    assert.strictEqual(validateRenovationPayload(game, { landmarkName: '存在しないランドマーク' }), false);
});

// ===== フェーズガード =====

runTest('validateGameAction は ROLL フェーズ以外で rollDice を拒否する', () => {
    const room = makeRoom();
    // rollDice後はBUILDフェーズになっている
    room.actionLog = [{ action: 'rollDice', data: { forceDice: 3, tunaDice: [1, 1] } }];
    const result = validateGameAction(room, { playerIndex: 0 }, 'rollDice', { forceDice: 2, tunaDice: [1, 1] });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は SELECT_DICE フェーズ以外で selectDice を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'selectDice', { useTwo: true, d1: 3, d2: 4, tunaDice: [1, 1] });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は REROLL_CONFIRM フェーズ以外で rerollDice を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'rerollDice', { forceDice: 5, tunaDice: [1, 1] });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は REROLL_CONFIRM フェーズ以外で skipReroll を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'skipReroll', {});
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は HARBOR_CHOICE フェーズ以外で resolveHarbor を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'resolveHarbor', { useBonus: true });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は PENDING フェーズ以外で resolveTV を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'resolveTV', { targetIndex: 1 });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は PENDING フェーズ以外で resolveBusiness を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'resolveBusiness', { myCard: 0, targetIndex: 1, theirCard: 0 });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は PENDING フェーズ以外で resolveCleaning を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'resolveCleaning', { cardName: '麦畑' });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は PENDING フェーズ以外で resolveMover を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'resolveMover', { cardName: '麦畑', targetIndex: 1 });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は PENDING フェーズ以外で resolveRenovation を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'resolveRenovation', { landmarkName: '駅' });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は PENDING フェーズ以外で resolveIT を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ（pendingIT もない）
    const result = validateGameAction(room, { playerIndex: 0 }, 'resolveIT', { doSave: true });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は BUILD フェーズ以外で buildCard を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'buildCard', { cardName: '麦畑' });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は BUILD フェーズ以外で buildLandmark を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'buildLandmark', { name: '駅' });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は BUILD フェーズ以外で nextTurn を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'nextTurn', {});
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は BUILD フェーズ以外で undoBuild を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'undoBuild', {});
    assert.strictEqual(result.ok, false);
});

runTest('validateBusinessPayload は範囲外のカードindexを拒否する', () => {
    const { GameManager, createCardByName } = makeGame();
    const game = new GameManager(2);
    game.currentPlayer().cards = [
        createCardByName('麦畑'),
        createCardByName('ビジネスセンター'),
    ];
    game.players[1].cards = [createCardByName('カフェ')];
    game.currentPlayer().dormantCards = [];
    game.players[1].dormantCards = [];
    game.phase = 'pending';
    game.pendingBusiness = 1;
    // 存在しないindex(99)は拒否
    assert.strictEqual(validateBusinessPayload(game, { myCard: 99, targetIndex: 1, theirCard: 0 }), false);
    // 相手indexが自分と同じは拒否
    assert.strictEqual(validateBusinessPayload(game, { myCard: 0, targetIndex: 0, theirCard: 0 }), false);
});

runTest('validateGameAction は gameStartPayload がない場合に拒否する', () => {
    const room = makeRoom();
    room.gameStartPayload = null;
    const result = validateGameAction(room, { playerIndex: 0 }, 'rollDice', { forceDice: 1, tunaDice: [1, 1] });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction はCPUターン中にホストのアクションを許可し非ホストを拒否する', () => {
    const room = makeRoom();
    // p0のターン（CPUに設定）
    room.playerSettings = [{ type: 'cpu', difficulty: 'normal' }, { type: 'human' }];
    room.gameStartPayload.playerSettings = room.playerSettings;
    room.hostPlayerIndex = 1; // p1がホスト

    // ホスト(p1)はp0のCPUターンを代理できる
    const allow = validateGameAction(room, { playerIndex: 1 }, 'rollDice', { forceDice: 3, tunaDice: [1, 1] });
    assert.strictEqual(allow.ok, true);

    // 非ホスト(p0自身)はCPUターンを操作できない
    const deny = validateGameAction(room, { playerIndex: 0 }, 'rollDice', { forceDice: 3, tunaDice: [1, 1] });
    assert.strictEqual(deny.ok, false);
});

runTest('resolveRejoinPlayer は復元済みルームで既存プレイヤーを再利用し重複追加しない', () => {
    const room = {
        restored: true,
        players: [{ id: null, index: 0, name: 'Alice', reconnectToken: '' }],
        gameStartPayload: { playerNames: ['Alice', 'Bob'] },
    };

    const player = resolveRejoinPlayer(room, 0, 'Alice', 'ignored-token', 'socket-1');
    assert.ok(player);
    assert.strictEqual(room.players.length, 1);
    assert.strictEqual(room.players[0].id, 'socket-1');
});

runTest('resolveRejoinPlayer は復元済みルームで未登録プレイヤーだけを追加する', () => {
    const room = {
        restored: true,
        players: [{ id: null, index: 0, name: 'Alice', reconnectToken: '' }],
        gameStartPayload: { playerNames: ['Alice', 'Bob'] },
    };

    const player = resolveRejoinPlayer(room, 1, 'Bob', 'ignored-token', 'socket-2');
    assert.ok(player);
    assert.strictEqual(room.players.length, 2);
    assert.strictEqual(room.players[1].name, 'Bob');
});

runTest('getRemainingConnectedPlayers は切断済み・幽霊プレイヤーをホスト候補から除外する', () => {
    const room = {
        players: [
            { id: null, index: 0, name: 'Host' },
            { id: 'socket-stale', index: 1, name: 'Ghost' },
            { id: 'socket-live', index: 2, name: 'Live' },
        ],
    };
    const sockets = new Map([
        ['socket-live', {}],
    ]);

    const remaining = getRemainingConnectedPlayers(room, sockets, 'socket-host');
    assert.deepStrictEqual(remaining.map(p => p.index), [2]);
});

runTest('compactRoomActionLog は長いログを stateSnapshot に圧縮してミラー状態を維持する', () => {
    const room = {
        hostPlayerIndex: 0,
        started: true,
        restored: false,
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        gameStartPayload: {
            playerNames: ['A', 'B'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            enabledCards: ['麦畑'],
            enabledLandmarks: ['駅', 'ショッピングモール'],
        },
        actionLog: [],
        lastUndoState: null,
        stateSnapshot: null,
    };
    for (let i = 0; i < 201; i++) {
        room.actionLog.push({ action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] } });
        room.actionLog.push({ action: 'nextTurn', data: {} });
    }

    const before = createRoomMirror(room);
    compactRoomActionLog(room);
    const after = createRoomMirror(room);

    assert.ok(room.stateSnapshot);
    assert.strictEqual(room.actionLog.length, 0);
    assert.strictEqual(after.game.currentPlayerIndex, before.game.currentPlayerIndex);
    assert.deepStrictEqual(after.game.players.map(p => p.coins), before.game.players.map(p => p.coins));
    assert.strictEqual(after.game.turnCount, before.game.turnCount);
});

if (process.exitCode) {
    throw new Error('serverテストで失敗が発生しました');
}
