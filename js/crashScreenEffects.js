'use strict';

const CrashScreenEffects = (() => {
    function focusableElements(screen) {
        if (!screen || typeof screen.querySelectorAll !== 'function') return [];
        return Array.from(screen.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )).filter(node => !node.disabled && node.offsetParent !== null);
    }

    function applyView(elements, view) {
        const { screen, message, resumeButton } = elements;
        message.textContent = view.message;
        if (resumeButton) resumeButton.style.display = view.resumeDisplay;
        screen.style.display = 'flex';
        screen.setAttribute('aria-modal', 'true');
        if (typeof screen.hasAttribute !== 'function' || !screen.hasAttribute('tabindex')) {
            screen.setAttribute('tabindex', '-1');
        }
    }

    function focusInitial(elements, initialFocus) {
        const { screen, resumeButton, reloadButton } = elements;
        const focusTarget = initialFocus === 'resume' && resumeButton
            ? resumeButton
            : reloadButton;
        if (focusTarget && typeof focusTarget.focus === 'function') {
            focusTarget.focus();
            return;
        }
        if (typeof screen.focus === 'function') screen.focus();
    }

    function applyFocusTrap(plan, event, screen, focusables) {
        if (!plan.preventDefault) return;
        event.preventDefault();
        if (plan.focusTarget === 'screen') {
            if (screen && typeof screen.focus === 'function') screen.focus();
            return;
        }
        const focusTarget = plan.focusTarget === 'last'
            ? focusables[focusables.length - 1]
            : focusables[0];
        if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus();
    }

    function hide(screen) {
        screen.style.display = 'none';
    }

    return Object.freeze({
        focusableElements,
        applyView,
        focusInitial,
        applyFocusTrap,
        hide,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CrashScreenEffects;
if (typeof window !== 'undefined') Object.assign(window, { CrashScreenEffects });
if (typeof globalThis !== 'undefined') globalThis.CrashScreenEffects = CrashScreenEffects;
