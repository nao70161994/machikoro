'use strict';

const UiPendingEffects = (() => {
    function applyButtonState(button, state) {
        if (!button || !state) return;
        if (button.classList) {
            if (state.selected && typeof button.classList.add === 'function') {
                button.classList.add('selected');
            } else if (!state.selected && typeof button.classList.remove === 'function') {
                button.classList.remove('selected');
            }
        }
        if (typeof button.setAttribute === 'function') {
            button.setAttribute('aria-pressed', state.ariaPressed);
        }
    }

    function applyBusinessCardSelection(view, options = {}) {
        const groupButtons = options.groupButtons || [];
        groupButtons.forEach((button, index) => {
            applyButtonState(button, view.groupButtons[index]);
        });
        applyButtonState(options.selectedButton, view.selectedButton);
        const input = typeof options.findInput === 'function' ? options.findInput() : options.input;
        if (!input) return false;
        input.value = view.inputValue;
        return true;
    }

    return Object.freeze({ applyBusinessCardSelection });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiPendingEffects;
if (typeof window !== 'undefined') window.UiPendingEffects = UiPendingEffects;
if (typeof globalThis !== 'undefined') globalThis.UiPendingEffects = UiPendingEffects;
