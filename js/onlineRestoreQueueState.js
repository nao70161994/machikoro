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

function createRestoreQueueStore(initialQueue = []) {
    let queue = Array.isArray(initialQueue) ? initialQueue : [];
    return Object.freeze({
        read() {
            return queue;
        },
        replace(nextQueue) {
            queue = Array.isArray(nextQueue) ? nextQueue : [];
            return queue;
        },
        append(event) {
            queue.push(event);
            return queue;
        },
    });
}

function selectRestoreQueueRead(storeQueue, legacyQueue, options = {}) {
    const matched = sameRestoreQueue(storeQueue, legacyQueue);
    const enabled = options.authorityEnabled === true;
    const useStore = enabled && matched;
    return Object.freeze({
        queue: useStore ? storeQueue : legacyQueue,
        source: useStore ? 'store-read' : (enabled ? 'legacy-fallback' : 'legacy'),
        matched,
        fallbackReason: matched ? '' : 'restore-queue-store-mismatch',
    });
}

function selectRestoreQueueWrite(storeQueue, legacyQueue, options = {}) {
    const selected = selectRestoreQueueRead(storeQueue, legacyQueue, options);
    return Object.freeze({
        queue: selected.queue,
        source: selected.source === 'store-read' ? 'store-write' : selected.source,
        matched: selected.matched,
        fallbackReason: selected.fallbackReason,
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

function planRestoreQueueClear() {
    return Object.freeze({
        overflow: false,
        queue: [],
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
    createStore: createRestoreQueueStore,
    selectRead: selectRestoreQueueRead,
    selectWrite: selectRestoreQueueWrite,
    planEnqueue: planRestoreQueueEnqueue,
    planCarry: planRestoreQueueCarry,
    planDrain: planRestoreQueueDrain,
    planFailureRemainder: planRestoreQueueFailureRemainder,
    planClear: planRestoreQueueClear,
    selectTransition: selectRestoreQueueTransition,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineRestoreQueueState };
}
