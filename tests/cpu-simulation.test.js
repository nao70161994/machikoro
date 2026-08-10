const assert = require('assert');
const { CPUSimulation } = require('../js/cpuSimulation');
const { runTest } = require('./helpers/test-utils');
const { loadCPURuntime } = require('./helpers/runtime-loaders');

runTest('CPU simulation RNG は同じseedから同じ列を生成する', () => {
    const first = CPUSimulation.createPlayoutRng(42);
    const second = CPUSimulation.createPlayoutRng(42);
    const firstValues = Array.from({ length: 8 }, () => first());
    const secondValues = Array.from({ length: 8 }, () => second());

    assert.deepStrictEqual(firstValues, secondValues);
    assert.ok(firstValues.every(value => value >= 0 && value < 1));
});

runTest('CPU simulation RNG はseed 0を既存どおりseed 1へ正規化する', () => {
    const zeroSeed = CPUSimulation.createPlayoutRng(0);
    const oneSeed = CPUSimulation.createPlayoutRng(1);

    assert.deepStrictEqual(
        Array.from({ length: 4 }, () => zeroSeed()),
        Array.from({ length: 4 }, () => oneSeed())
    );
});

runTest('CPU本体のplayout RNG wrapperはpure simulationへ同値委譲する', () => {
    const { CPU } = loadCPURuntime();
    const cpuRng = new CPU('expert')._createPlayoutRng(123);
    const pureRng = CPUSimulation.createPlayoutRng(123);

    assert.deepStrictEqual(
        Array.from({ length: 8 }, () => cpuRng()),
        Array.from({ length: 8 }, () => pureRng())
    );
});

