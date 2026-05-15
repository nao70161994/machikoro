const assert = require('assert');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    evaluatePack,
    parseArgs,
    profilesForSuite,
    shouldRunSuite,
    toMarkdown,
    toText,
} = require(path.join(__dirname, '..', 'scripts', 'eval-expert-v2-benchmark-pack.js'));
const { loadRuntime } = require(path.join(__dirname, '..', 'scripts', 'selfplay.js'));

runTest('eval-expert-v2-benchmark-pack parseArgs は既定値を返す', () => {
    const args = parseArgs([]);
    assert.strictEqual(args.games, 50);
    assert.strictEqual(args.seed, 1);
    assert.strictEqual(args.maxSteps, 5000);
    assert.strictEqual(args.format, 'text');
    assert.strictEqual(args.lite, true);
    assert.strictEqual(args.expertPreset, 'v2simple');
    assert.strictEqual(args.buildMode, 'ev');
    assert.strictEqual(args.diceMode, 'strongCrowdThreshold');
    assert.strictEqual(args.rerollMode, 'simple');
    assert.strictEqual(args.rerollMargin, 0);
    assert.strictEqual(args.itMode, 'always');
    assert.strictEqual(args.tvMode, 'simple');
    assert.strictEqual(args.businessMode, 'harmfulGift');
    assert.strictEqual(args.cleaningMode, 'simple');
    assert.strictEqual(args.harborMode, 'simple');
    assert.strictEqual(args.harborMargin, 0);
    assert.strictEqual(args.moverMode, 'simple');
    assert.strictEqual(args.renovationMode, 'simple');
    assert.strictEqual(args.incomeCapMode, 'none');
    assert.strictEqual(args.comboMode, 'core');
    assert.strictEqual(args.comboWeight, 0.35);
    assert.strictEqual(args.buildTempoWeight, 0.05);
    assert.strictEqual(args.airportSkipMode, 'whenNoLandmark');
    assert.strictEqual(args.suite, 'all');
    assert.deepStrictEqual(args.profiles, []);
});

runTest('eval-expert-v2-benchmark-pack parseArgs は CLI 引数を解釈する', () => {
    const args = parseArgs(['--games', '3', '--seed', '7', '--max-steps', '900', '--format', 'markdown', '--full', '--expert-preset', 'default', '--build-mode', 'random', '--dice-mode', 'random', '--reroll-mode', 'random', '--reroll-margin', '0.4', '--it-mode', 'never', '--tv-mode', 'random', '--business-mode', 'harmfulGift', '--cleaning-mode', 'random', '--harbor-mode', 'random', '--harbor-margin', '0.6', '--mover-mode', 'random', '--renovation-mode', 'random', '--income-cap-mode', 'soft30', '--combo-mode', 'unlock', '--combo-weight', '0.5', '--build-tempo-weight', '0.1', '--airport-skip-mode', 'none', '--suite', 'strong', '--profiles', 'crowd,allStrong4']);
    assert.strictEqual(args.games, 3);
    assert.strictEqual(args.seed, 7);
    assert.strictEqual(args.maxSteps, 900);
    assert.strictEqual(args.format, 'markdown');
    assert.strictEqual(args.lite, false);
    assert.strictEqual(args.expertPreset, 'default');
    assert.strictEqual(args.buildMode, 'random');
    assert.strictEqual(args.diceMode, 'random');
    assert.strictEqual(args.rerollMode, 'random');
    assert.strictEqual(args.rerollMargin, 0.4);
    assert.strictEqual(args.itMode, 'never');
    assert.strictEqual(args.tvMode, 'random');
    assert.strictEqual(args.businessMode, 'harmfulGift');
    assert.strictEqual(args.cleaningMode, 'random');
    assert.strictEqual(args.harborMode, 'random');
    assert.strictEqual(args.harborMargin, 0.6);
    assert.strictEqual(args.moverMode, 'random');
    assert.strictEqual(args.renovationMode, 'random');
    assert.strictEqual(args.incomeCapMode, 'soft30');
    assert.strictEqual(args.comboMode, 'unlock');
    assert.strictEqual(args.comboWeight, 0.5);
    assert.strictEqual(args.buildTempoWeight, 0.1);
    assert.strictEqual(args.airportSkipMode, 'none');
    assert.strictEqual(args.suite, 'strong');
    assert.deepStrictEqual(args.profiles, ['crowd', 'allStrong4']);
});

