'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const OnlineRuntimeFlags = require('../js/onlineRuntimeFlags');
const { runTest } = require('./helpers/test-utils');

const EXPECTED_READERS = Object.freeze(['isGameSchemaNegotiationTransportEnabled', 'isGameSchemaWireTransportEnabled', 'isGameSchemaSnapshotWireTransportEnabled', 'isGameSchemaRecreateWireTransportEnabled', 'isOnlineReconnectEventAuthorityEnabled', 'isOnlineReconnectEffectAuthorityEnabled', 'isOnlineReconnectStatusEffectAuthorityEnabled', 'isOnlineReconnectTimerAuthorityEnabled', 'isOnlineReconnectCallbackAuthorityEnabled', 'isOnlineReconnectQueuePlanAuthorityEnabled', 'isOnlineReconnectQueueEffectAuthorityEnabled', 'isOnlineRestoreQueueStateAuthorityEnabled', 'isOnlineRestoreQueueStoreReadAuthorityEnabled', 'isOnlineRestoreQueueStoreWriteAuthorityEnabled', 'isOnlineReconnectCleanupAuthorityEnabled', 'isOnlineReconnectCleanupEffectAuthorityEnabled', 'isOnlineReconnectRequestPlanAuthorityEnabled', 'isOnlineReconnectRequestEffectAuthorityEnabled', 'isOnlineRestoreAbortPlanAuthorityEnabled', 'isOnlineRestoreAbortEffectAuthorityEnabled', 'isOnlineActionTimeoutPlanAuthorityEnabled', 'isOnlineActionTimeoutEffectAuthorityEnabled', 'isIncomingGameActionPlanAuthorityEnabled', 'isAcceptedGameActionPlanAuthorityEnabled', 'isIncomingGameActionDecodeEffectAuthorityEnabled', 'isAcceptedGameActionDecodeEffectAuthorityEnabled', 'isIncomingGameActionApplyEffectAuthorityEnabled', 'isAcceptedGameActionApplyEffectAuthorityEnabled', 'isIncomingGameActionGapEffectAuthorityEnabled', 'isAcceptedGameActionGapEffectAuthorityEnabled', 'isIncomingGameActionNoGameEffectAuthorityEnabled', 'isAcceptedGameActionNoGameEffectAuthorityEnabled', 'isIncomingGameActionCommitEffectAuthorityEnabled', 'isAcceptedGameActionCommitEffectAuthorityEnabled', 'isOnlineSocketConnectPlanAuthorityEnabled', 'isOnlineSocketConnectEffectAuthorityEnabled', 'isOnlineSocketDisconnectPlanAuthorityEnabled', 'isOnlineSocketDisconnectEffectAuthorityEnabled', 'isOnlineHostChangedPlanAuthorityEnabled', 'isOnlineHostChangedEffectAuthorityEnabled', 'isPendingReconciliationPlanAuthorityEnabled', 'isRejoinActionLogPlanAuthorityEnabled', 'isLocalHostRestoreOfferPlanAuthorityEnabled', 'isOnlineRejoinPersistencePlanAuthorityEnabled', 'isOnlineRejoinPersistenceEffectAuthorityEnabled', 'isOnlinePendingResendPlanAuthorityEnabled', 'isOnlinePendingResendEffectAuthorityEnabled', 'isOnlineRestoreReplayPlanAuthorityEnabled', 'isOnlineRestoreReplayEffectAuthorityEnabled', 'isOnlineRestoreActivationPlanAuthorityEnabled', 'isOnlineRestoreActivationEffectAuthorityEnabled', 'isOnlineGameEngineShadowEnabled', 'isOnlineGameEngineAuthorityEnabled']);
const SCHEMA_TRANSPORT_READERS = Object.freeze([
    'isGameSchemaNegotiationTransportEnabled',
    'isGameSchemaWireTransportEnabled',
    'isGameSchemaSnapshotWireTransportEnabled',
    'isGameSchemaRecreateWireTransportEnabled',
]);

