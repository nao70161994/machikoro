'use strict';

const AppShellComposition = (() => {
    /** @template T @typedef {() => T} Accessor */

    /** @param {Record<string, Accessor<unknown>>} accessors */
    function create(accessors) {
        if (!accessors || typeof accessors !== 'object') {
            throw new TypeError('app shell composition accessors are required');
        }
        const registry = Object.create(null);
        Object.entries(accessors).forEach(([name, accessor]) => {
            if (typeof accessor !== 'function') {
                throw new TypeError(`${name} accessor must be a function`);
            }
            registry[name] = accessor;
        });
        Object.freeze(registry);

        function has(name) {
            return Object.prototype.hasOwnProperty.call(registry, name);
        }

        /**
         * appShell.js loads before main.js and online.js, so dependencies must remain
         * late-bound while their ownership stays explicit and mechanically testable.
         * @template T
         * @param {string} name
         * @param {T} [fallback]
         * @returns {T | unknown}
         */
        function resolve(name, fallback = null) {
            if (!has(name)) return fallback;
            const value = registry[name]();
            return value === undefined ? fallback : value;
        }

        /** @param {string} name @returns {Function | null} */
        function resolveFunction(name) {
            const value = resolve(name);
            return typeof value === 'function' ? value : null;
        }

        return Object.freeze({ has, resolve, resolveFunction });
    }

    return Object.freeze({ create });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AppShellComposition;
if (typeof window !== 'undefined') window.AppShellComposition = AppShellComposition;
if (typeof globalThis !== 'undefined') globalThis.AppShellComposition = AppShellComposition;
