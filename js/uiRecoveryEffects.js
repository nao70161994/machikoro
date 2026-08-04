'use strict';

const UiRecoveryEffects = (() => {
    function createRuntime(options = {}) {
        const getDocument = typeof options.getDocument === 'function' ? options.getDocument : () => null;

        function elementById(id) {
            const documentRef = getDocument();
            return documentRef && typeof documentRef.getElementById === 'function'
                ? documentRef.getElementById(id) : null;
        }

        function clearModalLock(id) {
            const element = elementById(id);
            if (!element) return false;
            let changed = false;
            if (element.inert) {
                element.inert = false;
                changed = true;
            }
            if (typeof element.getAttribute === 'function' && element.getAttribute('aria-hidden') !== null) {
                if (typeof element.removeAttribute === 'function') element.removeAttribute('aria-hidden');
                changed = true;
            }
            if (element.style && element.style.pointerEvents === 'none') {
                element.style.pointerEvents = '';
                changed = true;
            }
            return changed;
        }

        function clearShellLock(id) {
            const element = elementById(id);
            if (!element) return false;
            let changed = clearModalLock(id);
            if (element.hidden) {
                element.hidden = false;
                changed = true;
            }
            return changed;
        }

        function forceClearModalLock(id) {
            const element = elementById(id);
            if (!element) return false;
            element.inert = false;
            if (typeof element.removeAttribute === 'function') element.removeAttribute('aria-hidden');
            if (element.style && element.style.pointerEvents === 'none') element.style.pointerEvents = '';
            return true;
        }

        function hide(id) {
            const element = elementById(id);
            if (!element || !element.style) return false;
            element.style.display = 'none';
            return true;
        }

        function restoreDisplay(id, display = 'block') {
            const element = elementById(id);
            if (!element || !element.style || element.style.display !== 'none') return false;
            element.style.display = display;
            return true;
        }

        function clearPointerEvents(id) {
            const element = elementById(id);
            if (!element || !element.style || element.style.pointerEvents !== 'none') return false;
            element.style.pointerEvents = '';
            return true;
        }

        function removeBodyModalOpen() {
            const documentRef = getDocument();
            const classList = documentRef && documentRef.body && documentRef.body.classList;
            if (!classList || typeof classList.remove !== 'function') return false;
            const changed = typeof classList.contains === 'function'
                ? classList.contains('modal-open') : true;
            classList.remove('modal-open');
            return changed;
        }

        return Object.freeze({
            clearModalLock,
            clearPointerEvents,
            clearShellLock,
            forceClearModalLock,
            hide,
            removeBodyModalOpen,
            restoreDisplay,
        });
    }

    return Object.freeze({ createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiRecoveryEffects;
if (typeof window !== 'undefined') window.UiRecoveryEffects = UiRecoveryEffects;
if (typeof globalThis !== 'undefined') globalThis.UiRecoveryEffects = UiRecoveryEffects;
