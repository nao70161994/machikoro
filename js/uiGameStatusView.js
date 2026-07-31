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

const UiGameStatusView = Object.freeze({
    buildTurnStatusText,
    buildRollButtonView,
    buildSkipButtonView,
    selectDiceValues,
});
if (typeof module !== 'undefined' && module.exports) module.exports = UiGameStatusView;
if (typeof window !== 'undefined') window.UiGameStatusView = UiGameStatusView;
if (typeof globalThis !== 'undefined') globalThis.UiGameStatusView = UiGameStatusView;
