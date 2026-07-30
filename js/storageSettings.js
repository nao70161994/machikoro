'use strict';

function normalizePlayerCount(value) {
    const count = parseInt(value || '2');
    return Math.min(10, Math.max(2, count));
}

function normalizePlayerSettings(value, selectedCount, normalizeName) {
    if (!value) return null;
    const nameNormalizer = typeof normalizeName === 'function'
        ? normalizeName
        : ((name, index) => String(name || '').trim() || `プレイヤー${index + 1}`);
    return JSON.parse(value).slice(0, selectedCount).map((setting, index) => ({
        type: setting.type === 'cpu' ? 'cpu' : 'human',
        difficulty: setting.difficulty || 'normal',
        name: nameNormalizer(setting.name, index),
    }));
}

function normalizeTutorialEnabled(value) {
    return value !== 'false';
}

function normalizeTutorialLevel(value) {
    return value === 'advanced' ? 'advanced' : 'beginner';
}

const StorageSettings = Object.freeze({
    normalizePlayerCount,
    normalizePlayerSettings,
    normalizeTutorialEnabled,
    normalizeTutorialLevel,
});

if (typeof module !== 'undefined' && module.exports) module.exports = StorageSettings;
if (typeof window !== 'undefined') window.StorageSettings = StorageSettings;
if (typeof globalThis !== 'undefined') globalThis.StorageSettings = StorageSettings;