runTest('CPU simulation は1個振りと2個振りの既存代表出目・重みを維持する', () => {
    const oneDie = CPUSimulation.diceOutcomeWeights(false);
    const twoDice = CPUSimulation.diceOutcomeWeights(true);

    assert.deepStrictEqual(oneDie.map(outcome => outcome.total), [1, 2, 3, 4, 5, 6]);
    assert.deepStrictEqual(oneDie.map(outcome => outcome.weight), [1, 1, 1, 1, 1, 1]);
    assert.deepStrictEqual(twoDice.map(outcome => outcome.total), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    assert.deepStrictEqual(twoDice.map(outcome => outcome.weight), [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1]);
    assert.strictEqual(twoDice.reduce((sum, outcome) => sum + outcome.weight, 0), 36);
});

runTest('CPU本体のdice outcome wrapperはpure simulationへ同値委譲する', () => {
    const { CPU } = loadCPURuntime();
    const cpu = new CPU('expert');

    assert.strictEqual(
        JSON.stringify(cpu._diceOutcomeWeights(false)),
        JSON.stringify(CPUSimulation.diceOutcomeWeights(false))
    );
    assert.strictEqual(
        JSON.stringify(cpu._diceOutcomeWeights(true)),
        JSON.stringify(CPUSimulation.diceOutcomeWeights(true))
    );
});

runTest('CPU simulation shop stockはcard順と人数別初期値をpureに写像する', () => {
    const cards = [{ name: 'A', base: 3 }, { name: 'B', base: 5 }];
    const calls = [];
    const stock = CPUSimulation.buildShopStock(cards, 7, (card, playerCount) => {
        calls.push([card.name, playerCount]);
        return card.base + playerCount;
    });

    assert.deepStrictEqual(stock, { A: 10, B: 12 });
    assert.deepStrictEqual(calls, [['A', 7], ['B', 7]]);
});

runTest('CPU本体のsimulation shop stock wrapperは2〜10人でpure helperへ同値委譲する', () => {
    const runtime = loadCPURuntime();
    const cpu = new runtime.CPU('expert');
    for (let playerCount = 2; playerCount <= 10; playerCount++) {
        const expected = CPUSimulation.buildShopStock(
            runtime.CARDS,
            playerCount,
            runtime.getInitialCardStock
        );
        assert.strictEqual(JSON.stringify(cpu._simulationShopStock(playerCount)), JSON.stringify(expected));
    }
});

runTest('CPU simulation playoutはwinnerまで既存順でstepを実行する', () => {
    let steps = 0;
    let winnerChecks = 0;
    const game = {
        checkWinner() {
            winnerChecks++;
            return steps >= 3 ? { name: 'winner' } : null;
        },
    };
    const safety = CPUSimulation.runPlayout(game, 10, () => {
        steps++;
    });

    assert.strictEqual(safety, 3);
    assert.strictEqual(steps, 3);
    assert.strictEqual(winnerChecks, 4);
});

runTest('CPU simulation playoutはmaxStepsで停止して追加stepを実行しない', () => {
    let steps = 0;
    const game = { checkWinner: () => null };
    const safety = CPUSimulation.runPlayout(game, 2, () => {
        steps++;
    });

    assert.strictEqual(safety, 2);
    assert.strictEqual(steps, 2);
});

runTest('CPU simulation playoutはno-progressを一度の試行で有限停止する', () => {
    let steps = 0;
    const game = { checkWinner: () => null };
    const safety = CPUSimulation.runPlayout(game, 100, () => {
        steps++;
        return false;
    });

    assert.strictEqual(safety, 1);
    assert.strictEqual(steps, 1);
});

runTest('CPU simulation pendingはcanonical proposal・apply・進行判定を共有する', () => {
    const calls = [];
    const game = { phase: 'pending', pendingTV: 1, pendingActionQueue: [{}] };
    const cpu = {};
    const policy = {
        pendingProgressSignature(current) {
            return `${current.phase}:${current.pendingTV}:${current.pendingActionQueue.length}`;
        },
        choosePendingAction(receivedGame, receivedCpu, options) {
            calls.push(['choose', receivedGame, receivedCpu, options]);
            return { action: 'resolveTV', data: { targetIndex: 1 } };
        },
        applyPendingAction(receivedGame, proposal) {
            calls.push(['apply', receivedGame, proposal]);
            receivedGame.pendingTV = 0;
            receivedGame.pendingActionQueue = [];
            receivedGame.phase = 'build';
            return true;
        },
    };

    assert.strictEqual(CPUSimulation.runPendingStep(game, cpu, policy), true);
    assert.deepStrictEqual(calls[0], ['choose', game, cpu, { clearFallback: false }]);
    assert.strictEqual(calls[1][0], 'apply');
    assert.strictEqual(calls[1][1], game);
    assert.deepStrictEqual(calls[1][2], { action: 'resolveTV', data: { targetIndex: 1 } });
});

runTest('CPU simulation pendingはproposal欠落・適用拒否・状態不変を補修せず停止する', () => {
    for (const mode of ['missing', 'rejected', 'unchanged']) {
        const game = { phase: 'pending', pendingCleaning: 1, pendingActionQueue: [{}] };
        const before = JSON.stringify(game);
        const policy = {
            pendingProgressSignature: current => JSON.stringify(current),
            choosePendingAction: () => mode === 'missing'
                ? null
                : { action: 'resolveCleaning', data: { cardName: '麦畑' } },
            applyPendingAction(current) {
                if (mode === 'rejected') return false;
                if (mode === 'unchanged') return true;
                current.phase = 'build';
                return true;
            },
        };

        assert.strictEqual(CPUSimulation.runPendingStep(game, {}, policy), false, mode);
        assert.strictEqual(JSON.stringify(game), before, mode);
    }
});

runTest('CPU simulation stepはdice消費順とroll payloadを維持する', () => {
    const phases = {
        ROLL: 'roll',
        SELECT_DICE: 'selectDice',
        REROLL_CONFIRM: 'reroll',
        HARBOR_CHOICE: 'harbor',
        PENDING: 'pending',
        BUILD: 'build',
    };
    const values = [0, 0.2, 0.4];
    const calls = [];
    const game = {
        phase: phases.ROLL,
        rollDice(dice, tunaDice) {
            calls.push({ dice, tunaDice });
        },
    };
    CPUSimulation.runStep(game, {}, {}, () => values.shift(), phases, {});

    assert.deepStrictEqual(calls, [{ dice: 3, tunaDice: [1, 2] }]);
    assert.deepStrictEqual(values, []);
});

runTest('CPU simulation stepはbuild後のpendingITとnextTurn順を維持する', () => {
    const phases = {
        ROLL: 'roll',
        SELECT_DICE: 'selectDice',
        REROLL_CONFIRM: 'reroll',
        HARBOR_CHOICE: 'harbor',
        PENDING: 'pending',
        BUILD: 'build',
    };
    const calls = [];
    const game = {
        phase: phases.BUILD,
        pendingIT: false,
        nextTurn() {
            calls.push('nextTurn');
        },
    };
    const cpu = {
        build(receivedGame, receivedStock) {
            assert.strictEqual(receivedGame, game);
            assert.deepStrictEqual(receivedStock, { wheat: 2 });
            calls.push('build');
        },
    };
    CPUSimulation.runStep(game, cpu, { wheat: 2 }, () => 0, phases, {});

    assert.deepStrictEqual(calls, ['build', 'nextTurn']);
});


runTest('CPU simulation cloneはgame stateをcard identity対応込みでdetached再構築する', () => {
    const firstCard = { id: 'first' };
    const secondCard = { id: 'second' };
    const tunaDice = [3, 4];
    const game = {
        players: [{
            name: 'Alice', coins: 7, cards: [firstCard, secondCard], dormantCards: [secondCard],
            landmarks: { station: true }, itVentureCoins: 2, hasYakusho: false,
        }],
        enabledLandmarks: new Set(['station']),
        currentPlayerIndex: 0,
        phase: 'pending',
        lastDiceResult: 7,
        lastDice1: 3,
        lastDice2: 4,
        builtThisTurn: true,
        pendingTV: 1,
        pendingBusiness: 2,
        pendingCleaning: 3,
        pendingMover: 4,
        pendingRenovation: 5,
        pendingActionQueue: [{ action: 'resolveTV', field: 'pendingTV' }],
        pendingIT: true,
        usedReroll: true,
        pendingTunaDice: tunaDice,
        turnCount: 9,
        hadAmusementParkAtRoll: true,
        log: [{ message: 'do not copy' }],
    };
    let rebuilt = 0;
    const clone = CPUSimulation.cloneGame(game, {
        createGame(playerCount) {
            assert.strictEqual(playerCount, 1);
            return {
                players: [{ cards: [], dormantCards: [], landmarks: {} }],
                rebuildPendingActionsFromFields() { rebuilt++; },
            };
        },
        cloneCard(card) { return { ...card, cloned: true }; },
        defaultLandmarks() { return ['fallback']; },
    });

    assert.notStrictEqual(clone.players[0].cards[0], firstCard);
    assert.strictEqual(clone.players[0].dormantCards[0], clone.players[0].cards[1]);
    assert.deepStrictEqual(clone.players[0].cards.map(card => card.id), ['first', 'second']);
    assert.deepStrictEqual([...clone.enabledLandmarks], ['station']);
    assert.deepStrictEqual(clone.pendingActionQueue, [{ action: 'resolveTV', field: 'pendingTV' }]);
    assert.notStrictEqual(clone.pendingActionQueue, game.pendingActionQueue);
    assert.strictEqual(clone.pendingTunaDice, tunaDice);
    assert.deepStrictEqual(clone.log, []);
    assert.strictEqual(rebuilt, 0);
    assert.deepStrictEqual(game.log, [{ message: 'do not copy' }]);
});

runTest('CPU simulation cloneはlegacy pending fieldsだけならqueueを再構築する', () => {
    let rebuilt = 0;
    const clone = CPUSimulation.cloneGame({
        players: [{
            name: 'A', coins: 0, cards: [], dormantCards: [], landmarks: {},
            itVentureCoins: 0, hasYakusho: true,
        }],
        enabledLandmarks: null,
        pendingActionQueue: null,
    }, {
        createGame() {
            return {
                players: [{ cards: [], dormantCards: [], landmarks: {} }],
                rebuildPendingActionsFromFields() { rebuilt++; },
            };
        },
        cloneCard(card) { return card; },
        defaultLandmarks() { return ['fallback']; },
    });
    assert.deepStrictEqual([...clone.enabledLandmarks], ['fallback']);
    assert.strictEqual(rebuilt, 1);
    assert.throws(() => CPUSimulation.cloneGame({ players: [] }), /adapters are required/);
});

runTest('CPU本体のclone wrapperはsimulation runtimeと同じdetached gameを返す', () => {
    const runtime = loadCPURuntime();
    const game = new runtime.GameManager(2);
    game.players[0].coins = 12;
    game.players[0].makeDormant(game.players[0].cards[0]);
    game.pendingTV = 1;
    game.pendingActionQueue = [{ action: 'resolveTV', field: 'pendingTV' }];
    const clone = new runtime.CPU('expert')._cloneGame(game);

    assert.notStrictEqual(clone, game);
    assert.notStrictEqual(clone.players[0], game.players[0]);
    assert.notStrictEqual(clone.players[0].cards[0], game.players[0].cards[0]);
    assert.strictEqual(clone.players[0].dormantCards[0], clone.players[0].cards[0]);
    assert.strictEqual(clone.players[0].coins, 12);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(clone.pendingActionQueue)), [
        { action: 'resolveTV', field: 'pendingTV' },
    ]);
});
