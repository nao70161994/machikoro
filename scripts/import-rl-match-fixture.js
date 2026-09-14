'use strict';

const fs = require('fs');
const path = require('path');
const AppDiagnostics = require('../js/appDiagnostics');

function normalizeLabel(value) {
    const label = String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
    if (!label || label.length > 80) throw new TypeError('fixture label is required');
    return label;
}

function buildFixture(matchExport, options = {}) {
    if (!matchExport || matchExport.app !== 'machikoro-match' || !matchExport.snapshot) {
        throw new TypeError('valid match export is required');
    }
    return Object.freeze({
        schemaVersion: 1,
        fixtureType: 'rl-failure-position',
        label: normalizeLabel(options.label),
        source: Object.freeze({
            clientVersion: matchExport.clientVersion,
            generatedAt: matchExport.generatedAt,
            mode: matchExport.mode,
        }),
        snapshot: matchExport.snapshot,
        actions: matchExport.actions,
        rlModels: matchExport.rlModels,
        expectation: Object.freeze({ status: 'pending-review', note: String(options.note || '').slice(0, 240) }),
    });
}

function parseArgs(argv) {
    const options = { force: false, note: '' };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === '--input') options.input = argv[++index];
        else if (arg === '--output') options.output = argv[++index];
        else if (arg === '--label') options.label = argv[++index];
        else if (arg === '--note') options.note = argv[++index];
        else if (arg === '--force') options.force = true;
        else throw new TypeError(`unknown argument: ${arg}`);
    }
    if (!options.input || !options.output || !options.label) {
        throw new TypeError('--input, --output, and --label are required');
    }
    return options;
}

function importFixture(options) {
    const text = fs.readFileSync(options.input, 'utf8');
    const matchExport = AppDiagnostics.parseMatchExport(text);
    if (!matchExport) throw new TypeError('invalid or oversized match export');
    if (fs.existsSync(options.output) && options.force !== true) {
        throw new Error(`fixture already exists: ${options.output}`);
    }
    const fixture = buildFixture(matchExport, options);
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, JSON.stringify(fixture, null, 2) + '\n');
    return fixture;
}

if (require.main === module) {
    const options = parseArgs(process.argv.slice(2));
    const fixture = importFixture(options);
    process.stdout.write(`fixture imported: ${fixture.label} -> ${options.output}\n`);
}

module.exports = { buildFixture, importFixture, normalizeLabel, parseArgs };
