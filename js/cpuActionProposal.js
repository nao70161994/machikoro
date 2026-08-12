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
    return !!CPUActionContractApi &&
        typeof CPUActionContractApi.hasCanonicalPayloadShape === 'function' &&
        CPUActionContractApi.hasCanonicalPayloadShape(action, data);
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
    if (!CPUActionContractApi ||
            typeof CPUActionContractApi.validateCanonicalPayload !== 'function' ||
            !CPUActionContractApi.validateCanonicalPayload(action, data)) return null;
    try {
        return Object.freeze({
            action,
            data: cloneAndFreezeProposalValue(data),
        });
    } catch (_) {
        return null;
    }
}

function explanation(proposal) {
    if (!proposal || typeof proposal.action !== 'string' || !proposal.data) return '';
    const data = proposal.data;
    const labels = {
        rollDice: 'サイコロを振ります',
        selectDice: data.useTwo ? 'サイコロを2個振ります' : 'サイコロを1個振ります',
        rerollDice: 'サイコロを振り直します',
        skipReroll: '振り直さず進みます',
        resolveHarbor: data.useBonus ? '港のボーナスを使います' : '港のボーナスを使わず進みます',
        resolveTV: '対象のプレイヤーを選びました',
        resolveBusiness: data.skip ? '交換せずに進みます' : '施設交換を選びました',
        resolveCleaning: data.cardName ? `${data.cardName}を休業対象に選びました` : '休業対象を選びました',
        resolveMover: '移動する施設と相手を選びました',
        resolveRenovation: data.landmarkName ? `${data.landmarkName}を改装対象に選びました` : '改装対象を選びました',
        resolveIT: data.doSave ? 'ITベンチャーへ投資します' : '今回は投資せず進みます',
        buildCard: data.cardName ? `${data.cardName}を建設します` : '施設を建設します',
        buildLandmark: data.name ? `${data.name}を建設します` : 'ランドマークを建設します',
        nextTurn: '建設せずターンを終了します',
    };
    return labels[proposal.action] || '';
}

const CPUActionProposal = Object.freeze({
    create,
    explanation,
    hasCanonicalPayloadShape,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CPUActionProposal };
}
if (typeof window !== 'undefined') window.CPUActionProposal = CPUActionProposal;
if (typeof globalThis !== 'undefined') globalThis.CPUActionProposal = CPUActionProposal;
