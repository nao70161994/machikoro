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

        function queryAll(id, selector) {
            const parent = elementById(id);
            if (!parent || typeof parent.querySelectorAll !== 'function') return [];
            try {
                return Array.from(parent.querySelectorAll(selector) || []);
            } catch (_) {
                return [];
            }
        }

        function ensureHtmlChildren(id, selector, html, existingPattern = null) {
            const parent = elementById(id);
            if (!parent) return Object.freeze({ changed: false, elements: [] });
            let elements = queryAll(id, selector);
            let changed = false;
            const htmlAlreadyPresent = existingPattern instanceof RegExp &&
                typeof parent.innerHTML === 'string' && existingPattern.test(parent.innerHTML);
            if (!elements.length && !htmlAlreadyPresent && typeof parent.innerHTML === 'string') {
                if (typeof parent.insertAdjacentHTML === 'function') parent.insertAdjacentHTML('afterbegin', html);
                else parent.innerHTML = html + parent.innerHTML;
                changed = true;
                elements = queryAll(id, selector);
            }
            return Object.freeze({ changed, elements });
        }

        function releaseInteractionLock(element, options = {}) {
            if (!element) return false;
            let changed = false;
            if (options.enable && element.disabled) {
                element.disabled = false;
                changed = true;
            }
            if (options.reveal !== false && element.hidden) {
                element.hidden = false;
                changed = true;
            }
            if (options.clearInert !== false && element.inert) {
                element.inert = false;
                changed = true;
            }
            if (options.clearAriaHidden !== false && typeof element.getAttribute === 'function' &&
                    element.getAttribute('aria-hidden') !== null) {
                if (typeof element.removeAttribute === 'function') element.removeAttribute('aria-hidden');
                changed = true;
            }
            const displayValue = options.displayValue || '';
            if (options.forceDisplay && element.style && element.style.display !== displayValue) {
                element.style.display = displayValue;
                changed = true;
            } else if (options.restoreDisplay !== false && element.style && element.style.display === 'none') {
                element.style.display = displayValue;
                changed = true;
            }
            if (options.restorePointerEvents !== false && element.style && element.style.pointerEvents === 'none') {
                element.style.pointerEvents = options.pointerEventsValue || '';
                changed = true;
            }
            return changed;
        }

        function releaseInteractionLockById(id, options = {}) {
            return releaseInteractionLock(elementById(id), options);
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
            ensureHtmlChildren,
            hide,
            queryAll,
            releaseInteractionLock,
            releaseInteractionLockById,
            removeBodyModalOpen,
            restoreDisplay,
        });
    }

    return Object.freeze({ createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiRecoveryEffects;
if (typeof window !== 'undefined') window.UiRecoveryEffects = UiRecoveryEffects;
if (typeof globalThis !== 'undefined') globalThis.UiRecoveryEffects = UiRecoveryEffects;
