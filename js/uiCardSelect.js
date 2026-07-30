'use strict';

const UiCardSelect = (() => {
    const REQUIRED_CARD_NAMES = Object.freeze(['麦畑', 'パン屋']);

    function selectedNames(value) {
        if (value instanceof Set || Array.isArray(value)) return Array.from(value);
        return [];
    }

    function selectionResult(names, changed, extra = {}) {
        return Object.freeze(Object.assign({}, extra, {
            changed,
            selectedNames: Object.freeze(names),
        }));
    }

    function toggleCardSelection(currentSelection, name, requiredNames = REQUIRED_CARD_NAMES) {
        const current = selectedNames(currentSelection);
        const selected = current.includes(name);
        if (selected && selectedNames(requiredNames).includes(name)) {
            return selectionResult(current, false);
        }
        if (selected) {
            return selectionResult(current.filter(value => value !== name), true);
        }
        return selectionResult(current.concat(name), true);
    }

    function toggleCardSetSelection(currentSelection, cardNames, requiredNames = REQUIRED_CARD_NAMES) {
        if (!cardNames || typeof cardNames[Symbol.iterator] !== 'function') {
            return selectionResult(selectedNames(currentSelection), false, { valid: false, allOn: false });
        }
        const current = selectedNames(currentSelection);
        const cards = Array.from(cardNames);
        const selected = new Set(current);
        const required = new Set(selectedNames(requiredNames));
        const allOn = cards.every(name => selected.has(name));
        for (const name of cards) {
            if (required.has(name)) continue;
            if (allOn) selected.delete(name);
            else selected.add(name);
        }
        const next = Array.from(selected);
        return selectionResult(next, next.length !== current.length || next.some((name, index) => name !== current[index]), {
            valid: true,
            allOn,
        });
    }

    function toggleLandmarkSelection(currentSelection, name) {
        const current = selectedNames(currentSelection);
        const selected = current.includes(name);
        if (selected && current.length === 1) return selectionResult(current, false);
        if (selected) return selectionResult(current.filter(value => value !== name), true);
        return selectionResult(current.concat(name), true);
    }

    function buildCardToggleButtonHtml(options) {
        const { name, enabled, escapeHtml } = options;
        const safeName = escapeHtml(name);
        return `<button class="card-toggle-btn ${enabled ? 'on' : 'off'}" data-action="toggleCard" data-card-name="${safeName}" id="cardToggle_${safeName}" aria-pressed="${enabled ? 'true' : 'false'}">${safeName}</button>`;
    }

    function buildLandmarkToggleButtonHtml(options) {
        const { name, enabled, escapeHtml, getLandmarkEmoji } = options;
        const safeName = escapeHtml(name);
        return `<button class="card-toggle-btn ${enabled ? 'on' : 'off'}" data-action="toggleLandmark" data-landmark-name="${safeName}" aria-pressed="${enabled ? 'true' : 'false'}">${getLandmarkEmoji(name)} ${safeName}</button>`;
    }

    return Object.freeze({
        requiredCardNames: REQUIRED_CARD_NAMES,
        toggleCardSelection,
        toggleCardSetSelection,
        toggleLandmarkSelection,
        buildCardToggleButtonHtml,
        buildLandmarkToggleButtonHtml,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiCardSelect;
if (typeof window !== 'undefined') window.UiCardSelect = UiCardSelect;
if (typeof globalThis !== 'undefined') globalThis.UiCardSelect = UiCardSelect;
