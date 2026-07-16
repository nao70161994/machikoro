'use strict';

const UiPlayerDisplay = (() => {
    const CPU_DIFFICULTIES = Object.freeze(['weak', 'normal', 'strong', 'expert', 'rl']);

    function difficultyLabel(difficulty) {
        if (difficulty === 'weak') return '弱';
        if (difficulty === 'normal') return '普';
        if (difficulty === 'strong') return '強';
        if (difficulty === 'rl') return '深';
        return 'AI';
    }

    function normalizeCpuDifficulty(value) {
        return CPU_DIFFICULTIES.includes(value) ? value : 'normal';
    }

    function resolvePlayerSetting(options = {}) {
        const settings = Array.isArray(options.playerSettings) ? options.playerSettings : [];
        const cpus = Array.isArray(options.cpuPlayers) ? options.cpuPlayers : [];
        const index = options.index;
        const player = options.player;
        const setting = settings[index];
        const cpu = cpus[index] || null;
        const inferredCpu = !!cpu || setting?.type === 'cpu' || player?.isCPU === true;
        if (setting && (!inferredCpu || setting.difficulty || cpu?.difficulty)) {
            return {
                type: inferredCpu ? 'cpu' : 'human',
                difficulty: inferredCpu ? normalizeCpuDifficulty(cpu?.difficulty || setting.difficulty) : 'human',
                name: player?.name || setting.name || `プレイヤー${index + 1}`,
                missing: false,
            };
        }
        return {
            type: inferredCpu ? 'cpu' : 'human',
            difficulty: inferredCpu ? normalizeCpuDifficulty(cpu?.difficulty) : 'human',
            name: player?.name || `プレイヤー${index + 1}`,
            missing: true,
        };
    }

    return Object.freeze({ difficultyLabel, normalizeCpuDifficulty, resolvePlayerSetting });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiPlayerDisplay;
if (typeof window !== 'undefined') window.UiPlayerDisplay = UiPlayerDisplay;
if (typeof globalThis !== 'undefined') globalThis.UiPlayerDisplay = UiPlayerDisplay;
