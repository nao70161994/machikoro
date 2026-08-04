'use strict';

const DelayedHumanActionPolicy = (() => {
    function createScheduleController() {
        let pending = false;
        let timer = null;
        let token = 0;
        let state = null;

        function isPending() { return pending; }
        function getTimer() { return timer; }
        function getState() { return state; }
        function schedule(input) {
            pending = true;
            token++;
            state = Object.freeze({
                token,
                action: input.action,
                playerIndex: input.playerIndex,
                deadline: input.deadline,
                run: input.run,
            });
            return state;
        }
        function setTimer(value) { timer = value; }
        function renew() {
            if (!state) return null;
            token++;
            state = Object.freeze(Object.assign({}, state, { token }));
            return state;
        }
        function take(scheduledToken) {
            if (!state || scheduledToken !== token || scheduledToken !== state.token) return null;
            const current = state;
            pending = false;
            timer = null;
            state = null;
            return current;
        }
        function cancel() {
            const currentTimer = timer;
            token++;
            pending = false;
            state = null;
            timer = null;
            return currentTimer;
        }
        function updateDeadline(deadline) {
            if (!state) return null;
            state = Object.freeze(Object.assign({}, state, { deadline }));
            return state;
        }
        function snapshot() {
            return Object.freeze({
                pending,
                token,
                hasTimer: timer !== null,
                hasState: !!state,
            });
        }

        return Object.freeze({
            isPending,
            getTimer,
            getState,
            schedule,
            setTimer,
            renew,
            take,
            cancel,
            updateDeadline,
            snapshot,
        });
    }

    /**
     * @param {{
     *   pageHidden: boolean,
     *   pending: boolean,
     *   hasState: boolean,
     *   canRun: boolean,
     *   now: number,
     *   deadline: number
     * }} input
     * @returns {'idle' | 'cancel' | 'run' | 'reschedule'}
     */
    function resumeDecision(input) {
        if (input.pageHidden) return 'idle';
        if (!input.pending || !input.hasState) return 'idle';
        if (!input.canRun) return 'cancel';
        if (input.now >= input.deadline) return 'run';
        return 'reschedule';
    }

    return Object.freeze({ createScheduleController, resumeDecision });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DelayedHumanActionPolicy;
if (typeof window !== 'undefined') window.DelayedHumanActionPolicy = DelayedHumanActionPolicy;
if (typeof globalThis !== 'undefined') globalThis.DelayedHumanActionPolicy = DelayedHumanActionPolicy;