runTest('eval-expert-v2-benchmark-pack parseArgs は数値 CLI の 0 指定を保持する', () => {
    const args = parseArgs([
        '--games', '0',
        '--seed', '0',
        '--max-steps', '0',
        '--reroll-margin', '0',
        '--harbor-margin', '0',
        '--combo-weight', '0',
        '--build-tempo-weight', '0',
        '--landmark-card-margin', '0',
        '--harbor-landmark-base-bonus', '0',
        '--landmark-progress-remaining', '0',
        '--landmark-cost-weight', '0',
    ]);
    assert.strictEqual(args.games, 0);
    assert.strictEqual(args.seed, 0);
    assert.strictEqual(args.maxSteps, 0);
    assert.strictEqual(args.rerollMargin, 0);
    assert.strictEqual(args.harborMargin, 0);
    assert.strictEqual(args.comboWeight, 0);
    assert.strictEqual(args.buildTempoWeight, 0);
    assert.strictEqual(args.landmarkCardMargin, 0);
    assert.strictEqual(args.harborLandmarkBaseBonus, 0);
    assert.strictEqual(args.landmarkProgressRemaining, 0);
    assert.strictEqual(args.landmarkCostWeight, 0);
});

runTest('eval-expert-v2-benchmark-pack suite/profile helper は対象を絞る', () => {
    assert.strictEqual(shouldRunSuite({ suite: 'all' }, 'normal'), true);
    assert.strictEqual(shouldRunSuite({ suite: 'strong' }, 'normal'), false);
    assert.deepStrictEqual(profilesForSuite({ profiles: [] }, 'normal'), ['crowd']);
    assert.deepStrictEqual(profilesForSuite({ profiles: [] }, 'strong'), ['duel', 'trio', 'crowd', 'allStrong4']);
    assert.deepStrictEqual(profilesForSuite({ profiles: ['crowd', 'allStrong4'] }, 'strong'), ['crowd', 'allStrong4']);
});

runTest('eval-expert-v2-benchmark-pack evaluatePack は normal/strong の基準を返す', () => {
    const report = evaluatePack({ games: 1, seed: 1, maxSteps: 5000, lite: true, fast: false, expertPreset: 'v2simple', businessMode: 'harmfulGift' });
    assert.strictEqual(report.cpuFamily, 'v2simple-rule-based');
    assert.strictEqual(report.comparisonScope, 'expert-v2-benchmark-pack');
    assert.strictEqual(report.normal.options.diceMode, 'strongCrowdThreshold');
    assert.strictEqual(report.normal.options.buildMode, 'ev');
    assert.strictEqual(report.strong.options.rerollMode, 'simple');
    assert.strictEqual(report.normal.options.itMode, 'always');
    assert.strictEqual(report.strong.options.tvMode, 'simple');
    assert.strictEqual(report.normal.options.businessMode, 'harmfulGift');
    assert.strictEqual(report.strong.options.businessMode, 'harmfulGift');
    assert.strictEqual(report.normal.options.cleaningMode, 'simple');
    assert.strictEqual(report.strong.options.harborMode, 'simple');
    assert.strictEqual(report.normal.options.moverMode, 'simple');
    assert.strictEqual(report.strong.options.renovationMode, 'simple');
    assert.strictEqual(report.normal.options.incomeCapMode, 'none');
    assert.strictEqual(report.strong.options.comboMode, 'core');
    assert.strictEqual(report.normal.options.comboWeight, 0.35);
    assert.strictEqual(report.strong.options.buildTempoWeight, 0.05);
    assert.strictEqual(report.normal.summary.executed, true);
    assert.strictEqual(report.normal.summary.skipped, false);
    assert.strictEqual(report.strong.summary.executed, true);
    assert.strictEqual(report.strong.summary.skipped, false);
    assert.strictEqual(report.normal.entries.length, 1);
    assert.strictEqual(report.normal.entries[0].profile, 'crowd');
    assert.strictEqual(report.strong.entries.length, 4);
    assert.strictEqual(report.strong.entries[3].profile, 'allStrong4');
    assert.ok(typeof report.strong.summary.weightedWinRate === 'number');
});

