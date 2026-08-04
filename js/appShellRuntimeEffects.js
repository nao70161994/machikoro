'use strict';

const AppShellRuntimeEffects = (() => {
    function createFromResolver(resolveDependency, options = {}) {
        if (typeof resolveDependency !== 'function') throw new TypeError('resolveDependency is required');
        const now = typeof options.now === 'function' ? options.now : () => Date.now();

        function optionalCall(name, ...args) {
            const effect = resolveDependency(name);
            if (typeof effect !== 'function') return Object.freeze({ available: false, value: undefined });
            return Object.freeze({ available: true, value: effect(...args) });
        }

        function requiredCall(name, ...args) {
            const effect = resolveDependency(name);
            if (typeof effect !== 'function') throw new TypeError(`${name} effect is unavailable`);
            return effect(...args);
        }

        function schedulerSnapshot() {
            const scheduler = resolveDependency('cpuTurnScheduler');
            if (scheduler && typeof scheduler.getHealth === 'function') {
                const health = scheduler.getHealth() || {};
                return Object.freeze({
                    blockedReason: health.blockedReason || '',
                    token: Number.isInteger(health.token) ? health.token : null,
                    scheduledUntil: Number.isFinite(health.scheduledUntil) ? health.scheduledUntil : 0,
                    stepScheduled: !!health.stepScheduled,
                });
            }
            const controller = resolveDependency('cpuSchedulerStateController');
            if (!controller || typeof controller.snapshot !== 'function' ||
                    typeof controller.isStepScheduled !== 'function') return null;
            const state = controller.snapshot() || {};
            return Object.freeze({
                blockedReason: '',
                token: Number.isInteger(state.scheduleToken) ? state.scheduleToken : null,
                scheduledUntil: Number.isFinite(state.scheduledUntil) ? state.scheduledUntil : 0,
                stepScheduled: controller.isStepScheduled() && now() < state.scheduledUntil,
            });
        }

        function scheduleCpu(reason) {
            const scheduler = resolveDependency('cpuTurnScheduler');
            if (scheduler && typeof scheduler.schedule === 'function') {
                return Object.freeze({ source: 'scheduler', health: scheduler.schedule(reason) || null });
            }
            const fallback = optionalCall('scheduleCpu');
            return Object.freeze({
                source: fallback.available ? 'legacy' : 'none',
                health: null,
            });
        }

        function cancelCpu(reason) {
            const scheduler = resolveDependency('cpuTurnScheduler');
            if (scheduler && typeof scheduler.cancel === 'function') {
                scheduler.cancel(reason);
                return 'scheduler';
            }
            return optionalCall('cancelCpuSchedule', reason).available ? 'legacy' : 'none';
        }

        function onlineActionFlightState() {
            const getter = optionalCall('getOnlineActionFlightState');
            if (getter.available) return getter.value;
            return Object.freeze({
                inFlight: !!resolveDependency('onlineActionInFlight'),
                startedAt: Number(resolveDependency('onlineActionInFlightAt')) || 0,
            });
        }

        return Object.freeze({
            cancelCpu,
            drawCitySkyline: () => requiredCall('drawCitySkyline'),
            handleOnlineActionTimeout: () => optionalCall('handleOnlineActionTimeout'),
            loadSettings: () => requiredCall('loadSettings'),
            onlineActionFlightState,
            preloadLocalRlModels: reason => optionalCall('preloadLocalRlModels', reason).available,
            preloadOnlineRlModels: reason => optionalCall('preloadOnlineRlModels', reason).available,
            render: () => optionalCall('render').available,
            renderBuildMenu: () => optionalCall('renderBuildMenu').available,
            renderOnlinePlayerSettings: () => requiredCall('renderOnlinePlayerSettings'),
            resumeGame: () => requiredCall('resumeGame'),
            scheduleCpu,
            schedulerSnapshot,
            updateResumeButton: () => requiredCall('updateResumeButton'),
        });
    }

    return Object.freeze({ createFromResolver });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AppShellRuntimeEffects;
if (typeof window !== 'undefined') window.AppShellRuntimeEffects = AppShellRuntimeEffects;
if (typeof globalThis !== 'undefined') globalThis.AppShellRuntimeEffects = AppShellRuntimeEffects;
