const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const RLModelCatalog = require('../js/rlModelCatalog.js');
const { loadRegistry, latestEval } = require('./validate-rl-registry.js');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
    const args = {
        registryPath: path.join(ROOT, 'models', 'rl_model', 'registry.json'),
        format: 'markdown',
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--registry') args.registryPath = argv[++i] || args.registryPath;
        else if (arg === '--format') args.format = argv[++i] || args.format;
    }
    return args;
}

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function finiteInteger(value) {
    return Number.isSafeInteger(value) ? value : null;
}

function recommendedRoles(registry) {
    return new Map(
        (((registry || {}).portfolioPolicy || {}).recommendedActiveModels || [])
            .map(entry => [entry.id, entry.role || ''])
    );
}

function evaluationSummary(model) {
    const evaluation = latestEval(model || {});
    if (!evaluation) return null;
    return {
        date: evaluation.date || '',
        type: evaluation.type || '',
        gamesPerOpponent: finiteInteger(evaluation.gamesPerOpponent),
        gamesPerLineup: finiteInteger(evaluation.gamesPerLineup),
        pairedSeats: evaluation.pairedSeats === true,
        exhausted: finiteInteger(evaluation.exhausted),
    };
}

function readArtifact(repoRoot, entry, errors) {
    const relativePath = String(entry.path || '');
    const absolutePath = path.resolve(repoRoot, relativePath);
    if (!relativePath || !absolutePath.startsWith(path.resolve(repoRoot) + path.sep)) {
        errors.push('artifact path is outside repository');
        return { path: relativePath, exists: false, bytes: 0, sha256: '', model: null };
    }
    if (!fs.existsSync(absolutePath)) {
        errors.push('artifact file is missing');
        return { path: relativePath, exists: false, bytes: 0, sha256: '', model: null };
    }
    try {
        const buffer = fs.readFileSync(absolutePath);
        const model = JSON.parse(buffer.toString('utf8'));
        return {
            path: relativePath,
            exists: true,
            bytes: buffer.length,
            sha256: sha256(buffer),
            model,
        };
    } catch (error) {
        errors.push('artifact parse failed: ' + String(error && error.message || error));
        return { path: relativePath, exists: true, bytes: 0, sha256: '', model: null };
    }
}

function schemaProjection(model) {
    const source = model || {};
    return {
        formatVersion: finiteInteger(source.formatVersion),
        schemaVersion: finiteInteger(source.schemaVersion),
        stateDim: finiteInteger(source.stateDim),
        stateSchema: source.stateSchema || '',
        actionSchema: source.actionSchema || '',
        hiddenSize: finiteInteger(source.hiddenSize),
        numActions: finiteInteger(source.numActions),
        numCards: finiteInteger(source.numCards),
        numTargetSlots: finiteInteger(source.numTargetSlots),
        businessSkipGateVersion: finiteInteger(source.businessSkipGateVersion),
        vocabularyFingerprint: source.vocabularyFingerprint || '',
    };
}

function buildModelCards(registry, options = {}) {
    const repoRoot = options.repoRoot || ROOT;
    const catalog = options.catalog || RLModelCatalog.models;
    const registeredModels = Array.isArray(registry && registry.models) ? registry.models : [];
    const roles = recommendedRoles(registry);
    return catalog.map(entry => {
        const errors = [];
        const registered = registeredModels.find(model => model.id === entry.id) || null;
        if (!registered) errors.push('registry entry is missing');
        else {
            if (registered.path !== entry.path) errors.push('catalog and registry paths differ');
            if (registered.status !== entry.registryStatus) errors.push('catalog and registry statuses differ');
        }
        const artifact = readArtifact(repoRoot, entry, errors);
        if (!Number.isSafeInteger(entry.bytes) || entry.bytes <= 0) {
            errors.push('catalog byte size is missing');
        } else if (artifact.exists && artifact.bytes !== entry.bytes) {
            errors.push('catalog and artifact byte sizes differ');
        }
        if (!/^[a-f0-9]{64}$/.test(entry.sha256 || '')) {
            errors.push('catalog SHA-256 is missing');
        } else if (artifact.sha256 && artifact.sha256 !== entry.sha256) {
            errors.push('catalog and artifact SHA-256 differ');
        }
        const schema = schemaProjection(artifact.model);
        if (artifact.model) {
            if (!schema.schemaVersion) errors.push('schemaVersion is missing');
            if (!schema.stateDim) errors.push('stateDim is missing');
            if (!schema.actionSchema) errors.push('actionSchema is missing');
            if (!schema.vocabularyFingerprint && entry.legacyVocabulary !== true) {
                errors.push('vocabularyFingerprint is missing');
            }
        }
        return {
            id: entry.id,
            label: entry.label || entry.id,
            role: roles.get(entry.id) || '',
            status: registered ? registered.status || '' : entry.registryStatus || '',
            productionActive: entry.productionActive === true,
            weight: Number.isFinite(entry.weight) ? entry.weight : 1,
            players: {
                min: finiteInteger(entry.minPlayers) || 2,
                max: finiteInteger(entry.maxPlayers) || 10,
            },
            artifact: {
                path: artifact.path,
                exists: artifact.exists,
                bytes: artifact.bytes,
                sha256: artifact.sha256,
                expectedBytes: finiteInteger(entry.bytes),
                expectedSha256: entry.sha256 || '',
            },
            schema,
            sourceRun: registered && registered.sourceRun || '',
            training: registered && registered.training || null,
            strategy: registered && registered.style || null,
            latestEvaluation: evaluationSummary(registered),
            errors,
        };
    });
}

