'use strict';

const ONLINE_HOSTLESS_RESTORE_SCHEMA_VERSION = 1;
const ONLINE_HOSTLESS_RESTORE_MAX_ATTEMPTS = 3;
const ONLINE_HOSTLESS_RESTORE_EVENTS = Object.freeze({
    REQUEST: 'requestHostlessRestore',
    COLLECT: 'hostlessRestoreCollect',
    CANDIDATE: 'submitHostlessRestoreCandidate',
    CONFIRMATION: 'hostlessRestoreConfirmation',
    CONFIRM: 'confirmHostlessRestore',
    STATUS: 'hostlessRestoreStatus',
    APPROVED: 'hostlessRestoreApproved',
});
const ONLINE_HOSTLESS_RESTORE_STATUS_MESSAGES = Object.freeze({
    disabled: 'このサーバーでは参加者データからの復元が一時停止されています。',
    'unsupported-client': '旧バージョンの参加者が含まれるため、元のホストによる復元を待ちます。',
    'original-host': '元のホストによる通常復元を続けます。',
    'host-restored': '元のホストが復元しました。再接続します。',
    'generation-mismatch': '復元候補の世代が一致しません。保存データを残して再試行してください。',
    'insufficient-candidates': '一致確認に必要な参加者が足りません。保存データを残して再試行してください。',
    'candidate-mismatch': '参加者間の復元候補が一致しません。多数決では復元しません。',
    'completed-game': 'この対局は完了済みのため復元しません。',
    'attempt-limit': '参加者データからの復元回数が上限に達しました。',
    'confirmation-exhausted': '復元を承認できる参加者がいませんでした。',
    'retention-timeout': '復元候補の確認時間を超過しました。',
    'restore-failed': '参加者データからの復元に失敗しました。',
});

function hostlessHumanIndices(gameStartPayload) {
    const names = Array.isArray(gameStartPayload?.playerNames) ? gameStartPayload.playerNames : [];
    const settings = Array.isArray(gameStartPayload?.playerSettings) ? gameStartPayload.playerSettings : [];
    if (settings.length === 0) return names.map((_, index) => index);
    return names.map((_, index) => settings[index]?.type === 'cpu' ? null : index).filter(Number.isInteger);
}

function supportsHostlessRestore(bundle, identity) {
    const gameStartPayload = bundle?.gameStartPayload;
    const capabilities = gameStartPayload?.hostlessRestoreCapabilities;
    if (!gameStartPayload || !Array.isArray(capabilities) ||
            capabilities.length !== gameStartPayload.playerNames?.length) return false;
    if (!Number.isInteger(identity?.playerIndex) ||
            identity.playerIndex === gameStartPayload.hostPlayerIndex) return false;
    if ((gameStartPayload.hostlessRestoreCount || 0) >= ONLINE_HOSTLESS_RESTORE_MAX_ATTEMPTS) return false;
    return hostlessHumanIndices(gameStartPayload)
        .every(index => capabilities[index] === ONLINE_HOSTLESS_RESTORE_SCHEMA_VERSION);
}

function hostlessIdentityFields(bundle, identity) {
    return {
        roomId: identity.roomId,
        gameStartPayload: bundle.gameStartPayload,
        playerIndex: identity.playerIndex,
        playerName: identity.playerName,
        reconnectToken: identity.reconnectToken,
        capabilityVersion: ONLINE_HOSTLESS_RESTORE_SCHEMA_VERSION,
    };
}

const OnlinePayload = Object.freeze({
    buildRejoin(session, clientVersion) {
        return {
            roomId: session && session.roomId,
            playerIndex: session && session.playerIndex,
            playerName: session && session.playerName,
            reconnectToken: session && session.reconnectToken,
            clientVersion,
            hostlessRestoreVersion: ONLINE_HOSTLESS_RESTORE_SCHEMA_VERSION,
        };
    },
    supportsHostlessRestore,
    buildHostlessRestoreRequest(bundle, identity) {
        if (!supportsHostlessRestore(bundle, identity)) return null;
        return hostlessIdentityFields(bundle, identity);
    },
    buildHostlessRestoreCandidate(bundle, identity) {
        if (!supportsHostlessRestore(bundle, identity)) return null;
        return Object.assign(hostlessIdentityFields(bundle, identity), {
            stateSnapshot: bundle.stateSnapshot || null,
            actionLog: Array.isArray(bundle.actionLog) ? bundle.actionLog : [],
            restoreAudit: bundle.restoreAudit || null,
        });
    },
    hostlessRestoreStatusMessage(reason) {
        return ONLINE_HOSTLESS_RESTORE_STATUS_MESSAGES[reason] ||
            '参加者データからの復元を完了できませんでした。保存データは削除されていません。';
    },
    hostlessRestoreEvents: ONLINE_HOSTLESS_RESTORE_EVENTS,
    hostlessRestoreVersion: ONLINE_HOSTLESS_RESTORE_SCHEMA_VERSION,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        OnlinePayload,
        ONLINE_HOSTLESS_RESTORE_SCHEMA_VERSION,
        ONLINE_HOSTLESS_RESTORE_EVENTS,
    };
}
