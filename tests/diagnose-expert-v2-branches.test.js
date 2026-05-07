const assert = require('assert');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    DEFAULT_PROFILES,
    createCounters,
    installBranchDiagnostics,
    parseArgs,
    runDiagnostics,
    toText,
} = require(path.join(__dirname, '..', 'scripts', 'diagnose-expert-v2-branches.js'));
const { loadRuntime } = require(path.join(__dirname, '..', 'scripts', 'selfplay.js'));

runTest('diagnose-expert-v2-branches parseArgs は既定値を返す', () => {
    const args = parseArgs([]);
    assert.strictEqual(args.games, 20);
    assert.strictEqual(args.seed, 1);
    assert.strictEqual(args.maxSteps, 5000);
    assert.strictEqual(args.format, 'text');
    assert.strictEqual(args.lite, true);
    assert.strictEqual(args.margin, 0.2);
    assert.deepStrictEqual(args.profiles, DEFAULT_PROFILES);
});

runTest('diagnose-expert-v2-branches parseArgs は CLI 引数を解釈する', () => {
    const args = parseArgs(['--games', '7', '--seed', '9', '--max-steps', '7000', '--format', 'json', '--full', '--profiles', 'duel,crowd', '--margin', '0.5']);
    assert.strictEqual(args.games, 7);
    assert.strictEqual(args.seed, 9);
    assert.strictEqual(args.maxSteps, 7000);
    assert.strictEqual(args.format, 'json');
    assert.strictEqual(args.lite, false);
    assert.strictEqual(args.margin, 0.5);
    assert.deepStrictEqual(args.profiles, ['duel', 'crowd']);
});

runTest('diagnose-expert-v2-branches installBranchDiagnostics は prototype を戻す', () => {
    const runtime = loadRuntime({ includeRL: false });
    const original = runtime.CPU.prototype.chooseDiceCount;
    const counters = createCounters();
    const uninstall = installBranchDiagnostics(runtime, counters);
    assert.notStrictEqual(runtime.CPU.prototype.chooseDiceCount, original);
    uninstall();
    assert.strictEqual(runtime.CPU.prototype.chooseDiceCount, original);
});

runTest('diagnose-expert-v2-branches runDiagnostics は profile ごとのカウンタを返す', () => {
    const report = runDiagnostics({ games: 1, seed: 1, maxSteps: 5000, lite: true, fast: false, profiles: ['duel'], margin: 0.2 });
    assert.strictEqual(report.entries.length, 1);
    assert.strictEqual(report.entries[0].profile, 'duel');
    assert.ok(typeof report.entries[0].counters.diceDecisions === 'number');
    assert.ok(typeof report.totals.rerollMarginWindow === 'number');
});

runTest('diagnose-expert-v2-branches toText は主要カウンタを含む', () => {
    const report = {
        options: { games: 1, seed: 1, lite: true, fast: false, margin: 0.2 },
        summary: { weightedWinRate: 0.5, minWinRate: 0.5 },
        totals: Object.assign(createCounters(), {
            diceDecisions: 2,
            diceTie: 1,
            diceNearTie: 1,
            rerollDecisions: 3,
            rerollMarginWindow: 1,
            harborDecisions: 4,
            harborLowRollImproves: 1,
            tvDecisions: 5,
            tvStealTie: 2,
        }),
        entries: [{
            profile: 'duel',
            winRate: 0.5,
            averageTurns: 40,
            exhausted: 0,
            counters: Object.assign(createCounters(), {
                diceDecisions: 2,
                diceTie: 1,
                rerollDecisions: 3,
                rerollMarginWindow: 1,
                harborDecisions: 4,
                harborLowRollImproves: 1,
                tvDecisions: 5,
                tvStealTie: 2,
            }),
        }],
    };
    const text = toText(report);
    assert.ok(text.includes('diceTie=1/2'));
    assert.ok(text.includes('rerollMarginWindow=1/3'));
    assert.ok(text.includes('harborLowRollImproves=1/4'));
    assert.ok(text.includes('tvStealTie=2/5'));
});
