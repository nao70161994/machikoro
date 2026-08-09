'use strict';

const CpuTurnSchedulerRuntime = (() => {
    function createRuntime(dependencies = {}) {
        const required = [
            'checkpoint', 'getActionFlightState', 'getCpuSpeed', 'getGameState',
            'getOnlineState', 'getPhaseHandlers', 'isReconnectBlocked', 'now',
            'setTimeout', 'unlockHumanTurn',
        ];
        for (const name of required) {
            if (typeof dependencies[name] !== 'function') {
                throw new TypeError(`CPU turn scheduler runtime dependency is required: ${name}`);
            }
        }
        if (!dependencies.gamePhases || !dependencies.policy) {
            throw new TypeError('CPU turn scheduler runtime policies are required');
        }
        const controller = dependencies.policy.createController();
        const executionLeaseMs = Number.isFinite(dependencies.executionLeaseMs)
            ? Math.max(1000, dependencies.executionLeaseMs)
            : 15000;

        function invalidate() { return controller.invalidate().scheduleToken; }
        function cancel(reason = 'cpu-schedule-cancel') {
            const state = controller.cancel();
            dependencies.checkpoint(reason, { cpuScheduleToken: state.scheduleToken });
            return state.scheduleToken;
        }
        function markScheduled(delay, leaseMs = 1500) {
            return controller.markScheduled(dependencies.now(), delay, leaseMs).scheduledUntil;
        }
        function refreshLease(leaseMs = 1500) {
            return controller.refreshLease(dependencies.now(), leaseMs).scheduledUntil;
        }
        function isStepScheduled() { return controller.isStepScheduled(); }

        function onlineBlocked(online) {
            return online.isOnlineGame && (
                dependencies.isReconnectBlocked() ||
                dependencies.getActionFlightState().inFlight ||
                !online.socket || online.socket.connected === false
            );
        }

        function blockedReason() {
            const online = dependencies.getOnlineState();
            const transportReason = dependencies.policy.blockedReason({
                isReplaying: online.isReplaying,
                isOnlineGame: online.isOnlineGame,
                isRoomHost: online.isRoomHost,
                isReconnecting: online.isOnlineGame ? dependencies.isReconnectBlocked() : false,
                onlineActionInFlight: online.isOnlineGame && dependencies.getActionFlightState().inFlight,
                socketConnected: !online.isOnlineGame || (!!online.socket && online.socket.connected !== false),
                hasGame: true,
                isCpuTurn: true,
            });
            if (transportReason) return transportReason;
            const state = dependencies.getGameState();
            const game = state.game;
            const index = game ? game.currentPlayerIndex : null;
            return dependencies.policy.blockedReason({
                hasGame: !!game,
                hasWinner: !!(game && game.checkWinner && game.checkWinner()),
                isCpuTurn: !!(game && Array.isArray(state.cpuPlayers) && state.cpuPlayers[index]),
            });
        }

        function health() {
            const state = dependencies.getGameState();
            const game = state.game;
            const index = game ? game.currentPlayerIndex : null;
            const scheduler = controller.snapshot();
            return dependencies.policy.buildHealth({
                scheduleToken: scheduler.scheduleToken,
                pendingToken: scheduler.pendingToken,
                scheduledUntil: scheduler.scheduledUntil,
                activeStep: scheduler.activeStep,
                now: dependencies.now(),
                isCpuTurn: !!(game && Array.isArray(state.cpuPlayers) && state.cpuPlayers[index]),
                currentPlayerIndex: index,
                blockedReason: blockedReason(),
            });
        }

        function queueStep(token, delay, run) {
            markScheduled(delay);
            controller.setPendingToken(token);
            dependencies.setTimeout(() => {
                if (!controller.isCurrent(token)) return;
                controller.clearPendingToken();
                refreshLease();
                run();
            }, delay);
        }

        function shouldRunStep(name) {
            const game = dependencies.getGameState().game;
            return dependencies.policy.shouldRunPhaseStep(name, {
                hasGame: !!game,
                phase: game && game.phase,
                pendingIT: !!(game && game.pendingIT),
                builtThisTurn: !!(game && game.builtThisTurn),
            }, dependencies.gamePhases);
        }

        function schedule(reason = 'scheduleCPU') {
            const online = dependencies.getOnlineState();
            const state = dependencies.getGameState();
            const game = state.game;
            dependencies.checkpoint('scheduleCPU-enter', {
                reason,
                isReplaying: online.isReplaying,
                isOnlineGame: online.isOnlineGame,
                isRoomHost: online.isRoomHost,
            });
            if (online.isReplaying) { dependencies.checkpoint('scheduleCPU-skip-replaying'); return health(); }
            if (online.isOnlineGame && !online.isRoomHost) { dependencies.checkpoint('scheduleCPU-skip-non-host'); return health(); }
            if (onlineBlocked(online)) {
                dependencies.checkpoint('scheduleCPU-skip-online-blocked', {
                    onlineActionInFlight: dependencies.getActionFlightState().inFlight,
                });
                return health();
            }
            if (!game || game.checkWinner()) { dependencies.checkpoint('scheduleCPU-skip-no-game-or-winner'); return health(); }
            const playerIndex = game.currentPlayerIndex;
            if (!state.cpuPlayers[playerIndex]) {
                dependencies.checkpoint('scheduleCPU-skip-human-turn', { currentPlayerIndex: playerIndex });
                dependencies.unlockHumanTurn('scheduleCPU-human-turn-unlock');
                return health();
            }
            const cpu = state.cpuPlayers[playerIndex];
            const token = invalidate();
            let stepIndex = 0;
            let pendingNoProgressRetries = 0;
            const handlers = dependencies.getPhaseHandlers();

            function runNextStep() {
                const currentToken = controller.snapshot().scheduleToken;
                dependencies.checkpoint('scheduleCPU-step-enter', { token, stepIndex, currentToken });
                if (!controller.isCurrent(token)) {
                    dependencies.checkpoint('scheduleCPU-step-stale', { token, currentToken });
                    return;
                }
                if (stepIndex >= handlers.length) {
                    queueStep(token, 500, () => {
                        const latest = dependencies.getGameState().game;
                        if (latest && !latest.checkWinner()) schedule('scheduleCPU');
                    });
                    return;
                }
                const step = handlers[stepIndex++];
                if (!shouldRunStep(step.name)) {
                    const latest = dependencies.getGameState().game;
                    dependencies.checkpoint('scheduleCPU-step-skip-phase', {
                        step: step.name,
                        phase: latest && latest.phase || '',
                        pendingIT: !!(latest && latest.pendingIT),
                    });
                    runNextStep();
                    return;
                }
                queueStep(token, dependencies.getCpuSpeed(), () => {
                    const stepOnline = dependencies.getOnlineState();
                    if (stepOnline.isReplaying || (stepOnline.isOnlineGame && !stepOnline.isRoomHost) ||
                            onlineBlocked(stepOnline)) return;
                    const stepState = dependencies.getGameState();
                    const stepGame = stepState.game;
                    if (!stepGame || stepGame.checkWinner()) return;
                    if (!stepState.cpuPlayers[stepGame.currentPlayerIndex]) return;
                    const startedAt = dependencies.now();
                    const stepExecutionId = [
                        token,
                        stepIndex - 1,
                        step.name,
                        stepGame.currentPlayerIndex,
                        startedAt,
                    ].join(':');
                    const stepDetails = {
                        step: step.name,
                        phase: stepGame.phase || '',
                        difficulty: cpu && cpu.difficulty || '',
                        currentPlayerIndex: stepGame.currentPlayerIndex,
                        token,
                        stepExecutionId,
                        startedAt,
                    };
                    let result;
                    controller.markActive({
                        ...stepDetails,
                        activeUntil: startedAt + executionLeaseMs,
                    });
                    try {
                        dependencies.checkpoint('scheduleCPU-step-run', stepDetails);
                        result = step.run(cpu);
                    } catch (error) {
                        if (dependencies.console && typeof dependencies.console.error === 'function') {
                            dependencies.console.error('[cpu] phase step failed:', step.name, error);
                        }
                        dependencies.checkpoint('scheduleCPU-step-error', {
                            ...stepDetails,
                            durationMs: Math.max(0, dependencies.now() - startedAt),
                            message: error && error.message || String(error),
                        });
                        controller.clearActive(stepExecutionId);
                        if (dependencies.getOnlineState().isOnlineGame) return;
                        if (step.name === 'build' && stepGame.phase === dependencies.gamePhases.BUILD && !stepGame.builtThisTurn) {
                            stepGame.nextTurn();
                        }
                        runNextStep();
                        return;
                    }
                    controller.clearActive(stepExecutionId);
                    dependencies.checkpoint('scheduleCPU-step-result', {
                        ...stepDetails,
                        durationMs: Math.max(0, dependencies.now() - startedAt),
                        stepResult: result,
                    });
                    if (result === false) {
                        if (step.name === 'pending' && pendingNoProgressRetries < 1) {
                            pendingNoProgressRetries++;
                            dependencies.checkpoint('scheduleCPU-pending-no-progress-retry', {
                                ...stepDetails,
                                retryCount: pendingNoProgressRetries,
                            });
                            stepIndex--;
                            queueStep(token, 500, runNextStep);
                            return;
                        }
                        if (step.name === 'pending') {
                            dependencies.checkpoint('scheduleCPU-pending-no-progress-exhausted', {
                                ...stepDetails,
                                retryCount: pendingNoProgressRetries,
                            });
                        }
                        return;
                    }
                    if (step.name === 'pending') pendingNoProgressRetries = 0;
                    runNextStep();
                });
            }
            runNextStep();
            return health();
        }

        const facade = Object.freeze({
            schedule,
            cancel(reason = 'cpu-turn-scheduler-cancel') { cancel(reason); return health(); },
            getHealth: health,
        });
        return Object.freeze({
            controller, facade, blockedReason, cancel, health, invalidate,
            isStepScheduled, markScheduled, queueStep, refreshLease, schedule,
            shouldRunStep,
        });
    }
    return Object.freeze({ createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CpuTurnSchedulerRuntime;
if (typeof window !== 'undefined') Object.assign(window, { CpuTurnSchedulerRuntime });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { CpuTurnSchedulerRuntime });
