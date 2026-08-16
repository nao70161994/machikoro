'use strict';

const LocalResumeView = (() => {
    function pendingButton(pending) {
        const active = pending === true;
        return Object.freeze({
            disabled: active,
            textContent: active ? 'モデル読み込み中' : '続きから再開',
        });
    }

    function marketDetails(savedState) {
        if (!savedState || typeof savedState !== 'object') return '';
        const supply = savedState.marketSupply;
        if (supply && supply.mode === 'ten-type') {
            const deckCount = Array.isArray(supply.deck) ? supply.deck.length : 0;
            const refillCount = Number.isSafeInteger(supply.refillSequence) &&
                supply.refillSequence >= 0 ? supply.refillSequence : 0;
            const turnCount = Number.isSafeInteger(savedState.turnCount) && savedState.turnCount >= 0
                ? savedState.turnCount : 0;
            const warning = deckCount === 0 ? '・山札切れ'
                : deckCount <= 10 ? '・残りわずか' : '';
            return `🏪 公式10種類市場・${turnCount}ターン・補充${refillCount}回・山札${deckCount}枚${warning}`;
        }
        const turnCount = Number.isSafeInteger(savedState.turnCount) && savedState.turnCount >= 0
            ? `・${savedState.turnCount}ターン` : '';
        return `🏪 通常市場${turnCount}`;
    }

    function resumeSections(localSaveExists, onlineSession, savedState = null) {
        return Object.freeze({
            localDisplay: localSaveExists ? 'flex' : 'none',
            localMarketDescription: localSaveExists ? marketDetails(savedState) : '',
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

    return Object.freeze({ pendingButton, marketDetails, resumeSections, generationOptions });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LocalResumeView;
if (typeof window !== 'undefined') window.LocalResumeView = LocalResumeView;
if (typeof globalThis !== 'undefined') globalThis.LocalResumeView = LocalResumeView;
