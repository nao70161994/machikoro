'use strict';

const LocalGameEngineRuntime = (() => {
    function createRuntime(dependencies = {}) {
        const requiredFunctions = [
            'adapterOptions', 'assignShopStock', 'checkpoint', 'getEngine', 'getGameState',
            'getOnlineState', 'isAuthorityEnabled', 'isShadowEnabled', 'render',
            'scheduleCpu', 'sendAction',
        ];
        for (const name of requiredFunctions) {
            if (typeof dependencies[name] !== 'function') {
                throw new TypeError(`local game engine runtime dependency is required: ${name}`);
            }
        }
        const requiredObjects = [
            'actionProposal', 'clientShadow', 'determinism', 'gameRuntime',
            'runtimeAdapter', 'snapshot', 'shopStock',
        ];
        for (const name of requiredObjects) {
            if (!dependencies[name]) {
                throw new TypeError(`local game engine runtime dependency is required: ${name}`);
            }
        }
        const outcomeController = dependencies.clientShadow.createOutcomeController();

        function createAdapter() {
            return dependencies.runtimeAdapter.create(dependencies.adapterOptions());
        }

        function buildSnapshot() {
            const state = dependencies.getGameState();
            return dependencies.snapshot.serializeGameState(state.game, dependencies.shopStock, {
                undoState: state.undoState,
                actionSeq: 0,
                logLimit: Number.MAX_SAFE_INTEGER,
                pendingActionsFor: dependencies.pendingActionsFor,
            });
        }

        function prepare(action, data) {
            if (!dependencies.isShadowEnabled()) return null;
            const sourceSnapshot = buildSnapshot();
            if (!dependencies.determinism.isResolved({
                action,
                data,
                snapshot: sourceSnapshot,
                stationName: dependencies.stationName,
            })) return null;
            return dependencies.clientShadow.prepare({
                enabled: true,
                action,
                data,
                snapshot: sourceSnapshot,
                transition(snapshot, shadowAction, shadowData) {
                    const adapter = createAdapter();
                    return dependencies.getEngine().transitionSnapshot({
                        snapshot,
                        action: shadowAction,
                        data: shadowData,
                        hydrate: adapter.hydrate,
                        serialize: adapter.serialize,
                    });
                },
            });
        }

        function adopt(snapshot) {
            const adapter = createAdapter();
            const runtime = adapter.hydrate(snapshot);
            const rebuilt = adapter.serialize(runtime);
            if (!dependencies.clientShadow.equalSnapshots(rebuilt, snapshot)) return false;
            dependencies.gameRuntime.setGame(runtime.game);
            dependencies.assignShopStock(dependencies.shopStock, runtime.shopStock);
            dependencies.gameRuntime.setUndoState(runtime.undoState);
            return true;
        }

        function finish(prepared) {
            if (!prepared) return null;
            const outcome = dependencies.clientShadow.finish({
                prepared,
                liveSnapshot: buildSnapshot(),
                authorityEnabled: dependencies.isAuthorityEnabled(),
                adoptSnapshot: adopt,
            });
            outcomeController.set(outcome);
            return outcome;
        }

        function runHuman(action, data, fallback) {
            const online = dependencies.getOnlineState();
            dependencies.checkpoint('action-start', { action, isOnlineGame: online.isOnlineGame });
            if (online.isOnlineGame) {
                const sent = dependencies.sendAction(action, data);
                dependencies.checkpoint('action-online-send', { action, sent });
                return sent;
            }
            const prepared = prepare(action, data);
            const result = fallback();
            dependencies.checkpoint('action-local-applied', { action, result });
            finish(prepared);
            if (result === false) return false;
            dependencies.render();
            dependencies.checkpoint('action-rendered', { action });
            dependencies.scheduleCpu();
            dependencies.checkpoint('action-scheduleCPU-returned', { action });
            return true;
        }

        function runCpu(action, data, fallback) {
            const game = dependencies.getGameState().game;
            const proposal = dependencies.actionProposal.create(action, data);
            if (!proposal) return false;
            if (dependencies.getOnlineState().isOnlineGame) {
                dependencies.sendAction(proposal.action, proposal.data);
                return;
            }
            const prepared = prepare(proposal.action, proposal.data);
            const engine = dependencies.getEngine();
            if (engine && typeof engine.applyMutableAction === 'function') {
                engine.applyMutableAction({
                    game,
                    action: proposal.action,
                    data: proposal.data,
                });
            } else {
                fallback();
            }
            finish(prepared);
            dependencies.render();
            dependencies.scheduleCpu();
        }

        return Object.freeze({
            outcomeController,
            adopt,
            buildSnapshot,
            createAdapter,
            finish,
            prepare,
            runCpu,
            runHuman,
        });
    }
    return Object.freeze({ createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LocalGameEngineRuntime;
if (typeof window !== 'undefined') Object.assign(window, { LocalGameEngineRuntime });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { LocalGameEngineRuntime });
