const assert = require('assert');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const { parseArgs, buildCandidateTunings, enumerateProfileLeaderCombos, evaluatePerProfileProposals, evaluateProposalAgainstBase, formatPresetObject, formatProfilePresetMap, profilePlayers, proposePerProfilePresets, proposePresetFromCombo, proposePresetFromProfiles, rankProposalsFromProfiles, resetTuneExpertDeps, runFinalistPlayoff, selectWinningFinalists, setTuneExpertDeps, tuneExpert, tuneExpertProfiles } = require(path.join(__dirname, '..', 'scripts', 'tune-expert.js'));
const { loadRuntime } = require(path.join(__dirname, '..', 'scripts', 'selfplay.js'));

function withFakeRunSeries(fn) {
    setTuneExpertDeps({
        loadRuntime,
        runSeries(options = {}) {
            const players = (options.players || ['expert', 'strong']).slice();
            const games = options.games || 2;
            const tuning = options.expertTuning || {};
            const lookahead = tuning.lookaheadWeight || 0;
            const late = tuning.lateProgressBonus || 0;
            const spamPenalty = tuning.lowValueSpamPenalty || 0;
            const isCrowd = players.length >= 4;
            const expertWins = Math.max(0, Math.min(games,
                isCrowd
                    ? 1 + (late >= 9 ? 1 : 0) + (spamPenalty >= 5 ? 1 : 0)
                    : 1 + (lookahead >= 0.75 ? 1 : 0) + (spamPenalty <= 5.1 ? 1 : 0)
            ));
            return {
                games,
                players,
                wins: Object.fromEntries(players.map((player, index) => [player, index === 0 ? expertWins : (games - expertWins)])),
                averageTurns: isCrowd ? 26 - expertWins : 18 - expertWins,
                exhausted: 0,
                seatWins: players.map((_, index) => index === 0 ? expertWins : 0),
            };
        },
    });
    try {
        fn();
    } finally {
        resetTuneExpertDeps();
    }
}

runTest('parseArgs は tune-expert CLI 引数を解釈する', () => {
    const args = parseArgs(['--games', '6', '--seed', '9', '--max-steps', '7000', '--base-preset', 'rush', '--top', '3', '--format', 'json', '--emit-preset', '--profiles', 'duel,crowd', '--propose-preset', 'hybridRush', '--evaluate-proposal', '--proposal-depth', '2', '--finalist-count', '2', '--finalist-games', '12', '--emit-winners', '--emit-profile-presets', 'expert', 'strong']);
    assert.strictEqual(args.games, 6);
    assert.strictEqual(args.seed, 9);
    assert.strictEqual(args.maxSteps, 7000);
    assert.strictEqual(args.basePreset, 'rush');
    assert.strictEqual(args.top, 3);
    assert.strictEqual(args.format, 'json');
    assert.strictEqual(args.emitPreset, true);
    assert.deepStrictEqual(args.profiles, ['duel', 'crowd']);
    assert.strictEqual(args.proposePreset, 'hybridRush');
    assert.strictEqual(args.evaluateProposal, true);
    assert.strictEqual(args.proposalDepth, 2);
    assert.strictEqual(args.finalistCount, 2);
    assert.strictEqual(args.finalistGames, 12);
    assert.strictEqual(args.emitWinners, true);
    assert.strictEqual(args.emitProfilePresets, true);
    assert.deepStrictEqual(args.players, ['expert', 'strong']);
});

runTest('parseArgs は basePreset 未指定時に default を使う', () => {
    const args = parseArgs([]);
    assert.strictEqual(args.basePreset, 'default');
});

runTest('buildCandidateTunings は基準プリセットを含む複数候補を生成する', () => {
    const runtime = loadRuntime();
    const candidates = buildCandidateTunings(runtime, 'default');
    assert.ok(candidates.length > 5);
    assert.strictEqual(candidates[0].name, 'default:base');
    assert.ok(candidates.some(candidate => candidate.name.includes('landmarkRush')));
});

runTest('profilePlayers は既知プロファイルの並びを返す', () => {
    assert.deepStrictEqual(profilePlayers('duel'), ['expert', 'strong']);
    assert.deepStrictEqual(profilePlayers('trio'), ['expert', 'strong', 'strong']);
    assert.deepStrictEqual(profilePlayers('crowd'), ['expert', 'strong', 'strong', 'normal']);
});

runTest('tuneExpert は候補を勝率順に返す', () => {
    withFakeRunSeries(() => {
        const result = tuneExpert({
            games: 2,
            seed: 1,
            maxSteps: 4000,
            basePreset: 'default',
            top: 2,
            players: ['expert', 'strong'],
        });
        assert.strictEqual(result.basePreset, 'default');
        assert.ok(result.rankings.length >= result.top.length);
        assert.strictEqual(result.top.length, 2);
        assert.ok(result.top[0].winRate >= result.top[1].winRate);
        assert.ok(typeof result.top[0].tuning.coinWeight === 'number');
    });
});

