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

    return Object.freeze({ pendingButton, resumeSections });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LocalResumeView;
if (typeof window !== 'undefined') window.LocalResumeView = LocalResumeView;
if (typeof globalThis !== 'undefined') globalThis.LocalResumeView = LocalResumeView;
