'use strict';

const OnlinePlayerSettings = (() => {
    function normalizeSetting(setting) {
        const current = setting || {};
        return {
            type: current.type === 'cpu' ? 'cpu' : 'human',
            difficulty: current.difficulty || 'normal',
        };
    }

    function normalizeSettings(settings, playerCount) {
        const source = Array.isArray(settings) ? settings : [];
        return Object.freeze(Array.from({ length: playerCount }, (_, index) =>
            normalizeSetting(source[index])
        ));
    }

    function rlSettingNote(playerCount) {
        if (playerCount >= 3) {
            return 'AI（深層学習・ランダム）は多人数用の深層学習モデルから選び、5人以上では脅威度上位3人の相手を見て判断します。CPU（最強）は安定したルールベースの基準CPUです。';
        }
        return 'AI（深層学習・ランダム）は2人用の複数モデルからランダムに選びます。CPU（最強）は安定したルールベースの基準CPUです。';
    }

    function buildSettingsHtml(settings, playerCount) {
        const rows = settings.map((setting, index) => `
        <div class="player-setting">
            <span class="player-setting-name">プレイヤー${index + 1}</span>
            <select data-ui-change="onlinePlayerType" data-player-index="${index}" class="player-setting-select" aria-label="プレイヤー${index + 1}の種類">
                <option value="human" ${setting.type === 'human' ? 'selected' : ''}>人間</option>
                <option value="weak"  ${setting.type === 'cpu' && setting.difficulty === 'weak' ? 'selected' : ''}>CPU（弱）</option>
                <option value="normal" ${setting.type === 'cpu' && setting.difficulty === 'normal' ? 'selected' : ''}>CPU（普通）</option>
                <option value="strong" ${setting.type === 'cpu' && setting.difficulty === 'strong' ? 'selected' : ''}>CPU（強）</option>
                <option value="expert" ${setting.type === 'cpu' && setting.difficulty === 'expert' ? 'selected' : ''}>CPU（最強）</option>
                <option value="rl" ${setting.type === 'cpu' && setting.difficulty === 'rl' ? 'selected' : ''}>AI（深層学習・ランダム）</option>
            </select>
        </div>
    `).join('');
        return rows + `<div class="player-setting-note">${rlSettingNote(playerCount)}</div>`;
    }

    function opponentDifficulties(settings) {
        return settings.map(setting => {
            if (!setting || setting.type !== 'cpu') return 'human';
            return setting.difficulty || 'normal';
        });
    }

    function freezeForCreate(settings, playerCount, selectRlModel) {
        return settings.slice(0, playerCount).map(setting => {
            if (!setting || setting.type !== 'cpu') return setting;
            const frozen = Object.assign({}, setting);
            if (frozen.difficulty === 'rl' && !frozen.rlModelId && typeof selectRlModel === 'function') {
                const model = selectRlModel(playerCount);
                if (model) frozen.rlModelId = model.id;
            }
            return frozen;
        });
    }

    function snapshot(settings, playerCount) {
        return settings.slice(0, playerCount).map(setting => Object.assign({
            type: 'human',
            difficulty: 'normal',
        }, setting || {}));
    }

    function hasRlCpu(settings, playerCount) {
        return settings.slice(0, playerCount)
            .some(setting => setting && setting.type === 'cpu' && setting.difficulty === 'rl');
    }

    return Object.freeze({
        normalizeSetting,
        normalizeSettings,
        rlSettingNote,
        buildSettingsHtml,
        opponentDifficulties,
        freezeForCreate,
        snapshot,
        hasRlCpu,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlinePlayerSettings;
if (typeof window !== 'undefined') window.OnlinePlayerSettings = OnlinePlayerSettings;
if (typeof globalThis !== 'undefined') globalThis.OnlinePlayerSettings = OnlinePlayerSettings;
