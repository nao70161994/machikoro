'use strict';

const ClientEventRuntime = (() => {
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

    return Object.freeze({ bindCrashHandlers, bindOnlineStatusHandlers });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ClientEventRuntime;
if (typeof window !== 'undefined') window.ClientEventRuntime = ClientEventRuntime;
if (typeof globalThis !== 'undefined') globalThis.ClientEventRuntime = ClientEventRuntime;