runTest('tuneExpertProfiles は複数プロファイルの結果を返す', () => {
    withFakeRunSeries(() => {
        const results = tuneExpertProfiles({
            games: 2,
            seed: 1,
            maxSteps: 4000,
            basePreset: 'default',
            top: 1,
            profiles: ['duel', 'crowd'],
        });
        assert.strictEqual(results.length, 2);
        assert.strictEqual(results[0].profile, 'duel');
        assert.strictEqual(results[1].profile, 'crowd');
        assert.strictEqual(results[0].result.players.length, 2);
        assert.strictEqual(results[1].result.players.length, 4);
    });
});

runTest('proposePresetFromProfiles は各プロファイル首位候補の差分をまとめる', () => {
    const proposal = proposePresetFromProfiles([
        {
            profile: 'duel',
            result: {
                top: [{ name: 'duelWinner', tuning: { coinWeight: 1.21, lateCoinWeight: 1.44, skipPenalty: 8 } }],
            },
        },
        {
            profile: 'crowd',
            result: {
                top: [{ name: 'crowdWinner', tuning: { coinWeight: 1.1, lateCoinWeight: 1.6, lateProgressBonus: 9.2 } }],
            },
        },
    ], {
        basePreset: 'default',
        proposePreset: 'hybridDefault',
    });

    assert.strictEqual(proposal.name, 'hybridDefault');
    assert.strictEqual(proposal.basePreset, 'default');
    assert.strictEqual(proposal.profiles.length, 2);
    assert.strictEqual(proposal.profiles[0].leader, 'duelWinner');
    assert.strictEqual(proposal.tuning.coinWeight, 1.21);
    assert.strictEqual(proposal.tuning.lateCoinWeight, 1.44);
    assert.strictEqual(proposal.tuning.lateProgressBonus, 9.2);
});

runTest('proposePerProfilePresets は人数別の専用提案を返す', () => {
    const proposals = proposePerProfilePresets([
        {
            profile: 'duel',
            result: {
                top: [{ name: 'duelWinner', tuning: { lookaheadWeight: 0.77 } }],
            },
        },
        {
            profile: 'crowd',
            result: {
                top: [{ name: 'crowdWinner', tuning: { lateProgressBonus: 9.2 } }],
            },
        },
    ], {
        basePreset: 'default',
        proposePreset: 'expertProfile',
    });

    assert.strictEqual(proposals.length, 2);
    assert.strictEqual(proposals[0].profile, 'duel');
    assert.ok(proposals[0].proposal.name.startsWith('expertProfile_duel'));
    assert.strictEqual(proposals[1].proposal.tuning.lateProgressBonus, 9.2);
});

runTest('evaluatePerProfileProposals は人数別提案を個別評価する', () => {
    withFakeRunSeries(() => {
        const evaluations = evaluatePerProfileProposals([
            {
                profile: 'duel',
                proposal: {
                    name: 'expert_duel',
                    basePreset: 'default',
                    tuning: { lookaheadWeight: 0.77 },
                },
            },
            {
                profile: 'crowd',
                proposal: {
                    name: 'expert_crowd',
                    basePreset: 'default',
                    tuning: { lateProgressBonus: 9.2 },
                },
            },
        ], {
            games: 2,
            seed: 1,
            maxSteps: 4000,
        });

        assert.strictEqual(evaluations.length, 2);
        assert.strictEqual(evaluations[0].profile, 'duel');
        assert.strictEqual(evaluations[1].profile, 'crowd');
        assert.ok(typeof evaluations[0].evaluation.winDelta === 'number');
    });
});

runTest('formatProfilePresetMap は人数別 tuning のマップ文字列を返す', () => {
    const output = formatProfilePresetMap([
        { profile: 'duel', proposal: { tuning: { lookaheadWeight: 0.77 } } },
        { profile: 'crowd', proposal: { tuning: { lateProgressBonus: 9.2 } } },
    ]);
    assert.ok(output.includes('duel: {"lookaheadWeight":0.77}'));
    assert.ok(output.includes('crowd: {"lateProgressBonus":9.2}'));
});

runTest('enumerateProfileLeaderCombos は上位候補の組み合わせを列挙する', () => {
    const combos = enumerateProfileLeaderCombos([
        { profile: 'duel', result: { top: [{ name: 'a' }, { name: 'b' }] } },
        { profile: 'crowd', result: { top: [{ name: 'c' }, { name: 'd' }] } },
    ], 2);
    assert.strictEqual(combos.length, 4);
    assert.strictEqual(combos[0].length, 2);
    assert.strictEqual(combos[0][0].profile, 'duel');
    assert.strictEqual(combos[0][1].profile, 'crowd');
});

