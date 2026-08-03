'use strict';

function cpuDifficultyLabel(difficulty) {
    if (difficulty === 'weak') return '弱';
    if (difficulty === 'normal') return '普';
    if (difficulty === 'strong') return '強';
    if (difficulty === 'rl') return '学';
    return '最強';
}

function makeGameSettings({ cardNames, allowedCpuDifficulties, allowedRlModelIds }) {
    function normalizePlayerSettings(playerSettings, playerCount) {
        if (!Array.isArray(playerSettings)) {
            return Array.from({ length: playerCount }, () => ({ type: 'human', difficulty: 'normal' }));
        }
        const normalized = playerSettings.slice(0, playerCount).map((setting) => {
            if (!setting || setting.type !== 'cpu') return { type: 'human', difficulty: 'normal' };
            const difficulty = allowedCpuDifficulties.has(setting.difficulty) ? setting.difficulty : 'normal';
            const normalizedSetting = { type: 'cpu', difficulty };
            if (difficulty === 'rl' && allowedRlModelIds.has(setting.rlModelId)) {
                normalizedSetting.rlModelId = setting.rlModelId;
            }
            return normalizedSetting;
        });
        while (normalized.length < playerCount) {
            normalized.push({ type: 'human', difficulty: 'normal' });
        }
        return normalized;
    }

    function hasInvalidRlModelId(playerSettings) {
        if (!Array.isArray(playerSettings)) return false;
        return playerSettings.some(setting =>
            setting?.type === 'cpu' &&
            setting.difficulty === 'rl' &&
            typeof setting.rlModelId === 'string' &&
            !allowedRlModelIds.has(setting.rlModelId)
        );
    }

    function hasMissingRlModelId(playerSettings) {
        if (!Array.isArray(playerSettings)) return false;
        return playerSettings.some(setting =>
            setting?.type === 'cpu' &&
            setting.difficulty === 'rl' &&
            typeof setting.rlModelId !== 'string'
        );
    }

    function hasInvalidOnlineRlModelSettings(playerSettings) {
        return hasMissingRlModelId(playerSettings) || hasInvalidRlModelId(playerSettings);
    }

    function normalizeCpuSpeed(cpuSpeed) {
        const value = Number(cpuSpeed);
        if (!Number.isFinite(value)) return 1500;
        return Math.max(0, Math.min(5000, Math.floor(value)));
    }

    function normalizeEnabledCards(enabledCards) {
        if (!Array.isArray(enabledCards)) return cardNames.slice();
        const validCards = new Set(cardNames);
        const selected = enabledCards.filter(name => validCards.has(name));
        return selected.length > 0 ? [...new Set(selected)] : cardNames.slice();
    }

    return {
        normalizePlayerSettings,
        cpuDifficultyLabel,
        hasInvalidRlModelId,
        hasMissingRlModelId,
        hasInvalidOnlineRlModelSettings,
        normalizeCpuSpeed,
        normalizeEnabledCards,
    };
}

makeGameSettings.cpuDifficultyLabel = cpuDifficultyLabel;
module.exports = makeGameSettings;
