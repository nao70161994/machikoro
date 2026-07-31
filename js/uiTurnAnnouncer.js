'use strict';

const TURN_ANNOUNCER_SHOW_DURATION_MS = 1300;
const TURN_ANNOUNCER_TRANSITION_DURATION_MS = 400;

function buildTurnAnnouncerView(name, isCPU) {
    return Object.freeze({
        text: `${isCPU ? '🤖' : '👤'} ${name} のターン`,
        display: 'flex',
        showDurationMs: TURN_ANNOUNCER_SHOW_DURATION_MS,
        transitionDurationMs: TURN_ANNOUNCER_TRANSITION_DURATION_MS,
    });
}

const UiTurnAnnouncer = Object.freeze({
    buildView: buildTurnAnnouncerView,
    showDurationMs: TURN_ANNOUNCER_SHOW_DURATION_MS,
    transitionDurationMs: TURN_ANNOUNCER_TRANSITION_DURATION_MS,
});

if (typeof module !== 'undefined' && module.exports) module.exports = UiTurnAnnouncer;
if (typeof window !== 'undefined') window.UiTurnAnnouncer = UiTurnAnnouncer;
if (typeof globalThis !== 'undefined') globalThis.UiTurnAnnouncer = UiTurnAnnouncer;
