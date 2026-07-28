const assert = require('assert');
const {
    buildActionContractReport,
    currentActionContractReport,
} = require('../scripts/report-action-contract');
const { runTest } = require('./helpers/test-utils');

runTest('action contract report exposes current cross-layer manifest without drift', () => {
    const report = currentActionContractReport();

    assert.deepStrictEqual(report.issues, []);
    assert.strictEqual(report.actions.length, 15);
    for (const row of report.actions) {
        assert.ok(row.action);
        assert.ok(row.phase);
        assert.ok(row.payloadKind);
        assert.strictEqual(row.serverValidator, true, row.action);
        assert.strictEqual(row.serverReplay, true, row.action);
        assert.strictEqual(row.clientApply, true, row.action);
        assert.ok(row.uiTarget, row.action);
        assert.ok(Array.isArray(row.canonicalPayloadKeys));
        assert.ok(Array.isArray(row.canonicalPayloadVariants));
        assert.ok(Array.isArray(row.uiChildActions));
    }

    const resolveMover = report.actions.find(row => row.action === 'resolveMover');
    assert.deepStrictEqual(resolveMover.canonicalPayloadVariants, [
        ['cardName', 'targetIndex'],
        ['cardIndex', 'targetIndex'],
    ]);
    const selectDice = report.actions.find(row => row.action === 'selectDice');
    assert.deepStrictEqual(selectDice.uiChildActions, ['selectDiceCount']);
    const nextTurn = report.actions.find(row => row.action === 'nextTurn');
    assert.deepStrictEqual(nextTurn.uiChildActions, []);
});

runTest('action contract report identifies missing, duplicate, phase, and unknown registrations', () => {
    const report = buildActionContractReport({
        gameActions: { FIRST: 'first', SECOND: 'second' },
        registry: {
            first: {
                phase: 'roll',
                payloadKind: 'first',
                serverReplay: true,
                clientApply: true,
            },
            second: {
                phase: 'build',
                payloadKind: 'second',
                serverReplay: false,
                clientApply: false,
            },
            extra: {},
        },
        canonicalPayloadKeys: {
            first: [],
            extra: [],
        },
        payloadValidators: {
            first() {},
            extra() {},
        },
        uiRegistry: {
            snapshot() {
                return [
                    { phase: 'build', actions: ['first'], targetId: 'one' },
                    { phase: 'build', actions: ['first', 'extra'], targetId: 'two' },
                ];
            },
            childSelectors: {},
        },
    });

    assert.deepStrictEqual(report.issues, [
        { action: 'first', kind: 'ui-phase-mismatch' },
        { action: 'first', kind: 'duplicate-ui-target' },
        { action: 'second', kind: 'missing-canonical-payload' },
        { action: 'second', kind: 'missing-server-validator' },
        { action: 'second', kind: 'missing-server-replay' },
        { action: 'second', kind: 'missing-client-apply' },
        { action: 'second', kind: 'missing-ui-target' },
        { action: 'extra', kind: 'unknown-registry-action' },
        { action: 'extra', kind: 'unknown-canonical-action' },
        { action: 'extra', kind: 'unknown-validator-action' },
        { action: 'extra', kind: 'unknown-ui-action' },
    ]);
});
