'use strict';

const RetryTimer = (() => {
    function create(options = {}) {
        for (const name of ['now', 'setTimeout', 'clearTimeout', 'run']) {
            if (typeof options[name] !== 'function') throw new TypeError(`${name} is required`);
        }
        let handle = null;
        let dueAt = 0;
        let generation = 0;

        function schedule(delayMs) {
            const delay = Math.max(0, Number(delayMs) || 0);
            const nextDueAt = options.now() + delay;
            if (handle !== null && nextDueAt >= dueAt) return false;
            if (handle !== null) options.clearTimeout(handle);
            const token = ++generation;
            handle = options.setTimeout(() => {
                if (token !== generation) return;
                handle = null;
                dueAt = 0;
                options.run();
            }, delay);
            dueAt = nextDueAt;
            return handle !== null && handle !== undefined;
        }

        function snapshot() {
            return Object.freeze({ scheduled: handle !== null, dueAt });
        }

        return Object.freeze({ schedule, snapshot });
    }

    return Object.freeze({ create });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RetryTimer;
if (typeof window !== 'undefined') window.RetryTimer = RetryTimer;
if (typeof globalThis !== 'undefined') globalThis.RetryTimer = RetryTimer;
