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
     * @typedef {{ getElementById: (id: string) => CardSelectElement | null }} Dependencies
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

        /**
         * @param {CardSelectView} view
         */
        function apply(view) {
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
        }

        return Object.freeze({ apply });
    }

    return Object.freeze({ create });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiCardSelectEffects;
if (typeof window !== 'undefined') Object.assign(window, { UiCardSelectEffects });
if (typeof globalThis !== 'undefined') globalThis.UiCardSelectEffects = UiCardSelectEffects;
