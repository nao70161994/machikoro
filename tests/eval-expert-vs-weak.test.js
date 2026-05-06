const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { runTest } = require('./helpers/test-utils');

const {
    DEFAULT_PROFILES,
    parseArgs,
    profilePlayers,
    profileWeight,
    summarize,
    toMarkdown,
    toText,
} = require(path.join(__dirname, '..', 'scripts', 'eval-expert-vs-weak.js'));

runTest('eval-expert-vs-weak parseArgs は既定値を返す', () => {
    const args = parseArgs([]);
    assert.strictEqual(args.games, 50);
    assert.strictEqual(args.seed, 1);
    assert.strictEqual(args.maxSteps, 5000);
    assert.strictEqual(args.format, 'text');
    assert.strictEqual(args.lite, true);
    assert.strictEqual(args.buildMode, 'ev');
    assert.strictEqual(args.diceMode, 'ev');
    assert.strictEqual(args.rerollMode, 'simple');
    assert.strictEqual(args.itMode, 'always');
    assert.strictEqual(args.tvMode, 'simple');
    assert.strictEqual(args.businessMode, 'simple');
    assert.strictEqual(args.cleaningMode, 'simple');
    assert.strictEqual(args.harborMode, 'simple');
    assert.strictEqual(args.moverMode, 'simple');
    assert.strictEqual(args.renovationMode, 'simple');
    assert.strictEqual(args.incomeCapMode, 'none');
    assert.strictEqual(args.comboMode, 'core');
    assert.strictEqual(args.comboWeight, 0.35);
    assert.strictEqual(args.buildTempoWeight, 0.05);
    assert.deepStrictEqual(args.profiles, DEFAULT_PROFILES);
});

runTest('eval-expert-vs-weak parseArgs は CLI 引数を解釈する', () => {
    const args = parseArgs([
        '--games', '30',
        '--seed', '9',
        '--max-steps', '7000',
        '--format', 'json',
        '--full',
        '--profile',
        '--profiles', 'duel,crowd',
        '--build-mode', 'random',
        '--dice-mode', 'random',
        '--reroll-mode', 'simple',
        '--it-mode', 'never',
        '--tv-mode', 'random',
        '--business-mode', 'random',
        '--cleaning-mode', 'random',
        '--harbor-mode', 'random',
        '--mover-mode', 'simple',
        '--renovation-mode', 'simple',
        '--income-cap-mode', 'soft30',
        '--combo-mode', 'unlock',
        '--combo-weight', '0.5',
        '--build-tempo-weight', '0.1',
    ]);
    assert.strictEqual(args.games, 30);
    assert.strictEqual(args.seed, 9);
    assert.strictEqual(args.maxSteps, 7000);
    assert.strictEqual(args.format, 'json');
    assert.strictEqual(args.lite, false);
    assert.strictEqual(args.profile, true);
    assert.strictEqual(args.buildMode, 'random');
    assert.strictEqual(args.diceMode, 'random');
    assert.strictEqual(args.rerollMode, 'simple');
    assert.strictEqual(args.itMode, 'never');
    assert.strictEqual(args.tvMode, 'random');
    assert.strictEqual(args.businessMode, 'random');
    assert.strictEqual(args.cleaningMode, 'random');
    assert.strictEqual(args.harborMode, 'random');
    assert.strictEqual(args.moverMode, 'simple');
    assert.strictEqual(args.renovationMode, 'simple');
    assert.strictEqual(args.incomeCapMode, 'soft30');
    assert.strictEqual(args.comboMode, 'unlock');
    assert.strictEqual(args.comboWeight, 0.5);
    assert.strictEqual(args.buildTempoWeight, 0.1);
    assert.deepStrictEqual(args.profiles, ['duel', 'crowd']);
});

runTest('eval-expert-vs-weak profilePlayers は既知プロファイルを返す', () => {
    assert.deepStrictEqual(profilePlayers('duel'), ['expert', 'weak']);
    assert.deepStrictEqual(profilePlayers('trio'), ['expert', 'weak', 'weak']);
    assert.deepStrictEqual(profilePlayers('crowd'), ['expert', 'weak', 'weak', 'weak']);
});

