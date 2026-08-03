'use strict';

const UiRuntimeSnapshot = (() => {
    function normalizePendingActions(entries) {
        if (!Array.isArray(entries)) return [];
        return entries.map(entry => ({
            action: entry && entry.action,
            field: entry && entry.field,
            count: entry && entry.count,
        }));
    }

    function build(input = {}) {
        const game = input.game || null;
        const online = input.online || {};
        return {
            reason: input.reason || '',
            timestamp: input.timestamp || '',
            phase: game && game.phase,
            builtThisTurn: !!(game && game.builtThisTurn),
            turnCount: game && game.turnCount,
            currentPlayerIndex: game && game.currentPlayerIndex,
            isCpuTurn: input.isCpuTurn === true,
            isOnlineGame: online.isOnlineGame ?? null,
            myPlayerIndex: online.myPlayerIndex ?? null,
            pendingFields: game ? {
                pendingTV: game.pendingTV || 0,
                pendingBusiness: game.pendingBusiness || 0,
                pendingCleaning: game.pendingCleaning || 0,
                pendingMover: game.pendingMover || 0,
                pendingRenovation: game.pendingRenovation || 0,
                pendingIT: !!game.pendingIT,
            } : null,
            pendingActions: normalizePendingActions(input.pendingActions),
            ui: { ...(input.ui || {}) },
        };
    }

    return Object.freeze({ build, normalizePendingActions });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiRuntimeSnapshot;
if (typeof window !== 'undefined') Object.assign(window, { UiRuntimeSnapshot });
if (typeof globalThis !== 'undefined') globalThis.UiRuntimeSnapshot = UiRuntimeSnapshot;
