'use strict';

const CPUActionContractApi = typeof module !== 'undefined' && module.exports
    ? require('./actionContract')
    : globalThis.GameActionContract;
const decisionReasons = new WeakMap();
const CPU_DECISION_REASON_CODES = Object.freeze({
    DICE_SCORE_COMPARISON: 'dice-score-comparison',
    REROLL_SCORE_COMPARISON: 'reroll-score-comparison',
    HARBOR_SCORE_COMPARISON: 'harbor-score-comparison',
    RANDOM_CHOICE: 'random-choice',
    SEEDED_NEAR_TIE_BUILD: 'seeded-near-tie-build',
});

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

function normalizeReason(reason) {
    if (!reason || typeof reason.code !== 'string' || !/^[a-z][a-z0-9-]*$/.test(reason.code)) return null;
    const values = {};
    for (const [key, value] of Object.entries(reason.values || {})) {
        if (!/^[a-z][A-Za-z0-9]*$/.test(key)) continue;
        if (typeof value === 'number' && Number.isFinite(value) ||
                typeof value === 'string' || typeof value === 'boolean') {
            values[key] = value;
        }
    }
    return Object.freeze({ code: reason.code, values: Object.freeze(values) });
}

function withDecisionReason(proposal, reason) {
    if (!proposal || typeof proposal !== 'object') return proposal;
    const normalized = normalizeReason(reason);
    if (normalized) decisionReasons.set(proposal, normalized);
    return proposal;
}

function decisionReason(proposal) {
    return proposal && decisionReasons.get(proposal) || null;
}

function formatScore(value) {
    return Number.isFinite(value) ? Number(value).toFixed(2) : '?';
}

function explanation(proposal) {
    if (!proposal || typeof proposal.action !== 'string' || !proposal.data) return '';
    const data = proposal.data;
    const reason = decisionReason(proposal);
    if (reason && reason.code === CPU_DECISION_REASON_CODES.DICE_SCORE_COMPARISON) {
        return `${data.useTwo ? '2個' : '1個'}振りを選択（1個 ${formatScore(reason.values.oneScore)} / 2個 ${formatScore(reason.values.twoScore)}、切替基準 ${formatScore(reason.values.threshold)}）`;
    }
    if (reason && reason.code === CPU_DECISION_REASON_CODES.REROLL_SCORE_COMPARISON) {
        return `${proposal.action === 'rerollDice' ? '振り直します' : '振り直さず進みます'}（現在 ${formatScore(reason.values.keepScore)} / 振り直し ${formatScore(reason.values.rerollScore)}）`;
    }
    if (reason && reason.code === CPU_DECISION_REASON_CODES.HARBOR_SCORE_COMPARISON) {
        return `${data.useBonus ? '港のボーナスを使います' : '港のボーナスを使わず進みます'}（そのまま ${formatScore(reason.values.keepScore)} / +2 ${formatScore(reason.values.bonusScore)}）`;
    }
    if (reason && reason.code === CPU_DECISION_REASON_CODES.SEEDED_NEAR_TIE_BUILD) {
        const selected = data.cardName || data.name || '建設候補';
        return `${selected}を建設します（評価差 ${formatScore(reason.values.delta)} の僅差候補から選択）`;
    }
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
    const label = labels[proposal.action] || '';
    if (label && reason && reason.code === CPU_DECISION_REASON_CODES.RANDOM_CHOICE) {
        return `${label}（ランダム選択）`;
    }
    return label;
}

const CPUActionProposal = Object.freeze({
    create,
    explanation,
    withDecisionReason,
    decisionReason,
    reasonCodes: CPU_DECISION_REASON_CODES,
    hasCanonicalPayloadShape,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CPUActionProposal, CPU_DECISION_REASON_CODES };
}
if (typeof window !== 'undefined') window.CPUActionProposal = CPUActionProposal;
if (typeof globalThis !== 'undefined') globalThis.CPUActionProposal = CPUActionProposal;
