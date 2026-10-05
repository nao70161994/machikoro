'use strict';

const LocalResumePreloadRuntime = (() => {
    /**
     * @typedef {{
     *   controller: {
     *     snapshot: () => { pending: boolean, generation: number },
     *     setPending: (pending: boolean) => { pending: boolean, generation: number },
     *     start: () => { pending: boolean, generation: number },
     *     cancel: () => { pending: boolean, generation: number },
     *     finish: (generation: number) => {
     *       accepted: boolean,
     *       state: { pending: boolean, generation: number },
     *     },
     *   },
     *   view: { pendingButton: (pending: boolean) => object },
     *   effects: { applyPendingButton: (view: object) => boolean },
     * }} Dependencies
     */

    /**
     * @param {Dependencies} dependencies
     */
    function create(dependencies) {
        if (!dependencies || !dependencies.controller ||
                typeof dependencies.controller.snapshot !== 'function' ||
                typeof dependencies.controller.setPending !== 'function' ||
                typeof dependencies.controller.start !== 'function' ||
                typeof dependencies.controller.cancel !== 'function' ||
                typeof dependencies.controller.finish !== 'function' ||
                !dependencies.view || typeof dependencies.view.pendingButton !== 'function' ||
                !dependencies.effects || typeof dependencies.effects.applyPendingButton !== 'function') {
            throw new TypeError('local resume preload runtime dependencies are required');
        }

        function apply(state) {
            return dependencies.effects.applyPendingButton(
                dependencies.view.pendingButton(state.pending)
            );
        }

        function setPending(pending) {
            const state = dependencies.controller.setPending(pending);
            apply(state);
            return state;
        }

        function start() {
            const state = dependencies.controller.start();
            apply(state);
            return state.generation;
        }

        function finish(generation) {
            const result = dependencies.controller.finish(generation);
            if (result.accepted) apply(result.state);
            return result.accepted;
        }

        function cancel() {
            const state = dependencies.controller.cancel();
            apply(state);
            return state;
        }

        return Object.freeze({
            snapshot: dependencies.controller.snapshot,
            setPending,
            start,
            cancel,
            finish,
        });
    }

    return Object.freeze({ create });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LocalResumePreloadRuntime;
if (typeof window !== 'undefined') Object.assign(window, { LocalResumePreloadRuntime });
if (typeof globalThis !== 'undefined') globalThis.LocalResumePreloadRuntime = LocalResumePreloadRuntime;
