'use strict';

const HOSTLESS_RESTORE_SCHEMA_VERSION = 1;
const HOSTLESS_RESTORE_LIMITS = Object.freeze({
    hostGraceMs: 60_000,
    collectionMs: 30_000,
    confirmationMs: 60_000,
    retentionMs: 120_000,
    minDistinctHumans: 2,
    maxAttempts: 3,
    maxCandidates: 10,
    candidateCooldownMs: 1000,
});

const HOSTLESS_RESTORE_RESULTS = Object.freeze({
    READY: 'ready',
    INSUFFICIENT: 'insufficient-candidates',
    MISMATCH: 'candidate-mismatch',
    COMPLETED: 'completed-game',
    ATTEMPT_LIMIT: 'attempt-limit',
});

function stableJson(value) {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') {
        return JSON.stringify(value);
    }
    if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
    if (Array.isArray(value)) return `[${value.map(item => stableJson(item === undefined ? null : item)).join(',')}]`;
    if (value && typeof value === 'object') {
        const keys = Object.keys(value)
            .filter(key => value[key] !== undefined)
            .sort();
        return `{${keys.map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    }
    return 'null';
}

function canonicalCandidateHash(cryptoModule, canonicalPayload) {
    if (!cryptoModule || !canonicalPayload || typeof canonicalPayload !== 'object') return '';
    return cryptoModule
        .createHash('sha256')
        .update(stableJson(canonicalPayload))
        .digest('hex');
}

function normalizeRestoreRank(rank) {
    return Object.freeze({
        hostEpoch: Number.isInteger(rank?.hostEpoch) && rank.hostEpoch >= 0 ? rank.hostEpoch : 0,
        actionSeq: Number.isInteger(rank?.actionSeq) && rank.actionSeq >= 0 ? rank.actionSeq : 0,
    });
}

function candidateFingerprint(candidate) {
    if (!candidate || typeof candidate.canonicalHash !== 'string' || !candidate.canonicalHash) return '';
    const rank = normalizeRestoreRank(candidate.rank);
    const generation = Number.isInteger(candidate.generation) && candidate.generation >= 0
        ? candidate.generation
        : 0;
    const completed = candidate.completed === true ? 1 : 0;
    return `${generation}:${rank.hostEpoch}:${rank.actionSeq}:${completed}:${candidate.canonicalHash.toLowerCase()}`;
}

function normalizeCandidate(candidate) {
    if (!candidate || candidate.capabilityVersion !== HOSTLESS_RESTORE_SCHEMA_VERSION) return null;
    if (!Number.isInteger(candidate.playerIndex) || candidate.playerIndex < 0) return null;
    if (candidate.playerType && candidate.playerType !== 'human') return null;
    const fingerprint = candidateFingerprint(candidate);
    if (!fingerprint) return null;
    return Object.freeze({
        playerIndex: candidate.playerIndex,
        socketId: typeof candidate.socketId === 'string' ? candidate.socketId : '',
        capabilityVersion: HOSTLESS_RESTORE_SCHEMA_VERSION,
        generation: Number.isInteger(candidate.generation) && candidate.generation >= 0
            ? candidate.generation
            : 0,
        rank: normalizeRestoreRank(candidate.rank),
        canonicalHash: candidate.canonicalHash.toLowerCase(),
        completed: candidate.completed === true,
        fingerprint,
        payload: candidate.payload,
    });
}

function uniquePlayerCandidates(candidates) {
    const byPlayer = new Map();
    let identityConflict = false;
    for (const rawCandidate of Array.isArray(candidates) ? candidates : []) {
        const candidate = normalizeCandidate(rawCandidate);
        if (!candidate) continue;
        const existing = byPlayer.get(candidate.playerIndex);
        if (existing && existing.fingerprint !== candidate.fingerprint) {
            identityConflict = true;
            continue;
        }
        if (!existing) byPlayer.set(candidate.playerIndex, candidate);
    }
    return {
        candidates: Array.from(byPlayer.values()).sort((a, b) => a.playerIndex - b.playerIndex),
        identityConflict,
    };
}

function evaluateCandidateQuorum(candidates, options = {}) {
    const attemptCount = Number.isInteger(options.attemptCount) && options.attemptCount >= 0
        ? options.attemptCount
        : 0;
    const maxAttempts = Number.isInteger(options.maxAttempts)
        ? options.maxAttempts
        : HOSTLESS_RESTORE_LIMITS.maxAttempts;
    if (attemptCount >= maxAttempts) {
        return Object.freeze({ status: HOSTLESS_RESTORE_RESULTS.ATTEMPT_LIMIT, candidates: [] });
    }

    const unique = uniquePlayerCandidates(candidates);
    const normalized = unique.candidates;
    const minCandidates = Number.isInteger(options.minDistinctHumans)
        ? options.minDistinctHumans
        : HOSTLESS_RESTORE_LIMITS.minDistinctHumans;
    if (normalized.length < minCandidates) {
        return Object.freeze({
            status: HOSTLESS_RESTORE_RESULTS.INSUFFICIENT,
            candidates: normalized,
        });
    }
    const firstFingerprint = normalized[0].fingerprint;
    if (unique.identityConflict || normalized.some(candidate => candidate.fingerprint !== firstFingerprint)) {
        return Object.freeze({
            status: HOSTLESS_RESTORE_RESULTS.MISMATCH,
            candidates: normalized,
        });
    }
    if (normalized.some(candidate => candidate.completed)) {
        return Object.freeze({
            status: HOSTLESS_RESTORE_RESULTS.COMPLETED,
            candidates: normalized,
        });
    }
    return Object.freeze({
        status: HOSTLESS_RESTORE_RESULTS.READY,
        candidates: normalized,
        confirmationOrder: Object.freeze(normalized.map(candidate => candidate.playerIndex)),
        canonicalHash: normalized[0].canonicalHash,
        rank: normalized[0].rank,
        generation: normalized[0].generation,
    });
}

function nextConfirmationPlayerIndex(confirmationOrder, excludedPlayerIndices = []) {
    const excluded = new Set(Array.isArray(excludedPlayerIndices) ? excludedPlayerIndices : []);
    return (Array.isArray(confirmationOrder) ? confirmationOrder : [])
        .find(playerIndex => Number.isInteger(playerIndex) && playerIndex >= 0 && !excluded.has(playerIndex)) ?? null;
}

function candidateCollectionExpired(startedAt, now = Date.now(), retentionMs = HOSTLESS_RESTORE_LIMITS.retentionMs) {
    if (!Number.isInteger(startedAt) || startedAt < 0) return true;
    if (!Number.isInteger(now) || now < startedAt) return false;
    return now - startedAt >= retentionMs;
}

module.exports = Object.freeze({
    HOSTLESS_RESTORE_SCHEMA_VERSION,
    HOSTLESS_RESTORE_LIMITS,
    HOSTLESS_RESTORE_RESULTS,
    stableJson,
    canonicalCandidateHash,
    normalizeRestoreRank,
    candidateFingerprint,
    normalizeCandidate,
    uniquePlayerCandidates,
    evaluateCandidateQuorum,
    nextConfirmationPlayerIndex,
    candidateCollectionExpired,
});
