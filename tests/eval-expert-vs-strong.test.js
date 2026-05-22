const assert = require('assert');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    DEFAULT_PROFILES,
    parseArgs,
    profilePlayers,
    profileWeight,
    resolveExpertTuning,
    summarize,
    toMarkdown,
    toText,
} = require(path.join(__dirname, '..', 'scripts', 'eval-expert-vs-strong.js'));

runTest('eval-expert-vs-strong parseArgs は既定値を返す', () => {
    const args = parseArgs([]);
    assert.strictEqual(args.games, 50);
    assert.strictEqual(args.seed, 1);
    assert.strictEqual(args.maxSteps, 5000);
    assert.strictEqual(args.format, 'text');
    assert.strictEqual(args.lite, true);
    assert.strictEqual(args.buildMode, 'ev');
    assert.strictEqual(args.diceMode, 'strongCrowdThreshold');
    assert.strictEqual(args.rerollMode, 'simple');
    assert.strictEqual(args.rerollMargin, 0);
    assert.strictEqual(args.itMode, 'always');
    assert.strictEqual(args.tvMode, 'simple');
    assert.strictEqual(args.businessMode, 'simple');
    assert.strictEqual(args.cleaningMode, 'simple');
    assert.strictEqual(args.harborMode, 'simple');
    assert.strictEqual(args.harborMargin, 0);
    assert.strictEqual(args.moverMode, 'simple');
    assert.strictEqual(args.renovationMode, 'simple');
    assert.strictEqual(args.incomeCapMode, 'none');
    assert.strictEqual(args.comboMode, 'core');
    assert.strictEqual(args.comboWeight, 0.35);
    assert.strictEqual(args.buildTempoWeight, 0.03);
    assert.strictEqual(args.rollRiskMode, 'none');
    assert.strictEqual(args.rollRedRiskWeight, 0);
    assert.strictEqual(args.airportSkipMode, 'whenNoLandmark');
    assert.deepStrictEqual(args.profiles, DEFAULT_PROFILES);
});

runTest('eval-expert-vs-strong parseArgs は expert-preset 値省略時も v2simple を使う', () => {
    const args = parseArgs(['--expert-preset']);
    assert.strictEqual(args.expertPreset, 'v2simple');
});

runTest('eval-expert-vs-strong parseArgs は v2simple mode 値省略時も live 既定値を使う', () => {
    assert.strictEqual(parseArgs(['--combo-mode']).comboMode, 'core');
    assert.strictEqual(parseArgs(['--build-tempo-weight']).buildTempoWeight, 0.03);
});

runTest('eval-expert-vs-strong parseArgs は CLI 引数を解釈する', () => {
    const args = parseArgs([
        '--games', '30',
        '--seed', '9',
        '--max-steps', '7000',
        '--format', 'json',
        '--full',
        '--expert-preset', 'rush',
        '--tuning-candidate', 'rush:skipPenaltyx1.25',
        '--build-mode', 'random',
        '--dice-mode', 'random',
        '--reroll-mode', 'random',
        '--reroll-margin', '0.4',
        '--it-mode', 'never',
        '--tv-mode', 'random',
        '--business-mode', 'random',
        '--cleaning-mode', 'random',
        '--harbor-mode', 'random',
        '--harbor-margin', '0.6',
        '--mover-mode', 'random',
        '--renovation-mode', 'random',
        '--income-cap-mode', 'hard40',
        '--combo-mode', 'unlock',
        '--combo-weight', '0.5',
        '--build-tempo-weight', '0.1',
        '--roll-risk-mode', 'red',
        '--roll-red-risk-weight', '0.4',
        '--airport-skip-mode', 'none',
        '--profiles', 'duel,crowd',
    ]);
    assert.strictEqual(args.games, 30);
    assert.strictEqual(args.seed, 9);
    assert.strictEqual(args.maxSteps, 7000);
    assert.strictEqual(args.format, 'json');
    assert.strictEqual(args.lite, false);
    assert.strictEqual(args.expertPreset, 'rush');
    assert.strictEqual(args.tuningCandidate, 'rush:skipPenaltyx1.25');
    assert.strictEqual(args.buildMode, 'random');
    assert.strictEqual(args.diceMode, 'random');
    assert.strictEqual(args.rerollMode, 'random');
    assert.strictEqual(args.rerollMargin, 0.4);
    assert.strictEqual(args.itMode, 'never');
    assert.strictEqual(args.tvMode, 'random');
    assert.strictEqual(args.businessMode, 'random');
    assert.strictEqual(args.cleaningMode, 'random');
    assert.strictEqual(args.harborMode, 'random');
    assert.strictEqual(args.harborMargin, 0.6);
    assert.strictEqual(args.moverMode, 'random');
    assert.strictEqual(args.renovationMode, 'random');
    assert.strictEqual(args.incomeCapMode, 'hard40');
    assert.strictEqual(args.comboMode, 'unlock');
    assert.strictEqual(args.comboWeight, 0.5);
    assert.strictEqual(args.buildTempoWeight, 0.1);
    assert.strictEqual(args.rollRiskMode, 'red');
    assert.strictEqual(args.rollRedRiskWeight, 0.4);
    assert.strictEqual(args.airportSkipMode, 'none');
    assert.deepStrictEqual(args.profiles, ['duel', 'crowd']);
});