runTest('eval-expert-v2-benchmark-pack evaluatePack は suite/profiles で絞る', () => {
    const report = evaluatePack({ games: 1, seed: 1, maxSteps: 5000, lite: true, fast: false, expertPreset: 'v2simple', businessMode: 'simple', suite: 'strong', profiles: ['crowd'] });
    assert.strictEqual(report.normal.entries.length, 0);
    assert.strictEqual(report.normal.summary.executed, false);
    assert.strictEqual(report.normal.summary.skipped, true);
    assert.strictEqual(report.normal.summary.profiles, 0);
    assert.strictEqual(report.strong.entries.length, 1);
    assert.strictEqual(report.strong.summary.executed, true);
    assert.strictEqual(report.strong.summary.skipped, false);
    assert.strictEqual(report.strong.entries[0].profile, 'crowd');
});

runTest('eval-expert-v2-benchmark-pack evaluatePack は runtime を report options に出さない', () => {
    const runtime = loadRuntime({ includeRL: false });
    const report = evaluatePack({ runtime, games: 1, seed: 1, maxSteps: 5000, lite: true, fast: false, expertPreset: 'v2simple', businessMode: 'simple', suite: 'strong', profiles: ['duel'] });
    assert.strictEqual(report.options.runtime, undefined);
    assert.strictEqual(report.normal.options.runtime, undefined);
    assert.strictEqual(report.strong.options.runtime, undefined);
    assert.ok(!JSON.stringify(report).includes('__evalExpertVsNormalFast'));
});

runTest('eval-expert-v2-benchmark-pack evaluatePack は未実行 strong suite を skipped にする', () => {
    const report = evaluatePack({ games: 1, seed: 1, maxSteps: 5000, lite: true, fast: false, expertPreset: 'v2simple', businessMode: 'simple', suite: 'normal', profiles: ['crowd'] });
    assert.strictEqual(report.normal.entries.length, 1);
    assert.strictEqual(report.normal.summary.executed, true);
    assert.strictEqual(report.normal.summary.skipped, false);
    assert.strictEqual(report.strong.entries.length, 0);
    assert.strictEqual(report.strong.summary.executed, false);
    assert.strictEqual(report.strong.summary.skipped, true);
});

