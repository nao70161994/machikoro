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

function normalizeAccessibilityFontScale(value) {
    return value === 'large' ? 'large' : 'standard';
}

function normalizeStoredBoolean(value) {
    return value === 'true';
}

function normalizeSoundVolume(value) {
    if (value === null || value === undefined || value === '') return 100;
    const volume = Number(value);
    if (!Number.isFinite(volume)) return 100;
    return Math.min(100, Math.max(0, Math.round(volume)));
}

function serializeSettings(values) {
    const result = {
        selectedCount: values.selectedCount,
        playerSettings: JSON.stringify(values.playerSettings),
        tutorialEnabled: values.tutorialEnabled ? 'true' : 'false',
        tutorialLevel: values.tutorialLevel,
        accessibilityFontScale: normalizeAccessibilityFontScale(values.accessibilityFontScale),
        accessibilityReducedMotion: values.accessibilityReducedMotion ? 'true' : 'false',
        accessibilityHighContrast: values.accessibilityHighContrast ? 'true' : 'false',
        accessibilityHaptics: values.accessibilityHaptics ? 'true' : 'false',
        soundVolume: String(normalizeSoundVolume(values.soundVolume)),
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
        accessibilityFontScale: normalizeAccessibilityFontScale(values.accessibilityFontScale),
        accessibilityReducedMotion: normalizeStoredBoolean(values.accessibilityReducedMotion),
        accessibilityHighContrast: normalizeStoredBoolean(values.accessibilityHighContrast),
        accessibilityHaptics: normalizeStoredBoolean(values.accessibilityHaptics),
        soundVolume: normalizeSoundVolume(values.soundVolume),
    });
}

const StorageSettings = Object.freeze({
    normalizePlayerCount,
    normalizePlayerSettings,
    normalizeTutorialEnabled,
    normalizeTutorialLevel,
    normalizeAccessibilityFontScale,
    normalizeStoredBoolean,
    normalizeSoundVolume,
    serializeSettings,
    normalizeStoredSettings,
});

if (typeof module !== 'undefined' && module.exports) module.exports = StorageSettings;
if (typeof window !== 'undefined') window.StorageSettings = StorageSettings;
if (typeof globalThis !== 'undefined') globalThis.StorageSettings = StorageSettings;
