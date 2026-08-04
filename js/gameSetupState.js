'use strict';

const GameSetupState = (() => {
    const fields = Object.freeze(['selectedCount', 'playerSettings', 'cpuSpeed']);

    function createController(initial = {}) {
        const state = {
            selectedCount: initial.selectedCount == null ? 2 : initial.selectedCount,
            playerSettings: Array.from(initial.playerSettings || []),
            cpuSpeed: initial.cpuSpeed == null ? 1500 : initial.cpuSpeed,
        };

        function snapshot() {
            return Object.freeze({
                selectedCount: state.selectedCount,
                playerSettings: Object.freeze(state.playerSettings.slice()),
                cpuSpeed: state.cpuSpeed,
            });
        }

        function read(field) {
            if (!fields.includes(field)) return undefined;
            return state[field];
        }

        function write(field, value) {
            if (!fields.includes(field)) return false;
            state[field] = field === 'playerSettings' ? Array.from(value || []) : value;
            return true;
        }

        function setSelectedCount(value) {
            state.selectedCount = value;
            return snapshot();
        }

        function setPlayerSettings(value) {
            state.playerSettings = Array.from(value || []);
            return snapshot();
        }

        function setPlayerSetting(index, value) {
            state.playerSettings[index] = value;
            return snapshot();
        }

        function setPlayerName(index, value) {
            state.playerSettings[index].name = value;
            return snapshot();
        }

        function setCpuSpeed(value) {
            state.cpuSpeed = value;
            return snapshot();
        }

        function replace(value = {}) {
            if (Object.prototype.hasOwnProperty.call(value, 'selectedCount')) {
                state.selectedCount = value.selectedCount;
            }
            if (Object.prototype.hasOwnProperty.call(value, 'playerSettings')) {
                state.playerSettings = Array.from(value.playerSettings || []);
            }
            if (Object.prototype.hasOwnProperty.call(value, 'cpuSpeed')) {
                state.cpuSpeed = value.cpuSpeed;
            }
            return snapshot();
        }

        function bindGlobals(root) {
            if (!root || (typeof root !== 'object' && typeof root !== 'function')) return false;
            Object.defineProperties(root, Object.fromEntries(fields.map(field => [field, {
                configurable: true,
                enumerable: false,
                get: () => read(field),
                set: value => { write(field, value); },
            }])));
            return true;
        }

        return Object.freeze({
            snapshot,
            read,
            write,
            setSelectedCount,
            setPlayerSettings,
            setPlayerSetting,
            setPlayerName,
            setCpuSpeed,
            replace,
            bindGlobals,
        });
    }

    const runtime = createController();
    if (typeof globalThis !== 'undefined') runtime.bindGlobals(globalThis);
    return Object.freeze({ fields, createController, runtime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GameSetupState;
if (typeof window !== 'undefined') Object.assign(window, { GameSetupState });
if (typeof globalThis !== 'undefined') globalThis.GameSetupState = GameSetupState;
