'use strict';

// One market node is shared by every view. Owners clean up their own presentation
// before a transfer; no view needs to call another view's lifecycle.
const SharedMarketMount = (() => {
    /** @param {Document} documentRef */
    function create(documentRef) {
        let owner = null;
        let origin = null;
        let relinquish = null;
        const market = () => documentRef.getElementById('buildMenu');
        /** @param {Node} target @param {Node | null} before */
        function move(target, before = null) {
            const element = market();
            const active = documentRef.activeElement;
            const focused = element.contains(active) ? /** @type {HTMLElement} */ (active) : null;
            const top = element.scrollTop, left = element.scrollLeft;
            target.insertBefore(element, before);
            element.scrollTop = top;
            element.scrollLeft = left;
            focused?.focus({ preventScroll: true });
        }
        /** @param {string} name */
        function release(name) {
            if (owner !== name) return;
            if (origin?.parentNode) move(origin.parentNode, origin);
            origin?.remove();
            origin = null;
            owner = null;
            relinquish = null;
        }
        /** @param {string} name @param {Node} target @param {() => void} cleanup */
        function mount(name, target, cleanup) {
            if (owner === name) return;
            if (owner !== null) {
                const previous = owner;
                relinquish?.();
                release(previous);
            }
            const element = market();
            if (!element || !target || !element.parentNode) return;
            origin = documentRef.createComment('shared-market-origin');
            element.parentNode.insertBefore(origin, element);
            owner = name;
            relinquish = cleanup;
            move(target);
        }
        return Object.freeze({ mount, release });
    }
    const instance = typeof document !== 'undefined' ? create(document) : null;
    /** @param {string} name @param {Node} target @param {() => void} cleanup */
    const mount = (name, target, cleanup) => instance?.mount(name, target, cleanup);
    /** @param {string} name */
    const release = name => instance?.release(name);
    return Object.freeze({ create, mount, release });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SharedMarketMount;
