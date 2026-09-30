'use strict';

function createOnlineRestoreRequestRuntime(dependencies = {}) {
    function readLocalRestoreBundle() {
        try {
            if (dependencies.isRestoreBundleIncomplete()) return null;
            const gameStartPayload = dependencies.readGameStartPayload();
            if (!gameStartPayload || gameStartPayload.schemaVersion !== dependencies.schemaVersion ||
                    !Array.isArray(gameStartPayload.reconnectTokenHashes)) return null;
            const restoreAudit = dependencies.readRestoreAudit();
            const stateSnapshot = restoreAudit ? dependencies.readStateSnapshot() : null;
            const actionLog = dependencies.readActionLog();
            return { gameStartPayload, stateSnapshot, actionLog, restoreAudit };
        } catch (_) {
            return null;
        }
    }

    function onlineHostlessRestoreIdentity() {
        const session = dependencies.getSession();
        return {
            roomId: session.myRoomId,
            playerIndex: session.myOriginalPlayerIndex,
            playerName: session.myPlayerName,
            reconnectToken: session.reconnectToken,
        };
    }

    function sendRecreateRoomFromBundle(bundle) {
        const session = dependencies.getSession();
        const payload = {
            roomId: session.myRoomId,
            gameStartPayload: bundle.gameStartPayload,
            stateSnapshot: bundle.stateSnapshot,
            actionLog: bundle.actionLog,
            restoreAudit: bundle.restoreAudit,
            playerIndex: session.myOriginalPlayerIndex,
            playerName: session.myPlayerName,
            reconnectToken: session.reconnectToken,
        };
        const encoded = dependencies.encodeRecreateRoomPayload(payload);
        if (!encoded.ok || !session.socket || session.socket.connected === false) {
            dependencies.setStatusText('❌ 復元payloadのschema変換に失敗しました');
            return false;
        }
        dependencies.recreateRoom(encoded.value);
        return true;
    }

    function tryRestoreRoom() {
        try {
            if (dependencies.isRestoreBundleIncomplete()) {
                dependencies.setStatusText('❌ 完全な復元履歴を取得できないため、自動復元を停止しました');
                return false;
            }
            const gameStartPayload = dependencies.readGameStartPayload();
            if (!gameStartPayload) {
                dependencies.setStatusText('❌ 復元データが見つかりません');
                return;
            }
            if (gameStartPayload.schemaVersion !== dependencies.schemaVersion ||
                    !Array.isArray(gameStartPayload.reconnectTokenHashes)) {
                dependencies.clearRestoreBundle();
                dependencies.setStatusText('❌ 古い復元データのため再接続できません');
                return;
            }
            const session = dependencies.getSession();
            if (gameStartPayload.hostPlayerIndex !== session.myOriginalPlayerIndex) return false;
            const restoreAudit = dependencies.readRestoreAudit();
            const stateSnapshot = restoreAudit ? dependencies.readStateSnapshot() : null;
            const actionLog = dependencies.readActionLog();
            dependencies.setStatusText('♻️ サーバー再起動を検知。ゲームを復元中...');
            return sendRecreateRoomFromBundle({
                gameStartPayload,
                stateSnapshot,
                actionLog,
                restoreAudit,
            });
        } catch (_) {
            dependencies.setStatusText('❌ 復元に失敗しました');
            return false;
        }
    }

    function requestHostlessRestore() {
        const session = dependencies.getSession();
        const currentSocket = session.socket;
        if (!currentSocket || currentSocket.connected === false || dependencies.isHostlessRestorePending()) {
            return false;
        }
        const bundle = readLocalRestoreBundle();
        const payload = dependencies.buildHostlessRestoreRequest(bundle, onlineHostlessRestoreIdentity());
        if (!payload || !dependencies.beginHostlessRestore()) return false;
        dependencies.setReconnectFlag(true);
        dependencies.requestHostlessRestore(payload, currentSocket);
        return true;
    }

    function submitHostlessRestoreCandidate(generation) {
        const session = dependencies.getSession();
        const currentSocket = session.socket;
        const bundle = readLocalRestoreBundle();
        if (!bundle || bundle.gameStartPayload.hostlessRestoreGeneration !== generation) return false;
        const payload = dependencies.buildHostlessRestoreCandidate(bundle, onlineHostlessRestoreIdentity());
        if (!payload || !currentSocket || currentSocket.connected === false) return false;
        dependencies.submitHostlessRestoreCandidate(payload, currentSocket);
        return true;
    }

    return Object.freeze({
        readLocalRestoreBundle,
        onlineHostlessRestoreIdentity,
        requestHostlessRestore,
        sendRecreateRoomFromBundle,
        submitHostlessRestoreCandidate,
        tryRestoreRoom,
    });
}

const OnlineRestoreRequestRuntime = Object.freeze({ create: createOnlineRestoreRequestRuntime });
if (typeof module !== 'undefined' && module.exports) module.exports = OnlineRestoreRequestRuntime;
