'use strict';

// Reproducible import of selected checkpoints from GitHub Actions run 41281719490.
// This script performs no network calls: it reads downloaded Actions artifacts.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SOURCE_RUN = 41281719490;
const OUTPUT_DIR = 'models/rl_model/portfolio';
const SPECS = [
    {
        seed: 73, playerCount: 2, rank: 3,
        artifactDir: 'artifacts/rl-natural-promotion/seed73',
        sourceFile: 'best_model.top3.browser.json',
        filename: 'natural-seed73-top3.browser.json',
        expectedBytes: 11424530,
        expectedSha256: '61cdfb36478e1aa6f102b8e2ae3a2e3bc1933f5151aa642d3c0e925bcd67cc13',
        label: 'RL（自然学習・農業ワイナリー）',
        style: 'natural-wheat-vineyard-winery',
        weight: 8,
        role: 'adopted-2p-main',
        summary: '勝利報酬を共通にした独立自己対戦。農業・ワイナリー中心の構成。seed71に直接300戦183勝117敗、seed76に400戦224勝176敗。',
    },
    {
        seed: 76, playerCount: 2, rank: 2,
        artifactDir: 'artifacts/rl-natural-promotion/seed76',
        sourceFile: 'best_model.top2.browser.json',
        filename: 'natural-seed76-top2.browser.json',
        expectedBytes: 11456155,
        expectedSha256: 'f99d44072c1de75323046644732500d8feb225daef628aa353c138d88669fc51',
        label: 'RL（自然学習・花と漁業）',
        style: 'natural-flowers-fishing',
        weight: 4,
        role: 'adopted-2p-style',
        summary: '同一報酬・別シードの独立自己対戦。花畑・フラワーショップ・漁船の構成。現行AIとの直接300戦145勝155敗、強CPUに91.3%。',
    },
    {
        seed: 104, playerCount: 4, rank: 1,
        artifactDir: 'artifacts/rl-natural-promotion/seed104',
        sourceFile: 'best_model.browser.json',
        filename: 'natural-seed104-4p.browser.json',
        expectedBytes: 12670907,
        expectedSha256: 'b123092d951a01a0960cf1e70c944aaa2be7bc520bed2224daf7f5ea1fe2cbd9',
        label: 'RL（自然学習・4人戦）',
        style: 'natural-4p-vineyard-ranch-loan',
        weight: 6,
        role: 'adopted-4p-specialist',
        summary: '4人戦2,000局の独立自己対戦。seed103/145両方に直接対決で勝ち越し、seed106にも600戦284勝182敗（残りはCPU勝利）。4人限定採用。',
    },
];

function filePath(p) { return path.join(process.cwd(), p); }
function readJson(p) { return JSON.parse(fs.readFileSync(filePath(p), 'utf8')); }
function writeJson(p, data) {
    fs.writeFileSync(filePath(p), JSON.stringify(data, null, 2) + '\n');
}
function assert(condition, description) {
    if (!condition) throw new Error(description);
}
function replaceExact(source, oldText, newText, description) {
    assert(source.includes(oldText), 'source changed: ' + description);
    return source.replace(oldText, newText);
}
function buildEvaluation(record, spec) {
    if (spec.playerCount === 2) {
        const opponents = {};
        for (const item of record.summaries) {
            opponents[item.opponent] = {
                wins: item.rlWins, losses: item.opponentWins,
                draws: item.draws, winRate: item.rlWinRate,
                firstSeatWinRate: item.rlSeatWinRates?.first,
                secondSeatWinRate: item.rlSeatWinRates?.second,
                avgTurns: item.averageTurns,
                passRate: item.rlBuildStats?.passRate,
            };
        }
        assert(['weak', 'normal', 'strong'].every(x => opponents[x]), 'missing 2p opponent eval');
        return {
            date: '2026-11-01', type: 'js',
            gamesPerOpponent: 100, opponents,
            checkpointRank: spec.rank, pairedSeats: true,
            artifact: 'GitHub Actions ' + SOURCE_RUN,
        };
    }
    const lineups = {};
    for (const item of record.summaries) {
        lineups[item.opponent] = {
            games: item.games, wins: item.rlWins, losses: item.opponentWins,
            draws: item.draws, winRate: item.rlWinRate,
            avgTurns: item.averageTurns, passRate: item.rlBuildStats?.passRate,
        };
    }
    assert(Object.keys(lineups).length >= 3, 'missing 4p lineup eval');
    return {
        date: '2026-11-01', type: 'js-lineup-stability',
        gamesPerLineup: 80, lineups,
        checkpointRank: spec.rank, pairedSeats: true,
        artifact: 'GitHub Actions ' + SOURCE_RUN,
    };
}

