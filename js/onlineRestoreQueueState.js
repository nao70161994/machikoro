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

function planRestoreQueueDrain(queue) {
    const current = Array.isArray(queue) ? queue : [];
    return Object.freeze({
        overflow: false,
        queue: [],
        drainedQueue: current,
    });
}

function planRestoreQueueFailureRemainder(queue, failedIndex) {
    const current = Array.isArray(queue) ? queue : [];
    return Object.freeze({
        overflow: false,
        queue: current.slice(failedIndex),
    });
}

function sameRestoreQueueTransition(left, right) {
    if (!left || !right || left.overflow !== right.overflow || !sameRestoreQueue(left.queue, right.queue)) {
        return false;
    }
    const leftHasDrainedQueue = Object.prototype.hasOwnProperty.call(left, 'drainedQueue');
    const rightHasDrainedQueue = Object.prototype.hasOwnProperty.call(right, 'drainedQueue');
    return leftHasDrainedQueue === rightHasDrainedQueue &&
        (!leftHasDrainedQueue || sameRestoreQueue(left.drainedQueue, right.drainedQueue));
}

function selectRestoreQueueTransition(pureTransition, legacyTransition, options = {}) {
    const matched = sameRestoreQueueTransition(pureTransition, legacyTransition);
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
    planDrain: planRestoreQueueDrain,
    planFailureRemainder: planRestoreQueueFailureRemainder,
    selectTransition: selectRestoreQueueTransition,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineRestoreQueueState };
}