runTest('eval-expert-vs-strong parseArgs は数値 CLI の 0 指定を保持する', () => {
    const args = parseArgs([
        '--games', '0',
        '--seed', '0',
        '--max-steps', '0',
        '--reroll-margin', '0',
        '--harbor-margin', '0',
        '--combo-weight', '0',
        '--build-tempo-weight', '0',
        '--roll-red-risk-weight', '0',
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
    assert.strictEqual(args.rollRedRiskWeight, 0);
    assert.strictEqual(args.landmarkCardMargin, 0);
    assert.strictEqual(args.harborLandmarkBaseBonus, 0);
    assert.strictEqual(args.landmarkProgressRemaining, 0);
    assert.strictEqual(args.landmarkCostWeight, 0);
});

runTest('eval-expert-vs-strong profilePlayers は既知プロファイルを返す', () => {
    assert.deepStrictEqual(profilePlayers('duel'), ['expert', 'strong']);
    assert.deepStrictEqual(profilePlayers('trio'), ['expert', 'strong', 'strong']);
    assert.deepStrictEqual(profilePlayers('crowd'), ['expert', 'strong', 'strong', 'normal']);
    assert.deepStrictEqual(profilePlayers('allStrong4'), ['expert', 'strong', 'strong', 'strong']);
});

runTest('eval-expert-vs-strong profileWeight は重みを返す', () => {
    assert.strictEqual(profileWeight('duel'), 1);
    assert.strictEqual(profileWeight('trio'), 2);
    assert.strictEqual(profileWeight('crowd'), 3);
    assert.strictEqual(profileWeight('allStrong4'), 4);
});

runTest('eval-expert-vs-strong summarize は重み付き勝率と最低勝率を返す', () => {
    const summary = summarize([
        { profile: 'duel', weight: 1, winRate: 0.8 },
        { profile: 'crowd', weight: 3, winRate: 0.5 },
    ]);
    assert.strictEqual(summary.profiles, 2);
    assert.ok(Math.abs(summary.weightedWinRate - 0.575) < 1e-9);
    assert.strictEqual(summary.minWinRate, 0.5);
});

runTest('eval-expert-vs-strong resolveExpertTuning は候補 tuning を返す', () => {
    const tuning = resolveExpertTuning({
        expertPreset: 'v2simple',
        tuningCandidate: 'v2simple:coinWeightx1.1',
    });
    assert.ok(tuning);
    assert.strictEqual(typeof tuning.coinWeight, 'number');
});

runTest('eval-expert-vs-strong formatter は主要値を含む', () => {
    const options = {
        games: 50,
        seed: 1,
        lite: true,
        fast: false,
        expertPreset: 'v2simple',
        tuningCandidate: 'default:skipPenaltyx1.25',
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
        buildTempoWeight: 0.03,
        rollRiskMode: 'red',
        rollRedRiskWeight: 0.4,
        airportSkipMode: 'whenNoLandmark',
    };
    const entries = [
        {
            profile: 'duel',
            players: ['expert', 'strong'],
            weight: 1,
            games: 50,
            expertWins: 35,
            winRate: 0.7,
            averageTurns: 42.3,
            exhausted: 1,
            seatWins: [20, 15],
        },
    ];
    const summary = summarize(entries);
    const text = toText(entries, summary, options);
    const md = toMarkdown(entries, summary, options);
    assert.ok(text.includes('weightedWinRate=70.0%'));
    assert.ok(text.includes('buildMode=ev'));
    assert.ok(text.includes('diceMode=ev'));
    assert.ok(text.includes('rerollMode=simple'));
    assert.ok(text.includes('incomeCapMode=none'));
    assert.ok(text.includes('comboMode=core'));
    assert.ok(text.includes('comboWeight=0.35'));
    assert.ok(text.includes('buildTempoWeight=0.03'));
    assert.ok(text.includes('rollRiskMode=red'));
    assert.ok(text.includes('rollRedRiskWeight=0.4'));
    assert.ok(text.includes('airportSkipMode=whenNoLandmark'));
    assert.ok(text.includes('tuningCandidate=default:skipPenaltyx1.25'));
    assert.ok(text.includes('duel: 35/50'));
    assert.ok(text.includes('seatWins=20,15'));
    assert.ok(md.includes('| profile | players | weight | winRate | seatWins |'));
    assert.ok(md.includes('- buildMode: ev'));
    assert.ok(md.includes('- diceMode: ev'));
    assert.ok(md.includes('- rerollMode: simple'));
    assert.ok(md.includes('- incomeCapMode: none'));
    assert.ok(md.includes('- comboMode: core'));
    assert.ok(md.includes('- comboWeight: 0.35'));
    assert.ok(md.includes('- buildTempoWeight: 0.03'));
    assert.ok(md.includes('- rollRiskMode: red'));
    assert.ok(md.includes('- rollRedRiskWeight: 0.4'));
    assert.ok(md.includes('- airportSkipMode: whenNoLandmark'));
    assert.ok(md.includes('- tuningCandidate: default:skipPenaltyx1.25'));
    assert.ok(md.includes('| duel | expert,strong | 1 | 70.0% | 20,15 | 42.3 | 1 |'));
});
