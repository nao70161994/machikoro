'use strict';

const DelayedHumanActionPolicy = (() => {
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

    return Object.freeze({ resumeDecision });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DelayedHumanActionPolicy;
if (typeof window !== 'undefined') window.DelayedHumanActionPolicy = DelayedHumanActionPolicy;
if (typeof globalThis !== 'undefined') globalThis.DelayedHumanActionPolicy = DelayedHumanActionPolicy;
