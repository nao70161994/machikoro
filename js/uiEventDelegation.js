'use strict';

const UiEventDelegation = (() => {
    const BINDINGS = Object.freeze({
        STATIC: 'static',
        DELEGATED: 'delegated',
    });

    function createBindingController() {
        const state = Object.fromEntries(Object.values(BINDINGS).map(name => [name, false]));

        function assertName(name) {
            if (!Object.prototype.hasOwnProperty.call(state, name)) {
                throw new TypeError('unknown UI binding: ' + name);
            }
        }
        function isBound(name) {
            assertName(name);
            return state[name];
        }
        function markBound(name) {
            assertName(name);
            state[name] = true;
            return snapshot();
        }
        function snapshot() { return Object.freeze(Object.assign({}, state)); }

        return Object.freeze({ isBound, markBound, snapshot });
    }

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

    function commandFromElement(element, family) {
        if (!element || !element.dataset) return null;
        const key = family === 'static' ? 'uiAction'
            : family === 'input' ? 'uiInput'
                : family === 'change' ? 'uiChange'
                    : 'action';
        const name = element.dataset[key];
        if (!name) return null;
        let args = [];
        if (family === 'static') {
            if (name === 'switchTab') args = [element.dataset.tab];
            else if (name === 'changeCount') args = [parseInt(element.dataset.delta, 10)];
            else if (name === 'switchOnlineTab') args = [element.dataset.onlineTab];
            else if (name === 'changeOnlineCount') args = [parseInt(element.dataset.delta, 10)];
        } else if (family === 'input') {
            if (name === 'cpuSpeed' || name === 'onlineCpuSpeed') args = [element.value];
            else if (name === 'localPlayerName') {
                args = [parseInt(element.dataset.playerIndex, 10), element.value];
            }
        } else if (family === 'change') {
            if (name === 'toggleTutorialEnabled') args = [element.checked];
            else if (name === 'tutorialLevel') args = [element.value];
            else if (name === 'localPlayerType' || name === 'onlinePlayerType') {
                args = [parseInt(element.dataset.playerIndex, 10), element.value];
            }
        } else if (family === 'dice') {
            if (name === 'selectDiceCount') args = [element.dataset.useTwo === 'true'];
            else if (name === 'resolveHarbor') args = [element.dataset.useBonus === 'true'];
        } else if (family === 'pending') {
            if (name === 'selectBusinessCard') args = [element.dataset.inputId];
            else if (name === 'skipBusiness') args = [];
            else if (name === 'resolveTV' || name === 'resolveBusiness' || name === 'resolveMover') {
                args = [parseInt(element.dataset.targetIndex, 10)];
            } else if (name === 'resolveCleaning') args = [element.dataset.cardName];
            else if (name === 'resolveRenovation') args = [element.dataset.landmarkName];
            else if (name === 'resolveIT') args = [element.dataset.doSave === 'true'];
        } else if (family === 'build') {
            if (name === 'buildCard' || name === 'showCardDetail') args = [element.dataset.cardName];
            else if (name === 'buildLandmark') args = [element.dataset.landmarkName];
            else if (name === 'showLandmarkDetail') args = [element.dataset.landmarkName, true];
            else if (name === 'setCardFilter') args = [element.dataset.cardFilter || ''];
        } else if (family === 'player' && name === 'showCardDetail') {
            args = [element.dataset.cardName];
        }
        return Object.freeze({ family, name, args: Object.freeze(args) });
    }

    function executeCommand(command, effects) {
        if (!command || !effects || typeof effects[command.name] !== 'function') return false;
        effects[command.name](...command.args);
        return true;
    }

    return Object.freeze({
        BINDINGS,
        createBindingController,
        datasetKey,
        elementFromEvent,
        isKeyboardActivationKey,
        isEnabledRoleButton,
        commandFromElement,
        executeCommand,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiEventDelegation;
if (typeof window !== 'undefined') window.UiEventDelegation = UiEventDelegation;
if (typeof globalThis !== 'undefined') globalThis.UiEventDelegation = UiEventDelegation;
