'use strict';

function buttonView(baseClass, selected) {
    return Object.freeze({
        className: `${baseClass} ${selected ? 'active' : ''}`,
        ariaSelected: selected ? 'true' : 'false',
    });
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

const UiTabView = Object.freeze({ buildMainTabView, buildOnlineTabView, buildOnlineAvailabilityView });
if (typeof module !== 'undefined' && module.exports) module.exports = UiTabView;
if (typeof window !== 'undefined') window.UiTabView = UiTabView;
if (typeof globalThis !== 'undefined') globalThis.UiTabView = UiTabView;
