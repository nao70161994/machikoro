'use strict';

function buildTurnStatusText(current) {
    return `👤 ${current.name}のターン　🪙 ${current.coins}コイン`;
}

function buildRollButtonView(canRoll) {
    return Object.freeze({ disabled: !canRoll });
}

function buildSkipButtonView({ canNextTurn, pendingRenovation, builtThisTurn }) {
    return Object.freeze({
        disabled: !canNextTurn || pendingRenovation > 0,
        textContent: builtThisTurn ? '建設完了・ターン終了' : '建設しないでターン終了',
    });
}

function selectDiceValues({ lastDice1, lastDice2, lastDiceResult }) {
    if (lastDice1 > 0 && lastDice2 > 0) return Object.freeze([lastDice1, lastDice2]);
    if (lastDiceResult > 0) return Object.freeze([lastDiceResult]);
    return null;
}

function buildTurnTransitionView({
    phase,
    rollPhase,
    currentPlayerIndex,
    previousPlayerIndex,
    currentTurnCount,
    previousTurnCount,
    previousPhase,
    isReplaying,
    currentName,
    isCpuTurn,
}) {
    const isRollPhase = phase === rollPhase;
    const indexChanged = currentPlayerIndex !== previousPlayerIndex;
    const hasTurnCounts = Number.isInteger(currentTurnCount) &&
        Number.isInteger(previousTurnCount) && previousTurnCount >= 0;
    const turnCountChanged = hasTurnCounts && currentTurnCount !== previousTurnCount;
    const enteredRollPhase = isRollPhase && typeof previousPhase === 'string' &&
        previousPhase !== '' && previousPhase !== rollPhase;
    const changed = isRollPhase && (indexChanged || turnCountChanged || enteredRollPhase);
    return Object.freeze({
        announce: changed && previousPlayerIndex !== -1 && isReplaying !== true,
        name: currentName,
        isCpuTurn: isCpuTurn === true,
        playerIndex: currentPlayerIndex,
        nextPreviousPlayerIndex: changed ? currentPlayerIndex : previousPlayerIndex,
        nextPreviousTurnCount: isRollPhase && Number.isInteger(currentTurnCount)
            ? currentTurnCount
            : previousTurnCount,
        nextPreviousPhase: phase,
    });
}

function buildCoinChangeAnnouncement({
    coinChanges,
    players,
    cpuPlayerIndexes,
    isOnlineGame,
    myPlayerIndex,
    isReplaying,
}) {
    if (isReplaying === true) return '';
    const playerList = Array.isArray(players) ? players : [];
    const cpuIndexes = new Set(Array.isArray(cpuPlayerIndexes) ? cpuPlayerIndexes : []);
    return (Array.isArray(coinChanges) ? coinChanges : [])
        .filter(change => Number.isInteger(change.playerIndex) &&
            Number.isFinite(change.diff) && change.diff !== 0 &&
            !cpuIndexes.has(change.playerIndex) &&
            (isOnlineGame !== true || change.playerIndex === myPlayerIndex))
        .map(change => {
            const player = playerList[change.playerIndex];
            if (!player || typeof player.name !== 'string' || !player.name) return '';
            const sign = change.diff > 0 ? '+' : '';
            return `${player.name} ${sign}${change.diff}コイン`;
        })
        .filter(Boolean)
        .join('、');
}

function buildActiveGameView(facts) {
    const players = Array.isArray(facts.players) ? facts.players : [];
    const previousCoins = facts.previousCoins;
    const coinChanges = previousCoins
        ? players.map((player, playerIndex) => Object.freeze({
            playerIndex,
            diff: player.coins - previousCoins[playerIndex],
        })).filter(change => change.diff !== 0)
        : [];
    return Object.freeze({
        statusText: buildTurnStatusText(facts.current),
        rollButton: buildRollButtonView(facts.canRoll),
        skipButton: buildSkipButtonView({
            canNextTurn: facts.canNextTurn,
            pendingRenovation: facts.pendingRenovation,
            builtThisTurn: facts.builtThisTurn,
        }),
        diceValues: selectDiceValues(facts),
        turnTransition: buildTurnTransitionView(facts),
        coinChanges: Object.freeze(coinChanges),
        coinChangeAnnouncement: buildCoinChangeAnnouncement({
            coinChanges,
            players,
            cpuPlayerIndexes: facts.cpuPlayerIndexes,
            isOnlineGame: facts.isOnlineGame,
            myPlayerIndex: facts.myPlayerIndex,
            isReplaying: facts.isReplaying,
        }),
        nextCoins: Object.freeze(players.map(player => player.coins)),
    });
}

const UiGameStatusView = Object.freeze({
    buildTurnStatusText,
    buildRollButtonView,
    buildSkipButtonView,
    selectDiceValues,
    buildTurnTransitionView,
    buildCoinChangeAnnouncement,
    buildActiveGameView,
});
if (typeof module !== 'undefined' && module.exports) module.exports = UiGameStatusView;
if (typeof window !== 'undefined') window.UiGameStatusView = UiGameStatusView;
if (typeof globalThis !== 'undefined') globalThis.UiGameStatusView = UiGameStatusView;
