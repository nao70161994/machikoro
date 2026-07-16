'use strict';

const UiCardOrder = (() => {
    function compareCardsForDisplay(a, b, colorOrder) {
        const colorDiff = (colorOrder[a.color] ?? 9) - (colorOrder[b.color] ?? 9);
        if (colorDiff !== 0) return colorDiff;
        const diceDiff = Math.min(...a.diceNums) - Math.min(...b.diceNums);
        if (diceDiff !== 0) return diceDiff;
        const costDiff = a.cost - b.cost;
        if (costDiff !== 0) return costDiff;
        return a.name.localeCompare(b.name, 'ja');
    }

    function compareCardNamesForDisplay(a, b, cards, colorOrder) {
        const cardA = cards.find(card => card.name === a);
        const cardB = cards.find(card => card.name === b);
        if (cardA && cardB) return compareCardsForDisplay(cardA, cardB, colorOrder);
        if (cardA) return -1;
        if (cardB) return 1;
        return a.localeCompare(b, 'ja');
    }

    return Object.freeze({ compareCardsForDisplay, compareCardNamesForDisplay });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiCardOrder;
if (typeof window !== 'undefined') window.UiCardOrder = UiCardOrder;
if (typeof globalThis !== 'undefined') globalThis.UiCardOrder = UiCardOrder;
