'use strict';

const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const { loadCPURuntime } = require('./helpers/runtime-loaders');

const runtime = loadCPURuntime();
const {
    CPU,
    CPUPendingResolution,
    GAME_PHASES,
    GameManager,
    LANDMARK_NAMES,
    createCardByName,
    resolveLiveExpertOptions,
} = runtime;

const DIFFICULTIES = Object.freeze(['weak', 'normal', 'strong', 'expert']);
const PLAYER_COUNTS = Object.freeze([2, 4, 10]);
const PENDING_CASES = Object.freeze([
    Object.freeze({
        name: 'tv',
        action: 'resolveTV',
        field: 'pendingTV',
        keys: Object.freeze(['targetIndex']),
        setup(game) {
            game.currentPlayer().cards.unshift(createCardByName('テレビ局'));
            game.players[1].coins = 5;
        },
    }),
    Object.freeze({
        name: 'business',
        action: 'resolveBusiness',
        field: 'pendingBusiness',
        keys: Object.freeze(['myCard', 'targetIndex', 'theirCard']),
        setup(game) {
            game.currentPlayer().cards.unshift(createCardByName('ビジネスセンター'));
        },
    }),
    Object.freeze({
        name: 'cleaning',
        action: 'resolveCleaning',
        field: 'pendingCleaning',
        keys: Object.freeze(['cardName']),
        setup(game) {
            game.currentPlayer().cards.unshift(createCardByName('清掃業'));
            game.players[1].cards.push(createCardByName('カフェ'));
        },
    }),
    Object.freeze({
        name: 'mover',
        action: 'resolveMover',
        field: 'pendingMover',
        keys: Object.freeze(['cardIndex', 'targetIndex']),
        setup(game) {
            game.currentPlayer().cards.unshift(createCardByName('引越し屋'));
        },
    }),
    Object.freeze({
        name: 'renovation',
        action: 'resolveRenovation',
        field: 'pendingRenovation',
        keys: Object.freeze(['landmarkName']),
        setup(game) {
            game.currentPlayer().cards.unshift(createCardByName('改装屋'));
            game.currentPlayer().landmarks[LANDMARK_NAMES.STATION] = true;
        },
    }),
    Object.freeze({
        name: 'it',
        action: 'resolveIT',
        field: 'pendingIT',
        keys: Object.freeze(['doSave']),
        setup(game) {
            game.currentPlayer().cards.unshift(createCardByName('ITベンチャー'));
            game.currentPlayer().coins = 3;
        },
    }),
]);

function createCpu(difficulty) {
    const options = difficulty === 'expert'
        ? resolveLiveExpertOptions(difficulty, { expertPurpose: 'live' })
        : {};
    return new CPU(difficulty, options);
}

function createPendingGame(playerCount, pendingCase) {
    const game = new GameManager(playerCount);
    game.phase = GAME_PHASES.PENDING;
    for (const player of game.players) {
        player.cards = [createCardByName('麦畑'), createCardByName('森林')];
        player.dormantCards = [];
        player.coins = 10;
    }
    game[pendingCase.field] = pendingCase.field === 'pendingIT' ? true : 1;
    pendingCase.setup(game);
    return game;
}

runTest('全CPU難易度・代表人数は全pendingをcanonical proposalで解決する', () => {
    for (const difficulty of DIFFICULTIES) {
        for (const playerCount of PLAYER_COUNTS) {
            for (const pendingCase of PENDING_CASES) {
                const label = `${difficulty}/${playerCount}/${pendingCase.name}`;
                const game = createPendingGame(playerCount, pendingCase);
                const cpu = createCpu(difficulty);
                const beforeCount = pendingCase.field === 'pendingIT'
                    ? Number(game.pendingIT)
                    : game[pendingCase.field];

                const proposal = CPU.choosePendingAction(game, cpu, { clearFallback: false });

                assert.ok(proposal, `${label}: proposal`);
                assert.strictEqual(proposal.action, pendingCase.action, `${label}: action`);
                assert.deepStrictEqual(
                    Object.keys(proposal.data).sort(),
                    Array.from(pendingCase.keys).sort(),
                    `${label}: canonical keys`
                );
                assert.strictEqual(Object.isFrozen(proposal), true, `${label}: frozen proposal`);
                assert.strictEqual(Object.isFrozen(proposal.data), true, `${label}: frozen data`);
                assert.strictEqual(CPUPendingResolution.applyPendingAction(game, proposal), true, `${label}: apply`);
                const afterCount = pendingCase.field === 'pendingIT'
                    ? Number(game.pendingIT)
                    : game[pendingCase.field];
                assert.ok(afterCount < beforeCount, `${label}: pending progress`);
                assert.notStrictEqual(game.phase, GAME_PHASES.PENDING, `${label}: phase progress`);
            }
        }
    }
});