function main() {
    const registryPath = 'models/rl_model/registry.json';
    const catalogPath = 'js/rlModelCatalog.js';
    const testsPath = 'tests/rl-model-portfolio.test.js';
    const registry = readJson(registryPath);
    const newModels = [];
    const additions = [];

    for (const spec of SPECS) {
        const input = filePath(path.join(spec.artifactDir, spec.sourceFile));
        const output = path.join(OUTPUT_DIR, spec.filename);
        assert(fs.existsSync(input), 'missing artifact model: ' + input);
        const bytes = fs.readFileSync(input);
        const sha = crypto.createHash('sha256').update(bytes).digest('hex');
        assert(bytes.byteLength === spec.expectedBytes, 'model bytes mismatch: seed' + spec.seed);
        assert(sha === spec.expectedSha256, 'model SHA mismatch: seed' + spec.seed);
        const json = JSON.parse(bytes.toString('utf8'));
        const expectedDim = spec.playerCount === 2 ? 145 : 353;
        const expectedSchema = spec.playerCount === 2 ? 'state-2p-v1' : 'state-mp-v1';
        assert(json.schemaVersion === 3 && json.stateDim === expectedDim, 'model state dimension/schema mismatch');
        assert(json.stateSchema === expectedSchema && json.actionSchema === 'action-flat-v1', 'unsupported action schema');
        assert(json.hiddenSize === 256 && json.numActions === 1580 && json.numCards === 38, 'model shape mismatch');
        assert(json.numTargetSlots === (spec.playerCount === 2 ? 0 : 3), 'target head mismatch');
        assert(json.vocabularyFingerprint && Array.isArray(json.layers), 'missing vocabulary or weights');
        const evals = readJson(path.join(spec.artifactDir, 'independent-evaluation.json'));
        const record = evals.find(e => e.modelSha256 === sha);
        assert(record, 'evaluated checkpoint not found: ' + spec.seed);

        fs.mkdirSync(filePath(OUTPUT_DIR), { recursive: true });
        fs.writeFileSync(filePath(output), bytes);
        const id = 'natural-selfplay-' + spec.playerCount + 'p-seed' + spec.seed + '-20261101';
        assert(!registry.models.some(m => m.id === id), 'already registered: ' + id);
        const cards = record.buildSignature.cards.map(item => item.name);
        newModels.push({
            id, status: 'adopted', path: output,
            sourceRun: 'models/rl_model/runs/natural-' + spec.playerCount + 'p-seed' + spec.seed + '-' + SOURCE_RUN,
            training: {
                games: spec.playerCount === 2 ? 5000 : 2000,
                players: spec.playerCount, hidden: 256,
                lr: spec.playerCount === 2 ? 0.00002 : 0.00001,
                seed: spec.seed, cpuOpponentImpl: 'js-oracle',
                trainOpponents: 'self=1', selfLearnBothSides: true,
                imitation: false, warmStart: false,
                rewardProfile: 'terminal-shaped-rewardcap',
                terminalLandmarkValueDiff: 0.004,
                terminalAssetDiff: 0.002, terminalCoinDiff: 0.001,
                terminalDiffClip: 20, checkpointRank: spec.rank,
                sourceWorkflowRun: SOURCE_RUN,
            },
            style: {
                label: spec.style,
                summary: spec.summary,
                topCards: cards,
                primary: record.strategyProfile?.primary || '',
            },
            evals: [buildEvaluation(record, spec)],
        });
        registry.portfolioPolicy.recommendedActiveModels.push({
            id, role: spec.role, style: spec.style,
            reason: spec.summary,
        });
        additions.push([
            '    {',
            '        id: ' + JSON.stringify(id) + ',',
            '        aliases: Object.freeze([' + JSON.stringify('seed' + spec.seed) + ']),',
            '        label: ' + JSON.stringify(spec.label) + ',',
            '        path: ' + JSON.stringify(output) + ',',
            '        bytes: ' + spec.expectedBytes + ',',
            '        sha256: ' + JSON.stringify(sha) + ',',
            '        weight: ' + spec.weight + ',',
            ...(spec.playerCount === 2 ? ['        maxPlayers: 2,'] : [
                '        minPlayers: 4,',
                '        maxPlayers: 4,',
            ]),
            '        productionActive: true,',
            '        registryStatus: "adopted",',
            '    },',
        ].join('\n'));
    }
    registry.models.push(...newModels);
    registry.updatedAt = '2026-11-07';
    registry.notes.push('2026-11-07: Natural self-play seeds 73/76/104 promoted after paired-seat heldout and head-to-head audits; 4p seed104 is 4p-only.');
    writeJson(registryPath, registry);

    let catalog = fs.readFileSync(filePath(catalogPath), 'utf8');
    catalog = replaceExact(catalog, '].map(model => Object.freeze(model)));',
        additions.join('\n') + '\n].map(model => Object.freeze(model)));', 'catalog insertion');
    fs.writeFileSync(filePath(catalogPath), catalog);

    let tests = fs.readFileSync(filePath(testsPath), 'utf8');
    tests = replaceExact(tests,
        "        ['self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3']\n    );",
        "        [\n            'self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3',\n            'natural-selfplay-2p-seed73-20261101',\n            'natural-selfplay-2p-seed76-20261101',\n        ]\n    );",
        '2p eligible model list');
    tests = replaceExact(tests,
        "    assert.strictEqual(new Set(Array.from(assigned, setting => setting.rlModelId)).size, 1);\n    assert.ok(assigned.every(setting => (\n        setting.rlModelId === 'self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3'\n    )));",
        "    assert.strictEqual(new Set(Array.from(assigned, setting => setting.rlModelId)).size, 2);\n    assert.ok(assigned.every(setting => RLModelPortfolio.modelById(setting.rlModelId, 2)?.productionActive));",
        '2p auto selection');
    tests = replaceExact(tests,
        "    assert.strictEqual(withReserved[0].rlModelId, withReserved[1].rlModelId);",
        "    assert.notStrictEqual(withReserved[0].rlModelId, withReserved[1].rlModelId);",
        '2p pinned model');
    tests = replaceExact(tests,
        "            'mp-mixed-34510-target-only-seed145-4p',\n        ]\n    );\n    assert.strictEqual(fourPlayerModels[1].label",
        "            'mp-mixed-34510-target-only-seed145-4p',\n            'natural-selfplay-4p-seed104-20261101',\n        ]\n    );\n    assert.strictEqual(fourPlayerModels[1].label",
        '4p eligible model list');

    tests += "\nrunTest('RL model portfolio: natural seeds eligible only in supported counts', () => {\n" +
        "    const { RLModelPortfolio } = loadPortfolio();\n" +
        "    const ids2 = RLModelPortfolio.eligibleModels(2).map(x => x.id);\n" +
        "    assert.ok(ids2.includes('natural-selfplay-2p-seed73-20261101'));\n" +
        "    assert.ok(ids2.includes('natural-selfplay-2p-seed76-20261101'));\n" +
        "    const ids4 = RLModelPortfolio.eligibleModels(4).map(x => x.id);\n" +
        "    assert.ok(ids4.includes('natural-selfplay-4p-seed104-20261101'));\n" +
        "    assert.ok(!RLModelPortfolio.eligibleModels(3).some(x => x.id === 'natural-selfplay-4p-seed104-20261101'));\n" +
        "    const settings = [\n" +
        "        {type: 'cpu',difficulty: 'rl'}, {type: 'cpu',difficulty: 'rl'},\n" +
        "        {type: 'cpu',difficulty: 'rl'}, {type: 'cpu',difficulty: 'rl'},\n" +
        "    ];\n" +
        "    for (let i = 0; i < 100; i++) {\n" +
        "        const assigned = RLModelPortfolio.assignModelIds(settings, 4);\n" +
        "        assert.ok(RLModelPortfolio.selectedMemoryBudget(4, assigned).withinBudget);\n" +
        "    }\n" +
        "});\n";
    fs.writeFileSync(filePath(testsPath), tests);
    console.log('Promoted natural self-play seeds: ' + SPECS.map(s => s.seed).join(', '));
}
if (require.main === module) main();
