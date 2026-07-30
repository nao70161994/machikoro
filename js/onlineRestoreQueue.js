'use strict';

function executeOnlineRestoreQueuePlan(plan, handlers) {
    const entries = Array.isArray(plan) ? plan : [];
    const eventHandlers = handlers && typeof handlers === 'object' ? handlers : {};
    for (const entry of entries) {
        const event = entry && entry.event;
        const handler = event && eventHandlers[event.type];
        if (typeof handler === 'function' && handler(event.payload) === false) {
            return Object.freeze({ ok: false, failedIndex: entry.index });
        }
    }
    return Object.freeze({ ok: true, failedIndex: -1 });
}

const OnlineRestoreQueue = Object.freeze({
    executePlan: executeOnlineRestoreQueuePlan,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineRestoreQueue };
}
