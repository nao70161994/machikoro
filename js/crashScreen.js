'use strict';

const CrashScreen = (() => {
    const MESSAGE_LIMIT = 300;

    function messageForError(error, limit = MESSAGE_LIMIT) {
        const message = error instanceof Error
            ? error.stack || error.message
            : String(error || '不明なエラー');
        return message.slice(0, limit);
    }

    function buildView(error, hasSavedGame) {
        const canResume = !!hasSavedGame;
        return Object.freeze({
            message: messageForError(error),
            resumeDisplay: canResume ? 'block' : 'none',
            initialFocus: canResume ? 'resume' : 'reload',
        });
    }

    function createController() {
        let shown = false;

        function snapshot() {
            return Object.freeze({ shown });
        }

        function show() {
            if (shown) return Object.freeze({ changed: false, state: snapshot() });
            shown = true;
            return Object.freeze({ changed: true, state: snapshot() });
        }

        function hide() {
            const changed = shown;
            shown = false;
            return Object.freeze({ changed, state: snapshot() });
        }

        return Object.freeze({ snapshot, show, hide });
    }

    function focusTrapPlan(input = {}) {
        if (input.shown !== true || input.key !== 'Tab') {
            return Object.freeze({ preventDefault: false, focusTarget: '' });
        }
        const focusableCount = Number.isInteger(input.focusableCount) && input.focusableCount > 0
            ? input.focusableCount
            : 0;
        if (focusableCount === 0) {
            return Object.freeze({ preventDefault: true, focusTarget: 'screen' });
        }
        if (input.shiftKey === true && input.activeIndex === 0) {
            return Object.freeze({ preventDefault: true, focusTarget: 'last' });
        }
        if (input.shiftKey !== true && input.activeIndex === focusableCount - 1) {
            return Object.freeze({ preventDefault: true, focusTarget: 'first' });
        }
        return Object.freeze({ preventDefault: false, focusTarget: '' });
    }

    return Object.freeze({
        MESSAGE_LIMIT,
        messageForError,
        buildView,
        createController,
        focusTrapPlan,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CrashScreen;
if (typeof window !== 'undefined') window.CrashScreen = CrashScreen;
if (typeof globalThis !== 'undefined') globalThis.CrashScreen = CrashScreen;
