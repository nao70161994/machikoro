const assert = require('assert');
const ClientCheckpoint = require('../js/clientCheckpoint');
const { runTest } = require('./helpers/test-utils');

function createSubject(overrides = {}) {
    const root = {};
    const persisted = [];
    const snapshot = { phase: 'build' };
    const details = { reason: 'test' };
    const options = Object.assign({
        event: 'checkpoint-test',
        details,
        buildSnapshot() {
            return snapshot;
        },
        timestamp() {
            return '2026-08-02T00:00:00.000Z';
        },
        getRoot() {
            return root;
        },
        persist(value) {
            persisted.push(value);
        },
    }, overrides);
    return { options, root, persisted, snapshot, details };
}

runTest('client checkpointは既存shapeをglobalと永続化へ記録する', () => {
    const subject = createSubject();
    const checkpoint = ClientCheckpoint.record(subject.options);
    assert.deepStrictEqual(checkpoint, {
        event: 'checkpoint-test',
        details: subject.details,
        snapshot: subject.snapshot,
        timestamp: '2026-08-02T00:00:00.000Z',
    });
    assert.deepStrictEqual(subject.root.__machikoroClientCheckpoints, [checkpoint]);
    assert.deepStrictEqual(subject.persisted, [JSON.stringify(checkpoint)]);
});

runTest('client checkpointはsnapshot失敗をfallback shapeへ変換する', () => {
    let timestampCalls = 0;
    const subject = createSubject({
        buildSnapshot() {
            throw new Error('snapshot failed');
        },
        timestamp() {
            timestampCalls += 1;
            return '2026-08-02T00:00:00.000Z';
        },
    });
    const checkpoint = ClientCheckpoint.record(subject.options);
    assert.deepStrictEqual(checkpoint, {
        event: 'checkpoint-test',
        details: subject.details,
        snapshot: null,
        timestamp: '2026-08-02T00:00:00.000Z',
        snapshotFailed: true,
    });
    assert.strictEqual(timestampCalls, 1);
});

runTest('client checkpointは既存global配列を80件に制限する', () => {
    const subject = createSubject();
    subject.root.__machikoroClientCheckpoints = Array.from({ length: 80 }, (_, index) => ({ index }));
    const originalList = subject.root.__machikoroClientCheckpoints;
    const checkpoint = ClientCheckpoint.record(subject.options);
    assert.strictEqual(subject.root.__machikoroClientCheckpoints, originalList);
    assert.strictEqual(originalList.length, 80);
    assert.deepStrictEqual(originalList[0], { index: 1 });
    assert.strictEqual(originalList[79], checkpoint);
});

runTest('client checkpointは永続化JSONを5000文字に制限する', () => {
    const subject = createSubject({ details: { text: 'x'.repeat(6000) } });
    const checkpoint = ClientCheckpoint.record(subject.options);
    assert.ok(checkpoint);
    assert.strictEqual(subject.persisted.length, 1);
    assert.strictEqual(subject.persisted[0].length, 5000);
});

runTest('client checkpointはglobalとstorage例外を外へ伝播しない', () => {
    const subject = createSubject({
        getRoot() {
            throw new Error('global blocked');
        },
        persist() {
            throw new Error('storage blocked');
        },
    });
    let checkpoint;
    assert.doesNotThrow(() => {
        checkpoint = ClientCheckpoint.record(subject.options);
    });
    assert.strictEqual(checkpoint.event, 'checkpoint-test');
});

runTest('client checkpointはfallback timestampも失敗したら記録しない', () => {
    let rootCalls = 0;
    let persistCalls = 0;
    const subject = createSubject({
        buildSnapshot() {
            throw new Error('snapshot failed');
        },
        timestamp() {
            throw new Error('clock failed');
        },
        getRoot() {
            rootCalls += 1;
            return {};
        },
        persist() {
            persistCalls += 1;
        },
    });
    assert.strictEqual(ClientCheckpoint.record(subject.options), null);
    assert.strictEqual(rootCalls, 0);
    assert.strictEqual(persistCalls, 0);
});

runTest('client checkpointはCPU step開始をcompact journalへ射影し同じ実行完了だけを消す', () => {
    const started = {
        event: 'scheduleCPU-step-run',
        timestamp: '2026-08-08T00:00:00.000Z',
        details: {
            stepExecutionId: '4:5:build:1:1000',
            step: 'build', phase: 'build', difficulty: 'strong',
            currentPlayerIndex: 1, token: 4, startedAt: 1000,
        },
    };
    const write = ClientCheckpoint.cpuStepJournalMutation(started, '');
    assert.strictEqual(write.kind, 'write');
    const journal = JSON.parse(write.value);
    assert.deepStrictEqual(journal, {
        schemaVersion: 1,
        stepExecutionId: '4:5:build:1:1000',
        step: 'build', phase: 'build', difficulty: 'strong',
        currentPlayerIndex: 1, token: 4, startedAt: 1000,
        timestamp: '2026-08-08T00:00:00.000Z',
    });
    assert.strictEqual(ClientCheckpoint.cpuStepJournalMutation({
        event: 'scheduleCPU-step-result', details: { stepExecutionId: 'other' },
    }, write.value).kind, 'none');
    assert.strictEqual(ClientCheckpoint.cpuStepJournalMutation({
        event: 'scheduleCPU-step-result', details: { stepExecutionId: journal.stepExecutionId },
    }, write.value).kind, 'remove');
});

runTest('client checkpointは再起動時に未完了strong stepだけを期限付きincidentへ変換する', () => {
    const active = JSON.stringify({
        schemaVersion: 1,
        stepExecutionId: '7:4:rerollConfirm:1:1000',
        step: 'rerollConfirm', phase: 'rerollConfirm', difficulty: 'strong',
        currentPlayerIndex: 1, token: 7, startedAt: 1000,
    });
    const incident = ClientCheckpoint.abandonedCpuStepIncident(active, 6500);
    assert.strictEqual(incident.kind, 'report');
    assert.strictEqual(incident.summary.elapsedMs, 5500);
    assert.strictEqual(incident.summary.step, 'rerollConfirm');
    assert.strictEqual(ClientCheckpoint.abandonedCpuStepIncident(
        active.replace('strong', 'normal'), 6500
    ).kind, 'discard');
    assert.strictEqual(ClientCheckpoint.abandonedCpuStepIncident('{broken', 6500).kind, 'discard');
    assert.strictEqual(ClientCheckpoint.abandonedCpuStepIncident(active, 8 * 24 * 60 * 60 * 1000).kind, 'discard');
});
