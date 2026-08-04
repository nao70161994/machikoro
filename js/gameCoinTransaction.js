'use strict';

const GameCoinTransaction = (() => {
    function assertInputs(balances, receiverIndex, requestedAmounts) {
        if (!Array.isArray(balances) || !Array.isArray(requestedAmounts) ||
                balances.length !== requestedAmounts.length) {
            throw new TypeError('balances and requestedAmounts must be equal-length arrays');
        }
        if (!Number.isInteger(receiverIndex) || receiverIndex < 0 || receiverIndex >= balances.length) {
            throw new RangeError('receiverIndex must identify a balance');
        }
    }

    function collectionPlan(balances, receiverIndex, requestedAmounts) {
        assertInputs(balances, receiverIndex, requestedAmounts);
        const nextBalances = balances.slice();
        const transfers = balances.map(() => 0);
        let total = 0;
        for (let index = 0; index < balances.length; index++) {
            if (index === receiverIndex) continue;
            const requested = requestedAmounts[index] || 0;
            const transfer = Math.min(requested, balances[index]);
            transfers[index] = transfer;
            nextBalances[index] -= transfer;
            total += transfer;
        }
        nextBalances[receiverIndex] += total;
        return Object.freeze({
            balances: Object.freeze(nextBalances),
            transfers: Object.freeze(transfers),
            total,
        });
    }

    function equalDistributionPlan(balances, remainderReceiverIndex) {
        if (!Array.isArray(balances) || balances.length === 0) {
            throw new TypeError('balances must be a non-empty array');
        }
        if (!Number.isInteger(remainderReceiverIndex) ||
                remainderReceiverIndex < 0 || remainderReceiverIndex >= balances.length) {
            throw new RangeError('remainderReceiverIndex must identify a balance');
        }
        const total = balances.reduce((sum, balance) => sum + balance, 0);
        const each = Math.floor(total / balances.length);
        const remainder = total - each * balances.length;
        const nextBalances = balances.map(() => each);
        nextBalances[remainderReceiverIndex] += remainder;
        return Object.freeze({
            balances: Object.freeze(nextBalances),
            total,
            each,
            remainder,
        });
    }

    function sequentialCollectionPlan(available, requestedAmounts) {
        if (!Number.isFinite(available) || !Array.isArray(requestedAmounts)) {
            throw new TypeError('available and requestedAmounts are required');
        }
        let remaining = available;
        const transfers = requestedAmounts.map(requested => {
            const transfer = Math.min(requested || 0, remaining);
            remaining -= transfer;
            return transfer;
        });
        return Object.freeze({
            remaining,
            transfers: Object.freeze(transfers),
            total: available - remaining,
        });
    }

    return Object.freeze({
        collectionPlan,
        equalDistributionPlan,
        sequentialCollectionPlan,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GameCoinTransaction;
if (typeof window !== 'undefined') window.GameCoinTransaction = GameCoinTransaction;
if (typeof globalThis !== 'undefined') globalThis.GameCoinTransaction = GameCoinTransaction;