runTest('eval-expert-vs-weak profileWeight は重みを返す', () => {
    assert.strictEqual(profileWeight('duel'), 1);
    assert.strictEqual(profileWeight('trio'), 2);
    assert.strictEqual(profileWeight('crowd'), 3);
});

runTest('eval-expert-vs-weak summarize は重み付き勝率と最低勝率を返す', () => {
    const summary = summarize([
        { profile: 'duel', weight: 1, winRate: 0.8, perf: { totalMs: 10 } },
        { profile: 'crowd', weight: 3, winRate: 0.5, perf: { totalMs: 30 } },
    ]);
    assert.strictEqual(summary.profiles, 2);
    assert.ok(Math.abs(summary.weightedWinRate - 0.575) < 1e-9);
    assert.strictEqual(summary.minWinRate, 0.5);
    assert.strictEqual(summary.totalProfileMs, 40);
});

runTest('eval-expert-vs-weak formatter は主要値を含む', () => {
    const options = {
        games: 50,
        seed: 1,
        lite: true,
        fast: false,
        profile: true,
        buildMode: 'ev',
        diceMode: 'ev',
        rerollMode: 'simple',
        itMode: 'always',
        tvMode: 'simple',
        businessMode: 'simple',
        cleaningMode: 'simple',
        harborMode: 'simple',
        moverMode: 'simple',
        renovationMode: 'simple',
        incomeCapMode: 'none',
        comboMode: 'core',
        comboWeight: 0.35,
        buildTempoWeight: 0.05,
    };
    const entries = [
        {
            profile: 'crowd',
            players: ['expert', 'weak', 'weak', 'weak'],
            weight: 3,
            games: 50,
            expertWins: 35,
            winRate: 0.7,
            averageTurns: 42.3,
            exhausted: 1,
            seatWins: [20, 8, 4, 3],
            perf: {
                totalMs: 1234,
                avgMsPerGame: 24.68,
                avgMsPerTurn: 0.5,
                avgMsPerStep: 0.3,
                byPhase: { rollMs: 10, selectDiceMs: 20, rerollMs: 30, harborMs: 40, pendingMs: 50, buildMs: 60 },
                pendingBreakdown: { tvMs: 1, businessMs: 2, cleaningMs: 3, moverMs: 4, renovationMs: 5, itMs: 6, phaseAdvanceMs: 7 },
                pendingStats: {
                    tv: { count: 1, avgMs: 1, maxMs: 1 },
                    business: {
                        count: 2,
                        avgMs: 4.5,
                        maxMs: 8,
                        chooseMs: 5,
                        resolveMs: 4,
                        avgChooseMs: 2.5,
                        avgResolveMs: 2,
                        maxChooseMs: 4,
                        maxResolveMs: 3,
                        totalCandidatePairs: 11,
                        avgCandidatePairs: 5.5,
                        maxCandidatePairs: 7,
                    },
                    cleaning: { count: 1, avgMs: 3, maxMs: 3 },
                    mover: { count: 1, avgMs: 4, maxMs: 4 },
                    renovation: { count: 1, avgMs: 5, maxMs: 5 },
                    it: { count: 1, avgMs: 6, maxMs: 6 },
                    phaseAdvance: { count: 1, avgMs: 7, maxMs: 7 },
                },
            },
        },
    ];
    const summary = summarize(entries);
    const text = toText(entries, summary, options);
    const md = toMarkdown(entries, summary, options);
    assert.ok(text.includes('weightedWinRate=70.0%'));
    assert.ok(text.includes('buildMode=ev'));
    assert.ok(text.includes('diceMode=ev'));
    assert.ok(text.includes('rerollMode=simple'));
    assert.ok(text.includes('itMode=always'));
    assert.ok(text.includes('tvMode=simple'));
    assert.ok(text.includes('businessMode=simple'));
    assert.ok(text.includes('cleaningMode=simple'));
    assert.ok(text.includes('harborMode=simple'));
    assert.ok(text.includes('moverMode=simple'));
    assert.ok(text.includes('renovationMode=simple'));
    assert.ok(text.includes('incomeCapMode=none'));
    assert.ok(text.includes('comboMode=core'));
    assert.ok(text.includes('comboWeight=0.35'));
    assert.ok(text.includes('buildTempoWeight=0.05'));
    assert.ok(text.includes('totalProfileMs=1234.0ms'));
    assert.ok(text.includes('perf: total=1234.0ms'));
    assert.ok(text.includes('pendingStats: business count=2 avg=4.500ms max=8.0ms'));
    assert.ok(text.includes('businessSplit: chooseAvg=2.500ms resolveAvg=2.000ms chooseMax=4.0ms resolveMax=3.0ms pairsAvg=5.5 pairsMax=7'));
    assert.ok(text.includes('crowd: 35/50'));
    assert.ok(text.includes('players=expert,weak,weak,weak'));
    assert.ok(md.includes('- totalProfileMs: 1234.0ms'));
    assert.ok(md.includes('- buildMode: ev'));
    assert.ok(md.includes('- diceMode: ev'));
    assert.ok(md.includes('- rerollMode: simple'));
    assert.ok(md.includes('- itMode: always'));
    assert.ok(md.includes('- tvMode: simple'));
    assert.ok(md.includes('- businessMode: simple'));
    assert.ok(md.includes('- cleaningMode: simple'));
    assert.ok(md.includes('- harborMode: simple'));
    assert.ok(md.includes('- moverMode: simple'));
    assert.ok(md.includes('- renovationMode: simple'));
    assert.ok(md.includes('- incomeCapMode: none'));
    assert.ok(md.includes('- comboMode: core'));
    assert.ok(md.includes('- comboWeight: 0.35'));
    assert.ok(md.includes('- buildTempoWeight: 0.05'));
    assert.ok(md.includes('| profile | players | weight | winRate | seatWins |'));
    assert.ok(md.includes('| crowd | expert,weak,weak,weak | 3 | 70.0% | 20,8,4,3 | 42.3 | 1 |'));
});

