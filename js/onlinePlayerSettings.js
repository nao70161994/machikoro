'use strict';

const OnlinePlayerSettings = (() => {
    function normalizeSetting(setting) {
        const current = setting || {};
        const normalized = {
            type: current.type === 'cpu' ? 'cpu' : 'human',
            difficulty: current.difficulty || 'normal',
        };
        if (normalized.type === 'cpu' && normalized.difficulty === 'rl') {
            normalized.rlModelId = current.rlModelId || current.modelId || null;
            normalized.rlModelSelection = current.rlModelSelection === 'manual' ? 'manual' : 'auto';
        }
        return normalized;
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

    function escapeAttribute(value) {
        return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function buildModelSelectHtml(setting, index, models) {
        if (!setting || setting.type !== 'cpu' || setting.difficulty !== 'rl') return '';
        const manual = setting.rlModelSelection === 'manual';
        const options = (models || []).map(model => `
                <option value="${escapeAttribute(model.id)}" ${manual && setting.rlModelId === model.id ? 'selected' : ''}>${escapeAttribute(model.label || model.id)}</option>`).join('');
        return `<label class="rl-model-setting">モデル
            <select data-ui-change="onlineRlModel" data-player-index="${index}" class="player-setting-select" aria-label="プレイヤー${index + 1}の深層学習モデル">
                <option value="auto" ${manual ? '' : 'selected'}>自動（おすすめ）</option>${options}
            </select>
        </label>`;
    }

    function buildSettingsHtml(settings, playerCount, models = []) {
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
            ${buildModelSelectHtml(setting, index, models)}
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

    function rlModelLoadState(options = {}) {
        if (!options.usesRl) return { status: 'unused', ready: 0, total: 0, errors: [] };
        if (!options.loaderAvailable) {
            return { status: 'failed', ready: 0, total: 0, errors: ['RL model loader is not available'] };
        }
        if (typeof options.eligibleLoadState === 'function') {
            return options.eligibleLoadState(options.playerCount);
        }
        return { status: 'idle', ready: 0, total: 1, errors: [] };
    }

    function rlModelStatusMessage(state) {
        if (!state || state.status === 'unused') return '';
        if (state.status === 'ready') return '深層学習AIモデルの準備が完了しました。';
        if (state.status === 'loading') return '深層学習AIモデルを読み込んでいます。';
        if (state.status === 'failed') return '深層学習AIモデルを読み込めませんでした。再試行してください。';
        return '深層学習AIモデルをルーム作成時に読み込みます。';
    }

    function createButtonView(state, pending) {
        if (pending === true) {
            return Object.freeze({ disabled: true, textContent: '作成中' });
        }
        if (state && state.status === 'loading') {
            return Object.freeze({ disabled: true, textContent: 'モデル読み込み中' });
        }
        return Object.freeze({
            disabled: false,
            textContent: state && state.status === 'failed' ? 'モデルを再試行' : 'ルームを作る',
        });
    }

    function joinButtonView(pending) {
        return Object.freeze({
            disabled: pending === true,
            textContent: pending === true ? '参加中' : '参加する',
        });
    }

    return Object.freeze({
        normalizeSetting,
        normalizeSettings,
        rlSettingNote,
        buildSettingsHtml,
        buildModelSelectHtml,
        opponentDifficulties,
        freezeForCreate,
        snapshot,
        hasRlCpu,
        rlModelLoadState,
        rlModelStatusMessage,
        createButtonView,
        joinButtonView,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlinePlayerSettings;
if (typeof window !== 'undefined') window.OnlinePlayerSettings = OnlinePlayerSettings;
if (typeof globalThis !== 'undefined') globalThis.OnlinePlayerSettings = OnlinePlayerSettings;
