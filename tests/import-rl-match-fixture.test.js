'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const AppDiagnostics = require('../js/appDiagnostics');
const { buildFixture, importFixture, normalizeLabel } = require('../scripts/import-rl-match-fixture');
const { runTest } = require('./helpers/test-utils');

function matchExport() {
    return AppDiagnostics.buildMatchExport({
        snapshot: { players: [{ name: 'A', coins: 3, cards: ['麦畑'] }], phase: 'build' },
        actions: [{ action: 'buildCard', data: { cardName: '麦畑' }, playerIndex: 0, seq: 1 }],
        mode: 'local',
        generatedAt: '2026-08-25T00:00:00.000Z',
    });
}

runTest('RL failure fixture importerは匿名exportをpending review fixtureへ変換する', () => {
    const fixture = buildFixture(matchExport(), { label: 'Harbor Stall 01', note: '港選択後に停止' });
    assert.strictEqual(fixture.label, 'harbor-stall-01');
    assert.strictEqual(fixture.fixtureType, 'rl-failure-position');
    assert.strictEqual(fixture.expectation.status, 'pending-review');
    assert.strictEqual(fixture.snapshot.players[0].name, 'プレイヤー1');
    assert.strictEqual(fixture.actions[0].action, 'buildCard');
});

runTest('RL failure fixture importerは既存fixtureを既定で上書きしない', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'machikoro-rl-fixture-'));
    const input = path.join(directory, 'match.json');
    const output = path.join(directory, 'fixture.json');
    fs.writeFileSync(input, JSON.stringify(matchExport()));
    importFixture({ input, output, label: 'failure-one' });
    assert.throws(() => importFixture({ input, output, label: 'failure-one' }), /already exists/);
    assert.strictEqual(JSON.parse(fs.readFileSync(output, 'utf8')).label, 'failure-one');
});

runTest('RL failure fixture importerは不正labelを拒否する', () => {
    assert.throws(() => normalizeLabel('日本語だけ'), /label is required/);
});
