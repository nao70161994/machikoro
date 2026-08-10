'use strict';

const UiScreenFocus = (() => {
    const targets = Object.freeze({
        game: Object.freeze({ screenId: 'gameScreen', targetId: 'status' }),
        title: Object.freeze({ screenId: 'titleScreen', targetId: 'titleHeading' }),
    });

    function hasHiddenAncestor(element, documentRef) {
        let current = element;
        while (current) {
            if (current.isConnected === false || current.hidden === true || current.inert === true) {
                return true;
            }
            if (current.style &&
                    (current.style.display === 'none' || current.style.visibility === 'hidden')) {
                return true;
            }
            if (typeof current.getAttribute === 'function' &&
                    current.getAttribute('aria-hidden') === 'true') {
                return true;
            }
            const view = documentRef && documentRef.defaultView;
            if (view && typeof view.getComputedStyle === 'function') {
                const computed = view.getComputedStyle(current);
                if (computed && (computed.display === 'none' || computed.visibility === 'hidden')) {
                    return true;
                }
            }
            current = current.parentElement;
        }
        return false;
    }

    function isUnavailable(element, documentRef) {
        if (!element || typeof element.focus !== 'function') return true;
        if (element.disabled === true) return true;
        return hasHiddenAncestor(element, documentRef);
    }

    function blockingOverlayVisible(documentRef) {
        if (!documentRef) return false;
        const body = documentRef.body;
        if (body && body.classList && typeof body.classList.contains === 'function' &&
                body.classList.contains('modal-open')) {
            return true;
        }
        const crashScreen = typeof documentRef.getElementById === 'function'
            ? documentRef.getElementById('crashScreen')
            : null;
        return !!(crashScreen && crashScreen.style &&
            (crashScreen.style.display === 'flex' || crashScreen.style.display === 'block'));
    }

    function focusElement(element, documentRef) {
        if (isUnavailable(element, documentRef)) return false;
        if (typeof element.hasAttribute !== 'function' || !element.hasAttribute('tabindex')) {
            if (typeof element.setAttribute === 'function') element.setAttribute('tabindex', '-1');
            else element.tabIndex = -1;
        }
        try {
            element.focus({ preventScroll: true });
        } catch (_) {
            element.focus();
        }
        return true;
    }

    function focusScreen(documentRef, screenName) {
        const target = targets[screenName];
        if (!target || !documentRef || typeof documentRef.getElementById !== 'function') return false;
        if (blockingOverlayVisible(documentRef)) return false;
        const screen = documentRef.getElementById(target.screenId);
        if (isUnavailable(screen, documentRef)) return false;
        const preferred = documentRef.getElementById(target.targetId);
        return focusElement(preferred, documentRef) || focusElement(screen, documentRef);
    }

    function hasUsableFocus(documentRef) {
        if (!documentRef) return false;
        const active = documentRef.activeElement;
        if (!active || active === documentRef.body || active === documentRef.documentElement) return false;
        return !isUnavailable(active, documentRef);
    }

    function ensureCurrentScreenFocus(documentRef) {
        if (hasUsableFocus(documentRef) || blockingOverlayVisible(documentRef)) return false;
        return focusScreen(documentRef, 'game') || focusScreen(documentRef, 'title');
    }

    return Object.freeze({
        ensureCurrentScreenFocus,
        focusGame: documentRef => focusScreen(documentRef, 'game'),
        focusScreen,
        focusTitle: documentRef => focusScreen(documentRef, 'title'),
        hasUsableFocus,
        targets,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiScreenFocus;
if (typeof window !== 'undefined') window.UiScreenFocus = UiScreenFocus;
if (typeof globalThis !== 'undefined') globalThis.UiScreenFocus = UiScreenFocus;
