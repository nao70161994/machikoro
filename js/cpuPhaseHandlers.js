'use strict';

const CpuPhaseHandlers = (() => {
    const ORDER = Object.freeze([
        'roll', 'selectDice', 'rerollConfirm', 'harborChoice',
        'pending', 'build', 'nextTurn', 'resolveIT',
    ]);

    function pendingProgressSignature(game) {
        if (!game) return '';
        return [
            game.phase || '',
            game.pendingTV || 0,
            game.pendingBusiness || 0,
            game.pendingCleaning || 0,
            game.pendingMover || 0,
            game.pendingRenovation || 0,
            game.pendingIT ? 1 : 0,
            Array.isArray(game.pendingActionQueue) ? game.pendingActionQueue.length : -1,
        ].join(':');
    }

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
        const chooseRequiredAction = (step, cpu, current) => {
            const proposal = dependencies.chooseAction(step, cpu);
            if (proposal) return proposal;
            dependencies.checkpoint('scheduleCPU-step-no-proposal', {
                step,
                phase: current && current.phase || '',
                difficulty: cpu && cpu.difficulty || '',
                pendingAction: typeof dependencies.nextPendingAction === 'function'
                    ? dependencies.nextPendingAction(current)
                    : null,
            });
            return null;
        };
        const handlers = [
            {
                name: 'roll',
                run(cpu) {
                    const current = game();
                    if (current.phase !== dependencies.gamePhases.ROLL) return;
                    const proposal = chooseRequiredAction('roll', cpu, current);
                    if (!proposal) return false;
                    return dependencies.executeAction(proposal.action, proposal.data, () =>
                        current.rollDice(proposal.data.forceDice, proposal.data.tunaDice));
                },
            },
            {
                name: 'selectDice',
                run(cpu) {
                    const current = game();
                    if (current.phase !== dependencies.gamePhases.SELECT_DICE) return;
                    const proposal = chooseRequiredAction('selectDice', cpu, current);
                    if (!proposal) return false;
                    return dependencies.executeAction(proposal.action, proposal.data, () => current.selectDiceCount(
                        proposal.data.useTwo, proposal.data.d1, proposal.data.d2, proposal.data.tunaDice
                    ));
                },
            },
            {
                name: 'rerollConfirm',
                run(cpu) {
                    const current = game();
                    if (current.phase !== dependencies.gamePhases.REROLL_CONFIRM) return;
                    const proposal = chooseRequiredAction('rerollConfirm', cpu, current);
                    if (!proposal) return false;
                    if (proposal.action === dependencies.actions.REROLL_DICE) {
                        return dependencies.executeAction(proposal.action, proposal.data, () =>
                            current.rerollDice(proposal.data.forceDice, proposal.data.tunaDice));
                    }
                    return dependencies.executeAction(proposal.action, proposal.data, () => current.skipReroll());
                },
            },
            {
                name: 'harborChoice',
                run(cpu) {
                    const current = game();
                    if (current.phase !== dependencies.gamePhases.HARBOR_CHOICE) return;
                    const proposal = chooseRequiredAction('harborChoice', cpu, current);
                    if (!proposal) return false;
                    return dependencies.executeAction(proposal.action, proposal.data, () =>
                        current.resolveHarbor(proposal.data.useBonus));
                },
            },
            {
                name: 'pending',
                run(cpu) {
                    const current = game();
                    if (current.phase !== dependencies.gamePhases.PENDING) return;
                    const pendingAction = dependencies.nextPendingAction(current);
                    const beforeSignature = pendingProgressSignature(current);
                    const proposal = dependencies.chooseAction('pending', cpu);
                    if (!proposal) {
                        dependencies.checkpoint('scheduleCPU-pending-no-proposal', {
                            difficulty: cpu && cpu.difficulty || '',
                            pendingIT: !!current.pendingIT,
                            pendingAction,
                        });
                        return false;
                    }
                    dependencies.checkpoint('scheduleCPU-pending-resolution', {
                        action: proposal.action,
                        pendingIT: !!current.pendingIT,
                        pendingAction,
                    });
                    const result = dependencies.executeAction(proposal.action, proposal.data, () =>
                        dependencies.pendingResolution.applyPendingAction(current, proposal));
                    if (result === false) {
                        dependencies.checkpoint('scheduleCPU-pending-apply-rejected', {
                            action: proposal.action,
                            difficulty: cpu && cpu.difficulty || '',
                            pendingAction,
                        });
                        return false;
                    }
                    if (!dependencies.getOnlineState().isOnlineGame &&
                            pendingProgressSignature(current) === beforeSignature) {
                        dependencies.checkpoint('scheduleCPU-pending-state-unchanged', {
                            action: proposal.action,
                            difficulty: cpu && cpu.difficulty || '',
                            pendingAction,
                        });
                        return false;
                    }
                    return result;
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
                    const result = actionOnly && proposal
                        ? dependencies.getOnlineState().isOnlineGame
                            ? cpu.executeBuildAction(proposal, current, dependencies.shopStock)
                            : dependencies.executeAction(proposal.action, proposal.data, () =>
                                cpu.executeBuildAction(proposal, current, dependencies.shopStock))
                        : actionOnly
                            ? false
                            : cpu.build(current, dependencies.shopStock);
                    if (result === false) {
                        if (dependencies.getOnlineState().isOnlineGame) return false;
                        if (!current.builtThisTurn) {
                            dependencies.checkpoint('scheduleCPU-build-failed-pass');
                            dependencies.executeAction(
                                dependencies.actions.NEXT_TURN,
                                {},
                                () => current.nextTurn()
                            );
                        }
                        return true;
                    }
                    if (!actionOnly) dependencies.render();
                    return true;
                },
            },
            {
                name: 'nextTurn',
                run(cpu) {
                    const current = game();
                    if (current.phase !== dependencies.gamePhases.BUILD || current.pendingIT) return;
                    const proposal = chooseRequiredAction('nextTurn', cpu, current);
                    if (!proposal) return false;
                    return dependencies.executeAction(proposal.action, proposal.data, () => current.nextTurn());
                },
            },
            {
                name: 'resolveIT',
                run(cpu) {
                    const current = game();
                    if (!current.pendingIT) return;
                    const proposal = chooseRequiredAction('resolveIT', cpu, current);
                    if (!proposal) return false;
                    return dependencies.executeAction(proposal.action, proposal.data, () =>
                        current.resolveIT(proposal.data.doSave));
                },
            },
        ];
        return Object.freeze(handlers.map(handler => Object.freeze(handler)));
    }

    return Object.freeze({ ORDER, create, pendingProgressSignature });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CpuPhaseHandlers;
if (typeof window !== 'undefined') Object.assign(window, { CpuPhaseHandlers });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { CpuPhaseHandlers });
