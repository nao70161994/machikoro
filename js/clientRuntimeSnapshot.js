'use strict';

const ClientRuntimeSnapshot = (() => {
    function build(input = {}) {
        const game = input.game || {};
        const cpu = input.cpu || {};
        const online = input.online || {};
        const dom = input.dom || {};
        return {
            reason: input.reason || '',
            timestamp: input.timestamp || '',
            phase: game.phase || '',
            hasWinner: game.hasWinner === true,
            builtThisTurn: game.builtThisTurn === true,
            turnCount: game.turnCount ?? null,
            currentPlayerIndex: game.currentPlayerIndex ?? null,
            isCpuTurn: cpu.isCpuTurn === true,
            cpuStepScheduled: cpu.stepScheduled === true,
            cpuSchedulerHealth: cpu.schedulerHealth || null,
            isOnlineGame: online.isOnlineGame ?? null,
            isRoomHost: online.isRoomHost ?? null,
            myPlayerIndex: online.myPlayerIndex ?? null,
            onlineActionInFlight: online.actionInFlight ?? null,
            onlineActionInFlightAt: online.actionInFlightAt ?? null,
            isReconnectingOnline: online.isReconnecting ?? null,
            socketConnected: online.socketConnected ?? null,
            allowedActions: Array.isArray(input.allowedActions) ? input.allowedActions : [],
            activeElement: dom.activeElement || null,
            bodyClassName: dom.bodyClassName || '',
            visibleModals: Array.isArray(dom.visibleModals) ? dom.visibleModals : [],
            overlays: dom.overlays || {},
            actionButtons: dom.actionButtons || { buttons: {}, enabled: [] },
            pendingFields: game.pendingFields || null,
            ui: dom.ui || {},
        };
    }

    return Object.freeze({ build });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ClientRuntimeSnapshot;
if (typeof window !== 'undefined') Object.assign(window, { ClientRuntimeSnapshot });
if (typeof globalThis !== 'undefined') globalThis.ClientRuntimeSnapshot = ClientRuntimeSnapshot;
