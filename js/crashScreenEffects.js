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

    function disableBackground(elements) {
        const restore = [];
        for (const element of Array.isArray(elements) ? elements : []) {
            if (!element) continue;
            restore.push({
                element,
                hadInert: Object.prototype.hasOwnProperty.call(element, 'inert'),
                inert: element.inert,
                ariaHidden: typeof element.getAttribute === 'function'
                    ? element.getAttribute('aria-hidden')
                    : null,
                pointerEvents: element.style ? element.style.pointerEvents || '' : '',
            });
            element.inert = true;
            if (typeof element.setAttribute === 'function') {
                element.setAttribute('aria-hidden', 'true');
            }
            if (element.style) element.style.pointerEvents = 'none';
        }
        return restore;
    }

    function restoreBackground(entries) {
        for (const entry of Array.isArray(entries) ? entries : []) {
            const element = entry && entry.element;
            if (!element) continue;
            element.inert = entry.hadInert ? entry.inert : false;
            if (entry.ariaHidden === null) {
                if (typeof element.removeAttribute === 'function') {
                    element.removeAttribute('aria-hidden');
                }
            } else if (typeof element.setAttribute === 'function') {
                element.setAttribute('aria-hidden', entry.ariaHidden);
            }
            if (element.style) element.style.pointerEvents = entry.pointerEvents || '';
        }
    }

    function canRestoreFocus(element) {
        if (!element || typeof element.focus !== 'function' || element.disabled === true) return false;
        if (element.isConnected === false || element.hidden === true || element.offsetParent === null) return false;
        return typeof element.getAttribute !== 'function' || element.getAttribute('aria-hidden') !== 'true';
    }

    function restoreFocus(previousFocus, backgroundElements) {
        if (canRestoreFocus(previousFocus)) {
            previousFocus.focus();
            return previousFocus;
        }
        for (const background of Array.isArray(backgroundElements) ? backgroundElements : []) {
            const fallback = focusableElements(background)[0];
            if (!canRestoreFocus(fallback)) continue;
            fallback.focus();
            return fallback;
        }
        return null;
    }

    function hide(screen) {
        screen.style.display = 'none';
    }

    return Object.freeze({
        focusableElements,
        applyView,
        focusInitial,
        applyFocusTrap,
        disableBackground,
        restoreBackground,
        restoreFocus,
        hide,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CrashScreenEffects;
if (typeof window !== 'undefined') Object.assign(window, { CrashScreenEffects });
if (typeof globalThis !== 'undefined') globalThis.CrashScreenEffects = CrashScreenEffects;
