'use strict';

const GameSetupPresets = (() => {
    const STORAGE_KEY = 'machikoroSetupPresetsV1';
    const MAX_PRESETS = 8;
    const CPU_DIFFICULTIES = new Set(['weak', 'normal', 'strong', 'expert', 'rl']);

    function safeName(value) {
        return typeof value === 'string' ? value.trim().slice(0, 24) : '';
    }

    function normalizePlayerSettings(value, count) {
        if (!Array.isArray(value)) return [];
        return value.slice(0, count).map((setting, index) => {
            const type = setting && setting.type === 'cpu' ? 'cpu' : 'human';
            const difficulty = type === 'cpu' && CPU_DIFFICULTIES.has(setting.difficulty)
                ? setting.difficulty : 'normal';
            return Object.freeze({
                type,
                difficulty,
                name: setting && typeof setting.name === 'string' && setting.name.trim()
                    ? setting.name.trim().slice(0, 12) : `プレイヤー${index + 1}`,
            });
        });
    }

    function normalizePreset(value) {
        if (!value || typeof value !== 'object') return null;
        const name = safeName(value.name);
        const count = Number.isSafeInteger(value.selectedCount)
            ? Math.min(10, Math.max(2, value.selectedCount)) : 2;
        if (!name) return null;
        return Object.freeze({
            id: typeof value.id === 'string' && /^[a-z0-9-]{1,48}$/i.test(value.id)
                ? value.id : '',
            name,
            selectedCount: count,
            playerSettings: Object.freeze(normalizePlayerSettings(value.playerSettings, count)),
            cpuSpeed: Number.isSafeInteger(Number(value.cpuSpeed))
                ? Math.min(3000, Math.max(100, Number(value.cpuSpeed))) : 1500,
            enabledCards: Object.freeze(Array.isArray(value.enabledCards)
                ? Array.from(new Set(value.enabledCards.filter(name => typeof name === 'string'))).slice(0, 100)
                : []),
            enabledLandmarks: Object.freeze(Array.isArray(value.enabledLandmarks)
                ? Array.from(new Set(value.enabledLandmarks.filter(name => typeof name === 'string'))).slice(0, 20)
                : []),
            marketRule: value.marketRule === 'ten-type' ? 'ten-type' : 'standard',
        });
    }

    function parse(raw) {
        if (typeof raw !== 'string' || raw.length > 200000) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.map(normalizePreset).filter(preset => preset && preset.id)
                .slice(0, MAX_PRESETS) : [];
        } catch (_) { return []; }
    }

    function upsert(presets, input, now = Date.now()) {
        const base = normalizePreset(Object.assign({}, input, {
            id: input && input.id || `preset-${Math.max(0, Number(now) || 0).toString(36)}`,
        }));
        if (!base) return Object.freeze(Array.from(presets || []).slice(0, MAX_PRESETS));
        return Object.freeze([base, ...Array.from(presets || []).filter(item => item.id !== base.id)]
            .slice(0, MAX_PRESETS));
    }

    function remove(presets, id) {
        return Object.freeze(Array.from(presets || []).filter(item => item.id !== id));
    }

    function escapeHtml(value) {
        return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function buildListHtml(presets) {
        if (!Array.isArray(presets) || presets.length === 0) {
            return '<p class="setup-preset-empty">保存済みプリセットはありません。</p>';
        }
        return `<ul class="setup-preset-list">${presets.map(preset =>
            `<li><span><strong>${escapeHtml(preset.name)}</strong><small>${preset.selectedCount}人</small></span>` +
            `<button type="button" data-ui-action="applySetupPreset" data-preset-id="${escapeHtml(preset.id)}">適用</button>` +
            `<button type="button" class="danger-compact" data-ui-action="deleteSetupPreset" data-preset-id="${escapeHtml(preset.id)}" aria-label="${escapeHtml(preset.name)}を削除">削除</button></li>`
        ).join('')}</ul>`;
    }

    return Object.freeze({ MAX_PRESETS, STORAGE_KEY, buildListHtml, normalizePreset, parse, remove, upsert });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GameSetupPresets;
if (typeof window !== 'undefined') window.GameSetupPresets = GameSetupPresets;
if (typeof globalThis !== 'undefined') globalThis.GameSetupPresets = GameSetupPresets;
