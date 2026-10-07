'use strict';
/* global UiTurnEvents, UiTurnReceipt */

// Compatibility facade for existing themes and saved browser test harnesses.
const UiPlazaEvents = (() => {
    const events = typeof UiTurnEvents !== 'undefined' ? UiTurnEvents : require('./uiTurnEvents');
    const receipt = typeof UiTurnReceipt !== 'undefined' ? UiTurnReceipt : require('./uiTurnReceipt');
    return Object.freeze({ project: events.project, buildReceiptHtml: receipt.buildHtml });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = UiPlazaEvents;
if (typeof window !== 'undefined') window.UiPlazaEvents = UiPlazaEvents;
