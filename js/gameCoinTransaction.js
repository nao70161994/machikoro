'use strict';

const GameCoinTransaction = (() => {
    // Optional presentation evidence; never used to apply a transaction.
    function readResolution(value, playerCount = 10) {
        if (!value || !Number.isInteger(value.owner) || value.owner < 0 || value.owner >= playerCount ||
                typeof value.subject !== 'string' || !value.subject || value.subject.length > 80 ||
                !Number.isSafeInteger(value.activation) || value.activation < 0 ||
                !Array.isArray(value.transfers) || !value.transfers.length || value.transfers.length > 20) return null;
        const validSeat = seat => seat === null || seat === 'pool' || Number.isInteger(seat) && seat >= 0 && seat < playerCount;
        let total = 0;
        const transfers = [];
        const pairs = new Set();
        for (const transfer of value.transfers) {
            if (!transfer || !validSeat(transfer.from) || !validSeat(transfer.to) || transfer.from === transfer.to ||
                    !Number.isSafeInteger(transfer.amount) || transfer.amount < 0) return null;
            const pair = JSON.stringify([transfer.from, transfer.to]);
            if (pairs.has(pair)) return null;
            pairs.add(pair);
            total += transfer.amount;
            if (!Number.isSafeInteger(total)) return null;
            transfers.push({ from: transfer.from, to: transfer.to, amount: transfer.amount });
        }
        return { owner: value.owner, subject: value.subject, activation: value.activation, transfers };
    }

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

    function equalDistributionPlan(balances) {
        if (!Array.isArray(balances) || balances.length === 0) {
            throw new TypeError('balances must be a non-empty array');
        }
        const total = balances.reduce((sum, balance) => sum + balance, 0);
        const each = Math.ceil(total / balances.length);
        const remainder = total % balances.length;
        const bankContribution = (balances.length - remainder) % balances.length;
        const nextBalances = balances.map(() => each);
        return Object.freeze({
            balances: Object.freeze(nextBalances),
            total,
            each,
            remainder,
            bankContribution,
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
        readResolution,
        collectionPlan,
        equalDistributionPlan,
        sequentialCollectionPlan,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GameCoinTransaction;
if (typeof window !== 'undefined') window.GameCoinTransaction = GameCoinTransaction;
if (typeof globalThis !== 'undefined') globalThis.GameCoinTransaction = GameCoinTransaction;
