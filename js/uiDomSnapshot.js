'use strict';

const UiDomSnapshot = (() => {
    const INTERACTIVE_SELECTOR = 'button, [role="button"], [data-action], [data-ui-action], input, select, textarea, a[href]';
    const GAME_SCREEN_CHILD_IDS = Object.freeze(['btnRoll', 'btnSkip', 'btnReroll', 'diceChoose', 'buildMenu']);

    function createRuntime(options = {}) {
        const getDocument = typeof options.getDocument === 'function' ? options.getDocument : () => null;
        const getComputedStyle = typeof options.getComputedStyle === 'function' ? options.getComputedStyle : () => null;
        const truncateText = typeof options.truncateText === 'function' ? options.truncateText : value => String(value || '');

        function computedStyle(element) {
            try {
                return getComputedStyle(element) || {};
            } catch (_) {
                return {};
            }
        }

        function hasBlockingAncestor(id, element) {
            try {
                if (element && typeof element.closest === 'function' && element.closest('[inert], [aria-hidden="true"]')) return true;
            } catch (_) {}
            if (!GAME_SCREEN_CHILD_IDS.includes(id)) return false;
            const documentRef = getDocument();
            const gameScreen = documentRef && typeof documentRef.getElementById === 'function'
                ? documentRef.getElementById('gameScreen') : null;
            if (gameScreen && (gameScreen.inert || (typeof gameScreen.getAttribute === 'function' && gameScreen.getAttribute('aria-hidden') === 'true'))) return true;
            return !!(gameScreen && gameScreen.style && gameScreen.style.display === 'none');
        }

        function isInteractiveElementUsable(element) {
            if (!element || element.disabled || element.hidden || element.inert) return false;
            const style = element.style || {};
            const computed = computedStyle(element);
            if (style.display === 'none' || computed.display === 'none') return false;
            if (style.visibility === 'hidden' || computed.visibility === 'hidden') return false;
            if (style.pointerEvents === 'none' || computed.pointerEvents === 'none') return false;
            try {
                if (typeof element.closest === 'function' && element.closest('[inert], [aria-hidden="true"]')) return false;
            } catch (_) {}
            return true;
        }

        function interactiveState(element) {
            if (!element || typeof element.querySelectorAll !== 'function') return { total: 0, usable: 0 };
            let children;
            try {
                children = Array.from(element.querySelectorAll(INTERACTIVE_SELECTOR) || []);
            } catch (_) {
                return { total: 0, usable: 0 };
            }
            return {
                total: children.length,
                usable: children.filter(isInteractiveElementUsable).length,
            };
        }

        function interactiveStateForSpec(element, spec) {
            if (!element || !spec || typeof element.querySelectorAll !== 'function') return { total: 0, usable: 0 };
            let children = [];
            try {
                children = Array.from(element.querySelectorAll(spec.selector) || []);
            } catch (_) {}
            if (children.length <= 0 && typeof element.innerHTML === 'string' && element.innerHTML) {
                let total = 0;
                let usable = 0;
                (spec.actions || []).forEach(action => {
                    const escaped = String(action).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const pattern = new RegExp("<[^>]+data-action=[\"']" + escaped + "[\"'][^>]*>", 'g');
                    const matches = element.innerHTML.match(pattern) || [];
                    total += matches.length;
                    usable += matches.filter(tag => !/\sdisabled(?:\s|=|>|$)/i.test(tag)).length;
                });
                return { total, usable };
            }
            return {
                total: children.length,
                usable: children.filter(isInteractiveElementUsable).length,
            };
        }

        function interactiveStateForActions(element, actions) {
            const expected = new Set(actions || []);
            if (!expected.size) return { total: 0, usable: 0 };
            return interactiveStateForSpec(element, {
                actions: Array.from(expected),
                selector: Array.from(expected).map(action => '[data-action="' + String(action) + '"]').join(', '),
            });
        }

        function snapshotById(id) {
            const documentRef = getDocument();
            const element = documentRef && typeof documentRef.getElementById === 'function'
                ? documentRef.getElementById(id) : null;
            if (!element) return null;
            const computed = computedStyle(element);
            const childState = interactiveState(element);
            return {
                id,
                display: element.style ? element.style.display || '' : '',
                computedDisplay: computed.display || '',
                visibility: element.style ? element.style.visibility || '' : '',
                computedVisibility: computed.visibility || '',
                pointerEvents: element.style ? element.style.pointerEvents || '' : '',
                computedPointerEvents: computed.pointerEvents || '',
                disabled: !!element.disabled,
                hidden: !!element.hidden,
                inert: !!element.inert,
                ancestorBlocked: hasBlockingAncestor(id, element),
                ariaHidden: typeof element.getAttribute === 'function' ? element.getAttribute('aria-hidden') : null,
                className: element.className || '',
                htmlLength: typeof element.innerHTML === 'string' ? element.innerHTML.length : 0,
                totalInteractiveChildren: childState.total,
                usableInteractiveChildren: childState.usable,
                text: typeof element.textContent === 'string' ? truncateText(element.textContent, 120) : '',
            };
        }

        function isVisibleById(id) {
            const snapshot = snapshotById(id);
            if (!snapshot) return false;
            return snapshot.display !== 'none' && snapshot.computedDisplay !== 'none' &&
                snapshot.visibility !== 'hidden' && snapshot.computedVisibility !== 'hidden' && !snapshot.hidden;
        }

        return Object.freeze({
            hasBlockingAncestor,
            interactiveState,
            interactiveStateForActions,
            interactiveStateForSpec,
            isInteractiveElementUsable,
            isVisibleById,
            snapshotById,
        });
    }

    return Object.freeze({ createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiDomSnapshot;
if (typeof window !== 'undefined') window.UiDomSnapshot = UiDomSnapshot;
if (typeof globalThis !== 'undefined') globalThis.UiDomSnapshot = UiDomSnapshot;
