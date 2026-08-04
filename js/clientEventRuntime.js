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

    function createShellBindings(options = {}) {
        const {
            bindingController,
            checkFreezeWatchdog,
            consoleErrorInput,
            freezeWatchdogIntervalMs,
            getConsole,
            pwaInstallController,
            reportClientError,
            resizeHandler,
            setIntervalFn,
            showCrashScreen,
            unhandledRejectionInput,
            updateOnlineStatus,
            windowErrorInput,
            windowTarget,
        } = options;
        requireWindowTarget(windowTarget);
        if (!bindingController || typeof bindingController.isBound !== 'function' ||
                typeof bindingController.markBound !== 'function') {
            throw new TypeError('bindingController is required');
        }
        for (const [name, effect] of Object.entries({
            checkFreezeWatchdog,
            consoleErrorInput,
            getConsole,
            reportClientError,
            resizeHandler,
            showCrashScreen,
            unhandledRejectionInput,
            updateOnlineStatus,
            windowErrorInput,
        })) {
            if (typeof effect !== 'function') throw new TypeError(`${name} is required`);
        }
        if (!pwaInstallController || typeof pwaInstallController.bindInstallHandlers !== 'function') {
            throw new TypeError('pwaInstallController is required');
        }

        function handleWindowErrorEvent(event) {
            reportClientError(windowErrorInput(event));
            showCrashScreen(event && (event.error || event.message));
        }

        function handleWindowUnhandledRejection(event) {
            reportClientError(unhandledRejectionInput(event));
            showCrashScreen(event && event.reason);
        }

        function bindConsoleErrorReporting() {
            if (bindingController.isBound(bindingKeys.CONSOLE_ERROR)) return false;
            const consoleTarget = getConsole();
            if (!consoleTarget || typeof consoleTarget.error !== 'function') return false;
            const originalConsoleError = consoleTarget.error.bind(consoleTarget);
            consoleTarget.error = (...args) => {
                originalConsoleError(...args);
                reportClientError(consoleErrorInput(args));
            };
            bindingController.markBound(bindingKeys.CONSOLE_ERROR);
            return true;
        }

        function bindCrashReporting() {
            if (bindingController.isBound(bindingKeys.CLIENT_ERROR_REPORTING)) return false;
            bindCrashHandlers({ windowTarget, handleWindowErrorEvent, handleWindowUnhandledRejection });
            bindConsoleErrorReporting();
            bindingController.markBound(bindingKeys.CLIENT_ERROR_REPORTING);
            return true;
        }

        function bindOnlineStatus() {
            if (bindingController.isBound(bindingKeys.ONLINE_STATUS)) {
                updateOnlineStatus();
                return false;
            }
            bindOnlineStatusHandlers({ windowTarget, updateOnlineStatus });
            bindingController.markBound(bindingKeys.ONLINE_STATUS);
            return true;
        }

        function bindMainViewResize() {
            if (bindingController.isBound(bindingKeys.MAIN_VIEW_RESIZE)) return false;
            windowTarget.addEventListener('resize', resizeHandler);
            bindingController.markBound(bindingKeys.MAIN_VIEW_RESIZE);
            return true;
        }

        function startFreezeWatchdog() {
            if (bindingController.isBound(bindingKeys.FREEZE_WATCHDOG) || typeof setIntervalFn !== 'function') return false;
            bindingController.markBound(bindingKeys.FREEZE_WATCHDOG);
            setIntervalFn(checkFreezeWatchdog, freezeWatchdogIntervalMs);
            return true;
        }

        return Object.freeze({
            bindConsoleErrorReporting,
            bindCrashReporting,
            bindMainViewResize,
            bindOnlineStatus,
            bindPwaInstallHandlers: () => pwaInstallController.bindInstallHandlers(),
            handleWindowErrorEvent,
            handleWindowUnhandledRejection,
            startFreezeWatchdog,
        });
    }

    return Object.freeze({ bindingKeys, createBindingController, bindCrashHandlers, bindOnlineStatusHandlers, createShellBindings });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ClientEventRuntime;
if (typeof window !== 'undefined') window.ClientEventRuntime = ClientEventRuntime;
if (typeof globalThis !== 'undefined') globalThis.ClientEventRuntime = ClientEventRuntime;
