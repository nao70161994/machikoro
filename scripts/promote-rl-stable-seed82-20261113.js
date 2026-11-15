'use strict';

/** Reproducible import of the independently validated seed82 half-LR checkpoint. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RUN_TRAIN = 42314271984;
const RUN_CHALLENGE = 43347888967;
const MODEL_ID = 'stable-selfplay-2p-seed82-lr1e5-5000-20261107';
const MODEL_FILE = 'stable-seed82-lr1e5-final.browser.json';
const EXPECTED_BYTES = 11449189;
const EXPECTED_SHA = 'e3bf6ac830d13dd38cf3659e7af7bff246aee8dbf7a1c0a25e42601a90288145';

function assert(test, message) { if (!test) throw new Error(message); }
function json(filename) { return JSON.parse(fs.readFileSync(filename, 'utf8')); }
function writeJson(filename, object) { fs.writeFileSync(filename, JSON.stringify(object, null, 2) + '\n'); }

function validateEvaluation(dir) {
    const pairs = {};
    for (const seed of [73, 76]) {
        const match = json(path.join(dir, 'direct-vs-seed' + seed + '.json'));
        assert(match.pairedSeats === true && match.gamesPerLineup === 400, 'incorrect paired-seat games seed' + seed);
        assert(match.entries.length === 1 && match.entries[0].exhausted === 0, 'incomplete match seed' + seed);
        assert(match.totals.games === 400 && match.totals.exhausted === 0, 'unfinished match seed' + seed);
        assert(path.basename(match.candidate) === 'model.progress.browser.json', 'wrong candidate seed' + seed);
        assert(path.basename(match.baseline).includes('seed' + seed), 'wrong baseline seed' + seed);
        const ci = match.entries[0].pairedBlockBootstrap?.confidenceInterval;
        assert(ci && ci.lower > 0.5 && ci.upper <= 1, 'not significantly better seed' + seed);
        pairs['seed' + seed] = {
            games: match.totals.games,
            wins: match.totals.candidateWins,
            losses: match.totals.baselineWins,
            paired95: [ci.lower, ci.upper],
        };
    }
    const heldout = json(path.join(dir, 'js-cpu-holdout.json'));
    const candidate = heldout.find(m => path.basename(m.path) === 'model.progress.browser.json');
    assert(candidate && candidate.modelSha256 === EXPECTED_SHA, 'holdout tested different model hash');
    assert(['weak', 'normal', 'strong', 'expert'].every(n => candidate.summaries.some(s => s.opponent === n && s.games === 120 && s.exhausted === 0)), 'missing CPU tier evaluation');
    assert(candidate.summaries.find(s => s.opponent === 'strong').rlWinRate >= 0.7, 'strong CPU regression');
    return { pairs, candidate };
}

function main() {
    const trainDir = 'artifacts/rl-stable-seed82-source/train';
    const evalDir = 'artifacts/rl-stable-seed82-source/eval';
    const bytes = fs.readFileSync(path.join(trainDir, 'model.progress.browser.json'));
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    assert(bytes.length === EXPECTED_BYTES && digest === EXPECTED_SHA, 'training model size/digest mismatch');
    const model = JSON.parse(bytes.toString('utf8'));
    assert(model.schemaVersion === 3 && model.stateSchema === 'state-2p-v1' &&
        model.actionSchema === 'action-flat-v1' && model.stateDim === 145 &&
        model.hiddenSize === 256 && model.numActions === 1580 &&
        model.numCards === 38 && model.numTargetSlots === 0 &&
        model.vocabularyFingerprint && model.layers &&
        typeof model.layers === 'object', 'model architecture mismatch');
    const trainEval = json(path.join(trainDir, 'heldout-evaluation.json'));
    assert(trainEval.some(e => e.modelSha256 === EXPECTED_SHA && path.basename(e.path) === 'model.progress.browser.json'), 'training holdout does not match final checkpoint');
    const { pairs, candidate } = validateEvaluation(evalDir);
    const registered = json('models/rl_model/registry.json');
    assert(!registered.models.some(m => m.id === MODEL_ID), 'model already in registry');
    const catalogPath = 'js/rlModelCatalog.js';
    const catalog = fs.readFileSync(catalogPath, 'utf8');
    assert(!catalog.includes(MODEL_ID), 'model already in catalog');
    const output = path.join('models/rl_model/portfolio', MODEL_FILE);
    assert(!fs.existsSync(output), 'refusing to replace existing model');
    fs.writeFileSync(output, bytes);

    const description = '半分の学習率で5,000局を完走。現行seed73に231勝169敗、seed76に304勝96敗（各400試合、席順補正95%区間の下限 > 50%）。花畑・ブドウ園・フラワーショップを中心とする自然学習型。';
    const opponents = {};
    for (const item of candidate.summaries) {
        opponents[item.opponent] = {
            wins: item.rlWins, losses: item.opponentWins, draws: item.draws,
            winRate: item.rlWinRate, firstSeatWinRate: item.rlSeatWinRates?.first,
            secondSeatWinRate: item.rlSeatWinRates?.second,
            avgTurns: item.averageTurns, passRate: item.rlBuildStats?.passRate,
        };
    }
    registered.models.push({
        id: MODEL_ID, status: 'adopted', path: output,
        sourceRun: 'models/rl_model/runs/stability5000-seed82-half-lr-' + RUN_TRAIN,
        training: {
            games: 5000, players: 2, hidden: 256, lr: 0.00001, seed: 82,
            cpuOpponentImpl: 'js-oracle', trainOpponents: 'self=1',
            selfLearnBothSides: true, imitation: false, warmStart: false,
            rewardProfile: 'terminal-shaped-rewardcap', initialEpsilon: 0.2,
            terminalLandmarkValueDiff: 0.004, terminalAssetDiff: 0.002,
            terminalCoinDiff: 0.001, terminalDiffClip: 20,
            checkpointType: 'model.progress.browser.json',
            sourceWorkflowRun: RUN_TRAIN, challengeWorkflowRun: RUN_CHALLENGE,
        },
        style: {
            label: 'stable-flowers-vineyard-loan',
            summary: description,
            topCards: candidate.buildSignature.cards.map(c => c.name),
            primary: candidate.strategyProfile?.primary || '',
        },
        evals: [{
            date: '2026-11-13', type: 'js',
            gamesPerOpponent: 120, opponents,
            pairedSeats: true, artifact: 'GitHub Actions ' + RUN_CHALLENGE,
        }],
    });
    registered.portfolioPolicy.recommendedActiveModels.push({
        id: MODEL_ID, role: 'adopted-2p-main',
        style: 'stable-flowers-vineyard-loan', reason: description,
    });
    registered.updatedAt = '2026-11-13';
    registered.notes.push('2026-11-13: Adopted stable half-LR seed82 final checkpoint after 400-game heldout paired-seat wins over seed73 and seed76. Existing diversified models remain active.');
    writeJson('models/rl_model/registry.json', registered);

    const entry = [
        '    {',
        '        id: "' + MODEL_ID + '",',
        '        aliases: Object.freeze(["seed82", "seed82-stable"]),',
        '        label: "RL（自然学習・花とブドウ園・強化型）",',
        '        path: "' + output + '",',
        '        bytes: ' + EXPECTED_BYTES + ',',
        '        sha256: "' + EXPECTED_SHA + '",',
        '        weight: 10,',
        '        maxPlayers: 2,',
        '        productionActive: true,',
        '        registryStatus: "adopted",',
        '    },',
    ].join('\n');
    const marker = '].map(model => Object.freeze(model)));';
    assert(catalog.includes(marker), 'catalog structure changed');
    fs.writeFileSync(catalogPath, catalog.replace(marker, entry + '\n' + marker));
    console.log(JSON.stringify({ id: MODEL_ID, bytes: bytes.length, sha256: digest, pairs,
        cpu: Object.fromEntries(Object.entries(opponents).map(([k,v]) => [k, v.winRate])) }, null, 2));
}
if (require.main === module) main();
module.exports = { validateEvaluation };
