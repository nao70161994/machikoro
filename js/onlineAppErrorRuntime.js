'use strict';

function createOnlineAppErrorRuntime(dependencies = {}) {
    function handleAppError(message) {
        const session = dependencies.getSession();
        dependencies.finishLobbyRequest();
        dependencies.setActionInFlight(false);
        dependencies.setCreateRoomPending(false);
        if (message === 'ROOM_NOT_FOUND' && session.isReconnectingOnline) {
            if (session.isRoomHost) {
                if (!dependencies.tryRestoreRoom()) dependencies.scheduleRejoinRetry();
            } else {
                dependencies.scheduleRejoinRetry();
            }
            return;
        }
        if (message === '無効な操作です' && session.isOnlineGame && session.socket && session.myRoomId &&
                session.myOriginalPlayerIndex >= 0 && session.myPlayerName && session.reconnectToken) {
            dependencies.clearPendingOutboundAction({ requireExplicitRoomId: true });
            dependencies.setReconnectFlag(true);
            dependencies.invalidateCpuSchedule();
            dependencies.setStatusText('⚠️ 操作がサーバーで拒否されました。状態を再同期しています...');
            dependencies.emitRejoinRequest();
            return;
        }
        const recreateErrorPlan = dependencies.createRecreateErrorPlan(message, {
            isReconnectingOnline: session.isReconnectingOnline,
            isRoomHost: session.isRoomHost,
            hostlessRestorePending: dependencies.isHostlessRestorePending(),
        });
        if (dependencies.isRetryableRecreateError(recreateErrorPlan)) {
            dependencies.runRetryableCleanup(recreateErrorPlan);
            dependencies.setStatusText(
                `⚠️ ${message} 復元データは保持されています。時間をおいて「続きから」を押してください。`
            );
            return;
        }
        const cleanupSelection = dependencies.selectTerminalCleanup(session.isReconnectingOnline);
        if (cleanupSelection.cleanup) dependencies.runTerminalCleanup(cleanupSelection);
        dependencies.setStatusText(`❌ ${message}`);
    }

    return Object.freeze({ handleAppError });
}

const OnlineAppErrorRuntime = Object.freeze({ create: createOnlineAppErrorRuntime });
if (typeof module !== 'undefined' && module.exports) module.exports = OnlineAppErrorRuntime;
