'use strict';

const assert = require('assert');
const server = require('../server');
const { runTest } = require('./helpers/test-utils');

const runtime = server.loadGameRuntime();
const {
    PARITY_PLAYER_COUNTS,
    SCHEMA_SELECTIONS,
    makeGameSchemaParityHarness,
} = require('./helpers/game-schema-parity');
const { makeRoom, applyTraceStep, setPending } = makeGameSchemaParityHarness(server, runtime);


runTest('pure snapshot採用は不正snapshotで既存mirrorを変更しない', () => {
    const room = makeRoom(2, SCHEMA_SELECTIONS[3]);
    const originalMirror = room.canonicalMirror;
    assert.strictEqual(server.adoptTransitionSnapshotToRoomMirror(room, {
        ok: true,
        snapshot: { phase: 'broken' },
    }), false);
    assert.strictEqual(room.canonicalMirror, originalMirror);
});

runTest('schema shadow parityは2〜10人・独立v0/v1でpure snapshot採用後も全action traceを維持する', () => {
    const landmarks = runtime.Player.landmarkNames();
    const fixtures = [
        {
            name: 'build-undo-next-turn',
            setup(game) { game.phase = runtime.GAME_PHASES.BUILD; game.players[0].coins = 20; },
            actions: [
                ['buildCard', { cardName: '麦畑' }],
                ['undoBuild', {}],
                ['buildLandmark', { name: '駅' }],
                ['nextTurn', {}],
            ],
        },
        {
            name: 'station-dice-selection',
            setup(game) { game.phase = runtime.GAME_PHASES.ROLL; game.players[0].landmarks['駅'] = true; },
            actions: [
                ['rollDice', { forceDice: 1, tunaDice: [1, 1] }],
                ['selectDice', { useTwo: false, d1: 1, d2: 1, tunaDice: [1, 1] }],
            ],
        },
        {
            name: 'station-two-dice-current-payload',
            setup(game) { game.phase = runtime.GAME_PHASES.ROLL; game.players[0].landmarks['駅'] = true; },
            actions: [
                ['rollDice', { forceDice: 1, tunaDice: [1, 1] }],
                ['selectDice', { useTwo: true, diceCount: 2, d1: 2, d2: 3, tunaDice: [1, 1] }],
            ],
        },
        {
            name: 'tuna-dice-through-station-reroll-harbor',
            setup(game) {
                game.phase = runtime.GAME_PHASES.ROLL;
                game.players[0].cards = [runtime.createCardByName('マグロ漁船')];
                game.players[0].dormantCards = [];
                game.players[0].landmarks['駅'] = true;
                game.players[0].landmarks['電波塔'] = true;
                game.players[0].landmarks['港'] = true;
                game.players[0].coins = 3;
            },
            actions: [
                ['rollDice', { forceDice: 1, tunaDice: [2, 6] }],
                ['selectDice', { useTwo: true, diceCount: 2, d1: 5, d2: 5, tunaDice: [2, 6] }],
                ['skipReroll', {}],
                ['resolveHarbor', { useBonus: true }],
            ],
            assertAfter(game, stepIndex) {
                if (stepIndex === 0) {
                    assert.strictEqual(game.phase, runtime.GAME_PHASES.SELECT_DICE);
                    assert.deepStrictEqual(Array.from(game.pendingTunaDice), [2, 6]);
                } else if (stepIndex === 1) {
                    assert.strictEqual(game.phase, runtime.GAME_PHASES.REROLL_CONFIRM);
                    assert.strictEqual(game.lastDiceResult, 10);
                    assert.deepStrictEqual(Array.from(game.pendingTunaDice), [2, 6]);
                } else if (stepIndex === 2) {
                    assert.strictEqual(game.phase, runtime.GAME_PHASES.HARBOR_CHOICE);
                    assert.deepStrictEqual(Array.from(game.pendingTunaDice), [2, 6]);
                } else {
                    assert.strictEqual(game.lastDiceResult, 12);
                    assert.strictEqual(game.players[0].coins, 11);
                    assert.strictEqual(game.phase, runtime.GAME_PHASES.BUILD);
                }
            },
        },
        {
            name: 'roll-multi-pending-dormant-business',
            setup(game) {
                game.phase = runtime.GAME_PHASES.ROLL;
                const bakery = runtime.createCardByName('パン屋');
                game.players[0].cards = [
                    runtime.createCardByName('テレビ局'),
                    runtime.createCardByName('ビジネスセンター'),
                    bakery,
                ];
                game.players[0].dormantCards = [];
                game.players[0].makeDormant(bakery);
                game.players[1].cards = [runtime.createCardByName('森林')];
                game.players[1].dormantCards = [];
                game.players[1].coins = 8;
            },
            actions: [
                ['rollDice', { forceDice: 6, tunaDice: [1, 1] }],
                ['resolveTV', { targetIndex: 1 }],
                ['resolveBusiness', { myCard: 2, targetIndex: 1, theirCard: 0 }],
            ],
            assertAfter(game, stepIndex) {
                if (stepIndex === 0) {
                    assert.strictEqual(game.phase, runtime.GAME_PHASES.PENDING);
                    assert.deepStrictEqual(
                        Array.from(game.pendingActionQueue, entry => `${entry.action}:${entry.field}`),
                        ['resolveTV:pendingTV', 'resolveBusiness:pendingBusiness']
                    );
                } else if (stepIndex === 1) {
                    assert.strictEqual(game.pendingTV, 0);
                    assert.strictEqual(game.pendingBusiness, 1);
                    assert.deepStrictEqual(
                        Array.from(game.pendingActionQueue, entry => `${entry.action}:${entry.field}`),
                        ['resolveBusiness:pendingBusiness']
                    );
                } else {
                    assert.strictEqual(game.phase, runtime.GAME_PHASES.BUILD);
                    assert.strictEqual(game.pendingActionQueue.length, 0);
                    assert.strictEqual(game.players[1].cards[0].name, 'パン屋');
                    assert.strictEqual(game.players[1].isDormant(game.players[1].cards[0]), true);
                }
            },
        },
        {
            name: 'multi-mover-dormant-transfer-chain',
            setup(game) {
                game.phase = runtime.GAME_PHASES.ROLL;
                const dormantCafe = runtime.createCardByName('カフェ');
                game.players[0].cards = [
                    runtime.createCardByName('引越し屋'),
                    runtime.createCardByName('引越し屋'),
                    dormantCafe,
                    runtime.createCardByName('パン屋'),
                ];
                game.players[0].dormantCards = [];
                game.players[0].makeDormant(dormantCafe);
                game.players[0].coins = 3;
                game.players[1].cards = [];
                game.players[1].dormantCards = [];
            },
            actions: [
                ['rollDice', { forceDice: 9, tunaDice: [1, 1] }],
                ['resolveMover', { cardName: 'カフェ', targetIndex: 1 }],
                ['resolveMover', { cardName: 'パン屋', targetIndex: 1 }],
            ],
            assertAfter(game, stepIndex) {
                const current = game.players[0];
                const target = game.players[1];
                if (stepIndex === 0) {
                    assert.strictEqual(game.phase, runtime.GAME_PHASES.PENDING);
                    assert.strictEqual(game.pendingMover, 2);
                    assert.deepStrictEqual(
                        Array.from(game.pendingActionQueue, entry => `${entry.action}:${entry.field}`),
                        ['resolveMover:pendingMover', 'resolveMover:pendingMover']
                    );
                    assert.strictEqual(current.isDormant(current.cards[2]), true);
                } else if (stepIndex === 1) {
                    assert.strictEqual(game.pendingMover, 1);
                    assert.strictEqual(game.phase, runtime.GAME_PHASES.PENDING);
                    assert.strictEqual(current.coins, 7);
                    assert.strictEqual(target.cards[0].name, 'カフェ');
                    assert.strictEqual(target.isDormant(target.cards[0]), true);
                } else {
                    assert.strictEqual(game.pendingMover, 0);
                    assert.strictEqual(game.pendingActionQueue.length, 0);
                    assert.strictEqual(game.phase, runtime.GAME_PHASES.BUILD);
                    assert.strictEqual(current.coins, 11);
                    assert.deepStrictEqual(
                        Array.from(target.cards, card => card.name),
                        ['カフェ', 'パン屋']
                    );
                    assert.strictEqual(target.isDormant(target.cards[0]), true);
                    assert.strictEqual(target.isDormant(target.cards[1]), false);
                    assert.deepStrictEqual(
                        Array.from(current.cards, card => card.name),
                        ['引越し屋', '引越し屋']
                    );
                }
            },
        },
        {
            name: 'loan-dormancy-recovery',
            setup(game) {
                game.phase = runtime.GAME_PHASES.ROLL;
                const loan = runtime.createCardByName('貸金業');
                game.players[0].cards = [loan];
                game.players[0].dormantCards = [];
                game.players[0].makeDormant(loan);
                game.players[0].coins = 10;
            },
            actions: [['rollDice', { forceDice: 5, tunaDice: [1, 1] }]],
            assertAfter(game) {
                assert.strictEqual(game.players[0].coins, 10);
                assert.strictEqual(game.players[0].isDormant(game.players[0].cards[0]), false);
                assert.strictEqual(game.phase, runtime.GAME_PHASES.BUILD);
            },
        },
        {
            name: 'winery-income-and-dormancy',
            setup(game) {
                game.phase = runtime.GAME_PHASES.ROLL;
                const winery = runtime.createCardByName('ワイナリー');
                game.players[0].cards = [
                    runtime.createCardByName('ブドウ園'),
                    runtime.createCardByName('ブドウ園'),
                    winery,
                ];
                game.players[0].dormantCards = [];
                game.players[0].coins = 3;
            },
            actions: [['rollDice', { forceDice: 9, tunaDice: [1, 1] }]],
            assertAfter(game) {
                assert.strictEqual(game.players[0].coins, 15);
                assert.strictEqual(game.players[0].isDormant(game.players[0].cards[2]), true);
                assert.strictEqual(game.phase, runtime.GAME_PHASES.BUILD);
            },
        },
        {
            name: 'shopping-mall-red-green-order',
            setup(game) {
                game.phase = runtime.GAME_PHASES.ROLL;
                game.players[0].cards = [runtime.createCardByName('パン屋')];
                game.players[0].dormantCards = [];
                game.players[0].landmarks['ショッピングモール'] = true;
                game.players[0].coins = 100;
                for (let index = 1; index < game.players.length; index++) {
                    game.players[index].cards = [runtime.createCardByName('カフェ')];
                    game.players[index].dormantCards = [];
                    game.players[index].landmarks['ショッピングモール'] = true;
                    game.players[index].coins = 1;
                }
            },
            actions: [['rollDice', { forceDice: 3, tunaDice: [1, 1] }]],
            assertAfter(game) {
                assert.strictEqual(game.players[0].coins, 102 - 2 * (game.players.length - 1));
                for (let index = 1; index < game.players.length; index++) {
                    assert.strictEqual(game.players[index].coins, 3);
                }
                assert.strictEqual(game.phase, runtime.GAME_PHASES.BUILD);
            },
        },
        {
            name: 'conditional-red-landmark-threshold-chain',
            setup(game) {
                game.phase = runtime.GAME_PHASES.ROLL;
                const current = game.players[0];
                const opponent = game.players[1];
                current.cards = [runtime.createCardByName('会員制BAR')];
                current.dormantCards = [];
                opponent.cards = [runtime.createCardByName('高級フレンチ')];
                opponent.dormantCards = [];
                current.coins = 20;
                opponent.coins = 10;
                current.landmarks[runtime.LANDMARK_NAMES.STATION] = true;
                current.landmarks[runtime.LANDMARK_NAMES.SHOPPING_MALL] = true;
                current.landmarks[runtime.LANDMARK_NAMES.HARBOR] = true;
                opponent.landmarks[runtime.LANDMARK_NAMES.STATION] = true;
                opponent.landmarks[runtime.LANDMARK_NAMES.SHOPPING_MALL] = true;
                opponent.landmarks[runtime.LANDMARK_NAMES.HARBOR] = true;
            },
            actions: [
                ['rollDice', { forceDice: 1, tunaDice: [1, 1] }],
                ['selectDice', { useTwo: false, diceCount: 1, d1: 5, d2: 1, tunaDice: [1, 1] }],
                ['nextTurn', {}],
                ['rollDice', { forceDice: 1, tunaDice: [1, 1] }],
                ['selectDice', { useTwo: true, diceCount: 2, d1: 6, d2: 6, tunaDice: [1, 1] }],
                ['resolveHarbor', { useBonus: false }],
            ],
            assertAfter(game, stepIndex) {
                if (stepIndex === 0) {
                    assert.strictEqual(game.phase, runtime.GAME_PHASES.SELECT_DICE);
                    assert.strictEqual(game.players[0].coins, 20);
                    assert.strictEqual(game.players[1].coins, 10);
                } else if (stepIndex === 1) {
                    assert.strictEqual(game.players[0].coins, 15);
                    assert.strictEqual(game.players[1].coins, 15);
                    assert.strictEqual(game.phase, runtime.GAME_PHASES.BUILD);
                } else if (stepIndex === 2) {
                    assert.strictEqual(game.currentPlayerIndex, 1);
                    assert.strictEqual(game.phase, runtime.GAME_PHASES.ROLL);
                } else if (stepIndex === 3) {
                    assert.strictEqual(game.phase, runtime.GAME_PHASES.SELECT_DICE);
                    assert.strictEqual(game.players[0].coins, 15);
                    assert.strictEqual(game.players[1].coins, 15);
                } else if (stepIndex === 4) {
                    assert.strictEqual(game.lastDiceResult, 12);
                    assert.strictEqual(game.players[0].coins, 15);
                    assert.strictEqual(game.players[1].coins, 15);
                    assert.strictEqual(game.phase, runtime.GAME_PHASES.HARBOR_CHOICE);
                } else {
                    assert.strictEqual(game.lastDiceResult, 12);
                    assert.strictEqual(game.players[0].coins, 30);
                    assert.strictEqual(game.players[1].coins, 1);
                    assert.strictEqual(game.phase, runtime.GAME_PHASES.BUILD);
                }
            },
        },
        {
            name: 'publisher-multiplayer-transfer',
            setup(game) {
                game.phase = runtime.GAME_PHASES.ROLL;
                game.players[0].cards = [runtime.createCardByName('出版社')];
                game.players[0].dormantCards = [];
                game.players[0].coins = 3;
                for (let index = 1; index < game.players.length; index++) {
                    game.players[index].cards = [
                        runtime.createCardByName('カフェ'),
                        runtime.createCardByName('カフェ'),
                        runtime.createCardByName('パン屋'),
                    ];
                    game.players[index].dormantCards = [];
                    game.players[index].coins = 10;
                }
            },
            actions: [['rollDice', { forceDice: 7, tunaDice: [1, 1] }]],
            assertAfter(game) {
                assert.strictEqual(game.players[0].coins, 3 + 3 * (game.players.length - 1));
                for (let index = 1; index < game.players.length; index++) {
                    assert.strictEqual(game.players[index].coins, 7);
                }
                assert.strictEqual(game.phase, runtime.GAME_PHASES.BUILD);
            },
        },
        {
            name: 'tax-office-threshold-transfer',
            setup(game) {
                game.phase = runtime.GAME_PHASES.ROLL;
                game.players[0].cards = [runtime.createCardByName('税務署')];
                game.players[0].dormantCards = [];
                game.players[0].coins = 3;
                for (let index = 1; index < game.players.length; index++) {
                    game.players[index].cards = [];
                    game.players[index].dormantCards = [];
                    game.players[index].coins = index % 2 === 1 ? 12 : 9;
                }
            },
            actions: [['rollDice', { forceDice: 8, tunaDice: [1, 1] }]],
            assertAfter(game) {
                const taxedPlayers = Math.ceil((game.players.length - 1) / 2);
                assert.strictEqual(game.players[0].coins, 3 + taxedPlayers * 6);
                for (let index = 1; index < game.players.length; index++) {
                    assert.strictEqual(game.players[index].coins, index % 2 === 1 ? 6 : 9);
                }
                assert.strictEqual(game.phase, runtime.GAME_PHASES.BUILD);
            },
        },
        {
            name: 'it-startup-multiplayer-transfer',
            setup(game) {
                game.phase = runtime.GAME_PHASES.ROLL;
                game.players[0].cards = [runtime.createCardByName('ITベンチャー')];
                game.players[0].dormantCards = [];
                game.players[0].coins = 3;
                game.players[0].itVentureCoins = 2;
                for (let index = 1; index < game.players.length; index++) {
                    game.players[index].cards = [];
                    game.players[index].dormantCards = [];
                    game.players[index].coins = index;
                }
            },
            actions: [['rollDice', { forceDice: 10, tunaDice: [1, 1] }]],
            assertAfter(game) {
                let expectedIncome = 0;
                for (let index = 1; index < game.players.length; index++) {
                    const paid = Math.min(2, index);
                    expectedIncome += paid;
                    assert.strictEqual(game.players[index].coins, index - paid);
                }
                assert.strictEqual(game.players[0].coins, 3 + expectedIncome);
                assert.strictEqual(game.players[0].itVentureCoins, 2);
                assert.strictEqual(game.phase, runtime.GAME_PHASES.BUILD);
            },
        },
        {
            name: 'park-multiplayer-redistribution',
            setup(game) {
                game.phase = runtime.GAME_PHASES.ROLL;
                for (let index = 0; index < game.players.length; index++) {
                    game.players[index].cards = [];
                    game.players[index].dormantCards = [];
                    game.players[index].coins = index + 1;
                }
                game.players[0].cards = [runtime.createCardByName('公園')];
            },
            actions: [['rollDice', { forceDice: 11, tunaDice: [1, 1] }]],
            assertAfter(game) {
                const total = game.players.length * (game.players.length + 1) / 2;
                const each = Math.floor(total / game.players.length);
                const remainder = total - each * game.players.length;
                assert.strictEqual(game.players[0].coins, each + remainder);
                for (let index = 1; index < game.players.length; index++) {
                    assert.strictEqual(game.players[index].coins, each);
                }
                assert.strictEqual(
                    game.players.reduce((sum, player) => sum + player.coins, 0),
                    total
                );
                assert.strictEqual(game.phase, runtime.GAME_PHASES.BUILD);
            },
        },
        {
            name: 'pending-tv',
            setup(game) {
                game.phase = runtime.GAME_PHASES.PENDING;
                game.pendingTV = 1;
                game.pendingActionQueue = [{ action: 'resolveTV', field: 'pendingTV' }];
                game.players[1].coins = 8;
            },
            actions: [['resolveTV', { targetIndex: 1 }]],
        },
        {
            name: 'reroll-dice',
            setup(game) { game.phase = runtime.GAME_PHASES.REROLL_CONFIRM; game.lastDiceResult = 4; },
            actions: [['rerollDice', { forceDice: 6, tunaDice: [1, 1] }]],
        },
        {
            name: 'skip-reroll',
            setup(game) { game.phase = runtime.GAME_PHASES.REROLL_CONFIRM; game.lastDiceResult = 4; },
            actions: [['skipReroll', {}]],
        },
        {
            name: 'harbor-choice',
            setup(game) { game.phase = runtime.GAME_PHASES.HARBOR_CHOICE; game.lastDiceResult = 10; },
            actions: [['resolveHarbor', { useBonus: true }]],
        },
        {
            name: 'harbor-choice-no-bonus',
            setup(game) { game.phase = runtime.GAME_PHASES.HARBOR_CHOICE; game.lastDiceResult = 11; },
            actions: [['resolveHarbor', { useBonus: false }]],
            assertAfter(game) {
                assert.strictEqual(game.lastDiceResult, 11);
                assert.strictEqual(game.phase, runtime.GAME_PHASES.BUILD);
            },
        },
        {
            name: 'pending-business',
            setup(game) {
                setPending(game, 'resolveBusiness', 'pendingBusiness');
                game.players[0].cards = [runtime.createCardByName('パン屋')];
                game.players[1].cards = [runtime.createCardByName('森林')];
            },
            actions: [['resolveBusiness', { myCard: 0, targetIndex: 1, theirCard: 0 }]],
        },
        {
            name: 'pending-cleaning',
            setup(game) {
                setPending(game, 'resolveCleaning', 'pendingCleaning');
                game.players[1].cards = [runtime.createCardByName('カフェ')];
            },
            actions: [['resolveCleaning', { cardName: 'カフェ' }]],
        },
        {
            name: 'pending-mover',
            setup(game) {
                setPending(game, 'resolveMover', 'pendingMover');
                game.players[0].cards = [runtime.createCardByName('パン屋')];
                game.players[1].cards = [];
            },
            actions: [['resolveMover', { cardIndex: 0, targetIndex: 1 }]],
        },
        {
            name: 'pending-mover-by-name',
            setup(game) {
                setPending(game, 'resolveMover', 'pendingMover');
                game.players[0].cards = [runtime.createCardByName('パン屋')];
                game.players[1].cards = [];
            },
            actions: [['resolveMover', { cardName: 'パン屋', targetIndex: 1 }]],
        },
        {
            name: 'pending-renovation',
            setup(game) {
                setPending(game, 'resolveRenovation', 'pendingRenovation');
                game.players[0].landmarks['駅'] = true;
            },
            actions: [['resolveRenovation', { landmarkName: '駅' }]],
        },
        {
            name: 'pending-it',
            setup(game) { setPending(game, 'resolveIT', 'pendingIT'); game.players[0].coins = 5; },
            actions: [['resolveIT', { doSave: true }]],
        },
        {
            name: 'pending-it-skip',
            setup(game) {
                setPending(game, 'resolveIT', 'pendingIT');
                game.players[0].coins = 5;
                game.players[0].itVentureCoins = 2;
            },
            actions: [['resolveIT', { doSave: false }]],
            assertAfter(game) {
                assert.strictEqual(game.players[0].coins, 5);
                assert.strictEqual(game.players[0].itVentureCoins, 2);
                assert.strictEqual(game.currentPlayerIndex, 1);
                assert.strictEqual(game.pendingIT, false);
            },
        },
        {
            name: 'airport-no-build-next-turn',
            setup(game) {
                game.phase = runtime.GAME_PHASES.BUILD;
                game.players[0].coins = 3;
                game.players[0].landmarks['空港'] = true;
                game.builtThisTurn = false;
            },
            actions: [['nextTurn', {}]],
            assertAfter(game) {
                assert.strictEqual(game.players[0].coins, 13);
                assert.strictEqual(game.currentPlayerIndex, 1);
                assert.strictEqual(game.turnCount, 1);
                assert.strictEqual(game.phase, runtime.GAME_PHASES.ROLL);
            },
        },
        {
            name: 'airport-it-pending-chain',
            setup(game) {
                game.phase = runtime.GAME_PHASES.BUILD;
                game.players[0].coins = 3;
                game.players[0].landmarks['空港'] = true;
                game.players[0].cards.push(runtime.createCardByName('ITベンチャー'));
                game.builtThisTurn = false;
            },
            actions: [
                ['nextTurn', {}],
                ['resolveIT', { doSave: true }],
            ],
            assertAfter(game, stepIndex) {
                if (stepIndex === 0) {
                    assert.strictEqual(game.players[0].coins, 13);
                    assert.strictEqual(game.pendingIT, true);
                    assert.strictEqual(game.currentPlayerIndex, 0);
                    assert.strictEqual(game.phase, runtime.GAME_PHASES.PENDING);
                } else {
                    assert.strictEqual(game.players[0].coins, 12);
                    assert.strictEqual(game.players[0].itVentureCoins, 1);
                    assert.strictEqual(game.pendingIT, false);
                    assert.strictEqual(game.currentPlayerIndex, 1);
                    assert.strictEqual(game.turnCount, 1);
                    assert.strictEqual(game.phase, runtime.GAME_PHASES.ROLL);
                }
            },
        },
        {
            name: 'amusement-park-double-extra-turn',
            setup(game) {
                game.phase = runtime.GAME_PHASES.BUILD;
                game.hadAmusementParkAtRoll = true;
                game.lastDice1 = 4;
                game.lastDice2 = 4;
                game.lastDiceResult = 8;
                game.builtThisTurn = true;
            },
            actions: [['nextTurn', {}]],
            assertAfter(game) {
                assert.strictEqual(game.currentPlayerIndex, 0);
                assert.strictEqual(game.turnCount, 0);
                assert.strictEqual(game.phase, runtime.GAME_PHASES.ROLL);
                assert.strictEqual(game.lastDice1, 4);
                assert.strictEqual(game.lastDice2, 4);
                assert.strictEqual(game.hadAmusementParkAtRoll, false);
                assert.strictEqual(game.builtThisTurn, false);
            },
        },
        {
            name: 'winning-landmark',
            setup(game) {
                game.phase = runtime.GAME_PHASES.BUILD;
                game.players[0].coins = 100;
                for (const name of landmarks) game.players[0].landmarks[name] = true;
                game.players[0].landmarks[landmarks[landmarks.length - 1]] = false;
            },
            actions: [['buildLandmark', { name: landmarks[landmarks.length - 1] }]],
        },
    ];
    for (const selection of SCHEMA_SELECTIONS) {
        const coveredActions = new Set();
        for (const playerCount of PARITY_PLAYER_COUNTS) {
            for (const fixture of fixtures) {
                const room = makeRoom(playerCount, selection);
                fixture.setup(room.canonicalMirror.game);
                for (const [stepIndex, [action, data]] of fixture.actions.entries()) {
                    coveredActions.add(action);
                    applyTraceStep(room, action, data);
                    if (typeof fixture.assertAfter === 'function') {
                        fixture.assertAfter(room.canonicalMirror.game, stepIndex);
                    }
                }
                assert.ok(room.actionSeq > 0, `${fixture.name}-${playerCount}p`);
            }
        }
        assert.deepStrictEqual(
            [...coveredActions].sort(),
            Object.keys(runtime.GAME_ACTION_REGISTRY).sort(),
            `schema v${selection.actionVersion} shadow parity fixtures must cover every Action Contract entry`
        );
    }
});
