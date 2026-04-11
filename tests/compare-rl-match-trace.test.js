const assert = require('assert');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    buildDeterministicRolls,
    normalizeState,
    normalizeTraceEntry,
    compareTraceEntries,
} = require(path.join(__dirname, '..', 'scripts', 'compare-rl-match-trace.js'));

runTest('compare rl match trace: parseArgs は CLI 引数を解釈する', () => {
    const args = parseArgs([
        '--python-model', 'a/best_model',
        '--js-model', 'a/best_model.browser.json',
        '--opponent', 'normal',
        '--seed', '7',
        '--max-steps', '120',
        '--rl-seat', 'second',
        '--rolls', '1,6,3',
        '--cpu-opponent-impl', 'js-oracle',
    ]);
    assert.strictEqual(args.pythonModel, 'a/best_model');
    assert.strictEqual(args.jsModel, 'a/best_model.browser.json');
    assert.strictEqual(args.opponent, 'normal');
    assert.strictEqual(args.seed, 7);
    assert.strictEqual(args.maxSteps, 120);
    assert.strictEqual(args.rlSeat, 'second');
    assert.deepStrictEqual(args.rolls, [1, 6, 3]);
    assert.strictEqual(args.cpuOpponentImpl, 'js-oracle');
});

runTest('compare rl match trace: buildDeterministicRolls は seed/maxSteps から固定ロール列を作る', () => {
    const first = buildDeterministicRolls(3, 10);
    const second = buildDeterministicRolls(3, 10);
    assert.strictEqual(first.length, 40);
    assert.deepStrictEqual(first, second);
    assert.ok(first.every(value => value >= 1 && value <= 6));
});

runTest('compare rl match trace: normalizeState は Python/JS の状態表現を揃える', () => {
    const py = normalizeState({
        current: 0,
        phase: 'build',
        turnCount: 3,
        lastDice: 4,
        lastDice1: 4,
        lastDice2: 0,
        pendingTV: 0,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingIT: false,
        players: [{ coins: 5, cards: { '麦畑': 1 }, dormant: {}, landmarks: {} }],
    });
    const js = normalizeState({
        currentPlayerIndex: 0,
        phase: 'build',
        turnCount: 3,
        lastDiceResult: 4,
        lastDice1: 4,
        lastDice2: 0,
        pendingTV: 0,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingIT: false,
        players: [{ coins: 5, cards: { '麦畑': 1 }, dormantCards: {}, landmarks: {} }],
    });
    assert.deepStrictEqual(js, py);
});

runTest('compare rl match trace: compareTraceEntries は最初の差分を返す', () => {
    const result = compareTraceEntries(
        { trace: [normalizeTraceEntry({
            actorIndex: 0,
            actorDifficulty: 'rl',
            before: { current: 0, phase: 'roll', turnCount: 0, lastDice: 0, lastDice1: 0, lastDice2: 0, players: [] },
            chosenAction: { action: 0, label: 'ROLL1' },
            rollsUsed: [4],
            legalActions: [{ action: 0, label: 'ROLL1' }],
            after: { current: 0, phase: 'build', turnCount: 0, lastDice: 4, lastDice1: 4, lastDice2: 0, players: [] },
        })] },
        { trace: [normalizeTraceEntry({
            actorIndex: 0,
            actorDifficulty: 'rl',
            before: { current: 0, phase: 'roll', turnCount: 0, lastDice: 0, lastDice1: 0, lastDice2: 0, players: [] },
            chosenAction: { action: 0, label: 'ROLL1' },
            rollsUsed: [5],
            legalActions: [{ action: 0, label: 'ROLL1' }],
            after: { current: 0, phase: 'build', turnCount: 0, lastDice: 5, lastDice1: 5, lastDice2: 0, players: [] },
        })] },
    );
    assert.strictEqual(result.index, 0);
    assert.strictEqual(result.reason, 'trace entry mismatch');
});
