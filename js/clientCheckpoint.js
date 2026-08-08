'use strict';

const ClientCheckpoint = (() => {
    const DEFAULT_MAX_ENTRIES = 80;
    const DEFAULT_PERSIST_LIMIT = 5000;
    const CPU_STEP_JOURNAL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

    function createCheckpoint(options) {
        try {
            return {
                event: options.event,
                details: options.details,
                snapshot: options.buildSnapshot(),
                timestamp: options.timestamp(),
            };
        } catch (_) {
            try {
                return {
                    event: options.event,
                    details: options.details,
                    snapshot: null,
                    timestamp: options.timestamp(),
                    snapshotFailed: true,
                };
            } catch (_) {
                return null;
            }
        }
    }

    function appendToRoot(root, checkpoint, maxEntries) {
        if (!root) return;
        const list = Array.isArray(root.__machikoroClientCheckpoints)
            ? root.__machikoroClientCheckpoints
            : [];
        list.push(checkpoint);
        while (list.length > maxEntries) list.shift();
        root.__machikoroClientCheckpoints = list;
    }

    function record(options) {
        const checkpoint = createCheckpoint(options);
        if (!checkpoint) return null;

        try {
            appendToRoot(
                options.getRoot(),
                checkpoint,
                Number.isInteger(options.maxEntries) ? options.maxEntries : DEFAULT_MAX_ENTRIES
            );
        } catch (_) {}

        try {
            const limit = Number.isInteger(options.persistLimit)
                ? options.persistLimit
                : DEFAULT_PERSIST_LIMIT;
            options.persist(JSON.stringify(checkpoint).slice(0, limit));
        } catch (_) {}
        return checkpoint;
    }

    function parseJsonObject(value) {
        try {
            const parsed = typeof value === 'string' ? JSON.parse(value) : value;
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
        } catch (_) {
            return null;
        }
    }

    function cpuStepJournalMutation(checkpoint, activeValue) {
        if (!checkpoint || !checkpoint.details) return Object.freeze({ kind: 'none' });
        const details = checkpoint.details;
        if (checkpoint.event === 'scheduleCPU-step-run' && details.stepExecutionId) {
            return Object.freeze({
                kind: 'write',
                value: JSON.stringify({
                    schemaVersion: 1,
                    stepExecutionId: String(details.stepExecutionId),
                    step: String(details.step || ''),
                    phase: String(details.phase || ''),
                    difficulty: String(details.difficulty || ''),
                    currentPlayerIndex: Number.isInteger(details.currentPlayerIndex)
                        ? details.currentPlayerIndex
                        : null,
                    token: Number.isInteger(details.token) ? details.token : null,
                    startedAt: Number.isFinite(details.startedAt) ? details.startedAt : null,
                    timestamp: checkpoint.timestamp || '',
                }),
            });
        }
        if (checkpoint.event !== 'scheduleCPU-step-result' &&
                checkpoint.event !== 'scheduleCPU-step-error') {
            return Object.freeze({ kind: 'none' });
        }
        const active = parseJsonObject(activeValue);
        if (!active || active.stepExecutionId !== details.stepExecutionId) {
            return Object.freeze({ kind: 'none' });
        }
        return Object.freeze({ kind: 'remove' });
    }

    function abandonedCpuStepIncident(value, now = Date.now()) {
        const active = parseJsonObject(value);
        if (!active) return Object.freeze({ kind: value ? 'discard' : 'none' });
        if (active.schemaVersion !== 1 || !active.stepExecutionId || active.difficulty !== 'strong') {
            return Object.freeze({ kind: 'discard' });
        }
        const startedAt = Number(active.startedAt);
        const ageMs = now - startedAt;
        if (!Number.isFinite(startedAt) || ageMs < 0 || ageMs > CPU_STEP_JOURNAL_MAX_AGE_MS) {
            return Object.freeze({ kind: 'discard' });
        }
        const summary = Object.freeze({
            schemaVersion: 1,
            incidentKind: 'cpu-step-abandoned',
            stepExecutionId: String(active.stepExecutionId),
            step: String(active.step || ''),
            phase: String(active.phase || ''),
            difficulty: 'strong',
            currentPlayerIndex: Number.isInteger(active.currentPlayerIndex)
                ? active.currentPlayerIndex
                : null,
            token: Number.isInteger(active.token) ? active.token : null,
            startedAt,
            detectedAt: now,
            elapsedMs: ageMs,
        });
        return Object.freeze({ kind: 'report', summary });
    }

    return Object.freeze({ record, cpuStepJournalMutation, abandonedCpuStepIncident });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ClientCheckpoint;
if (typeof window !== 'undefined') window.ClientCheckpoint = ClientCheckpoint;
if (typeof globalThis !== 'undefined') globalThis.ClientCheckpoint = ClientCheckpoint;
