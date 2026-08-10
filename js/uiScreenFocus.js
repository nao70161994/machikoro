'use strict';

const UiScreenFocus = (() => {
    const targets = Object.freeze({
        game: Object.freeze({ screenId: 'gameScreen', targetId: 'status' }),
        title: Object.freeze({ screenId: 'titleScreen', targetId: 'titleHeading' }),
    });

    function isUnavailable(element) {
        if (!element || typeof element.focus !== 'function') return true;
        if (element.isConnected === false || element.hidden === true || element.inert === true) return true;
        if (element.disabled === true) return true;
        if (element.style && (element.style.display === 'none' || element.style.visibility === 'hidden')) {
            return true;
        }
        return typeof element.getAttribute === 'function' &&
            element.getAttribute('aria-hidden') === 'true';
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

    function focusElement(element) {
        if (isUnavailable(element)) return false;
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
        if (isUnavailable(screen)) return false;
        const preferred = documentRef.getElementById(target.targetId);
        return focusElement(preferred) || focusElement(screen);
    }

    return Object.freeze({
        focusGame: documentRef => focusScreen(documentRef, 'game'),
        focusScreen,
        focusTitle: documentRef => focusScreen(documentRef, 'title'),
        targets,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiScreenFocus;
if (typeof window !== 'undefined') window.UiScreenFocus = UiScreenFocus;
if (typeof globalThis !== 'undefined') globalThis.UiScreenFocus = UiScreenFocus;