runTest('proposePresetFromCombo は組み合わせから提案プリセットを作る', () => {
    const proposal = proposePresetFromCombo([
        { profile: 'duel', leader: { name: 'duelTop', tuning: { lookaheadWeight: 0.77, lateCoinWeight: 1.6 } } },
        { profile: 'crowd', leader: { name: 'crowdTop', tuning: { lookaheadWeight: 0.7, lateProgressBonus: 9.2 } } },
    ], {
        basePreset: 'default',
        proposePreset: 'comboDefault',
    });
    assert.strictEqual(proposal.name, 'comboDefault');
    assert.strictEqual(proposal.tuning.lookaheadWeight, 0.77);
    assert.strictEqual(proposal.tuning.lateProgressBonus, 9.2);
});

runTest('evaluateProposalAgainstBase は基準との差分成績を返す', () => {
    withFakeRunSeries(() => {
        const evaluation = evaluateProposalAgainstBase({
            name: 'hybridDefault',
            basePreset: 'default',
            tuning: {
                lookaheadWeight: 0.77,
                lateProgressBonus: 9.2,
            },
        }, {
            games: 2,
            seed: 1,
            maxSteps: 4000,
            profiles: ['duel', 'crowd'],
        });

        assert.strictEqual(evaluation.length, 2);
        assert.strictEqual(evaluation[0].profile, 'duel');
        assert.strictEqual(evaluation[1].profile, 'crowd');
        assert.ok(typeof evaluation[0].winDelta === 'number');
        assert.ok(typeof evaluation[1].proposalAverageTurns === 'number');
    });
});

runTest('rankProposalsFromProfiles は提案候補を比較順に返す', () => {
    withFakeRunSeries(() => {
        const rankings = rankProposalsFromProfiles([
        {
            profile: 'duel',
            result: {
                top: [
                    { name: 'duelA', tuning: { lookaheadWeight: 0.77 } },
                    { name: 'duelB', tuning: { lookaheadWeight: 0.63 } },
                ],
            },
        },
        {
            profile: 'crowd',
            result: {
                top: [
                    { name: 'crowdA', tuning: { lateProgressBonus: 9.2 } },
                    { name: 'crowdB', tuning: { lateProgressBonus: 6.8 } },
                ],
            },
        },
        ], {
            basePreset: 'default',
            proposePreset: 'hybridDefault',
            profiles: ['duel', 'crowd'],
            proposalDepth: 2,
            games: 2,
            seed: 1,
            maxSteps: 4000,
        });
        assert.strictEqual(rankings.length, 4);
        assert.ok(typeof rankings[0].totalWinDelta === 'number');
        assert.ok(rankings[0].proposal.name.startsWith('hybridDefault'));
    });
});

runTest('runFinalistPlayoff は上位候補を長めの条件で再評価する', () => {
    withFakeRunSeries(() => {
        const rankings = rankProposalsFromProfiles([
        {
            profile: 'duel',
            result: {
                top: [
                    { name: 'duelA', tuning: { lookaheadWeight: 0.77 } },
                    { name: 'duelB', tuning: { lookaheadWeight: 0.63 } },
                ],
            },
        },
        {
            profile: 'crowd',
            result: {
                top: [
                    { name: 'crowdA', tuning: { lateProgressBonus: 9.2 } },
                    { name: 'crowdB', tuning: { lateProgressBonus: 6.8 } },
                ],
            },
        },
        ], {
            basePreset: 'default',
            proposePreset: 'hybridDefault',
            profiles: ['duel', 'crowd'],
            proposalDepth: 2,
            games: 2,
            seed: 1,
            maxSteps: 4000,
        });
        const finalists = runFinalistPlayoff(rankings, {
            profiles: ['duel', 'crowd'],
            finalistCount: 2,
            finalistGames: 2,
            seed: 1,
            maxSteps: 4000,
        });
        assert.strictEqual(finalists.length, 2);
        assert.ok(typeof finalists[0].totalWinDelta === 'number');
        assert.ok(finalists[0].proposal.name.startsWith('hybridDefault'));
    });
});

runTest('selectWinningFinalists は勝ち越し候補だけを返す', () => {
    const winners = selectWinningFinalists([
        { proposal: { name: 'a' }, totalWinDelta: 2 },
        { proposal: { name: 'b' }, totalWinDelta: 0 },
        { proposal: { name: 'c' }, totalWinDelta: -1 },
    ]);
    assert.strictEqual(winners.length, 1);
    assert.strictEqual(winners[0].proposal.name, 'a');
});

runTest('formatPresetObject は CPU プリセット形式の文字列を返す', () => {
    const output = formatPresetObject('testPreset', {
        coinWeight: 1.2,
        lookaheadWeight: 0.8,
    });
    assert.ok(output.includes('testPreset: {'));
    assert.ok(output.includes('coinWeight: 1.2'));
    assert.ok(output.includes('lookaheadWeight: 0.8'));
});

if (process.exitCode) {
    throw new Error('tune-expertテストで失敗が発生しました');
}