function buildReproducibilityManifest(registry, cards) {
    return {
        schemaVersion: 1,
        registryUpdatedAt: registry && registry.updatedAt || '',
        catalogModelCount: cards.length,
        productionModelIds: cards.filter(card => card.productionActive).map(card => card.id),
        artifacts: cards.map(card => ({
            id: card.id,
            path: card.artifact.path,
            bytes: card.artifact.bytes,
            sha256: card.artifact.sha256,
            schemaVersion: card.schema.schemaVersion,
            stateDim: card.schema.stateDim,
            stateSchema: card.schema.stateSchema,
            actionSchema: card.schema.actionSchema,
            numTargetSlots: card.schema.numTargetSlots,
            vocabularyFingerprint: card.schema.vocabularyFingerprint,
            sourceRun: card.sourceRun,
            training: card.training,
            errors: card.errors.slice(),
        })),
    };
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KiB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MiB';
}

function renderMarkdown(cards, registryUpdatedAt = '') {
    const lines = [
        '# RL Model Cards',
        '',
        '- registryUpdatedAt: ' + (registryUpdatedAt || 'n/a'),
        '',
    ];
    for (const card of cards) {
        const evaluation = card.latestEvaluation
            ? (card.latestEvaluation.date || 'n/a') + ' ' + (card.latestEvaluation.type || 'n/a') +
                ' paired=' + (card.latestEvaluation.pairedSeats ? 'yes' : 'no')
            : 'n/a';
        lines.push(
            '## ' + card.label,
            '',
            '- id: `' + card.id + '`',
            '- role/status: ' + (card.role || 'n/a') + ' / ' + (card.status || 'n/a'),
            '- production: ' + (card.productionActive ? 'yes' : 'no') + ' (weight ' + card.weight + ')',
            '- players: ' + card.players.min + '–' + card.players.max,
            '- artifact: `' + card.artifact.path + '` (' + formatBytes(card.artifact.bytes) + ')',
            '- SHA-256: `' + (card.artifact.sha256 || 'missing') + '`',
            '- schema: v' + (card.schema.schemaVersion || 'n/a') + ', ' +
                (card.schema.stateSchema || 'n/a') + ', stateDim=' + (card.schema.stateDim || 'n/a') +
                ', targets=' + (card.schema.numTargetSlots === null ? 'n/a' : card.schema.numTargetSlots),
            '- action schema: ' + (card.schema.actionSchema || 'n/a'),
            '- vocabulary fingerprint: ' + (card.schema.vocabularyFingerprint ? 'present' : 'legacy/missing'),
            '- source run: ' + (card.sourceRun || 'n/a'),
            '- latest evaluation: ' + evaluation,
            '- integrity: ' + (card.errors.length ? card.errors.join('; ') : 'ok'),
            ''
        );
    }
    return lines.join('\n');
}

function renderManifestMarkdown(manifest) {
    const lines = [
        '# RL Reproducibility Manifest',
        '',
        '- schemaVersion: ' + manifest.schemaVersion,
        '- registryUpdatedAt: ' + (manifest.registryUpdatedAt || 'n/a'),
        '- catalogModelCount: ' + manifest.catalogModelCount,
        '',
        '| id | bytes | SHA-256 | schema | state | targets | integrity |',
        '|---|---:|---|---:|---|---:|---|',
    ];
    for (const artifact of manifest.artifacts) {
        lines.push(
            '| `' + artifact.id + '` | ' + artifact.bytes + ' | `' +
            (artifact.sha256 || 'missing') + '` | ' + (artifact.schemaVersion || 'n/a') + ' | ' +
            (artifact.stateSchema || 'n/a') + ' / ' + (artifact.stateDim || 'n/a') + ' | ' +
            (artifact.numTargetSlots === null ? 'n/a' : artifact.numTargetSlots) + ' | ' +
            (artifact.errors.length ? artifact.errors.join('; ') : 'ok') + ' |'
        );
    }
    return lines.join('\n') + '\n';
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    const registry = loadRegistry(args.registryPath);
    const cards = buildModelCards(registry);
    if (args.format === 'json') console.log(JSON.stringify(cards, null, 2));
    else process.stdout.write(renderMarkdown(cards, registry.updatedAt));
    if (cards.some(card => card.errors.length > 0)) process.exitCode = 1;
}

module.exports = {
    parseArgs,
    sha256,
    buildModelCards,
    buildReproducibilityManifest,
    renderMarkdown,
    renderManifestMarkdown,
};
