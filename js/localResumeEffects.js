'use strict';

const LocalResumeEffects = (() => {
    /**
     * @typedef {{
     *   disabled?: boolean,
     *   innerHTML?: string,
     *   textContent?: string | null,
     *   style?: { display: string },
     * }} ResumeElement
     */

    /**
     * @typedef {{ getElementById: (id: string) => ResumeElement | null }} Dependencies
     */

    /**
     * @param {Dependencies} dependencies
     */
    function create(dependencies) {
        if (!dependencies || typeof dependencies.getElementById !== 'function') {
            throw new TypeError('getElementById dependency is required');
        }

        /**
         * @param {{ disabled: boolean, textContent: string }} view
         * @returns {boolean}
         */
        function applyPendingButton(view) {
            const button = dependencies.getElementById('btnResume');
            if (!button) return false;
            button.disabled = view.disabled;
            button.textContent = view.textContent;
            return true;
        }

        /**
         * @param {{
         *   localDisplay: string,
         *   onlineDisplay: string,
         *   onlineDescription: string,
         * }} view
         */
        function applyResumeSections(view) {
            const localSection = dependencies.getElementById('resumeSection');
            const onlineSection = dependencies.getElementById('onlineResumeSection');
            const onlineDescription = dependencies.getElementById('onlineResumeDescription');
            if (localSection && localSection.style) localSection.style.display = view.localDisplay;
            if (onlineSection && onlineSection.style) onlineSection.style.display = view.onlineDisplay;
            if (onlineDescription) onlineDescription.textContent = view.onlineDescription;
        }

        function applyGenerationOptions(options) {
            const select = dependencies.getElementById('localSaveGeneration');
            const label = dependencies.getElementById('localSaveGenerationLabel');
            if (!select) return false;
            select.innerHTML = (options || []).map(option =>
                `<option value="${option.value}">${option.label}</option>`
            ).join('');
            if (label && label.style) label.style.display = options && options.length > 1 ? 'flex' : 'none';
            return true;
        }

        return Object.freeze({ applyPendingButton, applyResumeSections, applyGenerationOptions });
    }

    return Object.freeze({ create });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LocalResumeEffects;
if (typeof window !== 'undefined') Object.assign(window, { LocalResumeEffects });
if (typeof globalThis !== 'undefined') globalThis.LocalResumeEffects = LocalResumeEffects;
