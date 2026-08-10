'use strict';

function buttonView(baseClass, selected) {
    return Object.freeze({
        className: `${baseClass} ${selected ? 'active' : ''}`,
        ariaSelected: selected ? 'true' : 'false',
        tabIndex: selected ? 0 : -1,
    });
}

function buildTabKeyboardPlan(key, currentIndex, tabCount) {
    const count = Number.isInteger(tabCount) ? tabCount : 0;
    const index = Number.isInteger(currentIndex) ? currentIndex : -1;
    if (count <= 0 || index < 0 || index >= count) {
        return Object.freeze({ handled: false, targetIndex: -1 });
    }
    let targetIndex = -1;
    if (key === 'ArrowLeft') targetIndex = (index - 1 + count) % count;
    if (key === 'ArrowRight') targetIndex = (index + 1) % count;
    if (key === 'Home') targetIndex = 0;
    if (key === 'End') targetIndex = count - 1;
    return Object.freeze({ handled: targetIndex >= 0, targetIndex });
}

function buildMainTabView(tab) {
    return Object.freeze({
        localDisplay: tab === 'local' ? 'flex' : 'none',
        onlineDisplay: tab === 'online' ? 'flex' : 'none',
        statsDisplay: tab === 'stats' ? 'block' : 'none',
        localButton: buttonView('tab-btn', tab === 'local'),
        onlineButton: buttonView('tab-btn', tab === 'online'),
        statsButton: buttonView('tab-btn', tab === 'stats'),
        renderStats: tab === 'stats',
    });
}

function buildOnlineTabView(tab) {
    return Object.freeze({
        createDisplay: tab === 'create' ? 'block' : 'none',
        joinDisplay: tab === 'join' ? 'block' : 'none',
        createButton: buttonView('online-tab-btn', tab === 'create'),
        joinButton: buttonView('online-tab-btn', tab === 'join'),
    });
}

function buildOnlineAvailabilityView(online) {
    return Object.freeze({
        tabOpacity: online ? '' : '0.4',
        noticeDisplay: online ? 'none' : 'block',
        actionDisabled: !online,
    });
}

const UiTabView = Object.freeze({
    buildMainTabView,
    buildOnlineTabView,
    buildOnlineAvailabilityView,
    buildTabKeyboardPlan,
});
if (typeof module !== 'undefined' && module.exports) module.exports = UiTabView;
if (typeof window !== 'undefined') window.UiTabView = UiTabView;
if (typeof globalThis !== 'undefined') globalThis.UiTabView = UiTabView;
