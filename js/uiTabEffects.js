'use strict';

function applyMainTabView(elements, view) {
    elements.localContent.style.display = view.localDisplay;
    elements.onlineContent.style.display = view.onlineDisplay;
    elements.tournamentContent.style.display = view.tournamentDisplay;
    elements.statsContent.style.display = view.statsDisplay;
    elements.localButton.className = view.localButton.className;
    elements.onlineButton.className = view.onlineButton.className;
    elements.tournamentButton.className = view.tournamentButton.className;
    elements.statsButton.className = view.statsButton.className;
    elements.localButton.setAttribute('aria-selected', view.localButton.ariaSelected);
    elements.onlineButton.setAttribute('aria-selected', view.onlineButton.ariaSelected);
    elements.tournamentButton.setAttribute('aria-selected', view.tournamentButton.ariaSelected);
    elements.statsButton.setAttribute('aria-selected', view.statsButton.ariaSelected);
    elements.localButton.tabIndex = view.localButton.tabIndex;
    elements.onlineButton.tabIndex = view.onlineButton.tabIndex;
    elements.tournamentButton.tabIndex = view.tournamentButton.tabIndex;
    elements.statsButton.tabIndex = view.statsButton.tabIndex;
}

function applyOnlineTabView(elements, view) {
    elements.createContent.style.display = view.createDisplay;
    elements.joinContent.style.display = view.joinDisplay;
    elements.createButton.className = view.createButton.className;
    elements.joinButton.className = view.joinButton.className;
    elements.createButton.setAttribute('aria-selected', view.createButton.ariaSelected);
    elements.joinButton.setAttribute('aria-selected', view.joinButton.ariaSelected);
    elements.createButton.tabIndex = view.createButton.tabIndex;
    elements.joinButton.tabIndex = view.joinButton.tabIndex;
}

function applyOnlineAvailabilityView(elements, view) {
    if (elements.tabButton) elements.tabButton.style.opacity = view.tabOpacity;
    if (elements.notice) elements.notice.style.display = view.noticeDisplay;
    if (elements.createButton) elements.createButton.disabled = view.actionDisabled;
    if (elements.joinButton) elements.joinButton.disabled = view.actionDisabled;
}

const UiTabEffects = Object.freeze({ applyMainTabView, applyOnlineTabView, applyOnlineAvailabilityView });
if (typeof module !== 'undefined' && module.exports) module.exports = UiTabEffects;
if (typeof window !== 'undefined') window.UiTabEffects = UiTabEffects;
if (typeof globalThis !== 'undefined') globalThis.UiTabEffects = UiTabEffects;
