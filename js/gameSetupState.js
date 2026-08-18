'use strict';

const GameSetupState = (() => {
    const fields = Object.freeze(['selectedCount', 'playerSettings', 'cpuSpeed']);
    const STANDARD_PLAYER_COUNT = 2;
    const STANDARD_CPU_SPEED = 1500;
    const CPU_LABELS = Object.freeze({
        weak: '弱',
        normal: '普通',
        strong: '強',
        expert: '最強',
        rl: '深層学習',
    });

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

    function standardDifferenceLabels(input = {}) {
        const playerCount = Number.isSafeInteger(input.selectedCount)
            ? Math.min(10, Math.max(2, input.selectedCount)) : STANDARD_PLAYER_COUNT;
        const cpuSpeed = Number.isSafeInteger(Number(input.cpuSpeed))
            ? Number(input.cpuSpeed) : STANDARD_CPU_SPEED;
        const playerSettings = Array.isArray(input.playerSettings)
            ? input.playerSettings.slice(0, playerCount) : [];
        const labels = [];
        if (playerCount !== STANDARD_PLAYER_COUNT) labels.push(`人数 ${playerCount}人`);

        const cpuCounts = new Map();
        for (const setting of playerSettings) {
            if (!setting || setting.type !== 'cpu') continue;
            const difficulty = Object.prototype.hasOwnProperty.call(CPU_LABELS, setting.difficulty)
                ? setting.difficulty : 'normal';
            cpuCounts.set(difficulty, (cpuCounts.get(difficulty) || 0) + 1);
        }
        for (const difficulty of Object.keys(CPU_LABELS)) {
            const count = cpuCounts.get(difficulty) || 0;
            if (count > 0) labels.push(`CPU（${CPU_LABELS[difficulty]}）${count}人`);
        }
        if (cpuSpeed !== STANDARD_CPU_SPEED) {
            const speedLabel = typeof input.cpuSpeedLabel === 'string' && input.cpuSpeedLabel.trim()
                ? input.cpuSpeedLabel.trim().slice(0, 24) : `${cpuSpeed}ms`;
            labels.push(`CPU速度 ${speedLabel}`);
        }

        const allCards = Array.isArray(input.allCards) ? input.allCards : [];
        const enabledCards = new Set(Array.isArray(input.enabledCards) ? input.enabledCards : []);
        if (allCards.length > 0 && enabledCards.size !== allCards.length) {
            labels.push(`施設 ${enabledCards.size}/${allCards.length}種`);
        }
        const allLandmarks = Array.isArray(input.allLandmarks) ? input.allLandmarks : [];
        const enabledLandmarks = new Set(Array.isArray(input.enabledLandmarks)
            ? input.enabledLandmarks : []);
        const disabledLandmarks = allLandmarks.filter(name => !enabledLandmarks.has(name));
        if (disabledLandmarks.length > 0) {
            labels.push(`未使用ランドマーク ${disabledLandmarks.join('・')}`);
        }
        if (input.marketRule === 'ten-type') labels.push('公式10種類市場');
        return Object.freeze(labels);
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
    return Object.freeze({
        STANDARD_CPU_SPEED,
        STANDARD_PLAYER_COUNT,
        fields,
        createController,
        runtime,
        standardDifferenceLabels,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GameSetupState;
if (typeof window !== 'undefined') Object.assign(window, { GameSetupState });
if (typeof globalThis !== 'undefined') globalThis.GameSetupState = GameSetupState;
