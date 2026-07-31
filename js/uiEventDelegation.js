'use strict';

const UiEventDelegation = (() => {
    function datasetKey(attributeName) {
        return attributeName
            .replace(/^data-/, '')
            .replace(/-([a-z])/g, (_, character) => character.toUpperCase());
    }

    /**
     * @param {any} event
     * @param {string} attributeName
     * @returns {any | null}
     */
    function elementFromEvent(event, attributeName) {
        const target = event && event.target;
        if (!target) return null;
        const selector = '[' + attributeName + ']';
        if (typeof target.closest === 'function') return target.closest(selector);
        return target.dataset && target.dataset[datasetKey(attributeName)] ? target : null;
    }

    /** @param {any} event */
    function isKeyboardActivationKey(event) {
        return !!event && (event.key === 'Enter' || event.key === ' ');
    }

    /** @param {any} element */
    function isEnabledRoleButton(element) {
        return !!element && !element.disabled && element.getAttribute('role') === 'button';
    }

    return Object.freeze({
        datasetKey,
        elementFromEvent,
        isKeyboardActivationKey,
        isEnabledRoleButton,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiEventDelegation;
if (typeof window !== 'undefined') window.UiEventDelegation = UiEventDelegation;
if (typeof globalThis !== 'undefined') globalThis.UiEventDelegation = UiEventDelegation;
