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
        focusTrapPlan,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CrashScreen;
if (typeof window !== 'undefined') window.CrashScreen = CrashScreen;
if (typeof globalThis !== 'undefined') globalThis.CrashScreen = CrashScreen;