runTest('eval-expert-vs-weak は live expert に v2simple preset を渡す', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'eval-expert-vs-weak.js'), 'utf8');
    assert.ok(source.includes("expertPreset: 'v2simple'"));
    assert.ok(source.includes("expertDiceMode: config.diceMode || 'ev'"));
    assert.ok(source.includes("expertRerollMode: config.rerollMode || 'simple'"));
    assert.ok(source.includes("expertBuildMode: config.buildMode || 'ev'"));
    assert.ok(source.includes("expertInvestMode: config.itMode || 'always'"));
    assert.ok(source.includes("expertTvMode: config.tvMode || 'simple'"));
    assert.ok(source.includes("expertBusinessMode: config.businessMode || 'simple'"));
    assert.ok(source.includes("expertCleaningMode: config.cleaningMode || 'simple'"));
    assert.ok(source.includes("expertHarborMode: config.harborMode || 'simple'"));
    assert.ok(source.includes("expertMoverMode: config.moverMode || 'simple'"));
    assert.ok(source.includes("expertRenovationMode: config.renovationMode || 'simple'"));
    assert.ok(source.includes("expertIncomeCapMode: config.incomeCapMode || 'none'"));
    assert.ok(source.includes("expertComboMode: config.comboMode || 'core'"));
    assert.ok(source.includes("expertComboWeight: Number.isFinite(config.comboWeight) ? config.comboWeight : 0.35"));
    assert.ok(source.includes("expertBuildTempoWeight: Number.isFinite(config.buildTempoWeight) ? config.buildTempoWeight : 0"));
    assert.ok(source.includes("buildMode: options.buildMode"));
    assert.ok(source.includes("diceMode: options.diceMode"));
    assert.ok(source.includes("rerollMode: options.rerollMode"));
    assert.ok(source.includes("itMode: options.itMode"));
    assert.ok(source.includes("tvMode: options.tvMode"));
    assert.ok(source.includes("businessMode: options.businessMode"));
    assert.ok(source.includes("cleaningMode: options.cleaningMode"));
    assert.ok(source.includes("harborMode: options.harborMode"));
    assert.ok(source.includes("moverMode: options.moverMode"));
    assert.ok(source.includes("renovationMode: options.renovationMode"));
    assert.ok(source.includes("incomeCapMode: options.incomeCapMode"));
});
