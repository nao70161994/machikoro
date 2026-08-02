'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const OnlineRuntimeFlags = require('../js/onlineRuntimeFlags');
const { runTest } = require('./helpers/test-utils');

const EXPECTED_READERS = Object.freeze(['isGameSchemaNegotiationTransportEnabled', 'isGameSchemaWireTransportEnabled', 'isGameSchemaSnapshotWireTransportEnabled', 'isGameSchemaRecreateWireTransportEnabled', 'isOnlineReconnectEventAuthorityEnabled', 'isOnlineReconnectEffectAuthorityEnabled', 'isOnlineReconnectStatusEffectAuthorityEnabled', 'isOnlineReconnectTimerAuthorityEnabled', 'isOnlineReconnectCallbackAuthorityEnabled', 'isOnlineReconnectQueuePlanAuthorityEnabled', 'isOnlineReconnectQueueEffectAuthorityEnabled', 'isOnlineRestoreQueueStateAuthorityEnabled', 'isOnlineRestoreQueueStoreReadAuthorityEnabled', 'isOnlineRestoreQueueStoreWriteAuthorityEnabled', 'isOnlineReconnectCleanupAuthorityEnabled', 'isOnlineReconnectCleanupEffectAuthorityEnabled', 'isOnlineReconnectRequestPlanAuthorityEnabled', 'isOnlineReconnectRequestEffectAuthorityEnabled', 'isOnlineRestoreAbortPlanAuthorityEnabled', 'isOnlineRestoreAbortEffectAuthorityEnabled', 'isOnlineActionTimeoutPlanAuthorityEnabled', 'isOnlineActionTimeoutEffectAuthorityEnabled', 'isIncomingGameActionPlanAuthorityEnabled', 'isAcceptedGameActionPlanAuthorityEnabled', 'isIncomingGameActionDecodeEffectAuthorityEnabled', 'isAcceptedGameActionDecodeEffectAuthorityEnabled', 'isIncomingGameActionApplyEffectAuthorityEnabled', 'isAcceptedGameActionApplyEffectAuthorityEnabled', 'isIncomingGameActionGapEffectAuthorityEnabled', 'isAcceptedGameActionGapEffectAuthorityEnabled', 'isIncomingGameActionNoGameEffectAuthorityEnabled', 'isAcceptedGameActionNoGameEffectAuthorityEnabled', 'isIncomingGameActionCommitEffectAuthorityEnabled', 'isAcceptedGameActionCommitEffectAuthorityEnabled', 'isOnlineSocketConnectPlanAuthorityEnabled', 'isOnlineSocketConnectEffectAuthorityEnabled', 'isOnlineSocketDisconnectPlanAuthorityEnabled', 'isOnlineSocketDisconnectEffectAuthorityEnabled', 'isOnlineHostChangedPlanAuthorityEnabled', 'isOnlineHostChangedEffectAuthorityEnabled', 'isPendingReconciliationPlanAuthorityEnabled', 'isRejoinActionLogPlanAuthorityEnabled', 'isLocalHostRestoreOfferPlanAuthorityEnabled', 'isOnlineRejoinPersistencePlanAuthorityEnabled', 'isOnlineRejoinPersistenceEffectAuthorityEnabled', 'isOnlinePendingResendPlanAuthorityEnabled', 'isOnlinePendingResendEffectAuthorityEnabled', 'isOnlineRestoreReplayPlanAuthorityEnabled', 'isOnlineRestoreReplayEffectAuthorityEnabled', 'isOnlineRestoreActivationPlanAuthorityEnabled', 'isOnlineRestoreActivationEffectAuthorityEnabled', 'isOnlineGameEngineShadowEnabled', 'isOnlineGameEngineAuthorityEnabled']);

runTest('online runtime flagsは全reader名とwindow propertyを一つの正本にする', () => {
    assert.deepStrictEqual(Object.keys(OnlineRuntimeFlags.names), EXPECTED_READERS);
    assert.strictEqual(new Set(Object.values(OnlineRuntimeFlags.names)).size, EXPECTED_READERS.length);
    assert.ok(Object.isFrozen(OnlineRuntimeFlags));
    assert.ok(Object.isFrozen(OnlineRuntimeFlags.names));

    const onlineSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'online.js'), 'utf8');
    for (const reader of EXPECTED_READERS) {
        assert.ok(onlineSource.includes("isOnlineRuntimeFlagEnabled('" + reader + "')"), reader);
        assert.ok(!onlineSource.includes(
            'window.' + OnlineRuntimeFlags.names[reader] + ' === true'
        ), reader);
    }
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