runTest('online runtime flagsは全reader名とwindow propertyを一つの正本にする', () => {
    assert.deepStrictEqual(Object.keys(OnlineRuntimeFlags.names), EXPECTED_READERS);
    assert.strictEqual(new Set(Object.values(OnlineRuntimeFlags.names)).size, EXPECTED_READERS.length);
    assert.ok(Object.isFrozen(OnlineRuntimeFlags));
    assert.ok(Object.isFrozen(OnlineRuntimeFlags.names));

    const onlineSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'online.js'), 'utf8');
    const schemaTransportSource = fs.readFileSync(
        path.join(__dirname, '..', 'js', 'onlineSchemaTransport.js'),
        'utf8'
    );
    assert.ok(onlineSource.includes('OnlineRuntimeFlags.createNamedReaders(onlineRuntimeFlagRoot'));
    assert.ok(!onlineSource.includes('isOnlineRuntimeFlagEnabled'));
    for (const reader of EXPECTED_READERS) {
        if (SCHEMA_TRANSPORT_READERS.includes(reader)) {
            assert.ok(onlineSource.includes('function ' + reader + '('), reader + ' wrapper');
            assert.ok(schemaTransportSource.includes("isFlagEnabled('" + reader + "')"), reader);
        } else {
            assert.ok(onlineSource.includes("    '" + reader + "',"), reader);
        }
        assert.ok(!(onlineSource + schemaTransportSource).includes(
            'window.' + OnlineRuntimeFlags.names[reader] + ' === true'
        ), reader);
    }
});

runTest('online runtime flag readerはrootを呼出時に解決し既存判定へ委譲する', () => {
    const readerName = EXPECTED_READERS[0];
    const property = OnlineRuntimeFlags.names[readerName];
    let root = { [property]: false };
    let calls = 0;
    const reader = OnlineRuntimeFlags.createReader(() => {
        calls++;
        return root;
    });

    assert.ok(Object.isFrozen(reader));
    assert.strictEqual(reader.isEnabled(readerName), false);
    root = { [property]: true };
    assert.strictEqual(reader.isEnabled(readerName), true);
    assert.strictEqual(reader.isEnabled('unknown'), false);
    assert.strictEqual(calls, 3);
    assert.throws(() => OnlineRuntimeFlags.createReader(null), /getRoot is required/);
});

runTest('online runtime named readersは選択名をfrozen関数へ投影しrootを遅延評価する', () => {
    const selected = EXPECTED_READERS.slice(4, 7);
    let root = {};
    const readers = OnlineRuntimeFlags.createNamedReaders(() => root, selected);
    assert.deepStrictEqual(Object.keys(readers), selected);
    assert.ok(Object.isFrozen(readers));
    for (const name of selected) {
        assert.strictEqual(typeof readers[name], 'function');
        assert.strictEqual(readers[name](), false);
    }
    root = { [OnlineRuntimeFlags.names[selected[1]]]: true };
    assert.strictEqual(readers[selected[0]](), false);
    assert.strictEqual(readers[selected[1]](), true);
    assert.throws(
        () => OnlineRuntimeFlags.createNamedReaders(() => root, ['unknown']),
        /unknown runtime flag reader/
    );
    assert.throws(
        () => OnlineRuntimeFlags.createNamedReaders(() => root, null),
        /selectedNames must be an array/
    );
});

runTest('online runtime flagsは厳密なboolean trueだけを有効にする', () => {
    const reader = EXPECTED_READERS[0];
    const property = OnlineRuntimeFlags.names[reader];
    const root = {};

    assert.strictEqual(OnlineRuntimeFlags.isEnabled(reader, root), false);
    root[property] = 'true';
    assert.strictEqual(OnlineRuntimeFlags.isEnabled(reader, root), false);
    root[property] = 1;
    assert.strictEqual(OnlineRuntimeFlags.isEnabled(reader, root), false);
    root[property] = true;
    assert.strictEqual(OnlineRuntimeFlags.isEnabled(reader, root), true);
    assert.strictEqual(OnlineRuntimeFlags.isEnabled('unknown', root), false);
    assert.strictEqual(OnlineRuntimeFlags.isEnabled(reader, null), false);
});
