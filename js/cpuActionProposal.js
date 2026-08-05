'use strict';

const CPUActionContractApi = typeof module !== 'undefined' && module.exports
    ? require('./actionContract')
    : globalThis.GameActionContract;

/**
 * @template {string} TAction
 * @typedef {Object} CPUActionProposalValue
 * @property {TAction} action
 * @property {Record<string, *>} data
 */

function cloneAndFreezeProposalValue(value, active = new WeakSet()) {
    if (value === null || typeof value !== 'object') return value;
    if (active.has(value)) throw new TypeError('cyclic action data is not supported');
    active.add(value);
    const clone = Array.isArray(value) ? [] : {};
    for (const key of Object.keys(value)) {
        clone[key] = cloneAndFreezeProposalValue(value[key], active);
    }
    active.delete(value);
    return Object.freeze(clone);
}

function hasCanonicalPayloadShape(action, data) {
    if (!CPUActionContractApi || !CPUActionContractApi.canonicalPayloadVariants ||
            !data || typeof data !== 'object' || Array.isArray(data)) return false;
    const variants = CPUActionContractApi.canonicalPayloadVariants[action];
    if (!Array.isArray(variants)) return false;
    const keys = Object.keys(data).sort();
    return variants.some(variant => {
        if (variant.length !== keys.length) return false;
        return Array.from(variant).sort().every((key, index) => key === keys[index]);
    });
}

/**
 * Creates a detached canonical action proposal without applying game or transport effects.
 * Value validation and actor authority remain with the live owner.
 *
 * @template {string} TAction
 * @param {TAction} action
 * @param {Record<string, *>} data
 * @returns {CPUActionProposalValue<TAction>|null}
 */
function create(action, data = {}) {
    if (!hasCanonicalPayloadShape(action, data)) return null;
    try {
        return Object.freeze({
            action,
            data: cloneAndFreezeProposalValue(data),
        });
    } catch (_) {
        return null;
    }
}

const CPUActionProposal = Object.freeze({
    create,
    hasCanonicalPayloadShape,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CPUActionProposal };
}
if (typeof window !== 'undefined') window.CPUActionProposal = CPUActionProposal;
if (typeof globalThis !== 'undefined') globalThis.CPUActionProposal = CPUActionProposal;
