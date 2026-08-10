'use strict';

const AppShellCrashRuntime = (() => {
    function createRuntime(dependencies = {}) {
        const {
            addKeydownListener,
            cancelCpu,
            controller,
            effects,
            getActiveElement,
            getBackgroundElements,
            getElementById,
            policy,
            readSavedGame,
            removeKeydownListener,
            resumeGame,
        } = dependencies;
        const requiredFunctions = {
            addKeydownListener,
            cancelCpu,
            getActiveElement,
            getBackgroundElements,
            getElementById,
            readSavedGame,
            removeKeydownListener,
            resumeGame,
        };
        for (const [name, dependency] of Object.entries(requiredFunctions)) {
            if (typeof dependency !== 'function') throw new TypeError(`${name} is required`);
        }
        if (!controller || !effects || !policy) {
            throw new TypeError('crash runtime dependencies are required');
        }
        let backgroundRestore = [];
        let previousFocus = null;

        function trapFocus(event) {
            const crashState = controller.snapshot();
            if (!crashState.shown || event.key !== 'Tab') return;
            const screen = getElementById('crashScreen');
            const focusables = effects.focusableElements(screen);
            const plan = policy.focusTrapPlan({
                shown: crashState.shown,
                key: event.key,
                shiftKey: event.shiftKey,
                focusableCount: focusables.length,
                activeIndex: focusables.indexOf(getActiveElement()),
            });
            effects.applyFocusTrap(plan, event, screen, focusables);
        }

        function show(error) {
            const transition = controller.show();
            if (!transition.changed) return;
            cancelCpu('game-lifecycle-reset-cpu');
            const screen = getElementById('crashScreen');
            if (!screen) return;
            previousFocus = getActiveElement();
            const view = policy.buildView(error, readSavedGame());
            const elements = {
                screen,
                message: getElementById('crashMessage'),
                resumeButton: getElementById('crashResumeBtn'),
                reloadButton: screen.querySelector && screen.querySelector('[data-ui-action="reloadPage"]'),
            };
            backgroundRestore = effects.disableBackground(getBackgroundElements());
            effects.applyView(elements, view);
            addKeydownListener(trapFocus);
            effects.focusInitial(elements, view.initialFocus);
        }

        function resume() {
            controller.hide();
            removeKeydownListener(trapFocus);
            effects.hide(getElementById('crashScreen'));
            const backgroundElements = getBackgroundElements();
            effects.restoreBackground(backgroundRestore);
            backgroundRestore = [];
            const restoreTarget = previousFocus;
            previousFocus = null;
            try {
                resumeGame();
            } catch (error) {
                effects.restoreFocus(restoreTarget, backgroundElements);
                throw error;
            }
            effects.restoreFocus(restoreTarget, backgroundElements);
        }

        return Object.freeze({ trapFocus, show, resume });
    }

    return Object.freeze({ createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AppShellCrashRuntime;
if (typeof window !== 'undefined') window.AppShellCrashRuntime = AppShellCrashRuntime;
if (typeof globalThis !== 'undefined') globalThis.AppShellCrashRuntime = AppShellCrashRuntime;
