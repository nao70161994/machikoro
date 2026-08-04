'use strict';

const UiWatchdogAsyncRecovery = (() => {
    function createRuntime(dependencies = {}) {
        const {
            buildSnapshot,
            checkpoint,
            compactSnapshot,
            runtimeEffects,
        } = dependencies;
        if (typeof buildSnapshot !== 'function') throw new TypeError('buildSnapshot is required');
        if (typeof checkpoint !== 'function') throw new TypeError('checkpoint is required');
        if (typeof compactSnapshot !== 'function') throw new TypeError('compactSnapshot is required');
        if (!runtimeEffects || typeof runtimeEffects.scheduleCpu !== 'function' ||
                typeof runtimeEffects.handleOnlineActionTimeout !== 'function') {
            throw new TypeError('runtimeEffects is required');
        }

        function recoverCpuTurnStall(snapshot) {
            if (!snapshot || !snapshot.isCpuTurn || snapshot.onlineActionInFlight || snapshot.isReconnectingOnline) return false;
            if (snapshot.isOnlineGame && !snapshot.isRoomHost) return false;
            try {
                const scheduled = runtimeEffects.scheduleCpu('watchdog-cpu-turn-stall');
                if (scheduled.source === 'scheduler') {
                    const health = scheduled.health;
                    const recovered = !!(health && health.stepScheduled);
                    const after = buildSnapshot('cpu-turn-stall-recovery-after');
                    checkpoint('freeze-watchdog-cpu-reschedule', {
                        recovered,
                        schedulerHealth: health || null,
                        before: compactSnapshot(snapshot),
                        after: compactSnapshot(after),
                    });
                    return recovered;
                }
                if (scheduled.source === 'none') return false;
            } catch (_) {
                return false;
            }
            const after = buildSnapshot('cpu-turn-stall-recovery-after');
            const recovered = !!after.cpuStepScheduled;
            checkpoint('freeze-watchdog-cpu-reschedule', {
                recovered,
                before: compactSnapshot(snapshot),
                after: compactSnapshot(after),
            });
            return recovered;
        }

        function recoverOnlineActionInFlightStall(snapshot) {
            if (!snapshot || !snapshot.onlineActionInFlight) return false;
            try {
                const timeout = runtimeEffects.handleOnlineActionTimeout();
                if (!timeout.available) return false;
                const recovered = timeout.value;
                checkpoint('freeze-watchdog-online-action-resync', {
                    recovered: !!recovered,
                    onlineActionInFlightAt: snapshot.onlineActionInFlightAt || null,
                    before: compactSnapshot(snapshot),
                    after: compactSnapshot(buildSnapshot('online-action-stall-recovery-after')),
                });
                return !!recovered;
            } catch (_) {
                return false;
            }
        }

        return Object.freeze({ recoverCpuTurnStall, recoverOnlineActionInFlightStall });
    }

    return Object.freeze({ createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiWatchdogAsyncRecovery;
if (typeof window !== 'undefined') window.UiWatchdogAsyncRecovery = UiWatchdogAsyncRecovery;
if (typeof globalThis !== 'undefined') globalThis.UiWatchdogAsyncRecovery = UiWatchdogAsyncRecovery;
