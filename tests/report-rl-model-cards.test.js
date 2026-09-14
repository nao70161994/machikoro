const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    sha256,
    buildModelCards,
    buildReproducibilityManifest,
    renderMarkdown,
    renderManifestMarkdown,
} = require('../scripts/report-rl-model-cards.js');

function fixture() {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-model-card-'));
    const modelPath = 'models/rl_model/portfolio/test.browser.json';
    const absolutePath = path.join(repoRoot, modelPath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    const model = {
        formatVersion: 2,
        schemaVersion: 3,
        stateDim: 353,
        stateSchema: 'state-mp-v1',
        actionSchema: 'action-flat-v1',
        hiddenSize: 256,
        numActions: 1580,
        numCards: 38,
        numTargetSlots: 3,
        businessSkipGateVersion: 1,
        vocabularyFingerprint: 'v1:test',
        layers: [],
    };
    const serialized = JSON.stringify(model);
    fs.writeFileSync(absolutePath, serialized, 'utf8');
    const catalog = [{
        id: 'test-model',
        label: 'Test Model',
        path: modelPath,
        weight: 2,
        minPlayers: 4,
        maxPlayers: 4,
        productionActive: true,
        registryStatus: 'adopted',
        bytes: Buffer.byteLength(serialized),
        sha256: crypto.createHash('sha256').update(serialized).digest('hex'),
    }];
    const registry = {
        updatedAt: '2026-08-25',
        portfolioPolicy: {
            recommendedActiveModels: [{ id: 'test-model', role: 'adopted-4p-specialist' }],
        },
        models: [{
            id: 'test-model',
            status: 'adopted',
            path: modelPath,
            sourceRun: 'models/rl_model/runs/test-model',
            training: { games: 500, seed: 145, cpuOpponentImpl: 'js-oracle' },
            style: { label: 'target-engine' },
            evals: [{
                date: '2026-08-25',
                type: 'js-lineup-stability',
                gamesPerLineup: 300,
                pairedSeats: true,
                exhausted: 0,
            }],
        }],
    };
    return { repoRoot, modelPath, serialized, catalog, registry };
}

runTest('report-rl-model-cards parseArgs はregistryとformatを解釈する', () => {
    const args = parseArgs(['--registry', 'registry.json', '--format', 'json']);
    assert.strictEqual(args.registryPath, 'registry.json');
    assert.strictEqual(args.format, 'json');
});

runTest('report-rl-model-cards は実artifactのhash・schema・由来を投影する', () => {
    const data = fixture();
    try {
        const cards = buildModelCards(data.registry, {
            repoRoot: data.repoRoot,
            catalog: data.catalog,
        });
        assert.strictEqual(cards.length, 1);
        const card = cards[0];
        assert.strictEqual(card.id, 'test-model');
        assert.strictEqual(card.role, 'adopted-4p-specialist');
        assert.strictEqual(card.players.min, 4);
        assert.strictEqual(card.players.max, 4);
        assert.strictEqual(card.artifact.bytes, Buffer.byteLength(data.serialized));
        assert.strictEqual(card.artifact.sha256, crypto.createHash('sha256').update(data.serialized).digest('hex'));
        assert.strictEqual(card.schema.schemaVersion, 3);
        assert.strictEqual(card.schema.stateDim, 353);
        assert.strictEqual(card.schema.numTargetSlots, 3);
        assert.strictEqual(card.schema.vocabularyFingerprint, 'v1:test');
        assert.strictEqual(card.training.seed, 145);
        assert.strictEqual(card.latestEvaluation.gamesPerLineup, 300);
        assert.strictEqual(card.latestEvaluation.pairedSeats, true);
        assert.deepStrictEqual(card.errors, []);
    } finally {
        fs.rmSync(data.repoRoot, { recursive: true, force: true });
    }
});

runTest('report-rl-model-cards は欠損・path・status不整合をfail closedで記録する', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-model-card-invalid-'));
    try {
        const cards = buildModelCards({
            models: [{ id: 'broken', status: 'candidate', path: 'wrong.json' }],
        }, {
            repoRoot,
            catalog: [{
                id: 'broken',
                path: 'models/missing.json',
                productionActive: true,
                registryStatus: 'adopted',
            }],
        });
        assert.ok(cards[0].errors.includes('catalog and registry paths differ'));
        assert.ok(cards[0].errors.includes('catalog and registry statuses differ'));
        assert.ok(cards[0].errors.includes('artifact file is missing'));
        assert.ok(cards[0].errors.includes('catalog byte size is missing'));
        assert.ok(cards[0].errors.includes('catalog SHA-256 is missing'));
    } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
    }
});

runTest('report-rl-model-cards はrepository外pathを読まない', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-model-card-path-'));
    try {
        const cards = buildModelCards({ models: [] }, {
            repoRoot,
            catalog: [{ id: 'escape', path: '../secret.json', productionActive: false, bytes: 1, sha256: 'a'.repeat(64) }],
        });
        assert.ok(cards[0].errors.includes('registry entry is missing'));
        assert.ok(cards[0].errors.includes('artifact path is outside repository'));
    } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
    }
});

runTest('report-rl-model-cards はcatalogとartifactのhash driftを拒否する', () => {
    const data = fixture();
    try {
        data.catalog[0].bytes += 1;
        data.catalog[0].sha256 = 'f'.repeat(64);
        const card = buildModelCards(data.registry, {
            repoRoot: data.repoRoot,
            catalog: data.catalog,
        })[0];
        assert.ok(card.errors.includes('catalog and artifact byte sizes differ'));
        assert.ok(card.errors.includes('catalog and artifact SHA-256 differ'));
    } finally {
        fs.rmSync(data.repoRoot, { recursive: true, force: true });
    }
});

runTest('report-rl-model-cards manifestとMarkdownは再現情報を保持する', () => {
    const data = fixture();
    try {
        const cards = buildModelCards(data.registry, {
            repoRoot: data.repoRoot,
            catalog: data.catalog,
        });
        const manifest = buildReproducibilityManifest(data.registry, cards);
        assert.strictEqual(manifest.schemaVersion, 1);
        assert.deepStrictEqual(manifest.productionModelIds, ['test-model']);
        assert.strictEqual(manifest.artifacts[0].sourceRun, 'models/rl_model/runs/test-model');
        assert.strictEqual(manifest.artifacts[0].training.cpuOpponentImpl, 'js-oracle');
        assert.strictEqual(manifest.artifacts[0].errors.length, 0);
        const cardsMarkdown = renderMarkdown(cards, data.registry.updatedAt);
        const manifestMarkdown = renderManifestMarkdown(manifest);
        assert.ok(cardsMarkdown.includes('# RL Model Cards'));
        assert.ok(cardsMarkdown.includes('SHA-256'));
        assert.ok(cardsMarkdown.includes('integrity: ok'));
        assert.ok(manifestMarkdown.includes('# RL Reproducibility Manifest'));
        assert.ok(manifestMarkdown.includes('test-model'));
    } finally {
        fs.rmSync(data.repoRoot, { recursive: true, force: true });
    }
});

runTest('report-rl-model-cards sha256 は入力byte列を決定的にhashする', () => {
    assert.strictEqual(
        sha256(Buffer.from('machikoro')),
        crypto.createHash('sha256').update('machikoro').digest('hex')
    );
});
