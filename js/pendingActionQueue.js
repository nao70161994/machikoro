'use strict';

const PendingActionQueue = Object.freeze({
    createContract(actions) {
        if (!actions || typeof actions !== 'object') {
            throw new TypeError('actions is required');
        }
        const specs = Object.freeze([
            Object.freeze({ field: 'pendingTV', action: actions.RESOLVE_TV }),
            Object.freeze({ field: 'pendingBusiness', action: actions.RESOLVE_BUSINESS }),
            Object.freeze({ field: 'pendingCleaning', action: actions.RESOLVE_CLEANING }),
            Object.freeze({ field: 'pendingMover', action: actions.RESOLVE_MOVER }),
            Object.freeze({ field: 'pendingRenovation', action: actions.RESOLVE_RENOVATION }),
        ]);
        const byField = Object.freeze(Object.fromEntries(specs.map(spec => [spec.field, spec])));
        const byAction = Object.freeze(Object.fromEntries(specs.map(spec => [spec.action, spec])));
        return Object.freeze({ specs, byField, byAction });
    },

    descriptorsFromFields(game, contract) {
        if (!game) return [];
        return contract.specs
            .map(spec => ({
                action: spec.action,
                field: spec.field,
                count: Number.isInteger(game[spec.field]) ? game[spec.field] : 0,
            }))
            .filter(pending => pending.count > 0);
    },

    entriesFromFields(game, contract) {
        const entries = [];
        for (const pending of PendingActionQueue.descriptorsFromFields(game, contract)) {
            for (let index = 0; index < pending.count; index++) {
                entries.push({ action: pending.action, field: pending.field });
            }
        }
        return entries;
    },

    normalize(game, contract) {
        if (!game || !Array.isArray(game.pendingActionQueue)) return [];
        const counts = Object.fromEntries(contract.specs.map(spec => [spec.field, 0]));
        const queue = [];
        for (const entry of game.pendingActionQueue) {
            if (!entry || typeof entry !== 'object') continue;
            const fieldSpec = contract.byField[entry.field];
            const actionSpec = contract.byAction[entry.action];
            if (entry.field && entry.action && (!fieldSpec || fieldSpec !== actionSpec)) continue;
            const spec = fieldSpec || actionSpec;
            if (!spec) continue;
            queue.push({ action: spec.action, field: spec.field, count: 1 });
            counts[spec.field]++;
        }
        for (const spec of contract.specs) {
            const fieldCount = Number.isInteger(game[spec.field]) ? game[spec.field] : 0;
            if (counts[spec.field] !== fieldCount) return [];
        }
        return queue;
    },

    group(queue) {
        const grouped = [];
        for (const entry of queue) {
            const last = grouped[grouped.length - 1];
            if (last && last.action === entry.action && last.field === entry.field) {
                last.count++;
            } else {
                grouped.push({ action: entry.action, field: entry.field, count: 1 });
            }
        }
        return grouped;
    },

    ensure(game, contract) {
        if (!game) return [];
        const queue = PendingActionQueue.normalize(game, contract);
        if (queue.length > 0) return queue;
        const entries = PendingActionQueue.entriesFromFields(game, contract);
        if (Array.isArray(game.pendingActionQueue) || entries.length > 0) {
            game.pendingActionQueue = entries.map(entry => ({ action: entry.action, field: entry.field }));
        }
        return entries;
    },

    serialize(game, contract) {
        return PendingActionQueue.ensure(game, contract)
            .map(entry => ({ action: entry.action, field: entry.field }));
    },
});

if (typeof module !== 'undefined' && module.exports) module.exports = { PendingActionQueue };
if (typeof window !== 'undefined') window.PendingActionQueue = PendingActionQueue;
if (typeof globalThis !== 'undefined') globalThis.PendingActionQueue = PendingActionQueue;
