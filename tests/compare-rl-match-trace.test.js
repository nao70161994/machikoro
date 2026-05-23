const assert = require('assert');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    buildDeterministicRolls,
    normalizePendingActions,
    normalizeState,
    normalizeTraceEntry,
    compareTraceEntries,
    printComparison,
} = require(path.join(__dirname, '..', 'scripts', 'compare-rl-match-trace.js'));
const {
    createShopStock,
    loadRuntime,
} = require(path.join(__dirname, '..', 'scripts', 'selfplay.js'));

runTest('compare rl match trace: parseArgs は CLI 引数を解釈する', () => {
    const args = parseArgs([
        '--python-model', 'a/best_model',
        '--js-model', 'a/best_model.browser.json',
        '--opponent', 'normal',
        '--lineup', 'rl,weak,normal,strong',
        '--seed', '7',
        '--max-steps', '120',
        '--rl-seat', 'second',
        '--rolls', '1,6,3',
        '--cpu-opponent-impl', 'js-oracle',
    ]);
    assert.strictEqual(args.pythonModel, 'a/best_model');
    assert.strictEqual(args.jsModel, 'a/best_model.browser.json');
    assert.strictEqual(args.opponent, 'normal');
    assert.deepStrictEqual(args.lineup, ['rl', 'weak', 'normal', 'strong']);
    assert.strictEqual(args.seed, 7);
    assert.strictEqual(args.maxSteps, 120);
    assert.strictEqual(args.rlSeat, 'second');
    assert.deepStrictEqual(args.rolls, [1, 6, 3]);
    assert.strictEqual(args.cpuOpponentImpl, 'js-oracle');
});

runTest('compare rl match trace: parseArgs は seed/maxSteps の 0 指定を保持する', () => {
    const args = parseArgs(['--seed', '0', '--max-steps', '0']);

    assert.strictEqual(args.seed, 0);
    assert.strictEqual(args.maxSteps, 0);
});

runTest('compare rl match trace: buildDeterministicRolls は seed/maxSteps から固定ロール列を作る', () => {
    const first = buildDeterministicRolls(3, 10);
    const second = buildDeterministicRolls(3, 10);
    assert.strictEqual(first.length, 40);
    assert.deepStrictEqual(first, second);
    assert.ok(first.every(value => value >= 1 && value <= 6));
});

runTest('compare rl match trace: JS trace 初期在庫は7〜10人の大施設を人数分にする', () => {
    const runtime = loadRuntime();
    for (const playerCount of [7, 10]) {
        const stock = createShopStock(runtime.CARDS, playerCount, runtime);
        assert.strictEqual(stock['テレビ局'], playerCount);
        assert.strictEqual(stock['麦畑'], 6);
    }
});

runTest('compare rl match trace: normalizePendingActions は queue 順序を保持して揃える', () => {
    assert.deepStrictEqual(
        normalizePendingActions({
            pendingActions: [
                { field: 'pendingBusiness', action: 'resolveBusiness' },
                { field: 'pendingTV', action: 'resolveTV' },
            ],
        }),
        [
            { field: 'pendingBusiness', action: 'resolveBusiness' },
            { field: 'pendingTV', action: 'resolveTV' },
        ],
    );
    assert.deepStrictEqual(
        normalizePendingActions({ pending_action_queue: ['pendingMover', 'pendingCleaning'] }),
        [
            { field: 'pendingMover', action: 'resolveMover' },
            { field: 'pendingCleaning', action: 'resolveCleaning' },
        ],
    );
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
        pendingBusiness: 1,
        pendingActions: [{ field: 'pendingBusiness', action: 'resolveBusiness' }],
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
        pendingBusiness: 1,
        pendingActions: [{ field: 'pendingBusiness', action: 'resolveBusiness' }],
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingIT: false,
        players: [{ coins: 5, cards: { '麦畑': 1 }, dormantCards: {}, landmarks: {} }],
    });
    assert.deepStrictEqual(js, py);
});

runTest('compare rl match trace: normalizeTraceEntry は対象プレイヤー差分を保持する', () => {
    const normalized = normalizeTraceEntry({
        actorIndex: 0,
        actorDifficulty: 'rl',
        before: { current: 0, phase: 'pending', turnCount: 1, players: [] },
        chosenAction: { action: 8, label: 'TV_TARGET:p3', targetIndex: 2 },
        legalActions: [{ action: 8, label: 'TV_TARGET' }],
        after: { current: 0, phase: 'build', turnCount: 1, players: [] },
    });

    assert.strictEqual(normalized.chosenAction.action, 8);
    assert.strictEqual(normalized.chosenAction.label, '');
    assert.strictEqual(normalized.chosenAction.targetIndex, 2);
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

runTest('compare rl match trace: CLI comparison は mismatch で失敗exit用コードを返す', () => {
    const originalLog = console.log;
    const lines = [];
    console.log = message => lines.push(String(message));
    try {
        const ok = printComparison({ pythonTrace: { trace: [{}] }, jsTrace: { trace: [{}] }, mismatch: null });
        assert.strictEqual(ok, 0);
        const failed = printComparison({
            pythonTrace: { trace: [{}] },
            jsTrace: { trace: [{}] },
            mismatch: { index: 0, reason: 'trace entry mismatch', python: {}, js: {} },
        });
        assert.strictEqual(failed, 1);
    } finally {
        console.log = originalLog;
    }
    assert.ok(lines.some(line => line.includes('trace mismatch at step 0')));
});
