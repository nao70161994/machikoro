'use strict';

const ClientStorage = (() => {
    function createFacade(options = {}) {
        const getStorage = typeof options.getStorage === 'function'
            ? options.getStorage
            : () => typeof localStorage !== 'undefined' ? localStorage : null;
        const missingSetResult = options.missingSetResult === true;

        function access(callback, fallback) {
            try {
                const storage = getStorage();
                return storage ? callback(storage) : fallback;
            } catch (_) {
                return fallback;
            }
        }

        function storage() {
            return access(value => value, null);
        }

        function get(key, fallback = null) {
            return access(storage => storage.getItem(key), fallback);
        }

        function set(key, value) {
            try {
                const storage = getStorage();
                if (!storage) return missingSetResult;
                storage.setItem(key, value);
                return true;
            } catch (_) {
                return false;
            }
        }

        function remove(key) {
            return access(storage => {
                storage.removeItem(key);
                return true;
            }, false);
        }

        function keysWithPrefix(prefix) {
            if (typeof prefix !== 'string') return [];
            return access(storage => {
                if (typeof storage.length !== 'number' || typeof storage.key !== 'function') return [];
                const keys = [];
                for (let index = 0; index < storage.length; index++) {
                    const key = storage.key(index);
                    if (typeof key === 'string' && key.startsWith(prefix)) keys.push(key);
                }
                return keys;
            }, []);
        }

        return Object.freeze({ access, storage, get, set, remove, keysWithPrefix });
    }

    return Object.freeze({ createFacade });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ClientStorage;
if (typeof window !== 'undefined') window.ClientStorage = ClientStorage;
if (typeof globalThis !== 'undefined') globalThis.ClientStorage = ClientStorage;
