'use strict';

const UiCardSelectEffects = (() => {
    /**
     * @typedef {{
     *   innerHTML?: string,
     *   textContent?: string | null,
     *   className?: string,
     *   setAttribute?: (name: string, value: string) => void,
     * }} CardSelectElement
     */

    /**
     * @typedef {{
     *   getElementById: (id: string) => CardSelectElement | null,
     *   getActiveElement?: () => any,
     *   getWindow?: () => any,
     *   findToggle?: (identity: { action: string, name: string }) => any,
     * }} Dependencies
     */

    /**
     * @typedef {{
     *   sets: ReadonlyArray<{
     *     suffix: string,
     *     cardListHtml: string,
     *     allOn: boolean,
     *   }>,
     *   landmarkListHtml: string,
     * }} CardSelectView
     */

    /**
     * @param {Dependencies} dependencies
     */
    function create(dependencies) {
        if (!dependencies || typeof dependencies.getElementById !== 'function') {
            throw new TypeError('getElementById dependency is required');
        }

        function focusIdentity(element) {
            const dataset = element && element.dataset;
            if (!dataset) return null;
            if (dataset.action === 'toggleCard' && dataset.cardName) {
                return Object.freeze({ action: dataset.action, name: dataset.cardName });
            }
            if (dataset.action === 'toggleLandmark' && dataset.landmarkName) {
                return Object.freeze({ action: dataset.action, name: dataset.landmarkName });
            }
            return null;
        }

        function canRestoreFocus(element) {
            if (!element || typeof element.focus !== 'function' ||
                    element.isConnected === false || element.disabled === true ||
                    element.hidden === true) return false;
            if ('offsetParent' in element && element.offsetParent === null) return false;
            if (typeof element.getAttribute === 'function' &&
                    element.getAttribute('aria-hidden') === 'true') return false;
            if (typeof element.closest === 'function' &&
                    element.closest('[hidden], [aria-hidden="true"]')) return false;
            const currentWindow = typeof dependencies.getWindow === 'function'
                ? dependencies.getWindow()
                : null;
            if (currentWindow && typeof currentWindow.getComputedStyle === 'function') {
                const style = currentWindow.getComputedStyle(element);
                if (style && (style.display === 'none' || style.visibility === 'hidden' ||
                        style.opacity === '0' || style.pointerEvents === 'none')) {
                    return false;
                }
            }
            return true;
        }

        function restoreFocus(identity) {
            if (!identity || typeof dependencies.findToggle !== 'function') return false;
            const target = dependencies.findToggle(identity);
            if (!canRestoreFocus(target)) return false;
            target.focus();
            return true;
        }

        /**
         * @param {CardSelectView} view
         */
        function apply(view) {
            const activeElement = typeof dependencies.getActiveElement === 'function'
                ? dependencies.getActiveElement()
                : null;
            const previousFocus = focusIdentity(activeElement);
            for (const setView of view.sets) {
                const list = dependencies.getElementById(`cardList${setView.suffix}`);
                if (list) list.innerHTML = setView.cardListHtml;
                const button = dependencies.getElementById(`btnSet${setView.suffix}`);
                if (button) {
                    button.textContent = setView.allOn ? 'ON' : 'OFF';
                    button.className = `set-toggle ${setView.allOn ? 'on' : 'off'}`;
                    if (typeof button.setAttribute === 'function') {
                        button.setAttribute('aria-pressed', setView.allOn ? 'true' : 'false');
                    }
                }
            }
            const landmarkList = dependencies.getElementById('landmarkList');
            if (landmarkList) landmarkList.innerHTML = view.landmarkListHtml;
            restoreFocus(previousFocus);
        }

        return Object.freeze({ apply, canRestoreFocus, focusIdentity, restoreFocus });
    }

    return Object.freeze({ create });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiCardSelectEffects;
if (typeof window !== 'undefined') Object.assign(window, { UiCardSelectEffects });
if (typeof globalThis !== 'undefined') globalThis.UiCardSelectEffects = UiCardSelectEffects;
