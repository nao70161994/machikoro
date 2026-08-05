'use strict';

const CpuPhaseHandlers = (() => {
    const ORDER = Object.freeze([
        'roll', 'selectDice', 'rerollConfirm', 'harborChoice',
        'pending', 'build', 'nextTurn', 'resolveIT',
    ]);

    function create(dependencies = {}) {
        const required = [
            'checkpoint', 'chooseAction', 'executeAction', 'getGameState',
            'getOnlineState', 'render',
        ];
        for (const name of required) {
            if (typeof dependencies[name] !== 'function') {
                throw new TypeError(`CPU phase handler dependency is required: ${name}`);
            }
        }
        if (!dependencies.actions || !dependencies.gamePhases ||
                !dependencies.pendingResolution || !dependencies.shopStock) {
            throw new TypeError('CPU phase handler runtime dependencies are required');
        }
        const game = () => dependencies.getGameState().game;
        const handlers = [
            {
                name: 'roll',
                run(cpu) {
                    const current = game();
                    if (current.phase !== dependencies.gamePhases.ROLL) return;
                    const proposal = dependencies.chooseAction('roll', cpu);
                    dependencies.executeAction(proposal.action, proposal.data, () =>
                        current.rollDice(proposal.data.forceDice, proposal.data.tunaDice));
                },
            },
            {
                name: 'selectDice',
                run(cpu) {
                    const current = game();
                    if (current.phase !== dependencies.gamePhases.SELECT_DICE) return;
                    const proposal = dependencies.chooseAction('selectDice', cpu);
                    dependencies.executeAction(proposal.action, proposal.data, () => current.selectDiceCount(
                        proposal.data.useTwo, proposal.data.d1, proposal.data.d2, proposal.data.tunaDice
                    ));
                },
            },
            {
                name: 'rerollConfirm',
                run(cpu) {
                    const current = game();
                    if (current.phase !== dependencies.gamePhases.REROLL_CONFIRM) return;
                    const proposal = dependencies.chooseAction('rerollConfirm', cpu);
                    if (proposal.action === dependencies.actions.REROLL_DICE) {
                        dependencies.executeAction(proposal.action, proposal.data, () =>
                            current.rerollDice(proposal.data.forceDice, proposal.data.tunaDice));
                    } else {
                        dependencies.executeAction(proposal.action, proposal.data, () => current.skipReroll());
                    }
                },
            },
            {
                name: 'harborChoice',
                run(cpu) {
                    const current = game();
                    if (current.phase !== dependencies.gamePhases.HARBOR_CHOICE) return;
                    const proposal = dependencies.chooseAction('harborChoice', cpu);
                    dependencies.executeAction(proposal.action, proposal.data, () =>
                        current.resolveHarbor(proposal.data.useBonus));
                },
            },
            {
                name: 'pending',
                run(cpu) {
                    const current = game();
                    if (current.phase !== dependencies.gamePhases.PENDING) return;
                    const proposal = dependencies.chooseAction('pending', cpu);
                    if (!proposal) return;
                    dependencies.checkpoint('scheduleCPU-pending-resolution', {
                        action: proposal.action,
                        pendingIT: !!current.pendingIT,
                        pendingAction: dependencies.nextPendingAction(current),
                    });
                    dependencies.executeAction(proposal.action, proposal.data, () =>
                        dependencies.pendingResolution.applyPendingAction(current, proposal));
                },
            },
            {
                name: 'build',
                run(cpu) {
                    const current = game();
                    if (current.phase !== dependencies.gamePhases.BUILD) return;
                    const actionOnly = typeof cpu.chooseBuildAction === 'function' &&
                        typeof cpu.executeBuildAction === 'function';
                    const proposal = actionOnly ? dependencies.chooseAction('build', cpu) : null;
                    const result = actionOnly
                        ? cpu.executeBuildAction(proposal, current, dependencies.shopStock)
                        : cpu.build(current, dependencies.shopStock);
                    if (result === false) {
                        if (dependencies.getOnlineState().isOnlineGame) return false;
                        if (!current.builtThisTurn) {
                            dependencies.checkpoint('scheduleCPU-build-failed-pass');
                            current.nextTurn();
                        }
                        return true;
                    }
                    dependencies.render();
                    return true;
                },
            },
            {
                name: 'nextTurn',
                run(cpu) {
                    const current = game();
                    if (current.phase !== dependencies.gamePhases.BUILD || current.pendingIT) return;
                    const proposal = dependencies.chooseAction('nextTurn', cpu);
                    dependencies.executeAction(proposal.action, proposal.data, () => current.nextTurn());
                },
            },
            {
                name: 'resolveIT',
                run(cpu) {
                    const current = game();
                    if (!current.pendingIT) return;
                    const proposal = dependencies.chooseAction('resolveIT', cpu);
                    dependencies.executeAction(proposal.action, proposal.data, () =>
                        current.resolveIT(proposal.data.doSave));
                },
            },
        ];
        return Object.freeze(handlers.map(handler => Object.freeze(handler)));
    }

    return Object.freeze({ ORDER, create });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CpuPhaseHandlers;
if (typeof window !== 'undefined') Object.assign(window, { CpuPhaseHandlers });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { CpuPhaseHandlers });
