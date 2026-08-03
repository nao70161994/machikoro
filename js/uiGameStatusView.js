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
    isReplaying,
    currentName,
    isCpuTurn,
}) {
    const changed = phase === rollPhase && currentPlayerIndex !== previousPlayerIndex;
    return Object.freeze({
        announce: changed && previousPlayerIndex !== -1 && isReplaying !== true,
        name: currentName,
        isCpuTurn: isCpuTurn === true,
        nextPreviousPlayerIndex: changed ? currentPlayerIndex : previousPlayerIndex,
    });
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
        nextCoins: Object.freeze(players.map(player => player.coins)),
    });
}

const UiGameStatusView = Object.freeze({
    buildTurnStatusText,
    buildRollButtonView,
    buildSkipButtonView,
    selectDiceValues,
    buildTurnTransitionView,
    buildActiveGameView,
});
if (typeof module !== 'undefined' && module.exports) module.exports = UiGameStatusView;
if (typeof window !== 'undefined') window.UiGameStatusView = UiGameStatusView;
if (typeof globalThis !== 'undefined') globalThis.UiGameStatusView = UiGameStatusView;