runTest('eval-expert-v2-benchmark-pack toText/toMarkdown は概要を出力する', () => {
    const report = {
        options: { games: 2, seed: 1, lite: true, fast: false, expertPreset: 'v2simple', buildMode: 'ev', diceMode: 'ev', rerollMode: 'simple', itMode: 'always', tvMode: 'simple', businessMode: 'harmfulGift', cleaningMode: 'simple', harborMode: 'simple', moverMode: 'simple', renovationMode: 'simple', incomeCapMode: 'none', comboMode: 'core', comboWeight: 0.35, buildTempoWeight: 0.05, airportSkipMode: 'whenNoLandmark', suite: 'all', profiles: [] },
        normal: {
            summary: { weightedWinRate: 0.5, minWinRate: 0.5 },
            entries: [{ profile: 'crowd', players: ['expert', 'normal', 'normal', 'normal'], expertWins: 1, games: 2, winRate: 0.5, averageTurns: 40, exhausted: 0 }],
        },
        strong: {
            summary: { weightedWinRate: 0.4, minWinRate: 0.25 },
            entries: [{ profile: 'allStrong4', players: ['expert', 'strong', 'strong', 'strong'], expertWins: 1, games: 2, winRate: 0.5, averageTurns: 50, exhausted: 0 }],
        },
    };
    assert.ok(toText(report).includes('normalCrowd=50.0% strongWeighted=40.0% strongMin=25.0%'));
    assert.ok(toText(report).includes('buildMode=ev'));
    assert.ok(toText(report).includes('diceMode=ev'));
    assert.ok(toText(report).includes('rerollMode=simple'));
    assert.ok(toText(report).includes('itMode=always'));
    assert.ok(toText(report).includes('tvMode=simple'));
    assert.ok(toText(report).includes('businessMode=harmfulGift'));
    assert.ok(toText(report).includes('cleaningMode=simple'));
    assert.ok(toText(report).includes('harborMode=simple'));
    assert.ok(toText(report).includes('moverMode=simple'));
    assert.ok(toText(report).includes('renovationMode=simple'));
    assert.ok(toText(report).includes('incomeCapMode=none'));
    assert.ok(toText(report).includes('comboMode=core'));
    assert.ok(toText(report).includes('comboWeight=0.35'));
    assert.ok(toText(report).includes('buildTempoWeight=0.05'));
    assert.ok(toText(report).includes('airportSkipMode=whenNoLandmark'));
    assert.ok(toText(report).includes('suite=all profiles=default'));
    assert.ok(toText(report).includes('cpuFamily=v2simple-rule-based comparisonScope=expert-v2-benchmark-pack'));
    assert.ok(toMarkdown(report).includes('- cpuFamily: v2simple-rule-based'));
    assert.ok(toMarkdown(report).includes('- buildMode: ev'));
    assert.ok(toMarkdown(report).includes('- diceMode: ev'));
    assert.ok(toMarkdown(report).includes('- rerollMode: simple'));
    assert.ok(toMarkdown(report).includes('- itMode: always'));
    assert.ok(toMarkdown(report).includes('- tvMode: simple'));
    assert.ok(toMarkdown(report).includes('- businessMode: harmfulGift'));
    assert.ok(toMarkdown(report).includes('- cleaningMode: simple'));
    assert.ok(toMarkdown(report).includes('- harborMode: simple'));
    assert.ok(toMarkdown(report).includes('- moverMode: simple'));
    assert.ok(toMarkdown(report).includes('- renovationMode: simple'));
    assert.ok(toMarkdown(report).includes('- incomeCapMode: none'));
    assert.ok(toMarkdown(report).includes('- comboMode: core'));
    assert.ok(toMarkdown(report).includes('- comboWeight: 0.35'));
    assert.ok(toMarkdown(report).includes('- buildTempoWeight: 0.05'));
    assert.ok(toMarkdown(report).includes('- airportSkipMode: whenNoLandmark'));
    assert.ok(toMarkdown(report).includes('- suite: all'));
    assert.ok(toMarkdown(report).includes('| strong | allStrong4 | expert,strong,strong,strong | 50.0% | 50.0 | 0 |'));
});

runTest('eval-expert-v2-benchmark-pack toText/toMarkdown は未実行 suite を n/a にする', () => {
    const report = {
        options: { games: 2, seed: 1, lite: true, fast: false, expertPreset: 'v2simple', businessMode: 'simple', suite: 'strong', profiles: ['crowd'] },
        normal: {
            summary: { weightedWinRate: 0, minWinRate: 0, profiles: 0 },
            entries: [],
        },
        strong: {
            summary: { weightedWinRate: 0.5, minWinRate: 0.5 },
            entries: [{ profile: 'crowd', players: ['expert', 'strong', 'strong', 'normal'], expertWins: 1, games: 2, winRate: 0.5, averageTurns: 50, exhausted: 0 }],
        },
    };
    assert.ok(toText(report).includes('normalCrowd=n/a strongWeighted=50.0% strongMin=50.0%'));
    assert.ok(!toText(report).includes('normal:'));
    assert.ok(toMarkdown(report).includes('- normalCrowd: n/a'));
});
