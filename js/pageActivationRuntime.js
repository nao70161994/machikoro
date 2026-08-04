'use strict';

const PageActivationRuntime = (() => {
    function createRuntime(dependencies = {}) {
        const required = [
            'canRunHumanAction', 'cancelCpuSchedule', 'checkpoint', 'clearTimeout',
            'currentCpuHealth', 'getDocument', 'getWindow', 'now', 'resumeOnline',
            'resumeRlLoads', 'scheduleCpuTurn', 'setTimeout',
        ];
        for (const name of required) {
            if (typeof dependencies[name] !== 'function') {
                throw new TypeError(`page activation runtime dependency is required: ${name}`);
            }
        }
        if (!dependencies.delayedPolicy || !dependencies.pagePolicy) {
            throw new TypeError('page activation runtime policies are required');
        }
        const delayedController = dependencies.delayedPolicy.createScheduleController();
        const lifecycleController = dependencies.pagePolicy.createLifecycleController();

        function pageHidden() {
            const document = dependencies.getDocument();
            return !!(document && document.hidden);
        }

        function runDelayed(scheduledToken) {
            const state = delayedController.take(scheduledToken);
            if (!state) return;
            if (!dependencies.canRunHumanAction(state.action, state.playerIndex)) return;
            state.run();
        }

        function scheduleDelayed(action, playerIndex, run, delay = 600) {
            const state = delayedController.schedule({
                action,
                playerIndex,
                deadline: dependencies.now() + delay,
                run,
            });
            delayedController.setTimer(
                dependencies.setTimeout(() => runDelayed(state.token), delay)
            );
            return state;
        }

        function cancelDelayed() {
            const timer = delayedController.cancel();
            if (timer !== null) dependencies.clearTimeout(timer);
        }

        function resumeDelayed() {
            const hidden = pageHidden();
            const state = delayedController.getState();
            const hasCandidate = !hidden && delayedController.isPending() && !!state;
            const canRun = hasCandidate && dependencies.canRunHumanAction(state.action, state.playerIndex);
            const decision = dependencies.delayedPolicy.resumeDecision({
                pageHidden: hidden,
                pending: delayedController.isPending(),
                hasState: !!state,
                canRun,
                now: canRun ? dependencies.now() : 0,
                deadline: state ? state.deadline : 0,
            });
            if (decision === 'idle') return decision;
            if (decision === 'cancel') {
                cancelDelayed();
                return decision;
            }
            if (decision === 'run') {
                runDelayed(state.token);
                return decision;
            }
            const timer = delayedController.getTimer();
            if (timer !== null) dependencies.clearTimeout(timer);
            const renewed = delayedController.renew();
            delayedController.setTimer(dependencies.setTimeout(
                () => runDelayed(renewed.token),
                Math.max(0, renewed.deadline - dependencies.now())
            ));
            return decision;
        }

        function resumeCpu(reason) {
            if (pageHidden()) return 'hidden';
            const health = dependencies.currentCpuHealth();
            if (!health.isCpuTurn || health.blockedReason) return 'blocked';
            if (health.stepScheduled && dependencies.now() < health.scheduledUntil) return 'scheduled';
            dependencies.cancelCpuSchedule(reason + '-expire-stale');
            dependencies.scheduleCpuTurn(reason);
            return 'rescheduled';
        }

        function resume(reason) {
            const activationAt = dependencies.now();
            const hidden = pageHidden();
            const activation = lifecycleController.beginActivation(hidden, activationAt);
            const cpuBefore = dependencies.currentCpuHealth();
            dependencies.resumeRlLoads();
            resumeDelayed();
            dependencies.resumeOnline();
            resumeCpu(reason);
            const cpuAfter = dependencies.currentCpuHealth();
            dependencies.checkpoint(hidden ? 'page-activation-hidden' : 'page-activation-resume', {
                reason,
                hiddenForMs: activation.hiddenForMs,
                cpuOutcome: dependencies.pagePolicy.cpuOutcome(cpuBefore, cpuAfter, hidden),
                cpuBefore,
                cpuAfter,
            });
            lifecycleController.finishActivation(hidden);
        }

        function bind() {
            if (!lifecycleController.claimBinding()) return false;
            const document = dependencies.getDocument();
            if (document && typeof document.addEventListener === 'function') {
                document.addEventListener('visibilitychange', () => resume('visibility-resume'));
            }
            const window = dependencies.getWindow();
            if (window && typeof window.addEventListener === 'function') {
                window.addEventListener('pageshow', () => resume('pageshow-resume'));
            }
            return true;
        }

        return Object.freeze({
            bind,
            cancelDelayed,
            isDelayedPending: () => delayedController.isPending(),
            pageHiddenDurationMs: now => lifecycleController.hiddenDurationMs(now),
            resume,
            resumeCpu,
            resumeDelayed,
            runDelayed,
            scheduleDelayed,
            setDelayedDeadline: deadline => delayedController.updateDeadline(deadline),
            setHiddenAt: value => lifecycleController.setHiddenAt(value),
        });
    }
    return Object.freeze({ createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PageActivationRuntime;
if (typeof window !== 'undefined') Object.assign(window, { PageActivationRuntime });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { PageActivationRuntime });
