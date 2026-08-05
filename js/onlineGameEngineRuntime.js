'use strict';

const OnlineGameEngineRuntime = (() => {
    const BUILD_ACTIONS = Object.freeze(['buildCard', 'buildLandmark']);
    const UNDO_CLEAR_ACTIONS = Object.freeze(['undoBuild', 'nextTurn']);

    function createRuntime(dependencies = {}) {
        const requiredFunctions = [
            'adoptSnapshot', 'applyMutableAction', 'assignShopStock', 'buildSnapshot',
            'buildUndoSnapshot', 'createAdapter', 'getClientShadow', 'isAuthorityEnabled',
            'isShadowEnabled', 'setDiagnostic',
        ];
        for (const name of requiredFunctions) {
            if (typeof dependencies[name] !== 'function') {
                throw new TypeError(`online game engine runtime dependency is required: ${name}`);
            }
        }
        if (!dependencies.engine || !dependencies.gameRuntime || !dependencies.shopStock) {
            throw new TypeError('online game engine runtime dependencies are required');
        }

        function hydrate(snapshot) {
            return dependencies.createAdapter().hydrate(snapshot);
        }

        function serialize(runtime, action = '') {
            if (UNDO_CLEAR_ACTIONS.includes(action)) runtime.undoState = null;
            return dependencies.createAdapter().serialize(runtime);
        }

        function prepare(action, data) {
            const clientShadow = dependencies.getClientShadow();
            if (!dependencies.isShadowEnabled() || !clientShadow) return null;
            const snapshot = dependencies.buildSnapshot();
            return clientShadow.prepare({
                enabled: true,
                action,
                data,
                snapshot,
                transition(sourceSnapshot, shadowAction, shadowData) {
                    return dependencies.engine.transitionSnapshot({
                        snapshot: sourceSnapshot,
                        action: shadowAction,
                        data: shadowData,
                        hydrate,
                        serialize: runtime => serialize(runtime, shadowAction),
                    });
                },
            });
        }

        function adopt(snapshot) {
            const clientShadow = dependencies.getClientShadow();
            if (!clientShadow) return false;
            const runtime = hydrate(snapshot);
            const rebuilt = serialize(runtime);
            if (!clientShadow.equalSnapshots(rebuilt, snapshot)) return false;
            dependencies.gameRuntime.setGame(runtime.game);
            dependencies.assignShopStock(dependencies.shopStock, runtime.shopStock);
            dependencies.gameRuntime.setUndoState(runtime.undoState);
            return true;
        }

        function finish(prepared) {
            if (!prepared) return null;
            const clientShadow = dependencies.getClientShadow();
            if (!clientShadow) return null;
            const outcome = clientShadow.finish({
                prepared,
                liveSnapshot: dependencies.buildSnapshot(),
                authorityEnabled: dependencies.isAuthorityEnabled(),
                adoptSnapshot: dependencies.adoptSnapshot,
            });
            dependencies.setDiagnostic(outcome);
            return outcome;
        }

        function applyReplayed(action, data) {
            if (BUILD_ACTIONS.includes(action)) {
                dependencies.gameRuntime.setUndoState(dependencies.buildUndoSnapshot());
            }
            const prepared = prepare(action, data);
            const applied = dependencies.applyMutableAction(action, data);
            if (UNDO_CLEAR_ACTIONS.includes(action)) {
                dependencies.gameRuntime.setUndoState(null);
            }
            finish(prepared);
            return applied;
        }

        return Object.freeze({
            adopt,
            applyReplayed,
            finish,
            hydrate,
            prepare,
            serialize,
        });
    }

    return Object.freeze({ BUILD_ACTIONS, UNDO_CLEAR_ACTIONS, createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineGameEngineRuntime;
if (typeof window !== 'undefined') Object.assign(window, { OnlineGameEngineRuntime });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { OnlineGameEngineRuntime });
