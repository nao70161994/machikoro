'use strict';

const ClientEventRuntime = (() => {
    const bindingKeys = Object.freeze({
        CLIENT_ERROR_REPORTING: 'client-error-reporting',
        CONSOLE_ERROR: 'console-error',
        ONLINE_STATUS: 'online-status',
        FREEZE_WATCHDOG: 'freeze-watchdog',
        MAIN_VIEW_RESIZE: 'main-view-resize',
    });

    function createBindingController(initialKeys = []) {
        const bound = new Set(Array.isArray(initialKeys) ? initialKeys : []);

        function isBound(key) {
            return bound.has(key);
        }

        function markBound(key) {
            if (bound.has(key)) return false;
            bound.add(key);
            return true;
        }

        function snapshot() {
            return Object.freeze({ boundKeys: Object.freeze(Array.from(bound)) });
        }

        return Object.freeze({ isBound, markBound, snapshot });
    }

    function requireWindowTarget(windowTarget) {
        if (!windowTarget || typeof windowTarget.addEventListener !== 'function') {
            throw new TypeError('windowTarget.addEventListener is required');
        }
    }

    function bindCrashHandlers(options = {}) {
        const windowTarget = options.windowTarget;
        const handleWindowErrorEvent = options.handleWindowErrorEvent;
        const handleWindowUnhandledRejection = options.handleWindowUnhandledRejection;
        requireWindowTarget(windowTarget);
        if (typeof handleWindowErrorEvent !== 'function') {
            throw new TypeError('handleWindowErrorEvent is required');
        }
        if (typeof handleWindowUnhandledRejection !== 'function') {
            throw new TypeError('handleWindowUnhandledRejection is required');
        }
        const onerror = (message, filename, lineno, colno, error) => {
            handleWindowErrorEvent({ message, filename, lineno, colno, error });
            return false;
        };
        windowTarget.onerror = onerror;
        windowTarget.onunhandledrejection = handleWindowUnhandledRejection;
        windowTarget.addEventListener('error', handleWindowErrorEvent);
        windowTarget.addEventListener('unhandledrejection', handleWindowUnhandledRejection);
        return Object.freeze({ onerror, onunhandledrejection: handleWindowUnhandledRejection });
    }

    function bindOnlineStatusHandlers(options = {}) {
        const windowTarget = options.windowTarget;
        const updateOnlineStatus = options.updateOnlineStatus;
        requireWindowTarget(windowTarget);
        if (typeof updateOnlineStatus !== 'function') {
            throw new TypeError('updateOnlineStatus is required');
        }
        windowTarget.addEventListener('online', updateOnlineStatus);
        windowTarget.addEventListener('offline', updateOnlineStatus);
        updateOnlineStatus();
        return updateOnlineStatus;
    }

    return Object.freeze({ bindingKeys, createBindingController, bindCrashHandlers, bindOnlineStatusHandlers });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ClientEventRuntime;
if (typeof window !== 'undefined') window.ClientEventRuntime = ClientEventRuntime;
if (typeof globalThis !== 'undefined') globalThis.ClientEventRuntime = ClientEventRuntime;
