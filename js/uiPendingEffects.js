'use strict';

const UiPendingEffects = (() => {
    function createUpdateController() {
        let updating = false;

        return Object.freeze({
            isUpdating() { return updating; },
            run(update) {
                if (updating || typeof update !== 'function') return false;
                updating = true;
                try {
                    return update();
                } finally {
                    updating = false;
                }
            },
        });
    }

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

    function applyModalInteraction(view, options = {}) {
        const modal = options.modal;
        const content = options.content;
        if (modal && modal.style) {
            Object.assign(modal.style, view.modal);
            if (view.inner && typeof modal.querySelector === 'function') {
                const inner = modal.querySelector('.pending-modal-inner');
                if (inner && inner.style) Object.assign(inner.style, view.inner);
            }
        }
        if (content && content.style) Object.assign(content.style, view.content);
    }

    return Object.freeze({
        createUpdateController,
        applyBusinessCardSelection,
        applyModalInteraction,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiPendingEffects;
if (typeof window !== 'undefined') window.UiPendingEffects = UiPendingEffects;
if (typeof globalThis !== 'undefined') globalThis.UiPendingEffects = UiPendingEffects;
