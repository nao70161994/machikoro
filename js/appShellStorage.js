'use strict';

const AppShellStorage = (() => {
    function createFacade(options = {}) {
        const getStorage = typeof options.getStorage === 'function'
            ? options.getStorage
            : () => typeof localStorage !== 'undefined' ? localStorage : null;

        function access(callback, fallback) {
            try {
                const storage = getStorage();
                return storage ? callback(storage) : fallback;
            } catch (_) {
                return fallback;
            }
        }

        function get(key, fallback = null) {
            return access(storage => storage.getItem(key), fallback);
        }

        function set(key, value) {
            try {
                const storage = getStorage();
                if (storage) storage.setItem(key, value);
                return true;
            } catch (_) {
                return false;
            }
        }

        function remove(key) {
            access(storage => storage.removeItem(key));
        }

        return Object.freeze({ access, get, set, remove });
    }

    return Object.freeze({ createFacade });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AppShellStorage;
if (typeof window !== 'undefined') window.AppShellStorage = AppShellStorage;
if (typeof globalThis !== 'undefined') globalThis.AppShellStorage = AppShellStorage;
