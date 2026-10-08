'use strict';

// Adapt the logical buildMenu contract to the current device-local presentation.
const UiMarketTarget = (() => {
    function id(documentRef) {
        return documentRef?.documentElement?.dataset?.design === 'cardboard' &&
            typeof documentRef.getElementById === 'function' && documentRef.getElementById('cardboardMarket')
            ? 'cardboardMarket' : 'buildMenu';
    }
    function fromSnapshot(snapshot) {
        return snapshot?.ui?.buildMenu?.id === 'cardboardMarket' ? 'cardboardMarket' : 'buildMenu';
    }
    function adaptSpec(spec, documentRef) {
        return spec?.targetId === 'buildMenu' ? { ...spec, targetId: id(documentRef) } : spec;
    }
    return Object.freeze({ id, fromSnapshot, adaptSpec });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = UiMarketTarget;
