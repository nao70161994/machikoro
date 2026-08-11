'use strict';

const UiRangeControl = (() => {
    function buildValueView(value, formatValue) {
        const text = typeof formatValue === 'function' ? String(formatValue(value)) : String(value);
        return Object.freeze({ textContent: text, ariaValueText: text });
    }

    function applyValueView(input, label, view) {
        if (!view) return false;
        if (label) label.textContent = view.textContent;
        if (input && typeof input.setAttribute === 'function') {
            input.setAttribute('aria-valuetext', view.ariaValueText);
        }
        return !!(input || label);
    }

    return Object.freeze({ buildValueView, applyValueView });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiRangeControl;
if (typeof window !== 'undefined') window.UiRangeControl = UiRangeControl;
if (typeof globalThis !== 'undefined') globalThis.UiRangeControl = UiRangeControl;
