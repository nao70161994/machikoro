'use strict';

const UiPendingEffects = (() => {
    function focusTransition(previousVisible, nextVisible, facts = {}) {
        const wasVisible = previousVisible === true;
        const visible = nextVisible === true;
        const eligible = facts.focusEligible === true;
        return Object.freeze({
            focusInitial: eligible && !wasVisible && visible,
            restoreGame: eligible && wasVisible && !visible && facts.activeWithin === true,
            visible,
        });
    }

    function createFocusController(initialVisible = false) {
        let visible = initialVisible === true;

        return Object.freeze({
            isVisible() { return visible; },
            transition(nextVisible, facts = {}) {
                const plan = focusTransition(visible, nextVisible, facts);
                visible = plan.visible;
                return plan;
            },
        });
    }

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

    function containsActiveElement(modal, content, activeElement) {
        if (!activeElement) return false;
        if (activeElement === modal || activeElement === content) return true;
        if (content && typeof content.contains === 'function' && content.contains(activeElement)) {
            return true;
        }
        return !!(modal && typeof modal.contains === 'function' && modal.contains(activeElement));
    }

    function applyFocusPlan(plan, options = {}) {
        if (!plan) return false;
        if (plan.focusInitial) {
            const content = options.content;
            const target = content && typeof content.querySelector === 'function'
                ? content.querySelector('button:not([disabled]), select:not([disabled])')
                : null;
            if (!target || typeof target.focus !== 'function') return false;
            try {
                target.focus();
                return true;
            } catch (_) {
                return false;
            }
        }
        if (plan.restoreGame && typeof options.restoreGameFocus === 'function') {
            return options.restoreGameFocus() !== false;
        }
        return false;
    }

    return Object.freeze({
        focusTransition,
        createFocusController,
        createUpdateController,
        applyBusinessCardSelection,
        applyModalInteraction,
        containsActiveElement,
        applyFocusPlan,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiPendingEffects;
if (typeof window !== 'undefined') window.UiPendingEffects = UiPendingEffects;
if (typeof globalThis !== 'undefined') globalThis.UiPendingEffects = UiPendingEffects;
