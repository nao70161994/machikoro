'use strict';

const CpuTurnActionProposal = typeof module !== 'undefined' && module.exports
    ? require('./cpuActionProposal').CPUActionProposal
    : globalThis.CPUActionProposal;

const CpuTurnStrategy = (() => {
    function proposal(action, data) {
        return CpuTurnActionProposal.create(action, data);
    }

    function chooseAction(stepName, context = {}) {
        const { game, cpu, rollDie, choosePendingAction } = context;
        if (!game || !cpu) return null;

        switch (stepName) {
        case 'roll': {
            const forceDice = rollDie();
            const tunaDice = [rollDie(), rollDie()];
            return proposal('rollDice', { forceDice, tunaDice });
        }
        case 'selectDice': {
            const useTwo = cpu.chooseDiceCount(game);
            const d1 = rollDie();
            const d2 = rollDie();
            const tunaDice = [rollDie(), rollDie()];
            return proposal('selectDice', { useTwo, diceCount: useTwo ? 2 : 1, d1, d2, tunaDice });
        }
        case 'rerollConfirm':
            if (!cpu.chooseReroll(game)) return proposal('skipReroll', {});
            return proposal('rerollDice', {
                forceDice: rollDie(),
                tunaDice: [rollDie(), rollDie()],
            });
        case 'harborChoice':
            return proposal('resolveHarbor', { useBonus: cpu.chooseHarbor(game) });
        case 'pending':
            return typeof choosePendingAction === 'function' ? choosePendingAction(cpu) : null;
        case 'nextTurn':
            return proposal('nextTurn', {});
        case 'resolveIT':
            return proposal('resolveIT', { doSave: cpu.chooseITInvest(game) });
        default:
            return null;
        }
    }

    return Object.freeze({ chooseAction });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CpuTurnStrategy;
if (typeof globalThis !== 'undefined') globalThis.CpuTurnStrategy = CpuTurnStrategy;
