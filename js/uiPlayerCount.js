'use strict';

const UiPlayerCount = (() => {
    function buildView(count) {
        return Object.freeze({ textContent: `${count}人` });
    }

    function applyView(element, view) {
        if (!element || !view || element.textContent === view.textContent) return false;
        element.textContent = view.textContent;
        return true;
    }

    return Object.freeze({ buildView, applyView });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiPlayerCount;
if (typeof window !== 'undefined') window.UiPlayerCount = UiPlayerCount;
if (typeof globalThis !== 'undefined') globalThis.UiPlayerCount = UiPlayerCount;
