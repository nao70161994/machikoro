'use strict';

function sameRestoreQueue(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((event, index) => {
        const other = right[index];
        return !!event && !!other &&
            event.type === other.type &&
            event.payload === other.payload &&
            event.generation === other.generation;
    });
}

function planRestoreQueueEnqueue(queue, event, limit) {
    const current = Array.isArray(queue) ? queue : [];
    const overflow = !Number.isInteger(limit) || limit < 0 || current.length >= limit;
    return Object.freeze({
        overflow,
        queue: overflow ? current : current.concat([event]),
    });
}

function planRestoreQueueCarry(queue, shouldCarry, generation) {
    const current = shouldCarry && Array.isArray(queue) ? queue : [];
    return Object.freeze({
        overflow: false,
        queue: current.map(event => ({
            type: event.type,
            payload: event.payload,
            generation,
        })),
    });
}

function selectRestoreQueueTransition(pureTransition, legacyTransition, options = {}) {
    const matched = !!pureTransition && !!legacyTransition &&
        pureTransition.overflow === legacyTransition.overflow &&
        sameRestoreQueue(pureTransition.queue, legacyTransition.queue);
    const enabled = options.authorityEnabled === true;
    const usePure = enabled && matched;
    return Object.freeze({
        transition: usePure ? pureTransition : legacyTransition,
        source: usePure ? 'pure-transition' : (enabled ? 'legacy-fallback' : 'legacy'),
        matched,
        fallbackReason: matched ? '' : 'restore-queue-state-mismatch',
    });
}

const OnlineRestoreQueueState = Object.freeze({
    sameQueue: sameRestoreQueue,
    planEnqueue: planRestoreQueueEnqueue,
    planCarry: planRestoreQueueCarry,
    selectTransition: selectRestoreQueueTransition,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineRestoreQueueState };
}
