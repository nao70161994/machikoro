'use strict';

const GameSetupState = (() => {
    const fields = Object.freeze(['selectedCount', 'playerSettings', 'cpuSpeed']);

    function clonePlayerSetting(setting) {
        return setting && typeof setting === 'object' ? Object.assign({}, setting) : setting;
    }

    function clonePlayerSettings(settings) {
        return Array.from(settings || [], clonePlayerSetting);
    }

    function freezePlayerSettings(settings) {
        return Object.freeze(clonePlayerSettings(settings).map(setting =>
            setting && typeof setting === 'object' ? Object.freeze(setting) : setting
        ));
    }

    function createController(initial = {}) {
        const state = {
            selectedCount: initial.selectedCount == null ? 2 : initial.selectedCount,
            playerSettings: clonePlayerSettings(initial.playerSettings),
            cpuSpeed: initial.cpuSpeed == null ? 1500 : initial.cpuSpeed,
        };

        function snapshot() {
            return Object.freeze({
                selectedCount: state.selectedCount,
                playerSettings: freezePlayerSettings(state.playerSettings),
                cpuSpeed: state.cpuSpeed,
            });
        }

        function read(field) {
            if (!fields.includes(field)) return undefined;
            return field === 'playerSettings' ? freezePlayerSettings(state.playerSettings) : state[field];
        }

        function write(field, value) {
            if (!fields.includes(field)) return false;
            state[field] = field === 'playerSettings' ? clonePlayerSettings(value) : value;
            return true;
        }

        function setSelectedCount(value) {
            state.selectedCount = value;
            return snapshot();
        }

        function setPlayerSettings(value) {
            state.playerSettings = clonePlayerSettings(value);
            return snapshot();
        }

        function setPlayerSetting(index, value) {
            state.playerSettings[index] = clonePlayerSetting(value);
            return snapshot();
        }

        function setPlayerName(index, value) {
            const current = state.playerSettings[index];
            if (!current || typeof current !== 'object') throw new TypeError('player setting must be an object');
            state.playerSettings[index] = Object.assign({}, current, { name: value });
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
                state.playerSettings = clonePlayerSettings(value.playerSettings);
            }
            if (Object.prototype.hasOwnProperty.call(value, 'cpuSpeed')) {
                state.cpuSpeed = value.cpuSpeed;
            }
            return snapshot();
        }

        function bindGlobals(root, options = {}) {
            if (!root || (typeof root !== 'object' && typeof root !== 'function')) return false;
            const writable = options.writable !== false;
            Object.defineProperties(root, Object.fromEntries(fields.map(field => [field, {
                configurable: true,
                enumerable: false,
                get: () => read(field),
                set: writable ? value => { write(field, value); } : undefined,
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

    const root = typeof globalThis !== 'undefined' ? globalThis : null;
    const browserRoot = typeof window !== 'undefined' ? window : null;
    const runtime = createController();
    if (root) runtime.bindGlobals(root, { writable: !browserRoot || browserRoot !== root });
    return Object.freeze({ fields, createController, runtime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GameSetupState;
if (typeof window !== 'undefined') Object.assign(window, { GameSetupState });
if (typeof globalThis !== 'undefined') globalThis.GameSetupState = GameSetupState;
