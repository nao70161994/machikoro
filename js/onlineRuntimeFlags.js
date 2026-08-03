'use strict';

const OnlineRuntimeFlags = (() => {
    /** @type {Readonly<Record<string, string>>} */
    const names = Object.freeze({
        isGameSchemaNegotiationTransportEnabled: 'MACHIKORO_GAME_SCHEMA_NEGOTIATION_ENABLED',
        isGameSchemaWireTransportEnabled: 'MACHIKORO_GAME_SCHEMA_WIRE_ENABLED',
        isGameSchemaSnapshotWireTransportEnabled: 'MACHIKORO_GAME_SCHEMA_SNAPSHOT_WIRE_ENABLED',
        isGameSchemaRecreateWireTransportEnabled: 'MACHIKORO_GAME_SCHEMA_RECREATE_WIRE_ENABLED',
        isOnlineReconnectEventAuthorityEnabled: 'MACHIKORO_ONLINE_RECONNECT_EVENT_AUTHORITY_ENABLED',
        isOnlineReconnectEffectAuthorityEnabled: 'MACHIKORO_ONLINE_RECONNECT_EFFECT_AUTHORITY_ENABLED',
        isOnlineReconnectStatusEffectAuthorityEnabled: 'MACHIKORO_ONLINE_RECONNECT_STATUS_EFFECT_AUTHORITY_ENABLED',
        isOnlineReconnectTimerAuthorityEnabled: 'MACHIKORO_ONLINE_RECONNECT_TIMER_AUTHORITY_ENABLED',
        isOnlineReconnectCallbackAuthorityEnabled: 'MACHIKORO_ONLINE_RECONNECT_CALLBACK_AUTHORITY_ENABLED',
        isOnlineReconnectQueuePlanAuthorityEnabled: 'MACHIKORO_ONLINE_RECONNECT_QUEUE_PLAN_AUTHORITY_ENABLED',
        isOnlineReconnectQueueEffectAuthorityEnabled: 'MACHIKORO_ONLINE_RECONNECT_QUEUE_EFFECT_AUTHORITY_ENABLED',
        isOnlineRestoreQueueStateAuthorityEnabled: 'MACHIKORO_ONLINE_RESTORE_QUEUE_STATE_AUTHORITY_ENABLED',
        isOnlineRestoreQueueStoreReadAuthorityEnabled: 'MACHIKORO_ONLINE_RESTORE_QUEUE_STORE_READ_AUTHORITY_ENABLED',
        isOnlineRestoreQueueStoreWriteAuthorityEnabled: 'MACHIKORO_ONLINE_RESTORE_QUEUE_STORE_WRITE_AUTHORITY_ENABLED',
        isOnlineReconnectCleanupAuthorityEnabled: 'MACHIKORO_ONLINE_RECONNECT_CLEANUP_AUTHORITY_ENABLED',
        isOnlineReconnectCleanupEffectAuthorityEnabled: 'MACHIKORO_ONLINE_RECONNECT_CLEANUP_EFFECT_AUTHORITY_ENABLED',
        isOnlineReconnectRequestPlanAuthorityEnabled: 'MACHIKORO_ONLINE_RECONNECT_REQUEST_PLAN_AUTHORITY_ENABLED',
        isOnlineReconnectRequestEffectAuthorityEnabled: 'MACHIKORO_ONLINE_RECONNECT_REQUEST_EFFECT_AUTHORITY_ENABLED',
        isOnlineRestoreAbortPlanAuthorityEnabled: 'MACHIKORO_ONLINE_RESTORE_ABORT_PLAN_AUTHORITY_ENABLED',
        isOnlineRestoreAbortEffectAuthorityEnabled: 'MACHIKORO_ONLINE_RESTORE_ABORT_EFFECT_AUTHORITY_ENABLED',
        isOnlineActionTimeoutPlanAuthorityEnabled: 'MACHIKORO_ONLINE_ACTION_TIMEOUT_PLAN_AUTHORITY_ENABLED',
        isOnlineActionTimeoutEffectAuthorityEnabled: 'MACHIKORO_ONLINE_ACTION_TIMEOUT_EFFECT_AUTHORITY_ENABLED',
        isIncomingGameActionPlanAuthorityEnabled: 'MACHIKORO_ONLINE_GAME_ACTION_PLAN_AUTHORITY_ENABLED',
        isAcceptedGameActionPlanAuthorityEnabled: 'MACHIKORO_ONLINE_ACTION_ACCEPTED_PLAN_AUTHORITY_ENABLED',
        isIncomingGameActionDecodeEffectAuthorityEnabled: 'MACHIKORO_ONLINE_GAME_ACTION_DECODE_EFFECT_AUTHORITY_ENABLED',
        isAcceptedGameActionDecodeEffectAuthorityEnabled: 'MACHIKORO_ONLINE_ACTION_ACCEPTED_DECODE_EFFECT_AUTHORITY_ENABLED',
        isIncomingGameActionApplyEffectAuthorityEnabled: 'MACHIKORO_ONLINE_GAME_ACTION_APPLY_EFFECT_AUTHORITY_ENABLED',
        isAcceptedGameActionApplyEffectAuthorityEnabled: 'MACHIKORO_ONLINE_ACTION_ACCEPTED_APPLY_EFFECT_AUTHORITY_ENABLED',
        isIncomingGameActionGapEffectAuthorityEnabled: 'MACHIKORO_ONLINE_GAME_ACTION_GAP_EFFECT_AUTHORITY_ENABLED',
        isAcceptedGameActionGapEffectAuthorityEnabled: 'MACHIKORO_ONLINE_ACTION_ACCEPTED_GAP_EFFECT_AUTHORITY_ENABLED',
        isIncomingGameActionNoGameEffectAuthorityEnabled: 'MACHIKORO_ONLINE_GAME_ACTION_NO_GAME_EFFECT_AUTHORITY_ENABLED',
        isAcceptedGameActionNoGameEffectAuthorityEnabled: 'MACHIKORO_ONLINE_ACTION_ACCEPTED_NO_GAME_EFFECT_AUTHORITY_ENABLED',
        isIncomingGameActionCommitEffectAuthorityEnabled: 'MACHIKORO_ONLINE_GAME_ACTION_COMMIT_EFFECT_AUTHORITY_ENABLED',
        isAcceptedGameActionCommitEffectAuthorityEnabled: 'MACHIKORO_ONLINE_ACTION_ACCEPTED_COMMIT_EFFECT_AUTHORITY_ENABLED',
        isOnlineSocketConnectPlanAuthorityEnabled: 'MACHIKORO_ONLINE_SOCKET_CONNECT_PLAN_AUTHORITY_ENABLED',
        isOnlineSocketConnectEffectAuthorityEnabled: 'MACHIKORO_ONLINE_SOCKET_CONNECT_EFFECT_AUTHORITY_ENABLED',
        isOnlineSocketDisconnectPlanAuthorityEnabled: 'MACHIKORO_ONLINE_SOCKET_DISCONNECT_PLAN_AUTHORITY_ENABLED',
        isOnlineSocketDisconnectEffectAuthorityEnabled: 'MACHIKORO_ONLINE_SOCKET_DISCONNECT_EFFECT_AUTHORITY_ENABLED',
        isOnlineHostChangedPlanAuthorityEnabled: 'MACHIKORO_ONLINE_HOST_CHANGED_PLAN_AUTHORITY_ENABLED',
        isOnlineHostChangedEffectAuthorityEnabled: 'MACHIKORO_ONLINE_HOST_CHANGED_EFFECT_AUTHORITY_ENABLED',
        isPendingReconciliationPlanAuthorityEnabled: 'MACHIKORO_ONLINE_PENDING_RECONCILIATION_PLAN_AUTHORITY_ENABLED',
        isRejoinActionLogPlanAuthorityEnabled: 'MACHIKORO_ONLINE_REJOIN_ACTION_LOG_PLAN_AUTHORITY_ENABLED',
        isLocalHostRestoreOfferPlanAuthorityEnabled: 'MACHIKORO_ONLINE_LOCAL_HOST_RESTORE_OFFER_PLAN_AUTHORITY_ENABLED',
        isOnlineRejoinPersistencePlanAuthorityEnabled: 'MACHIKORO_ONLINE_REJOIN_PERSISTENCE_PLAN_AUTHORITY_ENABLED',
        isOnlineRejoinPersistenceEffectAuthorityEnabled: 'MACHIKORO_ONLINE_REJOIN_PERSISTENCE_EFFECT_AUTHORITY_ENABLED',
        isOnlinePendingResendPlanAuthorityEnabled: 'MACHIKORO_ONLINE_PENDING_RESEND_PLAN_AUTHORITY_ENABLED',
        isOnlinePendingResendEffectAuthorityEnabled: 'MACHIKORO_ONLINE_PENDING_RESEND_EFFECT_AUTHORITY_ENABLED',
        isOnlineRestoreReplayPlanAuthorityEnabled: 'MACHIKORO_ONLINE_RESTORE_REPLAY_PLAN_AUTHORITY_ENABLED',
        isOnlineRestoreReplayEffectAuthorityEnabled: 'MACHIKORO_ONLINE_RESTORE_REPLAY_EFFECT_AUTHORITY_ENABLED',
        isOnlineRestoreActivationPlanAuthorityEnabled: 'MACHIKORO_ONLINE_RESTORE_ACTIVATION_PLAN_AUTHORITY_ENABLED',
        isOnlineRestoreActivationEffectAuthorityEnabled: 'MACHIKORO_ONLINE_RESTORE_ACTIVATION_EFFECT_AUTHORITY_ENABLED',
        isOnlineGameEngineShadowEnabled: 'MACHIKORO_ONLINE_GAME_ENGINE_SHADOW_ENABLED',
        isOnlineGameEngineAuthorityEnabled: 'MACHIKORO_ONLINE_GAME_ENGINE_AUTHORITY_ENABLED',
    });

    /**
     * @param {string} name
     * @param {Record<string, unknown>|null|undefined} root
     * @returns {boolean}
     */
    function isEnabled(name, root) {
        const property = names[name];
        return typeof property === 'string' &&
            !!root &&
            root[property] === true;
    }

    function createReader(getRoot) {
        if (typeof getRoot !== 'function') throw new TypeError('getRoot is required');
        return Object.freeze({
            isEnabled(name) {
                return isEnabled(name, getRoot());
            },
        });
    }

    return Object.freeze({
        names,
        isEnabled,
        createReader,
    });
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = OnlineRuntimeFlags;
}
