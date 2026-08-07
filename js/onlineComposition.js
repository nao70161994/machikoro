'use strict';

const OnlineComposition = (() => {
    /**
     * online.js が利用する状態・storage・DOM・socket・client effect境界を一度だけ構成する。
     * @param {Record<string, any>} dependencies
     */
    function create(dependencies = {}) {
        const requiredObjects = [
            'clientEffectsModule', 'clientStorageModule', 'domEffectsModule',
            'gameState', 'hostlessEvents', 'sessionState', 'socketEffectsModule',
        ];
        for (const name of requiredObjects) {
            if (!dependencies[name]) {
                throw new TypeError(`online composition dependency is required: ${name}`);
            }
        }
        if (typeof dependencies.getDocument !== 'function') {
            throw new TypeError('online composition getDocument dependency is required');
        }
        if (typeof dependencies.resolveClientEffect !== 'function') {
            throw new TypeError('online composition resolveClientEffect dependency is required');
        }
        for (const [name, state] of [
            ['gameState', dependencies.gameState],
            ['sessionState', dependencies.sessionState],
        ]) {
            if (typeof state.snapshot !== 'function') {
                throw new TypeError(`online composition ${name}.snapshot is required`);
            }
        }

        const clientEffects = dependencies.clientEffectsModule.createFromResolver(
            dependencies.resolveClientEffect
        );
        const domEffects = dependencies.domEffectsModule.createRuntime({
            getDocument: dependencies.getDocument,
        });
        const socketEffects = dependencies.socketEffectsModule.createRuntime({
            getSocket: () => dependencies.sessionState.snapshot().socket,
            hostlessEvents: dependencies.hostlessEvents,
        });
        const storage = dependencies.clientStorageModule.createFacade();

        return Object.freeze({
            clientEffects,
            domEffects,
            gameState: dependencies.gameState,
            sessionState: dependencies.sessionState,
            snapshotGame: () => dependencies.gameState.snapshot(),
            snapshotSession: () => dependencies.sessionState.snapshot(),
            socketEffects,
            storage,
        });
    }

    return Object.freeze({ create });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineComposition;
if (typeof window !== 'undefined') Object.assign(window, { OnlineComposition });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { OnlineComposition });
