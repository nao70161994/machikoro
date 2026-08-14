'use strict';

const LocalResumeView = (() => {
    function pendingButton(pending) {
        const active = pending === true;
        return Object.freeze({
            disabled: active,
            textContent: active ? 'モデル読み込み中' : '続きから再開',
        });
    }

    function resumeSections(localSaveExists, onlineSession) {
        return Object.freeze({
            localDisplay: localSaveExists ? 'flex' : 'none',
            onlineDisplay: onlineSession ? 'block' : 'none',
            onlineDescription: onlineSession
                ? `🌐 ${onlineSession.playerName} として ${onlineSession.roomId} に再接続できます`
                : '🌐 オンラインゲームが中断されました',
        });
    }

    function generationOptions(previousCount) {
        const count = Number.isInteger(previousCount) ? Math.max(0, Math.min(2, previousCount)) : 0;
        return Object.freeze(Array.from({ length: count + 1 }, (_, index) => Object.freeze({
            value: index,
            label: index === 0 ? '最新の保存' : `${index}つ前の保存`,
        })));
    }

    return Object.freeze({ pendingButton, resumeSections, generationOptions });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LocalResumeView;
if (typeof window !== 'undefined') window.LocalResumeView = LocalResumeView;
if (typeof globalThis !== 'undefined') globalThis.LocalResumeView = LocalResumeView;
