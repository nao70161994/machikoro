'use strict';

const LocalResumeView = (() => {
    function pendingButton(pending) {
        const active = pending === true;
        return Object.freeze({
            disabled: active,
            textContent: active ? '対戦相手を準備中…' : '続きから再開',
            ariaBusy: active,
        });
    }

    function marketDetails(savedState) {
        if (!savedState || typeof savedState !== 'object') return '';
        const playerStates = Array.isArray(savedState.players) ? savedState.players : [];
        const playerCount = playerStates.length > 0 ? `${playerStates.length}人対戦` : '';
        const namedPlayers = playerStates.map((player, index) => ({
            index,
            name: typeof player?.name === 'string' && player.name.trim() ? player.name.trim() : `席${index + 1}`,
        }));
        const visibleNames = playerStates.length > 4
            ? [...namedPlayers.slice(0, 3).map(player => player.name), `ほか${playerStates.length - 3}人`]
            : namedPlayers.map(player => player.name);
        const participants = visibleNames.length ? `・参加者 ${visibleNames.join(' / ')}` : '';
        const currentPlayer = Number.isInteger(savedState.currentPlayerIndex) &&
            savedState.currentPlayerIndex >= 0 && savedState.currentPlayerIndex < playerStates.length
            ? playerStates[savedState.currentPlayerIndex] : null;
        const currentName = currentPlayer
            ? (namedPlayers[savedState.currentPlayerIndex]?.name || `席${savedState.currentPlayerIndex + 1}`) : '';
        const currentDetails = [];
        if (Number.isSafeInteger(currentPlayer?.coins) && currentPlayer.coins >= 0) currentDetails.push(`${currentPlayer.coins}コイン`);
        if (Array.isArray(currentPlayer?.cards)) currentDetails.push(`施設${currentPlayer.cards.length}枚`);
        const landmarkNames = Array.isArray(savedState.enabledLandmarksList)
            ? savedState.enabledLandmarksList.filter(name => typeof name === 'string')
            : null;
        if (currentPlayer?.landmarks && landmarkNames?.length > 0) {
            const built = landmarkNames.filter(name => currentPlayer.landmarks[name] === true).length;
            currentDetails.push(`目標${built}/${landmarkNames.length}`);
        } else if (currentPlayer?.landmarks) {
            const built = Object.values(currentPlayer.landmarks).filter(value => value === true).length;
            if (built > 0) currentDetails.push(`建設済みランドマーク${built}個`);
        }
        const turnOwner = currentName
            ? `・${currentName}の手番${currentDetails.length ? `（${currentDetails.join('・')}）` : ''}` : '';
        const supply = savedState.marketSupply;
        if (supply && supply.mode === 'ten-type') {
            const deckCount = Array.isArray(supply.deck) ? supply.deck.length : 0;
            const refillCount = Number.isSafeInteger(supply.refillSequence) &&
                supply.refillSequence >= 0 ? supply.refillSequence : 0;
            const turnCount = Number.isSafeInteger(savedState.turnCount) && savedState.turnCount >= 0
                ? savedState.turnCount : 0;
            const warning = deckCount === 0 ? '・山札切れ'
                : deckCount <= 10 ? '・残りわずか' : '';
            return `🏪 公式10種類市場${playerCount ? `・${playerCount}` : ''}${participants}・${turnCount}ターン${turnOwner}・補充${refillCount}回・山札${deckCount}枚${warning}`;
        }
        const turnCount = Number.isSafeInteger(savedState.turnCount) && savedState.turnCount >= 0
            ? `・${savedState.turnCount}ターン` : '';
        return `🏪 通常市場${playerCount ? `・${playerCount}` : ''}${participants}${turnCount}${turnOwner}`;
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

    function generationOptions(previousCount, availableGenerations = null) {
        const count = Number.isInteger(previousCount) ? Math.max(0, Math.min(2, previousCount)) : 0;
        const indices = Array.from({ length: count + 1 }, (_, index) => index)
            .filter(index => !Array.isArray(availableGenerations) || availableGenerations.includes(index));
        return Object.freeze(indices.map(index => Object.freeze({
            value: index,
            label: index === 0 ? '最新の保存データ' : `${index}回前の保存データ`,
        })));
    }

    return Object.freeze({ pendingButton, marketDetails, resumeSections, generationOptions });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LocalResumeView;
if (typeof window !== 'undefined') window.LocalResumeView = LocalResumeView;
if (typeof globalThis !== 'undefined') globalThis.LocalResumeView = LocalResumeView;
