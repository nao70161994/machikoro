'use strict';

const OnlineRejoinRuntime = (() => {
    const STATUS = Object.freeze({
        SNAPSHOT_SCHEMA_UNSUPPORTED: '復元データのSnapshot schema versionに対応していません。再接続してください。',
        GAME_SCHEMA_UNSUPPORTED: '復元データのschema versionに対応していません。アプリを更新してください。',
        MODEL_LOADING: '深層学習AIモデルを読み込んでいます。',
        MODEL_FAILED: '深層学習AIモデルを読み込めませんでした。再接続して再試行します。',
    });

    function createRuntime(dependencies = {}) {
        const requiredObjects = [
            'activationRuntime', 'console', 'preparationRuntime',
        ];
        for (const name of requiredObjects) {
            if (!dependencies[name]) {
                throw new TypeError(`online rejoin dependency is required: ${name}`);
            }
        }
        const requiredEffects = [
            'abortRestore', 'acceptSchema', 'decodePayload', 'getRestoreGeneration',
            'preloadModels', 'setSchema', 'setStatusText',
        ];
        for (const name of requiredEffects) {
            if (typeof dependencies[name] !== 'function') {
                throw new TypeError(`online rejoin effect is required: ${name}`);
            }
        }

        function activatePrepared(prepared) {
            return dependencies.activationRuntime.handle(prepared, {
                persistRejoinBundle: () => {
                    dependencies.preparationRuntime.persist(prepared);
                },
            });
        }

        function handle(rejoinPayload) {
            const decoded = dependencies.decodePayload(rejoinPayload);
            if (decoded.ok === false) {
                dependencies.setStatusText(STATUS.SNAPSHOT_SCHEMA_UNSUPPORTED);
                return false;
            }
            const value = decoded.value;
            const gameStartPayload = value.gameStartPayload;
            if (!gameStartPayload || !dependencies.acceptSchema(gameStartPayload.gameSchema)) {
                dependencies.setStatusText(STATUS.GAME_SCHEMA_UNSUPPORTED);
                return false;
            }
            dependencies.setSchema(gameStartPayload.gameSchema);
            const prepared = dependencies.preparationRuntime.prepare(value);
            if (!prepared.ready) return false;
            const activate = () => activatePrepared(prepared);
            const preload = dependencies.preloadModels(
                prepared.playerNames.length,
                prepared.playerSettings || []
            );
            if (preload && typeof preload.then === 'function') {
                dependencies.setStatusText(STATUS.MODEL_LOADING);
                preload.then(activate).catch(error => {
                    if (prepared.restoreGeneration !==
                            dependencies.getRestoreGeneration()) return;
                    dependencies.console.error(error);
                    dependencies.abortRestore(
                        prepared.restoreGeneration,
                        STATUS.MODEL_FAILED
                    );
                });
                return true;
            }
            return activate();
        }

        return Object.freeze({ activatePrepared, handle });
    }

    return Object.freeze({ STATUS, createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineRejoinRuntime;
if (typeof window !== 'undefined') Object.assign(window, { OnlineRejoinRuntime });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { OnlineRejoinRuntime });
