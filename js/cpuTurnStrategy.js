'use strict';

const CpuTurnActionProposal = typeof module !== 'undefined' && module.exports
    ? require('./cpuActionProposal').CPUActionProposal
    : globalThis.CPUActionProposal;

const CpuTurnStrategy = (() => {
    function proposal(action, data) {
        return CpuTurnActionProposal.create(action, data);
    }

    function complete(cpu, selected) {
        if (!selected || !cpu || typeof cpu._consumeDecisionReason !== 'function') return selected;
        return CpuTurnActionProposal.withDecisionReason(selected, cpu._consumeDecisionReason());
    }

    function chooseAction(stepName, context = {}) {
        const { game, cpu, rollDie, choosePendingAction, shopStock } = context;
        if (!game || !cpu) return null;
        if (typeof cpu._clearDecisionReason === 'function') cpu._clearDecisionReason();

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
            return complete(cpu, proposal('selectDice', { useTwo, diceCount: useTwo ? 2 : 1, d1, d2, tunaDice }));
        }
        case 'rerollConfirm':
            if (!cpu.chooseReroll(game)) return complete(cpu, proposal('skipReroll', {}));
            return complete(cpu, proposal('rerollDice', {
                forceDice: rollDie(),
                tunaDice: [rollDie(), rollDie()],
            }));
        case 'harborChoice':
            return complete(cpu, proposal('resolveHarbor', { useBonus: cpu.chooseHarbor(game) }));
        case 'pending':
            return complete(cpu, typeof choosePendingAction === 'function' ? choosePendingAction(cpu) : null);
        case 'build':
            return complete(cpu, typeof cpu.chooseBuildAction === 'function'
                ? cpu.chooseBuildAction(game, shopStock)
                : null);
        case 'nextTurn':
            return proposal('nextTurn', {});
        case 'resolveIT':
            return complete(cpu, proposal('resolveIT', { doSave: cpu.chooseITInvest(game) }));
        default:
            return null;
        }
    }

    return Object.freeze({ chooseAction });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CpuTurnStrategy;
if (typeof globalThis !== 'undefined') globalThis.CpuTurnStrategy = CpuTurnStrategy;
