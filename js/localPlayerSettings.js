'use strict';

const LocalPlayerSettings = (() => {
    function escapeAttribute(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function defaultPlayerName(index) {
        return `プレイヤー${index + 1}`;
    }

    function normalizePlayerName(name, index) {
        const trimmed = String(name || '').trim();
        return trimmed || defaultPlayerName(index);
    }

    function normalizePlayerSetting(setting, index) {
        const current = setting || {};
        return {
            type: current.type === 'cpu' ? 'cpu' : 'human',
            difficulty: current.difficulty || 'normal',
            name: normalizePlayerName(current.name, index),
        };
    }

    function normalizeSettings(settings, playerCount) {
        const source = Array.isArray(settings) ? settings : [];
        return Object.freeze(Array.from({ length: playerCount }, (_, index) =>
            normalizePlayerSetting(source[index], index)
        ));
    }

    function cpuLabel(difficulty) {
        if (difficulty === 'weak') return 'CPU（弱）';
        if (difficulty === 'normal') return 'CPU（普通）';
        if (difficulty === 'strong') return 'CPU（強）';
        if (difficulty === 'rl') return 'AI（深層学習）';
        return 'CPU（最強）';
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
            <div class="player-setting-row">
                <span class="player-setting-name">プレイヤー${index + 1}</span>
                <select data-ui-change="localPlayerType" data-player-index="${index}" class="player-setting-select" aria-label="プレイヤー${index + 1}の種類">
                    <option value="human" ${setting.type === 'human' ? 'selected' : ''}>人間</option>
                    <option value="weak"  ${setting.type === 'cpu' && setting.difficulty === 'weak' ? 'selected' : ''}>CPU（弱）</option>
                    <option value="normal" ${setting.type === 'cpu' && setting.difficulty === 'normal' ? 'selected' : ''}>CPU（普通）</option>
                    <option value="strong" ${setting.type === 'cpu' && setting.difficulty === 'strong' ? 'selected' : ''}>CPU（強）</option>
                    <option value="expert" ${setting.type === 'cpu' && setting.difficulty === 'expert' ? 'selected' : ''}>CPU（最強）</option>
                    <option value="rl" ${setting.type === 'cpu' && setting.difficulty === 'rl' ? 'selected' : ''}>AI（深層学習・ランダム）</option>
                </select>
            </div>
            ${setting.type === 'human' ? `
                <input
                    type="text"
                    maxlength="12"
                    class="text-input player-name-input"
                    placeholder="${defaultPlayerName(index)}"
                    value="${escapeAttribute(setting.name)}"
                    data-ui-input="localPlayerName"
                    data-player-index="${index}"
                >
            ` : `<div class="player-setting-cpu-label">${cpuLabel(setting.difficulty)}として統計を記録</div>`}
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

    function formatCpuSpeedLabel(value) {
        const speed = parseInt(value, 10);
        if (speed <= 100) return '超高速';
        return (speed / 1000) + '秒';
    }

    function hasRlCpu(settings, playerCount) {
        return settings.slice(0, playerCount)
            .some(setting => setting && setting.type === 'cpu' && setting.difficulty === 'rl');
    }

    function snapshot(settings, playerCount) {
        return settings.slice(0, playerCount).map((setting, index) => Object.assign({
            type: 'human',
            difficulty: 'normal',
            name: defaultPlayerName(index),
        }, setting || {}));
    }

    function rlModelStatusMessage(state) {
        if (!state || state.status === 'unused') return '';
        if (state.status === 'ready') return '深層学習AIモデルの準備が完了しました。';
        if (state.status === 'loading') return '深層学習AIモデルを読み込んでいます。';
        if (state.status === 'failed') return '深層学習AIモデルを読み込めませんでした。再試行してください。';
        return '深層学習AIモデルを開始時に読み込みます。';
    }

    function startButtonView(state, pending) {
        if (pending === true || (state && state.status === 'loading')) {
            return Object.freeze({ disabled: true, textContent: 'モデル読み込み中' });
        }
        return Object.freeze({
            disabled: false,
            textContent: state && state.status === 'failed' ? 'モデルを再試行' : 'ゲーム開始',
        });
    }

    return Object.freeze({
        escapeAttribute,
        defaultPlayerName,
        normalizePlayerName,
        normalizePlayerSetting,
        normalizeSettings,
        cpuLabel,
        rlSettingNote,
        buildSettingsHtml,
        opponentDifficulties,
        formatCpuSpeedLabel,
        hasRlCpu,
        snapshot,
        rlModelStatusMessage,
        startButtonView,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LocalPlayerSettings;
if (typeof window !== 'undefined') window.LocalPlayerSettings = LocalPlayerSettings;
if (typeof globalThis !== 'undefined') globalThis.LocalPlayerSettings = LocalPlayerSettings;
