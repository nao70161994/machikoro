'use strict';

const UiCardSelect = (() => {
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
        buildCardToggleButtonHtml,
        buildLandmarkToggleButtonHtml,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiCardSelect;
if (typeof window !== 'undefined') window.UiCardSelect = UiCardSelect;
if (typeof globalThis !== 'undefined') globalThis.UiCardSelect = UiCardSelect;
