'use strict';

function normalizePlayerCount(value) {
    const count = Number(value);
    if (!Number.isSafeInteger(count)) return 2;
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

function serializeSettings(values) {
    const result = {
        selectedCount: values.selectedCount,
        playerSettings: JSON.stringify(values.playerSettings),
        tutorialEnabled: values.tutorialEnabled ? 'true' : 'false',
        tutorialLevel: values.tutorialLevel,
    };
    if (values.cpuSpeed !== null && values.cpuSpeed !== undefined) {
        result.cpuSpeed = values.cpuSpeed;
    }
    return Object.freeze(result);
}

function normalizeStoredSettings(values, normalizeName) {
    const selectedCount = normalizePlayerCount(values.selectedCount);
    return Object.freeze({
        selectedCount,
        playerSettings: normalizePlayerSettings(values.playerSettings, selectedCount, normalizeName),
        cpuSpeed: values.cpuSpeed,
        tutorialEnabled: normalizeTutorialEnabled(values.tutorialEnabled),
        tutorialLevel: normalizeTutorialLevel(values.tutorialLevel),
    });
}

const StorageSettings = Object.freeze({
    normalizePlayerCount,
    normalizePlayerSettings,
    normalizeTutorialEnabled,
    normalizeTutorialLevel,
    serializeSettings,
    normalizeStoredSettings,
});

if (typeof module !== 'undefined' && module.exports) module.exports = StorageSettings;
if (typeof window !== 'undefined') window.StorageSettings = StorageSettings;
if (typeof globalThis !== 'undefined') globalThis.StorageSettings = StorageSettings;
